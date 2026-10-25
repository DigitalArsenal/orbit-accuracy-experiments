#!/usr/bin/env node
// V1c5 stage driver. Stages: collect (A: training arcs and flags), train (B: cross-validation, selection, final fits), test (C), and --check.
//   node experiments/v1c5/run.mjs --stage collect|train|test    [--run <durable run directory>]
//   node experiments/v1c5/run.mjs --check
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { loadModule, sha256 } from '../../harness/modules.mjs';
import { repoRoot as root } from '../../harness/provenance.mjs';
import { dayList } from '../../harness/gp-archive.mjs';
import { Run } from './run-state.mjs';
import { collect } from './collect.mjs';
import { eventFlags } from './events.mjs';
import { truthFor, elementSets, pairsOf, jobOf, groupBy } from './universe.mjs';

export const dir = path.dirname(new URL(import.meta.url).pathname), read = f => JSON.parse(fs.readFileSync(f));
export const config = read(path.join(dir, 'config.json'));
// The commit that registered PLAN.md and config.json (set in the second commit of the experiment, never changed).
export const registration = process.env.V1C5_REGISTRATION ?? '0ba47264c57b0aa8b4cd0732f49bea5781c605bf';
export const configs = { v1c2: read(path.join(root, 'experiments/v1c2-console-covariance-realism/config.json')), v1: read(path.join(root, 'experiments/v1-ffm-physical-truth/config.json')), e3: read(path.join(root, 'experiments/e3-combined-catalog/config.json')) };
export const e3 = configs.e3;
export const runDirDefault = config.durableRunDirectory;
export const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();

export function openRun(runDir) {
  const runtime = path.join(runDir, 'runtime');
  const provenance = read(path.join(runtime, 'PROVENANCE.json'));
  for (const [file, hash] of Object.entries(config.runtime.files)) assert.equal(sha256(fs.readFileSync(path.join(runtime, file))), hash, `runtime file differs from its pin: ${file}`);
  const run = new Run({ root, dir: runDir, config, registration, runtimeProvenance: { runtimeProvenanceSha256: sha256(fs.readFileSync(path.join(runtime, 'PROVENANCE.json'))), modulesCommit: provenance.modulesCommit, truthToolsCommit: provenance.truthToolsCommit } });
  run.manifest.repositoryRoot = root; run.manifest.runDirectory = runDir;
  return { run, runtime };
}
// Truth readers: the archive for the training weeks before `refreshedFrom`, the refreshed copy after.
export function universes(runDir) {
  const roots = { main: e3.inputs.reference, leo: config.truth.leo };
  const archive = truthFor({ e3, config, roots }), refreshed = truthFor({ e3, config, roots: { ...roots, main: path.join(runDir, config.truth.refreshedDirectory) } });
  const of = day => day >= config.windows.refreshedFrom ? refreshed : archive;
  return { archive, refreshed, of };
}
export const trainingDays = () => dayList(config.windows.folds[0].from, config.windows.folds.at(-1).to);
export const noteSets = run => loaded => { for (const [f, h] of Object.entries(loaded.files)) run.note('gpHistory', path.join(e3.inputs.gpHistory, f), h); for (const [f, h] of Object.entries(loaded.historyFiles)) run.note('history', path.join(e3.inputs.gpHistory, f), h); };
export const noteTruth = run => truth => {
  const seen = new Set();
  for (const [f, h] of Object.entries(truth.reads())) {
    run.note('reference', f, h);
    const index = path.join(path.dirname(f), 'index.json');
    if (!seen.has(index)) { seen.add(index); run.note('referenceIndex', index, sha256(fs.readFileSync(index))); }
  }
};
export const loadFlags = records => new Map(records.map(r => [r.key, r.flagged]));
export const embargo = Date.parse(config.windows.trainingTargetBefore);

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { check: { type: 'boolean' }, stage: { type: 'string' }, run: { type: 'string' } } });
  const runDir = values.run ?? process.env.SDN_V1C5_RUN_DIR ?? runDirDefault;
  if (values.check) { const { check } = await import('./check.mjs'); await check({ runDir }); process.exit(0); }
  assert(config.frozen);
  for (const file of ['PLAN.md', 'config.json']) {
    const name = `experiments/v1c5/${file}`;
    assert.equal(git(['show', `${registration}:${name}`]), fs.readFileSync(path.join(root, name), 'utf8').trim(), 'frozen registration changed');
  }
  const { run, runtime } = openRun(runDir);
  run.invoke(values.stage);
  try {
    if (values.stage === 'collect') {
      const U = universes(runDir), days = trainingDays();
      // Sets and history for every object either universe knows, over all training days.
      const keep = n => U.archive.regime.has(n) || U.refreshed.regime.has(n);
      const loaded = elementSets({ e3, days, keep, epochLookbackDays: config.events.lookbackDays + 5 });
      noteSets(run)(loaded);
      const bySet = groupBy(loaded.sets, s => s.norad), byHistory = groupBy(loaded.history, s => s.norad);
      const pairs = days.flatMap(day => pairsOf(U.of(day), [day])).filter(p => p.group);
      const window = { targetBefore: config.windows.trainingTargetBefore };
      const truthOf = new Map(pairs.map(p => [p.key, U.of(p.day)]));
      // The flags and the arcs do not depend on each other: both run at once (events: 6 workers, arcs: config.workers).
      const [flagRecords, arcs] = await Promise.all([
        eventFlags({ run, runtime, config, e3, name: 'events-train', pairs, setsByObject: bySet, workers: 6 }),
        collect({ root, run, runtime, name: 'train-sgp', phase: 'sgp', pairs, config, jobFor: pair => jobOf({ e3, config, truth: truthOf.get(pair.key), bySet, byHistory, pair, window }) })]);
      noteTruth(run)(U.archive); noteTruth(run)(U.refreshed);
      run.manifest.collected = new Date().toISOString(); run.checkpoint();
      console.log(`collected ${arcs.length} arcs, ${flagRecords.filter(r => r.flagged).length} flagged`);
    } else throw new Error(`unknown stage ${values.stage}`);
  } finally { run.checkpoint(); }
}
