// The E2E: re-derives every table, selection, fit and test cell from the recorded run in the durable run directory (PLAN.md section 3), replays the
// selected candidate in WASM, and verifies the freeze order in git. Without the run (another machine) it verifies the committed artifacts against each other
// and lists the re-derivations it could not do as SKIPPED (never as passed).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { sha256, loadModule } from '../../harness/modules.mjs';
import { dayList } from '../../harness/gp-archive.mjs';
import { config, configs, e3, registration, git, read, root, dir, universes } from './run.mjs';
import { candidatesOf, claimed, selectCv, scoreArcs, cellsOf, fitRows, fitTiered, foldOf, foldStartMs, tierGroups } from './cv.mjs';
import { compactCell, scoresJsonl } from './train.mjs';
import { deriveMetrics, scoresFile } from './test.mjs';
import { render, modelRecord, readerTable, summarizeInputs } from './report.mjs';
import { checkEvents } from '../v1c4-console-covariance-calibration/check.mjs';
import { controls } from '../v1c3-console-covariance-calibration/controls.mjs';

const jsonl = f => fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const roundTrip = x => JSON.parse(JSON.stringify(x));
const bar = message => console.log(`  ok ${message}`);
const safe = name => name.replace(/[/|]/g, '_');
const output = path.join(root, 'results/v1c5');
export const registrationB = process.env.V1C5_REGISTRATION_B ?? 'f59f2b13f6447a6bb0c8a5cbb078f99fb849c02f';
const specOf = () => read(path.join(dir, 'candidates.json'));

function frozenFiles() {
  for (const file of ['PLAN.md', 'config.json']) {
    const name = `experiments/v1c5/${file}`;
    assert.equal(git(['show', `${registration}:${name}`]), fs.readFileSync(path.join(root, name), 'utf8').trim(), 'registration A changed');
  }
  for (const file of ['PLAN-B.md', 'candidates.json']) {
    const name = `experiments/v1c5/${file}`;
    assert.equal(git(['show', `${registrationB}:${name}`]), fs.readFileSync(path.join(root, name), 'utf8').trim(), 'registration B changed');
  }
  bar('registrations A and B are the committed files');
}

