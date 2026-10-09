#!/usr/bin/env node
// E1 step 30 (PLAN.md §5, §9 step 5): the evaluation. Applies the frozen
// fits of step 20 to the test window, scores M0, M3a–c, M3* in tiers G1–G3
// and M4's covariance through analysis/gp-error-model, and decides H1–H3.
// The test window is read only after the freeze commit (common.mjs). Run on
// the validation window, it is a dry run of the same code.
//
//   node experiments/e1-gps-epoch/steps/30-evaluate.mjs --window test --model results/e1/fit/<run>/model.json
//     [--modules DIR] [--archive DIR] [--reference DIR] [--workers N] [--resamples N]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { loadModule, sha256 } from '../../../harness/modules.mjs';
import { ReferenceIndex } from '../../../harness/reference.mjs';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { median, norm3 } from '../../../harness/stats.mjs';
import { cli, config, configPath, freezeCommit, readWindow } from '../common.mjs';
import { geometry } from '../geometry.mjs';
import { varianceCovariates } from '../features.mjs';
import { crpsNormal, sigmaOf } from '../models.mjs';
import { correctionSeconds, launchYear, planeOf, shiftAlongTrack } from '../methods.mjs';
import { bootstrap, cells, clipMask, gateFromFractions, holm, interval, pair, reduction, rmsOf } from '../inference.mjs';
import { scoreParallel } from '../parallel.mjs';

const { values, window, modules, archive, reference: referenceDir } = cli({ model: { type: 'string' }, workers: { type: 'string' }, resamples: { type: 'string' } });
if (!values.model) throw new Error('--model is required (the committed model.json of step 20)');
const freeze = window.name === 'test' ? freezeCommit() : null;
const run = startRun({ experiment: config.experiment, step: '30-evaluate', configPath, modulesDir: modules, args: values });
run.manifest.freezeCommit = freeze;
const log = (...a) => console.log(`[${run.id}]`, ...a);
const workers = values.workers ? Number(values.workers) : undefined;
const statistics = { ...config.statistics, bootstrapResamples: Number(values.resamples ?? config.statistics.bootstrapResamples) };

const modelBytes = fs.readFileSync(values.model);
run.addInputs('model', { [path.relative(repoRoot, path.resolve(values.model))]: sha256(modelBytes) });
const model = JSON.parse(modelBytes);

const products = config.inputs.referenceProducts, system = config.inputs.referenceSystem;
const reference = new ReferenceIndex(referenceDir, products, { system });
const objects = new Set(reference.objects());
run.addInputs('referenceProducts', Object.fromEntries(reference.products.map((p) => [p.product, p])));
const score = async (name, sets, ages) => {
  const t = performance.now();
  const r = await scoreParallel({ modules, referenceDir, referenceProducts: products, referenceSystem: system, sets, scoring: config.scoring, ages, workers });
  run.addInputs('reference', r.read);
  run.addModule(r.provenance);
  log(`${name}: ${r.counts.samples} samples from ${sets.length} sets in ${((performance.now() - t) / 1000).toFixed(0)} s`);
  return r;
};

const { sets, files } = readWindow(archive, window.name, objects);
run.addInputs('gpHistory', files);
log(`${window.name}: ${sets.length} sets, ${new Set(sets.map((s) => s.norad)).size} satellites`);

// ── Covariates (modules) ──
const frames = await loadModule(modules, 'foundation/frames');
const epochState = await loadModule(modules, 'analysis/epoch-state');
run.addModule(frames.provenance);
run.addModule(epochState.provenance);
const g = await geometry(frames, epochState, sets);
const geometryOf = new Map(sets.map((s, i) => [s.gpId, g[i]]));
await frames.destroy();
await epochState.destroy();

