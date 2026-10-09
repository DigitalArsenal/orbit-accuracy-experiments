#!/usr/bin/env node
// E2 step 15: catalog-history (TLE) covariance variants (PLAN.md section 4,
// "C variants"), every orbit computation in analysis/gp-error-model.
//
// Models (train): the covariance of older element sets propagated by SGP4
// to newer sets' epochs, in the newer set's RTN axes, by regime and
// separation dt (`accumulate` without reference states):
//   C2a       binned at tau +- 0.5 d (tau = 0: 0-0.5 d), about the mean (Osweiler 2006 bins);
//   C2a-quad  per-axis sigma^2(tau) = a + b tau + c tau^2 fitted to 0.5-d bins (after Huo, Li & Han 2016);
//   C2b       C2a minus half the covariance of the pairs under 0.5 d (the reference set's own error);
//   C2c       C2a after mean-motion jump editing and a 3-robust-sigma clip;
//   C4        C2a pooled by orbit class (for GPS one class: identical to C2a);
//   C5        C2a times k(tau)^2, k fitted on train against precise orbits so mean d^2 = 3.
// Scoring (any window): every element set propagated by SGP4 to the first
// precise-orbit epoch within 4 minutes after epoch + tau, its RTN error per
// sample (`accumulate` with reference states, one sample per bin), tested
// against each variant's covariance at tau.
//
//   node .../15-tle-covariance.mjs --window train
//   node .../15-tle-covariance.mjs --window validation --models results/e2/train/tle-models.json
import fs from 'node:fs';
import path from 'node:path';
import { json, loadModule, sha256 } from '../../../harness/modules.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { startRun } from '../../../harness/provenance.mjs';
import { epochMs } from '../../../harness/gp-archive.mjs';
import { median } from '../../../harness/stats.mjs';
import { scoreSets } from '../../e1-gps-epoch/score.mjs';
import { DAY_MS, cli, config, configPath, regimeObjects, regimeReference, windowSets } from '../common.mjs';
import { lowerToFull, symmetricEigenvalues } from '../moments.mjs';
import { tleMetrics } from '../score.mjs';

