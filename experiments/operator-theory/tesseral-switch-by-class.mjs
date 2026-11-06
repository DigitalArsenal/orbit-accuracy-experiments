// TESSERAL-SWITCH-BY-CLASS.md: the 0.6.4 validation of the tesseral switch by orbit class against 0.6.3, in the all-regimes frame (the
// validation cells flown on both dists, three-way reading), the catalog budget on persistent instances (1,000 seeded records, one worker
// cold, 8 workers warm, peak memory) and the identity set (seeded sets and the published examples on both dists).
//   SDN_MODULES_ROOT=<the -pin clone with the 0.6.4 dist> SDNAP_BASE_WASM=<the 0.6.3 dist> node tesseral-switch-by-class.mjs --run [--shard k/n] [--catalog]
//   node tesseral-switch-by-class.mjs --table     node tesseral-switch-by-class.mjs --check
// Every state comes from a module (propagator/sdn-ap through propagator/sdn-ap/test/lib/heo-model-truth.mjs and ocm.mjs; the reference
// from propagator/ffm inside that harness); this file moves bytes, times calls and does the registered arithmetic.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const HERE = path.dirname(new URL(import.meta.url).pathname), REPO = path.resolve(HERE, '../..');
const RESULTS = path.join(REPO, 'results/ap-truth/tesseral-switch-by-class');
const LANDED = path.join(REPO, 'results/ap-truth/tesseral-all-regimes');
const EXAMPLES = path.join(REPO, 'results/ap-truth/compare/examples');
const REGISTRATION = 'experiments/operator-theory/TESSERAL-SWITCH-BY-CLASS.md';
export const PIN = {
  base: { version: '0.6.3', wasmSha256: 'aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e', modulesCommit: '03ee8623437f8c85900cabc0cc2a35b9288f4e36' },
  // The 0.6.4 build: the one build's whole-file SHA-256 before signing (every row was flown on it) and the SDK canonical module hash
  // (sds.* custom sections stripped, what the signature covers and what the signed dist shares with the unsigned build); the bundle
  // (signed whole-file) hash is stated when the dist is signed.
  next: { version: '0.6.4', preSignSha256: 'e245de29ea050b08244dc9d69fd892ad2473699843b92988fd34a47a466b15f8', canonicalSha256: 'fd1ef4682edc68836d27fdb1f606a45b22bb3605354c55312287f87771a804b5', bundleSha256: 'e98b63558d84cfd3b8509f4c4c640502e38f81cc05a0e0277fcffa7da97cf51d', signer: 'module-owner-2026-10-15' },
  ffm: { version: '2.2.1', wasmSha256: 'a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4' },
};
export const BUDGET = { coldMedianMs: 100, warmWallMs: 5000, warmMsPerRecordPerWorker: 40, memoryBytes: 512 * 1024 * 1024, workers: 8, records: 1000 };
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const RUNNER = sha256(fs.readFileSync(new URL(import.meta.url)));
const RE_KM = 6378.135, DAY = 86400000, EPOCH = '2026-10-29T00:00:00', PERIGEE_FLOOR_KM = 200;
export const REGIMES = [
  ['Starlette', 13.82, 49.8], ['Ajisai', 12.44, 50.0], ['LARES', 12.55, 69.5], ['Jason-3', 12.81, 66.0], ['Sentinel-3', 14.27, 98.6], ['CryoSat-2', 14.52, 92.0],
  ['LAGEOS-1', 6.39, 109.8], ['LAGEOS-2', 6.47, 52.6], ['Etalon', 2.13, 64.9], ['GPS', 2.005, 55.0], ['Galileo', 1.70, 56.0], ['GLONASS', 2.13, 64.8],
  ['IGSO', 1.0027, 55.0], ['QZSS', 1.0027, 40.0], ['GEO', 1.0027, 0.1], ['Molniya', 2.006, 63.4, 0, 270], ['GTO', 2.40, 27.0, 0, 180],
].map(([name, n, i, raan = 0, argp = 0]) => ({ name, n, i, raan, argp }));
export const THEMIS_D = { name: 'THEMIS D', n: 1.0499037196959449, i: 8.132697128525981, raan: 47.85625519596603, argp: 68.66350938631257 };
const ALL = [...REGIMES, THEMIS_D];
const semimajorKm = (n) => Math.cbrt(398600.4418 / ((n * 2 * Math.PI / 86400) ** 2));
const perigeeKm = (n, e) => semimajorKm(n) * (1 - e) - RE_KM;
export const arcDays = (n) => (n >= 6 ? 3 : n >= 1.5 ? 6 : 10);
export const gridSeconds = (n) => Math.round(86400 / n / 64);
/** The module's resonance class of a mean motion in rev/day (resonance.inc band_of, rad/min; SPEC 6 bands). */
export const bandOf = (revPerDay) => { const n = revPerDay * 2 * Math.PI / 1440; if (n > 0.0035003818 && n < 0.0052505727) return 1; if (n >= 0.0070007636 && n <= 0.0105011454) return 2; if (n > 0.0105011454 && n <= 0.015751718) return 3; if (n >= 0.0052505727 && n <= 0.007875859) return 4; return 0; };
export const WIDE_E = { nonResonant: 0.05, resonant: 0.3 };
export const wideE = (cls) => (cls === 0 ? WIDE_E.nonResonant : WIDE_E.resonant);
/** The band 0.6.4 moves: class 0 with 0.05 < e <= 0.3. */
export const inBand = (n, e) => bandOf(n) === 0 && e > WIDE_E.nonResonant && e <= WIDE_E.resonant;
/** The validation cells (none among the diagnosis's 23) and the in-band published cells (the all-regimes table's class 0 cells with 0.05 < e <= 0.3). */
export const VALIDATION = [['Starlette', [0.07, 0.15, 0.05, 0.1]], ['Ajisai', [0.07, 0.15]], ['LARES', [0.07, 0.15, 0.05, 0.1]], ['Jason-3', [0.07, 0.15, 0.05, 0.1]], ['Sentinel-3', [0.07, 0.15, 0.05, 0.1]], ['CryoSat-2', [0.07, 0.15, 0.05, 0.1]], ['LAGEOS-1', [0.07, 0.15]], ['LAGEOS-2', [0.07, 0.15]]].flatMap(([regime, es]) => es.map((e) => `${regime}|${e}`));
export const PUBLISHED_IN_BAND = ['Starlette|0.1', 'Ajisai|0.1', 'LARES|0.1', 'Jason-3|0.1', 'LAGEOS-1|0.1', 'LAGEOS-1|0.2', 'LAGEOS-2|0.1', 'LAGEOS-2|0.2'];
export const PROBE_CELLS = ['Ajisai|0.05', 'Ajisai|0.1', 'LAGEOS-1|0.05', 'LAGEOS-1|0.1', 'LAGEOS-1|0.2', 'LAGEOS-2|0.05', 'LAGEOS-2|0.1', 'LAGEOS-2|0.2', 'Etalon|0.05', 'Etalon|0.1', 'Etalon|0.2', 'GLONASS|0.05', 'GLONASS|0.1', 'GLONASS|0.2', 'GPS|0.05', 'GPS|0.1', 'GPS|0.2', 'Molniya|0.001', 'Molniya|0.01', 'Molniya|0.05', 'Molniya|0.1', 'Molniya|0.2', 'Molniya|0.29'];
export function cells() {
  const keys = [...new Set([...VALIDATION, ...PUBLISHED_IN_BAND])];
  return keys.map((key) => { const [regime, es] = key.split('|'); const r = REGIMES.find((x) => x.name === regime); const e = Number(es); return { key, regime, e, n: r.n, i: r.i, raan: r.raan, argp: r.argp, cls: bandOf(r.n), arcDays: arcDays(r.n), perigeeKm: perigeeKm(r.n, e), validation: VALIDATION.includes(key) && !PROBE_CELLS.includes(key), publishedInBand: PUBLISHED_IN_BAND.includes(key), probeCell: PROBE_CELLS.includes(key) }; });
}
/** The identity set: every regime and THEMIS D at the registered eccentricities above the perigee floor. */
export const IDENTITY_E = [0.001, 0.01, 0.05, 0.1, 0.2, 0.3, 0.31, 0.5];
export function identityItems() { return ALL.flatMap((r) => IDENTITY_E.map((e) => ({ name: r.name, n: r.n, i: r.i, raan: r.raan, argp: r.argp, e, cls: bandOf(r.n), inBand: inBand(r.n, e), perigeeKm: perigeeKm(r.n, e) }))); }
/** The 1,000 catalog records (TESSERAL-SWITCH-BY-CLASS.md P2): a fixed-seed generator; classes band / above / outside. */
export function catalogElements() {
  let s = 20261106 >>> 0;
  const rnd = () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const uni = (a, b) => a + (b - a) * rnd();
  const eMax = (n) => 1 - (RE_KM + PERIGEE_FLOOR_KM + 5) / semimajorKm(n);
  const out = [];
  const push = (klass, n, e, i) => out.push({ k: out.length, klass, n, e, i, raan: uni(0, 360), argp: uni(0, 360), ma: uni(0, 360), cls: bandOf(n) });
  while (out.filter((x) => x.klass === 'band').length < 500) { const n = uni(6.4, 14.5), hi = Math.min(0.3, eMax(n)); if (hi <= 0.051) continue; push('band', n, uni(0.0501, hi), uni(10, 110)); }
  while (out.filter((x) => x.klass === 'above').length < 250) { const n = uni(1.05, 2.5), hi = Math.min(0.8, eMax(n)); if (hi <= 0.311) continue; push('above', n, uni(0.31, hi), uni(5, 90)); }
  while (out.filter((x) => x.klass === 'outside').length < 125) { const n = uni(6.4, 15.5); if (bandOf(n) !== 0) continue; push('outside', n, uni(0.0005, 0.0499), uni(10, 110)); }
  while (out.filter((x) => x.klass === 'outside').length < 250) { const n = rnd() < 0.5 ? uni(0.81, 1.20) : uni(1.61, 2.40); if (bandOf(n) === 0) continue; const hi = Math.min(0.3, eMax(n)); if (hi <= 0.051) continue; push('outside', n, uni(0.0501, hi), uni(5, 90)); }
  return out;
}
const readJsonl = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const readRows = () => readJsonl(RESULTS, /^rows-\d+\.jsonl$/);
const landedRows = () => readJsonl(LANDED, /^rows-\d+\.jsonl$/).filter((r) => (r.arm ?? 'primary') === 'primary');
const median = (v) => { const s = [...v].sort((a, b) => a - b); const k = s.length >> 1; return s.length ? (s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2) : NaN; };
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
const roughness = (series) => { const d2 = []; for (let k = 1; k + 1 < series.length; k += 1) d2.push(Math.hypot(...[0, 1, 2].map((ax) => series[k + 1][ax] - 2 * series[k][ax] + series[k - 1][ax]))); return median(d2); };
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
const fixtureOf = (r0, e) => ({ name: `${r0.name}|${e}`, n: r0.n, e, i: r0.i, raan: r0.raan, argp: r0.argp, ma: 0, drag: false, thirdBody: true, field: [31, 31], forces: [31, 20], fitDays: arcDays(r0.n), hourly: true, gridMinutes: gridSeconds(r0.n) / 60, forecastDays: 1, referenceTolerance: 1e-12, referenceMaxStep: 300 });
const PRODUCER = (v) => Buffer.from(`com.spacedatanetwork.sdn-ap-propagator ${v}`);
/** The payload with PRODUCER's version read as the base version (fit.e2e.mjs's reading). */
const asBase = (bytes, nextVersion) => { const b = Buffer.from(bytes); const from = PRODUCER(nextVersion), to = PRODUCER(PIN.base.version); for (let at = b.indexOf(from); at >= 0; at = b.indexOf(from, at + 1)) to.copy(b, at); return b; };
const firstDiff = (x, y) => { if (x.length !== y.length) return { lengths: [x.length, y.length] }; for (let k = 0; k < x.length; k += 1) if (x[k] !== y[k]) return { byte: k }; return null; };

