#!/usr/bin/env node
// Item 5 (#1128 / #976): Multi-Day Causal Live Space-Track Public CDM Evaluation (2026-11-16..25)
// Scores ALL unique Space-Track public CDM events over 10 consecutive days (~216 unique events)
// causally at T0 = day 00:00Z (strictly prior GP snapshot, 21d gp_history, prior SpaceX cycle, causal SPW)
// across all 3 arms (SGP4, SDN-AP 0.7.3, SGP4-XP) through compiled catalog-builder 0.2.5 + sdn-ap 0.7.3 + conjunction-assessment 0.19.1 WASM!
// Outputs aggregate-only JSON to results/ca-rollup-073/multiday-live-cdm-0.7.3.json (zero NORAD/CDM rows published).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DAY_MS, nowUtc, utcMs, dayStr, sha256File,
  loadSdsAndSdk, gpJsonToOmm, buildCausalSpwRecords, buildCatalogBatch,
} from './amendment5-lib.mjs';

const SELF = fileURLToPath(import.meta.url);
const OAE = path.resolve(path.dirname(SELF), '../..');
const MODULES = process.env.SDN_MODULES_ROOT || path.resolve(OAE, '../../main-packages/space-data-network-modules');
const ARCHIVE = process.env.SDN_ARCHIVE_ROOT || '/opt/data/sdn-archive';
const CA_DIR = path.join(MODULES, 'analysis/conjunction-assessment');
const AP_WASM = path.join(MODULES, 'propagator/sdn-ap/dist/isomorphic/module.wasm');
const CA_WASM = path.join(CA_DIR, 'dist/isomorphic/module.wasm');
const CA_MAN = JSON.parse(fs.readFileSync(path.join(CA_DIR, 'plugin-manifest.json'), 'utf8'));
const OUT_PATH = path.join(OAE, 'results/ca-rollup-073/multiday-live-cdm-0.7.3.json');

const sds = await loadSdsAndSdk(MODULES);
const { fb, sdkBrowser, sdkIso, OMM_MOD, CQR_MOD, PRW_MOD, PPE_MOD, typeRef } = sds;
const req = createRequire(path.join(CA_DIR, 'package.json'));
const CAT_SCR = await import(pathToFileURL(path.join(CA_DIR, 'gpu/catalogScreen.mjs')).href);
const ALL_VS = await import(pathToFileURL(path.join(CA_DIR, 'gpu/allVsAll.mjs')).href);
const PRW_M = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/PRW/main.js')).href);
const PPE_M = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/PPE/main.js')).href);

// Chebyshev-Lobatto 13-node DCT-I matrix (exact match to screen-3arm.mjs)
const CHEB_N = 12, CHEB_M = 13;
const CHEB_X = new Float64Array(CHEB_M);
const CHEB_MAT = new Float64Array(CHEB_M * CHEB_M);
for (let j = 0; j < CHEB_M; j++) CHEB_X[j] = -Math.cos((Math.PI * j) / CHEB_N);
for (let k = 0; k < CHEB_M; k++) {
  const scaleK = (k === 0 || k === CHEB_N ? 1 : 2) / CHEB_N;
  const signK = k % 2 === 1 ? -1 : 1;
  for (let j = 0; j < CHEB_M; j++) CHEB_MAT[k * CHEB_M + j] = scaleK * (j === 0 || j === CHEB_N ? 0.5 : 1) * signK * Math.cos((Math.PI * k * j) / CHEB_N);
}
const jdSplit = (ms) => { const jd = ms / DAY_MS + 2440587.5; const jw = Math.floor(jd + 0.5) - 0.5; return [jw, jd - jw]; };
const sizePrefix = (buf) => { const b = Buffer.allocUnsafe(4 + buf.length); b.writeUInt32LE(buf.length, 0); buf.copy(b, 4); return b; };

