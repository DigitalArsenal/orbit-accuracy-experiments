// XP2F table (PLAN.md, Scoring and statistics): every registered cell from the stored rows, the cluster bootstrap on ISO weeks with orbit group x ISO week beside it, 97.5 % with 95 % beside it, the two
// fixed sequences, the false-positive rate of each statement on these dates, the report-only cells, table.json and the generated README. Statistics only.
//   node experiments/xp2-fit-design/table.mjs            writes results/xp2-fit-design/table.json and README.md; refuses until every window is stored
//   node experiments/xp2-fit-design/table.mjs --check    rebuilds both and compares them with the committed files, byte for byte
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const LN110 = Math.log(1.10);
const LEVELS = { 975: [0.0125, 0.9875], 95: [0.025, 0.975] };

/** xorshift128+ seeded by SHA-256 of `label` (XM's generator), a float in [0, 1). */
function generator(label) {
  const d = crypto.createHash('sha256').update(label).digest();
  let [ah, al, bh, bl] = [d.readUInt32BE(0), d.readUInt32BE(4), d.readUInt32BE(8), d.readUInt32BE(12)];
  if (!(ah | al | bh | bl)) al = 1;
  return () => {
    let xh = ah, xl = al; const yh = bh, yl = bl;
    ah = yh; al = yl;
    xh = (xh ^ ((xh << 23) | (xl >>> 9))) >>> 0; xl = (xl ^ (xl << 23)) >>> 0;
    const x17l = ((xl >>> 17) | (xh << 15)) >>> 0, x17h = xh >>> 17;
    const y26l = ((yl >>> 26) | (yh << 6)) >>> 0, y26h = yh >>> 26;
    bh = (xh ^ yh ^ x17h ^ y26h) >>> 0; bl = (xl ^ yl ^ x17l ^ y26l) >>> 0;
    const lo = bl + yl, carry = lo >= 4294967296 ? 1 : 0;
    return ((bh + yh + carry) >>> 0) / 4294967296;
  };
}
const between = (x, y, f) => { if (x === y || f === 0) return x; if (x === -Infinity && y === Infinity) return NaN; if (y === Infinity) return Infinity; if (x === -Infinity) return -Infinity; return x + (y - x) * f; };
const up = (x) => (Number.isNaN(x) ? Infinity : x);
const pctl = (sorted, q) => sorted[Math.floor(q * (sorted.length - 1))];
const quantile = (values, q) => { const a = Float64Array.from(values).sort(); if (!a.length) return NaN; const p = q * (a.length - 1), lo = Math.floor(p), f = p - lo; return f === 0 ? a[lo] : between(a[lo], a[lo + 1], f); };

/** Order statistics of a value list under per-cluster weights: the values sorted once, the cluster of each. */
function sorted(values, clusters) {
  const order = Array.from(values.keys()).sort((a, b) => values[a] - values[b]);
  return { v: Float64Array.from(order, (i) => values[i]), c: Int32Array.from(order, (i) => clusters[i]) };
}
function weighted(s, weight, N, q) {
  const p = q * (N - 1), lo = Math.floor(p), f = p - lo, n = s.v.length;
  let cum = 0, i = 0;
  for (; i < n; i += 1) { cum += weight[s.c[i]]; if (cum > lo) break; }
  const x = s.v[i];
  if (f === 0) return x;
  if (cum > lo + 1) return x;
  let k = i + 1;
  while (k < n && weight[s.c[k]] === 0) k += 1;
  return between(x, s.v[k], f);
}

/** One cell: { n, clusters, points, intervals at each level, the p95 ratio and its upper bounds }. A task: d, ea, er, clusters (ints), C, seed. */
function cellTask({ d, ea, er, cl, C, seed, draws, medianOnly }) {
  const n = d.length;
  if (!n) return { n: 0 };
  const sd = sorted(d, cl), sa = medianOnly ? null : sorted(ea, cl), sb = medianOnly ? null : sorted(er, cl);
  const size = new Int32Array(C); for (let i = 0; i < n; i += 1) size[cl[i]] += 1;
  const next = generator(seed), mult = new Int32Array(C), meds = new Float64Array(draws), lrs = new Float64Array(draws);
  for (let r = 0; r < draws; r += 1) {
    mult.fill(0);
    for (let j = 0; j < C; j += 1) mult[Math.floor(next() * C)] += 1;
    let N = 0; for (let j = 0; j < C; j += 1) N += mult[j] * size[j];
    meds[r] = up(weighted(sd, mult, N, 0.5));
    if (!medianOnly) lrs[r] = up(Math.log(weighted(sa, mult, N, 0.95)) - Math.log(weighted(sb, mult, N, 0.95)));
  }
  meds.sort(); if (!medianOnly) lrs.sort();
  const out = { n, clusters: C, medianD: up(quantile(d, 0.5)) };
  for (const [lv, [a, b]] of Object.entries(LEVELS)) { out[`lo${lv}`] = pctl(meds, a); out[`hi${lv}`] = pctl(meds, b); if (!medianOnly) out[`ub${lv}`] = pctl(lrs, b); }
  if (!medianOnly) out.p95LnRatio = up(Math.log(quantile(ea, 0.95)) - Math.log(quantile(er, 0.95)));
  return out;
}