async function moduleLibs(MOD) {
  const req = createRequire(path.join(MOD, 'propagator/sdn-ap/package.json'));
  const { createStandaloneHarness } = await import(pathToFileURL(req.resolve('space-data-module-sdk/testing/isomorphic')).href);
  const { pcfOutputFrame } = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/PCF/pcfOutputFrame.js')).href);
  const { OEM } = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/OEM/OEM.js')).href);
  const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
  const O = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/test/lib/ocm.mjs')).href);
  return { createStandaloneHarness, pcfOutputFrame, OEM, fb, O };
}

if (!isMainThread) {
  // A catalog worker (P2): one persistent harness; pass 1 loads its records (each to its epoch plus one minute), pass 2 refreshes them to the
  // epoch plus one day; per-record wall times, refusals and the wasm memory after each pass.
  const { MOD, wasm, records, epochs } = workerData;
  const L = await moduleLibs(MOD);
  const h = await L.createStandaloneHarness('browser', wasm, { surface: 'direct' });
  const mem = () => (h.memory ?? h.instance?.exports?.memory)?.buffer?.byteLength ?? null;
  let refused = 0;
  const fly = async (set, epoch) => { const r = await h.invoke({ methodId: 'propagate', inputs: L.O.flight([set], { output: { EPOCHS: [epoch], FRAME: L.pcfOutputFrame.GCRF } }) }); if (r.statusCode !== 0) refused += 1; };
  const each1 = [], each2 = [];
  const t0 = performance.now();
  for (const set of records) { const a = performance.now(); await fly(new Uint8Array(set), epochs.cold); each1.push(performance.now() - a); }
  const t1 = performance.now(), mem1 = mem();
  for (const set of records) { const a = performance.now(); await fly(new Uint8Array(set), epochs.warm); each2.push(performance.now() - a); }
  const t2 = performance.now(), mem2 = mem();
  parentPort.postMessage({ loadMs: t1 - t0, refreshMs: t2 - t1, each1, each2, refused, memoryAfterLoad: mem1, memoryAfterRefresh: mem2 });
} else {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
  if (args.run) await run(args);
  if (args.table) { const t = table(args.out ?? RESULTS); console.log(JSON.stringify(t.summary)); process.exit(0); }
  if (args.check) check();
}

