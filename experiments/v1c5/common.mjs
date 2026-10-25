// Shared configuration, registrations and helpers of V1c5 (imported by run.mjs and check.mjs).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { loadModule, sha256 } from '../../harness/modules.mjs';
import { repoRoot as root } from '../../harness/provenance.mjs';
import { dayList } from '../../harness/gp-archive.mjs';
import { pathToFileURL } from 'node:url';
import { Run } from './run-state.mjs';
import { truthFor, elementSets, pairsOf, jobOf, groupBy } from './universe.mjs';

export const dir = path.dirname(new URL(import.meta.url).pathname), read = f => JSON.parse(fs.readFileSync(f));
export const config = read(path.join(dir, 'config.json'));
// The commit that registered PLAN.md and config.json (set in the second commit of the experiment, never changed).
export const registration = process.env.V1C5_REGISTRATION ?? '0ba47264c57b0aa8b4cd0732f49bea5781c605bf';
export const configs = { v1c2: read(path.join(root, 'experiments/v1c2-console-covariance-realism/config.json')), v1: read(path.join(root, 'experiments/v1-ffm-physical-truth/config.json')), e3: read(path.join(root, 'experiments/e3-combined-catalog/config.json')) };
export const e3 = configs.e3;
export const registrationB = process.env.V1C5_REGISTRATION_B ?? 'f59f2b13f6447a6bb0c8a5cbb078f99fb849c02f';
export const output = path.join(root, 'results/v1c5');
export const specOf = () => read(path.join(dir, 'candidates.json'));
export const runDirDefault = config.durableRunDirectory;
export const branch = 'refs/heads/task/console-covariance-calibration-v1c5-20261025';
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

