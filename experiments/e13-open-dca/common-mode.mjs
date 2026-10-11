// The common mode of a fleet's drag (PLAN.md section 4.3, Amendment R1): statistics on the ln Cd*A/m of satellite-day arcs; no physics.
//
//   y_j = ln b_{i(j),k(j)} + sbar_j + e_j
//
// i the satellite, k the baseline block (blockDays long) of the arc's midpoint, b_{i,k} constant in the block, and
// sbar_j = (1/(end-start)) * integral of s(t) over the arc, s piecewise linear between nodes every nodeHours (hat functions). The mean of
// s over the supported nodes is zero (the level is not identifiable and belongs to the baselines). Huber loss (k times the MAD scale of
// the residuals), iteratively reweighted; the baselines are eliminated exactly (each group's weighted mean), so the unknowns are the
// node values, found by a dense Cholesky solve of the within-group normal equations restricted to the mean-zero subspace.
//
// A node is supported when at least minDovesPerNode satellites have an arc that overlaps its hat and the arcs' squared weights on it sum
// to at least minNodeInfo; an unsupported node is held at zero and windows that touch it are NaN.
//
// arcs: [{dove, startMs, endMs, y}] (ln of the fitted Cd*A/m). anchorMs: the time of node 0.
import { median } from '../../harness/stats.mjs';

const H = 3600e3, DAY = 86400e3;

// integral from -inf to x of the unit-height hat of half-width h centred at 0
const hatCdf = (x, h) => (x <= -h ? 0 : x <= 0 ? (x + h) ** 2 / (2 * h) : x <= h ? h - (h - x) ** 2 / (2 * h) : h);

// Weights of the nodes in the mean of s over [loMs, hiMs]: [{i, w}] for node index i (tau_i = anchor + (i + nMin) * step).
function hatWeights(loMs, hiMs, anchorMs, stepMs, nMin, nCount) {
  const out = [];
  const first = Math.max(nMin, Math.floor((loMs - anchorMs) / stepMs)), last = Math.min(nMin + nCount - 1, Math.ceil((hiMs - anchorMs) / stepMs));
  for (let n = first; n <= last; ++n) {
    const tau = anchorMs + n * stepMs;
    const w = (hatCdf(hiMs - tau, stepMs) - hatCdf(loMs - tau, stepMs)) / (hiMs - loMs);
    if (w > 0) out.push({ i: n - nMin, w });
  }
  return out;
}

