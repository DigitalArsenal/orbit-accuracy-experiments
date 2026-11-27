#!/usr/bin/env node
// Phase 3B Part B2: Multi-Arm Scored Screening on Archived 2026-11-22 CelesTrak SOCRATES Plus Run
// Window: 2026-11-21T10:00:00Z .. 2026-11-26T10:00:00Z (5 full elapsed days, 120 h)
// Exact SOCRATES GP cut: <= 2026-11-21T08:56:21Z (100.0% 24,551/24,551 edition match)
// Strictly causal pre-T0 inputs:
//   - Published CelesTrak SOCRATES Plus (2026-11-22/sort-minRange.csv.gz, 191,778 rows)
//   - sgp4Control: CA 0.19.3 SGP4 on matched Space-Track GP editions (<= 08:56:21Z)
//   - supGpSgp4: CelesTrak SupGP (2026-11-21/starlink/022001Z.json.gz, 7h40m < T0) on CA 0.19.3 SGP4
//   - gpSgp4Xp / gpSdnAp: Space-Track GP history (<= 08:56:21Z) -> catalog-builder 0.2.7 -> SGP4-XP / SDN-AP 0.7.5 -> CA 0.19.3
//   - spacexSgp4Xp / spacexSdnAp: SpaceX 2026-11-21T08-57-57-947Z (1h02m < T0) -> catalog-builder 0.2.7 -> SGP4-XP / SDN-AP 0.7.5 -> CA 0.19.3
// Reference truth screen:
//   - Stitched post-event 8-hourly SpaceX Starlink ephemerides (2026-11-21T08:57Z .. 2026-11-26T16:57Z, 0-8 h freshness),
//     screened directly by CA 0.19.3 (independent of any arm's candidates; explicitly disclosed as operator self-consistency, NOT independent tracking).
//
// Usage:
//   SDN_MODULES_ROOT=/tmp/work-modules-074 CA_MODULES_ROOT=/tmp/work-ca-0193 node experiments/ca-socrates-comparison-075/run-part-b2.mjs --workers 6
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DAY_MS, HOUR_MS, sha256File, nowUtc, utcMs, dayStr,
  loadSdsAndSdk, gpJsonToOmm, buildCausalSpwRecords, buildCatalogBatch,
} from '../ca-rollup-075/amendment6-lib.mjs';

const SELF = fileURLToPath(import.meta.url);
const OAE = path.resolve(path.dirname(SELF), '../..');
const MODULES = process.env.SDN_MODULES_ROOT || '/tmp/work-modules-074';
const CA_MODULES = process.env.CA_MODULES_ROOT || '/tmp/work-ca-0193';
const ARCHIVE = process.env.SDN_ARCHIVE_ROOT || '/opt/data/sdn-archive';
const RUN_DIR = path.join(OAE, 'runs/ca-socrates-comparison-075/b2');
const B1_PATH = path.join(OAE, 'runs/ca-socrates-comparison-075/part-b1.json');
const B2_OUT = path.join(OAE, 'runs/ca-socrates-comparison-075/part-b2.json');
const FINAL_OUT = path.join(OAE, 'results/ca-rollup-075/socrates-comparison-0.7.5.json');

const T0_ISO = '2026-11-21T10:00:00.000Z';
const T0_MS = Date.parse(T0_ISO);
const T0_JD = T0_MS / DAY_MS + 2440587.5;
const SCORED_DAYS = 5;
const END_MS = T0_MS + SCORED_DAYS * DAY_MS; // 2026-11-26T10:00:00.000Z
const CUT_ISO = '2026-11-21T08:56:21Z';
const CUT_MS = Date.parse(CUT_ISO);
const WIN_HOURS = 4;
const N_WINS = Math.round((SCORED_DAYS * 24) / WIN_HOURS); // 30 windows
const SEG_SEC = 1200;
const N_SEGS = Math.round((WIN_HOURS * 3600) / SEG_SEC); // 12 segs/window
const CHEB_N = 12;
const CHEB_M = CHEB_N + 1;
const CHEB_X = new Float64Array(CHEB_M);
const CHEB_MAT = new Float64Array(CHEB_M * CHEB_M);
for (let j = 0; j < CHEB_M; j++) CHEB_X[j] = -Math.cos((Math.PI * j) / CHEB_N);
for (let k = 0; k < CHEB_M; k++) {
  const scaleK = (k === 0 || k === CHEB_N ? 1 : 2) / CHEB_N;
  const signK = k % 2 === 1 ? -1 : 1;
  for (let j = 0; j < CHEB_M; j++) {
    const wj = j === 0 || j === CHEB_N ? 0.5 : 1.0;
    CHEB_MAT[k * CHEB_M + j] = scaleK * wj * signK * Math.cos((Math.PI * k * j) / CHEB_N);
  }
}

