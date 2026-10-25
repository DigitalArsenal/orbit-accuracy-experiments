// The Etalon-2 truth anomaly (task experiments-etalon2-truth-anomaly-20261025): FINDINGS.md generated from findings.json (compare.mjs) and
// rescore-v1c5.json (rescore-v1c5.mjs). `--check` (the E2E) reruns compare.mjs on the local products when they are present, requires the same
// findings, and requires the committed FINDINGS.md to equal the regenerated one.
//   node experiments/etalon2-anomaly/report.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const PRODUCTS = ['/opt/data/sdn-archive/v1c5/truth/download-cache/products', '/opt/data/sdn-archive/reference-states/products'];
const findings = JSON.parse(fs.readFileSync(path.join(here, 'findings.json'), 'utf8'));
const rescore = JSON.parse(fs.readFileSync(path.join(here, 'rescore-v1c5.json'), 'utf8'));
const continuity = JSON.parse(fs.readFileSync(path.join(here, 'continuity.json'), 'utf8'));
const km = (v) => Math.round(v).toLocaleString('en-US');

function markdown() {
  const o = ['# The Etalon-2 truth anomaly', ''];
  const wrong = findings.wrongDays;
  const clean = findings.weeks.filter((w) => !wrong.some((d) => d.satellite === w.satellite && d.week === w.week));
  const e2 = wrong.filter((d) => d.satellite === 'etalon2' && d.week === '261010');
  o.push('## Cause', '');
  o.push(`The truth product is at fault, not the element sets or the pairing. The ILRS combined weekly orbit (\`ilrsa.orb.etalon2.261010.v80\`, the week of 2026-10-04 to 10-10) has one wrong state on each of 2026-${e2.map((d) => d.day.slice(5)).join(', ')}: at 00:00 of those days its X coordinate is written as zero, ${km(Math.min(...e2.map((d) => d.maxKm)))} to ${km(Math.max(...e2.map((d) => d.maxKm)))} km from the orbits of every analysis center of the same week (${findings.weeks.find((w) => w.satellite === 'etalon2' && w.week === '261010').centers.join(', ')}), which agree with each other within ${Math.max(...e2.map((d) => d.centerSpreadKm * 1000)).toFixed(1)} m there. Every other state of the week agrees with them. These are the 7,552 and 13,580 km errors V1c5 reports.`, '');
  const bad = new Set(e2.flatMap((d) => d.wrongEpochs.map((w) => Date.parse(w.epoch))));
  const goodRows = continuity.rows.filter((r) => !bad.has(Date.parse(r.epoch))), badRows = continuity.rows.filter((r) => bad.has(Date.parse(r.epoch)));
  o.push(`The combination alone shows it: the full force model carried from the last state of the week before (${continuity.from}) stays within ${(Math.max(...goodRows.map((r) => r.km)) * 1000).toFixed(0)} m of every other 2-hourly state of the week, and is ${badRows.map((r) => `${km(r.km)} km`).join(', ')} from the states at ${badRows.map((r) => r.epoch.slice(5, 16)).join(', ')}.`, '');
  o.push(`The same fault, in ${findings.weeksCompared} combined weeks of LAGEOS-1, LAGEOS-2, Etalon-1 and Etalon-2 compared (${findings.weeks.map((w) => w.week).sort()[0]} to ${findings.weeks.map((w) => w.week).sort().at(-1)}, every center that publishes the week; rule: the combination more than ${findings.rule.wrongKm} km from the centers' median while the centers agree within ${findings.rule.agreeKm * 1000} m):`, '');
  o.push('| Satellite | Week | Wrong state | Coordinate written as zero | Combination from the centers (km) | Spread of the centers (m) | Centers |', '| --- | --- | --- | --- | --: | --: | --: |');
  for (const d of wrong) for (const w of d.wrongEpochs) o.push(`| ${d.satellite} | ${d.week} | ${w.epoch} | ${w.zeroAxes.join(', ') || 'none'} | ${km(w.km)} | ${(d.centerSpreadKm * 1000).toFixed(1)} | ${d.centers} |`);
  o.push('', `Every other week (${clean.length}) agrees with the centers within ${Math.max(...clean.map((w) => w.maxKm * 1000)).toFixed(1)} m.`, '');
  o.push('## Effect on the results', '');
  o.push(`- **V1c5.** Its truth is interpolated through the six nearest states, so a wrong state reaches the samples within 45 min of it; ${rescore.removedSamples.test} test, ${rescore.removedSamples.crossValidation} cross-validation and ${rescore.removedSamples.training} training samples of Etalon-2 lie within 1 h of a wrong state. Without them the result is the same: the selected model ${rescore.published.selected} is still selected by the cross-validation (${rescore.crossValidation.reselected}), and it holds ${rescore.labeled.claimed} of 24 cells realistic with the frozen model and ${Object.values(rescore.corrected)[0].claimed} of 24 refitted without the samples (published: ${rescore.published.claimed} of 24). The SLR MEO cells stay insufficient (fewer than 30 samples); over all samples their mean d²/3 at 1, 6 and 12 h moves from ${rescore.published.slrMeoCellsOfSelected.all.slice(0, 3).map((c) => c.meanD2Over3.toFixed(2)).join(', ')} to ${rescore.labeled.slrMeoCellsOfSelected.all.slice(0, 3).map((c) => c.meanD2Over3.toFixed(2)).join(', ')}. V1c5's results are unchanged; its Etalon-2 samples near those states are wrong truth and are labeled here.`);
  o.push('- **V1c4.** Its test window (issues 2026-09-27 to 10-08, horizons to 72 h) reaches 2026-10-05, 10-06 and 10-08 with the same product, so its SLR MEO cells carry the same wrong truth (the very large SLR MEO means of V1c4\'s README). Its durable run is not on this machine, so those cells are labeled here, not re-scored.');
  o.push('- **G1, B1 (the SDN-AP paper\'s baselines), B2 and the GP-history experiment.** Not affected: their Etalon windows use the weeks of 2025-09 to 2025-10 and 2026-09-06 to 2026-10-03, all of which agree with the centers (G1\'s copy of the 2026 weeks, from CDDIS, has no week 261010).');
  o.push('- **E16 and E2b.** Their windows include 2026-04-10 and 2026-05-25 to 05-29 with Etalon truth from the same combination; any Etalon sample within an hour of those states carries the same fault. They are not re-scored here.', '');
  o.push('## Reproduce', '', '```sh', `node experiments/etalon2-anomaly/compare.mjs ${PRODUCTS.join(' ')} > experiments/etalon2-anomaly/findings.json`, 'node experiments/etalon2-anomaly/rescore-v1c5.mjs experiments/etalon2-anomaly/findings.json > experiments/etalon2-anomaly/rescore-v1c5.json', 'SDN_MODULES_ROOT=<modules checkout> node experiments/etalon2-anomaly/continuity.mjs > experiments/etalon2-anomaly/continuity.json', 'node experiments/etalon2-anomaly/report.mjs', '```', '');
  o.push('The products are the ILRS combination and the analysis centers\' SP3 orbits from the EUROLAS Data Center (https://edc.dgfi.tum.de/pub/slr/products/orbits/TRF/<satellite>/<yyyy>/<yymmdd>/), as V1c5\'s truth fetch and analysis/reference-states downloaded them; ILRS data are not copyrighted (citation requested).', '');
  return o.join('\n');
}

const text = markdown();
if (process.argv.includes('--check')) {
  let bad = 0;
  if (PRODUCTS.every((d) => fs.existsSync(d))) {
    const fresh = JSON.parse(execFileSync(process.execPath, [path.join(here, 'compare.mjs'), ...PRODUCTS], { maxBuffer: 1 << 28 }).toString());
    if (JSON.stringify(fresh) !== JSON.stringify(findings)) { console.error('ETALON check: compare.mjs on the local products differs from findings.json'); bad += 1; } else console.error(`ETALON check: compare.mjs reproduces findings.json (${fresh.weeksCompared} weeks, ${fresh.wrongDays.length} wrong days)`);
  } else { console.error('ETALON check: the local products are absent; the comparison cannot be rerun'); bad += 1; }
  if (fs.readFileSync(path.join(here, 'FINDINGS.md'), 'utf8') !== text) { console.error('ETALON check: FINDINGS.md differs from the regenerated one'); bad += 1; }
  console.error(bad ? 'ETALON check: FAIL' : 'ETALON check: PASS');
  process.exit(bad ? 1 : 0);
}
fs.writeFileSync(path.join(here, 'FINDINGS.md'), text);
console.error('wrote experiments/etalon2-anomaly/FINDINGS.md');
