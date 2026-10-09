#!/usr/bin/env node
// E7 step 20 (PLAN.md section 4): every prediction of every scheduled sample
// of a window, scored against truth at the horizons. One shard of the
// samples per process; per-sample rows go to runs/ (they derive from element
// sets).
//
//   node experiments/e7-full-force-handoff/steps/20-run.mjs --window validation|test|dev --batch ID --shard i/n
//        --weights results/e7/train/weights.json [--resume RUN_ID] [--limit N] [--regimes A,B]
import fs from 'node:fs';
import path from 'node:path';
import { startRun } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { DAY_MS, cli, config, configPath, context, coefficients, regimeTruth, schedule, setsByObjectOf, windowSets } from '../common.mjs';
import { epochStates, fitArc, hpopErrors, sgp4Errors, targetAxes, withParameters } from '../methods.mjs';
import { readGpsMetadata } from '../gnss.mjs';
import { correctSets, loadE1Model } from '../e1.mjs';

const { values, freezeCommit, window, modules, archive, reference: referenceDir, regimes } = cli({
  batch: { type: 'string' }, shard: { type: 'string', default: '0/1' }, weights: { type: 'string' }, resume: { type: 'string' }, limit: { type: 'string' },
});
if (!values.batch) throw new Error('--batch is required (names the shards of one run)');
if (!values.weights) throw new Error('--weights (the train window weights.json) is required');
const [shard, shards] = values.shard.split('/').map(Number);
const chosen = config.chosen;
if (window.name === 'test' && !chosen) throw new Error('config.json has no `chosen` (step 30 on validation) at the freeze');
const run = startRun({ experiment: config.experiment, step: `20-run-${window.name}-${values.batch}-s${shard}of${shards}`, configPath, modulesDir: modules, args: values, resume: values.resume });
run.manifest.freezeCommit = freezeCommit;
const log = (...a) => console.log(`[${run.id}]`, ...a);

const weightsBytes = fs.readFileSync(path.resolve(values.weights));
if (chosen && chosen.weightsSha256 !== sha256(weightsBytes)) throw new Error(`${values.weights} is not the weights.json config.json pins`);
run.addInputs('weights', { [path.basename(values.weights)]: sha256(weightsBytes) });
const weights = JSON.parse(weightsBytes);

const ctx = await context(modules, run, { estimation: true });
const truth = regimeTruth(referenceDir, regimes);
const objects = new Set(Object.values(truth).flatMap((t) => t.objects));
const { sets, files } = windowSets(archive, window, objects, Math.max(...config.arcSpansDays) + 2);
run.addInputs('gpHistory', files);
const byObject = setsByObjectOf(sets);
const all = schedule(window, truth, byObject);
const mine = all.filter((_, i) => i % shards === shard);
log(`${all.length} samples in the window; shard ${shard}/${shards}: ${mine.length}`);
run.manifest.samples = { window: all.length, shard: mine.length };

const e1 = regimes.includes('GPS') ? loadE1Model(run) : null;
const gnss = regimes.includes('GPS') ? readGpsMetadata(config.inputs.gnssMetadata) : null;
if (gnss) run.addInputs('gnssMetadata', { [path.basename(config.inputs.gnssMetadata)]: gnss.sha256 });
const rowsFile = path.join(run.dir, 'samples.jsonl');
const done = new Set(fs.existsSync(rowsFile) ? fs.readFileSync(rowsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).gpId) : []);
const keep = (row) => fs.appendFileSync(rowsFile, `${JSON.stringify(row)}\n`);

// Epoch states (and E1-corrected sets and their epoch states) per object, cached.
const cache = new Map();
async function objectStates(norad, corrected) {
  const key = `${norad}|${corrected}`;
  if (!cache.has(key)) {
    let list = byObject.get(norad);
    if (corrected) list = await correctSets(ctx, e1, list);
    cache.set(key, { sets: list, states: await epochStates(ctx['epoch-state'], list) });
  }
  return cache.get(key);
}

const spansFor = (name) => (window.name === 'test' ? [chosen.spanDays[name]] : config.arcSpansDays);
const bRulesFor = (name) => {
  if (!config.regimes[name].forces.drag) return ['bstar'];
  return window.name === 'test' ? [chosen.bRule[name], ...config.bRules.filter((r) => r !== chosen.bRule[name])] : config.bRules;
};

