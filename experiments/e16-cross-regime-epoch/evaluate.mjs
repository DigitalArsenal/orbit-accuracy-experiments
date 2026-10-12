// E16's statistics (PLAN.md 7) on module outputs: Q1's clipped RMS reductions with E1's two-way cluster bootstrap,
// H2's difference of reductions on one joint draw, H6's covariance realism (E14's cell rule), the no-harm rule, the
// variance components behind the LEO-versus-GNSS hypothesis, and Q2's paired median ratios with E7's bootstrap.
// No orbit computation here.
import { bootstrap as cellBootstrap, cells, holm, interval } from '../e1-gps-epoch/inference.mjs';
import { fitReml } from '../e1-gps-epoch/models.mjs';
import { bootstrap as medianBootstrap, ratioOf, medianOf } from '../e7-full-force-handoff/analysis.mjs';
import { config } from './common.mjs';
import { responseOf, designRow } from './q1lib.mjs';
import { standardize, standardizer } from '../e1-gps-epoch/models.mjs';

const S = config.statistics;
const n3sq = (e) => e[0] ** 2 + e[1] ** 2 + e[2] ** 2;
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// Rows {norad, day, a: e3, b: e3} -> R = 1 - RMS(b)/RMS(a) with interval and p (share of draws with R <= 0).
export function reduction(rows, nullValue = 0) {
  if (!rows.length) return null;
  const grid = cells(rows.map((r) => ({ norad: r.norad, day: r.day, r })), { a: (x) => n3sq(x.r.a), b: (x) => n3sq(x.r.b) });
  const draws = cellBootstrap(grid, { R: (sum) => 1 - Math.sqrt(sum('b') / sum('a')) }, { resamples: S.bootstrapResamples, seed: S.bootstrapSeed });
  const rms = (k) => Math.sqrt(rows.reduce((t, r) => t + n3sq(r[k]), 0) / rows.length);
  return { n: rows.length, objects: grid.rows, days: grid.cols, rmsC0Km: rms('a'), rmsKm: rms('b'), R: interval(draws.R, S.confidence, nullValue) };
}

// H2: R(LEO) - R(MEO/GEO) on one joint draw of objects (both groups) and days.
export function reductionDifference(leo, meo) {
  const tag = (rows, g) => rows.map((r) => ({ norad: r.norad, day: r.day, g, r }));
  const grid = cells([...tag(leo, 'L'), ...tag(meo, 'M')], {
    aL: (x) => (x.g === 'L' ? n3sq(x.r.a) : 0), bL: (x) => (x.g === 'L' ? n3sq(x.r.b) : 0),
    aM: (x) => (x.g === 'M' ? n3sq(x.r.a) : 0), bM: (x) => (x.g === 'M' ? n3sq(x.r.b) : 0),
  });
  const draws = cellBootstrap(grid, { D: (sum) => (1 - Math.sqrt(sum('bL') / sum('aL'))) - (1 - Math.sqrt(sum('bM') / sum('aM'))) }, { resamples: S.bootstrapResamples, seed: S.bootstrapSeed });
  return interval(draws.D, S.confidence, 0);
}

// H6: d^2 of 3D position errors under a diagonal RTN covariance (km^2) per class, E14's cell rule with a bootstrap p.
export function realism(rows) {
  // rows: {norad, day, e: e3 (km), sigma2: [3] km^2}
  const r = config.covarianceModel.realism;
  const d2 = rows.map((x) => x.e[0] ** 2 / x.sigma2[0] + x.e[1] ** 2 / x.sigma2[1] + x.e[2] ** 2 / x.sigma2[2]);
  const grid = cells(rows.map((x, i) => ({ norad: x.norad, day: x.day, d2: d2[i] })), { n: () => 1, d2: (x) => x.d2, in95: (x) => (x.d2 <= r.chi2_3_95 ? 1 : 0) });
  const fails = (m, c) => !(m >= r.meanD2Over3[0] && m <= r.meanD2Over3[1] && c >= r.coverage95[0] && c <= r.coverage95[1]);
  const draws = cellBootstrap(grid, { mean: (sum) => sum('d2') / sum('n') / 3, coverage: (sum) => sum('in95') / sum('n') }, { resamples: S.bootstrapResamples, seed: S.bootstrapSeed });
  let failing = 0;
  for (let b = 0; b < draws.mean.draws.length; ++b) if (fails(draws.mean.draws[b], draws.coverage.draws[b])) ++failing;
  const mean = draws.mean.estimate, coverage = draws.coverage.estimate;
  const testable = rows.length >= r.minimumSamples && new Set(rows.map((x) => x.norad)).size >= r.minimumObjects;
  return {
    n: rows.length, objects: new Set(rows.map((x) => x.norad)).size, testable,
    meanD2Over3: interval(draws.mean, S.confidence), coverage95: interval(draws.coverage, S.confidence),
    realistic: testable && !fails(mean, coverage), verdict: !testable ? 'INSUFFICIENT' : !fails(mean, coverage) ? 'REALISTIC' : mean > r.meanD2Over3[1] ? 'NOT REALISTIC (overconfident)' : mean < r.meanD2Over3[0] ? 'NOT REALISTIC (pessimistic)' : 'NOT REALISTIC (coverage)',
    pValue: (1 + failing) / (1 + draws.mean.draws.length),
  };
}

