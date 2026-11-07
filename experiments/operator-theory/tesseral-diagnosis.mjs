// TESSERAL-DIAGNOSIS.md: the tesseral short-period diagnosis on the landed all-regimes numbers (report only). Per cell the families with
// their module path and the failing family; the grid's effect at the module's own threshold from the landed 0.29 / 0.31 pairs; the
// catalog cost of the grid on the three 0.31 sets; the byte identity of e <= 0.3 flights against a grid in the cache.
//   SDN_MODULES_ROOT=<root> node tesseral-diagnosis.mjs --run [--shard k/n]     node tesseral-diagnosis.mjs --table     --check
// Every state comes from a module (propagator/sdn-ap through propagator/sdn-ap/test/lib/heo-model-truth.mjs and ocm.mjs; the reference
// from propagator/ffm inside that harness); this file reads rows, moves bytes and does arithmetic (frequencies, slopes, medians).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const HERE = path.dirname(new URL(import.meta.url).pathname), REPO = path.resolve(HERE, '../..');
const RESULTS = path.join(REPO, 'results/ap-truth/tesseral-diagnosis');
const LANDED = path.join(REPO, 'results/ap-truth/tesseral-all-regimes');
const REGISTRATION = 'experiments/operator-theory/TESSERAL-DIAGNOSIS.md';
export const PIN = {
  modulesCommit: '93cb5a0584fa728864e4426cc9ceb368936589f9',
  sdnAp: { version: '0.6.3', wasmSha256: 'aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e' },
  ffm: { version: '2.2.1', wasmSha256: 'a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4' },
};
/** The registered catalog budget (THEMIS-RIPPLE-FIX.md, Amendment 16 targets). */
export const BUDGET = { coldMedianMs: 100, warmMsPerRecordPerWorker: 40, memoryMB: 512 };
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const RUNNER = sha256(fs.readFileSync(new URL(import.meta.url)));
const RE_KM = 6378.135, DAY = 86400000, EARTH_REV_PER_DAY = 1.00273781, K_WIDE_E = 0.3;
// The all-regimes regimes (TESSERAL-ALL-REGIMES.md), copied so this runner never imports that runner's argument handling.
export const REGIMES = [
  ['Starlette', 13.82, 49.8], ['Ajisai', 12.44, 50.0], ['LARES', 12.55, 69.5], ['Jason-3', 12.81, 66.0], ['Sentinel-3', 14.27, 98.6], ['CryoSat-2', 14.52, 92.0],
  ['LAGEOS-1', 6.39, 109.8], ['LAGEOS-2', 6.47, 52.6], ['Etalon', 2.13, 64.9], ['GPS', 2.005, 55.0], ['Galileo', 1.70, 56.0], ['GLONASS', 2.13, 64.8],
  ['IGSO', 1.0027, 55.0], ['QZSS', 1.0027, 40.0], ['GEO', 1.0027, 0.1], ['Molniya', 2.006, 63.4, 0, 270], ['GTO', 2.40, 27.0, 0, 180],
].map(([name, n, i, raan = 0, argp = 0]) => ({ name, n, i, raan, argp }));
export const THEMIS_D = { name: 'THEMIS D', n: 1.0499037196959449, i: 8.132697128525981, raan: 47.85625519596603, argp: 68.66350938631257 };
const EPOCH = '2026-10-29T00:00:00';
const semimajorKm = (n) => Math.cbrt(398600.4418 / ((n * 2 * Math.PI / 86400) ** 2));
const perigeeKm = (n, e) => semimajorKm(n) * (1 - e) - RE_KM;
export const arcDays = (n) => (n >= 6 ? 3 : n >= 1.5 ? 6 : 10);
export const PAIRS = ['Molniya', 'GTO', 'THEMIS D'];
export const gridSeconds = (n) => Math.round(86400 / n / 64);
const HALF_DAY = ['GPS', 'Galileo', 'GLONASS', 'Etalon', 'Molniya', 'GTO'];
/** The cells under diagnosis by id (TESSERAL-DIAGNOSIS.md, D1 to D4), deduplicated, in the landed order. */
export function cells() {
  const D1 = ['Molniya|0.001'];
  const D2 = [...['GPS', 'Galileo', 'GLONASS', 'Etalon'].flatMap((r) => [0.001, 0.01, 0.05, 0.1, 0.2].map((e) => `${r}|${e}`)), ...['Molniya', 'GTO'].flatMap((r) => [0.001, 0.01, 0.05, 0.1, 0.2, 0.29, 0.3, 0.31].map((e) => `${r}|${e}`))];
  const D3 = ['Ajisai|0.1', 'LAGEOS-1|0.1', 'LAGEOS-1|0.2', 'LAGEOS-2|0.1', 'LAGEOS-2|0.2', 'Etalon|0.1', 'Etalon|0.2', 'GLONASS|0.1', 'GLONASS|0.2', 'GPS|0.05', 'GPS|0.1', 'GPS|0.2', 'Molniya|0.001', 'Molniya|0.01', 'Molniya|0.1', 'Molniya|0.2', 'Molniya|0.29'];
  const D4 = ['Starlette|0.05', 'Starlette|0.1', 'Ajisai|0.05', 'LARES|0.05', 'LARES|0.1', 'Jason-3|0.05', 'Jason-3|0.1', 'Etalon|0.05', 'GLONASS|0.05', 'GTO|0.29', 'GTO|0.3'];
  const groups = { D1, D2, D3, D4 };
  const seen = new Map();
  for (const [g, list] of Object.entries(groups)) for (const k of list) { if (!seen.has(k)) seen.set(k, []); seen.get(k).push(g); }
  return [...seen.entries()].map(([key, inGroups]) => ({ key, regime: key.split('|')[0], e: Number(key.split('|')[1]), groups: inGroups }));
}
const readJsonl = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const landedRows = () => readJsonl(LANDED, /^rows-\d+\.jsonl$/).filter((r) => (r.arm ?? 'primary') === 'primary');
const readRows = () => readJsonl(RESULTS, /^rows-\d+\.jsonl$/);
const median = (v) => { const s = [...v].sort((a, b) => a - b); const k = s.length >> 1; return s.length ? (s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2) : NaN; };
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
/** The all-regimes roughness: the median |second difference| of the RTN series at the per-revolution step (TESSERAL-ALL-REGIMES.md). */
const roughness = (series) => { const d2 = []; for (let k = 1; k + 1 < series.length; k += 1) d2.push(Math.hypot(...[0, 1, 2].map((ax) => series[k + 1][ax] - 2 * series[k][ax] + series[k - 1][ax]))); return median(d2); };
/** Amendment 1: the probe cells (the 17 attributed fails and their regimes' e 0.05, 0.1, 0.2) and the identity sample above the switch. */
export const PROBE_WIDE_E = 0.01, PROBE_BRANCH = 'wip/experiments-sdn-ap-tesseral-diagnosis-20261106/kwide-probe';
export const PROBE_CELLS = [['Ajisai', [0.05, 0.1]], ['LAGEOS-1', [0.05, 0.1, 0.2]], ['LAGEOS-2', [0.05, 0.1, 0.2]], ['Etalon', [0.05, 0.1, 0.2]], ['GLONASS', [0.05, 0.1, 0.2]], ['GPS', [0.05, 0.1, 0.2]], ['Molniya', [0.001, 0.01, 0.05, 0.1, 0.2, 0.29]]].flatMap(([regime, es]) => es.map((e) => ({ regime, e, key: `${regime}|${e}` })));
export const ABOVE_SAMPLE = [...PAIRS.flatMap((name) => [0.31, 0.5, 0.75].map((e) => ({ name, e, seeded: true }))), ...PAIRS.map((name) => ({ name, e: 0.31, seeded: false }))];
/** The all-regimes fixture of a regime at e (TESSERAL-ALL-REGIMES.md, Amendments 1 and 2; the primary arm). */
const fixtureOf = (r0, e) => ({ name: `${r0.name}|${e}`, n: r0.n, e, i: r0.i, raan: r0.raan, argp: r0.argp, ma: 0, drag: false, thirdBody: true, field: [31, 31], forces: [31, 20], fitDays: arcDays(r0.n), hourly: true, gridMinutes: gridSeconds(r0.n) / 60, forecastDays: 1, referenceTolerance: 1e-12, referenceMaxStep: 300 });
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const groupKey = (labels) => [...labels].sort().join('=');

/**
 * A family group's reading (TESSERAL-DIAGNOSIS.md): members (m, j) with their exact frequencies at the fitted mean motion, the largest
 * separation, and the module path: zonal / m-daily / degenerate (class) / window-merged / set.
 */
