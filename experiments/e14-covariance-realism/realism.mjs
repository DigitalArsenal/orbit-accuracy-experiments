// E14's cell statistics (PLAN.md section 3) on module outputs: d^2 and per-axis z come from analysis/gp-error-model
// (pair_statistics, or calibrate_covariance and the errors); here only sums, quantiles and bootstrap intervals.
// E2's estimators via E2b (clusterBootstrapSums, the CvM statistic with the design effect, the energy score).
import { quantile, rng } from '../../harness/stats.mjs';
import { clusterBootstrapSums, scoreSample, CHI2_3_95, chi2cdf3 } from '../e2b-correlated-covariance/stats.mjs';
import { cramerVonMises } from '../e2-catalog-covariance/score.mjs';
import { config } from './windows.mjs';
import { json } from '../../harness/modules.mjs';

export { CHI2_3_95 };
const R = config.realism;
const drop = ({ values, ...rest }) => { void values; return rest; };

// samples: [{object, d2, z?: [3], errorM?: [3] (RTN, m), covarianceM2?: [6] (lower 3x3, m^2)}].
// Returns the cell's statistics and decision: INSUFFICIENT, REALISTIC, or NOT REALISTIC (overconfident | pessimistic).
export function cell(samples, { energy = false, seed = R.bootstrapSeed } = {}) {
  const usable = samples.filter((s) => Number.isFinite(s.d2));
  const n = usable.length;
  const objects = new Set(usable.map((s) => s.object)).size;
  const out = { n, objects, notPositiveDefinite: samples.length - n };
  if (!n) return { ...out, decision: 'INSUFFICIENT' };
  const opts = { resamples: R.bootstrapResamples, seed, confidence: R.confidence };
  const items = usable.map((s) => ({ object: s.object, v: [1, s.d2, s.d2 <= R.chi2Quantile95 ? 1 : 0, chi2cdf3(s.d2)] }));
  const mean = clusterBootstrapSums(items, (a) => a[1] / a[0] / 3, opts);
  const cover = clusterBootstrapSums(items, (a) => a[2] / a[0], opts);
  const pit = clusterBootstrapSums(items, (a) => a[3] / a[0], opts);
  const pm = pit.values.reduce((a, v) => a + v, 0) / Math.max(1, pit.values.length);
  const pvar = pit.values.reduce((a, v) => a + (v - pm) ** 2, 0) / Math.max(1, pit.values.length - 1);
  const designEffect = Math.max(1, pvar / (1 / (12 * n)));
  const w2 = cramerVonMises(usable.map((s) => s.d2));
  Object.assign(out, {
    meanD2Over3: drop(mean), coverage95: drop(cover),
    medianD2: quantile(usable.map((s) => s.d2), 0.5),
    cvm: { w2, designEffect, critical: R.cvmCritical5 * designEffect, pass: w2 <= R.cvmCritical5 * designEffect },
  });
  const zs = usable.filter((s) => s.z && s.z.every(Number.isFinite));
  if (zs.length) out.z = [0, 1, 2].map((k) => ({ mean: zs.reduce((a, s) => a + s.z[k], 0) / zs.length, rms: Math.sqrt(zs.reduce((a, s) => a + s.z[k] ** 2, 0) / zs.length) }));
  const sig = usable.filter((s) => s.covarianceM2);
  if (sig.length) out.medianSigmaM = [0, 2, 5].map((k) => quantile(sig.map((s) => Math.sqrt(s.covarianceM2[k])), 0.5));
  if (energy && sig.length) {
    const random = rng(seed);
    const scores = sig.filter((s) => s.errorM).map((s) => scoreSample(s.errorM.map((x) => x / 1e3), s.covarianceM2.map((x) => x / 1e6), { m: R.energyDraws, random }))
      .filter(Boolean);
    out.energyScoreM = scores.reduce((a, s) => a + s.energy, 0) / Math.max(1, scores.length);
    out.logScore = scores.reduce((a, s) => a + s.logScore, 0) / Math.max(1, scores.length);
  }
  const testable = n >= R.minimumSamples && objects >= R.minimumObjects;
  const m = mean.estimate, c = cover.estimate;
  out.decision = !testable ? 'INSUFFICIENT'
    : m >= R.meanD2Over3[0] && m <= R.meanD2Over3[1] && c >= R.coverage95[0] && c <= R.coverage95[1] ? 'REALISTIC'
      : m > R.meanD2Over3[1] ? 'NOT REALISTIC (overconfident)' : m < R.meanD2Over3[0] ? 'NOT REALISTIC (pessimistic)' : 'NOT REALISTIC (coverage)';
  return out;
}