// No-harm (PLAN.md 7): per object with at least `min` samples, clipped RMS ratio M*/C0; harmed above 1 + worseBy.
export function noHarm(rows) {
  const d = config.decisions.noHarm;
  const by = new Map();
  for (const r of rows) { if (!by.has(r.norad)) by.set(r.norad, { a: 0, b: 0, n: 0 }); const o = by.get(r.norad); o.a += n3sq(r.a); o.b += n3sq(r.b); o.n += 1; }
  const objects = [...by].filter(([, o]) => o.n >= d.minimumSamples).map(([norad, o]) => ({ norad, n: o.n, ratio: Math.sqrt(o.b / o.a) }));
  const harmed = objects.filter((o) => o.ratio > 1 + d.worseBy);
  const pass = objects.length >= d.smallTierObjects ? harmed.length <= d.harmedShareAtMost * objects.length : harmed.length <= d.smallTierHarmedAtMost;
  return { objects: objects.length, harmed: harmed.length, harmedObjects: harmed.map((o) => ({ norad: o.norad, ratio: o.ratio, n: o.n })), pass };
}

// The mechanism (descriptive): per regime class, the share of the along-track response's variance that is per-object
// (REML intercept-only), and how much of the within-object variance M*'s shared covariates explain.
export function varianceShares(rows, spec, scales) {
  const y = rows.map(responseOf), groups = rows.map((r) => r.norad);
  const base = fitReml(rows.map(() => []), y, groups);   // intercept only
  let explained = null;
  try {
    const X = rows.map((r) => designRow(spec, r, scales, r.fleet ?? { f: 0, missing: 1 }));
    const s = standardizer(X);
    const full = fitReml(X.map((x) => standardize(s, x)), y, groups);
    explained = { tau2: full.tau2, sigma2: full.sigma2, sigma2Reduction: 1 - full.sigma2 / base.sigma2, tau2Reduction: 1 - full.tau2 / base.tau2 };
  } catch (error) { explained = { error: String(error.message).slice(0, 120) }; }
  return { n: rows.length, objects: new Set(groups).size, perObjectShare: base.tau2 / (base.tau2 + base.sigma2), tau2: base.tau2, sigma2: base.sigma2, withCovariates: explained };
}

// Q2: paired samples of products at a horizon index -> E7's samples {norad, day, errors: [e3 per product]}.
export function pairedQ2(rows, products, k) {
  const out = [];
  for (const r of rows) {
    const es = products.map((p) => r.products[p]?.errors?.[k] ?? null);
    if (es.some((e) => !e)) continue;
    out.push({ norad: r.norad, day: dayOf(r.epochMs), errors: es });
  }
  return out;
}
// The median ratio of product 0 to product 1 with interval, class and p (share of draws with ratio >= 1).
export function medianRatio(samples) {
  if (samples.length < 2) return null;
  const b = medianBootstrap(samples, { ratio: ratioOf(0, 1), num: medianOf(0), den: medianOf(1) }, { resamples: S.bootstrapResamples, seed: S.bootstrapSeed, confidence: S.confidence, keepDraws: true });
  const draws = b.ratio.draws;
  const r = { n: samples.length, objects: new Set(samples.map((s) => s.norad)).size, ratio: b.ratio.estimate, lower: b.ratio.lower, upper: b.ratio.upper,
    medianM: b.num.estimate, comparatorMedianM: b.den.estimate, pGe1: (1 + draws.filter((x) => x >= 1).length) / (1 + draws.length) };
  r.class = r.upper < config.decisions.H4.meaningfulBelow ? 'meaningfully better' : r.upper < 1 ? 'better' : r.lower > 1 ? 'worse' : 'undecided';
  return r;
}

export { holm };
