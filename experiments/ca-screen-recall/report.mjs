#!/usr/bin/env node
// ca-screen-recall: the report, generated from a run's metrics and manifest (never typed).
//   node experiments/ca-screen-recall/report.mjs --run <runs/ca-screen-recall/RUN>   copy metrics and manifest to results/, write README.md
//   node experiments/ca-screen-recall/report.mjs --check                              regenerate README.md from results/ and require the same bytes
//   node experiments/ca-screen-recall/report.mjs --replay-from <dir>                  write results/ca-screen-recall/replay.json from a replay run
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { config, repo, id } from './common.mjs';

export const resultsDir = path.join(repo, 'results', id);
const int = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fix = (v, d) => (v === null || v === undefined ? 'n/a' : Number(v).toFixed(d));
const sci = (v) => (v === null || v === undefined ? 'n/a' : Number(v).toExponential(2));
const pct = (v) => (v === null ? 'n/a' : `${(100 * v).toFixed(2)} %`);
const lower = (v) => (v === null ? 'n/a' : v.toFixed(4));
const BANDS = ['below 1 km', '1 to 5 km', 'all'];

// The counts a replay must reproduce exactly (integers only).
export function replaySummary(metrics) {
  const ref = metrics.reference;
  return {
    objects: metrics.subset.selected, durationSeconds: metrics.window.durationSeconds,
    reference: { events: ref.events, inWindow: ref.inWindow, atWindowEdge: ref.atWindowEdge, belowOneKm: ref.belowOneKm, oneToFiveKm: ref.oneToFiveKm, nearThreshold: ref.nearThreshold },
    arms: Object.fromEntries(Object.values(metrics.arms).map((a) => [a.id, {
      recall: Object.fromEntries(BANDS.map((b) => [b, { reference: a.recall[b].reference, found: a.recall[b].found }])),
      screenEvents: { total: a.screenEvents.total, matched: a.screenEvents.matched, nearThreshold: a.screenEvents.nearThreshold, edge: a.screenEvents.edge, beyondReference: a.screenEvents.beyondReference, falseEvents: a.screenEvents.falseEvents.length },
      excludedObjects: a.excludedObjects.length,
    }])),
    verdict: metrics.verdict.status,
  };
}

const diffRow = (label, d) => `| ${label} | ${int(d.matched)} | ${fix(d.tcaSeconds.median, 4)} | ${fix(d.tcaSeconds.p95, 4)} | ${fix(d.tcaSeconds.max, 4)} | ${fix(d.missM.median, 3)} | ${fix(d.missM.p95, 3)} | ${fix(d.missM.max, 3)} | ${fix(d.signedMissMeanM, 3)} |`;

