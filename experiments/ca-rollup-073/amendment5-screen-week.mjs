#!/usr/bin/env node
// Amendment 4 Option 2 (#1126): Fresh Unseen Forward Encounter Week Screen (2026-11-17 to 2026-11-24)
// Seeded from Space-Track GP snapshot 2026-11-16.json.gz (32,923 objects, strictly CREATION_DATE <= 2026-11-17T00:00:00Z).
// Screens ALL tiers through compiled analysis/conjunction-assessment 0.19.1 WASM across parallel workers:
//   - t0 (1/1, 0..5 km): 28 x 6h windows parallelized across workers, merged identically to gpu/allVsAll.mjs
//   - t1-s1..s3 (1/8, 5..50 km), t2-s1..s3 (1/64, 50..300 km), t3-s1..s3 (1/256, 300..1000 km)
// Builds encounter-plane geometry geom/<tier>.f32 (14 floats) + geom/<tier>.day.u8 (day 0..6 for cluster bootstrap).
//
// Usage:
//   node amendment4-screen-week.mjs --workers 14 [--smoke]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DAY_MS, sha256, sha256File, nowUtc, utcMs, loadSdsAndSdk, gpJsonToOmm } from './amendment5-lib.mjs';

const SELF = fileURLToPath(import.meta.url);
const OAE = path.resolve(path.dirname(SELF), '../..');
const MODULES = process.env.SDN_MODULES_ROOT || path.resolve(OAE, '../../main-packages/space-data-network-modules');
const ARCHIVE = process.env.SDN_ARCHIVE_ROOT || '/opt/data/sdn-archive';
const CA_DIR = path.join(MODULES, 'analysis/conjunction-assessment');
const CFG_PATH = path.join(path.dirname(SELF), 'amendment5-config.json');
const CFG = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

const SCREEN_DIR = path.join(OAE, 'runs/ca-rollup-073/screen-20261117');
const START_MS = Date.parse(CFG.forwardWeek.fromUtc);
const START_JD = START_MS / DAY_MS + 2440587.5;
const RECORD = 14;

function subsetOf(norads, fraction, seed) {
  if (fraction === 1) return norads.map((_, i) => i);
  const want = Math.round(fraction * norads.length);
  const ranked = norads.map((n, i) => [sha256(`${CFG.forwardWeek.seed}:${seed}:${n}`), i]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return ranked.slice(0, want).map((r) => r[1]).sort((a, b) => a - b);
}

async function prepareCatalog() {
  const popDir = path.join(SCREEN_DIR, 'pop');
  fs.mkdirSync(popDir, { recursive: true });
  const ommPath = path.join(popDir, 'current.omm.bin');
  const noradPath = path.join(popDir, 'current.norad.json');
  if (fs.existsSync(ommPath) && fs.existsSync(noradPath)) {
    return JSON.parse(fs.readFileSync(noradPath, 'utf8'));
  }
  const snapPath = path.join(ARCHIVE, CFG.forwardWeek.gpSnapshot);
  if (sha256File(snapPath) !== CFG.forwardWeek.gpSnapshotSha256) throw new Error('GP snapshot SHA mismatch');
  const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(snapPath)));
  const maxC = Date.parse(CFG.forwardWeek.maxCreationUtc);
  const newest = new Map();
  let droppedFuture = 0;
  for (const g of raw) {
    if (utcMs(g.CREATION_DATE) > maxC) { droppedFuture++; continue; }
    const id = Number(g.NORAD_CAT_ID);
    const p = newest.get(id);
    if (!p || utcMs(g.EPOCH) > utcMs(p.EPOCH)) newest.set(id, g);
  }
  const sds = await loadSdsAndSdk(MODULES);
  const ids = [...newest.keys()].sort((a, b) => a - b);
  const chunks = [];
  for (const id of ids) {
    const rawOmm = gpJsonToOmm(newest.get(id), sds, false);
    const hdr = Buffer.alloc(4);
    hdr.writeUInt32BE(rawOmm.length, 0);
    chunks.push(hdr, rawOmm);
  }
  fs.writeFileSync(ommPath, Buffer.concat(chunks));
  fs.writeFileSync(noradPath, JSON.stringify(ids));
  fs.writeFileSync(path.join(popDir, 'meta.json'), JSON.stringify({ objects: ids.length, droppedFuture, snapshotSha256: CFG.forwardWeek.gpSnapshotSha256 }));
  console.log(`${nowUtc()} [screen] Prepared ${ids.length} strictly causal objects (droppedFuture=${droppedFuture})`);
  return ids;
}

