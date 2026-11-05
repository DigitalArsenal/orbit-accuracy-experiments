// COVARIANCE-REFIT.md: AP's DRAG process-noise row (s_e, s_i, s_l, c) and a floor scale k_F fitted jointly to the per-axis
// realism criterion (median |z| per RIC axis and lead hour 1 to 167 against 0.674) on the coverage study's training rows,
// by re-weighting the module's own per-term variances (P(t) is linear in each squared size); held-out rows predict the result.
//   node experiments/operator-theory/covariance-refit.mjs --fit [--out <dir>]     the table, from the rows alone
//   node experiments/operator-theory/covariance-refit.mjs --export                the held-out windows' module inputs for the module's E2E
//   node experiments/operator-theory/covariance-refit.mjs --export-worker <set> --shard k
//   node experiments/operator-theory/covariance-refit.mjs --check                 the end to end
// Environment (--export only): SDN_MODULES_ROOT the read-only root holding XM's registered installs (space-data-network-modules-r2).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname), repo = path.resolve(here, '../..');
const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const ARCHIVE = '/opt/data/sdn-archive/operator-theory', ROWS = path.join(ARCHIVE, 'covariance-coverage'), EXPORT = path.join(ARCHIVE, 'covariance-refit/held-out');
const RESULTS = path.join(repo, 'results/ap-truth/covariance-refit'), PLAN = 'experiments/operator-theory/COVARIANCE-REFIT.md';
const TASK = 'modules-sdn-ap-covariance-noise-refit-20261105';
const HOURS = 167, DAY_LEADS = [24, 72, 167], REPORT_LEADS = [1, 6, 12, 24, 48, 72, 120, 167], AXES = ['R', 'I', 'C'], TERMS = ['e', 'i', 'l', 'd'];
const HALF_NORMAL_MEDIAN = 0.6744897501960817, BAND = [0.603, 0.754], CHI2_3_95 = 7.814727903251178, CAL1 = 0.6826894921370859, CAL2 = 0.9544997361036416;
const SETS = {
  truth: { regime: 'T', env: {}, arms: ['AP24', 'APRa12'], training: ['2025-04-01', '2025-08-10'], heldOut: ['2025-08-21', '2025-12-21'], xm: false },
  truth2: { regime: 'S1', env: { XP2F_CONTROL: '1' }, arms: ['AP72', 'AP24'], training: ['2026-01-01', '2026-03-15'], heldOut: ['2026-03-26', '2026-05-31'], xm: true, group: 'S1' },
};
const REGIMES = { T: 'Strong drag, 2025', S1: 'Near 700 km, 2026' };
const GALILEO_HELD = [43567, 37847, 41862, 41174, 43055, 41175], SWARM_GRACE = [39451, 39452, 39453, 43476, 43477], SWARM_GRACE_LAST = '2025-12-28T00:00:00.000Z', DAY = 86400000, HOUR = 3600000;
// The 0.6.0 DRAG row (SPEC 12.5, src/covariance.inc kNoiseAP[0]) and k_F 1.
const OLD = { s_e: 0.0030020720101006817, s_i: 1.3729304605949328e-06, s_l: 0.00022005794330391744, c: 0.52454406174861778, k_F: 1 };
const PARAMS = ['s_e', 's_i', 's_l', 'c', 'k_F'];
const ISS = { repo: '/Users/tj/software/private/coordinator-d9/sdn-ap-siteA', commit: '7e88e3961405ea585ab5a3e1a982677f1107c79a', path: 'docs/assets/demo/nasa-iss-2026-07-13.oem',
  sha256: 'fbda48d1584bee1f38ea562625280ecfe4e6643f67c417e91f2fc245ee48311f' };
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sig = (x, n = 6) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toPrecision(n)));
const fmt = (x) => (x === null || x === undefined ? '' : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : Math.abs(x) >= 0.01 ? x.toPrecision(3) : x.toExponential(2));
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28 });
const rowFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0])) : []);
const blockOf = (s, date) => (date >= s.training[0] && date <= s.training[1] ? 'training' : date >= s.heldOut[0] && date <= s.heldOut[1] ? 'heldOut' : 'guard');
const median = (a, n) => { // a Float64Array prefix of length n, sorted in place
  if (!n) return null;
  const s = a.subarray(0, n).sort();
  return (s[(n - 1) >> 1] + s[n >> 1]) / 2;
};

