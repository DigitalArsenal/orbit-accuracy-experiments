// Stage C (PLAN section 4): the fresh window is collected and every candidate, with its frozen final fit, is scored. Runs only after the
// selection is pushed; nothing here fits, selects or tunes.
import fs from 'node:fs';
import path from 'node:path';
import { dayList } from '../../harness/gp-archive.mjs';
import { candidatesOf, scoreArcs, cellsOf, countRealistic } from './cv.mjs';
import { compactCell, scoresJsonl } from './train.mjs';
import { diagnostics } from '../v1c3-console-covariance-calibration/report.mjs';
import { flagSummary } from '../v1c4-console-covariance-calibration/test.mjs';

export const POOLED = 'ALL CLASSES';
export const EXTREME_D2_OVER_3 = 1e4;
const safe = name => name.replace(/[/|]/g, '_');
export const scoresFile = name => `test-${safe(name)}-scores.jsonl`;

// Cells of the populations of a candidate's scored arcs: all, unflagged, flagged (by class, and pooled by horizon), and every tier by horizon.
export function views(scored, flags, configs) {
  const flaggedArcs = scored.filter(a => flags.get(a.key));
  const pooledConfigs = { ...configs, e3: { ...configs.e3, regimes: { [POOLED]: {} } } };
  return { all: cellsOf(scored, configs), unflagged: cellsOf(scored.filter(a => !flags.get(a.key)), configs),
    flaggedPooled: tablesPooled(flaggedArcs, pooledConfigs) };
}
const tablesPooled = (arcs, configs) => cellsOf(arcs.map(a => ({ ...a, group: POOLED })), configs);
export const summaryOf = (candidate, v) => {
  const counts = Object.fromEntries(Object.entries(v).map(([k, cells]) => [k, countRealistic(cells)]));
  const claimedView = candidate.claim === 'UNFLAGGED' ? 'unflagged' : 'all';
  return { name: candidate.name, claim: candidate.claim, claimedView, realistic: { ...counts, claimed: counts[claimedView] },
    cells: Object.fromEntries(Object.entries(v).map(([k, cells]) => [k, cells.map(compactCell)])) };
};
export function countsOf(arcs) {
  return { arcs: arcs.length, skipped: arcs.filter(a => a.skipped).length, samples: arcs.reduce((n, a) => n + (a.samples?.length ?? 0), 0), missingHorizons: arcs.reduce((n, a) => n + a.missingHorizons.length, 0) };
}

// Everything the README, metrics.json and table.json report, from the recorded arcs, flags and scores (shared by the test stage and --check).
export function deriveMetrics({ config, configs, spec, registration, sel, arcs, flagRecords, scoredBy }) {
  const flags = new Map(flagRecords.map(r => [r.key, r.flagged]));
  const metrics = { registration, window: config.windows.test, counts: countsOf(arcs), flags: flagSummary(flagRecords), selected: sel.selected, candidates: {} };
  for (const c of candidatesOf(spec)) metrics.candidates[c.name] = summaryOf(c, views(scoredBy[c.name], flags, configs));
  // Who carries the squared Mahalanobis distance of each class under the selected candidate (all arcs, object aggregates only).
  metrics.concentration = {};
  for (const group of ['GPS', 'SLR MEO']) metrics.concentration[group] = diagnostics(scoredBy[sel.selected].filter(a => a.group === group));
  metrics.extremes = [];
  const rows = new Map();
  for (const a of scoredBy[sel.selected]) for (const sample of a.samples) {
    const d2 = sample.score?.d2Predicted;
    if (!(d2 / 3 > EXTREME_D2_OVER_3)) continue;
    const key = `${a.group}|${a.norad}`, r = rows.get(key) ?? { group: a.group, object: a.norad, samples: 0, flagged: 0, maxD2Over3: 0, maxErrorKm: 0, epochs: new Set() };
    r.samples++; if (flags.get(a.key)) r.flagged++;
    r.maxD2Over3 = Math.max(r.maxD2Over3, d2 / 3); r.maxErrorKm = Math.max(r.maxErrorKm, Math.hypot(...sample.score.errorRtn) / 1000); r.epochs.add(sample.ms);
    rows.set(key, r);
  }
  metrics.extremes = [...rows.values()].map(({ epochs, ...r }) => ({ ...r, truthEpochs: epochs.size })).sort((x, y) => y.maxD2Over3 - x.maxD2Over3);
  return metrics;
}

export async function runTest({ ctx }) {
  const { root, run, runDir, runtime, config, configs, e3, spec, gp, codec, output, registration, U, noteSets, noteTruth, elementSets, pairsOf, jobOf, groupBy, collect, eventFlags } = ctx;
  const sel = JSON.parse(fs.readFileSync(path.join(output, 'selection.json'), 'utf8'));
  const truth = U.refreshed, testDays = dayList(...config.windows.test);
  const loaded = elementSets({ e3, days: testDays, keep: n => truth.regime.has(n), epochLookbackDays: config.events.lookbackDays + 5 });
  noteSets(loaded);
  const bySet = groupBy(loaded.sets, s => s.norad), byHistory = groupBy(loaded.history, s => s.norad);
  const pairs = pairsOf(truth, testDays);
  const [flagRecords, arcs] = await Promise.all([
    eventFlags({ run, runtime, config, e3, name: 'events-test', pairs, setsByObject: bySet, workers: 6 }),
    collect({ root, run, runtime, name: 'test-sgp', phase: 'sgp', pairs, config, jobFor: pair => jobOf({ e3, config, truth, bySet, byHistory, pair, window: {} }) })]);
  noteTruth(truth);
  const records = new Map(flagRecords.map(r => [r.key, r]));
  const scoredBy = {};
  for (const c of candidatesOf(spec)) {
    scoredBy[c.name] = await scoreArcs({ gp, codec, model: sel.models[c.name].model, arcs, base: c.base, tiering: c.tiering, flagRecords: records, spec });
    run.write(scoresFile(c.name), scoresJsonl(scoredBy[c.name]));
  }
  const metrics = deriveMetrics({ config, configs, spec, registration, sel, arcs, flagRecords, scoredBy });
  for (const [name, c] of Object.entries(metrics.candidates)) console.log(`test ${name}: claimed ${c.realistic.claimed}/24 (all ${c.realistic.all}, unflagged ${c.realistic.unflagged})`);
  run.manifest.finished = new Date().toISOString(); run.checkpoint();
  const { publish } = await import('./report.mjs');
  publish({ ctx, metrics, sel });
  return metrics;
}
