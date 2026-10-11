// Step 55, Q2's samples (PLAN.md 4, 6): E7's schedule over the Q2 objects, the targets, and the products. Validation:
// S and A for every candidate (span x B-dot) of the object's class. Test (after the selection is committed): S,
// S-corr, A, A-GLS, A-GLS-E2b, A-corr, A-JB and A-JB-E13 with the selected choices and strides. Writes
// runs/<run>/q2.jsonl.gz (per-sample errors derived from element sets and operator states: never committed).
//
//   node experiments/e16-cross-regime-epoch/steps/55-q2-run.mjs --window validation|test [--shard 0/8] [--limit N]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { startRun } from '../../../harness/provenance.mjs';
import { targetAxes } from '../../e7-full-force-handoff/methods.mjs';
import { DAY_MS, HOUR_MS, SELECTION_FILE, cli, config, configPath, modulesRoot, readJson, repoRoot, resultsDir, sha256, throttle, windowSpan } from '../common.mjs';
import { truthFor } from '../truth.mjs';
import { windowSets } from '../sets.mjs';
import { clipKept, loadSamples } from '../q1lib.mjs';
import { makeCorrector } from '../corrector.mjs';
import { e13Correction, q2Context } from '../env.mjs';
import { Q2Object, arcProduct, e2bRho, rho, sgp4Product } from '../q2lib.mjs';

const { values, window, locks } = cli({ shard: { type: 'string', default: '0/1' }, limit: { type: 'string' }, objectsOnly: { type: 'string' }, resume: { type: 'string' } });
if (window === 'train') throw new Error('step 55 runs validation or test');
const test = window === 'test';
const [shard, shards] = values.shard.split('/').map(Number);
const run = startRun({ experiment: config.experiment, step: `55-q2-run-${window}-s${shard}of${shards}${values.limit ? '-limit' : ''}`, configPath, modulesDir: modulesRoot(), args: { window, shard: values.shard, limit: values.limit ?? null }, resume: values.resume });
// Each finished sample is appended at once (a stopped run keeps its samples; --resume <run> continues it).
const partial = path.join(run.dir, 'q2.jsonl');
const doneKeys = new Set(fs.existsSync(partial) ? fs.readFileSync(partial, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.norad}|${r.scheduledMs}`; }) : []);
if (locks) run.manifest.locks = locks;
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} [q2 ${window} ${values.shard}] ${m}`);
const P = config.q2;

const inventory = readJson(path.join(resultsDir, 'inventory.json'));
const meta = new Map(inventory.objects.filter((o) => !o.excluded).map((o) => [o.norad, o]));
const q2train = readJson(path.join(resultsDir, 'selection', 'q2-train.json'));
run.addInputs('selection', { 'inventory.json': sha256(fs.readFileSync(path.join(resultsDir, 'inventory.json'))), 'q2-train.json': sha256(fs.readFileSync(path.join(resultsDir, 'selection', 'q2-train.json'))) });
const selection = test ? readJson(path.join(repoRoot, SELECTION_FILE)) : null;
if (test) run.addInputs('selection', { 'selection.json': sha256(fs.readFileSync(path.join(repoRoot, SELECTION_FILE))) });

// Objects of this shard (by object, so each object's caches stay in one process).
let objects = inventory.q2.map((q) => q.norad).sort((a, b) => a - b);
if (values.objectsOnly) { const keep = new Set(values.objectsOnly.split(',').map(Number)); objects = objects.filter((n) => keep.has(n)); }
const allIndex = new Map(objects.map((n, j) => [n, j]));
objects = objects.filter((_, i) => i % shards === shard);

// Element sets: the window and the one before it (arcs and manoeuvre context reach back up to 17 days).
const norads = inventory.objects.map((o) => o.norad);
const previous = test ? 'validation' : 'train';
const sets = [...windowSets(previous, norads).sets, ...windowSets(window, norads).sets];
const byObject = new Map();
for (const s of sets) { if (!allIndex.has(s.norad)) continue; if (!byObject.has(s.norad)) byObject.set(s.norad, new Map()); byObject.get(s.norad).set(s.gpId, s); }
for (const [n, m] of byObject) byObject.set(n, [...m.values()].sort((a, b) => a.epochMs - b.epochMs));

