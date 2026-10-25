// The E2E: re-derives the fits, the scores, the Gaussian-rule cells, the screening criterion, the recommendation, the README and the reader table from the recorded run in
// the durable run directory (PLAN section 8), replays the frozen model in WASM, and verifies the freeze order in git. Without the run (another machine) it verifies
// the committed artifacts against each other and lists the re-derivations it could not do as SKIPPED (never as passed).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { sha256 } from '../../harness/modules.mjs';
import { scoreArcs } from '../v1c5/cv.mjs';
import { checkEvents } from '../v1c4-console-covariance-calibration/check.mjs';
import { base, config, e3, root, git, read, registration, output, configFile, frozenModel, frozenSpec, frozenName, scoresFile, loadGp, jsonl, roundTrip, hashOf } from './common.mjs';
import { deriveMetrics, controls } from './test.mjs';
import { render, readerTable, summarizeInputs } from './report.mjs';
import { trainingPopulation, fitsOf, OOF_FILE, EVENTS_FILE } from './fit.mjs';
import { recommendation } from './criterion.mjs';

const bar = message => console.log(`  ok ${message}`);
const gitBytes = args => execFileSync('git', args, { cwd: root, maxBuffer: 1 << 28 });

function frozenFiles() {
  for (const file of ['PLAN.md', 'config.json']) {
    const name = `experiments/v1c5-rescore/${file}`;
    assert.equal(git(['show', `${registration}:${name}`]), fs.readFileSync(path.join(root, name), 'utf8').trim(), 'registration changed');
  }
  assert.equal(hashOf(path.join(root, config.base.configFile)), config.base.configSha256, 'V1c5 config changed');
  bar('the registration is the committed plan and config; V1c5 config unchanged');
}
function freezeOrder(freeze, testStarted) {
  const relative = 'results/v1c5-rescore/fits.json', bytes = fs.readFileSync(path.join(root, relative));
  assert.equal(sha256(bytes), freeze.sha256, 'fits.json changed after its freeze');
  assert.equal(sha256(gitBytes(['show', `${freeze.commit}:${relative}`])), freeze.sha256);
  execFileSync('git', ['merge-base', '--is-ancestor', freeze.commit, 'HEAD'], { cwd: root });
  assert(Date.parse(freeze.verifiedAt) <= Date.parse(testStarted), 'test read before the fits were pushed');
  bar('the fits were frozen in git before the test started and are unchanged');
}
const pins = () => {
  const f = config.frozenModel;
  for (const pin of [f.selection, f.erm, f.metrics]) assert.equal(hashOf(path.join(root, pin.file)), pin.sha256, `V1c5 result changed: ${pin.file}`);
  bar('the frozen model, its selection and its metrics equal V1c5\'s pinned results');
};