export async function check({ runDir }) {
  if (!fs.existsSync(path.join(runDir, 'manifest.json'))) return checkCommitted();
  const spec = specOf(), candidates = candidatesOf(spec);
  const manifest = read(path.join(runDir, 'manifest.json')), committed = read(path.join(output, 'manifest.json')), sel = read(path.join(output, 'selection.json'));
  assert(manifest.finished && manifest.selectionFreeze && manifest.testStarted, 'the run did not finish');
  frozenFiles();
  assert.equal(manifest.configSha256, sha256(fs.readFileSync(path.join(dir, 'config.json'))));
  let hashes = 0;
  for (const [name, hash] of Object.entries(manifest.files)) { assert.equal(sha256(fs.readFileSync(path.join(runDir, name))), hash, name); hashes++; }
  const here = file => file.startsWith(manifest.runDirectory + '/') ? path.join(runDir, file.slice(manifest.runDirectory.length + 1)) : file.startsWith(manifest.repositoryRoot + '/') ? path.join(root, path.relative(manifest.repositoryRoot, file)) : file;
  for (const files of Object.values(manifest.inputs)) for (const [file, hash] of Object.entries(files)) { assert.equal(sha256(fs.readFileSync(here(file))), hash, `input changed: ${file}`); hashes++; }
  assert.deepEqual(committed.inputs, summarizeInputs(manifest.inputs, { root: manifest.repositoryRoot, runDir: manifest.runDirectory }), 'committed input summary differs from the run manifest');
  assert.deepEqual(committed, roundTrip({ ...manifest, inputs: committed.inputs, repositoryRoot: undefined, runDirectory: undefined }));
  bar(`${hashes} recorded hashes; committed manifest equals the run's`);
  const runtime = path.join(runDir, 'runtime');
  for (const [file, hash] of Object.entries(config.runtime.files)) assert.equal(sha256(fs.readFileSync(path.join(runtime, file))), hash, `runtime file differs from its pin: ${file}`);
  const gp = await loadModule(runtime, 'analysis/gp-error-model');
  const codec = await import(pathToFileURL(path.join(runtime, 'analysis/gp-error-model/scripts/erm-codec.mjs')));
  try {
    const flagsTrain = jsonl(path.join(runDir, 'events-train.jsonl')), recordsTrain = new Map(flagsTrain.map(r => [r.key, r])), flagMap = new Map(flagsTrain.map(r => [r.key, r.flagged]));
    const flagsTest = jsonl(path.join(runDir, 'events-test.jsonl')), recordsTest = new Map(flagsTest.map(r => [r.key, r]));
    const training = jsonl(path.join(runDir, 'train-sgp.jsonl')), testArcs = jsonl(path.join(runDir, 'test-sgp.jsonl'));
    // freeze order and disjointness
    const freeze = manifest.selectionFreeze, relative = 'results/v1c5/selection.json';
    assert.equal(sha256(fs.readFileSync(path.join(root, relative))), freeze.sha256);
    assert.equal(sha256(Buffer.from(execFileSyncBuffer(['show', `${freeze.commit}:${relative}`]))), freeze.sha256);
    assert(Date.parse(freeze.verifiedAt) <= Date.parse(manifest.testStarted), 'test read before the selection was pushed');
    assert.equal(sel.trainingRawSha256, manifest.files['train-sgp.jsonl']); assert.equal(sel.eventsSha256, manifest.files['events-train.jsonl']);
    const keys = new Set(training.map(a => a.key));
    for (const a of training) for (const s of a.samples ?? []) assert(s.ms < Date.parse(config.windows.trainingTargetBefore), 'training target after the embargo');
    for (const a of testArcs) { assert(!keys.has(a.key)); assert(a.ms >= Date.parse(`${config.windows.test[0]}T00:00:00Z`) - 18000); }
    assert(Math.max(...training.map(a => a.ms)) < Math.min(...testArcs.map(a => a.ms)));
    bar('the selection was pushed before the test was read; training and test issue and truth times are disjoint');
    // cross-validation tables, ranking and selection from the recorded fold scores
    const foldCells = {};
    for (const c of candidates) {
      const rows = jsonl(path.join(runDir, `cv-${safe(c.name)}-scores.jsonl`));
      foldCells[c.name] = {};
      for (const id of sel.evaluationFolds) {
        const scored = rows.filter(r => r.fold === id).map(({ fold, ...a }) => a);
        foldCells[c.name][id] = cellsOf(claimed(scored, c.claim, flagMap), configs);
        assert.deepEqual(roundTrip(foldCells[c.name][id].map(compactCell)), sel.cv[c.name][id], `${c.name} ${id}`);
      }
    }
    const share = training.filter(a => flagMap.get(a.key)).length / training.length;
    assert.equal(share, sel.flagShare);
    const reselected = selectCv(foldCells, candidates, spec, c => c.claim === 'ALL' || share <= spec.selection.flagShareCap);
    assert.deepEqual(roundTrip(reselected.ranked), sel.ranking); assert.equal(reselected.selected, sel.selected);
    bar(`${candidates.length} candidates x ${sel.evaluationFolds.length} folds re-derived; selected ${sel.selected}`);
    // every final fit re-derived in WASM from the recorded training arcs
    for (const c of candidates) {
      if (c.method === 'none') { assert.equal(sel.models[c.name].model, null); continue; }
      const refit = await fitTiered(gp, codec, fitRows(training, { base: c.base, tiering: c.tiering, claim: c.claim, flagRecords: recordsTrain, spec }), c.method, config, `v1c5-${c.name}`, tierGroups(c, spec));
      assert.deepEqual(roundTrip(refit.model), sel.models[c.name].model, `recorded fit changed: ${c.name}`);
      assert.deepEqual(Buffer.from(codec.frame('model', 'model', refit.model).payload), fs.readFileSync(path.join(output, `${safe(c.name)}.erm`)), `${c.name}.erm`);
    }
    bar(`${candidates.filter(c => c.method !== 'none').length} final fits re-derived in WASM equal the record`);
    // the selected candidate's fold fits and scores replayed in WASM
    const chosen = candidates.find(c => c.name === sel.selected), rows = jsonl(path.join(runDir, `cv-${safe(chosen.name)}-scores.jsonl`));
    const ids = config.windows.folds.map(f => f.id);
    for (const id of sel.evaluationFolds) {
      const prior = training.filter(a => ids.indexOf(foldOf(config, a.key)) < ids.indexOf(id));
      const model = chosen.method === 'none' ? null : (await fitTiered(gp, codec, fitRows(prior, { base: chosen.base, tiering: chosen.tiering, claim: chosen.claim, flagRecords: recordsTrain, spec, cutoffMs: foldStartMs(config, e3, id) }), chosen.method, config, `v1c5-${chosen.name}-cv-${id}`, tierGroups(chosen, spec))).model;
      const replay = await scoreArcs({ gp, codec, model, arcs: training.filter(a => foldOf(config, a.key) === id), base: chosen.base, tiering: chosen.tiering, flagRecords: recordsTrain, spec });
      assert.deepEqual(roundTrip(replay), rows.filter(r => r.fold === id).map(({ fold, ...a }) => a), `${chosen.name} ${id} replay`);
    }
    bar(`${chosen.name}'s fold fits and scores replayed in WASM equal the record`);
    // the test: scores, cells, metrics, README, reader table and MODEL from the recorded run
    const scoredBy = Object.fromEntries(candidates.map(c => [c.name, jsonl(path.join(runDir, scoresFile(c.name)))]));
    const metrics = deriveMetrics({ config, configs, spec, registration, sel, arcs: testArcs, flagRecords: flagsTest, scoredBy });
    assert.deepEqual(roundTrip(metrics), read(path.join(output, 'metrics.json')), 'metrics.json differs from the re-derived metrics');
    const replay = await scoreArcs({ gp, codec, model: sel.models[chosen.name].model, arcs: testArcs, base: chosen.base, tiering: chosen.tiering, flagRecords: recordsTest, spec });
    assert.deepEqual(roundTrip(replay), scoredBy[chosen.name], `${chosen.name} test replay`);
    assert.equal(render(metrics, committed, sel, spec, config), fs.readFileSync(path.join(output, 'README.md'), 'utf8'), 'README differs');
    assert.deepEqual(read(path.join(output, 'table.json')), roundTrip(readerTable(metrics, sel, spec)));
    assert.deepEqual(read(path.join(output, 'MODEL.json')), roundTrip(modelRecord({ metrics, sel, spec, manifest, config })));
    for (const r of sel.ranking) { const t = metrics.candidates[r.name]; console.log(`    ${r.name}${r.name === sel.selected ? ' (selected)' : ''}: cross-validation ${Object.entries(r.realisticByFold).map(([id, n]) => `${id} ${n}`).join(' ')}; test claimed ${t.realistic.claimed}/24, all ${t.realistic.all}, unflagged ${t.realistic.unflagged}`); }
    bar(`test: ${sel.selected} ${metrics.candidates[sel.selected].realistic.claimed}/24; metrics, README, reader table and MODEL re-derived; the selected candidate replayed in WASM`);
    const sampled = await checkEvents({ root, runDir, runtime, config, e3, flagsTrain: flagMap, flagRecordsTest: flagsTest });
    bar(`event rule: ${sampled} pairs re-derived from the archive`);
    const withModel = Object.entries(sel.models).find(([, m]) => m.model);
    const result = await controls({ runDir, modules: runtime, gp, codec, selection: { selected: withModel[0], models: sel.models } });
    bar(`covariance controls: identity ${result.maxIdentityRelative}, sum ${result.maxSumScoreRelative}, zero-time ${result.maxZeroTimeRelative}`);
    console.log(`V1C5-E2E PASS: ${hashes} hashes, ${sel.selected} ${metrics.candidates[sel.selected].realistic.claimed}/24 on the fresh test; cross-validation, selection, fits, test cells and the event-rule sample re-derived from the durable run`);
  } finally { await gp.destroy(); }
}

