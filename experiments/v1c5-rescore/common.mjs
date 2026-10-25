// Shared configuration and helpers of the V1c5 rescore (PLAN.md). V1c5's code is imported unchanged for arcs, flags, scores and the Gaussian rule.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadModule, sha256 } from '../../harness/modules.mjs';
import { repoRoot as root } from '../../harness/provenance.mjs';
import { Run } from './run-state.mjs';
import { truthFor } from '../v1c5/universe.mjs';
import { config as base, configs, e3, git, read, noteSets, noteTruth, specOf as baseSpec } from '../v1c5/common.mjs';

export { root, base, configs, e3, git, read, noteSets, noteTruth };
export const dir = path.dirname(new URL(import.meta.url).pathname);
export const config = read(path.join(dir, 'config.json'));
export const configFile = 'experiments/v1c5-rescore/config.json';
// The commit that registered PLAN.md and config.json (the first commit of the experiment, never changed).
export const registration = process.env.V1C5R_REGISTRATION ?? 'dde67f6445caae92b1e38b12a46dbad823f5d3ca';
export const output = path.join(root, 'results/v1c5-rescore');
export const branch = 'refs/heads/task/console-covariance-v1c5-rescore-and-screening-criterion-20261025';
export const runDirDefault = config.durableRunDirectory;
export const HOURS = config.horizonsHours;
export const frozenName = config.frozenModel.candidate;
export const safe = name => name.replace(/[/|]/g, '_');
export const scoresFile = `test-${safe(frozenName)}-scores.jsonl`;
export const jsonl = f => fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
export const roundTrip = x => JSON.parse(JSON.stringify(x));
export const hashOf = file => sha256(fs.readFileSync(file));

// V1c5's candidate list restricted to the frozen candidate, for V1c5's metric code.
export const frozenSpec = () => { const spec = baseSpec(); return { ...spec, candidates: spec.candidates.filter(c => c.name === frozenName) }; };

// The frozen model of V1c5, checked against its pins (PLAN section 2).
export function frozenModel() {
  const f = config.frozenModel;
  for (const pin of [f.selection, f.erm, f.metrics]) assert.equal(hashOf(path.join(root, pin.file)), pin.sha256, `V1c5 result changed: ${pin.file}`);
  const sel = read(path.join(root, f.selection.file));
  assert.equal(sel.selected, f.candidate);
  return { sel, model: sel.models[f.candidate].model, spec: frozenSpec() };
}

export function openRun(runDir) {
  const runtime = path.join(runDir, 'runtime');
  const provenance = read(path.join(runtime, 'PROVENANCE.json'));
  for (const [file, hash] of Object.entries(base.runtime.files)) assert.equal(hashOf(path.join(runtime, file)), hash, `runtime file differs from its pin: ${file}`);
  const run = new Run({ root, dir: runDir, config: base, registration, runtimeProvenance: { runtimeProvenanceSha256: hashOf(path.join(runtime, 'PROVENANCE.json')), modulesCommit: provenance.modulesCommit, truthToolsCommit: provenance.truthToolsCommit } });
  run.manifest.repositoryRoot = root; run.manifest.runDirectory = runDir;
  return { run, runtime };
}

// Truth readers over the merged symlink roots of the run directory (PLAN section 3).
export function universe(runDir) {
  return truthFor({ e3, config: base, roots: { main: path.join(runDir, 'truth/main'), leo: path.join(runDir, 'truth/leo') } });
}
export async function loadGp(runtime) {
  const gp = await loadModule(runtime, 'analysis/gp-error-model');
  const { pathToFileURL } = await import('node:url');
  const codec = await import(pathToFileURL(path.join(runtime, 'analysis/gp-error-model/scripts/erm-codec.mjs')));
  return { gp, codec };
}