// ---- samples: per regime and block, per lead hour, typed arrays of the error and the six variances on each axis.
// Layout per sample (one window, arm and lead): e[3], full[3], e-off[3], i-off[3], l-off[3], d-off[3], off[3], floor[3], noise sizes (s_e, s_i, s_l, c), |n-dot_ng / n| (1/day).
const W = 3 * 8 + 5;
function load() {
  const out = {}, checks = { rows: 0, arms: 0, guard: 0, held: 0, repro: 0, reproOff: 0, maxRel: 0, maxRelOff: 0 };
  for (const [set, s] of Object.entries(SETS)) {
    const acc = { training: new Map(), heldOut: new Map() }, arms = { training: new Map(), heldOut: new Map() }, windows = { training: new Set(), heldOut: new Set() };
    for (const f of rowFiles(path.join(ROWS, set))) for (const line of fs.readFileSync(path.join(ROWS, set, f), 'utf8').split('\n')) {
      if (!line) continue;
      const r = JSON.parse(line);
      checks.rows += 1;
      if (GALILEO_HELD.includes(r.norad) || /starlink/i.test(r.name ?? '') || (SWARM_GRACE.includes(r.norad) && Date.parse(r.cutoff) + 7 * DAY > Date.parse(SWARM_GRACE_LAST))) { checks.held += 1; continue; }
      const block = blockOf(s, r.cutoff.slice(0, 10));
      if (block === 'guard') { checks.guard += 1; continue; }
      for (const arm of s.arms) {
        const a = r.arms?.[arm];
        if (!a?.ok || !a.leads?.length || !a.covPropagation) continue;
        checks.arms += 1;
        windows[block].add(r.key);
        const cp = a.covPropagation, floor = [cp.FLOOR_UU_KM2, cp.FLOOR_VV_KM2, cp.FLOOR_WW_KM2];
        const sizes = [cp.NOISE_ECCENTRICITY_PER_DAY, cp.NOISE_INCLINATION_PER_DAY, cp.NOISE_MEAN_MOTION_RELATIVE, cp.NON_GRAVITATIONAL_SHARE, Math.abs(cp.NON_GRAVITATIONAL_RATE_PER_DAY)];
        for (const L of a.leads) {
          if (L.h > HOURS) continue;
          const rec = [...L.e, ...L.v.full, ...L.v.e, ...L.v.i, ...L.v.l, ...L.v.d, ...L.v.off, ...floor, ...sizes];
          for (const m of [acc, arms]) {
            const map = m === acc ? acc[block] : (arms[block].get(arm) ?? arms[block].set(arm, new Map()).get(arm));
            (map.get(L.h) ?? map.set(L.h, []).get(L.h)).push(rec);
          }
        }
      }
    }
    const pack = (map) => new Map([...map].map(([h, list]) => { const x = new Float64Array(list.length * W); list.forEach((rec, j) => x.set(rec, j * W)); return [h, x]; }));
    out[s.regime] = { set, training: pack(acc.training), heldOut: pack(acc.heldOut),
      arms: { training: new Map([...arms.training].map(([k, m]) => [k, pack(m)])), heldOut: new Map([...arms.heldOut].map(([k, m]) => [k, pack(m)])) },
      windows: { training: windows.training.size, heldOut: windows.heldOut.size } };
  }
  return { data: out, checks };
}

/** Per sample at table p: the three re-weighted variances (COVARIANCE-REFIT.md Terms). p.c_i (diagnostic only, amendment 1): s_i + c_i |n-dot_ng / n|. */
function variances(x, j, p, v) {
  const o = j * W, sz = o + 24;
  const rho = [(p.s_e / x[sz]) ** 2, ((p.c_i ? p.s_i + p.c_i * x[sz + 4] : p.s_i) / x[sz + 1]) ** 2, (p.s_l / x[sz + 2]) ** 2, (p.c / x[sz + 3]) ** 2];
  for (let a = 0; a < 3; a += 1) {
    const full = x[o + 3 + a];
    let s = x[o + 18 + a] + (p.k_F - 1) * x[o + 21 + a];
    for (let k = 0; k < 4; k += 1) s += rho[k] * (full - x[o + 6 + 3 * k + a]);
    v[a] = s;
  }
}
const scratch = new Float64Array(1 << 16), scratch2 = new Float64Array(1 << 16), scratch3 = new Float64Array(1 << 16), vv = new Float64Array(3);
/** Per lead and axis at table p: median |z|, share |z| <= 1 and <= 2; per lead the mean d2/3 (diagonal) and share inside the 95 % ellipsoid. */
function stats(x, p, full = false) {
  const n = x.length / W, axes = [];
  const d2 = scratch3;
  for (let j = 0; j < n; j += 1) d2[j] = 0;
  for (let a = 0; a < 3; a += 1) {
    let in1 = 0, in2 = 0;
    for (let j = 0; j < n; j += 1) {
      variances(x, j, p, vv);
      const z = Math.abs(x[j * W + a]) / Math.sqrt(vv[a]);
      scratch[j] = z;
      if (full) { d2[j] += z * z; if (z <= 1) in1 += 1; if (z <= 2) in2 += 1; }
    }
    axes.push({ medianAbsZ: median(scratch, n), within1: full ? in1 / n : null, within2: full ? in2 / n : null });
  }
  if (!full) return { n, axes };
  let sum = 0, inside = 0;
  for (let j = 0; j < n; j += 1) { sum += d2[j]; if (d2[j] <= CHI2_3_95) inside += 1; }
  return { n, axes, meanD2Over3: sum / n / 3, inside95: inside / n };
}
const cost = (m) => { const q = Math.log(m / HALF_NORMAL_MEDIAN); return q * q; };
function loss(data, p) {
  let total = 0;
  for (const R of Object.values(data)) {
    let s = 0, k = 0;
    for (let h = 1; h <= HOURS; h += 1) {
      const x = R.training.get(h);
      if (!x) continue;
      for (const ax of stats(x, p).axes) { s += cost(ax.medianAbsZ); k += 1; }
    }
    total += s / k;
  }
  return total / Object.keys(data).length;
}

