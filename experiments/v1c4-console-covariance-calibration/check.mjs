// The E2E: re-derives every table, selection, fit and test cell from the recorded run, replays the inherited controls,
// and reproduces V1c3's published test cells from its recorded run (PLAN section 7). A missing input is a failure.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { sha256, loadModule } from '../../harness/modules.mjs';
import { dayList } from '../../harness/gp-archive.mjs';
import { candidatesOf, claimed, selectCv, scoreArcs, cellsOf, fitRows, foldOf, foldStartMs, fit, SGP4, FFM } from './cv.mjs';
import { compactCell, scoresJsonl } from './train.mjs';
import { deriveMetrics, referenceScores } from './test.mjs';
import { render, modelRecord, summarizeInputs } from './report.mjs';
import { custodyOf, availableSets, detectorInput } from './events.mjs';
import { makeDetector } from './maneuvers.mjs';
import { truthFor, elementSets, issueMs, pairKey } from './universe.mjs';
import { recordedTables } from '../v1c3-console-covariance-calibration/evaluate.mjs';
import { controls } from '../v1c3-console-covariance-calibration/controls.mjs';

const read = f => JSON.parse(fs.readFileSync(f));
const jsonl = f => fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const roundTrip = x => JSON.parse(JSON.stringify(x));
const count = cells => cells.filter(c => c.decision === 'REALISTIC').length;
const bar = message => console.log(`  ok ${message}`);