import { execFileSync } from 'node:child_process';
const execFileSyncBuffer = args => execFileSync('git', args, { cwd: root, maxBuffer: 1 << 28 });

// What can be verified without the run: the frozen registrations, the freeze order in git history, the ranking re-derived from the committed cells,
// the metrics re-rendered into README, reader table and MODEL.
export async function checkCommitted() {
  const spec = specOf(), committed = read(path.join(output, 'manifest.json')), metrics = read(path.join(output, 'metrics.json')), sel = read(path.join(output, 'selection.json'));
  frozenFiles();
  assert(committed.finished && committed.selectionFreeze && committed.testStarted, 'the committed manifest is not a finished run');
  const freeze = committed.selectionFreeze, relative = 'results/v1c5/selection.json';
  assert.equal(sha256(fs.readFileSync(path.join(root, relative))), freeze.sha256, `${relative} changed after its freeze`);
  assert.equal(sha256(execFileSyncBuffer(['show', `${freeze.commit}:${relative}`])), freeze.sha256);
  execFileSync('git', ['merge-base', '--is-ancestor', freeze.commit, 'HEAD'], { cwd: root });
  assert(Date.parse(freeze.verifiedAt) <= Date.parse(committed.testStarted), 'test read before the selection was pushed');
  bar('the selection was frozen in git before the test started and is unchanged');
  const expand = cells => cells.map(c => ({ ...c, meanD2Over3: c.mean ? { estimate: c.mean[0] } : null, coverage95: c.coverage ? { estimate: c.coverage[0] } : null }));
  const cells = Object.fromEntries(Object.entries(sel.cv).map(([name, folds]) => [name, Object.fromEntries(Object.entries(folds).map(([id, x]) => [id, expand(x)]))]));
  const reselected = selectCv(cells, candidatesOf(spec), spec, c => c.claim === 'ALL' || sel.flagShare <= spec.selection.flagShareCap);
  assert.deepEqual(roundTrip(reselected.ranked), sel.ranking); assert.equal(reselected.selected, sel.selected);
  bar(`ranking and selection (${sel.selected}) derived again from the committed cross-validation cells`);
  assert.equal(render(metrics, committed, sel, spec, config), fs.readFileSync(path.join(output, 'README.md'), 'utf8'), 'README differs from the committed metrics');
  assert.deepEqual(read(path.join(output, 'table.json')), roundTrip(readerTable(metrics, sel, spec)));
  assert.deepEqual(read(path.join(output, 'MODEL.json')), roundTrip(modelRecord({ metrics, sel, spec, manifest: committed, config })));
  bar('README, reader table and MODEL.json re-rendered from the committed metrics');
  console.log('  SKIPPED the durable run (raw sets, truth, per-sample scores, run manifest hashes) is not on this machine: the fold-cell, fit, test-cell, event-rule and control re-derivations were not run');
  console.log('V1C5-E2E PASS (committed artifacts only; 1 re-derivation group skipped, listed above)');
}