async function openCa() {
  const req = createRequire(path.join(CA_DIR, 'package.json'));
  const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
  const { createBrowserModuleHarness } = await import(pathToFileURL(req.resolve('space-data-module-sdk/host/browser-module')).href);
  const CQR_MOD = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/CQR/main.js')).href);
  const OMM_MOD = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/OMM/main.js')).href);
  const cs = await import(pathToFileURL(path.join(CA_DIR, 'gpu/catalogScreen.mjs')).href);
  const av = await import(pathToFileURL(path.join(CA_DIR, 'gpu/allVsAll.mjs')).href);
  const cont = await import(pathToFileURL(path.join(CA_DIR, 'gpu/continuousScreen.mjs')).href);
  const wasmPath = path.join(CA_DIR, 'dist/isomorphic/module.wasm');
  if (sha256File(wasmPath) !== CFG.modules.conjunctionAssessment.wasmSha256) throw new Error('CA wasm SHA mismatch');
  const h = await createBrowserModuleHarness({
    wasmSource: fs.readFileSync(wasmPath),
    manifest: JSON.parse(fs.readFileSync(path.join(CA_DIR, 'plugin-manifest.json'), 'utf8')),
    surface: 'direct',
    enableBrowserWasiThreads: false,
  });
  const invoke = (methodId, inputs) => h.invoke({ methodId, inputs });
  const temeRfm = new CQR_MOD.RFMT(CQR_MOD.RFMUnion.CelestialFrameWrapper, new CQR_MOD.CelestialFrameWrapperT(CQR_MOD.CelestialFrame.TEMEOFDATE), 0, 'TEMEOFDATE');
  const sgp4SourcesNorm = (frames) => frames.map((bytes, i) => {
    const omm = OMM_MOD.OMM.getRootAsOMM(new fb.ByteBuffer(bytes)).unpack();
    omm.CENTER_NAME = 'EARTH';
    omm.REFERENCE_FRAME = temeRfm;
    return new CQR_MOD.CQRObjectSourceT(omm.OBJECT_ID || String(omm.NORAD_CAT_ID), omm.OBJECT_NAME, omm.NORAD_CAT_ID, null, i + 1, 'sgp4', omm);
  });
  return { h, invoke, CQR_MOD, cs, av, cont, sgp4SourcesNorm };
}

function packEvent(e) {
  const a = e.PRIMARY_STATE.STATE, b = e.SECONDARY_STATE.STATE;
  return [
    Number(e.PRIMARY_NORAD_ID), Number(e.SECONDARY_NORAD_ID), e.TCA.JULIAN_DATE, e.MISS_DISTANCE_M, e.RELATIVE_SPEED_M_S,
    a.POSITION.X, a.POSITION.Y, a.POSITION.Z, a.VELOCITY.X, a.VELOCITY.Y, a.VELOCITY.Z,
    b.POSITION.X, b.POSITION.Y, b.POSITION.Z, b.VELOCITY.X, b.VELOCITY.Y, b.VELOCITY.Z,
  ];
}

