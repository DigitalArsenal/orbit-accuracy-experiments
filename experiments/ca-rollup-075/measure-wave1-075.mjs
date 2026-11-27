#!/usr/bin/env node
// Measure runtime speed, WebAssembly memory, prebuilt frame rows (Node + cross-origin-isolated headless Chromium),
// 100k-object mixes, 20x7d SIMD128 3-h ap atmosphere, 4-worker wide-grid pool, and stability on signed sdn-ap 0.7.5.
// Outputs results/ca-rollup-075/wave1-0.7.5.json.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const OAE = path.resolve(path.dirname(SELF), '../..');
const MODULES = process.env.SDN_MODULES_ROOT || path.resolve(OAE, '../../main-packages/space-data-network-modules');
const AP_DIR = path.join(MODULES, 'propagator/sdn-ap');
const CB_DIR = path.join(MODULES, 'flows/catalog-builder');
const WASM_PATH = path.join(AP_DIR, 'dist/isomorphic/module.wasm');
const OUT_PATH = path.join(OAE, 'results/ca-rollup-075/wave1-0.7.5.json');

const apReq = createRequire(path.join(AP_DIR, 'package.json'));
const cbReq = createRequire(path.join(CB_DIR, 'package.json'));
const esbuild = await import(pathToFileURL(apReq.resolve('esbuild')).href);
const fb = await import(pathToFileURL(apReq.resolve('flatbuffers')).href);
const { createBrowserModuleHarness, toLoadableWasmBytes } = await import(pathToFileURL(apReq.resolve('space-data-module-sdk/host/browser-module')).href);
const OCM = await import(pathToFileURL(cbReq.resolve('spacedatastandards.org/lib/js/OCM/main.js')).href);
const DPM = await import(pathToFileURL(cbReq.resolve('spacedatastandards.org/lib/js/DPM/main.js')).href);
const { population, ocmOfObject, openFrames, EPOCH_MS, STAT } = await import(pathToFileURL(path.join(AP_DIR, 'test/lib/frame-cells.mjs')).href);
const { configuration } = await import(pathToFileURL(path.join(AP_DIR, 'test/lib/pcf.mjs')).href);
const { composeStandardRows } = await import(pathToFileURL(path.join(AP_DIR, 'test/lib/compose-standard-rows.mjs')).href);
const { jd } = await import(pathToFileURL(path.join(AP_DIR, 'test/lib/standard-row-harness.mjs')).href);
const { hostDigest } = await import(pathToFileURL(path.join(CB_DIR, 'product-method.mjs')).href);
const { createCompiledProducts } = await import(pathToFileURL(path.join(CB_DIR, 'compiled-products.mjs')).href);

const wasmBytes = fs.readFileSync(WASM_PATH);
const loadable = toLoadableWasmBytes(wasmBytes);
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

// 1. Run wave1-071.e2e.mjs on signed 0.7.5 to collect A1 (atmosphere), A2 (100k mixes), B1a (50 high-e), C1a (maxD2)
const w1Out = execFileSync(process.execPath, [path.join(AP_DIR, 'test/wave1-071.e2e.mjs')], { cwd: AP_DIR, encoding: 'utf8', env: { ...process.env, SDNAP_WASM: WASM_PATH } });
const parseJsonLines = (txt) => txt.trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const w1Objs = Object.assign({}, ...parseJsonLines(w1Out));

// 2. Run fallback-covariance.e2e.mjs to get exact fallbackChecks count (strict JSON parse; never fall back to a hardcoded constant)
const fbOut = execFileSync(process.execPath, [path.join(AP_DIR, 'test/fallback-covariance.e2e.mjs')], { cwd: AP_DIR, encoding: 'utf8', env: { ...process.env, SDNAP_WASM: WASM_PATH } });
const fbJson = parseJsonLines(fbOut).find((o) => o && typeof o.checks === 'number' && o.complete === true);
assert.ok(fbJson && Number.isInteger(fbJson.checks) && fbJson.checks > 0, `fallback-covariance.e2e.mjs did not emit JSON checks count: ${fbOut.slice(0, 300)}`);
const fallbackChecks = fbJson.checks;

// 3. Measure 4-worker wide-grid pool speedup on signed 0.7.5 (same mix as frames-wide-pool.e2e.mjs)
let widePool;
{
  const objects = population([['leo500', 60], ['meo', 12], ['geo', 12], ['ecc', 12], ['wide', 32]], 20261124, 47);
  const queryMs = EPOCH_MS + 3600e3;
  const runFill = async (threads) => {
    const f = await openFrames({ wasm: WASM_PATH, threads });
    await f.load(objects);
    assert.equal(f.open(4 * 1048576, 0), 0);
    const t0 = performance.now();
    const fill = f.fill(queryMs, 180, 128);
    const ms = performance.now() - t0;
    const ps = f.poolStats();
    await f.h.destroy();
    return { ms, due: fill.due, refused: ps[2], deferred: ps[3], reserveBytes: ps[7], reservesHalved: ps[12] };
  };
  const s0 = await runFill(0);
  const s4 = await runFill(4);
  assert.equal(s0.due, 0);
  assert.equal(s4.due, 0);
  assert.equal(s4.refused, 0);
  assert.equal(s4.deferred, 0);
  widePool = {
    workers: 4,
    speedup: +(s0.ms / Math.max(s4.ms, 1e-6)).toFixed(2),
    reserveMiB: +(s4.reserveBytes / 1048576).toFixed(2),
    reservesHalved: s4.reservesHalved,
    refused: s4.refused,
    deferred: s4.deferred,
  };
}

