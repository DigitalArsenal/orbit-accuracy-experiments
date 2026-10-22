import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { cell } from '../e14-covariance-realism/realism.mjs';
import { config as e14 } from '../e14-covariance-realism/windows.mjs';
import { sha256 } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';
const read = p => JSON.parse(fs.readFileSync(p));
export const output = path.join(repoRoot, 'results/v1c2');

export function summarize(arcs, config, v1, e3) {
  for (const k of ['minimumSamples', 'minimumObjects', 'meanD2Over3', 'coverage95', 'bootstrapResamples', 'confidence'])
    assert.deepEqual(config.realism[k], e14.realism[k], `paper rule differs: ${k}`);
  assert(Math.abs(config.realism.chi2Quantile95 - e14.realism.chi2Quantile95) < 1e-14);
  const tables = [], shares = [];
  for (const mode of ['SGP4', 'FFM-1']) {
    for (const group of Object.keys(e3.regimes)) for (const hours of v1.horizonsHours) {
      const samples = arcs.filter(a => a.group === group).flatMap(a => (a.samples ?? []).filter(s => s.hours === hours).map(s => ({ object: a.norad, ...s[mode] })));
      const counts = {};
      for (const s of samples) counts[s.status] = (counts[s.status] ?? 0) + 1;
      tables.push({ mode, group, hours, available: samples.length, statuses: counts, ...cell(samples, { seed: config.realism.bootstrapSeed }) });
    }
    const rows = tables.filter(t => t.mode === mode), testable = rows.filter(t => t.decision !== 'INSUFFICIENT').length, realistic = rows.filter(t => t.decision === 'REALISTIC').length;
    shares.push({ mode, cells: rows.length, testable, realistic, shareAll: realistic / rows.length, shareTestable: testable ? realistic / testable : null });
  }
  const samples = arcs.flatMap(a => a.samples ?? []);
  return { tables, shares, integrity: {
    arcs: arcs.length, skipped: arcs.filter(a => a.skipped).length, samples: samples.length,
    missingHorizons: arcs.reduce((n, a) => n + a.missingHorizons.length, 0),
    maxSgp4ErrorDifferenceM: Math.max(...samples.map(s => s.sgp4ErrorDifferenceM)),
    maxCoverageReplayDifferenceM: Math.max(...samples.map(s => s.coverageReplayDifferenceM)),
    maxResidentCoverageDifferenceM: Math.max(0, ...samples.map(s => s.residentCoverageDifferenceM ?? 0)),
    maxIsoSeedCoverageDifferenceM: Math.max(...samples.map(s => s.isoSeedCoverageDifferenceM)),
    maxCovarianceResidentCoverageDifferenceM: Math.max(0, ...samples.map(s => s.covarianceResidentCoverageDifferenceM ?? 0)),
    covarianceResidentControlMisses: samples.filter(s => s.covarianceResidentCoverageDifferenceM > config.pathAgreementM).length,
    maxZeroTimeCovarianceRelative: Math.max(0, ...arcs.map(a => a.zeroTimeCovarianceRelative ?? 0)),
  } };
}
const f = x => Number.isFinite(x) ? x.toFixed(x < 100 ? 3 : 1) : '—';
export function render(m, manifest) {
  const lines = ['# V1c2: console covariance realism', '', `Generated from \`${manifest.run}\`. [Frozen plan](../../experiments/v1c2-console-covariance-realism/PLAN.md), [metrics](metrics.json), [manifest](manifest.json).`, '',
    'The paper’s position-only rule is mean d²/3 in [0.8, 1.25] and 95% coverage in [0.93, 0.97], with at least 30 samples from 3 objects. Intervals use its object-cluster bootstrap (2,000 draws; registered seed 20261017). No bias removal, covariance fit or truth covariance is added.', '',
    'V1c’s E3 object/issue selection, public OMM anchor, precise truth and six horizons are unchanged. SGP4 covariance uses object_covariance at the target element-set age. FFM covariance uses its value at sim start as P0, transported by the FFM-1 resident STM without process noise, and is scored against the recorded V1c coverage-path positions.', ''];
  for (const mode of ['SGP4', 'FFM-1']) {
    const share = m.shares.find(s => s.mode === mode);
    lines.push(`## ${mode}`, '', `Realistic: **${share.realistic}/${share.cells} cells** (${f(100 * share.shareAll)}%); ${share.realistic}/${share.testable} testable cells.`, '',
      '| Class | h | n / objects | Mean d²/3 [95% interval] | 95% coverage | Empirical / population / refused | Verdict |',
      '| --- | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const r of m.tables.filter(t => t.mode === mode)) lines.push(`| ${r.group} | ${r.hours} | ${r.n} / ${r.objects} | ${f(r.meanD2Over3?.estimate)} [${f(r.meanD2Over3?.lower)}, ${f(r.meanD2Over3?.upper)}] | ${f(r.coverage95?.estimate)} | ${r.statuses.EMPIRICAL ?? 0} / ${r.statuses.POPULATION ?? 0} / ${r.available - (r.statuses.EMPIRICAL ?? 0) - (r.statuses.POPULATION ?? 0)} | ${r.decision} |`);
    lines.push('');
  }
  lines.push('## Integrity and limits', '', `${m.integrity.arcs} object/issue pairs; ${m.integrity.skipped} skipped; ${m.integrity.samples} paired truth samples; ${m.integrity.missingHorizons} absent horizons. Non-positive-definite or unavailable covariance counts are retained in metrics. FFM status labels describe P0, not a calibration verdict on its transported covariance.`, '',
    `Maximum SGP4 error difference from V1c: ${f(m.integrity.maxSgp4ErrorDifferenceM)} m; replayed coverage difference ${f(m.integrity.maxCoverageReplayDifferenceM)} m; state-only resident/recorded coverage difference ${f(m.integrity.maxResidentCoverageDifferenceM)} m (registered tolerance 0.1 m). Maximum zero-time covariance relative difference: ${m.integrity.maxZeroTimeCovarianceRelative.toExponential(3)}.`, '',
    `Covariance-resident nominal position versus recorded Fast coverage: maximum ${f(m.integrity.maxCovarianceResidentCoverageDifferenceM)} m; ${m.integrity.covarianceResidentControlMisses} samples MISS the original 0.1 m control. Attaching P0 selects the module’s seed-to-target variational RK branch (ResidentDynamics::covariance), instead of the Fast nominal path. All FFM scores use unchanged recorded Fast positions.`, '',
    `Amendments A2–A3: the first 0.124510245 m diagnostic miss was also present without covariance, so covariance-branch attribution alone was rejected. The catalog rounds its seed through UTC Julian date before encoding ISO; foundation/time now encodes that same instant for both resident controls. The paired original wall-clock ISO seed reaches ${f(m.integrity.maxIsoSeedCoverageDifferenceM)} m difference; the normalized state-only control above must pass 0.1 m. Neither the covariance scores nor thresholds were tuned.`, '',
    `Modules built from \`${manifest.modulesRepository.commit}\`; ${manifest.runtime.node}, ${manifest.runtime.platform}; ${manifest.runtime.cpus} logical CPUs, one sequential worker. Load at start/end: ${manifest.runtime.loadAverage.map(f).join('/')} / ${manifest.loadEnd.map(f).join('/')}. This is a covariance test; the frozen V1c CPU benchmark is not rerun.`, '',
    'The history prior compares OMMs with later OMMs, which may share errors; EMPIRICAL does not assert truth calibration. This retrospective E3 window overlaps the population model’s existing validation domain and is not new independent validation of its fit. No maneuver exclusions were introduced. Linear STM transport without process noise does not model force error, maneuvers or nonlinear uncertainty growth.', '',
    'Inputs and credits: Space-Track / USSPACECOM / 18th Space Defense Squadron; ILRS; IGS (Johnston et al. 2017); © Navigation Support Office at ESA/ESOC 2026; © ESA 2026, SW_SP3xCOM_2_; Contains modified Copernicus Sentinel data 2026. Weather: GFZ historical drivers (CC BY 4.0, Matzka et al. 2021, doi:10.1029/2020SW002641; F10.7 DRAO/Natural Resources Canada), NOAA SWPC public-domain forecast fills for absent centered-average dates, exactly as V1c. No CelesTrak/CSSI weather. [Data terms](../../docs/data-licenses.md). Raw OMM, states and individual scores remain local.', '',
    'Amendment A1 (before covariance scoring): request the stateless resident covariance only at scored horizons, while replaying catalog coverage every 300 seconds. The module restarts the STM at the seed for every request; intermediate discarded covariance requests cannot affect an endpoint.', '',
    'Verification: `node experiments/v1c2-console-covariance-realism/run.mjs --check`. Unit tests, Docker, speed reruns and deployment are outside this experiment. V1 and V1c remain as published.', '');
  return lines.join('\n');
}
export function publish(arcs, config, v1, e3, manifest) {
  const m = summarize(arcs, config, v1, e3); fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify(m, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'README.md'), render(m, manifest));
}
export function checkRecorded(config, v1, e3) {
  const manifest = read(path.join(output, 'manifest.json'));
  const runDir = process.env.SDN_V1C2_RUN_DIR ?? path.join(repoRoot, 'runs', manifest.run);
  const raw = fs.readFileSync(path.join(runDir, 'arcs.jsonl'));
  assert.equal(sha256(raw), manifest.rawSha256);
  assert(manifest.finished && manifest.config.frozen && manifest.threads === 1);
  assert.equal(sha256(fs.readFileSync(path.join(repoRoot, manifest.config.path))), manifest.config.sha256);
  const arcs = raw.toString().trim().split('\n').map(JSON.parse), inherited = fs.readFileSync(path.join(runDir, 'v1c-arcs.jsonl'));
  assert.equal(sha256(inherited), manifest.v1c.rawSha256);
  const old = inherited.toString().trim().split('\n').map(JSON.parse).filter(a => a.suite === 'E3');
  assert.equal(new Set(arcs.map(a => a.key)).size, arcs.length); assert.equal(arcs.length, old.length);
  for (const a of arcs) {
    const prior = old.find(p => p.key === a.key); assert(prior); assert.equal(a.group, prior.group);
    assert.deepEqual(a.missingHorizons, prior.missingHorizons);
    if (prior.skipped) { assert.equal(a.skipped, prior.skipped); continue; }
    assert.deepEqual(a.samples.map(s => s.hours), prior.methods.SGP4.samples.map(s => s.hours));
    for (const s of a.samples) for (const mode of ['SGP4', 'FFM-1']) {
      const r = s[mode]; assert(r && typeof r.status === 'string');
      assert(r.d2 === null || Number.isFinite(r.d2) && r.d2 >= 0);
    }
  }
  const m = summarize(arcs, config, v1, e3);
  assert.deepEqual(m, read(path.join(output, 'metrics.json')));
  assert.equal(render(m, manifest), fs.readFileSync(path.join(output, 'README.md'), 'utf8'));
  assert(m.integrity.maxSgp4ErrorDifferenceM <= config.pathAgreementM, 'SGP4/V1c mismatch');
  assert(m.integrity.maxCoverageReplayDifferenceM <= config.pathAgreementM, 'coverage/V1c mismatch');
  assert(m.integrity.maxResidentCoverageDifferenceM <= config.pathAgreementM, 'FFM/V1c mismatch');
  assert(m.integrity.maxZeroTimeCovarianceRelative <= config.zeroTimeCovarianceRelative);
  let count = 0;
  for (const [kind, files] of Object.entries(manifest.inputs)) for (const [file, hash] of Object.entries(files)) {
    const local = manifest.replayInputs?.[file] ? path.join(runDir, manifest.replayInputs[file]) : kind === 'gpHistory' || kind === 'history' ? path.join(e3.inputs.gpHistory, file) : kind === 'e3Reference' ? path.join(e3.inputs.reference, file) : file;
    assert.equal(sha256(fs.readFileSync(local)), hash, `input changed: ${file}`); count++;
    if (kind === 'source' && file.startsWith(manifest.repositoryRoot + '/')) {
      const candidate = path.join(repoRoot, path.relative(manifest.repositoryRoot, file));
      assert.equal(sha256(fs.readFileSync(candidate)), hash, `source changed: ${candidate}`);
    }
  }
  for (const mod of manifest.modules) assert.equal(sha256(fs.readFileSync(path.join(runDir, mod.replayPath))), mod.wasmSha256);
  for (const p of manifest.e3ProductIndexes) assert.equal(sha256(fs.readFileSync(path.join(e3.inputs.reference, p.product, 'index.json'))), p.sha256);
  console.log(`V1C2-E2E PASS: ${arcs.length} arcs, ${m.integrity.samples} paired samples, 48 cells, ${count} input hashes; both tables and realistic shares re-derived.`);
}