// Worker for t0 windows (parallelized across 28 six-hour windows!)
async function runT0WindowWorker(winIdxs) {
  const ca = await openCa();
  const frames = ca.cs.splitCatalog(new Uint8Array(fs.readFileSync(path.join(SCREEN_DIR, 'pop/current.omm.bin'))));
  const sources = ca.sgp4SourcesNorm(frames);
  const identity = sources.map((s) => ca.av.objectKey(s.OBJECT_ID, s.NORAD_CATALOG_ID));
  const windows = ca.cs.screenWindows(START_JD, CFG.forwardWeek.horizonDays, CFG.forwardWeek.windowHours);
  const controls = { coarseStepSec: CFG.forwardWeek.coarseStepSec, workers: 1, algorithm: 'ALFANO_MAXIMUM', thresholdKm: 5 };
  const CATALOG = new ca.CQR_MOD.PRWInstanceT('conjunction-assessment', 'a4-cat', 1n);
  const REFINE = new ca.CQR_MOD.PRWInstanceT('conjunction-assessment', 'a4-ref', 1n);
  const winDir = path.join(SCREEN_DIR, 't0-wins');
  fs.mkdirSync(winDir, { recursive: true });

  const handle = await ca.cs.prepareIndex(ca.invoke, sources, [], CATALOG);
  for (const k of winIdxs) {
    const outF64 = path.join(winDir, `w-${String(k).padStart(2, '0')}.f64`);
    const outMeta = path.join(winDir, `w-${String(k).padStart(2, '0')}.json`);
    if (fs.existsSync(outMeta)) continue;
    const t0 = Date.now();
    const w = windows[k];
    const grid = await ca.cont.sampleWindowGrid({ invoke: ca.invoke, request: ca.cs.windowRequest(handle, 'TEME', w, controls, CATALOG) });
    const excluded = [...grid.excluded].map(([row, jd]) => [identity[row], jd]);
    const refineIndex = async (rows) => {
      const h = await ca.cs.prepareIndex(ca.invoke, rows.map((r) => sources[r]), [], REFINE);
      return { request: ca.cs.windowRequest(h, 'TEME', w, controls, REFINE), release: () => ca.cs.releaseIndex(ca.invoke, h, REFINE) };
    };
    const run = await ca.cont.screenStoredWindow({ invoke: ca.invoke, decodeCatalogResult: ca.cs.decodeCatalogResult, request: ca.cs.windowRequest(0, 'TEME', w, controls, REFINE), grid, refineIndex });
    const arr = new Float64Array(run.events.length * 17);
    const ids = new Array(run.events.length);
    for (let i = 0; i < run.events.length; i++) {
      const e = run.events[i];
      arr.set(packEvent(e), i * 17);
      ids[i] = [e.PRIMARY_ID, e.SECONDARY_ID];
    }
    fs.writeFileSync(`${outF64}.tmp`, Buffer.from(arr.buffer));
    fs.renameSync(`${outF64}.tmp`, outF64);
    fs.writeFileSync(outMeta, JSON.stringify({ k, events: run.events.length, candidates: run.candidates, excluded, ids, sec: +((Date.now() - t0) / 1000).toFixed(1) }));
    console.log(`${nowUtc()} [t0 w${k}] events=${run.events.length} cands=${run.candidates} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  await ca.cs.releaseIndex(ca.invoke, handle, CATALOG);
  await ca.h.destroy?.();
}

// Worker for sampled tiers (t1-s1..s3, t2-s1..s3, t3-s1..s3)
async function runTierWorker(tierId, smoke) {
  const outMeta = path.join(SCREEN_DIR, 'events', `${tierId}.json`);
  if (fs.existsSync(outMeta)) return;
  const t0 = Date.now();
  const tier = CFG.forwardWeek.tiers.find((x) => x.id === tierId);
  const ca = await openCa();
  const norads = JSON.parse(fs.readFileSync(path.join(SCREEN_DIR, 'pop/current.norad.json'), 'utf8'));
  const frames = ca.cs.splitCatalog(new Uint8Array(fs.readFileSync(path.join(SCREEN_DIR, 'pop/current.omm.bin'))));
  const pick = subsetOf(norads, tier.fraction, tier.seed ?? 0);
  const chosen = pick.map((i) => frames[i]);
  const sources = ca.sgp4SourcesNorm(chosen);
  const identity = sources.map((s) => ca.av.objectKey(s.OBJECT_ID, s.NORAD_CATALOG_ID));
  const windows = ca.cs.screenWindows(START_JD, smoke ? 0.25 : CFG.forwardWeek.horizonDays, CFG.forwardWeek.windowHours);
  const controls = { coarseStepSec: CFG.forwardWeek.coarseStepSec, workers: 1, algorithm: 'ALFANO_MAXIMUM', thresholdKm: tier.thresholdKm };
  const CATALOG = new ca.CQR_MOD.PRWInstanceT('conjunction-assessment', `a4-${tierId}-c`, 1n);
  const REFINE = new ca.CQR_MOD.PRWInstanceT('conjunction-assessment', `a4-${tierId}-r`, 1n);

  const events = [], cutoffs = new Map();
  let candidates = 0;
  const handle = await ca.cs.prepareIndex(ca.invoke, sources, [], CATALOG);
  for (const w of windows) {
    const grid = await ca.cont.sampleWindowGrid({ invoke: ca.invoke, request: ca.cs.windowRequest(handle, 'TEME', w, controls, CATALOG) });
    for (const [row, jd] of grid.excluded) ca.av.refuseAt(cutoffs, identity[row], jd);
    const refineIndex = async (rows) => {
      const h = await ca.cs.prepareIndex(ca.invoke, rows.map((r) => sources[r]), [], REFINE);
      return { request: ca.cs.windowRequest(h, 'TEME', w, controls, REFINE), release: () => ca.cs.releaseIndex(ca.invoke, h, REFINE) };
    };
    const run = await ca.cont.screenStoredWindow({ invoke: ca.invoke, decodeCatalogResult: ca.cs.decodeCatalogResult, request: ca.cs.windowRequest(0, 'TEME', w, controls, REFINE), grid, refineIndex });
    for (const e of run.events) {
      const a = e.PRIMARY_STATE.STATE, b = e.SECONDARY_STATE.STATE;
      events.push({
        PRIMARY_ID: e.PRIMARY_ID, PRIMARY_NORAD_ID: e.PRIMARY_NORAD_ID,
        SECONDARY_ID: e.SECONDARY_ID, SECONDARY_NORAD_ID: e.SECONDARY_NORAD_ID,
        TCA: { JULIAN_DATE: e.TCA.JULIAN_DATE }, MISS_DISTANCE_M: e.MISS_DISTANCE_M, RELATIVE_SPEED_M_S: e.RELATIVE_SPEED_M_S,
        p: packEvent(e),
      });
    }
    candidates += run.candidates;
  }
  await ca.cs.releaseIndex(ca.invoke, handle, CATALOG);
  await ca.h.destroy?.();

  const merged = ca.av.mergeWindowEvents(events, cutoffs);
  const keep = merged.filter((e) => {
    const km = e.MISS_DISTANCE_M / 1000;
    return (tier.keepFromKm === 0 && km <= tier.thresholdKm) || (km > tier.keepFromKm && km <= tier.thresholdKm);
  });
  const out = new Float64Array(keep.length * 17);
  keep.forEach((e, i) => out.set(e.p, i * 17));
  fs.mkdirSync(path.join(SCREEN_DIR, 'events'), { recursive: true });
  fs.writeFileSync(path.join(SCREEN_DIR, 'events', `${tierId}.f64`), Buffer.from(out.buffer));
  const canon = merged.map((e) => `${Math.min(Number(e.PRIMARY_NORAD_ID), Number(e.SECONDARY_NORAD_ID))}|${Math.max(Number(e.PRIMARY_NORAD_ID), Number(e.SECONDARY_NORAD_ID))}|${e.TCA.JULIAN_DATE.toFixed(8)}|${e.MISS_DISTANCE_M.toFixed(3)}`).sort();
  const h = crypto.createHash('sha256');
  for (const k of canon) h.update(k).update('\n');
  const meta = {
    id: tierId, fraction: tier.fraction, seed: tier.seed, thresholdKm: tier.thresholdKm, keepFromKm: tier.keepFromKm,
    objects: chosen.length, catalog: norads.length, events: merged.length, kept: keep.length,
    candidates, excluded: cutoffs.size, digest: h.digest('hex'), wallSec: +((Date.now() - t0) / 1000).toFixed(1),
  };
  fs.writeFileSync(outMeta, JSON.stringify(meta, null, 2) + '\n');
  console.log(`${nowUtc()} [${tierId}] kept=${keep.length}/${merged.length} (${meta.wallSec}s)`);
}

import crypto from 'node:crypto';

async function mergeT0(nWin, catalogCount) {
  const outMeta = path.join(SCREEN_DIR, 'events', 't0.json');
  if (fs.existsSync(outMeta)) return;
  const av = await import(pathToFileURL(path.join(CA_DIR, 'gpu/allVsAll.mjs')).href);
  const winDir = path.join(SCREEN_DIR, 't0-wins');
  const cutoffs = new Map();
  const events = [];
  let candidates = 0;
  for (let k = 0; k < nWin; k++) {
    const m = JSON.parse(fs.readFileSync(path.join(winDir, `w-${String(k).padStart(2, '0')}.json`), 'utf8'));
    const raw = fs.readFileSync(path.join(winDir, `w-${String(k).padStart(2, '0')}.f64`));
    const f64 = new Float64Array(raw.buffer, raw.byteOffset, raw.byteLength / 8);
    candidates += m.candidates;
    for (const [key, jd] of m.excluded) av.refuseAt(cutoffs, key, jd);
    for (let i = 0; i < m.events; i++) {
      const o = i * 17;
      events.push({
        PRIMARY_ID: m.ids[i][0], PRIMARY_NORAD_ID: f64[o],
        SECONDARY_ID: m.ids[i][1], SECONDARY_NORAD_ID: f64[o + 1],
        TCA: { JULIAN_DATE: f64[o + 2] }, MISS_DISTANCE_M: f64[o + 3], RELATIVE_SPEED_M_S: f64[o + 4],
        p: f64.subarray(o, o + 17),
      });
    }
  }
  const merged = av.mergeWindowEvents(events, cutoffs);
  const keep = merged.filter((e) => e.MISS_DISTANCE_M / 1000 <= 5.0);
  const out = new Float64Array(keep.length * 17);
  keep.forEach((e, i) => out.set(e.p, i * 17));
  fs.mkdirSync(path.join(SCREEN_DIR, 'events'), { recursive: true });
  fs.writeFileSync(path.join(SCREEN_DIR, 'events', 't0.f64'), Buffer.from(out.buffer));
  const canon = merged.map((e) => `${Math.min(Number(e.PRIMARY_NORAD_ID), Number(e.SECONDARY_NORAD_ID))}|${Math.max(Number(e.PRIMARY_NORAD_ID), Number(e.SECONDARY_NORAD_ID))}|${e.TCA.JULIAN_DATE.toFixed(8)}|${e.MISS_DISTANCE_M.toFixed(3)}`).sort();
  const h = crypto.createHash('sha256');
  for (const k of canon) h.update(k).update('\n');
  const meta = {
    id: 't0', fraction: 1, seed: null, thresholdKm: 5, keepFromKm: 0,
    objects: catalogCount, catalog: catalogCount, events: merged.length, kept: keep.length,
    candidates, excluded: cutoffs.size, digest: h.digest('hex'),
  };
  fs.writeFileSync(outMeta, JSON.stringify(meta, null, 2) + '\n');
  console.log(`${nowUtc()} [t0 merged] kept=${keep.length} digest=${meta.digest.slice(0, 16)}`);
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const m = Math.hypot(...a); return m > 0 ? a.map((x) => x / m) : [0, 0, 0]; };

function buildGeometry(tiers) {
  const geoDir = path.join(SCREEN_DIR, 'geom');
  fs.mkdirSync(geoDir, { recursive: true });
  const stats = {};
  for (const t of tiers) {
    const f = fs.readFileSync(path.join(SCREEN_DIR, 'events', `${t.id}.f64`));
    const d = new Float64Array(f.buffer, f.byteOffset, f.byteLength / 8);
    const n = d.length / 17;
    const g = new Float32Array(n * RECORD);
    const dayArr = new Uint8Array(n);
    let offMiss = 0, zeroSpeed = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 17, s = (k) => d[o + k];
      const rA = [s(5), s(6), s(7)], vA = [s(8), s(9), s(10)], rB = [s(11), s(12), s(13)], vB = [s(14), s(15), s(16)];
      const dr = [rA[0] - rB[0], rA[1] - rB[1], rA[2] - rB[2]], dv = [vA[0] - vB[0], vA[1] - vB[1], vA[2] - vB[2]];
      const speed = Math.hypot(...dv);
      if (speed < 1e-3) zeroSpeed++;
      const w = speed < 1e-3 ? unit(rA) : dv.map((x) => x / speed);
      const along = dot(dr, w), p = [dr[0] - along * w[0], dr[1] - along * w[1], dr[2] - along * w[2]];
      const miss = Math.hypot(...dr);
      if (Math.abs(miss - s(3)) > 1) offMiss++;
      const u1 = Math.hypot(...p) > 1e-6 ? unit(p) : unit(cross(w, Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
      const u2 = cross(w, u1);
      const axes = (r, v) => { const R = unit(r), C = unit(cross(r, v)), I = cross(C, R); return [dot(u1, R), dot(u1, I), dot(u1, C), dot(u2, R), dot(u2, I), dot(u2, C)]; };
      g.set([s(3) / 1000, speed / 1000, ...axes(rA, vA), ...axes(rB, vB)], i * RECORD);
      dayArr[i] = Math.min(6, Math.max(0, Math.floor(s(2) - START_JD)));
    }
    fs.writeFileSync(path.join(geoDir, `${t.id}.f32`), Buffer.from(g.buffer));
    fs.writeFileSync(path.join(geoDir, `${t.id}.day.u8`), Buffer.from(dayArr.buffer));
    stats[t.id] = { n, offMissOver1m: offMiss, zeroSpeed };
  }
  fs.writeFileSync(path.join(SCREEN_DIR, 'geometry.json'), JSON.stringify(stats, null, 2) + '\n');
  console.log(`${nowUtc()} [geometry] complete:`, JSON.stringify(stats));
}

async function main() {
  const smoke = has('--smoke');
  const workers = Number(arg('--workers', '14'));
  if (arg('--t0-wins')) {
    await runT0WindowWorker(arg('--t0-wins').split(',').map(Number));
    return;
  }
  if (arg('--tier')) {
    await runTierWorker(arg('--tier'), smoke);
    return;
  }
  const t0 = Date.now();
  const norads = await prepareCatalog();
  const nWin = smoke ? 1 : Math.round((CFG.forwardWeek.horizonDays * 24) / CFG.forwardWeek.windowHours);
  const wCount = Math.min(workers, nWin);
  const lists = Array.from({ length: wCount }, (_, w) => Array.from({ length: nWin }, (_, i) => i).filter((i) => i % wCount === w));
  console.log(`${nowUtc()} [screen] Running t0 (${nWin} windows across ${wCount} workers) + 9 sampled tiers...`);

  // Run t0 windows in parallel across workers
  await Promise.all(lists.map((idxs, w) => new Promise((resolve, reject) => {
    const c = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=6144', SELF, '--t0-wins', idxs.join(',')], { stdio: 'inherit', env: process.env });
    c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`t0 worker ${w} exited ${code}`))));
  })));
  await mergeT0(nWin, norads.length);

  // Run all 9 sampled tiers in parallel!
  const sampled = CFG.forwardWeek.tiers.filter((t) => t.id !== 't0');
  await Promise.all(sampled.map((t) => new Promise((resolve, reject) => {
    const c = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=4096', SELF, '--tier', t.id, ...(smoke ? ['--smoke'] : [])], { stdio: 'inherit', env: process.env });
    c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`tier ${t.id} exited ${code}`))));
  })));

  buildGeometry(CFG.forwardWeek.tiers);
  console.log(`${nowUtc()} [screen] ALL TIERS COMPLETE in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${SCREEN_DIR}`);
}

await main();
process.exit(0);
