// XM3 table (PLAN.md, Decision rule, Statistics, Comparison with XM2): every registered cell from the stored rows with XM2's cluster
// bootstrap, rules 1, 2 and 3 apart, the verdicts, the CONVERGED and STALLED shares and the window counts (XM2's table.mjs at 2f75aba
// is the pattern; A1 is registered, so there is one variant), and beside them, read only: XM2's primary cell and verdict (its
// committed table.json), the reproduction of every X2-against-P cell, the fits' terminations against XM2's, the fits XM2 lost, and
// the invariance count. Written to results/ffm-atmosphere-xm3/table.json; the cost (fit and forecast seconds) printed beside it,
// never in the table (the table is deterministic). Statistics only.
//   node experiments/ffm-atmosphere-xm3/table.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { config, build, results, store, root, readJsonl, sha256, median, comparable, xm2Rows, xm2Table } from './common.mjs';

const LEADS = config.scoring.leadDays;
const DRAWS = config.statistics.bootstrap.draws;
const LN110 = Math.log(1.10);
const TABLE = path.join(results, 'table.json');
const CONTRASTS = [['F3', 'P'], ['F2', 'P'], ['F3', 'F2'], ['F2', 'X2'], ['F3', 'X2'], ['X2', 'P']];
const CONFIGS = [
  { cond: 'O', clusters: 'orbit', role: 'primary' },
  { cond: 'M', clusters: 'orbit', role: 'sensitivity' },
  { cond: 'O', clusters: 'satellite', role: 'sensitivity' },
];

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

/** One cell: the point statistics, the cluster-bootstrap intervals and the three rules (XM-fast's). */
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

const armOf = (row, name) => (name === 'P' ? row.P : row.arms?.[name]);

/** The pairs of one cell (PLAN.md, Decision rule): the rows of the cell's condition (XM2's). */
function pairsOf(rows, group, { cond, clusters }, arm, ref, lead) {
  const out = [];
  for (const row of rows) {
    if (row.group !== group || row.condition !== cond || row.error || row.excluded || !row.entered.includes(lead)) continue;
    if (!row.arc || row.arc.excluded) continue;                   // arc coverage below 90 %
    if (cond === 'O' && row.O?.excluded) continue;                 // no RSGA in force
    const a = armOf(row, arm), r = armOf(row, ref);
    if (!r || r.notRun || !a || a.notRun) continue;                // P not attempted: no public set at or before the cutoff
    const armFailed = !a.ok || !a.days?.[lead], refFailed = !r.ok || !r.days?.[lead];
    const eArm = armFailed ? Infinity : a.days[lead].rmsKm, eRef = refFailed ? Infinity : r.days[lead].rmsKm;
    const d = armFailed ? Infinity : refFailed ? -Infinity : Math.log(eArm) - Math.log(eRef);
    out.push({ key: row.key, cluster: clusters === 'orbit' ? `${row.cluster}|${row.isoWeek}` : `${row.norad}|${row.isoWeek}`, d, eArm, eRef, armFailed, refFailed,
      atArm: armFailed ? null : a.days[lead].atKm, atRef: refFailed ? null : r.days[lead].atKm });
  }
  return out.sort((x, y) => (x.key < y.key ? -1 : 1));
}

/** The F fits per group, condition and arm (XM2's): windows, fits attempted, CONVERGED and STALLED (their shares of the fits),
 *  terminations, failures by kind. */
function fits(rows) {
  const out = {};
  for (const g of Object.keys(config.groups)) for (const c of ['O', 'M']) for (const a of ['F2', 'F3']) {
    const arms = rows.filter((r) => r.group === g && r.condition === c && r.arms?.[a] && !r.arms[a].notRun).map((r) => r.arms[a]);
    if (!arms.length) continue;
    // a fit was attempted unless F3 had no $DCL; its termination, or 'fit-failed' when the request itself failed
    const fitted = arms.filter((x) => x.fit != null || /^fit:/.test(x.error ?? ''));
    const terminations = {}, failures = {};
    for (const x of fitted) { const t = x.fit?.termination ?? 'fit-failed'; terminations[t] = (terminations[t] ?? 0) + 1; }
    for (const x of arms) if (!x.ok) { const kind = String(x.error ?? '').split(':')[0]; failures[kind] = (failures[kind] ?? 0) + 1; }
    const converged = fitted.filter((x) => x.fit?.termination === 'CONVERGED').length;
    const stalled = terminations.STALLED ?? 0;
    out[`${g}|${c}|${a}`] = { windows: arms.length, fitted: fitted.length, converged, convergedShare: fitted.length ? converged / fitted.length : null,
      stalled, stalledShare: fitted.length ? stalled / fitted.length : null, ok: arms.filter((x) => x.ok).length, terminations, failures,
      medianIterations: median(arms.map((x) => x.fit?.iterations).filter(Number.isFinite)), medianFfmCalls: median(arms.map((x) => x.fit?.ffmCalls).filter(Number.isFinite)) };
  }
  return out;
}

