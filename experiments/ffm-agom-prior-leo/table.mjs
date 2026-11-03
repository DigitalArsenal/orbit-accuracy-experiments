// XM6 table (PLAN.md, What is read and reported): each arm against P and against XM3's F2 with XM3's cluster bootstrap (cellStats and its order statistics
// copied unchanged from XM3's table.mjs at 22313bf), with the cutoffs of 2026-W04 out too; whether the post-storm tail moves; AGOM and B against their
// seeds. Exploratory: every result is a lead for a registration. Written to results/ffm-agom-prior-leo/table.json; the cost printed beside it, never in the
// table. Statistics only.
//   node experiments/ffm-agom-prior-leo/table.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, store, results, root, XM3, xm3Dir, xm3Rows, xm3Table, gfzChecked, committed, PLAN_COMMIT } from './common.mjs';

const { config: C3, build, readJsonl, sha256, median, dateOf, ms, DAY } = XM3;
const GROUPS = Object.keys(C3.groups);
const LEADS = C3.scoring.leadDays;
const DRAWS = C3.statistics.bootstrap.draws;
const LN110 = Math.log(config.reading.bound);
const NAMES = Object.keys(config.arms);
const TABLE = path.join(results, 'table.json');

/** xorshift128+ seeded by SHA-256 of `label` (XM-fast's generator), a float in [0, 1). */
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

