#!/usr/bin/env node
// E7v2 step 00 (PLAN.md sections 3, 4): the OMM-only regimes' populations at
// the window's selection date, and the seeded draw of K objects per regime
// with their product times (config.json sampleSizes[window]). Counts go to
// population.json; the object lists and draws (catalog-derived) stay in
// draw.json in runs/.
//
//   node experiments/e7v2-omm-history-handoff/steps/00-populations.mjs --window validation [--k 150]
import path from 'node:path';
import { startRun } from '../../../harness/provenance.mjs';
import { readGnssMetadata } from '../../e7-full-force-handoff/gnss.mjs';
import { cli, config, configPath } from '../common.mjs';
import { draw, populations, seedOf } from '../classes.mjs';

const { values, window, modules, archive } = cli({ k: { type: 'string' } });
const sizes = config.sampleSizes[window.name] ?? config.sampleSizes.validation;
// Objects per regime: one number, or a number per regime (step 30's sizes).
const kOf = (regime) => {
  const k = Number(values.k ?? (typeof sizes.objectsPerRegime === 'object' ? sizes.objectsPerRegime[regime] : sizes.objectsPerRegime));
  if (!Number.isFinite(k) || k <= 0) throw new Error(`no objects for ${regime} in ${window.name} (config.json sampleSizes or --k)`);
  return k;
};
const run = startRun({ experiment: config.experiment, step: `00-populations-${window.name}`, configPath, modulesDir: modules, args: values });
const gnss = readGnssMetadata(config.inputs.gnssMetadata);
run.addInputs('gnssMetadata', { [path.basename(config.inputs.gnssMetadata)]: gnss.sha256 });
const { populations: pops, files } = populations(archive, window.selectionDate, gnss);
run.addInputs('gpHistory', files);
const counts = {}, draws = {};
for (const [regime, list] of Object.entries(pops)) {
  const bySub = {};
  for (const o of list) bySub[o.subclass] = (bySub[o.subclass] ?? 0) + 1;
  const k = Math.min(kOf(regime), list.length);
  draws[regime] = draw(list, k, window, { perObject: sizes.samplesPerObject ?? 2, minimumGapDays: sizes.minimumGapDays ?? 14 }, seedOf(window.name, regime));
  counts[regime] = { population: list.length, bySubclass: bySub, drawn: draws[regime].length, productTimes: draws[regime].reduce((a, o) => a + o.times.length, 0) };
  console.log(`[${run.id}] ${regime}: population ${list.length} (${Object.entries(bySub).map(([s, n]) => `${s} ${n}`).join(', ')}); drawn ${k}`);
}
run.write('population.json', { window: window.name, selectionDate: window.selectionDate, counts });
run.write('draw.json', { window: window.name, selectionDate: window.selectionDate, draws });
run.finish({ counts });
