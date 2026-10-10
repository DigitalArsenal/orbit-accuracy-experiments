// E2b's statistics on module outputs (no orbit computation). The consistency
// statistics are E2's (experiments/e2-catalog-covariance/score.mjs realism):
// the same estimators, the same cluster bootstrap (objects drawn with the same
// generator in the same order), computed on per-object sums for speed.
import { quantile, rng } from '../../harness/stats.mjs';
import { CHI2_3_95, chi2cdf3, cramerVonMises, energyScore } from '../e2-catalog-covariance/score.mjs';
import { det3, full3, mahalanobis } from './linalg.mjs';

export { CHI2_3_95, chi2cdf3 };

// Cluster bootstrap of a statistic of per-object sums. items: [{object, v:
// [numbers]}]; statistic(sumVector) -> number. Objects in first-appearance
// order, drawn as E2's clusterBootstrap draws them.
export function clusterBootstrapSums(items, statistic, { resamples, seed, confidence }) {
  const order = [], sums = new Map();
  for (const it of items) {
    let s = sums.get(it.object);
    if (!s) { s = it.v.map(() => 0); sums.set(it.object, s); order.push(it.object); }
    for (let k = 0; k < it.v.length; ++k) s[k] += it.v[k];
  }
  const per = order.map((o) => sums.get(o));
  const total = per[0].map((_, k) => per.reduce((a, s) => a + s[k], 0));
  const random = rng(seed);
  const values = [];
  for (let b = 0; b < resamples; ++b) {
    const acc = total.map(() => 0);
    for (let i = 0; i < per.length; ++i) {
      const s = per[Math.floor(random() * per.length)];
      for (let k = 0; k < acc.length; ++k) acc[k] += s[k];
    }
    const v = statistic(acc);
    if (Number.isFinite(v)) values.push(v);
  }
  const alpha = (1 - confidence) / 2;
  return { estimate: statistic(total), lower: quantile(values, alpha), upper: quantile(values, 1 - alpha), values };
}
const drop = ({ values, ...rest }) => { void values; return rest; };

// E2's H1 statistics. samples: [{object, d2, errorM}].
export function consistency(samples, acceptance, statistics) {
  const n = samples.length;
  if (!n) return { n: 0 };
  const opts = { resamples: statistics.bootstrapResamples, seed: statistics.bootstrapSeed, confidence: statistics.confidence };
  const items = samples.map((s) => ({ object: s.object, v: [1, s.d2, s.d2 <= CHI2_3_95 ? 1 : 0, chi2cdf3(s.d2)] }));
  const ratio = clusterBootstrapSums(items, (a) => a[1] / a[0] / 3, opts);
  const cover = clusterBootstrapSums(items, (a) => a[2] / a[0], opts);
  const pit = clusterBootstrapSums(items, (a) => a[3] / a[0], opts);
  const m = pit.values.reduce((a, v) => a + v, 0) / pit.values.length;
  const variance = pit.values.reduce((a, v) => a + (v - m) ** 2, 0) / (pit.values.length - 1);
  const designEffect = Math.max(1, variance / (1 / (12 * n)));
  const w2 = cramerVonMises(samples.map((s) => s.d2));
  const critical = acceptance.cvmCritical5 * designEffect;
  const pass = {
    meanRatio: ratio.estimate >= acceptance.meanRatio[0] && ratio.estimate <= acceptance.meanRatio[1],
    coverage95: cover.estimate >= acceptance.coverage95[0] && cover.estimate <= acceptance.coverage95[1],
    cvm: w2 <= critical,
  };
  return {
    n, objects: new Set(samples.map((s) => s.object)).size,
    rms3dM: Math.sqrt(samples.reduce((a, s) => a + s.errorM ** 2, 0) / n),
    median3dM: quantile(samples.map((s) => s.errorM), 0.5),
    meanD2Over3: drop(ratio), coverage95: drop(cover), cvm: { w2, designEffect, critical },
    scaleFactorForConsistency: Math.sqrt(ratio.estimate),
    pass, consistent: pass.meanRatio && pass.coverage95 && pass.cvm,
  };
}

