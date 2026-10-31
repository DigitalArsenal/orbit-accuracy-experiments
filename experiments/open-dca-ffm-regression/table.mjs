// XM4 table (PLAN.md, Decision rule, Statistics, Report only): every registered cell from the stored rows with XM3's cluster bootstrap,
// rules 1, 2 and 3 apart, the per-lead reading and the verdicts, ISO-week clusters beside the registered clusters, XM3's F cells beside
// the K cells (its committed table), the window counts and the inputs flown. XM3's table.mjs (22313bf) is the pattern; its statistics are
// unchanged. Written to results/open-dca-ffm-regression/table.json; the cost (seconds per arm) printed beside it, never in the table (the
// table is deterministic). Statistics only.
//   node experiments/open-dca-ffm-regression/table.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { config, build, results, store, root, guardRef, readJsonl, sha256, median, comparable, xm3Table } from './common.mjs';

const LEADS = config.scoring.leadDays;
const DRAWS = config.statistics.bootstrap.draws;
const LN110 = Math.log(1.10);
const TABLE = path.join(results, 'table.json');
const V = config.verdict;
/** [arm, ref] of every contrast, and its role in a group. */
const CONTRASTS = [V.primary.contrast, ...V.secondary.map((s) => s.contrast), ...V.reportOnly].filter((c, i, all) => all.findIndex((x) => x.join('/') === c.join('/')) === i);
const roleOf = (group, arm, ref) => {
  const id = `${arm}/${ref}`;
  if (group === V.primary.group && id === V.primary.contrast.join('/')) return 'primary';
  return V.secondary.some((s) => s.group === group && s.contrast.join('/') === id) ? 'secondary' : 'report only';
};
const CLUSTERS = [{ clusters: 'orbit', role: 'registered' }, { clusters: 'week', role: 'report only' }];

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

/** One cell: the point statistics, the cluster-bootstrap intervals and the three rules (XM-fast's), and the reading of its interval. */
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
  const betterShare = pairs.filter((p) => p.d < 0).length / N;
  return {
    ...out,
    medianD: num(medD), medianRatioPercent: Number.isFinite(medD) ? (Math.exp(medD) - 1) * 100 : num(medD), ciMedianD: ciMed.map(num),
    reading: ciMed[1] < 0 ? 'gain' : ciMed[0] > 0 ? 'harm' : 'no detectable effect', betterShare,
    lnP95Ratio: num(lnP95), ciLnP95Ratio: ciLr.map(num),
    medianEArmKm: finiteMedian(pairs.map((p) => p.eArm)), medianERefKm: finiteMedian(pairs.map((p) => p.eRef)),
    medianAtArmKm: finiteMedian(pairs.map((p) => p.atArm)), medianAtRefKm: finiteMedian(pairs.map((p) => p.atRef)),
    rules, pass: rules.medianBelow0 && rules.p95RatioBelow110 && rules.failuresAtMost1pc,
  };
}

const armOf = (row, name) => (name === 'P' ? row.P : row.arms?.[name]);

/** The pairs of one cell (PLAN.md, Decision rule): the windows whose bin entered and whose K arms were flown. */
function pairsOf(rows, group, clusters, arm, ref, lead) {
  const out = [];
  for (const row of rows) {
    if (row.group !== group || row.error || row.excluded || !row.entered.includes(lead) || !row.arms) continue;   // row.arms absent: out of the K cells
    const a = armOf(row, arm), r = armOf(row, ref);
    if (!r || r.notRun || !a || a.notRun) continue;                // P not attempted: no public set at or before the cutoff
    const armFailed = !a.ok || !a.days?.[lead], refFailed = !r.ok || !r.days?.[lead];
    const eArm = armFailed ? Infinity : a.days[lead].rmsKm, eRef = refFailed ? Infinity : r.days[lead].rmsKm;
    const d = armFailed ? Infinity : refFailed ? -Infinity : Math.log(eArm) - Math.log(eRef);
    out.push({ key: row.key, cluster: clusters === 'orbit' ? `${row.cluster}|${row.isoWeek}` : row.isoWeek, d, eArm, eRef, armFailed, refFailed,
      atArm: armFailed ? null : a.days[lead].atKm, atRef: refFailed ? null : r.days[lead].atKm });
  }
  return out.sort((x, y) => (x.key < y.key ? -1 : 1));
}