/**
 * The false-positive rate of one statement on these dates (PLAN.md, False-positive rate): ISO weeks drawn with replacement to the span's own weeks, the registered bootstrap inside each simulated span, and the
 * nulls by scaling: an arm's errors at a lead scaled by exp(s) move every d, bootstrap median and ln p95 ratio of that lead by s, so one bootstrap per span serves every null.
 */
function fpTask({ leads, W, groups, clusters, form, seed, spans, draws }) {
  const next = generator(seed), L = leads.length, G = groups;
  const cellOf = (w, g) => (clusters === 'wk' ? w : w * G + g), Cw = clusters === 'wk' ? W : W * G;
  const prep = leads.map((p) => {
    const cl = p.week.map((w, i) => cellOf(w, p.group[i]));
    const size = new Int32Array(Cw); for (const c of cl) size[c] += 1;
    return { sd: sorted(p.d, cl), sa: sorted(p.ea, cl), sb: sorted(p.er, cl), size, med: up(quantile(p.d, 0.5)), p95: up(Math.log(quantile(p.ea, 0.95)) - Math.log(quantile(p.er, 0.95))) };
  });
  const present = []; // the groups each week holds
  for (let w = 0; w < W; w += 1) { const s = new Set(); for (const p of leads) p.week.forEach((x, i) => { if (x === w) s.add(p.group[i]); }); present.push([...s].sort((a, b) => a - b)); }
  const counts = {}; for (const lv of Object.keys(LEVELS)) counts[lv] = { r1: new Array(L).fill(0), r2: new Array(L).fill(0), whole: new Array(2 * L).fill(0), asScored: 0 };
  const meds = leads.map(() => new Float64Array(draws)), lrs = leads.map(() => new Float64Array(draws));
  const weight = new Int32Array(Cw);
  for (let s = 0; s < spans; s += 1) {
    const slots = []; for (let k = 0; k < W; k += 1) slots.push(Math.floor(next() * W));
    const units = clusters === 'wk' ? slots.map((w) => [w]) : slots.flatMap((w) => present[w].map((g) => [w * G + g]));
    const C = units.length;
    for (let r = 0; r < draws; r += 1) {
      weight.fill(0);
      for (let j = 0; j < C; j += 1) weight[units[Math.floor(next() * C)][0]] += 1;
      for (let j = 0; j < L; j += 1) {
        const q = prep[j];
        let N = 0; for (let c = 0; c < Cw; c += 1) N += weight[c] * q.size[c];
        if (N === 0) { meds[j][r] = Infinity; lrs[j][r] = Infinity; continue; }
        meds[j][r] = up(weighted(q.sd, weight, N, 0.5));
        lrs[j][r] = up(Math.log(weighted(q.sa, weight, N, 0.95)) - Math.log(weighted(q.sb, weight, N, 0.95)));
      }
    }
    for (let j = 0; j < L; j += 1) { meds[j].sort(); lrs[j].sort(); }
    for (const [lv, [, b]] of Object.entries(LEVELS)) {
      const hi = meds.map((m) => pctl(m, b)), ub = lrs.map((m) => pctl(m, b)), c = counts[lv];
      const pass = (j, delta) => hi[j] + delta < 0 && (form === 'rule1' || ub[j] + delta < LN110);
      for (let j = 0; j < L; j += 1) {
        if (hi[j] - prep[j].med < 0) c.r1[j] += 1;
        if (ub[j] - prep[j].p95 < 0) c.r2[j] += 1;
        let others = true; for (let k = 0; k < L; k += 1) if (k !== j && !pass(k, 0)) others = false;
        if (others && pass(j, -prep[j].med)) c.whole[2 * j] += 1;
        if (others && form !== 'rule1' && pass(j, LN110 - prep[j].p95)) c.whole[2 * j + 1] += 1;
      }
      if (hi.every((_, j) => pass(j, 0))) c.asScored += 1;
    }
  }
  const pc = (x) => +(100 * x / spans).toFixed(1);
  return Object.fromEntries(Object.entries(counts).map(([lv, c]) => [lv, { rule1ByLead: c.r1.map(pc), rule2ByLead: c.r2.map(pc), wholeLeastFavorable: Math.max(...c.whole.map(pc)), passAsScored: pc(c.asScored) }]));
}
const compute = (t) => (t.kind === 'fp' ? fpTask(t) : cellTask(t));
if (!isMainThread) { parentPort.postMessage(workerData.tasks.map(compute)); process.exit(0); }

// ---- the rows ------------------------------------------------------------------------------------------------------------
const C = await import('./common.mjs');
const { config, store, results, readJsonl, sha256, XM, frozen, isoWeek, build } = C;
const args = C.args;
frozen();
const LEADS = XM.config.scoring.leadDays, DRAWS = config.statistics.bootstrap.draws;
const FAMILY = config.statistics.families, FP = config.statistics.falsePositive;
const GROUPS = [...new Set(config.objects.map((o) => o.cluster))];
const rowsDir = path.join(store, 'rows');
const allRows = fs.readdirSync(rowsDir).filter((n) => n.endsWith('.jsonl')).sort().flatMap((n) => readJsonl(path.join(rowsDir, n)));
const byKey = new Map(); for (const r of allRows) byKey.set(r.key, r);
const rows = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
const counts = {}; for (const s of Object.keys(config.spans)) counts[s] = { expected: config.expectedWindows[s], stored: rows.filter((r) => r.span === s).length, excluded: rows.filter((r) => r.span === s && r.excluded).length, errors: rows.filter((r) => r.span === s && r.error).length };
for (const [s, c] of Object.entries(counts)) if (c.stored !== c.expected) { console.error(`${s}: ${c.stored} of ${c.expected} windows are stored; the table waits`); process.exit(2); }
const digest = sha256(Buffer.from(rows.map((r) => { const { timing, ...rest } = r; return JSON.stringify(rest); }).join('\n'))).slice(0, 12);

