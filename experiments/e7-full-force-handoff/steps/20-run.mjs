#!/usr/bin/env node
// E7 step 20 (PLAN.md section 4): every variant of config.json's table for
// the window, on every scheduled sample of one shard, scored against truth at
// the horizons; with each sample's maneuver class. Per-sample rows go to
// runs/ (they derive from element sets).
//
//   node experiments/e7-full-force-handoff/steps/20-run.mjs --window validation|test|dev --batch ID --shard i/n
//        --weights results/e7/train/weights.json --correlation results/e7/train/correlation.json
//        [--resume RUN_ID] [--limit N] [--regimes A,B] [--variants id,id]
import fs from 'node:fs';
import path from 'node:path';
import { startRun } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { cli, config, configPath, context, regimeTruth, schedule, setsByObjectOf, windowSets } from '../common.mjs';
import { targetAxes } from '../methods.mjs';
import { loadE1Model } from '../e1.mjs';
import { readGpsMetadata } from '../gnss.mjs';
import { Engine } from '../products.mjs';
import { loadBatch } from '../analysis.mjs';

const { values, freezeCommit, window, modules, archive, reference: referenceDir, regimes } = cli({
  batch: { type: 'string' }, shard: { type: 'string', default: '0/1' }, weights: { type: 'string' }, correlation: { type: 'string' },
  resume: { type: 'string' }, limit: { type: 'string' }, variants: { type: 'string' }, patch: { type: 'string' },
});
if (!values.batch) throw new Error('--batch is required (names the shards of one run)');
if (!values.weights || !values.correlation) throw new Error('--weights and --correlation (the train window products) are required');
const [shard, shards] = values.shard.split('/').map(Number);
const chosen = window.name === 'test' ? config.chosen : null;
if (window.name === 'test' && !chosen) throw new Error('config.json has no `chosen` (step 30 on validation) at the freeze');
const run = startRun({ experiment: config.experiment, step: `20-run-${window.name}-${values.batch}-s${shard}of${shards}`, configPath, modulesDir: modules, args: values, resume: values.resume });
run.manifest.freezeCommit = freezeCommit;
const log = (...a) => console.log(`[${run.id}]`, ...a);

const pinned = (file, key) => {
  const bytes = fs.readFileSync(path.resolve(file));
  if (chosen && chosen[key] !== sha256(bytes)) throw new Error(`${file} is not the file config.json pins (${key})`);
  run.addInputs(key, { [path.basename(file)]: sha256(bytes) });
  return JSON.parse(bytes);
};
const weights = pinned(values.weights, 'weightsSha256');
const correlation = pinned(values.correlation, 'correlationSha256');

const ctx = await context(modules, run, { estimation: true, maneuvers: true });
const truth = regimeTruth(referenceDir, regimes);
const objects = new Set(Object.values(truth).flatMap((t) => t.objects));
const margin = Math.max(...Object.values(config.regimes).flatMap((r) => r.arcSpansDays)) + config.maneuvers.contextDays + Math.max(...config.debias.windowsDays) + config.debias.maximumLatencyDays + 2;
const { sets, files } = windowSets(archive, window, objects, margin);
run.addInputs('gpHistory', files);
const byObject = setsByObjectOf(sets);
let all = schedule(window, truth, byObject);
// --patch BATCH: only the (sample, variant) pairs that failed in that batch
// of this window because HPOP refused a negative Cd*A/m (PLAN.md
// amendments); its rows then replace those failures.
const patchOf = new Map();
if (values.patch) {
  if (window.name === 'test') throw new Error('--patch is for windows before the freeze');
  for (const r of loadBatch(window.name, values.patch).rows) {
    const failed = Object.entries(r.failures).filter(([, m]) => /invalid-forces/.test(m)).map(([v]) => v);
    if (failed.length) patchOf.set(r.gpId, new Set(failed));
  }
  all = all.filter((s) => patchOf.has(s.gpId));
  run.manifest.patch = { batch: values.patch, samples: patchOf.size };
}
const mine = all.filter((_, i) => i % shards === shard);
log(`${all.length} samples in the window; shard ${shard}/${shards}: ${mine.length}`);
run.manifest.samples = { window: all.length, shard: mine.length };

const e1 = loadE1Model(run);
const gnss = readGpsMetadata(config.inputs.gnssMetadata);
run.addInputs('gnssMetadata', { [path.basename(config.inputs.gnssMetadata)]: gnss.sha256 });
const engine = new Engine({ ctx, truth, byObject, gnss, e1, weights, correlation, chosen });
const only = values.variants ? new Set(values.variants.split(',')) : null;
const table = config.variants[window.name].filter((v) => !only || only.has(v.id));

const rowsFile = path.join(run.dir, 'samples.jsonl');
const done = new Set(fs.existsSync(rowsFile) ? fs.readFileSync(rowsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).gpId) : []);
let count = 0;
for (const sample of mine) {
  if (done.has(sample.gpId)) continue;
  const products = truth[sample.regime].products;
  const set = byObject.get(sample.norad)[sample.index];
  const row = { regime: sample.regime, norad: sample.norad, gpId: sample.gpId, epoch: sample.epoch, cutoff: new Date(sample.cutoffMs).toISOString(), scheduled: sample.scheduled,
    targets: sample.targets.map((t) => (t.missing ? { h: t.h, missing: true } : { h: t.h, epoch: t.epoch })), errors: {}, d2: {}, failures: {}, info: {}, seconds: {}, bstar: set.elements.BSTAR };
  await targetAxes(ctx, sample.targets);
  const t0 = performance.now();
  try {
    const m = await engine.maneuversOf(sample);
    row.maneuvers = { beforeCutoff: m.beforeCutoff, inSpan: m.inSpan, blocks: m.blocks };
  } catch (error) { row.failures.maneuvers = String(error.message).slice(0, 300); }
  row.seconds.maneuvers = Math.round((performance.now() - t0) / 100) / 10;
  for (const spec of table) {
    if (spec.regimes && !spec.regimes.includes(sample.regime)) continue;
    if (values.patch && !patchOf.get(sample.gpId).has(spec.id)) continue;
    const t = performance.now();
    try {
      const r = await engine.run(sample, spec);
      if (r.failure) row.failures[spec.id] = r.failure;
      else { row.errors[spec.id] = r.errors; if (r.d2) row.d2[spec.id] = r.d2; }
      row.info[spec.id] = r.info;
    } catch (error) {
      row.failures[spec.id] = String(error.message).slice(0, 300);
    }
    row.seconds[spec.id] = Math.round((performance.now() - t) / 100) / 10;
  }
  fs.appendFileSync(rowsFile, `${JSON.stringify(row)}\n`);
  products.dropCache();
  if (++count % 10 === 0) { run.addInputs('reference', products.read); run.checkpoint(); log(`${count} samples`); }
  if (values.limit && count >= Number(values.limit)) break;
}
for (const t of Object.values(truth)) run.addInputs('reference', t.products.read);
run.finish({ samplesWritten: count });
log(`${count} samples -> ${path.relative(process.cwd(), rowsFile)}`);
await ctx.destroy();