export async function check({ root, runDir, config, configs, registration, output }) {
  // The recorded run (raw OMM, truth and per-sample tables, ignored `runs/`) is local to the machine that made it. Without it the
  // committed artifacts are verified against each other and the skipped re-derivations are listed (PLAN amendment A1).
  if (!fs.existsSync(path.join(runDir, 'manifest.json'))) return checkCommitted({ root, config, configs, registration, output });
  const e3 = configs.e3, manifest = read(path.join(runDir, 'manifest.json')), committed = read(path.join(output, 'manifest.json'));
  assert(manifest.finished && manifest.selectionFreeze && manifest.testStarted, 'the run did not finish');
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
  let hashes = 0;
  // 1. frozen plan and configuration, manifest hashes, committed manifest
  assert.equal(manifest.configSha256, sha256(fs.readFileSync(path.join(root, 'experiments/v1c4-console-covariance-calibration/config.json'))));
  for (const file of ['PLAN.md', 'config.json']) {
    const name = `experiments/v1c4-console-covariance-calibration/${file}`;
    assert.equal(git(['show', `${registration}:${name}`]), fs.readFileSync(path.join(root, name), 'utf8').trim(), 'frozen registration changed');
  }
  for (const [name, hash] of Object.entries(manifest.files)) { assert.equal(sha256(fs.readFileSync(path.join(runDir, name))), hash, name); hashes++; }
  // Paths were recorded under the checkout and run directory of the run; here they map to this checkout and this run directory.
  const here = file => file.startsWith(manifest.runDirectory + '/') ? path.join(runDir, file.slice(manifest.runDirectory.length + 1)) : file.startsWith(manifest.repositoryRoot + '/') ? path.join(root, path.relative(manifest.repositoryRoot, file)) : file;
  for (const [kind, files] of Object.entries(manifest.inputs)) for (const [file, hash] of Object.entries(files)) {
    assert.equal(sha256(fs.readFileSync(here(file))), hash, `input changed: ${file}`); hashes++;
  }
  assert.deepEqual(committed.inputs, summarizeInputs(manifest.inputs, { root: manifest.repositoryRoot, runDir: manifest.runDirectory }), 'committed input summary differs from the run manifest');
  assert.deepEqual(committed, roundTrip({ ...manifest, inputs: committed.inputs, repositoryRoot: undefined, runDirectory: undefined }));
  bar(`${hashes} recorded hashes; committed manifest equals the run's`);
  const runtime = path.join(runDir, 'runtime');
  for (const [file, hash] of Object.entries(config.runtime.files)) assert.equal(sha256(fs.readFileSync(path.join(runtime, file))), hash, `runtime file differs from its pin: ${file}`);
  bar(`${Object.keys(config.runtime.files).length} provisioned runtime files equal their pins`);
  const gp = await loadModule(runtime, 'analysis/gp-error-model');
  const codec = await import(pathToFileURL(path.join(runtime, 'analysis/gp-error-model/scripts/erm-codec.mjs')));
  try {
    const sel = { [SGP4]: read(path.join(output, 'sgp-selection.json')), [FFM]: read(path.join(output, 'ffm-selection.json')) };
    const flagsTrain = new Map(jsonl(path.join(runDir, 'events-train.jsonl')).map(r => [r.key, r.flagged]));
    const flagRecordsTest = jsonl(path.join(runDir, 'events-test.jsonl')), flagsTest = new Map(flagRecordsTest.map(r => [r.key, r.flagged]));
    const training = { [SGP4]: jsonl(path.join(runDir, 'train-sgp.jsonl')), [FFM]: jsonl(path.join(runDir, 'train-ffm.jsonl')) };
    const testArcs = { [SGP4]: jsonl(path.join(runDir, 'test-sgp.jsonl')), [FFM]: jsonl(path.join(runDir, 'test-ffm.jsonl')) };
    // 2. freeze order and disjointness
    for (const [phase, mode] of [['sgp', SGP4], ['ffm', FFM]]) {
      const relative = `results/v1c4/${phase}-selection.json`, freeze = manifest.selectionFreeze[phase];
      assert.equal(sha256(fs.readFileSync(path.join(root, relative))), freeze.sha256);
      assert.equal(sha256(execFileSync('git', ['show', `${freeze.commit}:${relative}`], { cwd: root, maxBuffer: 1 << 28 })), freeze.sha256);
      assert(Date.parse(freeze.verifiedAt) <= Date.parse(manifest.testStarted), 'test read before the selection was pushed');
      assert.equal(sel[mode].trainingRawSha256, manifest.files[`train-${phase}.jsonl`]);
      assert.equal(sel[mode].eventsSha256, manifest.files['events-train.jsonl']);
      const keys = new Set(training[mode].map(a => a.key));
      for (const a of training[mode]) for (const s of a.samples ?? []) assert(s.ms < Date.parse(config.windows.trainingTargetBefore), 'training target after the embargo');
      for (const a of testArcs[mode]) { assert(!keys.has(a.key)); assert(a.ms >= Date.parse(`${config.windows.test[0]}T00:00:00Z`) - 18000); }
      assert(Math.max(...training[mode].map(a => a.ms)) < Math.min(...testArcs[mode].map(a => a.ms)));
    }
    bar('selections pushed before the test was read; training and test issue and truth times are disjoint');
    // 3. cross-validation: tables, ranking and selection from the recorded fold scores
    const configsCv = configs;
    for (const mode of MODES) {
      const candidates = candidatesOf(mode, config), s = sel[mode], foldCells = {};
      for (const c of candidates) {
        const rows = jsonl(path.join(runDir, `cv-${mode}-${c.name.replace('/', '_')}-scores.jsonl`));
        foldCells[c.name] = {};
        for (const id of s.evaluationFolds) {
          const scored = rows.filter(r => r.fold === id).map(({ fold, ...a }) => a);
          foldCells[c.name][id] = cellsOf(claimed(scored, c.arm, flagsTrain), mode, configsCv);
          assert.deepEqual(roundTrip(foldCells[c.name][id].map(compactCell)), s.cv[c.name][id], `${mode} ${c.name} ${id}`);
        }
      }
      const share = training[mode].filter(a => flagsTrain.get(a.key)).length / training[mode].length;
      assert.equal(share, s.flagShare);
      const eligible = c => c.arm === 'ALL' || share <= config.selection.flagShareCap;
      const reselected = selectCv(foldCells, candidates, eligible);
      assert.deepEqual(roundTrip(reselected.ranked), s.ranking); assert.equal(reselected.selected, s.selected);
      bar(`${mode}: ${candidates.length} candidates x ${s.evaluationFolds.length} folds re-derived; selected ${s.selected}`);
      // 4. every final fit re-derived in WASM from the recorded training arcs
      for (const c of candidates) {
        if (c.method === 'none') { assert.equal(s.models[c.name].model, null); continue; }
        const refit = await fit(gp, codec, fitRows(training[mode], { mode, base: c.base, arm: c.arm, flags: flagsTrain }), c.method, config, `v1c4-${mode}-${c.name}`);
        assert.deepEqual(roundTrip(refit.model), s.models[c.name].model, `recorded fit changed: ${mode} ${c.name}`);
        const erm = path.join(output, `${nameOf(mode)}-${c.name.replace('/', '_')}.erm`);
        assert.deepEqual(Buffer.from(codec.frame('model', 'model', refit.model).payload), fs.readFileSync(erm), `${erm}`);
      }
      // the selected candidate's fold fits and scores, replayed in WASM
      const c = candidates.find(x => x.name === s.selected);
      const rows = jsonl(path.join(runDir, `cv-${mode}-${c.name.replace('/', '_')}-scores.jsonl`));
      for (const id of s.evaluationFolds) {
        const prior = training[mode].filter(a => config.windows.folds.map(f => f.id).indexOf(foldOf(config, a.key)) < config.windows.folds.map(f => f.id).indexOf(id));
        const model = c.method === 'none' ? null : (await fit(gp, codec, fitRows(prior, { mode, base: c.base, arm: c.arm, flags: flagsTrain, cutoffMs: foldStartMs(config, e3, id) }), c.method, config, `v1c4-${mode}-${c.name}-cv-${id}`)).model;
        const replay = await scoreArcs({ gp, codec, model, arcs: training[mode].filter(a => foldOf(config, a.key) === id), mode, base: c.base });
        assert.deepEqual(roundTrip(replay), rows.filter(r => r.fold === id).map(({ fold, ...a }) => a), `${mode} ${c.name} ${id} replay`);
      }
      bar(`${mode}: ${candidates.filter(x => x.method !== 'none').length} final fits and ${s.selected}'s fold replays equal the record`);
    }
    // 5. the test: scores, cells, metrics, README and MODEL from the recorded run
    const scoredBy = { [SGP4]: {}, [FFM]: {} };
    for (const mode of MODES) for (const c of candidatesOf(mode, config)) scoredBy[mode][c.name] = jsonl(path.join(runDir, `test-${mode}-${c.name.replace('/', '_')}-scores.jsonl`));
    const refScored = jsonl(path.join(runDir, referenceScores));
    const metrics = deriveMetrics({ config, configs, registration, sgpSel: sel[SGP4], ffmSel: sel[FFM], sgpArcs: testArcs[SGP4], ffmArcs: testArcs[FFM], flagRecords: flagRecordsTest, scoredBy, refScored });
    assert.deepEqual(roundTrip(metrics), read(path.join(output, 'metrics.json')), 'metrics.json differs from the re-derived metrics');
    for (const mode of MODES) {
      const name = sel[mode].selected, c = candidatesOf(mode, config).find(x => x.name === name);
      const replay = await scoreArcs({ gp, codec, model: sel[mode].models[name].model, arcs: testArcs[mode], mode, base: c.base });
      assert.deepEqual(roundTrip(replay), scoredBy[mode][name], `${mode} ${name} test replay`);
    }
    const replayRef = await scoreArcs({ gp, codec, model: read(path.join(root, 'results/v1c3/sgp-selection.json')).models['F-coverage'].model, arcs: testArcs[SGP4], mode: SGP4, base: 'F' });
    assert.deepEqual(roundTrip(replayRef), refScored);
    assert.equal(render(metrics, committed, sel, config), fs.readFileSync(path.join(output, 'README.md'), 'utf8'), 'README differs');
    assert.deepEqual(read(path.join(output, 'MODEL.json')), roundTrip(modelRecord({ metrics, sgpSel: sel[SGP4], ffmSel: sel[FFM], manifest, config })));
    for (const m of MODES) for (const r of sel[m].ranking) {
      const t = metrics.modes[m][r.name];
      console.log(`    ${m} ${r.name}${r.name === sel[m].selected ? ' (selected)' : ''}: cross-validation ${Object.entries(r.realisticByFold).map(([id, n]) => `${id} ${n}`).join(' ')}; test claimed ${t.realistic.claimed}/24, all ${t.realistic.all}, unflagged ${t.realistic.unflagged}, flagged ${t.realistic.flaggedPooled}/6`);
    }
    bar(`test: ${MODES.map(m => `${m} ${sel[m].selected} ${metrics.modes[m][sel[m].selected].realistic.claimed}/24`).join(', ')}; metrics, README and MODEL re-derived; selected candidates replayed in WASM`);
    // 6. V1c3: its published test cells from its recorded run, and the provisioning replay of its training arcs
    const replayed = checkV1c3({ root, configs, training: training[SGP4] });
    bar(`V1c3's published test cells reproduced (F-coverage 4/24, FFM-1 coverage 3/24); ${replayed} SGP4 training arcs equal V1c3's recorded arcs`);
    // 7. the event rule re-derived for the registered sample of pairs
    const sampled = await checkEvents({ root, runDir, runtime, config, e3, flagsTrain, flagRecordsTest });
    bar(`event rule: ${sampled} pairs re-derived from the archive`);
    // 8. inherited controls on the recorded training arcs
    const withModel = Object.entries(sel[SGP4].models).find(([, m]) => m.model);
    const result = await controls({ runDir, modules: runtime, gp, codec, selection: { selected: withModel[0], models: sel[SGP4].models } });
    bar(`covariance controls: identity ${result.maxIdentityRelative}, sum ${result.maxSumScoreRelative}, zero-time ${result.maxZeroTimeRelative}; native/headless gp-error-model parity`);
    console.log(`V1C4-E2E PASS: ${hashes} hashes, ${MODES.map(m => `${m} ${sel[m].selected} ${metrics.modes[m][sel[m].selected].realistic.claimed}/24 on the fresh test`).join(', ')}; cross-validation, selections, fits, test cells, V1c3 reproduction and event flags re-derived.`);
  } finally { await gp.destroy(); }
}