/** An arm's value at a lead: { e, t } | 'failed' | null (not attempted, leaves the pairs). A name ending in * takes the term off at output. */
function value(r, name, lead) {
  if (r.excluded || r.error || !r.entered?.includes(lead)) return null;
  const term = name.endsWith('*'), n = term ? name.slice(0, -1) : name;
  const a = n === 'P' ? r.P : r.arms?.[n];
  if (!a || a.notRun) return null;
  if (!a.ok) return 'failed';
  const day = a.days[lead];
  if (!day) return null;
  return { e: term ? day.eL : day.e, t: day.t };
}
function pairs(arm, ref, lead, filter) {
  const out = { d: [], ea: [], er: [], ta: [], tr: [], rows: [], failArm: 0, failRef: 0, notRun: 0 };
  for (const r of rows) {
    if (filter && !filter(r)) continue;
    const a = value(r, arm, lead), b = value(r, ref, lead);
    if (a === null || b === null) { if (r.entered?.includes(lead)) out.notRun += 1; continue; }
    const fa = a === 'failed', fb = b === 'failed';
    if (fa) out.failArm += 1;
    if (fb) out.failRef += 1;
    out.d.push(fa ? Infinity : fb ? -Infinity : up(Math.log(a.e) - Math.log(b.e)));
    out.ea.push(fa ? Infinity : a.e); out.er.push(fb ? Infinity : b.e);
    if (!fa) out.ta.push(a.t); if (!fb) out.tr.push(b.t);
    out.rows.push(r);
  }
  return out;
}
const clusterIds = (list, labelOf) => { const names = [...new Set(list.map(labelOf))].sort(), ix = new Map(names.map((x, i) => [x, i])); return { ids: list.map((r) => ix.get(labelOf(r))), C: names.length }; };
const CLUSTERS = { wk: (r) => r.isoWeek, gw: (r) => `${r.cluster}|${r.isoWeek}` };

// the subsets of the report
const ageCut = (() => { const a = rows.filter((r) => r.set).map((r) => r.set.ageHours).sort((x, y) => x - y); return [a[Math.floor(a.length / 3)], a[Math.floor(2 * a.length / 3)]]; })();
const SUBSETS = {
  pool: null,
  primary: (r) => r.span === 'primary',
  extension: (r) => r.span === 'extension',
  'Swarm A+C': (r) => r.cluster === 'Swarm A+C',
  'Swarm B': (r) => r.cluster === 'Swarm B',
  'GRACE-FO': (r) => r.cluster === 'GRACE-FO',
  'P age, youngest third': (r) => r.set && r.set.ageHours <= ageCut[0],
  'P age, middle third': (r) => r.set && r.set.ageHours > ageCut[0] && r.set.ageHours <= ageCut[1],
  'P age, oldest third': (r) => r.set && r.set.ageHours > ageCut[1],
  'Ap at least 40 in the arc': (r) => r.apArc >= 40,
  'set created within 6 h': (r) => r.set && r.set.creationAgeHours <= 6,
};
const STATEMENTS = [...FAMILY.M, ...FAMILY.F];
const statementContrasts = STATEMENTS.map((s) => [s.arm, s.ref]);
const reportFull = [['S17LP', 'P'], ['S17LPc', 'P'], ['S72L', 'P'], ['X2', 'P']];
const reportSpans = [['S17LF', 'P'], ['R17c', 'P'], ['RFa24c', 'P'], ['RF17c', 'P'], ['R17', 'S17LF'], ['RF17', 'S17LP'], ['R17', 'S17LP'], ['RFa12', 'RF17'], ['RFa12c', 'S17LPc'], ['P*', 'P'], ['RFa12*', 'P*'], ['RFa24*', 'P*'], ['RF17*', 'P*'], ['R17*', 'P*'], ['X2*', 'P*'], ['S17LP*', 'P*'], ['RFa12*', 'P'], ['RF17*', 'P']];
const FULL = Object.keys(SUBSETS), SPANS = ['pool', 'primary', 'extension'];

