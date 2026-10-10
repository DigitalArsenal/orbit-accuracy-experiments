#!/usr/bin/env node
// E7v2 step 20 (PLAN.md sections 2, 4, 8): every variant of config.json's
// table for the window on every sample of one shard: truth-rich classes at
// their strides, OMM-only regimes from step 00's draw. Each product is scored
// against truth (truth-rich) and pseudo-truth (every class). A truth-rich
// sample also records, at each pseudo-truth target, the pseudo-truth OMM's
// own error and S's error against the same truth state. Rows and product
// records (for E9) stay in runs/.
//
//   node experiments/e7v2-omm-history-handoff/steps/20-run.mjs --window W --batch ID --shard i/n
//        --train DIR (step 10's outputs) [--draw RUN_ID] [--classes A,B] [--variants id,id] [--resume RUN_ID] [--limit N]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { readGnssMetadata } from '../../e7-full-force-handoff/gnss.mjs';
import { loadE1Model } from '../../e7-full-force-handoff/e1.mjs';
import { sgp4Errors, targetAxes } from '../../e7-full-force-handoff/methods.mjs';
import { cli, config, configPath, context, setsByObjectOf, windowSets } from '../common.mjs';
import { PseudoTruth, truthClasses } from '../truth.mjs';
import { ommSamples, truthSamples } from '../schedule.mjs';
import { loadCalibration } from '../dca.mjs';
import { Engine } from '../engine.mjs';

const { values, freezeCommit, window, modules, archive, references, classes: names } = cli({
  batch: { type: 'string' }, shard: { type: 'string', default: '0/1' }, train: { type: 'string' }, draw: { type: 'string' },
  resume: { type: 'string' }, limit: { type: 'string' }, variants: { type: 'string' },
});
if (!values.batch) throw new Error('--batch is required (names the shards of one run)');
if (!values.train) throw new Error('--train (the directory of step 10\'s outputs) is required');
const [shard, shards] = values.shard.split('/').map(Number);
const locked = config.lockedWindows.includes(window.name);
const chosen = locked ? config.chosen : null;
if (locked && !chosen) throw new Error('config.json has no `chosen` at the freeze');
const run = startRun({ experiment: config.experiment, step: `20-run-${window.name}-${values.batch}-s${shard}of${shards}`, configPath, modulesDir: modules, args: values, resume: values.resume });
run.manifest.freezeCommit = freezeCommit;
const log = (...a) => console.log(`[${run.id}]`, ...a);

// Step 10's products (pinned by the freeze for a locked window).
const trainFile = (name, key) => {
  const bytes = fs.readFileSync(path.resolve(values.train, name));
  if (chosen && chosen.train?.[key] !== sha256(bytes)) throw new Error(`${name} is not the file config.json pins (chosen.train.${key})`);
  run.addInputs('train', { [name]: sha256(bytes) });
  return JSON.parse(bytes);
};
const weights = trainFile('weights.json', 'weightsSha256');
const correlation = trainFile('correlation.json', 'correlationSha256');
const debiasModels = trainFile('debias-models.json', 'debiasModelsSha256');

const ctx = await context(modules, run, { estimation: true, maneuvers: true });
const truthNames = names.filter((n) => config.classes[n].kind === 'truth');
const ommNames = names.filter((n) => config.classes[n].kind === 'omm');
const truth = truthClasses(references, truthNames, config.classes);
let draws = {};
if (ommNames.length) {
  if (!values.draw) throw new Error('--draw (step 00\'s run for this window) is required for OMM-only regimes');
  const bytes = fs.readFileSync(path.join(repoRoot, 'runs', values.draw, 'draw.json'));
  const d = JSON.parse(bytes);
  if (d.window !== window.name) throw new Error(`${values.draw} is a draw for ${d.window}, not ${window.name}`);
  if (chosen && chosen.draws?.[window.name] && chosen.draws[window.name] !== sha256(bytes)) throw new Error(`${values.draw} is not the draw config.json pins`);
  run.addInputs('draw', { [`${values.draw}/draw.json`]: sha256(bytes) });
  draws = d.draws;
}

// Element sets: truth-rich objects with the margin E7's history debiasing
// needs; OMM-only objects with the longest arc and the maneuver context.
const spanMax = Math.max(...Object.values(config.classes).flatMap((c) => c.arcSpansDays));
const truthObjects = new Set(Object.values(truth).flatMap((t) => t.objects));
const ommObjects = new Set(ommNames.flatMap((n) => (draws[n] ?? []).map((o) => o.norad)));
const byObject = new Map();
for (const [objects, margin] of [[truthObjects, spanMax + config.maneuvers.contextDays + Math.max(...config.debias.windowsDays) + config.debias.maximumLatencyDays + 2],
  [ommObjects, spanMax + config.maneuvers.contextDays + 2]]) {
  if (!objects.size) continue;
  const { sets, files } = windowSets(archive, window, objects, margin, 9);
  run.addInputs('gpHistory', files);
  for (const [k, v] of setsByObjectOf(sets)) byObject.set(k, v);
}
const pseudo = new PseudoTruth(ctx['epoch-state']);
const all = [...(await truthSamples(window, truth, byObject, pseudo)), ...(await ommSamples(draws, ommNames, byObject, pseudo))];
for (const n of names) {
  const of = all.filter((s) => s.cls === n);
  if (of.length || truth[n] || draws[n]) log(`${n}: ${of.length} samples, ${new Set(of.map((s) => s.norad)).size} objects (of ${truth[n]?.objects.length ?? draws[n]?.length ?? 0})`);
}
const mine = all.filter((_, i) => i % shards === shard);
log(`${all.length} samples in the window; shard ${shard}/${shards}: ${mine.length}`);
run.manifest.samples = { window: all.length, shard: mine.length };