// 1. Collect all unique CDM events from 2026-11-16..25, grouped by causal decision day D = day(TCA - 24h)
//    so every prediction has strictly >= 12 h to 36 h lead and zero look-ahead!
const cdmDir = path.join(ARCHIVE, 'spacetrack/cdm_public/2026');
const cdmFiles = fs.readdirSync(cdmDir).filter((f) => f >= '2026-11-16.json.gz' && f <= '2026-11-25.json.gz').sort();
let totalCdmsRead = 0;
const latestByEvent = new Map();
for (const f of cdmFiles) {
  const arr = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(cdmDir, f))));
  totalCdmsRead += arr.length;
  for (const c of arr) {
    const a = Math.min(Number(c.SAT_1_ID), Number(c.SAT_2_ID));
    const b = Math.max(Number(c.SAT_1_ID), Number(c.SAT_2_ID));
    const tcaMs = utcMs(c.TCA);
    const minRngM = Number(c.MIN_RNG);
    if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isFinite(tcaMs) || !Number.isFinite(minRngM)) continue;
    const key = `${a}:${b}:${Math.round(tcaMs / 3600000)}`;
    const prev = latestByEvent.get(key);
    if (!prev || String(c.CREATED) > prev.created) {
      latestByEvent.set(key, { a, b, tcaMs, minRngM, created: String(c.CREATED), pc: Number(c.PC) || 0, emg: c.EMERGENCY_REPORTABLE === 'Y' });
    }
  }
}

// Assign each event a strictly causal T0 = 00:00Z of day(TCA - 12h) clamped within [2026-11-16, 2026-11-25]
const byDay = new Map();
for (const ev of latestByEvent.values()) {
  const d0 = dayStr(ev.tcaMs - 12 * 3600000);
  if (d0 < '2026-11-16' || d0 > '2026-11-25') continue;
  // Require strict causality: TCA > T0 (where T0 = d0 00:00Z) and lead <= 5 days
  const t0Ms = Date.parse(`${d0}T00:00:00Z`);
  if (!(ev.tcaMs > t0Ms + 6 * 3600000 && ev.tcaMs <= t0Ms + 5 * DAY_MS)) continue;
  (byDay.get(d0) ?? byDay.set(d0, []).get(d0)).push(ev);
}

const slCycles = fs.readdirSync(path.join(ARCHIVE, 'operator-capture/cycles')).filter((d) => /^\d{4}-\d{2}-\d{2}T/.test(d)).sort();
const cycleMs = (d) => Date.parse(d.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, 'T$1:$2:$3.$4Z'));
const histDir = path.join(ARCHIVE, 'spacetrack/gp_history/by-creation/2026');
const allHistFiles = fs.readdirSync(histDir).filter((f) => f.endsWith('.json.gz')).sort();

const manifest = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json'), 'utf8'));
const reusable = {
  chain: await sdkIso.createStandaloneHarness('browser', path.join(MODULES, 'flows/catalog-builder/dist/isomorphic/module.wasm'), { surface: 'direct', enableBrowserWasiThreads: false }),
  gp: await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(MODULES, 'analysis/gp-error-model/dist/isomorphic/module.wasm')), manifest: manifest(path.join(MODULES, 'analysis/gp-error-model')), surface: 'direct' }),
  composer: await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(MODULES, 'analysis/catalog-composer/dist/isomorphic/module.wasm')), manifest: manifest(path.join(MODULES, 'analysis/catalog-composer')), surface: 'direct' }),
};
const caH = await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(CA_WASM), manifest: CA_MAN, surface: 'direct', enableBrowserWasiThreads: false });
const caInvoke = (methodId, inputs) => caH.invoke({ methodId, inputs });

const temeRfmOmm = new CQR_MOD.RFMT(CQR_MOD.RFMUnion.CelestialFrameWrapper, new CQR_MOD.CelestialFrameWrapperT(CQR_MOD.CelestialFrame.TEMEOFDATE), 0, 'TEMEOFDATE');
const temeRfmPpe = new PPE_M.RFMT(PPE_M.RFMUnion.CelestialFrameWrapper, new PPE_M.CelestialFrameWrapperT(PPE_M.CelestialFrame.TEMEOFDATE), 0, 'TEMEOFDATE');

