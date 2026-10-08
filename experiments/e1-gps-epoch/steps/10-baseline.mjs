#!/usr/bin/env node
// E1 step 10: M0, SGP4 as published, scored against IGS final orbits.
// On the A0 window it also runs the harness acceptance check A0.2
// (PLAN.md §6).
//
//   node experiments/e1-gps-epoch/steps/10-baseline.mjs --window a0 \
//     [--modules DIR] [--archive DIR] [--reference DIR] [--objects n,n] [--resamples N]
import zlib from 'node:zlib';
import { loadModule } from '../../../harness/modules.mjs';
import { readElementSets } from '../../../harness/gp-archive.mjs';
import { ReferenceIndex } from '../../../harness/reference.mjs';
import { startRun } from '../../../harness/provenance.mjs';
import { median, norm3, pigeonholeBootstrap, rms, weightedRms } from '../../../harness/stats.mjs';
import { cli, config, configPath } from '../common.mjs';
import { scoreBatch, scoreSets } from '../score.mjs';

const { values, window, modules, archive, reference: referenceDir, objects } = cli({ resamples: { type: 'string' } });
const run = startRun({ experiment: config.experiment, step: '10-baseline', configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);

const reference = new ReferenceIndex(referenceDir, config.inputs.referenceProductPrefix);
const gpObjects = new Set(reference.objects().filter((n) => !objects || objects.has(n)));
const { sets, files, duplicates } = readElementSets(archive, window.from, window.to, {
  keep: (n) => gpObjects.has(n),
  theory: config.elementSets.meanElementTheory,
  ephemerisType: config.elementSets.ephemerisType,
  duplicateEpochSeconds: config.elementSets.duplicateEpochSeconds,
});
run.addInputs('gpHistory', files);
log(`${sets.length} element sets for ${new Set(sets.map((s) => s.norad)).size} objects (${duplicates} republished duplicates merged), ${window.name} ${window.from}..${window.to}`);

const gpModel = await loadModule(modules, 'analysis/gp-error-model');
run.addModule(gpModel.provenance);

const started = performance.now();
const { samples, counts } = await scoreSets(gpModel, reference, sets, config.scoring, {
  onProgress: (i, n) => process.stderr.write(`\r${i}/${n} sets, ${((performance.now() - started) / 1000).toFixed(0)} s`),
});
process.stderr.write('\n');
run.addInputs('reference', reference.read);
run.addInputs('referenceProducts', Object.fromEntries(reference.products.map((p) => [p.product, p])));
log(`${counts.samples} samples from ${counts.sets} sets; ${counts.withoutReference} sets without reference; ${counts.multiSampleBins} bins with n > 1`);

// Per-sample table: stays in runs/ (derived from element sets; not committed).
run.write('samples.jsonl.gz', zlib.gzipSync(samples.map((s) => JSON.stringify(s)).join('\n')));

// ── Summary by age ──
const byAge = new Map();
for (const s of samples) {
  if (!byAge.has(s.ageDays)) byAge.set(s.ageDays, []);
  byAge.get(s.ageDays).push(s);
}
const dayOf = (epoch) => epoch.slice(0, 10);
// Sensitivity only (PLAN.md §5): Ly et al.'s rule drops element sets with
// more than 10 km 3D error at epoch.
const lyExcluded = new Set(samples.filter((s) => s.ageDays === config.scoring.primaryAgeDays && norm3(s.error) > 10).map((s) => s.gpId));
const summary = [...byAge].sort((a, b) => a[0] - b[0]).map(([age, list]) => {
  const axis = (k) => list.map((s) => s.error[k]);
  const cells = new Map();
  for (const s of list) {
    const key = `${s.norad}|${dayOf(s.epoch)}`;
    if (!cells.has(key)) cells.set(key, { row: s.norad, col: dayOf(s.epoch), n: 0, sse: 0 });
    const c = cells.get(key);
    c.n += 1;
    c.sse += norm3(s.error) ** 2;
  }
  const resamples = Number(values.resamples ?? config.statistics.bootstrapResamples);
  return {
    ageDays: age,
    n: list.length,
    objects: new Set(list.map((s) => s.norad)).size,
    rms3dKm: rms(list.map((s) => norm3(s.error))),
    rms3dCi: pigeonholeBootstrap([...cells.values()], weightedRms, { resamples, seed: config.statistics.bootstrapSeed, confidence: config.statistics.confidence }),
    rmsRtnKm: [rms(axis(0)), rms(axis(1)), rms(axis(2))],
    medianRtnKm: [median(axis(0)), median(axis(1)), median(axis(2))],
    median3dKm: median(list.map((s) => norm3(s.error))),
    sensitivityTenKmRule: (() => {
      const kept = list.filter((s) => !lyExcluded.has(s.gpId));
      return { n: kept.length, excludedSets: lyExcluded.size, rms3dKm: rms(kept.map((s) => norm3(s.error))) };
    })(),
  };
});

// Per satellite at the primary age.
const primary = samples.filter((s) => s.ageDays === config.scoring.primaryAgeDays);
const perObject = [...new Set(primary.map((s) => s.norad))].sort((a, b) => a - b).map((norad) => {
  const list = primary.filter((s) => s.norad === norad);
  return {
    norad,
    n: list.length,
    medianAlongTrackKm: median(list.map((s) => s.error[1])),
    rms3dKm: rms(list.map((s) => norm3(s.error))),
  };
});

// ── A0 checks (PLAN.md §6) ──
const checks = {};
if (window.name === 'a0') {
  // A0.2: per-sample sums equal the batch call's sums.
  const batch = await scoreBatch(gpModel, reference, sets, config.scoring);
  let worst = 0;
  const ages = config.scoring.ageBinsDays;
  for (let a = 0; a < ages.length; ++a) {
    const atAge = samples.filter((s) => s.ageDays === ages[a]);
    const per = [0, 1, 2, 3, 4, 5].map((k) => atAge.reduce((t, s) => t + s.error[k], 0));
    // Relative to the sum of magnitudes, so a component that cancels to
    // near zero is not divided by near zero.
    const scale = [0, 1, 2, 3, 4, 5].map((k) => Math.max(atAge.reduce((t, s) => t + Math.abs(s.error[k]), 0), 1e-300));
    const strata = batch.strata.filter((s) => s.age === a);
    const whole = [0, 1, 2, 3, 4, 5].map((k) => strata.reduce((t, s) => t + s.sum[k], 0));
    const n = strata.reduce((t, s) => t + s.n, 0);
    if (n !== atAge.length) worst = Infinity;
    for (let k = 0; k < 6; ++k) worst = Math.max(worst, Math.abs(per[k] - whole[k]) / scale[k]);
  }
  const limit = config.acceptance.a0.sumRelative;
  checks['A0.2'] = { description: 'per-sample sums equal one batch accumulate', worstRelative: worst, limit, pass: worst <= limit };
}

const metrics = { window, method: 'M0', counts, summary, perObject, checks };
run.write('metrics.json', metrics);
run.finish();
for (const s of summary) log(`age ${s.ageDays} d: n=${s.n} objects=${s.objects} RMS 3D ${s.rms3dKm.toFixed(3)} km [${s.rms3dCi.lower.toFixed(3)}, ${s.rms3dCi.upper.toFixed(3)}] ` +
  `RTN ${s.rmsRtnKm.map((x) => x.toFixed(3)).join('/')} km; median 3D ${s.median3dKm.toFixed(3)} km; 10 km rule RMS ${s.sensitivityTenKmRule.rms3dKm.toFixed(3)} km`);
for (const [id, c] of Object.entries(checks)) log(`${id} ${c.pass ? 'PASS' : 'FAIL'}: ${c.description}`);
await gpModel.destroy();
if (Object.values(checks).some((c) => !c.pass)) process.exitCode = 1;
