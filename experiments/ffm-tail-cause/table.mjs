// XM5 table (PLAN.md, Statistics, What each outcome means): the cells C1 to C5 from XM3's stored rows and the M rows with XM3's cluster
// bootstrap (cellStats and its order statistics copied unchanged from XM3's table.mjs at 22313bf), C4 checked against XM3's committed cells,
// the outcome the registration names, and the tail accounting (report only). Written to results/ffm-tail-cause/table.json; the cost printed
// beside it, never in the table (the table is deterministic). Statistics only.
//   node experiments/ffm-tail-cause/table.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, store, results, root, XM3, REGISTRATION, committed, xm3Rows, xm3Table, gfzChecked } from './common.mjs';

const { config: C3, build, readJsonl, sha256, median, comparable, dateOf, ms, DAY, HOUR } = XM3;
const GROUPS = Object.keys(C3.groups);
const LEADS = C3.scoring.leadDays;
const ARC = C3.fit.arcHours;
const DRAWS = C3.statistics.bootstrap.draws;
const LN110 = Math.log(config.closes.bound);
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

/** An arm of one window: { o: XM3's row, m: its M row }. */
const armOf = (w, name) => (name === 'P' ? w.o.P : name === 'F2O' ? w.o.arms?.F2 : w.m?.arms?.F2);
/** A window that enters a cell at a lead (XM3's pairsOf): the bin entered, the arc covered, the RSGA in force. */
const inCell = (w, group, lead) => w.o.group === group && !w.o.error && !w.o.excluded && w.o.entered.includes(lead) && w.o.arc && !w.o.arc.excluded && !w.o.O?.excluded;
const failed = (a, lead) => !a.ok || !a.days?.[lead];
const eOf = (w, name, lead) => { const a = armOf(w, name); return !a || failed(a, lead) ? Infinity : a.days[lead].rmsKm; };

/** The pairs of one cell (XM3's pairsOf, with the arms named across conditions). */
function pairsOf(all, group, clusters, arm, ref, lead, keep = () => true) {
  const out = [];
  for (const w of all) {
    if (!inCell(w, group, lead) || !keep(w)) continue;
    const a = armOf(w, arm), r = armOf(w, ref);
    if (!r || r.notRun || !a || a.notRun) continue;
    const armFailed = failed(a, lead), refFailed = failed(r, lead);
    const eArm = armFailed ? Infinity : a.days[lead].rmsKm, eRef = refFailed ? Infinity : r.days[lead].rmsKm;
    const d = armFailed ? Infinity : refFailed ? -Infinity : Math.log(eArm) - Math.log(eRef);
    out.push({ key: w.o.key, cluster: clusters === 'orbit' ? `${w.o.cluster}|${w.o.isoWeek}` : `${w.o.norad}|${w.o.isoWeek}`, d, eArm, eRef, armFailed, refFailed,
      atArm: armFailed ? null : a.days[lead].atKm, atRef: refFailed ? null : r.days[lead].atKm });
  }
  return out.sort((x, y) => (x.key < y.key ? -1 : 1));
}

/** The registered cells of one group and lead. */
function cellsOf(all, group, lead) {
  const week = config.cells.C5.without;
  const noWeek = (w) => w.o.isoWeek !== week;
  const spec = [
    ['C1', 'F2M', 'P', 'orbit', `XM2|${group}|${ARC}|M|F2/P|${lead}|orbit`],
    ['C2', 'F2M', 'P', 'satellite', `XM2|${group}|${ARC}|M|F2/P|${lead}|satellite`],
    ['C3', 'F2M', 'F2O', 'orbit', `XM5|${group}|${ARC}|M/O|F2|${lead}|orbit`],
    ['C4', 'F2O', 'P', 'orbit', `XM2|${group}|${ARC}|O|F2/P|${lead}|orbit`],
    ['C4', 'F2O', 'P', 'satellite', `XM2|${group}|${ARC}|O|F2/P|${lead}|satellite`],
    ['C5', 'F2O', 'P', 'orbit', `XM5|${group}|${ARC}|O|F2/P|${lead}|orbit|noW04`, noWeek],
    ['C5', 'F2M', 'P', 'orbit', `XM5|${group}|${ARC}|M|F2/P|${lead}|orbit|noW04`, noWeek],
  ];
  return spec.map(([cell, arm, ref, clusters, seed, keep]) => ({ cell, group, lead, arm, ref, clusters, seed, ...cellStats(pairsOf(all, group, clusters, arm, ref, lead, keep), seed) }));
}

