// E1's statistics on per-sample errors (PLAN.md §5): the primary clip, paired
// RMS reductions, the two-way cluster bootstrap, the coverage gate and Holm's
// procedure. No orbit computation here.
import { median, norm3, quantile, rng } from '../../harness/stats.mjs';

const dayOf = (epoch) => epoch.slice(0, 10);

// Amendment 2: at each age, an element set is kept when each RTN position
// error of M0 lies within k robust sigma (madScale × MAD about the median,
// per component) of the window's median. Returns Map(age -> Set(gpId)) and
// the centres and scales.
export function clipMask(m0Samples, { robustSigma, madScale }) {
  const byAge = new Map();
  for (const s of m0Samples) {
    if (!byAge.has(s.ageDays)) byAge.set(s.ageDays, []);
    byAge.get(s.ageDays).push(s);
  }
  const mask = new Map(), detail = [];
  for (const [age, list] of [...byAge].sort((a, b) => a[0] - b[0])) {
    const centre = [0, 1, 2].map((k) => median(list.map((s) => s.error[k])));
    const scale = [0, 1, 2].map((k) => madScale * median(list.map((s) => Math.abs(s.error[k] - centre[k]))));
    const kept = new Set(list.filter((s) => [0, 1, 2].every((k) => Math.abs(s.error[k] - centre[k]) <= robustSigma * scale[k])).map((s) => s.gpId));
    mask.set(age, kept);
    detail.push({ ageDays: age, n: list.length, kept: kept.size, centreKm: centre, robustSigmaKm: scale });
  }
  return { mask, detail };
}

// Pairs each method's samples at one age with M0's, on the same sets.
// methods: {name: samples}; returns rows [{gpId, norad, day, e: {name: error}}].
export function pair(methods, age, keep = null) {
  const index = {};
  for (const [name, samples] of Object.entries(methods)) {
    index[name] = new Map(samples.filter((s) => s.ageDays === age).map((s) => [s.gpId, s]));
  }
  const names = Object.keys(methods);
  const rows = [];
  for (const [gpId, s0] of index[names[0]]) {
    if (keep && !keep.has(gpId)) continue;
    if (!names.every((n) => index[n].has(gpId))) continue;
    rows.push({ gpId, norad: s0.norad, day: dayOf(s0.epoch), e: Object.fromEntries(names.map((n) => [n, index[n].get(gpId)])) });
  }
  return rows;
}

export const rmsOf = (rows, name, k = null) => Math.sqrt(rows.reduce((t, r) => t + (k === null ? norm3(r.e[name].error) ** 2 : r.e[name].error[k] ** 2), 0) / rows.length);

// Cells of the satellite × day grid, each carrying per-statistic sums.
// fields: {key: (row) -> number}; returns {rows, cols, cellRow, cellCol, sums: {key: Float64Array}}.
export function cells(rows, fields) {
  const map = new Map();
  for (const r of rows) {
    const key = `${r.norad}|${r.day}`;
    if (!map.has(key)) map.set(key, { norad: r.norad, day: r.day, sums: Object.fromEntries(Object.keys(fields).map((f) => [f, 0])) });
    const c = map.get(key);
    for (const [f, fn] of Object.entries(fields)) c.sums[f] += fn(r);
  }
  const list = [...map.values()];
  const rowKeys = [...new Set(list.map((c) => c.norad))], colKeys = [...new Set(list.map((c) => c.day))];
  const ri = new Map(rowKeys.map((k, i) => [k, i])), ci = new Map(colKeys.map((k, i) => [k, i]));
  return {
    rows: rowKeys.length, cols: colKeys.length,
    cellRow: Int32Array.from(list, (c) => ri.get(c.norad)), cellCol: Int32Array.from(list, (c) => ci.get(c.day)),
    sums: Object.fromEntries(Object.keys(fields).map((f) => [f, Float64Array.from(list, (c) => c.sums[f])])),
  };
}

