#!/usr/bin/env node
// E1 step 20 (PLAN.md §4–5, §9 step 3): fit M3a–c on the train window,
// choose M3* and its hyperparameters on the validation window, fit M4 and
// the conformal radius, and fit the G2 and G3 variants of M3*. Reads train
// and validation only; writes model.json (aggregates: coefficients,
// per-satellite effects, scales) and metrics.json.
//
//   node experiments/e1-gps-epoch/steps/20-fit.mjs [--modules DIR] [--archive DIR] [--reference DIR]
//     [--train-to DAY] [--validation-to DAY] [--workers N]   (smoke runs only)
import zlib from 'node:zlib';
import { loadModule } from '../../../harness/modules.mjs';
import { ReferenceIndex } from '../../../harness/reference.mjs';
import { startRun } from '../../../harness/provenance.mjs';
import { median, quantile } from '../../../harness/stats.mjs';
import { cli, config, configPath, readWindow } from '../common.mjs';
import { geometry } from '../geometry.mjs';
import { designs, scalesOf, varianceCovariates } from '../features.mjs';
import { fitCrps, fitReml, fitRidge, sigmaOf, standardize, standardizer } from '../models.mjs';
import { assignPlanes, correctionSeconds, launchYear, planeOf, shiftAlongTrack } from '../methods.mjs';
import { clipMask, pair, rmsOf } from '../inference.mjs';
import { scoreParallel } from '../parallel.mjs';

