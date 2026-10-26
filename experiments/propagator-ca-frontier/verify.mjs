import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { options, results, config, read, sha, git, repo, pinnedModules, frozenPlan } from './lib.mjs';
import { runXp } from './run-xp.mjs';
import { probeReference } from './probe-reference.mjs';
import { auditCa } from './audit-ca.mjs';
import { report } from './report.mjs';

try {
  const opts = options();
  if (Object.keys(config.ca.files).some((f) => !fs.existsSync(path.join(opts.rows, f)))) {
    console.error('FRONTIER E2E SKIP: real B2 archive input absent; no pass claimed');
    process.exitCode = 3;
  } else {
    pinnedModules(opts.modules); frozenPlan();
    for (const kind of ['xp', 'ca', 'ffm', 'reference']) {
      const manifest = read(path.join(results, `${kind}.manifest.json`));
      assert.equal(sha(fs.readFileSync(path.join(results, `${kind}.json`))), manifest.output.sha256);
      assert.equal(sha(git(repo, 'show', `${manifest.plan.commit}:experiments/propagator-ca-frontier/config.json`)), manifest.plan.configSha256);
      assert.equal(sha(git(repo, 'show', `${manifest.plan.planCommit}:experiments/propagator-ca-frontier/PLAN.md`)), manifest.plan.planSha256);
      for (const [file, digest] of Object.entries(manifest.experimentSourceHashes)) {
        assert.equal(sha(git(repo, 'show', `${manifest.experimentCommit}:experiments/propagator-ca-frontier/${file}`)), digest,
          `${kind}: run source must resolve to the recorded immutable commit: ${file}`);
      }
      if (manifest.modules) {
        assert.equal(manifest.modules.commit, config.moduleCommit);
        assert.deepEqual(manifest.modules.artifacts, config.modules);
      }
    }
    report(true);
    const actualCa = auditCa({ ...opts, run: `verify-ca-${Date.now()}` }).result;
    assert.deepEqual(actualCa, read(path.join(results, 'ca.json')), 'Archive audit must reproduce exactly');
    const recorded = read(path.join(results, 'xp.json'));
    const actual = (await runXp({ ...opts, quick: true, run: `verify-xp-${Date.now()}` })).result;
    assert.equal(actual.inputSha256, recorded.inputSha256);
    assert.equal(actual.enginePass.white, true, 'White XP temporal batching must preserve every state and status');
    assert.deepEqual(actual.enginePass, recorded.enginePass, 'Scientific outcomes must be reproduced, including reference failure');
    for (const row of actual.comparisons) {
      const expected = recorded.comparisons.find((r) => r.rep === 0 && r.direction === row.direction && r.engine === row.engine);
      assert.deepEqual(row, expected, `${row.direction}/${row.engine}: full values/status digest and diagnostic counts`);
    }
    const probe = (await probeReference({ ...opts, run: `verify-reference-${Date.now()}` })).result;
    assert.deepEqual(probe, read(path.join(results, 'reference.json')), 'Existing reference wrapper diagnostic must reproduce');
    const ffm = read(path.join(results, 'ffm.json'));
    assert.equal(ffm.exitCode, 0); assert.equal(ffm.result.ok, true);
    assert.equal(ffm.result.baselineWasmSha256, ffm.result.candidateWasmSha256);
    assert.equal(ffm.result.batchedIdentical, true);
    assert(ffm.result.rows.every((r) => r.byteIdentical && r.maxPositionDifferenceM === 0 && r.maxVelocityDifferenceMS === 0));
    console.log('FRONTIER E2E PASS: pinned provenance, exact white-XP batching, real archive audit and report; USSF order failure faithfully reproduced. Native WasmEdge explicitly skipped.');
  }
} catch (error) {
  console.error(`FRONTIER E2E FAIL: ${error.message}`);
  process.exitCode = 1;
}