const e1 = loadE1Model(run);
const gnss = readGnssMetadata(config.inputs.gnssMetadata);
run.addInputs('gnssMetadata', { [path.basename(config.inputs.gnssMetadata)]: gnss.sha256 });
const calibration = loadCalibration(run);
const engine = new Engine({ ctx, truth, pseudo, byObject, gnss, e1, weights, correlation, classModels: debiasModels.classes, calibration, chosen });
const only = values.variants ? new Set(values.variants.split(',')) : null;
const table = config.variants[window.name].filter((v) => !only || only.has(v.id));

const rowsFile = path.join(run.dir, 'samples.jsonl');
const productsFile = path.join(run.dir, 'products.jsonl');
const done = new Set(fs.existsSync(rowsFile) ? fs.readFileSync(rowsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).gpId) : []);
const brief = (t) => (t.missing ? { h: t.h, missing: true } : { h: t.h, epoch: t.epoch, ...(t.gpId ? { gpId: t.gpId } : {}) });
let count = 0;
for (const sample of mine) {
  if (done.has(sample.gpId)) continue;
  const set = byObject.get(sample.norad)[sample.index];
  const row = { cls: sample.cls, kind: sample.kind, subclass: sample.subclass ?? null, objectType: sample.objectType ?? null, norad: sample.norad, gpId: sample.gpId,
    epoch: sample.epoch, cutoff: new Date(sample.cutoffMs).toISOString(), scheduled: sample.scheduled,
    targets: sample.targets.map(brief), pseudoTargets: (sample.pseudoTargets ?? []).map(brief),
    errors: {}, pseudoErrors: {}, d2: {}, failures: {}, skips: {}, info: {}, seconds: {}, bstar: set.elements.BSTAR };
  await targetAxes(ctx, sample.targets);
  if (sample.pseudoTargets) await targetAxes(ctx, sample.pseudoTargets);
  // The pseudo-truth's own error and S's error against the same truth state.
  if (sample.kind === 'truth') {
    const products = truth[sample.cls].products;
    const own = [], sAt = [];
    for (const t of sample.pseudoTargets) {
      if (t.missing || !t.truthAt) { own.push(null); sAt.push(null); continue; }
      const at = [{ h: t.h, ...t.truthAt }];
      const ptSet = byObject.get(sample.norad).find((s) => s.gpId === t.gpId);
      own.push(ptSet ? (await sgp4Errors(ctx, products, ptSet, at)).errors[0] : null);
      sAt.push((await sgp4Errors(ctx, products, set, at)).errors[0]);
    }
    row.floor = { pseudoTruthError: own, sAtPseudoTruthEpoch: sAt };
  }
  const t0 = performance.now();
  try {
    const m = await engine.maneuversOf(sample);
    row.maneuvers = { beforeCutoff: m.beforeCutoff, inSpan: m.inSpan, blocks: m.blocks };
  } catch (error) { row.failures.maneuvers = String(error.message).slice(0, 300); }
  row.seconds.maneuvers = Math.round((performance.now() - t0) / 100) / 10;
  for (const spec of table) {
    if (spec.kinds && !spec.kinds.includes(sample.kind)) continue;
    if (spec.classes && !spec.classes.includes(sample.cls)) continue;
    const t = performance.now();
    try {
      const r = await engine.run(sample, spec);
      if (r.skip) row.skips[spec.id] = r.skip;
      else if (r.failure) row.failures[spec.id] = r.failure;
      else {
        row.errors[spec.id] = r.errors;
        if (r.pseudoErrors) row.pseudoErrors[spec.id] = r.pseudoErrors;
        if (r.d2) row.d2[spec.id] = r.d2;
        if (r.product) fs.appendFileSync(productsFile, `${JSON.stringify({ cls: sample.cls, norad: sample.norad, gpId: sample.gpId, cutoff: row.cutoff, variant: spec.id, ...r.product })}\n`);
      }
      row.info[spec.id] = r.info;
    } catch (error) {
      row.failures[spec.id] = String(error.message).slice(0, 300);
    }
    row.seconds[spec.id] = Math.round((performance.now() - t) / 100) / 10;
  }
  fs.appendFileSync(rowsFile, `${JSON.stringify(row)}\n`);
  if (sample.kind === 'truth') truth[sample.cls].products.dropCache();
  if (++count % 10 === 0) { for (const t of Object.values(truth)) run.addInputs('reference', t.products.read); run.checkpoint(); log(`${count} samples`); }
  if (values.limit && count >= Number(values.limit)) break;
}
for (const t of Object.values(truth)) run.addInputs('reference', t.products.read);
if (fs.existsSync(productsFile)) { fs.writeFileSync(`${productsFile}.gz`, zlib.gzipSync(fs.readFileSync(productsFile))); fs.rmSync(productsFile); }
run.finish({ samplesWritten: count });
log(`${count} samples -> ${path.relative(process.cwd(), rowsFile)}`);
await ctx.destroy();
