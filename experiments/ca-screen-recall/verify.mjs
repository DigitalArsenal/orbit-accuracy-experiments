#!/usr/bin/env node
// ca-screen-recall end-to-end check (PLAN.md, "Verification and outputs"):
//   1. the stored provenance: the run's sources, plan and configuration resolve to the commits and hashes in the manifest,
//      the plan commit precedes the run's commit, the pinned module artifacts are the registered ones;
//   2. the report regenerates from metrics.json to the same bytes;
//   3. the whole method, through the real modules on the first 300 objects for six hours, gives the counts in replay.json.
// Absent inputs (snapshot, modules commit) end in a visible skip, exit 3; a skip is not a pass.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config, repo, id, sha256, git, RUN_SOURCES, modulesRoot, pinnedModules } from './common.mjs';
import { execute } from './run.mjs';
import { render, replaySummary, resultsDir } from './report.mjs';

const { values } = parseArgs({ options: { modules: { type: 'string' }, archive: { type: 'string' } } });
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const snapshot = path.join(values.archive ?? config.data.archiveRoot, config.data.snapshot);

let modules = null, pinnedError = null;
try { modules = modulesRoot(values.modules); pinnedModules(modules); } catch (error) { pinnedError = error.message; }
if (!fs.existsSync(snapshot) || pinnedError) {
  console.error(`CA-SCREEN-RECALL E2E SKIP: ${!fs.existsSync(snapshot) ? `snapshot ${snapshot} is absent` : pinnedError}; no pass claimed`);
  process.exit(3);
}

const metrics = read(path.join(resultsDir, 'metrics.json')), manifest = read(path.join(resultsDir, 'manifest.json'));

// 1. provenance
assert.equal(manifest.experiment, id);
assert.equal(manifest.mode, 'registered');
assert.equal(sha256(fs.readFileSync(path.join(resultsDir, 'metrics.json'))), manifest.outputs['metrics.json'], 'metrics.json must be the run\'s output');
const at = (commit, rel) => git('show', `${commit}:experiments/${id}/${rel}`);
for (const file of RUN_SOURCES) assert.equal(sha256(at(manifest.plan.experimentCommit, file)), manifest.plan.sourceHashes[file], `run source ${file} must resolve to the recorded commit`);
assert.equal(sha256(at(manifest.plan.experimentCommit, 'config.json')), manifest.configSha256);
git('merge-base', '--is-ancestor', manifest.plan.planCommit, manifest.plan.experimentCommit);
assert.equal(sha256(at(manifest.plan.planCommit, 'PLAN.md')), sha256(at(manifest.plan.experimentCommit, 'PLAN.md')), 'the plan must not change between its registration and the run');
for (const [rel, digest] of Object.entries(config.modules.artifacts)) {
  const key = rel.split('/dist/')[0];
  assert.equal(manifest.modules[key].wasmSha256, digest, `${key}: the run must have loaded the registered artifact`);
}
assert.equal(manifest.modulesRepository.pinnedCommit, config.modules.commit);
assert.equal(manifest.inputs.snapshot.sha256, config.data.snapshotSha256);
assert.equal(metrics.reference.stats.objects, config.selection.count);
console.log('provenance: plan, sources, configuration, module artifacts and snapshot match the recorded run');

// 2. the report
assert.equal(render(metrics, manifest), fs.readFileSync(path.join(resultsDir, 'README.md'), 'utf8'), 'README.md must regenerate exactly from metrics.json');
console.log('report: README.md regenerates exactly');

// 3. the whole method on a slice, through the real modules
const out = fs.mkdtempSync(path.join(os.tmpdir(), `${id}-verify-`));
try {
  const replay = await execute({ mode: 'replay', modules: values.modules, archive: values.archive, outDir: out, log: () => {} });
  const summary = replaySummary(replay.metrics), stored = read(path.join(resultsDir, 'replay.json'));
  assert.deepEqual(summary, stored, 'the replay must reproduce results/ca-screen-recall/replay.json');
  assert.ok(summary.reference.events > 0, 'the replay slice must contain reference events');
  console.log(`replay: ${summary.objects} objects, ${summary.durationSeconds / 3600} h: ${summary.reference.events} reference events, ${summary.arms.defaults.recall.all.found} of ${summary.arms.defaults.recall.all.reference} found, as stored`);
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}
console.log('CA-SCREEN-RECALL E2E PASS');
process.exit(0);
