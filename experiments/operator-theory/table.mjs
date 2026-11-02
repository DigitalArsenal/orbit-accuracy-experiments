// The registered tables (PLAN.md, Rules) from score.mjs's rows and arms.mjs's in-file rows. Statistics only; no physics.
//   node experiments/operator-theory/table.mjs --rows <score rows> --root /opt/data/sdn-archive/operator-theory --out <json> [--md <file>]
import fs from 'node:fs';
import path from 'node:path';
import { SEED, MAX_FAILED, QUIET_KM, BINS, PRIMARY, binOf, rand, pct, asc, median, round, compare } from './lib/compare.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const ROOT = args.root ?? '/opt/data/sdn-archive/operator-theory';
const rows = fs.readFileSync(args.rows, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const out = { registered: 'experiments/operator-theory/PLAN.md', pairs: rows.length, cycles: [...new Set(rows.flatMap((r) => [r.older, r.newer]))].sort(), forward: {}, inFile: {} };
const random = rand(SEED);
for (const source of [...new Set(rows.map((r) => r.source))].sort()) {
  out.forward[source] = {};
  for (const [center] of BINS) {
    const cell = rows.filter((r) => r.source === source && binOf(r.leadHours) === center).map((r) => ({ ...r, day: r.olderStart.slice(0, 10) }));
    if (!cell.length) continue;
    const names = [...new Set(cell.flatMap((r) => Object.keys(r.arms)))].sort();
    const arms = {};
    for (const name of names) {
      const held = cell.filter((r) => name in r.arms);
      const km = held.filter((r) => Number.isFinite(r.arms[name].km)).map((r) => r.arms[name].km).sort(asc);
      const failed = held.length - km.length;
      arms[name] = { n: km.length, failed, failedShare: round(failed / held.length), median: round(pct(km, 0.5)), p95: round(pct(km, 0.95)), medianR: round(median(held.filter((r) => Number.isFinite(r.arms[name].r)).map((r) => r.arms[name].r))), medianT: round(median(held.filter((r) => Number.isFinite(r.arms[name].t)).map((r) => r.arms[name].t))), medianN: round(median(held.filter((r) => Number.isFinite(r.arms[name].n)).map((r) => r.arms[name].n))) };
    }
    const diff = (a, b, set = cell) => set.filter((r) => Number.isFinite(r.arms[a]?.km) && Number.isFinite(r.arms[b]?.km)).map((r) => ({ d: r.arms[a].km - r.arms[b].km, object: r.norad, day: r.day }));
    const ours = names.filter((n) => n !== 'operator');
    const eligible = ours.filter((n) => arms[n].failedShare <= MAX_FAILED && arms[n].n);
    const best = [...eligible].sort((a, b) => arms[a].median - arms[b].median)[0] ?? null;
    const against = {};
    const closest = [];
    if (best) for (const n of eligible) {
      if (n === best) { closest.push(n); continue; }
      const c = compare(diff(best, n), random);
      against[n] = c;
      if (!c.interval || c.interval[1] >= 0) closest.push(n);
    }
    const versusOperator = {};
    if (names.includes('operator')) for (const n of ours) {
      const c = compare(diff(n, 'operator'), random);
      versusOperator[n] = { ...c, reading: !c.interval ? 'report only' : c.interval[1] < 0 ? 'closer than the operator forecast' : c.interval[0] > 0 ? 'farther than the operator forecast' : 'not separated' };
    }
    // Report only: pairs where the operator's own forecast stayed within 5 km, a stand-in for no unplanned maneuver.
    const quiet = cell.filter((r) => r.arms.operator?.km <= QUIET_KM);
    const quietMedians = Object.fromEntries(names.map((n) => [n, round(median(quiet.filter((r) => Number.isFinite(r.arms[n]?.km)).map((r) => r.arms[n].km)))]));
    out.forward[source][center] = { primary: PRIMARY.has(center), pairs: cell.length, arms, best, closest, bestAgainst: against, versusOperator, quietPairs: quiet.length, quietMedians };
  }
}
// In-file reproduction by cycle (identification): the median over files of each arm's error in each bin, and each FFM arm's drag against the file's stated value.
for (const d of out.cycles) {
  const folder = path.join(ROOT, d);
  if (!fs.existsSync(folder)) continue;
  for (const f of fs.readdirSync(folder).filter((x) => x.startsWith('arms-') && x.endsWith('.jsonl'))) {
    const source = f.slice(5, -6);
    const files = fs.readFileSync(path.join(folder, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const cycle = {};
    for (const name of [...new Set(files.flatMap((r) => Object.keys(r.arms ?? {})))].sort()) {
      const held = files.filter((r) => r.arms?.[name]?.bins);
      const bins = {};
      for (const b of [...new Set(held.flatMap((r) => Object.keys(r.arms[name].bins)))]) bins[b] = round(median(held.filter((r) => r.arms[name].bins[b]).map((r) => r.arms[name].bins[b].km)));
      const ratios = held.filter((r) => r.meta?.statedB && Number.isFinite(r.arms[name].b)).map((r) => r.arms[name].b / r.meta.statedB);
      cycle[name] = { files: held.length, bins, ...(ratios.length ? { bOverStated: round(median(ratios)) } : {}) };
    }
    (out.inFile[source] ??= {})[d] = cycle;
  }
}
fs.writeFileSync(args.out, JSON.stringify(out, null, 1));
const lines = [];
for (const [source, bins] of Object.entries(out.forward)) {
  lines.push(`\n## ${source}\n`);
  for (const [center, c] of Object.entries(bins)) {
    lines.push(`### Lead ${center} h${c.primary ? ' (primary)' : ''}: ${c.pairs} pairs; best ${c.best}; not separated from it: ${c.closest.join(', ') || 'none'}`);
    lines.push('| Fit | n | failed | median km | 95th km | vs operator (median difference, 95 % interval) | reading |');
    lines.push('|---|---:|---:|---:|---:|---|---|');
    for (const [name, a] of Object.entries(c.arms)) {
      const v = c.versusOperator[name];
      lines.push(`| ${name} | ${a.n} | ${a.failed} | ${a.median} | ${a.p95} | ${v ? `${v.median} ${v.interval ? `[${v.interval[0]}, ${v.interval[1]}]` : ''}` : ''} | ${v?.reading ?? ''} |`);
    }
    lines.push('');
  }
}
if (args.md) fs.writeFileSync(args.md, lines.join('\n'));
console.log(lines.join('\n'));
