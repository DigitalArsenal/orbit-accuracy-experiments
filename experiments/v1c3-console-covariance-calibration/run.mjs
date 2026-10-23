#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadModule, sha256, gitState } from '../../harness/modules.mjs';
import { repoRoot as root } from '../../harness/provenance.mjs';
import { collect } from './collect.mjs';
import { evaluate, readArcs } from './evaluate.mjs';
import { check, publish } from './report.mjs';

const dir = path.dirname(new URL(import.meta.url).pathname), read = f => JSON.parse(fs.readFileSync(f));
const config = read(path.join(dir, 'config.json'));
const configs = { v1c2: read(path.join(root, 'experiments/v1c2-console-covariance-realism/config.json')),
  v1: read(path.join(root, 'experiments/v1-ffm-physical-truth/config.json')), e3: read(path.join(root, 'experiments/e3-combined-catalog/config.json')) };
const { values } = parseArgs({ options: { check: { type: 'boolean' }, stage: { type: 'string' }, modules: { type: 'string' }, run: { type: 'string' }, 'baseline-run': { type: 'string' } } });
const output = path.join(root, 'results/v1c3');
if (values.check) { await check(root, config, configs); process.exit(0); }
assert(['train-sgp', 'train-ffm', 'test'].includes(values.stage), 'use --stage train-sgp|train-ffm|test');
assert(config.frozen);
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const registration = '5e1be5ef06815647e8e8a10c96a58a536b353105';
for (const file of ['PLAN.md', 'config.json']) {
  const name = `experiments/v1c3-console-covariance-calibration/${file}`;
  assert.equal(git(['show', `${registration}:${name}`]), fs.readFileSync(path.join(root, name), 'utf8').trim(), 'frozen registration changed');
}
const modules = path.resolve(values.modules ?? process.env.SDN_MODULES_ROOT ?? path.join(root, '../space-data-network-modules--console-covariance-calibration-20261023'));
const runId = values.run ?? 'v1c3-console-covariance-calibration-20261023';
const runDir = path.join(root, 'runs', runId); fs.mkdirSync(runDir, { recursive: true });
const manifestFile = path.join(runDir, 'manifest.json');
const manifest = fs.existsSync(manifestFile) ? read(manifestFile) : { run: runId, registration, started: new Date().toISOString(),
  configSha256: sha256(fs.readFileSync(path.join(dir, 'config.json'))), repository: gitState(root), modulesRepository: gitState(modules),
  modulesRoot: modules, runtime: { node: process.version, platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpus: os.cpus().length },
  workers: config.workers, threads: 1, inputs: {}, modules: {}, files: {}, invocations: [] };
