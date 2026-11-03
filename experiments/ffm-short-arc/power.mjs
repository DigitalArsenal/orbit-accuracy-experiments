// FSA power and false-positive simulation (PLAN.md, False-positive rate and power), run before any fresh score. Read-only on the stores:
// XM6's A12 and A24 rows and XM3's P and F2 rows (spent, 2026-01-02..05-31) are resampled by ISO week with replacement into spans of this
// design; per span XM's statistics with a cluster bootstrap on the drawn weeks; the percent of spans passing each statement at 97.5 % (95 %),
// at the measured effect and at half the effect; the whole-rule false-positive rate under the least favorable one-lead null.
//   node experiments/ffm-short-arc/power.mjs --shard k/n --out <file>   one shard: its spans' counts (SPANS and DRAWS from config.power)
//   node experiments/ffm-short-arc/power.mjs --merge <file...>           the shards summed into experiments/ffm-short-arc/power.json
// Quantile: XM's (linear between order statistics at q (n - 1)). Generator: xorshift128+, seeded per design and shard.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(dir, '../..');
const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
const XM6 = '/opt/data/sdn-archive/ffm-agom-prior-leo/rows/';
const XM3 = '/opt/data/sdn-archive/ffm-atmosphere-xm3/rows/';
const LEADS = ['1', '2', '3', '7'];
const LN110 = Math.log(1.10);
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));