// Two-way cluster ("pigeonhole") bootstrap, Owen (2007): satellites and days
// are resampled independently; a cell's weight is the product of its row
// and column draw counts. Every statistic sees the same draws.
// statistics: {name: (weightedSum(field) -> number)}; returns per statistic
// {estimate, draws: Float64Array}.
export function bootstrap(grid, statistics, { resamples, seed }) {
  const random = rng(seed);
  const n = grid.cellRow.length;
  const w = new Float64Array(n);
  const sumOf = (weights) => (field) => { const s = grid.sums[field]; let t = 0; for (let i = 0; i < n; ++i) t += weights[i] * s[i]; return t; };
  const ones = new Float64Array(n).fill(1);
  const out = Object.fromEntries(Object.entries(statistics).map(([k, f]) => [k, { estimate: f(sumOf(ones)), draws: new Float64Array(resamples) }]));
  const rc = new Int32Array(grid.rows), cc = new Int32Array(grid.cols);
  for (let b = 0; b < resamples; ++b) {
    rc.fill(0); cc.fill(0);
    for (let i = 0; i < grid.rows; ++i) rc[Math.floor(random() * grid.rows)] += 1;
    for (let i = 0; i < grid.cols; ++i) cc[Math.floor(random() * grid.cols)] += 1;
    for (let i = 0; i < n; ++i) w[i] = rc[grid.cellRow[i]] * cc[grid.cellCol[i]];
    const sum = sumOf(w);
    for (const [k, f] of Object.entries(statistics)) out[k].draws[b] = f(sum);
  }
  return out;
}

// Percentile interval and one-sided bootstrap p-value of "statistic ≤ null".
export function interval({ estimate, draws }, confidence, nullValue = null) {
  const finite = [...draws].filter(Number.isFinite);
  const alpha = (1 - confidence) / 2;
  const result = { estimate, lower: quantile(finite, alpha), upper: quantile(finite, 1 - alpha), resamples: finite.length };
  if (nullValue !== null) result.pValue = (1 + finite.filter((v) => v <= nullValue).length) / (finite.length + 1);
  return result;
}

// RMS reduction 1 − RMS(method)/RMS(M0) on paired rows, with its bootstrap.
export function reduction(rows, method, statistics, nullValue) {
  const grid = cells(rows, { m0: (r) => norm3(r.e.M0.error) ** 2, m: (r) => norm3(r.e[method].error) ** 2 });
  const draws = bootstrap(grid, { r: (sum) => 1 - Math.sqrt(sum('m') / sum('m0')) }, { resamples: statistics.bootstrapResamples, seed: statistics.bootstrapSeed });
  return { n: rows.length, objects: grid.rows, days: grid.cols, rmsM0Km: rmsOf(rows, 'M0'), rmsKm: rmsOf(rows, method), reduction: interval(draws.r, statistics.confidence, nullValue) };
}

// gp-error-model's gate on per-sample coverage flags (the module's own d²
// and ellipsoid tests): CALIBRATED when the 1 and 2 σ fractions are within
// the tolerance of the χ²₃ nominal and at most tailLimit lies outside 3 σ.
export function gateFromFractions(inside, nominal, gate) {
  return Math.abs(inside[0] - nominal[0]) <= gate.tolerance && Math.abs(inside[1] - nominal[1]) <= gate.tolerance && 1 - inside[2] <= gate.tailLimit;
}

// Holm (1979): p-values {name: p}, family level alpha -> {name: rejected}.
export function holm(pValues, alpha) {
  const sorted = Object.entries(pValues).sort((a, b) => a[1] - b[1]);
  const out = {};
  let stopped = false;
  sorted.forEach(([name, p], i) => {
    const threshold = alpha / (sorted.length - i);
    if (stopped || p > threshold) stopped = true;
    out[name] = { pValue: p, threshold, rejected: !stopped };
  });
  return out;
}