/** Counts of the windows per group and condition (XM2's): registered, stored, errors, defects, no lead bin, arc below coverage, O
 *  without RSGA. */
function counts(rows) {
  const out = {};
  const registered = (g) => config.groups[g].objects.length * ((Date.parse(`${config.period.to}T00:00:00Z`) - Date.parse(`${config.period.from}T00:00:00Z`)) / 86400000 + 1);
  for (const g of Object.keys(config.groups)) for (const c of ['O', 'M']) {
    const r = rows.filter((x) => x.group === g && x.condition === c);
    if (!r.length) continue;
    out[`${g}|${c}`] = {
      registered: registered(g), stored: r.length, errors: r.filter((x) => x.error).length, defects: r.filter((x) => x.defect).length, noLeadBin: r.filter((x) => x.excluded).length,
      arcBelowCoverage: r.filter((x) => x.arc?.excluded).length, oWithoutRsga: r.filter((x) => x.O?.excluded).length, pWithoutSet: r.filter((x) => x.P?.notRun).length,
      heldDays: c === 'O' ? [...new Set(r.map((x) => x.held?.days).filter(Number.isFinite))].sort() : undefined,
      filled: c === 'O' ? r.filter((x) => x.filled?.length).length : undefined,
      perLead: Object.fromEntries(LEADS.map((l) => [l, r.filter((x) => !x.error && !x.excluded && x.entered.includes(l)).length])),
    };
  }
  return out;
}

// ---- the comparison with XM2 (PLAN.md; reported, decides nothing) ----------------------------------------------------------
/** An F arm's outcome in one word: its fit's termination, else the kind of its failure. */
const outcome = (x) => (!x ? 'none' : x.notRun ? 'notRun' : x.fit?.termination ?? (x.ok ? 'ok' : String(x.error ?? '').split(':')[0]));
const valueOf = (fit, kind) => fit?.parameters?.find((p) => p.kind === kind)?.value ?? null;

/** XM2's termination against XM3's, per group and arm (condition O): { 'XM2 -> XM3': count }. */
function transitions(rows, xm2) {
  const out = {};
  for (const r of rows) {
    if (r.condition !== 'O') continue;
    const x = xm2.get(r.key);
    for (const a of ['F2', 'F3']) {
      if (!r.arms?.[a] && !x?.arms?.[a]) continue;
      const id = `${r.group}|${a}`, step = `${outcome(x?.arms?.[a])} -> ${outcome(r.arms?.[a])}`;
      out[id] ??= {};
      out[id][step] = (out[id][step] ?? 0) + 1;
    }
  }
  return out;
}

/** The fits XM2 lost (condition O, a fit that did not end CONVERGED): XM3's outcome, rounds, rejected trials and B beside XM2's
 *  (XM2's B is its best evaluated point). */
function lostFits(rows, xm2) {
  const list = [];
  for (const r of rows) {
    if (r.condition !== 'O') continue;
    const x = xm2.get(r.key);
    for (const a of ['F2', 'F3']) {
      const old = x?.arms?.[a];
      if (!old?.fit || old.fit.termination === 'CONVERGED') continue;
      const now = r.arms?.[a];
      const bOld = valueOf(old.fit, 'DRAG_AREA_OVER_MASS'), bNow = valueOf(now?.fit, 'DRAG_AREA_OVER_MASS');
      list.push({ key: r.key, arm: a, xm2: { termination: old.fit.termination, iterations: old.fit.iterations, rejectedTrials: old.fit.rejectedTrials, b: bOld, reducedChiSquare: old.fit.reducedChiSquare },
        xm3: { outcome: outcome(now), iterations: now?.fit?.iterations ?? null, rejectedTrials: now?.fit?.rejectedTrials ?? null, b: bNow, reducedChiSquare: now?.fit?.reducedChiSquare ?? null },
        bRatio: bOld && bNow ? bNow / bOld : null });
    }
  }
  list.sort((p, q) => (`${p.key}|${p.arm}` < `${q.key}|${q.arm}` ? -1 : 1));
  const by = {};
  for (const e of list) { const id = `${e.key.split('|')[0]}|${e.arm}`; by[id] ??= {}; by[id][e.xm3.outcome] = (by[id][e.xm3.outcome] ?? 0) + 1; }
  const converged = list.filter((e) => e.xm3.outcome === 'CONVERGED');
  return { count: list.length, byOutcome: by, medianIterationsConverged: median(converged.map((e) => e.xm3.iterations)),
    medianAbsLnBRatioConverged: median(converged.map((e) => Math.abs(Math.log(e.bRatio)))), fits: list };
}

