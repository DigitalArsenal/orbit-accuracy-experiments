// E2's statistics on product rows (step 20 output). No orbit computation:
// the errors and covariances are the modules'; this file counts.
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../../harness/provenance.mjs';
import { quantile, rng } from '../../harness/stats.mjs';
import { mahalanobis3 } from './moments.mjs';

export const CHI2_3_95 = 7.814727903251178;

// Chi-square CDF with 3 degrees of freedom.
const erf = (x) => {
  // Abramowitz-Stegun 7.1.26 is too coarse for a CvM statistic; use the
  // series/continued fraction of the regularized gamma function instead.
  return x < 0 ? -erf(-x) : 1 - erfc(x);
};
function erfc(x) {
  // Continued fraction (Lentz) for x > 2, series otherwise.
  if (x < 2) {
    let sum = x, term = x;
    for (let n = 1; n < 200; ++n) { term *= -x * x / n; const add = term / (2 * n + 1); sum += add; if (Math.abs(add) < 1e-17 * Math.abs(sum)) break; }
    return 1 - (2 / Math.sqrt(Math.PI)) * sum;
  }
  let f = x, c = x, d = 0;
  for (let n = 1; n < 300; ++n) {
    const a = n / 2;
    d = x + a * d; d = 1 / d; c = x + a / c; const delta = c * d; f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / (f * Math.sqrt(Math.PI));
}
export const chi2cdf3 = (x) => (x <= 0 ? 0 : erf(Math.sqrt(x / 2)) - Math.sqrt((2 * x) / Math.PI) * Math.exp(-x / 2));

// Rows of one or more step-20 runs.
export function readProducts(runIds) {
  const rows = [];
  for (const id of runIds) {
    const file = path.join(repoRoot, 'runs', id, 'products.jsonl');
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) if (line) rows.push({ ...JSON.parse(line), run: id });
  }
  return rows;
}

// Usable products: fitted, converged, not edited as a maneuver (reduced
// chi-square above the train threshold).
export function usable(rows, threshold = Infinity) {
  return rows.filter((r) => r.horizons && !r.error && r.converged && r.reducedChiSquare <= threshold);
}

// Samples of one method at one horizon: {object, d2, errorM, a, u, error}.
// q: white-acceleration density (m^2/s^3) on each RTN axis; 0 is F2.
export function samples(rows, days, q = 0) {
  const out = [];
  for (const r of rows) {
    const h = r.horizons.find((x) => x.days === days && !x.missing);
    if (!h) continue;
    const p = h.a.map((v, k) => v + q * h.u[k]);
    const d2 = mahalanobis3(h.error, p);
    if (!Number.isFinite(d2)) continue;
    out.push({ object: r.norad, d2, errorM: Math.hypot(...h.error), error: h.error, p });
  }
  return out;
}

// Cramer-von Mises W^2 of the chi-square(3) PIT values.
export function cramerVonMises(d2s) {
  const u = d2s.map(chi2cdf3).sort((a, b) => a - b), n = u.length;
  return 1 / (12 * n) + u.reduce((s, v, i) => s + (v - (2 * i + 1) / (2 * n)) ** 2, 0);
}

// Cluster (object) bootstrap of a statistic over samples.
export function clusterBootstrap(list, statistic, { resamples, seed, confidence }) {
  const objects = [...new Set(list.map((s) => s.object))];
  const by = new Map(objects.map((o) => [o, list.filter((s) => s.object === o)]));
  const random = rng(seed);
  const values = [];
  for (let b = 0; b < resamples; ++b) {
    const draw = [];
    for (let i = 0; i < objects.length; ++i) draw.push(...by.get(objects[Math.floor(random() * objects.length)]));
    const v = statistic(draw);
    if (Number.isFinite(v)) values.push(v);
  }
  const alpha = (1 - confidence) / 2;
  return { estimate: statistic(list), lower: quantile(values, alpha), upper: quantile(values, 1 - alpha), values };
}

