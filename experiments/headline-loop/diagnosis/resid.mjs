// #316 items 1 to 4 (exploratory measurement, not shipped physics): the carrier residual AP - FFM saved by rep.mjs (option z), its
// growth, its spectrum, how many series coefficients bring it under half of FFM's own error against truth, and how far nine
// empirical accelerations (constant and once per revolution in R, T, N, with the six initial conditions) go instead.
//   node experiments/headline-loop/diagnosis/resid.mjs <series dir or files...> [--json out.json] [--quiet]
// Series model per component: polynomial in time of degree d plus harmonics k = 1..K of the mean longitude (frequency k n, n the
// record's mean motion), each harmonic's sine and cosine amplitudes polynomials of degree a in time. Coefficients: 3 [(d + 1) + 2 K (a + 1)].
// Empirical model: the linear response of position to 6 initial conditions and 9 accelerations, from variational equations
// integrated in this script along a two-body + J2 reference started at FFM's first state (RK4, fixed step). An analysis emulation, never
// shipped: no module fits radial, transverse and normal empirical accelerations (AP's fit refuses acceleration parameters; the estimation
// module offers a constant in-track one alone). Proper fix: those parameters in the PRW dynamic parameters and the estimation module, and
// this part replaced by the module's fit.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const QUIET = argv.includes('--quiet');
const JSON_OUT = opt('json', null);
const inputs = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--json'].includes(argv[i - 1])));
const files = inputs.flatMap((p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter((f) => f.endsWith('.json')).map((f) => path.join(p, f)) : [p]));

// ---------- small dense least squares (normal equations with Cholesky; columns scaled) ----------
function lstsq(cols, y) {
  const m = cols.length, n = y.length;
  const scale = cols.map((c) => Math.sqrt(c.reduce((s, x) => s + x * x, 0)) || 1);
  const A = Array.from({ length: m }, () => new Float64Array(m)), b = new Float64Array(m);
  for (let i = 0; i < m; i += 1) {
    const ci = cols[i];
    for (let j = 0; j <= i; j += 1) { const cj = cols[j]; let s = 0; for (let k = 0; k < n; k += 1) s += ci[k] * cj[k]; A[i][j] = A[j][i] = s / (scale[i] * scale[j]); }
    let s = 0; for (let k = 0; k < n; k += 1) s += ci[k] * y[k]; b[i] = s / scale[i];
  }
  for (let i = 0; i < m; i += 1) A[i][i] += 1e-12 * (A[i][i] || 1);
  // Cholesky
  const L = Array.from({ length: m }, () => new Float64Array(m));
  for (let i = 0; i < m; i += 1) for (let j = 0; j <= i; j += 1) {
    let s = A[i][j]; for (let k = 0; k < j; k += 1) s -= L[i][k] * L[j][k];
    if (i === j) L[i][i] = Math.sqrt(Math.max(s, 1e-300)); else L[i][j] = s / L[j][j];
  }
  const z = new Float64Array(m); for (let i = 0; i < m; i += 1) { let s = b[i]; for (let k = 0; k < i; k += 1) s -= L[i][k] * z[k]; z[i] = s / L[i][i]; }
  const x = new Float64Array(m); for (let i = m - 1; i >= 0; i -= 1) { let s = z[i]; for (let k = i + 1; k < m; k += 1) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  const fit = new Float64Array(n); for (let i = 0; i < m; i += 1) { const c = cols[i], xi = x[i] / scale[i]; for (let k = 0; k < n; k += 1) fit[k] += c[k] * xi; }
  return { x: Array.from(x, (v, i) => v / scale[i]), resid: Float64Array.from(y, (v, k) => v - fit[k]) };
}
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / Math.max(1, v.length));

// ---------- bins: the arc (t <= 0) and lead days 1..7 ----------
const binOf = (tMin) => (tMin <= 0 ? 0 : Math.min(7, Math.ceil(tMin / 1440)));
function byBin(t, comps) {
  const out = {};
  for (let b = 0; b <= 7; b += 1) {
    const idx = []; t.forEach((x, i) => { if (binOf(x) === b) idx.push(i); });
    if (!idx.length) continue;
    const c = comps.map((v) => idx.map((i) => v[i]));
    const r = c.map(rms);
    out[b] = { e: Math.hypot(...r), r: r[0], t: r[1], n: r[2], mx: Math.max(...idx.map((i) => Math.hypot(comps[0][i], comps[1][i], comps[2][i]))) };
  }
  return out;
}

