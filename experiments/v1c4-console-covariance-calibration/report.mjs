// README, metrics, manifest summary and MODEL record from a finished run, and the E2E check that re-derives them all.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { sha256, loadModule } from '../../harness/modules.mjs';
import { dayList } from '../../harness/gp-archive.mjs';
import { candidatesOf, claimed, selectCv, scoreArcs, cellsOf, fitRows, foldOf, foldStartMs, fit, SGP4, FFM } from './cv.mjs';
import { compactCell, scoresJsonl } from './train.mjs';
import { views, summaryOf, flagSummary, POOLED } from './test.mjs';
import { custodyOf, availableSets, detectorInput } from './events.mjs';
import { makeDetector } from './maneuvers.mjs';
import { truthFor, elementSets, issueMs, groupBy } from './universe.mjs';

const read = f => JSON.parse(fs.readFileSync(f));
const f5 = n => Number.isFinite(n) ? n.toPrecision(5) : '—';
const MODES = [SGP4, FFM];
const nameOf = mode => mode === SGP4 ? 'sgp' : 'ffm';

// ── the committed manifest keeps a count and a tree hash for the long input lists; the run's own manifest has every hash ──
// `where` = the repository root and run directory the paths were recorded under (manifest.repositoryRoot, manifest.runDirectory).
export function summarizeInputs(inputs, where) {
  const { root, runDir } = where;
  const norm = p => p.startsWith(runDir + '/') ? `<run>/${p.slice(runDir.length + 1)}` : p.startsWith(root + '/') ? `<repo>/${p.slice(root.length + 1)}` : p;
  return Object.fromEntries(Object.entries(inputs).map(([kind, files]) => {
    const lines = Object.entries(files).map(([f, h]) => `${norm(f)} ${h}`).sort();
    return [kind, { count: lines.length, sha256: sha256(lines.join('\n')) }];
  }));
}