// V1c3's published test cells (4/24 and 3/24) from its recorded run; and V1c4's SGP4 arcs for V1c3's training pairs equal V1c3's.
export function checkV1c3({ root, configs, training }) {
  const v1c3Dir = process.env.SDN_V1C3_RUN_DIR ?? path.join(root, 'runs/v1c3-console-covariance-calibration-20261023');
  assert(fs.existsSync(path.join(v1c3Dir, 'test-sgp.jsonl')), `V1c3's recorded run is required (SDN_V1C3_RUN_DIR): ${v1c3Dir}`);
  const published = read(path.join(root, 'results/v1c3/metrics.json')).test;
  for (const [mode, cand, expected] of [[SGP4, 'F-coverage', 4], [FFM, 'coverage', 3]]) {
    const cells = recordedTables(v1c3Dir, mode, 'test', configs)[cand];
    assert.deepEqual(cells, published[mode][cand]); assert.equal(count(cells), expected);
  }
  const theirs = new Map(jsonl(path.join(v1c3Dir, 'train-sgp.jsonl')).map(a => [a.key.replace('E3:', ''), a]));
  let replayed = 0;
  for (const a of training) {
    const b = theirs.get(a.key.replace('V4:', '')); if (!b || a.key.split(':').at(-1) > '2026-08-20') continue;
    assert.deepEqual([a.group, a.ms, a.missingHorizons, a.skipped, a.samples], [b.group, b.ms, b.missingHorizons, b.skipped, b.samples], `provisioning replay differs: ${a.key}`); replayed++;
  }
  assert(replayed > 800, 'too few overlapping arcs');
  return replayed;
}

