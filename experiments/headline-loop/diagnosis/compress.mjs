// #316 item 3 and 6 (exploratory measurement): how many numbers a record needs, three ways, on rep.mjs carrier series (option z).
//   A. AP plus a correction in R, T, N: harmonics of the mean longitude AND of the Earth's rotation (frequencies k n + m w_E,
//      k = 0..K, m = -M..M), amplitudes polynomials of degree a in time, plus a time polynomial of degree d.
//   B. AP plus a piecewise Chebyshev correction in R, T, N (segments of L hours, degree p).
//   C. No theory: FFM's position itself as piecewise Chebyshev in GCRF (segments of L hours, degree p).
// Fitted on every other sample, scored on the samples between (held out), per lead day, against half of FFM's error against truth.
//   node experiments/headline-loop/diagnosis/compress.mjs <series files or dir> [--json out.json]
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null;
const inputs = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--json');
const files = inputs.flatMap((p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter((f) => f.endsWith('.json')).map((f) => path.join(p, f)) : [p]));
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / Math.max(1, v.length));

function solve(cols, y, fitIdx) {
  // least squares on fitIdx rows (normal equations, scaled, Cholesky); returns the model at every row
  const m = cols.length;
  const sc = cols.map((c) => Math.sqrt(fitIdx.reduce((s, k) => s + c[k] * c[k], 0)) || 1);
  const A = Array.from({ length: m }, () => new Float64Array(m)), b = new Float64Array(m);
  for (let i = 0; i < m; i += 1) {
    for (let j = 0; j <= i; j += 1) { let s = 0; for (const k of fitIdx) s += cols[i][k] * cols[j][k]; A[i][j] = A[j][i] = s / (sc[i] * sc[j]); }
    let s = 0; for (const k of fitIdx) s += cols[i][k] * y[k]; b[i] = s / sc[i];
  }
  for (let i = 0; i < m; i += 1) A[i][i] += 1e-10;
  const L = Array.from({ length: m }, () => new Float64Array(m));
  for (let i = 0; i < m; i += 1) for (let j = 0; j <= i; j += 1) { let s = A[i][j]; for (let k = 0; k < j; k += 1) s -= L[i][k] * L[j][k]; if (i === j) L[i][i] = Math.sqrt(Math.max(s, 1e-300)); else L[i][j] = s / L[j][j]; }
  const z = new Float64Array(m); for (let i = 0; i < m; i += 1) { let s = b[i]; for (let k = 0; k < i; k += 1) s -= L[i][k] * z[k]; z[i] = s / L[i][i]; }
  const x = new Float64Array(m); for (let i = m - 1; i >= 0; i -= 1) { let s = z[i]; for (let k = i + 1; k < m; k += 1) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  const model = new Float64Array(y.length); for (let i = 0; i < m; i += 1) { const xi = x[i] / sc[i]; for (let k = 0; k < y.length; k += 1) model[k] += cols[i][k] * xi; }
  return model;
}
const binOf = (tMin) => (tMin <= 0 ? 0 : Math.min(7, Math.ceil(tMin / 1440)));
function scoreBins(tMin, err3, idx) { // err3: [ [dr,dt,dn] ] per sample; RMS 3D per bin over idx
  const out = {};
  for (const k of idx) { const b = binOf(tMin[k]); (out[b] ??= []).push(err3[k]); }
  return Object.fromEntries(Object.entries(out).map(([b, v]) => [b, Math.hypot(rms(v.map((q) => q[0])), rms(v.map((q) => q[1])), rms(v.map((q) => q[2])))]));
}
const meets = (bins, target) => Object.entries(target).every(([d, v]) => bins[d] === undefined || bins[d] <= v);

const SIDEREAL = 1.00273790935; // rev/day of the Earth
function harmonicCols(tMin, nRevDay, K, M, a, d) {
  const tD = tMin.map((x) => x / 1440), span = tD.at(-1) - tD[0], tau = tD.map((x) => (2 * (x - tD[0])) / span - 1);
  const cols = [];
  for (let j = 0; j <= d; j += 1) cols.push(Float64Array.from(tau, (v) => v ** j));
  for (let k = 0; k <= K; k += 1) for (let m = -M; m <= M; m += 1) {
    if (k === 0 && m <= 0) continue;
    const f = k * nRevDay + m * SIDEREAL;
    for (let i = 0; i <= a; i += 1) {
      cols.push(Float64Array.from(tD, (x, q) => Math.cos(2 * Math.PI * f * x) * tau[q] ** i));
      cols.push(Float64Array.from(tD, (x, q) => Math.sin(2 * Math.PI * f * x) * tau[q] ** i));
    }
  }
  return cols;
}
function chebPiecewise(tMin, ys, Lh, p, fitIdx, allIdx) {
  // ys: components [n][...]; segments of Lh hours from the first sample; Chebyshev degree p per segment and component
  const t0 = tMin[0], segOf = (t) => Math.floor((t - t0) / (Lh * 60) + 1e-9);
  const nSeg = segOf(tMin.at(-1)) + 1;
  const models = ys.map(() => new Float64Array(tMin.length));
  let used = 0;
  for (let s = 0; s < nSeg; s += 1) {
    const rows = allIdx.filter((k) => segOf(tMin[k]) === s);
    if (!rows.length) continue;
    const a = t0 + s * Lh * 60, b = a + Lh * 60;
    const x = (t) => (2 * (t - a)) / (b - a) - 1;
    const fit = rows.filter((k) => fitIdx.has(k));
    const deg = Math.min(p, fit.length - 1);
    const T = (k, n) => Math.cos(n * Math.acos(Math.max(-1, Math.min(1, x(tMin[k])))));
    const cols = Array.from({ length: deg + 1 }, (_, n) => { const c = new Float64Array(tMin.length); for (const k of rows) c[k] = T(k, n); return c; });
    ys.forEach((y, c) => { const mdl = solve(cols, y, fit); for (const k of rows) models[c][k] = mdl[k]; });
    used += ys.length * (deg + 1);
  }
  return { models, coefficients: used };
}

const results = [];
for (const file of files) {
  const ser = JSON.parse(fs.readFileSync(file, 'utf8'));
  const n = ser.tMin.length, fitIdx = [], testIdx = [];
  for (let k = 0; k < n; k += 1) (k % 2 === 0 ? fitIdx : testIdx).push(k);
  const fitSet = new Set(fitIdx), all = [...Array(n).keys()];
  const target = Object.fromEntries(Object.entries(ser.ffmTruthDays ?? {}).map(([d, v]) => [d, 0.5 * v.e]));
  const comps = [0, 1, 2].map((c) => Float64Array.from(ser.res, (q) => q[c]));
  const raw = scoreBins(ser.tMin, ser.res, testIdx);
  const out = { key: ser.key, arm: ser.arm, arcH: ser.arcH, meanMotion: ser.meanMotion, ecc: ser.ecc, target, raw, A: [], B: [], C: [] };
  // A: harmonics of n and w_E
  for (const [K, M, a, d] of [[1, 0, 0, 2], [2, 0, 1, 2], [2, 1, 1, 2], [2, 2, 1, 2], [3, 3, 1, 2], [4, 4, 2, 3]]) {
    const cols = harmonicCols(ser.tMin, ser.meanMotion, K, M, a, d);
    const models = comps.map((y) => solve(cols, y, fitIdx));
    const err = ser.res.map((q, k) => [q[0] - models[0][k], q[1] - models[1][k], q[2] - models[2][k]]);
    const bins = scoreBins(ser.tMin, err, testIdx);
    out.A.push({ K, M, a, d, coefficients: 3 * cols.length, bins, meets: meets(bins, target) });
  }
  // B and C: piecewise Chebyshev, on the residual and on FFM's GCRF position
  const periodH = 24 / ser.meanMotion;
  const lengths = [...new Set([periodH / 4, periodH / 2, periodH, 2 * periodH, 6, 12, 24].map((x) => +x.toFixed(4)))].filter((x) => x * 60 >= 4 * (ser.tMin[1] - ser.tMin[0]) * 2);
  const pos = [0, 1, 2].map((c) => Float64Array.from(ser.r, (r) => r[c]));
  for (const Lh of lengths) for (const p of [3, 5, 8, 12]) {
    const b = chebPiecewise(ser.tMin, comps, Lh, p, fitSet, all);
    const errB = ser.res.map((q, k) => [q[0] - b.models[0][k], q[1] - b.models[1][k], q[2] - b.models[2][k]]);
    const binsB = scoreBins(ser.tMin, errB, testIdx);
    out.B.push({ Lh, p, coefficients: b.coefficients, bins: binsB, meets: meets(binsB, target) });
    const c = chebPiecewise(ser.tMin, pos, Lh, p, fitSet, all);
    const errC = ser.r.map((r, k) => [r[0] - c.models[0][k], r[1] - c.models[1][k], r[2] - c.models[2][k]]);
    const binsC = scoreBins(ser.tMin, errC, testIdx);
    out.C.push({ Lh, p, coefficients: c.coefficients, bins: binsC, meets: meets(binsC, target) });
  }
  // D: FFM position as Chebyshev on segments of equal eccentric anomaly (k per revolution), so a perigee pass gets short segments
  out.D = [];
  if ((ser.ecc ?? 0) > 0.1) {
    const MU = 398600.4418;
    let prev = null, turns = 0;
    const Eun = ser.r.map((r, k) => {
      const v = ser.v[k], rn = Math.hypot(...r), v2 = v[0] ** 2 + v[1] ** 2 + v[2] ** 2, a = 1 / (2 / rn - v2 / MU), rv = r[0] * v[0] + r[1] * v[1] + r[2] * v[2];
      const ec = 1 - rn / a, es = rv / Math.sqrt(MU * a);
      let E = Math.atan2(es, ec);
      if (prev !== null && E < prev - Math.PI) turns += 1;
      prev = E;
      return E + 2 * Math.PI * turns;
    });
    for (const kRev of [4, 8, 16, 32]) for (const p of [5, 8, 12]) {
      const seg = Eun.map((E) => Math.floor((E - Eun[0]) / ((2 * Math.PI) / kRev) + 1e-12));
      const nSeg = seg.at(-1) + 1, models = pos.map(() => new Float64Array(n));
      let used = 0;
      for (let s = 0; s < nSeg; s += 1) {
        const rows = all.filter((k) => seg[k] === s);
        if (!rows.length) continue;
        const a = ser.tMin[rows[0]], b = ser.tMin[rows.at(-1)] + 1e-9;
        const fit = rows.filter((k) => fitSet.has(k));
        const deg = Math.min(p, Math.max(0, fit.length - 1));
        const x = (t) => (2 * (t - a)) / (b - a || 1) - 1;
        const cols = Array.from({ length: deg + 1 }, (_, m) => { const c = new Float64Array(n); for (const k of rows) c[k] = Math.cos(m * Math.acos(Math.max(-1, Math.min(1, x(ser.tMin[k]))))); return c; });
        pos.forEach((y, c) => { const mdl = solve(cols, y, fit); for (const k of rows) models[c][k] = mdl[k]; });
        used += 3 * (deg + 1);
      }
      const err = ser.r.map((r, k) => [r[0] - models[0][k], r[1] - models[1][k], r[2] - models[2][k]]);
      const bins = scoreBins(ser.tMin, err, testIdx);
      out.D.push({ kRev, p, coefficients: used, bins, meets: meets(bins, target) });
    }
  }
  const best = (list) => list.filter((x) => x.meets).sort((x, y) => x.coefficients - y.coefficients)[0] ?? null;
  out.best = { A: best(out.A), B: best(out.B), C: best(out.C), D: best(out.D) };
  if (out.D.length) {
    const bd = out.best.D;
    console.log(`  D (eccentric-anomaly segments) smallest meeting target: ${bd ? `${bd.kRev} per rev p ${bd.p}: ${bd.coefficients} numbers` : 'none'}; ${out.D.filter((x) => x.p === 8).map((x) => `${x.kRev}/rev p8 (${x.coefficients}) d1 ${(x.bins[1] * 1000).toFixed(1)} m`).join(', ')}`);
  }
  out.days = (ser.tMin.at(-1) - ser.tMin[0]) / 1440;
  results.push(out);
  const f = (x) => (x === undefined || x === null ? '   -  ' : (x * 1000).toFixed(1).padStart(7));
  const line = (name, bins) => `  ${name.padEnd(30)}${[0, 1, 2, 3, 4, 5, 6, 7].map((b) => f(bins[b])).join('')}`;
  console.log(`\n${ser.key} ${ser.arm} (${out.days.toFixed(1)} d, period ${periodH.toFixed(2)} h) held-out RMS m by bin: arc d1..d7`);
  console.log(line('residual', raw));
  console.log(line('target 0.5 FFM', target));
  for (const x of out.A) console.log(line(`A K${x.K} M${x.M} a${x.a} d${x.d} (${x.coefficients})${x.meets ? ' *' : ''}`, x.bins));
  for (const [k, list] of [['B', out.B], ['C', out.C]]) {
    const bb = out.best[k];
    console.log(`  ${k} smallest meeting target: ${bb ? `L ${bb.Lh} h p ${bb.p}: ${bb.coefficients} numbers (${(bb.coefficients / out.days).toFixed(0)} per day)` : 'none'}`);
    const pick = list.filter((x) => x.p === 8).slice(0, 4);
    for (const x of pick) console.log(line(`${k} L ${x.Lh} h p ${x.p} (${x.coefficients})${x.meets ? ' *' : ''}`, x.bins));
  }
}
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(results));