// ── Methods ──
const chosenMethod = model.g1[Object.keys(model.g1).find((m) => model.g1[m].id === model.chosen)].method;
const gateAges = config.acceptance.h3.agesDays.map(([lo]) => lo);
const covarianceOf = (set) => {
  const z = varianceCovariates(geometryOf.get(set.gpId), model.g1[chosenMethod].scales);
  return Object.fromEntries(gateAges.map((age) => [age, model.m4.byAge[age].axes.map((a) => sigmaOf(a, z) ** 2)]));
};
const correct = (s, candidate) => shiftAlongTrack(s, correctionSeconds(candidate, geometryOf.get(s.gpId), s.norad));

const runs = {};
runs.M0 = await score('M0', sets);
for (const m of ['M3a', 'M3b', 'M3c']) {
  const corrected = sets.map((s) => correct(s, model.g1[m]));
  runs[m] = await score(m, m === chosenMethod ? corrected.map((s) => ({ ...s, covariance: covarianceOf(s) })) : corrected);
}
runs['M3*'] = runs[chosenMethod];
const planeOfObject = new Map([...new Set(sets.map((s) => s.norad))].map((n) => [n, planeOf(model.planes, n, sets)]));
const g2Sets = sets.filter((s) => planeOfObject.get(s.norad) !== null).map((s) => correct(s, model.g2[planeOfObject.get(s.norad)]));
runs.G2 = await score('M3* G2', g2Sets);
const g3Sets = sets.filter((s) => launchYear(s) >= config.tiers.unseenGenerationFromLaunchYear).map((s) => correct(s, model.g3));
runs.G3 = await score('M3* G3', g3Sets);

// Per-sample tables stay in runs/.
run.write('samples.jsonl.gz', zlib.gzipSync(Object.entries(runs).filter(([k]) => k !== 'M3*')
  .flatMap(([method, r]) => r.samples.map((s) => JSON.stringify({ method, ...s }))).join('\n')));

// ── The clip (amendment 2) ──
const clip = clipMask(runs.M0.samples, config.primaryClip);
const age0 = config.scoring.primaryAgeDays;
const kept0 = clip.mask.get(age0);
const lyExcluded = new Set(runs.M0.samples.filter((s) => s.ageDays === age0 && norm3(s.error) > 10).map((s) => s.gpId));
const notLy = new Set(runs.M0.samples.filter((s) => s.ageDays === age0 && !lyExcluded.has(s.gpId)).map((s) => s.gpId));

// ── Reductions: primary and sensitivities ──
const reductions = (method, nullValue) => ({
  primary: reduction(pair({ M0: runs.M0.samples, [method]: runs[method].samples }, age0, kept0), method, statistics, nullValue),
  everySample: reduction(pair({ M0: runs.M0.samples, [method]: runs[method].samples }, age0), method, statistics, nullValue),
  tenKmRule: reduction(pair({ M0: runs.M0.samples, [method]: runs[method].samples }, age0, notLy), method, statistics, nullValue),
});
const h1 = reductions('M3*', config.acceptance.h1.lowerBoundAtLeast);
const h2 = reductions('G2', config.acceptance.h2.lowerBoundAbove);
const variants = Object.fromEntries(['M3a', 'M3b', 'M3c'].map((m) => [m, reductions(m, 0)]));
const g3 = reductions('G3', 0);
log(`H1 R = ${h1.primary.reduction.estimate.toFixed(4)} [${h1.primary.reduction.lower.toFixed(4)}, ${h1.primary.reduction.upper.toFixed(4)}]`);
log(`H2 R = ${h2.primary.reduction.estimate.toFixed(4)} [${h2.primary.reduction.lower.toFixed(4)}, ${h2.primary.reduction.upper.toFixed(4)}]`);

