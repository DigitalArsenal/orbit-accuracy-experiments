// The registered verdicts of AP5.md from stored rows: AP against XP, by pair, and report-only figures for SGP4 and FFM. Statistics only; no physics.
//   node experiments/operator-theory/ap5-verdict.mjs [--md <file>] [--json <file>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { rand, pct, asc, median, round } from './lib/compare.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
// --build b0411: the same statistics on a later AP build's store, report only (AP7.md). Without it, the registered build.
const BUILD = argOf('--build') ?? 'b040', NEW = `/opt/data/sdn-archive/operator-theory/ap/${BUILD}`;
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsIn = (dir) => fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(dir, f)));
const LEADS = ['1', '2', '3', '7'], DRAWS = 10000, LEVEL = 0.975, MAXP95 = Math.log(1.1), MAXFAIL = 0.01;
const lines = [], out = { build: BUILD, reading: BUILD === 'b040' ? 'registered' : 'report only', registered: 'experiments/operator-theory/AP5.md' };
const say = (s) => { lines.push(s); console.log(s); };
const pctOf = (d) => `${(100 * (Math.exp(d) - 1)).toFixed(1)} %`;
const isoWeek = (d) => { const t = new Date(`${d}T00:00:00Z`); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return `${t.getUTCFullYear()}-W${1 + Math.round((t - first) / (7 * 86400000))}`; };

