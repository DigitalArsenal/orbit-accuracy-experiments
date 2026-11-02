// The registered table of AP3.md, from ap-ffmfit.mjs's rows and the stored rows of AP.md's Parts L and H and of CHEAPER.md, by pair. Statistics only; no physics.
//   AP_ROOT=<dir> node experiments/operator-theory/ap3-verdict.mjs [--md <file>] [--json <file>]
import fs from 'node:fs';
import path from 'node:path';
import { SEED, MAX_FAILED, binOf, rand, pct, asc, median, round, compare } from './lib/compare.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const ROOT = '/opt/data/sdn-archive/operator-theory', AP = process.env.AP_ROOT ?? path.join(ROOT, 'ap');
const jsonl = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsIn = (dir) => fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(dir, f)));
const pairOf = (r) => `${r.source}|${r.norad}|${r.olderStart}|${r.newerStart}`;
const NAV = /^(beidou|compass|galileo|glonass|gps|irnss|qzs)/;
const groupOf = (r) => (r.source.endsWith('-leo') ? 'low' : NAV.test(r.object) ? 'navigation' : 'geodetic');

const laser = rowsIn(path.join(AP, 'laser', 'forward'));
const apf = new Map(rowsIn(path.join(AP, 'apf')).map((r) => [pairOf(r), r]));
const cheaper = new Map(rowsIn(path.join(ROOT, 'cheaper', 'forward')).map((r) => [pairOf(r), r]));
const km = (r, a) => { const k = pairOf(r); return r.arms[a]?.km ?? apf.get(k)?.arms[a]?.km ?? cheaper.get(k)?.arms[a]?.km; };
const random = rand(SEED);
const out = { registered: 'experiments/operator-theory/AP3.md', pairs: laser.length, withRow: laser.filter((r) => apf.has(pairOf(r))).length, groups: {}, claims: {} };
const lines = [`# AP fitted to FFM's forecast: ${laser.length} pairs, ${out.withRow} scored\n`];
const LEADS = [24, 72, 120, 168], CLAIM = [120, 168];
for (const group of ['low', 'navigation', 'geodetic']) {
  const inGroup = laser.filter((r) => groupOf(r) === group).map((r) => ({ ...r, day: r.olderStart.slice(0, 10) }));
  const [cheap, full] = group === 'low' ? ['F-M40@48', 'F-full@48'] : ['F-H20@48', 'F-Hfull@48'];
  const arms = ['APF', 'A-AP@72', 'A-AP@48', 'A-XP@72', cheap, full];
  const report = (out.groups[group] = { pairs: inGroup.length, objects: new Set(inGroup.map((r) => r.norad)).size, startDays: new Set(inGroup.map((r) => r.day)).size, leads: {} });
  lines.push(`## ${group}: ${report.pairs} pairs, ${report.objects} objects, ${report.startDays} start days\n`);
  for (const lead of LEADS) {
    const cell = inGroup.filter((r) => binOf(r.leadHours) === lead);
    if (!cell.length) continue;
    const diff = (a, b) => compare(cell.filter((r) => Number.isFinite(km(r, a)) && Number.isFinite(km(r, b))).map((r) => ({ d: km(r, a) - km(r, b), object: r.norad, day: r.day })), random);
    const row = (report.leads[lead] = { pairs: cell.length, arms: {} });
    lines.push(`### Lead ${lead} h: ${cell.length} pairs\n`);
    lines.push('| Arm | n | failed | median km | 95th km | APF less it: median, interval |');
    lines.push('|---|---:|---:|---:|---:|---|');
    for (const a of arms) {
      const v = cell.map((r) => km(r, a)).filter(Number.isFinite).sort(asc);
      const c = a === 'APF' ? null : diff('APF', a);
      row.arms[a] = { n: v.length, failedShare: round((cell.length - v.length) / cell.length), median: round(pct(v, 0.5), 4), p95: round(pct(v, 0.95), 3), apfLess: c };
      lines.push(`| ${a} | ${v.length} | ${row.arms[a].failedShare} | ${row.arms[a].median} | ${row.arms[a].p95} | ${c ? `${c.median} ${c.interval ? `[${c.interval[0]}, ${c.interval[1]}]` : '(report only)'}` : ''} |`);
    }
    lines.push('');
  }
  if (group !== 'geodetic') {
    const cells = CLAIM.map((l) => report.leads[l]?.arms);
    const eligible = cells.every((c) => c?.['A-AP@72']?.apfLess?.interval);
    const pass = eligible && cells.every((c) => c['A-AP@72'].apfLess.interval[1] < 0 && c.APF.failedShare <= MAX_FAILED);
    out.claims[group] = { eligible, pass };
    lines.push(`**${group}, APF beats AP on the operator's 72 h at 120 h and 168 h:** ${eligible ? (pass ? 'PASS' : 'fail') : 'report only'}\n`);
  }
}
const cost = {};
for (const r of apf.values()) {
  const g = (cost[groupOf(r)] ??= new Map());
  g.set(`${r.source}|${r.norad}|${r.olderStart}`, { ffmMs: r.ffmMs, fitMs: r.cost.APF?.fitMs, rmsKm: r.cost.APF?.rmsKm });
}
lines.push('## Cost per file, medians, under load\n');
lines.push('| Group | files | FFM over 180 h, ms | AP fit, ms | AP fit RMS, km |');
lines.push('|---|---:|---:|---:|---:|');
out.cost = {};
for (const [g, m] of Object.entries(cost)) {
  const v = [...m.values()], of = (k) => median(v.map((x) => x[k]).filter(Number.isFinite));
  out.cost[g] = { files: v.length, ffmMs: round(of('ffmMs'), 0), fitMs: round(of('fitMs'), 0), rmsKm: round(of('rmsKm'), 4) };
  lines.push(`| ${g} | ${v.length} | ${out.cost[g].ffmMs} | ${out.cost[g].fitMs} | ${out.cost[g].rmsKm} |`);
}
if (args.json) fs.writeFileSync(args.json, JSON.stringify(out, null, 1));
if (args.md) fs.writeFileSync(args.md, lines.join('\n'));
console.log(lines.join('\n'));
