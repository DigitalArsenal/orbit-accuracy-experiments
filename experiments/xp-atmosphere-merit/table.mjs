// XM-fast table (PLAN.md, Decision rule and Statistics): every registered cell from the stored rows, the cluster bootstrap,
// the verdicts and the GN control, written to results/xp-atmosphere-merit/table.json. Statistics only.
//   node experiments/xp-atmosphere-merit/table.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { config, build, results, store, root, readJsonl, write, sha256 } from './common.mjs';

const LEADS = config.scoring.leadDays;
const DRAWS = config.statistics.bootstrap.draws;
const LN110 = Math.log(1.10);
const TABLE = path.join(results, 'table.json');
const CONTRASTS = [['X2', 'P'], ['X3', 'P'], ['X2', 'X0'], ['X3', 'X0']];
const CONFIGS = [
  { arc: 72, cond: 'O', clusters: 'orbit', role: 'primary' },
  { arc: 72, cond: 'M', clusters: 'orbit', role: 'sensitivity' },
  { arc: 24, cond: 'O', clusters: 'orbit', role: 'sensitivity' },
  { arc: 24, cond: 'M', clusters: 'orbit', role: 'sensitivity' },
  { arc: 72, cond: 'O', clusters: 'satellite', role: 'sensitivity' },
];

/** xorshift128+ seeded by SHA-256 of `label` (XA run.mjs generator), a float in [0, 1). */
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

// ---- order statistics over [0, n) of a Float64Array without NaN (+-Infinity allowed) ----------------------------------
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

/** One cell: the point statistics, the cluster-bootstrap intervals and the three rules. */
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

/** The arm result of a row: X0 and P are condition-free; X2 and X3 carry the condition. */
const armOf = (row, arc, cond, name) => (name === 'P' ? row.P : name === 'X0' ? row.arcs?.[arc]?.arms?.X0 : row.arcs?.[arc]?.arms?.[`${name}${cond}`]);

/** The pairs of one cell (PLAN.md, Decision rule). */
function pairsOf(rows, group, { arc, cond, clusters }, arm, ref, lead) {
  const out = [];
  for (const row of rows) {
    if (row.group !== group || row.error || row.excluded || !row.entered.includes(lead)) continue;
    if (!row.arcs?.[arc]?.arms) continue;                       // arc coverage below 90 %
    if (cond === 'O' && row.O?.excluded) continue;               // no RSGA in force
    const a = armOf(row, arc, cond, arm), r = armOf(row, arc, cond, ref);
    if (!r || r.notRun || !a || a.notRun) continue;              // P not attempted: no public set at or before the cutoff
    const armFailed = !a.ok || !a.days?.[lead], refFailed = !r.ok || !r.days?.[lead];
    const eArm = armFailed ? Infinity : a.days[lead].rmsKm, eRef = refFailed ? Infinity : r.days[lead].rmsKm;
    const d = armFailed ? Infinity : refFailed ? -Infinity : Math.log(eArm) - Math.log(eRef);
    out.push({ key: row.key, cluster: clusters === 'orbit' ? `${row.cluster}|${row.isoWeek}` : `${row.norad}|${row.isoWeek}`, d, eArm, eRef, armFailed, refFailed,
      atArm: armFailed ? null : a.days[lead].atKm, atRef: refFailed ? null : r.days[lead].atKm });
  }
  return out.sort((x, y) => (x.key < y.key ? -1 : 1));
}

/** The GN control: X2 and X3 equal X0 bit for bit (the propagated TEME states' SHA-256) in every GN window and arc. */
function control(rows) {
  let compared = 0;
  const differ = [];
  for (const row of rows.filter((r) => r.group === 'GN' && !r.error && !r.excluded)) for (const [arc, a] of Object.entries(row.arcs ?? {})) {
    if (!a.arms) continue;
    for (const name of ['X2O', 'X2M', 'X3O', 'X3M']) {
      const x = a.arms[name];
      if (!x || x.notRun) continue;
      compared += 1;
      if (x.ok !== a.arms.X0.ok || x.temeSha256 !== a.arms.X0.temeSha256) differ.push(`${row.key}|${arc}|${name}`);
    }
  }
  return { compared, differ: differ.length, examples: differ.slice(0, 10), pass: compared > 0 && differ.length === 0 };
}

