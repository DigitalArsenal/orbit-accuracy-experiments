// Test stage (PLAN section 6): the fresh window is collected and every candidate, with its frozen final fit, is scored.
// Runs only after both selections are pushed; nothing here fits, selects or tunes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { dayList } from '../../harness/gp-archive.mjs';
import { sha256 } from '../../harness/modules.mjs';
import { candidatesOf, scoreArcs, cellsOf, countRealistic, claimed, SGP4, FFM } from './cv.mjs';
import { compactCell, scoresJsonl } from './train.mjs';
import { diagnostics } from '../v1c3-console-covariance-calibration/report.mjs';

const read = f => JSON.parse(fs.readFileSync(f));
export const POOLED = 'ALL CLASSES';

// Cells of the three populations of a candidate's scored arcs: all, unflagged, and flagged (by class, and pooled by horizon).
export function views(scored, flags, mode, configs) {
  const flaggedArcs = scored.filter(a => flags.get(a.key));
  const pooledConfigs = { ...configs, e3: { ...configs.e3, regimes: { [POOLED]: {} } } };
  return { all: cellsOf(scored, mode, configs), unflagged: cellsOf(scored.filter(a => !flags.get(a.key)), mode, configs),
    flaggedByClass: cellsOf(flaggedArcs, mode, configs), flaggedPooled: cellsOf(flaggedArcs.map(a => ({ ...a, group: POOLED })), mode, pooledConfigs) };
}
export const summaryOf = (candidate, v) => {
  const counts = Object.fromEntries(Object.entries(v).map(([k, cells]) => [k, countRealistic(cells)]));
  const claimedView = candidate.arm === 'UNFLAGGED' ? 'unflagged' : 'all';
  return { name: candidate.name, arm: candidate.arm, claimedView, realistic: { ...counts, claimed: counts[claimedView] },
    cells: Object.fromEntries(Object.entries(v).map(([k, cells]) => [k, cells.map(compactCell)])) };
};

export function countsOf(arcs) {
  return { arcs: arcs.length, skipped: arcs.filter(a => a.skipped).length, samples: arcs.reduce((n, a) => n + (a.samples?.length ?? 0), 0), missingHorizons: arcs.reduce((n, a) => n + a.missingHorizons.length, 0) };
}

export const referenceScores = 'test-SGP4-V1c3-F-coverage-scores.jsonl';
export const EXTREME_D2_OVER_3 = 1e4;

// Everything the README and metrics.json report, from the recorded arcs, flags and scores (shared by the test stage and --check).
export function deriveMetrics({ config, configs, registration, sgpSel, ffmSel, sgpArcs, ffmArcs, flagRecords, scoredBy, refScored }) {
  const flags = new Map(flagRecords.map(r => [r.key, r.flagged]));
  const metrics = { registration, window: config.windows.test, counts: { sgp: countsOf(sgpArcs), ffm: countsOf(ffmArcs) }, flags: flagSummary(flagRecords), modes: {}, selected: { [SGP4]: sgpSel.selected, [FFM]: ffmSel.selected } };
  for (const mode of [SGP4, FFM]) {
    metrics.modes[mode] = {};
    for (const c of candidatesOf(mode, config)) metrics.modes[mode][c.name] = summaryOf(c, views(scoredBy[mode][c.name], flags, mode, configs));
  }
  metrics.reference = { 'V1c3 F-coverage': summaryOf({ name: 'V1c3 F-coverage', arm: 'ALL' }, views(refScored, flags, SGP4, configs)) };
  // GPS tail: who carries the squared Mahalanobis distance, under the uncalibrated and the selected candidates, all and unflagged.
  metrics.gps = {};
  for (const [label, mode, name] of [['SGP4 uncalibrated N-none', SGP4, 'N-none/ALL'], ['SGP4 selected', SGP4, sgpSel.selected], ['FFM-1 selected', FFM, ffmSel.selected]]) {
    const scored = scoredBy[mode][name];
    metrics.gps[label] = { all: diagnostics(scored), unflagged: diagnostics(scored.filter(a => !flags.get(a.key))), flaggedMassShare: massShare(scored, flags) };
  }
  // Extreme samples of the selected candidates, by class and object: the tails the realism rule is sensitive to (no exclusions).
  metrics.extremes = {};
  for (const [mode, name] of [[SGP4, sgpSel.selected], [FFM, ffmSel.selected]]) {
    const rows = new Map();
    for (const a of scoredBy[mode][name]) for (const sample of a.samples) {
      const d2 = sample.score?.d2Predicted;
      if (!(d2 / 3 > EXTREME_D2_OVER_3)) continue;
      const key = `${a.group}|${a.norad}`, r = rows.get(key) ?? { group: a.group, object: a.norad, samples: 0, flagged: 0, maxD2Over3: 0, maxErrorKm: 0, epochs: new Set() };
      r.samples++; if (flags.get(a.key)) r.flagged++;
      r.maxD2Over3 = Math.max(r.maxD2Over3, d2 / 3); r.maxErrorKm = Math.max(r.maxErrorKm, Math.hypot(...sample.score.errorRtn) / 1000); r.epochs.add(sample.ms);
      rows.set(key, r);
    }
    metrics.extremes[mode] = [...rows.values()].map(({ epochs, ...r }) => ({ ...r, truthEpochs: epochs.size })).sort((x, y) => y.maxD2Over3 - x.maxD2Over3);
  }
  return metrics;
}