// ---- the tasks -------------------------------------------------------------------------------------------------------------
const tasks = [], meta = [];
function addCells(arm, ref, subsets) {
  for (const sub of subsets) {
    const filter = SUBSETS[sub];
    for (const lead of LEADS) {
      const p = pairs(arm, ref, lead, filter);
      for (const [cname, labelOf] of Object.entries(CLUSTERS)) {
        const { ids, C: n } = clusterIds(p.rows, labelOf);
        tasks.push({ kind: 'cell', d: p.d, ea: p.ea, er: p.er, cl: ids, C: n, seed: `XP2F|${sub}|${arm}/${ref}|${lead}|${cname}`, draws: DRAWS, medianOnly: false });
        meta.push({ arm, ref, sub, lead, cname, failArm: p.failArm, failRef: p.failRef, notRun: p.notRun, medianArmKm: up(quantile(p.ea, 0.5)), medianRefKm: up(quantile(p.er, 0.5)), medianArmAtKm: quantile(p.ta, 0.5), medianRefAtKm: quantile(p.tr, 0.5) });
      }
    }
    // the overall statement, report only: per window the mean d over the four leads
    const byRow = new Map();
    for (const lead of LEADS) { const p = pairs(arm, ref, lead, filter); p.rows.forEach((r, i) => { if (!byRow.has(r.key)) byRow.set(r.key, { r, v: [] }); byRow.get(r.key).v.push(p.d[i]); }); }
    const list = [...byRow.values()].filter((x) => x.v.length === LEADS.length);
    const d = list.map((x) => up(x.v.reduce((a, b) => a + b, 0) / LEADS.length));
    for (const [cname, labelOf] of Object.entries(CLUSTERS)) {
      const { ids, C: n } = clusterIds(list.map((x) => x.r), labelOf);
      tasks.push({ kind: 'cell', d, ea: d, er: d, cl: ids, C: n, seed: `XP2F|${sub}|${arm}/${ref}|overall|${cname}`, draws: DRAWS, medianOnly: true });
      meta.push({ arm, ref, sub, lead: 'overall', cname, n: list.length });
    }
  }
}
const seen = new Set();
const addOnce = (arm, ref, subs) => { const k = `${arm}/${ref}`; if (seen.has(k)) return; seen.add(k); addCells(arm, ref, subs); };
for (const [a, r] of statementContrasts) addOnce(a, r, FULL);
for (const [a, r] of reportFull) addOnce(a, r, FULL);
for (const [a, r] of reportSpans) addOnce(a, r, SPANS);
// the false-positive tasks
const weekNames = [...new Set(rows.filter((r) => !r.excluded && !r.error).map((r) => r.isoWeek))].sort(), weekIx = new Map(weekNames.map((w, i) => [w, i])), groupIx = new Map(GROUPS.map((g, i) => [g, i]));
for (const s of STATEMENTS) for (const clusters of ['wk', 'gw']) {
  const leads = LEADS.map((lead) => { const p = pairs(s.arm, s.ref, lead, null); return { d: p.d, ea: p.ea, er: p.er, week: p.rows.map((r) => weekIx.get(r.isoWeek)), group: p.rows.map((r) => groupIx.get(r.cluster)) }; });
  tasks.push({ kind: 'fp', leads, W: weekNames.length, groups: GROUPS.length, clusters, form: s.form, seed: `XP2F-FP|${s.id}|${clusters}`, spans: FP.spans, draws: FP.draws });
  meta.push({ fp: s.id, clusters });
}

// ---- compute on worker threads, the answers in task order ------------------------------------------------------------------
const THREADS = Math.min(Number(args.threads ?? 8), config.workers.maximum);
const answers = await new Promise((resolve, reject) => {
  const out = new Array(tasks.length); let left = THREADS;
  for (let k = 0; k < THREADS; k += 1) {
    const idx = tasks.map((_, i) => i).filter((i) => i % THREADS === k);
    const w = new Worker(new URL(import.meta.url), { workerData: { tasks: idx.map((i) => tasks[i]) } });
    w.on('message', (res) => { res.forEach((r, j) => { out[idx[j]] = r; }); left -= 1; if (!left) resolve(out); });
    w.on('error', reject);
  }
});

