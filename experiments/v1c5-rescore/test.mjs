// Stage C (PLAN section 8): flags and arcs for the test window on the extended truth, one scoring of the frozen model, then G, T, Q. Nothing here fits.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { dayList } from '../../harness/gp-archive.mjs';
import { scoreArcs } from '../v1c5/cv.mjs';
import { deriveMetrics as ruleMetrics } from '../v1c5/test.mjs';
import { scoresJsonl } from '../v1c5/train.mjs';
import { base, configs, e3, config, frozenName, frozenSpec, registration, scoresFile, read, root, roundTrip } from './common.mjs';
import { criterion, samplesOf } from './criterion.mjs';

// Everything the README, metrics.json and table.json report, from the recorded arcs, flags, scores and fits (shared by the test stage and --check).
export function deriveMetrics({ arcs, flagRecords, scored, fits }) {
  const rule = ruleMetrics({ config: base, configs, spec: frozenSpec(), registration, sel: { selected: frozenName }, arcs, flagRecords, scoredBy: { [frozenName]: scored } });
  const flags = new Map(flagRecords.map(r => [r.key, r.flagged]));
  const metrics = { registration, window: base.windows.test, counts: rule.counts, flags: rule.flags, frozenModel: frozenName, gaussianRule: rule.candidates[frozenName],
    concentration: rule.concentration, extremes: rule.extremes, criterion: criterion(samplesOf(scored, flags), fits) };
  metrics.controls = controls(metrics, read(path.join(root, config.frozenModel.metrics.file)));
  return metrics;
}

// PLAN section 7: the cells that no new truth touched equal V1c5's; the LEO 400-800 km cells are reported against V1c5's.
export function controls(metrics, v1c5) {
  const mine = metrics.gaussianRule.cells, theirs = v1c5.candidates[frozenName].cells, unchanged = config.truth.unchangedClasses ?? ['GPS', 'SLR LEO 800-1500 km', 'SLR MEO'];
  const differences = [];
  for (const view of ['all', 'unflagged']) for (const group of unchanged) {
    const a = roundTrip(mine[view].filter(x => x.group === group)), b = roundTrip(theirs[view].filter(x => x.group === group));
    if (JSON.stringify(a) !== JSON.stringify(b)) differences.push(`${view} ${group}`);
  }
  if (JSON.stringify(roundTrip(mine.flaggedPooled)) !== JSON.stringify(roundTrip(theirs.flaggedPooled))) differences.push('flaggedPooled');
  const leo = view => mine[view].filter(x => x.group === 'LEO 400-800 km').map(x => ({ hours: x.hours, n: x.n, objects: x.objects, before: { n: theirs[view].find(y => y.group === x.group && y.hours === x.hours).n, objects: theirs[view].find(y => y.group === x.group && y.hours === x.hours).objects } }));
  return { unchangedClasses: unchanged, differences, reproduced: differences.length === 0, leo400to800: { unflagged: leo('unflagged') } };
}

export async function runTest({ ctx }) {
  const { run, runDir, runtime, gp, codec, noteSets, noteTruth, U, elementSets, pairsOf, jobOf, groupBy, collect, eventFlags, model, fits, output } = ctx;
  const testDays = dayList(...base.windows.test);
  const loaded = elementSets({ e3, days: testDays, keep: n => U.regime.has(n), epochLookbackDays: base.events.lookbackDays + 5 });
  noteSets(loaded);
  const bySet = groupBy(loaded.sets, s => s.norad), byHistory = groupBy(loaded.history, s => s.norad);
  const pairs = pairsOf(U, testDays);
  const [flagRecords, arcs] = await Promise.all([
    eventFlags({ run, runtime, config: base, e3, name: 'events-test', pairs, setsByObject: bySet, workers: 6 }),
    collect({ root, run, runtime, name: 'test-sgp', phase: 'sgp', pairs, config: base, jobFor: pair => jobOf({ e3, config: base, truth: U, bySet, byHistory, pair, window: {} }) })]);
  noteTruth(U);
  const records = new Map(flagRecords.map(r => [r.key, r]));
  const chosen = frozenSpec().candidates[0];
  const scored = await scoreArcs({ gp, codec, model, arcs, base: chosen.base, tiering: chosen.tiering, flagRecords: records, spec: frozenSpec() });
  run.write(scoresFile, scoresJsonl(scored));
  const metrics = deriveMetrics({ arcs, flagRecords, scored, fits });
  assert(metrics.controls.reproduced, `the rescore differs from V1c5 where no truth was added: ${metrics.controls.differences.join(', ')}`);
  run.manifest.finished = new Date().toISOString(); run.checkpoint();
  const { publish } = await import('./report.mjs');
  publish({ ctx, metrics });
  void output;
  return metrics;
}
