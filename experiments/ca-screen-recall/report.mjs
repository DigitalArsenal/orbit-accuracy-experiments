#!/usr/bin/env node
// ca-screen-recall: the report of Amendment A2, generated from a run's metrics and manifest (never typed). The 0.9.0 report stays as README-0.9.0.md.
//   node experiments/ca-screen-recall/report.mjs --run <runs/ca-screen-recall/RUN>   copy metrics, manifest and moved to results/, write README.md
//   node experiments/ca-screen-recall/report.mjs --check                              regenerate README.md from results/ and require the same bytes
//   node experiments/ca-screen-recall/report.mjs --replay-from <dir>                  write results/ca-screen-recall/replay.a2.json from a replay run
//   node experiments/ca-screen-recall/report.mjs --proof-from <file>                  write results/ca-screen-recall/listing-proof.a2.json from listing-proof.mjs's output
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { config, a2, repo, id } from './common.mjs';

export const resultsDir = path.join(repo, 'results', id);
export const FILES = { metrics: 'metrics.a2.json', manifest: 'manifest.a2.json', moved: 'moved.a2.json', replay: 'replay.a2.json', proof: 'listing-proof.a2.json' };
const int = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fix = (v, d) => (v === null || v === undefined ? 'n/a' : Number(v).toFixed(d));
const sci = (v) => (v === null || v === undefined ? 'n/a' : Number(v).toExponential(2));
const pct = (v) => (v === null ? 'n/a' : `${(100 * v).toFixed(2)} %`);
const lower = (v) => (v === null ? 'n/a' : v.toFixed(4));
const BANDS = ['below 1 km', '1 to 5 km', 'all'];
const count = (r) => `${int(r.found)} / ${int(r.reference)}`;
const reasons = (m) => (Object.keys(m).length ? Object.entries(m).map(([k, n]) => `${k}: ${int(n)}`).join('; ') : 'none');

// The counts a replay must reproduce exactly (integers only).
export function replaySummary(metrics) {
  const ref = metrics.reference;
  return {
    objects: metrics.subset.selected, durationSeconds: metrics.window.durationSeconds,
    reference: { events: ref.events, inWindow: ref.inWindow, atWindowEdge: ref.atWindowEdge, belowOneKm: ref.belowOneKm, oneToFiveKm: ref.oneToFiveKm, nearThreshold: ref.nearThreshold },
    arms: Object.fromEntries(Object.values(metrics.arms).map((a) => [a.id, {
      recall: Object.fromEntries(BANDS.map((b) => [b, { reference: a.recall[b].reference, found: a.recall[b].found }])),
      screenEvents: { total: a.screenEvents.total, matched: a.screenEvents.matched, nearThreshold: a.screenEvents.nearThreshold, edge: a.screenEvents.edge, beyondReference: a.screenEvents.beyondReference, falseEvents: a.screenEvents.falseEvents.length },
      listedObjects: a.listings.objects, referenceEventsOutOfTheDenominator: a.exclusions.events,
    }])),
    verdict: metrics.verdict.status,
  };
}

const diffRow = (label, d) => `| ${label} | ${int(d.matched)} | ${fix(d.tcaSeconds.median, 4)} | ${fix(d.tcaSeconds.p95, 4)} | ${fix(d.tcaSeconds.max, 4)} | ${fix(d.missM.median, 3)} | ${fix(d.missM.p95, 3)} | ${fix(d.missM.max, 3)} | ${fix(d.signedMissMeanM, 3)} |`;