// ---- Nelder-Mead on the natural logs of the five terms (COVARIANCE-REFIT.md Solver).
function nelderMead(f, x0, step, maxEval) {
  const N = x0.length, pts = [x0.slice()];
  for (let i = 0; i < N; i += 1) { const x = x0.slice(); x[i] += step; pts.push(x); }
  let vals = pts.map(f), evals = N + 1;
  while (evals < maxEval) {
    const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    const P = order.map((i) => pts[i]), V = order.map((i) => vals[i]);
    pts.splice(0, pts.length, ...P); vals = V;
    if (Math.abs(vals[N] - vals[0]) <= 1e-12 * (1 + Math.abs(vals[0])) && evals > 50) break;
    const cen = new Array(N).fill(0);
    for (let i = 0; i < N; i += 1) for (let d = 0; d < N; d += 1) cen[d] += pts[i][d] / N;
    const at = (t) => cen.map((c, d) => c + t * (pts[N][d] - c));
    const xr = at(-1), fr = f(xr); evals += 1;
    if (fr < vals[0]) {
      const xe = at(-2), fe = f(xe); evals += 1;
      if (fe < fr) { pts[N] = xe; vals[N] = fe; } else { pts[N] = xr; vals[N] = fr; }
    } else if (fr < vals[N - 1]) { pts[N] = xr; vals[N] = fr; }
    else {
      const xc = fr < vals[N] ? at(-0.5) : at(0.5), fc = f(xc); evals += 1;
      if (fc < Math.min(fr, vals[N])) { pts[N] = xc; vals[N] = fc; }
      else {
        for (let i = 1; i <= N; i += 1) { pts[i] = pts[i].map((v, d) => pts[0][d] + 0.5 * (v - pts[0][d])); vals[i] = f(pts[i]); evals += 1; }
      }
    }
  }
  let best = 0;
  for (let i = 1; i <= N; i += 1) if (vals[i] < vals[best]) best = i;
  return { x: pts[best], value: vals[best], evals };
}
const toTable = (x) => Object.fromEntries(PARAMS.map((k, i) => [k, Math.exp(x[i])]));
const fromTable = (p) => PARAMS.map((k) => Math.log(p[k]));
function solve(data) {
  const f = (x) => loss(data, toTable(x));
  const starts = [{ name: '0.6.0 row', p: { ...OLD } }, ...[[100, 1], [1000, 10], [10000, 100]].map(([div, si]) => ({ name: `s_e, s_l, c / ${div}; s_i x ${si}`,
    p: { s_e: OLD.s_e / div, s_i: OLD.s_i * si, s_l: OLD.s_l / div, c: OLD.c / div, k_F: 1 } }))];
  const runs = starts.map((s) => { const r = nelderMead(f, fromTable(s.p), Math.log(10), 4000); console.error(`${s.name}: loss ${r.value} after ${r.evals}`); return { start: s.name, from: s.p, table: toTable(r.x), loss: r.value, evals: r.evals }; });
  const best = runs.reduce((a, b) => (b.loss < a.loss ? b : a));
  return { runs, best };
}

// ---- amendment 1: why the held-out band is not met (report only; no table from here ships).
const dayCells = (R, block, p) => Object.fromEntries(DAY_LEADS.map((h) => [h, Object.fromEntries(stats(R[block].get(h), p).axes.map((a, i) => [AXES[i], sig(a.medianAbsZ, 4)]))]));
function diagnose(data, fitted) {
  const start = fitted.best.table, out = { perRegime: {}, dragScaledCrossTrack: null, crossTrackRatio: {} };
  // (a) each regime its own row, fitted on its own training windows by the registered loss and solver (one start, the fitted row)
  for (const rg of Object.keys(data)) {
    const one = { [rg]: data[rg] }, r = nelderMead((x) => loss(one, toTable(x)), fromTable(start), Math.log(10), 2000), p = toTable(r.x);
    out.perRegime[rg] = { table: Object.fromEntries(PARAMS.map((k) => [k, sig(p[k], 6)])), loss: sig(r.value, 4), training: dayCells(data[rg], 'training', p), heldOut: dayCells(data[rg], 'heldOut', p) };
  }
  // (b) one row with the cross-track size growing with drag, s_i + c_i |n-dot_ng / n| (a form the module does not have)
  const P6 = [...PARAMS, 'c_i'], to6 = (x) => Object.fromEntries(P6.map((k, i) => [k, Math.exp(x[i])]));
  const r6 = nelderMead((x) => loss(data, to6(x)), [...fromTable(start), Math.log(0.1)], Math.log(10), 3000), p6 = to6(r6.x);
  out.dragScaledCrossTrack = { table: Object.fromEntries(P6.map((k) => [k, sig(p6[k], 6)])), loss: sig(r6.value, 4),
    cells: Object.fromEntries(Object.entries(data).map(([rg, R]) => [rg, { training: dayCells(R, 'training', p6), heldOut: dayCells(R, 'heldOut', p6) }])) };
  // (c) cross-track at day 7 over s_i 1e-9 to 1e-3 and k_F 0.01 to 100 (steps of a quarter decade), the rest at the fitted row:
  // where the strong-drag median |z| is inside the band, the range of the near-700 one
  for (const block of ['training', 'heldOut']) {
    let lo = Infinity, hi = -Infinity, points = 0;
    for (let li = -9; li <= -3 + 1e-9; li += 0.25) for (let lk = -2; lk <= 2 + 1e-9; lk += 0.25) {
      const p = { ...start, s_i: 10 ** li, k_F: 10 ** lk }, t = stats(data.T[block].get(167), p).axes[2].medianAbsZ;
      if (t < BAND[0] || t > BAND[1]) continue;
      const s1 = stats(data.S1[block].get(167), p).axes[2].medianAbsZ;
      points += 1; lo = Math.min(lo, s1); hi = Math.max(hi, s1);
    }
    out.crossTrackRatio[block] = { points, nearMin: points ? sig(lo, 4) : null, nearMax: points ? sig(hi, 4) : null };
  }
  return out;
}