/** Invariance (report-only): every F arm whose XM2 fit ended CONVERGED with zero rejected trials, compared with XM3's whole arm
 *  (fit record, GCRF digest, days): equal, or the differing fields. */
function invariance(rows, xm2) {
  let expected = 0, equal = 0;
  const differ = [];
  for (const r of rows) {
    if (r.condition !== 'O') continue;
    const x = xm2.get(r.key);
    for (const a of ['F2', 'F3']) {
      const old = x?.arms?.[a];
      if (old?.fit?.termination !== 'CONVERGED' || old.fit.rejectedTrials !== 0) continue;
      expected += 1;
      const now = r.arms?.[a];
      if (JSON.stringify(now ?? null) === JSON.stringify(old)) { equal += 1; continue; }
      const fields = [...new Set([...Object.keys(old), ...Object.keys(now ?? {})])].filter((f) => JSON.stringify(old[f] ?? null) !== JSON.stringify(now?.[f] ?? null));
      const fitFields = old.fit && now?.fit ? [...new Set([...Object.keys(old.fit), ...Object.keys(now.fit)])].filter((f) => JSON.stringify(old.fit[f] ?? null) !== JSON.stringify(now.fit[f] ?? null)) : [];
      differ.push({ key: r.key, arm: a, fields, fitFields });
    }
  }
  differ.sort((p, q) => (`${p.key}|${p.arm}` < `${q.key}|${q.arm}` ? -1 : 1));
  return { registeredExpected: config.comparison.invariance.expected, expected, equal, differing: differ.length, differ };
}

const rowsDir = path.join(store, 'rows');
/** The stored rows of both conditions, one per condition and key. */
export function storedRows() {
  const files = fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((f) => /^[OM]\.s\d+\.jsonl$/.test(f)).sort() : [];
  const byKey = new Map();
  for (const f of files) for (const r of readJsonl(path.join(rowsDir, f))) { const id = `${r.condition}|${r.key}`; if (!byKey.has(id)) byKey.set(id, r); }
  return [...byKey.values()].sort((x, y) => (`${x.condition}|${x.key}` < `${y.condition}|${y.key}` ? -1 : 1));
}

const digestOf = (rows) => sha256(rows.map(comparable).join('\n'));
/** XM2's primary cell for an XM3 cell (the same group, condition, clusters, contrast and lead), or null. */
const cellKey = (c) => `${c.group}|${c.cond}|${c.clusters}|${c.arm}/${c.ref}|${c.lead}`;

