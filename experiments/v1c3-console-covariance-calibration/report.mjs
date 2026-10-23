import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { sha256, loadModule } from '../../harness/modules.mjs';
import { summarize, checkRecorded } from '../v1c2-console-covariance-realism/report.mjs';
import { readArcs, recordedTables } from './evaluate.mjs';
import { select, sgpCandidates, methods, fit, stratum } from './calibration.mjs';
import { controls } from './controls.mjs';
const read = p => JSON.parse(fs.readFileSync(p));
const count = cells => cells.filter(c => c.decision === 'REALISTIC').length;
const f = n => Number.isFinite(n) ? n.toPrecision(5) : '—';
export function diagnostics(arcs) {
  const samples = arcs.filter(a => a.group === 'GPS').flatMap(a => (a.samples ?? []).map(s => ({ object: a.norad, key: a.key, ...s }))).filter(s => Number.isFinite(s.score?.d2Predicted));
  const total = samples.reduce((n, s) => n + s.score.d2Predicted, 0);
  const byObject = new Map();
  for (const s of samples) {
    if (!byObject.has(s.object)) byObject.set(s.object, []);
    byObject.get(s.object).push(s);
  }
  return { samples: samples.length, sumD2: total, objects: [...byObject].map(([object, rows]) => {
    const scores = rows.map(r => r.score.d2Predicted).sort((a, b) => a - b), sum = scores.reduce((a, b) => a + b, 0);
    const tail = [...rows].sort((a, b) => b.score.d2Predicted - a.score.d2Predicted).slice(0, 10);
    const chronological = rows.filter(s => s.hours === 1).sort((a, b) => a.ms - b.ms);
    const maxConsecutiveAbsoluteErrorChangeM = [0, 1, 2].map(k => Math.max(0, ...chronological.slice(1).map((r, i) => Math.abs(r.score.errorRtn[k] - chronological[i].score.errorRtn[k]))));
    const finite = a => a.filter(Number.isFinite);
    const range = a => finite(a).length ? [Math.min(...finite(a)), Math.max(...finite(a))] : null;
    return { object, n: rows.length, contribution: total ? sum / total : 0, meanD2Over3: sum / rows.length / 3,
      medianD2Over3: (scores[Math.floor((scores.length - 1) / 2)] + scores[Math.ceil((scores.length - 1) / 2)]) / 6,
      maxD2Over3: scores.at(-1) / 3, topTenLogDetRange: range(tail.map(s => s.score.logDetCombined)),
      topTenMarginalVarianceRangesM2: [0, 2, 5].map(k => range(tail.map(s => s.score.predictedRtn[k]))),
      statuses: Object.fromEntries([...new Set(rows.map(s => s.status))].map(status => [status, rows.filter(s => s.status === status).length])),
      maxConsecutiveAbsoluteErrorChangeM };
  }).sort((a, b) => b.contribution - a.contribution) };
}
export function render(metrics, manifest, selections) {
  const out = ['# V1c3 — pre-registered covariance calibration', '',
    `Selected on August training only: **SGP4 ${selections.SGP4.selected}: ${count(metrics.test.SGP4[selections.SGP4.selected])}/24 test cells; FFM-1 ${selections['FFM-1'].selected}: ${count(metrics.test['FFM-1'][selections['FFM-1'].selected])}/24**.`, '',
    'Training issues: 2026-08-03–24; every target precedes August 28 UTC. Test: V1c2’s unchanged September 7–26 pairs. Both issue and truth times are disjoint; objects overlap. The population prior has older training and a broader published validation domain.', '',
    'The exact paper rule and V1c2 bootstrap/verdict implementation are imported: mean d²/3 in [0.8,1.25], coverage in [0.93,0.97], at least 30 samples and three objects; 2,000 object-cluster resamples. No test tuning or truth exclusions. All covariance operations, fits and STM transport run in WASM.', '',
    '[Frozen plan](../../experiments/v1c3-console-covariance-calibration/PLAN.md) · [All metrics](metrics.json) · [Manifest](manifest.json) · [MODEL application](MODEL.json)', '',
    '| Mode | Candidate | Training realistic /24 | Test realistic /24 |', '| --- | --- | ---: | ---: |'];
  for (const mode of ['SGP4', 'FFM-1']) for (const candidate of Object.keys(metrics.test[mode])) out.push(`| ${mode} | ${candidate}${candidate === selections[mode].selected ? ' (selected)' : ''} | ${count(selections[mode].tables[candidate])} | ${count(metrics.test[mode][candidate])} |`);
  for (const mode of ['SGP4', 'FFM-1']) {
    out.push('', `## Selected ${mode}: ${selections[mode].selected}`, '', '| Group | h | n / objects | Mean d²/3 [95% CI] | Median d²/3 | 95% coverage [CI] | Non-PD / unavailable | Verdict |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const c of metrics.test[mode][selections[mode].selected]) out.push(`| ${c.group} | ${c.hours} | ${c.n} / ${c.objects} | ${f(c.meanD2Over3?.estimate)} [${f(c.meanD2Over3?.lower)}, ${f(c.meanD2Over3?.upper)}] | ${f(c.medianD2 / 3)} | ${f(c.coverage95?.estimate)} [${f(c.coverage95?.lower)}, ${f(c.coverage95?.upper)}] | ${c.notPositiveDefinite} | ${c.decision} |`);
  }
  out.push('', '## GPS tail diagnostics', '', 'Object aggregates include every finite sample; the top-ten ranges describe each object’s largest d² observations. Local sample keys and complete scores remain in the ignored run. Error changes and marginal variances diagnose tails but cannot identify maneuvers or prove ill-conditioning without independent evidence.', '');
  for (const [name, d] of Object.entries(metrics.gps)) {
    out.push(`### ${name}`, '', '| Object | n | Fraction of total d² | Mean d²/3 | Median d²/3 | Maximum d²/3 |', '| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const o of d.objects.slice(0, 5)) out.push(`| ${o.object} | ${o.n} | ${f(o.contribution)} | ${f(o.meanD2Over3)} | ${f(o.medianD2Over3)} | ${f(o.maxD2Over3)} |`);
    out.push('');
  }
  out.push('## Integrity and limits', '',
    `Run ${manifest.run}; ${manifest.workers} bounded single-threaded workers; peak dispatch load ${manifest.peakDispatchLoad}. Training missing inputs and test missing horizons are retained in metrics. Frozen V1c2 baseline: 0/24 in both modes, reproduced unchanged.`, '',
    'The selected configuration is an experimental aggregate MODEL, not evidence that every object has realistic covariance. Cell-level success does not certify individual objects. FFM uses the selected SGP4 seed and horizon factors with no process noise; test positions are frozen V1c coverage positions. V1c2’s covariance-resident nominal discrepancy remains an inherited limitation.', '',
    'Exact V1c2 artifacts run through the same SDK harness. Native WasmEdge 0.16.4 accepted gp-error-model but rejects the frozen FFM’s exception instructions. This known flow-artifact defect belongs to ffm-memory-measured-sizing-20261022; the coordinator determined it does not block this experiment. Docker waived by owner ruling 2026-10-22. No unit suites, speed rerun, production SSH or deployment.', '',
    'Sources: Space-Track / USSPACECOM / 18th Space Defense Squadron; ILRS; IGS (Johnston et al. 2017); © ESA/ESOC 2026; © ESA 2026 SW_SP3xCOM_2_; modified Copernicus Sentinel data 2026. GFZ weather CC BY 4.0 (Matzka et al. 2021; F10.7 DRAO/Natural Resources Canada); NOAA SWPC public-domain forecast fills. [Data terms](../../docs/data-licenses.md). No raw OMM or truth is redistributed.', '',
    'E2E: `node experiments/v1c3-console-covariance-calibration/run.mjs --check`.', '');
  return out.join('\n');
}
function deriveMetrics(root, runDir, test, configs) {
  const output = path.join(root, 'results/v1c3');
  const selections = { SGP4: read(path.join(output, 'sgp-selection.json')), 'FFM-1': read(path.join(output, 'ffm-selection.json')) };
  const baseline = summarize(readArcs(path.join(runDir, 'baseline-arcs.jsonl')), configs.v1c2, configs.v1, configs.e3);
  const metrics = { baseline, test, gps: {}, counts: {} };
  for (const [label, mode, candidate] of [['SGP4 uncalibrated', 'SGP4', 'N-none'], ['SGP4 selected', 'SGP4', selections.SGP4.selected], ['FFM-1 selected', 'FFM-1', selections['FFM-1'].selected]])
    metrics.gps[label] = diagnostics(readArcs(path.join(runDir, `test-${mode}-${candidate}-scores.jsonl`)));
  for (const split of ['train', 'test']) for (const phase of ['sgp', 'ffm']) {
    const arcs = readArcs(path.join(runDir, `${split}-${phase}.jsonl`));
    metrics.counts[`${split}-${phase}`] = { arcs: arcs.length, skipped: arcs.filter(a => a.skipped).length, samples: arcs.reduce((n, a) => n + (a.samples?.length ?? 0), 0), missingHorizons: arcs.reduce((n, a) => n + a.missingHorizons.length, 0) };
  }
  return { metrics, selections };
}
export function publish(root, runDir, manifest, test, configs) {
  const output = path.join(root, 'results/v1c3');
  const { metrics, selections } = deriveMetrics(root, runDir, test, configs);
  const localTails = {};
  for (const [label, mode, candidate] of [['SGP4 uncalibrated', 'SGP4', 'N-none'], ['SGP4 selected', 'SGP4', selections.SGP4.selected], ['FFM-1 selected', 'FFM-1', selections['FFM-1'].selected]]) {
    localTails[label] = readArcs(path.join(runDir, `test-${mode}-${candidate}-scores.jsonl`)).filter(a => a.group === 'GPS')
      .flatMap(a => (a.samples ?? []).map(s => ({ key: a.key, object: a.norad, ...s })))
      .filter(s => Number.isFinite(s.score?.d2Predicted)).sort((a, b) => b.score.d2Predicted - a.score.d2Predicted);
  }
  fs.writeFileSync(path.join(runDir, 'gps-tail-ranking-local.json'), JSON.stringify(localTails) + '\n');
  manifest.files['gps-tail-ranking-local.json'] = sha256(fs.readFileSync(path.join(runDir, 'gps-tail-ranking-local.json')));
  fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'README.md'), render(metrics, manifest, selections));
  const s = selections.SGP4, ffm = selections['FFM-1'];
  fs.writeFileSync(path.join(output, 'MODEL.json'), JSON.stringify({ kind: 'v1c3-console-calibration-application', registration: manifest.registration,
    population: { source: 'analysis/gp-error-model/data/e14-s3-kc.erm', sha256: Object.values(manifest.inputs.model)[0] },
    SGP4: { candidate: s.selected, base: s.selected[0], factors: s.models[s.selected].model ? `sgp-selection-${s.selected}.erm` : null },
    'FFM-1': { candidate: ffm.selected, seed: s.selected, seedFactorsHorizonHours: 1, processNoise: null, factors: ffm.models[ffm.selected].model ? `ffm-selection-${ffm.selected}.erm` : null },
    application: 'Construct N (object_covariance), F (EMPIRICAL plus age-zero population floor) or P (population at actual age); apply SGP4 MODEL via calibrate_covariance per term. Transport each selected calibrated issue term by FFM resident STM, then apply FFM MODEL per term. pair_statistics adds terms in WASM. Explicit E3 regime and nominal horizon select each stratum.',
    selectedOn: 'August training only; see selectionFreeze in manifest.json', deployment: 'Follow-up modules and SpaceAware-UI task; no adoption in this experiment.' }, null, 2) + '\n');
  return metrics;
}
export async function check(root, config, configs) {
  const output = path.join(root, 'results/v1c3'), manifest = read(path.join(output, 'manifest.json'));
  const runDir = process.env.SDN_V1C3_RUN_DIR ?? path.join(root, 'runs', manifest.run);
  assert(manifest.finished && manifest.selectionFreeze && manifest.testStarted);
  assert.equal(manifest.configSha256, sha256(fs.readFileSync(path.join(root, 'experiments/v1c3-console-covariance-calibration/config.json'))));
  checkRecorded(configs.v1c2, configs.v1, configs.e3);
  const metrics = read(path.join(output, 'metrics.json'));
  const baseline = summarize(readArcs(path.join(runDir, 'baseline-arcs.jsonl')), configs.v1c2, configs.v1, configs.e3);
  assert.deepEqual(baseline, read(path.join(root, 'results/v1c2/metrics.json')));
  assert.deepEqual(metrics.baseline, baseline);
  let hashes = 0;
  for (const [name, hash] of Object.entries(manifest.files)) { assert.equal(sha256(fs.readFileSync(path.join(runDir, name))), hash, name); hashes++; }
  for (const [kind, files] of Object.entries(manifest.inputs)) for (const [file, hash] of Object.entries(files)) {
    const local = manifest.replayInputs[file] ? path.join(runDir, manifest.replayInputs[file]) : file;
    assert.equal(sha256(fs.readFileSync(local)), hash, file); hashes++;
    if (['implementation', 'frozenSource'].includes(kind)) assert.equal(sha256(fs.readFileSync(path.join(root, path.relative(manifest.repositoryRoot, file)))), hash, `candidate source changed: ${file}`);
  }
  const selections = { SGP4: read(path.join(output, 'sgp-selection.json')), 'FFM-1': read(path.join(output, 'ffm-selection.json')) };
  // The landed experiment remains checkable after its dependency worktree is removed.
  const modules = path.join(runDir, 'replay-runtime');
  for (const [file, relative] of Object.entries(manifest.replayInputs)) if (file.startsWith(manifest.modulesRoot + '/')) {
    const dest = path.join(modules, path.relative(manifest.modulesRoot, file));
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(runDir, relative), dest);
  }
  const gp = await loadModule(modules, 'analysis/gp-error-model');
  const codec = await import(pathToFileURL(path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs')));
  try {
    for (const mode of ['SGP4', 'FFM-1']) {
      const phase = mode === 'SGP4' ? 'sgp' : 'ffm', order = mode === 'SGP4' ? sgpCandidates : methods;
      const train = recordedTables(runDir, mode, 'train', configs), test = recordedTables(runDir, mode, 'test', configs), s = selections[mode];
      assert.deepEqual(train, s.tables); assert.deepEqual(test, metrics.test[mode]);
      assert.deepEqual(select(train, order), s.selection); assert.equal(s.selected, s.selection.selected);
      const relative = `results/v1c3/${phase}-selection.json`, freeze = manifest.selectionFreeze[phase];
      assert.equal(sha256(fs.readFileSync(path.join(root, relative))), freeze.sha256);
      assert.equal(sha256(execFileSync('git', ['show', `${freeze.commit}:${relative}`], { cwd: root })), freeze.sha256);
      assert(Date.parse(freeze.verifiedAt) <= Date.parse(manifest.testStarted));
      const trainArcs = readArcs(path.join(runDir, `train-${phase}.jsonl`)), testArcs = readArcs(path.join(runDir, `test-${phase}.jsonl`));
      assert.equal(s.trainingRawSha256, manifest.files[`train-${phase}.jsonl`]);
      const keys = new Set(trainArcs.map(a => a.key)); assert(testArcs.every(a => !keys.has(a.key)));
      for (const a of trainArcs) for (const sample of a.samples ?? []) assert(sample.ms < Date.parse(config.trainingTargetBefore));
      const old = readArcs(path.join(runDir, 'baseline-arcs.jsonl'));
      assert.equal(testArcs.length, 960);
      for (const a of testArcs) { const b = old.find(b => b.key === a.key); assert(b); assert.equal(a.skipped, b.skipped);
        assert.deepEqual(a.missingHorizons, b.missingHorizons); assert.deepEqual((a.samples ?? []).map(s => s.hours), (b.samples ?? []).map(s => s.hours)); }
      for (const candidate of order) {
        const rows = trainArcs.flatMap(a => (a.samples ?? []).flatMap(sample => {
          const b = mode === 'SGP4' ? sample.bases[candidate[0]] : sample;
          return b.fit ? [{ object: a.norad, stratum: stratum(a.group, sample.hours), error: b.fit.errorRtn, covariance: b.fit.predictedRtn }] : [];
        }));
        const fitted = await fit(gp, codec, rows, mode === 'SGP4' ? candidate.slice(2) : candidate, config, `v1c3-${mode}-${candidate}`);
        assert.deepEqual(fitted, s.models[candidate], 'recorded training fit changed');
        if (fitted.model) assert.deepEqual(Buffer.from(codec.frame('model', 'model', fitted.model).payload), fs.readFileSync(path.join(output, `${phase}-selection-${candidate}.erm`)));
      }
    }
    const result = await controls({ runDir, modules, gp, codec, selection: selections.SGP4 });
    console.log(`Recorded covariance controls PASS: identity ${result.maxIdentityRelative}, sum ${result.maxSumScoreRelative}; native/headless gp-error-model parity.`);
  } finally { await gp.destroy(); }
  const replay = readArcs(path.join(runDir, 'test-SGP4-N-none-scores.jsonl'));
  const old = readArcs(path.join(runDir, 'baseline-arcs.jsonl'));
  for (const a of replay) for (const s of a.samples ?? []) {
    const expected = old.find(b => b.key === a.key).samples.find(b => b.hours === s.hours).SGP4.d2, actual = s.score?.d2Predicted ?? null;
    if (expected === null) assert.equal(actual, null); else assert(Math.abs(actual - expected) <= config.baselineAbsoluteTolerance + config.baselineRelativeTolerance * Math.abs(expected), `baseline replay: ${a.key}`);
  }
  assert.deepEqual(deriveMetrics(root, runDir, metrics.test, configs).metrics, metrics, 'diagnostics/counts changed');
  assert.equal(render(metrics, manifest, selections), fs.readFileSync(path.join(output, 'README.md'), 'utf8'));
  console.log(`V1C3-E2E PASS: ${hashes} hashes, disjoint training/test, frozen baseline exact, 12 SGP4 + 4 FFM candidates; selections and MODEL fits re-derived in WASM.`);
}
