#!/usr/bin/env node
// V1c4 stage driver. Stages: train-sgp, train-ffm, test (each refuses to start before its predecessor's freeze is pushed), and --check.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadModule, sha256 } from '../../harness/modules.mjs';
import { repoRoot as root } from '../../harness/provenance.mjs';
import { dayList } from '../../harness/gp-archive.mjs';
import { Run } from './run-state.mjs';
import { collect } from './collect.mjs';
import { environmentOf } from './environment.mjs';
import { eventFlags } from './events.mjs';
import { truthFor, elementSets, pairsOf, jobOf, groupBy } from './universe.mjs';
import { crossValidate, writeSelection } from './train.mjs';
import { SGP4, FFM } from './cv.mjs';

const dir = path.dirname(new URL(import.meta.url).pathname), read = f => JSON.parse(fs.readFileSync(f));
export const registration = '94263234aa9d5afcde53e260cf1182517002d155';
const config = read(path.join(dir, 'config.json'));
const configs = { v1c2: read(path.join(root, 'experiments/v1c2-console-covariance-realism/config.json')), v1: read(path.join(root, 'experiments/v1-ffm-physical-truth/config.json')), e3: read(path.join(root, 'experiments/e3-combined-catalog/config.json')) };
const e3 = configs.e3;
const { values } = parseArgs({ options: { check: { type: 'boolean' }, stage: { type: 'string' }, run: { type: 'string' } } });
const runId = values.run ?? 'v1c4-console-covariance-calibration-20261023';
const runDir = process.env.SDN_V1C4_RUN_DIR ?? path.join(root, 'runs', runId);
const output = path.join(root, 'results/v1c4');
const runtime = path.join(runDir, 'runtime');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const branch = 'refs/heads/task/console-covariance-calibration-v1c4-20261023';

if (values.check) {
  const { check } = await import('./report.mjs');
  await check({ root, runDir, config, configs, registration, output });
  process.exit(0);
}
assert(['train-sgp', 'train-ffm', 'test'].includes(values.stage), 'use --stage train-sgp|train-ffm|test, or --check');
assert(config.frozen);
for (const file of ['PLAN.md', 'config.json']) {
  const name = `experiments/v1c4-console-covariance-calibration/${file}`;
  assert.equal(git(['show', `${registration}:${name}`]), fs.readFileSync(path.join(root, name), 'utf8').trim(), 'frozen registration changed');
}
// The registered pins: the provisioned runtime must be byte-for-byte what config.json names.
const provenance = read(path.join(runtime, 'PROVENANCE.json'));
for (const [file, hash] of Object.entries({ ...config.runtime.files })) assert.equal(sha256(fs.readFileSync(path.join(runtime, file))), hash, `runtime file differs from its pin: ${file}`);
const run = new Run({ root, dir: runDir, config, registration, runtimeProvenance: { runtimeProvenanceSha256: sha256(fs.readFileSync(path.join(runtime, 'PROVENANCE.json'))), modulesCommit: provenance.modulesCommit, truthToolsCommit: provenance.truthToolsCommit, sds: provenance.sds } });
run.invoke(values.stage);
const requirePushed = relative => {
  const bytes = fs.readFileSync(path.join(root, relative));
  assert.equal(execFileSync('git', ['show', `HEAD:${relative}`], { cwd: root }).toString(), bytes.toString(), 'commit the selection first');
  const sha = git(['rev-parse', 'HEAD']), remote = git(['ls-remote', 'origin', branch]).split(/\s/)[0];
  assert.equal(remote, sha, 'push the selection and every model before proceeding');
  return { commit: sha, sha256: sha256(bytes), verifiedAt: new Date().toISOString() };
};
const gp = await loadModule(runtime, 'analysis/gp-error-model'); run.modules[gp.provenance.path] = gp.provenance;
const codec = await import(pathToFileURL(path.join(runtime, 'analysis/gp-error-model/scripts/erm-codec.mjs')));
const days = (a, b) => dayList(a, b);
const trainingDays = days(config.windows.folds[0].from, config.windows.folds.at(-1).to);
const roots = { main: e3.inputs.reference, leo: config.truth.leo };
const universe = window => truthFor({ e3, config, roots: window === 'test' ? { ...roots, main: path.join(runDir, config.truth.refreshedDirectory) } : roots });
const noteSets = (loaded) => { for (const [f, h] of Object.entries(loaded.files)) run.note('gpHistory', path.join(e3.inputs.gpHistory, f), h); for (const [f, h] of Object.entries(loaded.historyFiles)) run.note('history', path.join(e3.inputs.gpHistory, f), h); };
const noteTruth = truth => {
  const seen = new Set();
  for (const [f, h] of Object.entries(truth.reads())) {
    run.note('reference', f, h);
    const index = path.join(path.dirname(f), 'index.json');
    if (!seen.has(index)) { seen.add(index); run.note('referenceIndex', index, sha256(fs.readFileSync(index))); }
  }
};
const loadFlags = records => new Map(records.map(r => [r.key, r.flagged]));