const SOCRATES_GZ = path.join(ARCHIVE, 'hac/celestrak-socrates/2026/2026-11-22/sort-minRange.csv.gz');
const SUPGP_SL_GZ = path.join(ARCHIVE, 'hac/celestrak-supgp/2026/2026-11-21/starlink/022001Z.json.gz');
const CYCLES_DIR = path.join(ARCHIVE, 'operator-capture/cycles');
const PRE_CYCLE = '2026-11-21T08-57-57-947Z';
const SATCAT_CSV = '/opt/data/sdn-archive/ca-socrates-gp-parity/raw/satcat-20261029T211622Z/satcat.csv';

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const jdSplit = (ms) => { const jd = ms / DAY_MS + 2440587.5; const jw = Math.floor(jd + 0.5) - 0.5; return [jw, jd - jw]; };
const sizePrefix = (buf) => { const b = Buffer.allocUnsafe(buf.length + 4); b.writeUInt32LE(buf.length, 0); Buffer.from(buf).copy(b, 4); return b; };
const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const x = (sorted.length - 1) * q, lo = Math.floor(x), hi = Math.ceil(x);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
};
function rngOf(text) {
  const h = crypto.createHash('sha256').update(text).digest();
  let a = h.readUInt32LE(0), b = h.readUInt32LE(4), c = h.readUInt32LE(8), d = h.readUInt32LE(12) | 1;
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function loadSocratesRows() {
  const [hdr, ...body] = parseCsv(zlib.gunzipSync(fs.readFileSync(SOCRATES_GZ)).toString('utf8'));
  const col = Object.fromEntries(hdr.map((h, i) => [h, i]));
  const stOf = (n) => /\[(.)\]\s*$/.exec(n)?.[1] ?? null;
  return body.map((r) => {
    const tcaMs = utcMs(r[col.TCA]);
    return {
      a: Number(r[col.NORAD_CAT_ID_1]), aName: r[col.OBJECT_NAME_1], aStatus: stOf(r[col.OBJECT_NAME_1]), aDse: Number(r[col.DSE_1]),
      b: Number(r[col.NORAD_CAT_ID_2]), bName: r[col.OBJECT_NAME_2], bStatus: stOf(r[col.OBJECT_NAME_2]), bDse: Number(r[col.DSE_2]),
      tcaMs, tcaJd: tcaMs / DAY_MS + 2440587.5, missM: Number(r[col.TCA_RANGE]) * 1000, speedMS: Number(r[col.TCA_RELATIVE_SPEED]) * 1000,
    };
  });
}

// ---------- CA 0.19.3 helper ----------
async function loadCaDeps() {
  const caDir = path.join(CA_MODULES, 'analysis/conjunction-assessment');
  const req = createRequire(path.join(caDir, 'package.json'));
  const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
  const { createBrowserModuleHarness } = await import(pathToFileURL(req.resolve('space-data-module-sdk/host/browser-module')).href);
  const CQR_MOD = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/CQR/main.js')).href);
  const PRW_MOD = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/PRW/main.js')).href);
  const PPE_MOD = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/PPE/main.js')).href);
  const OMM_MOD = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/OMM/main.js')).href);
  const OCM_MOD = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/OCM/main.js')).href);
  const CAT_SCR = await import(pathToFileURL(path.join(caDir, 'gpu/catalogScreen.mjs')).href);
  const ALL_VS = await import(pathToFileURL(path.join(caDir, 'gpu/allVsAll.mjs')).href);
  const caWasm = path.join(caDir, 'dist/isomorphic/module.wasm');
  const caMan = JSON.parse(fs.readFileSync(path.join(caDir, 'plugin-manifest.json'), 'utf8'));
  return { caDir, fb, createBrowserModuleHarness, CQR_MOD, PRW_MOD, PPE_MOD, OMM_MOD, OCM_MOD, CAT_SCR, ALL_VS, caWasm, caMan };
}

function buildPrwFrames({ ca, arm, frameName, winStartMs, statesByTime, validMask, norads, batchSize = 256 }) {
  const { fb, CQR_MOD, PRW_MOD, PPE_MOD } = ca;
  const nObj = norads.length;
  const halfSec = SEG_SEC / 2;
  const segMidsIso = Array.from({ length: N_SEGS }, (_, s) => new Date(winStartMs + (s + 0.5) * SEG_SEC * 1000).toISOString());
  const startIso = new Date(winStartMs).toISOString();
  const stopIso = new Date(winStartMs + N_SEGS * SEG_SEC * 1000).toISOString();
  const prwInst = new PRW_MOD.PRWInstanceT('sdn-ap', `soc-${arm}`, 1n);
  const celFrame = frameName === 'GCRF' ? PPE_MOD.CelestialFrame.GCRF : PPE_MOD.CelestialFrame.TEMEOFDATE;
  const rfm = new PPE_MOD.RFMT(PPE_MOD.RFMUnion.CelestialFrameWrapper, new PPE_MOD.CelestialFrameWrapperT(celFrame), 0, frameName === 'GCRF' ? 'GCRF' : 'TEMEOFDATE');
  const sources = [], prwFrames = [];
  let curBatch = [];
  const flush = (isFinal) => {
    if (!curBatch.length) return;
    const prw = new PRW_MOD.PRWT();
    prw.DESCRIBE_RESULT = new PRW_MOD.PRWDescribeResultT(prwInst, 1, curBatch, 0n, isFinal);
    const b = new fb.Builder(Math.max(1 << 16, curBatch.length * 4096));
    PRW_MOD.PRW.finishSizePrefixedPRWBuffer(b, prw.pack(b));
    prwFrames.push(b.asUint8Array().slice());
    curBatch = [];
  };
  const cArr = Array.from({ length: 6 }, () => new Array(CHEB_M));
  for (let idx = 0; idx < nObj; idx++) {
    if (!validMask[idx]) continue;
    const norad = norads[idx];
    const recs = new Array(N_SEGS);
    for (let s = 0; s < N_SEGS; s++) {
      const tBase = s * CHEB_N;
      for (let ch = 0; ch < 6; ch++) {
        const dst = cArr[ch];
        for (let k = 0; k < CHEB_M; k++) {
          let sum = 0;
          const rowOff = k * CHEB_M;
          for (let j = 0; j < CHEB_M; j++) sum += CHEB_MAT[rowOff + j] * statesByTime[tBase + j][ch * nObj + idx];
          dst[k] = sum;
        }
      }
      recs[s] = new PPE_MOD.PPEPositionRecordT(
        segMidsIso[s], halfSec, CHEB_M, PPE_MOD.polynomialBasisType.CHEBYSHEV,
        cArr[0].slice(), cArr[1].slice(), cArr[2].slice(),
        true,
        cArr[3].slice(), cArr[4].slice(), cArr[5].slice(), 0, 0,
      );
    }
    const ppe = new PPE_MOD.PPET([], null, 'EARTH', rfm, PPE_MOD.timingStandard.UTC, startIso, stopIso, PPE_MOD.polynomialBasisType.CHEBYSHEV, recs, [], `soc-${arm}`, SEG_SEC, CHEB_M, null);
    const handle = idx + 1;
    sources.push(new CQR_MOD.CQRObjectSourceT(String(norad), `SL-${norad}`, norad, null, handle));
    curBatch.push(new PRW_MOD.PRWTrajectorySourceT(handle, String(norad), ppe, []));
    if (curBatch.length >= batchSize) flush(false);
  }
  flush(true);
  return { sources, prwFrames };
}

// ---------- WORKER 1: Build causal SDN-AP / SGP4-XP catalogs (GP history & SpaceX pre-T0) ----------
async function buildWorker() {
  const shard = Number(arg('--shard'));
  const armsToBuild = (arg('--arms', 'gpSdnAp,gpSgp4Xp,spacexSdnAp,spacexSgp4Xp')).split(',').filter(Boolean);
  const armSet = new Set(armsToBuild);
  const doneFlag = path.join(RUN_DIR, `build-shard-${shard}.done`);
  if (fs.existsSync(doneFlag)) process.exit(0);
  const shardSpec = JSON.parse(fs.readFileSync(path.join(RUN_DIR, `build-shard-${shard}.json`), 'utf8'));
  const sds = await loadSdsAndSdk(MODULES);
  const { sdkBrowser, sdkIso } = sds;
  const manifest = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json'), 'utf8'));
  const reusable = {
    chain: await sdkIso.createStandaloneHarness('browser', path.join(MODULES, 'flows/catalog-builder/dist/isomorphic/module.wasm'), { surface: 'direct', enableBrowserWasiThreads: false }),
    gp: await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(MODULES, 'analysis/gp-error-model/dist/isomorphic/module.wasm')), manifest: manifest(path.join(MODULES, 'analysis/gp-error-model')), surface: 'direct' }),
    composer: await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(MODULES, 'analysis/catalog-composer/dist/isomorphic/module.wasm')), manifest: manifest(path.join(MODULES, 'analysis/catalog-composer')), surface: 'direct' }),
  };
  // Strictly causal cutoffDate='2026-11-21' with forward forecast horizon through 2027-01-10 (>30d past 2026-11-21)
  const spw = buildCausalSpwRecords({ archiveRoot: ARCHIVE, firstDate: '2026-10-20', lastDate: '2027-01-10', cutoffDate: '2026-11-21', sds });
  const preDir = path.join(CYCLES_DIR, PRE_CYCLE);

  const chunksOut = Object.fromEntries(armsToBuild.map((k) => [k, []]));
  const fbCounts = Object.fromEntries(armsToBuild.map((k) => [k, 0]));
  const ephCounts = Object.fromEntries(armsToBuild.map((k) => [k, 0]));
  const weatherShortCounts = Object.fromEntries(armsToBuild.map((k) => [k, 0]));
  const items = shardSpec.items;
  const BATCH = 32;
  const t0 = Date.now();
  for (let off = 0; off < items.length; off += BATCH) {
    const batch = items.slice(off, off + BATCH);
    const seeds = new Map(), histMap = new Map(), ephMap = new Map();
    for (const it of batch) {
      seeds.set(it.norad, gpJsonToOmm(it.gp, sds, true));
      histMap.set(it.norad, it.hist.map((g) => ({ ms: utcMs(g.EPOCH), buf: gpJsonToOmm(g, sds, true) })));
      if (armSet.has('spacexSdnAp') || armSet.has('spacexSgp4Xp')) {
        ephMap.set(it.norad, fs.readFileSync(path.join(preDir, `${it.norad}.ocm`)));
      }
    }
    const built = {};
    if (armSet.has('gpSdnAp')) built.gpSdnAp = await buildCatalogBatch({ modulesRoot: MODULES, sds, kind: 'sdn-ap', nowMs: T0_MS, seeds, historyByNorad: histMap, ephemeridesByNorad: null, weatherRecords: spw, reusable });
    if (armSet.has('gpSgp4Xp')) built.gpSgp4Xp = await buildCatalogBatch({ modulesRoot: MODULES, sds, kind: 'sgp4-xp', nowMs: T0_MS, seeds, historyByNorad: histMap, ephemeridesByNorad: null, weatherRecords: spw, reusable });
    if (armSet.has('spacexSdnAp')) built.spacexSdnAp = await buildCatalogBatch({ modulesRoot: MODULES, sds, kind: 'sdn-ap', nowMs: T0_MS, seeds, historyByNorad: histMap, ephemeridesByNorad: ephMap, weatherRecords: spw, reusable });
    if (armSet.has('spacexSgp4Xp')) built.spacexSgp4Xp = await buildCatalogBatch({ modulesRoot: MODULES, sds, kind: 'sgp4-xp', nowMs: T0_MS, seeds, historyByNorad: histMap, ephemeridesByNorad: ephMap, weatherRecords: spw, reusable });
    for (const it of batch) {
      for (const [k, m] of Object.entries(built)) {
        const res = m.get(it.norad);
        if (res?.ocmBuf) {
          chunksOut[k].push(sizePrefix(res.ocmBuf));
          if (res.isFallback) fbCounts[k]++;
          if (/branch=ephemeris/.test(res.reason || '')) ephCounts[k]++;
          if (/weather-rows-short/.test(res.reason || '')) weatherShortCounts[k]++;
        }
      }
    }
    if ((off + BATCH) % 320 === 0 || off + BATCH >= items.length) {
      console.log(`[b2-build s${shard}] ${Math.min(off + BATCH, items.length)}/${items.length} (${((Date.now() - t0) / 1000).toFixed(1)}s) eph=${JSON.stringify(ephCounts)} ws=${JSON.stringify(weatherShortCounts)}`);
    }
  }
  await reusable.chain.destroy?.();
  await reusable.gp.destroy?.();
  await reusable.composer.destroy?.();
  for (const [k, chunks] of Object.entries(chunksOut)) {
    fs.writeFileSync(path.join(RUN_DIR, `shard-${shard}-${k}.ocm.bin`), Buffer.concat(chunks));
  }
  fs.writeFileSync(doneFlag, JSON.stringify({ shard, count: items.length, fbCounts, ephCounts, weatherShortCounts, sec: +((Date.now() - t0) / 1000).toFixed(1) }));
  process.exit(0);
}