const ctx = await q2Context(run);
const e13 = test ? await e13Correction(ctx, run) : null;
const e2b = test ? readJson(path.join(repoRoot, config.inputs.e2bCorrelation)) : null;
if (e2b) run.addInputs('e2b', { 'correlation-model.json': sha256(fs.readFileSync(path.join(repoRoot, config.inputs.e2bCorrelation))) });

// Q1 corrections for S-corr and A-corr (test): M* of the tier O fold that holds the object out (corrector.mjs).
let corrector = null;
if (test) {
  const models = readJson(path.join(resultsDir, 'selection', 'q1-models.json')).LEO;
  const prevRows = loadSamples('validation', ['LEO-PL', 'LEO-POD', 'SLR-LEO']).rows, rows = loadSamples('test', ['LEO-PL', 'LEO-POD', 'SLR-LEO']).rows;
  const kept = new Set([...clipKept(prevRows).kept, ...clipKept(rows).kept]);
  corrector = makeCorrector({ ctx, models, fleetRows: [...prevRows, ...rows].filter((r) => kept.has(r.gpId) && r.errors[0]), meta, spw: { gfz: ctx.gfz, rsga: ctx.rsga } });
}

// Products of a class: validation candidates, or the test products with the selected choices.
function productsOf(cls) {
  if (!test) return P.candidates[cls].spanDays.flatMap((spanDays) => P.candidates[cls].bdot.map((bdot) => ({ id: `A:${spanDays}d:${bdot ? 'bdot' : 'b'}`, spanDays, bdot, weighting: 'diagonal', atmosphere: 'NRLMSISE00' })));
  const c = selection.q2.chosen[cls];
  const base = { spanDays: c.spanDays, bdot: c.bdot };
  return [
    { id: 'A', ...base, weighting: 'diagonal', atmosphere: 'NRLMSISE00' },
    { id: 'A-GLS', ...base, weighting: 'gls', atmosphere: 'NRLMSISE00' },
    { id: 'A-GLS-E2b', ...base, weighting: 'gls-e2b', atmosphere: 'NRLMSISE00' },
    { id: 'A-corr', ...base, weighting: 'diagonal', atmosphere: 'NRLMSISE00', corrected: true },
    { id: 'A-JB', ...base, weighting: 'diagonal', atmosphere: 'JB2008' },
    { id: 'A-JB-E13', ...base, weighting: 'diagonal', atmosphere: 'JB2008', e13: true },
  ];
}

