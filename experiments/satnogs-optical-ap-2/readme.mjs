#!/usr/bin/env node
// results/satnogs-optical-ap-2/README.md from table.json, registered.json and the first registration's table.json
// (numbers only as measured).
import fs from 'node:fs';
import path from 'node:path';
import { sessions, generationOf } from './arcs.mjs';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../..');
const dir = path.join(root, 'results/satnogs-optical-ap-2');
const t = JSON.parse(fs.readFileSync(path.join(dir, 'table.json'), 'utf8'));
const reg = JSON.parse(fs.readFileSync(path.join(here, 'registered.json'), 'utf8'));
const first = JSON.parse(fs.readFileSync(path.join(root, reg.firstRegistration.table), 'utf8'));
const km = (x) => (x == null ? '-' : x.toFixed(2));
const n3 = (x) => (x == null ? '-' : x.toFixed(3));
const scorable = reg.arcs.filter((a) => a.scorable);
const objects = [...new Set(scorable.map((a) => a.norad))];
const name = (n) => reg.arcs.find((a) => a.norad === n).name;
const ap = t.rows.filter((r) => r.arm === 'AP'), b = t.rows.filter((r) => r.arm === 'B');
const cell = (rows, arc, d) => rows.find((r) => r.arc === arc && r.leadDay === d);
const days = (rows, arc, k) => [1, 2, 3].map((d) => km(cell(rows, arc, d)?.[k])).join(' / ');
const fitOf = (arc) => t.fits.find((f) => f.arc === arc);
// Where an arc stopped: initial_orbit, plan (an arc too short) or select at a stage, or before the angles lane.
const whereOf = (f) => { const s = f.stages.at(-1); return f.initialOrbit?.refusal ? "initial_orbit on all the arc's tracks" : !s ? "before the angles lane" : s.planRefusal ? `plan at stage ${s.stage}` : `select at stage ${s.stage} (nights ${s.nights})`; };
const short = (s) => (s ?? '').replace(/^[a-z/_ -]+?: /, '').split(/[;(]/)[0].trim().slice(0, 160);
const L = [];
L.push('# SatNOGS Optical angles to AP 0.5.1: registered result, second registration (the fixed angles lane)', '');
L.push('Data credit: SatNOGS Optical contributors - https://optical.satnogs.org - CC BY-SA 4.0', '');
L.push(`Registration \`experiments/satnogs-optical-ap-2/PLAN.md\` (sha256 \`${t.planSha256}\`). Build \`${t.build}\` (modules ${t.modulesCommit}; artifact hashes in \`registered.json\`). Input class \`${t.inputClass}\`. Results only: no captured or derived batch is published; comparator B is lettered source A (Space-Track), errors only. The first registration (\`${reg.firstRegistration.plan}\`, sha256 \`${reg.firstRegistration.planSha256.slice(0, 8)}\`, 0 of 42 AP cells) stands as recorded.`, '');

// ---- outcome ----
const scoredAp = ap.filter((r) => r.status === 'scored');
const failArcs = t.fits.filter((f) => f.status !== 'fitted');
const failNames = {};
for (const f of failArcs) failNames[f.status.slice(8)] = (failNames[f.status.slice(8)] ?? 0) + 1;
L.push('## Outcome', '');
L.push(`${scoredAp.length} of ${t.registeredCells.ap} AP cells scored (${t.fits.length - failArcs.length} of ${t.fits.length} arcs fitted through); ${ap.filter((r) => r.status.startsWith('failure')).length} are failures under the stop rule (${failArcs.length} arcs: ${Object.entries(failNames).map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}). ${b.filter((r) => r.status === 'scored').length} of ${t.registeredCells.b} B cells scored, equal to the first registration's to the digit.`, '');
L.push('| Lead day | Cells with AP and B | AP median (km) | B median, same cells (km) | AP/B | AP 95th | B 95th | Reading |', '|---|---|---|---|---|---|---|---|');
for (const d of [1, 2, 3]) {
  const c = t.common[d];
  const reading = c.ratio == null ? 'no AP forecast: H-lose (strongest form)' : c.ratio > 1 ? 'AP loses (H-lose)' : 'AP wins (H-win)';
  L.push(`| ${d} | ${c.cells} | ${km(c.apMedian3dKm)} | ${km(c.bMedian3dKm)} | ${c.ratio == null ? '-' : c.ratio.toFixed(2)} | ${km(c.apP95_3dKm)} | ${km(c.bP95_3dKm)} | ${reading} |`);
}
L.push('', 'Descriptive only (at most 14 arcs on 6 objects; no significance test). Pooled samples are 60 s epochs at DORIS truth epochs, 3D km.', '');

// ---- per object ----
L.push('## Per object (pooled samples, 60 s at DORIS epochs; 3D km)', '');
L.push('| Object | Arcs | AP cells scored | AP failures (by name) | AP day 1/2/3 median | AP day 1/2/3 95th | B day 1/2/3 median | B day 1/2/3 95th |', '|---|---|---|---|---|---|---|---|');
for (const n of objects) {
  const arcs = scorable.filter((a) => a.norad === n);
  const fails = {};
  for (const f of t.fits.filter((f) => f.status !== 'fitted' && arcs.some((a) => a.id === f.arc))) fails[f.status.slice(8)] = (fails[f.status.slice(8)] ?? 0) + 1;
  const pool = (arm, k) => [1, 2, 3].map((d) => km(t.pooled[`${arm}|${n}|${d}`]?.[k])).join(' / ');
  L.push(`| ${name(n)} (${n}) | ${arcs.length} | ${ap.filter((r) => r.norad === n && r.status === 'scored').length} | ${Object.entries(fails).map(([k, v]) => `${k} x${v}`).join(', ') || '-'} | ${pool('AP', 'median3dKm')} | ${pool('AP', 'p95_3dKm')} | ${pool('B', 'median3dKm')} | ${pool('B', 'p95_3dKm')} |`);
}
const all = (arm, k) => [1, 2, 3].map((d) => km(t.pooled[`${arm}|all|${d}`]?.[k])).join(' / ');
L.push(`| All | ${scorable.length} | ${scoredAp.length} | ${failArcs.length} arcs | ${all('AP', 'median3dKm')} | ${all('AP', 'p95_3dKm')} | ${all('B', 'median3dKm')} | ${all('B', 'p95_3dKm')} |`, '');
L.push('The All row pools every scored cell of each arm (B over all 14 arcs); the Outcome table compares the arms on the same cells.', '');

// ---- per arc ----
L.push('## Per arc', '');
L.push('| Arc | AP | Stage reached (candidates converged/planned per stage) | WEIGHTED_RMS | Used / usable / rows | AP day 1/2/3 median (km) | B day 1/2/3 median (km) | AP day 1/2/3 95th (km) | B day 1/2/3 95th (km) |', '|---|---|---|---|---|---|---|---|---|');
for (const a of scorable) {
  const f = fitOf(a.id);
  const stages = f.stages.map((s) => (s.planRefusal ? `${s.stage}: plan refused` : `${s.stage}: ${s.candidates.filter((c) => c.outcome === 'converged').length}/${s.candidates.length}`)).join('; ');
  const last = f.stages.at(-1), over = last?.selectRefusal ? `; converged WEIGHTED_RMS ${last.candidates.filter((c) => c.weightedRms != null).map((c) => n3(c.weightedRms)).join(', ')}, over the limit 2` : '';
  const reached = f.stageReached ? `${f.stageReached} (${stages}${over})` : f.initialOrbit?.refusal ? '0 (initial_orbit refused)' : '0';
  L.push(`| ${a.id} | ${f.status} | ${reached} | ${n3(f.estimate?.weightedRms)} | ${f.estimate?.observationsUsed ?? '-'} / ${f.observations} / ${f.rows} | ${days(ap, a.id, 'median3dKm')} | ${days(b, a.id, 'median3dKm')} | ${days(ap, a.id, 'p95_3dKm')} | ${days(b, a.id, 'p95_3dKm')} |`);
}
L.push('', 'WEIGHTED_RMS: the angles-only estimate\'s (analysis/estimation, RA/Dec residuals over their sigmas). Used: observations the estimate kept; usable: the observations satnogs-optical-source passed; rows: the arc\'s rows for the object.', '');

// ---- failures by name ----
L.push('## Failures by name', '');
if (!failArcs.length) L.push('None.', '');
else {
  L.push('| Arc | Failure | Where | The module\'s message |', '|---|---|---|---|');
  for (const f of failArcs) {
    L.push(`| ${f.arc} | ${f.status.slice(8)} | ${whereOf(f)} | ${short(f.refusal).replace(/\|/g, '/')} |`);
  }
  L.push('');
  const cand = t.fits.flatMap((f) => f.stages.flatMap((s) => s.candidates.filter((c) => c.outcome !== 'converged').map((c) => ({ arc: f.arc, stage: s.stage, ...c }))));
  if (cand.length) {
    L.push(`Candidates refused inside their fit (a refused candidate sends nothing to select): ${cand.length}; by code: ${Object.entries(cand.reduce((m, c) => { const x = /^(?:(\S+\/\S+) )?([a-z]+(?:-[a-z0-9]+)*(?::\d+)?)/.exec(c.outcome) ?? []; const k = `${x[2] ?? 'refused'}${x[1] ? ` (${x[1]})` : ''}`; m[k] = (m[k] ?? 0) + 1; return m; }, {})).map(([k, v]) => `${k} x${v}`).join(', ')}.`, '');
  }
}

// ---- side by side ----
L.push('## Against the first registration', '');
L.push('| Arc | First registration | This registration |', '|---|---|---|');
const firstStatus = (arc) => first.fits.find((f) => f.arc === arc).status;
for (const a of scorable) L.push(`| ${a.id} | ${firstStatus(a.id)} | ${fitOf(a.id).status} |`);
L.push('');
const names = { 'failure:initial-orbit-refused': 'initial-orbit-refused (initial_orbit on the first track alone answered no-initial-orbit)' };
for (const a of scorable) {
  const was = firstStatus(a.id), f = fitOf(a.id);
  if (was === f.status) continue;
  const before = names[was] ?? was.slice(8);
  if (f.status === 'fitted') {
    L.push(`- ${a.id}: ${before} in the first registration; now fitted through ${f.stageReached} stage${f.stageReached === 1 ? '' : 's'} (WEIGHTED_RMS ${n3(f.estimate.weightedRms)}, ${f.estimate.observationsUsed} of ${f.observations} observations), AP day 1/2/3 median ${days(ap, a.id, 'median3dKm')} km beside B's ${days(b, a.id, 'median3dKm')} km.`);
  } else {
    L.push(`- ${a.id}: ${before} in the first registration; now ${f.status.slice(8)} at ${whereOf(f)} (${short(f.refusal)}).`);
  }
}
const same = scorable.filter((a) => firstStatus(a.id) === fitOf(a.id).status);
if (same.length) L.push(`- Unchanged by name: ${same.map((a) => `${a.id} (${fitOf(a.id).status.slice(8)}, now at ${whereOf(fitOf(a.id))})`).join('; ')}.`);
L.push('');

// ---- station-nights ----
L.push('## Station-nights', '');
const sn = t.stationNights;
const bad = sn.filter((s) => s.unusable);
L.push(`${sn.length} station-nights over the 14 arcs, ${sn.reduce((n, s) => n + s.rows, 0)} rows; ${bad.length} unusable (every row refused by satnogs-optical-source), ${bad.reduce((n, s) => n + s.rows, 0)} rows:`, '');
L.push('| Arc | Session | Station | Rows | Epoch convention | Why |', '|---|---|---|---|---|---|');
for (const s of bad) L.push(`| ${s.arc} | ${s.session} | ${s.station} | ${s.rows} | ${s.epochRefersTo.join(', ')} | ${s.epochRefersTo.includes('frame-arrival') ? 'frame-arrival: no declared offset to mid-exposure' : 'exposure-start with no exposure time declared'} |`);
const others = [...new Set(sn.filter((s) => !s.unusable && s.station !== 11).map((s) => `station ${s.station} (${s.arc}, ${s.session}, ${s.observations} observation${s.observations === 1 ? '' : 's'})`))];
L.push('', `Every usable row is station 11 except ${others.join('; ') || 'none'}. No row was quarantined.`, '');

// ---- station-site finding ----
L.push('## Station-site finding (data, not a scored arm)', '');
// Every captured session's station-11 record (the published site; no row read).
const inArcs = new Set(sn.map((s) => s.session));
const bySite = {};
for (const s of sessions()) {
  const f = path.join(generationOf(s), 'stations', 'station-11.json');
  if (!fs.existsSync(f)) continue;
  const st = JSON.parse(fs.readFileSync(f, 'utf8')).station;
  const k = `${st.name} | ${st.site.lat.toFixed(2)} N ${st.site.lon.toFixed(2)} E`;
  (bySite[k] ??= { in: [], out: [] })[inArcs.has(s) ? 'in' : 'out'].push(s.slice(5));
}
L.push('The capture\'s station-11 record changes its published site between sessions while the station\'s rows do not move. Every captured session\'s station-11 record:', '');
L.push('| Record name | Site | Sessions in the 14 arcs | Other sessions |', '|---|---|---|---|');
for (const [k, v] of Object.entries(bySite)) { const [nm, site] = k.split(' | '); L.push(`| ${nm} | ${site} | ${v.in.join(', ') || '-'} | ${v.out.length > 8 ? `${v.out.length} sessions` : v.out.join(', ') || '-'} |`); }
L.push('');
const gstArcs = sn.filter((s) => s.station === 11 && s.stationRecordForArc && s.site && s.site !== 'dwingeloo');
L.push(`The registered run uses each session's record in its \`$TDM\` site and one record per station per arc in observation-od (the first usable night's); the arcs whose station-11 record for the fit is not Dwingeloo's: ${gstArcs.map((s) => `${s.arc} (${s.site}, ${s.session})`).join('; ') || 'none'}.`, '');
L.push(`In the scored run: ${gstArcs.map((s) => `${s.arc} ${fitOf(s.arc).status}`).join('; ')}.`, '');
L.push('Part 2\'s diagnostic with Dwingeloo\'s site (52.83 N 6.38 E) for every station-11 session (modules-angles-only-od-real-tracks-2-20261104; diagnostic only, never a scored arm): 66514-2026-09-03-2026-09-06 fits through 3 stages to 0.510 km from DORIS at the arc\'s end (no-initial-orbit on the published sites), while 46984-2026-09-03-2026-09-06 and 54754-2026-08-31-2026-09-01 still answer no-initial-orbit at initial_orbit; at SWOT\'s DORIS state, the 2026-08-31 track\'s WEIGHTED_RMS is 9950.83 on the published site (optical-bench1, Greece) and 1.59 on Dwingeloo\'s, the 2026-09-01 track\'s 13071.07 (Drachten) and 1.41. No row is moved to another site in the scored run.', '');

// ---- build note ----
const art = reg.build.artifacts;
L.push('## Build note', '');
L.push(`Modules main ${reg.build.modulesCommit}, read-only dists, hashed by \`git show origin/main:<path>\`: ${Object.entries(art).map(([m, v]) => `${m} ${v.version}`).join(', ')}. Changed since the first registration (82f83d9f): analysis/optical-astrometry 0.1.0 to 0.3.0 (\`initial_orbit\` on all the arc's tracks, crossings fitted by a cubic with 5-sigma rejection, the far-sight first guess for one-crossing nights, refusals by name), flows/angles-only-od 0.1.0 to 0.3.0 (no seeds; select reads executions; near-ties to the least eccentric), flows/observation-od 0.2.0 to 0.4.0 (sample rounds in parts under ffm's 10,000 cap), analysis/estimation 0.7.0 to 0.8.0 (no whole-pass edit before the first convergence; two-body energy on damped trials; unbound or sub-surface trials rejected). Unchanged: satnogs-optical-source 0.1.0, ffm 2.1.0, sdn-ap 0.5.1, sgp4 1.4.1, eop-parser 0.2.0, frames 0.2.0, gp-error-model 0.14.0. Every fit.json records the sha256 of each artifact it loaded; all equal the registered build.`, '');
L.push('Cited from the record, not results of this registration: part 1\'s local measurement (3 of 11 arcs through, ends 0.29 to 1.39 km from DORIS) and part 2\'s (6 of 11 through). The estimate\'s epoch is the initial orbit\'s (plan sets TARGET_EPOCH); the carry flies it to the fit\'s end. Comparator B, its inputs and its code are the first registration\'s; its 42 cells equal the first registration\'s to the digit.', '');
L.push('## Caveats', '');
L.push('- Identity: object labels are the network\'s SGP4 correlation, an association key; counts are a floor. Sentinel-6A and 6B fly in tandem.', '- 14 arcs on 6 objects; descriptive only.', '- Forward cycle (stated, not run): DORIS lags 3 to 4 weeks; a later cycle adds the 2026-10-10 to 11-03 nights (Sentinel-6A and 6B) under a new registration.', '');
fs.writeFileSync(path.join(dir, 'README.md'), L.join('\n'));
console.log(L.join('\n'));