/** Counts of the windows per group: registered, stored, errors, defects, no lead bin, out of the K cells by reason, flown, per lead, K failures. */
function counts(rows) {
  const out = {};
  const registered = (g) => config.groups[g].objects.length * ((Date.parse(`${config.period.to}T00:00:00Z`) - Date.parse(`${config.period.from}T00:00:00Z`)) / 86400000 + 1);
  for (const g of Object.keys(config.groups)) {
    const r = rows.filter((x) => x.group === g);
    if (!r.length) continue;
    const reasons = {};
    for (const x of r) if (x.out) reasons[x.out] = (reasons[x.out] ?? 0) + 1;
    const failures = {};
    for (const x of r) for (const [name, a] of Object.entries(x.arms ?? {})) if (!a.ok) { failures[name] ??= {}; const kind = String(a.notRun ?? a.error ?? '').split(':')[0]; failures[name][kind] = (failures[name][kind] ?? 0) + 1; }
    out[g] = { registered: registered(g), stored: r.length, errors: r.filter((x) => x.error).length, defects: r.filter((x) => x.defect).length, noLeadBin: r.filter((x) => x.excluded).length, outOfKCells: reasons,
      flown: r.filter((x) => x.arms).length, expected: config.windows.expected[g], failures, perLead: Object.fromEntries(LEADS.map((l) => [l, r.filter((x) => x.arms && !x.error && !x.excluded && x.entered.includes(l)).length])),
      filled: r.filter((x) => x.filled?.length).length };
  }
  return out;
}

/** The inputs flown: the windows on an older record, and per object B* zero or below and the flown B against C2's seed. */
function inputs(rows) {
  const seedsFile = path.join(root, 'results/ffm-covariance-calibration/seeds-R1R2.json');
  const seeds = new Map(JSON.parse(fs.readFileSync(seedsFile, 'utf8')).objects.map((o) => [o.norad, o]));
  const older = rows.filter((r) => r.record?.ageDays > 0).map((r) => ({ key: r.key, issue: r.record.issue, ageDays: r.record.ageDays }));
  const perObject = {};
  for (const g of Object.keys(config.groups)) for (const o of config.groups[g].objects) {
    const r = rows.filter((x) => x.norad === o.norad && x.seed);
    if (!r.length) continue;
    const B = r.map((x) => x.seed.dragAreaOverMass).filter(Number.isFinite).sort((a, b) => a - b), seedB = seeds.get(o.norad)?.bSeed;
    perObject[o.norad] = { name: o.name, windows: r.length, bstarAtOrBelowZero: r.filter((x) => !(x.seed.bstar > 0)).length, medianB: median(B), minB: B[0], maxB: B.at(-1), c2SeedB: seedB ?? null, medianBOverSeed: seedB ? median(B) / seedB : null };
  }
  return { olderRecord: { windows: older.length, list: older }, perObject };
}

const rowsDir = path.join(store, 'rows');
const allRows = () => (fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((f) => /^O\.s\d+\.jsonl$/.test(f)).sort() : []).flatMap((f) => readJsonl(path.join(rowsDir, f)));
/** The stored rows, one per key, the first unflagged. */
export function storedRows() {
  const byKey = new Map();
  for (const r of allRows()) if (!byKey.has(r.key) || byKey.get(r.key).defect) byKey.set(r.key, r);
  return [...byKey.values()].sort((x, y) => (x.key < y.key ? -1 : 1));
}
const digestOf = (rows) => sha256(rows.map(comparable).join('\n'));
const seedOf = (group, arm, ref, lead, clusters) => `XM4|${group}|O|${arm}/${ref}|${lead}|${clusters}`;