export function familyRead(labels, nFit, arc) {
  const members = labels.map((l) => { const [m, j] = l.slice(1, -1).split(',').map(Number); return { m, j, cyclesPerDay: Math.abs(j * nFit - m * EARTH_REV_PER_DAY) }; });
  const fr = members.map((x) => x.cyclesPerDay), separation = Math.max(...fr) - Math.min(...fr);
  const hasZonal = members.some((x) => x.m === 0), hasTess = members.some((x) => x.m > 0);
  // A landed group chains members within the window's merging distance (1.5 / window cycles per day), so a forward group can span more
  // than the arc resolves; the path is read on the clusters at the arc's resolution 1 / arc: a cluster holding a zonal and a tesseral
  // member is the class's degenerate ladder (no window flown separates it); a zonal member in its own cluster is a forward-window merge.
  const sorted = [...members].sort((a, b) => a.cyclesPerDay - b.cyclesPerDay);
  const clusters = [];
  for (const x of sorted) { const c = clusters.at(-1); if (c && x.cyclesPerDay - c.at(-1).cyclesPerDay < 1 / arc) c.push(x); else clusters.push([x]); }
  const degenerate = clusters.find((c) => c.some((x) => x.m === 0) && c.some((x) => x.m > 0));
  const mDaily = members.filter((x) => x.m > 0 && x.j === 0);
  let modulePath, reason;
  if (!hasTess) { modulePath = 'zonal'; reason = 'm = 0 only: the zonal short-period / zonal tail, not the tesseral model'; }
  else if (members.every((x) => x.m > 0 && x.j === 0)) { modulePath = 'm-daily'; reason = 'j = 0, m > 0: the m-daily set (SPEC 16.2), kept under the grid'; }
  else if (degenerate) { const span = degenerate.at(-1).cyclesPerDay - degenerate[0].cyclesPerDay; modulePath = 'degenerate (class)'; reason = `the zonal ${degenerate.filter((x) => x.m === 0).map((x) => `(${x.m},${x.j})`).join(' ')} and the tesseral ladder ${degenerate.filter((x) => x.m > 0).map((x) => `(${x.m},${x.j})`).join(' ')} coincide within ${span.toExponential(1)} cycles per day (the arc resolves 1 / ${arc} d): not separable by frequency on any window flown; decided by the pair reading`; }
  else if (hasZonal) { modulePath = 'window-merged'; reason = `a zonal member ${members.filter((x) => x.m === 0).map((x) => `(${x.m},${x.j})`).join(' ')} at least ${(1 / arc).toFixed(3)} cycles per day from the tesseral members: separable in-arc (1 / ${arc} d), merged on the one-day forward window (1.5 cycles per day)`; }
  else { modulePath = 'set'; reason = 'm > 0, j != 0: the first-order tesseral short-period table (sp_terms, q in {-1, 0, 1}), exactly what the grid replaces above the switch' + (new Set(members.map((x) => x.m)).size > 1 ? `; ${members.length} tesseral members within ${separation.toFixed(3)} cycles per day share the group` : '') + (mDaily.length ? `; the group includes the m-daily ${mDaily.map((x) => `(${x.m},${x.j})`).join(' ')}` : ''); }
  return { labels, members, separationCpd: separation, clustersAtArc: clusters.length, modulePath, reason };
}
/** Least-squares slope of log amplitude against log e over (e, amplitude) points with amplitude > 0 (two or more). */
export function slope(points) {
  const p = points.filter((x) => x.amplitudeM > 0 && x.e > 0);
  if (p.length < 2) return null;
  const xs = p.map((x) => Math.log(x.e)), ys = p.map((x) => Math.log(x.amplitudeM));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return sxx > 0 ? xs.reduce((s, x, k) => s + (x - mx) * (ys[k] - my), 0) / sxx : null;
}
/** The per-cell reading from the landed row and the regime's other landed rows (no module). */
export function cellRead(row, regimeRows) {
  const arc = row.arcDays, nFit = row.fitted.n, b = row.bounds;
  const withPath = (fam) => ({ ...fam, ...familyRead(fam.labels, nFit, arc) });
  const forward = row.forward.families.map(withPath), inArc = row.inArc.families.map(withPath);
  const topForward = forward.filter((g) => g.amplitudeM >= 0.1 * row.forward.rmsM).slice(0, 8);
  // amplitude of every forward group across the regime's flown cells, and its slope against e
  const byKey = { forward: new Map(), inArc: new Map() };
  for (const leg of ['forward', 'inArc']) for (const r of regimeRows) for (const g of r[leg].families) { const k = groupKey(g.labels); if (!byKey[leg].has(k)) byKey[leg].set(k, []); byKey[leg].get(k).push({ e: r.e, amplitudeM: g.amplitudeM }); }
  const withScaling = (g, leg = 'forward') => { const pts = (byKey[leg].get(groupKey(g.labels)) ?? []).sort((x, y) => x.e - y.e); return { ...g, leg, amplitudeByE: pts, slopeLogE: slope(pts) }; };
  const ts = row.forward.shares.tesseral, ti = row.inArc.shares.tesseral;
  const over = { forward: ts.rmsM > b.rms || ts.maxM > b.max || ts.roughM > b.rough, inArc: ti.rmsM > b.rms || ti.maxM > b.max };
  let leg;
  if (row.legs.forward === 'fail') leg = 'forward'; else if (row.legs.inArc === 'fail') leg = 'inArc';
  else if (over.forward) leg = 'forward'; else if (over.inArc) leg = 'inArc'; else leg = null;
  const tessKinds = ['tesseral', 'm-daily'];
  const largest = (list, pred) => list.filter(pred).sort((x, y) => y.amplitudeM - x.amplitudeM)[0] ?? null;
  const resonantClass = ts.rmsM === 0 && (HALF_DAY.includes(row.regime) || row.regime === 'THEMIS D');
  let failing, basis;
  if (leg === 'forward' && largest(forward, (g) => tessKinds.includes(g.kind))) { failing = largest(forward, (g) => tessKinds.includes(g.kind)); basis = `forward tesseral share ${f(ts.rmsM)} m [${f(ts.lo?.rmsM)}, ${f(ts.hi?.rmsM)}] against ${f(b.rms)} m (${row.legs.forward})`; }
  else if (leg === 'inArc' && largest(inArc, (g) => tessKinds.includes(g.kind))) { failing = largest(inArc, (g) => tessKinds.includes(g.kind)); basis = `in-arc tesseral share ${f(ti.rmsM)} m [${f(ti.lo?.rmsM)}, ${f(ti.hi?.rmsM)}] against ${f(b.rms)} m (${row.legs.inArc})`; }
  else { failing = largest(forward, (g) => g.kind === 'mixed') ?? largest(forward, () => true); basis = leg ? `the ${leg} leg's share is over the bound but names no tesseral family; the largest mixed group named` : `no share point estimate over the bound (undecided by interval width); the largest ${failing?.kind ?? ''} group named`; }
  const mixedLargest = largest(forward, (g) => g.kind === 'mixed');
  return {
    verdict: row.verdict, legs: row.legs, rawPass: row.rawPass, bounds: b, A_m: row.A_m, fittedE: row.fitted.e, arcDays: arc,
    shares: { forward: { tesseral: ts, mixed: row.forward.shares.mixed, zonal: row.forward.shares.zonal, secular: row.forward.shares.secular, rmsM: row.forward.rmsM, maxM: row.forward.maxM, roughM: row.forward.roughM }, inArc: { tesseral: ti, mixed: row.inArc.shares.mixed, zonal: row.inArc.shares.zonal, secular: row.inArc.shares.secular, rmsM: row.inArc.rmsM, maxM: row.inArc.maxM, conditioned: row.inArc.conditioned, maxJResolved: row.inArc.basis.maxJResolved } },
    failingLeg: leg, failingBasis: basis, failing: failing ? withScaling(failing, failing === largest(inArc, (g) => tessKinds.includes(g.kind)) && leg === 'inArc' ? 'inArc' : 'forward') : null, resonantClass,
    largestMixed: mixedLargest ? withScaling(mixedLargest) : null,
    forwardFamilies: topForward.map((g) => withScaling(g, 'forward')),
    inArcFamilies: inArc.filter((g) => g.amplitudeM >= 0.1 * row.inArc.rmsM).slice(0, 8).map((g) => withScaling(g, 'inArc')),
    secularForwardM: row.forward.shares.secular.rmsM, secularInArcM: row.inArc.shares.secular.rmsM,
  };
}
/** The pair reading at the module's own threshold: the landed 0.29 (set), 0.30 and 0.31 (grid) flights of one orbit. */
export function pairRead(name, landed) {
  const get = (e) => landed.find((r) => r.key === `${name}|${e}` && r.flown);
  const lo = get(0.29), mid = get(0.3), hi = get(0.31);
  if (!lo || !hi) return { regime: name, measured: false };
  const resolution = (lo.convergenceMaxM ?? 0) + (hi.convergenceMaxM ?? 0);
  const shares = (r) => Object.fromEntries(['tesseral', 'mixed', 'zonal', 'secular'].map((k) => [k, { forwardM: r.forward.shares[k].rmsM, inArcM: r.inArc.shares[k].rmsM }]));
  const groups = (leg) => { const m = new Map(); for (const [tag, r] of [['e029', lo], ['e030', mid], ['e031', hi]]) if (r) for (const g of r[leg].families) { const k = groupKey(g.labels); if (!m.has(k)) m.set(k, { labels: g.labels, kind: g.kind, ...familyRead(g.labels, lo.fitted.n, lo.arcDays), amplitudeM: {} }); m.get(k).amplitudeM[tag] = g.amplitudeM; } return [...m.values()].filter((g) => Math.max(g.amplitudeM.e029 ?? 0, g.amplitudeM.e031 ?? 0) >= 0.1 * Math.min(lo[leg].rmsM, hi[leg].rmsM)).sort((x, y) => (y.amplitudeM.e029 ?? 0) - (x.amplitudeM.e029 ?? 0)).slice(0, 10).map((g) => ({ ...g, changeM: (g.amplitudeM.e031 ?? 0) - (g.amplitudeM.e029 ?? 0), claimed: Math.abs((g.amplitudeM.e031 ?? 0) - (g.amplitudeM.e029 ?? 0)) > resolution })); };
  const pathReach = (p) => { const gs = groups('forward').filter((g) => g.modulePath === p); if (!gs.length) return null; const a = gs.reduce((s, g) => s + (g.amplitudeM.e029 ?? 0) ** 2, 0) ** 0.5, c = gs.reduce((s, g) => s + (g.amplitudeM.e031 ?? 0) ** 2, 0) ** 0.5; return { e029M: a, e031M: c, changeM: c - a, reaches: c - a < -resolution, claimed: Math.abs(c - a) > resolution }; };
  return { regime: name, measured: true, resolutionM: resolution, fittedE: { e029: lo.fitted.e, e030: mid?.fitted.e, e031: hi.fitted.e }, gridExercised: { e030: mid?.gridExercised, e031: hi.gridExercised },
    forward: { e029: { rmsM: lo.forward.rmsM, maxM: lo.forward.maxM }, e030: mid ? { rmsM: mid.forward.rmsM, maxM: mid.forward.maxM } : null, e031: { rmsM: hi.forward.rmsM, maxM: hi.forward.maxM } },
    inArc: { e029: { rmsM: lo.inArc.rmsM, maxM: lo.inArc.maxM }, e030: mid ? { rmsM: mid.inArc.rmsM, maxM: mid.inArc.maxM } : null, e031: { rmsM: hi.inArc.rmsM, maxM: hi.inArc.maxM } },
    shares: { e029: shares(lo), e030: mid ? shares(mid) : null, e031: shares(hi) },
    shareChange: Object.fromEntries(['tesseral', 'mixed', 'zonal', 'secular'].map((k) => [k, { forwardM: hi.forward.shares[k].rmsM - lo.forward.shares[k].rmsM, inArcM: hi.inArc.shares[k].rmsM - lo.inArc.shares[k].rmsM, claimedForward: Math.abs(hi.forward.shares[k].rmsM - lo.forward.shares[k].rmsM) > resolution }])),
    forwardGroups: groups('forward'), inArcGroups: groups('inArc'),
    reachByPath: Object.fromEntries(['set', 'degenerate (class)', 'window-merged', 'zonal', 'm-daily'].map((p) => [p, pathReach(p)])) };
}