const { values, modules, archive, reference: referenceDir } = cli({
  'train-to': { type: 'string' }, 'validation-to': { type: 'string' }, workers: { type: 'string' },
});
const run = startRun({ experiment: config.experiment, step: '20-fit', configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const fitConfig = config.fit;
const workers = values.workers ? Number(values.workers) : undefined;

const products = config.inputs.referenceProducts, system = config.inputs.referenceSystem;
const reference = new ReferenceIndex(referenceDir, products, { system });
const objects = new Set(reference.objects());
run.addInputs('referenceProducts', Object.fromEntries(reference.products.map((p) => [p.product, p])));
const score = async (sets, ages) => {
  const r = await scoreParallel({ modules, referenceDir, referenceProducts: products, referenceSystem: system, sets, scoring: config.scoring, ages, workers });
  run.addInputs('reference', r.read);
  run.addModule(r.provenance);
  return r;
};

const range = (name, to) => [config.windows[name][0], to ?? config.windows[name][1]];
const train = readWindow(archive, 'train', objects, range('train', values['train-to']));
const validation = readWindow(archive, 'validation', objects, range('validation', values['validation-to']));
run.addInputs('gpHistory', { ...train.files, ...validation.files });
log(`train: ${train.sets.length} sets, ${new Set(train.sets.map((s) => s.norad)).size} satellites; validation: ${validation.sets.length} sets`);

// ── Covariates (modules) ──
const frames = await loadModule(modules, 'foundation/frames');
const epochState = await loadModule(modules, 'analysis/epoch-state');
run.addModule(frames.provenance);
run.addModule(epochState.provenance);
const geometryOf = new Map();
for (const sets of [train.sets, validation.sets]) {
  const g = await geometry(frames, epochState, sets);
  sets.forEach((s, i) => geometryOf.set(s.gpId, g[i]));
}
const scales = scalesOf(train.sets.map((s) => geometryOf.get(s.gpId)));
log('geometry done');

// ── M0 on train at age 0, the clip, and the targets ──
const m0Train = await score(train.sets, [0]);
const trainClip = clipMask(m0Train.samples, config.primaryClip);
const kept0 = trainClip.mask.get(0);
const trainRows = m0Train.samples.filter((s) => s.ageDays === 0 && kept0.has(s.gpId));
log(`M0 train age 0: ${m0Train.samples.length} samples, ${trainRows.length} inside the clip`);

// Along-track sensitivity ∂T/∂Δt, measured by the module: every
// sensitivityEvery-th clipped train set, shifted by sensitivityStepSeconds.
const probe = trainRows.filter((_, i) => i % fitConfig.sensitivityEvery === 0);
const bySet = new Map(train.sets.map((s) => [s.gpId, s]));
const shifted = await score(probe.map((s) => shiftAlongTrack(bySet.get(s.gpId), fitConfig.sensitivityStepSeconds)), [0]);
const shiftedOf = new Map(shifted.samples.map((s) => [s.gpId, s]));
const slopes = probe.filter((s) => shiftedOf.has(s.gpId)).map((s) => (shiftedOf.get(s.gpId).error[1] - s.error[1]) / fitConfig.sensitivityStepSeconds);
const slope = median(slopes);
const sensitivity = { n: slopes.length, medianKmPerS: slope, minKmPerS: Math.min(...slopes), maxKmPerS: Math.max(...slopes), stepSeconds: fitConfig.sensitivityStepSeconds };
log(`along-track sensitivity ${slope.toFixed(5)} km/s (${Math.min(...slopes).toFixed(5)}..${Math.max(...slopes).toFixed(5)}, n=${slopes.length})`);
// Target: the along-track error in seconds of flight.
const target = (s) => s.error[1] / slope;

// ── Candidates on train ──
function fitCandidate(spec, rows) {
  const design = rows.map((s) => designs[spec.method](geometryOf.get(s.gpId), scales, spec.order));
  const std = standardizer(design);
  const X = design.map((r) => standardize(std, r));
  const y = rows.map(target);
  const groups = rows.map((s) => s.norad);
  const fit = spec.method === 'M3a' ? fitRidge(X, y, { groups, lambda: spec.lambda })
    : spec.method === 'M3b' ? fitRidge(X, y, { lambda: spec.lambda })
      : fitReml(X, y, groups, { lambda: spec.lambda });
  return { ...spec, scales, standardizer: std, fit, trainRows: rows.length };
}
const specs = [];
for (const lambda of fitConfig.ridge) {
  specs.push({ method: 'M3a', lambda }, { method: 'M3b', lambda });
  for (let order = 1; order <= fitConfig.maxHarmonicOrder; ++order) specs.push({ method: 'M3c', order, lambda });
}
const candidates = specs.map((spec) => ({ id: `${spec.method}${spec.order ? `-K${spec.order}` : ''}-ridge${spec.lambda}`, ...fitCandidate(spec, trainRows) }));
log(`${candidates.length} candidates fitted`);

// ── Validation: M0 at the gate ages, and every candidate at age 0 ──
const gateAges = config.acceptance.h3.agesDays.map(([lo]) => lo);
const m0Val = await score(validation.sets, gateAges);
const valClip = clipMask(m0Val.samples, config.primaryClip);
const corrected = (sets, candidate, fit) => sets.map((s) => shiftAlongTrack(s, correctionSeconds(candidate, geometryOf.get(s.gpId), s.norad, fit)));
const selection = [];
for (const c of candidates) {
  const r = await score(corrected(validation.sets, c), [0]);
  const rows = pair({ M0: m0Val.samples, M: r.samples }, 0, valClip.mask.get(0));
  selection.push({ id: c.id, method: c.method, order: c.order ?? null, lambda: c.lambda, n: rows.length, rms3dKm: rmsOf(rows, 'M'), rmsM0Km: rmsOf(rows, 'M0'), reduction: 1 - rmsOf(rows, 'M') / rmsOf(rows, 'M0') });
  log(`validation ${c.id}: RMS 3D ${rmsOf(rows, 'M').toFixed(4)} km vs M0 ${rmsOf(rows, 'M0').toFixed(4)} km (n=${rows.length})`);
}
const best = (method) => selection.filter((s) => !method || s.method === method).reduce((a, b) => (b.rms3dKm < a.rms3dKm ? b : a));
const chosen = candidates.find((c) => c.id === best().id);
const perVariant = Object.fromEntries(['M3a', 'M3b', 'M3c'].map((m) => [m, candidates.find((c) => c.id === best(m).id)]));
log(`M3* = ${chosen.id}`);

// ── M4: variance of the corrected product, fitted on the first validation
// part, conformal radius from the second (amendment 3) ──
const split = config.fit.m4Split;
const first = validation.sets.filter((s) => s.epoch.slice(0, 10) <= split);
const second = validation.sets.filter((s) => s.epoch.slice(0, 10) > split);
const m3First = await score(corrected(first, chosen), gateAges);
const m4 = {};
for (const age of gateAges) {
  const kept = valClip.mask.get(age);
  const rows = m3First.samples.filter((s) => s.ageDays === age && kept.has(s.gpId));
  const z = rows.map((s) => varianceCovariates(geometryOf.get(s.gpId), scales));
  m4[age] = { n: rows.length, axes: ['R', 'T', 'N'].map((axis, k) => ({ axis, ...fitCrps(z, rows.map((s) => s.error[k])) })) };
  log(`M4 age ${age}: n=${rows.length}, σ at mean covariates ${m4[age].axes.map((a) => Math.exp(a.w[0]).toFixed(4)).join('/')} km`);
}
const covarianceOf = (set) => Object.fromEntries(gateAges.map((age) => {
  const z = varianceCovariates(geometryOf.get(set.gpId), scales);
  return [age, m4[age].axes.map((a) => sigmaOf(a, z) ** 2)];
}));
const secondWithCov = corrected(second, chosen).map((s) => ({ ...s, covariance: covarianceOf(s) }));
const m3Second = await score(secondWithCov, gateAges);
const coverage = config.acceptance.conformalLevel;
const conformal = {}, validationGate = {};
for (const age of gateAges) {
  const list = m3Second.samples.filter((s) => s.ageDays === age);
  const d2 = list.map((s) => s.coverage.d2).sort((a, b) => a - b);
  const k = Math.min(d2.length, Math.ceil((d2.length + 1) * coverage));
  conformal[age] = { n: d2.length, level: coverage, radius2: d2[k - 1], radius: Math.sqrt(d2[k - 1]) };
  validationGate[age] = { n: list.length, objects: new Set(list.map((s) => s.norad)).size, inside: [0, 1, 2].map((j) => list.filter((s) => s.coverage.inside[j]).length / list.length) };
}
log(`conformal radii ${gateAges.map((a) => conformal[a].radius.toFixed(3)).join('/')}`);

// ── G2 and G3 fits of M3*'s specification on train subsets ──
const planes = assignPlanes(train.sets, config.tiers.planes, fitConfig.planeAssignWithinDays);
const planeCount = config.tiers.planes.count;
const trainPlane = new Map([...new Set(train.sets.map((s) => s.norad))].map((n) => [n, planeOf(planes, n, train.sets)]));
const spec = { method: chosen.method, order: chosen.order, lambda: chosen.lambda };
const g2 = [...Array(planeCount).keys()].map((p) => {
  const rows = trainRows.filter((s) => trainPlane.get(s.norad) !== p);
  return { heldOutPlane: p, ...fitCandidate(spec, rows) };
});
const objectIdOf = new Map(train.sets.map((s) => [s.norad, s.objectId]));
const old = (norad) => launchYear({ objectId: objectIdOf.get(norad) }) < config.tiers.unseenGenerationFromLaunchYear;
const g3 = fitCandidate(spec, trainRows.filter((s) => old(s.norad)));

// ── Write ──
const strip = (c) => ({ id: c.id, method: c.method, order: c.order ?? null, lambda: c.lambda, scales: c.scales, standardizer: c.standardizer, fit: c.fit, trainRows: c.trainRows });
const model = {
  experiment: config.experiment, run: run.id,
  targetUnits: 'seconds of flight; correction = −prediction',
  sensitivity,
  chosen: chosen.id,
  g1: Object.fromEntries(Object.entries(perVariant).map(([m, c]) => [m, strip(c)])),
  g2: g2.map((c) => ({ heldOutPlane: c.heldOutPlane, ...strip({ ...c, id: `${chosen.id}-without-plane-${c.heldOutPlane}` }) })),
  g3: strip({ ...g3, id: `${chosen.id}-pre-${config.tiers.unseenGenerationFromLaunchYear}` }),
  planes: { ...planes, trainAssignment: Object.fromEntries(trainPlane) },
  m4: { split, covariates: 'Moon and Sun anomaly pairs (features.mjs varianceCovariates)', byAge: m4 },
  conformal,
};
run.write('model.json', model);
const samples = [...m0Train.samples.map((s) => ({ ...s, method: 'M0', window: 'train' })), ...m0Val.samples.map((s) => ({ ...s, method: 'M0', window: 'validation' }))];
run.write('samples.jsonl.gz', zlib.gzipSync(samples.map((s) => JSON.stringify(s)).join('\n')));
run.write('metrics.json', {
  step: '20-fit',
  windows: { train: range('train', values['train-to']), validation: range('validation', values['validation-to']) },
  counts: { trainSets: train.sets.length, validationSets: validation.sets.length, m0Train: m0Train.counts, m0Validation: m0Val.counts },
  clip: { train: trainClip.detail, validation: valClip.detail },
  sensitivity,
  selection,
  chosen: chosen.id,
  perVariant: Object.fromEntries(Object.entries(perVariant).map(([m, c]) => [m, c.id])),
  m4: Object.fromEntries(Object.entries(m4).map(([a, v]) => [a, { n: v.n, axes: v.axes.map((x) => ({ axis: x.axis, w: x.w, meanCrpsKm: x.meanCrps, iterations: x.iterations })) }])),
  conformal,
  validationGate,
  planes: { counts: [...Array(planeCount).keys()].map((p) => [...trainPlane.values()].filter((v) => v === p).length) },
  g3TrainSatellites: [...new Set(trainRows.map((s) => s.norad))].filter(old).length,
  medianAbsTargetSeconds: median(trainRows.map((s) => Math.abs(target(s)))),
  targetQuantilesSeconds: [0.05, 0.5, 0.95].map((q) => quantile(trainRows.map(target), q)),
});
run.finish();
await frames.destroy();
await epochState.destroy();
log('done');