export async function check({ runDir }) {
  if (!fs.existsSync(path.join(runDir, 'manifest.json'))) return checkCommitted();
  const manifest = read(path.join(runDir, 'manifest.json')), committed = read(path.join(output, 'manifest.json')), fits = read(path.join(output, 'fits.json'));
  assert(manifest.finished && manifest.fitsFreeze && manifest.testStarted, 'the run did not finish');
  frozenFiles(); pins();
  assert.equal(manifest.configSha256, hashOf(path.join(root, configFile)));
  let hashes = 0;
  for (const [name, hash] of Object.entries(manifest.files)) { assert.equal(hashOf(path.join(runDir, name)), hash, name); hashes++; }
  const here = file => file.startsWith(manifest.runDirectory + '/') ? path.join(runDir, file.slice(manifest.runDirectory.length + 1)) : file.startsWith(manifest.repositoryRoot + '/') ? path.join(root, path.relative(manifest.repositoryRoot, file)) : file;
  for (const files of Object.values(manifest.inputs)) for (const [file, hash] of Object.entries(files)) { assert.equal(hashOf(here(file)), hash, `input changed: ${file}`); hashes++; }
  assert.deepEqual(committed.inputs, summarizeInputs(manifest.inputs, { root: manifest.repositoryRoot, runDir: manifest.runDirectory }), 'committed input summary differs from the run manifest');
  assert.deepEqual(committed, roundTrip({ ...manifest, inputs: committed.inputs, repositoryRoot: undefined, runDirectory: undefined }));
  bar(`${hashes} recorded hashes; committed manifest equals the run's`);
  const runtime = path.join(runDir, 'runtime');
  for (const [file, hash] of Object.entries(base.runtime.files)) assert.equal(hashOf(path.join(runtime, file)), hash, `runtime file differs from its pin: ${file}`);
  freezeOrder(manifest.fitsFreeze, manifest.testStarted);
  // the fits from the recorded training population
  assert.equal(manifest.files[OOF_FILE], config.training.outOfFold.sha256); assert.equal(manifest.files[EVENTS_FILE], config.training.events.sha256);
  const samples = trainingPopulation(runDir), refit = fitsOf(samples);
  assert.deepEqual(roundTrip({ ...fits, registration: undefined, inputs: undefined, samples: undefined }), roundTrip({ ...refit }), 'recorded fits differ from the re-derived fits');
  assert.equal(fits.samples, samples.length);
  bar(`T and Q re-derived from ${samples.length} training out-of-fold samples equal fits.json`);
  const { gp, codec } = await loadGp(runtime);
  try {
    const { model } = frozenModel(), spec = frozenSpec(), chosen = spec.candidates[0];
    assert.deepEqual(Buffer.from(codec.frame('model', 'model', model).payload), fs.readFileSync(path.join(root, config.frozenModel.erm.file)), 'the frozen .erm differs from its model');
    const flagsTest = jsonl(path.join(runDir, 'events-test.jsonl')), recordsTest = new Map(flagsTest.map(r => [r.key, r])), testArcs = jsonl(path.join(runDir, 'test-sgp.jsonl'));
    const flagsTrain = new Map(jsonl(path.join(runDir, EVENTS_FILE)).map(r => [r.key, r.flagged]));
    for (const a of testArcs) assert(a.ms >= Date.parse(`${base.windows.test[0]}T00:00:00Z`) - 18000, 'test arc before the window');
    bar('the test arcs are inside the test window');
    const scored = jsonl(path.join(runDir, scoresFile));
    const replay = await scoreArcs({ gp, codec, model, arcs: testArcs, base: chosen.base, tiering: chosen.tiering, flagRecords: recordsTest, spec });
    assert.deepEqual(roundTrip(replay), scored, 'the frozen model replayed in WASM differs from the recorded scores');
    bar(`${frozenName} replayed in WASM on ${testArcs.length} arcs equals the recorded scores`);
    const metrics = deriveMetrics({ arcs: testArcs, flagRecords: flagsTest, scored, fits });
    assert.deepEqual(roundTrip(metrics), read(path.join(output, 'metrics.json')), 'metrics.json differs from the re-derived metrics');
    assert(metrics.controls.reproduced);
    assert.equal(render(metrics, committed, fits), fs.readFileSync(path.join(output, 'README.md'), 'utf8'), 'README differs');
    assert.deepEqual(read(path.join(output, 'table.json')), roundTrip(readerTable(metrics, fits)));
    bar(`test: Gaussian rule ${metrics.gaussianRule.realistic.unflagged}/24 REALISTIC, screening criterion, recommendation, README and reader table re-derived; the control against V1c5 holds`);
    const sampled = await checkEvents({ root, runDir, runtime, config: base, e3, flagsTrain, flagRecordsTest: flagsTest });
    bar(`event rule: ${sampled} pairs re-derived from the archive`);
    console.log(`V1C5-RESCORE-E2E PASS: ${hashes} hashes, fits, frozen-model scores, ${metrics.gaussianRule.realistic.unflagged}/24 Gaussian-rule cells and the screening criterion (G, T, Q) re-derived from the durable run`);
  } finally { await gp.destroy(); }
}

// What can be verified without the run: the registration, the freeze order in git, the recommendation and control re-derived from the committed numbers, the
// README and reader table re-rendered from the committed metrics.
export async function checkCommitted() {
  const committed = read(path.join(output, 'manifest.json')), metrics = read(path.join(output, 'metrics.json')), fits = read(path.join(output, 'fits.json'));
  frozenFiles(); pins();
  assert(committed.finished && committed.fitsFreeze && committed.testStarted, 'the committed manifest is not a finished run');
  freezeOrder(committed.fitsFreeze, committed.testStarted);
  const C = metrics.criterion;
  assert.deepEqual(roundTrip(recommendation(C.unflagged.G.classes, C.unflagged.T.classes, C.logScore.unflagged)), C.recommendation);
  assert.deepEqual(roundTrip(controls(metrics, read(path.join(root, config.frozenModel.metrics.file)))), metrics.controls);
  assert(metrics.controls.reproduced);
  bar('recommendation and the control against V1c5 derived again from the committed numbers');
  assert.equal(render(metrics, committed, fits), fs.readFileSync(path.join(output, 'README.md'), 'utf8'), 'README differs from the committed metrics');
  assert.deepEqual(read(path.join(output, 'table.json')), roundTrip(readerTable(metrics, fits)));
  bar('README and reader table re-rendered from the committed metrics');
  console.log('  SKIPPED the durable run (training population, test arcs, per-sample scores, run manifest hashes) is not on this machine: the fit, WASM replay, criterion and event-rule re-derivations were not run');
  console.log('V1C5-RESCORE-E2E PASS (committed artifacts only; 1 re-derivation group skipped, listed above)');
}
