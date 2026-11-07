#!/usr/bin/env node
// results/satnogs-optical-ap/README.md from table.json (numbers only as measured).
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const dir = path.resolve(here, '../../results/satnogs-optical-ap');
const t = JSON.parse(fs.readFileSync(path.join(dir, 'table.json'), 'utf8'));
const reg = JSON.parse(fs.readFileSync(path.join(here, 'registered.json'), 'utf8'));
const km = (x) => (x == null ? '-' : x.toFixed(2));
const objects = [...new Set(reg.arcs.filter((a) => a.scorable).map((a) => a.norad))];
const name = (n) => reg.arcs.find((a) => a.norad === n).name;
const L = [];
L.push('# SatNOGS Optical angles to AP 0.5.1: registered result', '');
L.push('Data credit: SatNOGS Optical contributors - https://optical.satnogs.org - CC BY-SA 4.0', '');
L.push(`Registration \`experiments/satnogs-optical-ap/PLAN.md\` (sha256 \`${t.planSha256}\`). Build \`${t.build}\` (modules ${t.modulesCommit}; artifact hashes in \`registered.json\`). Input class \`${t.inputClass}\`. Results only: no captured or derived batch is published; comparator B is lettered source A (Space-Track), errors only.`, '');
const ap = t.rows.filter((r) => r.arm === 'AP'), b = t.rows.filter((r) => r.arm === 'B');
L.push('## Outcome', '');
L.push(`${ap.filter((r) => r.status === 'scored').length} of ${t.registeredCells.ap} AP cells scored; ${ap.filter((r) => r.status.startsWith('failure')).length} are failures under the stop rule (every one of the 14 arcs failed before an AP set existed). ${b.filter((r) => r.status === 'scored').length} of ${t.registeredCells.b} B cells scored. H-lose holds in the strongest form: the angles-only lane produced no forecast to score; B has a forecast on every arc. No AP/B ratio exists.`, '');
L.push('## Per object (pooled samples, 60 s at DORIS epochs; 3D km)', '');
L.push('| Object | Arcs | AP cells scored | AP failures (by name) | AP day 1/2/3 median | AP day 1/2/3 95th | B day 1/2/3 median | B day 1/2/3 95th |', '|---|---|---|---|---|---|---|---|');
for (const n of objects) {
  const arcs = reg.arcs.filter((a) => a.scorable && a.norad === n);
  const fails = {};
  for (const r of ap.filter((r) => r.norad === n && r.status.startsWith('failure') && r.leadDay === 1)) fails[r.status.slice(8)] = (fails[r.status.slice(8)] ?? 0) + 1;
  const pool = (arm, k) => [1, 2, 3].map((d) => km(t.pooled[`${arm}|${n}|${d}`]?.[k])).join(' / ');
  L.push(`| ${name(n)} (${n}) | ${arcs.length} | ${ap.filter((r) => r.norad === n && r.status === 'scored').length} | ${Object.entries(fails).map(([k, v]) => `${k} x${v}`).join(', ')} | ${pool('AP', 'median3dKm')} | ${pool('AP', 'p95_3dKm')} | ${pool('B', 'median3dKm')} | ${pool('B', 'p95_3dKm')} |`);
}
const all = (arm, k) => [1, 2, 3].map((d) => km(t.pooled[`${arm}|all|${d}`]?.[k])).join(' / ');
L.push(`| All | 14 | ${ap.filter((r) => r.status === 'scored').length} | ${ap.filter((r) => r.status.startsWith('failure')).length / 3} arcs | ${all('AP', 'median3dKm')} | ${all('AP', 'p95_3dKm')} | ${all('B', 'median3dKm')} | ${all('B', 'p95_3dKm')} |`, '');
L.push('## Per arc', '');
L.push('| Arc | Usable tracks / observations | Fit span (h) | AP | B day 1/2/3 median (km) | B day 1/2/3 95th (km) | B set age at fit end (h) |', '|---|---|---|---|---|---|---|');
for (const f of t.fits) {
  const br = [1, 2, 3].map((d) => b.find((r) => r.arc === f.arc && r.leadDay === d));
  L.push(`| ${f.arc} | ${f.tracks} / ${f.observations} | ${f.fitHours?.toFixed(1)} | ${f.status}${f.stages.length ? ` (stages: ${f.stages.map((s) => `${s.stage}: ${s.converged}/${s.candidates} of ${s.tracks} tracks`).join('; ')})` : ''} | ${br.map((r) => km(r?.median3dKm)).join(' / ')} | ${br.map((r) => km(r?.p95_3dKm)).join(' / ')} | ${br[0]?.setAgeHours ?? '-'} |`);
}
L.push('', 'Failure names: `initial-orbit-refused` = analysis/optical-astrometry `initial_orbit` on the arc\'s first track answered `no-initial-orbit` (Gooding, no start converged); `no-converged-revolution-count` = stage 1 (night 1) converged but at stage 2 every candidate revolution count\'s Gooding seed through nights 1 and 2 was refused (`no-initial-orbit`), so no candidate was fitted; `arc-too-short:<h>` = after the refused rows the usable observations span under 24 h.', '');
L.push('## Station-nights', '');
const sn = t.stationNights;
const bad = sn.filter((s) => s.unusable);
L.push(`${sn.length} station-nights over the 14 arcs, ${sn.reduce((a, s) => a + s.rows, 0)} rows; ${bad.length} unusable (every row refused by satnogs-optical-source), ${bad.reduce((a, s) => a + s.rows, 0)} rows:`, '');
L.push('| Arc | Session | Station | Rows | Epoch convention | Why |', '|---|---|---|---|---|---|');
for (const s of bad) L.push(`| ${s.arc} | ${s.session} | ${s.station} | ${s.rows} | ${s.epochRefersTo.join(', ')} | ${s.epochRefersTo.includes('frame-arrival') ? 'frame-arrival: no declared offset to mid-exposure' : 'exposure-start with no exposure time declared'} |`);
L.push('', 'Every usable row is station 11 (dwingeloo, exposure-mid) except one station 4 row (Jason-3, 2026-09-12). No row was quarantined.', '');
L.push('## Build note', '');
L.push('Modules main 82f83d9f, read-only dists: data-source/satnogs-optical-source 0.1.0, flows/angles-only-od 0.1.0, flows/observation-od 0.2.0, analysis/optical-astrometry 0.1.0, analysis/estimation 0.7.0, propagator/ffm 2.1.0, propagator/sdn-ap 0.5.1, propagator/sgp4 1.4.1, data-source/eop-parser 0.2.0, foundation/frames 0.2.0, analysis/gp-error-model. The record title says sdn-ap 0.5.0; 0.5.1 is the version at 82f83d9f and was registered. No AP fit or flight ran: every arc stopped in the angles lane. The angles-only-od estimate epoch is the initial orbit\'s (the flow sets TARGET_EPOCH); the registered carry would have flown it to the fit\'s end. Comparator B is the Space-Track gp_history set by creation day (the `spacetrack/gp` snapshots begin 2026-09-26).', '');
L.push('## Caveats', '');
L.push('- Identity: object labels are the network\'s SGP4 correlation, an association key; counts are a floor. Sentinel-6A and 6B fly in tandem.', '- 14 arcs on 6 objects; descriptive only.', '- DORIS lags 3 to 4 weeks: a second cycle after 2026-11-15 adds the forward arcs (about 25 nights on Sentinel-6A and 6B, 2026-10-10 to 11-03) under a new registration.', '');
fs.writeFileSync(path.join(dir, 'README.md'), L.join('\n'));
console.log(L.join('\n'));
