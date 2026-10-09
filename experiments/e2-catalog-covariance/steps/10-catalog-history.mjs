#!/usr/bin/env node
// E2 step 10: catalog-history statistics through analysis/gp-error-model.
//   - C1: covariance of consecutive-set differences by regime and age
//     (pseudo-truth: later element sets), and the at-epoch error of the sets
//     against precise orbits (the pseudo-truth error H4 removes);
//   - C0: SGP4 as published against precise orbits, by age (accuracy), and
//     the coverage of the existing GP error model's covariance;
//   - H4: coverage of C1 as estimated (raw) and with the train window's
//     at-epoch error removed, against precise orbits.
// On train it writes the models later steps and windows use (c1.json).
//
//   node experiments/e2-catalog-covariance/steps/10-catalog-history.mjs --window train [--c1 results/e2/train/c1.json]
import fs from 'node:fs';
import path from 'node:path';
import { json, loadModule, sha256 } from '../../../harness/modules.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { epochMs } from '../../../harness/gp-archive.mjs';
import { DAY_MS, cli, config, configPath, regimeObjects, regimeReference, windowSets } from '../common.mjs';
import { addMeanOuter, correctedModel, lowerToFull, positionTrace } from '../moments.mjs';

const { values, window, modules, archive, reference: referenceDir, objects: only } = cli({ c1: { type: 'string' } });
const run = startRun({ experiment: config.experiment, step: '10-catalog-history', configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const gp = await loadModule(modules, 'analysis/gp-error-model');
run.addModule(gp.provenance);
const lo = Date.parse(`${window.from}T00:00:00Z`), hi = Date.parse(`${window.to}T00:00:00Z`) + DAY_MS;
const inWindow = (s) => { const t = epochMs(s.epoch); return t >= lo && t < hi; };

// One accumulator per mode, fed one object at a time (prior = the running total).
// Reference mode (frames given) skips objects without precise orbits in the
// window, so every batch accumulates in one mode.
async function accumulate(perObject, options, model) {
  let acc = null;
  const reference = perObject.some((o) => o.frames.length);
  for (const { sets, frames } of perObject) {
    if (!sets.length || (reference && !frames.length)) continue;
    const inputs = [ommFrame(sets), ...frames, json('options', options)];
    if (model) inputs.push(json('model', model));
    if (acc) inputs.push(json('prior', acc));
    acc = await gp.invokeJson('accumulate', inputs, 'accumulator');
  }
  if (!acc) throw new Error('no element sets');
  return { accumulator: acc, model: await gp.invokeJson('finalize', [json('accumulator', acc)], 'model') };
}

const metrics = { window, regimes: {} };
const c1Out = { window: { name: window.name, from: window.from, to: window.to }, regimes: {} };
const trainC1 = values.c1 ? JSON.parse(fs.readFileSync(path.resolve(values.c1), 'utf8')) : null;
for (const [name, regime] of Object.entries(config.regimes)) {
  const reference = regimeReference(referenceDir, regime);
  const objects = new Set([...regimeObjects(referenceDir, regime)].filter((n) => !only || only.has(n)));
  if (!objects.size) { log(`${name}: no reference objects`); continue; }
  const { sets, files } = windowSets(archive, window, objects);
  run.addInputs('gpHistory', files);
  const byObject = new Map([...objects].map((n) => [n, []]));
  for (const s of sets) if (inWindow(s)) byObject.get(s.norad)?.push(s);
  const horizon = (Math.max(...config.c1.ageBinsDays.flat()) + 1) * DAY_MS;
  const perObject = [...byObject].map(([norad, list]) => ({ norad, sets: list, frames: reference.frames(norad, lo, hi + horizon) }));
  const consecutive = [...byObject].map(([norad, list]) => ({ norad, sets: sets.filter((s) => s.norad === norad && epochMs(s.epoch) >= lo && epochMs(s.epoch) < hi + horizon), frames: [] }));
  log(`${name}: ${objects.size} objects, ${perObject.reduce((a, o) => a + o.sets.length, 0)} element sets in the window`);

  // C1 raw: consecutive differences (later sets are pseudo-truth); the
  // propagated sets are the window's, their later sets may lie past it.
  const gpRegime = (m) => m.strata.filter((s) => s.regime === regime.gpRegime);
  const raw = await accumulate(consecutive.map((o) => ({ ...o, sets: o.sets })), { ageBinsDays: config.c1.ageBinsDays });
  // At-epoch error against precise orbits (every reference epoch within the epoch bin).
  const epoch = await accumulate(perObject, { ageBinsDays: [[0, config.c1.epochBinDays]], referenceStepSeconds: 0 });
  // C0 accuracy by age against precise orbits.
  const truth = await accumulate(perObject, { ageBinsDays: config.c1.ageBinsDays, referenceStepSeconds: 0 });
  run.addInputs('reference', reference.read);

  const regimeMetrics = {
    objects: objects.size,
    c0Accuracy: gpRegime(truth.model).map((s) => ({ ageDays: s.ageDays, n: s.n, rms3dKm: Math.sqrt(positionTrace(addMeanOuter(s))), mean: s.mean.slice(0, 3) })),
    epochError: gpRegime(epoch.model).map((s) => ({ n: s.n, mean: s.mean, secondMoment: lowerToFull(addMeanOuter(s).covariance) })),
    c1Raw: gpRegime(raw.model).map((s) => ({ ageDays: s.ageDays, n: s.n, rmsPositionKm: Math.sqrt(positionTrace(addMeanOuter(s))) })),
  };
  c1Out.regimes[name] = { gpRegime: regime.gpRegime, raw: raw.model, epoch: epoch.model };

  // Coverage tests (reference mode with a model): C0 with the existing GP
  // error model, and H4 with C1 raw and corrected (from train when given).
  const gpModelFile = path.join(modules, 'analysis/gp-error-model/docs/model-2026-08-scaled.json');
  const gpModel = JSON.parse(fs.readFileSync(gpModelFile, 'utf8'));
  run.addInputs('gpErrorModel', { 'model-2026-08-scaled.json': sha256(fs.readFileSync(gpModelFile)) });
  const c0Cov = await accumulate(perObject, { ageBinsDays: gpModel.ageBinsDays, referenceStepSeconds: 0 }, gpModel);
  regimeMetrics.c0Coverage = gpRegime(c0Cov.model).map((s) => ({ ageDays: s.ageDays, n: s.n, coverage: s.coverage }));
  const source = trainC1?.regimes?.[name] ?? c1Out.regimes[name];
  const rawModel = { ...source.raw, strata: source.raw.strata.map((s) => { const m = addMeanOuter(s); const { clipped, ...rest } = m; void clipped; return rest; }) };
  const corrected = correctedModel(source.raw, source.epoch, regime.gpRegime);
  regimeMetrics.h4 = { c1From: trainC1 ? path.relative(repoRoot, path.resolve(values.c1)) : 'this window', correctedPsd: corrected.psd, eigenvalues: corrected.eigenvalues };
  const h4Raw = await accumulate(perObject, { ageBinsDays: config.c1.ageBinsDays, referenceStepSeconds: 0 }, rawModel);
  regimeMetrics.h4.raw = gpRegime(h4Raw.model).map((s) => ({ ageDays: s.ageDays, n: s.n, coverage: s.coverage }));
  if (corrected.psd) {
    const h4Corrected = await accumulate(perObject, { ageBinsDays: config.c1.ageBinsDays, referenceStepSeconds: 0 }, corrected.model);
    regimeMetrics.h4.corrected = gpRegime(h4Corrected.model).map((s) => ({ ageDays: s.ageDays, n: s.n, coverage: s.coverage }));
  }
  metrics.regimes[name] = regimeMetrics;
  reference.dropCache();
}
run.write('metrics.json', metrics);
run.write('c1.json', c1Out);
run.finish();
for (const [name, m] of Object.entries(metrics.regimes)) {
  log(`${name}: C0 RMS 3D by age ${m.c0Accuracy.map((a) => `${a.ageDays[0]}-${a.ageDays[1]} d ${a.rms3dKm.toFixed(3)} km (n ${a.n})`).join('; ')}`);
  log(`${name}: C1 raw RMS position ${m.c1Raw.map((a) => `${a.ageDays[0]}-${a.ageDays[1]} d ${a.rmsPositionKm.toFixed(3)} km`).join('; ')}; corrected PSD ${m.h4.correctedPsd}`);
}
await gp.destroy();