async function screenPairSgp4(bA, bB, tcaMs) {
  const sources = [bA, bB].map((bytes, i) => {
    const omm = OMM_MOD.OMM.getRootAsOMM(new fb.ByteBuffer(bytes)).unpack();
    omm.CENTER_NAME = 'EARTH'; omm.REFERENCE_FRAME = temeRfmOmm;
    return new CQR_MOD.CQRObjectSourceT(omm.OBJECT_ID || String(omm.NORAD_CAT_ID), omm.OBJECT_NAME, omm.NORAD_CAT_ID, null, i + 1, 'sgp4', omm);
  });
  const h = await CAT_SCR.prepareIndex(caInvoke, sources);
  const reqB = CAT_SCR.windowRequest(h, 'TEME', { startJd: (tcaMs - 60000) / DAY_MS + 2440587.5, durationDays: 120 / 86400 }, { thresholdKm: 500, coarseStepSec: 5, workers: 1, algorithm: 'ALFANO_MAXIMUM' });
  const run = await ALL_VS.screenAllVsAllOnGpu({ invoke: caInvoke, decodeCatalogResult: CAT_SCR.decodeCatalogResult, request: reqB, thresholdKm: 500, coarseStepSec: 5 });
  await CAT_SCR.releaseIndex(caInvoke, h);
  if (!run.events.length) return null;
  run.events.sort((x, y) => x.MISS_DISTANCE_M - y.MISS_DISTANCE_M);
  return run.events[0].MISS_DISTANCE_M;
}

async function screenPairOcm(apEval, arm, bufA, bufB, aId, bId, tcaMs) {
  const lr = await apEval.invoke({ methodId: 'load_epochs', inputs: [{ portId: 'ocm', typeRef: typeRef('OCM'), payload: Buffer.concat([sizePrefix(bufA), sizePrefix(bufB)]) }] });
  if (lr.statusCode !== 0) return null;
  const x = apEval.instance.exports;
  const n = x.sdnap_epochs_count();
  if (n < 2) return null;
  const out = x.sdnap_alloc(48), st = x.sdnap_alloc(4);
  const sA = [], sB = [];
  for (let j = 0; j < CHEB_M; j++) {
    const ms = tcaMs + CHEB_X[j] * 60000;
    const [jw, jf] = jdSplit(ms);
    if (x.sdnap_epochs_at(jw, jf, 0, 1, 0, out, st, 0) !== 0 || new Int32Array(apEval.memory.buffer, st, 1)[0] !== 0) return null;
    sA.push(Array.from(new Float64Array(apEval.memory.buffer, out, 6)));
    if (x.sdnap_epochs_at(jw, jf, 1, 1, 0, out, st, 0) !== 0 || new Int32Array(apEval.memory.buffer, st, 1)[0] !== 0) return null;
    sB.push(Array.from(new Float64Array(apEval.memory.buffer, out, 6)));
  }
  const winStartMs = tcaMs - 60000;
  const startIso = new Date(winStartMs).toISOString(), stopIso = new Date(tcaMs + 60000).toISOString(), midIso = new Date(tcaMs).toISOString();
  const makePpe = (series) => {
    const c = Array.from({ length: 6 }, () => new Array(CHEB_M));
    for (let ch = 0; ch < 6; ch++) for (let k = 0; k < CHEB_M; k++) {
      let sum = 0;
      for (let j = 0; j < CHEB_M; j++) sum += CHEB_MAT[k * CHEB_M + j] * series[j][ch];
      c[ch][k] = sum;
    }
    const rec = new PPE_M.PPEPositionRecordT(midIso, 60, CHEB_M, PPE_M.polynomialBasisType.CHEBYSHEV, c[0], c[1], c[2], true, c[3], c[4], c[5], 0, 0);
    return new PPE_M.PPET([], null, 'EARTH', temeRfmPpe, PPE_M.timingStandard.UTC, startIso, stopIso, PPE_M.polynomialBasisType.CHEBYSHEV, [rec], [], `sdn-ap-0.7.3-${arm}`, 120, CHEB_M, null);
  };
  const sources = [
    new CQR_MOD.CQRObjectSourceT(String(aId), `OBJ-${aId}`, aId, null, 1),
    new CQR_MOD.CQRObjectSourceT(String(bId), `OBJ-${bId}`, bId, null, 2),
  ];
  const prw = new PRW_M.PRWT();
  prw.DESCRIBE_RESULT = new PRW_M.PRWDescribeResultT(new PRW_M.PRWInstanceT('sdn-ap', `cdm-${arm}`, 1n), 1, [
    new PRW_M.PRWTrajectorySourceT(1, String(aId), makePpe(sA), []),
    new PRW_M.PRWTrajectorySourceT(2, String(bId), makePpe(sB), []),
  ], 0n, true);
  const b = new fb.Builder(16384);
  PRW_M.PRW.finishSizePrefixedPRWBuffer(b, prw.pack(b));
  const h = await CAT_SCR.prepareIndex(caInvoke, sources, [b.asUint8Array().slice()]);
  const reqB = CAT_SCR.windowRequest(h, 'TEME', { startJd: winStartMs / DAY_MS + 2440587.5, durationDays: 120 / 86400 }, { thresholdKm: 500, coarseStepSec: 5, workers: 1, algorithm: 'ALFANO_MAXIMUM' });
  const run = await ALL_VS.screenAllVsAllOnGpu({ invoke: caInvoke, decodeCatalogResult: CAT_SCR.decodeCatalogResult, request: reqB, thresholdKm: 500, coarseStepSec: 5 });
  await CAT_SCR.releaseIndex(caInvoke, h);
  if (!run.events.length) return null;
  run.events.sort((x, y) => x.MISS_DISTANCE_M - y.MISS_DISTANCE_M);
  return run.events[0].MISS_DISTANCE_M;
}