async function run(args) {
  const MOD = process.env.SDN_MODULES_ROOT;
  if (!MOD) throw new Error('SDN_MODULES_ROOT names the modules root with the 0.6.4 dist');
  const nextWasm = path.join(MOD, 'propagator/sdn-ap/dist/isomorphic/module.wasm'), ffmWasm = path.join(MOD, 'propagator/ffm/dist/isomorphic/module.wasm');
  const baseWasm = process.env.SDNAP_BASE_WASM;
  if (!baseWasm) throw new Error('SDNAP_BASE_WASM names the 0.6.3 dist');
  const nextSha = sha256(fs.readFileSync(nextWasm)), baseSha = sha256(fs.readFileSync(baseWasm));
  if (baseSha !== PIN.base.wasmSha256) throw new Error(`${baseWasm} is not sdn-ap ${PIN.base.version}`);
  if (nextSha === PIN.base.wasmSha256) throw new Error('the 0.6.4 dist equals the 0.6.3 dist');
  if (sha256(fs.readFileSync(ffmWasm)) !== PIN.ffm.wasmSha256) throw new Error(`${ffmWasm} is not ffm ${PIN.ffm.version}`);
  const nextVersion = JSON.parse(fs.readFileSync(path.join(MOD, 'propagator/sdn-ap/plugin-manifest.json'), 'utf8')).version;
  if (nextVersion !== PIN.next.version) throw new Error(`plugin-manifest names ${nextVersion}, the record ${PIN.next.version}`);
  const modulesHead = execFileSync('git', ['-C', MOD, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  process.env.SDNAP_WASM = nextWasm;
  process.env.SDN_AP_HEO_CACHE = process.env.SDN_AP_HEO_CACHE ?? '/Users/tj/software/terrain-work/body-look/switch/heo-cache';
  const { runModelTruth } = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/test/lib/heo-model-truth.mjs')).href);
  const L = await moduleLibs(MOD);
  const argvSave = process.argv; process.argv = process.argv.slice(0, 2);
  const AR = await import(pathToFileURL(path.join(HERE, 'tesseral-all-regimes.mjs')).href);
  process.argv = argvSave;
  const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
  if (SHARDS > 4) throw new Error('at most 4 shards');
  fs.mkdirSync(RESULTS, { recursive: true });
  const outFile = path.join(RESULTS, `rows-${SHARD}.jsonl`);
  const done = new Set(readRows().map((r) => r.id));
  // Amendment 1: the pins under `pins` (a cell row's `base` and `next` are its flights on the two builds).
  const stamp = () => ({ createdUtc: new Date().toISOString(), runner: RUNNER, modulesHead, pins: { base: { ...PIN.base }, next: { version: nextVersion, wasmSha256: nextSha }, ffm: PIN.ffm }, shard: SHARD });
  const emit = (row) => { fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`); };
  const hNext = await L.createStandaloneHarness('browser', nextWasm, { surface: 'command' });
  const hBase = await L.createStandaloneHarness('browser', baseWasm, { surface: 'command' });
  const flyRaw = async (h, set, epochs, frame = L.pcfOutputFrame.GCRF) => { const r = await h.invoke({ methodId: 'propagate', inputs: L.O.flight([set], { output: { EPOCHS: epochs, FRAME: frame } }) }); if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${r.errorMessage}`); return Buffer.from(r.outputs.find((o) => o.portId === 'ephemeris').payload); };
  const linesOf = (bytes) => L.OEM.getRootAsOEM(new L.fb.ByteBuffer(bytes)).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES;
  const flyStates = async (h, set, epochs) => linesOf(await flyRaw(h, set, epochs)).map((l) => [l.X, l.Y, l.Z]);
  const slim = (x) => ({ samples: x.samples, rmsM: x.rmsM, maxM: x.maxM, roughM: x.roughM, fitRmsKm: x.fitRmsKm, conditioned: x.conditioned, sharesInQuadratureM: x.sharesInQuadratureM, basis: x.basis, jackknife: x.jackknife, shares: x.shares, families: x.families.slice(0, 12) });
  const landed = landedRows();
  const items = [...cells().map((c) => ({ kind: 'cell', id: `cell:${c.key}`, c })), ...identityItems().map((x) => ({ kind: 'identity', id: `identity:${x.name}|${x.e}`, x })), ...fs.readdirSync(EXAMPLES).filter((n) => n.endsWith('.ocm')).sort().map((n) => ({ kind: 'example', id: `example:${n.slice(0, -4)}`, exampleId: n.slice(0, -4) }))].filter((_, k) => k % SHARDS === SHARD);
  // One cell on one build in the all-regimes frame (tesseral-diagnosis.mjs's probe arm, unchanged in method).
  const flyCell = async (c, r0, wasm, h) => {
    const fixture = { ...fixtureOf(r0, c.e), modulePath: wasm };
    const r = await runModelTruth(fixture);
    const set = Buffer.from(r.omm, 'base64');
    const profile = r.profile, tau = profile.map((p) => p.h / 24), rtn = profile.map((p) => [p.r, p.t, p.n]), err3 = profile.map((p) => p.e);
    const gridMinutes = gridSeconds(c.n) / 60;
    const epochs = r.referenceStates.map((_, k) => iso(Date.parse(`${r.epoch}Z`) + Math.round((c.arcDays + (k + 1) * gridMinutes / 1440) * DAY)));
    const withCaps = r.flown.map((s) => s.slice(0, 3));
    const zonalOnly = await flyStates(h, L.O.repackOcm(set, (t) => { t.PERTURBATIONS.MAXIMUM_TESSERAL_DEGREE = 0; }), epochs);
    const A = rms(withCaps.map((p, k) => Math.hypot(...p.map((x, ax) => (x - zonalOnly[k][ax]) * 1000))));
    const b = AR.bounds(A);
    const forward = { samples: profile.length, gridSeconds: gridSeconds(c.n), rmsM: rms(err3), maxM: Math.max(...err3), roughM: roughness(rtn), ...AR.attribute(tau, rtn, r.fitted.n, 1, 1 / r.fitted.n) };
    const arcOem = linesOf((await runModelTruth({ ...fixture, fitInput: true })).ephemeris.payload);
    const arcFlown = await flyStates(h, set, arcOem.map((l) => l.EPOCH));
    const arcRtn = arcOem.map((l, k) => AR.rtnOf([arcFlown[k][0] - l.X, arcFlown[k][1] - l.Y, arcFlown[k][2] - l.Z], [l.X, l.Y, l.Z], [l.X_DOT, l.Y_DOT, l.Z_DOT]));
    const arcTau = arcOem.map((l) => (Date.parse(`${l.EPOCH}Z`) - Date.parse(`${arcOem[0].EPOCH}Z`)) / DAY);
    const arcNorm = arcRtn.map((p) => Math.hypot(...p));
    const inArc = { samples: arcRtn.length, rmsM: rms(arcNorm), maxM: Math.max(...arcNorm), fitRmsKm: r.fitted.wrms, ...AR.attribute(arcTau, arcRtn, r.fitted.n, c.arcDays, 1) };
    const v = AR.verdictOf(forward, inArc, b);
    return { fitted: r.fitted, epoch: r.epoch, gridExercised: r.fitted.e > wideE(c.cls), A_m: A, bounds: b, forward: slim(forward), inArc: slim(inArc), ...v, setSha256: sha256(set) };
  };
  for (const it of items) {
    if (done.has(it.id)) continue;
    const t0 = Date.now();
    try {
      if (it.kind === 'cell') {
        const c = it.c, r0 = REGIMES.find((x) => x.name === c.regime);
        if (c.perigeeKm < PERIGEE_FLOOR_KM) { emit({ id: it.id, type: 'cell', ...c, ...stamp(), flown: false, reason: 'below the perigee floor' }); console.log(it.id, 'below the perigee floor'); continue; }
        const base = await flyCell(c, r0, baseWasm, hBase);
        const next = await flyCell(c, r0, nextWasm, hNext);
        const landedRow = landed.find((r) => r.key === c.key && r.flown) ?? null;
        const landedSlim = landedRow ? { verdict: landedRow.verdict, legs: landedRow.legs, forward: { rmsM: landedRow.forward.rmsM, maxM: landedRow.forward.maxM, roughM: landedRow.forward.roughM, tesseralM: landedRow.forward.shares.tesseral.rmsM }, fittedE: landedRow.fitted.e } : null;
        const gridReads = next.gridExercised ? (next.verdict.startsWith('pass') ? 'grid passes' : next.verdict === 'fail (attributed)' ? 'grid fails' : 'grid undecided') : 'grid not exercised (fitted e at or below 0.05)';
        emit({ id: it.id, type: 'cell', ...c, ...stamp(), flown: true, base, next, gridReads, paired: { forwardRmsDeltaM: next.forward.rmsM - base.forward.rmsM, tesseralForwardDeltaM: next.forward.shares.tesseral.rmsM - base.forward.shares.tesseral.rmsM }, landed: landedSlim, seconds: (Date.now() - t0) / 1000 });
        console.log(it.id, `0.6.3 ${base.verdict} -> 0.6.4 ${next.verdict} (${gridReads})`, `fwd RMS ${f(base.forward.rmsM)} -> ${f(next.forward.rmsM)} m`, `tess fwd ${f(base.forward.shares.tesseral.rmsM)} -> ${f(next.forward.shares.tesseral.rmsM)}`, `fitted e ${f(base.fitted.e, 4)} / ${f(next.fitted.e, 4)}`, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
      } else if (it.kind === 'identity') {
        const x = it.x;
        if (x.perigeeKm < PERIGEE_FLOOR_KM) { emit({ id: it.id, type: 'identity', ...x, ...stamp(), flown: false, reason: 'below the perigee floor' }); continue; }
        const set = L.O.seedOcm({ epoch: EPOCH, n: x.n, e: x.e, i: x.i, raan: x.raan, argp: x.argp, ma: 0, tesseral: 31, zonal: 20 });
        const epochs = Array.from({ length: 65 }, (_, k) => iso(Date.parse(`${EPOCH}Z`) + k * 1350000));
        const N = await flyRaw(hNext, set, epochs), B = await flyRaw(hBase, set, epochs);
        const d = firstDiff(asBase(N, nextVersion), B);
        let maxDiffM = 0;
        if (d) { const a = linesOf(N), b = linesOf(B); maxDiffM = Math.max(...a.map((l, k) => Math.hypot(l.X - b[k].X, l.Y - b[k].Y, l.Z - b[k].Z) * 1000)); }
        emit({ id: it.id, type: 'identity', ...x, ...stamp(), flown: true, equal: !d, firstDifference: d, maxPositionDifferenceM: maxDiffM, payloadBytes: B.length, baseSha256: sha256(B), seconds: (Date.now() - t0) / 1000 });
        console.log(it.id, x.inBand ? 'IN BAND' : 'outside', `equal ${!d}`, d ? `max ${f(maxDiffM)} m` : '');
      } else {
        const d = JSON.parse(fs.readFileSync(path.join(EXAMPLES, `${it.exampleId}.json`), 'utf8')), set = new Uint8Array(fs.readFileSync(path.join(EXAMPLES, `${it.exampleId}.ocm`)));
        const me = L.O.ocmOf(set).MEAN_ELEMENTS;
        const t0ms = Date.parse(d.start), epochs = d.epochsSeconds.map((s) => iso(t0ms + 1000 * s));
        const N = await flyRaw(hNext, set, epochs, L.pcfOutputFrame.TEME), B = await flyRaw(hBase, set, epochs, L.pcfOutputFrame.TEME);
        const diff = firstDiff(asBase(N, nextVersion), B);
        emit({ id: it.id, type: 'example', exampleId: it.exampleId, regime: d.regime, n: me.MEAN_MOTION, e: me.ECCENTRICITY, cls: bandOf(me.MEAN_MOTION), inBand: inBand(me.MEAN_MOTION, me.ECCENTRICITY), aboveWide: me.ECCENTRICITY > WIDE_E.resonant, epochs: epochs.length, ...stamp(), flown: true, equal: !diff, firstDifference: diff, payloadBytes: B.length, seconds: (Date.now() - t0) / 1000 });
        console.log(it.id, `equal ${!diff}`, `${epochs.length} epochs`);
      }
    } catch (error) {
      emit({ id: it.id, type: it.kind, ...stamp(), flown: false, error: String(error?.message ?? error).slice(0, 300), seconds: (Date.now() - t0) / 1000 });
      console.log(it.id, 'ERROR', String(error?.message ?? error).slice(0, 200));
    }
  }
  // P2 (--catalog, shard 0, run alone after the cells so no sibling shard loads the host): the catalog on persistent instances, cold (one
  // worker) then warm (8 workers), both dists.
  if (SHARD === 0 && args.catalog) {
    const elements = catalogElements();
    const records = elements.map((x) => L.O.seedOcm({ epoch: EPOCH, n: x.n, e: x.e, i: x.i, raan: x.raan, argp: x.argp, ma: x.ma, tesseral: 31, zonal: 20 }));
    const epochs = { cold: iso(Date.parse(`${EPOCH}Z`) + 60000), warm: iso(Date.parse(`${EPOCH}Z`) + DAY) };
    const classes = elements.map((x) => x.klass);
    // The registered assignment: worker w holds records [125 w, 125 w + 125) in the generator's order (band, above, outside); Amendment 1
    // adds, beside it and report only, the interleaved assignment (record k to worker k mod 8).
    const assign = (W, interleaved) => Array.from({ length: W }, (_, w) => (interleaved ? elements.filter((x) => x.k % W === w).map((x) => x.k) : elements.slice(w * Math.ceil(records.length / W), (w + 1) * Math.ceil(records.length / W)).map((x) => x.k)));
    const runWorkers = (wasm, W, interleaved = false) => { const ks = assign(W, interleaved); const t0 = performance.now(); return Promise.all(ks.map((mine, w) => new Promise((resolve, reject) => { const worker = new Worker(new URL(import.meta.url), { workerData: { MOD, wasm, records: mine.map((k) => records[k].buffer.slice(records[k].byteOffset, records[k].byteOffset + records[k].byteLength)), epochs } }); worker.on('message', (m) => resolve({ ...m, w, ks: mine })); worker.on('error', reject); }))).then((rs) => ({ wallMs: performance.now() - t0, workers: rs })); };
    const perClass = (rs, key) => Object.fromEntries(['band', 'above', 'outside'].map((k) => [k, median(rs.flatMap((r) => r[key].filter((_, j) => classes[r.ks[j]] === k)))]));
    for (const [label, wasm, sha] of [['next', nextWasm, nextSha], ['base', baseWasm, baseSha]]) {
      const id = `catalog:${label}`;
      if (done.has(id)) continue;
      const startedUtc = new Date().toISOString();
      const cold = await runWorkers(wasm, 1);
      const warm = await runWorkers(wasm, BUDGET.workers);
      const inter = await runWorkers(wasm, BUDGET.workers, true);
      const w1 = cold.workers[0];
      const row = { id, type: 'catalog', build: label, wasmSha256: sha, ...stamp(), startedUtc, host: { cpus: os.cpus().length, model: os.cpus()[0]?.model, totalMemGB: +(os.totalmem() / 2 ** 30).toFixed(0), node: process.version },
        records: records.length, classes: { band: classes.filter((c) => c === 'band').length, above: classes.filter((c) => c === 'above').length, outside: classes.filter((c) => c === 'outside').length },
        cold: { workers: 1, medianMs: median(w1.each1), meanMs: w1.loadMs / records.length, perClassMedianMs: perClass([w1], 'each1'), refused: w1.refused, memoryAfterLoad: w1.memoryAfterLoad, refreshOnOneWorker: { medianMs: median(w1.each2), wallMs: w1.refreshMs, memoryAfterRefresh: w1.memoryAfterRefresh, perClassMedianMs: perClass([w1], 'each2') }, withinTarget: median(w1.each1) <= BUDGET.coldMedianMs },
        warm: { workers: BUDGET.workers, loadWallMsSlowestWorker: Math.max(...warm.workers.map((r) => r.loadMs)), refreshWallMsSlowestWorker: Math.max(...warm.workers.map((r) => r.refreshMs)), refreshMsPerRecordPerWorker: Math.max(...warm.workers.map((r) => r.refreshMs)) / Math.ceil(records.length / BUDGET.workers), refreshMedianMs: median(warm.workers.flatMap((r) => r.each2)), perClassMedianMs: perClass(warm.workers, 'each2'), refused: warm.workers.reduce((s, r) => s + r.refused, 0), withinTarget: Math.max(...warm.workers.map((r) => r.refreshMs)) <= BUDGET.warmWallMs },
        warmInterleaved: { reportOnly: true, assignment: 'record k to worker k mod 8', loadWallMsSlowestWorker: Math.max(...inter.workers.map((r) => r.loadMs)), refreshWallMsSlowestWorker: Math.max(...inter.workers.map((r) => r.refreshMs)), refreshMsPerRecordPerWorker: Math.max(...inter.workers.map((r) => r.refreshMs)) / Math.ceil(records.length / BUDGET.workers), perClassMedianMs: perClass(inter.workers, 'each2'), refused: inter.workers.reduce((s, r) => s + r.refused, 0), peakBytesPerWorker: Math.max(...inter.workers.map((r) => Math.max(r.memoryAfterLoad ?? 0, r.memoryAfterRefresh ?? 0))) },
        memory: { peakBytesPerWorker: Math.max(...warm.workers.map((r) => Math.max(r.memoryAfterLoad ?? 0, r.memoryAfterRefresh ?? 0)), w1.memoryAfterLoad ?? 0, w1.memoryAfterRefresh ?? 0), perWorkerAfterRefresh: warm.workers.map((r) => r.memoryAfterRefresh), withinTarget: null },
        budget: BUDGET };
      row.memory.withinTarget = row.memory.peakBytesPerWorker <= BUDGET.memoryBytes;
      emit(row);
      console.log(id, `cold median ${f(row.cold.medianMs, 1)} ms (${row.cold.withinTarget ? 'within' : 'OVER'} 100)`, `warm refresh slowest worker ${f(row.warm.refreshWallMsSlowestWorker, 0)} ms (${row.warm.withinTarget ? 'within' : 'OVER'} 5000; interleaved ${f(row.warmInterleaved.refreshWallMsSlowestWorker, 0)} ms)`, `peak ${(row.memory.peakBytesPerWorker / 2 ** 20).toFixed(0)} MB (${row.memory.withinTarget ? 'within' : 'OVER'} 512)`, `refused ${row.cold.refused}/${row.warm.refused}`);
    }
  }
  process.exit(0);
}

export function table(outDir = RESULTS) {
  const rows = readRows();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const landed = landedRows();
  const resolutionOf = (regime) => { const r = landed.find((x) => x.key === `${regime}|0.001` && x.convergenceMaxM != null); return r ? 2 * r.convergenceMaxM : null; };
  const cellRows = cells().map((c) => { const r = byId.get(`cell:${c.key}`); if (!r) return { ...c, state: 'unmeasured' }; if (!r.flown) return { ...c, state: r.reason ?? 'error', error: r.error, row: r }; const res = resolutionOf(c.regime); const d = r.paired.forwardRmsDeltaM; const pairedRead = res === null ? (d < 0 ? 'better' : d > 0 ? 'worse' : 'equal') : Math.abs(d) <= res ? 'equal' : d < 0 ? 'better' : 'worse'; return { ...c, state: r.next.verdict, gridReads: r.gridReads, pairedRead, resolutionM: res, row: r }; });
  const flown = cellRows.filter((c) => c.row?.flown);
  const exercised = flown.filter((c) => c.row.next.gridExercised);
  const p1 = { noFail: exercised.every((c) => c.row.next.verdict !== 'fail (attributed)'), passKept: flown.filter((c) => c.row.base.verdict.startsWith('pass')).every((c) => c.row.next.verdict.startsWith('pass')), notWorse: exercised.every((c) => c.row.next.forward.rmsM <= c.row.base.forward.rmsM || c.row.next.verdict.startsWith('pass')), unmeasured: cellRows.filter((c) => c.state === 'unmeasured' || c.error).map((c) => c.key) };
  p1.holds = p1.noFail && p1.passKept && p1.notWorse && p1.unmeasured.length === 0;
  const verdictCount = (which) => Object.fromEntries(['pass', 'undecided', 'fail'].map((k) => [k, flown.filter((c) => { const v = c.row[which].verdict; return k === 'pass' ? v.startsWith('pass') : k === 'fail' ? v === 'fail (attributed)' : !v.startsWith('pass') && v !== 'fail (attributed)'; }).length]));
  const cat = { next: byId.get('catalog:next') ?? null, base: byId.get('catalog:base') ?? null };
  const p2 = cat.next ? { cold: cat.next.cold.withinTarget, warm: cat.next.warm.withinTarget, memory: cat.next.memory.withinTarget, refused: cat.next.cold.refused + cat.next.warm.refused } : { cold: null, warm: null, memory: null };
  p2.holds = Boolean(cat.next) && p2.cold && p2.warm && p2.memory && p2.refused === 0;
  const ident = identityItems().map((x) => { const r = byId.get(`identity:${x.name}|${x.e}`); return { ...x, row: r ?? null, state: !r ? 'unmeasured' : !r.flown ? (r.reason ?? 'error') : r.equal ? 'equal' : 'differs' }; });
  const identFlown = ident.filter((x) => x.row?.flown);
  const exampleIds = fs.existsSync(EXAMPLES) ? fs.readdirSync(EXAMPLES).filter((n) => n.endsWith('.ocm')).sort().map((n) => n.slice(0, -4)) : [];
  const examples = exampleIds.map((id) => { const r = byId.get(`example:${id}`); return { id, row: r ?? null, state: !r ? 'unmeasured' : !r.flown ? 'error' : r.equal ? 'equal' : 'differs' }; });
  const p3 = { outsideEqual: identFlown.filter((x) => !x.inBand).every((x) => x.row.equal) && examples.filter((x) => x.row?.flown && !x.row.inBand).every((x) => x.row.equal), outsideCount: identFlown.filter((x) => !x.inBand).length, outsideDiffer: identFlown.filter((x) => !x.inBand && !x.row.equal).map((x) => `${x.name}|${x.e}`), inBandListed: identFlown.filter((x) => x.inBand).map((x) => ({ key: `${x.name}|${x.e}`, equal: x.row.equal, maxPositionDifferenceM: x.row.maxPositionDifferenceM })), examplesEqual: examples.filter((x) => x.state === 'equal').length, examplesFlown: examples.filter((x) => x.row?.flown).length, examplesInBand: examples.filter((x) => x.row?.inBand).map((x) => x.id), examplesDiffer: examples.filter((x) => x.state === 'differs').map((x) => x.id), unmeasured: [...ident.filter((x) => x.state === 'unmeasured' || x.row?.error).map((x) => `${x.name}|${x.e}`), ...examples.filter((x) => x.state !== 'equal' && x.state !== 'differs').map((x) => x.id)] };
  p3.holds = p3.outsideEqual && p3.unmeasured.length === 0 && p3.examplesFlown === exampleIds.length && p3.examplesDiffer.length === 0;
  const nextSha = rows.find((r) => r.pins?.next?.wasmSha256)?.pins.next.wasmSha256 ?? null;
  const out = { registration: REGISTRATION, runner: RUNNER, pins: { ...PIN, next: { ...PIN.next, wasmSha256: nextSha, modulesHead: rows.find((r) => r.modulesHead)?.modulesHead ?? null } }, budget: BUDGET, classRule: { bands: 'resonance.inc band_of: 1 one-day (0.8017 to 1.2033 rev/day), 2 half-day (1.6045 to 2.4067), 3 eight-hour (2.4067 to 3.6100), 4 sixteen-hour (1.2033 to 1.8050), 0 none', thresholds: WIDE_E },
    cells: cellRows.map(({ row, ...c }) => ({ ...c, ...(row?.flown ? { fittedE: { base: row.base.fitted.e, next: row.next.fitted.e }, gridExercised: row.next.gridExercised, A_m: row.next.A_m, bounds: row.next.bounds, base: { verdict: row.base.verdict, legs: row.base.legs, rawPass: row.base.rawPass, forward: { rmsM: row.base.forward.rmsM, maxM: row.base.forward.maxM, roughM: row.base.forward.roughM, shares: row.base.forward.shares }, inArc: { rmsM: row.base.inArc.rmsM, maxM: row.base.inArc.maxM, shares: row.base.inArc.shares } }, next: { verdict: row.next.verdict, legs: row.next.legs, rawPass: row.next.rawPass, forward: { rmsM: row.next.forward.rmsM, maxM: row.next.forward.maxM, roughM: row.next.forward.roughM, shares: row.next.forward.shares, families: row.next.forward.families.slice(0, 4) }, inArc: { rmsM: row.next.inArc.rmsM, maxM: row.next.inArc.maxM, shares: row.next.inArc.shares } }, paired: row.paired, landed: row.landed, seconds: row.seconds } : {}) })),
    p1: { ...p1, verdicts: { base: verdictCount('base'), next: verdictCount('next') }, cellsFlown: flown.length, gridExercised: exercised.length },
    catalog: cat, p2, identity: ident.map(({ row, ...x }) => ({ ...x, ...(row?.flown ? { equal: row.equal, firstDifference: row.firstDifference, maxPositionDifferenceM: row.maxPositionDifferenceM, payloadBytes: row.payloadBytes } : {}) })), examples: examples.map(({ row, ...x }) => ({ ...x, ...(row ? { regime: row.regime, n: row.n, e: row.e, cls: row.cls, inBand: row.inBand, aboveWide: row.aboveWide, epochs: row.epochs, equal: row.equal } : {}) })), p3,
    summary: { p1: p1.holds, p2: p2.holds, p3: p3.holds, versionStep: p1.holds && p2.holds && p3.holds, cellsFlown: flown.length, gridPasses: exercised.filter((c) => c.gridReads === 'grid passes').length, gridUndecided: exercised.filter((c) => c.gridReads === 'grid undecided').length, gridFails: exercised.filter((c) => c.gridReads === 'grid fails').length, paired: Object.fromEntries(['better', 'equal', 'worse'].map((k) => [k, exercised.filter((c) => c.pairedRead === k).length])), coldMedianMs: cat.next?.cold.medianMs ?? null, warmRefreshWallMs: cat.next?.warm.refreshWallMsSlowestWorker ?? null, peakMB: cat.next ? +(cat.next.memory.peakBytesPerWorker / 2 ** 20).toFixed(1) : null, identityOutsideEqual: `${identFlown.filter((x) => !x.inBand && x.row.equal).length} of ${p3.outsideCount}`, identityInBandDiffer: `${p3.inBandListed.filter((x) => !x.equal).length} of ${p3.inBandListed.length}`, examplesEqual: `${p3.examplesEqual} of ${p3.examplesFlown}` } };
  const cellLine = (c) => (c.fittedE ? `| ${c.key} | ${c.cls} | ${c.validation ? 'validation' : ''}${c.publishedInBand ? (c.validation ? ', ' : '') + 'published in band' : ''}${c.probeCell ? ' (probe cell)' : ''} | ${f(c.fittedE.base, 4)} / ${f(c.fittedE.next, 4)} (${c.gridExercised ? 'yes' : 'NO'}) | ${c.base.verdict} (${c.base.legs.forward} / ${c.base.legs.inArc}) | ${c.next.verdict} (${c.next.legs.forward} / ${c.next.legs.inArc}) | ${c.gridReads} | ${f(c.base.forward.rmsM)} / ${f(c.base.forward.maxM)} / ${f(c.base.forward.roughM, 3)} -> ${f(c.next.forward.rmsM)} / ${f(c.next.forward.maxM)} / ${f(c.next.forward.roughM, 3)} | ${f(c.bounds.rms)} / ${f(c.bounds.max)} / ${f(c.bounds.rough, 3)} | ${f(c.base.forward.shares.tesseral.rmsM)} -> ${f(c.next.forward.shares.tesseral.rmsM)} [${f(c.next.forward.shares.tesseral.lo?.rmsM)}, ${f(c.next.forward.shares.tesseral.hi?.rmsM)}] | ${f(c.base.inArc.shares.tesseral.rmsM)} -> ${f(c.next.inArc.shares.tesseral.rmsM)} | ${f(c.base.forward.shares.mixed.rmsM)} -> ${f(c.next.forward.shares.mixed.rmsM)} | ${f(c.base.forward.shares.secular.rmsM)} -> ${f(c.next.forward.shares.secular.rmsM)} | ${f(c.paired.forwardRmsDeltaM)} (${c.pairedRead}; resolution ${c.resolutionM === null ? '-' : c.resolutionM.toExponential(1)}) | ${c.landed ? `${c.landed.verdict}, ${f(c.landed.forward.rmsM)} m` : '-'} |` : `| ${c.key} | ${c.cls} | ${c.validation ? 'validation' : ''}${c.publishedInBand ? ' published in band' : ''} | - | ${c.state}${c.error ? ` ${c.error}` : ''} | - | - | - | - | - | - | - | - | - | - |`);
  const catLine = (label, r) => (r ? `| ${label} ${r.wasmSha256.slice(0, 12)} | ${r.startedUtc} | ${f(r.cold.medianMs, 1)} (band ${f(r.cold.perClassMedianMs.band, 1)}, above ${f(r.cold.perClassMedianMs.above, 1)}, outside ${f(r.cold.perClassMedianMs.outside, 1)}) | ${f(r.cold.meanMs, 1)} | ${f(r.cold.refreshOnOneWorker.medianMs, 1)} | ${f(r.warm.loadWallMsSlowestWorker, 0)} | ${f(r.warm.refreshWallMsSlowestWorker, 0)} (${f(r.warm.refreshMsPerRecordPerWorker, 1)} per record per worker; band ${f(r.warm.perClassMedianMs.band, 1)}, above ${f(r.warm.perClassMedianMs.above, 1)}, outside ${f(r.warm.perClassMedianMs.outside, 1)} median) | ${(r.memory.peakBytesPerWorker / 2 ** 20).toFixed(1)} (${r.memory.perWorkerAfterRefresh.map((b) => (b / 2 ** 20).toFixed(0)).join(', ')}) | ${r.cold.refused + r.warm.refused} | cold ${r.cold.withinTarget ? 'within' : 'OVER'} / warm ${r.warm.withinTarget ? 'within' : 'OVER'} / memory ${r.memory.withinTarget ? 'within' : 'OVER'} |` : `| ${label} | unmeasured | - | - | - | - | - | - | - | - |`);
  const md = [
    `# The tesseral switch by orbit class: propagator/sdn-ap 0.6.4 against 0.6.3`, '',
    `Registration: ${REGISTRATION}. Base 0.6.3 dist ${PIN.base.wasmSha256} (modules ${PIN.base.modulesCommit.slice(0, 9)}); 0.6.4 build ${nextSha ?? 'unmeasured'} (the one build's whole file before signing, every row flown on it; modules ${out.pins.next.modulesHead ?? '-'}), SDK canonical module hash ${PIN.next.canonicalSha256} (sds.* stripped, the signed dist's identity), signed bundle ${PIN.next.bundleSha256 ?? 'pending the owner-key signing'}; ffm 2.2.1 ${PIN.ffm.wasmSha256.slice(0, 12)}. Class rule: ${out.classRule.bands}; the grid above e ${WIDE_E.nonResonant} in class 0, above e ${WIDE_E.resonant} in every resonance class.`, '',
    `## Summary`,
    `P1 accuracy: ${p1.holds ? 'HOLDS' : 'DOES NOT HOLD'} (no fail ${p1.noFail}; passes kept ${p1.passKept}; grid not worse ${p1.notWorse}; unmeasured ${p1.unmeasured.join(', ') || 'none'}). Cells flown ${flown.length}, grid exercised on 0.6.4 in ${exercised.length}: grid passes ${out.summary.gridPasses}, undecided ${out.summary.gridUndecided}, fails ${out.summary.gridFails}; paired forward RMS better ${out.summary.paired.better}, equal ${out.summary.paired.equal}, worse ${out.summary.paired.worse}. Verdicts on 0.6.3: pass ${out.p1.verdicts.base.pass}, undecided ${out.p1.verdicts.base.undecided}, fail ${out.p1.verdicts.base.fail}; on 0.6.4: pass ${out.p1.verdicts.next.pass}, undecided ${out.p1.verdicts.next.undecided}, fail ${out.p1.verdicts.next.fail}.`,
    `Where 0.6.4's forward RMS is higher than 0.6.3's (${exercised.filter((c) => c.pairedRead === 'worse').map((c) => `${c.key}: raw ${f(c.row.base.forward.rmsM)} -> ${f(c.row.next.forward.rmsM)} m, tesseral ${f(c.row.base.forward.shares.tesseral.rmsM)} -> ${f(c.row.next.forward.shares.tesseral.rmsM)}, secular ${f(c.row.base.forward.shares.secular.rmsM)} -> ${f(c.row.next.forward.shares.secular.rmsM)}, fit RMS ${f(c.row.base.fitted.wrms * 1000, 1)} -> ${f(c.row.next.fitted.wrms * 1000, 1)} m`).join('; ') || 'no cell'}): the tesseral share fell and the secular share (the fit's forward-day drift, reported beside the tesseral model and never charged to it in the all-regimes line) rose. Tesseral forward share lower on 0.6.4 in ${exercised.filter((c) => c.row.next.forward.shares.tesseral.rmsM < c.row.base.forward.shares.tesseral.rmsM).length} of ${exercised.length} exercised cells.`,
    `P2 catalog budget (0.6.4, persistent instances, 1,000 seeded records: 500 band, 250 above, 250 outside): ${p2.holds ? 'HOLDS' : 'DOES NOT HOLD'}; cold median ${f(out.summary.coldMedianMs, 1)} ms (target 100), warm refresh slowest worker ${f(out.summary.warmRefreshWallMs, 0)} ms (target 5,000), peak ${out.summary.peakMB ?? '-'} MB per worker (target 512), refused ${p2.refused ?? '-'}.`,
    `P3 identity: ${p3.holds ? 'HOLDS' : 'DOES NOT HOLD'}; seeded sets outside the band equal ${out.summary.identityOutsideEqual}${p3.outsideDiffer.length ? ` (differ: ${p3.outsideDiffer.join(', ')})` : ''}; in-band seeded sets differ ${out.summary.identityInBandDiffer} (by construction); published examples equal ${out.summary.examplesEqual} (${exampleIds.length} published)${p3.examplesInBand.length ? ` (in band: ${p3.examplesInBand.join(', ')})` : ' (none in the band)'}; unmeasured ${p3.unmeasured.join(', ') || 'none'}.`,
    `Version step requested: ${out.summary.versionStep ? 'YES' : 'NO'}.`, '',
    `## Validation cells and the in-band published cells (all-regimes frame; each cell fitted and flown on 0.6.3 and on 0.6.4, the reference shared)`,
    `| Cell | Class | Role | Fitted e 0.6.3 / 0.6.4 (grid exercised) | 0.6.3 verdict (legs) | 0.6.4 verdict (legs) | Grid reads | Forward RMS / max / rough 0.6.3 -> 0.6.4 (m) | Bounds | Tesseral share forward 0.6.3 -> 0.6.4 [0.6.4 interval] | Tesseral in-arc | Mixed forward | Secular forward | Paired forward RMS delta (m) | Landed 0.6.3 row |`,
    `| --- | --: | --- | --: | --- | --- | --- | --- | --: | --- | --- | --- | --- | --- | --- |`,
    ...out.cells.map(cellLine), '',
    `## Catalog budget on persistent instances (THEMIS-RIPPLE-FIX.md Amendment 16 targets: cold median <= 100 ms per record on one worker; warm refresh of 1,000 records to a new epoch on 8 workers <= 5 s; peak wasm memory <= 512 MB per worker)`,
    `Host: ${cat.next?.host ? `${cat.next.host.cpus} cores (${cat.next.host.model}), ${cat.next.host.totalMemGB} GB, node ${cat.next.host.node}` : '-'}. Records: seeded AP sets (caps 31 / 20, BTERM 0, AGOM 0, epoch ${EPOCH}); cold = each record's first flight to the epoch + 1 min on a fresh persistent worker; warm = the 8 workers' refresh of their 125 records to the epoch + 1 day after loading them.`,
    `| Build | Started | Cold median ms, one worker (per class) | Cold mean ms | One-worker refresh median ms | 8-worker load, slowest worker ms | 8-worker refresh, slowest worker ms | Peak wasm MB per worker (each after refresh) | Refused | Within budget |`,
    `| --- | --- | --: | --: | --: | --: | --- | --- | --: | --- |`,
    catLine('0.6.4', cat.next), catLine('0.6.3', cat.base), '',
    `Beside it, report only (Amendment 1): the same 8 workers with record k on worker k mod 8 (every worker holds about 62 band, 31 above and 31 outside records): refresh slowest worker ${cat.next?.warmInterleaved ? `${f(cat.next.warmInterleaved.refreshWallMsSlowestWorker, 0)} ms on 0.6.4 (${f(cat.next.warmInterleaved.refreshMsPerRecordPerWorker, 1)} per record per worker; peak ${(cat.next.warmInterleaved.peakBytesPerWorker / 2 ** 20).toFixed(0)} MB)` : '-'}${cat.base?.warmInterleaved ? `, ${f(cat.base.warmInterleaved.refreshWallMsSlowestWorker, 0)} ms on 0.6.3 (peak ${(cat.base.warmInterleaved.peakBytesPerWorker / 2 ** 20).toFixed(0)} MB)` : ''}. The registered assignment above puts the 250 above-e-0.3 records (the grid path 0.6.3 already flies, unchanged by 0.6.4) on two workers alone.`, '',
    `## Identity (seeded sets, caps 31 / 20, 65 epochs over a day in GCRF, 0.6.4 against 0.6.3 with PRODUCER's version read as 0.6.3)`,
    `| Regime | e | Class | Band | Result | Max position difference (m) | $OEM bytes |`, `| --- | --: | --: | --- | --- | --: | --: |`,
    ...out.identity.map((x) => `| ${x.name} | ${x.e} | ${x.cls} | ${x.inBand ? 'IN BAND' : 'outside'} | ${x.state} | ${x.equal === false ? f(x.maxPositionDifferenceM, 3) : x.equal ? '0' : '-'} | ${x.payloadBytes ?? '-'} |`), '',
    `## Published examples (results/ap-truth/compare/examples, flown over each window in TEME on both builds)`,
    `| Example | Regime | n (rev/day) | e | Class | Band | Epochs | Result |`, `| --- | --- | --: | --: | --: | --- | --: | --- |`,
    ...out.examples.map((x) => `| ${x.id} | ${x.regime ?? '-'} | ${f(x.n, 4)} | ${f(x.e, 5)} | ${x.cls ?? '-'} | ${x.inBand ? 'IN BAND' : x.aboveWide ? 'above 0.3' : 'outside'} | ${x.epochs ?? '-'} | ${x.state} |`), '',
  ].join('\n');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'table.json'), `${JSON.stringify(out, null, 1)}\n`);
  fs.writeFileSync(path.join(outDir, 'README.md'), `${md}\n`);
  return out;
}

