// E5 statistics over the rows of steps 20 and 30: density log-ratio spread
// and bias, propagation-error quantiles and paired ratios, each with a
// two-way cluster bootstrap over satellites and UTC days (harness/stats.mjs).
// Statistics only.
import { quantile, rng } from '../../harness/stats.mjs';
import { config } from './common.mjs';

// Two-way cluster ("pigeonhole") bootstrap (Owen 2007), as harness/stats.mjs
// does it, also returning the one-sided p-value of the statistic against a
// null value (the share of resamples at or beyond it, (k + 1) / (B + 1)).
function boot(cells, statistic, confidence = config.statistics.confidence, { nullValue = null, side = 'greater' } = {}) {
  const rows = [...new Set(cells.map((c) => c.row))], cols = [...new Set(cells.map((c) => c.col))];
  const random = rng(config.statistics.bootstrapSeed);
  const draws = (keys) => { const count = new Map(keys.map((k) => [k, 0])); for (let i = 0; i < keys.length; ++i) { const k = keys[Math.floor(random() * keys.length)]; count.set(k, count.get(k) + 1); } return count; };
  const values = [];
  for (let b = 0; b < config.statistics.bootstrapResamples; ++b) {
    const r = draws(rows), c = draws(cols);
    const weighted = [];
    for (const cell of cells) { const w = r.get(cell.row) * c.get(cell.col); if (w) weighted.push({ ...cell, weight: w }); }
    const v = statistic(weighted);
    if (Number.isFinite(v)) values.push(v);
  }
  const alpha = (1 - confidence) / 2;
  const out = { estimate: statistic(cells.map((c) => ({ ...c, weight: 1 }))), lower: quantile(values, alpha), upper: quantile(values, 1 - alpha), resamples: values.length };
  if (nullValue !== null) {
    const beyond = values.filter((v) => (side === 'greater' ? v <= nullValue : v >= nullValue)).length;
    out.p = (beyond + 1) / (values.length + 1);
  }
  return out;
}

// Weighted quantile of {value, weight} items.
export function weightedQuantile(items, q) {
  const s = items.filter((x) => Number.isFinite(x.value) && x.weight > 0).sort((a, b) => a.value - b.value);
  if (!s.length) return NaN;
  const total = s.reduce((a, x) => a + x.weight, 0);
  let acc = 0;
  for (const x of s) { acc += x.weight; if (acc >= q * total) return x.value; }
  return s.at(-1).value;
}

// Density: rows {target, day, variant, lnRatio}. Cells per (target, day)
// hold count, sum and sum of squares per variant.
export function densityCells(rows, variants) {
  const cells = new Map();
  for (const r of rows) {
    if (!variants.includes(r.variant)) continue;
    const key = `${r.target}|${r.day}`;
    if (!cells.has(key)) cells.set(key, { row: r.target, col: r.day, stats: {} });
    const c = cells.get(key).stats;
    c[r.variant] ??= { n: 0, s: 0, ss: 0 };
    c[r.variant].n += 1; c[r.variant].s += r.lnRatio; c[r.variant].ss += r.lnRatio ** 2;
  }
  // Keep only cells where every variant is present (paired).
  return [...cells.values()].filter((c) => variants.every((v) => c.stats[v]?.n));
}
const moments = (cells, v) => {
  let n = 0, s = 0, ss = 0;
  for (const c of cells) { const x = c.stats[v]; n += c.weight * x.n; s += c.weight * x.s; ss += c.weight * x.ss; }
  const mean = s / n;
  return { n, mean, sd: Math.sqrt(Math.max(0, ss / n - mean * mean)) };
};
// Per variant: n, bias (exp(mean) - 1) and sigma, with intervals.
export function densitySummary(rows, variants, reference = 'D0') {
  const cells = densityCells(rows, variants);
  const out = { cells: cells.length, satellites: new Set(cells.map((c) => c.row)).size, days: new Set(cells.map((c) => c.col)).size, variants: {} };
  if (!cells.length) return out;
  for (const v of variants) {
    const sd = boot(cells, (w) => moments(w, v).sd);
    const mean = boot(cells, (w) => moments(w, v).mean);
    const entry = { n: moments(cells.map((c) => ({ ...c, weight: 1 })), v).n, sigma: sd, meanLn: mean };
    if (v !== reference && variants.includes(reference)) {
      entry.reduction = boot(cells, (w) => 1 - moments(w, v).sd / moments(w, reference).sd, config.statistics.confidence, { nullValue: 0, side: 'greater' });
    }
    out.variants[v] = entry;
  }
  return out;
}

// Propagation: arcs {norad, issue, variant, errors: {h: m}}; per variant
// and horizon the median and 95th percentile; paired ratios to D0.
export function propagationCells(rows, variants, horizon, filter = () => true) {
  const arcs = new Map();
  for (const r of rows) {
    if (!variants.includes(r.variant) || !r.errors || !Number.isFinite(r.errors[horizon]) || !filter(r)) continue;
    const key = `${r.norad}|${r.issue}`;
    if (!arcs.has(key)) arcs.set(key, { row: String(r.norad), col: r.issue, e: {} });
    arcs.get(key).e[r.variant] = r.errors[horizon];
  }
  return [...arcs.values()].filter((c) => variants.every((v) => Number.isFinite(c.e[v])));
}
export function propagationSummary(rows, variants, horizon, filter = () => true, reference = 'D0') {
  const cells = propagationCells(rows, variants, horizon, filter);
  const out = { arcs: cells.length, satellites: new Set(cells.map((c) => c.row)).size, variants: {} };
  if (cells.length < 3) return out;
  const q = (v, p) => (w) => weightedQuantile(w.map((c) => ({ value: c.e[v], weight: c.weight })), p);
  for (const v of variants) {
    const entry = { median: boot(cells, q(v, 0.5)), p95: boot(cells, q(v, 0.95)) };
    if (v !== reference && variants.includes(reference)) {
      const ratio = (w) => weightedQuantile(w.map((c) => ({ value: c.e[v] / c.e[reference], weight: c.weight })), 0.5);
      entry.medianRatio = boot(cells, ratio, config.statistics.confidence, { nullValue: 1, side: 'less' });
    }
    out.variants[v] = entry;
  }
  return out;
}

// Holm's step-down procedure over {id, p} (one-sided bootstrap p-values).
export function holm(tests, alpha = 0.05) {
  const order = [...tests].sort((a, b) => a.p - b.p);
  let stop = false;
  return order.map((t, i) => {
    const threshold = alpha / (order.length - i);
    const reject = !stop && t.p <= threshold;
    if (!reject) stop = true;
    return { ...t, threshold, reject };
  });
}