// ── H3: the coverage gate on every sample of the corrected product ──
// χ²₃ probabilities inside 1, 2 and 3 σ (gp-error-model's nominal).
const NOMINAL = [0.198748043098799, 0.738535870050108, 0.970709462271336];
const gate = config.acceptance.h3;
const m4Samples = runs['M3*'].samples.filter((s) => gateAges.includes(s.ageDays));
const coverage = Object.fromEntries(gateAges.map((age) => {
  const list = m4Samples.filter((s) => s.ageDays === age);
  const inside = [0, 1, 2].map((j) => list.filter((s) => s.coverage.inside[j]).length / list.length);
  const objectCount = new Set(list.map((s) => s.norad)).size;
  const sufficient = list.length >= gate.minimumSamples && objectCount >= gate.minimumObjects;
  const radius2 = model.conformal[age].radius2;
  const conformalCoverage = list.filter((s) => s.coverage.d2 <= radius2).length / list.length;
  return [age, {
    n: list.length, objects: objectCount, inside, nominal: NOMINAL, meanD2: list.reduce((t, s) => t + s.coverage.d2, 0) / list.length,
    status: !sufficient ? 'INSUFFICIENT' : gateFromFractions(inside, NOMINAL, gate) ? 'CALIBRATED' : 'FAILED',
    conformal: { radius: model.conformal[age].radius, coverage: conformalCoverage, target: config.acceptance.conformalCoverage,
      within: conformalCoverage >= config.acceptance.conformalCoverage[0] && conformalCoverage <= config.acceptance.conformalCoverage[1] },
  }];
}));
const gateGrid = cells(m4Samples.map((s) => ({ norad: s.norad, day: s.epoch.slice(0, 10), s })), Object.fromEntries(gateAges.flatMap((age, a) => [
  [`n${a}`, (r) => +(r.s.ageDays === age)],
  ...[0, 1, 2].map((j) => [`in${a}_${j}`, (r) => +(r.s.ageDays === age && r.s.coverage.inside[j] > 0)]),
])));
const h3Draws = bootstrap(gateGrid, {
  fails: (sum) => +gateAges.some((_, a) => !gateFromFractions([0, 1, 2].map((j) => sum(`in${a}_${j}`) / sum(`n${a}`)), NOMINAL, gate)),
}, { resamples: statistics.bootstrapResamples, seed: statistics.bootstrapSeed });
const h3FailShare = [...h3Draws.fails.draws].reduce((a, b) => a + b, 0);
const h3P = (1 + h3FailShare) / (h3Draws.fails.draws.length + 1);

// CRPS of M4 on test (descriptive).
const covById = new Map();
for (const s of sets) covById.set(s.gpId, covarianceOf(s));
const crps = Object.fromEntries(gateAges.map((age) => {
  const list = m4Samples.filter((s) => s.ageDays === age);
  return [age, ['R', 'T', 'N'].map((axis, k) => ({ axis, meanCrpsKm: list.reduce((t, s) => t + crpsNormal(s.error[k], Math.sqrt(covById.get(s.gpId)[age][k])), 0) / list.length }))];
}));

// ── Holm and the decisions ──
const family = holm({ H1: h1.primary.reduction.pValue, H2: h2.primary.reduction.pValue, H3: h3P }, statistics.alpha);
const decide = {
  H1: h1.primary.reduction.estimate >= config.acceptance.h1.reductionAtLeast && h1.primary.reduction.lower >= config.acceptance.h1.lowerBoundAtLeast && family.H1.rejected,
  H2: h2.primary.reduction.estimate >= config.acceptance.h2.reductionAtLeast && h2.primary.reduction.lower > config.acceptance.h2.lowerBoundAbove && family.H2.rejected,
  H3: gateAges.every((a) => coverage[a].status === 'CALIBRATED') && family.H3.rejected,
};