// ---- the cells and the verdicts --------------------------------------------------------------------------------------------
const pct = (x) => (Number.isFinite(x) ? +(100 * (Math.exp(x) - 1)).toFixed(2) : x > 0 ? 'Infinity' : '-Infinity');
const num = (x) => (Number.isFinite(x) ? +x.toFixed(6) : x === Infinity ? 'Infinity' : x === -Infinity ? '-Infinity' : null);
const cells = {}, fp = {};
answers.forEach((a, i) => {
  const m = meta[i];
  if (m.fp) { (fp[m.fp] ??= {})[m.clusters] = a; return; }
  const key = `${m.arm}/${m.ref}`;
  const c = ((cells[key] ??= {})[m.sub] ??= {});
  const entry = { n: a.n ?? 0, clusters: a.clusters ?? 0 };
  if (a.n) {
    entry.medianPct = pct(a.medianD);
    for (const lv of Object.keys(LEVELS)) { entry[`lo${lv}`] = pct(a[`lo${lv}`]); entry[`hi${lv}`] = pct(a[`hi${lv}`]); entry[`rule1at${lv}`] = a[`hi${lv}`] < 0; entry[`above0at${lv}`] = a[`lo${lv}`] > 0; entry[`inside10at${lv}`] = a[`lo${lv}`] > -LN110 && a[`hi${lv}`] < LN110; }
    if (m.lead !== 'overall') {
      entry.p95Ratio = num(Math.exp(a.p95LnRatio));
      for (const lv of Object.keys(LEVELS)) { entry[`ub${lv}`] = num(Math.exp(a[`ub${lv}`])); entry[`rule2at${lv}`] = a[`ub${lv}`] < LN110; }
      entry.failArm = m.failArm; entry.failRef = m.failRef; entry.notRun = m.notRun;
      entry.rule3 = m.failArm <= 0.01 * a.n;
      entry.medianArmKm = num(m.medianArmKm); entry.medianRefKm = num(m.medianRefKm); entry.medianArmAtKm = num(m.medianArmAtKm); entry.medianRefAtKm = num(m.medianRefAtKm);
    }
  }
  (c[m.cname] ??= {})[m.lead] = entry;
});
function statementPass(s, sub, cname, lv) {
  const c = cells[`${s.arm}/${s.ref}`]?.[sub]?.[cname];
  if (!c) return { pass: false, missing: true, failing: ['no cells'] };
  const failing = [];
  for (const lead of LEADS) {
    const e = c[lead];
    if (!e?.n) { failing.push(`day ${lead}: no pairs`); continue; }
    if (!e[`rule1at${lv}`]) failing.push(`day ${lead} rule 1`);
    if (s.form === 'xm') { if (!e[`rule2at${lv}`]) failing.push(`day ${lead} rule 2`); if (!e.rule3) failing.push(`day ${lead} rule 3`); }
  }
  return { pass: failing.length === 0, failing };
}
const verdicts = {};
for (const [fam, list] of Object.entries(FAMILY)) {
  let open = true;
  verdicts[fam] = list.map((s) => {
    const v = statementPass(s, 'pool', 'wk', '975');
    const row = { id: s.id, arm: s.arm, ref: s.ref, form: s.form, tested: open, pass: open ? v.pass : null, failing: v.failing,
      asIfTested: v.pass,
      beside: { wk95: statementPass(s, 'pool', 'wk', '95').pass, gw975: statementPass(s, 'pool', 'gw', '975').pass, gw95: statementPass(s, 'pool', 'gw', '95').pass },
      ownCells: Object.fromEntries(['primary', 'extension', 'Swarm A+C', 'Swarm B', 'GRACE-FO'].map((sub) => [sub, statementPass(s, sub, 'wk', '975').pass])),
      falsePositive: fp[s.id] };
    if (open && !v.pass) open = false;
    return row;
  });
}
// X2 against S72L, the owner's direct question: its rules apart
const m2 = FAMILY.M.find((s) => s.id === 'M2');
const m2Rule = (cname, lv, rule) => LEADS.every((l) => cells[`${m2.arm}/${m2.ref}`].pool[cname][l][`${rule}at${lv}`]);
const matchedInputs = { rule1: { wk975: m2Rule('wk', '975', 'rule1'), wk95: m2Rule('wk', '95', 'rule1'), gw975: m2Rule('gw', '975', 'rule1'), gw95: m2Rule('gw', '95', 'rule1') }, rule2: { wk975: m2Rule('wk', '975', 'rule2'), wk95: m2Rule('wk', '95', 'rule2'), gw975: m2Rule('gw', '975', 'rule2'), gw95: m2Rule('gw', '95', 'rule2') } };
// the parity reading, lead by lead (PLAN.md, What each outcome means)
const parity = Object.fromEntries(LEADS.map((l) => { const e = cells['RFa12c/P'].pool.wk[l]; const tie = !e.rule1at975 && !e.above0at975; return [l, { reading: e.rule1at975 ? 'lead' : e.above0at975 ? 'behind' : e.inside10at975 ? 'tie' : 'not determined', medianPct: e.medianPct, lo975: e.lo975, hi975: e.hi975, tie }]; }));
const calibrator = Object.fromEntries(LEADS.map((l) => { const e = cells['S17LPc/P'].pool.wk[l]; return [l, { reading: e.rule1at975 ? 'below P' : e.above0at975 ? 'above P' : 'holds 0', medianPct: e.medianPct, lo975: e.lo975, hi975: e.hi975 }]; }));
// how much of a lead is data age: S17LP's median over the arm's
const dataAge = Object.fromEntries(['RFa12', 'RFa24', 'RF17', 'R17'].map((a) => [a, Object.fromEntries(LEADS.map((l) => { const x = cells['S17LP/P'].pool.wk[l].medianPct, y = cells[`${a}/P`].pool.wk[l].medianPct; return [l, y < 0 ? +(100 * x / y).toFixed(0) : null]; }))]));

// ---- P's age and the public archive ------------------------------------------------------------------------------------------
const stat = (v) => (v.length ? { n: v.length, median: +quantile(v, 0.5).toFixed(2), p90: +quantile(v, 0.9).toFixed(2), max: +Math.max(...v).toFixed(1) } : { n: 0 });
const ageOf = (f) => stat(rows.filter((r) => r.set && (!f || f(r))).map((r) => r.set.ageHours));
const months = [...new Set(rows.map((r) => r.cutoff.slice(0, 7)))].sort();
const publicAge = { cutHours: ageCut.map((x) => +x.toFixed(2)), pool: ageOf(), primary: ageOf((r) => r.span === 'primary'), extension: ageOf((r) => r.span === 'extension'), xmWindowsMedian: 5.42, byMonth: Object.fromEntries(months.map((m) => [m, ageOf((r) => r.cutoff.startsWith(m))])) };
const daysDir = path.join(store, 'public/days'), noSetDays = [];
for (const f of fs.readdirSync(daysDir).filter((n) => n.endsWith('.json')).sort()) { const d = f.slice(0, 10); if (d < config.spans.extension.from || d > config.spans.primary.to) continue; const sets = JSON.parse(fs.readFileSync(path.join(daysDir, f), 'utf8')).sets; if (!sets.length) noSetDays.push(d); }
const rsga = JSON.parse(fs.readFileSync(path.join(store, 'inputs/rsga-normalization.json'), 'utf8')).counts;
const staleWeather = rows.filter((r) => r.rsga && (Date.parse(r.cutoff) - Date.parse(r.rsga.issued)) / 3600000 > 26).length;
// the failures and arms not run, by arm and cause: counts only
const failures = {};
for (const r of rows) for (const [n, a] of Object.entries({ ...(r.arms ?? {}), ...(r.P ? { P: r.P } : {}) })) if (!a.ok) { const why = a.notRun ? `not run: ${a.notRun}` : String(a.error).replace(/^XP 72 h: /, '').split(':').slice(0, 2).join(':').slice(0, 70); ((failures[n] ??= {})[why] ??= 0); failures[n][why] += 1; }
const refused = rows.filter((r) => /space-weather-out-of-range|refuses/.test(String(r.arms?.R17c?.error ?? '') + String(r.arms?.RF17c?.error ?? ''))).map((r) => r.set.creationAgeHours);