// ---------- WORKER 2: Screen one arm across assigned 4h windows through CA 0.19.3 ----------
async function screenWorker() {
  const arm = arg('--arm');
  const winList = arg('--windows').split(',').map(Number);
  const outDir = path.join(RUN_DIR, `screen-${arm}`);
  fs.mkdirSync(outDir, { recursive: true });
  const ca = await loadCaDeps();
  const { fb, createBrowserModuleHarness, CQR_MOD, OMM_MOD, OCM_MOD, CAT_SCR, ALL_VS, caWasm, caMan } = ca;
  const meta = JSON.parse(fs.readFileSync(path.join(RUN_DIR, 'population.json'), 'utf8'));
  const norads = meta.norads;
  const caH = await createBrowserModuleHarness({ wasmSource: fs.readFileSync(caWasm), manifest: caMan, surface: 'direct', enableBrowserWasiThreads: false });
  const invoke = (methodId, inputs) => caH.invoke({ methodId, inputs });
  const windows = CAT_SCR.screenWindows(T0_JD, SCORED_DAYS, WIN_HOURS);
  const controls = { thresholdKm: 5.0, coarseStepSec: 60, workers: 1, algorithm: 'ALFANO_MAXIMUM' };
  const nTimes = N_SEGS * CHEB_N + 1;

  if (arm === 'sgp4Control' || arm === 'supGpSgp4') {
    const bin = fs.readFileSync(path.join(RUN_DIR, `${arm}.omm.bin`));
    const temeRfm = new CQR_MOD.RFMT(CQR_MOD.RFMUnion.CelestialFrameWrapper, new CQR_MOD.CelestialFrameWrapperT(CQR_MOD.CelestialFrame.TEMEOFDATE), 0, 'TEMEOFDATE');
    const sources = [];
    for (let at = 0, idx = 0; at < bin.length; idx++) {
      const sz = bin.readUInt32LE(at);
      const omm = OMM_MOD.OMM.getRootAsOMM(new fb.ByteBuffer(bin.subarray(at + 4, at + 4 + sz))).unpack();
      omm.CENTER_NAME = 'EARTH';
      omm.REFERENCE_FRAME = temeRfm;
      sources.push(new CQR_MOD.CQRObjectSourceT(String(omm.NORAD_CAT_ID), omm.OBJECT_NAME, omm.NORAD_CAT_ID, null, idx + 1, 'sgp4', omm));
      at += 4 + sz;
    }
    const handle = await CAT_SCR.prepareIndex(invoke, sources);
    for (const k of winList) {
      const outF = path.join(outDir, `win-${String(k).padStart(2, '0')}.json`);
      if (fs.existsSync(outF)) continue;
      const t0 = Date.now();
      const w = windows[k];
      const reqBytes = CAT_SCR.windowRequest(handle, 'TEME', w, controls);
      const run = await ALL_VS.screenAllVsAllOnGpu({ invoke, decodeCatalogResult: CAT_SCR.decodeCatalogResult, request: reqBytes, thresholdKm: 5.0, coarseStepSec: 60 });
      const events = run.events.map((e) => ({ a: e.PRIMARY_NORAD_ID, b: e.SECONDARY_NORAD_ID, tcaJd: e.TCA.JULIAN_DATE, missM: e.MISS_DISTANCE_M, speedMS: e.RELATIVE_SPEED_M_S }));
      fs.writeFileSync(outF, JSON.stringify({ arm, k, screened: sources.length, events, sec: +((Date.now() - t0) / 1000).toFixed(1) }));
      console.log(`[b2-scr ${arm} w${k}] ev=${events.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
    await CAT_SCR.releaseIndex(invoke, handle);
    await caH.destroy();
    process.exit(0);
  }

  if (arm === 'truthRef') {
    // Stitched post-event 8-hourly SpaceX ephemeris cycles (0-8 h freshness), screened directly in GCRF by CA 0.19.3!
    const allCycles = fs.readdirSync(CYCLES_DIR)
      .filter((d) => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/.test(d))
      .map((d) => {
        const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/.exec(d);
        return { name: d, ms: Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) };
      })
      .filter((c) => c.ms >= T0_MS - 12 * HOUR_MS && c.ms <= END_MS + 12 * HOUR_MS)
      .sort((a, b) => a.ms - b.ms);

    // 8-point uniform Lagrange interpolation of 600s SpaceX GCRF trajectory at target time ms
    const lagrange6 = (stateData, nSt, st0, stepMs, ms) => {
      const u = (ms - st0) / stepMs;
      if (u < 0 || u > nSt - 1) return null;
      const iMid = Math.floor(u);
      const deg = 8;
      let i0 = Math.max(0, Math.min(nSt - deg, iMid - 3));
      const m = Math.min(deg, nSt - i0);
      const w = new Float64Array(m);
      for (let i = 0; i < m; i++) {
        let num = 1, den = 1;
        const xi = i0 + i;
        for (let j = 0; j < m; j++) {
          if (j === i) continue;
          num *= (u - (i0 + j));
          den *= (xi - (i0 + j));
        }
        w[i] = num / den;
      }
      const res = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < m; i++) {
        const wi = w[i], base = (i0 + i) * 6;
        for (let c = 0; c < 6; c++) res[c] += wi * stateData[base + c];
      }
      return res;
    };

    for (const k of winList) {
      const outF = path.join(outDir, `win-${String(k).padStart(2, '0')}.json`);
      if (fs.existsSync(outF)) continue;
      const t0 = Date.now();
      const w = windows[k];
      const winStartMs = Math.round((w.startJd - 2440587.5) * DAY_MS);
      const winEndMs = winStartMs + WIN_HOURS * HOUR_MS;
      // Pick the latest cycle published <= winStartMs (0-8h freshness!), with next/prev fallback if a sat is missing
      const prefCycles = allCycles.filter((c) => c.ms <= winStartMs + 15 * 60000).reverse();
      const fallbackCycles = allCycles.filter((c) => c.ms > winStartMs + 15 * 60000 && c.ms <= winEndMs + 8 * HOUR_MS);
      const tryCycles = [...prefCycles.slice(0, 3), ...fallbackCycles.slice(0, 2)];

      // Precompute window timestamps
      const ts = new Float64Array(nTimes);
      const halfMs = (SEG_SEC / 2) * 1000;
      for (let s = 0; s < N_SEGS; s++) {
        const midMs = winStartMs + (s + 0.5) * SEG_SEC * 1000;
        const jStart = s === 0 ? 0 : 1;
        for (let j = jStart; j < CHEB_M; j++) ts[s * CHEB_N + j] = midMs + CHEB_X[j] * halfMs;
      }
      const nObj = norads.length;
      const statesByTime = Array.from({ length: nTimes }, () => new Float64Array(6 * nObj));
      const validMask = new Uint8Array(nObj);
      for (let idx = 0; idx < nObj; idx++) {
        const id = norads[idx];
        let filled = false;
        for (const cyc of tryCycles) {
          const f = path.join(CYCLES_DIR, cyc.name, `${id}.ocm`);
          if (!fs.existsSync(f)) continue;
          try {
            const raw = fs.readFileSync(f);
            const u = raw.readUInt32LE(0) + 4 === raw.length ? raw.subarray(4) : raw;
            const o = OCM_MOD.OCM.getRootAsOCM(new fb.ByteBuffer(u));
            const md = o.METADATA();
            const st0 = Date.parse(md.START_TIME());
            const stepMs = o.STATE_STEP_SIZE() * 1000;
            const arr = o.stateDataArray();
            if (!arr || arr.length < 48 || !Number.isFinite(st0)) continue;
            const nSt = arr.length / 6;
            const spanEnd = st0 + (nSt - 1) * stepMs;
            if (st0 > winStartMs + 1000 || spanEnd < winEndMs - 1000) continue;
            let ok = true;
            for (let t = 0; t < nTimes; t++) {
              const sv = lagrange6(arr, nSt, st0, stepMs, ts[t]);
              if (!sv || !Number.isFinite(sv[0])) { ok = false; break; }
              const dst = statesByTime[t];
              for (let c = 0; c < 6; c++) dst[c * nObj + idx] = sv[c];
            }
            if (ok) { filled = true; break; }
          } catch {}
        }
        if (filled) validMask[idx] = 1;
      }
      const { sources, prwFrames } = buildPrwFrames({ ca, arm, frameName: 'GCRF', winStartMs, statesByTime, validMask, norads });
      const handle = await CAT_SCR.prepareIndex(invoke, sources, prwFrames);
      const reqBytes = CAT_SCR.windowRequest(handle, 'GCRF', w, controls);
      const run = await ALL_VS.screenAllVsAllOnGpu({ invoke, decodeCatalogResult: CAT_SCR.decodeCatalogResult, request: reqBytes, thresholdKm: 5.0, coarseStepSec: 60 });
      await CAT_SCR.releaseIndex(invoke, handle);
      const events = run.events.map((e) => ({ a: e.PRIMARY_NORAD_ID, b: e.SECONDARY_NORAD_ID, tcaJd: e.TCA.JULIAN_DATE, missM: e.MISS_DISTANCE_M, speedMS: e.RELATIVE_SPEED_M_S }));
      fs.writeFileSync(outF, JSON.stringify({ arm, k, screened: sources.length, total: nObj, cycleUsed: tryCycles[0]?.name, events, sec: +((Date.now() - t0) / 1000).toFixed(1) }));
      console.log(`[b2-scr ${arm} w${k}] screened=${sources.length}/${nObj} ev=${events.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
    await caH.destroy();
    process.exit(0);
  }

  // OCM-based arms: gpSgp4Xp, gpSdnAp, spacexSgp4Xp, spacexSdnAp via signed public SDN-AP 0.7.5 sdnap_epochs_at (TEME) -> CA 0.19.3
  const AP_WASM = path.join(MODULES, 'propagator/sdn-ap/dist/isomorphic/module.wasm');
  const typeRef = (c) => ({ schemaName: `${c}.fbs`, fileIdentifier: `$${c}`, rootTypeName: c, wireFormat: 'flatbuffer' });
  const bin = fs.readFileSync(path.join(RUN_DIR, `${arm}.ocm.bin`));
  const apH = await createBrowserModuleHarness({ wasmSource: fs.readFileSync(AP_WASM), surface: 'direct', initialMemoryBytes: 128 * 1024 * 1024 });
  const lr = await apH.invoke({ methodId: 'load_epochs', inputs: [{ portId: 'ocm', typeRef: typeRef('OCM'), payload: bin }] });
  if (lr.statusCode !== 0) throw new Error(`load_epochs (${arm}) failed: ${lr.errorMessage}`);
  const x = apH.instance.exports;
  const nObj = x.sdnap_epochs_count();
  const infoPtr = x.sdnap_alloc(24);
  const loadedNorads = [];
  for (let i = 0; i < nObj; i++) {
    x.sdnap_epochs_series(i, infoPtr, 0, 0);
    loadedNorads.push(Math.round(new Float64Array(apH.memory.buffer, infoPtr, 3)[0]));
  }
  const outPtr = x.sdnap_alloc(6 * nObj * 8);
  const stPtr = x.sdnap_alloc(nObj * 4);
  const halfMs = (SEG_SEC / 2) * 1000;

  for (const k of winList) {
    const outF = path.join(outDir, `win-${String(k).padStart(2, '0')}.json`);
    if (fs.existsSync(outF)) continue;
    const t0 = Date.now();
    const w = windows[k];
    const winStartMs = Math.round((w.startJd - 2440587.5) * DAY_MS);
    const statesByTime = new Array(nTimes);
    const validMask = new Uint8Array(nObj).fill(1);
    for (let s = 0; s < N_SEGS; s++) {
      const midMs = winStartMs + (s + 0.5) * SEG_SEC * 1000;
      const jStart = s === 0 ? 0 : 1;
      for (let j = jStart; j < CHEB_M; j++) {
        const tIdx = s * CHEB_N + j;
        const [jw, jf] = jdSplit(midMs + CHEB_X[j] * halfMs);
        const rc = x.sdnap_epochs_at(jw, jf, 0, nObj, 0, outPtr, stPtr, 0);
        if (rc !== 0) throw new Error(`sdnap_epochs_at rc=${rc}`);
        const stArr = new Int32Array(apH.memory.buffer, stPtr, nObj);
        const sv = new Float64Array(apH.memory.buffer, outPtr, 6 * nObj).slice();
        for (let i = 0; i < nObj; i++) {
          if (!validMask[i]) continue;
          if (stArr[i] !== 0) { validMask[i] = 0; continue; }
          const r2 = sv[i] * sv[i] + sv[nObj + i] * sv[nObj + i] + sv[2 * nObj + i] * sv[2 * nObj + i];
          if (!(r2 >= 6357 ** 2 && r2 <= 9.99e5 ** 2) || !Number.isFinite(sv[3 * nObj + i])) validMask[i] = 0;
        }
        statesByTime[tIdx] = sv;
      }
    }
    const { sources, prwFrames } = buildPrwFrames({ ca, arm, frameName: 'TEME', winStartMs, statesByTime, validMask, norads: loadedNorads });
    const handle = await CAT_SCR.prepareIndex(invoke, sources, prwFrames);
    const reqBytes = CAT_SCR.windowRequest(handle, 'TEME', w, controls);
    const run = await ALL_VS.screenAllVsAllOnGpu({ invoke, decodeCatalogResult: CAT_SCR.decodeCatalogResult, request: reqBytes, thresholdKm: 5.0, coarseStepSec: 60 });
    await CAT_SCR.releaseIndex(invoke, handle);
    const events = run.events.map((e) => ({ a: e.PRIMARY_NORAD_ID, b: e.SECONDARY_NORAD_ID, tcaJd: e.TCA.JULIAN_DATE, missM: e.MISS_DISTANCE_M, speedMS: e.RELATIVE_SPEED_M_S }));
    fs.writeFileSync(outF, JSON.stringify({ arm, k, screened: sources.length, total: nObj, events, sec: +((Date.now() - t0) / 1000).toFixed(1) }));
    console.log(`[b2-scr ${arm} w${k}] screened=${sources.length}/${nObj} ev=${events.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  await apH.destroy();
  await caH.destroy();
  process.exit(0);
}

// ---------- PARENT ORCHESTRATOR ----------
async function runParent() {
  const tStart = Date.now();
  const workers = Number(arg('--workers', '6'));
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const sds = await loadSdsAndSdk(MODULES);

  // 1. Load 2026-11-22 SOCRATES Plus CSV + exact Space-Track GP editions (<= CUT_MS) + SupGP (02:20:01Z < T0) + SpaceX pre-T0 cycle
  const socRows = loadSocratesRows();
  const socStatus = new Map();
  for (const r of socRows) { socStatus.set(r.a, r.aStatus); socStatus.set(r.b, r.bStatus); }
  const satcatStatus = new Map();
  if (fs.existsSync(SATCAT_CSV)) {
    const [hdr, ...body] = parseCsv(fs.readFileSync(SATCAT_CSV, 'utf8'));
    const cId = hdr.indexOf('NORAD_CAT_ID'), cSt = hdr.indexOf('OPS_STATUS_CODE');
    for (const r of body) satcatStatus.set(Number(r[cId]), r[cSt] || null);
  }
  const statusOf = (id) => socStatus.get(id) ?? satcatStatus.get(id) ?? '+';
  const isSocratesPair = (a, b) => Math.max(a, b) >= 100000 || !(statusOf(a) === '+' && statusOf(b) === '+');

  // Load GP snapshots & gp_history <= CUT_MS (2026-11-21T08:56:21Z)
  const gpDir = path.join(ARCHIVE, 'spacetrack/gp/2026');
  const gphDir = path.join(ARCHIVE, 'spacetrack/gp_history/by-creation/2026');
  const preDir = path.join(CYCLES_DIR, PRE_CYCLE);
  const preIds = new Set(fs.readdirSync(preDir).filter((f) => f.endsWith('.ocm') && /^\d+\.ocm$/.test(f)).map((f) => Number(f.slice(0, -4))));

  // Pick latest GP edition strictly <= CUT_MS per Starlink + 21-day history <= CUT_MS
  const gpLatest = new Map();
  const gpHist = new Map();
  const ingestGpRow = (r) => {
    const id = Number(r.NORAD_CAT_ID);
    if (!preIds.has(id)) return;
    const cMs = r.CREATION_DATE ? utcMs(r.CREATION_DATE) : utcMs(r.EPOCH);
    if (!(cMs <= CUT_MS)) return;
    const prev = gpLatest.get(id);
    if (!prev || utcMs(r.EPOCH) > utcMs(prev.EPOCH)) gpLatest.set(id, r);
    let m = gpHist.get(id);
    if (!m) { m = new Map(); gpHist.set(id, m); }
    m.set(r.EPOCH, r);
  };
  for (let ms = T0_MS - 21 * DAY_MS; ms <= T0_MS; ms += DAY_MS) {
    const f = path.join(gpDir, `${dayStr(ms)}.json.gz`);
    if (!fs.existsSync(f)) continue;
    for (const r of JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))) ingestGpRow(r);
  }
  for (const fn of fs.readdirSync(gphDir).filter((f) => f.endsWith('.json.gz') && f >= '2026-10-31' && f <= '2026-11-21T10').sort()) {
    for (const r of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(gphDir, fn))).toString('utf8'))) ingestGpRow(r);
  }

  // Load CelesTrak SupGP 2026-11-21T02:20:01Z (strictly 7h40m before T0)
  const supMap = new Map();
  for (const r of JSON.parse(zlib.gunzipSync(fs.readFileSync(SUPGP_SL_GZ)).toString('utf8'))) {
    supMap.set(Number(r.NORAD_CAT_ID), r);
  }

  const norads = [...gpLatest.keys()].sort((a, b) => a - b);
  const popSet = new Set(norads);
  const supCovered = norads.filter((id) => supMap.has(id)).length;
  console.log(`${nowUtc()} Part B2 population: ${norads.length} Starlinks in BOTH SpaceX pre-T0 & GP<=cut (${supCovered} covered by CelesTrak SupGP 02:20Z)`);

  // Verify 100% of SOCRATES Starlink-Starlink rows in popSet satisfy isSocratesPair
  const socPopRows5d = socRows.filter((r) => popSet.has(r.a) && popSet.has(r.b) && r.tcaMs >= T0_MS && r.tcaMs < END_MS);
  const ruleMatches = socPopRows5d.filter((r) => isSocratesPair(r.a, r.b)).length;
  console.log(`${nowUtc()} SOCRATES 2026-11-22 Starlink-Starlink rows in 5d pop: ${socPopRows5d.length} (${ruleMatches}/${socPopRows5d.length} match isSocratesPair rule)`);

  fs.writeFileSync(path.join(RUN_DIR, 'population.json'), JSON.stringify({
    norads, supCovered, socratesPopRows5d: socPopRows5d.length, ruleMatches,
    ge100k: norads.filter((id) => id >= 100000).length,
    nonPlusLt100k: norads.filter((id) => id < 100000 && statusOf(id) !== '+').length,
  }));

  // Write sgp4Control and supGpSgp4 OMM binary catalogs
  if (!fs.existsSync(path.join(RUN_DIR, 'sgp4Control.omm.bin'))) {
    fs.writeFileSync(path.join(RUN_DIR, 'sgp4Control.omm.bin'), Buffer.concat(norads.map((id) => gpJsonToOmm(gpLatest.get(id), sds, true))));
  }
  if (!fs.existsSync(path.join(RUN_DIR, 'supGpSgp4.omm.bin'))) {
    fs.writeFileSync(path.join(RUN_DIR, 'supGpSgp4.omm.bin'), Buffer.concat(norads.map((id) => gpJsonToOmm(supMap.get(id) ?? gpLatest.get(id), sds, true))));
  }

  // 2. Build missing causal OCM catalogs across `workers` shards
  const missingBuildArms = ['gpSdnAp', 'gpSgp4Xp', 'spacexSdnAp', 'spacexSgp4Xp'].filter((k) => !fs.existsSync(path.join(RUN_DIR, `${k}.ocm.bin`)));
  if (missingBuildArms.length) {
    console.log(`${nowUtc()} Building causal OCM catalogs [${missingBuildArms.join(', ')}] across ${workers} shards...`);
    const shards = Array.from({ length: workers }, () => []);
    norads.forEach((id, idx) => {
      const hList = [...gpHist.get(id).values()].sort((a, b) => utcMs(a.EPOCH) - utcMs(b.EPOCH));
      shards[idx % workers].push({ norad: id, gp: gpLatest.get(id), hist: hList });
    });
    shards.forEach((items, s) => {
      fs.writeFileSync(path.join(RUN_DIR, `build-shard-${s}.json`), JSON.stringify({ shard: s, items }));
    });
    await Promise.all(shards.map((_, s) => new Promise((resolve, reject) => {
      const c = spawn('nice', ['-n', '12', process.execPath, '--max-old-space-size=4096', SELF, '--build-worker', '--shard', String(s), '--arms', missingBuildArms.join(',')], { stdio: 'inherit', env: process.env });
      c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build shard ${s} exited ${code}`))));
    })));
    for (const k of missingBuildArms) {
      const parts = Array.from({ length: workers }, (_, s) => fs.readFileSync(path.join(RUN_DIR, `shard-${s}-${k}.ocm.bin`)));
      fs.writeFileSync(path.join(RUN_DIR, `${k}.ocm.bin`), Buffer.concat(parts));
    }
  }

  // 3. Screen ALL 7 catalogs across 30 x 4h = 120h windows through CA 0.19.3
  const SCREEN_ARMS = ['truthRef', 'sgp4Control', 'supGpSgp4', 'gpSgp4Xp', 'gpSdnAp', 'spacexSgp4Xp', 'spacexSdnAp'];
  const allWinIdx = Array.from({ length: N_WINS }, (_, i) => i);
  for (const arm of SCREEN_ARMS) {
    const outDir = path.join(RUN_DIR, `screen-${arm}`);
    const todo = allWinIdx.filter((k) => !fs.existsSync(path.join(outDir, `win-${String(k).padStart(2, '0')}.json`)));
    if (!todo.length) { console.log(`${nowUtc()} Screen ${arm}: all ${N_WINS} windows cached`); continue; }
    console.log(`${nowUtc()} Screening ${arm} (${todo.length}/${N_WINS} windows) across ${workers} workers via CA 0.19.3...`);
    const buckets = Array.from({ length: Math.min(workers, todo.length) }, (_, w) => todo.filter((_, i) => i % workers === w));
    await Promise.all(buckets.map((list, w) => new Promise((resolve, reject) => {
      const c = spawn('nice', ['-n', '12', process.execPath, '--max-old-space-size=4096', SELF, '--screen-worker', '--arm', arm, '--windows', list.join(',')], { stdio: 'inherit', env: process.env });
      c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`screen ${arm} w${w} exited ${code}`))));
    })));
  }

  // 4. Load & merge 1s encounters per arm, then score!
  const merge1s = (list) => {
    const sorted = list.map((e) => ({ ...e, key: pairKey(e.a, e.b) })).sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : x.tcaJd - y.tcaJd));
    const out = [];
    for (const e of sorted) {
      const last = out.at(-1);
      if (!(last && last.key === e.key && (e.tcaJd - last.tcaJd) * 86400 <= 1)) out.push(e);
    }
    return out;
  };
  const loadArmEvents = (arm) => {
    const dir = path.join(RUN_DIR, `screen-${arm}`);
    const raw = [];
    let minScreened = Infinity;
    for (let k = 0; k < N_WINS; k++) {
      const d = JSON.parse(fs.readFileSync(path.join(dir, `win-${String(k).padStart(2, '0')}.json`), 'utf8'));
      if (d.screened < minScreened) minScreened = d.screened;
      for (const e of d.events) raw.push(e);
    }
    return { events: merge1s(raw), minScreened };
  };

  const armData = {};
  for (const arm of SCREEN_ARMS) armData[arm] = loadArmEvents(arm);
  armData.socratesPublished = {
    events: merge1s(socPopRows5d.map((r) => ({ a: r.a, b: r.b, tcaJd: r.tcaJd, missM: r.missM, speedMS: r.speedMS }))),
    minScreened: norads.length,
  };

  const COMPARE_ARMS = ['socratesPublished', 'sgp4Control', 'supGpSgp4', 'gpSgp4Xp', 'gpSdnAp', 'spacexSgp4Xp', 'spacexSdnAp'];

  // Score arms against truthRef with 1-to-1 nearest matching within 60s, edge exclusion 60s, and 500-rep primary-NORAD cluster bootstrap!
  function scoreSubset(subsetName, pairFilter, hours, threshKm, armsList) {
    const tEndJd = T0_JD + hours / 24;
    const inInterior = (jd) => (jd - T0_JD) * 86400 >= 60 && (tEndJd - jd) * 86400 >= 60;
    const threshM = threshKm * 1000;

    const truthAll = armData.truthRef.events.filter((e) => pairFilter(e.a, e.b) && e.tcaJd >= T0_JD && e.tcaJd < tEndJd);
    const truthEdge = truthAll.filter((e) => !inInterior(e.tcaJd) && e.missM < threshM).length;
    const truth = truthAll.filter((e) => inInterior(e.tcaJd) && e.missM < threshM);

    // Pre-index truth by pairKey
    const truthByPair = new Map();
    truth.forEach((e, i) => { (truthByPair.get(e.key) ?? truthByPair.set(e.key, []).get(e.key)).push(i); });

    // Match each arm's interior predictions (< threshM) AND also match all < 5km predictions to truth (< threshM) for miss-distance error!
    const perArm = {};
    const clusters = new Set();
    const clusterOf = (e) => Math.min(e.a, e.b);
    for (const e of truth) clusters.add(clusterOf(e));

    for (const arm of armsList) {
      const predAll = armData[arm].events.filter((e) => pairFilter(e.a, e.b) && inInterior(e.tcaJd) && e.missM < threshM);
      for (const e of predAll) clusters.add(clusterOf(e));
      const cands = [];
      predAll.forEach((p, pi) => {
        for (const ti of truthByPair.get(p.key) ?? []) {
          const dt = Math.abs(p.tcaJd - truth[ti].tcaJd) * 86400;
          if (dt <= 60) cands.push([dt, ti, pi]);
        }
      });
      cands.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
      const tToP = new Int32Array(truth.length).fill(-1);
      const pToT = new Int32Array(predAll.length).fill(-1);
      for (const [, ti, pi] of cands) if (tToP[ti] < 0 && pToT[pi] < 0) { tToP[ti] = pi; pToT[pi] = ti; }

      const missErrs = [];
      const tpByCl = new Map(), fnByCl = new Map(), fpByCl = new Map();
      for (let ti = 0; ti < truth.length; ti++) {
        const cl = clusterOf(truth[ti]);
        if (tToP[ti] >= 0) {
          tpByCl.set(cl, (tpByCl.get(cl) || 0) + 1);
          missErrs.push(Math.abs(predAll[tToP[ti]].missM - truth[ti].missM));
        } else {
          fnByCl.set(cl, (fnByCl.get(cl) || 0) + 1);
        }
      }
      for (let pi = 0; pi < predAll.length; pi++) {
        if (pToT[pi] < 0) {
          const cl = clusterOf(predAll[pi]);
          fpByCl.set(cl, (fpByCl.get(cl) || 0) + 1);
        }
      }
      const tp = tToP.filter((x) => x >= 0).length;
      const fn = truth.length - tp;
      const fp = predAll.length - tp;
      const rec = truth.length ? tp / truth.length : null;
      const prec = predAll.length ? tp / predAll.length : null;
      const f1 = rec && prec ? (2 * rec * prec) / (rec + prec) : 0;
      missErrs.sort((a, b) => a - b);
      perArm[arm] = {
        predicted: predAll.length, hits: tp, misses: fn, falseWarnings: fp,
        recall: rec !== null ? +rec.toFixed(4) : null,
        precision: prec !== null ? +prec.toFixed(4) : null,
        f1: +f1.toFixed(4),
        matchedMissErrMedianM: missErrs.length ? +quantile(missErrs, 0.5).toFixed(1) : null,
        matchedMissErrP95M: missErrs.length ? +quantile(missErrs, 0.95).toFixed(1) : null,
        tpByCl, fnByCl, fpByCl,
      };
    }

    // 500-replicate paired cluster bootstrap 95% CIs (by clusterOf = min NORAD ID)
    const clArr = [...clusters];
    const B = 500;
    const rng = rngOf(`socrates-comparison-075-20261126:${subsetName}:${hours}h:${threshKm}km`);
    const bs = Object.fromEntries(armsList.map((a) => [a, { rec: [], prec: [], fp: [], dRecVsSoc: [], fpCutVsSoc: [] }]));
    const baseArm = armsList.includes('socratesPublished') ? 'socratesPublished' : 'sgp4Control';
    if (clArr.length >= 10) {
      for (let b = 0; b < B; b++) {
        const mult = new Map();
        for (let i = 0; i < clArr.length; i++) {
          const c = clArr[Math.floor(rng() * clArr.length)];
          mult.set(c, (mult.get(c) || 0) + 1);
        }
        const sumA = {};
        for (const arm of armsList) {
          const pa = perArm[arm];
          let tp = 0, fn = 0, fp = 0;
          for (const [c, w] of mult) {
            tp += (pa.tpByCl.get(c) || 0) * w;
            fn += (pa.fnByCl.get(c) || 0) * w;
            fp += (pa.fpByCl.get(c) || 0) * w;
          }
          sumA[arm] = { tp, fn, fp, rec: tp + fn > 0 ? tp / (tp + fn) : NaN, prec: tp + fp > 0 ? tp / (tp + fp) : NaN };
        }
        for (const arm of armsList) {
          bs[arm].rec.push(sumA[arm].rec);
          bs[arm].prec.push(sumA[arm].prec);
          bs[arm].fp.push(sumA[arm].fp);
          if (Number.isFinite(sumA[baseArm].rec) && Number.isFinite(sumA[arm].rec)) bs[arm].dRecVsSoc.push((sumA[arm].rec - sumA[baseArm].rec) * 100);
          if (sumA[baseArm].fp > 0) bs[arm].fpCutVsSoc.push(100 * (1 - sumA[arm].fp / sumA[baseArm].fp));
        }
      }
    }
    const ci = (arr, digits = 4) => {
      const s = arr.filter(Number.isFinite).sort((a, b) => a - b);
      return s.length >= 10 ? [+quantile(s, 0.025).toFixed(digits), +quantile(s, 0.975).toFixed(digits)] : null;
    };
    const armsClean = {};
    for (const arm of armsList) {
      const pa = perArm[arm];
      const baseFp = perArm[baseArm].falseWarnings;
      const baseMiss = perArm[baseArm].misses;
      armsClean[arm] = {
        predicted: pa.predicted,
        hits: pa.hits,
        misses: pa.misses,
        falseWarnings: pa.falseWarnings,
        recall: pa.recall,
        recallCi95: ci(bs[arm].rec, 4),
        precision: pa.precision,
        precisionCi95: ci(bs[arm].prec, 4),
        f1: pa.f1,
        matchedMissErrMedianM: pa.matchedMissErrMedianM,
        matchedMissErrP95M: pa.matchedMissErrP95M,
        recallDeltaPctPtsVsBaseline: pa.recall !== null && perArm[baseArm].recall !== null ? +((pa.recall - perArm[baseArm].recall) * 100).toFixed(2) : null,
        recallDeltaPctPtsCi95: ci(bs[arm].dRecVsSoc, 2),
        falseWarningCutPctVsBaseline: baseFp > 0 ? +(100 * (1 - pa.falseWarnings / baseFp)).toFixed(2) : null,
        falseWarningCutPctCi95: ci(bs[arm].fpCutVsSoc, 2),
        missCutPctVsBaseline: baseMiss > 0 ? +(100 * (1 - pa.misses / baseMiss)).toFixed(2) : null,
      };
    }
    return { truthEvents: truth.length, truthEdgeExcluded: truthEdge, clusters: clArr.length, baselineArm: baseArm, arms: armsClean };
  }

  const scored = { socratesIncludedStarlinkPairs: {}, allStarlinkPairs: {} };
  for (const hrs of [24, 72, 120]) {
    scored.socratesIncludedStarlinkPairs[`${hrs}h`] = {
      lt1km: scoreSubset('soc', isSocratesPair, hrs, 1, COMPARE_ARMS),
      lt5km: scoreSubset('soc', isSocratesPair, hrs, 5, COMPARE_ARMS),
    };
    scored.allStarlinkPairs[`${hrs}h`] = {
      lt1km: scoreSubset('all', () => true, hrs, 1, COMPARE_ARMS.filter((a) => a !== 'socratesPublished')),
      lt5km: scoreSubset('all', () => true, hrs, 5, COMPARE_ARMS.filter((a) => a !== 'socratesPublished')),
    };
  }

  // Also check parity between published SOCRATES Plus and our sgp4Control on 2026-11-22!
  const soc5d = armData.socratesPublished.events.filter((e) => (e.tcaJd - T0_JD) * 86400 >= 60 && (T0_JD + 5 - e.tcaJd) * 86400 >= 60);
  const ctrl5d = armData.sgp4Control.events.filter((e) => isSocratesPair(e.a, e.b));
  const ctrlByPair = new Map();
  ctrl5d.forEach((e, i) => { (ctrlByPair.get(e.key) ?? ctrlByPair.set(e.key, []).get(e.key)).push(i); });
  let ctrlMatchedSoc = 0;
  const ctrlMissDiffs = [];
  for (const r of soc5d) {
    let best = null;
    for (const ci of ctrlByPair.get(r.key) ?? []) {
      const dt = Math.abs(ctrl5d[ci].tcaJd - r.tcaJd) * 86400;
      if (dt <= 60 && (!best || dt < best[0])) best = [dt, ci];
    }
    if (best) {
      ctrlMatchedSoc++;
      ctrlMissDiffs.push(Math.abs(ctrl5d[best[1]].missM - r.missM));
    }
  }
  ctrlMissDiffs.sort((a, b) => a - b);

  // 5. Audit Space-Track cdm_public (2026-11-21..26) against 2026-11-22 SOCRATES Plus
  const cdmDir = path.join(ARCHIVE, 'spacetrack/cdm_public/2026');
  const cdmMap = new Map();
  for (const d of ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']) {
    const f = path.join(cdmDir, `${d}.json.gz`);
    if (!fs.existsSync(f)) continue;
    for (const c of JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))) {
      const tcaMs = utcMs(c.TCA);
      if (!(tcaMs >= T0_MS && tcaMs < END_MS)) continue;
      const a = Number(c.SAT_1_ID), b = Number(c.SAT_2_ID);
      const key = `${Math.min(a, b)}-${Math.max(a, b)}-${Math.round(tcaMs / 3600000)}`;
      const prev = cdmMap.get(key);
      if (!prev || utcMs(c.CREATED) > utcMs(prev.CREATED)) cdmMap.set(key, c);
    }
  }
  const fullSocPairSet = new Set(socRows.map((r) => pairKey(r.a, r.b)));
  const cdmList = [...cdmMap.values()];
  const cdmMatchedFullSoc = cdmList.filter((c) => fullSocPairSet.has(pairKey(Number(c.SAT_1_ID), Number(c.SAT_2_ID)))).length;

  const b2Doc = {
    schema: 'sdn-ap-socrates-part-b2-1',
    generatedUtc: nowUtc(),
    socratesRun: {
      day: '2026-11-22',
      windowStartUtc: T0_ISO,
      scoredEndUtc: '2026-11-26T10:00:00.000Z',
      scoredDays: SCORED_DAYS,
      gpCutUtc: CUT_ISO,
      totalSocratesRows7d: socRows.length,
      socratesStarlinkPairsInPop5d: socPopRows5d.length,
      populationRuleVerified: `${ruleMatches}/${socPopRows5d.length}`,
    },
    population: {
      starlinksInBothPreSpaceXAndGp: norads.length,
      supGpCoveredBeforeT0: supCovered,
      supGpFileUtc: '2026-11-21T02:20:01Z',
      spacexPreT0CycleUtc: '2026-11-21T08:57:57Z',
      numberedGe100k: norads.filter((id) => id >= 100000).length,
      nonOperationalLt100k: norads.filter((id) => id < 100000 && statusOf(id) !== '+').length,
    },
    truthDisclosure: 'Reference trajectories are stitched from SpaceX subsequent 8-hourly ephemerides (0-8 h freshness), screened directly by CA 0.19.3 independently of all candidate arms. This is operator ephemeris self-consistency, NOT independent laser/radar/GNSS tracking.',
    controlParityOn20261122: {
      socratesInterior5d: soc5d.length,
      matchedByCa0193Sgp4Control: ctrlMatchedSoc,
      matchRate: soc5d.length ? +(ctrlMatchedSoc / soc5d.length).toFixed(5) : null,
      missDiffMedianM: ctrlMissDiffs.length ? +quantile(ctrlMissDiffs, 0.5).toFixed(3) : null,
      missDiffP99M: ctrlMissDiffs.length ? +quantile(ctrlMissDiffs, 0.99).toFixed(3) : null,
    },
    cdmPublicAudit5d: {
      uniqueEventsIn5d: cdmList.length,
      matchingAnySocratesPair: cdmMatchedFullSoc,
    },
    scored,
    wallMinutes: +((Date.now() - tStart) / 60000).toFixed(2),
  };

  fs.writeFileSync(B2_OUT, `${JSON.stringify(b2Doc, null, 2)}\n`);

  // Combine Part B1 + Part B2 into final results/ca-rollup-075/socrates-comparison-0.7.5.json
  const b1Doc = fs.existsSync(B1_PATH) ? JSON.parse(fs.readFileSync(B1_PATH, 'utf8')) : null;
  const reg = JSON.parse(fs.readFileSync(path.join(path.dirname(SELF), 'REGISTRATION.json'), 'utf8'));
  const combined = {
    schema: 'sdn-ap-socrates-comparison-1',
    version: '0.7.5',
    generatedUtc: nowUtc(),
    registration: reg,
    partB1_20261028_independentTruth7d: b1Doc,
    partB2_20261122_scoredScreening5d: b2Doc,
  };
  fs.mkdirSync(path.dirname(FINAL_OUT), { recursive: true });
  fs.writeFileSync(FINAL_OUT, `${JSON.stringify(combined, null, 2)}\n`);

  console.log(`\n=== PART B2 COMPLETE (${b2Doc.wallMinutes} min) -> ${FINAL_OUT} ===`);
  for (const hrs of ['24h', '72h', '120h']) {
    for (const th of ['lt1km', 'lt5km']) {
      const r = scored.socratesIncludedStarlinkPairs[hrs][th];
      console.log(`\n--- SOCRATES-included Starlink pairs ${hrs} ${th} (truth=${r.truthEvents}, clusters=${r.clusters}) ---`);
      for (const arm of COMPARE_ARMS) {
        const a = r.arms[arm];
        console.log(`  ${arm.padEnd(18)} pred=${String(a.predicted).padStart(5)} hits=${String(a.hits).padStart(5)} miss=${String(a.misses).padStart(5)} fp=${String(a.falseWarnings).padStart(5)} rec=${(a.recall*100).toFixed(1)}% prec=${(a.precision*100).toFixed(1)}% missErrMed=${a.matchedMissErrMedianM}m`);
      }
    }
  }
}

if (has('--build-worker')) await buildWorker();
else if (has('--screen-worker')) await screenWorker();
else await runParent();
process.exit(0);