export function render({ metrics, manifest, moved, proof, baseline }) {
  const L = [], arms = Object.values(metrics.arms), main = metrics.arms[config.pass.arm], ref = metrics.reference, gate = metrics.verdict;
  const baseMain = baseline.arms[config.pass.arm], ca = manifest.modules['analysis/conjunction-assessment'], sgp4 = manifest.modules['propagator/sgp4'];
  const misses = arms.flatMap((a) => a.misses), falseEvents = arms.flatMap((a) => a.screenEvents.falseEvents);
  const planCommit = manifest.plan?.planCommit?.slice(0, 10) ?? 'n/a';
  const everyEvent = misses.length === 0;
  L.push('# Conjunction screen recall against a brute-force all-pairs reference', '',
    `**Does CA ${ca.version} find every event the exhaustive search finds? ${everyEvent ? 'Yes' : 'No'}.** ${everyEvent ? `All ${int(main.recall.all.reference)} reference events below 5 km were found` : `${int(misses.length)} reference events were missed across the arms; each is filed below`}, ${int(main.recall['below 1 km'].found)} of ${int(main.recall['below 1 km'].reference)} below 1 km; ${int(falseEvents.length)} false events.`, '',
    `Amendment A2 of the pre-registered experiment ([PLAN](../../experiments/${id}/PLAN.md), registered at commit \`${planCommit}\` before the run). The same test, data and pass rule as the [0.9.0 result](${a2.baseline.readme}), on the build to publish. Run \`${manifest.startedAt}\`.`,
    `${int(metrics.subset.selected)} LEO objects of the Space-Track GP snapshot of 2026-10-29, ${int(metrics.window.durationSeconds / 3600)} hours from ${metrics.window.startUtc}. Source: USSPACECOM / 18th Space Defense Squadron, via Space-Track.org (https://www.space-track.org). Element sets are not reproduced here (README rule 4); only aggregates and the NORAD pairs of defects are.`, '',
    '## Result', '',
    gate.status === 'pass' ? `**Pass.** All ${int(gate.reference)} reference events below 1 km were found by the screen at its defaults (recall 1.0).`
      : gate.status === 'fail' ? `**Fail.** The screen at its defaults found ${int(gate.found)} of ${int(gate.reference)} reference events below 1 km. Every miss is filed below as a defect with its pair.` : `**Inconclusive.** ${gate.status}.`, '',
    ...(main.fallback ? [`**The 5 km screen could not run as one 72 h call** (${main.fallback.reason}); it ran as ${main.windows} consecutive ${main.fallback.windowSeconds / 3600} h calls.`, ''] : []));
  L.push('| Build | Below 1 km | 1 to 5 km | Misses, both arms | False events, both arms | Matched events beyond 1 s or 5 m | Failed pair evaluations | Objects on the excluded port | Reference events out of the denominator |', '| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |');
  const baseArms = Object.values(baseline.arms);
  L.push(`| ${a2.baseline.version} | ${count(baseMain.recall['below 1 km'])} | ${count(baseMain.recall['1 to 5 km'])} | ${int(baseArms.flatMap((a) => a.misses).length)} | ${int(baseArms.flatMap((a) => a.screenEvents.falseEvents).length)} | ${int(baseMain.outliers.flagged)} | ${int(baseMain.statistics.FAILED_PAIRS)} | ${int(baseMain.excludedObjects.length)} | 0 |`);
  L.push(`| ${ca.version} | ${count(main.recall['below 1 km'])} | ${count(main.recall['1 to 5 km'])} | ${int(misses.length)} | ${int(falseEvents.length)} | ${int(main.outliers.flagged)} | ${int(arms.reduce((n, a) => n + a.statistics.FAILED_PAIRS, 0))} | ${int(main.listings.objects)} (${reasons(main.listings.byReason)}) | ${int(main.exclusions.events)} |`, '');
  L.push('Recall of the module\'s `screen_catalog` against the exhaustive reference, by the reference\'s miss distance (a reference event is one local minimum of a pair\'s distance below 5 km):', '',
    '| Arm | Miss band | Reference events | Found | Recall | 95 % lower bound |', '| --- | --- | --- | --- | --- | --- |');
  for (const a of arms) for (const b of BANDS) L.push(`| ${a.id} (${a.thresholdM / 1000} km) | ${b} | ${int(a.recall[b].reference)} | ${int(a.recall[b].found)} | ${pct(a.recall[b].recall)} | ${lower(a.recall[b].lowerBound)} |`);
  L.push('', `The reference found ${int(ref.events)} events: ${int(ref.belowOneKm)} below 1 km and ${int(ref.oneToFiveKm)} from 1 to 5 km inside the window, ${int(ref.nearThreshold)} from 5.0 to 5.5 km (near the threshold, never counted), ${int(ref.atWindowEdge)} within ${config.comparison.edgeSeconds} s of a window end (counted apart) and ${int(ref.outsideWindow)} outside it. ${moved.reference.identical ? `Its events are byte-identical to the 0.9.0 run's (SHA-256 \`${moved.reference.sha256.slice(0, 12)}\`): the reference did not move.` : `**Its events differ from the 0.9.0 run's** (SHA-256 \`${moved.reference.sha256.slice(0, 12)}\` against \`${moved.reference.baselineSha256.slice(0, 12)}\`).`}`, '',
    '| Arm | Screen events | Matched | Near-threshold | At a window end | Beyond 5 km (not assessed) | False events | Duplicates | Objects on the excluded port |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const a of arms) { const s = a.screenEvents; L.push(`| ${a.id} | ${int(s.total)} | ${int(s.matched)} | ${int(s.nearThreshold)} | ${int(s.edge)} | ${int(s.beyondReference)} | ${int(s.falseEvents.length)} | ${int(s.duplicates)} | ${int(a.listings.objects)} |`); }

  L.push('', '## What moved between builds, event by event', '',
    `The screen's events on ${ca.version} against ${a2.baseline.version}, paired one to one by NORAD pair and TCA within ${config.comparison.tcaToleranceSeconds} s, nearest first. Between these builds the screen's SGP4 changed (CA 0.11.0), so every value may move; an event that appears or disappears is the result to read.`, '',
    `| Arm | Events on ${a2.baseline.version} | Events on ${ca.version} | Paired | Only on ${a2.baseline.version} | Only on ${ca.version} | \\|ΔTCA\\| median / p95 / max (s) | \\|Δmiss\\| median / p95 / max (m) | \\|Δspeed\\| max (m/s) |`, '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |');
  for (const [k, m] of Object.entries(moved.arms)) L.push(`| ${k} | ${int(m.baselineEvents)} | ${int(m.events)} | ${int(m.paired)} | ${int(m.onlyBaseline.length)} | ${int(m.onlyThisBuild.length)} | ${fix(m.tcaSeconds.median, 4)} / ${fix(m.tcaSeconds.p95, 4)} / ${fix(m.tcaSeconds.max, 4)} | ${fix(m.missM.median, 3)} / ${fix(m.missM.p95, 3)} / ${fix(m.missM.max, 3)} | ${fix(m.speedMS.max, 4)} |`);
  const appearing = Object.entries(moved.arms).flatMap(([k, m]) => [...m.onlyBaseline.map((r) => ({ k, side: `only on ${a2.baseline.version}`, r })), ...m.onlyThisBuild.map((r) => ({ k, side: `only on ${ca.version}`, r }))]);
  if (appearing.length) {
    L.push('', '| Arm | Side | NORAD pair | TCA (UTC) | Miss (m) | Speed (m/s) |', '| --- | --- | --- | --- | ---: | ---: |');
    for (const { k, side, r } of appearing.slice(0, 200)) L.push(`| ${k} | ${side} | ${r.pair.join(' / ')} | ${r.tcaUtc} | ${fix(r.missM, 1)} | ${fix(r.speedMS, 1)} |`);
    if (appearing.length > 200) L.push('', `${int(appearing.length - 200)} more in \`${FILES.moved}\`.`);
  }

  const p = main.parity;
  L.push('', '## The screen\'s SGP4 against the SGP4 module', '',
    `The screen's states against \`propagator/sgp4\` ${sgp4.version} at the screen's TCAs, given the same OMM bytes (pre-registered, PLAN.md, propagator parity; it has no independent reference, so it does not say which is closer to where an object was). At ${int(p.objects)} object states the position differs by a median ${fix(p.positionM.median, 4)} m, a 95th percentile of ${fix(p.positionM.p95, 4)} m, a 99th of ${fix(p.positionM.p99, 4)} m and at most ${fix(p.positionM.max, 4)} m; the velocity by a median ${fix(p.velocityMS.median * 1000, 5)} mm/s and at most ${fix(p.velocityMS.max * 1000, 5)} mm/s. On ${a2.baseline.version}, with the screen's vendored libsgp4: median ${fix(baseMain.parity.positionM.median, 2)} m, at most ${fix(baseMain.parity.positionM.max, 1)} m. Since CA 0.11.0 the screen runs \`foundation/sgp4-str3\` in AFSPC mode; \`propagator/sgp4\` ${sgp4.version} runs it in improved mode.`);

  L.push('', '## Objects on the excluded port', '',
    'Since CA 0.13.0 the port lists an object screened in part as well as one excluded (the module\'s README). A reference event leaves the denominator only when a listing of its own call says its object was not screened at its TCA.', '');
  for (const a of arms) {
    L.push(`- Arm ${a.id}: ${int(a.listings.objects)} objects, ${int(a.listings.records)} records (${reasons(a.listings.byReason)}); reference events out of the denominator: ${int(a.exclusions.events)} (${reasons(a.exclusions.byReason)}).`);
    for (const r of a.listings.rows.slice(0, 40)) L.push(`  - NORAD ${r.norad}, call from ${r.callStartUtc}: ${r.form}${r.lastValid ? `, last valid ${r.lastValid}` : ''}${r.firstRefusal ? `, first refusal ${r.firstRefusal}` : ''}${r.refusal ? ` (${r.refusal})` : ''}.`);
    for (const r of a.exclusions.rows.slice(0, 40)) L.push(`  - Out of the denominator: ${r.pair.join(' / ')}, ${r.band}, ${r.referenceTcaUtc}, ${fix(r.referenceMissM, 1)} m.`);
  }
  L.push('', `**Proof by a fabricated listing** (\`listing-proof.mjs\`, part of the E2E): ${int(proof.fabricated.referenceEventsBelow1Km)} invented reference events below 1 km, ${int(proof.fabricated.droppedByTheScreenWhileScreened)} of them dropped by the screen while their object was still screened. The harness of \`${proof.baselineHarness.commit.slice(0, 7)}\`, which read every listed object as excluded, answers ${int(proof.baselineHarness.found)} of ${int(proof.baselineHarness.reference)}, ${proof.baselineHarness.status}, ${int(proof.baselineHarness.misses)} misses: a false pass. This harness answers ${int(proof.thisHarness.found)} of ${int(proof.thisHarness.reference)}, ${proof.thisHarness.status}, ${int(proof.thisHarness.misses)} misses.`);

  L.push('', '## Defects', '');
  const defects = arms.flatMap((a) => [...a.misses.map((m) => ({ kind: 'missed', arm: a.id, m })), ...a.screenEvents.falseEvents.map((f) => ({ kind: 'false', arm: a.id, f }))]);
  if (!defects.length) L.push('None: every reference event was found in every arm, and every screen event below 5 km was matched.');
  else {
    L.push('| Arm | Kind | NORAD pair | Band | TCA (UTC) | Miss (m) | Detail |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const d of defects.slice(0, 60)) {
      if (d.kind === 'missed') L.push(`| ${d.arm} | missed | ${d.m.pair.join(' / ')} | ${d.m.band} | ${d.m.referenceTcaUtc} | ${fix(d.m.referenceMissM, 1)} | the screen has ${d.m.screenEventsForPair} event(s) for the pair${d.m.nearestScreenEvent ? `; nearest ${d.m.nearestScreenEvent.tcaUtc}, ${fix(d.m.nearestScreenEvent.missM, 1)} m, ${fix(d.m.nearestScreenEvent.secondsFromReference, 1)} s from the reference` : ''} |`);
      else L.push(`| ${d.arm} | false | ${d.f.pair.join(' / ')} | | ${d.f.tcaUtc} | ${fix(d.f.missM, 1)} | ${d.f.reason} |`);
    }
    if (defects.length > 60) L.push('', `${int(defects.length - 60)} more in the run's files.`);
  }

  L.push('', '## TCA and miss-distance differences (screen minus reference), matched events', '',
    `Absolute differences; the reference's TCA has a resolution of 1 ms. Events beyond ${config.comparison.flag.tcaSeconds} s or ${config.comparison.flag.missM} m are flagged.`, '',
    '| Arm, band | Matched | TCA median (s) | TCA 95th (s) | TCA max (s) | Miss median (m) | Miss 95th (m) | Miss max (m) | Mean signed miss (m) |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const a of arms) for (const b of BANDS) L.push(diffRow(`${a.id}, ${b}`, a.differences[b]));
  arms.forEach((a, n) => {
    L.push('', `Flagged in ${a.id}: ${int(a.outliers.flagged)} of ${int(a.differences.all.matched)}.`);
    if (n > 0 && JSON.stringify(a.outliers.rows) === JSON.stringify(arms[0].outliers.rows)) { if (a.outliers.rows.length) L.push('', `The same events as in arm ${arms[0].id}.`); return; }
    if (a.outliers.rows.length) {
      L.push('', '| NORAD pair | Band | Reference TCA (UTC) | Reference miss (m) | TCA difference (s) | Miss difference (m) |', '| --- | --- | --- | --- | --- | --- |');
      for (const r of a.outliers.rows) L.push(`| ${r.pair.join(' / ')} | ${r.band} | ${r.referenceTcaUtc} | ${fix(r.referenceMissM, 1)} | ${fix(r.dtSeconds, 4)} | ${fix(r.dMissM, 3)} |`);
    }
  });

  L.push('', '## Probability of collision', '',
    'The events carry no covariance, so the screen reports the Alfano maximum. Each matched event\'s value is compared with the module\'s `alfano_max_probability` at the screen\'s own miss and combined radius (they must be identical) and at the reference\'s miss (a difference of a few decimeters in the miss shows as a relative difference in the probability).', '',
    '| Arm | Compared | At the screen\'s miss: median / max relative difference | At the reference\'s miss: median / 95th / max relative difference |', '| --- | --- | --- | --- |');
  for (const a of arms) L.push(`| ${a.id} | ${int(a.probability.compared)} | ${sci(a.probability.relativeDifferenceAtScreenMiss.median)} / ${sci(a.probability.relativeDifferenceAtScreenMiss.max)} | ${sci(a.probability.relativeDifferenceAtReferenceMiss.median)} / ${sci(a.probability.relativeDifferenceAtReferenceMiss.p95)} / ${sci(a.probability.relativeDifferenceAtReferenceMiss.max)} |`);

  const st = ref.stats;
  const callText = (a) => `${a.windows} ${a.windows === 1 ? 'call' : 'calls'}${a.fallback ? ` (the single 72 h call failed: ${a.fallback.reason})` : ''}${a.mergedAcrossEdges ? `, ${int(a.mergedAcrossEdges)} event(s) merged across window edges` : ''}`;
  L.push('', '## Cost and settings', '',
    `- Screen (\`screen_catalog\`, ${config.screen.workers} module threads, coarse step ${config.screen.common.coarseStepSeconds} s, refinement tolerance ${config.screen.common.refinementToleranceSeconds} s): ${arms.map((a) => `arm ${a.id}, threshold ${a.thresholdM / 1000} km, ${callText(a)}: ${fix(a.elapsedMs / 1000, 1)} s, ${int(a.statistics.PAIRS_SCREENED)} pairs screened, ${int(a.statistics.KD_TREE_CANDIDATES)} k-d tree candidates, ${int(a.statistics.TCA_REFINED)} encounters refined, ${int(a.statistics.PROPAGATIONS)} propagations`).join('; ')}.`,
    `- Reference (SGP4 module, sample step ${config.reference.sampleSeconds} s, refinement steps ${config.reference.stages.map((s) => `${s.stepSeconds} s`).join(', ')}; SGP4 has no integrator, one thread): dense pass ${fix(st.denseMs / 1000, 0)} s over ${int(st.samples)} samples of ${int(st.objects)} objects, ${int(st.flaggedPairSamples)} pair samples below ${config.reference.candidateBoundKm} km, ${int(st.brackets)} candidates, kept ${config.reference.stages.map((s) => `${int(st.kept[s.id])} after ${s.id}`).join(', ')}; refinement ${fix(st.refineMs / 1000, 0)} s in ${int(st.moduleCalls)} module calls.`,
    `- Guards: largest object speed ${fix(st.maxObjectSpeedKmS, 3)} km/s (registered bound ${config.reference.maxObjectSpeedKmS} km/s); the module's ephemeris lines against its single-epoch states: at most ${fix(metrics.timeGrid.maxLineVersusStateM, 3)} m; one instant answered twice at a chunk boundary differs by at most ${fix(st.maxDuplicateSampleDiffKm * 1000, 3)} m.`,
    `- Subset: ${int(metrics.subset.eligible)} eligible objects, ranked by SHA-256 of \`${metrics.subset.seed}:<NORAD_CAT_ID>\`, first ${int(metrics.subset.requested)}; list SHA-256 \`${metrics.subset.listSha256}\`.`);

  const pins = manifest.modulesRepository.pins;
  L.push('', '## Provenance', '',
    `- Snapshot \`${manifest.inputs.snapshot.path}\`, SHA-256 \`${manifest.inputs.snapshot.sha256}\`, ${int(manifest.inputs.snapshot.records)} records.`,
    `- space-data-network-modules, artifacts read with \`git show\`, not from a working tree: conjunction-assessment ${ca.version} at \`${pins['analysis/conjunction-assessment'].commit}\`, \`${ca.wasmSha256}\`; propagator/sgp4 ${sgp4.version} at \`${pins['propagator/sgp4'].commit}\`, \`${sgp4.wasmSha256}\`.`,
    `- Packages: space-data-module-sdk ${ca.packages['space-data-module-sdk']}, spacedatastandards.org ${ca.packages['spacedatastandards.org']} (screen) and ${sgp4.packages['spacedatastandards.org']} (SGP4 answers). Node ${manifest.runtime.node}, ${manifest.runtime.cpus} logical CPUs, 1-minute load average ${fix(manifest.runtime.loadAverageStart[0], 1)} at the start and ${fix(manifest.runtime.loadAverageEnd[0], 1)} at the end (the host was shared).`,
    `- Experiment commit \`${manifest.plan?.experimentCommit?.slice(0, 10) ?? 'n/a'}\`; run sources: ${Object.entries(manifest.plan?.sourceHashes ?? {}).map(([f, h]) => `${f} \`${h.slice(0, 12)}\``).join(', ')}.`,
    `- Files: \`${FILES.metrics}\`, \`${FILES.manifest}\`, \`${FILES.moved}\`, \`${FILES.replay}\` and \`${FILES.proof}\` in this folder, with the 0.9.0 run's \`metrics.json\`, \`manifest.json\`, \`parity-diagnostic.json\` and \`replay.json\` beside them; the subset, the reference events, the screen events and the matches stay under \`runs/\` (element-set-derived).`,
    '', '## What this does and does not show', '',
    '- It shows whether the screen finds what an exhaustive search over the same SGP4 element sets finds, and how closely their TCA, miss distance and Pc agree. It does not measure accuracy against where objects were: both sides use the same element sets.',
    '- One snapshot, one 2,000-object subset, one 72-hour window; `screen_catalog` (the single-call screen), not the resident windowed screen the console uses; only events below 5 km are assessed.',
    gate.found === gate.reference && gate.reference > 0
      ? `- A recall of 1.0 over ${int(gate.reference)} events below 1 km excludes, at 95 %, a miss rate above ${pct(1 - main.recall['below 1 km'].lowerBound)} in that band.`
      : `- Recall below 1 km is ${int(gate.found)} of ${int(gate.reference)}.`,
    main.recall.all.found === main.recall.all.reference && main.recall.all.reference > 0
      ? `- A recall of 1.0 over all ${int(main.recall.all.reference)} events below 5 km excludes, at 95 %, a miss rate above ${pct(1 - main.recall.all.lowerBound)}.`
      : `- Recall over all events below 5 km is ${int(main.recall.all.found)} of ${int(main.recall.all.reference)} (95 % lower bound ${lower(main.recall.all.lowerBound)}).`, '');
  return `${L.join('\n')}\n`;
}