function cholesky(A, n) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; ++i) {
    for (let j = 0; j <= i; ++j) {
      let s = A[i * n + j];
      for (let k = 0; k < j; ++k) s -= L[i * n + k] * L[j * n + k];
      if (i === j) { if (!(s > 0)) throw new Error(`normal matrix is not positive definite (pivot ${s} at ${i})`); L[i * n + i] = Math.sqrt(s); } else L[i * n + j] = s / L[j * n + j];
    }
  }
  return L;
}
function choleskySolve(L, n, b) {
  const y = new Float64Array(n), x = new Float64Array(n);
  for (let i = 0; i < n; ++i) { let s = b[i]; for (let k = 0; k < i; ++k) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  for (let i = n - 1; i >= 0; --i) { let s = y[i]; for (let k = i + 1; k < n; ++k) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return x;
}

// Baseline blocks of `blockMs` from `anchorMs`; the group of an arc is its satellite and the block of its midpoint.
const blockIdOf = (ms, anchorMs, blockMs) => Math.floor((ms - anchorMs) / blockMs);

// The time of day (UTC, circular mean of the arcs' midpoints) around which a fleet's daily arcs cluster, as an offset in ms from 00:00 UTC.
// Nodes placed there sit at the arcs' centres, where a daily arc sees its node best (the response to the shortest wavelength is 1/2; at the
// arcs' ends it is 0).
export function arcCenterOffsetMs(arcs) {
  let c = 0, s = 0;
  for (const a of arcs) { const x = (((a.startMs + a.endMs) / 2) % DAY) / DAY * 2 * Math.PI; c += Math.cos(x); s += Math.sin(x); }
  return ((Math.atan2(s, c) / (2 * Math.PI) + 1) % 1) * DAY;
}

function solveBlocks(arcs, { anchorMs, nodeHours = 24, blockDays = 21, huberK = 1.5, iterations = 30, tolerance = 1e-6, minDovesPerNode = 6, minNodeInfo = 1.5, scaleSweeps = 8 } = {}) {
  if (!arcs.length) throw new Error('no arcs');
  const step = nodeHours * H, blockMs = blockDays * DAY;
  const nMin = Math.floor((Math.min(...arcs.map((a) => a.startMs)) - anchorMs) / step), nMax = Math.ceil((Math.max(...arcs.map((a) => a.endMs)) - anchorMs) / step);
  const N = nMax - nMin + 1;
  const nodeMs = Array.from({ length: N }, (_, i) => anchorMs + (i + nMin) * step);

  const rows = arcs.map((a) => ({ ...a, a: hatWeights(a.startMs, a.endMs, anchorMs, step, nMin, N), group: `${a.dove}|${blockIdOf((a.startMs + a.endMs) / 2, anchorMs, blockMs)}` }));
  const groups = [...new Set(rows.map((r) => r.group))];
  const gi = new Map(groups.map((g, i) => [g, i]));
  rows.forEach((r) => { r.g = gi.get(r.group); });
  const doves = Array.from({ length: N }, () => new Set()), info = new Float64Array(N);
  rows.forEach((r) => r.a.forEach(({ i, w }) => { doves[i].add(r.dove); info[i] += w * w; }));
  const supported = doves.map((d, i) => d.size >= minDovesPerNode && info[i] >= minNodeInfo);
  const active = supported.map((ok, i) => (ok ? i : -1)).filter((i) => i >= 0);
  if (!active.length) throw new Error('no node is supported by enough satellites');

  const project = (v) => { let mean = 0; for (const i of active) mean += v[i]; mean /= active.length; for (const i of active) v[i] -= mean; return v; };
  const omega = new Float64Array(rows.length).fill(1);
  let s = new Float64Array(N), sigma = NaN, converged = false, sweeps = 0, lastChange = NaN;
  const beta = new Float64Array(groups.length);

  for (let it = 0; it < iterations; ++it) {
    sweeps = it + 1;
    // group sums with the current weights
    const W = new Float64Array(groups.length), Y = new Float64Array(groups.length);
    const Abar = groups.map(() => new Float64Array(N));
    rows.forEach((r, j) => { W[r.g] += omega[j]; Y[r.g] += omega[j] * r.y; r.a.forEach(({ i, w }) => { Abar[r.g][i] += omega[j] * w; }); });
    const A = new Float64Array(N * N), c = new Float64Array(N);
    rows.forEach((r, j) => {
      const o = omega[j];
      for (const p of r.a) { c[p.i] += o * p.w * r.y; for (const q of r.a) A[p.i * N + q.i] += o * p.w * q.w; }
    });
    groups.forEach((_, g) => {
      if (!(W[g] > 0)) return;
      const ab = Abar[g], yb = Y[g] / W[g];
      for (let i = 0; i < N; ++i) {
        if (ab[i] === 0) continue;
        c[i] -= ab[i] * yb;
        for (let k = 0; k < N; ++k) if (ab[k] !== 0) A[i * N + k] -= ab[i] * ab[k] / W[g];
      }
    });
    // unsupported nodes are held at zero; the rest is restricted to the mean-zero subspace: (P A P + (I - P)) s = P c
    for (let i = 0; i < N; ++i) if (!supported[i]) { for (let k = 0; k < N; ++k) { A[i * N + k] = 0; A[k * N + i] = 0; } c[i] = 0; }
    const PAP = new Float64Array(N * N), col = new Float64Array(N);
    for (let k = 0; k < N; ++k) { for (let i = 0; i < N; ++i) col[i] = A[i * N + k]; project(col); for (let i = 0; i < N; ++i) PAP[i * N + k] = col[i]; }
    const row = new Float64Array(N);
    for (let i = 0; i < N; ++i) { for (let k = 0; k < N; ++k) row[k] = PAP[i * N + k]; project(row); for (let k = 0; k < N; ++k) PAP[i * N + k] = row[k]; }
    let trace = 0;
    for (const i of active) trace += PAP[i * N + i];
    const ridge = 1e-9 * trace / active.length + 1e-12;
    for (const i of active) for (const k of active) PAP[i * N + k] += 1 / active.length;                              // + (I - P): the constant
    for (let i = 0; i < N; ++i) PAP[i * N + i] += supported[i] ? ridge : 1;                                           // unsupported: s = 0
    const sNew = choleskySolve(cholesky(PAP, N), N, project(Float64Array.from(c)));
    let change = 0;
    for (let i = 0; i < N; ++i) change = Math.max(change, Math.abs(sNew[i] - s[i]));
    s = sNew;
    // baselines and residuals, robust scale and Huber weights
    groups.forEach((_, g) => { beta[g] = W[g] > 0 ? (Y[g] - Abar[g].reduce((acc, v, i) => acc + v * s[i], 0)) / W[g] : 0; });
    const res = rows.map((r) => r.y - beta[r.g] - r.a.reduce((acc, p) => acc + p.w * s[p.i], 0));
    if (it < scaleSweeps) { const med = median(res); sigma = Math.max(1e-3, 1.4826 * median(res.map((x) => Math.abs(x - med)))); }   // the scale is held after scaleSweeps, so that the iteration converges on a fixed problem
    lastChange = change;
    rows.forEach((_, j) => { omega[j] = Math.min(1, huberK * sigma / Math.max(Math.abs(res[j]), 1e-12)); });
    if (change < tolerance) { converged = true; break; }
  }
  const residuals = rows.map((r) => r.y - beta[r.g] - r.a.reduce((acc, p) => acc + p.w * s[p.i], 0));
  return {
    anchorMs, stepMs: step, blockMs, nMin, nodeMs, s: Array.from(s), supported, dovesPerNode: doves.map((d) => d.size), nodeInfo: Array.from(info),
    sigma, sweeps, converged, lastChange, arcs: rows.length, groups: groups.length, huberDownweighted: omega.reduce((n, w) => n + (w < 1 ? 1 : 0), 0),
    residuals, baseline: Object.fromEntries(groups.map((g, i) => [g, beta[i]])), omega: Array.from(omega),
    firstNodeMs: nodeMs[0], lastNodeMs: nodeMs[N - 1],
  };
}


// Thomas algorithm for a symmetric tridiagonal system: factor once (diag d, off-diagonal e between j and j+1), solve many right-hand sides.
function tridiagFactor(d, e) {
  const n = d.length, cp = new Float64Array(n), dp = new Float64Array(n);
  dp[0] = d[0];
  for (let j = 1; j < n; ++j) { cp[j - 1] = e[j - 1] / dp[j - 1]; dp[j] = d[j] - e[j - 1] * cp[j - 1]; if (!(dp[j] > 0)) throw new Error('baseline system is not positive definite'); }
  return { n, e, cp, dp };
}
function tridiagSolve(f, b) {
  const { n, e, cp, dp } = f, y = new Float64Array(n), x = new Float64Array(n);
  y[0] = b[0] / dp[0];
  for (let j = 1; j < n; ++j) y[j] = (b[j] - e[j - 1] * y[j - 1]) / dp[j];
  x[n - 1] = y[n - 1];
  for (let j = n - 2; j >= 0; --j) x[j] = y[j] - cp[j] * x[j + 1];
  return x;
}

// Baselines as robust random walks (Amendment R1): each satellite's ln b follows a walk with steps of standard deviation `stepSigma` per
// sqrt(day) between its consecutive arcs, the increments under a Huber loss so that an attitude-mode step is allowed. Same common mode
// and the same Huber loss on the arcs' residuals as the block form; the baselines are eliminated exactly, satellite by satellite
// (a tridiagonal solve per column), so the unknowns are again the node values.
function solveRandomWalk(arcs, { anchorMs, nodeHours = 24, stepSigma = 0.02, smoothSigma = null, huberK = 1.5, iterations = 30, tolerance = 1e-6, minDovesPerNode = 6, minNodeInfo = 1.5, scaleSweeps = 8 } = {}) {
  if (!arcs.length) throw new Error('no arcs');
  const step = nodeHours * H;
  const nMin = Math.floor((Math.min(...arcs.map((a) => a.startMs)) - anchorMs) / step), nMax = Math.ceil((Math.max(...arcs.map((a) => a.endMs)) - anchorMs) / step);
  const N = nMax - nMin + 1;
  const nodeMs = Array.from({ length: N }, (_, i) => anchorMs + (i + nMin) * step);
  const byDove = new Map();
  arcs.forEach((a, index) => { const row = { ...a, index, a: hatWeights(a.startMs, a.endMs, anchorMs, step, nMin, N) }; byDove.set(a.dove, [...(byDove.get(a.dove) ?? []), row]); });
  const doves = [...byDove.values()].map((list) => list.sort((x, y) => (x.startMs + x.endMs) - (y.startMs + y.endMs)));
  const nodeDoves = Array.from({ length: N }, () => new Set()), info = new Float64Array(N);
  doves.forEach((list) => list.forEach((r) => r.a.forEach(({ i, w }) => { nodeDoves[i].add(r.dove); info[i] += w * w; })));
  const supported = nodeDoves.map((d, i) => d.size >= minDovesPerNode && info[i] >= minNodeInfo);
  const active = supported.map((ok, i) => (ok ? i : -1)).filter((i) => i >= 0);
  if (!active.length) throw new Error('no node is supported by enough satellites');
  const project = (v) => { let mean = 0; for (const i of active) mean += v[i]; mean /= active.length; for (const i of active) v[i] -= mean; return v; };

  const omega = arcs.map(() => 1);
  // Arcs of different fleets differ in scatter (PLAN.md Amendment S3): with more than one `group` each group has its own robust scale and its arcs carry the
  // precision (sigma / sigma_group)^2 against the largest scale, which stays the unit-weight scale of the prior terms. With one group (or none) nothing here acts.
  // An arc may also carry its own `precision` (the inverse of its noise variance against a reference scatter: Amendment S5, the energy noise of a Starlink pair is far larger at 500 km
  // than at 300 km); the robust scales are then taken on the residuals scaled by sqrt(precision), and the weight of an arc is its precision times its group's.
  const groupIds = [...new Set(arcs.map((a) => a.group ?? ''))], withPrecision = arcs.some((a) => a.precision !== undefined && a.precision !== 1), grouped = groupIds.length > 1 || withPrecision;
  const groupOf = arcs.map((a) => groupIds.indexOf(a.group ?? ''));
  const arcPrecision = arcs.map((a) => (a.precision === undefined ? 1 : a.precision));
  if (arcPrecision.some((p) => !(p > 0) || !Number.isFinite(p))) throw new Error('arc precision must be positive and finite');
  let groupSigma = groupIds.map(() => NaN), precision = groupIds.map(() => 1);
  const nu = doves.map((list) => new Float64Array(list.length).fill(1));            // nu[i][j]: weight of the increment into arc j (j >= 1)
  const dt = doves.map((list) => list.map((r, j) => (j ? Math.max(1e-3, ((r.startMs + r.endMs) - (list[j - 1].startMs + list[j - 1].endMs)) / 2 / DAY) : 1)));
  let s = new Float64Array(N), sigma = NaN, converged = false, sweeps = 0, lastChange = NaN;
  const beta = doves.map((list) => new Float64Array(list.length));
  let residuals = arcs.map(() => 0);

  const factor = (i, lambda) => {
    const list = doves[i], n = list.length, d = new Float64Array(n), e = new Float64Array(Math.max(0, n - 1));
    list.forEach((r, j) => { d[j] += omega[r.index]; });
    for (let j = 1; j < n; ++j) { const k = nu[i][j] * lambda / dt[i][j]; d[j - 1] += k; d[j] += k; e[j - 1] = -k; }
    return tridiagFactor(d, e);
  };

  for (let it = 0; it < iterations; ++it) {
    sweeps = it + 1;
    const lambda = Number.isFinite(sigma) ? (sigma / stepSigma) ** 2 : (0.09 / stepSigma) ** 2;     // residual variance over step variance (the first sweep uses 0.09)
    const A = new Float64Array(N * N), c = new Float64Array(N), facs = [];
    doves.forEach((list, i) => {
      const f = factor(i, lambda);
      facs.push(f);
      const n = list.length;
      // A' Omega A and A' Omega y of this satellite, less (Omega A)' X and (Omega A)' z with X = M^-1 Omega A, z = M^-1 Omega y (M = Omega + L)
      const cols = new Map();                                                      // node -> Float64Array(n): column of Omega A
      list.forEach((r, j) => r.a.forEach(({ i: node, w }) => { if (!cols.has(node)) cols.set(node, new Float64Array(n)); cols.get(node)[j] = omega[r.index] * w; }));
      const oy = new Float64Array(n);
      list.forEach((r, j) => { oy[j] = omega[r.index] * r.y; });
      const z = tridiagSolve(f, oy);
      const X = new Map();
      for (const [node, col] of cols) X.set(node, tridiagSolve(f, col));
      list.forEach((r, j) => {
        for (const p of r.a) {
          c[p.i] += omega[r.index] * p.w * r.y;
          for (const q of r.a) A[p.i * N + q.i] += omega[r.index] * p.w * q.w;
        }
      });
      for (const [node, col] of cols) {
        let dot = 0;
        for (let j = 0; j < n; ++j) dot += col[j] * z[j];
        c[node] -= dot;
        for (const [node2, x2] of X) { let d2 = 0; for (let j = 0; j < n; ++j) d2 += col[j] * x2[j]; A[node * N + node2] -= d2; }
      }
    });
    // the common mode is a random walk across supported nodes: a step of standard deviation smoothSigma per node interval, in the units of the unit-weight
    // normal equations a penalty (sigma / smoothSigma)^2 on every squared difference of neighbouring supported nodes
    if (smoothSigma) {
      const lam = (Number.isFinite(sigma) ? sigma : 0.09) ** 2 / smoothSigma ** 2;
      for (let i = 0; i + 1 < N; ++i) if (supported[i] && supported[i + 1]) { A[i * N + i] += lam; A[(i + 1) * N + i + 1] += lam; A[i * N + i + 1] -= lam; A[(i + 1) * N + i] -= lam; }
    }
    for (let i = 0; i < N; ++i) if (!supported[i]) { for (let k = 0; k < N; ++k) { A[i * N + k] = 0; A[k * N + i] = 0; } c[i] = 0; }
    const PAP = new Float64Array(N * N), col = new Float64Array(N);
    for (let k = 0; k < N; ++k) { for (let i = 0; i < N; ++i) col[i] = A[i * N + k]; project(col); for (let i = 0; i < N; ++i) PAP[i * N + k] = col[i]; }
    const row = new Float64Array(N);
    for (let i = 0; i < N; ++i) { for (let k = 0; k < N; ++k) row[k] = PAP[i * N + k]; project(row); for (let k = 0; k < N; ++k) PAP[i * N + k] = row[k]; }
    let trace = 0;
    for (const i of active) trace += PAP[i * N + i];
    const ridge = 1e-9 * trace / active.length + 1e-12;
    for (const i of active) for (const k of active) PAP[i * N + k] += 1 / active.length;
    for (let i = 0; i < N; ++i) PAP[i * N + i] += supported[i] ? ridge : 1;
    const sNew = choleskySolve(cholesky(PAP, N), N, project(Float64Array.from(c)));
    let change = 0;
    for (let i = 0; i < N; ++i) change = Math.max(change, Math.abs(sNew[i] - s[i]));
    s = sNew;
    // baselines (beta = M^-1 Omega (y - A s)), residuals, robust scales and weights
    const res = arcs.map(() => 0);
    doves.forEach((list, i) => {
      const rhs = Float64Array.from(list.map((r) => omega[r.index] * (r.y - r.a.reduce((acc, p) => acc + p.w * s[p.i], 0))));
      beta[i] = tridiagSolve(facs[i], rhs);
      list.forEach((r, j) => { res[r.index] = r.y - beta[i][j] - r.a.reduce((acc, p) => acc + p.w * s[p.i], 0); });
    });
    residuals = res;
    if (it < scaleSweeps) {
      if (!grouped) { const med = median(res); sigma = Math.max(1e-3, 1.4826 * median(res.map((x) => Math.abs(x - med)))); }
      else {
        groupSigma = groupIds.map((_, k) => { const z = res.map((x, j) => (groupOf[j] === k ? x * Math.sqrt(arcPrecision[j]) : null)).filter((x) => x !== null), med = median(z); return Math.max(1e-3, 1.4826 * median(z.map((x) => Math.abs(x - med)))); });
        sigma = Math.max(...groupSigma);
        precision = groupSigma.map((x) => (sigma / x) ** 2);
      }
    }   // the scales are held after scaleSweeps, so that the iteration converges on a fixed problem
    lastChange = change;
    arcs.forEach((_, j) => { omega[j] = grouped ? arcPrecision[j] * precision[groupOf[j]] * Math.min(1, huberK * groupSigma[groupOf[j]] / Math.max(Math.abs(res[j]) * Math.sqrt(arcPrecision[j]), 1e-12)) : Math.min(1, huberK * sigma / Math.max(Math.abs(res[j]), 1e-12)); });
    doves.forEach((list, i) => { for (let j = 1; j < list.length; ++j) { const z = Math.abs(beta[i][j] - beta[i][j - 1]); nu[i][j] = Math.min(1, huberK * stepSigma * Math.sqrt(dt[i][j]) / Math.max(z, 1e-12)); } });
    if (change < tolerance) { converged = true; break; }
  }
  return {
    anchorMs, stepMs: step, nMin, nodeMs, s: Array.from(s), supported, dovesPerNode: nodeDoves.map((d) => d.size), nodeInfo: Array.from(info),
    sigma, sweeps, converged, lastChange, arcs: arcs.length, groups: doves.length, huberDownweighted: omega.reduce((n, w) => n + (w < 1 ? 1 : 0), 0),
    residuals, omega, baseline: Object.fromEntries(doves.map((list, i) => [list[0].dove, Array.from(beta[i])])), stepSigma, smoothSigma,
    ...(grouped ? { groupSigma: Object.fromEntries(groupIds.map((g, k) => [g, groupSigma[k]])), groupPrecision: Object.fromEntries(groupIds.map((g, k) => [g, precision[k]])), withPrecision } : {}),
    firstNodeMs: nodeMs[0], lastNodeMs: nodeMs[N - 1],
  };
}

// The common mode of daily arcs. baseline: {kind: 'randomWalk', stepSigma} (default) or {kind: 'blocks', days}.
export function solveCommonMode(arcs, options = {}) {
  const { baseline = { kind: 'randomWalk', stepSigma: 0.02 }, blockDays, ...rest } = options;
  if (baseline.kind === 'blocks' || blockDays !== undefined) {
    if (new Set(arcs.map((a) => a.group ?? '')).size > 1) throw new Error('arc groups (a robust scale per fleet) need the random-walk baselines');
    return solveBlocks(arcs, { ...rest, blockDays: blockDays ?? baseline.days });
  }
  if (baseline.kind !== 'randomWalk') throw new Error(`unknown baseline model ${baseline.kind}`);
  return solveRandomWalk(arcs, { ...rest, stepSigma: baseline.stepSigma });
}

// The mean of s over [loMs, hiMs] of a solution, NaN where a node that matters is unsupported or the window leaves the node range.
export function windowMean(sol, loMs, hiMs) {
  const lag = sol.lagMs ?? 0;                                   // a solution with a lag is read at the time later by that lag (see withLag)
  loMs += lag; hiMs += lag;
  if (loMs < sol.nodeMs[0] || hiMs > sol.nodeMs.at(-1)) return NaN;
  const parts = hatWeights(loMs, hiMs, sol.anchorMs, sol.stepMs, sol.nMin, sol.nodeMs.length);
  if (parts.some((p) => !sol.supported[p.i])) return NaN;
  return parts.reduce((acc, p) => acc + p.w * sol.s[p.i], 0);
}

// s(t) beyond the last supported node relaxes to zero with time constant tauHours (null: held); within the nodes it is the piecewise linear s.
// The mean over [loMs, hiMs] by quadrature every quadMs (a function of a known form, not a model). NaN where an interior node is unsupported.
export function forecastMean(sol, loMs, hiMs, tauHours, quadMs = 600e3) {
  loMs += sol.lagMs ?? 0; hiMs += sol.lagMs ?? 0;
  const lastIdx = sol.supported.lastIndexOf(true);
  const last = sol.nodeMs[lastIdx], sLast = sol.s[lastIdx];
  let acc = 0, n = 0;
  for (let t = loMs + quadMs / 2; t < hiMs; t += quadMs) {
    let v;
    if (t < sol.nodeMs[0]) return NaN;
    if (t <= last) {
      const x = (t - sol.nodeMs[0]) / sol.stepMs, i = Math.min(sol.nodeMs.length - 2, Math.max(0, Math.floor(x)));
      if (!sol.supported[i] || !sol.supported[i + 1]) return NaN;
      v = sol.s[i] + (sol.s[i + 1] - sol.s[i]) * (x - i);
    } else v = tauHours === null ? sLast : sLast * Math.exp(-(t - last) / (tauHours * H));
    acc += v; ++n;
  }
  return acc / n;
}

// s(t) of a solution: piecewise linear between its nodes (an unsupported node is 0), held before the first supported node, and after the
// last supported node relaxing to zero with time constant tauHours (null: held). The correction a propagation applies.
export function sAt(sol, tMs, tauHours) {
  tMs += sol.lagMs ?? 0;
  const first = sol.supported.indexOf(true), last = sol.supported.lastIndexOf(true);
  if (first < 0) return 0;
  if (tMs <= sol.nodeMs[first]) return sol.s[first];
  if (tMs > sol.nodeMs[last]) return tauHours === null ? sol.s[last] : sol.s[last] * Math.exp(-(tMs - sol.nodeMs[last]) / (tauHours * H));
  const x = (tMs - sol.nodeMs[0]) / sol.stepMs, i = Math.min(sol.nodeMs.length - 2, Math.max(0, Math.floor(x)));
  return sol.s[i] + (sol.s[i + 1] - sol.s[i]) * (x - i);
}

// A solution read with a lag: the common mode that the arcs give is taken to describe the density `lagHours` before the time it is assigned to (the
// operator's states lag the density: Amendment R2), so that its value at physical time t is the solution's at t + lagHours. windowMean, forecastMean and
// sAt apply the lag; the solution itself is unchanged.
export function withLag(sol, lagHours) { return { ...sol, lagMs: lagHours * H }; }

// The causal nowcast at an issue time: the arcs that ended at least latencyHours before it and not earlier than historyDays before that,
// nodes at the centres of those arcs' days. The cut-off is an assertion, not a filter alone: the solver is handed no later arc.
export function nowcast(arcs, issueMs, { latencyHours = 6, historyDays = 30, nodeHours = 24, lagHours = 0, anchorMs: fixedAnchorMs = null, ...rest } = {}) {
  const cutoff = issueMs - latencyHours * H;
  const used = arcs.filter((a) => a.endMs <= cutoff && a.startMs >= cutoff - historyDays * DAY);
  if (used.some((a) => a.endMs > cutoff)) throw new Error('look-ahead: an arc ends after the cut-off');
  if (!used.length) return null;
  const anchorMs = fixedAnchorMs ?? Math.floor(cutoff / DAY) * DAY + arcCenterOffsetMs(used);       // a fixed anchor for arcs that are not clustered in the day (the Starlink versions)
  const sol = solveCommonMode(used, { anchorMs, nodeHours, ...rest });
  return { ...withLag(sol, lagHours), issueMs, cutoffMs: cutoff, usedArcs: used.length, latestArcEndMs: Math.max(...used.map((a) => a.endMs)) };
}

// The arcs of a Planet-arc JSONL (steps/10) as solver arcs: valid fits only (a positive Cd*A/m with a stated sigma below maxRelativeSigma).
export function arcsFromRows(rows, { hwids = null, maxRelativeSigma = 0.5, positiveOnly = true } = {}) {
  const keep = hwids ? new Set(hwids) : null;
  return rows.filter((r) => !r.error && (!keep || keep.has(r.hwid)) && (!positiveOnly || (r.cdAreaOverMass > 0 && !r.nonPositive)) && r.sigmaB / r.cdAreaOverMass < maxRelativeSigma)
    .map((r) => ({ dove: r.hwid, startMs: Date.parse(r.utcA), endMs: Date.parse(r.utcB), y: Math.log(r.cdAreaOverMass), sigma: r.sigmaB / r.cdAreaOverMass }));
}
