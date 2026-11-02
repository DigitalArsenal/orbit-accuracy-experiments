// The registered table of CHEAPER.md from score.mjs's rows and arms.mjs's files. Statistics only; no physics.
//   node experiments/operator-theory/cheaper.mjs --root /opt/data/sdn-archive/operator-theory/cheaper --out <json> [--md <file>]
import fs from 'node:fs';
import path from 'node:path';
import { SEED, MAX_FAILED, BINS, binOf, rand, pct, asc, median, round, compare } from './lib/compare.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const ROOT = args.root ?? '/opt/data/sdn-archive/operator-theory/cheaper';
const CONTROL = 'X0@48';
const LEADS = [72, 168];
const PLAN = {
  low: { full: 'F-full@48', claims: { 'F-M40@48': { 72: 0.02, 168: 0.1 }, 'F-M20@48': { 72: 0.05, 168: 0.5 } }, report: ['F-old@48'] },
  navigation: { full: 'F-Hfull@48', claims: { 'F-H20@48': { 72: 0.005, 168: 0.02 } }, report: [] },
  geodetic: { full: 'F-Hfull@48', claims: { 'F-H20@48': { 72: 0.01, 168: 0.05 } }, report: [] },
};
const NAV = /^(beidou|compass|galileo|glonass|gps|irnss|qzs)/;
const groupOf = (source, object) => (source.endsWith('-leo') ? 'low' : NAV.test(object) ? 'navigation' : 'geodetic');
const jsonl = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

const rows = fs.readdirSync(path.join(ROOT, 'forward')).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(ROOT, 'forward', f)));
const random = rand(SEED);
const km = (r, a) => r.arms[a]?.km;
const out = { registered: 'experiments/operator-theory/CHEAPER.md', pairs: rows.length, groups: {}, verdicts: [] };
const lines = [];