/** The table of the stored rows (deterministic: no times, the rows' digest), each cell with XM2's primary cell beside it. */
export function buildTable(rows = storedRows()) {
  const X2T = xm2Table(), xm2 = xm2Rows();
  const xm2Cells = new Map(X2T.cells.map((c) => [cellKey(c), c.primary]));
  const conditions = [...new Set(rows.map((r) => r.condition))].sort();
  const cells = [];
  for (const group of Object.keys(config.groups)) for (const c of CONFIGS) {
    if (!conditions.includes(c.cond)) continue;
    for (const [arm, ref] of CONTRASTS) for (const lead of LEADS) {
      const seed = `XM2|${group}|${config.fit.arcHours}|${c.cond}|${arm}/${ref}|${lead}|${c.clusters}`;   // XM2's label (PLAN.md, Statistics)
      const cell = { group, cond: c.cond, clusters: c.clusters, role: c.role, arm, ref, lead, seed, ...cellStats(pairsOf(rows, group, c, arm, ref, lead), seed) };
      cell.xm2 = xm2Cells.get(cellKey(cell)) ?? null;
      cells.push(cell);
    }
  }
  const strip = (c) => { const { group, cond, clusters, role, arm, ref, lead, seed, xm2: _, ...stats } = c; return stats; };
  const reproduction = cells.filter((c) => c.arm === 'X2' && c.ref === 'P');
  const verdicts = {};
  const xm2Verdict = (name, contrast) => X2T.verdicts?.[name]?.[contrast]?.primary ?? null;
  for (const c of CONFIGS) {
    if (!conditions.includes(c.cond)) continue;
    const name = `72h|${c.cond}|${c.clusters}`;
    verdicts[name] = { role: c.role };
    for (const group of Object.keys(config.groups)) for (const [arm, ref] of CONTRASTS) {
      const v = LEADS.map((lead) => cells.find((x) => x.group === group && x.cond === c.cond && x.clusters === c.clusters && x.arm === arm && x.ref === ref && x.lead === lead));
      const contrast = `${group}|${arm} beats ${ref}`;
      verdicts[name][contrast] = { pass: v.every((x) => x?.pass), failing: v.filter((x) => !x?.pass).map((x) => ({ lead: x.lead, rules: x.rules ?? null, why: x.why ?? null })), xm2: xm2Verdict(name, contrast) };
    }
  }
  return {
    experiment: config.experiment, id: config.id, task: config.task, modulesCommit: build.modulesCommit, xmCommit: config.xm.commit, xm2Commit: config.xm2.commit,
    rowsDigest: digestOf(rows), rows: rows.length, conditions, rule: config.verdict.rule, inputAvailability: config.verdict.inputAvailability,
    counts: counts(rows), fits: fits(rows), verdicts, cells,
    comparison: {
      xm2RowsDigest: X2T.rowsDigest?.primary ?? null,
      reproduction: { cells: reproduction.length, equal: reproduction.filter((c) => c.xm2 && JSON.stringify(strip(c)) === JSON.stringify(c.xm2)).length,
        differ: reproduction.filter((c) => !c.xm2 || JSON.stringify(strip(c)) !== JSON.stringify(c.xm2)).map(cellKey) },
      transitions: transitions(rows, xm2), lostFits: lostFits(rows, xm2), invariance: invariance(rows, xm2),
    },
  };
}

export const tableText = (table) => `${JSON.stringify(table, null, 1)}\n`;
/** The rebuilt table equals the committed results/ffm-atmosphere-xm3/table.json byte for byte. */
export function sameAsCommitted(table) {
  let committed;
  try { committed = execFileSync('git', ['show', 'HEAD:results/ffm-atmosphere-xm3/table.json'], { cwd: root, maxBuffer: 1 << 28 }).toString(); } catch { return false; }
  return committed === tableText(table);
}

/** The cost of the stored rows (seconds per fit and per forecast, per group, condition and arm; window wall time), printed only. */
export function cost(rows) {
  const out = {};
  for (const r of rows) for (const a of ['F2', 'F3']) {
    const t = r.timing?.[a];
    if (!t?.fitMs) continue;
    const key = `${r.group}|${r.condition}|${a}`;
    out[key] ??= { fits: [], forecasts: [] };
    out[key].fits.push(t.fitMs / 1000);
    if (t.forecastMs) out[key].forecasts.push(t.forecastMs / 1000);
  }
  const wall = rows.map((r) => r.timing?.wallSeconds).filter(Number.isFinite);
  return { ...Object.fromEntries(Object.entries(out).map(([key, v]) => [key, { fits: v.fits.length, medianFitSeconds: median(v.fits), medianForecastSeconds: median(v.forecasts) }])),
    windows: wall.length, medianWindowSeconds: median(wall), workerHours: wall.reduce((s, x) => s + x, 0) / 3600 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const rows = storedRows();
  const t0 = Date.now();
  const table = buildTable(rows);
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(TABLE, tableText(table));
  console.error(`XM3 table: ${table.rows} rows, ${table.cells.length} cells, ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${TABLE}`);
  for (const [name, v] of Object.entries(table.verdicts)) for (const [contrast, x] of Object.entries(v)) if (contrast !== 'role') console.error(`${name} ${contrast}: ${x.pass ? 'PASS' : 'no'} (XM2 ${x.xm2?.pass ? 'PASS' : 'no'})`);
  console.error(`fits: ${JSON.stringify(table.fits)}`);
  console.error(`reproduction: ${JSON.stringify(table.comparison.reproduction)}; invariance: ${table.comparison.invariance.equal} of ${table.comparison.invariance.expected} equal`);
  console.error(`cost: ${JSON.stringify(cost(rows))}`);
}