function readRows(d) { const out = []; for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.jsonl')).sort()) for (const line of fs.readFileSync(d + f, 'utf8').split('\n')) if (line.trim()) out.push(JSON.parse(line)); return out; }

function quantileSorted(a, q) { const n = a.length; const p = q * (n - 1), lo = Math.floor(p), f = p - lo; if (f === 0 || lo + 1 >= n) return a[lo]; return a[lo] + f * (a[lo + 1] - a[lo]); }
const sortNum = (a) => a.sort((x, y) => x - y);
function rng(seed) { let s0 = BigInt(seed) * 0x9E3779B97F4A7C15n & 0xFFFFFFFFFFFFFFFFn, s1 = (BigInt(seed) ^ 0xDEADBEEFCAFEBABEn) * 0xBF58476D1CE4E5B9n & 0xFFFFFFFFFFFFFFFFn; if (s0 === 0n) s0 = 1n; if (s1 === 0n) s1 = 2n;
  return () => { let x = s0, y = s1; s0 = y; x ^= (x << 23n) & 0xFFFFFFFFFFFFFFFFn; x ^= x >> 17n; x ^= y ^ (y >> 26n); s1 = x; return Number(((x + y) & 0xFFFFFFFFFFFFFFFFn) >> 11n) / 9007199254740992; }; }

/** One contrast on a span (array of clusters, each an array of windows): per lead the median d and ln p95 ratio with bootstrap bounds. */
function evaluate(clusters, armKey, refKey, scale, draws, rand, levels) {
  const perLead = {};
  for (const L of LEADS) {
    const cl = []; let N = 0;
    for (const c of clusters) {
      const pairs = [];
      for (const w of c) { const a = w[armKey], r = w[refKey]; if (!w.entered.has(L) || !r || !Number.isFinite(r[L])) continue; let ea = a && Number.isFinite(a[L]) ? a[L] : Infinity; const er = r[L]; if (typeof scale === 'function') ea = scale(ea, er, L); else if (scale && scale[L]) ea = ea * scale[L]; pairs.push([ea, er]); }
      if (pairs.length) { cl.push(pairs); N += pairs.length; }
    }
    if (N < 10 || cl.length < 2) { perLead[L] = null; continue; }
    const stat = (list) => { const D = [], EA = [], ER = []; for (const pairs of list) for (const [ea, er] of pairs) { D.push(Math.log(ea / er)); EA.push(ea); ER.push(er); } sortNum(D); sortNum(EA); sortNum(ER); return [quantileSorted(D, 0.5), Math.log(quantileSorted(EA, 0.95) / quantileSorted(ER, 0.95))]; };
    const point = stat(cl);
    const meds = new Float64Array(draws), lrs = new Float64Array(draws), m = cl.length;
    for (let d = 0; d < draws; d += 1) { const pick = []; for (let i = 0; i < m; i += 1) pick.push(cl[Math.floor(rand() * m)]); const s = stat(pick); meds[d] = s[0]; lrs[d] = s[1]; }
    sortNum(meds); sortNum(lrs);
    const ub = {}, lb = {}; for (const lv of levels) { const q = 1 - (1 - lv) / 2; ub[lv] = { med: quantileSorted(meds, q), lr: quantileSorted(lrs, q) }; lb[lv] = { med: quantileSorted(meds, 1 - q), lr: quantileSorted(lrs, 1 - q) }; }
    perLead[L] = { N, clusters: m, med: point[0], lr: point[1], ub, lb };
  }
  return perLead;
}
const r1 = (ev, lv, leads = LEADS) => leads.every((L) => ev[L] && ev[L].ub[lv].med < 0);
const r2 = (ev, lv, leads = LEADS) => leads.every((L) => ev[L] && ev[L].ub[lv].lr < LN110);
const xm = (ev, lv, leads = LEADS) => r1(ev, lv, leads) && r2(ev, lv, leads);
const half = (ea, er) => Math.sqrt(ea * er);
const D123 = ['1', '2', '3'];

function loadRows() {
  const xm3 = new Map(); for (const r of readRows(XM3)) xm3.set(r.key, r);
  const rows = [];
  for (const r of readRows(XM6)) {
    const base = xm3.get(r.key); if (!base || !base.P || !base.P.ok) continue;
    const e = (arm) => { if (!arm || !arm.ok || !arm.days) return null; const o = {}; for (const L of LEADS) o[L] = arm.days[L] ? arm.days[L].rmsKm : NaN; return o; };
    rows.push({ key: r.key, group: r.group, cluster: r.cluster, week: r.isoWeek, entered: new Set((r.entered || []).map(String)), P: e(base.P), F2: e(base.arms && base.arms.F2), A12: e(r.arms.A12), A24: e(r.arms.A24) });
  }
  return rows;
}
function weeksOf(rows, group, filter) { const byWeek = new Map(); for (const r of rows) { if (r.group !== group) continue; if (filter && !filter(r)) continue; if (!byWeek.has(r.week)) byWeek.set(r.week, []); byWeek.get(r.week).push(r); } return [...byWeek.values()]; }
const drawSpan = (rand, parts) => { const clusters = []; for (const [pool, n] of parts) for (let i = 0; i < n; i += 1) clusters.push(pool[Math.floor(rand() * pool.length)]); return clusters; };

const LEVELS = [0.975, 0.95];
// Statements as registered (config.families), evaluated per span; P3 and P6 have no spent rows (parity) and are not simulated.
const STATEMENTS = {
  P1: (ev) => xm(ev.A12P, 0.975), P1_95: (ev) => xm(ev.A12P, 0.95), P1_half: (ev) => xm(ev.A12Ph, 0.975),
  P2: (ev) => r1(ev.A12F2, 0.975, D123), P2_95: (ev) => r1(ev.A12F2, 0.95, D123),
  P4: (ev) => xm(ev.A24P, 0.975), P4_95: (ev) => xm(ev.A24P, 0.95), P4_half: (ev) => xm(ev.A24Ph, 0.975),
  P5: (ev) => r1(ev.A12F2, 0.975, ['7']), P5_95: (ev) => r1(ev.A12F2, 0.95, ['7']),
  S1: (ev) => r1(ev.A24P, 0.975, D123), S1_r2_d123: (ev) => r2(ev.A24P, 0.975, D123),
  S2: (ev) => r1(ev.A24F2, 0.975, D123), S2_d7_noloss: (ev) => !!(ev.A24F2['7'] && ev.A24F2['7'].ub[0.975].med < LN110),
  S3: (ev) => !!(ev.A12F2['7'] && ev.A12F2['7'].lb[0.975].med > 0),
  A12P_r2_d1: (ev) => r2(ev.A12P, 0.975, ['1']), A12P_r2_d2: (ev) => r2(ev.A12P, 0.975, ['2']), A12P_r2_d3: (ev) => r2(ev.A12P, 0.975, ['3']), A12P_r2_d7: (ev) => r2(ev.A12P, 0.975, ['7']),
  A12F2_r1_d7_95: (ev) => r1(ev.A12F2, 0.95, ['7']),
};

function simulate(shardIndex, shardCount) {
  const rows = loadRows();
  const weeksP = weeksOf(rows, 'P'), weeksPSwarm = weeksOf(rows, 'P', (r) => r.cluster !== 'GRACE-FO'), weeksS1 = weeksOf(rows, 'S1');
  const designs = {
    pool: { parts: [[weeksP, 12], [weeksPSwarm, 39]], label: 'group P pool: 12 weeks x 5 objects + 39 Swarm-only weeks' },
    primary: { parts: [[weeksP, 12]], label: 'group P primary span alone: 12 weeks x 5 objects' },
    s1: { parts: [[weeksS1, 11]], label: 'Sentinel-1: 11 weeks x 2 satellites' },
  };
  const spansTotal = Number(args.spans ?? config.power.spans), draws = Number(args.draws ?? config.power.draws), nullSpansTotal = Number(args.nullSpans ?? config.power.nullSpans);
  const mySpans = Math.floor(spansTotal / shardCount) + (shardIndex < spansTotal % shardCount ? 1 : 0);
  const myNullSpans = Math.floor(nullSpansTotal / shardCount) + (shardIndex < nullSpansTotal % shardCount ? 1 : 0);
  const out = { shard: `${shardIndex}/${shardCount}`, draws, rowsWithP: rows.length, weeks: { P: weeksP.length, S1: weeksS1.length }, designs: {} };
  // The null for the false-positive rows is fixed once per design from every window its spans are drawn from (XP2's construction): the
  // A12 errors at lead L scaled so the whole set's median d is 0 (rule 1's null) or its p95 ratio is 1.10 (rule 2's null); the simulated
  // spans are then drawn from the scaled set. Scaling each simulated span to its own median made a pass impossible by construction and the
  // rate 0 in the first version (amendment 2).
  const nullFactors = (parts) => {
    const seen = new Set(), all = []; for (const [pool] of parts) for (const week of pool) for (const w of week) if (!seen.has(w.key)) { seen.add(w.key); all.push(w); }
    const f = {};
    for (const L of LEADS) {
      const D = [], EA = [], ER = [];
      for (const w of all) { const a = w.A12, r = w.P; if (!w.entered.has(L) || !r || !Number.isFinite(r[L])) continue; const ea = a && Number.isFinite(a[L]) ? a[L] : Infinity; D.push(Math.log(ea / r[L])); EA.push(ea); ER.push(r[L]); }
      if (D.length < 10) continue;
      sortNum(D); sortNum(EA); sortNum(ER);
      const med = quantileSorted(D, 0.5), lr = Math.log(quantileSorted(EA, 0.95) / quantileSorted(ER, 0.95));
      f[L] = { r1: Math.exp(-med), r2: Math.exp(LN110 - lr), medianD: med, lnP95Ratio: lr };
    }
    return f;
  };
  for (const [name, d] of Object.entries(designs)) {
    const rand = rng(1_000_003 * (shardIndex + 1) + name.length * 7919 + 17);
    const counts = Object.fromEntries(Object.keys(STATEMENTS).map((k) => [k, 0]));
    const nulls = {}; const d7ub = [];
    const factors = nullFactors(d.parts);
    for (let s = 0; s < mySpans; s += 1) {
      const span = drawSpan(rand, d.parts);
      const ev = {
        A12P: evaluate(span, 'A12', 'P', null, draws, rand, LEVELS), A12Ph: evaluate(span, 'A12', 'P', half, draws, rand, LEVELS),
        A12F2: evaluate(span, 'A12', 'F2', null, draws, rand, LEVELS),
        A24P: evaluate(span, 'A24', 'P', null, draws, rand, LEVELS), A24Ph: evaluate(span, 'A24', 'P', half, draws, rand, LEVELS),
        A24F2: evaluate(span, 'A24', 'F2', null, draws, rand, LEVELS),
      };
      for (const [k, f] of Object.entries(STATEMENTS)) if (f(ev)) counts[k] += 1;
      if (ev.A12P['7']) d7ub.push(ev.A12P['7'].ub[0.975].lr);
      if (s < myNullSpans) for (const L of LEADS) {
        if (!factors[L]) continue;
        for (const type of ['r1', 'r2']) {
          const factor = factors[L][type];
          if (!Number.isFinite(factor) || factor <= 0) continue;
          const evN = evaluate(span, 'A12', 'P', { [L]: factor }, draws, rand, [0.975]);
          const k = `${type}@day${L}`; nulls[k] = nulls[k] || { n: 0, pass: 0 }; nulls[k].n += 1; if (xm(evN, 0.975)) nulls[k].pass += 1;
          if (type === 'r1') { const k1 = `single-rule1@day${L}`; nulls[k1] = nulls[k1] || { n: 0, pass: 0 }; nulls[k1].n += 1; if (evN[L] && evN[L].ub[0.975].med < 0) nulls[k1].pass += 1; }
        }
      }
    }
    out.designs[name] = { label: d.label, spans: mySpans, counts, nulls, nullFactors: factors, d7ub };
    console.error(`power ${out.shard} ${name}: ${mySpans} spans done`);
  }
  return out;
}

function merge(files) {
  const shards = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const out = { registered: { spans: Number(config.power.spans), draws: Number(config.power.draws), nullSpans: Number(config.power.nullSpans) }, shards: shards.map((s) => s.shard), rowsWithP: shards[0].rowsWithP, weeks: shards[0].weeks, designs: {} };
  const pct = (x, n) => (n ? Number((100 * x / n).toFixed(1)) : null);
  for (const name of Object.keys(shards[0].designs)) {
    let spans = 0; const counts = {}; const nulls = {}; let d7 = [];
    for (const s of shards) { const d = s.designs[name]; spans += d.spans; for (const [k, v] of Object.entries(d.counts)) counts[k] = (counts[k] || 0) + v; for (const [k, v] of Object.entries(d.nulls)) { nulls[k] = nulls[k] || { n: 0, pass: 0 }; nulls[k].n += v.n; nulls[k].pass += v.pass; } d7 = d7.concat(d.d7ub); }
    sortNum(d7);
    out.designs[name] = { label: shards[0].designs[name].label, spans, percentPassing: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, pct(v, spans)])),
      falsePositivePercent: Object.fromEntries(Object.entries(nulls).map(([k, v]) => [k, { percent: pct(v.pass, v.n), of: v.n }])),
      leastFavorableNullPercent: Math.max(...Object.entries(nulls).filter(([k]) => !k.startsWith('single-')).map(([, v]) => pct(v.pass, v.n) ?? 0)),
      singleLeadRule1Percent: Object.fromEntries(Object.entries(nulls).filter(([k]) => k.startsWith('single-')).map(([k, v]) => [k, pct(v.pass, v.n)])),
      a12pDay7P95UpperBound: d7.length ? { median: quantileSorted(d7, 0.5), p10: quantileSorted(d7, 0.1), p90: quantileSorted(d7, 0.9), threshold: LN110 } : null };
  }
  fs.writeFileSync(path.join(dir, 'power.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out, null, 1));
}

if (args.merge) merge(process.argv.slice(process.argv.indexOf('--merge') + 1));
else { const [k, n] = String(args.shard ?? '0/1').split('/').map(Number); const result = simulate(k, n); fs.writeFileSync(args.out ?? `/tmp/fsa-power-${k}.json`, JSON.stringify(result)); console.error(`power ${k}/${n}: written ${args.out}`); }