// ---- the table, from the rows alone.
function summarize(data, p) {
  const cells = [];
  for (const [regime, R] of Object.entries(data)) for (const block of ['training', 'heldOut']) {
    const groups = [['both', R[block]], ...[...R.arms[block]].map(([arm, m]) => [arm, m])];
    for (const [arm, m] of groups) for (let h = 1; h <= HOURS; h += 1) {
      const x = m.get(h);
      if (!x) continue;
      const before = stats(x, OLD, true), after = stats(x, p, true);
      const one = (st) => ({ axes: Object.fromEntries(AXES.map((ax, a) => [ax, { medianAbsZ: sig(st.axes[a].medianAbsZ), within1Sigma: sig(st.axes[a].within1), within2Sigma: sig(st.axes[a].within2),
        band: st.axes[a].medianAbsZ < BAND[0] ? 'too wide' : st.axes[a].medianAbsZ > BAND[1] ? 'too narrow' : 'inside' }])), meanD2Over3Diagonal: sig(st.meanD2Over3), inside95Diagonal: sig(st.inside95) });
      cells.push({ regime, block, arm, h, n: before.n, before: one(before), after: one(after) });
    }
  }
  return cells;
}
function verdict(cells, block) {
  const out = [];
  for (const regime of Object.keys(REGIMES)) for (const h of DAY_LEADS) {
    const c = cells.find((q) => q.regime === regime && q.block === block && q.arm === 'both' && q.h === h);
    for (const ax of AXES) out.push({ regime, h, axis: ax, n: c?.n ?? 0, medianAbsZ: c?.after.axes[ax].medianAbsZ ?? null, inside: !!c && c.after.axes[ax].band === 'inside' });
  }
  return out;
}
const leadLabel = (h) => (h === 167 ? 'day 7 (167 h)' : h % 24 ? `${h} h` : `day ${h / 24}`);
/** The ISS demo figure (the coverage study's iss.json, its last state, 12 h from the file's start): each axis 1-sigma re-weighted to the fitted row. */
function issPrediction(p) {
  const iss = JSON.parse(fs.readFileSync(path.join(ROWS, 'iss.json'), 'utf8')), L = iss.leads.at(-1), cp = iss.covPropagation;
  const x = new Float64Array(W);
  x.set([...L.e, ...L.v.full, ...L.v.e, ...L.v.i, ...L.v.l, ...L.v.d, ...L.v.off, cp.FLOOR_UU_KM2, cp.FLOOR_VV_KM2, cp.FLOOR_WW_KM2,
    cp.NOISE_ECCENTRICITY_PER_DAY, cp.NOISE_INCLINATION_PER_DAY, cp.NOISE_MEAN_MOTION_RELATIVE, cp.NON_GRAVITATIONAL_SHARE, Math.abs(cp.NON_GRAVITATIONAL_RATE_PER_DAY)]);
  variances(x, 0, p, vv);
  return { epoch: iss.last.epoch, hoursFromStart: iss.last.hoursFromStart, hoursAfterFit: L.h, sigmaBeforeKm: L.v.full.map((v) => sig(Math.sqrt(v), 4)),
    sigmaAfterKm: [...vv].map((v) => sig(Math.sqrt(v), 4)), errorRicKm: L.e.map((e) => sig(e, 4)), zAfter: [...vv].map((v, a) => sig(Math.abs(L.e[a]) / Math.sqrt(v), 3)) };
}
function writeTable(outDir, data, fitted, checks) {
  const p = fitted.best.table, cells = summarize(data, p), diagnostics = diagnose(data, fitted), iss = issPrediction(p);
  const held = verdict(cells, 'heldOut'), train = verdict(cells, 'training');
  const result = {
    study: PLAN, task: TASK, rows: ROWS, criterion: 'per regime, per RIC axis and lead hour 1 to 167: (ln(median |z| / 0.674))^2, averaged over axes and leads, the regimes averaged; pass: held-out median |z| inside [0.603, 0.754] per regime on R, I and C at lead hours 24, 72 and 167',
    blocks: Object.fromEntries(Object.values(SETS).map((s) => [s.regime, { training: s.training, heldOut: s.heldOut }])),
    windows: Object.fromEntries(Object.entries(data).map(([r, R]) => [r, R.windows])), checks,
    old: OLD, fitted: Object.fromEntries(PARAMS.map((k) => [k, Number(p[k].toPrecision(17))])), loss: { old: loss(data, OLD), fitted: fitted.best.loss }, runs: fitted.runs,
    heldOutVerdict: { pass: held.every((v) => v.inside), cells: held }, trainingVerdict: { pass: train.every((v) => v.inside), cells: train }, iss, diagnostics, cells,
  };
  const outside = held.filter((v) => !v.inside).length;
  const L = [result.heldOutVerdict.pass ? `Acceptance: the realism criterion is met on the held-out windows (median |z| inside 0.603 to 0.754 per regime on R, I and C at days 1, 3 and 7).`
    : `Acceptance NOT met: the realism E2E does not pass; on the held-out windows ${outside} of ${held.length} cells (per regime, R, I and C, days 1, 3 and 7) lie outside median |z| 0.603 to 0.754; the record's acceptance line "realism E2E PASS" is not met and the fitted row earns no realism label.`, '',
    `# AP DRAG process-noise re-fit (COVARIANCE-REFIT.md)`, '',
    `Fitted from the coverage study's rows (sdn-ap 0.6.0, \`${ROWS}\`) by re-weighting the module's own per-term variances; training and held-out windows disjoint by cutoff with a 10-day guard. z = forward error component over the propagated 1-sigma; calibrated median |z| 0.674, band 0.603 to 0.754; within 1 and 2 sigma calibrated 0.683 and 0.954. Windows (window keys with a flown arm): ${Object.entries(result.windows).map(([r, w]) => `${REGIMES[r]} training ${w.training}, held-out ${w.heldOut}`).join('; ')}.`, '',
    '## The DRAG row', '', '| Term | 0.6.0 | Fitted |', '|---|---:|---:|',
    ...PARAMS.map((k) => `| ${k} | ${OLD[k]} | ${result.fitted[k]} |`), '',
    `Loss (training): 0.6.0 ${fmt(result.loss.old)}, fitted ${fmt(result.loss.fitted)}. Starts: ${fitted.runs.map((r) => `${r.start} ${fmt(r.loss)}`).join('; ')}.`, '',
    `Held-out verdict (median |z| inside [0.603, 0.754] per regime on R, I and C at days 1, 3, 7): ${result.heldOutVerdict.pass ? 'PASS' : 'FAIL'}; training: ${result.trainingVerdict.pass ? 'inside' : 'outside'}.`, '',
    '## Median |z| per regime (both arms), before and after', '',
    '| Regime | Set | Lead | n | R before | I before | C before | R after | I after | C after | R within 1, 2 sigma | I within 1, 2 sigma | C within 1, 2 sigma | mean d2/3 (diag) | inside 95 % (diag) |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---:|---:|'];
  for (const c of cells.filter((q) => q.arm === 'both' && REPORT_LEADS.includes(q.h))) L.push(`| ${REGIMES[c.regime]} | ${c.block === 'heldOut' ? 'held-out' : 'training'} | ${leadLabel(c.h)} | ${c.n} | ${AXES.map((ax) => fmt(c.before.axes[ax].medianAbsZ)).join(' | ')} | ${AXES.map((ax) => fmt(c.after.axes[ax].medianAbsZ)).join(' | ')} | ${AXES.map((ax) => `${fmt(c.after.axes[ax].within1Sigma)}, ${fmt(c.after.axes[ax].within2Sigma)}`).join(' | ')} | ${fmt(c.after.meanD2Over3Diagonal)} | ${fmt(c.after.inside95Diagonal)} |`);
  L.push('', '## The ISS demo figure, predicted', '', `The demo's ISS sample at its last state ${iss.epoch} (${fmt(iss.hoursFromStart)} h from its start, ${fmt(iss.hoursAfterFit)} h after the fit's end), the coverage study's flights re-weighted to the fitted row (a prediction, not a flight of a build): 1-sigma R / I / C ${iss.sigmaBeforeKm.map(fmt).join(' / ')} km before, ${iss.sigmaAfterKm.map(fmt).join(' / ')} km after, against the error ${iss.errorRicKm.map((e) => fmt(Math.abs(e))).join(' / ')} km (|z| after ${iss.zAfter.map(fmt).join(' / ')}).`);
  L.push('', '## Median |z| per arm after, days 1, 3, 7', '', '| Regime | Set | Arm | Lead | n | R | I | C |', '|---|---|---|---|---:|---:|---:|---:|');
  for (const c of cells.filter((q) => q.arm !== 'both' && DAY_LEADS.includes(q.h))) L.push(`| ${REGIMES[c.regime]} | ${c.block === 'heldOut' ? 'held-out' : 'training'} | ${c.arm} | ${leadLabel(c.h)} | ${c.n} | ${AXES.map((ax) => fmt(c.after.axes[ax].medianAbsZ)).join(' | ')} |`);
  const dc = (c) => DAY_LEADS.map((h) => AXES.map((ax) => fmt(c[h][ax])).join(' / ')).join('; ');
  L.push('', '## Why the band is not met (amendment 1, report only)', '',
    'Median |z| R / I / C at days 1 | 3 | 7.', '',
    '| Diagnostic | Loss | Regime | Training | Held-out |', '|---|---:|---|---|---|');
  for (const [rg, d] of Object.entries(diagnostics.perRegime)) L.push(`| Own row per regime: ${Object.entries(d.table).map(([k, v]) => `${k} ${v}`).join(', ')} | ${fmt(d.loss)} | ${REGIMES[rg]} | ${dc(d.training)} | ${dc(d.heldOut)} |`);
  for (const [rg, d] of Object.entries(diagnostics.dragScaledCrossTrack.cells)) L.push(`| One row, s_i + c_i n-dot_ng: ${Object.entries(diagnostics.dragScaledCrossTrack.table).map(([k, v]) => `${k} ${v}`).join(', ')} | ${fmt(diagnostics.dragScaledCrossTrack.loss)} | ${REGIMES[rg]} | ${dc(d.training)} | ${dc(d.heldOut)} |`);
  L.push('', `Cross-track at day 7 over s_i 1e-9 to 1e-3 and k_F 0.01 to 100 (quarter-decade steps; the rest at the fitted row): where the strong-drag median |z| is inside the band, the near-700 km one is ${Object.entries(diagnostics.crossTrackRatio).map(([b, r]) => `${b === 'heldOut' ? 'held-out' : 'training'} ${r.points ? `${r.nearMin} to ${r.nearMax} (${r.points} points)` : 'never reached'}`).join('; ')}.`);
  L.push('', `The 3D figures here take d^2 as the sum of the three z^2 (the rows keep no cross-axis covariance); the module's E2E takes the full position block. Rows read: ${checks.rows}; arms flown: ${checks.arms}; windows in the guard: ${checks.guard}; hold-outs: ${checks.held}. Re-weighting at the 0.6.0 row reproduces the rows' full variances within ${checks.maxRel.toExponential(2)} relative, at all terms 0 the noise-off ones within ${checks.maxRelOff.toExponential(2)}.`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'table.json'), `${JSON.stringify(result, null, 1)}\n`);
  fs.writeFileSync(path.join(outDir, 'README.md'), `${L.join('\n')}\n`);
  return result;
}
/** The decomposition's control: at the 0.6.0 row the re-weighted variances equal the rows' full ones; at zero noise, the noise-off ones. */
function reproduce(data, checks) {
  const zero = { s_e: 0, s_i: 0, s_l: 0, c: 0, k_F: 1 };
  for (const R of Object.values(data)) for (const block of ['training', 'heldOut']) for (const x of R[block].values()) {
    const n = x.length / W;
    for (let j = 0; j < n; j += 1) {
      const o = j * W;
      const asRow = { s_e: x[o + 24], s_i: x[o + 25], s_l: x[o + 26], c: x[o + 27], k_F: 1 };
      variances(x, j, asRow, vv);
      for (let a = 0; a < 3; a += 1) checks.maxRel = Math.max(checks.maxRel, Math.abs(vv[a] - x[o + 3 + a]) / x[o + 3 + a]);
      variances(x, j, zero, vv);
      for (let a = 0; a < 3; a += 1) checks.maxRelOff = Math.max(checks.maxRelOff, Math.abs(vv[a] - x[o + 18 + a]) / x[o + 18 + a]);
    }
  }
}
function fit(outDir) {
  const { data, checks } = load();
  reproduce(data, checks);
  console.error(`rows ${checks.rows}, arms ${checks.arms}, guard ${checks.guard}; reproduce ${checks.maxRel}, off ${checks.maxRelOff}`);
  const fitted = solve(data);
  return writeTable(outDir, data, fitted, checks);
}

