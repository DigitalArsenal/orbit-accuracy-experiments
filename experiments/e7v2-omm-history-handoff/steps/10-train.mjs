#!/usr/bin/env node
// E7v2 step 10 (PLAN.md section 5), on the train window:
//  - Truth-rich classes trained here (GNSS-GE, LEO-POD): every OMM's
//    at-epoch error (SGP4 minus truth at the first truth state within the
//    tolerance, [R, T, N, dR, dT, dN] in its RTN axes, gp-error-model), its
//    second moment after a 5 robust-sigma clip and its correlation across
//    OMMs (E7's forms). E7's four regimes take E7's train products (pinned).
//  - Truth-rich class debiasing models (E1's form refitted, one OMM per
//    object and day; GPS keeps E1's published model).
//  - Consecutive OMMs (each OMM's SGP4 at the next OMM's epoch minus that
//    epoch state, RTN): per OMM-only regime and per reference class, the RMS
//    of R, T, N for gaps under a day (q); per OMM-only regime the along-track
//    model on the mean argument of latitude (gaps up to two days).
//  - OMM-only S: the reference class's S scaled per component by q ratios;
//    correlation: the reference class's.
// Outputs weights.json, correlation.json, debias-models.json and
// consecutive.json (aggregates); per-OMM rows stay in runs/.
//
//   node experiments/e7v2-omm-history-handoff/steps/10-train.mjs --window train
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { json, sha256 } from '../../../harness/modules.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { median } from '../../../harness/stats.mjs';
import { readGnssMetadata } from '../../e7-full-force-handoff/gnss.mjs';
import { COMPONENTS, empiricalCorrelation, fitForm } from '../../e7-full-force-handoff/correlation.mjs';
import { sgp4Errors } from '../../e7-full-force-handoff/methods.mjs';
import { DAY_MS, cli, config, configPath, context, setsByObjectOf, windowSets } from '../common.mjs';
import { PseudoTruth, truthClasses } from '../truth.mjs';
import { populations, draw, seedOf } from '../classes.mjs';
import { trainOmmClassModel, trainTruthClassModel } from '../debias.mjs';