export function render(metrics, manifest) {
  const L = [], arms = Object.values(metrics.arms), main = metrics.arms[config.pass.arm], ref = metrics.reference, gate = metrics.verdict;
  const planCommit = manifest.plan?.planCommit?.slice(0, 10) ?? 'n/a';
  const verdictLine = gate.status === 'pass'
    ? `**Pass.** All ${int(gate.reference)} reference events below 1 km were found by the screen at its defaults (recall 1.0).`
    : gate.status === 'fail'
      ? `**Fail.** The screen at its defaults found ${int(gate.found)} of ${int(gate.reference)} reference events below 1 km. Every miss is filed below as a defect with its pair.`
      : `**Inconclusive.** ${gate.status}.`;
  L.push('# Conjunction screen recall against a brute-force all-pairs reference', '',
    `Pre-registered experiment ([PLAN](../../experiments/${id}/PLAN.md), registered at commit \`${planCommit}\` before the run read the element sets). Run \`${manifest.startedAt}\`.`,
    `${int(metrics.subset.selected)} LEO objects of the Space-Track GP snapshot of 2026-10-29, ${int(metrics.window.durationSeconds / 3600)} hours from ${metrics.window.startUtc}. Source: USSPACECOM / 18th Space Defense Squadron, via Space-Track.org (https://www.space-track.org). Element sets are not reproduced here (README rule 4); only aggregates and the NORAD pairs of defects are.`, '',
    '## Result', '', verdictLine, '',
    `**Propagator agreement (a finding of its own).** The screen's built-in SGP4 and the \`propagator/sgp4\` module, given the same element sets, differ by up to ${fix(main.parity.positionM.max, 1)} m in position (median ${fix(main.parity.positionM.median, 2)} m, 95th percentile ${fix(main.parity.positionM.p95, 2)} m) and up to ${fix(main.parity.velocityMS.max * 1000, 2)} mm/s in velocity, over ${int(main.parity.objects)} object states at the instants of the screen's events; the largest is NORAD ${main.parity.largest[0]?.norad ?? 'n/a'}. Details below.`, '',
    ...(main.fallback ? [`**The 5 km screen could not run as one 72 h call** (${main.fallback.reason}); it ran as ${main.windows} consecutive ${main.fallback.windowSeconds / 3600} h calls.`, ''] : []));
  L.push('Recall of the module\'s `screen_catalog` against the exhaustive reference, by the reference\'s miss distance (a reference event is one local minimum of a pair\'s distance below 5 km):', '',
    '| Arm | Miss band | Reference events | Found | Recall | 95 % lower bound |', '| --- | --- | --- | --- | --- | --- |');
  for (const a of arms) for (const b of BANDS) L.push(`| ${a.id} (${a.thresholdM / 1000} km) | ${b} | ${int(a.recall[b].reference)} | ${int(a.recall[b].found)} | ${pct(a.recall[b].recall)} | ${lower(a.recall[b].lowerBound)} |`);
  L.push('', `The reference found ${int(ref.events)} events: ${int(ref.belowOneKm)} below 1 km and ${int(ref.oneToFiveKm)} from 1 to 5 km inside the window, ${int(ref.nearThreshold)} from 5.0 to 5.5 km (near the threshold, never counted), ${int(ref.atWindowEdge)} within ${config.comparison.edgeSeconds} s of a window end (counted apart) and ${int(ref.outsideWindow)} outside it.`, '',
    '| Arm | Screen events | Matched | Near-threshold | At a window end | Beyond 5 km (not assessed) | False events | Duplicates | Objects excluded by the screen |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const a of arms) { const s = a.screenEvents; L.push(`| ${a.id} | ${int(s.total)} | ${int(s.matched)} | ${int(s.nearThreshold)} | ${int(s.edge)} | ${int(s.beyondReference)} | ${int(s.falseEvents.length)} | ${int(s.duplicates)} | ${int(a.excludedObjects.length)} |`); }

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
  for (const a of arms) {
    L.push('', `Flagged in ${a.id}: ${int(a.outliers.flagged)} of ${int(a.differences.all.matched)}.`);
    if (a.outliers.rows.length) {
      L.push('', '| NORAD pair | Band | Reference TCA (UTC) | Reference miss (m) | TCA difference (s) | Miss difference (m) |', '| --- | --- | --- | --- | --- | --- |');
      for (const r of a.outliers.rows) L.push(`| ${r.pair.join(' / ')} | ${r.band} | ${r.referenceTcaUtc} | ${fix(r.referenceMissM, 1)} | ${fix(r.dtSeconds, 4)} | ${fix(r.dMissM, 3)} |`);
    }
  }

  L.push('', '## Probability of collision', '',
    'The events carry no covariance, so the screen reports the Alfano maximum. Each matched event\'s value is compared with the module\'s `alfano_max_probability` at the screen\'s own miss and combined radius (they must be identical) and at the reference\'s miss (a difference of a few decimetres in the miss shows as a relative difference in the probability).', '',
    '| Arm | Compared | At the screen\'s miss: median / max relative difference | At the reference\'s miss: median / 95th / max relative difference |', '| --- | --- | --- | --- |');
  for (const a of arms) L.push(`| ${a.id} | ${int(a.probability.compared)} | ${sci(a.probability.relativeDifferenceAtScreenMiss.median)} / ${sci(a.probability.relativeDifferenceAtScreenMiss.max)} | ${sci(a.probability.relativeDifferenceAtReferenceMiss.median)} / ${sci(a.probability.relativeDifferenceAtReferenceMiss.p95)} / ${sci(a.probability.relativeDifferenceAtReferenceMiss.max)} |`);

  const p = main.parity;
  L.push('', '## The two SGP4 implementations', '',
    `The screen reports each event's two states. Against the SGP4 module's states at the same instant (${int(p.objects)} object states, arm ${main.id}), position differs by a median ${fix(p.positionM.median, 3)} m, 95th percentile ${fix(p.positionM.p95, 3)} m, maximum ${fix(p.positionM.max, 3)} m, and velocity by a median ${fix(p.velocityMS.median * 1000, 3)} mm/s, maximum ${fix(p.velocityMS.max * 1000, 3)} mm/s. That bounds how much of any TCA or miss-distance difference above is the propagators' and not the screen's.`,
    '', 'Largest position differences:', '', '| NORAD | Position difference (m) | Velocity difference (mm/s) | Event TCA (UTC) |', '| --- | --- | --- | --- |',
    ...p.largest.map((r) => `| ${r.norad} | ${fix(r.positionM, 3)} | ${fix(r.velocityMS * 1000, 3)} | ${r.tcaUtc} |`));

  const st = ref.stats, a0 = main;
  const callText = (a) => `${a.windows} ${a.windows === 1 ? 'call' : 'calls'}${a.fallback ? ` (the single 72 h call failed: ${a.fallback.reason})` : ''}${a.mergedAcrossEdges ? `, ${int(a.mergedAcrossEdges)} event(s) merged across window edges` : ''}`;
  L.push('', '## Cost and settings', '',
    `- Screen (\`screen_catalog\`, ${config.screen.workers} module threads, coarse step ${config.screen.common.coarseStepSeconds} s, refinement tolerance ${config.screen.common.refinementToleranceSeconds} s): ${arms.map((a) => `arm ${a.id}, threshold ${a.thresholdM / 1000} km, ${callText(a)}: ${fix(a.elapsedMs / 1000, 1)} s, ${int(a.statistics.PAIRS_SCREENED)} pairs screened, ${int(a.statistics.KD_TREE_CANDIDATES)} k-d tree candidates, ${int(a.statistics.TCA_REFINED)} encounters refined, ${int(a.statistics.PROPAGATIONS)} propagations`).join('; ')}.`,
    `- Reference (SGP4 module, sample step ${config.reference.sampleSeconds} s, refinement steps ${config.reference.stages.map((s) => `${s.stepSeconds} s`).join(', ')}; SGP4 has no integrator, one thread): dense pass ${fix(st.denseMs / 1000, 0)} s over ${int(st.samples)} samples of ${int(st.objects)} objects, ${int(st.flaggedPairSamples)} pair samples below ${config.reference.candidateBoundKm} km, ${int(st.brackets)} candidates, kept ${config.reference.stages.map((s) => `${int(st.kept[s.id])} after ${s.id}`).join(', ')}; refinement ${fix(st.refineMs / 1000, 0)} s in ${int(st.moduleCalls)} module calls.`,
    `- Guards: largest object speed ${fix(st.maxObjectSpeedKmS, 3)} km/s (registered bound ${config.reference.maxObjectSpeedKmS} km/s); the module's ephemeris lines against its single-epoch states: at most ${fix(metrics.timeGrid.maxLineVersusStateM, 3)} m; one instant answered twice at a chunk boundary differs by at most ${fix(st.maxDuplicateSampleDiffKm * 1000, 3)} m.`,
    `- Subset: ${int(metrics.subset.eligible)} eligible objects, ranked by SHA-256 of \`${metrics.subset.seed}:<NORAD_CAT_ID>\`, first ${int(metrics.subset.requested)}; list SHA-256 \`${metrics.subset.listSha256}\`.`);

  const mods = manifest.modules;
  L.push('', '## Provenance', '',
    `- Snapshot \`${manifest.inputs.snapshot.path}\`, SHA-256 \`${manifest.inputs.snapshot.sha256}\`, ${int(manifest.inputs.snapshot.records)} records.`,
    `- space-data-network-modules commit \`${manifest.modulesRepository.pinnedCommit}\`; artifacts read from that commit, not from a working tree: conjunction-assessment ${mods['analysis/conjunction-assessment'].version} \`${mods['analysis/conjunction-assessment'].wasmSha256}\`, propagator/sgp4 ${mods['propagator/sgp4'].version} \`${mods['propagator/sgp4'].wasmSha256}\`.`,
    `- Packages: space-data-module-sdk ${mods['analysis/conjunction-assessment'].packages['space-data-module-sdk']}, spacedatastandards.org ${mods['analysis/conjunction-assessment'].packages['spacedatastandards.org']} (screen) and ${mods['propagator/sgp4'].packages['spacedatastandards.org']} (SGP4 answers). Node ${manifest.runtime.node}, ${manifest.runtime.cpus} logical CPUs, 1-minute load average ${fix(manifest.runtime.loadAverageStart[0], 1)} at the start and ${fix(manifest.runtime.loadAverageEnd[0], 1)} at the end (the host was shared).`,
    `- Experiment commit \`${manifest.plan?.experimentCommit?.slice(0, 10) ?? 'n/a'}\`; run sources: ${Object.entries(manifest.plan?.sourceHashes ?? {}).map(([f, h]) => `${f} \`${h.slice(0, 12)}\``).join(', ')}.`,
    '- Files: `metrics.json`, `manifest.json`, `replay.json` in this folder; the subset, the reference events, the screen events and the matches stay under `runs/` (element-set-derived).',
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

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { run: { type: 'string' }, check: { type: 'boolean', default: false }, 'replay-from': { type: 'string' } } });
  const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  if (values.run) {
    fs.mkdirSync(resultsDir, { recursive: true });
    for (const f of ['metrics.json', 'manifest.json']) fs.copyFileSync(path.join(values.run, f), path.join(resultsDir, f));
    fs.writeFileSync(path.join(resultsDir, 'README.md'), render(read(path.join(resultsDir, 'metrics.json')), read(path.join(resultsDir, 'manifest.json'))));
    console.log(`wrote ${path.join(resultsDir, 'README.md')}`);
  } else if (values.check) {
    const expected = render(read(path.join(resultsDir, 'metrics.json')), read(path.join(resultsDir, 'manifest.json')));
    if (expected !== fs.readFileSync(path.join(resultsDir, 'README.md'), 'utf8')) { console.error('README.md differs from the report generated from metrics.json'); process.exit(1); }
    console.log('README.md regenerates exactly');
  } else if (values['replay-from']) {
    fs.writeFileSync(path.join(resultsDir, 'replay.json'), `${JSON.stringify(replaySummary(read(path.join(values['replay-from'], 'metrics.json'))), null, 2)}\n`);
    console.log(`wrote ${path.join(resultsDir, 'replay.json')}`);
  } else { console.error('usage: report.mjs --run DIR | --check | --replay-from DIR'); process.exit(2); }
}
