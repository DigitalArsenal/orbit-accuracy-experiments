#!/usr/bin/env node
// E7 step 10 (PLAN.md section 5): the at-epoch errors of every OMM of the
// window's objects (the 6-vector [R, T, N, dR, dT, dN] of SGP4 minus truth at
// the first truth state within the tolerance after the epoch, by
// analysis/gp-error-model, in the truth state's RTN axes), and from them:
//  - train: the pseudo-observation weights of the arc fits, the second moment
//    about zero after a 5 robust-sigma clip per component (E2's convention),
//    for published and (GPS) E1-corrected OMMs -> weights.json;
//  - train and validation: the correlation of two OMMs' errors against the
//    time between their epochs, per component, and on train its fitted forms
//    -> correlation.json.
// Per-OMM errors stay in runs/ (they derive from element sets).
//
//   node experiments/e7-full-force-handoff/steps/10-train.mjs --window train|validation
import zlib from 'node:zlib';
import { startRun } from '../../../harness/provenance.mjs';
import { json } from '../../../harness/modules.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { median } from '../../../harness/stats.mjs';
import { DAY_MS, cli, config, configPath, context, regimeTruth, setsByObjectOf, windowSets } from '../common.mjs';
import { correctSets, loadE1Model } from '../e1.mjs';
import { COMPONENTS, empiricalCorrelation, fitForm } from '../correlation.mjs';

const { values, window, modules, archive, reference: referenceDir, regimes } = cli();
if (window.name === 'test') throw new Error('step 10 reads dev, train or validation only');
const run = startRun({ experiment: config.experiment, step: `10-train-${window.name}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const ctx = await context(modules, run);
const truth = regimeTruth(referenceDir, regimes);
const objects = new Set(Object.values(truth).flatMap((t) => t.objects));
const { sets, files } = windowSets(archive, window, objects, 0);
run.addInputs('gpHistory', files);
const byObject = setsByObjectOf(sets);
const lo = Date.parse(`${window.from}T00:00:00Z`), hi = Date.parse(`${window.to}T00:00:00Z`) + DAY_MS;
const tol = config.targetToleranceSeconds * 1000, half = config.binHalfWidthSeconds / 86400;

async function atEpoch(products, set) {
  const s = products.firstAtOrAfter(set.norad, set.epochMs, tol);
  if (!s) return null;
  const age = (s.ms - set.epochMs) / DAY_MS;
  const acc = await ctx['gp-error-model'].invokeJson('accumulate', [ommFrame([set]), products.frame(s.entry), json('options', { ageBinsDays: [[Math.max(0, age - half), age + half]], referenceStepSeconds: 0 })], 'accumulator');
  const one = acc.strata.filter((x) => x.n === 1);
  return one.length === 1 ? one[0].sum.map((v) => v * 1000) : null;
}

function moment(errors) {
  const c = config.weights;
  const centre = [0, 1, 2, 3, 4, 5].map((k) => median(errors.map((e) => e[k])));
  const scale = [0, 1, 2, 3, 4, 5].map((k) => c.madScale * median(errors.map((e) => Math.abs(e[k] - centre[k]))));
  const kept = errors.filter((e) => e.every((x, k) => Math.abs(x - centre[k]) <= c.clipRobustSigma * scale[k]));
  const m = Array(36).fill(0);
  for (const e of kept) for (let i = 0; i < 6; ++i) for (let j = 0; j < 6; ++j) m[6 * i + j] += e[i] * e[j] / kept.length;
  return { n: errors.length, kept: kept.length, secondMomentRtn: m, sigma: [0, 1, 2, 3, 4, 5].map((k) => Math.sqrt(m[7 * k])) };
}

const e1 = regimes.includes('GPS') ? loadE1Model(run) : null;
const weights = { window, regimes: {} };
const correlation = { window, lagBinsHours: config.correlation.lagBinsHours, forms: config.correlation.forms, regimes: {} };
const records = [];
for (const [name, { products, objects: list }] of Object.entries(truth)) {
  const variants = { S: [] };
  if (config.regimes[name].e1) variants['S-E1'] = [];
  const objs = { S: new Set(), 'S-E1': new Set() };
  for (const norad of list) {
    const mine = (byObject.get(norad) ?? []).filter((s) => s.epochMs >= lo && s.epochMs < hi);
    const corrected = variants['S-E1'] && mine.length ? await correctSets(ctx, e1, mine) : null;
    for (let i = 0; i < mine.length; ++i) {
      const e = await atEpoch(products, mine[i]);
      if (e) { variants.S.push({ norad, epochMs: mine[i].epochMs, e }); objs.S.add(norad); records.push({ regime: name, variant: 'S', norad, gpId: mine[i].gpId, epochMs: mine[i].epochMs, e }); }
      if (corrected) { const c = await atEpoch(products, corrected[i]); if (c) { variants['S-E1'].push({ norad, epochMs: mine[i].epochMs, e: c }); objs['S-E1'].add(norad); } }
    }
    products.dropCache();
    run.addInputs('reference', products.read);
  }
  weights.regimes[name] = Object.fromEntries(Object.entries(variants).map(([v, rs]) => [v, { ...moment(rs.map((r) => r.e)), objects: objs[v].size }]));
  const empirical = empiricalCorrelation(variants.S, config.correlation.lagBinsHours, config.weights);
  const fits = window.name === 'validation' ? null : Object.fromEntries(COMPONENTS.map((c) => [c, Object.fromEntries(config.correlation.forms.map((f) => [f, fitForm(f, empirical.components[c])]))]));
  correlation.regimes[name] = { empirical, fits };
  log(name, Object.entries(weights.regimes[name]).map(([v, m]) => `${v}: n ${m.n} (${m.objects} objects), sigma RTN ${m.sigma.slice(0, 3).map((x) => x.toFixed(0)).join('/')} m`).join('; '),
    fits ? `| tau (h) exponential R/T/N ${['R', 'T', 'N'].map((c) => fits[c].exponential.tauHours.toFixed(1)).join('/')}` : '');
}
if (window.name !== 'validation') run.write('weights.json', weights);
run.write('correlation.json', correlation);
run.write('at-epoch.jsonl.gz', zlib.gzipSync(records.map((r) => JSON.stringify(r)).join('\n')));
run.finish({ outputs: [...(window.name !== 'validation' ? ['weights.json'] : []), 'correlation.json'] });
await ctx.destroy();