/** The table of the stored rows (deterministic: no times, the rows' digest), XM3's cell beside each K cell it answers. */
export function buildTable(rows = storedRows()) {
  const X3 = xm3Table();
  const xm3Cells = new Map(X3.cells.filter((c) => c.cond === 'O' && c.clusters === 'orbit').map((c) => [`${c.group}|${c.arm}/${c.ref}|${c.lead}`, c]));
  const brief = (c) => (c ? { contrast: `${c.arm}/${c.ref}`, pairs: c.pairs, armFailures: c.armFailures, medianD: c.medianD, medianRatioPercent: c.medianRatioPercent, ciMedianD: c.ciMedianD, lnP95Ratio: c.lnP95Ratio, ciLnP95Ratio: c.ciLnP95Ratio, rules: c.rules, pass: c.pass } : null);
  const cells = [];
  for (const group of Object.keys(config.groups)) for (const { clusters, role: clusterRole } of CLUSTERS) for (const [arm, ref] of CONTRASTS) for (const lead of LEADS) {
    const seed = seedOf(group, arm, ref, lead, clusters);
    const cell = { group, clusters, clusterRole, role: roleOf(group, arm, ref), arm, ref, lead, seed, ...cellStats(pairsOf(rows, group, clusters, arm, ref, lead), seed) };
    const twin = V.beside[`${arm}/${ref}`];
    if (twin && clusters === 'orbit') cell.xm3 = brief(xm3Cells.get(`${group}|${twin}|${lead}`));
    cells.push(cell);
  }
  const verdicts = {};
  for (const { clusters, role } of CLUSTERS) {
    verdicts[clusters] = { role };
    for (const group of Object.keys(config.groups)) for (const [arm, ref] of CONTRASTS) {
      const v = LEADS.map((lead) => cells.find((x) => x.group === group && x.clusters === clusters && x.arm === arm && x.ref === ref && x.lead === lead));
      verdicts[clusters][`${group}|${arm} beats ${ref}`] = { role: roleOf(group, arm, ref), pass: v.every((x) => x?.pass), readings: Object.fromEntries(v.map((x) => [x.lead, x.reading ?? x.why])), failing: v.filter((x) => !x?.pass).map((x) => ({ lead: x.lead, rules: x.rules ?? null, why: x.why ?? null })) };
    }
  }
  return {
    experiment: config.experiment, id: config.id, task: config.task, modulesCommit: build.modulesCommit, xmCommit: config.xm.commit, xm3Commit: config.xm3.commit, rowsDigest: digestOf(rows), rows: rows.length,
    rule: V.rule, reading: V.reading, counts: counts(rows), inputs: inputs(rows), verdicts, cells,
  };
}

export const tableText = (table) => `${JSON.stringify(table, null, 1)}\n`;
/** The rebuilt table equals the committed results/open-dca-ffm-regression/table.json byte for byte. */
export function sameAsCommitted(table) {
  let committed;
  try { committed = execFileSync('git', ['show', `${guardRef}:results/open-dca-ffm-regression/table.json`], { cwd: root, maxBuffer: 1 << 28 }).toString(); } catch { return false; }
  return committed === tableText(table);
}

/** The cost of the stored rows (seconds per arm, per group; window wall time), printed only. */
export function cost(rows) {
  const out = {};
  for (const r of rows) for (const [a, t] of Object.entries(r.timing ?? {})) {
    if (!t?.coverageMs) continue;
    const key = `${r.group}|${a}`;
    out[key] ??= { setup: [], coverage: [] };
    out[key].setup.push(t.setupMs / 1000);
    out[key].coverage.push(t.coverageMs / 1000);
  }
  const wall = rows.map((r) => r.timing?.wallSeconds).filter(Number.isFinite);
  return { ...Object.fromEntries(Object.entries(out).map(([key, v]) => [key, { arms: v.setup.length, medianSetupSeconds: median(v.setup), medianCoverageSeconds: median(v.coverage) }])),
    windows: wall.length, medianWindowSeconds: median(wall), workerHours: wall.reduce((s, x) => s + x, 0) / 3600 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const rows = storedRows();
  const t0 = Date.now();
  const table = buildTable(rows);
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(TABLE, tableText(table));
  console.error(`XM4 table: ${table.rows} rows, ${table.cells.length} cells, ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${TABLE}`);
  console.error(`counts: ${JSON.stringify(table.counts)}`);
  for (const [name, v] of Object.entries(table.verdicts)) for (const [contrast, x] of Object.entries(v)) if (contrast !== 'role') console.error(`${name} ${contrast} (${x.role}): ${x.pass ? 'PASS' : 'no'} ${JSON.stringify(x.readings)}`);
  console.error(`cost: ${JSON.stringify(cost(rows))}`);
}
