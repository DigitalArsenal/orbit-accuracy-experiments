// E10 statistics for the report (PLAN.md sections 4 and 5): cluster
// bootstraps with one-sided p-values (as E5's score.mjs), weighted
// quantiles, Holm's procedure, and the per-part summaries. Statistics only.
import { quantile, rng } from '../../harness/stats.mjs';
import { config } from './common.mjs';
import { runSummary } from './score.mjs';

// Cluster bootstrap over the rows and columns of the cells (one column: a
// one-way bootstrap over rows), percentile interval at `confidence`, and the
// one-sided p-value against nullValue: the share of resamples at or beyond it,
// (k + 1) / (B + 1). side 'less': the alternative is statistic < nullValue.
export function boot(cells, statistic, { confidence = config.statistics.confidence, nullValue = null, side = 'less' } = {}) {
  const rows = [...new Set(cells.map((c) => c.row))], cols = [...new Set(cells.map((c) => c.col))];
  const random = rng(config.statistics.bootstrapSeed);
  const draws = (keys) => { const count = new Map(keys.map((k) => [k, 0])); for (let i = 0; i < keys.length; ++i) { const k = keys[Math.floor(random() * keys.length)]; count.set(k, count.get(k) + 1); } return count; };
  const values = [];
  for (let b = 0; b < config.statistics.bootstrapResamples; ++b) {
    const r = draws(rows), c = draws(cols);
    const weighted = [];
    for (const cell of cells) { const w = r.get(cell.row) * c.get(cell.col); if (w) weighted.push({ ...cell, weight: w }); }
    const v = statistic(weighted);
    if (!Number.isNaN(v)) values.push(v);  // +Infinity (failed runs) counts
  }
  const alpha = (1 - confidence) / 2;
  const out = {
    estimate: statistic(cells.map((c) => ({ ...c, weight: 1 }))), lower: quantile(values, alpha), upper: quantile(values, 1 - alpha),
    lower90: quantile(values, 0.05), upper90: quantile(values, 0.95), resamples: values.length, clusters: { rows: rows.length, cols: cols.length },
  };
  if (nullValue !== null) out.p = (values.filter((v) => (side === 'less' ? v >= nullValue : v <= nullValue)).length + 1) / (values.length + 1);
  return out;
}

export function weightedQuantile(items, q) {
  // +Infinity marks a failed run and stays in; NaN is dropped.
  const s = items.filter((x) => !Number.isNaN(x.value) && x.weight > 0).sort((a, b) => (a.value === b.value ? 0 : a.value < b.value ? -1 : 1));
  if (!s.length) return NaN;
  const total = s.reduce((a, x) => a + x.weight, 0);
  let acc = 0;
  for (const x of s) { acc += x.weight; if (acc >= q * total) return x.value; }
  return s.at(-1).value;
}
// The weighted median of cell.value.
export const wmedian = (cells) => weightedQuantile(cells.map((c) => ({ value: c.value, weight: c.weight })), 0.5);
// The weighted ratio of sums, sum w a / sum w b.
export const wratio = (cells) => { let a = 0, b = 0; for (const c of cells) { a += c.weight * c.a; b += c.weight * c.b; } return b > 0 ? a / b : NaN; };

export function holm(tests, alpha = config.statistics.holmAlpha) {
  const order = [...tests].sort((a, b) => a.p - b.p);
  let stop = false;
  return order.map((t, i) => {
    const threshold = alpha / (order.length - i);
    const reject = !stop && t.p <= threshold;
    if (!reject) stop = true;
    return { ...t, threshold, reject };
  });
}

// Per-run containment and size over the scored rows.
export function regionSummary(rows) {
  const frac = (key) => { const v = rows.filter((r) => r[key] !== undefined); return v.length ? v.filter((r) => r[key]).length / v.length : null; };
  const values = (key) => rows.map((r) => r[key]).filter(Number.isFinite);
  const med = (xs) => (xs.length ? quantile(xs, 0.5) : null);
  const ext = (i) => med(rows.map((r) => r.extents?.[i]).filter(Number.isFinite));
  return {
    inSet: frac('inSet'), inAlpha005: frac('inAlpha0.05'), inAlpha05: frac('inAlpha0.5'), in95: frac('in95'), in997: frac('in997'),
    medianLogDet: med(values('logDet')), medianExtentsM: [ext(0), ext(1), ext(2)],
    degenerateAlpha005: rows.filter((r) => r['countAlpha0.05'] !== undefined && r['countAlpha0.05'] < 13).length,
  };
}

// Detection on one run: the first epoch at or after the event whose statistic
// exceeds the threshold (or, for a flag, is set), and the false alarms before it.
export function detection(job, statistic, threshold, eventMs) {
  const value = (r) => (statistic === 'inconsistent' ? (r.inconsistent ? 1 : 0) : r[statistic]);
  const over = (r) => (statistic === 'inconsistent' ? value(r) === 1 : Number.isFinite(value(r)) && value(r) > threshold);
  const warm = job.epochMs + config.partB.warmupHours * 3600e3;
  const before = job.rows.filter((r) => r.ms >= warm && (eventMs === null || r.ms < eventMs));
  const after = eventMs === null ? [] : job.rows.filter((r) => r.ms >= eventMs);
  const first = after.find(over);
  return { falseAlarms: before.filter(over).length, epochsBefore: before.length, detected: !!first, delaySeconds: first ? (first.ms - eventMs) / 1000 : null };
}

export { runSummary };