const apEval = await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(AP_WASM), surface: 'direct', initialMemoryBytes: 64 * 1024 * 1024 });
const errS = [], errA = [], errX = [];
let apBeatsS = 0, apBeatsX = 0, xpBeatsS = 0;
const perDaySummary = {};

for (const day of [...byDay.keys()].sort()) {
  const evs = byDay.get(day);
  const t0Ms = Date.parse(`${day}T00:00:00Z`);
  const want = new Set();
  for (const e of evs) { want.add(e.a); want.add(e.b); }
  // Strictly prior GP snapshot: day - 1 (created <= T0)
  const snapDay = dayStr(t0Ms - DAY_MS);
  const snapFile = path.join(ARCHIVE, `spacetrack/gp/2026/${snapDay}.json.gz`);
  if (!fs.existsSync(snapFile)) continue;
  const gpSnap = JSON.parse(zlib.gunzipSync(fs.readFileSync(snapFile)));
  const seedByNorad = new Map();
  for (const r of gpSnap) {
    const id = Number(r.NORAD_CAT_ID);
    if (!want.has(id)) continue;
    if (utcMs(r.CREATION_DATE) > t0Ms || utcMs(r.EPOCH) >= t0Ms) continue;
    const prev = seedByNorad.get(id);
    if (!prev || utcMs(r.EPOCH) > utcMs(prev.EPOCH)) seedByNorad.set(id, r);
  }
  const fromMs = t0Ms - 21 * DAY_MS;
  const fromDay = dayStr(fromMs - DAY_MS);
  const histByNorad = new Map([...seedByNorad.keys()].map((id) => [id, new Map([[seedByNorad.get(id).EPOCH, seedByNorad.get(id)]])]));
  for (const f of allHistFiles) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(f);
    if (!m || m[1] < fromDay || m[1] > day) continue;
    const mStart = /^(\d{4}-\d{2}-\d{2}T\d{2}\d{2}\d{2}Z)/.exec(f);
    if (mStart && Date.parse(mStart[1].replace(/T(\d{2})(\d{2})(\d{2})Z/, 'T$1:$2:$3Z')) > t0Ms) continue;
    const arr = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(histDir, f))));
    for (const r of arr) {
      const id = Number(r.NORAD_CAT_ID);
      if (!histByNorad.has(id)) continue;
      const cMs = utcMs(r.CREATION_DATE), eMs = utcMs(r.EPOCH);
      if (cMs <= t0Ms && eMs < t0Ms && eMs >= fromMs) histByNorad.get(id).set(r.EPOCH, r);
    }
  }
  // Find latest Starlink cycle strictly < t0Ms
  const priorSl = slCycles.filter((d) => cycleMs(d) < t0Ms).at(-1);
  const slDir = priorSl ? path.join(ARCHIVE, 'operator-capture/cycles', priorSl) : null;
  const seeds = new Map(), histPacked = new Map(), ephMap = new Map(), sgp4Unpref = new Map();
  for (const [id, r] of seedByNorad) {
    seeds.set(id, gpJsonToOmm(r, sds, true));
    sgp4Unpref.set(id, gpJsonToOmm(r, sds, false));
    const arr = [...histByNorad.get(id).values()].sort((a, b) => utcMs(a.EPOCH) - utcMs(b.EPOCH));
    histPacked.set(id, arr.map((x) => ({ ms: utcMs(x.EPOCH), buf: gpJsonToOmm(x, sds, true) })));
    if (slDir && fs.existsSync(path.join(slDir, `${id}.ocm`))) ephMap.set(id, fs.readFileSync(path.join(slDir, `${id}.ocm`)));
  }
  const weatherRecords = buildCausalSpwRecords({ archiveRoot: ARCHIVE, sds, firstDate: dayStr(t0Ms - 35 * DAY_MS), lastDate: dayStr(t0Ms + 10 * DAY_MS), cutoffDate: snapDay });
  const apRes = await buildCatalogBatch({ modulesRoot: MODULES, sds, kind: 'sdn-ap', nowMs: t0Ms, seeds, historyByNorad: histPacked, ephemeridesByNorad: ephMap.size ? ephMap : null, weatherRecords, reusable });
  const xpRes = await buildCatalogBatch({ modulesRoot: MODULES, sds, kind: 'sgp4-xp', nowMs: t0Ms, seeds, historyByNorad: histPacked, ephemeridesByNorad: ephMap.size ? ephMap : null, weatherRecords, reusable });

  let dScored = 0, dWinS = 0, dWinX = 0;
  for (const e of evs) {
    const sA = sgp4Unpref.get(e.a), sB = sgp4Unpref.get(e.b);
    const oA = apRes.get(e.a)?.ocmBuf, oB = apRes.get(e.b)?.ocmBuf;
    const xA = xpRes.get(e.a)?.ocmBuf, xB = xpRes.get(e.b)?.ocmBuf;
    if (!sA || !sB || !oA || !oB || !xA || !xB) continue;
    const mS = await screenPairSgp4(sA, sB, e.tcaMs);
    const mA = await screenPairOcm(apEval, 'ap', oA, oB, e.a, e.b, e.tcaMs);
    const mX = await screenPairOcm(apEval, 'xp', xA, xB, e.a, e.b, e.tcaMs);
    if (mS == null || mA == null || mX == null) continue;
    const eS = Math.abs(mS - e.minRngM), eA = Math.abs(mA - e.minRngM), eX = Math.abs(mX - e.minRngM);
    errS.push(eS); errA.push(eA); errX.push(eX);
    dScored++;
    if (eA < eS) { apBeatsS++; dWinS++; }
    if (eA < eX) { apBeatsX++; dWinX++; }
    if (eX < eS) xpBeatsS++;
  }
  perDaySummary[day] = { uniqueEvents: evs.length, scored: dScored, apWinS: dWinS, apWinX: dWinX };
  console.log(`${nowUtc()} [cdm ${day}] events=${evs.length} scored=${dScored} apWinS=${dWinS} apWinX=${dWinX}`);
}

