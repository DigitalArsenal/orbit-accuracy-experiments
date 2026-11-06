// J2-J5-SHORT-PERIOD.md: the J3-J5 first-order short-period terms (P1, analytic: the zonal record's Hill construction at degrees 3 to 5,
// j >= 2), the J3/J5 constant normal member (P1N) and the J2 second-order bound (P2, identified on the J2-only arm Z2) prototyped in the
// harness as corrections to propagator/sdn-ap 0.6.4's output states (the module unchanged), sized first against the landed accuracy
// table, read as the m = 0 share, N0 and R0 before and after, validated reference-side (V1: S = E5 - E2), and scored end to end against
// the FFM reference on seven-day windows. Report only.
//   node j2-j5-short-period.mjs --size
//   SDN_MODULES_ROOT=<pinned root> SDNAP_064_WASM=<signed 0.6.4 dist> SDN_AP_HEO_CACHE=<scratch> node j2-j5-short-period.mjs --run [--shard k/n] [--only id]
//   node j2-j5-short-period.mjs --table      node j2-j5-short-period.mjs --check
// Every state comes from a module (propagator/sdn-ap and propagator/ffm through propagator/sdn-ap/test/lib/heo-model-truth.mjs); this
// file moves bytes and does arithmetic (the zonal record's force harmonics and Hill response, least squares, medians).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const HERE = path.dirname(new URL(import.meta.url).pathname), REPO = path.resolve(HERE, '../..');
const RESULTS = args.results ? path.resolve(args.results) : path.join(REPO, 'results/ap-truth/j2-j5-short-period');
const CELLS_JSON = path.join(REPO, 'results/ap-truth/compare/cells.json');
const ZONAL_TABLE = path.join(REPO, 'results/ap-truth/zonal-short-period/table.json');
const REGISTRATION = 'experiments/operator-theory/J2-J5-SHORT-PERIOD.md';
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const RUNNER = sha256(fs.readFileSync(new URL(import.meta.url)));
const argvSave = process.argv; process.argv = process.argv.slice(0, 2);
const AR = await import(pathToFileURL(path.join(HERE, 'tesseral-all-regimes.mjs')).href);
const ZS = await import(pathToFileURL(path.join(HERE, 'zonal-short-period.mjs')).href);
process.argv = argvSave;
const { ARMS, REGIMES, attribute, threeWay, bounds, rtnOf, gridSeconds, arcDays } = AR;
const { forceHarmonics, responseTable, selfTest } = ZS;
export const PIN = ZS.PIN;
const EGM = { file: 'propagator/ffm/lib/egm96_data.h', sha256: '4d5c80b3d673696affffe9d2d17df94ecca730b1f61e0483b1bb9d6606e6a6f4' };
// item 2a: the pinned coefficients as the registration states them (read before the registration; --check holds the rows to them)
const C_REGISTERED = { 2: -4.84165371736e-4, 3: 9.57254173792e-7, 4: 5.39873863789e-7, 5: 6.8532347563e-8 };
const LOW = ['Starlette', 'Ajisai', 'LARES', 'Jason-3', 'Sentinel-3', 'CryoSat-2'];
const SAT = { Starlette: 'STARLETTE', Ajisai: 'AJISAI', LARES: 'LARES', 'Jason-3': 'JASON 3', 'Sentinel-3': 'SENTINEL 3A', 'CryoSat-2': 'CRYOSAT 2' };
const SAT_BESIDE = { 'Sentinel-3': 'SENTINEL 3B' };
// item 1: the registered size table (m; per cent), held by --check against the recomputation from cells.json
const SIZE_REGISTERED = {
  Starlette: { share: 3.55, medians: [25.6, 49.4, 191.2], n: [12, 10, 12], linear: [13.9, 7.2, 1.9] },
  Ajisai: { share: 3.36, medians: [16.5, 47.5, 208.2], n: [12, 10, 11], linear: [20.4, 7.1, 1.6] },
  LARES: { share: 4.19, medians: [18.2, 28.1, 58.1], n: [12, 10, 11], linear: [23.0, 14.9, 7.2] },
  'Jason-3': { share: 4.04, medians: [29.6, 77.4, 522.2], n: [15, 11, 10], linear: [13.6, 5.2, 0.8] },
  'Sentinel-3': { share: 3.13, medians: [89.6, 713.9, 4443], n: [15, 15, 15], linear: [3.5, 0.4, 0.1] },
  'CryoSat-2': { share: 5.95, medians: [63.1, 404.5, 3184], n: [15, 15, 15], linear: [9.4, 1.5, 0.2] },
};
const SIZE_FLOOR_PCT = 5, SIZE_FIT_H = 72, LEADS_H = [24, 72, 168], AP_BUILD = 'propagator/sdn-ap@aa3ed22aa61a';
const E_GRID = [0.01, 0.05, 0.1], WINDOWS = 6, PHASE_STEP_DEG = 60, FORECAST_DAYS = 7;
const FLOORS = { rms: 1, max: 5, rough: 0.1 };
const STEPS = ['before', 'P1', 'P1+P1N', 'P1+P1N+P2'];
// Amendment 1.1: the pre-fit arms (the displacement subtracted from the reference arc before the fit, added back to the flight)
const PREFIT = ['P1F', 'P1F+P1N', 'P1F+P1N+P2'];
const FSTEPS = [...STEPS, ...PREFIT];
const WSTEPS = ['before', 'P1+P1N', 'P1+P1N+P2', 'P1F+P1N', 'P1F+P1N+P2'];
const CITE = { reduced: 'P1F+P1N', best: 'P1F+P1N+P2' };
const SIGN_P = 0.03125, MULTIPLICITY_TESTS = LOW.length * LEADS_H.length * 2;
const RE_KM = 6378.135, MU = 398600.4418, DAY = 86400000, PERIGEE_FLOOR_KM = 200, WITHIN_MS = 10, MODULE_TAIL_BYTES = 272, COLD_TARGET_MS = 100;
const semimajorKm = (n) => Math.cbrt(MU / ((n * 2 * Math.PI / 86400) ** 2));
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
const median = (v) => { const s = [...v].sort((a, b) => a - b); const k = s.length >> 1; return s.length ? (s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2) : NaN; };
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const readRows = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => /^rows-\d+\.jsonl$/.test(x)).sort().flatMap((x) => fs.readFileSync(path.join(dir, x), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);

// ---- item 1: the size, from the landed accuracy table ----
export function sizeTable() {
  const doc = JSON.parse(fs.readFileSync(CELLS_JSON, 'utf8'));
  const landed = fs.existsSync(ZONAL_TABLE) ? JSON.parse(fs.readFileSync(ZONAL_TABLE, 'utf8')) : null;
  const pick = (sat, lead) => doc.rows.find((r) => r.reference === 'truth' && r.satellite === sat && r.fit === SIZE_FIT_H && r.lead === lead);
  const regimes = LOW.map((name) => {
    const share = landed?.regimes.find((r) => r.regime === name)?.secondary?.forward?.before?.rmsM ?? SIZE_REGISTERED[name].share;
    const cells = LEADS_H.map((lead) => { const r = pick(SAT[name], lead); return r ? { lead, medianM: r.arms.AP[0] * 1000, p95M: r.arms.AP[1] * 1000, n: r.arms.AP[2], build: r.build.AP } : null; });
    const beside = SAT_BESIDE[name] ? LEADS_H.map((lead) => { const r = pick(SAT_BESIDE[name], lead); return r ? { lead, medianM: r.arms.AP[0] * 1000, n: r.arms.AP[2] } : null; }) : null;
    const linear = cells.map((c) => (c ? 100 * share / c.medianM : null)), quadrature = cells.map((c) => (c ? 100 * share * share / (2 * c.medianM * c.medianM) : null));
    return { regime: name, satellite: SAT[name], shareM: share, cells, beside, linearPct: linear, quadraturePct: quadrature, aboveFloorDay3: linear[1] != null && linear[1] >= SIZE_FLOOR_PCT };
  });
  const matches = regimes.every((r) => { const g = SIZE_REGISTERED[r.regime]; return Math.abs(r.shareM - g.share) < 0.005 && r.cells.every((c, k) => c && Math.abs(c.medianM - g.medians[k]) < (g.medians[k] >= 1000 ? 0.5 : 0.05) && c.n === g.n[k] && c.build?.[0] === AP_BUILD) && r.linearPct.every((p, k) => Math.abs(p - g.linear[k]) < 0.05); });
  return { source: { file: 'results/ap-truth/compare/cells.json', sha256: sha256(fs.readFileSync(CELLS_JSON)), fitH: SIZE_FIT_H, leadsH: LEADS_H, apBuild: AP_BUILD }, floorPct: SIZE_FLOOR_PCT, regimes, aboveFloorDay3: regimes.filter((r) => r.aboveFloorDay3).map((r) => r.regime), shortcutReachable: regimes.every((r) => !r.aboveFloorDay3), matchesRegistration: matches };
}
if (args.size) { console.log(JSON.stringify(sizeTable(), null, 1)); process.exit(0); }

// ---- the terms and the prototype (items 2 and 3) ----
/** A displacement table {L, cx, sx, cy, sy, cz, sz} applied at the true argument of latitude u (m, RTN), harmonics j = 2..L. */
function disp(tab, u) {
  let x = 0, y = 0, z = 0;
  for (let j = 2; j <= tab.L; j += 1) { const c = Math.cos(j * u), s = Math.sin(j * u); x += tab.cx[j] * c + tab.sx[j] * s; y += tab.cy[j] * c + tab.sy[j] * s; z += tab.cz[j] * c + tab.sz[j] * s; }
  return [x, y, z];
}
/** d(disp)/du (m per rad). */
function dispRate(tab, u) {
  let x = 0, y = 0, z = 0;
  for (let j = 2; j <= tab.L; j += 1) { const c = Math.cos(j * u), s = Math.sin(j * u); x += j * (-tab.cx[j] * s + tab.sx[j] * c); y += j * (-tab.cy[j] * s + tab.sy[j] * c); z += j * (-tab.cz[j] * s + tab.sz[j] * c); }
  return [x, y, z];
}
/** Amendment 1.1: a GCRF state (km, km/s) less the displacement d (m, RTN at the state) with its rate (the harmonic's rate n and the frame's rotation). */
function subtractDisplacement(state, tab, nRadPerSec, withN0) {
  const r = state.slice(0, 3), v = state.slice(3), { u } = orbitAngles(r, v);
  const d = disp(tab, u), dd = dispRate(tab, u).map((x) => x * nRadPerSec);
  if (withN0) d[2] -= tab.N0predM;
  const rn = Math.hypot(...r), rHat = r.map((x) => x / rn), h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]], hn = Math.hypot(...h), hHat = h.map((x) => x / hn);
  const tHat = [hHat[1] * rHat[2] - hHat[2] * rHat[1], hHat[2] * rHat[0] - hHat[0] * rHat[2], hHat[0] * rHat[1] - hHat[1] * rHat[0]];
  const vel = [dd[0] - nRadPerSec * d[1], dd[1] + nRadPerSec * d[0], dd[2]];
  const toGcrf = (q) => [0, 1, 2].map((ax) => (q[0] * rHat[ax] + q[1] * tHat[ax] + q[2] * hHat[ax]) / 1000);
  const dp = toGcrf(d), dv = toGcrf(vel);
  return [r[0] - dp[0], r[1] - dp[1], r[2] - dp[2], v[0] - dv[0], v[1] - dv[1], v[2] - dv[2]];
}
/** The node (rad) of a GCRF state. */
const nodeOf = (r, v) => { const h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]]; return Math.atan2(h[0], -h[1]); };
/** Inclination and true argument of latitude of a GCRF state (km, km/s): arithmetic on a state; it produces no state (the zonal record's). */
function orbitAngles(r, v) {
  const h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]], hn = Math.hypot(...h);
  const node = [-h[1], h[0], 0], nn = Math.hypot(...node) || 1e-300;
  const nHat = node.map((x) => x / nn), hHat = h.map((x) => x / hn);
  const tHat = [hHat[1] * nHat[2] - hHat[2] * nHat[1], hHat[2] * nHat[0] - hHat[0] * nHat[2], hHat[0] * nHat[1] - hHat[1] * nHat[0]];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  return { i: Math.acos(hHat[2]), u: Math.atan2(dot(r, tHat), dot(r, nHat)) };
}
function readCoefficients(MOD) {
  const file = path.join(MOD, EGM.file), bytes = fs.readFileSync(file);
  if (sha256(bytes) !== EGM.sha256) throw new Error(`${file} is not the pinned egm96_data.h`);
  const C = {}, J = {};
  for (const m of bytes.toString('utf8').matchAll(/\{\s*(\d+),\s*(\d+),\s*([-+0-9.eE]+),\s*([-+0-9.eE]+)\s*\}/g)) { const l = Number(m[1]); if (Number(m[2]) === 0 && l >= 2 && l <= 5) { C[l] = Number(m[3]); J[l] = -Math.sqrt(2 * l + 1) * C[l]; } }
  for (const l of [2, 3, 4, 5]) if (Math.abs(C[l] - C_REGISTERED[l]) > 1e-12 * Math.abs(C_REGISTERED[l]) + 1e-20) throw new Error(`C${l}0 ${C[l]} is not the registered ${C_REGISTERED[l]}`);
  return { C, J };
}
/** Least squares y ~ X c by the normal equations (Gaussian elimination with partial pivoting). */
function lstsq(X, y) {
  const p = X[0].length, A = Array.from({ length: p }, () => new Float64Array(p + 1));
  for (let k = 0; k < X.length; k += 1) for (let a = 0; a < p; a += 1) { for (let b = 0; b < p; b += 1) A[a][b] += X[k][a] * X[k][b]; A[a][p] += X[k][a] * y[k]; }
  for (let c = 0; c < p; c += 1) {
    let piv = c; for (let r = c + 1; r < p; r += 1) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < p; r += 1) if (r !== c) { const m = A[r][c] / A[c][c]; for (let q = c; q <= p; q += 1) A[r][q] -= m * A[c][q]; }
  }
  return A.map((row, c) => row[p] / row[c]);
}
/** Item 3, P2: the (0, j) table of an RTN error series at the module's own u, j = 1..4 fitted, j = 2..4 applied; j = 0 and 1 reported. */
function identifyP2(us, rtn) {
  const JM = 4, X = us.map((u) => { const row = [1]; for (let j = 1; j <= JM; j += 1) row.push(Math.cos(j * u), Math.sin(j * u)); return row; });
  const coef = [0, 1, 2].map((ax) => lstsq(X, rtn.map((q) => q[ax])));
  const tab = { L: JM, cx: new Float64Array(JM + 1), sx: new Float64Array(JM + 1), cy: new Float64Array(JM + 1), sy: new Float64Array(JM + 1), cz: new Float64Array(JM + 1), sz: new Float64Array(JM + 1) };
  for (let j = 2; j <= JM; j += 1) { tab.cx[j] = coef[0][2 * j - 1]; tab.sx[j] = coef[0][2 * j]; tab.cy[j] = coef[1][2 * j - 1]; tab.sy[j] = coef[1][2 * j]; tab.cz[j] = coef[2][2 * j - 1]; tab.sz[j] = coef[2][2 * j]; }
  const fitted = us.map((u, k) => [0, 1, 2].map((ax) => coef[ax].reduce((s, c, ci) => s + c * X[k][ci], 0)));
  const amp = (j) => Math.hypot(...[0, 1, 2].flatMap((ax) => (j ? [coef[ax][2 * j - 1], coef[ax][2 * j]] : [coef[ax][0]])));
  return { tab, constantM: coef.map((c) => c[0]), amplitudesM: Object.fromEntries([0, 1, 2, 3, 4].map((j) => [j, amp(j)])), residualRmsM: rms(rtn.map((q, k) => Math.hypot(...q.map((v, ax) => v - fitted[k][ax])))), seriesRmsM: rms(rtn.map((q) => Math.hypot(...q))), samples: us.length,
    floats: Object.fromEntries(['cx', 'sx', 'cy', 'sy', 'cz', 'sz'].map((k) => [k, Array.from(tab[k])])) };
}
const p2FromRow = (p) => ({ L: 4, ...Object.fromEntries(Object.entries(p.floats).map(([k, v]) => [k, Float64Array.from(v)])) });
/** A least-squares line and the delete-one-block jackknife of both coefficients (the secular record's item 1). */
function lineFit(t, y, blockIds) {
  const fit = (idx) => { let n = 0, st = 0, sy = 0, stt = 0, sty = 0; for (const k of idx) { n += 1; st += t[k]; sy += y[k]; stt += t[k] * t[k]; sty += t[k] * y[k]; } const d = n * stt - st * st; const c1 = (n * sty - st * sy) / d; return [(sy - c1 * st) / n, c1]; };
  const all = t.map((_, k) => k), [c0, c1] = fit(all), blocks = [...new Set(blockIds)], K = blocks.length;
  if (K < 3) return { c0: { point: c0, lo: null, hi: null, se: null }, c1: { point: c1, lo: null, hi: null, se: null }, K };
  const reps = blocks.map((b) => fit(all.filter((k) => blockIds[k] !== b)));
  const se = (j) => { const v = reps.map((r) => r[j]), m = v.reduce((a, b) => a + b, 0) / K; return Math.sqrt(((K - 1) / K) * v.reduce((a, b) => a + (b - m) ** 2, 0)); };
  const iv = (x, s) => ({ point: x, lo: x - 2 * s, hi: x + 2 * s, se: s });
  return { c0: iv(c0, se(0)), c1: iv(c1, se(1)), K };
}
const slim = (x) => ({ rmsM: x.rmsM, maxM: x.maxM, roughM: x.roughM, conditioned: x.conditioned, jackknife: x.jackknife, shares: x.shares, families: x.families.slice(0, 10), zonalFamilies: x.families.filter((q) => q.kind === 'zonal').slice(0, 8) });
const add = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];