// ---- export: the held-out windows' module inputs, by the coverage study's worker path (no fit run).
async function exportWorker(set, k, shards) {
  const s = SETS[set];
  Object.assign(process.env, s.env);
  const X = await import('./lib/xp2.mjs');
  const { config, root, store, XM, windows, iso, ms } = X;
  const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
  const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
  const Wx = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
  const { apForces, fitPcf, fitWeather, horizonOf } = await import('./lib/ap.mjs');
  const GRID = XM.config.scoring.gridSeconds * 1000, MIN_COV = XM.config.fit.minimumCoverage, TERMS31 = { tesseral: 31, zonal: 20 };
  const held = (b, srp) => ({ dragPrior: { form: 'LOG_NORMAL', mean: b, sigma: 1e-6 }, ...(srp ? { srpPrior: srp } : {}) });
  const FIT = { srpPrior: XM.config.fit.srpPrior };
  const ARMS = (s.xm ? [{ name: 'AP72', hours: 72 }, { name: 'AP24', hours: 24 }] : [{ name: 'AP24', hours: 24 }, { name: 'APRa12', hours: 17, drag: 'stored' }]).filter((a) => s.arms.includes(a.name));
  const storedB = new Map();
  if (!s.xm) for (const f of fs.readdirSync(path.join(store, 'rows')).filter((n) => n.endsWith('.jsonl'))) for (const l of fs.readFileSync(path.join(store, 'rows', f), 'utf8').split('\n')) if (l) { const r = JSON.parse(l); if (r.arms?.RFa12?.bHeld) storedB.set(r.key, r.arms.RFa12.bHeld); }
  const cov = new Map();
  for (const f of rowFiles(path.join(ROWS, set))) for (const l of fs.readFileSync(path.join(ROWS, set, f), 'utf8').split('\n')) if (l) { const r = JSON.parse(l); if (blockOf(s, r.cutoff.slice(0, 10)) === 'heldOut') cov.set(r.key, r); }
  const inShard = (key) => parseInt(sha256(key).slice(0, 8), 16) % shards === k;
  const xmWindows = () => Object.entries(XM.config.groups).flatMap(([group, g]) => g.objects.flatMap((o) => XM.daysOf(XM.config.period.from, XM.config.period.to).map((t) => ({ group, o, cutoffMs: t, date: XM.dateOf(t), key: `${group}|${o.norad}|${XM.dateOf(t)}` }))));
  const list = (s.xm ? xmWindows() : Object.keys(config.spans).flatMap((sp) => windows(sp))).filter((w) => cov.has(w.key) && inShard(w.key));
  const outFile = path.join(EXPORT, `${set}-${k}.jsonl`), lines = [];
  const b64 = (u) => Buffer.from(u).toString('base64');
  for (const w of list) {
    const { o, cutoffMs: D0, key } = w, c = cov.get(key);
    if (GALILEO_HELD.includes(o.norad) || (SWARM_GRACE.includes(o.norad) && D0 + 7 * DAY > Date.parse(SWARM_GRACE_LAST))) throw new Error(`${key}: a hold-out`);
    const after = T.series(o, D0 + 1, D0 + 7 * DAY).lines;
    const first = after.length ? ms(after[0].epoch) : 0;
    const grid = after.filter((l) => (ms(l.epoch) - first) % GRID === 0);
    const leads = [];
    for (const h of DAY_LEADS) {
      const l = grid.find((q) => ms(q.epoch) >= D0 + h * HOUR);
      if (l && ms(l.epoch) < D0 + h * HOUR + GRID) leads.push({ h, epoch: l.epoch, r: l.r, v: l.v });
    }
    const O = Wx.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
    if (O.excluded) continue;
    const spw = fitWeather(O.rows, horizonOf(D0));
    const arc = (hours) => { const raw = T.series(o, D0 - hours * HOUR, D0).lines; const q = raw.length > 1 ? raw.length / ((hours * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0; return q >= MIN_COV ? T.thinned(raw).chosen : null; };
    for (const spec of ARMS) {
      const a = c.arms?.[spec.name];
      if (!a?.ok || !a.leads?.length) continue;
      let fitSpec = null;
      if (spec.drag) { const b = storedB.get(key); if (!(b > 0)) continue; fitSpec = held(b, FIT.srpPrior); }
      const thin = arc(spec.hours);
      if (!thin) continue;
      const oem = S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId ?? '', norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) });
      const pcf = fitPcf({ forces: apForces(TERMS31), fit: fitSpec });
      lines.push(JSON.stringify({ key, set, regime: s.regime, arm: spec.name, norad: o.norad, cutoff: iso(D0), oem: b64(oem), pcf: b64(pcf), spw: b64(spw),
        control: { bterm: a.bterm, agom: a.agom, rms: a.rms }, leads }));
    }
  }
  fs.mkdirSync(EXPORT, { recursive: true });
  fs.writeFileSync(outFile, lines.length ? `${lines.join('\n')}\n` : '');
  console.error(`${set} shard ${k}: ${lines.length} arms`);
  process.exit(0);
}
async function exportIss() {
  const text = git(ISS.repo, 'show', `${ISS.commit}:${ISS.path}`);
  if (sha256(text) !== ISS.sha256) throw new Error(`${ISS.path} at ${ISS.commit} is ${sha256(text)}`);
  const X = await import('./lib/xp2.mjs');
  const S = await import(path.join(X.root, X.config.xm.dir, 'lib/sds.mjs'));
  const kv = Object.fromEntries(String(text).split('\n').map((l) => /^([A-Z_]+)\s*=\s*(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2].trim()]));
  const states = String(text).split('\n').map((l) => l.trim().split(/\s+/)).filter((q) => q.length === 7 && /^\d{4}-\d\d-\d\dT/.test(q[0])).map((q) => ({ epoch: q[0], r: q.slice(1, 4).map(Number), v: q.slice(4, 7).map(Number) }));
  const msOf = (t) => Date.parse(/Z$/.test(t) ? t : `${t}Z`);
  const halfMs = msOf(states[0].epoch) + (msOf(states.at(-1).epoch) - msOf(states[0].epoch)) / 2;
  const fitLines = states.filter((q) => msOf(q.epoch) <= halfMs);
  const oem = S.oemBytes({ frame: kv.REF_FRAME, object: { name: kv.OBJECT_NAME, id: kv.OBJECT_ID, norad: 0 }, lines: fitLines, useableStart: kv.USEABLE_START_TIME, useableStop: kv.USEABLE_STOP_TIME });
  const issRow = JSON.parse(fs.readFileSync(path.join(ROWS, 'iss.json'), 'utf8'));
  fs.mkdirSync(EXPORT, { recursive: true });
  fs.writeFileSync(path.join(EXPORT, 'iss.json'), `${JSON.stringify({ file: { path: ISS.path, commit: ISS.commit, sha256: ISS.sha256 }, frame: kv.REF_FRAME, oem: Buffer.from(oem).toString('base64'),
    last: states.at(-1), before: { sigmaKm: issRow.last.sigmaKm, errorKm: issRow.last.errorKm } })}\n`);
  console.error(`ISS: ${fitLines.length} fit states, last ${states.at(-1).epoch}`);
  process.exit(0);
}
async function exportAll() {
  const shards = 6, jobs = [{ args: ['--export-iss'] }];
  for (const set of Object.keys(SETS)) for (let k = 0; k < shards; k += 1) jobs.push({ args: ['--export-worker', set, '--shard', String(k), '--shards', String(shards)] });
  fs.mkdirSync(EXPORT, { recursive: true });
  const running = new Set(), failed = [];
  const nap = (t) => new Promise((r) => setTimeout(r, t));
  while (jobs.length || running.size) {
    if (jobs.length && running.size < 6 && (os.loadavg()[0] < 42 || running.size === 0)) {
      const j = jobs.shift();
      const child = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=3072', path.join(here, 'covariance-refit.mjs'), ...j.args], { cwd: repo, stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
      running.add(child);
      child.on('exit', (code) => { running.delete(child); if (code !== 0) failed.push(`${j.args.join(' ')}: ${code}`); });
      await nap(1000);
    } else await nap(5000);
  }
  const files = fs.readdirSync(EXPORT).filter((f) => f.endsWith('.jsonl')).sort();
  const manifest = { task: TASK, commit: git(repo, 'rev-parse', 'HEAD').toString().trim(), runner: sha256(fs.readFileSync(new URL(import.meta.url))), blocks: Object.fromEntries(Object.values(SETS).map((s) => [s.regime, s.heldOut])),
    files: Object.fromEntries([...files, 'iss.json'].map((f) => [f, sha256(fs.readFileSync(path.join(EXPORT, f)))])), failed };
  fs.writeFileSync(path.join(EXPORT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  if (failed.length) { console.error(`failed: ${failed.join('; ')}`); process.exit(1); }
  console.error(`export: ${files.length} files to ${EXPORT}`);
}

// ---- the end to end.
function check() {
  const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
  const reg = git(repo, 'log', '--diff-filter=A', '--format=%H %cI', '--', PLAN).toString().trim().split('\n').at(-1).split(' ');
  const res = git(repo, 'log', '--diff-filter=A', '--format=%H %cI', '--', 'results/ap-truth/covariance-refit/table.json').toString().trim().split('\n').at(-1).split(' ');
  const ancestor = (a, b) => { try { git(repo, 'merge-base', '--is-ancestor', a, b); return true; } catch { return false; } };
  ok(reg[0] && res[0] && reg[0] !== res[0] && ancestor(reg[0], res[0]), `the registration ${reg[0]?.slice(0, 10)} does not precede the results ${res[0]?.slice(0, 10)}`);
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'covariance-refit-'));
  const t = fit(scratchDir);
  for (const f of ['table.json', 'README.md']) ok(fs.existsSync(path.join(RESULTS, f)) && fs.readFileSync(path.join(scratchDir, f)).equals(fs.readFileSync(path.join(RESULTS, f))), `results/ap-truth/covariance-refit/${f} does not reproduce from the rows`);
  fs.rmSync(scratchDir, { recursive: true, force: true });
  ok(t.checks.held === 0, `${t.checks.held} hold-out rows`);
  ok(t.checks.maxRel <= 1e-6 && t.checks.maxRelOff <= 1e-6, `re-weighting reproduces the rows within ${t.checks.maxRel} (full) and ${t.checks.maxRelOff} (off)`);
  const line = `covariance-refit: s_e ${t.fitted.s_e}, s_i ${t.fitted.s_i}, s_l ${t.fitted.s_l}, c ${t.fitted.c}, k_F ${t.fitted.k_F}; loss ${fmt(t.loss.old)} -> ${fmt(t.loss.fitted)}; held-out ${t.heldOutVerdict.pass ? 'inside' : 'OUTSIDE'} the band: ${t.heldOutVerdict.cells.map((v) => `${v.regime} ${v.h}h ${v.axis} ${fmt(v.medianAbsZ)}`).join(', ')}`;
  if (fails.length) { console.log(`FAIL ${line}`); for (const f of fails) console.log(`  ${f}`); process.exit(1); }
  console.log(`PASS ${line}`);
}

if (process.argv.includes('--export-worker')) await exportWorker(argOf('--export-worker'), Number(argOf('--shard')), Number(argOf('--shards')));
else if (process.argv.includes('--export-iss')) await exportIss();
else if (process.argv.includes('--export')) await exportAll();
else if (process.argv.includes('--fit')) { const t = fit(argOf('--out') ?? RESULTS); console.log(`table written; held-out ${t.heldOutVerdict.pass ? 'PASS' : 'FAIL'}`); }
else if (process.argv.includes('--check')) check();
else { console.error('usage: --fit [--out dir] | --export | --check'); process.exit(2); }