await apEval.destroy?.();
await caH.destroy?.();
await reusable.chain.destroy?.();
await reusable.gp.destroy?.();
await reusable.composer.destroy?.();

const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s.length ? +s[Math.floor(p * (s.length - 1))].toFixed(1) : null; };
const report = {
  schema: 'sdn-ap-multiday-live-cdm-1',
  version: '0.7.3',
  generatedUtc: new Date().toISOString(),
  days: '2026-11-16..2026-11-25',
  totalCdmsRead,
  uniqueEventsEligible: [...byDay.values()].reduce((s, a) => s + a.length, 0),
  scoredAllThreeArms: errS.length,
  medianAbsMissErrM: { sgp4: q(errS, 0.5), sdnAp: q(errA, 0.5), sgp4Xp: q(errX, 0.5) },
  p95AbsMissErrM: { sgp4: q(errS, 0.95), sdnAp: q(errA, 0.95), sgp4Xp: q(errX, 0.95) },
  sdnApCloserThanSgp4Share: errS.length ? +(apBeatsS / errS.length).toFixed(4) : null,
  sdnApCloserThanSgp4XpShare: errS.length ? +(apBeatsX / errS.length).toFixed(4) : null,
  sgp4XpCloserThanSgp4Share: errS.length ? +(xpBeatsS / errS.length).toFixed(4) : null,
  perDay: perDaySummary,
  artifacts: {
    sdnApWasmSha256: sha256File(AP_WASM),
    chainWasmSha256: sha256File(path.join(MODULES, 'flows/catalog-builder/dist/isomorphic/module.wasm')),
    conjunctionAssessmentWasmSha256: sha256File(CA_WASM),
  },
};
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n');
console.log('MULTIDAY LIVE CDM COMPLETE:', JSON.stringify(report, null, 2));
process.exit(0);
