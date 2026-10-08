#!/usr/bin/env node
// E1 step 05, harness check A0.3 (PLAN.md §6): reproduce a published result.
//
// analysis/gp-error-model/docs/truth-2026-08.json is the module's own
// published SGP4-error statistics against reference states (reference
// 2026-08-09..15, element sets created 2026-08-02..16, 5 robust-sigma clip,
// two passes). This step rebuilds it through this repository's readers and
// framing and compares every stratum. Equal statistics mean the harness feeds
// the module the same inputs the published run did.
//
//   node experiments/e1-gps-epoch/steps/05-reproduce-truth.mjs [--modules DIR] [--archive DIR] [--reference DIR]
import fs from 'node:fs';
import path from 'node:path';
import { json, loadModule } from '../../../harness/modules.mjs';
import { readCreationDays, shiftDay } from '../../../harness/gp-archive.mjs';
import { referenceFramesStartingIn } from '../../../harness/reference.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { startRun } from '../../../harness/provenance.mjs';
import { cli, config, configPath } from '../common.mjs';

const { values, modules, archive, reference } = cli();
const run = startRun({ experiment: config.experiment, step: '05-reproduce-truth', configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);

const publishedFile = path.join(modules, 'analysis/gp-error-model/docs/truth-2026-08.json');
const published = JSON.parse(fs.readFileSync(publishedFile, 'utf8'));
const [refFrom, refTo] = published.window.reference;
const [creationFrom, creationTo] = published.window.creation;

// The published run's selections (scripts/archive.mjs, scripts/build-model.mjs).
const lo = Date.parse(`${refFrom}T00:00:00Z`) - 3600000, hi = Date.parse(`${shiftDay(refTo, 1)}T00:00:00Z`);
const ref = referenceFramesStartingIn(reference, lo, hi);
const { sets, files } = readCreationDays(archive, creationFrom, creationTo, { keep: (n) => ref.objects.has(n) });
run.addInputs('gpHistory', files);
run.addInputs('reference', ref.read);
log(`${sets.length} element sets created ${creationFrom}..${creationTo}; ${ref.frames.length} reference blocks for ${ref.objects.size} objects`);

const gpModel = await loadModule(modules, 'analysis/gp-error-model');
run.addModule(gpModel.provenance);
const elements = ommFrame(sets);

// Two passes: the second clips at k robust sigma about the first's medians
// (scripts/archive.mjs `twoPasses`, k = 5).
const k = 5;
const accumulate = (extra) => gpModel.invokeJson('accumulate', [elements, ...ref.frames, ...extra], 'accumulator');
const finalize = (acc) => gpModel.invokeJson('finalize', [json('accumulator', acc)], 'model');
const first = await finalize(await accumulate([]));
const clip = { k, strata: first.strata.filter((s) => s.n > 1).map((s) => ({
  regime: s.regimeIndex, age: s.ageIndex, centre: s.median.slice(0, 3), scale: s.robustSigma.slice(0, 3).map((x) => Math.max(x, 1e-6)) })) };
const truth = await finalize(await accumulate([json('options', { clip })]));

// Compare every stratum's count, mean and covariance, raw and clipped.
const relative = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300);
let worst = 0, compared = 0;
const mismatches = [];
for (const p of published.strata) {
  const r = truth.strata.find((s) => s.regimeIndex === p.regimeIndex && s.ageIndex === p.ageIndex);
  if (!r) { mismatches.push({ regime: p.regime, ageDays: p.ageDays, reason: 'missing' }); continue; }
  if (r.n !== p.n || (r.clipped?.n ?? null) !== (p.clipped?.n ?? null)) mismatches.push({ regime: p.regime, ageDays: p.ageDays, n: [r.n, p.n], clippedN: [r.clipped?.n, p.clipped?.n] });
  for (const [a, b] of [[r.mean, p.mean], [r.covariance, p.covariance], [r.clipped?.mean, p.clipped?.mean], [r.clipped?.covariance, p.clipped?.covariance]]) {
    if (!a || !b) continue;
    a.forEach((x, i) => { worst = Math.max(worst, relative(x, b[i])); ++compared; });
  }
}
const limit = config.acceptance.a0.sumRelative;
const check = {
  description: 'rebuilds analysis/gp-error-model/docs/truth-2026-08.json through this harness',
  published: path.relative(modules, publishedFile),
  strata: published.strata.length,
  valuesCompared: compared,
  worstRelative: worst,
  limit,
  countMismatches: mismatches,
  counts: { reproduced: truth.counts, published: published.counts },
  pass: mismatches.length === 0 && worst <= limit && truth.counts.samples === published.counts.samples,
};
run.write('metrics.json', { checks: { 'A0.3': check } });
run.finish();
log(`A0.3 ${check.pass ? 'PASS' : 'FAIL'}: ${published.strata.length} strata, ${compared} values, worst relative difference ${worst.toExponential(2)}; ` +
  `samples ${truth.counts.samples} vs ${published.counts.samples}; ${mismatches.length} count mismatches`);
await gpModel.destroy();
if (!check.pass) process.exitCode = 1;