/** The registered items in order of flight: (1) e 0.001 secondary cells with the arms and V1, (2) the e grid, (3) the end-to-end windows. */
function items() {
  const regs = LOW.map((name) => REGIMES.find((r) => r.name === name));
  const out = [];
  for (const reg of regs) out.push({ id: `cell:secondary:${reg.name}|0.001`, type: 'cell', reg, e: 0.001, arms: true });
  for (const e of E_GRID) for (const reg of regs) out.push({ id: `cell:secondary:${reg.name}|${e}`, type: 'cell', reg, e, arms: false });
  for (const reg of regs) for (let k = 0; k < WINDOWS; k += 1) out.push({ id: `window:${reg.name}|${k}`, type: 'window', reg, e: 0.001, k });
  return out;
}

if (args.run) {
  const MOD = process.env.SDN_MODULES_ROOT, apWasm = process.env.SDNAP_064_WASM;
  if (!MOD) throw new Error('SDN_MODULES_ROOT names the pinned modules root');
  if (!apWasm) throw new Error('SDNAP_064_WASM names this lane\'s copy of the signed 0.6.4 dist');
  if (!process.env.SDN_AP_HEO_CACHE) throw new Error('SDN_AP_HEO_CACHE names this lane\'s own cache');
  const ffmWasm = path.join(MOD, 'propagator/ffm/dist/isomorphic/module.wasm');
  const apBytes = fs.readFileSync(apWasm);
  if (sha256(apBytes) !== PIN.sdnAp.bundleSha256) throw new Error(`${apWasm} is not the signed sdn-ap 0.6.4 bundle`);
  const { computeCanonicalModuleHash } = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/node_modules/space-data-module-sdk/src/bundle/wasm.js')).href);
  const canonical = (await computeCanonicalModuleHash(apBytes)).hashHex;
  if (canonical !== PIN.sdnAp.canonicalSha256) throw new Error(`${apWasm}: canonical hash ${canonical} is not ${PIN.sdnAp.canonicalSha256}`);
  if (sha256(fs.readFileSync(ffmWasm)) !== PIN.ffm.wasmSha256) throw new Error(`${ffmWasm} is not ffm ${PIN.ffm.version}`);
  if (execFileSync('git', ['-C', MOD, 'rev-parse', 'HEAD']).toString().trim() !== PIN.modulesCommit) throw new Error(`${MOD} is not at ${PIN.modulesCommit}`);
  process.env.SDNAP_WASM = apWasm;
  const { C, J } = readCoefficients(MOD);
  const { runModelTruth } = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/test/lib/heo-model-truth.mjs')).href);
  const O = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/test/lib/ocm.mjs')).href);
  const { createRequire } = await import('node:module');
  const req = createRequire(path.join(MOD, 'propagator/sdn-ap/package.json'));
  const { createStandaloneHarness } = await import(pathToFileURL(req.resolve('space-data-module-sdk/testing/isomorphic')).href);
  const { pcfOutputFrame } = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/PCF/pcfOutputFrame.js')).href);
  const { OEM } = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/OEM/OEM.js')).href);
  const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
  const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
  if (SHARDS > 4) throw new Error('at most 4 shards');
  fs.mkdirSync(RESULTS, { recursive: true });
  const outFile = path.join(RESULTS, `rows-${SHARD}.jsonl`);
  const done = new Set(readRows(RESULTS).map((r) => r.id));
  const stamp = () => ({ createdUtc: new Date().toISOString(), runner: RUNNER, modulesCommit: PIN.modulesCommit, sdnAp: PIN.sdnAp, ffm: PIN.ffm, apSha256: PIN.sdnAp.bundleSha256, coefficients: { C, J }, shard: SHARD });
  const emit = (row) => fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  const flyer = await createStandaloneHarness('browser', apWasm, { surface: 'command' });
  const fly = async (set, epochs) => { const r = await flyer.invoke({ methodId: 'propagate', inputs: O.flight([set], { output: { EPOCHS: epochs, FRAME: pcfOutputFrame.GCRF } }) }); if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${r.errorMessage}`); return OEM.getRootAsOEM(new fb.ByteBuffer(Buffer.from(r.outputs.find((o) => o.portId === 'ephemeris').payload))).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES.map((l) => [l.X, l.Y, l.Z, l.X_DOT, l.Y_DOT, l.Z_DOT]); };
  const selfTestResult = selfTest();
  const mine = items().filter((_, k) => k % SHARDS === SHARD).filter((c) => !args.only || c.id === args.only);
  const arm = { name: 'secondary', ...ARMS.secondary };
  const baseFixture = (reg, e, raan, argp) => ({ name: `${reg.name}|${e}|${raan}|${argp}`, n: reg.n, e, i: reg.i, raan, argp, ma: 0, drag: false, thirdBody: true, field: arm.field, forces: arm.caps, fitDays: arcDays(reg.n), hourly: true, gridMinutes: gridSeconds(reg.n) / 60, forecastDays: 1, referenceTolerance: 1e-12, referenceMaxStep: 300, modulePath: apWasm });
  const anglesOf = (states) => states.map((s) => orbitAngles(s.slice(0, 3), s.slice(3)));
  const tableP1 = (r) => { const nRad = r.fitted.n * 2 * Math.PI / 86400, aKm = semimajorKm(r.fitted.n), iFit = orbitAngles(r.flown[0].slice(0, 3), r.flown[0].slice(3)).i; return { tab: responseTable(forceHarmonics(J, 3, 5, aKm, iFit), nRad), nRad, aKm, iFit }; };
  /** Amendment 1.1: the pre-fit flight: the reference arc less the displacement (built at the fixture's n and the arc's inclination) is
   * fitted by the same harness fit call (configuration and weather frames from the harness), the set flies against the unchanged
   * reference; returns the flight (profile, flown) and the table the arc was corrected with. */
  const prefitFlight = async (fixture, withN0) => {
    const fi = await runModelTruth({ ...fixture, fitInput: true });
    const t = OEM.getRootAsOEM(new fb.ByteBuffer(Buffer.from(fi.ephemeris.payload))).unpack();
    const lines = t.EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES;
    const nRad = fixture.n * 2 * Math.PI / 86400, aKm = semimajorKm(fixture.n), i0 = orbitAngles([lines[0].X, lines[0].Y, lines[0].Z], [lines[0].X_DOT, lines[0].Y_DOT, lines[0].Z_DOT]).i;
    const tab = responseTable(forceHarmonics(J, 3, 5, aKm, i0), nRad);
    for (const l of lines) { const s = subtractDisplacement([l.X, l.Y, l.Z, l.X_DOT, l.Y_DOT, l.Z_DOT], tab, nRad, withN0); [l.X, l.Y, l.Z, l.X_DOT, l.Y_DOT, l.Z_DOT] = s; }
    const b = new fb.Builder(1 << 20); OEM.finishOEMBuffer(b, t.pack(b));
    const fit = await flyer.invoke({ methodId: 'fit', inputs: [fi.configuration, fi.spaceWeather, { portId: 'ephemeris', typeRef: fi.ephemeris.typeRef, payload: b.asUint8Array() }] });
    if (fit.statusCode !== 0) throw new Error(`pre-fit fit: ${fit.errorCode}: ${fit.errorMessage}`);
    const omm = Buffer.from(fit.outputs.find((o) => o.portId === 'elements').payload);
    const rF = await runModelTruth({ ...fixture, omm });
    return { r: rF, tab, arcInclinationDeg: i0 * 180 / Math.PI, set: { sha256: sha256(omm), bytes: omm.length } };
  };
  /** The plane of a flight's first state against another's: a sin i dOmega and a di in m. */
  const planeChange = (states, ref, aKm) => { const A = orbitAngles(states[0].slice(0, 3), states[0].slice(3)), B = orbitAngles(ref[0].slice(0, 3), ref[0].slice(3)); const dO = nodeOf(states[0].slice(0, 3), states[0].slice(3)) - nodeOf(ref[0].slice(0, 3), ref[0].slice(3)); return { aSinIdOmegaM: aKm * 1000 * Math.sin(B.i) * Math.atan2(Math.sin(dO), Math.cos(dO)), aDiM: aKm * 1000 * (A.i - B.i) }; };
  /** The zonal-only arms (reference degree `deg` order 0, caps 0 / deg) at the regime's e 0.001 geometry; rows of their own. */
  const armMemo = new Map();
  const armRow = async (reg, name, deg) => {
    const key = `${reg.name}:${name}`;
    if (armMemo.has(key)) return armMemo.get(key);
    const ta = Date.now();
    const ra = await runModelTruth({ ...baseFixture(reg, 0.001, reg.raan, reg.argp), name: `${reg.name}|0.001|${name}`, field: [deg, 0], forces: [0, deg] });
    const rtnA = ra.profile.map((p) => [p.r, p.t, p.n]), tauA = ra.profile.map((p) => p.h / 24);
    const att = attribute(tauA, rtnA, ra.fitted.n, 1, 1 / ra.fitted.n);
    const blockIds = tauA.map((t) => Math.floor(t * ra.fitted.n));
    const lR = lineFit(tauA, rtnA.map((q) => q[0]), blockIds), lN = lineFit(tauA, rtnA.map((q) => q[2]), blockIds);
    const out = { r: ra, rtn: rtnA, tau: tauA, att, R0: lR.c0, N0: lN.c0 };
    if (!done.has(`arm:${name}:${reg.name}`)) emit({ id: `arm:${name}:${reg.name}`, type: 'arm', regime: reg.name, e: 0.001, arm: name, field: [deg, 0], caps: [0, deg], ...stamp(), flown: true, fitted: ra.fitted, forward: slim({ ...att, rmsM: rms(rtnA.map((p) => Math.hypot(...p))), maxM: Math.max(...rtnA.map((p) => Math.hypot(...p))), roughM: NaN }), R0: lR.c0, N0: lN.c0, set: { sha256: sha256(Buffer.from(ra.omm, 'base64')) }, seconds: (Date.now() - ta) / 1000 });
    armMemo.set(key, out);
    return out;
  };
  /** P1 + P1N at a flight's own angles (the table at its fitted n, a and inclination). */
  const p1nAt = (ra) => { const t = tableP1(ra); const ang = anglesOf(ra.flown); return { tab: t.tab, ang, corr: ang.map((a) => { const d = disp(t.tab, a.u); return [d[0], d[1], d[2] - t.tab.N0predM]; }) }; };
  /** Amendment 2: P2 of a regime, identified on arm Z5's forward day after P1 + P1N (the E5 residual: the J2 second-order bound and any
   * P1 misstatement) at the module's own u; arm Z2 is flown and reported (it is not J2-only: Amendment 2). */
  const p2Memo = new Map();
  const p2Of = async (reg) => {
    if (p2Memo.has(reg.name)) return p2Memo.get(reg.name);
    const z5 = await armRow(reg, 'Z5', 5), z2 = await armRow(reg, 'Z2', 2);
    const { ang, corr } = p1nAt(z5.r);
    const id = identifyP2(ang.map((a) => a.u), z5.rtn.map((p, k) => add(p, corr[k])));
    const out = { ...id, z5, z2 };
    p2Memo.set(reg.name, out);
    return out;
  };
  /** The four steps' corrections of a module state series. */
  const stepCorrections = (tab1, p2tab, states) => {
    const ang = anglesOf(states);
    // the constant normal member: N0predM is the predicted module-minus-reference offset, so the truth's displacement added here is -N0predM
    const c1 = ang.map((a) => disp(tab1, a.u)), c1n = c1.map((p) => [p[0], p[1], p[2] - tab1.N0predM]), c2 = ang.map((a, k) => add(c1n[k], disp(p2tab, a.u)));
    return { before: ang.map(() => [0, 0, 0]), P1: c1, 'P1+P1N': c1n, 'P1+P1N+P2': c2 };
  };
  /** series: step -> { rtn (the corrected error series), corr (the correction series) }; every step is read against 'before'. */
  const legSteps = (tau, series, nRevDay, windowDays, blockDays) => {
    const names = Object.keys(series);
    const atts = Object.fromEntries(names.map((s) => [s, attribute(tau, series[s].rtn, nRevDay, windowDays, blockDays)]));
    const b = atts.before;
    return Object.fromEntries(names.map((s) => {
      const a = atts[s], zb = b.shares.zonal, za = a.shares.zonal, seD = zb.se && za.se ? Math.hypot(zb.se.rmsM, za.se.rmsM) : null, dM = zb.rmsM - za.rmsM;
      const leak = (name) => { const p = b.shares[name], q = a.shares[name]; return p.se && q.se ? { beforeM: p.rmsM, afterM: q.rmsM, moved: Math.abs(p.rmsM - q.rmsM) > 2 * (p.se.rmsM + q.se.rmsM) } : { beforeM: p.rmsM, afterM: q.rmsM, moved: null }; };
      const resid = a.families.filter((q) => q.kind === 'zonal').sort((p, q) => q.amplitudeM - p.amplitudeM)[0] ?? null;
      return [s, { attribution: slim(a), rawRmsM: rms(series[s].rtn.map((p) => Math.hypot(...p))), correctionRmsM: rms(series[s].corr.map((p) => Math.hypot(...p))), difference: { rmsM: dM, lo: seD == null ? null : dM - 2 * seD, hi: seD == null ? null : dM + 2 * seD, se: seD }, conditioned: b.conditioned && a.conditioned, floor: threeWay(za, FLOORS, ['rms', 'max']), leakage: { tesseral: leak('tesseral'), secular: leak('secular') }, residual: resid ? { label: resid.labels.join('/'), amplitudeM: resid.amplitudeM, j1Member: resid.labels.includes('(0,1)') } : null }];
    }));
  };
  const seriesOf = (rtn, corr) => Object.fromEntries(Object.keys(corr).map((s) => [s, { rtn: rtn.map((p, k) => add(p, corr[s][k])), corr: corr[s] }]));
  for (const it of mine) {
    if (done.has(it.id)) continue;
    const t0 = Date.now();
    const reg = it.reg;
    const phase = it.type === 'window' ? it.k * PHASE_STEP_DEG : 0;
    const c = { key: `${reg.name}|${it.e}`, regime: reg.name, n: reg.n, i: reg.i, raan: it.type === 'window' ? phase : reg.raan, argp: it.type === 'window' ? phase : reg.argp, e: it.e, arm: 'secondary', field: arm.field, caps: arm.caps, perigeeKm: semimajorKm(reg.n) * (1 - it.e) - RE_KM, arcDays: arcDays(reg.n) };
    try {
      if (c.perigeeKm < PERIGEE_FLOOR_KM) { emit({ id: it.id, type: it.type, ...c, ...stamp(), flown: false, reason: 'below the perigee floor', seconds: (Date.now() - t0) / 1000 }); console.log(it.id, 'below the perigee floor'); continue; }
      const p2 = await p2Of(reg);
      const p2tab = p2.tab;
      if (it.type === 'window') {
        const fixture = { ...baseFixture(reg, it.e, phase, phase), forecastDays: FORECAST_DAYS };
        const r = await runModelTruth(fixture);
        const { tab, nRad, aKm, iFit } = tableP1(r);
        const corr = stepCorrections(tab, p2tab, r.flown);
        const rtn = r.profile.map((p) => [p.r, p.t, p.n]), hours = r.profile.map((p) => p.h);
        const series = seriesOf(rtn, corr);
        // Amendment 1.1: the pre-fit flight (P1 + P1N subtracted from the arc before the fit), the displacement added back at its own angles
        const pf = await prefitFlight(fixture, true);
        if (pf.r.flown.length !== r.flown.length) throw new Error('pre-fit: the flights differ in length');
        const rtnF = pf.r.profile.map((p) => [p.r, p.t, p.n]), tabF = tableP1(pf.r).tab, angF = anglesOf(pf.r.flown);
        const corrF1N = angF.map((a) => { const d = disp(tabF, a.u); return [d[0], d[1], d[2] - tabF.N0predM]; }), corrF2 = angF.map((a, k) => add(corrF1N[k], disp(p2tab, a.u)));
        series['P1F+P1N'] = { rtn: rtnF.map((p, k) => add(p, corrF1N[k])), corr: corrF1N }; series['P1F+P1N+P2'] = { rtn: rtnF.map((p, k) => add(p, corrF2[k])), corr: corrF2 };
        const at = (h) => { let best = 0; for (let k = 1; k < hours.length; k += 1) if (Math.abs(hours[k] - h) < Math.abs(hours[best] - h)) best = k; return best; };
        // Amendment 3.1: leads = the RMS of the 3D error over the day's bin ((h - 24, h] hours past the fit's end), the accuracy table's
        // measure; leadsSample = the registered single sample nearest to h, reported
        const bin = (h) => hours.map((x, k) => k).filter((k) => hours[k] > h - 24 && hours[k] <= h);
        const leads = Object.fromEntries(LEADS_H.map((h) => { const ks = bin(h); return [h, { samples: ks.length, ...Object.fromEntries(WSTEPS.map((s) => [s, rms(ks.map((k) => Math.hypot(...series[s].rtn[k])))])) }]; }));
        const leadsSample = Object.fromEntries(LEADS_H.map((h) => { const k = at(h); return [h, { sampleH: hours[k], ...Object.fromEntries(WSTEPS.map((s) => [s, Math.hypot(...series[s].rtn[k])])) }]; }));
        const rms7 = Object.fromEntries(WSTEPS.map((s) => [s, rms(series[s].rtn.map((p) => Math.hypot(...p)))]));
        emit({ id: it.id, type: 'window', k: it.k, phaseDeg: phase, ...c, ...stamp(), flown: true, fitted: r.fitted, prefit: { fitted: pf.r.fitted, set: pf.set, arcInclinationDeg: pf.arcInclinationDeg, plane: planeChange(pf.r.flown, r.flown, aKm) }, iFitDeg: iFit * 180 / Math.PI, aFitKm: aKm, forecastDays: FORECAST_DAYS, samples: r.flown.length, leads, leadsSample, rms7, N0predM: tab.N0predM, R0predM: tab.R0predM, p1CorrectionRmsM: rms(corr.P1.map((p) => Math.hypot(...p))), p2CorrectionRmsM: rms(r.flown.map((s, k) => Math.hypot(...disp(p2tab, orbitAngles(s.slice(0, 3), s.slice(3)).u)))), kernelSha256: r.kernelSha256, set: { sha256: sha256(Buffer.from(r.omm, 'base64')) }, seconds: (Date.now() - t0) / 1000 });
        console.log(it.id, LEADS_H.map((h) => `day ${h / 24} RMS ${f(leads[h].before)} -> ${f(leads[h]['P1+P1N'])} / ${f(leads[h]['P1+P1N+P2'])} | pre-fit ${f(leads[h]['P1F+P1N'])} / ${f(leads[h]['P1F+P1N+P2'])} (sample ${f(leadsSample[h].before)} -> ${f(leadsSample[h]['P1F+P1N'])})`).join('; '), `${((Date.now() - t0) / 1000).toFixed(0)} s`);
        continue;
      }
      const fixture = baseFixture(reg, it.e, reg.raan, reg.argp);
      const r = await runModelTruth(fixture);
      const set = Buffer.from(r.omm, 'base64');
      const { tab, nRad, aKm, iFit } = tableP1(r);
      const tb = performance.now(); responseTable(forceHarmonics(J, 3, 5, aKm, iFit), nRad); const firstBuildMs = performance.now() - tb;
      // forward leg
      const tau = r.profile.map((p) => p.h / 24), rtn = r.profile.map((p) => [p.r, p.t, p.n]);
      const corrFwd = stepCorrections(tab, p2tab, r.flown);
      const fwdSeries = seriesOf(rtn, corrFwd);
      // Amendment 1.1: the pre-fit arms P1F (without the constant normal member) and P1F + P1N (with it); P2 added at the output step
      const pfA = await prefitFlight(fixture, false), pfB = await prefitFlight(fixture, true);
      if (pfA.r.flown.length !== r.flown.length || pfB.r.flown.length !== r.flown.length) throw new Error('pre-fit: the flights differ in length');
      const tabFA = tableP1(pfA.r).tab, tabFB = tableP1(pfB.r).tab;
      const corrFA = anglesOf(pfA.r.flown).map((a) => disp(tabFA, a.u)), angFB = anglesOf(pfB.r.flown), corrFB = angFB.map((a) => { const d = disp(tabFB, a.u); return [d[0], d[1], d[2] - tabFB.N0predM]; }), corrFB2 = angFB.map((a, k) => add(corrFB[k], disp(p2tab, a.u)));
      const rtnFA = pfA.r.profile.map((p) => [p.r, p.t, p.n]), rtnFB = pfB.r.profile.map((p) => [p.r, p.t, p.n]);
      fwdSeries.P1F = { rtn: rtnFA.map((p, k) => add(p, corrFA[k])), corr: corrFA }; fwdSeries['P1F+P1N'] = { rtn: rtnFB.map((p, k) => add(p, corrFB[k])), corr: corrFB }; fwdSeries['P1F+P1N+P2'] = { rtn: rtnFB.map((p, k) => add(p, corrFB2[k])), corr: corrFB2 };
      const forward = legSteps(tau, fwdSeries, r.fitted.n, 1, 1 / r.fitted.n);
      const prefit = { P1F: { fitted: pfA.r.fitted, set: pfA.set, arcInclinationDeg: pfA.arcInclinationDeg, plane: planeChange(pfA.r.flown, r.flown, aKm), rawRmsM: rms(rtnFA.map((p) => Math.hypot(...p))) }, 'P1F+P1N': { fitted: pfB.r.fitted, set: pfB.set, arcInclinationDeg: pfB.arcInclinationDeg, plane: planeChange(pfB.r.flown, r.flown, aKm), rawRmsM: rms(rtnFB.map((p) => Math.hypot(...p))) } };
      // in-arc leg (the post-fit steps)
      const arcOem = OEM.getRootAsOEM(new fb.ByteBuffer((await runModelTruth({ ...fixture, fitInput: true })).ephemeris.payload)).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES;
      const arcFlown = await fly(set, arcOem.map((l) => l.EPOCH));
      const arcRtn = arcOem.map((l, k) => rtnOf([arcFlown[k][0] - l.X, arcFlown[k][1] - l.Y, arcFlown[k][2] - l.Z], [l.X, l.Y, l.Z], [l.X_DOT, l.Y_DOT, l.Z_DOT]));
      const arcTau = arcOem.map((l) => (Date.parse(`${l.EPOCH}Z`) - Date.parse(`${arcOem[0].EPOCH}Z`)) / DAY);
      const inArc = legSteps(arcTau, seriesOf(arcRtn, stepCorrections(tab, p2tab, arcFlown)), r.fitted.n, c.arcDays, 1);
      // item 4 (b), (c): the constants before and after P1N (forward day, delete-one-revolution jackknife)
      const blockIds = tau.map((t) => Math.floor(t * r.fitted.n));
      const lR = lineFit(tau, rtn.map((q) => q[0]), blockIds), lN = lineFit(tau, rtn.map((q) => q[2]), blockIds), lT = lineFit(tau, rtn.map((q) => q[1]), blockIds);
      const lNafter = lineFit(tau, rtn.map((q, k) => q[2] + corrFwd['P1+P1N'][k][2]), blockIds), lNafterF = lineFit(tau, fwdSeries['P1F+P1N'].rtn.map((q) => q[2]), blockIds), lRF = lineFit(tau, rtnFB.map((q) => q[0]), blockIds);
      const inside = (pred, iv) => (iv.lo == null ? null : pred >= iv.lo && pred <= iv.hi);
      const constants = { N0predM: tab.N0predM, N0: lN.c0, N0afterP1N: lNafter.c0, N0afterP1FN: lNafterF.c0, N0explained: inside(tab.N0predM, lN.c0), R0predM: tab.R0predM, R0: lR.c0, R0prefit: lRF.c0, R0explained: inside(tab.R0predM, lR.c0), T1: lT.c1, revolutions: lR.K, z5: { R0: p2.z5.R0, N0: p2.z5.N0 }, z2: { R0: p2.z2.R0, N0: p2.z2.N0, forwardRmsM: rms(p2.z2.rtn.map((p) => Math.hypot(...p))) }, j1ForceKmS2: tab.j1 };
      // the bounds (A as the all-regimes record defines it)
      const gridMinutes = fixture.gridMinutes, iso = (ms) => new Date(ms).toISOString().replace('Z', '');
      const epochs = r.referenceStates.map((_, k) => iso(Date.parse(`${r.epoch}Z`) + Math.round((c.arcDays + (k + 1) * gridMinutes / 1440) * DAY)));
      const zonalOnly = await fly(O.repackOcm(set, (t) => { t.PERTURBATIONS.MAXIMUM_TESSERAL_DEGREE = 0; }), epochs);
      const A = rms(r.flown.map((p, k) => Math.hypot(...[0, 1, 2].map((ax) => (p[ax] - zonalOnly[k][ax]) * 1000)))), b = bounds(A);
      // V1 (Amendment 2; e 0.001 cells): on E5 alone (both sides J2 to J5), P1 + P1N at the Z5 flight's own angles, +Delta and -Delta;
      // read on the odd families (0,3) and (0,5), which only the J3/J5 first-order terms produce at e 0.001; (0,2) and (0,4) reported
      let v1 = null, cost = null;
      if (it.arms) {
        const z5 = p2.z5, z2 = p2.z2, S = z5.rtn, t5 = tableP1(z5.r);
        const { corr: corrS } = p1nAt(z5.r);
        const attS = (sign) => attribute(z5.tau, S.map((p, k) => [p[0] + sign * corrS[k][0], p[1] + sign * corrS[k][1], p[2] + sign * corrS[k][2]]), z5.r.fitted.n, 1, 1 / z5.r.fitted.n);
        const bS = attS(0), plus = attS(1), minus = attS(-1);
        const fam = (x, labels) => Math.hypot(...x.families.filter((q) => q.kind === 'zonal' && q.labels.some((l) => labels.includes(l))).map((q) => q.amplitudeM));
        const odd = (x) => fam(x, ['(0,3)', '(0,5)']), even = (x) => fam(x, ['(0,2)', '(0,4)']);
        const meanN = (sign) => S.reduce((s, p, k) => s + p[2] + sign * corrS[k][2], 0) / S.length;
        const ratio = odd(bS) / Math.max(1e-9, odd(plus)), ratioMinus = odd(bS) / Math.max(1e-9, odd(minus));
        v1 = { construction: 'Amendment 2: E5 alone (both sides J2 to J5); P1 + P1N at the Z5 flight\'s own angles; read on the (0,3) and (0,5) families', sRmsM: rms(S.map((p) => Math.hypot(...p))), before: slim(bS), after: slim(plus), afterMinus: slim(minus), oddAmplitudeBeforeM: odd(bS), oddAmplitudeAfterM: odd(plus), oddAmplitudeAfterMinusM: odd(minus), evenAmplitudeBeforeM: even(bS), evenAmplitudeAfterM: even(plus), evenAmplitudeAfterMinusM: even(minus), m0: { before: bS.shares.zonal, plus: plus.shares.zonal, minus: minus.shares.zonal }, ratio, ratioMinus, constantNormalM: { before: meanN(0), plus: meanN(1), minus: meanN(-1), predicted: -t5.tab.N0predM }, correctionRmsM: rms(corrS.map((p) => Math.hypot(...p))), z5: { fitted: { n: z5.r.fitted.n, e: z5.r.fitted.e }, m0: z5.att.shares.zonal, zonalFamilies: z5.att.families.filter((q) => q.kind === 'zonal').slice(0, 6), R0: z5.R0, N0: z5.N0 }, z2: { fitted: { n: z2.r.fitted.n, e: z2.r.fitted.e }, m0: z2.att.shares.zonal, forwardRmsM: rms(z2.rtn.map((p) => Math.hypot(...p))), zonalFamilies: z2.att.families.filter((q) => q.kind === 'zonal').slice(0, 6), R0: z2.R0, N0: z2.N0 }, validated: ratio >= 3 && ratioMinus < 1 && bS.conditioned && plus.conditioned, conditioned: bS.conditioned && plus.conditioned && minus.conditioned };
        // item 7: the cost
        const builds = []; for (let k = 0; k < 50; k += 1) { const t1 = performance.now(); responseTable(forceHarmonics(J, 3, 5, aKm, iFit), nRad); builds.push(performance.now() - t1); }
        const us = anglesOf(r.flown).map((a) => a.u);
        const apply = (fn, reps) => { const per = []; for (let q = 0; q < reps; q += 1) { const t1 = performance.now(); for (const u of us) fn(u); per.push((performance.now() - t1) / us.length); } return median(per); };
        const perEpochP1Ms = apply((u) => disp(tab, u), 20), perEpochAllMs = apply((u) => add(disp(tab, u), disp(p2tab, u)), 20);
        cost = { terms: { P1: 5, P1N: 1, P2: 9 }, storedFloats: { P1: 12, P1N: 1, P2: 18, analyticJ2SecondOrder: 9 }, bytes: { P1: 48, P1N: 4, P2: 72, all: 124 }, buildMsMedian: median(builds), firstBuildMs, perEpochP1Ms, perEpochAllMs, flight65Ms: median(builds) + 65 * perEpochAllMs, epochsTimed: us.length, coldTargetMs: COLD_TARGET_MS, withinMs: WITHIN_MS, moduleTailBytes: MODULE_TAIL_BYTES };
        cost.within = cost.flight65Ms < WITHIN_MS && cost.bytes.all < MODULE_TAIL_BYTES;
      }
      const row = { id: it.id, type: 'cell', ...c, ...stamp(), flown: true, fitted: r.fitted, A_m: A, bounds: b, iFitDeg: iFit * 180 / Math.PI, aFitKm: aKm, p1: { N0predM: tab.N0predM, R0predM: tab.R0predM, amplitudes: Object.fromEntries([2, 3, 4, 5].map((j) => [j, Math.hypot(tab.cx[j], tab.sx[j], tab.cy[j], tab.sy[j], tab.cz[j], tab.sz[j])])) }, p2: { amplitudesM: p2.amplitudesM, constantM: p2.constantM, residualRmsM: p2.residualRmsM, seriesRmsM: p2.seriesRmsM, samples: p2.samples, floats: p2.floats }, forward, inArc, prefit, constants, v1, cost, selfTest: selfTestResult, kernelSha256: r.kernelSha256, set: { sha256: sha256(set), bytes: set.length }, seconds: (Date.now() - t0) / 1000 };
      emit(row);
      const z = (s) => `${f(forward[s].attribution.shares.zonal.rmsM)} [${f(forward[s].attribution.shares.zonal.lo?.rmsM)}, ${f(forward[s].attribution.shares.zonal.hi?.rmsM)}]`;
      console.log(it.id, `m0 ${z('before')} -> P1 ${z('P1')} -> +P1N ${z('P1+P1N')} -> +P2 ${z('P1+P1N+P2')} | pre-fit ${z('P1F')} / ${z('P1F+P1N')} / ${z('P1F+P1N+P2')} plane ${f(prefit['P1F+P1N'].plane.aSinIdOmegaM)} / ${f(prefit['P1F+P1N'].plane.aDiM)} m; N0 ${f(constants.N0.point)} pred ${f(constants.N0predM)} ${constants.N0explained ? 'explained' : 'NOT explained'}; R0 ${f(constants.R0.point)} pred ${f(constants.R0predM)}`, v1 ? `V1 x${f(v1.ratio, 1)} / x${f(v1.ratioMinus, 2)} ${v1.validated ? 'validated' : 'NOT validated'}` : '', `${row.seconds.toFixed(0)} s`);
    } catch (error) {
      emit({ id: it.id, type: it.type, ...c, ...stamp(), flown: false, error: String(error?.stack ?? error).slice(0, 600), seconds: (Date.now() - t0) / 1000 });
      console.log(it.id, 'ERROR', String(error?.message ?? error).slice(0, 300));
    }
  }
  await flyer.close?.();
  process.exit(0);
}

// ---- Amendment 1.2 / 4.4: the real-window arm 5b (report only) ----
//   SDN_MODULES_ROOT=<pinned root> node j2-j5-short-period.mjs --real [--regimes LARES,Starlette,Ajisai,Jason-3]
// The accuracy table's precise-orbit windows (all-regimes.mjs: the same files, cutoffs, grid, coverage rule, weather and fit configuration),
// sdn-ap 0.6.3 (the table's build), the 72 h arc fitted as is and with P1F / P1F + P1N subtracted from the arc before the fit, the flight
// scored against the precise orbit as the RMS of the 3D error over the day bin at days 1, 3 and 7, the displacement added back at the
// flight's own angles. Every state is a module's (propagator/sdn-ap, foundation/frames, analysis/gp-error-model's pair statistics).
const REAL_BUILD = { version: '0.6.3', modulesCommit: '93cb5a0584fa728864e4426cc9ceb368936589f9', wasmSha256: 'aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e' };
const REAL_REGIMES = { LARES: { file: 'lares', group: 'LS' }, Starlette: { file: 'starlette', group: 'LS' }, Ajisai: { file: 'ajisai', group: 'LS' }, 'Jason-3': { file: 'Jason-3', group: 'DO' } };
const REAL_ARMS = ['P1F', 'P1F+P1N'], REAL_FIT_H = 72, REAL_COUNTED = 'LARES';
const REAL_ROWS = path.join(RESULTS, 'real-rows.jsonl'), REAL_OUT = path.join(RESULTS, 'real-windows.json');
const binomTwoSided = (k, n) => { const c = (a, b) => { let r = 1; for (let i = 1; i <= b; i += 1) r = r * (a - b + i) / i; return r; }; const p = (x) => c(n, x) / 2 ** n; let lo = 0, hi = 0; for (let x = 0; x <= n; x += 1) { if (x <= k) lo += p(x); if (x >= k) hi += p(x); } return Math.min(1, 2 * Math.min(lo, hi)); };
/** real-windows.json from the real rows and the size table (written by --real and by --real-table). */
function realSummary() {
  const rows = fs.existsSync(REAL_ROWS) ? fs.readFileSync(REAL_ROWS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const size = sizeTable();
  const regimes = Object.keys(REAL_REGIMES).map((name) => {
    const mine = rows.filter((r) => r.regime === name), ok = mine.filter((r) => r.ok);
    const sz = size.regimes.find((s) => s.regime === name);
    if (!mine.length) return { regime: name, state: 'unmeasured', flagged: name !== REAL_COUNTED };
    const leads = LEADS_H.flatMap((h) => REAL_ARMS.map((arm) => {
      const k = h / 24, pairs = ok.filter((r) => r.arms.before.days[k] && r.arms[arm]?.days[k]).map((r) => ({ key: r.key, before: r.arms.before.days[k].e * 1000, after: r.arms[arm].days[k].e * 1000 }));
      const d = pairs.map((p) => p.before - p.after), improved = d.filter((x) => x > 0).length, n = d.length, p = n ? binomTwoSided(improved, n) : null;
      const li = LEADS_H.indexOf(h);
      return { leadH: h, arm, n, beforeMedianM: median(pairs.map((q) => q.before)), afterMedianM: median(pairs.map((q) => q.after)), diffMedianM: median(d), diffMinM: n ? Math.min(...d) : NaN, diffMaxM: n ? Math.max(...d) : NaN, improved, p, powerNote: n ? `p ${f(binomTwoSided(n, n), 3)} at ${n} of ${n}, ${f(binomTwoSided(n - 1, n), 3)} at ${n - 1} of ${n}` : '-', expected: sz ? { linearPct: sz.linearPct[li], quadraturePct: sz.quadraturePct[li], tableMedianM: sz.cells[li]?.medianM ?? null } : null, reading: !n ? 'no pairs' : p <= 0.05 ? `${improved > n / 2 ? 'improved' : 'worsened'} in ${improved} of ${n} (p ${f(p, 3)})` : `no sign (${improved} of ${n} improved, p ${f(p, 3)})` };
    }));
    return { regime: name, state: 'measured', flagged: name !== REAL_COUNTED, flag: name !== REAL_COUNTED ? 'P1 not validated in this regime (Amendment 4.2): flown and FLAGGED, not counted' : 'counted', windows: ok.length, windowsFailed: mine.filter((r) => !r.ok).map((r) => `${r.key}: ${r.error}`), shareM: sz?.shareM ?? null, leads, rows: mine.map((r) => ({ key: r.key, ok: r.ok, error: r.error, cutoff: r.cutoff, fitRmsKm: r.ok ? Object.fromEntries(['before', ...REAL_ARMS].map((a) => [a, r.arms[a]?.fitRmsKm ?? null])) : null, days: r.ok ? Object.fromEntries(['before', ...REAL_ARMS].map((a) => [a, Object.fromEntries(LEADS_H.map((h) => [h / 24, r.arms[a]?.days[h / 24]?.e != null ? r.arms[a].days[h / 24].e * 1000 : null]))])) : null, table: r.table })) };
  });
  const out = { what: `Real-window arm 5b (Amendment 4.4; report only): the accuracy table's precise-orbit windows, sdn-ap ${REAL_BUILD.version} (${REAL_BUILD.wasmSha256.slice(0, 12)} at modules ${REAL_BUILD.modulesCommit.slice(0, 9)}), ${REAL_FIT_H} h fit as is (before) and with the displacement subtracted from the arc before the fit (P1F: J3-J5 j >= 2; P1F + P1N: with the constant normal member), the flight scored against the precise orbit as the RMS of the 3D error over the day bin (m), paired per window; two-sided sign test; the expected size beside (item 1: the linear bound and the quadrature expectation of the share against the table's median at that lead).`, source: 'all-regimes.mjs windows (lib/regimes.mjs STATIC: LS laser files, DO DORIS file; cutoffs every 5 days 2025-10-10 to 2025-12-21); results/ap-truth/compare/cells.json for the expected size; the XM host libraries (foundation/frames, analysis/gp-error-model pair statistics) from the modules root named by SDN_MODULES_ROOT at the XM registration (a root whose installed spacedatastandards.org is 1.276.0: /Users/tj/software/private/coordinator-d9/space-data-network-modules-bench2, read only; the -covm root installs 1.279.0 and the XM check refuses it), the 0.6.3 dist by git show at its commit, SHA-256 checked', build: REAL_BUILD, measure: 'RMS of the 3D error over ((k - 1) days, k days] past the fit end, all-regimes.mjs score', regimes };
  fs.mkdirSync(RESULTS, { recursive: true });
  fs.writeFileSync(REAL_OUT, `${JSON.stringify(out, null, 1)}\n`);
  return out;
}
if (args['real-table']) { const o = realSummary(); console.log(JSON.stringify(o.regimes.map((r) => ({ regime: r.regime, state: r.state, windows: r.windows, leads: r.leads?.map((L) => `${L.arm} day ${L.leadH / 24}: ${f(L.beforeMedianM, 1)} -> ${f(L.afterMedianM, 1)} m, ${L.reading}`) })), null, 1)); process.exit(0); }
if (args.real) {
  const MOD = process.env.SDN_MODULES_ROOT;
  if (!MOD) throw new Error('SDN_MODULES_ROOT names the pinned modules root');
  const { config, root, HOUR, DAY: XDAY, iso: xiso, ms, rms: xrms, XM } = await import(pathToFileURL(path.join(HERE, 'lib/xp2.mjs')).href);
  const { apForces, standalone, fitPcf, fitWeather, horizonOf, readOcm } = await import(pathToFileURL(path.join(HERE, 'lib/ap.mjs')).href);
  const { STATIC, windowKey } = await import(pathToFileURL(path.join(HERE, 'lib/regimes.mjs')).href);
  const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
  const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
  const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
  const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
  const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
  const { C, J } = readCoefficients(MOD);
  const m = await openModules();
  const h = await standalone('propagator/sdn-ap', REAL_BUILD);
  const A = {
    async fit(oem, pcf, extra) { const inputs = [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }, ...(extra?.spw ? [{ portId: 'space_weather', typeRef: S.TYPE('SPW'), payload: extra.spw }] : [])]; let r; try { r = await h.invoke({ methodId: 'fit', inputs }); } catch (error) { return { ok: false, error: String(error?.message ?? error).slice(0, 200) }; } if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}` }; return { ok: true, ocm: new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload) }; },
    async propagate(ocm, epochs, count) { const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: S.flightPcfBytes(epochs) }] }); if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`); const lines = S.oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload)); if (lines.length !== count) throw new Error(`propagate returned ${lines.length} of ${count} states`); return lines; },
  };
  const LEADS = XM.config.scoring.leadDays, GRID = XM.config.scoring.gridSeconds * 1000, MIN_BIN = XM.config.scoring.binMinimumEpochs, MIN_COV = XM.config.fit.minimumCoverage;
  const PCF_AP = fitPcf({ forces: apForces({ tesseral: 31, zonal: 20 }), fit: null });
  const done = new Set(fs.existsSync(REAL_ROWS) ? fs.readFileSync(REAL_ROWS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);
  fs.mkdirSync(RESULTS, { recursive: true });
  const toGcrfAdd = (s, d) => { const r = s.r, v = s.v, rn = Math.hypot(...r), rHat = r.map((x) => x / rn), hh = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]], hn = Math.hypot(...hh), hHat = hh.map((x) => x / hn), tHat = [hHat[1] * rHat[2] - hHat[2] * rHat[1], hHat[2] * rHat[0] - hHat[0] * rHat[2], hHat[0] * rHat[1] - hHat[1] * rHat[0]]; return { r: [0, 1, 2].map((ax) => r[ax] + (d[0] * rHat[ax] + d[1] * tHat[ax] + d[2] * hHat[ax]) / 1000), v }; };
  for (const name of (args.regimes ?? Object.keys(REAL_REGIMES).join(',')).split(',')) {
    const spec = REAL_REGIMES[name]; if (!spec) throw new Error(`unknown regime ${name}`);
    const o = STATIC.find((x) => x.name === spec.file && x.group === spec.group); if (!o) throw new Error(`no STATIC entry for ${name}`);
    const files = o.files(); if (!files.length) { console.log(name, 'no product'); continue; }
    const series = SRC.chain(files), lines = series.lines, times = lines.map((l) => ms(l.epoch));
    const stepMs = times.length > 1 ? times[1] - times[0] : GRID, gridMs = Math.max(GRID, Math.ceil(GRID / stepMs) * stepMs), minBin = Math.ceil((MIN_BIN / (XDAY / GRID)) * (XDAY / gridMs));
    const between = (a, b) => { const out = []; for (let i = 0; i < times.length; i += 1) if (times[i] >= a && times[i] <= b) out.push(lines[i]); return out; };
    for (const D0 of o.cutoffs) {
      const key = windowKey(o.group, series.name || o.name, D0);
      if (done.has(key)) continue;
      const t0 = Date.now();
      const row = { key, regime: name, group: o.group, name: series.name || o.name, norad: series.norad, cutoff: xiso(D0), fitH: REAL_FIT_H, build: REAL_BUILD, createdUtc: new Date().toISOString(), runner: RUNNER, coefficients: { C, J }, flagged: name !== REAL_COUNTED, ok: false, arms: {} };
      try {
        const after = between(D0 + 1, D0 + 7 * XDAY), first = after.length ? ms(after[0].epoch) : 0;
        const grid = after.filter((l) => (ms(l.epoch) - first) % gridMs === 0);
        const bins = Object.fromEntries(LEADS.map((k) => [k, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (k - 1) * XDAY && t <= D0 + k * XDAY; })]));
        const entered = LEADS.filter((k) => bins[k].length >= minBin);
        if (!entered.length) throw new Error('no lead bin');
        const scored = entered.flatMap((k) => bins[k]), epochs = scored.map((l) => l.epoch), truth = scored.map((l) => ({ r: l.r, v: l.v })), sizes = entered.map((k) => bins[k].length);
        const R = W.rowsO(D0 - REAL_FIT_H * HOUR - XM.config.conditions.rowsMarginDays * XDAY, D0);
        if (R.excluded) throw new Error(R.excluded);
        const ex = { spw: fitWeather(R.rows, horizonOf(D0)) };
        const score = (e) => { const days = {}; let i = 0; entered.forEach((k, j) => { const s = e.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => xrms(s.map((q) => q[c]))); days[k] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2] }; }); return days; };
        const raw = between(D0 - REAL_FIT_H * HOUR, D0), coverage = raw.length > 1 ? raw.length / ((REAL_FIT_H * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0;
        if (coverage < MIN_COV) throw new Error('coverage');
        const thin = T.thinned(raw).chosen;
        // the table at the arc's own orbit (a and n from the first state's two-body energy, i from its angular momentum)
        const r0 = thin[0].r, v0 = thin[0].v, aKm = 1 / (2 / Math.hypot(...r0) - (v0[0] ** 2 + v0[1] ** 2 + v0[2] ** 2) / MU), nRad = Math.sqrt(MU / aKm ** 3), i0 = orbitAngles(r0, v0).i;
        const tab = responseTable(forceHarmonics(J, 3, 5, aKm, i0), nRad);
        row.table = { aKm, nRevDay: nRad * 86400 / (2 * Math.PI), iDeg: i0 * 180 / Math.PI, N0predM: tab.N0predM, amplitudes: Object.fromEntries([2, 3, 4, 5].map((j) => [j, Math.hypot(tab.cx[j], tab.sx[j], tab.cy[j], tab.sy[j], tab.cz[j], tab.sz[j])])), arcStates: thin.length, scoredEpochs: epochs.length, entered };
        const flyArm = async (armLines, withN0, addBack) => {
          const oem = S.oemBytes({ frame: 'GCRF', object: { name: series.name || o.name, id: series.objectId ?? '', norad: series.norad }, lines: armLines, useableStart: armLines[0].epoch, useableStop: xiso(D0) });
          const fit = await A.fit(oem, PCF_AP, ex); if (!fit.ok) throw new Error(fit.error);
          let states = await m.toAxes(await A.propagate(fit.ocm, epochs, epochs.length), epochs, 'GCRF');
          if (addBack) states = states.map((s) => { const { u } = orbitAngles(s.r, s.v); const d = disp(tab, u); if (withN0) d[2] -= tab.N0predM; return toGcrfAdd(s, d); });
          return { fitRmsKm: readOcm(fit.ocm).fitRmsKm, days: score(await m.rtn(states, truth)) };
        };
        row.arms.before = await flyArm(thin, false, false);
        for (const [arm, withN0] of [['P1F', false], ['P1F+P1N', true]]) {
          const corrected = thin.map((l) => { const s = subtractDisplacement([...l.r, ...l.v], tab, nRad, withN0); return { ...l, r: s.slice(0, 3), v: s.slice(3) }; });
          row.arms[arm] = await flyArm(corrected, withN0, true);
        }
        row.ok = true;
      } catch (error) { row.error = String(error?.message ?? error).slice(0, 200); }
      row.seconds = (Date.now() - t0) / 1000;
      fs.appendFileSync(REAL_ROWS, `${JSON.stringify(row)}\n`);
      console.log(key, row.ok ? LEADS_H.map((hh) => `day ${hh / 24} ${f(row.arms.before.days[hh / 24]?.e * 1000, 1)} -> ${f(row.arms.P1F.days[hh / 24]?.e * 1000, 1)} / ${f(row.arms['P1F+P1N'].days[hh / 24]?.e * 1000, 1)} m`).join('; ') : `ERROR ${row.error}`, `${row.seconds.toFixed(0)} s`);
    }
  }
  realSummary();
  await h.destroy?.(); await m.close?.();
  process.exit(0);
}

// ---- the table (item 8) ----
const readingOf = (step) => {
  if (!step) return 'unmeasured';
  if (!step.conditioned) return 'withheld (estimator)';
  const d = step.difference;
  if (d.lo == null) return 'no interval';
  const reduced = d.lo > 0, inside = step.floor === 'pass';
  return reduced ? (inside ? 'reduced; inside (floor)' : 'reduced; not inside') : d.hi < 0 ? 'worsened' : 'not reduced';
};
/** Amendment 1.2: the real-window arm's table lines from real-windows.json (written by the real-window runner; report only). */
function realWindowLines(real) {
  const lines = [`${real.what ?? ''} Source: ${real.source ?? '-'}. Measure: ${real.measure ?? '-'}.`, '| Regime (counted / flagged) | Windows (failed) | Arm | Lead | before, median (m) | after, median (m) | paired before - after: median [min, max] (m) | improved | sign test p (two-sided; its power) | Expected (item 1: share, linear bound, quadrature; table median) | reading |', '| --- | --: | --- | --: | --: | --: | --- | --- | --- | --- | --- |'];
  for (const r of real.regimes) {
    if (r.state !== 'measured') { lines.push(`| ${r.regime} (${r.flagged ? 'flagged' : 'counted'}) | ${r.state}${r.reason ? `: ${r.reason}` : ''} | | | | | | | | | |`); continue; }
    for (const L of r.leads) lines.push(`| ${r.regime} (${r.flag}) | ${r.windows} (${r.windowsFailed.length}) | ${L.arm} | day ${L.leadH / 24} | ${f(L.beforeMedianM, 1)} | ${f(L.afterMedianM, 1)} | ${f(L.diffMedianM, 2)} [${f(L.diffMinM, 2)}, ${f(L.diffMaxM, 2)}] | ${L.improved} of ${L.n} | ${f(L.p, 3)} (${L.powerNote}) | ${L.expected ? `${f(r.shareM)} m, ${f(L.expected.linearPct, 1)} %, ${f(L.expected.quadraturePct, 2)} %; ${f(L.expected.tableMedianM, 1)} m` : '-'} | ${L.reading} |`);
    if (r.windowsFailed.length) lines.push(`Windows not flown (${r.regime}): ${r.windowsFailed.join('; ')}.`);
  }
  return lines;
}
const orderStat = (v) => { const s = [...v].sort((a, b) => a - b); return { median: median(s), lo: s.length >= 6 ? s[1] : s[0], hi: s.length >= 6 ? s[s.length - 2] : s[s.length - 1], n: s.length }; };
export function table(outDir = RESULTS) {
  const rows = readRows(RESULTS), byId = new Map(rows.map((r) => [r.id, r]));
  const size = sizeTable();
  const regs = LOW.map((name) => REGIMES.find((r) => r.name === name));
  const stepView = (s) => (s ? { share: s.attribution.shares.zonal, difference: s.difference, floor: s.floor, reading: readingOf(s), residual: s.residual, leakage: s.leakage, rawRmsM: s.rawRmsM, correctionRmsM: s.correctionRmsM, zonalFamilies: s.attribution.zonalFamilies } : null);
  const cellOf = (id) => { const r = byId.get(id); if (!r) return { id, state: 'unmeasured' }; if (!r.flown) return { id, state: r.reason ?? 'error', error: r.error }; return { id, state: 'flown', regime: r.regime, e: r.e, fitted: { n: r.fitted.n, e: r.fitted.e }, A_m: r.A_m, bounds: r.bounds, forward: Object.fromEntries(FSTEPS.map((s) => [s, stepView(r.forward[s])])), inArc: Object.fromEntries(STEPS.map((s) => [s, stepView(r.inArc[s])])), prefit: r.prefit, constants: r.constants, p1: r.p1, p2: { amplitudesM: r.p2.amplitudesM, constantM: r.p2.constantM, residualRmsM: r.p2.residualRmsM, seriesRmsM: r.p2.seriesRmsM }, v1: r.v1 ? { validated: r.v1.validated, conditioned: r.v1.conditioned, sRmsM: r.v1.sRmsM, oddBeforeM: r.v1.oddAmplitudeBeforeM, oddAfterM: r.v1.oddAmplitudeAfterM, oddAfterMinusM: r.v1.oddAmplitudeAfterMinusM, evenBeforeM: r.v1.evenAmplitudeBeforeM, evenAfterM: r.v1.evenAmplitudeAfterM, evenAfterMinusM: r.v1.evenAmplitudeAfterMinusM, m0: r.v1.m0, ratio: r.v1.ratio, ratioMinus: r.v1.ratioMinus, constantNormalM: r.v1.constantNormalM, correctionRmsM: r.v1.correctionRmsM, e5: r.v1.z5.m0, e2: r.v1.z2.m0, e2ForwardRmsM: r.v1.z2.forwardRmsM, e5Families: r.v1.z5.zonalFamilies, e2Families: r.v1.z2.zonalFamilies, z5: { R0: r.v1.z5.R0, N0: r.v1.z5.N0 }, z2: { R0: r.v1.z2.R0, N0: r.v1.z2.N0 } } : null, selfTest: r.selfTest, seconds: r.seconds }; };
  const windowsOf = (reg) => {
    const ws = Array.from({ length: WINDOWS }, (_, k) => byId.get(`window:${reg.name}|${k}`));
    const flown = ws.filter((w) => w?.flown);
    // Amendment 4.1: the registered single sample (field leadsSample) is the record's end-to-end measure; the day-bin RMS (field leads,
    // Amendment 3.1, chosen after the first reading) is reported beside it
    const leadStats = (field) => Object.fromEntries(LEADS_H.map((h) => {
      const ok = flown.filter((w) => w[field]);
      const per = Object.fromEntries(WSTEPS.map((s) => [s, ok.length ? orderStat(ok.map((w) => w[field][h][s])) : null]));
      const diffs = Object.fromEntries(WSTEPS.slice(1).map((s) => { const d = ok.map((w) => w[field][h].before - w[field][h][s]); const moved = d.length === WINDOWS && (d.every((x) => x > 0) || d.every((x) => x < 0)); return [s, d.length ? { median: median(d), min: Math.min(...d), max: Math.max(...d), positive: d.filter((x) => x > 0).length, n: d.length, moved, reading: moved ? `moved by ${f(median(d))} m (${d[0] > 0 ? 'better' : 'worse'})` : 'not moved' } : null]; }));
      return [h, { steps: per, differences: diffs }];
    }));
    const leads = leadStats('leadsSample'), leadsDayBin = leadStats('leads');
    const rms7 = Object.fromEntries(WSTEPS.map((s) => [s, flown.length ? orderStat(flown.map((w) => w.rms7[s])) : null]));
    const plane = flown.length ? { aSinIdOmegaM: orderStat(flown.map((w) => w.prefit.plane.aSinIdOmegaM)), aDiM: orderStat(flown.map((w) => w.prefit.plane.aDiM)) } : null;
    return { flown: flown.length, states: ws.map((w, k) => (w ? (w.flown ? 'flown' : w.reason ?? 'error') : 'unmeasured')), leads, leadsDayBin, rms7, plane, windows: ws.map((w, k) => (w?.flown ? { k, phaseDeg: w.phaseDeg, fitted: { n: w.fitted.n, e: w.fitted.e }, prefit: w.prefit, leadsSample: w.leadsSample, leadsDayBin: w.leads, rms7: w.rms7, samples: w.samples } : { k, state: w ? w.reason ?? 'error' : 'unmeasured' })) };
  };
  const regimes = regs.map((reg) => {
    const main = cellOf(`cell:secondary:${reg.name}|0.001`), grid = E_GRID.map((e) => cellOf(`cell:secondary:${reg.name}|${e}`));
    const cr = byId.get(`cell:secondary:${reg.name}|0.001`)?.cost ?? null;
    return { regime: reg.name, n: reg.n, i: reg.i, size: size.regimes.find((s) => s.regime === reg.name), main, grid, windows: windowsOf(reg), cost: cr ? { state: 'measured', ...cr } : { state: 'unmeasured' } };
  });
  // Amendment 1.1: the verdict reads the pre-fit steps (CITE); the post-fit steps are reported beside and their difference is the absorption
  const counted = regimes.filter((r) => r.main.state === 'flown' && r.main.v1?.validated && r.main.forward[CITE.reduced].reading !== 'withheld (estimator)');
  const notCounted = regimes.filter((r) => !counted.includes(r)).map((r) => `${r.regime}: ${r.main.state !== 'flown' ? r.main.state : r.main.v1 ? (r.main.v1.validated ? r.main.forward[CITE.reduced].reading : 'V1 not validated') : 'no V1'}`);
  const reducedOn = (s) => counted.filter((r) => /^reduced/.test(r.main.forward[s].reading)).map((r) => r.regime);
  const insideOn = (s) => counted.filter((r) => r.main.forward[s].reading === 'reduced; inside (floor)').map((r) => r.regime);
  // Amendment 3.2: the best case per cell is the better of the two pre-fit steps (the smaller after share)
  const bestStepOf = (r) => (r.main.forward[CITE.best].share.rmsM < r.main.forward[CITE.reduced].share.rmsM ? CITE.best : CITE.reduced);
  const reducedA = reducedOn(CITE.reduced), insideA = insideOn(CITE.reduced);
  const reducedBest = counted.filter((r) => /^reduced/.test(r.main.forward[bestStepOf(r)].reading)).map((r) => r.regime), insideBest = counted.filter((r) => r.main.forward[bestStepOf(r)].reading === 'reduced; inside (floor)').map((r) => r.regime);
  const p2Worsened = regimes.filter((r) => r.main.state === 'flown' && r.main.forward[CITE.best].share.rmsM > r.main.forward[CITE.reduced].share.rmsM).map((r) => r.regime);
  const movedBetter = (h, s) => regimes.filter((r) => r.windows.leads[h].differences[s]?.moved && r.windows.leads[h].differences[s].median > 0).map((r) => r.regime);
  const movedAny = (h, s) => regimes.filter((r) => r.windows.leads[h].differences[s]?.moved).map((r) => r.regime);
  const costs = regimes.filter((r) => r.cost.state === 'measured'), costWithin = costs.length === regimes.length && costs.every((r) => r.cost.within);
  const n0Explained = regimes.filter((r) => r.main.state === 'flown' && r.main.constants.N0explained).map((r) => r.regime);
  const r0Explained = regimes.filter((r) => r.main.state === 'flown' && r.main.constants.R0explained).map((r) => r.regime);
  const e2eQuietRegimes = (step) => reducedBest.filter((name) => { const r = regimes.find((x) => x.regime === name); return !r.windows.leads[24].differences[step]?.moved && !r.windows.leads[72].differences[step]?.moved; });
  const multiplicity = { tests: MULTIPLICITY_TESTS, pEach: SIGN_P, expectedFalseMoved: MULTIPLICITY_TESTS * SIGN_P, observedMoved: [CITE.reduced, CITE.best].reduce((s, st) => s + LEADS_H.reduce((q, h) => q + movedAny(h, st).length, 0), 0), observedMovedBetter: [CITE.reduced, CITE.best].reduce((s, st) => s + LEADS_H.reduce((q, h) => q + movedBetter(h, st).length, 0), 0) };
  const absorption = regimes.filter((r) => r.main.state === 'flown').map((r) => ({ regime: r.regime, postFitM: r.main.forward['P1+P1N'].share.rmsM, preFitM: r.main.forward[CITE.reduced].share.rmsM, differenceM: r.main.forward['P1+P1N'].share.rmsM - r.main.forward[CITE.reduced].share.rmsM, plane: r.main.prefit?.['P1F+P1N']?.plane ?? null }));
  let verdict, blocks = [];
  if (!counted.length) verdict = 'undecided (no counted cell)';
  else if (reducedA.length === counted.length && (insideA.length >= 4 || movedBetter(24, CITE.reduced).length >= 4) && costWithin) verdict = 'worth a module record, with the stated gain';
  else if (reducedBest.length * 2 < counted.length || (reducedBest.length > 0 && reducedBest.every((name) => { const r = regimes.find((x) => x.regime === name), st = bestStepOf(r); return !r.windows.leads[24].differences[st]?.moved && !r.windows.leads[72].differences[st]?.moved; }))) verdict = 'not worth the bytes and fit time';
  else {
    verdict = 'undecided';
    if (reducedA.length !== counted.length) blocks.push(`${CITE.reduced} reduced in ${reducedA.length} of ${counted.length} counted cells (${reducedA.join(', ') || 'none'}), not every one`);
    if (insideA.length < 4 && movedBetter(24, CITE.reduced).length < 4) blocks.push(`inside the floors in ${insideA.length} and the end-to-end day-1 error moved (better) in ${movedBetter(24, CITE.reduced).length} regimes, fewer than four of either`);
    if (!costWithin) blocks.push('the cost is not within');
  }
  const gain = regimes.map((r) => (r.main.state === 'flown' ? `${r.regime}: m = 0 share ${f(r.main.forward.before.share.rmsM)} -> ${f(r.main.forward[CITE.reduced].share.rmsM)} m pre-fit (post-fit ${f(r.main.forward['P1+P1N'].share.rmsM)}; with the J2 second-order bound ${f(r.main.forward[CITE.best].share.rmsM)}); end-to-end day 1 / 3 / 7 median ${LEADS_H.map((h) => `${f(r.windows.leads[h].steps.before?.median)} -> ${f(r.windows.leads[h].steps[CITE.reduced]?.median)} (${f(r.windows.leads[h].steps[CITE.best]?.median)})`).join(', ')} m` : `${r.regime}: ${r.main.state}`));
  const n0Decisive = regimes.filter((r) => r.main.state === 'flown' && r.main.constants.N0explained && !(r.main.constants.N0.lo <= 0 && r.main.constants.N0.hi >= 0)).map((r) => r.regime);
  const n0Indiscriminate = regimes.filter((r) => r.main.state === 'flown' && r.main.constants.N0explained && r.main.constants.N0.lo <= 0 && r.main.constants.N0.hi >= 0).map((r) => r.regime);
  const overshootLine = regimes.map((r) => (r.main.v1 ? `${r.regime}: (0,3) + (0,5) ${f(r.main.v1.oddBeforeM)} -> +Delta ${f(r.main.v1.oddAfterM)} / -Delta ${f(r.main.v1.oddAfterMinusM)} m, ratio ${f(r.main.v1.ratio, 1)} (${r.main.v1.validated ? 'validated' : 'NOT validated: P1\'s odd terms overshoot by about ' + f(100 * (r.main.v1.oddAfterM / r.main.v1.oddBeforeM), 0) + ' per cent of the content'})` : `${r.regime}: ${r.main.state}`));
  const notCountedReadings = regimes.filter((r) => !counted.includes(r) && r.main.state === 'flown').map((r) => `${r.regime} ${f(r.main.forward.before.share.rmsM)} -> ${f(r.main.forward[CITE.reduced].share.rmsM)} m (${r.main.forward[CITE.reduced].reading}; not counted: ${r.main.v1?.validated ? r.main.forward[CITE.reduced].reading : 'V1 not validated'})`);
  const n0Line = regimes.map((r) => (r.main.state === 'flown' ? `${r.regime}: predicted ${f(r.main.constants.N0predM)}, measured ${f(r.main.constants.N0.point)} [${f(r.main.constants.N0.lo)}, ${f(r.main.constants.N0.hi)}]: ${r.main.constants.N0explained == null ? 'no interval' : r.main.constants.N0explained ? (r.main.constants.N0.lo <= 0 && r.main.constants.N0.hi >= 0 ? 'explained, but the interval contains zero: cannot discriminate' : 'explained') : 'NOT explained'}; after P1N ${f(r.main.constants.N0afterP1N.point)} (pre-fit ${f(r.main.constants.N0afterP1FN.point)}); the pre-fit set's plane moves a sin i dOmega ${f(r.main.prefit['P1F+P1N'].plane.aSinIdOmegaM)} m, a di ${f(r.main.prefit['P1F+P1N'].plane.aDiM)} m` : `${r.regime}: ${r.main.state}`));
  const moduleRecord = {
    title: 'propagator/sdn-ap: J3-J5 first-order short-period terms (m = 0, j >= 2, small-e form in the argument of latitude) and the J3/J5 constant normal member at the output step; the J2 second-order short-period terms (Kozai 1962) as a second, derived item',
    terms: 'J2-J5-SHORT-PERIOD.md items 2a, 2b and 3: per object a table of 12 floats (the forced Hill response per harmonic j = 2..5 of the J3-J5 force harmonics at the mean a, i, n) plus the constant normal member N0 (1 float), rebuilt when the mean i or a moves, applied to the osculating output position in RTN; the j = 1 members stay in the rates as today; the J2 second-order short-period terms transcribed from Kozai 1962 with their own reference-side validation (this record bounds them, P2)',
    eGte005Questions: ['the q = +-1 sidebands (Kaula G_lpq) of the J3-J5 members at e >= 0.05: (l + 2) e / 2 reaches 0.175 at e 0.05 and 0.35 at e 0.1 for l = 5, and the e grid rows here state the measured degradation', 'the identity of the J3 and J5 j = 1 members with the module\'s odd-degree long-period rates (w = +-1) at e >= 0.05, where the once-per-revolution term is no longer the small-eccentricity-vector response', 'the constant normal member at e >= 0.05: whether it stays a constant in position or becomes the j = 1 (i, Omega) short-period term of the elements', 'the wide-e class above kWideE 0.3: whether the J3-J5 zonal members enter the existing (l, 0, p, q) grid or stay in this table', 'the radial bias at fixed mean motion R0 in the polar regimes (Sentinel-3, CryoSat-2), which the J4 constant member does not explain and the Z2 arm locates: the J2 second-order mean-to-osculating radius or the mean-element convention'],
  };
  const summary = { rows: rows.length, flown: rows.filter((r) => r.flown).length, errors: rows.filter((r) => !r.flown && r.error).map((r) => `${r.id}: ${r.error.split('\n')[0]}`), unmeasured: items().filter((c) => !byId.has(c.id)).map((c) => c.id), size: { floorPct: size.floorPct, aboveFloorDay3: size.aboveFloorDay3, shortcutReachable: size.shortcutReachable, matchesRegistration: size.matchesRegistration }, counted: counted.map((r) => r.regime), notCounted, cite: CITE, reduced: Object.fromEntries(FSTEPS.slice(1).map((s) => [s, reducedOn(s)])), inside: Object.fromEntries(FSTEPS.slice(1).map((s) => [s, insideOn(s)])), endToEndMovedBetter: Object.fromEntries(LEADS_H.map((h) => [h, Object.fromEntries(WSTEPS.slice(1).map((s) => [s, movedBetter(h, s)]))])), endToEndMoved: Object.fromEntries(LEADS_H.map((h) => [h, Object.fromEntries(WSTEPS.slice(1).map((s) => [s, movedAny(h, s)]))])), multiplicity, absorption, p2Worsened, n0Decisive, n0Indiscriminate, overshootLine, notCountedReadings, bestStep: Object.fromEntries(counted.map((r) => [r.regime, bestStepOf(r)])), n0Explained, n0Line, r0Explained, costWithin, verdict, blocks, gain, v1: regimes.map((r) => `${r.regime}: ${r.main.v1 ? `${r.main.v1.validated ? 'validated' : 'NOT validated'} (E5's (0,3) + (0,5) amplitude ${f(r.main.v1.oddBeforeM)} -> ${f(r.main.v1.oddAfterM)} m with +Delta, x${f(r.main.v1.ratio, 1)}; -Delta x${f(r.main.v1.ratioMinus, 2)}; (0,2) + (0,4) ${f(r.main.v1.evenBeforeM)} -> ${f(r.main.v1.evenAfterM)} / ${f(r.main.v1.evenAfterMinusM)}; E5 m = 0 ${f(r.main.v1.m0.before.rmsM)} -> ${f(r.main.v1.m0.plus.rmsM)} m; E5 constant normal ${f(r.main.v1.constantNormalM.before)} -> ${f(r.main.v1.constantNormalM.plus)} m against the predicted ${f(r.main.v1.constantNormalM.predicted)})` : r.main.state}`), selfTest: rows.find((r) => r.selfTest)?.selfTest ?? null, moduleRecord: verdict === 'worth a module record, with the stated gain' ? moduleRecord : { stated: 'not warranted on this verdict; the title, terms and e >= 0.05 questions are listed for the coordinator in case the finding is reconsidered', ...moduleRecord } };
  const out = { registration: REGISTRATION, pins: PIN, egm: EGM, coefficientsRegistered: C_REGISTERED, floors: FLOORS, steps: STEPS, size, summary, regimes };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'table.json'), `${JSON.stringify(out, null, 1)}\n`);
  const ivs = (x) => (x ? (x.lo != null ? `${f(x.rmsM ?? x.point)} [${f(x.lo?.rmsM ?? x.lo)}, ${f(x.hi?.rmsM ?? x.hi)}]` : `${f(x.rmsM ?? x.point)} [no interval]`) : '-');
  const os_ = (x) => (x ? `${f(x.median)} [${f(x.lo)}, ${f(x.hi)}]` : '-');
  const cellLine = (c) => (c.state !== 'flown' ? `| ${c.id} | ${c.state}${c.error ? `: ${c.error.split('\n')[0].slice(0, 120)}` : ''} | | | | | | | | | | | |` : `| ${c.regime} e ${c.e} | ${ivs(c.forward.before.share)} | ${ivs(c.forward.P1.share)} (${c.forward.P1.reading}) | ${ivs(c.forward['P1+P1N'].share)} (${c.forward['P1+P1N'].reading}) | ${ivs(c.forward['P1+P1N+P2'].share)} (${c.forward['P1+P1N+P2'].reading}) | ${ivs(c.forward.P1F.share)} (${c.forward.P1F.reading}) | ${ivs(c.forward['P1F+P1N'].share)} (${c.forward['P1F+P1N'].reading}) | ${ivs(c.forward['P1F+P1N+P2'].share)} (${c.forward['P1F+P1N+P2'].reading}) | ${c.forward['P1+P1N'].residual ? `${c.forward['P1+P1N'].residual.label} ${f(c.forward['P1+P1N'].residual.amplitudeM)}` : '-'} / ${c.forward['P1+P1N+P2'].residual ? `${c.forward['P1+P1N+P2'].residual.label} ${f(c.forward['P1+P1N+P2'].residual.amplitudeM)}` : '-'} | ${ivs(c.inArc.before.share)} -> ${ivs(c.inArc['P1+P1N'].share)} -> ${ivs(c.inArc['P1+P1N+P2'].share)} | tess ${f(c.forward['P1+P1N+P2'].leakage.tesseral.beforeM)} -> ${f(c.forward['P1+P1N+P2'].leakage.tesseral.afterM)}${c.forward['P1+P1N+P2'].leakage.tesseral.moved ? ' MOVED' : ''}; sec ${f(c.forward['P1+P1N+P2'].leakage.secular.beforeM)} -> ${f(c.forward['P1+P1N+P2'].leakage.secular.afterM)}${c.forward['P1+P1N+P2'].leakage.secular.moved ? ' MOVED' : ''} | ${f(c.forward.P1.correctionRmsM)} / ${f(c.forward['P1+P1N+P2'].correctionRmsM)} |`);
  const md = [`# AP J3-J5 first-order and J2 second-order short-period terms: the size, the harness prototype against the independent reference, and the end-to-end arm against FFM truth`, '',
    `Registration: ${REGISTRATION}. Pins: modules ${PIN.modulesCommit.slice(0, 9)}; sdn-ap ${PIN.sdnAp.version} signed bundle ${PIN.sdnAp.bundleSha256.slice(0, 12)}, canonical ${PIN.sdnAp.canonicalSha256.slice(0, 12)}; ffm ${PIN.ffm.version} ${PIN.ffm.wasmSha256.slice(0, 12)}; EGM96 zonals from ${EGM.file} ${EGM.sha256.slice(0, 12)} (C30 ${C_REGISTERED[3]}, C40 ${C_REGISTERED[4]}, C50 ${C_REGISTERED[5]}). Shares are the all-regimes m = 0 share (RMS over the window, m) with [lower, upper] by the delete-one-block jackknife; the difference's interval is +-2 sqrt(SE_before^2 + SE_after^2). Floors: RMS ${FLOORS.rms} m, maximum ${FLOORS.max} m. Steps: P1 (J3-J5 first order, j >= 2, analytic), P1N (the J3/J5 constant normal member), P2 (the J2 second-order bound identified on arm Z5's E5 residual after P1 + P1N, Amendment 2: an upper bound, not a derived term; arm Z2 is not J2-only). First-pass rows apart, entering no table: first-pass/attempt-1, first-pass/attempt-2, first-pass/windows-attempt-1 (Amendments 2 and 4.1). Rows ${summary.rows}, flown ${summary.flown}${summary.errors.length ? `; errors: ${summary.errors.join('; ')}` : ''}${summary.unmeasured.length ? `; unmeasured: ${summary.unmeasured.join(', ')}` : ''}. Hill-response self-test: ${summary.selfTest ? `${summary.selfTest.pass ? 'pass' : 'FAIL'} (${summary.selfTest.maxErrorM.toExponential(2)} m against ${f(summary.selfTest.amplitudeM)} m)` : '-'}.`, '',
    `## Verdict (read on the pre-fit steps ${CITE.reduced} and ${CITE.best}, Amendment 1.1; the post-fit steps beside; the two lines first are the SDN-AP session's ruling of 2026-11-06 on these rows, in its order)`,
    `- Short-period terms P1 (j >= 2): by the registered synthetic end-to-end rule, ${summary.verdict}; validated in ${counted.filter((r) => reducedA.includes(r.regime)).map((r) => r.regime).join(' and ') || 'none'} only, with a ${(() => { const o = regimes.filter((r) => r.main.v1 && !r.main.v1.validated).map((r) => 100 * r.main.v1.oddAfterM / r.main.v1.oddBeforeM); return o.length ? `${f(Math.min(...o), 0)} to ${f(Math.max(...o), 0)}` : '-'; })()} % overshoot elsewhere. Not for a module now.${blocks.length ? ` Blocked by: ${blocks.join('; ')}.` : ''}`,
    `- Constant normal member N0 (J3 + J5): explained in ${n0Decisive.length} regimes, decisive; ${(() => { const real = fs.existsSync(REAL_OUT) ? JSON.parse(fs.readFileSync(REAL_OUT, 'utf8')) : null; const L = real?.regimes.find((r) => r.regime === REAL_COUNTED); if (!L || L.state !== 'measured') return `the real-window arm on ${REAL_COUNTED} is ${L?.state ?? 'unmeasured'}`; const at = (h) => L.leads.find((x) => x.arm === 'P1F+P1N' && x.leadH === h); return `on real ${REAL_COUNTED} windows the combined correction (P1F + P1N) improves ${LEADS_H.map((h) => `${at(h).improved} of ${at(h).n} at day ${h / 24}`).join(', ')}, by ${LEADS_H.map((h) => f(at(h).diffMedianM)).join(', ')} m`; })()}. That most of this gain is P1N is inferred from P1F + P1N minus P1F, because no P1N-alone arm flew; a module record measures P1N alone first.`, `- Counted cells (e 0.001, V1 validated): ${summary.counted.join(', ') || 'none'}${notCounted.length ? `; not counted: ${notCounted.join('; ')}` : ''}.`, `- Reduced, pre-fit: P1F ${summary.reduced.P1F.join(', ') || 'none'}; P1F + P1N ${reducedA.join(', ') || 'none'}; P1F + P1N + P2 ${reducedBest.join(', ') || 'none'}. Reduced, post-fit: P1 ${summary.reduced.P1.join(', ') || 'none'}; P1 + P1N ${summary.reduced['P1+P1N'].join(', ') || 'none'}; P1 + P1N + P2 ${summary.reduced['P1+P1N+P2'].join(', ') || 'none'}. Best case per cell (Amendment 3.2, the better of P1F + P1N and P1F + P1N + P2): reduced ${reducedBest.join(', ') || 'none'}; inside the floors ${insideBest.join(', ') || 'none'} (P1F + P1N alone: ${insideA.join(', ') || 'none'}). P2 worsened the share in: ${p2Worsened.join(', ') || 'none'} (the empirical J2 second-order bound is void there). Cost within: ${costWithin ? 'yes' : 'no'}.`, `- Fit absorption (post-fit share minus pre-fit share, P1 + P1N, m): ${absorption.map((a) => `${a.regime} ${f(a.postFitM)} - ${f(a.preFitM)} = ${f(a.differenceM)}`).join('; ')}.`, `- Counted reductions, by validated cells (Amendment 4.2): reduced ${reducedA.join(', ') || 'none'} of the counted ${summary.counted.join(', ') || 'none'}; the not-counted cells read, labeled: ${notCountedReadings.join('; ') || 'none'}.`, `- P1's odd-term overshoot, its own line (Amendment 4.2; not tuned here; for a module record to explain): ${overshootLine.join('; ')}.`, `- P2, its own line: the empirical J2 second-order bound identified on the E5 residual is VOID (it adds share in ${p2Worsened.join(', ') || 'none'}); the J2 second-order short-period term needs the Kozai 1962 transcription with its own validation, which this record does not do.`, `- N0, its own line (Amendments 1.4 and 4.3): ${n0Line.join('; ')}. Decisive matches: ${n0Decisive.join(', ') || 'none'} (${n0Decisive.length})${n0Indiscriminate.length ? `; plus ${n0Indiscriminate.join(', ')}, whose interval contains zero and cannot discriminate` : ''}${n0Decisive.length >= 4 ? '. Four or more decisive: the J3/J5 constant normal member is the named cause of the constant cross-track offset (4 bytes)' : ''}.`, `- R0, its own line (Amendment 4.3): the J4 constant member's prediction falls inside the measured interval in ${r0Explained.join(', ') || 'none'}${r0Explained.length ? `, where the interval also contains zero (${r0Explained.map((n) => { const c = regimes.find((r) => r.regime === n).main.constants; return `${n} ${f(c.R0.point)} [${f(c.R0.lo)}, ${f(c.R0.hi)}] against ${f(c.R0predM)}`; }).join('; ')}): no discrimination` : ''}; decisive matches: none. R0 is NOT explained by this record; the polar radial bias (Sentinel-3 ${f(regimes.find((r) => r.regime === 'Sentinel-3').main.constants?.R0.point)} m, CryoSat-2 ${f(regimes.find((r) => r.regime === 'CryoSat-2').main.constants?.R0.point)} m) stays open; arm Z5's R0 in section 3 says whether it persists with J2-J5 alone (a J2-only arm is not available in this harness: Amendment 2).`, `- End-to-end against FFM truth, moved better (all six windows) at day 1 / 3 / 7: pre-fit P1F + P1N ${LEADS_H.map((h) => summary.endToEndMovedBetter[h]['P1F+P1N'].join(', ') || 'none').join(' / ')}; with P2 ${LEADS_H.map((h) => summary.endToEndMovedBetter[h]['P1F+P1N+P2'].join(', ') || 'none').join(' / ')}; post-fit P1 + P1N ${LEADS_H.map((h) => summary.endToEndMovedBetter[h]['P1+P1N'].join(', ') || 'none').join(' / ')}. Multiplicity (Amendment 1.3): ${multiplicity.tests} sign tests at p ${multiplicity.pEach} each on the two cited steps, ${f(multiplicity.expectedFalseMoved, 2)} false "moved" expected by chance; observed moved ${multiplicity.observedMoved} (better ${multiplicity.observedMovedBetter}).`, `- The gain, per regime: ${gain.join('; ')}.`, `- V1 (Amendment 2: E5 alone, both sides J2 to J5, the odd families before and after P1 + P1N at the Z5 flight's own angles): ${summary.v1.join('; ')}.`, `- Real-window arm 5b (Amendments 1.2 and 4.4; report only, decides nothing in item 8): see section 7. Its measure was fixed in Amendment 4 before any of its rows: 5b is NOT post-read. The synthetic day-bin reading of section 5a was chosen after the first reading and stays labeled post-read; the two labels are not merged. Where the registered single-sample clause reads "not moved", both are reported as they fell; the first line above is item 8's verdict by the letter as the SDN-AP session ruled it.`, '',
    `## 1. The size (item 1: the landed accuracy table, ${size.source.file} ${size.source.sha256.slice(0, 12)}, AP ${size.source.apBuild}, ${size.source.fitH} h fit; floor ${size.floorPct} % at day 3; ${size.matchesRegistration ? 'reproduces the registered figures' : 'DOES NOT reproduce the registered figures'})`, `| Regime | Share (m) | Day 1 median (n) | Day 3 | Day 7 | Linear bound day 1 / 3 / 7 | Quadrature day 1 / 3 / 7 | Above the floor at day 3 |`, `| --- | --: | --: | --: | --: | --- | --- | --- |`,
    ...size.regimes.map((s) => `| ${s.regime} (${s.satellite}) | ${f(s.shareM)} | ${s.cells.map((c) => (c ? `${f(c.medianM, 1)} (${c.n})` : '-')).join(' | ')} | ${s.linearPct.map((p) => `${f(p, 1)} %`).join(' / ')} | ${s.quadraturePct.map((p) => `${f(p, 2)} %`).join(' / ')} | ${s.aboveFloorDay3 ? 'yes' : 'no'} |`), `Shortcut "not worth the bytes" reachable by size alone: ${size.shortcutReachable ? 'yes' : 'no'} (above the floor: ${size.aboveFloorDay3.join(', ') || 'none'}).`, '',
    `## 2. The cells (forward day; m = 0 share before and after each step; post-fit P1, P1 + P1N, P1 + P1N + P2; pre-fit P1F, P1F + P1N, P1F + P1N + P2)`, `| Cell | before | P1 | P1 + P1N | P1 + P1N + P2 | P1F | P1F + P1N | P1F + P1N + P2 | Residual family after P1 + P1N / + P2 | In-arc before -> P1 + P1N -> + P2 | Leakage (+ P2) | Correction RMS P1 / all (m) |`, `| --- | --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --: |`,
    ...regimes.flatMap((r) => [cellLine(r.main), ...r.grid.map(cellLine)]), '',
    `## 3. The constants (item 4; forward day; module minus reference; m) and the pre-fit set's plane (Amendment 1.1)`, `| Cell | N0 predicted (J3 + J5) | N0 measured | explained | N0 after P1N | N0 after P1F + P1N | R0 predicted (J4) | R0 measured | explained | R0 pre-fit | R0 of arm Z5 (J2-J5 both sides) | N0 of arm Z5 | Plane P1F + P1N: a sin i dOmega / a di (m) | Plane P1F | T1 (m/day) |`, `| --- | --: | --: | --- | --: | --: | --: | --: | --- | --: | --: | --: | --- | --- | --: |`,
    ...regimes.flatMap((r) => [r.main, ...r.grid].filter((c) => c.state === 'flown').map((c) => `| ${c.regime} e ${c.e} | ${f(c.constants.N0predM)} | ${ivs(c.constants.N0)} | ${c.constants.N0explained == null ? 'no interval' : c.constants.N0explained ? 'yes' : 'no'} | ${ivs(c.constants.N0afterP1N)} | ${ivs(c.constants.N0afterP1FN)} | ${f(c.constants.R0predM)} | ${ivs(c.constants.R0)} | ${c.constants.R0explained == null ? 'no interval' : c.constants.R0explained ? 'yes' : 'no'} | ${ivs(c.constants.R0prefit)} | ${ivs(c.constants.z5.R0)} | ${ivs(c.constants.z5.N0)} | ${f(c.prefit['P1F+P1N'].plane.aSinIdOmegaM)} / ${f(c.prefit['P1F+P1N'].plane.aDiM)} | ${f(c.prefit.P1F.plane.aSinIdOmegaM)} / ${f(c.prefit.P1F.plane.aDiM)} | ${ivs(c.constants.T1)} |`)), '',
    `## 4. V1 and the arms (e 0.001; Amendment 2: V1 on E5 alone, both sides J2 to J5, read on the odd families; arm Z2 (caps 0 / 2 against a degree-2 reference) is NOT J2-only, the module's J2-J5 content sits below the cap: its forward RMS is the finding)`, `| Regime | E5 RMS (m) | E5 (0,3) + (0,5) amplitude: before -> +Delta / -Delta | ratio +Delta / -Delta | E5 (0,2) + (0,4): before -> +Delta / -Delta | E5 m = 0 share before -> +Delta | E5 constant normal before -> +Delta (predicted) | E5 families | P2 (identified on E5 after P1 + P1N) amplitudes j 0 / 1 / 2 / 3 / 4 (m) | P2 residual (m) | arm Z2 forward RMS (m) and families | validated |`, `| --- | --: | --- | --- | --- | --- | --- | --- | --- | --: | --- | --- |`,
    ...regimes.map((r) => (r.main.v1 ? `| ${r.regime} | ${f(r.main.v1.sRmsM)} | ${f(r.main.v1.oddBeforeM)} -> ${f(r.main.v1.oddAfterM)} / ${f(r.main.v1.oddAfterMinusM)} | ${f(r.main.v1.ratio, 1)} / ${f(r.main.v1.ratioMinus, 2)} | ${f(r.main.v1.evenBeforeM)} -> ${f(r.main.v1.evenAfterM)} / ${f(r.main.v1.evenAfterMinusM)} | ${ivs(r.main.v1.m0.before)} -> ${ivs(r.main.v1.m0.plus)} | ${f(r.main.v1.constantNormalM.before)} -> ${f(r.main.v1.constantNormalM.plus)} (${f(r.main.v1.constantNormalM.predicted)}) | ${r.main.v1.e5Families.map((q) => `${q.labels.join('/')} ${f(q.amplitudeM)}`).join('; ')} | ${[0, 1, 2, 3, 4].map((j) => f(r.main.p2.amplitudesM[j])).join(' / ')} | ${f(r.main.p2.residualRmsM)} of ${f(r.main.p2.seriesRmsM)} | ${f(r.main.v1.e2ForwardRmsM)}: ${r.main.v1.e2Families.slice(0, 3).map((q) => `${q.labels.join('/')} ${f(q.amplitudeM)}`).join('; ')} | ${r.main.v1.validated ? 'yes' : 'NO'} |` : `| ${r.regime} | ${r.main.state} | | | | | | | | | | |`)), '',
    `## 5. End to end against FFM truth (item 5; six windows per regime, phase k x ${PHASE_STEP_DEG} deg; the registered measure: the 3D error at the sample nearest the lead, m; median [2nd, 5th] over the windows; paired difference before - after: median [min, max], moved when all six share the sign; the day-bin RMS reading, chosen after the first reading (Amendments 3.1 and 4.1), is the second table)`, `| Regime | Windows | Lead | before | P1 + P1N (post-fit) | P1F + P1N (pre-fit) | P1F + P1N + P2 | before - (P1 + P1N) | before - (P1F + P1N) | before - (P1F + P1N + P2) | 7-day RMS before -> P1 + P1N -> P1F + P1N -> + P2 | Pre-fit plane a sin i dOmega / a di (m, median) |`, `| --- | --: | --: | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
    ...regimes.flatMap((r) => LEADS_H.map((h, hi) => { const L = r.windows.leads[h]; const d = (s) => (L.differences[s] ? `${f(L.differences[s].median)} [${f(L.differences[s].min)}, ${f(L.differences[s].max)}] ${L.differences[s].positive}/${L.differences[s].n} better: ${L.differences[s].reading}` : '-'); return `| ${r.regime} | ${r.windows.flown} of ${WINDOWS} | ${h} h | ${os_(L.steps.before)} | ${os_(L.steps['P1+P1N'])} | ${os_(L.steps['P1F+P1N'])} | ${os_(L.steps['P1F+P1N+P2'])} | ${d('P1+P1N')} | ${d('P1F+P1N')} | ${d('P1F+P1N+P2')} | ${hi === 0 ? `${os_(r.windows.rms7.before)} -> ${os_(r.windows.rms7['P1+P1N'])} -> ${os_(r.windows.rms7['P1F+P1N'])} -> ${os_(r.windows.rms7['P1F+P1N+P2'])}` : ''} | ${hi === 0 && r.windows.plane ? `${f(r.windows.plane.aSinIdOmegaM.median)} / ${f(r.windows.plane.aDiM.median)}` : ''} |`; })), '',
    `### 5a. The day-bin RMS reading (the accuracy table's measure; CHOSEN AFTER THE FIRST READING, Amendment 3.1 / 4.1; reported beside, not the record's end-to-end verdict)`, `| Regime | Lead | before | P1 + P1N (post-fit) | P1F + P1N (pre-fit) | P1F + P1N + P2 | before - (P1 + P1N) | before - (P1F + P1N) | before - (P1F + P1N + P2) |`, `| --- | --: | --- | --- | --- | --- | --- | --- | --- |`,
    ...regimes.flatMap((r) => LEADS_H.map((h) => { const L = r.windows.leadsDayBin[h]; const d = (s) => (L.differences[s] ? `${f(L.differences[s].median)} [${f(L.differences[s].min)}, ${f(L.differences[s].max)}] ${L.differences[s].positive}/${L.differences[s].n} better: ${L.differences[s].reading}` : '-'); return `| ${r.regime} | day ${h / 24} | ${os_(L.steps.before)} | ${os_(L.steps['P1+P1N'])} | ${os_(L.steps['P1F+P1N'])} | ${os_(L.steps['P1F+P1N+P2'])} | ${d('P1+P1N')} | ${d('P1F+P1N')} | ${d('P1F+P1N+P2')} |`; })), `Day-bin reading, moved better (all six windows) at day 1 / 3 / 7 on P1F + P1N: ${LEADS_H.map((h) => regimes.filter((r) => r.windows.leadsDayBin[h].differences['P1F+P1N']?.moved && r.windows.leadsDayBin[h].differences['P1F+P1N'].median > 0).map((r) => r.regime).join(', ') || 'none').join(' / ')}.`, '',
    `## 7. Real-window arm 5b (Amendment 1.2; report only; the precise-orbit windows of the accuracy table, 72 h fit with and without the pre-fit correction)`, ...(fs.existsSync(path.join(RESULTS, 'real-windows.json')) ? realWindowLines(JSON.parse(fs.readFileSync(path.join(RESULTS, 'real-windows.json'), 'utf8'))) : ['unmeasured (no real-windows.json): LARES, Starlette, Ajisai and Jason-3 are reported unmeasured, never filled.']), '',
    `## 6. The cost (item 7; per object, measured in this harness; upper bounds for a compiled implementation)`, `| Regime | Terms P1 / P1N / P2 | Stored floats P1 / P1N / P2 (analytic J2^2) | Bytes all | Table build (ms, median of 50) | Per epoch P1 / all (us) | Flight of 65 epochs (ms) | Within (below ${WITHIN_MS} ms and ${MODULE_TAIL_BYTES} bytes) |`, `| --- | --- | --- | --: | --: | --- | --: | --- |`,
    ...regimes.map((r) => (r.cost.state === 'measured' ? `| ${r.regime} | ${r.cost.terms.P1} / ${r.cost.terms.P1N} / ${r.cost.terms.P2} | ${r.cost.storedFloats.P1} / ${r.cost.storedFloats.P1N} / ${r.cost.storedFloats.P2} (${r.cost.storedFloats.analyticJ2SecondOrder}) | ${r.cost.bytes.all} | ${f(r.cost.buildMsMedian, 3)} | ${f(r.cost.perEpochP1Ms * 1000, 2)} / ${f(r.cost.perEpochAllMs * 1000, 2)} | ${f(r.cost.flight65Ms, 3)} | ${r.cost.within ? 'within' : 'OVER'} |` : `| ${r.regime} | ${r.cost.state} | | | | | | |`)), `Fit time: the terms sit at the output step and add the per-epoch cost to each iteration's residual evaluation and nothing else; warm refresh: one table build when the mean i or a moves.`, '',
    `## For the coordinator: the module record${summary.verdict === 'worth a module record, with the stated gain' ? '' : ' (not warranted on this verdict; stated in case the finding is reconsidered)'}`, `- Title: ${moduleRecord.title}`, `- Terms: ${moduleRecord.terms}`, `- The measured gain: ${gain.join('; ')}`, `- The e >= 0.05 identity questions:`, ...moduleRecord.eGte005Questions.map((q) => `  - ${q}`), ''].join('\n');
  fs.writeFileSync(path.join(outDir, 'README.md'), md);
  return out;
}
if (args.table) { const t = table(args.out ?? RESULTS); console.log(JSON.stringify(t.summary, null, 1)); process.exit(0); }