assert.equal(manifest.configSha256, sha256(fs.readFileSync(path.join(dir, 'config.json'))));
manifest.invocations.push({ stage: values.stage, started: new Date().toISOString(), repository: gitState(root) });
const run = { dir: runDir, inputs: manifest.inputs, modules: manifest.modules, files: manifest.files,
  peakDispatchLoad: manifest.peakDispatchLoad ?? 0,
  checkpoint() { manifest.peakDispatchLoad = this.peakDispatchLoad; fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n'); },
  write(name, value) { const file = path.join(runDir, name); fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n'); this.files[name] = sha256(fs.readFileSync(file)); this.checkpoint(); } };
const input = (kind, file) => { const bytes = fs.readFileSync(file); const prior = run.inputs[kind]?.[file]; const hash = sha256(bytes);
  if (prior) assert.equal(hash, prior, `input changed: ${file}`); (run.inputs[kind] ??= {})[file] = hash; return bytes; };
// Check exact numerical artifacts before training, without reading frozen test observations.
const baselineManifest = read(path.join(root, 'results/v1c2/manifest.json'));
for (const p of baselineManifest.modules) {
  const file = path.join(modules, p.path, 'dist/isomorphic/module.wasm');
  assert.equal(sha256(input('artifacts', file)), p.wasmSha256, `not frozen V1c2 artifact: ${p.path}`);
}
for (const name of fs.readdirSync(dir).filter(f => /\.(mjs|json|md)$/.test(f))) {
  const f = path.join(dir, name); (run.inputs.implementation ??= {})[f] = sha256(fs.readFileSync(f));
}
for (const f of ['experiments/v1c2-console-covariance-realism/report.mjs', 'experiments/v1c2-console-covariance-realism/modules.mjs',
  'experiments/v1c-console-ffm-path/modules.mjs', 'experiments/e14-covariance-realism/realism.mjs', 'harness/stats.mjs',
  'experiments/e2b-correlated-covariance/stats.mjs', 'experiments/e2-catalog-covariance/score.mjs',
  'experiments/e3-combined-catalog/config.json', 'experiments/e3-combined-catalog/truth.mjs']) input('frozenSource', path.join(root, f));
input('model', path.join(modules, 'analysis/gp-error-model/data/e14-s3-kc.erm'));
input('codec', path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs'));
const requirePushed = relative => {
  const bytes = fs.readFileSync(path.join(root, relative));
  assert.equal(execFileSync('git', ['show', `HEAD:${relative}`], { cwd: root }).toString(), bytes.toString(), 'commit selection first');
  const sha = git(['rev-parse', 'HEAD']);
  const remote = git(['ls-remote', 'origin', 'refs/heads/task/console-covariance-calibration-20261023']).split(/\s/)[0];
  assert.equal(remote, sha, 'push all models and selection before proceeding');
  return { commit: sha, sha256: sha256(bytes), verifiedAt: new Date().toISOString() };
};
const gp = await loadModule(modules, 'analysis/gp-error-model'); run.modules[gp.provenance.path] = gp.provenance;
const codec = await import(pathToFileURL(path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs')));
const collectPhase = (phase, split, extra = {}) => collect({ root, run, modules, phase, split, config, e3: configs.e3, v1: configs.v1, ...extra });
const doEval = (arcs, mode, split, models) => evaluate({ arcs, mode, split, models, gp, codec, config, configs, run });
const saveSelection = (name, result) => {
  const file = path.join(output, `${name}.json`);
  const record = { split: config.train, targetBefore: config.trainingTargetBefore, ...result, selected: result.selection.selected,
    trainingRawSha256: run.files[`train-${name === 'sgp-selection' ? 'sgp' : 'ffm'}.jsonl`] };
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
  // Store every candidate's aggregate factors as a real typed MODEL, before test access.
  for (const [candidate, { model }] of Object.entries(result.models)) if (model) {
    const bytes = codec.frame('model', 'model', model).payload;
    fs.writeFileSync(path.join(output, `${name}-${candidate}.erm`), bytes);
  }
  return record;
};
try {
  if (values.stage === 'train-sgp') {
    assert(!manifest.testStarted, 'training is closed after test access');
    const arcs = await collectPhase('sgp', 'train');
    saveSelection('sgp-selection', await doEval(arcs, 'SGP4', 'train'));
  } else if (values.stage === 'train-ffm') {
    assert(!manifest.testStarted, 'training is closed after test access');
    manifest.sgpFreeze = requirePushed('results/v1c3/sgp-selection.json'); run.checkpoint();
    const s = read(path.join(output, 'sgp-selection.json'));
    const arcs = await collectPhase('ffm', 'train', { selection: { selected: s.selected, model: s.models[s.selected].model } });
    saveSelection('ffm-selection', await doEval(arcs, 'FFM-1', 'train'));
  } else {
    manifest.selectionFreeze ??= { sgp: requirePushed('results/v1c3/sgp-selection.json'), ffm: requirePushed('results/v1c3/ffm-selection.json') };
    manifest.testStarted ??= new Date().toISOString(); run.checkpoint();
    const baselineDir = values['baseline-run'] ?? process.env.SDN_V1C2_RUN_DIR ?? path.join(root, 'runs', baselineManifest.run);
    const raw = input('baseline', path.join(baselineDir, 'arcs.jsonl')); assert.equal(sha256(raw), baselineManifest.rawSha256);
    const prior = input('baseline', path.join(baselineDir, 'v1c-arcs.jsonl')); assert.equal(sha256(prior), baselineManifest.v1c.rawSha256);
    run.write('baseline-arcs.jsonl', raw); run.write('coverage-arcs.jsonl', prior);
    const baseline = { manifest: baselineManifest, arcs: readArcs(path.join(runDir, 'baseline-arcs.jsonl')), coverage: readArcs(path.join(runDir, 'coverage-arcs.jsonl')).filter(a => a.suite === 'E3') };
    const sgpSelection = read(path.join(output, 'sgp-selection.json')), ffmSelection = read(path.join(output, 'ffm-selection.json'));
    const sgp = await collectPhase('sgp', 'test', { baseline });
    const sgpResult = await doEval(sgp, 'SGP4', 'test', sgpSelection.models);
    const ffm = await collectPhase('ffm', 'test', { baseline, selection: { selected: sgpSelection.selected, model: sgpSelection.models[sgpSelection.selected].model } });
    const ffmResult = await doEval(ffm, 'FFM-1', 'test', ffmSelection.models);
    manifest.finished = new Date().toISOString(); run.checkpoint();
    publish(root, runDir, manifest, { SGP4: sgpResult.tables, 'FFM-1': ffmResult.tables }, configs);
  }
} finally { await gp.destroy(); run.checkpoint(); }