const [from, to] = windowSpan(window, 'LEO-POD');
const lo = Date.parse(`${from}T00:00:00Z`), hi = Date.parse(`${to}T00:00:00Z`);
const stride = test ? selection.q2.testStrideDays : P.validationStrideDays;
const half = config.scoring.planetDayBinHalfWidthHours * HOUR_MS;
let done = 0;
const limit = values.limit ? Number(values.limit) : Infinity;
for (const norad of objects) {
  const m = meta.get(norad), cls = m.regimeClass;
  const truth = await truthFor(cls, { readers: { time: ctx.time, frames: ctx.frames }, fromDay: from, toDay: new Date(hi + 5 * DAY_MS).toISOString().slice(0, 10), log });
  const mine = byObject.get(norad) ?? [];
  const o = new Q2Object({ ctx, norad, cls, sets: mine, truth });
  const W = q2train.classes[cls].weights.secondMomentRtn;
  const corr = q2train.classes[cls].correlation;
  const ownRho = (dtH, a) => rho(corr.form, corr.fits[['R', 'T', 'N', 'dR', 'dT', 'dN'][a]][corr.form], dtH);
  const e2bOf = e2b ? e2bRho(e2b, cls) : null;
  const agom = m.regimeClass === 'LEO-PL' ? config.physical.planetFamilies[m.family] : config.physical.crAreaOverMass[String(norad)];
  const maxSpanDays = Math.max(...P.candidates[cls].spanDays);
  const products = productsOf(cls);
  const j = allIndex.get(norad);
  for (let t = lo + (test ? (j % stride) * DAY_MS : 0); t <= hi + DAY_MS - 1 && done < limit; t += stride * DAY_MS) {
    await throttle(log);
    let k = -1;
    for (let i = 0; i < mine.length && mine[i].epochMs <= t; ++i) if (mine[i].createdMs <= t) k = i;
    if (k < 0 || t - mine[k].epochMs > P.sampleMaxAgeDays * DAY_MS) continue;
    const set = mine[k];
    if (doneKeys.has(`${norad}|${t}`)) { ++done; continue; }
    const targets = P.horizonsHours.map((h) => {
      const at = set.epochMs + h * HOUR_MS;
      const s = cls === 'LEO-PL'
        ? (h === 0 ? truth.firstAtOrAfter(norad, at, config.regimes['LEO-PL'].toleranceSeconds * 1000) : h >= 24 ? truth.nearestIn(norad, at, at - half, at + half) : null)
        : truth.firstAtOrAfter(norad, at, P.targetToleranceSeconds * 1000);
      return s ? { h, ms: s.ms, epoch: s.epoch, r: s.r, v: s.v, file: s.entry.file } : { h, missing: true };
    });
    if (targets.every((x) => x.missing)) continue;
    await targetAxes(ctx, targets);
    const sample = { norad, cls, family: m.family ?? null, scheduledMs: t, gpId: set.gpId, index: k, epochMs: set.epochMs, cutoffMs: set.createdMs, targets };
    const out = { S: await sgp4Product(ctx, truth, set, targets) };
    let corrections = null;
    if (test) {
      corrections = await corrector(norad, mine, mine.filter((s) => s.createdMs <= sample.cutoffMs && s.epochMs > sample.epochMs - (maxSpanDays + 1) * DAY_MS && s.epochMs <= sample.epochMs));
      out['S-corr'] = corrections.has(set.gpId) ? await sgp4Product(ctx, truth, set, targets, corrections.get(set.gpId)) : { failure: 'no covariates for the correction' };
    }
    let a00 = null;
    for (const p of products) {
      let spec = { ...p };
      if (p.corrected) spec.corrected = corrections;
      if (p.e13) {
        a00 ??= await e13.at(sample.cutoffMs, sample.epochMs - (maxSpanDays + 1) * DAY_MS, sample.epochMs + 4 * DAY_MS);
        if (!a00) { out[p.id] = { failure: 'no E13 arc available for the nowcast' }; continue; }
        spec.a00 = a00.a00;
      }
      const rhoOf = p.weighting === 'gls-e2b' ? (dtH, a) => (a < 3 ? e2bOf(dtH, a) : ownRho(dtH, a)) : ownRho;
      const weights = p.corrected ? selection.q2.correctedWeights[cls] : W;
      out[p.id] = await arcProduct(o, sample, spec, { W: weights, rhoOf, agom, maxSpanDays });
      if (p.e13 && out[p.id].info) out[p.id].info.e13 = a00.info;
    }
    const row = { ...sample, targets: targets.map(({ h, ms, missing }) => ({ h, ms: ms ?? null, missing: !!missing })), products: Object.fromEntries(Object.entries(out).map(([id, r]) => [id, { errors: r.errors ?? null, d2: r.d2 ?? null, failure: r.failure ?? null, info: r.info ?? null }])) };
    fs.appendFileSync(partial, `${JSON.stringify(row)}\n`);
    run.checkpoint();
    ++done;
    log(`${norad} ${new Date(t).toISOString().slice(0, 10)}: ${Object.entries(out).map(([id, r]) => `${id}${r.failure ? ' FAILED' : ''}`).join(', ')}`);
  }
  truth.dropCache();
  if (done >= limit) break;
}
const lines = fs.existsSync(partial) ? fs.readFileSync(partial, 'utf8').split('\n').filter(Boolean) : [];
const file = run.write('q2.jsonl.gz', zlib.gzipSync(lines.join('\n')));
run.finish({ window, shard: values.shard, samples: lines.length, output: path.relative(repoRoot, file) });
log(`done: ${lines.length} samples`);
await ctx.destroy();