let count = 0;
for (const sample of mine) {
  if (done.has(sample.gpId)) continue;
  const name = sample.regime, regime = config.regimes[name], forces = regime.forces;
  const products = truth[name].products;
  const row = { regime: name, norad: sample.norad, gpId: sample.gpId, epoch: sample.epoch, scheduled: sample.scheduled,
    targets: sample.targets.map((t) => (t.missing ? { h: t.h, missing: true } : { h: t.h, epoch: t.epoch })), errors: {}, failures: {}, fits: {}, seconds: {} };
  const timed = async (variant, f) => {
    const t0 = performance.now();
    try { row.errors[variant] = await f(); } catch (error) { row.failures[variant] = String(error.message).slice(0, 300); }
    row.seconds[variant] = Math.round((performance.now() - t0) / 100) / 10;
  };
  await targetAxes(ctx, sample.targets);
  const { sets: plain, states } = await objectStates(sample.norad, false);
  const set = plain[sample.index];
  const state0 = states[sample.index];
  const bValues = coefficients(name, sample.norad, set, 'bstar', gnss);
  row.coefficients = { agom: bValues.agom, bstarB: bValues.bstarB, nominalB: bValues.nominalB, bstar: set.elements.BSTAR, boxWing: bValues.boxWing ?? null, gpsBlock: bValues.gpsBlock ?? null };

  await timed('S', async () => {
    const r = await sgp4Errors(ctx, products, set, sample.targets);
    row.sCounts = r.counts;
    return r.errors;
  });

  const hpopFrom = (initial, coeffs, f = forces, persist = null) => hpopErrors(ctx, initial, sample.epochMs, sample.targets, f, coeffs, persist);
  // H-epoch: the handoff contract, per B rule.
  const bRules = bRulesFor(name);
  for (const rule of bRules) {
    const label = regime.forces.drag ? (window.name === 'test' && rule === bRules[0] ? 'H-epoch' : `H-epoch:${rule}`) : 'H-epoch';
    if (!state0) { row.failures[label] = 'analysis/epoch-state refused the set'; continue; }
    await timed(label, () => hpopFrom(state0, coefficients(name, sample.norad, set, rule, gnss)));
  }
  const epochCoefficients = coefficients(name, sample.norad, set, window.name === 'test' ? bRules[0] : 'bstar', gnss);

  if (window.name !== 'validation' && state0) {
    // H-truth: the same forces from the truth state at the first target (dynamics only).
    const t0 = sample.targets[0];
    if (!t0.missing) await timed('H-truth', () => hpopErrors(ctx, { epoch: t0.epoch.replace(/Z$/, ''), state: [...t0.r, ...t0.v].map((x) => x * 1000) }, t0.ms, sample.targets, forces, epochCoefficients));
    if (forces.drag) {
      await timed('H-epoch-NRLMSISE', () => hpopFrom(state0, epochCoefficients, { ...forces, atmosphere: 'NRLMSISE00' }));
      await timed('H-epoch-persist', () => hpopFrom(state0, epochCoefficients, forces, sample.epochMs));
    }
  }

  // H-arc: state (and coefficients) fitted to the arc's epoch states.
  const arc = async (label, corrected, spanDays, weightKey) => {
    const { sets: arcSets, states: arcStates } = await objectStates(sample.norad, corrected);
    const reference = arcStates[sample.index];
    if (!reference) { row.failures[label] = 'analysis/epoch-state refused the set'; return; }
    const used = [];
    for (let i = 0; i <= sample.index; ++i) if (arcStates[i] && sample.epochMs - arcSets[i].epochMs <= spanDays * DAY_MS) used.push(arcStates[i]);
    if (used.length < config.arcMinimumSets) { row.failures[label] = `too few element sets (${used.length})`; return; }
    const parameters = regime.arcParameters.map((p) => ({ kind: p.kind, value: p.kind === 'DRAG_AREA_OVER_MASS' ? bValues.bstarB : p.kind === 'SRP_AREA_OVER_MASS' ? bValues.agom : 0 }));
    const n = 6 + parameters.length;
    const apriori = Array(n * n).fill(0);
    config.fit.aprioriStateSigma.forEach((s, i) => { apriori[i * n + i] = s * s; });
    regime.arcParameters.forEach((p, i) => { apriori[(6 + i) * n + 6 + i] = p.sigma * p.sigma; });
    const fixed = { agom: bValues.agom, b: bValues.bstarB, ...(bValues.boxWing ? { boxWing: bValues.boxWing } : {}) };
    const settings = { parameters, apriori, covarianceRtn: weights.regimes[name][weightKey].secondMomentRtn, forces, fixed };
    const t0 = performance.now();
    try {
      const r = await fitArc(ctx, reference, sample.epochMs, used, settings);
      const fitInfo = { sets: used.length, status: r.status, hpopCalls: r.hpopCalls, iterations: r.fit?.iterations, converged: r.fit?.converged, reducedChiSquare: r.fit?.reducedChiSquare, parameters: r.fit?.estimate?.slice(6) };
      row.fits[label] = fitInfo;
      if (!r.fit?.converged) { row.failures[label] = `fit not converged (status ${r.status})`; return; }
      const coeffs = withParameters(fixed, parameters, r.fit.estimate.slice(6));
      row.errors[label] = await hpopErrors(ctx, { epoch: reference.epoch, state: r.fit.estimate.slice(0, 6) }, sample.epochMs, sample.targets, forces, coeffs);
    } catch (error) {
      row.failures[label] = String(error.message).slice(0, 300);
    }
    row.seconds[label] = Math.round((performance.now() - t0) / 100) / 10;
  };
  for (const span of spansFor(name)) await arc(window.name === 'test' ? 'H-arc' : `H-arc:${span}d`, false, span, 'S');

  // E1-corrected element sets (GPS).
  if (regime.e1 && window.name !== 'validation') {
    const { sets: cSets, states: cStates } = await objectStates(sample.norad, true);
    const cSet = cSets[sample.index];
    row.e1CorrectionSeconds = cSet.correctionSeconds;
    await timed('S-E1', async () => (await sgp4Errors(ctx, products, cSet, sample.targets)).errors);
    if (cStates[sample.index]) await timed('H-epoch-E1', () => hpopFrom(cStates[sample.index], epochCoefficients));
    else row.failures['H-epoch-E1'] = 'analysis/epoch-state refused the set';
    for (const span of spansFor(name)) await arc(window.name === 'test' ? 'H-arc-E1' : `H-arc-E1:${span}d`, true, span, 'S-E1');
  }

  keep(row);
  products.dropCache();
  if (++count % 10 === 0) { run.addInputs('reference', products.read); run.checkpoint(); log(`${count} samples`); }
  if (values.limit && count >= Number(values.limit)) break;
}
for (const t of Object.values(truth)) run.addInputs('reference', t.products.read);
run.finish({ samplesWritten: count });
log(`${count} samples -> ${path.relative(process.cwd(), rowsFile)}`);
await ctx.destroy();
