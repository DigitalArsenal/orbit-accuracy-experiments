// E8 statistics over the rows of steps 20 and 30: E5's summaries (two-way
// cluster bootstrap over satellites and UTC days, Owen 2007) plus the two
// non-inferiority statistics of PLAN.md section 5 (a ratio against a margin,
// its one-sided p the share of resamples at or beyond the margin). Statistics
// only.
import { boot, densityCells, densitySummary, holm, propagationCells, propagationSummary, weightedQuantile } from '../e5-density-calibration/score.mjs';

export { densitySummary, holm, propagationSummary };

// Forecast pairs of one arm and lead bin as density rows: each pair is
// (target, issue|day) with the arm's D0 and every variant on the same orbit mean.
export function forecastRows(pairs, arm, [a, b], variants) {
  const out = [];
  for (const r of pairs) {
    if (r.arm !== arm || r.leadDays < a || r.leadDays >= b || !variants.includes(r.variant)) continue;
    const day = `${r.issue}|${r.day}`;
    out.push({ target: r.target, day, variant: r.variant, lnRatio: r.lnRatio });
  }
  return out;
}

const moments = (cells, v) => {
  let n = 0, s = 0, ss = 0;
  for (const c of cells) { const x = c.stats[v]; n += c.weight * x.n; s += c.weight * x.s; ss += c.weight * x.ss; }
  const mean = s / n;
  return Math.sqrt(Math.max(0, ss / n - mean * mean));
};
// sigma(num) / sigma(den) on paired cells, with the one-sided p of the
// margin (the share of resamples at or above it).
export function sigmaRatio(rows, num, den, margin) {
  const cells = densityCells(rows, [num, den]);
  if (!cells.length) return null;
  return { cells: cells.length, ...boot(cells, (w) => moments(w, num) / moments(w, den), undefined, { nullValue: margin, side: 'less' }) };
}
// The median over arcs of e(variant) / e(reference) at a horizon, with the
// one-sided p of the margin (the share of resamples at or above it).
export function medianRatio(rows, variant, reference, horizon, filter, margin) {
  const cells = propagationCells(rows, [variant, reference], horizon, filter);
  if (cells.length < 3) return null;
  const ratio = (w) => weightedQuantile(w.map((c) => ({ value: c.e[variant] / c.e[reference], weight: c.weight })), 0.5);
  return { arcs: cells.length, satellites: new Set(cells.map((c) => c.row)).size, ...boot(cells, ratio, undefined, { nullValue: margin, side: 'less' }) };
}