function check() {
  const failures = [];
  const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failures.push(what); };
  const rows = readRows();
  const registered = execFileSync('git', ['-C', REPO, 'log', '--diff-filter=A', '--format=%H %cI', '--', REGISTRATION], { encoding: 'utf8' }).trim().split('\n').at(-1);
  const firstRow = rows.map((r) => r.createdUtc).sort()[0];
  ok(Boolean(registered) && rows.length > 0 && Date.parse(registered.split(' ')[1]) < Date.parse(firstRow), `the registration's commit (${(registered ?? '').slice(0, 8)}) precedes the first of ${rows.length} rows (${firstRow})`);
  const runners = new Set(rows.map((r) => r.runner));
  ok(rows.every((r) => typeof r.runner === 'string' && r.runner.length === 64), `every row names its runner's SHA-256 (${[...runners].map((s) => s.slice(0, 12)).join(', ')}; this file ${RUNNER.slice(0, 12)})`);
  const nextShas = new Set(rows.map((r) => r.pins?.next?.wasmSha256).filter(Boolean));
  ok(nextShas.size === 1 && nextShas.has(PIN.next.preSignSha256) && rows.every((r) => r.pins?.next?.wasmSha256 && r.pins?.base?.wasmSha256 === PIN.base.wasmSha256 && r.pins?.ffm?.wasmSha256 === PIN.ffm.wasmSha256), `every row (${rows.length}) is on the one 0.6.4 build (${[...nextShas].map((s) => s.slice(0, 12)).join(', ')}; canonical ${PIN.next.canonicalSha256.slice(0, 12)}, signed bundle ${PIN.next.bundleSha256?.slice(0, 12) ?? 'pending'}) against the 0.6.3 dist ${PIN.base.wasmSha256.slice(0, 12)} and ffm ${PIN.ffm.wasmSha256.slice(0, 12)}`);
  const t = JSON.parse(fs.readFileSync(path.join(RESULTS, 'table.json'), 'utf8'));
  ok(t.cells.every((c) => c.state !== 'unmeasured' && !c.error), `every cell (${t.cells.length}) is flown on both builds or below the perigee floor`);
  ok(t.identity.every((x) => x.state !== 'unmeasured' && x.state !== 'error') && t.examples.every((x) => x.state === 'equal' || x.state === 'differs'), `every identity item (${t.identity.length}) and example (${t.examples.length}) is measured`);
  ok(Boolean(t.catalog.next), `the 0.6.4 catalog row exists (cold ${t.catalog.next?.cold.medianMs?.toFixed(1)} ms, warm ${t.catalog.next?.warm.refreshWallMsSlowestWorker?.toFixed(0)} ms, peak ${t.catalog.next ? (t.catalog.next.memory.peakBytesPerWorker / 2 ** 20).toFixed(0) : '-'} MB)`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tsbc-'));
  table(tmp);
  for (const name of ['table.json', 'README.md']) ok(fs.readFileSync(path.join(tmp, name)).equals(fs.readFileSync(path.join(RESULTS, name))), `${name} reproduces byte for byte`);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`summary ${JSON.stringify(t.summary)}`);
  if (failures.length) { console.log(`CHECK FAIL ${failures.length}`); process.exit(1); }
  console.log('CHECK PASS');
}