// ---------- spectrum: DFT of each component (detrended by a quadratic), top lines labelled ----------
function spectrum(tMin, y, nRevDay) {
  const tD = tMin.map((x) => x / 1440), N = y.length, span = tD.at(-1) - tD[0];
  const tau = tD.map((x) => (2 * (x - tD[0])) / span - 1);
  const { resid, x: trend } = lstsq([tau.map(() => 1), tau, tau.map((v) => v * v)], Float64Array.from(y));
  const df = 1 / span, fmax = 0.5 / ((tD[1] - tD[0]) || 1), lines = [];
  const pw = [];
  for (let f = df; f <= Math.min(fmax, 4.5 * nRevDay + 6); f += df / 2) {
    let c = 0, s = 0; for (let k = 0; k < N; k += 1) { const ph = 2 * Math.PI * f * tD[k]; c += resid[k] * Math.cos(ph); s += resid[k] * Math.sin(ph); }
    pw.push({ f, amp: (2 / N) * Math.hypot(c, s) });
  }
  for (let i = 1; i < pw.length - 1; i += 1) if (pw[i].amp >= pw[i - 1].amp && pw[i].amp >= pw[i + 1].amp) lines.push(pw[i]);
  lines.sort((a, b) => b.amp - a.amp);
  const sid = 1.0027379;
  const label = (f) => {
    const k = Math.round(f / nRevDay);
    if (k >= 1 && Math.abs(f - k * nRevDay) < 1.2 * df) return `${k}/rev`;
    for (let k2 = 0; k2 <= 4; k2 += 1) for (let m = 1; m <= 4; m += 1) for (const sgn of [1, -1]) if (Math.abs(f - Math.abs(k2 * nRevDay + sgn * m * sid)) < 1.2 * df) return k2 ? `${k2}/rev${sgn > 0 ? '+' : '-'}${m}/day` : `${m}/day`;
    if (f < 0.35) return 'long-period';
    return `${(f / nRevDay).toFixed(2)}/rev`;
  };
  return { trend: { a0: trend[0], a1: trend[1], a2: trend[2] }, residAfterTrend: rms(resid), top: lines.slice(0, 6).map((l) => ({ cpd: +l.f.toFixed(3), perRev: +(l.f / nRevDay).toFixed(3), amp: +l.amp.toFixed(5), label: label(l.f) })) };
}

// ---------- series compression ----------
function seriesFit(tMin, comps, nRevDay, d, K, a) {
  const tD = tMin.map((x) => x / 1440), span = tD.at(-1) - tD[0];
  const tau = tD.map((x) => (2 * (x - tD[0])) / span - 1);
  const cols = [];
  for (let j = 0; j <= d; j += 1) cols.push(Float64Array.from(tau, (v) => v ** j));
  for (let k = 1; k <= K; k += 1) for (let i = 0; i <= a; i += 1) {
    cols.push(Float64Array.from(tD, (x, q) => Math.cos(2 * Math.PI * k * nRevDay * x) * tau[q] ** i));
    cols.push(Float64Array.from(tD, (x, q) => Math.sin(2 * Math.PI * k * nRevDay * x) * tau[q] ** i));
  }
  const rest = comps.map((y) => lstsq(cols, Float64Array.from(y)).resid);
  return { coefficients: 3 * cols.length, bins: byBin(tMin, rest) };
}