// ---- cost: every figure names its steps, output step and tolerance -------------------------------------------------------------
const times = (get) => { const v = rows.map(get).filter((x) => Number.isFinite(x)); return v.length ? { n: v.length, median: +(quantile(v, 0.5) / 1000).toFixed(2), p90: +(quantile(v, 0.9) / 1000).toFixed(2), mean: +(v.reduce((a, b) => a + b, 0) / v.length / 1000).toFixed(2) } : null; };
const cost = { ffmSeconds: Object.fromEntries(['RF17', 'RFa24', 'RFa12', 'RFa12c'].map((a) => [a, times((r) => r.timing?.ffmMs?.[a])])), xpSeconds: Object.fromEntries(['X2', 'R17', 'RFa12'].map((a) => [a, times((r) => r.timing?.fitMs?.[a])])), sgp4Seconds: Object.fromEntries(['S72L', 'S17LP'].map((a) => [a, times((r) => r.timing?.fitMs?.[a])])), windowSeconds: times((r) => (r.timing?.wallS ?? NaN) * 1000) };

const table = {
  experiment: config.id, task: config.task, registration: C.REGISTRATION, modulesCommit: build.modulesCommit, rowsDigest: digest, windows: counts, levels: { verdict: '97.5 %', beside: '95 %' }, clusters: { verdict: 'ISO week', beside: 'orbit group x ISO week' },
  verdicts, matchedInputs, parity, calibrator, dataAgeSharePct: dataAge, publicAge, publicDaysWithoutASet: noSetDays, rsgaNormalization: { extension: { changed: rsga.extension.changed, spacesOnly: rsga.extension.spacesOnly, apNotNumber: rsga.extension.apNotNumber, afrStandsInForAp: rsga.extension.afrStandsInForAp }, primary: { changed: rsga.primary.changed } }, windowsWithABulletinOver26h: staleWeather, failures, parityRefusals: { windows: refused.length, youngestSetCreatedHoursBeforeCutoff: refused.length ? +Math.min(...refused).toFixed(1) : null }, cost, cells,
};