const { values, window, modules, archive, references, classes: names } = cli();
if (window.name !== 'train' && window.name !== 'dev') throw new Error('step 10 reads the train (or dev) window only');
const run = startRun({ experiment: config.experiment, step: `10-train-${window.name}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const ctx = await context(modules, run);
const gnss = readGnssMetadata(config.inputs.gnssMetadata);
run.addInputs('gnssMetadata', { [path.basename(config.inputs.gnssMetadata)]: gnss.sha256 });
const lo = Date.parse(`${window.from}T00:00:00Z`), hi = Date.parse(`${window.to}T00:00:00Z`) + DAY_MS;
const tol = config.targetToleranceSeconds * 1000, half = config.binHalfWidthSeconds / 86400;
const pinned = (input) => {
  const bytes = fs.readFileSync(path.join(repoRoot, input.path));
  if (sha256(bytes) !== input.sha256) throw new Error(`${input.path} differs from the pinned SHA-256`);
  run.addInputs('e7Train', { [input.path]: input.sha256 });
  return JSON.parse(bytes);
};
const e7Weights = pinned(config.inputs.e7Weights), e7Correlation = pinned(config.inputs.e7Correlation);

function moment(errors) {
  const c = config.weights;
  const centre = [0, 1, 2, 3, 4, 5].map((k) => median(errors.map((e) => e[k])));
  const scale = [0, 1, 2, 3, 4, 5].map((k) => c.madScale * median(errors.map((e) => Math.abs(e[k] - centre[k]))));
  const kept = errors.filter((e) => e.every((x, k) => Math.abs(x - centre[k]) <= c.clipRobustSigma * scale[k]));
  const m = Array(36).fill(0);
  for (const e of kept) for (let i = 0; i < 6; ++i) for (let j = 0; j < 6; ++j) m[6 * i + j] += e[i] * e[j] / kept.length;
  return { n: errors.length, kept: kept.length, secondMomentRtn: m, sigma: [0, 1, 2, 3, 4, 5].map((k) => Math.sqrt(m[7 * k])) };
}
const robustRms = (xs) => {
  const c = config.weights, m = median(xs), s = c.madScale * median(xs.map((x) => Math.abs(x - m)));
  const kept = xs.filter((x) => Math.abs(x - m) <= c.clipRobustSigma * s);
  return Math.sqrt(kept.reduce((a, x) => a + x * x, 0) / kept.length);
};

async function atEpoch(products, set) {
  const s = products.firstAtOrAfter(set.norad, set.epochMs, tol);
  if (!s) return null;
  const age = (s.ms - set.epochMs) / DAY_MS;
  const acc = await ctx['gp-error-model'].invokeJson('accumulate', [ommFrame([set]), products.frame(s.entry), json('options', { ageBinsDays: [[Math.max(0, age - half), age + half]], referenceStepSeconds: 0 })], 'accumulator');
  const one = acc.strata.filter((x) => x.n === 1);
  return one.length === 1 ? { e: one[0].sum.map((v) => v * 1000), speed: Math.hypot(...s.v) * 1000 } : null;
}

// Consecutive OMMs of objects: [{set, gapDays, e [R, T, N] m, dtSeconds}],
// at most perObject pairs per object, evenly spaced through the window.
async function consecutive(objects, byObject, pseudo, perObject = 100) {
  const rows = [];
  for (const norad of objects) {
    const mine = (byObject.get(norad) ?? []);
    if (mine.length < 2) continue;
    await pseudo.prepare(norad, mine);
    const pairs = [];
    for (let i = 0; i + 1 < mine.length; ++i) {
      if (mine[i].epochMs < lo || mine[i].epochMs >= hi) continue;
      const gap = (mine[i + 1].epochMs - mine[i].epochMs) / DAY_MS;
      if (gap > 0 && gap <= config.debias.classModel.nextWithinDays) pairs.push(i);
    }
    const step = Math.max(1, Math.ceil(pairs.length / perObject));
    for (let k = 0; k < pairs.length; k += step) {
      const i = pairs[k];
      const t = pseudo.firstAtOrAfter(norad, mine[i + 1].epochMs, 1);
      if (!t) continue;
      const target = { h: 0, ms: t.ms, epoch: t.epoch, r: t.r, v: t.v, file: t.entry.file };
      const r = await sgp4Errors(ctx, pseudo, mine[i], [target]);
      const e = r.errors[0];
      if (e) rows.push({ norad, set: mine[i], gapDays: (mine[i + 1].epochMs - mine[i].epochMs) / DAY_MS, e, dtSeconds: e[1] / (Math.hypot(...t.v) * 1000) });
    }
  }
  return rows;
}

const weights = { window, classes: {} };
const correlation = { window, lagBinsHours: config.correlation.lagBinsHours, forms: config.correlation.forms, classes: {} };
const debiasModels = { window, classes: {} };
const consecutiveOut = { window, gapBelowDays: config.debias.consecutive.gapBelowDays, classes: {} };
const records = [];
const truthNames = names.filter((n) => config.classes[n].kind === 'truth');
const truth = truthClasses(references, truthNames, config.classes);
const pseudo = new PseudoTruth(ctx['epoch-state']);

for (const name of truthNames) {
  const c = config.classes[name];
  const t = truth[name];
  if (!t?.objects.length) { log(name, 'no objects with truth: skipped'); continue; }
  const { sets, files } = windowSets(archive, window, new Set(t.objects), 0, 3);
  run.addInputs('gpHistory', files);
  const byObject = setsByObjectOf(sets);
  if (c.e7Regime) {
    weights.classes[name] = { ...e7Weights.regimes[c.e7Regime].S, source: `E7 ${c.e7Regime} (${config.inputs.e7Weights.path})` };
    correlation.classes[name] = { fits: e7Correlation.regimes[c.e7Regime].fits, source: `E7 ${c.e7Regime} (${config.inputs.e7Correlation.path})` };
  }
  const errors = [], perDay = new Map();
  for (const norad of t.objects) {
    for (const s of (byObject.get(norad) ?? []).filter((x) => x.epochMs >= lo && x.epochMs < hi)) {
      const day = `${norad}/${s.epoch.slice(0, 10)}`;
      const need = !c.e7Regime || (!perDay.has(day) && (c.debias ?? []).includes('class'));
      if (!need) continue;
      const a = await atEpoch(t.products, s);
      if (!a) continue;
      if (!c.e7Regime) { errors.push({ norad, epochMs: s.epochMs, e: a.e }); records.push({ cls: name, norad, gpId: s.gpId, epochMs: s.epochMs, e: a.e }); }
      if (!perDay.has(day)) perDay.set(day, { set: s, dtSeconds: a.e[1] / a.speed });
    }
    t.products.dropCache();
  }
  run.addInputs('reference', t.products.read);
  if (!c.e7Regime) {
    weights.classes[name] = { ...moment(errors.map((r) => r.e)), objects: new Set(errors.map((r) => r.norad)).size, source: 'trained here' };
    const empirical = empiricalCorrelation(errors, config.correlation.lagBinsHours, config.weights);
    correlation.classes[name] = { empirical, fits: Object.fromEntries(COMPONENTS.map((k) => [k, Object.fromEntries(config.correlation.forms.map((f) => [f, fitForm(f, empirical.components[k])]))])), source: 'trained here' };
  }
  if ((c.debias ?? []).includes('class') && perDay.size >= 50) {
    debiasModels.classes[name] = await trainTruthClassModel(ctx, [...perDay.values()]);
    log(name, `class debiasing: ${perDay.size} OMMs`);
  }
  const w = weights.classes[name];
  log(name, `objects ${t.objects.length}; sigma RTN ${w.sigma.slice(0, 3).map((x) => x.toFixed(0)).join('/')} m (${w.source})`);
}

// Consecutive OMMs: OMM-only regimes (a seeded draw from the train selection
// date's population) and the reference classes their transfers name.
const ommNames = names.filter((n) => config.classes[n].kind === 'omm');
const references2 = [...new Set(ommNames.map((n) => config.classes[n].correlationFrom))];
const groups = {};
if (ommNames.length) {
  const { populations: pops, files } = populations(archive, window.selectionDate ?? config.selectionDates.train, gnss);
  run.addInputs('gpHistory', files);
  for (const n of ommNames) groups[n] = draw(pops[n], config.debias.classModel.trainObjects, window, { perObject: 1, minimumGapDays: 0 }, seedOf('train', n)).map((o) => o.norad);
}
for (const r of references2) {
  if (!truth[r]) { const t = truthClasses(references, [r], config.classes)[r]; if (t) truth[r] = t; }
  groups[r] = truth[r]?.objects ?? [];
}
for (const [name, objects] of Object.entries(groups)) {
  const { sets, files } = windowSets(archive, window, new Set(objects), 0, 3);
  run.addInputs('gpHistory', files);
  const rows = await consecutive(objects, setsByObjectOf(sets), pseudo);
  const short = rows.filter((r) => r.gapDays < config.debias.consecutive.gapBelowDays);
  consecutiveOut.classes[name] = { objects: new Set(rows.map((r) => r.norad)).size, pairs: rows.length, shortPairs: short.length, qRtn: [0, 1, 2].map((k) => robustRms(short.map((r) => r.e[k]))) };
  for (const r of rows) records.push({ cls: name, kind: 'consecutive', norad: r.norad, gpId: r.set.gpId, gapDays: r.gapDays, e: r.e });
  if (config.classes[name].kind === 'omm') {
    debiasModels.classes[name] = trainOmmClassModel(rows);
  }
  log(name, `consecutive: ${rows.length} pairs (${short.length} under a day), q RTN ${consecutiveOut.classes[name].qRtn.map((x) => x.toFixed(0)).join('/')} m`);
}
// OMM-only S and correlation by transfer from the reference class (E7's
// pinned products for E7's regimes when the reference was not run here).
for (const name of ommNames) {
  const ref = config.classes[name].correlationFrom;
  if (!weights.classes[ref]) {
    const r = config.classes[ref].e7Regime;
    if (!r) throw new Error(`reference class ${ref} has no weights: include it in --classes`);
    weights.classes[ref] = { ...e7Weights.regimes[r].S, source: `E7 ${r} (${config.inputs.e7Weights.path})` };
    correlation.classes[ref] = { fits: e7Correlation.regimes[r].fits, source: `E7 ${r} (${config.inputs.e7Correlation.path})` };
  }
  const q = consecutiveOut.classes[name].qRtn, qr = consecutiveOut.classes[ref].qRtn;
  const k = [0, 1, 2, 0, 1, 2].map((i) => q[i] / qr[i]);
  const S = weights.classes[ref].secondMomentRtn.map((v, idx) => v * k[Math.floor(idx / 6)] * k[idx % 6]);
  weights.classes[name] = { secondMomentRtn: S, sigma: [0, 1, 2, 3, 4, 5].map((i) => Math.sqrt(S[7 * i])), scale: k, source: `${ref} scaled by consecutive-OMM RMS ratios` };
  correlation.classes[name] = { fits: correlation.classes[ref].fits, source: `${ref}` };
  log(name, `S from ${ref} x [${k.slice(0, 3).map((x) => x.toFixed(2)).join(', ')}]; sigma RTN ${weights.classes[name].sigma.slice(0, 3).map((x) => x.toFixed(0)).join('/')} m`);
}

run.write('weights.json', weights);
run.write('correlation.json', correlation);
run.write('debias-models.json', debiasModels);
run.write('consecutive.json', consecutiveOut);
run.write('rows.jsonl.gz', zlib.gzipSync(records.map((r) => JSON.stringify(r)).join('\n')));
run.finish({ outputs: ['weights.json', 'correlation.json', 'debias-models.json', 'consecutive.json'] });
await ctx.destroy();