// Per-sample scores of an error e (km, 3) under a covariance (lower 3x3, km^2).
// The energy score draws `m` Gaussians from `random` (E2's estimator, metres).
export function scoreSample(e, lower, { m, random }) {
  const c = full3(lower);
  const d2 = mahalanobis(e, c);
  if (!Number.isFinite(d2)) return null;
  const cm = c.map((v) => v * 1e6);
  const out = { d2, logScore: 0.5 * (d2 + Math.log(det3(cm)) + 3 * Math.log(2 * Math.PI)), z: [0, 1, 2].map((k) => e[k] / Math.sqrt(c[4 * k])) };
  if (random) out.energy = energyScore({ p: cm, error: e.map((x) => x * 1e3) }, m, random);
  return out;
}

// Mean of a per-sample value with its cluster-bootstrap interval.
export function meanWithInterval(samples, key, statistics) {
  if (!samples.length) return null;
  const r = clusterBootstrapSums(samples.map((s) => ({ object: s.object, v: [1, s[key]] })), (a) => a[1] / a[0],
    { resamples: statistics.bootstrapResamples, seed: statistics.bootstrapSeed, confidence: statistics.confidence });
  return drop(r);
}
// Ratio of the means of two per-sample values on the same samples.
export function ratioOfMeans(samples, a, b, statistics) {
  if (!samples.length) return null;
  const r = clusterBootstrapSums(samples.map((s) => ({ object: s.object, v: [s[a], s[b]] })), (x) => x[0] / x[1],
    { resamples: statistics.bootstrapResamples, seed: statistics.bootstrapSeed, confidence: statistics.confidence });
  return drop(r);
}

// Standard deviation of each axis's normalized error.
export function axisNormStd(samples) {
  const n = samples.length;
  return [0, 1, 2].map((k) => {
    const m = samples.reduce((a, s) => a + s.z[k], 0) / n;
    return Math.sqrt(samples.reduce((a, s) => a + (s.z[k] - m) ** 2, 0) / Math.max(1, n - 1));
  });
}

// Pigeonhole (object x issue day) bootstrap of a ratio of medians, as E3:
// cells [{row, col, a, b}] (one sample each). Each resample weights a cell by
// its row's and its column's draw counts; medians are weighted.
export function pigeonholeMedianRatio(cells, statistics) {
  const rows = [...new Set(cells.map((c) => c.row))], cols = [...new Set(cells.map((c) => c.col))];
  const rowIndex = new Map(rows.map((r, i) => [r, i])), colIndex = new Map(cols.map((c, i) => [c, i]));
  const ri = cells.map((c) => rowIndex.get(c.row)), ci = cells.map((c) => colIndex.get(c.col));
  const byA = cells.map((_, i) => i).sort((p, q) => cells[p].a - cells[q].a);
  const byB = cells.map((_, i) => i).sort((p, q) => cells[p].b - cells[q].b);
  const median = (order, key, w) => {
    let total = 0;
    for (const i of order) total += w[i];
    let run = 0;
    for (const i of order) { run += w[i]; if (w[i] && run >= total / 2) return cells[i][key]; }
    return NaN;
  };
  const stat = (w) => median(byA, 'a', w) / median(byB, 'b', w);
  const random = rng(statistics.bootstrapSeed);
  const draws = (n) => { const count = new Float64Array(n); for (let i = 0; i < n; ++i) count[Math.floor(random() * n)] += 1; return count; };
  const values = [];
  for (let b = 0; b < statistics.bootstrapResamples; ++b) {
    const r = draws(rows.length), c = draws(cols.length);
    const v = stat(cells.map((_, i) => r[ri[i]] * c[ci[i]]));
    if (Number.isFinite(v)) values.push(v);
  }
  const alpha = (1 - statistics.confidence) / 2;
  return { estimate: stat(cells.map(() => 1)), lower: quantile(values, alpha), upper: quantile(values, 1 - alpha), resamples: values.length, rows: rows.length, cols: cols.length };
}