const bound = (c) => Math.exp(val(c.ciLnP95Ratio[1]));

/** The outcome the registration names, from C1's bound and C3's p95 interval in the registered group and days. */
function outcome(cells) {
  const { group, days, bound: limit } = config.closes;
  const get = (cell, arm, lead) => cells.find((c) => c.cell === cell && c.group === group && c.arm === arm && c.lead === lead && c.clusters === 'orbit');
  const rows = days.map((lead) => ({ lead, boundM: bound(get('C1', 'F2M', lead)), boundO: bound(get('C4', 'F2O', lead)), closes: bound(get('C1', 'F2M', lead)) < limit, c3LowerAbove0: val(get('C3', 'F2M', lead).ciLnP95Ratio[0]) > 0 }));
  const closes = rows.filter((r) => r.closes).length;
  const name = closes === days.length ? 'closes at all of days 1-3' : closes ? 'closes at some of days 1-3' : rows.some((r) => r.c3LowerAbove0) ? 'observed daily rows make the tail worse' : 'leaves it at all of days 1-3';
  return { name, group, limit, days: rows };
}

// ---- the tail accounting (PLAN.md; report only) ----------------------------------------------------------------------------
const binOf = (v) => { const b = config.apBins.find(([lo, hi]) => v >= lo && (hi === null || v <= hi)); return b[1] === null ? `${b[0]}+` : `${b[0]}-${b[1]}`; };
const byE = (name, lead) => (x, y) => { const ex = eOf(x, name, lead), ey = eOf(y, name, lead); return ex === ey ? (x.o.key < y.o.key ? -1 : 1) : ey - ex; };

/** One group and lead: the worst 5 % of F2O, F2M and P, counted by ISO week, cutoff, Ap at the cutoff and storm contact, beside all windows. */
function accountingOf(all, group, lead, weather) {
  const rows = all.filter((w) => inCell(w, group, lead) && armOf(w, 'F2O') && !armOf(w, 'F2O').notRun);
  const n = rows.length, top = Math.ceil(config.worst.share * n);
  const worst = Object.fromEntries(['F2O', 'F2M', 'P'].map((name) => [name, new Set([...rows].sort(byE(name, lead)).slice(0, top).map((w) => w.o.key))]));
  const countBy = (label) => {
    const out = {};
    for (const w of rows) {
      const c = label(w), x = (out[c] ??= { all: 0, F2O: 0, F2M: 0, P: 0 });
      x.all += 1;
      for (const name of ['F2O', 'F2M', 'P']) if (worst[name].has(w.o.key)) x[name] += 1;
    }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
  };
  const inWorstOnly = (table) => Object.fromEntries(Object.entries(table).filter(([, x]) => x.F2O || x.F2M || x.P));
  const percentile = (w) => (100 * rows.filter((x) => eOf(x, 'P', lead) <= eOf(w, 'P', lead)).length) / n;
  const worstForP = (name) => {
    const set = rows.filter((w) => worst[name].has(w.o.key));
    const both = set.filter((w) => worst.P.has(w.o.key)).length;
    return { also: both, share: both / top, pMedianPercentile: median(set.map(percentile)), shareAboveP: set.filter((w) => eOf(w, name, lead) > eOf(w, 'P', lead)).length / top };
  };
  const ratios = rows.filter((w) => worst.F2O.has(w.o.key)).map((w) => eOf(w, 'F2M', lead) / eOf(w, 'F2O', lead));
  const lnB = (w, name) => {
    const b = armOf(w, name)?.fit?.parameters?.find((p) => p.kind === 'DRAG_AREA_OVER_MASS')?.value;
    return Number.isFinite(b) && b > 0 ? Math.log(b / weather.seed(w.o.norad)) : null;
  };
  const absLnMO = (w) => { const a = lnB(w, 'F2M'), b = lnB(w, 'F2O'); return a === null || b === null ? null : Math.abs(a - b); };
  const bOf = (set) => {
    const ok = (v) => v.filter(Number.isFinite);
    return { windows: set.length, medianLnBSeedF2O: median(ok(set.map((w) => lnB(w, 'F2O')))), medianLnBSeedF2M: median(ok(set.map((w) => lnB(w, 'F2M')))), medianAbsLnBMO: median(ok(set.map(absLnMO))) };
  };
  return {
    lead, n, top,
    byWeek: countBy((w) => w.o.isoWeek),
    byCutoff: inWorstOnly(countBy((w) => dateOf(ms(w.o.cutoff)))),
    byApBefore: countBy((w) => binOf(weather.ap(ms(w.o.cutoff) - DAY))),
    byApDay: countBy((w) => binOf(weather.ap(ms(w.o.cutoff)))),
    byApIssued: countBy((w) => binOf(weather.issued(ms(w.o.cutoff)))),
    byStormContact: countBy((w) => weather.contact(ms(w.o.cutoff), lead)),
    worstForP: { F2O: worstForP('F2O'), F2M: worstForP('F2M'), allWindowsShareAboveP: { F2O: rows.filter((w) => eOf(w, 'F2O', lead) > eOf(w, 'P', lead)).length / n, F2M: rows.filter((w) => eOf(w, 'F2M', lead) > eOf(w, 'P', lead)).length / n } },
    shift: { stay: rows.filter((w) => worst.F2O.has(w.o.key) && worst.F2M.has(w.o.key)).length, medianRatioM_O: median(ratios.filter(Number.isFinite)) },
    b: { all: bOf(rows), worstF2O: bOf(rows.filter((w) => worst.F2O.has(w.o.key))), worstF2M: bOf(rows.filter((w) => worst.F2M.has(w.o.key))) },
  };
}

