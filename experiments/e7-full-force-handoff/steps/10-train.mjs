#!/usr/bin/env node
// E7 step 10 (PLAN.md section 5): the train window's at-epoch error second
// moment of SGP4 per regime, the weight of H-arc's pseudo-observations. For
// every element set of a regime's objects with its epoch in the window, the
// 6-vector error [R, T, N, dR, dT, dN] (analysis/gp-error-model, truth state's
// RTN axes) at the first truth state within the tolerance after the epoch;
// components clipped at 5 robust sigma; second moment about zero (E2's
// convention). GPS also for E1-corrected sets. Writes weights.json.
//
//   node experiments/e7-full-force-handoff/steps/10-train.mjs --window train
import path from 'node:path';
import { startRun } from '../../../harness/provenance.mjs';
import { json } from '../../../harness/modules.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { median } from '../../../harness/stats.mjs';
import { DAY_MS, cli, config, configPath, context, regimeTruth, setsByObjectOf, windowSets } from '../common.mjs';
import { correctSets, loadE1Model } from '../e1.mjs';

const { values, window, modules, archive, reference: referenceDir, regimes } = cli();
if (window.name === 'test') throw new Error('step 10 reads train or dev only');
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
  return { n: errors.length, kept: kept.length, objects: null, secondMomentRtn: m, sigma: [0, 1, 2, 3, 4, 5].map((k) => Math.sqrt(m[7 * k])) };
}

const e1 = regimes.includes('GPS') ? loadE1Model(run) : null;
const out = { window, regimes: {} };
for (const [name, { products, objects: list }] of Object.entries(truth)) {
  const variants = { S: [] };
  if (config.regimes[name].e1) variants['S-E1'] = [];
  const objs = { S: new Set(), 'S-E1': new Set() };
  for (const norad of list) {
    const mine = (byObject.get(norad) ?? []).filter((s) => s.epochMs >= lo && s.epochMs < hi);
    const corrected = variants['S-E1'] && mine.length ? await correctSets(ctx, e1, mine) : null;
    for (let i = 0; i < mine.length; ++i) {
      const e = await atEpoch(products, mine[i]);
      if (e) { variants.S.push(e); objs.S.add(norad); }
      if (corrected) { const c = await atEpoch(products, corrected[i]); if (c) { variants['S-E1'].push(c); objs['S-E1'].add(norad); } }
    }
    products.dropCache();
    run.addInputs('reference', products.read);
  }
  out.regimes[name] = Object.fromEntries(Object.entries(variants).map(([v, errs]) => [v, { ...moment(errs), objects: objs[v].size }]));
  log(name, Object.entries(out.regimes[name]).map(([v, m]) => `${v}: n ${m.n} (${m.objects} objects), sigma RTN ${m.sigma.slice(0, 3).map((x) => x.toFixed(0)).join('/')} m, ${m.sigma.slice(3).map((x) => x.toFixed(3)).join('/')} m/s`).join('; '));
}
run.write('weights.json', out);
run.finish({ weights: path.join(run.dir, 'weights.json') });
await ctx.destroy();