/** AP5.md's statistics: pairs [{ x, y, cluster }], x null for a failed AP. */
function contrast(tag, pairs) {
  const q = pairs.map((p) => ({ d: p.x === null ? 1e9 : Math.log(p.x / p.y), ax: p.x ?? 1e12, by: p.y, cluster: p.cluster }));
  const failed = pairs.filter((p) => p.x === null).length;
  const clusters = [...new Set(q.map((p) => p.cluster))];
  const random = rand(parseInt(crypto.createHash('sha256').update(`AP5|${tag}|${clusters.length}`).digest('hex').slice(0, 8), 16));
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
const show = (k, c) => `- day ${k}: ${pctOf(c.medianD)} [${pctOf(c.interval[0])}, ${pctOf(c.interval[1])}], p95 upper ${pctOf(c.p95Upper)}, failed ${(100 * c.failedShare).toFixed(2)} %, n ${c.n}, weeks ${c.clusters}`;
const rule1 = (c) => c.interval[1] < 0, rule23 = (c) => c.p95Upper < MAXP95 && c.failedShare <= MAXFAIL;
const figures = (values) => { const v = values.filter(Number.isFinite).sort(asc); return v.length ? { n: v.length, median: pct(v, 0.5), p95: pct(v, 0.95) } : { n: 0, median: null, p95: null }; };

const e = (r, arm, k) => r?.arms?.[arm]?.days?.[k]?.e;
function cell(group, ap, other, oneDays, apRows, otherRows, keep = () => true) {
  const byKey = new Map(otherRows.map((r) => [r.key, r]));
  const contrasts = {};
  for (const k of LEADS) {
    const pairs = [];
    for (const r of apRows.filter(keep)) {
      const y = e(byKey.get(r.key), other, k);
      if (!Number.isFinite(y)) continue;
      const x = e(r, ap, k);
      if (!Number.isFinite(x) && r.arms?.[ap]?.error === 'coverage') continue;
      pairs.push({ x: Number.isFinite(x) ? x : null, y, cluster: isoWeek(r.cutoff.slice(0, 10)) });
    }
    contrasts[k] = contrast(`${group}|${ap}|${other}|${k}`, pairs);
  }
  return { contrasts, passes: oneDays.every((k) => rule1(contrasts[k])) && LEADS.every((k) => rule23(contrasts[k])) };
}

const ap1 = rowsIn(path.join(NEW, 'truth')), ap2 = rowsIn(path.join(NEW, 'truth2'));
const cmp1 = rowsIn(path.join(NEW, 'compare-truth')), cmp2 = rowsIn(path.join(NEW, 'compare-truth2'));
const groupsOf = (g) => (r) => r.group === g && !r.error;
const STATEMENTS = [
  { id: 1, label: 'Part T: AP24 beats XP24', ap: 'AP24', other: 'XP24', one: LEADS, rows: [ap1, cmp1], keep: (r) => !r.error },
  { id: 2, label: 'Part N, P: AP24 beats XP24', ap: 'AP24', other: 'XP24', one: LEADS, rows: [ap2, cmp2], keep: groupsOf('P') },
  { id: 3, label: 'Part N, S1: AP72 beats XP72', ap: 'AP72', other: 'XP72', one: ['1', '3'], rows: [ap2, cmp2], keep: groupsOf('S1') },
  { id: 4, label: 'Part N, GN: AP72 beats XP72', ap: 'AP72', other: 'XP72', one: ['1', '3'], rows: [ap2, cmp2], keep: groupsOf('GN') },
];
// --only T: the finished part alone, while the others still run; a partial part is never read out.
const ONLY = argOf('--only');
say(`# AP beside XP, SGP4 and FFM against precise orbits: ${cmp1.length + (ONLY ? 0 : cmp2.length)} windows\n`);
out.statements = {};
for (const s of STATEMENTS.filter((x) => !ONLY || x.id === 1)) {
  const c = cell(`s${s.id}`, s.ap, s.other, s.one, s.rows[0], s.rows[1], s.keep);
  say(`## ${s.id}. ${s.label}: ${c.passes ? 'PASS' : 'FAIL'}\n`);
  for (const k of LEADS) say(show(k, c.contrasts[k]));
  say('');
  out.statements[s.id] = { label: s.label, passes: c.passes, contrasts: c.contrasts };
}

// Report only: every arm's figures, by group and satellite.
const CUTS = [
  { group: 'T', label: 'Low orbit, strong drag, 2025', ap: ap1, cmp: cmp1, keep: (r) => !r.error, arcs: [24] },
  { group: 'P', label: 'Low orbit, strong drag, 2026', ap: ap2, cmp: cmp2, keep: groupsOf('P'), arcs: [24, 72] },
  { group: 'S1', label: 'Low orbit, near 700 km, 2026', ap: ap2, cmp: cmp2, keep: groupsOf('S1'), arcs: [24, 72] },
  { group: 'GN', label: 'Medium Earth orbit, 2026', ap: ap2, cmp: cmp2, keep: groupsOf('GN'), arcs: [24, 72] },
];
out.cells = [];
for (const cut of CUTS.filter((x) => !ONLY || x.group === ONLY)) {
  const inCut = cut.ap.filter(cut.keep), byKey = new Map(cut.cmp.map((r) => [r.key, r]));
  const names = ['all', ...new Set(inCut.map((r) => r.name))];
  say(`## ${cut.label}: ${inCut.length} windows\n`);
  for (const arc of cut.arcs) {
    say(`### Fit ${arc} h, median km (95th)\n`);
    say('| Arm | Day 1 | Day 2 | Day 3 | Day 7 |');
    say('|---|---:|---:|---:|---:|');
    for (const satellite of names) {
      const rows = inCut.filter((r) => satellite === 'all' || r.name === satellite);
      const arms = {};
      for (const [label, read] of [['AP', (r, k) => e(r, `AP${arc}`, k)], ['XP', (r, k) => e(byKey.get(r.key), `XP${arc}`, k)], ['SGP4', (r, k) => e(byKey.get(r.key), `S${arc}`, k)], ['FFM', (r, k) => e(byKey.get(r.key), `F${arc}`, k)]]) {
        arms[label] = Object.fromEntries(LEADS.map((k) => [k, figures(rows.map((r) => read(r, k)))]));
        if (satellite === 'all') say(`| ${label} | ${LEADS.map((k) => (arms[label][k].n ? `${round(arms[label][k].median, 3)} (${round(arms[label][k].p95, 2)})` : '-')).join(' | ')} |`);
      }
      out.cells.push({ group: cut.group, label: cut.label, satellite, fitHours: arc, windows: rows.length, arms });
    }
    say('');
  }
}
if (argOf('--md')) fs.writeFileSync(argOf('--md'), `${lines.join('\n')}\n`);
if (argOf('--json')) fs.writeFileSync(argOf('--json'), `${JSON.stringify(out, null, 1)}\n`);