// Energy score of N(0, P) for the outcome -e (truth minus forecast mean),
// by m Gaussian draws (Gneiting & Raftery 2007, eq. 22).
export function energyScore(sample, m, random) {
  const c = sample.p;
  const l00 = Math.sqrt(c[0]), l10 = c[3] / l00, l20 = c[6] / l00;
  const l11 = Math.sqrt(c[4] - l10 * l10), l21 = (c[7] - l20 * l10) / l11;
  const l22 = Math.sqrt(c[8] - l20 * l20 - l21 * l21);
  const gauss = () => { const u = 1 - random(), v = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const z = Array.from({ length: m }, () => { const a = gauss(), b = gauss(), g = gauss(); return [l00 * a, l10 * a + l11 * b, l20 * a + l21 * b + l22 * g]; });
  const e = sample.error;
  let first = 0, second = 0;
  for (let i = 0; i < m; ++i) {
    first += Math.hypot(z[i][0] + e[0], z[i][1] + e[1], z[i][2] + e[2]);
    for (let j = i + 1; j < m; ++j) second += Math.hypot(z[i][0] - z[j][0], z[i][1] - z[j][1], z[i][2] - z[j][2]);
  }
  return first / m - second / (m * m);
}

// H1 statistics for a list of samples.
export function realism(list, acceptance, statistics) {
  const n = list.length;
  if (!n) return { n: 0 };
  const meanRatio = (xs) => xs.reduce((a, s) => a + s.d2, 0) / xs.length / 3;
  const coverage = (xs) => xs.filter((s) => s.d2 <= CHI2_3_95).length / xs.length;
  const pitMean = (xs) => xs.reduce((a, s) => a + chi2cdf3(s.d2), 0) / xs.length;
  const opts = { resamples: statistics.bootstrapResamples, seed: statistics.bootstrapSeed, confidence: statistics.confidence };
  const ratio = clusterBootstrap(list, meanRatio, opts);
  const cover = clusterBootstrap(list, coverage, opts);
  // Design effect of the object clusters on the PIT mean (variance under the
  // cluster bootstrap over the iid variance 1/(12 n)); the CvM critical
  // value is scaled by it (PLAN.md section 5).
  const pit = clusterBootstrap(list, pitMean, opts);
  const m = pit.values.reduce((a, v) => a + v, 0) / pit.values.length;
  const variance = pit.values.reduce((a, v) => a + (v - m) ** 2, 0) / (pit.values.length - 1);
  const designEffect = Math.max(1, variance / (1 / (12 * n)));
  const w2 = cramerVonMises(list.map((s) => s.d2));
  const critical = acceptance.cvmCritical5 * designEffect;
  const pass = {
    meanRatio: ratio.estimate >= acceptance.meanRatio[0] && ratio.estimate <= acceptance.meanRatio[1],
    coverage95: cover.estimate >= acceptance.coverage95[0] && cover.estimate <= acceptance.coverage95[1],
    cvm: w2 <= critical,
  };
  const drop = ({ values, ...rest }) => { void values; return rest; };
  return {
    n, objects: new Set(list.map((s) => s.object)).size,
    rms3dM: Math.sqrt(list.reduce((a, s) => a + s.errorM ** 2, 0) / n),
    median3dM: quantile(list.map((s) => s.errorM), 0.5),
    meanD2Over3: drop(ratio), coverage95: drop(cover), cvm: { w2, designEffect, critical },
    scaleFactorForConsistency: Math.sqrt(ratio.estimate),
    pass, consistent: pass.meanRatio && pass.coverage95 && pass.cvm,
  };
}

// F4: the density q per regime and span that brings mean d^2 / 3 closest to
// 1 at the fit horizons (least squares in the ratio, golden section in log q;
// q = 0 when no noise brings it closer).
export function fitDensity(rows, horizons) {
  const objective = (q) => horizons.reduce((a, d) => {
    const s = samples(rows, d, q);
    return a + (s.reduce((x, y) => x + y.d2, 0) / s.length / 3 - 1) ** 2;
  }, 0);
  let lo = Math.log(1e-16), hi = Math.log(1e-6);
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo), f1 = objective(Math.exp(x1)), f2 = objective(Math.exp(x2));
  for (let i = 0; i < 80; ++i) {
    if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - g * (hi - lo); f1 = objective(Math.exp(x1)); }
    else { lo = x1; x1 = x2; f1 = f2; x2 = lo + g * (hi - lo); f2 = objective(Math.exp(x2)); }
  }
  const q = Math.exp((lo + hi) / 2);
  const f0 = objective(0), fq = objective(q);
  return fq < f0 ? { q, objective: fq, objectiveWithoutNoise: f0 } : { q: 0, objective: f0, objectiveWithoutNoise: f0 };
}

// Metrics of catalog-history covariance variants on per-sample RTN errors
// (km, from analysis/gp-error-model) under one 3x3 covariance (km^2):
// mean d^2 (target 3) with an object-cluster bootstrap interval, 95 %
// coverage (d^2 <= 7.815), the Kolmogorov-Smirnov distance of d^2 to
// chi-square(3), the standard deviation of each axis's normalized error,
// and the mean Gaussian log score (negative log density, errors in m).
export function tleMetrics(rows, covarianceKm2, statistics) {
  const n = rows.length;
  if (!n) return { n: 0 };
  const d2s = rows.map((r) => ({ object: r.object, d2: mahalanobis3(r.e, covarianceKm2) }));
  const c = covarianceKm2.map((v) => v * 1e6);
  const det = c[0] * (c[4] * c[8] - c[5] * c[7]) - c[1] * (c[3] * c[8] - c[5] * c[6]) + c[2] * (c[3] * c[7] - c[4] * c[6]);
  const logScore = d2s.reduce((a, x) => a + 0.5 * (x.d2 + Math.log(det) + 3 * Math.log(2 * Math.PI)), 0) / n;
  const sorted = d2s.map((x) => chi2cdf3(x.d2)).sort((a, b) => a - b);
  const ks = sorted.reduce((a, u, i) => Math.max(a, Math.abs(u - i / n), Math.abs(u - (i + 1) / n)), 0);
  const axisNormStd = [0, 1, 2].map((k) => {
    const z = rows.map((r) => r.e[k] / Math.sqrt(covarianceKm2[k * 4]));
    const m = z.reduce((a, v) => a + v, 0) / n;
    return Math.sqrt(z.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, n - 1));
  });
  const meanD2 = d2s.reduce((a, x) => a + x.d2, 0) / n;
  const out = { n, objects: new Set(rows.map((r) => r.object)).size, meanD2, coverage95: d2s.filter((x) => x.d2 <= CHI2_3_95).length / n, ks, axisNormStd, logScore };
  if (statistics) {
    const ci = clusterBootstrap(d2s, (xs) => xs.reduce((a, x) => a + x.d2, 0) / xs.length, { resamples: statistics.bootstrapResamples, seed: statistics.bootstrapSeed, confidence: statistics.confidence });
    out.meanD2Ci = [ci.lower, ci.upper];
  }
  return out;
}