export function render(metrics, manifest, sel, config) {
  const lines = [], mode = m => metrics.modes[m], pick = m => mode(m)[metrics.selected[m]];
  const count = c => `${c.realistic.claimed}/24`;
  lines.push('# V1c4 — pre-registered covariance calibration: temporal cross-validation, a causal event rule, a fresh test', '',
    `Selected on training weeks only: **SGP4 ${metrics.selected[SGP4]}: ${count(pick(SGP4))} test cells; FFM-1 ${metrics.selected[FFM]}: ${count(pick(FFM))}**. A candidate's cells are counted on its claimed population: every sample (arm ALL) or the samples of unflagged arcs (arm UNFLAGGED).`, '',
    `Training issues 2026-08-03 to 09-20 in seven weekly folds (every target precedes 2026-09-24 UTC); selection by purged rolling-origin cross-validation (SGP4 on folds F3-F7, FFM-1 on F5-F7). Test: issue days ${config.windows.test[0]} to ${config.windows.test[1]}, never read before both selections were pushed; issue and truth times are disjoint from training. Rule: mean d²/3 in [0.8, 1.25], 95 % coverage in [0.93, 0.97], at least 30 samples from 3 objects; V1c2/E14 bootstrap (2,000 object-cluster resamples) and verdict code unchanged. Cells below 30 samples or 3 objects are INSUFFICIENT and count as not realistic.`, '',
    '[Frozen plan](../../experiments/v1c4-console-covariance-calibration/PLAN.md) · [Metrics](metrics.json) · [Manifest](manifest.json) · [MODEL application](MODEL.json) · [SGP4 selection](sgp-selection.json) · [FFM-1 selection](ffm-selection.json)', '');
  lines.push('## Candidates', '', '| Mode | Candidate | Cross-validation realistic /24 by fold | Mean | Min | Test claimed /24 | Test all | Test unflagged | Test flagged (pooled /6) |', '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const m of MODES) {
    const ranked = new Map(sel[m].ranking.map(r => [r.name, r]));
    for (const name of Object.keys(mode(m))) {
      const r = ranked.get(name), c = mode(m)[name];
      lines.push(`| ${m} | ${name}${name === metrics.selected[m] ? ' (selected)' : ''} | ${r ? Object.entries(r.realisticByFold).map(([id, n]) => `${id} ${n}`).join(', ') : 'ineligible'} | ${r ? r.meanRealistic.toFixed(2) : '—'} | ${r ? r.minRealistic : '—'} | ${c.realistic.claimed} | ${c.realistic.all} | ${c.realistic.unflagged} | ${c.realistic.flaggedPooled} |`);
    }
  }
  const ref = metrics.reference['V1c3 F-coverage'];
  lines.push('', `Reference (never selected): V1c3's published SGP4 F-coverage model on this window: ${ref.realistic.all}/24 cells over all samples, ${ref.realistic.unflagged}/24 over unflagged samples (V1c3's own test: 4/24).`, '');
  for (const m of MODES) {
    const c = pick(m), cells = c.cells[c.claimedView];
    lines.push(`## Selected ${m}: ${c.name} (${c.claimedView} samples)`, '', '| Group | h | n / objects | Mean d²/3 [95% CI] | Median d²/3 | 95% coverage [CI] | Non-PD / unavailable | Verdict |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const x of cells) lines.push(`| ${x.group} | ${x.hours} | ${x.n} / ${x.objects} | ${f5(x.mean?.[0])} [${f5(x.mean?.[1])}, ${f5(x.mean?.[2])}] | ${f5(x.medianD2 / 3)} | ${f5(x.coverage?.[0])} [${f5(x.coverage?.[1])}, ${f5(x.coverage?.[2])}] | ${x.notPositiveDefinite} | ${x.decision} |`);
    lines.push('');
    lines.push(`Split for ${c.name}: ${c.realistic.all}/24 cells over all samples, ${c.realistic.unflagged}/24 over unflagged samples, ${c.realistic.flaggedPooled}/6 horizons over flagged samples (pooled over classes).`, '',
      '| Flagged samples, pooled | n / objects | Mean d²/3 | 95% coverage | Verdict |', '| --- | ---: | ---: | ---: | --- |');
    for (const x of c.cells.flaggedPooled) lines.push(`| h ${x.hours} | ${x.n} / ${x.objects} | ${f5(x.mean?.[0])} | ${f5(x.coverage?.[0])} | ${x.decision} |`);
    lines.push('');
  }
  lines.push('## Event rule', '', `Custody gap (longest recent gap or age >= max(3 days, 3 x median cadence)) or a maneuver-detection event within 7 days; computed from each object's own element sets before the issue time. Test: ${metrics.flags.flagged} of ${metrics.flags.pairs} pairs flagged. Training flag share: SGP4 ${f5(sel[SGP4].flagShare)}, FFM-1 ${f5(sel[FFM].flagShare)} (cap ${config.selection.flagShareCap}).`, '',
    '| Class | Pairs | Flagged | By custody gap | By detector | Detector refusals |', '| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const [g, x] of Object.entries(metrics.flags.byClass)) lines.push(`| ${g} | ${x.pairs} | ${x.flagged} | ${x.custody} | ${x.detector} | ${x.detectorErrors} |`);
  lines.push('', '### Effect on GPS', '', '| Candidate | Share of GPS d² in flagged arcs | GPS cells realistic, all samples | GPS cells realistic, unflagged samples |', '| --- | ---: | ---: | ---: |');
  for (const [label, g] of Object.entries(metrics.gps)) {
    const m = label.startsWith('FFM') ? FFM : SGP4, name = label.includes('uncalibrated') ? 'N-none/ALL' : metrics.selected[m], c = mode(m)[name];
    const gpsReal = view => c.cells[view].filter(x => x.group === 'GPS' && x.decision === 'REALISTIC').length;
    lines.push(`| ${label} (${name}) | ${f5(g.flaggedMassShare)} | ${gpsReal('all')}/6 | ${gpsReal('unflagged')}/6 |`);
  }
  lines.push('', 'GPS d² concentration (all finite samples; object aggregates only):', '');
  for (const [label, g] of Object.entries(metrics.gps)) for (const view of ['all', 'unflagged']) {
    lines.push(`### ${label}, ${view} arcs`, '', '| Object | n | Fraction of total d² | Mean d²/3 | Median d²/3 | Maximum d²/3 |', '| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const o of g[view].objects.slice(0, 5)) lines.push(`| ${o.object} | ${o.n} | ${f5(o.contribution)} | ${f5(o.meanD2Over3)} | ${f5(o.medianD2Over3)} | ${f5(o.maxD2Over3)} |`);
    lines.push('');
  }
  lines.push('## What the console may label realistic', '', 'Cells REALISTIC on the test for the selected candidate on its claimed population; nothing else.', '');
  for (const m of MODES) {
    const c = pick(m), horizons = [...new Set(c.cells[c.claimedView].map(x => x.hours))];
    lines.push(`**${m} ${c.name}**`, '', `| Class | ${horizons.map(h => `${h} h`).join(' | ')} |`, `| --- | ${horizons.map(() => ':---:').join(' | ')} |`);
    for (const g of [...new Set(c.cells[c.claimedView].map(x => x.group))]) lines.push(`| ${g} | ${horizons.map(h => c.cells[c.claimedView].find(x => x.group === g && x.hours === h).decision === 'REALISTIC' ? 'yes' : '—').join(' | ')} |`);
    lines.push('');
  }
  const cs = metrics.counts;
  lines.push('## Integrity and limits', '',
    `Run ${manifest.run}; ${manifest.workers} bounded single-threaded workers; peak dispatch load ${manifest.peakDispatchLoad}. Test arcs ${cs.sgp.arcs} (${cs.sgp.skipped} skipped, ${cs.sgp.samples} samples, ${cs.sgp.missingHorizons} absent horizons); FFM-1 arcs ${cs.ffm.arcs} (${cs.ffm.skipped} skipped, ${cs.ffm.samples} samples). No truth exclusions.`, '',
    'Cell success does not certify an object. The selected configurations are aggregate MODELs. The event rule flags lapsed custody and detected burns, not the first sample after an unobserved burn. FFM uses the selected SGP4 candidate as seed and no process noise. The E14 population prior has an older fit and a broader published validation window; it is not independent of this test. FFM-1 environment uses observed drivers of the arc days, as V1c3 did. Native WasmEdge 0.16.4 accepted gp-error-model and rejects the frozen FFM artifact (ffm-memory-measured-sizing-20261022); Docker waived by owner ruling 2026-10-22. No unit suites, speed rerun, production SSH or deployment.', '',
    'Sources: Space-Track / USSPACECOM / 18th Space Defense Squadron; ILRS; IGS (Johnston et al. 2017); © ESA/ESOC 2026; modified Copernicus Sentinel data 2026; UCAR COSMIC Program, 2019: COSMIC-2 Data Products, doi:10.5065/T353-C093 (CC BY 4.0). GFZ weather CC BY 4.0 (Matzka et al. 2021; F10.7 DRAO/Natural Resources Canada); NOAA SWPC public-domain forecast fills. [Data terms](../../docs/data-licenses.md). No raw OMM or truth is redistributed.', '',
    'E2E: `node experiments/v1c4-console-covariance-calibration/run.mjs --check`.', '');
  return lines.join('\n');
}

export function modelRecord({ metrics, sgpSel, ffmSel, manifest, config }) {
  const claims = {};
  for (const m of MODES) {
    const c = metrics.modes[m][metrics.selected[m]];
    claims[m] = {};
    for (const x of c.cells[c.claimedView]) if (x.decision === 'REALISTIC') (claims[m][x.group] ??= []).push(x.hours);
  }
  const file = (prefix, name) => `${prefix}-${name.replace('/', '_')}.erm`;
  const sgp = metrics.selected[SGP4], ffm = metrics.selected[FFM];
  return { kind: 'v1c4-console-calibration-application', registration: metrics.registration,
    population: { source: 'analysis/gp-error-model/data/e14-s3-kc.erm', sha256: config.runtime.files['analysis/gp-error-model/data/e14-s3-kc.erm'] },
    SGP4: { candidate: sgp, base: sgp[0], arm: sgp.split('/')[1], factors: sgpSel.models[sgp].model ? file('sgp', sgp) : null },
    'FFM-1': { candidate: ffm, seed: sgp, seedFactorsHorizonHours: config.seedFactorHorizonHours, processNoise: null, arm: ffm.split('/')[1], factors: ffmSel.models[ffm].model ? file('ffm', ffm) : null },
    eventRule: { ...config.events, treatment: 'a separate label with no realism claim; UNFLAGGED arms fit and claim on unflagged arcs only' },
    claims, application: 'Construct N (object_covariance), F (N plus the age-zero population floor when EMPIRICAL) or P (population at actual age); apply the SGP4 MODEL via calibrate_covariance per term. Transport each calibrated issue term by the FFM resident STM, then apply the FFM MODEL per term. pair_statistics adds terms in WASM. The explicit class and nominal horizon select each stratum. Evaluate the event rule at the sim time from the object\'s own element sets; a flagged object carries no realism claim.',
    selectedOn: 'August-September training weeks only; see selectionFreeze in manifest.json', deployment: 'Follow-up modules and SpaceAware-UI task; no adoption in this experiment.' };
}

export function publish({ root, runDir, run, config, configs, output, metrics, sgpSel, ffmSel, flags, flagRecords }) {
  const manifest = run.manifest, sel = { [SGP4]: sgpSel, [FFM]: ffmSel };
  const committed = { ...manifest, inputs: summarizeInputs(manifest.inputs, { root: manifest.repositoryRoot, runDir: manifest.runDirectory }), repositoryRoot: undefined, runDirectory: undefined };
  fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(committed, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'MODEL.json'), JSON.stringify(modelRecord({ metrics, sgpSel, ffmSel, manifest, config }), null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'README.md'), render(metrics, manifest, sel, config));
}