if (args.check) {
  let failures = 0;
  const check = (ok, line) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failures += 1; };
  const git = (...a) => execFileSync('git', ['-C', REPO, ...a]).toString('utf8').trim();
  const rows = readRows(RESULTS);
  const regSha = git('log', '--reverse', '--format=%H', '--', REGISTRATION).split('\n')[0];
  const regAt = Date.parse(git('show', '-s', '--format=%cI', regSha));
  const first = rows.map((r) => r.createdUtc).sort()[0];
  check(rows.length > 0 && regAt < Date.parse(first), `registration ${regSha.slice(0, 8)} (${git('show', '-s', '--format=%cI', regSha)}) precedes the first of ${rows.length} rows (${first})`);
  check(rows.every((r) => r.sdnAp?.bundleSha256 === PIN.sdnAp.bundleSha256 && r.sdnAp?.canonicalSha256 === PIN.sdnAp.canonicalSha256 && r.ffm?.wasmSha256 === PIN.ffm.wasmSha256 && r.modulesCommit === PIN.modulesCommit), `every row on sdn-ap ${PIN.sdnAp.version} (bundle ${PIN.sdnAp.bundleSha256.slice(0, 12)}, canonical ${PIN.sdnAp.canonicalSha256.slice(0, 12)}), ffm ${PIN.ffm.version} (${PIN.ffm.wasmSha256.slice(0, 12)}), modules ${PIN.modulesCommit.slice(0, 9)}`);
  check(rows.every((r) => [2, 3, 4, 5].every((l) => Math.abs(r.coefficients.C[l] - C_REGISTERED[l]) <= 1e-12 * Math.abs(C_REGISTERED[l]))), `every row read the registered coefficients C20..C50 from the pinned egm96_data.h`);
  const size = sizeTable();
  check(size.matchesRegistration && !size.shortcutReachable, `the size table reproduces from cells.json (${size.source.sha256.slice(0, 12)}) and equals the registered figures; above the ${size.floorPct} % floor at day 3: ${size.aboveFloorDay3.join(', ')}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'j2-j5-short-period-'));
  const t = table(tmp);
  check(['table.json', 'README.md'].every((n) => fs.existsSync(path.join(RESULTS, n)) && fs.readFileSync(path.join(tmp, n)).equals(fs.readFileSync(path.join(RESULTS, n)))), `results/ap-truth/j2-j5-short-period/table.json and README.md reproduce from the rows`);
  fs.rmSync(tmp, { recursive: true, force: true });
  const cells = t.regimes.flatMap((r) => [r.main, ...r.grid]), flown = cells.filter((c) => c.state === 'flown');
  const stepOk = (s) => s && 'rmsM' in s.share && ('lo' in s.share) && s.difference && 'rmsM' in s.difference && s.reading;
  check(cells.every((c) => c.state !== 'unmeasured') && flown.every((c) => FSTEPS.every((s) => stepOk(c.forward[s])) && STEPS.every((s) => stepOk(c.inArc[s])) && c.constants && c.constants.N0 && c.constants.R0 && c.prefit?.P1F?.plane && c.prefit?.['P1F+P1N']?.plane), `every registered cell (${cells.length}; ${flown.length} flown, ${cells.filter((c) => c.state === 'below the perigee floor').length} below the perigee floor, ${cells.filter((c) => c.state === 'error').length} errors) carries the forward m = 0 share before and after each post-fit and pre-fit step and the in-arc post-fit steps, with intervals or no interval, a reading, the pre-fit plane change, and N0 and R0 against their predictions`);
  check(t.regimes.every((r) => r.main.state !== 'flown' || (r.main.v1 && r.main.p2)), `every flown e 0.001 cell carries V1 and the P2 identification (${t.regimes.filter((r) => r.main.v1?.validated).length} validated of ${t.regimes.filter((r) => r.main.state === 'flown').length})`);
  const windowsFlown = t.regimes.reduce((s, r) => s + r.windows.flown, 0), windowsMissing = t.regimes.flatMap((r) => r.windows.states.map((s, k) => (s === 'unmeasured' ? `${r.regime}|${k}` : null)).filter(Boolean));
  check(windowsMissing.length === 0 && t.regimes.every((r) => r.windows.flown === 0 || LEADS_H.every((h) => r.windows.leads[h].steps.before && WSTEPS.slice(1).every((s) => r.windows.leads[h].differences[s]))), `every registered end-to-end window carries a row (${windowsFlown} of ${LOW.length * WINDOWS} flown${windowsMissing.length ? `; unmeasured: ${windowsMissing.join(', ')}` : ''}) with the day-1/3/7 errors before and after each post-fit and pre-fit step and the paired differences`);
  const real = fs.existsSync(path.join(RESULTS, 'real-windows.json')) ? JSON.parse(fs.readFileSync(path.join(RESULTS, 'real-windows.json'), 'utf8')) : null;
  check(true, `real-window arm 5b (report only): ${real ? real.regimes.map((r) => `${r.regime}: ${r.state}`).join('; ') : 'unmeasured'}`);
  check(t.regimes.every((r) => r.cost.state === 'measured' && Number.isFinite(r.cost.flight65Ms)), `every regime carries its cost line (within: ${t.summary.costWithin})`);
  check(['worth a module record, with the stated gain', 'not worth the bytes and fit time', 'undecided'].includes(t.summary.verdict), `verdict: ${t.summary.verdict} (${CITE.reduced} reduced ${t.summary.reduced[CITE.reduced].length}, best case per cell ${Object.values(t.summary.bestStep).length ? t.regimes.filter((r) => t.summary.counted.includes(r.regime) && /^reduced/.test(r.main.forward[t.summary.bestStep[r.regime]].reading)).length : 0} of ${t.summary.counted.length} counted; post-fit P1 + P1N reduced ${t.summary.reduced['P1+P1N'].length}; N0 explained in ${t.summary.n0Explained.length}; end-to-end day 1 moved better in ${t.summary.endToEndMovedBetter[24][CITE.reduced].length}; multiplicity ${t.summary.multiplicity.observedMoved} moved of ${t.summary.multiplicity.tests} tests, ${f(t.summary.multiplicity.expectedFalseMoved, 2)} expected by chance)${t.summary.blocks.length ? `; blocked by: ${t.summary.blocks.join('; ')}` : ''}`);
  check(t.summary.selfTest?.pass === true, `the Hill-response self-test passes`);
  console.log(failures ? `FAIL (${failures})` : 'PASS');
  process.exit(failures ? 1 : 0);
}