if (args.run) {
  const MOD = process.env.SDN_MODULES_ROOT;
  if (!MOD) throw new Error('SDN_MODULES_ROOT names the modules root');
  const apWasm = path.join(MOD, 'propagator/sdn-ap/dist/isomorphic/module.wasm'), ffmWasm = path.join(MOD, 'propagator/ffm/dist/isomorphic/module.wasm');
  if (sha256(fs.readFileSync(apWasm)) !== PIN.sdnAp.wasmSha256) throw new Error(`${apWasm} is not sdn-ap ${PIN.sdnAp.version}`);
  if (sha256(fs.readFileSync(ffmWasm)) !== PIN.ffm.wasmSha256) throw new Error(`${ffmWasm} is not ffm ${PIN.ffm.version}`);
  process.env.SDNAP_WASM = apWasm;
  process.env.SDN_AP_HEO_CACHE = process.env.SDN_AP_HEO_CACHE ?? '/Users/tj/software/terrain-work/body-look/diag/heo-cache';
  const { runModelTruth } = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/test/lib/heo-model-truth.mjs')).href);
  const O = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/test/lib/ocm.mjs')).href);
  const { createRequire } = await import('node:module');
  const req = createRequire(path.join(MOD, 'propagator/sdn-ap/package.json'));
  const { createStandaloneHarness } = await import(pathToFileURL(req.resolve('space-data-module-sdk/testing/isomorphic')).href);
  const { pcfOutputFrame } = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/PCF/pcfOutputFrame.js')).href);
  const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
  if (SHARDS > 4) throw new Error('at most 4 shards');
  fs.mkdirSync(RESULTS, { recursive: true });
  const outFile = path.join(RESULTS, `rows-${SHARD}.jsonl`);
  const done = new Set(readRows().map((r) => r.id));
  const stamp = () => ({ createdUtc: new Date().toISOString(), runner: RUNNER, modulesCommit: PIN.modulesCommit, sdnAp: PIN.sdnAp, ffm: PIN.ffm, shard: SHARD });
  const emit = (row) => { fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`); };
  const landed = landedRows();
  const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
  const gridCache = (h) => { const x = h.instance?.exports; if (!x?.sdnap_wide_grid_cache || !x.sdnap_alloc) return null; const p = x.sdnap_alloc(48); x.sdnap_wide_grid_cache(p); const mem = (h.memory ?? x.memory).buffer; const v = Array.from(new Float64Array(mem, p, 3)); x.sdnap_wide_grid_stats(0, p); const s = Array.from(new Float64Array((h.memory ?? x.memory).buffer, p, 2)); return { gridsHeld: v[0], bytes: v[1], gridsBuilt: v[2], lookups: s[0], fitLookups: s[1] }; };
  const memoryBytes = (h) => (h.memory ?? h.instance?.exports?.memory)?.buffer?.byteLength ?? null;
  const flyRaw = async (h, set, epochs) => { const r = await h.invoke({ methodId: 'propagate', inputs: O.flight([set], { output: { EPOCHS: epochs, FRAME: pcfOutputFrame.GCRF } }) }); if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${r.errorMessage}`); return Buffer.from(r.outputs.find((o) => o.portId === 'ephemeris').payload); };
  // Amendment 1: the probe arm. SDNAP_PROBE_WASM is the kWideE 0.01 build, SDNAP_CONTROL_WASM the same branch built with the parameter
  // unset; both experiments-only dists in this lane's scratch, never a repository dist. The all-regimes registered code is imported with
  // an empty argument list so none of its own branches runs.
  if (args.arm === 'probe') {
    const probeWasm = process.env.SDNAP_PROBE_WASM ?? '/Users/tj/software/terrain-work/body-look/diag/build-probe/isomorphic/module.wasm';
    const controlWasm = process.env.SDNAP_CONTROL_WASM ?? '/Users/tj/software/terrain-work/body-look/diag/build-control/isomorphic/module.wasm';
    const probeSha = sha256(fs.readFileSync(probeWasm));
    if (probeSha === PIN.sdnAp.wasmSha256) throw new Error('the probe dist equals the shipped dist');
    const argvSave = process.argv; process.argv = process.argv.slice(0, 2);
    const AR = await import(pathToFileURL(path.join(HERE, 'tesseral-all-regimes.mjs')).href);
    process.argv = argvSave;
    const { OEM } = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/OEM/OEM.js')).href);
    const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
    const probeStamp = () => ({ ...stamp(), arm: 'probe', probe: { wasmSha256: probeSha, wideE: PROBE_WIDE_E, branch: PROBE_BRANCH } });
    const prov = (w) => { const p = path.join(path.dirname(w), '..', 'build-provenance.txt'); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter((l) => /^(module|version|sha256|wideE|toolchain)/.test(l)).join('\n') : null; };
    if (SHARD === 0 && !done.has('build:probe')) {
      const controlSha = fs.existsSync(controlWasm) ? sha256(fs.readFileSync(controlWasm)) : null;
      emit({ id: 'build:control', type: 'build', ...probeStamp(), wasmSha256: controlSha, reproducesShipped: controlSha === PIN.sdnAp.wasmSha256, provenance: prov(controlWasm) });
      emit({ id: 'build:probe', type: 'build', ...probeStamp(), wasmSha256: probeSha, provenance: prov(probeWasm) });
      console.log('build:control', controlSha?.slice(0, 12), controlSha === PIN.sdnAp.wasmSha256 ? 'reproduces aa3ed22a' : 'DOES NOT reproduce aa3ed22a', 'build:probe', probeSha.slice(0, 12));
    }
    const pitems = [...ABOVE_SAMPLE.map((x) => ({ kind: 'above', ...x })), ...PROBE_CELLS.map((x) => ({ kind: 'probe', ...x }))].filter((_, k) => k % SHARDS === SHARD);
    const hProbe = await createStandaloneHarness('browser', probeWasm, { surface: 'command' });
    const hBase = await createStandaloneHarness('browser', apWasm, { surface: 'command' });
    const flyStates = async (h, set, epochs) => OEM.getRootAsOEM(new fb.ByteBuffer(await flyRaw(h, set, epochs))).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES.map((l) => [l.X, l.Y, l.Z]);
    const firstDiff = (x, y) => { if (x.length !== y.length) return { lengths: [x.length, y.length] }; for (let k = 0; k < x.length; k += 1) if (x[k] !== y[k]) return { byte: k }; return null; };
    const slim = (x) => ({ samples: x.samples, rmsM: x.rmsM, maxM: x.maxM, roughM: x.roughM, fitRmsKm: x.fitRmsKm, conditioned: x.conditioned, sharesInQuadratureM: x.sharesInQuadratureM, basis: x.basis, jackknife: x.jackknife, shares: x.shares, families: x.families.slice(0, 12) });
    const myCells = readRows().filter((r) => r.type === 'cell' && r.read);
    for (const it of pitems) {
      const id = it.kind === 'above' ? `above:${it.name}|${it.e}|${it.seeded ? 'seeded' : 'fitted'}` : `probe:${it.key}`;
      if (done.has(id)) continue;
      const t0 = Date.now();
      const r0 = it.kind === 'above' ? (it.name === 'THEMIS D' ? THEMIS_D : REGIMES.find((x) => x.name === it.name)) : REGIMES.find((x) => x.name === it.regime);
      try {
        if (it.kind === 'above') {
          let set, epoch0 = EPOCH, fittedE = null;
          if (it.seeded) set = O.seedOcm({ epoch: EPOCH, n: r0.n, e: it.e, i: r0.i, raan: r0.raan, argp: r0.argp, ma: 0, tesseral: 31, zonal: 20 });
          else { const r = await runModelTruth({ ...fixtureOf(r0, it.e), modulePath: apWasm }); set = Buffer.from(r.omm, 'base64'); epoch0 = r.epoch; fittedE = r.fitted.e; }
          const t0ms = Date.parse(`${epoch0}Z`), epochs = Array.from({ length: 65 }, (_, k) => iso(t0ms + k * 1350000));
          const P = await flyRaw(hProbe, set, epochs), B = await flyRaw(hBase, set, epochs);
          const d = firstDiff(P, B);
          emit({ id, type: 'above', regime: it.name, e: it.e, seeded: it.seeded, fittedE, ...probeStamp(), flown: true, equal: !d, firstDifference: d, payloadBytes: B.length, payloadSha256: sha256(B), seconds: (Date.now() - t0) / 1000 });
          console.log(id, `probe = 0.6.3: ${!d}`, `bytes ${B.length}`);
        } else {
          const c = { key: it.key, regime: it.regime, e: it.e, n: r0.n, i: r0.i, raan: r0.raan, argp: r0.argp, arcDays: arcDays(r0.n), perigeeKm: perigeeKm(r0.n, it.e) };
          if (c.perigeeKm < 200) { emit({ id, type: 'probe', ...c, ...probeStamp(), flown: false, reason: 'below the perigee floor' }); console.log(id, 'below the perigee floor'); continue; }
          const gridMinutes = gridSeconds(c.n) / 60;
          const fixture = { ...fixtureOf(r0, it.e), modulePath: probeWasm };
          const r = await runModelTruth(fixture);
          const set = Buffer.from(r.omm, 'base64');
          const profile = r.profile, tau = profile.map((p) => p.h / 24), rtn = profile.map((p) => [p.r, p.t, p.n]), err3 = profile.map((p) => p.e);
          const epochs = r.referenceStates.map((_, k) => iso(Date.parse(`${r.epoch}Z`) + Math.round((c.arcDays + (k + 1) * gridMinutes / 1440) * DAY)));
          const withCaps = r.flown.map((s) => s.slice(0, 3));
          const zonalOnly = await flyStates(hProbe, O.repackOcm(set, (t) => { t.PERTURBATIONS.MAXIMUM_TESSERAL_DEGREE = 0; }), epochs);
          const A = rms(withCaps.map((p, k) => Math.hypot(...p.map((x, ax) => (x - zonalOnly[k][ax]) * 1000))));
          const b = AR.bounds(A);
          const forward = { samples: profile.length, gridSeconds: gridSeconds(c.n), rmsM: rms(err3), maxM: Math.max(...err3), roughM: roughness(rtn), ...AR.attribute(tau, rtn, r.fitted.n, 1, 1 / r.fitted.n) };
          const arcOem = OEM.getRootAsOEM(new fb.ByteBuffer((await runModelTruth({ ...fixture, fitInput: true })).ephemeris.payload)).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES;
          const arcFlown = await flyStates(hProbe, set, arcOem.map((l) => l.EPOCH));
          const arcRtn = arcOem.map((l, k) => AR.rtnOf([arcFlown[k][0] - l.X, arcFlown[k][1] - l.Y, arcFlown[k][2] - l.Z], [l.X, l.Y, l.Z], [l.X_DOT, l.Y_DOT, l.Z_DOT]));
          const arcTau = arcOem.map((l) => (Date.parse(`${l.EPOCH}Z`) - Date.parse(`${arcOem[0].EPOCH}Z`)) / DAY);
          const arcNorm = arcRtn.map((p) => Math.hypot(...p));
          const inArc = { samples: arcRtn.length, rmsM: rms(arcNorm), maxM: Math.max(...arcNorm), fitRmsKm: r.fitted.wrms, ...AR.attribute(arcTau, arcRtn, r.fitted.n, c.arcDays, 1) };
          const v = AR.verdictOf(forward, inArc, b);
          // cost by difference (Amendment 1.1): the probe-fitted set to the fit's end plus one minute, five fresh invokes on each build
          const target = iso(Date.parse(`${r.epoch}Z`) + c.arcDays * DAY + 60000);
          const timeIt = async (h) => { const out = []; for (let k = 0; k < 5; k += 1) { const a = performance.now(); await flyRaw(h, set, [target]); out.push(performance.now() - a); } return out; };
          const probeMs = await timeIt(hProbe), baseMs = await timeIt(hBase);
          const gridsNeeded = Math.ceil(c.arcDays / 2) + 1, differenceMs = median(probeMs) - median(baseMs);
          const landedRow = landed.find((x) => x.key === c.key && x.flown);
          const cellRow = myCells.find((x) => x.key === c.key);
          const fam = (list, labels) => list.find((g) => groupKey(g.labels) === groupKey(labels)) ?? null;
          const failing = cellRow?.failing ? { labels: cellRow.failing.labels, modulePath: cellRow.failing.modulePath, leg: cellRow.failing.leg, landedM: cellRow.failing.amplitudeM, probeM: fam((cellRow.failing.leg === 'inArc' ? inArc : forward).families, cellRow.failing.labels)?.amplitudeM ?? null } : null;
          const gridReads = v.verdict.startsWith('pass') ? 'grid passes' : v.verdict.startsWith('fail') ? 'grid fails' : `grid ${v.verdict}`;
          const landedSlim = landedRow ? { verdict: landedRow.verdict, legs: landedRow.legs, rawPass: landedRow.rawPass, fittedE: landedRow.fitted.e, A_m: landedRow.A_m, bounds: landedRow.bounds, forward: { rmsM: landedRow.forward.rmsM, maxM: landedRow.forward.maxM, roughM: landedRow.forward.roughM, shares: landedRow.forward.shares }, inArc: { rmsM: landedRow.inArc.rmsM, maxM: landedRow.inArc.maxM, shares: landedRow.inArc.shares } } : null;
          emit({ id, type: 'probe', ...c, ...probeStamp(), flown: true, fitted: r.fitted, gridExercised: r.fitted.e > PROBE_WIDE_E, A_m: A, bounds: b, forward: slim(forward), inArc: slim(inArc), ...v, gridReads, landed: landedSlim, failing,
            cost: { probeMs: { median: median(probeMs), all: probeMs }, baseMs: { median: median(baseMs), all: baseMs }, differenceMs, gridsNeeded, memoryArithmeticMB: gridsNeeded * 3.1, withinColdTarget: differenceMs <= BUDGET.coldMedianMs, surface: 'command surface, one fresh instance per invoke: each figure is instantiation plus one flight; the difference is the grid cost' },
            reference: `propagator/ffm ${PIN.ffm.version}: EGM96 31x31, Sun and Moon point masses (DE440), no drag, SRP, tides, relativity or Earth radiation; RK78 rel 1e-12 abs 1e-9, steps 0.01 to 300 s; zero EOP`, kernelSha256: r.kernelSha256, seconds: (Date.now() - t0) / 1000 });
          console.log(id, v.verdict, `legs ${v.legs.forward}/${v.legs.inArc}`, `landed ${landedRow?.verdict}`, `tess fwd ${f(forward.shares.tesseral.rmsM)} (landed ${f(landedRow?.forward.shares.tesseral.rmsM)}) in-arc ${f(inArc.shares.tesseral.rmsM)} (landed ${f(landedRow?.inArc.shares.tesseral.rmsM)}) mixed fwd ${f(forward.shares.mixed.rmsM)} (landed ${f(landedRow?.forward.shares.mixed.rmsM)})`, `raw ${f(forward.rmsM)}/${f(forward.maxM)}/${f(forward.roughM, 3)} (landed ${f(landedRow?.forward.rmsM)}/${f(landedRow?.forward.maxM)})`, `fitted e ${f(r.fitted.e, 4)} cost ${f(median(probeMs), 0)} - ${f(median(baseMs), 0)} = ${f(differenceMs, 0)} ms`, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
        }
      } catch (error) {
        emit({ id, type: it.kind, regime: it.regime ?? it.name, e: it.e, ...probeStamp(), flown: false, error: String(error?.message ?? error).slice(0, 300), seconds: (Date.now() - t0) / 1000 });
        console.log(id, 'ERROR', String(error?.message ?? error).slice(0, 300));
      }
    }
    await hProbe.close?.(); await hBase.close?.();
    process.exit(0);
  }
  // Shard 0: the cell reading and the pair reading, from the landed rows (no module).
  if (SHARD === 0) {
    for (const c of cells()) {
      const id = `cell:${c.key}`;
      if (done.has(id)) continue;
      const row = landed.find((r) => r.key === c.key && r.flown);
      if (!row) { emit({ id, type: 'cell', ...c, ...stamp(), read: false, reason: 'no landed flown row' }); continue; }
      const read = cellRead(row, landed.filter((r) => r.regime === c.regime && r.flown));
      emit({ id, type: 'cell', ...c, ...stamp(), read: true, landedCreatedUtc: row.createdUtc, landedRunner: row.runner, ...read });
      console.log(id, read.verdict, 'failing', read.failing ? `${read.failing.labels.slice(0, 3).join('=')} ${read.failing.kind} ${f(read.failing.amplitudeM, 1)} m path ${read.failing.modulePath} slope ${f(read.failing.slopeLogE, 2)}` : '-', 'on', read.failingBasis);
    }
    for (const name of PAIRS) {
      const id = `pair:${name}`;
      if (done.has(id)) continue;
      const p = pairRead(name, landed);
      emit({ id, type: 'pair', ...stamp(), ...p });
      console.log(id, p.measured ? `shares fwd tess ${f(p.shares.e029.tesseral.forwardM)} -> ${f(p.shares.e031.tesseral.forwardM)} mixed ${f(p.shares.e029.mixed.forwardM)} -> ${f(p.shares.e031.mixed.forwardM)} res ${p.resolutionM.toExponential(1)}` : 'unmeasured');
    }
  }
  // The module items, split by shard: cost on the three 0.31 sets; identity for every regime at e 0.001, 0.1, 0.2, 0.3.
  const items = [...PAIRS.map((name) => ({ kind: 'cost', name })), ...REGIMES.flatMap((r) => [0.001, 0.1, 0.2, 0.3].map((e) => ({ kind: 'identity', name: r.name, e, r })))].filter((_, k) => k % SHARDS === SHARD);
  const gridBearing = O.seedOcm({ epoch: EPOCH, n: 2.006, e: 0.31, i: 63.4, raan: 0, argp: 270, ma: 0, tesseral: 31, zonal: 20 });
  for (const it of items) {
    const id = it.kind === 'cost' ? `cost:${it.name}` : `identity:${it.name}|${it.e}`;
    if (done.has(id)) continue;
    const t0 = Date.now();
    try {
      if (it.kind === 'cost') {
        const r0 = it.name === 'THEMIS D' ? THEMIS_D : REGIMES.find((x) => x.name === it.name);
        const arc = arcDays(r0.n);
        const fixture = { name: `${it.name}|0.31`, n: r0.n, e: 0.31, i: r0.i, raan: r0.raan, argp: r0.argp, ma: 0, drag: false, thirdBody: true, field: [31, 31], forces: [31, 20], fitDays: arc, hourly: true, gridMinutes: gridSeconds(r0.n) / 60, forecastDays: 1, referenceTolerance: 1e-12, referenceMaxStep: 300, modulePath: apWasm };
        const r = await runModelTruth(fixture);
        const set = Buffer.from(r.omm, 'base64');
        const epochMs = Date.parse(`${r.epoch}Z`), fitEndMs = epochMs + arc * DAY;
        const cold = { epoch: [], fitEnd: [] }, caches = { epoch: [], fitEnd: [] }, memory = [];
        for (const [tag, target] of [['epoch', epochMs + 60000], ['fitEnd', fitEndMs + 60000]]) for (let k = 0; k < 5; k += 1) {
          const h = await createStandaloneHarness('browser', apWasm, { surface: 'command' });
          const a = performance.now(); await flyRaw(h, set, [iso(target)]); cold[tag].push(performance.now() - a);
          caches[tag].push(gridCache(h)); memory.push(memoryBytes(h));
          if (tag === 'fitEnd' && k === 4) {
            const warm = [];
            for (let w = 1; w <= 5; w += 1) { const b = performance.now(); await flyRaw(h, set, [iso(fitEndMs + DAY + w * 60000)]); warm.push(performance.now() - b); }
            const after = gridCache(h), mem = memoryBytes(h);
            emit({ id, type: 'cost', regime: it.name, ...stamp(), fittedE: r.fitted.e, gridExercised: r.fitted.e > K_WIDE_E, arcDays: arc, fitEpoch: r.epoch,
              coldMs: { epoch: { median: median(cold.epoch), all: cold.epoch }, fitEnd: { median: median(cold.fitEnd), all: cold.fitEnd } }, cacheAfterCold: caches, warmMs: { median: median(warm), all: warm }, cacheAfterWarm: after,
              memoryBytes: { afterColdMax: Math.max(...memory.filter(Number.isFinite)), afterWarm: mem }, bytesPerGrid: after && after.gridsHeld > 0 ? after.bytes / after.gridsHeld : null,
              budget: BUDGET, within: { coldEpoch: median(cold.epoch) <= BUDGET.coldMedianMs, coldFitEnd: median(cold.fitEnd) <= BUDGET.coldMedianMs, warm: median(warm) <= BUDGET.warmMsPerRecordPerWorker, memory: (mem ?? Infinity) <= BUDGET.memoryMB * 1048576 }, seconds: (Date.now() - t0) / 1000 });
            console.log(id, `fitted e ${f(r.fitted.e, 4)} cold epoch ${f(median(cold.epoch), 1)} ms fitEnd ${f(median(cold.fitEnd), 1)} ms warm ${f(median(warm), 1)} ms grids ${after?.gridsHeld} ${f((after?.bytes ?? 0) / 1048576, 2)} MB built ${after?.gridsBuilt} memory ${f((mem ?? 0) / 1048576, 1)} MB`);
          }
          await h.close?.();
        }
      } else {
        if (perigeeKm(it.r.n, it.e) < 200) { emit({ id, type: 'identity', regime: it.name, e: it.e, ...stamp(), flown: false, reason: 'below the perigee floor' }); console.log(id, 'below the perigee floor'); continue; }
        const set = O.seedOcm({ epoch: EPOCH, n: it.r.n, e: it.e, i: it.r.i, raan: it.r.raan, argp: it.r.argp, ma: 0, tesseral: 31, zonal: 20 });
        const t0ms = Date.parse(`${EPOCH}Z`), epochs = Array.from({ length: 65 }, (_, k) => iso(t0ms + k * 1350000));
        const hA = await createStandaloneHarness('browser', apWasm, { surface: 'command' }); const A = await flyRaw(hA, set, epochs); const cacheA = gridCache(hA); await hA.close?.();
        const hB = await createStandaloneHarness('browser', apWasm, { surface: 'command' }); const B = await flyRaw(hB, set, epochs); await hB.close?.();
        const hC = await createStandaloneHarness('browser', apWasm, { surface: 'command' }); await flyRaw(hC, gridBearing, epochs.slice(0, 2)); const cacheC = gridCache(hC); const C = await flyRaw(hC, set, epochs); await hC.close?.();
        const firstDiff = (x, y) => { if (x.length !== y.length) return { lengths: [x.length, y.length] }; for (let k = 0; k < x.length; k += 1) if (x[k] !== y[k]) return { byte: k }; return null; };
        const ab = firstDiff(A, B), ac = firstDiff(A, C);
        emit({ id, type: 'identity', regime: it.name, e: it.e, ...stamp(), flown: true, setPath: it.e <= K_WIDE_E, payloadBytes: A.length, payloadSha256: sha256(A), equalAB: !ab, equalAC: !ac, firstDifference: { AB: ab, AC: ac }, cacheA, cacheC, gridInCacheForC: (cacheC?.gridsHeld ?? 0) > 0, seconds: (Date.now() - t0) / 1000 });
        console.log(id, `A=B ${!ab} A=C ${!ac} grid in cache for C ${cacheC?.gridsHeld ?? 'unknown'} bytes ${A.length}`);
      }
    } catch (error) {
      emit({ id, type: it.kind, regime: it.name, e: it.e, ...stamp(), flown: false, error: String(error?.message ?? error).slice(0, 300), seconds: (Date.now() - t0) / 1000 });
      console.log(id, 'ERROR', String(error?.message ?? error).slice(0, 300));
    }
  }
  process.exit(0);
}

