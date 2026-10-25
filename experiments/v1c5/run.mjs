#!/usr/bin/env node
// V1c5 stage driver. Stages: collect (A: training arcs and flags), train (B: cross-validation, selection, final fits), test (C), and --check.
//   node experiments/v1c5/run.mjs --stage collect|train|test    [--run <durable run directory>]
//   node experiments/v1c5/run.mjs --check
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { loadModule, sha256 } from '../../harness/modules.mjs';
import { repoRoot as root } from '../../harness/provenance.mjs';
import { collect } from './collect.mjs';
import { eventFlags } from './events.mjs';
import { elementSets, pairsOf, jobOf, groupBy } from './universe.mjs';
import { crossValidate, writeSelection } from './train.mjs';
import { config, configs, e3, registration, registrationB, output, specOf, branch, git, runDirDefault, openRun, universes, trainingDays, noteSets, noteTruth } from './common.mjs';

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
        eventFlags({ run, runtime, config, e3, name: 'events-train', pairs, setsByObject: bySet, workers: 16 }),
        collect({ root, run, runtime, name: 'train-sgp', phase: 'sgp', pairs, config, jobFor: pair => jobOf({ e3, config, truth: truthOf.get(pair.key), bySet, byHistory, pair, window }) })]);
      noteTruth(run)(U.archive); noteTruth(run)(U.refreshed);
      run.manifest.collected = new Date().toISOString(); run.checkpoint();
      console.log(`collected ${arcs.length} arcs, ${flagRecords.filter(r => r.flagged).length} flagged`);
    } else if (values.stage === 'train' || values.stage === 'test') {
      for (const file of ['PLAN-B.md', 'candidates.json']) {
        const name = `experiments/v1c5/${file}`;
        assert.equal(git(['show', `${registrationB}:${name}`]), fs.readFileSync(path.join(root, name), 'utf8').trim(), 'registration B changed');
      }
      const spec = specOf();
      const gp = await loadModule(runtime, 'analysis/gp-error-model'); run.modules[gp.provenance.path] = gp.provenance;
      const codec = await import(pathToFileURL(path.join(runtime, 'analysis/gp-error-model/scripts/erm-codec.mjs')));
      try {
        if (values.stage === 'train') {
          assert(!run.manifest.testStarted, 'training is closed after test access');
          const arcs = fs.readFileSync(path.join(runDir, 'train-sgp.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
          const flagRecords = new Map(fs.readFileSync(path.join(runDir, 'events-train.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).map(r => [r.key, r]));
          const result = await crossValidate({ arcs, flagRecords, spec, config, e3, configs, gp, codec, run });
          const { record } = writeSelection({ output, result, codec, extra: { registration, registrationB, trainingRawSha256: run.files['train-sgp.jsonl'], eventsSha256: run.files['events-train.jsonl'] } });
          console.log(`selected: ${record.selected}; flag share ${(record.flagShare * 100).toFixed(1)} %`);
        } else {
          const relative = 'results/v1c5/selection.json', bytes = fs.readFileSync(path.join(root, relative));
          assert.equal(git(['show', `HEAD:${relative}`]), bytes.toString().trim(), 'commit the selection first');
          const sha = git(['rev-parse', 'HEAD']), remote = git(['ls-remote', 'origin', branch]).split(/\s/)[0];
          assert.equal(remote, sha, 'push the selection and every model before the test');
          run.manifest.selectionFreeze ??= { commit: sha, sha256: sha256(bytes), verifiedAt: new Date().toISOString() };
          assert.equal(sha256(bytes), run.manifest.selectionFreeze.sha256, 'selection changed after test unlock');
          run.manifest.testStarted ??= new Date().toISOString(); run.checkpoint();
          const { runTest } = await import('./test.mjs');
          const ctx = { root, run, runDir, runtime, config, configs, e3, spec, gp, codec, output, registration, U: universes(runDir), noteSets: noteSets(run), noteTruth: noteTruth(run), elementSets, pairsOf, jobOf, groupBy, collect, eventFlags };
          await runTest({ ctx });
        }
      } finally { await gp.destroy(); }
    } else throw new Error(`unknown stage ${values.stage}`);
  } finally { run.checkpoint(); }
}