const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
export const stored = () => ({ metrics: read(path.join(resultsDir, FILES.metrics)), manifest: read(path.join(resultsDir, FILES.manifest)), moved: read(path.join(resultsDir, FILES.moved)), proof: read(path.join(resultsDir, FILES.proof)), baseline: read(path.join(repo, a2.baseline.metrics)) });

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { run: { type: 'string' }, check: { type: 'boolean', default: false }, 'replay-from': { type: 'string' }, 'proof-from': { type: 'string' } } });
  if (values.run) {
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.copyFileSync(path.join(values.run, 'metrics.json'), path.join(resultsDir, FILES.metrics));
    fs.copyFileSync(path.join(values.run, 'manifest.json'), path.join(resultsDir, FILES.manifest));
    fs.copyFileSync(path.join(values.run, 'moved.json'), path.join(resultsDir, FILES.moved));
    const old = path.join(resultsDir, a2.baseline.readme);
    if (!fs.existsSync(old)) fs.copyFileSync(path.join(resultsDir, 'README.md'), old);
    fs.writeFileSync(path.join(resultsDir, 'README.md'), render(stored()));
    console.log(`wrote ${path.join(resultsDir, 'README.md')}`);
  } else if (values.check) {
    if (render(stored()) !== fs.readFileSync(path.join(resultsDir, 'README.md'), 'utf8')) { console.error('README.md differs from the report generated from the stored results'); process.exit(1); }
    console.log('README.md regenerates exactly');
  } else if (values['replay-from']) {
    fs.writeFileSync(path.join(resultsDir, FILES.replay), `${JSON.stringify(replaySummary(read(path.join(values['replay-from'], 'metrics.json'))), null, 2)}\n`);
    console.log(`wrote ${path.join(resultsDir, FILES.replay)}`);
  } else if (values['proof-from']) {
    fs.writeFileSync(path.join(resultsDir, FILES.proof), `${JSON.stringify(read(values['proof-from']), null, 2)}\n`);
    console.log(`wrote ${path.join(resultsDir, FILES.proof)}`);
  } else { console.error('usage: report.mjs --run DIR | --check | --replay-from DIR | --proof-from FILE'); process.exit(2); }
}