// A regime x horizon table: rows [{regime, horizon, ...sample}] -> {regime: {horizon: cell}}.
export function table(rows, options = {}) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.regime}|${r.horizon}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = {};
  for (const [key, list] of groups) {
    const [regime, horizon] = key.split('|');
    (out[regime] ??= {})[horizon] = cell(list, options);
  }
  return out;
}

// Counts of decisions over a table's cells.
export function tally(t) {
  const c = { cells: 0, testable: 0, realistic: 0 };
  for (const byH of Object.values(t)) for (const x of Object.values(byH)) {
    ++c.cells;
    if (x.decision !== 'INSUFFICIENT') ++c.testable;
    if (x.decision === 'REALISTIC') ++c.realistic;
  }
  return c;
}

// Probability of collision effect (PLAN.md section 8, descriptive): per cell, `pairs` pairs of samples of different
// objects, each with its own covariance, through analysis/gp-error-model screening_cases (E2b's rules: head-on and
// 90-degree crossing planes, synthetic true misses). Returns {regime: {horizon: summary}} for the cells of `rows`
// ([{object, regime, horizon, errorM (RTN m), covarianceM2 (lower 6, m^2)}]).
export async function pcEffect(gp, rows, { pairs = config.screening.pairs, seed = config.screening.seed } = {}) {
  const S = config.screening;
  const groups = new Map();
  for (const r of rows.filter((x) => x.errorM && x.covarianceM2 && Number.isFinite(x.d2))) {
    const key = `${r.regime}|${r.horizon}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = {};
  for (const [key, list] of [...groups].sort()) {
    const [regime, horizon] = key.split('|');
    if (new Set(list.map((x) => x.object)).size < 2) continue;
    const random = rng(seed ^ [...key].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7));
    const drawn = [];
    for (let tries = 0; drawn.length < pairs && tries < pairs * 20; ++tries) {
      const a = list[Math.floor(random() * list.length)], b = list[Math.floor(random() * list.length)];
      if (a.object !== b.object) drawn.push([a, b]);
    }
    const km = (e) => e.map((x) => x / 1e3), km2 = (c) => c.map((x) => x / 1e6);
    const r = await gp.invoke('screening_cases', [json('cases', { pairs: drawn.map(([a, b]) => ({ e1: km(a.errorM), c1: km2(a.covarianceM2), e2: km(b.errorM), c2: km2(b.covarianceM2) })) }),
      json('options', { hardBodyRadiusM: S.hardBodyRadiusM, pcThreshold: S.pcThreshold, missDistancesM: S.missDistancesM, directions: S.directions })]);
    const report = JSON.parse(Buffer.from(r.outputs[0].payload).toString('utf8'));
    const pick = (list2) => {
      const byMiss = Object.fromEntries(list2.map((x) => [x.missM, x]));
      const hit = list2.filter((x) => x.collision), cases = hit.reduce((a, x) => a + x.cases, 0);
      return { pcAlertRateCollisions: hit.reduce((a, x) => a + x.pcAlertRate * x.cases, 0) / cases, meanPcZeroMiss: byMiss[0]?.meanPc,
        pcAlertRate100m: byMiss[100]?.pcAlertRate, pcAlertRate1km: byMiss[1000]?.pcAlertRate, pcAlertRate5km: byMiss[5000]?.pcAlertRate,
        brierCollisions: hit.reduce((a, x) => a + x.brier * x.cases, 0) / cases };
    };
    (out[regime] ??= {})[horizon] = { pairs: drawn.length, ...Object.fromEntries(Object.entries(report.summary).map(([g, l]) => [g, pick(l)])) };
  }
  return out;
}
