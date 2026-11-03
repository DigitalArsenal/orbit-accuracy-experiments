// FSA false-positive rates on the scored rows (PLAN.md, False-positive rate and power, after the run): XP2's computation. For each
// registered statement, ISO weeks are drawn with replacement to the span's own week count (every window of a drawn week; each drawn week
// its own cluster); the null of rule 1 scales the arm's errors at one lead so the simulated span's median d is 0, the null of rule 2 so
// its p95 ratio is 1.10, the other leads as scored; the statement is evaluated with the same bootstrap at 97.5 % and 95 %; the rate is the
// percent of simulated spans that pass; the whole statement's rate is the largest over leads and nulls (the least favorable null). Single-lead
// rule-1 rates are printed per lead. Statistics only; nothing here changes a verdict.
//   node experiments/ffm-short-arc/fpr.mjs --shard k/n --out <file> [--spans S --draws D]   one shard's counts
//   node experiments/ffm-short-arc/fpr.mjs --merge <file...>                               results/ffm-short-arc/false-positive.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, results, args, frozen } from './common.mjs';
import { storedRows } from './table.mjs';

frozen();
const LEADS = config.scoring.leadDays.map(String);
const LN110 = Math.log(1.10);
const LEVELS = [0.975, 0.95];

function quantileSorted(a, q) { const n = a.length; const p = q * (n - 1), lo = Math.floor(p), f = p - lo; if (f === 0 || lo + 1 >= n) return a[lo]; return a[lo] + f * (a[lo + 1] - a[lo]); }
const sortNum = (a) => a.sort((x, y) => x - y);
function rng(label) { const d = crypto.createHash('sha256').update(label).digest(); let s0 = d.readBigUInt64BE(0), s1 = d.readBigUInt64BE(8); if (s0 === 0n) s0 = 1n; if (s1 === 0n) s1 = 2n;
  return () => { let x = s0, y = s1; s0 = y; x ^= (x << 23n) & 0xFFFFFFFFFFFFFFFFn; x ^= x >> 17n; x ^= y ^ (y >> 26n); s1 = x; return Number(((x + y) & 0xFFFFFFFFFFFFFFFFn) >> 11n) / 9007199254740992; }; }
const armOf = (row, name) => (name === 'P' ? row.P : row.arms?.[name]);

/** The windows of a statement's group and spans as {week, e: {arm: {L: e}, ref: {L: e}}, entered}; a failed arm is +Infinity. */
function windowsOf(rows, group, spans, arm, ref) {
  const out = [];
  for (const row of rows) {
    if (row.group !== group || !spans.includes(row.span) || row.error || row.excluded || row.O?.excluded) continue;
    const a = armOf(row, arm), r = armOf(row, ref);
    if (!r || r.notRun || !a || a.notRun) continue;
    const e = (x, L) => (!x.ok || !x.days?.[L] ? Infinity : x.days[L].rmsKm);
    out.push({ week: row.isoWeek, entered: new Set((row.entered ?? []).map(String)), A: Object.fromEntries(LEADS.map((L) => [L, e(a, L)])), R: Object.fromEntries(LEADS.map((L) => [L, e(r, L)])) });
  }
  return out;
}
/** One contrast on a span (array of clusters of windows) with a per-lead scale on the arm: per lead the bounds at every level. */
function evaluate(clusters, scale, draws, rand) {
  const perLead = {};
  for (const L of LEADS) {
    const cl = []; let N = 0;
    for (const c of clusters) { const pairs = []; for (const w of c) { if (!w.entered.has(L) || !Number.isFinite(w.R[L]) && w.R[L] !== Infinity) continue; pairs.push([(scale[L] ?? 1) * w.A[L], w.R[L]]); } if (pairs.length) { cl.push(pairs); N += pairs.length; } }
    if (N < 10 || cl.length < 2) { perLead[L] = null; continue; }
    const stat = (list) => { const D = [], EA = [], ER = []; let fails = 0; for (const pairs of list) for (const [ea, er] of pairs) { if (ea === Infinity) fails += 1; D.push(ea === Infinity ? Infinity : er === Infinity ? -Infinity : Math.log(ea / er)); EA.push(ea); ER.push(er); } sortNum(D); sortNum(EA); sortNum(ER); const m = quantileSorted(D, 0.5), lr = Math.log(quantileSorted(EA, 0.95) / quantileSorted(ER, 0.95)); return [Number.isNaN(m) ? Infinity : m, Number.isNaN(lr) ? Infinity : lr, fails, D.length]; };
    const point = stat(cl);
    const meds = new Float64Array(draws), lrs = new Float64Array(draws), m = cl.length;
    for (let d = 0; d < draws; d += 1) { const pick = []; for (let i = 0; i < m; i += 1) pick.push(cl[Math.floor(rand() * m)]); const s = stat(pick); meds[d] = s[0]; lrs[d] = s[1]; }
    sortNum(meds); sortNum(lrs);
    const ub = {}, lb = {};
    for (const lv of LEVELS) { const q = 1 - (1 - lv) / 2; ub[lv] = { med: quantileSorted(meds, q), lr: quantileSorted(lrs, q) }; lb[lv] = { med: quantileSorted(meds, 1 - q) }; }
    perLead[L] = { N, med: point[0], lr: point[1], fails: point[2], ub, lb };
  }
  return perLead;
}
const forms = {
  xm: (ev, lv, leads) => leads.every((L) => ev[L] && ev[L].ub[lv].med < 0 && ev[L].ub[lv].lr < LN110 && ev[L].fails <= 0.01 * ev[L].N),
  rule1: (ev, lv, leads) => leads.every((L) => ev[L] && ev[L].ub[lv].med < 0),
  'prediction-above0': (ev, lv, leads) => leads.every((L) => ev[L] && ev[L].lb[lv].med > 0),
};

