#!/usr/bin/env node
// ca-screen-recall end-to-end check of Amendment A2 (PLAN.md, "Verification and outputs" and Amendment A2):
//   1. the stored provenance: the run's sources, plan and configuration resolve to the commits and hashes in the manifest,
//      the plan commit precedes the run's commit, the pinned module artifacts are the registered ones; the 0.9.0 report is
//      kept unchanged beside the new one;
//   2. the report regenerates from the stored results to the same bytes;
//   3. the fabricated listing: a reference event the screen drops is counted as a miss, and the baseline harness gives the false pass;
//   4. the whole method, through the real modules on 2,000 objects of the unregistered smoke ranking for 12 hours (PLAN.md,
//      amendment A1), gives the counts in replay.a2.json.
// Absent inputs (snapshot, modules commit) end in a visible skip, exit 3; a skip is not a pass.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config, a2, repo, id, here, sha256, git, RUN_SOURCES, modulesRoot, pinnedModules } from './common.mjs';
import { execute } from './run.mjs';
import { render, replaySummary, resultsDir, stored, FILES } from './report.mjs';

const REPLAY = { count: 2000, seconds: 43200 };
const { values } = parseArgs({ options: { modules: { type: 'string' }, archive: { type: 'string' } } });
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const snapshot = path.join(values.archive ?? config.data.archiveRoot, config.data.snapshot);
const out = fs.mkdtempSync(path.join(os.tmpdir(), `${id}-verify-`));

let pinnedError = null;
try { pinnedModules(modulesRoot(values.modules), out); } catch (error) { pinnedError = error.message; }
if (!fs.existsSync(snapshot) || pinnedError) {
  console.error(`CA-SCREEN-RECALL E2E SKIP: ${!fs.existsSync(snapshot) ? `snapshot ${snapshot} is absent` : pinnedError}; no pass claimed`);
  fs.rmSync(out, { recursive: true, force: true });
  process.exit(3);
}

try {
  const results = stored(), { metrics, manifest } = results;

  // 1. provenance
  assert.equal(manifest.experiment, id);
  assert.equal(manifest.mode, 'registered');
  assert.equal(manifest.amendment, a2.amendment);
  assert.equal(sha256(fs.readFileSync(path.join(resultsDir, FILES.metrics))), manifest.outputs['metrics.json'], `${FILES.metrics} must be the run's output`);
  const at = (commit, rel) => git('show', `${commit}:experiments/${id}/${rel}`);
  for (const file of RUN_SOURCES) assert.equal(sha256(at(manifest.plan.experimentCommit, file)), manifest.plan.sourceHashes[file], `run source ${file} must resolve to the recorded commit`);
  assert.equal(sha256(at(manifest.plan.experimentCommit, 'config.json')), manifest.configSha256);
  git('merge-base', '--is-ancestor', manifest.plan.planCommit, manifest.plan.experimentCommit);
  assert.equal(sha256(at(manifest.plan.planCommit, 'PLAN.md')), sha256(at(manifest.plan.experimentCommit, 'PLAN.md')), 'the plan must not change between its registration and the run');
  for (const [tree, pin] of Object.entries(a2.modules.pins)) {
    assert.equal(manifest.modules[tree].wasmSha256, pin.sha256, `${tree}: the run must have loaded the registered artifact`);
    assert.equal(manifest.modulesRepository.pins[tree].commit, pin.commit);
  }
  assert.equal(manifest.inputs.snapshot.sha256, config.data.snapshotSha256);
  assert.equal(metrics.reference.stats.objects, config.selection.count);
  assert.equal(results.moved.reference.identical, true, 'the reference must not move: its SGP4 artifact and snapshot are the registered ones');
  assert.equal(sha256(fs.readFileSync(path.join(resultsDir, a2.baseline.readme))), sha256(git('show', `${a2.baseline.commit}:results/${id}/README.md`)), 'the 0.9.0 report must be kept unchanged');
  console.log('provenance: plan, sources, configuration, module artifacts and snapshot match the recorded run');

  // 2. the report
  assert.equal(render(results), fs.readFileSync(path.join(resultsDir, 'README.md'), 'utf8'), 'README.md must regenerate exactly from the stored results');
  console.log('report: README.md regenerates exactly');

  // 3. the fabricated listing
  const proof = JSON.parse(execFileSync(process.execPath, [path.join(here, 'listing-proof.mjs')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));
  assert.deepEqual(proof, results.proof, `the fabricated listing must reproduce ${FILES.proof}`);
  console.log(`fabricated listing: baseline harness ${proof.baselineHarness.found} of ${proof.baselineHarness.reference} (${proof.baselineHarness.status}), this harness ${proof.thisHarness.found} of ${proof.thisHarness.reference} (${proof.thisHarness.status}, ${proof.thisHarness.misses} misses)`);

  // 4. the whole method on a slice, through the real modules (PLAN.md amendment A1: the unregistered smoke ranking, 2,000 objects, 12 hours)
  const replay = await execute({ mode: 'smoke', smokeSize: REPLAY, modules: values.modules, archive: values.archive, outDir: out, log: () => {} });
  const summary = replaySummary(replay.metrics), storedReplay = read(path.join(resultsDir, FILES.replay));
  assert.deepEqual(summary, storedReplay, `the replay must reproduce results/${id}/${FILES.replay}`);
  assert.ok(summary.reference.events > 0, 'the replay slice must contain reference events');
  console.log(`replay: ${summary.objects} objects, ${summary.durationSeconds / 3600} h: ${summary.reference.events} reference events, ${summary.arms.defaults.recall.all.found} of ${summary.arms.defaults.recall.all.reference} found, as stored`);
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}
console.log('CA-SCREEN-RECALL E2E PASS');
process.exit(0);