// The event rule for the registered sample (the pairs with the smallest SHA-256 of their key): custody numbers and detector events.
export async function checkEvents({ root, runDir, runtime, config, e3, flagsTrain, flagRecordsTest }) {
  const trainRecords = jsonl(path.join(runDir, 'events-train.jsonl'));
  const eventRecords = [...trainRecords, ...flagRecordsTest];
  const sample = [...eventRecords].sort((a, b) => sha256(a.key).localeCompare(sha256(b.key))).slice(0, config.events.verificationSample);
  const detector = await makeDetector(runtime);
  const testKeys = new Set(flagRecordsTest.map(r => r.key));
  for (const [daysList, records] of [[dayList(config.windows.folds[0].from, config.windows.folds.at(-1).to), sample.filter(r => flagsTrain.has(r.key))], [dayList(...config.windows.test), sample.filter(r => testKeys.has(r.key))]]) {
    if (!records.length) continue;
    const objects = new Set(records.map(r => r.norad));
    const loaded = elementSets({ e3, days: daysList, keep: n => objects.has(n), epochLookbackDays: config.events.lookbackDays + 5, withHistory: false });
    const byObject = new Map(); for (const s of loaded.sets) { if (!byObject.has(s.norad)) byObject.set(s.norad, []); byObject.get(s.norad).push(s); }
    for (const r of records) {
      const available = availableSets(byObject.get(r.norad) ?? [], r.ms, config.events.lookbackDays), custody = custodyOf(available, r.ms, config.events);
      assert.deepEqual(roundTrip(custody), r.custody, `custody ${r.key}`);
      if (available.length >= config.events.detector.minimumSets) {
        const events = (await detector.events(detectorInput(available))).map(e => e.time);
        assert.deepEqual(events, r.detector.events, `detector ${r.key}`);
        assert.deepEqual(events.filter(t => t > r.ms - config.events.windowDays * 86400000 && t <= r.ms), r.detector.recent);
      } else assert.equal(r.detector.skipped, 'fewer than the minimum sets');
      assert.equal(Boolean(custody.flag || r.detector.recent.length), r.flagged);
    }
  }
  return sample.length;
}
const MODES = [SGP4, FFM];
const nameOf = mode => mode === SGP4 ? 'sgp' : 'ffm';