for (const [group, plan] of Object.entries(PLAN)) {
  const inGroup = rows.filter((r) => groupOf(r.source, r.object) === group).map((r) => ({ ...r, day: r.olderStart.slice(0, 10) }));
  const names = [plan.full, ...Object.keys(plan.claims), ...plan.report, CONTROL];
  const report = (out.groups[group] = { pairs: inGroup.length, objects: new Set(inGroup.map((r) => r.norad)).size, startDays: new Set(inGroup.map((r) => r.day)).size, bins: {} });
  lines.push(`\n## ${group}: ${report.pairs} pairs, ${report.objects} objects, ${report.startDays} start days\n`);
  for (const [center] of BINS) {
    const cell = inGroup.filter((r) => binOf(r.leadHours) === center);
    if (!cell.length) continue;
    const diff = (a, b) => cell.filter((r) => Number.isFinite(km(r, a)) && Number.isFinite(km(r, b))).map((r) => ({ d: km(r, a) - km(r, b), object: r.norad, day: r.day }));
    const arms = {};
    for (const name of names) {
      const v = cell.map((r) => km(r, name)).filter(Number.isFinite).sort(asc);
      arms[name] = { n: v.length, failedShare: round((cell.length - v.length) / cell.length), median: round(pct(v, 0.5), 4), p95: round(pct(v, 0.95), 3),
        medianT: round(median(cell.map((r) => r.arms[name]?.t).filter(Number.isFinite)), 4) };
      if (name !== plan.full) arms[name].lessFull = compare(diff(name, plan.full), random);
      if (name !== CONTROL) arms[name].lessControl = compare(diff(name, CONTROL), random);
    }
    report.bins[center] = { pairs: cell.length, arms };
    lines.push(`### Lead ${center} h: ${cell.length} pairs\n`);
    lines.push('| Arm | n | failed | median km | 95th km | less full FFM: median, interval | less XP: median, interval |');
    lines.push('|---|---:|---:|---:|---:|---|---|');
    const iv = (c) => (c ? `${c.median} ${c.interval ? `[${c.interval[0]}, ${c.interval[1]}]` : '(report only)'}` : '');
    for (const name of names) lines.push(`| ${name} | ${arms[name].n} | ${arms[name].failedShare} | ${arms[name].median} | ${arms[name].p95} | ${iv(arms[name].lessFull)} | ${iv(arms[name].lessControl)} |`);
    lines.push('');
    if (LEADS.includes(center)) {
      const byCenter = {};
      for (const source of [...new Set(cell.map((r) => r.source))].sort()) {
        const set = cell.filter((r) => r.source === source);
        byCenter[source] = Object.fromEntries(names.map((n) => [n, round(median(set.map((r) => km(r, n)).filter(Number.isFinite)), 4)]));
        byCenter[source].pairs = set.length;
      }
      report.bins[center].byCenter = byCenter;
      lines.push(`| Center | pairs | ${names.join(' | ')} |`);
      lines.push(`|---|---:|${names.map(() => '---:').join('|')}|`);
      for (const [source, m] of Object.entries(byCenter)) lines.push(`| ${source} | ${m.pairs} | ${names.map((n) => m[n]).join(' | ')} |`);
      lines.push('');
    }
  }
  for (const [arm, margins] of Object.entries(plan.claims)) {
    const cells = LEADS.map((lead) => ({ lead, a: report.bins[lead]?.arms[arm], margin: margins[lead] }));
    const eligible = cells.every((c) => c.a && c.a.lessControl?.interval && c.a.lessFull?.interval);
    const failedOk = cells.every((c) => c.a && c.a.failedShare <= MAX_FAILED);
    const beatsXp = eligible && cells.every((c) => c.a.lessControl.interval[1] < 0);
    const keepsFull = eligible && cells.every((c) => c.a.lessFull.interval[1] <= c.margin);
    const verdict = { group, arm, eligible, failedOk, beatsXp, keepsFull, claim: eligible && failedOk && beatsXp && keepsFull,
      cells: cells.map((c) => ({ lead: c.lead, margin: c.margin, lessFull: c.a?.lessFull ?? null, lessControl: c.a?.lessControl ?? null })) };
    out.verdicts.push(verdict);
    lines.push(`**${arm} on ${group}:** ${!eligible ? 'report only, below the minimum counts' : `beats plain XP: ${beatsXp ? 'yes' : 'no'}; keeps full FFM: ${keepsFull ? 'yes' : 'no'}; claim: ${verdict.claim ? 'yes' : 'no'}`}\n`);
  }
  if (group === 'low') {
    const cell = inGroup.filter((r) => binOf(r.leadHours) === 168);
    const c = compare(cell.filter((r) => Number.isFinite(km(r, 'F-old@48')) && Number.isFinite(km(r, 'F-M20@48'))).map((r) => ({ d: km(r, 'F-old@48') - km(r, 'F-M20@48'), object: r.norad, day: r.day })), random);
    out.integratorControl = { lessM20: c, lost: !!c.interval && c.interval[0] > 0 };
    lines.push(`**F-old@48 must lose at 168 h:** F-old less F-M20 ${c.median} ${c.interval ? `[${c.interval[0]}, ${c.interval[1]}]` : '(report only)'}: ${out.integratorControl.lost ? 'it lost, the integrator explanation holds' : 'it did not lose: no setting here is recommended'}\n`);
  }
}

// Cost, per arm and group, within this run under load.
const cost = {};
for (const d of fs.readdirSync(ROOT).filter((x) => /^c\d{8}T\d{4}$/.test(x))) {
  const folder = path.join(ROOT, d);
  for (const f of fs.readdirSync(folder).filter((x) => x.startsWith('arms-') && x.endsWith('.jsonl'))) {
    for (const row of jsonl(path.join(folder, f))) {
      if (!row.source || !row.arms) continue;
      const group = groupOf(row.source, row.object);
      for (const [name, a] of Object.entries(row.arms)) {
        const c = ((cost[group] ??= {})[name] ??= { fit: [], fly: [], ok: 0, total: 0 });
        c.total += 1; if (a.ok) c.ok += 1;
        if (Number.isFinite(a.fitMs)) c.fit.push(a.fitMs);
        if (Number.isFinite(a.flyMs)) c.fly.push(a.flyMs);
      }
    }
  }
}
out.cost = {};
lines.push('\n## Fit and flight per file, milliseconds, median, under load\n');
lines.push('| Group | Arm | files | failed | fit | fly |');
lines.push('|---|---|---:|---:|---:|---:|');
for (const [group, arms] of Object.entries(cost)) for (const [name, c] of Object.entries(arms)) {
  const row = { files: c.total, failed: c.total - c.ok, fitMs: round(median(c.fit), 0), flyMs: round(median(c.fly), 0) };
  (out.cost[group] ??= {})[name] = row;
  lines.push(`| ${group} | ${name} | ${row.files} | ${row.failed} | ${row.fitMs} | ${row.flyMs} |`);
}
if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 1));
if (args.md) fs.writeFileSync(args.md, lines.join('\n'));
console.log(lines.join('\n'));
