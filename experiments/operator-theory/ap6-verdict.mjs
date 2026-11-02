// The registered verdicts of AP6.md from stored rows, with every arm's figures by group and satellite. Statistics only; no physics.
//   node experiments/operator-theory/ap6-verdict.mjs [--md <file>] [--json <file>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { rand, pct, asc, median, round } from './lib/compare.mjs';
import { GROUPS } from './lib/regimes.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const NEW = '/opt/data/sdn-archive/operator-theory/ap/b040/regimes';
const rows = fs.readdirSync(NEW).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(NEW, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const LEADS = ['1', '2', '3', '7'], DRAWS = 10000, LEVEL = 0.975, MAXP95 = Math.log(1.1), MAXFAIL = 0.01;
const lines = [], out = { registered: 'experiments/operator-theory/AP6.md' };
const say = (s) => { lines.push(s); console.log(s); };
const pctOf = (d) => `${(100 * (Math.exp(d) - 1)).toFixed(1)} %`;
const isoWeek = (d) => { const t = new Date(`${d}T00:00:00Z`); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return `${t.getUTCFullYear()}-W${1 + Math.round((t - first) / (7 * 86400000))}`; };
function contrast(tag, pairs) {
  const q = pairs.map((p) => ({ d: p.x === null ? 1e9 : Math.log(p.x / p.y), ax: p.x ?? 1e12, by: p.y, cluster: p.cluster }));
  const failed = pairs.filter((p) => p.x === null).length;
  const clusters = [...new Set(q.map((p) => p.cluster))];
  const random = rand(parseInt(crypto.createHash('sha256').update(`AP6|${tag}|${clusters.length}`).digest('hex').slice(0, 8), 16));
  const by = new Map(clusters.map((c) => [c, q.filter((p) => p.cluster === c)])), meds = [], p95s = [];
  for (let t = 0; t < DRAWS; t += 1) {
    const draw = [];
    for (let i = 0; i < clusters.length; i += 1) draw.push(...by.get(clusters[Math.floor(random() * clusters.length)]));
    meds.push(median(draw.map((p) => p.d)));
    p95s.push(Math.log(pct(draw.map((p) => p.ax).sort(asc), 0.95) / pct(draw.map((p) => p.by).sort(asc), 0.95)));
  }
  meds.sort(asc); p95s.sort(asc);
  return { n: q.length, clusters: clusters.length, failedShare: q.length ? failed / q.length : 1, medianD: median(q.map((p) => p.d)), interval: [pct(meds, 1 - LEVEL), pct(meds, LEVEL)], p95Upper: pct(p95s, LEVEL) };
}
const e = (r, arm, k) => r?.arms?.[arm]?.days?.[k]?.e;
const figures = (values) => { const v = values.filter(Number.isFinite).sort(asc); return v.length ? { n: v.length, median: pct(v, 0.5), p95: pct(v, 0.95) } : { n: 0, median: null, p95: null }; };
const live = rows.filter((r) => !r.error);
say(`# AP beside XP, SGP4 and FFM against precise orbits, the other regimes: ${rows.length} windows, ${rows.length - live.length} left out for no truth or no weather\n`);
out.statements = {};
for (const [id, group] of [[1, 'LS'], [2, 'DO'], [3, 'GD']]) {
  const inGroup = live.filter((r) => r.group === group);
  const contrasts = {};
  for (const k of LEADS) {
    const pairs = [];
    for (const r of inGroup) {
      const y = e(r, 'XP72', k);
      if (!Number.isFinite(y)) continue;
      const x = e(r, 'AP72', k);
      if (!Number.isFinite(x) && r.arms?.AP72?.error === 'coverage') continue;
      pairs.push({ x: Number.isFinite(x) ? x : null, y, cluster: isoWeek(r.cutoff.slice(0, 10)) });
    }
    contrasts[k] = contrast(`${group}|${k}`, pairs);
  }
  const passes = ['1', '3'].every((k) => contrasts[k].interval[1] < 0) && LEADS.every((k) => contrasts[k].p95Upper < MAXP95 && contrasts[k].failedShare <= MAXFAIL);
  say(`## ${id}. ${GROUPS[group].label}: AP72 beats XP72: ${passes ? 'PASS' : 'FAIL'}\n`);
  for (const k of LEADS) say(`- day ${k}: ${pctOf(contrasts[k].medianD)} [${pctOf(contrasts[k].interval[0])}, ${pctOf(contrasts[k].interval[1])}], p95 upper ${pctOf(contrasts[k].p95Upper)}, failed ${(100 * contrasts[k].failedShare).toFixed(2)} %, n ${contrasts[k].n}, weeks ${contrasts[k].clusters}`);
  say('');
  out.statements[id] = { group, label: GROUPS[group].label, passes, contrasts };
}
out.cells = [];
for (const group of Object.keys(GROUPS)) {
  const inGroup = live.filter((r) => r.group === group);
  const arcs = [...new Set(inGroup.flatMap((r) => Object.keys(r.arms).map((a) => Number(a.replace(/^\D+/, '')))))].sort((a, b) => a - b);
  say(`## ${GROUPS[group].label}: ${inGroup.length} windows, ${new Set(inGroup.map((r) => r.name)).size} satellites\n`);
  for (const arc of arcs) {
    say(`### Fit ${arc} h, median km (95th)\n`);
    say('| Arm | Day 1 | Day 2 | Day 3 | Day 7 |');
    say('|---|---:|---:|---:|---:|');
    for (const satellite of ['all', ...new Set(inGroup.map((r) => r.name))]) {
      const list = inGroup.filter((r) => satellite === 'all' || r.name === satellite);
      const arms = {};
      for (const [label, code] of [['AP', 'AP'], ['XP', 'XP'], ['SGP4', 'S'], ['FFM', 'F']]) {
        arms[label] = Object.fromEntries(LEADS.map((k) => [k, figures(list.map((r) => e(r, `${code}${arc}`, k)))]));
        if (satellite === 'all') say(`| ${label} | ${LEADS.map((k) => (arms[label][k].n ? `${round(arms[label][k].median, 3)} (${round(arms[label][k].p95, 2)})` : '-')).join(' | ')} |`);
      }
      out.cells.push({ group, label: GROUPS[group].label, provider: GROUPS[group].provider, satellite, fitHours: arc, windows: list.length, arms });
    }
    say('');
  }
}
if (argOf('--md')) fs.writeFileSync(argOf('--md'), `${lines.join('\n')}\n`);
if (argOf('--json')) fs.writeFileSync(argOf('--json'), `${JSON.stringify(out, null, 1)}\n`);