// What can be verified without the recorded run: the frozen registration, the freeze order in git history, the ranking and selection re-derived from the
// committed cross-validation cells, the metrics, README and MODEL re-rendered from the committed selections and metrics, and V1c3's published cells from
// V1c3's recorded run when that run is present. Everything that needs the raw run is named as skipped, never counted as passed.
export async function checkCommitted({ root, config, configs, registration, output }) {
  const committed = read(path.join(output, 'manifest.json')), metrics = read(path.join(output, 'metrics.json'));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
  const skipped = [];
  for (const file of ['PLAN.md', 'config.json']) {
    const name = `experiments/v1c4-console-covariance-calibration/${file}`;
    assert.equal(git(['show', `${registration}:${name}`]), fs.readFileSync(path.join(root, name), 'utf8').trim(), 'frozen registration changed');
  }
  assert.equal(committed.configSha256, sha256(fs.readFileSync(path.join(root, 'experiments/v1c4-console-covariance-calibration/config.json'))));
  assert(committed.finished && committed.selectionFreeze && committed.testStarted, 'the committed manifest is not a finished run');
  bar('frozen registration and configuration equal the committed manifest');
  const sel = { [SGP4]: read(path.join(output, 'sgp-selection.json')), [FFM]: read(path.join(output, 'ffm-selection.json')) };
  for (const [phase, mode] of [['sgp', SGP4], ['ffm', FFM]]) {
    const relative = `results/v1c4/${phase}-selection.json`, freeze = committed.selectionFreeze[phase];
    assert.equal(sha256(fs.readFileSync(path.join(root, relative))), freeze.sha256, `${relative} changed after its freeze`);
    assert.equal(sha256(execFileSync('git', ['show', `${freeze.commit}:${relative}`], { cwd: root, maxBuffer: 1 << 28 })), freeze.sha256);
    execFileSync('git', ['merge-base', '--is-ancestor', freeze.commit, 'HEAD'], { cwd: root });
    assert(Date.parse(freeze.verifiedAt) <= Date.parse(committed.testStarted), 'test read before the selection was pushed');
    assert.equal(sel[mode].trainingRawSha256, committed.files[`train-${phase}.jsonl`]);
    assert.equal(sel[mode].eventsSha256, committed.files['events-train.jsonl']);
  }
  bar('both selections were frozen in git before the test started, and are unchanged');
  for (const mode of MODES) {
    const candidates = candidatesOf(mode, config), s = sel[mode];
    const eligible = c => c.arm === 'ALL' || s.flagShare <= config.selection.flagShareCap;
    // the committed cells are compact ({ mean: [estimate, lower, upper], coverage: [...] }); the ranking reads the same fields as the cells of the run
    const expand = cells => cells.map(c => ({ ...c, meanD2Over3: c.mean ? { estimate: c.mean[0] } : null, coverage95: c.coverage ? { estimate: c.coverage[0] } : null }));
    const cells = Object.fromEntries(Object.entries(s.cv).map(([name, folds]) => [name, Object.fromEntries(Object.entries(folds).map(([id, x]) => [id, expand(x)]))]));
    const reselected = selectCv(cells, candidates, eligible);
    assert.deepEqual(roundTrip(reselected.ranked), s.ranking); assert.equal(reselected.selected, s.selected);
    bar(`${mode}: ${candidates.length} candidates x ${s.evaluationFolds.length} folds ranked again from the committed cells; selected ${s.selected}`);
  }
  const sgpMetric = metrics.modes[SGP4][sel[SGP4].selected], ffmMetric = metrics.modes[FFM][sel[FFM].selected];
  assert.equal(render(metrics, committed, sel, config), fs.readFileSync(path.join(output, 'README.md'), 'utf8'), 'README differs from the committed metrics');
  assert.deepEqual(read(path.join(output, 'MODEL.json')), roundTrip(modelRecord({ metrics, sgpSel: sel[SGP4], ffmSel: sel[FFM], manifest: committed, config })));
  bar(`README and MODEL.json re-rendered from the committed metrics: ${sel[SGP4].selected} ${sgpMetric.realistic.claimed}/24, ${sel[FFM].selected} ${ffmMetric.realistic.claimed}/24 on the fresh test`);
  const v1c3Dir = process.env.SDN_V1C3_RUN_DIR ?? path.join(root, 'runs/v1c3-console-covariance-calibration-20261023');
  if (fs.existsSync(path.join(v1c3Dir, 'test-sgp.jsonl'))) {
    const published = read(path.join(root, 'results/v1c3/metrics.json')).test;
    for (const [mode, cand, expected] of [[SGP4, 'F-coverage', 4], [FFM, 'coverage', 3]]) {
      const cells = recordedTables(v1c3Dir, mode, 'test', configs)[cand];
      assert.deepEqual(cells, published[mode][cand]); assert.equal(count(cells), expected);
    }
    bar("V1c3's published test cells reproduced from V1c3's recorded run (F-coverage 4/24, FFM-1 coverage 3/24)");
  } else skipped.push("V1c3's recorded run (SDN_V1C3_RUN_DIR) is absent: its published cells were not reproduced");
  skipped.push('the recorded V1c4 run (raw sets, truth, per-sample scores, run manifest hashes) is not on this machine: the fold-cell, fit, test-cell, event-rule, provisioning-replay and control re-derivations were not run');
  for (const line of skipped) console.log(`  SKIPPED ${line}`);
  console.log(`V1C4-E2E PASS (committed artifacts only; ${skipped.length} re-derivation group(s) skipped, listed above)`);
}