// ---- the README ----------------------------------------------------------------------------------------------------------------
const f1 = (x) => (typeof x === 'number' ? (x >= 0 ? `+${x.toFixed(1)}` : x.toFixed(1)) : String(x));
const leadCell = (e, lv = '975') => (e?.n ? `${f1(e.medianPct)} [${f1(e[`lo${lv}`])}, ${f1(e[`hi${lv}`])}]` : 'none');
const line = (name, key, sub = 'pool', cname = 'wk', lv = '975') => { const c = cells[key]?.[sub]?.[cname]; return c ? `| ${name} | ${LEADS.map((l) => leadCell(c[l], lv)).join(' | ')} | ${LEADS.map((l) => c[l]?.[`ub${lv}`] ?? '').join(', ')} | ${c[1]?.n ?? 0}, ${c[1]?.clusters ?? 0} |` : `| ${name} | none |`; };
const head = `| | Day 1 | Day 2 | Day 3 | Day 7 | p95 upper bound | Pairs, clusters |\n|---|---|---|---|---|---|---|`;
const verdictWord = (v) => (v.tested ? (v.pass ? 'PASS' : `FAIL: ${v.failing.join(', ')}`) : `not tested (${v.asIfTested ? 'its cells meet the rule' : `its cells miss: ${v.failing.join(', ')}`})`);
const fpLine = (v) => { const w = v.falsePositive.wk, g = v.falsePositive.gw; return `${w['975'].wholeLeastFavorable} (gw ${g['975'].wholeLeastFavorable}); rule 1 by lead ${w['975'].rule1ByLead.join(', ')}; 95 % whole ${w['95'].wholeLeastFavorable}`; };
const own = (v) => Object.entries(v.ownCells).map(([k, p]) => `${k} ${p ? 'meets' : 'misses'}`).join('; ');
const statementRows = [...verdicts.M, ...verdicts.F].map((v) => `| ${v.id} | ${v.arm} / ${v.ref} | ${v.form === 'xm' ? "XM's rule" : 'rule 1, 4 leads'} | ${verdictWord(v)} | ${v.beside.wk95 ? 'meets' : 'misses'}, ${v.beside.gw975 ? 'meets' : 'misses'} | ${fpLine(v)} | ${own(v)} |`).join('\n');
const subTable = (key, title) => `**${title}**\n\n${head}\n${FULL.filter((s) => s !== 'pool' && cells[key]?.[s]).map((s) => line(s, key, s)).join('\n')}\n`;
const readme = `# XP2 fit design on unseen dates

Task \`${config.task}\`. Registered before any score: commit ${C.REGISTRATION.slice(0, 10)} (\`experiments/xp2-fit-design/PLAN.md\`). Modules ${build.modulesCommit.slice(0, 9)}, every wasm SHA-256 checked; no module changed. ${counts.primary.stored} windows on Swarm A, B, C and GRACE-FO 1, 2 (cutoffs ${config.spans.primary.from} to ${config.spans.primary.to}) and ${counts.extension.stored} on Swarm A, B, C (${config.spans.extension.from} to ${config.spans.extension.to}); ${counts.primary.excluded + counts.extension.excluded} excluded by XM's rules, ${counts.primary.errors + counts.extension.errors} with a row error. Rows digest ${digest}. Medians are percent change in the 3D RMS position error at days 1, 2, 3, 7, with 97.5 % percentile intervals on ISO-week clusters unless marked.

## What a pass means

Every fitted arm reads truth-quality precise products, which are not real-time, and P is the public set available at the cutoff. A pass at the cutoff reading answers the theory-and-fit question with zero-latency precise truth, not the console supply question. The parity reading removes the data age, not the data quality. No result here changes a module, the console default or a public claim by itself.

## Verdicts: two fixed sequences

| Id | Contrast | Form | At 97.5 %, ISO week | 95 %; orbit group x week at 97.5 % | False-positive rate on these dates, % (whole statement, least favorable null, at 97.5 %) | Own cells at 97.5 % |
|---|---|---|---|---|---|---|
${statementRows}

## Matched inputs: X2 against S72L, the owner's direct question

Rule 1 at every lead: ${matchedInputs.rule1.wk975 ? 'met' : 'not met'} at 97.5 % on ISO weeks (95 %: ${matchedInputs.rule1.wk95 ? 'met' : 'not met'}; orbit group x week 97.5 %: ${matchedInputs.rule1.gw975 ? 'met' : 'not met'}). Rule 2 at every lead: ${matchedInputs.rule2.wk975 ? 'met' : 'not met'} at 97.5 % (95 %: ${matchedInputs.rule2.wk95 ? 'met' : 'not met'}; orbit group x week 97.5 %: ${matchedInputs.rule2.gw975 ? 'met' : 'not met'}).

## Against the public set, cutoff reading

${head}
${line('RFa12 / P', 'RFa12/P')}
${line('RFa24 / P', 'RFa24/P')}
${line('RF17 / P', 'RF17/P')}
${line('R17 / P', 'R17/P')}
${line('X2 / P', 'X2/P')}
${line('S17LP / P (data age)', 'S17LP/P')}
${line('S72L / P', 'S72L/P')}
${line('S17LF / P', 'S17LF/P')}

The same at 95 % on ISO weeks, and at 97.5 % on orbit group x week:

${head}
${line('RFa12 / P, 95 %', 'RFa12/P', 'pool', 'wk', '95')}
${line('RF17 / P, 95 %', 'RF17/P', 'pool', 'wk', '95')}
${line('RFa12 / P, gw', 'RFa12/P', 'pool', 'gw', '975')}
${line('RF17 / P, gw', 'RF17/P', 'pool', 'gw', '975')}

## Matched and diagnostic contrasts

${head}
${line('X2 / S72L', 'X2/S72L')}
${line('X2 / S72L, 95 %', 'X2/S72L', 'pool', 'wk', '95')}
${line('X2 / S72L, gw', 'X2/S72L', 'pool', 'gw', '975')}
${line('R17 / S17LF', 'R17/S17LF')}
${line('RF17 / X2', 'RF17/X2')}
${line('RFa12 / S17LP', 'RFa12/S17LP')}
${line('RF17 / S17LP', 'RF17/S17LP')}
${line('R17 / S17LP', 'R17/S17LP')}
${line('RFa12 / RF17', 'RFa12/RF17')}

Data age, S17LP's median as a share of the arm's lead over P, %: ${Object.entries(dataAge).map(([a, v]) => `${a} ${LEADS.map((l) => v[l] ?? 'none').join(', ')}`).join('; ')}.

## Parity: arcs ending at the set's creation

${head}
${line('RFa12c / P', 'RFa12c/P')}
${line('RFa24c / P (primary span)', 'RFa24c/P')}
${line('RF17c / P (primary span)', 'RF17c/P')}
${line('R17c / P', 'R17c/P')}
${line('S17LPc / P (calibrator)', 'S17LPc/P')}
${line('RFa12c / S17LPc', 'RFa12c/S17LPc')}
${line('RFa12c / P, sets created within 6 h', 'RFa12c/P', 'set created within 6 h')}

Reading of RFa12c by lead: ${LEADS.map((l) => `day ${l} ${parity[l].reading}`).join('; ')}. A tie has an interval holding 0 inside -9.1 to +10 %; a wider interval holding 0 is "not determined". The calibrator S17LPc: ${LEADS.map((l) => `day ${l} ${calibrator[l].reading}`).join('; ')}. Parity arms read the weather rows of the cutoff.

## The public set's age on these dates

P's age at 00:00 UTC, hours: pool median ${publicAge.pool.median}, p90 ${publicAge.pool.p90}; primary span ${publicAge.primary.median}; extension ${publicAge.extension.median}; XM's windows ${publicAge.xmWindowsMedian}. By month: ${Object.entries(publicAge.byMonth).map(([m, v]) => `${m} ${v.median}`).join(', ')}. Days in the spans whose archive file holds no set of these five objects: ${noSetDays.length ? noSetDays.join(', ') : 'none'}. Terciles cut at ${publicAge.cutHours.join(' and ')} h; if these dates flatter the arms, the oldest third below shows it.

${subTable('RFa12/P', 'RFa12 / P by span, group, age and storm')}
${subTable('RF17/P', 'RF17 / P by span, group, age and storm')}
${subTable('S17LP/P', 'S17LP / P by span, group, age and storm')}
${subTable('X2/S72L', 'X2 / S72L by span, group, age and storm')}

## Overall statement, report only

Per window the mean ln ratio over the four leads, the median's change, 97.5 % interval, ISO weeks: ${[['RFa12', 'P'], ['RFa24', 'P'], ['RF17', 'P'], ['R17', 'P'], ['S17LP', 'P'], ['RFa12c', 'P'], ['X2', 'S72L']].map(([a, r]) => `${a} / ${r} ${leadCell(cells[`${a}/${r}`].pool.wk.overall)}`).join('; ')}.

## The 12 h term, report only

A statistic at output with the constants frozen from XM's windows; nothing is fitted with it.

${head}
${line('P + term / P', 'P*/P')}
${line('RFa12 + term / P + term', 'RFa12*/P*')}
${line('RF17 + term / P + term', 'RF17*/P*')}
${line('R17 + term / P + term', 'R17*/P*')}
${line('X2 + term / P + term', 'X2*/P*')}
${line('S17LP + term / P + term', 'S17LP*/P*')}
${line('RFa12 + term / P', 'RFa12*/P')}

## Data preparation

RSGA bulletins of the extension (2024-12-28 to 2025-09-30), normalized before any score: ${rsga.extension.changed} failed XM's parser; ${rsga.extension.spacesOnly} held only spaces after the slash; ${rsga.extension.apNotNumber} held an observed Ap that is not a number (36 NA, one garbled N60), each taking the previous bulletin's estimate. Afr stands in for Ap on ${rsga.extension.afrStandsInForAp.length} line: ${rsga.extension.afrStandsInForAp.map((a) => `${a.bulletin} "${a.line}"`).join('; ')}. On the primary span ${rsga.primary.changed} bulletins changed. Windows reading a bulletin over 26 h old: ${staleWeather}. Swarm truth for the extension: ESA reduced-dynamic SP3 COM, newest baseline, file start days 2024-12-27 to 2025-09-29, converted by \`fetch-swarm.mjs\`, byte-identical to the archive's conversion on a spent day.

The GFZ file holds no F10.7 for 2025-02-12 and 2025-02-17; by XM3's rule a day without a row takes the last row at or before it.

## Failures and arms not run

${Object.entries(failures).sort().map(([n, v]) => `${n}: ${Object.entries(v).map(([w, c]) => `${c} ${w}`).join('; ')}`).join('. ') || 'None'}. A failure is a loss in its cells; an arm not run leaves them, counted. The space-weather refusals of R17c and RF17c (${refused.length} windows, sets created ${refused.length ? Math.min(...refused).toFixed(1) : 'none'} h or more before the cutoff) come from their 72 h arcs starting before the cutoff's rows (PLAN.md, Amendments 1 and 2): report-only arms, not fit failures, and RFa12c cannot reach them.

## Cost

FFM fit: RK78, relative tolerance 1e-10, absolute 1e-7, steps up to 120 s, input 300 s, seconds (median, p90, mean): ${Object.entries(cost.ffmSeconds).map(([a, v]) => `${a} ${v?.median}, ${v?.p90}, ${v?.mean}`).join('; ')}. XP fit: third-order Runge-Kutta grid about 3.1 h, no tolerance, input 300 s: ${Object.entries(cost.xpSeconds).map(([a, v]) => `${a} ${v?.median} s`).join('; ')}. SGP4 fit: analytic, Levenberg-Marquardt 1e-10, input 300 s: ${Object.entries(cost.sgp4Seconds).map(([a, v]) => `${a} ${v?.median} s`).join('; ')}. Output 300 s. Under 8 niced workers on a loaded machine.

## Disclosures

These dates were analyzed before for other questions; the spent-window selection of RFa12 and RF17, C2's every-second-day fit of Oct-Dec 2025 and plan H1's dev half are named in PLAN.md. The pool is 87 % Swarm. Space-Track, Planet and truth states stay in the local store; results are aggregates.
`;

const tablePath = path.join(results, 'table.json'), readmePath = path.join(results, 'README.md');
const tableText = `${JSON.stringify(table, null, 1)}\n`;
if (args.check) {
  const a = fs.readFileSync(tablePath, 'utf8'), b = fs.readFileSync(readmePath, 'utf8');
  if (a !== tableText) { console.error('table.json differs from the rebuild'); process.exit(1); }
  if (b !== readme) { console.error('README.md differs from the rebuild'); process.exit(1); }
  console.log(`table.json and README.md rebuilt byte for byte (rows digest ${digest})`);
} else {
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(tablePath, tableText); fs.writeFileSync(readmePath, readme);
  console.log(`wrote ${tablePath} and ${readmePath}: rows digest ${digest}`);
}
process.exit(0);