export async function runTest({ root, run, runDir, runtime, config, configs, e3, gp, codec, output, registration, universe, noteSets, noteTruth, elementSets, pairsOf, jobOf, groupBy, collect, environmentOf, eventFlags, loadFlags }) {
  const sgpSel = read(path.join(output, 'sgp-selection.json')), ffmSel = read(path.join(output, 'ffm-selection.json'));
  const truth = universe('test'), testDays = dayList(...config.windows.test);
  const loaded = elementSets({ e3, days: testDays, keep: n => truth.regime.has(n), epochLookbackDays: config.events.lookbackDays + 5 });
  noteSets(loaded);
  const bySet = groupBy(loaded.sets, s => s.norad), byHistory = groupBy(loaded.history, s => s.norad);
  const pairs = pairsOf(truth, testDays);
  const flagRecords = await eventFlags({ run, runtime, config, e3, name: 'events-test', pairs, setsByObject: bySet, workers: Math.min(4, config.workers) });
  const flags = loadFlags(flagRecords);
  const sgpArcs = await collect({ root, run, runtime, name: 'test-sgp', phase: 'sgp', pairs, config, jobFor: pair => jobOf({ e3, config, truth, bySet, byHistory, pair, window: {} }) });
  const environment = await environmentOf({ runtime, run, config });
  const selection = { selected: sgpSel.selected.split('/')[0], model: sgpSel.models[sgpSel.selected].model };
  const ffmArcs = await collect({ root, run, runtime, name: 'test-ffm', phase: 'ffm', pairs, config, selection,
    jobFor: pair => { const j = jobOf({ e3, config, truth, bySet, byHistory, pair, window: {} }); if (!j.skipped) j.env = environment(j.ms, j.targets.at(-1).ms); return j; } });
  noteTruth(truth);
  const scoredBy = { [SGP4]: {}, [FFM]: {} };
  for (const [mode, arcs, sel] of [[SGP4, sgpArcs, sgpSel], [FFM, ffmArcs, ffmSel]]) for (const c of candidatesOf(mode, config)) {
    const scored = await scoreArcs({ gp, codec, model: sel.models[c.name].model, arcs, mode, base: c.base });
    run.write(`test-${mode}-${c.name.replace('/', '_')}-scores.jsonl`, scoresJsonl(scored));
    scoredBy[mode][c.name] = scored;
  }
  // Reference, never selected: V1c3's published SGP4 F-coverage model on this window.
  const v1c3 = read(path.join(root, 'results/v1c3/sgp-selection.json'));
  const refScored = await scoreArcs({ gp, codec, model: v1c3.models['F-coverage'].model, arcs: sgpArcs, mode: SGP4, base: 'F' });
  run.write(referenceScores, scoresJsonl(refScored));
  const metrics = deriveMetrics({ config, configs, registration, sgpSel, ffmSel, sgpArcs, ffmArcs, flagRecords, scoredBy, refScored });
  for (const mode of [SGP4, FFM]) for (const [name, c] of Object.entries(metrics.modes[mode])) console.log(`test ${mode} ${name}: claimed ${c.realistic.claimed}/24 (all ${c.realistic.all}, unflagged ${c.realistic.unflagged})`);
  run.manifest.finished = new Date().toISOString(); run.checkpoint();
  const { publish } = await import('./report.mjs');
  publish({ root, runDir, run, config, configs, output, metrics, sgpSel, ffmSel, flags, flagRecords });
  return metrics;
}

// Share of the GPS summed d² (over every finite sample) that sits in flagged arcs.
function massShare(scored, flags) {
  let total = 0, flagged = 0;
  for (const a of scored) if (a.group === 'GPS') for (const s of a.samples) if (Number.isFinite(s.score?.d2Predicted)) { total += s.score.d2Predicted; if (flags.get(a.key)) flagged += s.score.d2Predicted; }
  return total ? flagged / total : null;
}
export function flagSummary(records) {
  const groups = [...new Set(records.map(r => r.group))].sort();
  const by = Object.fromEntries(groups.map(g => { const rs = records.filter(r => r.group === g); return [g, { pairs: rs.length, flagged: rs.filter(r => r.flagged).length, custody: rs.filter(r => r.custody.flag).length, detector: rs.filter(r => r.detector.recent.length).length, detectorErrors: rs.filter(r => r.detector.error).length }]; }));
  return { pairs: records.length, flagged: records.filter(r => r.flagged).length, byClass: by };
}