/** The table and README from the rows. */
export function table(outDir = RESULTS) {
  const rows = readRows();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const pairs = Object.fromEntries(PAIRS.map((n) => [n, byId.get(`pair:${n}`) ?? { regime: n, measured: false }]));
  const costs = PAIRS.map((n) => byId.get(`cost:${n}`) ?? { id: `cost:${n}`, regime: n, measured: false });
  const identity = REGIMES.flatMap((r) => [0.001, 0.1, 0.2, 0.3].map((e) => byId.get(`identity:${r.name}|${e}`) ?? { id: `identity:${r.name}|${e}`, regime: r.name, e, unmeasured: true }));
  const identityKept = (regime) => { const rs = identity.filter((x) => x.regime === regime && x.flown); return rs.length ? (rs.every((x) => x.equalAB && x.equalAC) ? 'kept' : 'BROKEN') : 'unmeasured'; };
  const costWithin = costs.filter((c) => c.type === 'cost').length ? (costs.filter((c) => c.type === 'cost').every((c) => c.within.coldEpoch && c.within.warm && c.within.memory) ? 'within budget' : `over budget (${costs.filter((c) => c.type === 'cost').flatMap((c) => Object.entries(c.within).filter(([, ok]) => !ok).map(([k]) => `${c.regime} ${k}`)).join(', ')})`) : 'unmeasured';
  // Amendment 1: the probe arm's rows
  const builds = { control: byId.get('build:control') ?? null, probe: byId.get('build:probe') ?? null };
  const above = ABOVE_SAMPLE.map((x) => byId.get(`above:${x.name}|${x.e}|${x.seeded ? 'seeded' : 'fitted'}`) ?? { id: `above:${x.name}|${x.e}|${x.seeded ? 'seeded' : 'fitted'}`, regime: x.name, e: x.e, seeded: x.seeded, unmeasured: true });
  const aboveFlown = above.filter((x) => x.flown);
  const aboveKept = aboveFlown.length === 0 ? 'unmeasured' : aboveFlown.length === above.length && aboveFlown.every((x) => x.equal) ? 'kept' : aboveFlown.every((x) => x.equal) ? 'kept on the flown sample (incomplete)' : 'BROKEN';
  const probes = PROBE_CELLS.map((x) => { const r = byId.get(`probe:${x.key}`); if (!r) return { ...x, state: 'unmeasured' }; if (!r.flown) return { ...x, state: r.reason ?? 'error', error: r.error, row: r }; const state = aboveKept === 'BROKEN' ? 'withheld (probe not identical above the switch)' : r.verdict; return { ...x, state, gridReads: aboveKept === 'BROKEN' ? 'withheld' : r.gridExercised ? r.gridReads : 'grid not exercised (fitted e at or below the probe switch)', row: r }; });
  const probeOf = (key) => probes.find((p) => p.key === key);
  const pairFor = (regime) => (regime === 'THEMIS D' ? 'THEMIS D' : regime === 'Molniya' ? 'Molniya' : regime === 'GTO' ? 'GTO' : HALF_DAY.includes(regime) ? 'Molniya+GTO' : 'GTO');
  const gridArm = (regime, p) => {
    const names = pairFor(regime) === 'Molniya+GTO' ? ['Molniya', 'GTO'] : [pairFor(regime)];
    const reads = names.map((n) => ({ n, r: pairs[n]?.measured ? pairs[n].reachByPath[p] : null }));
    const text = reads.map(({ n, r }) => (r ? `${n} pair, ${p} path forward ${f(r.e029M)} -> ${f(r.e031M)} m (${r.claimed ? (r.reaches ? 'grid reaches the path' : 'grid does not reach it') : 'below the pair resolution'})` : `${n} pair: no ${p} group`)).join('; ');
    const reaches = reads.some(({ r }) => r?.claimed && r.reaches) && !reads.some(({ r }) => r?.claimed && !r.reaches);
    return { text: `not flyable below e 0.3 without a module change (kWideE constexpr); nearest evidence: ${text}`, reaches, nearest: names };
  };
  const cellRows = cells().map((c) => {
    const r = byId.get(`cell:${c.key}`);
    if (!r || !r.read) return { ...c, state: 'unmeasured' };
    const p = r.failing?.modulePath ?? '-';
    const arm = gridArm(c.regime, p);
    const setFails = r.verdict.startsWith('fail') ? 'set fails' : r.failingLeg ? 'set misses, undecided' : r.verdict;
    const idk = identityKept(c.regime);
    // Amendment 1: the measured clause: the probe's verdict in the cell, the identity above the switch and the differential cost
    const pr = probeOf(c.key);
    const probeText = pr ? (pr.row?.flown ? `probe (kWideE ${PROBE_WIDE_E}): ${pr.state}, ${pr.gridReads}; cost difference ${f(pr.row.cost.differenceMs, 0)} ms (${pr.row.cost.withinColdTarget ? 'within' : 'over'} the 100 ms cold target); identity above the switch ${aboveKept}` : `probe: ${pr.state}`) : 'probe: not in the probe set';
    const candidate = p === 'set' && pr?.gridReads === 'grid passes' && aboveKept === 'kept' && pr.row.cost.withinColdTarget;
    const namedAs = candidate ? `candidate for a registered switch change elsewhere (${probeText})` : `named as is: ${p}${p === 'set' ? (arm.reaches ? ` (pair: grid reaches the path; ${costWithin}; identity ${idk})` : ' (pair: grid not shown to reach the path)') : p === 'degenerate (class)' ? ' (not separable by frequency; the pair reading decides: see grid arm)' : p === 'window-merged' ? ' (attribution limit, read in-arc)' : p === 'm-daily' ? ' (m-daily set, kept under the grid)' : p === 'zonal' ? ' (not the tesseral model)' : ''}; ${probeText}`;
    return { ...c, state: r.verdict, read: r, setFails, gridArm: arm, costWithin, identityKept: idk, probe: pr ?? null, candidate, namedAs };
  });
  const out = { registration: REGISTRATION, pins: PIN, budget: BUDGET, switchFact: 'propagator/sdn-ap 0.6.3: constexpr double kWideE = 0.3 (src/tesseral.inc line 42), compared at init against the set epoch mean eccentricity (src/xp_theory.inc lines 1466, 1473, 1493; src/fit_oem.inc 159, 593); no $OCM, $PCF, environment, import or export moves it; the grid below e 0.3 is not flyable without a module change',
    cells: cellRows.map((c) => ({ key: c.key, regime: c.regime, e: c.e, groups: c.groups, state: c.state, setFails: c.setFails, failing: c.read?.failing ? { labels: c.read.failing.labels, kind: c.read.failing.kind, amplitudeM: c.read.failing.amplitudeM, cyclesPerDay: c.read.failing.cyclesPerDay, modulePath: c.read.failing.modulePath, reason: c.read.failing.reason, separationCpd: c.read.failing.separationCpd, members: c.read.failing.members, slopeLogE: c.read.failing.slopeLogE, amplitudeByE: c.read.failing.amplitudeByE } : null, failingLeg: c.read?.failingLeg, failingBasis: c.read?.failingBasis, legs: c.read?.legs, bounds: c.read?.bounds, shares: c.read?.shares, forwardFamilies: c.read?.forwardFamilies, inArcFamilies: c.read?.inArcFamilies, largestMixed: c.read?.largestMixed, gridArm: c.gridArm, costWithin: c.costWithin, identityKept: c.identityKept, candidate: c.candidate, namedAs: c.namedAs })),
    pairs, costs, identity,
    probeArm: { builds: { control: builds.control && { wasmSha256: builds.control.wasmSha256, reproducesShipped: builds.control.reproducesShipped, provenance: builds.control.provenance }, probe: builds.probe && { wasmSha256: builds.probe.wasmSha256, wideE: PROBE_WIDE_E, branch: PROBE_BRANCH, provenance: builds.probe.provenance } }, aboveKept, above: above.map((x) => ({ id: x.id, regime: x.regime, e: x.e, seeded: x.seeded, fittedE: x.fittedE, flown: x.flown, equal: x.equal, firstDifference: x.firstDifference, payloadBytes: x.payloadBytes, payloadSha256: x.payloadSha256, error: x.error })),
      cells: probes.map((p) => ({ key: p.key, regime: p.regime, e: p.e, state: p.state, gridReads: p.gridReads, error: p.error, ...(p.row?.flown ? { fittedE: p.row.fitted.e, gridExercised: p.row.gridExercised, A_m: p.row.A_m, bounds: p.row.bounds, rawPass: p.row.rawPass, legs: p.row.legs, verdict: p.row.verdict, forward: { rmsM: p.row.forward.rmsM, maxM: p.row.forward.maxM, roughM: p.row.forward.roughM, conditioned: p.row.forward.conditioned, shares: p.row.forward.shares, families: p.row.forward.families.slice(0, 6) }, inArc: { rmsM: p.row.inArc.rmsM, maxM: p.row.inArc.maxM, conditioned: p.row.inArc.conditioned, maxJResolved: p.row.inArc.basis.maxJResolved, shares: p.row.inArc.shares, families: p.row.inArc.families.slice(0, 6) }, landed: p.row.landed, failing: p.row.failing, cost: p.row.cost } : {}) })),
      summary: { cells: probes.length, flown: probes.filter((p) => p.row?.flown).length, gridPasses: probes.filter((p) => p.gridReads === 'grid passes').map((p) => p.key), gridFails: probes.filter((p) => p.gridReads === 'grid fails').map((p) => p.key), gridUndecided: probes.filter((p) => p.row?.flown && p.gridReads && !['grid passes', 'grid fails', 'withheld'].includes(p.gridReads) && !p.gridReads.startsWith('grid not exercised')).map((p) => `${p.key} [${p.state}]`), notExercised: probes.filter((p) => p.gridReads?.startsWith('grid not exercised')).map((p) => `${p.key} (fitted e ${f(p.row.fitted.e, 4)})`), withheld: probes.filter((p) => p.gridReads === 'withheld').map((p) => p.key), belowFloor: probes.filter((p) => p.state === 'below the perigee floor').map((p) => p.key), unmeasured: probes.filter((p) => p.state === 'unmeasured' || p.error).map((p) => p.key), costDifferenceMs: probes.filter((p) => p.row?.flown).map((p) => ({ key: p.key, probeMs: p.row.cost.probeMs.median, baseMs: p.row.cost.baseMs.median, differenceMs: p.row.cost.differenceMs, gridsNeeded: p.row.cost.gridsNeeded, memoryArithmeticMB: p.row.cost.memoryArithmeticMB, withinColdTarget: p.row.cost.withinColdTarget })) } },
    summary: { cells: cellRows.length, read: cellRows.filter((c) => c.read).length, candidates: cellRows.filter((c) => c.candidate).length, mixedByPath: Object.fromEntries([...new Set(cellRows.filter((c) => c.read?.largestMixed).map((c) => c.read.largestMixed.modulePath))].sort().map((p) => [p, cellRows.filter((c) => c.read?.largestMixed?.modulePath === p).map((c) => c.key)])), byPath: Object.fromEntries([...new Set(cellRows.map((c) => c.read?.failing?.modulePath ?? 'unread'))].sort().map((p) => [p, cellRows.filter((c) => (c.read?.failing?.modulePath ?? 'unread') === p).map((c) => c.key)])), costWithin, identity: { flown: identity.filter((x) => x.flown).length, equal: identity.filter((x) => x.flown && x.equalAB && x.equalAC).length, gridInCacheForC: identity.filter((x) => x.flown && x.gridInCacheForC).length, belowFloor: identity.filter((x) => x.flown === false && x.reason).length, unmeasured: identity.filter((x) => x.unmeasured).length } } };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'table.json'), `${JSON.stringify(out, null, 1)}\n`);
  const iv = (s, k = 'rmsM') => (s ? (s.lo ? `${f(s[k])} [${f(s.lo[k])}, ${f(s.hi[k])}]` : `${f(s[k])} [no interval]`) : '-');
  const fam = (g) => (g ? `${g.labels.slice(0, 3).join('=')} ${g.kind} ${f(g.amplitudeM, 1)} m, ${f(g.cyclesPerDay, 3)} cpd, ${g.modulePath}${g.slopeLogE !== null && g.slopeLogE !== undefined ? `, slope ${f(g.slopeLogE, 2)}` : ''}` : '-');
  const fams = (list) => (list?.length ? list.slice(0, 5).map((g) => `${g.labels.slice(0, 2).join('=')} ${g.kind} ${f(g.amplitudeM, 1)} [${g.modulePath}]`).join('; ') : '-');
  const cellLine = (c) => (c.read ? `| ${c.key} | ${c.groups.join(' ')} | ${c.state} | ${c.read.legs.forward} / ${c.read.legs.inArc} | ${f(c.read.bounds.rms)} / ${f(c.read.bounds.max)} / ${f(c.read.bounds.rough, 3)} | ${iv(c.read.shares.forward.tesseral)} / ${iv(c.read.shares.inArc.tesseral)} | ${f(c.read.shares.forward.mixed.rmsM)} / ${f(c.read.shares.inArc.mixed.rmsM)} | ${f(c.read.shares.forward.secular.rmsM)} / ${f(c.read.shares.inArc.secular.rmsM)} | ${fam(c.read.failing)}${c.read.failing?.leg === 'inArc' ? ' (in-arc)' : ''} | ${c.read.failingBasis} | ${fam(c.read.largestMixed)} | ${fams(c.read.forwardFamilies)} | ${fams(c.read.inArcFamilies)} | ${c.gridArm.text} | ${c.costWithin} | ${c.identityKept} | ${c.namedAs} |` : `| ${c.key} | ${c.groups.join(' ')} | unmeasured | - | - | - | - | - | - | - | - | - | - | - | - | - | - |`);
  const pairLine = (p) => (p.measured ? `| ${p.regime} | ${f(p.fittedE.e029, 4)} / ${f(p.fittedE.e030, 4)} / ${f(p.fittedE.e031, 4)} | ${p.gridExercised.e030 ? 'yes' : 'NO'} / ${p.gridExercised.e031 ? 'yes' : 'NO'} | ${f(p.forward.e029.rmsM)} / ${f(p.forward.e029.maxM)} | ${p.forward.e030 ? `${f(p.forward.e030.rmsM)} / ${f(p.forward.e030.maxM)}` : '-'} | ${f(p.forward.e031.rmsM)} / ${f(p.forward.e031.maxM)} | ${f(p.inArc.e029.rmsM)} -> ${f(p.inArc.e031.rmsM)} | ${['tesseral', 'mixed', 'zonal', 'secular'].map((k) => `${k} ${f(p.shares.e029[k].forwardM)} -> ${f(p.shares.e031[k].forwardM)}${p.shareChange[k].claimedForward ? '' : ' (below resolution)'}`).join('; ')} | ${['tesseral', 'mixed', 'zonal', 'secular'].map((k) => `${k} ${f(p.shares.e029[k].inArcM)} -> ${f(p.shares.e031[k].inArcM)}`).join('; ')} | ${p.resolutionM.toExponential(1)} | ${p.forwardGroups.slice(0, 6).map((g) => `${g.labels.slice(0, 2).join('=')} [${g.modulePath}] ${f(g.amplitudeM.e029, 1)} -> ${f(g.amplitudeM.e031, 1)}${g.claimed ? '' : ' (below resolution)'}`).join('; ')} | ${Object.entries(p.reachByPath).filter(([, v]) => v).map(([k, v]) => `${k}: ${f(v.e029M, 1)} -> ${f(v.e031M, 1)} m, ${v.claimed ? (v.reaches ? 'reaches' : 'does not reach') : 'below resolution'}`).join('; ')} |` : `| ${p.regime} | unmeasured | - | - | - | - | - | - | - | - | - | - |`);
  const costLine = (c) => (c.type === 'cost' ? `| ${c.regime} | ${f(c.fittedE, 4)} (${c.gridExercised ? 'grid' : 'SET PATH'}) | ${c.arcDays} | ${f(c.coldMs.epoch.median, 1)} (${c.coldMs.epoch.all.map((x) => f(x, 0)).join(', ')}) | ${f(c.coldMs.fitEnd.median, 1)} (${c.coldMs.fitEnd.all.map((x) => f(x, 0)).join(', ')}) | ${f(c.warmMs.median, 1)} (${c.warmMs.all.map((x) => f(x, 0)).join(', ')}) | ${c.cacheAfterCold.epoch[0] ? `${c.cacheAfterCold.epoch[0].gridsHeld} / ${f(c.cacheAfterCold.epoch[0].bytes / 1048576, 2)} MB` : '-'} | ${c.cacheAfterCold.fitEnd[0] ? `${c.cacheAfterCold.fitEnd[0].gridsHeld} / ${f(c.cacheAfterCold.fitEnd[0].bytes / 1048576, 2)} MB` : '-'} | ${c.cacheAfterWarm ? `${c.cacheAfterWarm.gridsHeld} / ${f(c.cacheAfterWarm.bytes / 1048576, 2)} MB / built ${c.cacheAfterWarm.gridsBuilt}` : '-'} | ${c.bytesPerGrid ? f(c.bytesPerGrid / 1048576, 2) : '-'} | ${f(c.memoryBytes.afterWarm / 1048576, 1)} | cold ${c.within.coldEpoch ? 'ok' : 'OVER'} / fitEnd ${c.within.coldFitEnd ? 'ok' : 'OVER'} / warm ${c.within.warm ? 'ok' : 'OVER'} / memory ${c.within.memory ? 'ok' : 'OVER'} |` : `| ${c.regime} | ${c.error ? `ERROR ${c.error}` : 'unmeasured'} | - | - | - | - | - | - | - | - | - | - |`);
  const idLine = (x) => (x.flown ? `| ${x.regime} | ${x.e} | ${x.setPath ? 'set' : 'grid'} | ${x.equalAB ? 'equal' : 'DIFFERENT'} | ${x.equalAC ? 'equal' : 'DIFFERENT'} | not observable (one fresh instance per invoke, Amendment 1.1) | ${x.payloadBytes} | ${x.payloadSha256.slice(0, 16)} |` : `| ${x.regime} | ${x.e} | - | ${x.unmeasured ? 'unmeasured' : x.reason ?? `ERROR ${x.error}`} | - | - | - | - |`);
  const md = [`# Tesseral short-period diagnosis on the all-regimes numbers (propagator/sdn-ap 0.6.3; report only)`, '',
    `Registration: ${REGISTRATION}. Ground: the landed all-regimes table (TESSERAL-ALL-REGIMES.md, Amendments 1 to 7; FFM 31x31 with DE440 Sun and Moon against the module at caps 31 / 20; estimator fixed). Pins: modules ${PIN.modulesCommit.slice(0, 9)}, sdn-ap ${PIN.sdnAp.version} ${PIN.sdnAp.wasmSha256.slice(0, 12)}, ffm ${PIN.ffm.version} ${PIN.ffm.wasmSha256.slice(0, 12)}.`, '',
    `## The switch and the grid arm`, out.switchFact + '. Beside it (Amendment 1): the pair reading at the module threshold, the structural path per family, and the probe arm: an experiments-only build of the same source with kWideE as a build-time parameter at ' + PROBE_WIDE_E + ' (branch ' + PROBE_BRANCH + ', never main, never pinned), flown in the all-regimes frame on the 17 fails and their regimes\' e 0.05 to 0.2 cells.', '',
    `## Summary`, `Cells under diagnosis ${out.summary.cells}, read ${out.summary.read}; candidates for a registered switch change elsewhere: ${out.summary.candidates}. Failing-family paths: ${Object.entries(out.summary.byPath).map(([p, ks]) => `${p} ${ks.length} (${ks.join(', ')})`).join('; ')}. Largest mixed group's path where one exists: ${Object.entries(out.summary.mixedByPath).map(([p, ks]) => `${p} ${ks.length}`).join('; ') || 'none'}. Cost of the shipped grid through the command surface (one fresh instance per invoke; instantiation plus flight, Amendment 1.1): ${out.summary.costWithin}. Set-path determinism (A = B = C across fresh instances): ${out.summary.identity.equal} of ${out.summary.identity.flown} flights equal; ${out.summary.identity.belowFloor} below the perigee floor; ${out.summary.identity.unmeasured} unmeasured; C's cache is not observable through this surface.`, '',
    `### Probe arm (Amendment 1)`, `Control build (parameter unset) ${builds.control ? `${builds.control.wasmSha256} ${builds.control.reproducesShipped ? 'reproduces the shipped aa3ed22a byte for byte' : 'DOES NOT reproduce the shipped aa3ed22a'}` : 'unmeasured'}; probe build (kWideE ${PROBE_WIDE_E}) ${builds.probe ? builds.probe.wasmSha256 : 'unmeasured'}, experiments-only. Identity above the switch (probe against 0.6.3, same set bytes, 65 epochs): ${aboveKept} (${aboveFlown.filter((x) => x.equal).length} of ${aboveFlown.length} flown sets equal; ${above.length} in the sample). Probe cells flown ${out.probeArm.summary.flown} of ${out.probeArm.summary.cells}: grid passes ${out.probeArm.summary.gridPasses.length} (${out.probeArm.summary.gridPasses.join(', ') || 'none'}); grid fails ${out.probeArm.summary.gridFails.length} (${out.probeArm.summary.gridFails.join(', ') || 'none'}); undecided ${out.probeArm.summary.gridUndecided.length} (${out.probeArm.summary.gridUndecided.join(', ') || 'none'}); grid not exercised ${out.probeArm.summary.notExercised.length} (${out.probeArm.summary.notExercised.join(', ') || 'none'}: the probe's switch is 0.01 and the fit's eccentricity stayed below it, so the probe flew the set); withheld ${out.probeArm.summary.withheld.length}; below the perigee floor ${out.probeArm.summary.belowFloor.join(', ') || 'none'}; unmeasured ${out.probeArm.summary.unmeasured.join(', ') || 'none'}. Grid cost by difference (probe minus 0.6.3, one-epoch flight at the fit's end, medians of five fresh invokes): ${out.probeArm.summary.costDifferenceMs.length ? `${f(median(out.probeArm.summary.costDifferenceMs.map((x) => x.differenceMs)), 0)} ms median over the cells, ${f(Math.min(...out.probeArm.summary.costDifferenceMs.map((x) => x.differenceMs)), 0)} to ${f(Math.max(...out.probeArm.summary.costDifferenceMs.map((x) => x.differenceMs)), 0)} ms; ${out.probeArm.summary.costDifferenceMs.filter((x) => x.withinColdTarget).length} of ${out.probeArm.summary.costDifferenceMs.length} within the 100 ms cold target` : 'unmeasured'}; memory by arithmetic: grids needed x 3.1 MB per grid (SPEC 16.11), the command surface shows no memory figure.`, '',
    `#### Identity above the switch`, `| Orbit | e | Set | Fitted e | Probe = 0.6.3 | $OEM bytes | SHA-256 |`, `| --- | --: | --- | --: | --- | --: | --- |`,
    ...above.map((x) => (x.flown ? `| ${x.regime} | ${x.e} | ${x.seeded ? 'seeded' : 'fitted'} | ${x.fittedE === null || x.fittedE === undefined ? '-' : f(x.fittedE, 4)} | ${x.equal ? 'equal' : `DIFFERENT (${JSON.stringify(x.firstDifference)})`} | ${x.payloadBytes} | ${x.payloadSha256.slice(0, 16)} |` : `| ${x.regime} | ${x.e} | ${x.seeded ? 'seeded' : 'fitted'} | - | ${x.unmeasured ? 'unmeasured' : `ERROR ${x.error}`} | - | - |`)), '',
    `#### The probe cells (the all-regimes frame and three-way reading on the kWideE ${PROBE_WIDE_E} build; landed = the 0.6.3 set flight of the same cell)`,
    `| Cell | Landed verdict (legs) | Probe verdict (legs) | Grid reads | Probe fitted e (grid exercised) | Raw RMS / max / rough landed -> probe (m) | Bounds RMS / max / rough (probe) | Tesseral share forward landed -> probe [probe interval] | Tesseral share in-arc landed -> probe [probe interval] | Mixed forward landed -> probe | Secular forward landed -> probe | Failing family landed -> probe (path) | Probe forward families | Cost probe / 0.6.3 / difference (ms) | Grids needed, memory arithmetic (MB) | Within cold target |`, `| --- | --- | --- | --- | --: | --- | --: | --- | --- | --: | --: | --- | --- | --: | --: | --- |`,
    ...probes.map((p) => (p.row?.flown ? `| ${p.key} | ${p.row.landed ? `${p.row.landed.verdict} (${p.row.landed.legs.forward} / ${p.row.landed.legs.inArc})` : '-'} | ${p.state} (${p.row.legs.forward} / ${p.row.legs.inArc}) | ${p.gridReads} | ${f(p.row.fitted.e, 4)} (${p.row.gridExercised ? 'yes' : 'NO'}) | ${p.row.landed ? `${f(p.row.landed.forward.rmsM)} / ${f(p.row.landed.forward.maxM)} / ${f(p.row.landed.forward.roughM, 3)}` : '-'} -> ${f(p.row.forward.rmsM)} / ${f(p.row.forward.maxM)} / ${f(p.row.forward.roughM, 3)} | ${f(p.row.bounds.rms)} / ${f(p.row.bounds.max)} / ${f(p.row.bounds.rough, 3)} | ${p.row.landed ? f(p.row.landed.forward.shares.tesseral.rmsM) : '-'} -> ${iv(p.row.forward.shares.tesseral)} | ${p.row.landed ? f(p.row.landed.inArc.shares.tesseral.rmsM) : '-'} -> ${iv(p.row.inArc.shares.tesseral)} | ${p.row.landed ? f(p.row.landed.forward.shares.mixed.rmsM) : '-'} -> ${f(p.row.forward.shares.mixed.rmsM)} | ${p.row.landed ? f(p.row.landed.forward.shares.secular.rmsM) : '-'} -> ${f(p.row.forward.shares.secular.rmsM)} | ${p.row.failing ? `${p.row.failing.labels.slice(0, 3).join('=')} ${f(p.row.failing.landedM, 1)} -> ${p.row.failing.probeM === null ? 'absent' : f(p.row.failing.probeM, 1)} (${p.row.failing.modulePath}${p.row.failing.leg === 'inArc' ? ', in-arc' : ''})` : '-'} | ${p.row.forward.families.slice(0, 4).map((g) => `${g.labels.slice(0, 2).join('=')} ${g.kind} ${f(g.amplitudeM, 1)}`).join('; ')} | ${f(p.row.cost.probeMs.median, 0)} / ${f(p.row.cost.baseMs.median, 0)} / ${f(p.row.cost.differenceMs, 0)} | ${p.row.cost.gridsNeeded}, ${f(p.row.cost.memoryArithmeticMB, 1)} | ${p.row.cost.withinColdTarget ? 'yes' : 'NO'} |` : `| ${p.key} | - | ${p.state}${p.error ? ` ${p.error}` : ''} | - | - | - | - | - | - | - | - | - | - | - | - | - |`)), '',
    `## The pair reading at the module's own threshold (landed 0.29 set flight, 0.30, 0.31 grid flight; forward-day shares and groups; a change is claimed beyond the pair's reference resolution)`,
    `| Orbit | Fitted e 0.29 / 0.30 / 0.31 | Grid exercised 0.30 / 0.31 | e 0.29 forward RMS / max (m) | e 0.30 | e 0.31 | In-arc RMS 0.29 -> 0.31 | Forward shares 0.29 -> 0.31 (m) | In-arc shares 0.29 -> 0.31 (m) | Resolution (m) | Forward groups 0.29 -> 0.31 (amplitude m, path) | Reach by path (forward, quadrature over the path's groups) |`, `| --- | --: | --- | --: | --: | --: | --: | --- | --- | --: | --- | --- |`,
    ...PAIRS.map((n) => pairLine(pairs[n])), '',
    `## Catalog cost of the shipped grid (one worker; the three 0.31 sets refitted in this record's own cache; budget: cold median <= ${BUDGET.coldMedianMs} ms per object, warm <= ${BUDGET.warmMsPerRecordPerWorker} ms per record per worker, memory <= ${BUDGET.memoryMB} MB per worker)`,
    `| Orbit | Fitted e | Arc (d) | Cold at epoch + 1 min, median ms (5 fresh instances) | Cold at fit end + 1 min, median ms (5 fresh instances) | Warm, new epoch a day on, median ms (5 calls) | Grids after the cold epoch flight (held / bytes) | after the cold fit-end flight | after warm (held / bytes / built) | Bytes per grid (MB) | Wasm memory after warm (MB) | Within budget |`, `| --- | --: | --: | --: | --: | --: | --- | --- | --- | --: | --: | --- |`,
    ...costs.map(costLine), '',
    `## Byte identity of e <= 0.3 flights (seeded AP sets at the regime's elements, caps 31 / 20, 65 epochs over a day in GCRF; A and B fresh instances, C after a 0.31 set was flown on the instance)`,
    `| Regime | e | Path | A = B | A = C | Grids in C's cache | $OEM bytes | SHA-256 (A) |`, `| --- | --: | --- | --- | --- | --- | --: | --- |`,
    ...identity.map(idLine), '',
    `## Every cell under diagnosis (D1 Molniya e 0.001; D2 the half-day class; D3 the 17 attributed fails; D4 the grid-natural undecided cells)`,
    `| Cell | In | Landed verdict | Legs forward / in-arc | Bounds RMS / max / rough (m) | Tesseral share forward / in-arc (m) [lower, upper] | Mixed share forward / in-arc (m) | Secular forward / in-arc (m) | Failing family (amplitude, frequency, path, slope of log amplitude against log e) | Basis | Largest mixed group (forward; path) | Forward families (path) | In-arc families (path) | Grid arm | Cost | Identity (regime) | Reading |`, `| --- | --- | --- | --- | --: | --- | --: | --: | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
    ...cellRows.map(cellLine), ''].join('\n');
  fs.writeFileSync(path.join(outDir, 'README.md'), md);
  return out;
}

if (args.table) { const out = table(args.out ?? RESULTS); console.log(JSON.stringify(out.summary, null, 1)); process.exit(0); }

if (args.check) {
  let failures = 0;
  const check = (ok, line) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failures += 1; };
  const git = (...a) => execFileSync('git', ['-C', REPO, ...a]).toString('utf8').trim();
  const rows = readRows();
  const regSha = git('log', '--reverse', '--format=%H', '--', REGISTRATION).split('\n')[0];
  const regAt = Date.parse(git('show', '-s', '--format=%cI', regSha));
  const first = rows.map((r) => r.createdUtc).sort()[0];
  check(rows.length > 0 && regAt < Date.parse(first), `registration ${regSha.slice(0, 8)} (${git('show', '-s', '--format=%cI', regSha)}) precedes the first of ${rows.length} rows (${first})`);
  check(rows.every((r) => r.sdnAp?.wasmSha256 === PIN.sdnAp.wasmSha256 && r.ffm?.wasmSha256 === PIN.ffm.wasmSha256 && r.modulesCommit === PIN.modulesCommit), `every row on sdn-ap ${PIN.sdnAp.version} (${PIN.sdnAp.wasmSha256.slice(0, 12)}), ffm ${PIN.ffm.version} (${PIN.ffm.wasmSha256.slice(0, 12)}), modules ${PIN.modulesCommit.slice(0, 9)}`);
  const landed = landedRows();
  const cellRowsRead = rows.filter((r) => r.type === 'cell' && r.read);
  check(cellRowsRead.every((r) => landed.some((l) => l.key === r.key && l.createdUtc === r.landedCreatedUtc && l.runner === r.landedRunner)), `every cell row (${cellRowsRead.length}) reads the landed all-regimes row it names (createdUtc and runner match)`);
  const all = cells();
  check(all.every((c) => cellRowsRead.some((r) => r.key === c.key)), `every cell under diagnosis (${all.length}) has a read row`);
  check(cellRowsRead.every((r) => r.failing && r.failing.modulePath && r.failing.members?.length && r.forwardFamilies.every((g) => g.modulePath) && r.inArcFamilies.every((g) => g.modulePath)), `every cell names its failing family with its module path and every named family carries a path`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tesseral-diagnosis-'));
  const t = table(tmp);
  check(['table.json', 'README.md'].every((n) => fs.existsSync(path.join(RESULTS, n)) && fs.readFileSync(path.join(tmp, n)).equals(fs.readFileSync(path.join(RESULTS, n)))), `results/ap-truth/tesseral-diagnosis/table.json and README.md reproduce from the rows`);
  fs.rmSync(tmp, { recursive: true, force: true });
  check(t.cells.every((c) => c.gridArm && c.costWithin && c.identityKept && c.namedAs), `every cell carries its grid-arm statement, cost reference, identity reading and reading-rule result`);
  check(PAIRS.every((n) => t.pairs[n]?.measured), `the three pairs (${PAIRS.join(', ')}) are read`);
  check(t.costs.every((c) => c.type === 'cost' && Number.isFinite(c.coldMs.epoch.median) && Number.isFinite(c.warmMs.median) && Number.isFinite(c.memoryBytes.afterWarm)), `the three cost objects carry cold, warm and memory figures`);
  const idFlown = t.identity.filter((x) => x.flown);
  check(idFlown.length > 0 && t.identity.every((x) => x.flown || x.reason === 'below the perigee floor'), `every identity flight is flown or below the perigee floor (${idFlown.length} flown)`);
  // Amendment 1: the probe arm
  const amendment1 = git('log', '--format=%H %cI', '-S', 'Amendment 1 (2026-11-06', '--', REGISTRATION).split('\n').filter(Boolean).at(-1);
  const probeRows = rows.filter((r) => r.arm === 'probe');
  const firstProbe = probeRows.map((r) => r.createdUtc).sort()[0];
  check(Boolean(amendment1) && probeRows.length > 0 && Date.parse(amendment1.split(' ')[1]) < Date.parse(firstProbe), `Amendment 1 (${(amendment1 ?? '').slice(0, 8)}) precedes the first of ${probeRows.length} probe rows (${firstProbe})`);
  check(t.probeArm.builds.probe && t.probeArm.builds.control && probeRows.every((r) => r.probe?.wasmSha256 === t.probeArm.builds.probe.wasmSha256 && r.probe.wideE === PROBE_WIDE_E) && t.probeArm.builds.probe.wasmSha256 !== PIN.sdnAp.wasmSha256, `every probe row is on the one probe dist ${t.probeArm.builds.probe?.wasmSha256?.slice(0, 12)} (kWideE ${PROBE_WIDE_E}); control ${t.probeArm.builds.control?.wasmSha256?.slice(0, 12)} ${t.probeArm.builds.control?.reproducesShipped ? 'reproduces' : 'does not reproduce'} the shipped dist`);
  check(t.probeArm.above.every((x) => x.flown), `the identity sample above the switch is flown (${t.probeArm.above.filter((x) => x.flown).length} of ${t.probeArm.above.length}): ${t.probeArm.aboveKept}`);
  check(t.probeArm.cells.every((c) => c.state !== 'unmeasured' && !c.error), `every probe cell (${t.probeArm.cells.length}) is flown or below the perigee floor: grid passes ${t.probeArm.summary.gridPasses.length}, fails ${t.probeArm.summary.gridFails.length}, undecided ${t.probeArm.summary.gridUndecided.length}, withheld ${t.probeArm.summary.withheld.length}`);
  check(t.probeArm.cells.filter((c) => c.cost).every((c) => Number.isFinite(c.cost.differenceMs)), `every flown probe cell carries its differential cost`);
  console.log(`identity: ${idFlown.filter((x) => x.equalAB && x.equalAC).length} of ${idFlown.length} equal across A, B, C; ${t.summary.candidates} candidate cells; cost ${t.summary.costWithin}`);
  console.log(failures ? `FAIL (${failures})` : 'PASS');
  process.exit(failures ? 1 : 0);
}
