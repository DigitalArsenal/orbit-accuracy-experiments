// The registered tables (PLAN.md, Rules) from score.mjs's rows and arms.mjs's in-file rows. Statistics only; no physics.
//   node experiments/operator-theory/table.mjs --rows <score rows> --root /opt/data/sdn-archive/operator-theory --out <json> [--md <file>]
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const ROOT = args.root ?? '/opt/data/sdn-archive/operator-theory';
const REPS = 2000, SEED = 20261101, LEVEL = 0.975;
const MIN = { pairs: 30, objects: 8, days: 3 };
const MAX_FAILED = 0.10, QUIET_KM = 5;
const BINS = [[12, 6], [24, 6], [36, 6], [48, 6], [60, 6], [72, 6], [96, 12], [120, 12], [144, 12], [168, 12]];
const PRIMARY = new Set([24, 48, 72, 168]);
const binOf = (h) => { for (const [c, w] of BINS) if (h >= c - w && h < c + w) return c; return null; };
const rand = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const pct = (sorted, q) => { if (!sorted.length) return null; const x = (sorted.length - 1) * q, lo = Math.floor(x), hi = Math.ceil(x); return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo); };
const asc = (a, b) => a - b;
const median = (v) => pct([...v].sort(asc), 0.5);
const round = (x, n = 3) => (x === null || x === undefined ? null : Number(x.toFixed(n)));

/** The median of d (paired differences) with a two-way bootstrap interval: objects and start days drawn independently, a pair weighted by the product of the counts. */
function compare(pairs, random) {
  const d = [...pairs].sort((a, b) => a.d - b.d);
  const objects = [...new Set(d.map((p) => p.object))], days = [...new Set(d.map((p) => p.day))];
  const estimate = median(d.map((p) => p.d));
  if (d.length < MIN.pairs || objects.length < MIN.objects || days.length < MIN.days) return { n: d.length, objects: objects.length, days: days.length, median: round(estimate), interval: null };
  const iObject = new Map(objects.map((o, i) => [o, i])), iDay = new Map(days.map((o, i) => [o, i]));
  const po = d.map((p) => iObject.get(p.object)), pd = d.map((p) => iDay.get(p.day));
  const out = [];
  for (let r = 0; r < REPS; r += 1) {
    const wo = new Float64Array(objects.length), wd = new Float64Array(days.length);
    for (let i = 0; i < objects.length; i += 1) wo[Math.floor(random() * objects.length)] += 1;
    for (let i = 0; i < days.length; i += 1) wd[Math.floor(random() * days.length)] += 1;
    let total = 0;
    for (let i = 0; i < d.length; i += 1) total += wo[po[i]] * wd[pd[i]];
    if (!total) continue;
    let run = 0;
    for (let i = 0; i < d.length; i += 1) { run += wo[po[i]] * wd[pd[i]]; if (run >= total / 2) { out.push(d[i].d); break; } }
  }
  out.sort(asc);
  return { n: d.length, objects: objects.length, days: days.length, median: round(estimate), interval: [round(pct(out, 1 - LEVEL)), round(pct(out, LEVEL))] };
}

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