// ── No-harm, per tier ──
const noHarm = Object.fromEntries([['G1', 'M3*'], ['G2', 'G2'], ['G3', 'G3']].map(([tier, method]) => {
  const rows = pair({ M0: runs.M0.samples, [method]: runs[method].samples }, age0, kept0);
  const per = [...new Set(rows.map((r) => r.norad))].sort((a, b) => a - b).map((norad) => {
    const own = rows.filter((r) => r.norad === norad);
    return { norad, n: own.length, rmsM0Km: rmsOf(own, 'M0'), rmsKm: rmsOf(own, method), ratio: rmsOf(own, method) / rmsOf(own, 'M0') };
  });
  const worse = per.filter((p) => p.ratio > 1 + config.acceptance.noHarm.worseBy);
  return [tier, { satellites: per.length, worse: worse.map((p) => p.norad), flagged: worse.length > config.acceptance.noHarm.flagAbove, perSatellite: per }];
}));

// ── Descriptive summary by age ──
const summary = Object.fromEntries(Object.entries(runs).filter(([k]) => k !== 'M3*').map(([method, r]) => [method,
  config.scoring.ageBinsDays.map((age) => {
    const rowsAll = pair({ M0: runs.M0.samples, X: r.samples }, age);
    const kept = clip.mask.get(age);
    const rowsClip = kept ? rowsAll.filter((x) => kept.has(x.gpId)) : [];
    if (!rowsAll.length) return { ageDays: age, n: 0 };
    return {
      ageDays: age, n: rowsClip.length, nAll: rowsAll.length, objects: new Set(rowsAll.map((x) => x.norad)).size,
      rms3dKm: rmsOf(rowsClip, 'X'), rms3dM0Km: rmsOf(rowsClip, 'M0'), rmsRtnKm: [0, 1, 2].map((k) => rmsOf(rowsClip, 'X', k)),
      rmsVelocityRtnKmS: [3, 4, 5].map((k) => rmsOf(rowsClip, 'X', k)),
      rms3dAllKm: rmsOf(rowsAll, 'X'), median3dKm: median(rowsClip.map((x) => norm3(x.e.X.error))),
    };
  })]));

const metrics = {
  step: '30-evaluate', window, freezeCommit: freeze, model: { path: path.relative(repoRoot, path.resolve(values.model)), sha256: sha256(modelBytes), chosen: model.chosen, chosenMethod },
  counts: Object.fromEntries(Object.entries(runs).filter(([k]) => k !== 'M3*').map(([k, r]) => [k, r.counts])),
  clip: clip.detail,
  planes: { assignment: Object.fromEntries(planeOfObject), newcomers: [...planeOfObject.keys()].filter((n) => model.planes.members[n] === undefined) },
  g3Satellites: [...new Set(g3Sets.map((s) => s.norad))],
  hypotheses: {
    H1: { ...h1, criteria: config.acceptance.h1, holm: family.H1, supported: decide.H1 },
    H2: { ...h2, criteria: config.acceptance.h2, holm: family.H2, supported: decide.H2 },
    H3: { coverage, bootstrap: { failShare: h3FailShare / h3Draws.fails.draws.length, pValue: h3P }, criteria: gate, holm: family.H3, supported: decide.H3 },
  },
  variants, g3, noHarm, crps, summary,
  sensitivityNanu: 'not computed: no GPS NANU archive on this machine',
  h4: 'not run (exploratory M2; PLAN.md §9 step 6)',
  statistics: { resamples: statistics.bootstrapResamples, seed: statistics.bootstrapSeed, confidence: statistics.confidence, alpha: statistics.alpha },
};
run.write('metrics.json', metrics);
run.finish();
for (const h of ['H1', 'H2', 'H3']) log(`${h} ${decide[h] ? 'SUPPORTED' : 'NOT SUPPORTED'} (Holm p = ${family[h].pValue.toExponential(2)}, threshold ${family[h].threshold.toFixed(4)})`);
for (const a of gateAges) log(`H3 age ${a}: ${coverage[a].status} inside ${coverage[a].inside.map((x) => x.toFixed(3)).join('/')}; conformal ${coverage[a].conformal.coverage.toFixed(3)}`);
log(`no-harm: ${Object.entries(noHarm).map(([t, v]) => `${t} ${v.worse.length} worse`).join(', ')}`);