// ---- order statistics over [0, n) of a Float64Array without NaN (+-Infinity allowed); XM-fast's ----------------------
function select(a, n, kk) {
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) {
      while (a[i] < pivot) i += 1;
      while (a[j] > pivot) j -= 1;
      if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i += 1; j -= 1; }
    }
    if (kk <= j) hi = j; else if (kk >= i) lo = i; else break;
  }
  return a[kk];
}
const between = (x, y, f) => { if (x === y || f === 0) return x; if (x === -Infinity && y === Infinity) return NaN; if (y === Infinity) return Infinity; if (x === -Infinity) return -Infinity; return x + (y - x) * f; };
/** The q-quantile (linear between order statistics, position q (n - 1)); reorders a. */
function quantile(a, n, q) {
  const p = q * (n - 1), lo = Math.floor(p), f = p - lo;
  const x = select(a, n, lo);
  if (f === 0) return x;
  let y = Infinity;
  for (let i = lo + 1; i < n; i += 1) if (a[i] < y) y = a[i];
  return between(x, y, f);
}
const up = (x) => (Number.isNaN(x) ? Infinity : x);   // a NaN statistic counts against the arm
const lnRatio = (a, r) => up(Math.log(a) - Math.log(r));
const finiteMedian = (v) => { const a = v.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return null; const h = Math.floor(a.length / 2); return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
const num = (x) => (Number.isFinite(x) ? x : x === Infinity ? 'Infinity' : x === -Infinity ? '-Infinity' : null);
const val = (x) => (x === 'Infinity' ? Infinity : x === '-Infinity' ? -Infinity : x);

/** One cell: the point statistics, the cluster-bootstrap intervals and the three rules (XM3's cellStats, unchanged). */
function cellStats(pairs, seed) {
  const N = pairs.length;
  const out = { pairs: N, clusterCount: new Set(pairs.map((p) => p.cluster)).size, armFailures: pairs.filter((p) => p.armFailed).length, refFailures: pairs.filter((p) => p.refFailed).length };
  if (!N) return { ...out, pass: false, why: 'no pairs' };
  const D = Float64Array.from(pairs, (p) => p.d), EA = Float64Array.from(pairs, (p) => p.eArm), ER = Float64Array.from(pairs, (p) => p.eRef);
  const medD = up(quantile(Float64Array.from(D), N, 0.5));
  const lnP95 = lnRatio(quantile(Float64Array.from(EA), N, 0.95), quantile(Float64Array.from(ER), N, 0.95));
  const names = [...new Set(pairs.map((p) => p.cluster))].sort();
  const members = names.map((c) => pairs.flatMap((p, i) => (p.cluster === c ? [i] : [])));
  const C = names.length, cap = C * Math.max(...members.map((x) => x.length));
  const bD = new Float64Array(cap), bA = new Float64Array(cap), bR = new Float64Array(cap);
  const meds = new Float64Array(DRAWS), lrs = new Float64Array(DRAWS);
  const next = generator(seed);
  for (let r = 0; r < DRAWS; r += 1) {
    let m = 0;
    for (let j = 0; j < C; j += 1) for (const i of members[Math.floor(next() * C)]) { bD[m] = D[i]; bA[m] = EA[i]; bR[m] = ER[i]; m += 1; }
    meds[r] = up(quantile(bD, m, 0.5));
    lrs[r] = lnRatio(quantile(bA, m, 0.95), quantile(bR, m, 0.95));
  }
  meds.sort(); lrs.sort();
  const ci = (a) => [quantile(a, DRAWS, 0.025), quantile(a, DRAWS, 0.975)];
  const ciMed = ci(meds), ciLr = ci(lrs);
  const rules = { medianBelow0: ciMed[1] < 0, p95RatioBelow110: ciLr[1] < LN110, failuresAtMost1pc: out.armFailures <= 0.01 * N };
  return {
    ...out,
    medianD: num(medD), medianRatioPercent: Number.isFinite(medD) ? (Math.exp(medD) - 1) * 100 : num(medD), ciMedianD: ciMed.map(num),
    lnP95Ratio: num(lnP95), ciLnP95Ratio: ciLr.map(num),
    medianEArmKm: finiteMedian(pairs.map((p) => p.eArm)), medianERefKm: finiteMedian(pairs.map((p) => p.eRef)),
    medianAtArmKm: finiteMedian(pairs.map((p) => p.atArm)), medianAtRefKm: finiteMedian(pairs.map((p) => p.atRef)),
    rules, pass: rules.medianBelow0 && rules.p95RatioBelow110 && rules.failuresAtMost1pc,
  };
}

/** An arm of one window: { o: XM3's row, m: this experiment's row }. */
const armOf = (w, name) => (name === 'P' ? w.o.P : name === 'F2O' ? w.o.arms?.F2 : w.m?.arms?.[name]);
/** A window that enters a cell at a lead (XM3's pairsOf): the bin entered, the 72 h arc covered, the RSGA in force. */
const inCell = (w, group, lead) => w.o.group === group && !w.o.error && !w.o.excluded && w.o.entered.includes(lead) && w.o.arc && !w.o.arc.excluded && !w.o.O?.excluded;
const failed = (a, lead) => !a.ok || !a.days?.[lead];
const eOf = (w, name, lead) => { const a = armOf(w, name); return !a || a.notRun || failed(a, lead) ? Infinity : a.days[lead].rmsKm; };

function pairsOf(all, group, arm, ref, lead, keep = () => true) {
  const out = [];
  for (const w of all) {
    if (!inCell(w, group, lead) || !keep(w)) continue;
    const a = armOf(w, arm), r = armOf(w, ref);
    if (!r || r.notRun || !a || a.notRun) continue;
    const armFailed = failed(a, lead), refFailed = failed(r, lead);
    const eArm = armFailed ? Infinity : a.days[lead].rmsKm, eRef = refFailed ? Infinity : r.days[lead].rmsKm;
    const d = armFailed ? Infinity : refFailed ? -Infinity : Math.log(eArm) - Math.log(eRef);
    out.push({ key: w.o.key, cluster: `${w.o.cluster}|${w.o.isoWeek}`, d, eArm, eRef, armFailed, refFailed, atArm: armFailed ? null : a.days[lead].atKm, atRef: refFailed ? null : r.days[lead].atKm });
  }
  return out.sort((x, y) => (x.key < y.key ? -1 : 1));
}

function cellsOf(all, group, lead) {
  const noWeek = (w) => w.o.isoWeek !== config.week;
  const out = [];
  for (const arm of NAMES) for (const ref of ['P', 'F2O']) for (const [without, keep] of [[null, undefined], [config.week, noWeek]]) {
    const seed = `XM6|${group}|${arm}/${ref}|${lead}|orbit${without ? '|noW04' : ''}`;
    out.push({ group, lead, arm, ref, without, seed, ...cellStats(pairsOf(all, group, arm, ref, lead, keep), seed) });
  }
  return out;
}

const percentChange = (d) => (Math.exp(val(d)) - 1) * 100;
/** The plan's words for each arm in the group and days it names: holds against F2O, closes against P, day 7 against F2O. Report only. */
function readings(cells) {
  const { group, days, bound } = config.reading;
  const get = (arm, ref, lead, without = null) => cells.find((c) => c.group === group && c.arm === arm && c.ref === ref && c.lead === lead && c.without === without);
  return Object.fromEntries(NAMES.map((arm) => {
    const holdsAt = days.filter((l) => val(get(arm, 'F2O', l).ciMedianD[1]) < 0);
    const closesAt = days.filter((l) => Math.exp(val(get(arm, 'P', l).ciLnP95Ratio[1])) < bound);
    const aboveAt = days.filter((l) => val(get(arm, 'F2O', l).ciMedianD[0]) > 0);
    return [arm, { holdsAt, closesAt, aboveF2OAt: aboveAt, day7AboveF2O: val(get(arm, 'F2O', 7).ciMedianD[0]) > 0, bounds: Object.fromEntries(LEADS.map((l) => [l, Math.exp(val(get(arm, 'P', l).ciLnP95Ratio[1]))])), boundsNoWeek: Object.fromEntries(LEADS.map((l) => [l, Math.exp(val(get(arm, 'P', l, config.week).ciLnP95Ratio[1]))])) }];
  }));
}

/** Whether the post-storm tail moves: the week and the storm arc in each arm's worst 5 %, who stays, and the median e at the post-storm cutoffs. */
function tailOf(all, group, lead, W) {
  const rows = all.filter((w) => inCell(w, group, lead) && armOf(w, 'F2O') && !armOf(w, 'F2O').notRun);
  const n = rows.length, top = Math.ceil(config.worst.share * n);
  const byE = (name) => (x, y) => { const ex = eOf(x, name, lead), ey = eOf(y, name, lead); return ex === ey ? (x.o.key < y.o.key ? -1 : 1) : ey - ex; };
  const names = ['F2O', 'P', ...NAMES];
  const worst = Object.fromEntries(names.map((name) => [name, rows.filter((w) => !armOf(w, name)?.notRun).sort(byE(name)).slice(0, top)]));
  const stormArc = (w) => { const D0 = ms(w.o.cutoff); return [-3, -2, -1].some((k) => W.stormDay(dateOf(D0 + k * DAY))); };
  const post = rows.filter((w) => { const d = dateOf(ms(w.o.cutoff)); return d >= config.postStorm.from && d <= config.postStorm.to; });
  const f2oSet = new Set(worst.F2O.map((w) => w.o.key));
  return {
    lead, n, top,
    week: Object.fromEntries(names.map((name) => [name, worst[name].filter((w) => w.o.isoWeek === config.week).length])),
    stormArc: Object.fromEntries(names.map((name) => [name, worst[name].filter(stormArc).length])),
    stayWithF2O: Object.fromEntries(NAMES.map((name) => [name, worst[name].filter((w) => f2oSet.has(w.o.key)).length])),
    alsoP: Object.fromEntries(['F2O', ...NAMES].map((name) => { const p = new Set(worst.P.map((w) => w.o.key)); return [name, worst[name].filter((w) => p.has(w.o.key)).length]; })),
    postStorm: { windows: post.length, medianKm: Object.fromEntries(names.map((name) => [name, median(post.map((w) => eOf(w, name, lead)))])) },
    stormArcMedianKm: Object.fromEntries(names.map((name) => [name, median(rows.filter(stormArc).map((w) => eOf(w, name, lead)))])),
    noStormArcMedianKm: Object.fromEntries(names.map((name) => [name, median(rows.filter((w) => !stormArc(w)).map((w) => eOf(w, name, lead)))])),
  };
}

const paramOf = (a, kind) => a?.fit?.parameters?.find((p) => p.kind === kind)?.value;
/** AGOM and B against their seeds, and the fits, per group and orbit group, each arm beside F2O. */
function fitsOf(all, settingsFor) {
  const out = {};
  const clusters = [...new Set(all.map((w) => `${w.o.group}|${w.o.cluster}`))];
  for (const id of clusters) {
    const set = all.filter((w) => `${w.o.group}|${w.o.cluster}` === id);
    out[id] = {};
    for (const name of ['F2O', ...NAMES]) {
      const arms = set.map((w) => ({ w, a: armOf(w, name) })).filter((x) => x.a && !x.a.notRun);
      const ratio = (kind) => arms.map(({ w, a }) => { const v = paramOf(a, kind), seed = settingsFor(w.o.norad).parameters.find((p) => p.kind === kind).value; return Number.isFinite(v) ? v / seed : null; }).filter((v) => v !== null);
      const terminations = {};
      for (const { a } of arms) { const t = a.fit?.termination ?? (a.ok ? 'ok' : String(a.error ?? '').split(':')[0]); terminations[t] = (terminations[t] ?? 0) + 1; }
      const b = ratio('DRAG_AREA_OVER_MASS'), agom = ratio('SRP_AREA_OVER_MASS');
      out[id][name] = { windows: arms.length, notRun: set.filter((w) => armOf(w, name)?.notRun).length, ok: arms.filter(({ a }) => a.ok).length, terminations,
        medianRounds: median(arms.map(({ a }) => a.fit?.iterations).filter(Number.isFinite)), maxRounds: Math.max(0, ...arms.map(({ a }) => a.fit?.iterations).filter(Number.isFinite)),
        medianBOverSeed: median(b), bAtZero: b.filter((v) => v === 0).length, medianAgomOverSeed: median(agom), agomAtZero: agom.filter((v) => v === 0).length };
    }
  }
  return out;
}

const rowsDir = path.join(store, 'rows');
/** The stored rows, one per key (the first unflagged row, XM3's rule), sorted. */
export function storedRows() {
  const byKey = new Map();
  for (const f of (fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((x) => /^O\.s\d+\.jsonl$/.test(x)).sort() : [])) for (const r of readJsonl(path.join(rowsDir, f))) if (!byKey.has(r.key) || byKey.get(r.key).defect) byKey.set(r.key, r);
  return [...byKey.values()].sort((x, y) => (x.key < y.key ? -1 : 1));
}
const comparableArms = (r) => JSON.stringify({ key: r.key, arms: r.arms, binEpochs: r.binEpochs, entered: r.entered });

/** The table of the stored rows (deterministic: no times). */
export async function buildTable(mRows = storedRows()) {
  const X3 = await xm3Rows(); xm3Table();
  const byKey = new Map(mRows.map((r) => [r.key, r]));
  const all = [...X3.values()].map((o) => ({ o, m: byKey.get(o.key) })).filter((w) => w.m).sort((x, y) => (x.o.key < y.o.key ? -1 : 1));
  const groups = GROUPS.filter((g) => all.some((w) => w.o.group === g));
  const cells = groups.flatMap((group) => LEADS.flatMap((lead) => cellsOf(all, group, lead)));
  const W = await import(path.join(root, C3.xm.dir, 'lib/weather.mjs'));
  gfzChecked(W);
  const { settingsFor } = await import(path.join(root, xm3Dir, 'lib/ffm.mjs'));
  const tail = Object.fromEntries(groups.map((group) => [group, Object.fromEntries(LEADS.map((lead) => [lead, tailOf(all, group, lead, W)]))]));
  return {
    experiment: config.experiment, id: config.id, task: config.task, exploratory: config.exploratory, modulesCommit: build.modulesCommit, plan: PLAN_COMMIT,
    rowsDigest: sha256(mRows.map(comparableArms).join('\n')), rows: mRows.length, groups, readings: readings(cells), tail, fits: fitsOf(all, settingsFor), cells,
  };
}

export const tableText = (table) => `${JSON.stringify(table, null, 1)}\n`;
/** The rebuilt table equals the committed results/ffm-agom-prior-leo/table.json byte for byte. */
export function sameAsCommitted(table) {
  const held = committed('results/ffm-agom-prior-leo/table.json');
  return !!held && held.toString('utf8') === tableText(table);
}

/** The cost of the stored rows (seconds per fit and forecast, per group and arm; window wall time), printed only. */
export function cost(rows) {
  const out = {};
  for (const r of rows) for (const name of NAMES) {
    const t = r.timing?.[name];
    if (!t?.fitMs) continue;
    const id = `${r.group}|${name}`;
    out[id] ??= { fits: [], forecasts: [] };
    out[id].fits.push(t.fitMs / 1000);
    if (t.forecastMs) out[id].forecasts.push(t.forecastMs / 1000);
  }
  const wall = rows.map((r) => r.timing?.wallSeconds).filter(Number.isFinite);
  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  return { ...Object.fromEntries(Object.entries(out).map(([id, v]) => [id, { fits: v.fits.length, medianFitSeconds: median(v.fits), meanFitSeconds: mean(v.fits), medianForecastSeconds: median(v.forecasts) }])), windows: wall.length, medianWindowSeconds: median(wall), workerHours: wall.reduce((s, x) => s + x, 0) / 3600 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const rows = storedRows();
  const t0 = Date.now();
  const table = await buildTable(rows);
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(TABLE, tableText(table));
  console.error(`XM6 table: ${table.rows} rows, ${table.cells.length} cells, ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${TABLE}`);
  console.error(`cost: ${JSON.stringify(cost(rows))}`);
  process.exit(0);
}