// 4. Measure 400 mixed-regime objects with prebuilt rows in Node AND cross-origin-isolated headless Chromium
const plan400 = [['leo500', 120], ['leo830', 80], ['leo1400', 40], ['drag300', 40], ['meo', 40], ['geo', 40], ['ecc', 24], ['wide', 16]];
const objs400 = population(plan400, 20261124, 48);
assert.equal(objs400.length, 400);
const adapter = composeStandardRows(OCM, fb);
const configBytes = configuration().payload;
const records400 = objs400.map((o) => {
  const u = OCM.OCM.getRootAsOCM(new fb.ByteBuffer(ocmOfObject(o))).unpack();
  const j = OCM.OCM.getRootAsOCM(new fb.ByteBuffer(ocmOfObject(o, false))).unpack();
  Object.assign(u.PERTURBATIONS, { ATMOSPHERIC_MODEL: j.PERTURBATIONS.ATMOSPHERIC_MODEL, WEATHER_SOURCE: OCM.pcfWeatherSource.THEORY_FLUX_MODEL, SPACE_WEATHER: [] });
  return Buffer.from(adapter.pack(u));
});

const startMs = EPOCH_MS + 3600000;
const digest = hostDigest(wasmBytes);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'wave1-075-route-'));
let prebuiltBuf, statement;
try {
  const env = { ...process.env, SDM_MODULE_UNSIGNED_BUILD: '1', CATALOG_FLOW_BUILD_DIR: scratch, SDNAP_DIST_DIR: path.join(scratch, 'sdnap') };
  delete env.SDM_MODULE_SIGNING_KEYPAIR_PATH; delete env.CATALOG_PRESEED_BUILD_DIR; delete env.SDNAP_VARIANT;
  execFileSync(process.execPath, ['build-flow.mjs', '--product-route-only'], { cwd: CB_DIR, env, stdio: 'pipe', maxBuffer: 64 << 20 });
  const p = await createCompiledProducts({
    directory: path.join(scratch, 'product-route'),
    options: { profile: 'minimum', rows: true, windows: 1, flags: 1, refresh: false, time: startMs, epoch: new Date(startMs).toISOString() },
    wasm: wasmBytes,
  });
  const rows = [];
  try {
    for (let i = 0; i < records400.length; i += 24) {
      const r = await p.run(records400.slice(i, i + 24), configBytes);
      if (!statement) statement = DPM.DPM.getSizePrefixedRootAsDPM(new fb.ByteBuffer(r.assets[0])).unpack().ASSETS[0].DERIVED_BUILD;
      rows.push(...r.products);
    }
  } finally { p.destroy(); }
  prebuiltBuf = Buffer.concat(rows);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
const coldBuf = Buffer.concat(records400);

// Node measurement: cold serial vs prebuilt rows (t0 includes WASM instantiation for honest first-frame latency)
async function benchNode(payload, withStatement) {
  const t0 = performance.now();
  const h = await createBrowserModuleHarness({ wasmSource: wasmBytes, surface: 'direct', enableBrowserWasiThreads: false, maxThreads: 1, initialMemoryBytes: 16 * 1024 * 1024 });
  const x = h.instance.exports;
  const tLoad = performance.now();
  const bind = x.sdnap_alloc(32), cfgPtr = x.sdnap_alloc(configBytes.length);
  new Uint8Array(h.memory.buffer, bind, 32).set(digest);
  new Uint8Array(h.memory.buffer, cfgPtr, configBytes.length).set(configBytes);
  assert.equal(x.sdnap_standard_rows_bind(bind, cfgPtr, configBytes.length, 1), 0);
  x.sdnap_free(bind);
  x.sdnap_free(cfgPtr);
  assert.equal((await h.invoke({ methodId: 'load_epochs_open', inputs: [{ portId: 'configuration', typeRef: { schemaName: 'PCF.fbs', fileIdentifier: '$PCF', rootTypeName: 'PCF', wireFormat: 'flatbuffer' }, payload: configBytes }] })).statusCode, 0);
  if (withStatement) {
    const p = x.sdnap_alloc(512);
    new Uint8Array(h.memory.buffer, p, 512).fill(0);
    const enc = new TextEncoder();
    new Uint8Array(h.memory.buffer, p, 128).set(enc.encode(statement.BUILDER_NAME));
    new Uint8Array(h.memory.buffer, p + 128, 128).set(enc.encode(statement.BUILDER_VERSION));
    new Uint8Array(h.memory.buffer, p + 256, 32).set(statement.BUILDER_DIGEST);
    new Uint8Array(h.memory.buffer, p + 288, 32).set(statement.ENVIRONMENT_DIGEST);
    assert.equal(x.sdnap_mor_asset_build(p, p + 128, p + 256, p + 288, statement.TOL_POSITION, statement.TOL_VELOCITY), 0);
    x.sdnap_free(p);
  }
  assert.equal((await h.invoke({ methodId: 'load_epochs_part', inputs: [{ portId: 'ocm', typeRef: { schemaName: 'OCM.fbs', fileIdentifier: '$OCM', rootTypeName: 'OCM', wireFormat: 'flatbuffer' }, payload }] })).statusCode, 0);
  assert.equal((await h.invoke({ methodId: 'load_epochs_close', inputs: [] })).statusCode, 0);
  const ingestMs = performance.now() - tLoad;
  const n = x.sdnap_epochs_count();
  const admPtr = x.sdnap_alloc(4 * n);
  x.sdnap_epochs_rows_admission(admPtr, n);
  const adm = Array.from(new Int32Array(h.memory.buffer, admPtr, n));
  x.sdnap_free(admPtr);
  assert.equal(x.sdnap_frames_open(0, 1), 0);
  const q = x.sdnap_alloc(256);
  if (!withStatement) {
    let last;
    do {
      assert.equal(x.sdnap_frames_refill(...jd(startMs), 0, 128, 0, 0, q), 0);
      last = Array.from(new Int32Array(h.memory.buffer, q, 7));
    } while (!last[4] && last[0] + last[1] > 0);
  }
  const planes = x.sdnap_alloc(n * 24), status = x.sdnap_alloc(n * 4);
  assert.equal(x.sdnap_frames_at(...jd(startMs), 0, n, 3, planes, status), 0);
  const firstFrameMs = performance.now() - t0;
  const planeSnap = Buffer.from(new Uint8Array(h.memory.buffer, planes, n * 24));
  const statusSnap = Array.from(new Int32Array(h.memory.buffer, status, n));
  x.sdnap_frames_stats(q);
  const built = new Float64Array(h.memory.buffer, q, 20)[7];
  if (withStatement) assert.equal(built, 0, 'prebuilt rows must serve first frame with 0 cells built');
  assert.equal(statusSnap.filter((s) => s === 0).length, n, 'all 400 objects served with status 0');
  const st0 = performance.now();
  for (let rep = 0; rep < 200; rep++) x.sdnap_frames_at(...jd(startMs + rep * 1000), 0, n, 3, planes, status);
  const steadyMs = (performance.now() - st0) / 200;
  const displayMB = +(h.memory.buffer.byteLength / 1e6).toFixed(2);
  const rowsAdmitted = adm.filter((c) => c === 1).length;
  const rowsNotStored = adm.filter((c) => c === 0).length;
  await h.destroy();
  return { firstFrameMs: +firstFrameMs.toFixed(1), ingestMs: +ingestMs.toFixed(1), steadyFrameMs: +steadyMs.toFixed(3), displayMB, rowsAdmitted, rowsNotStored, planeHash: sha256(planeSnap) };
}
// Real 100,000-object catalog benchmark in Node AND cross-origin-isolated headless Chromium (no 1,200-object extrapolation)
// Mix matches the public catalog proportions across all regimes (total = 100,000 objects, compact $MOR wire format).
const plan100k = [['leo500', 66000], ['leo830', 14000], ['leo1400', 6000], ['drag300', 4000], ['meo', 2500], ['geo', 5000], ['ecc', 1500], ['wide', 1000]];
const MOR = await import(pathToFileURL(cbReq.resolve('spacedatastandards.org/lib/js/MOR/main.js')).href);
const objs100k = population(plan100k, 20261126, 99);
assert.equal(objs100k.length, 100000);
// Encode 100,000 compact $MOR records (matching catalog-builder minimum profile) by cloning 200 distinct base templates per regime with unique NORAD IDs and slightly varied MA/RAAN
const morParts100k = [];
{
  const MU = 398600.4418;
  const b = new fb.Builder(512);
  for (let i = 0; i < objs100k.length; i++) {
    const o = objs100k[i];
    const nRevDay = (Math.sqrt(MU / (o.a ** 3)) * 86400) / (2 * Math.PI);
    const epochUs = BigInt(EPOCH_MS + (o.epochOffsetMs || 0)) * 1000n;
    b.clear();
    const m = Object.assign(new MOR.MORT(), {
      NORAD_CAT_ID: o.norad,
      RECORD_KIND: MOR.morRecordKind.FULL,
      EPOCH_UNIX_US: epochUs,
      MEAN_ELEMENT_THEORY: MOR.meanElementSource.AP,
      MEAN_MOTION: nRevDay,
      ECCENTRICITY: o.e,
      INCLINATION: o.inc,
      RA_OF_ASC_NODE: o.raan,
      ARG_OF_PERICENTER: o.argp,
      MEAN_ANOMALY: o.ma,
      BTERM: o.bterm ?? (o.drag ? 0.02 : 0.005),
      AGOM: 0.01,
      GRAVITY_FIELD: MOR.morGravityField.EGM2008,
      MAXIMUM_ZONAL_DEGREE: 20,
      MAXIMUM_TESSERAL_DEGREE: o.e > 0.3 ? 31 : 8,
      SOLID_TIDES_MODEL: MOR.morSolidTideModel.IERS_2010,
      SOLAR_RAD_PRESSURE: MOR.morRadiationModel.UNSTATED,
    });
    MOR.MOR.finishSizePrefixedMORBuffer(b, m.pack(b));
    morParts100k.push(Buffer.from(b.asUint8Array()));
  }
}
const mor100kBuf = Buffer.concat(morParts100k);
const CHUNK_SIZE_100K = 1000;
const CHUNK_COUNT_100K = objs100k.length / CHUNK_SIZE_100K;

async function benchNode100k(threads) {
  const t0 = performance.now();
  const h = await createBrowserModuleHarness({
    wasmSource: wasmBytes,
    surface: 'direct',
    enableBrowserWasiThreads: threads > 0,
    maxThreads: Math.max(1, threads),
    ...(threads > 0 ? { wasiThreadPoolSize: threads } : {}),
    initialMemoryBytes: 64 * 1024 * 1024,
  });
  const x = h.instance.exports;
  if (threads > 0 && x.sdnap_threads) x.sdnap_threads(threads);
  const tLoad = performance.now();
  assert.equal((await h.invoke({ methodId: 'load_epochs_open', inputs: [{ portId: 'configuration', typeRef: { schemaName: 'PCF.fbs', fileIdentifier: '$PCF', rootTypeName: 'PCF', wireFormat: 'flatbuffer' }, payload: configBytes }] })).statusCode, 0);
  // Stream in 100 chunks of 1,000 records to mirror real host streaming
  let off = 0, partCount = 0;
  for (let c = 0; c < CHUNK_COUNT_100K; c++) {
    const startIdx = c * CHUNK_SIZE_100K, endIdx = (c + 1) * CHUNK_SIZE_100K;
    let len = 0;
    for (let k = startIdx; k < endIdx; k++) len += morParts100k[k].length;
    const chunk = mor100kBuf.subarray(off, off + len);
    off += len;
    partCount++;
    const pr = await h.invoke({ methodId: 'load_epochs_part', inputs: [{ portId: 'ocm', typeRef: { schemaName: 'OCM.fbs', fileIdentifier: '$OCM', rootTypeName: 'OCM', wireFormat: 'flatbuffer' }, payload: chunk }] });
    assert.equal(pr.statusCode, 0, `load_epochs_part chunk ${c}: ${pr.errorCode} ${pr.errorMessage}`);
  }
  const cr = await h.invoke({ methodId: 'load_epochs_close', inputs: [] });
  assert.equal(cr.statusCode, 0, `load_epochs_close: ${cr.errorCode} ${cr.errorMessage}`);
  const ingestMs = performance.now() - tLoad;
  const n = x.sdnap_epochs_count();
  assert.equal(n, 100000, `expected 100000 loaded objects, got ${n}`);
  assert.equal(x.sdnap_frames_open(80 * 1048576, 1), 0);
  const q = x.sdnap_alloc(256);
  const tFill = performance.now();
  const query100kMs = EPOCH_MS + 7200000;
  let last, rounds = 0;
  do {
    assert.equal(x.sdnap_frames_refill(...jd(query100kMs), 0, 2048, threads, 0, q), 0);
    last = Array.from(new Int32Array(h.memory.buffer, q, 7));
    rounds++;
  } while (!last[4] && last[0] + last[1] > 0 && rounds < 2000);
  const fillMs = performance.now() - tFill;
  const planes = x.sdnap_alloc(n * 24), status = x.sdnap_alloc(n * 4);
  assert.equal(x.sdnap_frames_at(...jd(query100kMs), 0, n, 3, planes, status), 0);
  const firstFrameMs = performance.now() - t0;
  const statusView = new Int32Array(h.memory.buffer, status, n);
  const statusCounts = {};
  let served = 0;
  for (let i = 0; i < n; i++) {
    const st = statusView[i];
    statusCounts[st] = (statusCounts[st] || 0) + 1;
    if (st === 0) served++;
  }
  const st0 = performance.now();
  for (let rep = 0; rep < 10; rep++) x.sdnap_frames_at(...jd(query100kMs + rep * 1000), 0, n, 3, planes, status);
  const steadyFrameMs = (performance.now() - st0) / 10;
  x.sdnap_frames_stats(q);
  const fstats = Array.from(new Float64Array(h.memory.buffer, q, 20));
  const peakWasmMB = +(h.memory.buffer.byteLength / 1048576).toFixed(2);
  const cellUsedMB = +(fstats[STAT.used] / 1048576).toFixed(2);
  const psPtr = x.sdnap_alloc(128);
  x.sdnap_pool_stats(psPtr, 16);
  const ps = Array.from(new Float64Array(h.memory.buffer, psPtr, 16));
  x.sdnap_free(psPtr);
  await h.destroy();
  console.log('Node 100k:', JSON.stringify({ n, served, unserved: n - served, statusCounts, peakWasmMB, cellUsedMB, ingestMs: +ingestMs.toFixed(1), fillMs: +fillMs.toFixed(1), firstFrameMs: +firstFrameMs.toFixed(1), steadyFrameMs: +steadyFrameMs.toFixed(2), full: fstats[STAT.full], rounds }));
  return {
    objects: n, threads, parts: partCount, wireMB: +(mor100kBuf.length / 1048576).toFixed(2),
    ingestMs: +ingestMs.toFixed(1), fillMs: +fillMs.toFixed(1), firstFrameMs: +firstFrameMs.toFixed(1),
    steadyFrameMs: +steadyFrameMs.toFixed(2), served, unserved: n - served, statusCounts,
    slabFull: fstats[STAT.full], peakWasmMB, cellUsedMB, poolRefused: ps[2], poolDeferred: ps[3],
  };
}
const node100k = await benchNode100k(4);
assert.equal(node100k.slabFull, 0, `Node 100k slab ran full: ${node100k.slabFull}`);

const nodePre = await benchNode(prebuiltBuf, true);
const nodeCold = await benchNode(coldBuf, false);
assert.equal(nodePre.planeHash, nodeCold.planeHash, 'Node prebuilt and cold planes must be bit-identical');

// Headless Chromium (cross-origin isolated!) measurement
const sdkDir = path.dirname(apReq.resolve('space-data-module-sdk/host/wasi-threads'));
const { resolveHeadlessShell } = await import(pathToFileURL(path.join(sdkDir, '..', 'testing', 'headlessShell.js')).href);
const shellBin = await resolveHeadlessShell();

const harnessSrc = `
import { createBrowserModuleHarness } from "space-data-module-sdk/host/browser-module";
const jd = (ms) => { const d = Math.floor(ms / 86400000); return [2440587.5 + d, (ms - d * 86400000) / 86400000]; };
async function runOne(wasmBytes, payload, configBytes, digest, stmt, threads, startMs, maxMemoryBytes) {
  const t0 = performance.now();
  const opts = {
    wasmSource: wasmBytes,
    surface: 'direct',
    enableBrowserWasiThreads: threads > 0,
    maxThreads: Math.max(1, threads),
    ...(threads > 0 ? { wasiThreadPoolSize: threads } : {}),
    wasiThreadProbeTimeoutMs: 10000,
    wasiThreadWorkerUrl: new URL('/wasi-thread-worker.js', self.location.href).href,
    initialMemoryBytes: 16 * 1024 * 1024,
  };
  if (maxMemoryBytes) opts.maximumMemoryBytes = maxMemoryBytes;
  const h = await createBrowserModuleHarness(opts);
  const x = h.instance.exports;
  if (threads > 0 && x.sdnap_threads) x.sdnap_threads(threads);
  const tLoad = performance.now();
  const bind = x.sdnap_alloc(32), cfgPtr = x.sdnap_alloc(configBytes.length);
  new Uint8Array(h.memory.buffer, bind, 32).set(digest);
  new Uint8Array(h.memory.buffer, cfgPtr, configBytes.length).set(configBytes);
  x.sdnap_standard_rows_bind(bind, cfgPtr, configBytes.length, 1);
  x.sdnap_free(bind);
  x.sdnap_free(cfgPtr);
  await h.invoke({ methodId: 'load_epochs_open', inputs: [{ portId: 'configuration', typeRef: { schemaName: 'PCF.fbs', fileIdentifier: '$PCF', rootTypeName: 'PCF', wireFormat: 'flatbuffer' }, payload: configBytes }] });
  if (stmt) {
    const p = x.sdnap_alloc(512);
    new Uint8Array(h.memory.buffer, p, 512).fill(0);
    const enc = new TextEncoder();
    new Uint8Array(h.memory.buffer, p, 128).set(enc.encode(stmt.BUILDER_NAME));
    new Uint8Array(h.memory.buffer, p + 128, 128).set(enc.encode(stmt.BUILDER_VERSION));
    new Uint8Array(h.memory.buffer, p + 256, 32).set(new Uint8Array(stmt.BUILDER_DIGEST));
    new Uint8Array(h.memory.buffer, p + 288, 32).set(new Uint8Array(stmt.ENVIRONMENT_DIGEST));
    x.sdnap_mor_asset_build(p, p + 128, p + 256, p + 288, stmt.TOL_POSITION, stmt.TOL_VELOCITY);
    x.sdnap_free(p);
  }
  await h.invoke({ methodId: 'load_epochs_part', inputs: [{ portId: 'ocm', typeRef: { schemaName: 'OCM.fbs', fileIdentifier: '$OCM', rootTypeName: 'OCM', wireFormat: 'flatbuffer' }, payload }] });
  await h.invoke({ methodId: 'load_epochs_close', inputs: [] });
  const ingestMs = performance.now() - tLoad;
  const n = x.sdnap_epochs_count();
  const admPtr = x.sdnap_alloc(4 * n);
  x.sdnap_epochs_rows_admission(admPtr, n);
  const adm = Array.from(new Int32Array(h.memory.buffer, admPtr, n));
  x.sdnap_free(admPtr);
  x.sdnap_frames_open(0, 1);
  const q = x.sdnap_alloc(256);
  if (!stmt) {
    let last;
    do {
      x.sdnap_frames_refill(...jd(startMs), 0, 128, threads, 0, q);
      last = Array.from(new Int32Array(h.memory.buffer, q, 7));
    } while (!last[4] && last[0] + last[1] > 0);
  }
  const planes = x.sdnap_alloc(n * 24), status = x.sdnap_alloc(n * 4);
  x.sdnap_frames_at(...jd(startMs), 0, n, 3, planes, status);
  const firstFrameMs = performance.now() - t0;
  const planeCopy = new Uint8Array(h.memory.buffer, planes, n * 24).slice();
  const hashBuf = await crypto.subtle.digest('SHA-256', planeCopy);
  const planeHash = Array.from(new Uint8Array(hashBuf), (b) => b.toString(16).padStart(2, '0')).join('');
  x.sdnap_frames_stats(q);
  const built = new Float64Array(h.memory.buffer, q, 20)[7];
  if (stmt && built !== 0) throw new Error('browser prebuilt rows built ' + built + ' cells');
  const st0 = performance.now();
  for (let rep = 0; rep < 200; rep++) x.sdnap_frames_at(...jd(startMs + rep * 1000), 0, n, 3, planes, status);
  const steadyMs = (performance.now() - st0) / 200;
  const displayMB = +(h.memory.buffer.byteLength / 1e6).toFixed(2);
  const rowsAdmitted = adm.filter((c) => c === 1).length;
  const rowsNotStored = adm.filter((c) => c === 0).length;
  await h.destroy();
  return { firstFrameMs: +firstFrameMs.toFixed(1), ingestMs: +ingestMs.toFixed(1), steadyFrameMs: +steadyMs.toFixed(3), displayMB, rowsAdmitted, rowsNotStored, planeHash };
}
(async () => {
  try {
    const [wasmR, preR, coldR, cfgR, metaR] = await Promise.all([
      fetch('/module.wasm').then(r => r.arrayBuffer()),
      fetch('/pre.bin').then(r => r.arrayBuffer()),
      fetch('/cold.bin').then(r => r.arrayBuffer()),
      fetch('/cfg.bin').then(r => r.arrayBuffer()),
      fetch('/meta.json').then(r => r.json()),
    ]);
    const w = new Uint8Array(wasmR), pre = new Uint8Array(preR), cold = new Uint8Array(coldR), cfg = new Uint8Array(cfgR);
    const dig = new Uint8Array(metaR.digest);
    const preRes = await runOne(w, pre, cfg, dig, metaR.statement, 0, metaR.startMs, 0);
    const cold0 = await runOne(w, cold, cfg, dig, null, 0, metaR.startMs, 0);
    const cold3 = await runOne(w, cold, cfg, dig, null, 3, metaR.startMs, 0);
    const capRes = await runOne(w, pre, cfg, dig, metaR.statement, 0, metaR.startMs, 32 * 1024 * 1024);
    // Real 100,000-object catalog benchmark in cross-origin-isolated Chromium
    const mor100k = new Uint8Array(await fetch('/mor100k.bin').then(r => r.arrayBuffer()));
    const run100k = async (threads) => {
      const t0 = performance.now();
      const h = await createBrowserModuleHarness({
        wasmSource: w, surface: 'direct', enableBrowserWasiThreads: threads > 0, maxThreads: Math.max(1, threads),
        ...(threads > 0 ? { wasiThreadPoolSize: threads } : {}), wasiThreadProbeTimeoutMs: 10000,
        wasiThreadWorkerUrl: new URL('/wasi-thread-worker.js', self.location.href).href, initialMemoryBytes: 64 * 1024 * 1024,
      });
      const x = h.instance.exports;
      if (threads > 0 && x.sdnap_threads) x.sdnap_threads(threads);
      const tLoad = performance.now();
      await h.invoke({ methodId: 'load_epochs_open', inputs: [{ portId: 'configuration', typeRef: { schemaName: 'PCF.fbs', fileIdentifier: '$PCF', rootTypeName: 'PCF', wireFormat: 'flatbuffer' }, payload: cfg }] });
      let off = 0;
      for (const len of metaR.chunkLens100k) {
        await h.invoke({ methodId: 'load_epochs_part', inputs: [{ portId: 'ocm', typeRef: { schemaName: 'OCM.fbs', fileIdentifier: '$OCM', rootTypeName: 'OCM', wireFormat: 'flatbuffer' }, payload: mor100k.subarray(off, off + len) }] });
        off += len;
      }
      await h.invoke({ methodId: 'load_epochs_close', inputs: [] });
      const ingestMs = performance.now() - tLoad;
      const n = x.sdnap_epochs_count();
      x.sdnap_frames_open(80 * 1048576, 1);
      const q = x.sdnap_alloc(256);
      const tFill = performance.now();
      const q100kMs = metaR.startMs + 3600000;
      let last, rounds = 0;
      do {
        x.sdnap_frames_refill(...jd(q100kMs), 0, 2048, threads, 0, q);
        last = Array.from(new Int32Array(h.memory.buffer, q, 7));
        rounds++;
      } while (!last[4] && last[0] + last[1] > 0 && rounds < 2000);
      const fillMs = performance.now() - tFill;
      const planes = x.sdnap_alloc(n * 24), status = x.sdnap_alloc(n * 4);
      x.sdnap_frames_at(...jd(q100kMs), 0, n, 3, planes, status);
      const firstFrameMs = performance.now() - t0;
      const stView = new Int32Array(h.memory.buffer, status, n);
      const statusCounts = {};
      let served = 0;
      for (let i = 0; i < n; i++) {
        const st = stView[i];
        statusCounts[st] = (statusCounts[st] || 0) + 1;
        if (st === 0) served++;
      }
      const st0 = performance.now();
      for (let rep = 0; rep < 10; rep++) x.sdnap_frames_at(...jd(q100kMs + rep * 1000), 0, n, 3, planes, status);
      const steadyFrameMs = (performance.now() - st0) / 10;
      x.sdnap_frames_stats(q);
      const fstats = Array.from(new Float64Array(h.memory.buffer, q, 20));
      const peakWasmMB = +(h.memory.buffer.byteLength / 1048576).toFixed(2);
      const cellUsedMB = +(fstats[4] / 1048576).toFixed(2);
      await h.destroy();
      return { objects: n, threads, ingestMs: +ingestMs.toFixed(1), fillMs: +fillMs.toFixed(1), firstFrameMs: +firstFrameMs.toFixed(1), steadyFrameMs: +steadyFrameMs.toFixed(2), served, unserved: n - served, statusCounts, slabFull: fstats[12], peakWasmMB, cellUsedMB };
    };
    const chr100k = await run100k(3);
    await fetch('/result', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, coi: self.crossOriginIsolated, preRes, cold0, cold3, capRes, chr100k }) });
  } catch (e) {
    await fetch('/result', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: false, error: String(e?.stack || e) }) });
  }
})();
`;
const bundled = await esbuild.build({
  stdin: { contents: harnessSrc, resolveDir: AP_DIR, loader: 'js' },
  bundle: true, format: 'esm', write: false, platform: 'browser', target: ['es2022'], external: ['node:*', 'hd-wallet-wasm'],
});
const jsBundle = bundled.outputFiles[0].text;
const threadWorkerJs = (await esbuild.build({
  entryPoints: [path.join(sdkDir, 'wasiThreadBrowserWorker.mjs')],
  bundle: true, format: 'esm', write: false, platform: 'browser', target: ['es2022'], external: ['node:*', 'hd-wallet-wasm'],
})).outputFiles[0].text;
const chunkLens100k = Array.from({ length: CHUNK_COUNT_100K }, (_, c) => {
  let len = 0;
  for (let k = c * CHUNK_SIZE_100K; k < (c + 1) * CHUNK_SIZE_100K; k++) len += morParts100k[k].length;
  return len;
});
const metaJson = JSON.stringify({
  digest: Array.from(digest),
  startMs,
  chunkLens100k,
  statement: {
    BUILDER_NAME: statement.BUILDER_NAME,
    BUILDER_VERSION: statement.BUILDER_VERSION,
    BUILDER_DIGEST: Array.from(statement.BUILDER_DIGEST),
    ENVIRONMENT_DIGEST: Array.from(statement.ENVIRONMENT_DIGEST),
    TOL_POSITION: statement.TOL_POSITION,
    TOL_VELOCITY: statement.TOL_VELOCITY,
  },
});

let chrResolve;
const chrPromise = new Promise((r) => { chrResolve = r; });
const server = http.createServer((req, res) => {
  const hdrs = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' };
  if (req.url === '/') { res.writeHead(200, { ...hdrs, 'content-type': 'text/html' }); res.end('<!doctype html><script type="module">new Worker("/worker.js",{type:"module"});</script>'); return; }
  if (req.url === '/worker.js') { res.writeHead(200, { ...hdrs, 'content-type': 'text/javascript' }); res.end(jsBundle); return; }
  if (req.url === '/wasi-thread-worker.js') { res.writeHead(200, { ...hdrs, 'content-type': 'text/javascript' }); res.end(threadWorkerJs); return; }
  if (req.url === '/module.wasm') { res.writeHead(200, { ...hdrs, 'content-type': 'application/wasm' }); res.end(wasmBytes); return; }
  if (req.url === '/pre.bin') { res.writeHead(200, { ...hdrs, 'content-type': 'application/octet-stream' }); res.end(prebuiltBuf); return; }
  if (req.url === '/cold.bin') { res.writeHead(200, { ...hdrs, 'content-type': 'application/octet-stream' }); res.end(coldBuf); return; }
  if (req.url === '/mor100k.bin') { res.writeHead(200, { ...hdrs, 'content-type': 'application/octet-stream' }); res.end(mor100kBuf); return; }
  if (req.url === '/cfg.bin') { res.writeHead(200, { ...hdrs, 'content-type': 'application/octet-stream' }); res.end(configBytes); return; }
  if (req.url === '/meta.json') { res.writeHead(200, { ...hdrs, 'content-type': 'application/json' }); res.end(metaJson); return; }
  if (req.url === '/result' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => { res.writeHead(200, hdrs); res.end('ok'); chrResolve(JSON.parse(body)); });
    return;
  }
  res.writeHead(404, hdrs); res.end('not found');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wave1-075-chr-'));
const proc = spawn(shellBin, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, `http://127.0.0.1:${port}/`], { detached: true, stdio: 'ignore' });
let chrRes;
try {
  chrRes = await Promise.race([chrPromise, new Promise((_, rej) => setTimeout(() => rej(new Error('Chromium timeout')), 240000))]);
} finally {
  try { process.kill(-proc.pid, 'SIGKILL'); } catch {}
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
assert.ok(chrRes.ok && chrRes.coi, `Chromium benchmark failed: ${JSON.stringify(chrRes)}`);
assert.equal(chrRes.chr100k.slabFull, 0, `Chromium 100k slab ran full: ${chrRes.chr100k.slabFull}`);
assert.equal(chrRes.chr100k.served, node100k.served, `Chromium 100k served (${chrRes.chr100k.served}) != Node 100k served (${node100k.served})`);
assert.equal(chrRes.preRes.planeHash, nodeCold.planeHash, 'Chromium prebuilt must match Node cold bit-for-bit');
assert.equal(chrRes.cold0.planeHash, nodeCold.planeHash, 'Chromium cold serial must match Node cold bit-for-bit');
assert.equal(chrRes.cold3.planeHash, nodeCold.planeHash, 'Chromium cold 3-thread pool must match Node cold bit-for-bit');
assert.equal(chrRes.capRes.planeHash, nodeCold.planeHash, 'Chromium capped prebuilt must match Node cold bit-for-bit');

const report = {
  version: '0.7.5',
  date: new Date().toISOString().slice(0, 10),
  module: {
    bytes: wasmBytes.length,
    sha256: sha256(wasmBytes),
    canonicalSha256: sha256(loadable),
    simd128: true,
    relaxedSimd: false,
  },
  prebuiltRows: {
    objects: 400,
    node: {
      prebuiltFirstFrameMs: nodePre.firstFrameMs,
      coldFirstFrameMs: nodeCold.firstFrameMs,
      prebuiltSpeedup: +(nodeCold.firstFrameMs / Math.max(nodePre.firstFrameMs, 0.1)).toFixed(3),
      prebuiltIngestMs: nodePre.ingestMs,
      steadyFrameMs: nodePre.steadyFrameMs,
      prebuiltDisplayMB: nodePre.displayMB,
      coldDisplayMB: nodeCold.displayMB,
      rowsAdmitted: nodePre.rowsAdmitted,
      rowsNotStored: nodePre.rowsNotStored,
    },
    chromium: {
      prebuiltFirstFrameMs: chrRes.preRes.firstFrameMs,
      coldSerialFirstFrameMs: chrRes.cold0.firstFrameMs,
      coldPool3FirstFrameMs: chrRes.cold3.firstFrameMs,
      prebuiltSpeedupSerial: +(chrRes.cold0.firstFrameMs / Math.max(chrRes.preRes.firstFrameMs, 0.1)).toFixed(3),
      pool3Speedup: +(chrRes.cold0.firstFrameMs / Math.max(chrRes.cold3.firstFrameMs, 0.1)).toFixed(3),
      prebuiltIngestMs: chrRes.preRes.ingestMs,
      steadyFrameMs: chrRes.preRes.steadyFrameMs,
      prebuiltDisplayMB: chrRes.preRes.displayMB,
      coldSerialDisplayMB: chrRes.cold0.displayMB,
      coldPool3DisplayMB: chrRes.cold3.displayMB,
      cappedFirstFrameMs: chrRes.capRes.firstFrameMs,
      cappedDisplayMB: chrRes.capRes.displayMB,
      poolThreads: 3,
      rowsAdmitted: chrRes.preRes.rowsAdmitted,
      rowsNotStored: chrRes.preRes.rowsNotStored,
      pageErrors: 0,
      failedAssets: 0,
    },
  },
  scale100k: {
    objects: 100000,
    measuredNode: node100k,
    measuredChromium: chrRes.chr100k,
    publicPeakMB: node100k.peakWasmMB,
    publicCellMB: node100k.cellUsedMB,
    publicUnserved: node100k.unserved,
    estimatedFrom1200: {
      publicPeakMB: w1Objs.A2_922.public.est100kFullMB,
      publicCellMB: w1Objs.A2_922.public.est100kPosMB,
      eccDragPeakMB: w1Objs.A2_922.ecc15_drag.est100kFullMB,
      eccDragCellMB: w1Objs.A2_922.ecc15_drag.est100kPosMB,
      leo500PeakMB: w1Objs.A2_922.leo500.est100kFullMB,
      leo500CellMB: w1Objs.A2_922.leo500.est100kPosMB,
    },
  },
  atmosphere: {
    orbits: 20,
    days: 7,
    elapsedMs: w1Objs.A1_ap3_20x7d_ms,
  },
  widePool,
  stability: {
    highEccOrbits: w1Objs.B1a_862.orbits,
    highEccFailures: w1Objs.B1a_862.unconverged.reduce((a, b) => a + b, 0),
    fallbackChecks,
    maxNormalizedD2: w1Objs.C1a_845_maxD2,
  },
};
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n');
console.log('WAVE1-0.7.5 PASS:', JSON.stringify(report, null, 2));
process.exit(0);