/** What the accounting reads from the weather files and the seeds. */
async function weatherOf() {
  const W = await import(path.join(root, C3.xm.dir, 'lib/weather.mjs'));
  gfzChecked(W);
  const { settingsFor } = await import(path.join(root, config.xm3.dir, 'lib/ffm.mjs'));
  const { days } = W.gfzDays();
  const issued = new Map();
  return {
    ap: (t) => days.get(dateOf(t)).ap,
    issued: (D0) => {
      if (!issued.has(D0)) issued.set(D0, W.rowsO(D0 - ARC * HOUR - C3.conditions.rowsMarginDays * DAY, D0).rows.find((r) => r.date === dateOf(D0)).ap);
      return issued.get(D0);
    },
    contact: (D0, lead) => {
      const anyStorm = (from, to) => { for (let k = from; k <= to; k += 1) if (W.stormDay(dateOf(D0 + k * DAY))) return true; return false; };
      const arc = anyStorm(-3, -1), forecast = anyStorm(0, lead - 1);
      return arc && forecast ? 'both' : arc ? 'arc' : forecast ? 'forecast' : 'neither';
    },
    seed: (norad) => settingsFor(norad).parameters.find((p) => p.kind === 'DRAG_AREA_OVER_MASS').value,
  };
}

// ---- the fits and the windows ----------------------------------------------------------------------------------------------
const outcomeWord = (x) => (!x ? 'none' : x.notRun ? 'notRun' : x.fit?.termination ?? (x.ok ? 'ok' : String(x.error ?? '').split(':')[0]));
function fits(all) {
  const out = {};
  for (const group of GROUPS) for (const name of ['F2O', 'F2M']) {
    const arms = all.filter((w) => w.o.group === group).map((w) => armOf(w, name)).filter((a) => a && !a.notRun);
    const terminations = {}, failures = {};
    for (const a of arms) { const t = outcomeWord(a); terminations[t] = (terminations[t] ?? 0) + 1; if (!a.ok) { const kind = String(a.error ?? '').split(':')[0]; failures[kind] = (failures[kind] ?? 0) + 1; } }
    out[`${group}|${name}`] = { windows: arms.length, ok: arms.filter((a) => a.ok).length, terminations, failures, medianIterations: median(arms.map((a) => a.fit?.iterations).filter(Number.isFinite)), maxIterations: Math.max(...arms.map((a) => a.fit?.iterations).filter(Number.isFinite)), medianRejectedTrials: median(arms.map((a) => a.fit?.rejectedTrials).filter(Number.isFinite)) };
  }
  return out;
}
function counts(mRows) {
  const out = {};
  for (const group of GROUPS) {
    const r = mRows.filter((x) => x.group === group);
    out[group] = { stored: r.length, errors: r.filter((x) => x.error).length, defects: r.filter((x) => x.defect).length, withFilled: r.filter((x) => x.filled?.length).length, heldDays: [...new Set(r.map((x) => x.held?.days).filter(Number.isFinite))].sort((a, b) => a - b),
      perLead: Object.fromEntries(LEADS.map((l) => [l, r.filter((x) => !x.error && !x.excluded && x.entered.includes(l)).length])) };
  }
  return out;
}

