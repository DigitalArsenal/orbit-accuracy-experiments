#!/usr/bin/env node
// V1c5 rescore stage driver. Stages: fit (B: T and Q from the training out-of-fold population), test (C), and --check.
//   node experiments/v1c5-rescore/run.mjs --stage fit|test    [--run <durable run directory>]
//   node experiments/v1c5-rescore/run.mjs --check
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { sha256 } from '../../harness/modules.mjs';
import { collect } from '../v1c5/collect.mjs';
import { eventFlags } from '../v1c5/events.mjs';
import { elementSets, pairsOf, jobOf, groupBy } from '../v1c5/universe.mjs';
import { root, config, git, registration, branch, output, runDirDefault, openRun, universe, noteSets, noteTruth, loadGp, frozenModel } from './common.mjs';
import { mergeTruth } from './truth.mjs';
import { fitStage } from './fit.mjs';

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { check: { type: 'boolean' }, stage: { type: 'string' }, run: { type: 'string' } } });
  const runDir = values.run ?? process.env.SDN_V1C5R_RUN_DIR ?? runDirDefault;
  if (values.check) { const { check } = await import('./check.mjs'); await check({ runDir }); process.exit(0); }
  assert(config.frozen);
  for (const file of ['PLAN.md', 'config.json']) {
    const name = `experiments/v1c5-rescore/${file}`;
    assert.equal(git(['show', `${registration}:${name}`]), fs.readFileSync(path.join(root, name), 'utf8').trim(), 'frozen registration changed');
  }
  const { run, runtime } = openRun(runDir);
  run.invoke(values.stage);
  try {
    if (values.stage === 'fit') {
      assert(!run.manifest.testStarted, 'fitting is closed after test access');
      fitStage({ run, runDir });
    } else if (values.stage === 'test') {
      const relative = 'results/v1c5-rescore/fits.json', bytes = fs.readFileSync(path.join(root, relative));
      assert.equal(git(['show', `HEAD:${relative}`]), bytes.toString().trim(), 'commit the fits first');
      const sha = git(['rev-parse', 'HEAD']), remote = git(['ls-remote', 'origin', branch]).split(/\s/)[0];
      assert.equal(remote, sha, 'push the fits before the test');
      run.manifest.fitsFreeze ??= { commit: sha, sha256: sha256(bytes), verifiedAt: new Date().toISOString() };
      assert.equal(sha256(bytes), run.manifest.fitsFreeze.sha256, 'fits changed after test unlock');
      run.manifest.testStarted ??= new Date().toISOString(); run.checkpoint();
      run.manifest.truthMerge = mergeTruth(runDir);
      const { sel, model } = frozenModel();
      void sel;
      const { gp, codec } = await loadGp(runtime); run.modules[gp.provenance.path] = gp.provenance;
      try {
        const { runTest } = await import('./test.mjs');
        const fits = JSON.parse(bytes);
        await runTest({ ctx: { root, run, runDir, runtime, gp, codec, model, fits, output, U: universe(runDir), noteSets: noteSets(run), noteTruth: noteTruth(run), elementSets, pairsOf, jobOf, groupBy, collect, eventFlags } });
      } finally { await gp.destroy(); }
    } else throw new Error(`unknown stage ${values.stage}`);
  } finally { run.checkpoint(); }
}