function simulate(k, n) {
  const rows = storedRows();
  const spans = Number(args.spans ?? 200), draws = Number(args.draws ?? 400);
  const mine = Math.floor(spans / n) + (k < spans % n ? 1 : 0);
  const out = { shard: `${k}/${n}`, draws, statements: {} };
  for (const [fam, statements] of Object.entries(config.families)) {
    if (!Array.isArray(statements)) continue;
    const group = fam === 'P' ? 'P' : 'S1', spanNames = config.verdictPool[group];
    for (const s of statements) {
      const ws = windowsOf(rows, group, spanNames, s.arm, s.ref);
      const byWeek = new Map(); for (const w of ws) { if (!byWeek.has(w.week)) byWeek.set(w.week, []); byWeek.get(w.week).push(w); }
      const weeks = [...byWeek.values()], W = weeks.length;
      const leads = s.leads.map(String);
      const rand = rng(`FSA|fpr|${s.id}|${k}/${n}`);
      const counts = {};
      const bump = (key, lv, pass) => { counts[key] = counts[key] || { n: 0, pass: { 0.975: 0, 0.95: 0 } }; if (lv === 0.975) counts[key].n += 1; if (pass) counts[key].pass[lv] += 1; };
      for (let i = 0; i < mine; i += 1) {
        const span = []; for (let j = 0; j < W; j += 1) span.push(weeks[Math.floor(rand() * W)]);
        const base = evaluate(span, {}, draws, rand);
        for (const L of leads) {
          if (!base[L]) continue;
          const nulls = s.form === 'xm' ? ['r1', 'r2'] : s.form === 'rule1' ? ['r1'] : ['r1'];
          for (const type of nulls) {
            const factor = type === 'r1' ? Math.exp(-base[L].med) : Math.exp(LN110 - base[L].lr);
            if (!Number.isFinite(factor) || factor <= 0) continue;
            const ev = evaluate(span, { [L]: factor }, draws, rand);
            for (const lv of LEVELS) { bump(`${type}@day${L}`, lv, forms[s.form](ev, lv, leads)); bump(`single-rule1@day${L}`, lv, type === 'r1' && ev[L] && ev[L].ub[lv].med < 0); }
          }
        }
      }
      out.statements[s.id] = { group, arm: s.arm, ref: s.ref, form: s.form, leads: s.leads, windows: ws.length, weeks: W, spans: mine, counts };
      console.error(`fpr ${k}/${n} ${s.id}: ${mine} spans`);
    }
  }
  return out;
}
function merge(files) {
  const shards = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const out = { method: 'XP2: ISO weeks drawn with replacement to the span\'s own weeks; null of rule 1 scales the arm so the median d is 0, of rule 2 so the p95 ratio is 1.10, one lead at a time, the others as scored; the whole statement at the least favorable null', draws: shards[0].draws, statements: {} };
  for (const id of Object.keys(shards[0].statements)) {
    const first = shards[0].statements[id]; let spans = 0; const counts = {};
    for (const sh of shards) { const s = sh.statements[id]; spans += s.spans; for (const [key, v] of Object.entries(s.counts)) { counts[key] = counts[key] || { n: 0, pass: { 0.975: 0, 0.95: 0 } }; counts[key].n += v.n; for (const lv of LEVELS) counts[key].pass[lv] += v.pass[lv]; } }
    const rates = Object.fromEntries(Object.entries(counts).map(([key, v]) => [key, { n: v.n, percent: Object.fromEntries(LEVELS.map((lv) => [lv, v.n ? Number((100 * v.pass[lv] / v.n).toFixed(2)) : null])) }]));
    const whole = Object.entries(rates).filter(([key]) => !key.startsWith('single-'));
    out.statements[id] = { ...first, spans, rates, leastFavorable: Object.fromEntries(LEVELS.map((lv) => [lv, whole.length ? Math.max(...whole.map(([, r]) => r.percent[lv] ?? 0)) : null])) };
  }
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(path.join(results, 'false-positive.json'), `${JSON.stringify(out, null, 1)}\n`);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(out.statements).map(([id, s]) => [id, s.leastFavorable])), null, 1));
}
if (args.merge) merge(process.argv.slice(process.argv.indexOf('--merge') + 1));
else { const [k, n] = String(args.shard ?? '0/1').split('/').map(Number); const r = simulate(k, n); fs.writeFileSync(args.out ?? `/tmp/fsa-fpr-${k}.json`, JSON.stringify(r)); console.error(`fpr ${k}/${n}: written ${args.out}`); }