// ---------- empirical accelerations: variational equations along a two-body + J2 reference ----------
const MU = 398600.4418, RE = 6378.137, J2 = 1.08262668e-3;
function accel(r) {
  const [x, y, z] = r, r2 = x * x + y * y + z * z, rr = Math.sqrt(r2), r3 = r2 * rr;
  const k = 1.5 * J2 * MU * RE * RE / (r2 * r2 * rr), zz = 5 * z * z / r2;
  return [-MU * x / r3 + k * x * (zz - 1), -MU * y / r3 + k * y * (zz - 1), -MU * z / r3 + k * z * (zz - 3)];
}
function gravGrad(r) { // the gradient of the reference's own acceleration (two-body + J2), by central differences: a variational matrix
  // that leaves J2 out grows exponentially along a J2 reference
  const h = 1e-3, G = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let j = 0; j < 3; j += 1) {
    const rp = [...r], rm = [...r]; rp[j] += h; rm[j] -= h;
    const ap = accel(rp), am = accel(rm);
    for (let i = 0; i < 3; i += 1) G[i][j] = (ap[i] - am[i]) / (2 * h);
  }
  return G;
}
function rtnAxes(r, v) {
  const rn = Math.hypot(...r), R = r.map((x) => x / rn);
  const h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]], hn = Math.hypot(...h), N = h.map((x) => x / hn);
  const T = [N[1] * R[2] - N[2] * R[1], N[2] * R[0] - N[0] * R[2], N[0] * R[1] - N[1] * R[0]];
  return { R, T, N };
}
function empirical(ser) {
  const t0 = ser.tMin[0], tS = ser.tMin.map((x) => (x - t0) * 60); // seconds from the first sample
  const periodS = 86400 / ser.meanMotion, e = ser.ecc ?? 0;
  const h = Math.min(60, periodS / (e > 0.5 ? 4000 : 600));
  const sub = Math.max(1, Math.ceil((tS[1] - tS[0]) / h)), dt = (tS[1] - tS[0]) / sub;
  const P = 15; // 6 IC + 9 accelerations (RTN constant, cos u, sin u)
  // state: r, v, then for each parameter (dr, dv)
  const y0 = new Float64Array(6 + 6 * P);
  y0.set(ser.r[0], 0); y0.set(ser.v[0], 3);
  for (let p = 0; p < 6; p += 1) y0[6 + 6 * p + p] = 1; // identity for the initial conditions
  const deriv = (y) => {
    const r = [y[0], y[1], y[2]], v = [y[3], y[4], y[5]], a = accel(r), G = gravGrad(r), ax = rtnAxes(r, v);
    const rn = Math.hypot(...r);
    // argument of latitude u: angle from the ascending node in the orbit plane (cos u, sin u)
    const nodeDir = [-ax.N[1], ax.N[0], 0], nd = Math.hypot(...nodeDir) || 1;
    const nhat = nodeDir.map((x) => x / nd), cu = (r[0] * nhat[0] + r[1] * nhat[1] + r[2] * nhat[2]) / rn;
    const wv = [ax.N[1] * nhat[2] - ax.N[2] * nhat[1], ax.N[2] * nhat[0] - ax.N[0] * nhat[2], ax.N[0] * nhat[1] - ax.N[1] * nhat[0]];
    const su = (r[0] * wv[0] + r[1] * wv[1] + r[2] * wv[2]) / rn;
    const d = new Float64Array(y.length);
    d[0] = v[0]; d[1] = v[1]; d[2] = v[2]; d[3] = a[0]; d[4] = a[1]; d[5] = a[2];
    for (let p = 0; p < P; p += 1) {
      const o = 6 + 6 * p;
      const dr = [y[o], y[o + 1], y[o + 2]];
      d[o] = y[o + 3]; d[o + 1] = y[o + 4]; d[o + 2] = y[o + 5];
      for (let i = 0; i < 3; i += 1) d[o + 3 + i] = G[i][0] * dr[0] + G[i][1] * dr[1] + G[i][2] * dr[2];
      if (p >= 6) {
        const q = p - 6, axis = [ax.R, ax.T, ax.N][q % 3], f = q < 3 ? 1 : q < 6 ? cu : su;
        for (let i = 0; i < 3; i += 1) d[o + 3 + i] += axis[i] * f * 1e-9; // unit: 1e-9 km/s^2 (1 um/s^2)
      }
    }
    return d;
  };
  const cols = Array.from({ length: P }, () => [[], [], []]);
  let y = y0;
  const record = (k) => {
    const ax = rtnAxes(ser.r[k], ser.v[k]);
    for (let p = 0; p < P; p += 1) { const o = 6 + 6 * p, dr = [y[o], y[o + 1], y[o + 2]]; [ax.R, ax.T, ax.N].forEach((A, c) => cols[p][c].push(A[0] * dr[0] + A[1] * dr[1] + A[2] * dr[2])); }
  };
  record(0);
  for (let k = 1; k < ser.tMin.length; k += 1) {
    for (let s = 0; s < sub; s += 1) {
      const k1 = deriv(y), y2 = y.map((x, i) => x + 0.5 * dt * k1[i]), k2 = deriv(y2), y3 = y.map((x, i) => x + 0.5 * dt * k2[i]), k3 = deriv(y3), y4 = y.map((x, i) => x + dt * k3[i]), k4 = deriv(y4);
      y = y.map((x, i) => x + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    }
    record(k);
  }
  // stack R, T, N into one least-squares problem
  const yAll = Float64Array.from([...ser.res.map((q) => q[0]), ...ser.res.map((q) => q[1]), ...ser.res.map((q) => q[2])]);
  const fitWith = (ps) => {
    const colsP = ps.map((p) => Float64Array.from([...cols[p][0], ...cols[p][1], ...cols[p][2]]));
    const { resid, x } = lstsq(colsP, yAll);
    const n = ser.tMin.length;
    return { bins: byBin(ser.tMin, [Array.from(resid.slice(0, n)), Array.from(resid.slice(n, 2 * n)), Array.from(resid.slice(2 * n))]), x };
  };
  const ic = fitWith([0, 1, 2, 3, 4, 5]);
  const ic3 = fitWith([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const all = fitWith([...Array(P).keys()]);
  if (process.env.HEO_DEBUG) console.log('column norms', cols.map((c) => Math.hypot(...c[0], ...c[1], ...c[2]).toExponential(2)).join(' '), '\nx', all.x.map((v) => v.toExponential(2)).join(' '));
  return { stepS: dt, ic6: ic.bins, ic6const3: ic3.bins, ic6emp9: all.bins, emp9um: all.x.slice(6).map((v) => +v.toFixed(5)) };
}

// ---------- run ----------
const GRID = [];
for (const d of [0, 1, 2, 3]) for (const K of [0, 1, 2, 3, 4, 6, 8]) for (const a of [0, 1, 2]) { if (K === 0 && a > 0) continue; GRID.push([d, K, a]); }
const results = [];
for (const file of files) {
  const ser = JSON.parse(fs.readFileSync(file, 'utf8'));
  const comps = [0, 1, 2].map((c) => ser.res.map((q) => q[c]));
  const target = Object.fromEntries(Object.entries(ser.ffmTruthDays ?? {}).map(([d, v]) => [d, 0.5 * v.e]));
  const raw = byBin(ser.tMin, comps);
  const spec = ['R', 'T', 'N'].map((c, i) => ({ axis: c, ...spectrum(ser.tMin, comps[i], ser.meanMotion) }));
  const series = GRID.map(([d, K, a]) => ({ d, K, a, ...seriesFit(ser.tMin, comps, ser.meanMotion, d, K, a) }));
  const meets = (bins) => Object.entries(target).every(([d, v]) => !bins[d] || bins[d].e <= v);
  const best = series.filter((s) => meets(s.bins)).sort((x, y) => x.coefficients - y.coefficients)[0] ?? null;
  let emp = null;
  try { emp = empirical(ser); } catch (error) { emp = { error: String(error.message) }; }
  const r = { file: path.basename(file), key: ser.key, arm: ser.arm, arcH: ser.arcH, meanMotion: ser.meanMotion, ecc: ser.ecc, target, raw, spectrum: spec,
    series: series.map((s) => ({ d: s.d, K: s.K, a: s.a, coefficients: s.coefficients, bins: Object.fromEntries(Object.entries(s.bins).map(([b, v]) => [b, +v.e.toFixed(5)])) })),
    smallestMeetingTarget: best ? { d: best.d, K: best.K, a: best.a, coefficients: best.coefficients } : null, empirical: emp };
  results.push(r);
  if (!QUIET) {
    const f = (x) => (x === undefined || x === null ? '   -  ' : (x * 1000).toFixed(1).padStart(7));
    console.log(`\n${ser.key} ${ser.arm} arc ${ser.arcH} h  n ${ser.meanMotion?.toFixed(4)} rev/d e ${ser.ecc?.toFixed(4)}`);
    console.log(`  bins (m):          arc   d1     d2     d3     d4     d5     d6     d7`);
    const row = (name, bins) => console.log(`  ${name.padEnd(16)}${[0, 1, 2, 3, 4, 5, 6, 7].map((b) => f(bins[b]?.e ?? bins[b])).join('')}`);
    row('residual', raw);
    console.log(`  ${'max (m)'.padEnd(16)}${[0, 1, 2, 3, 4, 5, 6, 7].map((b) => f(raw[b]?.mx)).join('')}`);
    row('target 0.5 FFM', Object.fromEntries(Object.entries(target)));
    for (const s of series.filter((s) => [[1, 0, 0], [2, 0, 0], [2, 1, 0], [2, 1, 1], [2, 2, 1], [2, 3, 1], [3, 4, 2], [3, 8, 2]].some(([d, K, a]) => s.d === d && s.K === K && s.a === a))) row(`series ${s.d},${s.K},${s.a} (${s.coefficients})`, s.bins);
    if (emp?.ic6emp9) { row('6 IC', emp.ic6); row('6 IC + 3 const', emp.ic6const3); row('6 IC + 9 emp', emp.ic6emp9); }
    console.log(`  smallest series meeting target: ${best ? `d ${best.d} K ${best.K} a ${best.a} (${best.coefficients})` : 'none in grid'}`);
    for (const s of spec) console.log(`  ${s.axis}: trend ${(s.trend.a1 * 1000).toFixed(1)} m/span-half, top ${s.top.slice(0, 4).map((l) => `${l.label} ${(l.amp * 1000).toFixed(1)} m`).join(', ')}`);
  }
}
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(results));