const rowsDir = path.join(store, 'rows');
/** The stored M rows, one per key (the first unflagged row, XM3's rule), sorted. */
export function storedRows() {
  const byKey = new Map();
  for (const f of (fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((x) => /^M\.s\d+\.jsonl$/.test(x)).sort() : [])) for (const r of readJsonl(path.join(rowsDir, f))) if (!byKey.has(r.key) || byKey.get(r.key).defect) byKey.set(r.key, r);
  return [...byKey.values()].sort((x, y) => (x.key < y.key ? -1 : 1));
}

/** The table of the stored rows (deterministic: no times), C4 compared with XM3's committed cells. */
export async function buildTable(mRows = storedRows()) {
  const X3 = await xm3Rows(), T3 = xm3Table();
  const byKey = new Map(mRows.map((r) => [r.key, r]));
  const all = [...X3.values()].map((o) => ({ o, m: byKey.get(o.key) })).sort((x, y) => (x.o.key < y.o.key ? -1 : 1));
  const cells = GROUPS.flatMap((group) => LEADS.flatMap((lead) => cellsOf(all, group, lead)));
  const strip = (c) => { const { group, lead, arm, ref, clusters, seed, cell, cond, role, xm2, ...stats } = c; return JSON.stringify(stats); };
  const c4 = cells.filter((c) => c.cell === 'C4');
  const xm3Cell = (c) => T3.cells.find((x) => x.group === c.group && x.cond === 'O' && x.clusters === c.clusters && x.arm === 'F2' && x.ref === 'P' && x.lead === c.lead);
  const differ = c4.filter((c) => !xm3Cell(c) || strip(xm3Cell(c)) !== strip(c)).map((c) => `${c.group}|${c.clusters}|${c.lead}`);
  const weather = await weatherOf();
  const accounting = Object.fromEntries(GROUPS.map((group) => [group, Object.fromEntries(LEADS.map((lead) => [lead, accountingOf(all, group, lead, weather)]))]));
  const pub = config.worst.xm3Published;
  const published = Object.fromEntries(Object.keys(pub.F2).map((lead) => {
    const row = accounting.P[lead].byWeek[pub.week];
    return [lead, { F2O: row.F2O, P: row.P, equal: row.F2O === pub.F2[lead] && row.P === pub.P[lead] && accounting.P[lead].top === pub.of }];
  }));
  return {
    experiment: config.experiment, id: config.id, task: config.task, modulesCommit: build.modulesCommit, xm3Commit: config.xm3.commit, registration: REGISTRATION,
    rowsDigest: sha256(mRows.map(comparable).join('\n')), rows: mRows.length, xm3RowsDigest: config.xm3.rowsDigest, gfzSha256: config.weather.gfz.sha256,
    counts: counts(mRows), fits: fits(all), outcome: outcome(cells), cells,
    reproduction: { cells: c4.length, equal: c4.length - differ.length, differ }, published, accounting,
  };
}

export const tableText = (table) => `${JSON.stringify(table, null, 1)}\n`;
/** The rebuilt table equals the committed results/ffm-tail-cause/table.json byte for byte. */
export function sameAsCommitted(table) {
  const held = committed('results/ffm-tail-cause/table.json');
  return !!held && held.toString('utf8') === tableText(table);
}

/** The cost of the stored rows (seconds per fit and per forecast, per group; window wall time), printed only. */
export function cost(rows) {
  const out = {};
  for (const r of rows) {
    const t = r.timing?.F2;
    if (!t?.fitMs) continue;
    out[r.group] ??= { fits: [], forecasts: [] };
    out[r.group].fits.push(t.fitMs / 1000);
    if (t.forecastMs) out[r.group].forecasts.push(t.forecastMs / 1000);
  }
  const wall = rows.map((r) => r.timing?.wallSeconds).filter(Number.isFinite);
  return { ...Object.fromEntries(Object.entries(out).map(([group, v]) => [group, { fits: v.fits.length, medianFitSeconds: median(v.fits), medianForecastSeconds: median(v.forecasts) }])),
    windows: wall.length, medianWindowSeconds: median(wall), workerHours: wall.reduce((s, x) => s + x, 0) / 3600 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const rows = storedRows();
  const t0 = Date.now();
  const table = await buildTable(rows);
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(TABLE, tableText(table));
  console.error(`XM5 table: ${table.rows} rows, ${table.cells.length} cells, ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${TABLE}`);
  console.error(`outcome: ${JSON.stringify(table.outcome)}`);
  console.error(`reproduction: ${JSON.stringify(table.reproduction)}; published: ${JSON.stringify(table.published)}`);
  console.error(`fits: ${JSON.stringify(table.fits)}`);
  console.error(`cost: ${JSON.stringify(cost(rows))}`);
  process.exit(0);
}