const { values, window, modules, archive, reference: referenceDir, objects: only } = cli({ models: { type: 'string' } });
const run = startRun({ experiment: config.experiment, step: `15-tle-covariance-${window.name}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const gp = await loadModule(modules, 'analysis/gp-error-model');
run.addModule(gp.provenance);
const V = config.tleVariants;
const lo = Date.parse(`${window.from}T00:00:00Z`), hi = Date.parse(`${window.to}T00:00:00Z`) + DAY_MS;
const pos3 = (lower) => { const f = lowerToFull(lower); return [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => f[i * 6 + j])); };

async function accumulate(groups, options) {
  let acc = null;
  for (const sets of groups) {
    if (sets.length < 2) continue;
    const inputs = [ommFrame(sets), json('options', options)];
    if (acc) inputs.push(json('prior', acc));
    acc = await gp.invokeJson('accumulate', inputs, 'accumulator');
  }
  return gp.invokeJson('finalize', [json('accumulator', acc)], 'model');
}

// Splits an object's sets at mean-motion jumps (robust z above the edit
// threshold), so no consecutive pair spans a maneuver.
function segments(list) {
  const dn = list.slice(1).map((s, i) => s.elements.MEAN_MOTION - list[i].elements.MEAN_MOTION);
  if (dn.length < 3) return [list];
  const m = median(dn), mad = median(dn.map((x) => Math.abs(x - m))) * 1.4826 || 1e-12;
  const out = [];
  let start = 0;
  dn.forEach((x, i) => { if (Math.abs(x - m) / mad > V.maneuverRobustZ) { out.push(list.slice(start, i + 1)); start = i + 1; } });
  out.push(list.slice(start));
  return out;
}

const metrics = { window, regimes: {} };
const modelsOut = { window: { name: window.name, from: window.from, to: window.to }, regimes: {} };
const trained = values.models ? JSON.parse(fs.readFileSync(path.resolve(values.models), 'utf8')) : null;
if (values.models) run.addInputs('tleModels', { [path.basename(values.models)]: sha256(fs.readFileSync(path.resolve(values.models))) });
if (!trained && window.name !== 'train' && window.name !== 'dev') throw new Error('--models (the train window tle-models.json) is required outside train');

for (const [name, regime] of Object.entries(config.regimes)) {
  const reference = regimeReference(referenceDir, regime);
  const objects = new Set([...regimeObjects(referenceDir, regime)].filter((n) => !only || only.has(n)));
  const { sets, files } = windowSets(archive, window, objects);
  run.addInputs('gpHistory', files);
  const inWindow = sets.filter((s) => { const t = epochMs(s.epoch); return t >= lo && t < hi; });
  const byObject = [...objects].map((n) => inWindow.filter((s) => s.norad === n).sort((a, b) => epochMs(a.epoch) - epochMs(b.epoch)));
  log(`${name}: ${objects.size} objects, ${inWindow.length} element sets`);

  let models = trained?.regimes?.[name];
  if (!models) {
    const taus = V.tausDays;
    const tauBins = taus.map((t) => [Math.max(0, t - V.binHalfWidthDays), t + V.binHalfWidthDays]);
    const fineBins = Array.from({ length: Math.round(V.fineMaxDays / V.fineStepDays) }, (_, k) => [k * V.fineStepDays, (k + 1) * V.fineStepDays]);
    const binned = await accumulate(byObject, { ageBinsDays: tauBins });
    const fine = await accumulate(byObject, { ageBinsDays: fineBins });
    const edited = byObject.flatMap(segments);
    const firstPass = await accumulate(edited, { ageBinsDays: tauBins });
    const regimeIndex = firstPass.regimes.findIndex((r) => r.id === regime.gpRegime);
    const clip = { k: V.clipRobustSigma, strata: firstPass.strata.filter((s) => s.regime === regime.gpRegime).map((s) => ({
      regime: regimeIndex, age: s.ageIndex, centre: s.median.slice(0, 3), scale: s.robustSigma.slice(0, 3) })) };
    const robust = await accumulate(edited, { ageBinsDays: tauBins, clip });
    const mine = (m) => m.strata.filter((s) => s.regime === regime.gpRegime);
    const b = mine(binned), f = mine(fine), r = mine(robust);
    const at = (list, k) => list.find((s) => s.ageIndex === k);
    // Quadratic per-axis fit of the fine-bin variances (least squares, 3x3 normal equations).
    const quad = [0, 1, 2].map((axis) => {
      const pts = f.filter((s) => s.n >= V.minimumPairs).map((s) => [(s.ageDays[0] + s.ageDays[1]) / 2, pos3(s.covariance)[axis * 4]]);
      const S = (p) => pts.reduce((a, [t, y]) => a + p(t, y), 0);
      const A = [[S(() => 1), S((t) => t), S((t) => t * t)], [S((t) => t), S((t) => t * t), S((t) => t ** 3)], [S((t) => t * t), S((t) => t ** 3), S((t) => t ** 4)]];
      const y = [S((t, v) => v), S((t, v) => t * v), S((t, v) => t * t * v)];
      const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const d = det(A);
      return [0, 1, 2].map((c) => det(A.map((row, i) => row.map((v, j) => (j === c ? y[i] : v)))) / d);
    });
    const reference0 = pos3(at(b, 0).covariance);
    models = { gpRegime: regime.gpRegime, tausDays: taus, variants: {}, counts: {} };
    taus.forEach((tau, k) => {
      const c2a = pos3(at(b, k).covariance);
      const c2b = c2a.map((v, i) => v - reference0[i] / 2);
      const c2c = pos3(at(r, k).clipped?.covariance ?? at(r, k).covariance);
      const c2q = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => (i === j ? quad[i][0] + quad[i][1] * tau + quad[i][2] * tau * tau : 0)));
      for (const [id, c] of [['C2a', c2a], ['C2a-quad', c2q], ['C2b', c2b], ['C2c', c2c], ['C4', c2a]]) {
        (models.variants[id] ??= {})[tau] = { covarianceKm2: c, positiveDefinite: symmetricEigenvalues(c, 3)[0] > 0 };
      }
      models.counts[tau] = { pairs: at(b, k).n, robustPairs: at(r, k).clipped?.n ?? null, editedSegments: edited.length };
    });
    models.quadratic = quad;
  }

  // Scoring: per-sample RTN errors of every set at each tau.
  const scoring = { ageBinsDays: V.tausDays, binWidthDays: V.scoreBinDays, referenceStepSeconds: 0 };
  const started = performance.now();
  const { samples, counts } = await scoreSets(gp, reference, inWindow, scoring, {
    onProgress: (i, n) => process.stderr.write(`\r${i}/${n} sets, ${((performance.now() - started) / 1000).toFixed(0)} s`) });
  process.stderr.write('\n');
  run.addInputs('reference', reference.read);
  reference.dropCache();
  const rows = samples.map((s) => ({ object: s.norad, tau: s.ageDays, e: s.error.slice(0, 3) }));

  // C5: k(tau) from C2a on train samples, mean d^2 = 3.
  if (!models.variants.C5) {
    const base = models.variants.C2a;
    models.variants.C5 = {};
    for (const tau of models.tausDays) {
      const m = tleMetrics(rows.filter((x) => x.tau === tau), base[tau].covarianceKm2);
      const k2 = m.meanD2 / 3;
      models.variants.C5[tau] = { covarianceKm2: base[tau].covarianceKm2.map((v) => v * k2), positiveDefinite: base[tau].positiveDefinite, k: Math.sqrt(k2) };
    }
  }
  modelsOut.regimes[name] = models;
  const variantMetrics = {};
  for (const [id, byTau] of Object.entries(models.variants)) {
    variantMetrics[id] = {};
    for (const tau of models.tausDays) {
      const c = byTau[tau];
      variantMetrics[id][tau] = c.positiveDefinite ? tleMetrics(rows.filter((x) => x.tau === tau), c.covarianceKm2, config.statistics) : { notPositiveDefinite: true };
    }
  }
  metrics.regimes[name] = { objects: objects.size, sets: inWindow.length, scoringCounts: counts, models: { counts: models.counts, quadratic: models.quadratic, k: models.variants.C5 && Object.fromEntries(Object.entries(models.variants.C5).map(([t, v]) => [t, v.k])) }, variants: variantMetrics };
}
run.write('metrics.json', metrics);
run.write('tle-models.json', modelsOut);
run.finish();
for (const [name, r] of Object.entries(metrics.regimes))
  for (const [id, byTau] of Object.entries(r.variants))
    log(`${name} ${id}: ${Object.entries(byTau).map(([t, m]) => `${t} d mean d2/3 ${m.notPositiveDefinite ? 'not PD' : (m.meanD2 / 3).toFixed(2)}`).join('; ')}`);
await gp.destroy();