try {
  if (values.stage === 'train-sgp' || values.stage === 'train-ffm') {
    assert(!run.manifest.testStarted, 'training is closed after test access');
    const truth = universe('train'), loaded = elementSets({ e3, days: trainingDays, keep: n => truth.regime.has(n), epochLookbackDays: config.events.lookbackDays + 5 });
    noteSets(loaded);
    const bySet = groupBy(loaded.sets, s => s.norad), byHistory = groupBy(loaded.history, s => s.norad);
    const window = { targetBefore: config.windows.trainingTargetBefore };
    const allPairs = pairsOf(truth, trainingDays);
    // Events first: the flag of every training pair (also those of FFM's weeks).
    const flagRecords = await eventFlags({ run, runtime, config, e3, name: 'events-train', pairs: allPairs, setsByObject: bySet, workers: Math.min(4, config.workers) });
    const flags = loadFlags(flagRecords);
    if (values.stage === 'train-sgp') {
      const arcs = await collect({ root, run, runtime, name: 'train-sgp', phase: 'sgp', pairs: allPairs, jobFor: pair => jobOf({ e3, config, truth, bySet, byHistory, pair, window }), config });
      noteTruth(truth);
      const result = await crossValidate({ mode: SGP4, arcs, flags, config, e3, configs, gp, codec, run });
      const { record } = writeSelection({ output, mode: SGP4, result, codec, config, extra: { registration, trainingRawSha256: run.files['train-sgp.jsonl'], eventsSha256: run.files['events-train.jsonl'] } });
      console.log(`SGP4 selected: ${record.selected}; flag share ${(record.flagShare * 100).toFixed(1)} %`);
    } else {
      run.manifest.sgpFreeze = requirePushed('results/v1c4/sgp-selection.json'); run.checkpoint();
      const s = read(path.join(output, 'sgp-selection.json'));
      const ffmDays = days(config.windows.folds.find(f => f.id === config.windows.ffmFolds[0]).from, config.windows.folds.find(f => f.id === config.windows.ffmFolds.at(-1)).to);
      const pairs = pairsOf(truth, ffmDays), environment = await environmentOf({ runtime, run, config });
      const selection = { selected: s.selected.split('/')[0], model: s.models[s.selected].model };
      const arcs = await collect({ root, run, runtime, name: 'train-ffm', phase: 'ffm', pairs, config, selection,
        jobFor: pair => { const j = jobOf({ e3, config, truth, bySet, byHistory, pair, window }); if (!j.skipped) j.env = environment(j.ms, j.targets.at(-1).ms); return j; } });
      noteTruth(truth);
      const result = await crossValidate({ mode: FFM, arcs, flags, config, e3, configs, gp, codec, run });
      const { record } = writeSelection({ output, mode: FFM, result, codec, config, extra: { registration, seed: s.selected, trainingRawSha256: run.files['train-ffm.jsonl'], eventsSha256: run.files['events-train.jsonl'] } });
      console.log(`FFM-1 selected: ${record.selected}; flag share ${(record.flagShare * 100).toFixed(1)} %`);
    }
  } else {
    const { runTest } = await import('./test.mjs');
    run.manifest.selectionFreeze ??= { sgp: requirePushed('results/v1c4/sgp-selection.json'), ffm: requirePushed('results/v1c4/ffm-selection.json') };
    for (const phase of ['sgp', 'ffm']) {
      const relative = `results/v1c4/${phase}-selection.json`, frozen = run.manifest.selectionFreeze[phase];
      assert.equal(sha256(fs.readFileSync(path.join(root, relative))), frozen.sha256, 'selection changed after test unlock');
      assert.equal(sha256(execFileSync('git', ['show', `${frozen.commit}:${relative}`], { cwd: root })), frozen.sha256);
    }
    run.manifest.testStarted ??= new Date().toISOString(); run.checkpoint();
    await runTest({ root, run, runDir, runtime, config, configs, e3, gp, codec, output, registration, universe, noteSets, noteTruth, elementSets, pairsOf, jobOf, groupBy, collect, environmentOf, eventFlags, loadFlags });
  }
} finally { await gp.destroy(); run.checkpoint(); }