/** Counts of the windows: registered, stored, errors, excluded, arcs below coverage, O without an RSGA, P without a set. */
function counts(rows) {
  const out = {};
  for (const g of Object.keys(config.groups)) {
    const r = rows.filter((x) => x.group === g);
    out[g] = {
      registered: config.groups[g].objects.length * ((Date.parse(`${config.period.to}T00:00:00Z`) - Date.parse(`${config.period.from}T00:00:00Z`)) / 86400000 + 1),
      stored: r.length, errors: r.filter((x) => x.error).length, noLeadBin: r.filter((x) => x.excluded).length,
      arcBelowCoverage: Object.fromEntries([72, 24].map((A) => [A, r.filter((x) => x.arcs?.[A] && !x.arcs[A].arms).length])),
      oWithoutRsga: r.filter((x) => x.O?.excluded).length, pWithoutSet: r.filter((x) => x.P?.notRun).length,
      perLead: Object.fromEntries(LEADS.map((l) => [l, r.filter((x) => !x.error && !x.excluded && x.entered.includes(l)).length])),
    };
  }
  return out;
}

/** The table of the stored rows (deterministic: no times, the rows' digest). */
export function buildTable(rowsIn) {
  const byKey = new Map();
  for (const r of rowsIn) if (!byKey.has(r.key)) byKey.set(r.key, r);
  const rows = [...byKey.values()].sort((x, y) => (x.key < y.key ? -1 : 1));
  const digest = sha256(rows.map((r) => JSON.stringify({ ...r, timing: undefined, sources: undefined, build: undefined })).join('\n'));
  const cells = [];
  for (const group of Object.keys(config.groups)) for (const c of CONFIGS) for (const [arm, ref] of CONTRASTS) {
    if (ref === 'X0' && !config.groups[group].drag) continue;
    for (const lead of LEADS) {
      const seed = `XM-fast|${group}|${c.arc}|${c.cond}|${arm}/${ref}|${lead}|${c.clusters}`;
      cells.push({ group, arc: c.arc, cond: c.cond, clusters: c.clusters, role: c.role, arm, ref, lead, seed, ...cellStats(pairsOf(rows, group, c, arm, ref, lead), seed) });
    }
  }
  const find = (group, c, arm, ref) => LEADS.map((lead) => cells.find((x) => x.group === group && x.arc === c.arc && x.cond === c.cond && x.clusters === c.clusters && x.arm === arm && x.ref === ref && x.lead === lead));
  const verdict = (group, c, arm, ref) => { const v = find(group, c, arm, ref); return { pass: v.every((x) => x?.pass), failing: v.filter((x) => !x?.pass).map((x) => ({ lead: x.lead, rules: x.rules ?? null, why: x.why ?? null })) }; };
  const verdicts = {};
  for (const c of CONFIGS) {
    const name = `${c.arc}h|${c.cond}|${c.clusters}`;
    verdicts[name] = { role: c.role };
    for (const group of Object.keys(config.groups)) for (const [arm, ref] of CONTRASTS) {
      if (ref === 'X0' && !config.groups[group].drag) continue;
      verdicts[name][`${group}|${arm} beats ${ref}`] = verdict(group, c, arm, ref);
    }
  }
  return {
    experiment: config.experiment, id: config.id, task: config.task, modulesCommit: build.modulesCommit, rowsDigest: digest, rows: rows.length,
    rule: config.verdict.primary.rule, counts: counts(rows), control: control(rows), verdicts, cells,
  };
}

export const tableText = (table) => `${JSON.stringify(table, null, 1)}\n`;
/** The rebuilt table equals the committed results/xp-atmosphere-merit/table.json byte for byte. */
export function sameAsCommitted(table) {
  let committed;
  try { committed = execFileSync('git', ['show', 'HEAD:results/xp-atmosphere-merit/table.json'], { cwd: root, maxBuffer: 1 << 28 }).toString(); } catch { return false; }
  return committed === tableText(table);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const rowsDir = path.join(store, 'rows');
  const rows = (fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((f) => f.endsWith('.jsonl')).sort() : []).flatMap((f) => readJsonl(path.join(rowsDir, f)));
  const t0 = Date.now();
  const table = buildTable(rows);
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(TABLE, tableText(table));
  console.error(`XM-fast table: ${table.rows} rows, ${table.cells.length} cells, ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${TABLE}`);
  for (const [name, v] of Object.entries(table.verdicts)) for (const [contrast, x] of Object.entries(v)) if (contrast !== 'role') console.error(`${name} ${contrast}: ${x.pass ? 'PASS' : 'no'}`);
  console.error(`GN control: ${JSON.stringify(table.control)}`);
}
