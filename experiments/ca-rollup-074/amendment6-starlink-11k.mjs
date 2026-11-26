#!/usr/bin/env node
// Amendment 6 (#1128): Unified 0.7.4 / 0.2.6 Full-Constellation Starlink 7-Arm Suite
// Evaluates ALL 7 ARMS on the exact same ~11,195 Starlink satellites with strict pre-T0 causality:
//   S:         Space-Track public GP (CREATION_DATE <= T0) flown on SGP4
//   SupGP:     CelesTrak SupGP (125002Z.json.gz < T0) flown on SGP4
//   Xp:        SGP4-XP built by catalog-builder 0.2.6 from 21-day Space-Track GP history (CREATION_DATE <= T0)
//   Op:        SDN-AP 0.7.4 built by catalog-builder 0.2.6 from 21-day Space-Track GP history (CREATION_DATE <= T0)
//   X:         SGP4-XP built by catalog-builder 0.2.6 from SpaceX T0 ephemeris
//   O:         SDN-AP 0.7.4 built by catalog-builder 0.2.6 from SpaceX T0 ephemeris
//   SpaceX_T0: SpaceX's own T0 OCM forecast where defined (0-6 h, 6-10.5 h)
// Scores against stitched strictly unseen next-day SpaceX OCM truth cycles (00-57Z + 08-57Z) over 0-24 h,
// saving private per-sat signed 3-D/6-D RTN vectors to runs/ca-rollup-074/ and aggregate-only JSON to results/.
//
// Usage:
//   SDN_MODULES_ROOT=... node amendment6-starlink-11k.mjs --cycle train --pre-freeze-train --workers 14
//   SDN_MODULES_ROOT=... node amendment6-starlink-11k.mjs --cycle eval --workers 14
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DAY_MS, HOUR_MS, sha256File, nowUtc, isoNoZ, utcMs, dayStr,
  loadSdsAndSdk, gpJsonToOmm, buildCausalSpwRecords, signedRtnErrorKm, buildCatalogBatch,
} from './amendment6-lib.mjs';

const SELF = fileURLToPath(import.meta.url);
const OAE = path.resolve(path.dirname(SELF), '../..');
const MODULES = process.env.SDN_MODULES_ROOT || path.resolve(OAE, '../../main-packages/space-data-network-modules');
const ARCHIVE = process.env.SDN_ARCHIVE_ROOT || '/opt/data/sdn-archive';
const CFG_PATH = fs.existsSync(path.join(path.dirname(SELF), 'amendment6-config.json'))
  ? path.join(path.dirname(SELF), 'amendment6-config.json')
  : path.join(OAE, 'experiments/ca-rollup-074/amendment6-config.json');
const CFG = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

const RUNS_DIR = path.join(OAE, 'runs/ca-rollup-074');
const OUT_PATH = path.join(OAE, 'results/ca-rollup-074/amendment6-starlink-11k.json');
const BINS = [['0-6', 0, 6], ['6-12', 6, 12], ['12-18', 12, 18], ['18-24', 18, 24]];

function signedRtn6Km(pState, tR, tV) {
  const dx = pState[0] - tR[0], dy = pState[1] - tR[1], dz = pState[2] - tR[2];
  const dvx = pState[3] - tV[0], dvy = pState[4] - tV[1], dvz = pState[5] - tV[2];
  const rMag = Math.hypot(tR[0], tR[1], tR[2]);
  const rx = tR[0] / rMag, ry = tR[1] / rMag, rz = tR[2] / rMag;
  const hx = tR[1] * tV[2] - tR[2] * tV[1];
  const hy = tR[2] * tV[0] - tR[0] * tV[2];
  const hz = tR[0] * tV[1] - tR[1] * tV[0];
  const hMag = Math.hypot(hx, hy, hz);
  const nx = hx / hMag, ny = hy / hMag, nz = hz / hMag;
  const tx = ny * rz - nz * ry, ty = nz * rx - nx * rz, tz = nx * ry - ny * rx;
  return [
    dx * rx + dy * ry + dz * rz,
    dx * tx + dy * ty + dz * tz,
    dx * nx + dy * ny + dz * nz,
    dvx * rx + dvy * ry + dvz * rz,
    dvx * tx + dvy * ty + dvz * tz,
    dvx * nx + dvy * ny + dvz * nz,
  ];
}

function checkFrozenAndPins(cycleName, preFreezeTrain) {
  if (preFreezeTrain) {
    if (cycleName !== 'train') throw new Error('--pre-freeze-train is ONLY allowed for --cycle train!');
    return;
  }
  if (!CFG.frozen || !CFG_PATH.endsWith('amendment6-config.json')) throw new Error('amendment6-config.json is not frozen');
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'experiments/ca-rollup-074/AMENDMENT-6.md', 'experiments/ca-rollup-074/amendment6-config.json'], { cwd: OAE, encoding: 'utf8' }).trim();
  if (dirty) throw new Error(`Amendment 6 registration dirty/uncommitted: ${dirty}`);
  const apSha = sha256File(path.join(MODULES, 'propagator/sdn-ap/dist/isomorphic/module.wasm'));
  if (apSha !== CFG.modules.sdnAp.wasmSha256) throw new Error(`sdn-ap wasm mismatch: ${apSha}`);
  const chSha = sha256File(path.join(MODULES, 'flows/catalog-builder/dist/isomorphic/module.wasm'));
  if (chSha !== CFG.modules.catalogBuilder.chainWasmSha256) throw new Error(`catalog-builder chain mismatch: ${chSha}`);
}

function prepareCycleCache(cycleName, workers, smoke) {
  const spec = CFG.starlinkSuite[`${cycleName}Cycle`];
  const t0Ms = Date.parse(spec.t0Utc);
  const lookbackMs = CFG.starlinkSuite.gpHistoryLookbackDays * DAY_MS;
  const fromMs = t0Ms - lookbackMs;
  const cacheDir = path.join(RUNS_DIR, `sl-${cycleName}${smoke ? '-smoke' : ''}`);
  fs.mkdirSync(cacheDir, { recursive: true });
  const metaFile = path.join(cacheDir, 'prep-meta.json');
  if (fs.existsSync(metaFile)) {
    const m = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (m.workers === workers && m.smoke === smoke) return { cacheDir, meta: m };
  }

  console.log(`${nowUtc()} [${cycleName}] Preparing Starlink inputs (strictly CREATION_DATE <= ${spec.t0Utc})...`);
  const inDir = path.join(ARCHIVE, 'operator-capture/cycles', spec.inputCycle);
  const trDir0 = path.join(ARCHIVE, 'operator-capture/cycles', spec.truthCycles[0]);
  const trDir1 = path.join(ARCHIVE, 'operator-capture/cycles', spec.truthCycles[1]);
  const set0 = new Set(fs.readdirSync(trDir0).filter((f) => f.endsWith('.ocm')).map((f) => Number(f.slice(0, -4))));
  const set1 = new Set(fs.readdirSync(trDir1).filter((f) => f.endsWith('.ocm')).map((f) => Number(f.slice(0, -4))));

  const gpSnap = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ARCHIVE, spec.gpSnapshot))));
  const seedByNorad = new Map();
  let filteredFutureGp = 0;
  for (const r of gpSnap) {
    const id = Number(r.NORAD_CAT_ID);
    const cMs = utcMs(r.CREATION_DATE), eMs = utcMs(r.EPOCH);
    if (cMs > t0Ms || eMs >= t0Ms) { filteredFutureGp++; continue; }
    const prev = seedByNorad.get(id);
    if (!prev || eMs > utcMs(prev.EPOCH)) seedByNorad.set(id, r);
  }

  const supPath = path.join(ARCHIVE, spec.supGpFile);
  if (sha256File(supPath) !== spec.supGpSha256) throw new Error(`SupGP SHA mismatch: ${supPath}`);
  const supArr = JSON.parse(zlib.gunzipSync(fs.readFileSync(supPath)));
  const supByNorad = new Map();
  for (const r of supArr) {
    const id = Number(r.NORAD_CAT_ID);
    if (utcMs(r.EPOCH) < t0Ms) supByNorad.set(id, r);
  }

  let norads = fs.readdirSync(inDir)
    .filter((f) => f.endsWith('.ocm'))
    .map((f) => Number(f.slice(0, -4)))
    .filter((id) => set0.has(id) && set1.has(id) && seedByNorad.has(id) && supByNorad.has(id))
    .sort((a, b) => a - b);
  if (smoke) norads = norads.slice(0, 28);
  const wantSet = new Set(norads);
  console.log(`${nowUtc()} [${cycleName}] Common intersection: ${norads.length} Starlinks (filteredFutureGp=${filteredFutureGp})`);

  const histDir = path.join(ARCHIVE, 'spacetrack/gp_history/by-creation/2026');
  const fromDay = dayStr(fromMs - DAY_MS);
  const toDay = dayStr(t0Ms);
  const files = fs.readdirSync(histDir)
    .filter((f) => f.endsWith('.json.gz'))
    .filter((f) => {
      const m = /^(\d{4}-\d{2}-\d{2})/.exec(f);
      return m && m[1] >= fromDay && m[1] <= toDay;
    })
    .sort();

  const histByNorad = new Map(norads.map((id) => [id, new Map()]));
  for (const id of norads) {
    const s = seedByNorad.get(id);
    histByNorad.get(id).set(s.EPOCH, s);
  }
  let histFilesRead = 0, histRowsKept = 0;
  for (const f of files) {
    const mStart = /^(\d{4}-\d{2}-\d{2}T\d{2}\d{2}\d{2}Z)/.exec(f);
    if (mStart) {
      const sIso = mStart[1].replace(/(\d{2})(\d{2})(\d{2})Z$/, '$1:$2:$3Z');
      if (Date.parse(sIso) > t0Ms) continue;
    }
    histFilesRead++;
    let arr;
    try { arr = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(histDir, f)))); } catch { continue; }
    for (const r of arr) {
      const id = Number(r.NORAD_CAT_ID);
      if (!wantSet.has(id)) continue;
      const cMs = utcMs(r.CREATION_DATE), eMs = utcMs(r.EPOCH);
      if (cMs > t0Ms || eMs >= t0Ms || eMs < fromMs) continue;
      histByNorad.get(id).set(r.EPOCH, r);
      histRowsKept++;
    }
  }
  const snapDir = path.join(ARCHIVE, 'spacetrack/gp/2026');
  for (const f of fs.readdirSync(snapDir).filter((x) => x.endsWith('.json.gz')).sort()) {
    const d = f.slice(0, 10);
    if (d < fromDay || d > toDay) continue;
    let arr;
    try { arr = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(snapDir, f)))); } catch { continue; }
    for (const r of arr) {
      const id = Number(r.NORAD_CAT_ID);
      if (!wantSet.has(id)) continue;
      const cMs = utcMs(r.CREATION_DATE), eMs = utcMs(r.EPOCH);
      if (cMs > t0Ms || eMs >= t0Ms || eMs < fromMs) continue;
      histByNorad.get(id).set(r.EPOCH, r);
    }
  }

  for (let w = 0; w < workers; w++) {
    const mine = norads.filter((_, i) => i % workers === w);
    const shardData = mine.map((id) => {
      const hist = [...histByNorad.get(id).values()].sort((a, b) => utcMs(a.EPOCH) - utcMs(b.EPOCH));
      const seed = hist.at(-1) ?? seedByNorad.get(id);
      return { id, seed, sup: supByNorad.get(id), hist };
    });
    fs.writeFileSync(path.join(cacheDir, `shard-${w}.json`), JSON.stringify(shardData));
  }
  const meta = {
    cycleName, t0Utc: spec.t0Utc, norads: norads.length, workers, smoke,
    histFilesRead, histRowsKept, filteredFutureGp,
    avgHistPerSat: +(norads.reduce((s, id) => s + histByNorad.get(id).size, 0) / Math.max(1, norads.length)).toFixed(2),
  };
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
  console.log(`${nowUtc()} [${cycleName}] Cache ready: ${JSON.stringify(meta)}`);
  return { cacheDir, meta };
}

async function runWorker(cycleName, shard, workers, smoke) {
  const tStart = Date.now();
  const spec = CFG.starlinkSuite[`${cycleName}Cycle`];
  const t0Ms = Date.parse(spec.t0Utc);
  const cacheDir = path.join(RUNS_DIR, `sl-${cycleName}${smoke ? '-smoke' : ''}`);
  const outFile = path.join(cacheDir, `rows-${shard}.jsonl`);
  if (fs.existsSync(outFile)) {
    console.log(`[${cycleName} w${shard}] cached -> skipping`);
    return;
  }

  const sds = await loadSdsAndSdk(MODULES);
  const { fb, sdkBrowser, sdkIso, OCM_MOD, OEM_MOD, PCF_MOD, frame, pack } = sds;
  const manifest = (dir) => JSON.parse(fs.readFileSync(path.join(MODULES, dir, 'plugin-manifest.json'), 'utf8'));

  const shardItems = JSON.parse(fs.readFileSync(path.join(cacheDir, `shard-${shard}.json`), 'utf8'));
  const weatherRecords = buildCausalSpwRecords({
    archiveRoot: ARCHIVE,
    firstDate: dayStr(t0Ms - 45 * DAY_MS),
    lastDate: dayStr(t0Ms + 50 * DAY_MS),
    cutoffDate: spec.weatherCutoffDate,
    sds,
  });

  const chain = await sdkIso.createStandaloneHarness('browser', path.join(MODULES, 'flows/catalog-builder/dist/isomorphic/module.wasm'), { surface: 'direct', enableBrowserWasiThreads: false });
  const gpH = await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(MODULES, 'analysis/gp-error-model/dist/isomorphic/module.wasm')), manifest: manifest('analysis/gp-error-model'), surface: 'direct' });
  const compH = await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(MODULES, 'analysis/catalog-composer/dist/isomorphic/module.wasm')), manifest: manifest('analysis/catalog-composer'), surface: 'direct' });
  const apEval = await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(MODULES, 'propagator/sdn-ap/dist/isomorphic/module.wasm')), surface: 'direct', initialMemoryBytes: 64 * 1024 * 1024 });
  const reusable = { chain, gp: gpH, composer: compH };

  const inDir = path.join(ARCHIVE, 'operator-capture/cycles', spec.inputCycle);
  const trDir0 = path.join(ARCHIVE, 'operator-capture/cycles', spec.truthCycles[0]);
  const trDir1 = path.join(ARCHIVE, 'operator-capture/cycles', spec.truthCycles[1]);

  const ingestOmm = async (ommRaw) => {
    const r = await apEval.invoke({ methodId: 'ingest_omm', inputs: [frame('omm', 'OMM', ommRaw)] });
    return r.statusCode === 0 ? Buffer.from(r.outputs.find((o) => o.portId === 'ocm').payload) : null;
  };
  const propGcrf6 = async (ocmBytes, epochs) => {
    const cfg = Object.assign(new PCF_MOD.PCFT(), {
      OUTPUT: Object.assign(new PCF_MOD.PCFOutputT(), { FRAME: PCF_MOD.pcfOutputFrame.GCRF, STEP_SECONDS: 60, MAXIMUM_STATES: 500000, EPOCHS: epochs }),
    });
    const r = await apEval.invoke({ methodId: 'propagate', inputs: [frame('ocm', 'OCM', ocmBytes), frame('configuration', 'PCF', pack(cfg, 'PCF', false))] });
    if (r.statusCode !== 0) return null;
    const blk = OEM_MOD.OEM.getRootAsOEM(new fb.ByteBuffer(r.outputs.find((o) => o.portId === 'ephemeris').payload)).EPHEMERIS_DATA_BLOCK(0);
    if (!blk || blk.ephemerisDataLinesLength() !== epochs.length) return null;
    const out = new Array(epochs.length);
    for (let i = 0; i < epochs.length; i++) {
      const L = blk.EPHEMERIS_DATA_LINES(i);
      out[i] = [L.X(), L.Y(), L.Z(), L.X_DOT(), L.Y_DOT(), L.Z_DOT()];
    }
    return out;
  };

  const BATCH = 48;
  const rowsOut = [];
  let done = 0;
  for (let b0 = 0; b0 < shardItems.length; b0 += BATCH) {
    const chunk = shardItems.slice(b0, b0 + BATCH);
    const seeds = new Map(), histMap = new Map(), ephMap = new Map(), ephUnpacked = new Map();

    for (const item of chunk) {
      seeds.set(item.id, gpJsonToOmm(item.seed, sds, true));
      histMap.set(item.id, item.hist.map((h) => ({ ms: utcMs(h.EPOCH), buf: gpJsonToOmm(h, sds, true) })));
      const ephBuf = fs.readFileSync(path.join(inDir, `${item.id}.ocm`));
      ephMap.set(item.id, ephBuf);
      ephUnpacked.set(item.id, OCM_MOD.OCM.getSizePrefixedRootAsOCM(new fb.ByteBuffer(new Uint8Array(ephBuf))).unpack());
    }

    const [resO, resX, resOp, resXp] = [
      await buildCatalogBatch({ modulesRoot: MODULES, sds, kind: 'sdn-ap', nowMs: t0Ms, seeds, historyByNorad: histMap, ephemeridesByNorad: ephMap, weatherRecords, reusable }),
      await buildCatalogBatch({ modulesRoot: MODULES, sds, kind: 'sgp4-xp', nowMs: t0Ms, seeds, historyByNorad: histMap, ephemeridesByNorad: ephMap, weatherRecords, reusable }),
      await buildCatalogBatch({ modulesRoot: MODULES, sds, kind: 'sdn-ap', nowMs: t0Ms, seeds, historyByNorad: histMap, ephemeridesByNorad: null, weatherRecords, reusable }),
      await buildCatalogBatch({ modulesRoot: MODULES, sds, kind: 'sgp4-xp', nowMs: t0Ms, seeds, historyByNorad: histMap, ephemeridesByNorad: null, weatherRecords, reusable }),
    ];

    for (const item of chunk) {
      const id = item.id;
      const oO = resO.get(id), oX = resX.get(id), oOp = resOp.get(id), oXp = resXp.get(id);
      if (!oO || !oX || !oOp || !oXp) continue;
      const oS = await ingestOmm(gpJsonToOmm(item.seed, sds, false));
      const oSup = await ingestOmm(gpJsonToOmm(item.sup, sds, false));
      if (!oS || !oSup) continue;

      let fitRmsO = null, btermO = null, hpKm = null;
      try {
        const unpO = OCM_MOD.OCM.getRootAsOCM(new fb.ByteBuffer(new Uint8Array(oO.ocmBuf))).unpack();
        fitRmsO = unpO.ORBIT_DETERMINATION?.FIT_STATISTICS?.FIT_RMS_KM ?? null;
        btermO = unpO.MEAN_ELEMENTS?.BTERM ?? null;
        const nRev = Number(item.seed.MEAN_MOTION), e = Number(item.seed.ECCENTRICITY);
        const aKm = Math.cbrt(398600.4418 / ((nRev * 2 * Math.PI) / 86400) ** 2);
        hpKm = +(aKm * (1 - e) - 6378.137).toFixed(1);
      } catch {}

      const tr0 = OCM_MOD.OCM.getSizePrefixedRootAsOCM(new fb.ByteBuffer(new Uint8Array(fs.readFileSync(path.join(trDir0, `${id}.ocm`))))).unpack();
      const tr1 = OCM_MOD.OCM.getSizePrefixedRootAsOCM(new fb.ByteBuffer(new Uint8Array(fs.readFileSync(path.join(trDir1, `${id}.ocm`))))).unpack();
      const byMs = new Map();
      const addTruth = (tr, overwrite) => {
        const st0 = Date.parse(tr.METADATA.START_TIME), step = tr.STATE_STEP_SIZE * 1000, nSt = tr.STATE_DATA.length / 6;
        for (let i = 0; i < nSt; i++) {
          const ms = st0 + i * step;
          if (ms <= t0Ms || ms > t0Ms + 24 * HOUR_MS) continue;
          if (overwrite || !byMs.has(ms)) {
            byMs.set(ms, { ms, hr: (ms - t0Ms) / HOUR_MS, iso: isoNoZ(ms), r: tr.STATE_DATA.slice(6 * i, 6 * i + 3), v: tr.STATE_DATA.slice(6 * i + 3, 6 * i + 6) });
          }
        }
      };
      addTruth(tr0, true);
      addTruth(tr1, false);
      const sortedAll = [...byMs.values()].sort((a, b) => a.ms - b.ms);
      const pts = [];
      let prevMs = -Infinity;
      for (const p of sortedAll) {
        if (p.ms - prevMs >= 1200000 - 1000) { pts.push(p); prevMs = p.ms; }
      }
      if (pts.length < 16) continue;

      const eph0 = ephUnpacked.get(id);
      const ephMapMs = new Map();
      {
        const st0 = Date.parse(eph0.METADATA.START_TIME), step = eph0.STATE_STEP_SIZE * 1000, nSt = eph0.STATE_DATA.length / 6;
        for (let i = 0; i < nSt; i++) {
          const ms = st0 + i * step;
          if (ms > t0Ms) ephMapMs.set(ms, eph0.STATE_DATA.slice(6 * i, 6 * i + 3));
        }
      }

      const epochs = pts.map((p) => p.iso);
      const preds = {
        S: await propGcrf6(oS, epochs),
        SupGP: await propGcrf6(oSup, epochs),
        Xp: await propGcrf6(oXp.ocmBuf, epochs),
        Op: await propGcrf6(oOp.ocmBuf, epochs),
        X: await propGcrf6(oX.ocmBuf, epochs),
        O: await propGcrf6(oO.ocmBuf, epochs),
      };
      if (Object.values(preds).some((p) => !p)) continue;

      const bins = {};
      for (const [bn, lo, hi] of BINS) {
        const idxs = [];
        for (let i = 0; i < pts.length; i++) if (pts[i].hr >= lo && pts[i].hr < hi) idxs.push(i);
        if (!idxs.length) continue;
        const midI = idxs[Math.floor(idxs.length / 2)];
        const meanKm = {}, vecKm = {};
        for (const arm of ['S', 'SupGP', 'Xp', 'Op', 'X', 'O']) {
          let sum = 0;
          for (const i of idxs) {
            const p = preds[arm][i], r = pts[i].r;
            sum += Math.hypot(p[0] - r[0], p[1] - r[1], p[2] - r[2]);
          }
          meanKm[arm] = +(sum / idxs.length).toFixed(5);
          vecKm[arm] = signedRtnErrorKm(preds[arm][midI], pts[midI].r, pts[midI].v).map((z) => +z.toFixed(5));
        }
        const v6O = signedRtn6Km(preds.O[midI], pts[midI].r, pts[midI].v).map((z) => +z.toPrecision(6));
        let sxSum = 0, sxCnt = 0;
        for (const p of sortedAll) {
          if (p.hr >= lo && p.hr < hi) {
            const r0 = ephMapMs.get(p.ms);
            if (r0) { sxSum += Math.hypot(r0[0] - p.r[0], r0[1] - p.r[1], r0[2] - p.r[2]); sxCnt++; }
          }
        }
        if (sxCnt >= 4) meanKm.SpaceX_T0 = +(sxSum / sxCnt).toFixed(5);
        bins[bn] = { n: idxs.length, meanKm, vecKm, v6O };
      }
      rowsOut.push(JSON.stringify({
        norad: id, hpKm,
        diagO: { rmsKm: fitRmsO != null ? +fitRmsO.toFixed(4) : null, bterm: btermO != null ? +btermO.toPrecision(4) : null },
        fb: { O: oO.isFallback, X: oX.isFallback, Op: oOp.isFallback, Xp: oXp.isFallback },
        bins,
      }));
    }
    done += chunk.length;
    if (done % 192 === 0 || done === shardItems.length) {
      console.log(`${nowUtc()} [${cycleName} w${shard}/${workers}] ${done}/${shardItems.length} (${((Date.now() - tStart) / 1000).toFixed(1)}s)`);
    }
  }

  fs.writeFileSync(`${outFile}.tmp`, rowsOut.join('\n') + '\n');
  fs.renameSync(`${outFile}.tmp`, outFile);
  await chain.destroy?.(); await gpH.destroy?.(); await compH.destroy?.(); await apEval.destroy?.();
}

function aggregateCycle(cycleName, workers, smoke) {
  const cacheDir = path.join(RUNS_DIR, `sl-${cycleName}${smoke ? '-smoke' : ''}`);
  const prepMeta = JSON.parse(fs.readFileSync(path.join(cacheDir, 'prep-meta.json'), 'utf8'));
  const rows = [];
  for (let w = 0; w < workers; w++) {
    const txt = fs.readFileSync(path.join(cacheDir, `rows-${w}.jsonl`), 'utf8').trim();
    if (!txt) continue;
    for (const l of txt.split('\n')) rows.push(JSON.parse(l));
  }
  if (rows.length < Math.floor(prepMeta.norads * 0.98)) {
    throw new Error(`[${cycleName}] incomplete scoring: ${rows.length}/${prepMeta.norads} satellites (<98%)`);
  }
  const mergedPrivate = path.join(RUNS_DIR, `starlink-${cycleName}-rows${smoke ? '-smoke' : ''}.jsonl`);
  fs.writeFileSync(mergedPrivate, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const q = (arr, p) => {
    const s = arr.slice().sort((a, b) => a - b);
    if (!s.length) return null;
    const x = (s.length - 1) * p, lo = Math.floor(x), hi = Math.ceil(x);
    return +(s[lo] + (s[hi] - s[lo]) * (x - lo)).toFixed(4);
  };
  const arms = ['S', 'SupGP', 'Xp', 'Op', 'X', 'O'];
  const fallbacks = { O: 0, X: 0, Op: 0, Xp: 0 };
  for (const r of rows) for (const k of ['O', 'X', 'Op', 'Xp']) if (r.fb?.[k]) fallbacks[k]++;

  const binsOut = {};
  for (const [bn] of BINS) {
    const sub = rows.filter((r) => r.bins?.[bn]);
    if (!sub.length) continue;
    const med = {}, p90 = {}, p95 = {}, over1 = {}, over5 = {}, over10 = {};
    for (const a of arms) {
      const vals = sub.map((r) => r.bins[bn].meanKm[a]);
      med[a] = q(vals, 0.5);
      p90[a] = q(vals, 0.9);
      p95[a] = q(vals, 0.95);
      over1[a] = vals.filter((v) => v > 1).length;
      over5[a] = vals.filter((v) => v > 5).length;
      over10[a] = vals.filter((v) => v > 10).length;
    }
    const sxSub = sub.filter((r) => Number.isFinite(r.bins[bn].meanKm.SpaceX_T0));
    if (sxSub.length) {
      const vals = sxSub.map((r) => r.bins[bn].meanKm.SpaceX_T0);
      med.SpaceX_T0 = q(vals, 0.5); p90.SpaceX_T0 = q(vals, 0.9); p95.SpaceX_T0 = q(vals, 0.95);
      over1.SpaceX_T0 = vals.filter((v) => v > 1).length;
      over5.SpaceX_T0 = vals.filter((v) => v > 5).length;
      over10.SpaceX_T0 = vals.filter((v) => v > 10).length;
    }
    const win = (a, b) => +(sub.filter((r) => r.bins[bn].meanKm[a] < r.bins[bn].meanKm[b]).length / sub.length).toFixed(4);
    binsOut[bn] = {
      satellites: sub.length,
      spaceXT0Satellites: sxSub.length,
      medianKm: med, p90Km: p90, p95Km: p95,
      over1km: over1, over5km: over5, over10km: over10,
      closerShare: {
        O_vs_S: win('O', 'S'), O_vs_SupGP: win('O', 'SupGP'), O_vs_X: win('O', 'X'),
        O_vs_Op: win('O', 'Op'), Op_vs_S: win('Op', 'S'), Op_vs_Xp: win('Op', 'Xp'), SupGP_vs_S: win('SupGP', 'S'),
      },
    };
  }
  return {
    cycleName, t0Utc: prepMeta.t0Utc,
    inputCycle: CFG.starlinkSuite[`${cycleName}Cycle`].inputCycle,
    truthCycles: CFG.starlinkSuite[`${cycleName}Cycle`].truthCycles,
    truthDisclosure: 'Truth is SpaceX subsequent published ephemeris cycles (00-57Z and 08-57Z), not independent laser/GNSS tracking.',
    satellitesScoredAllArms: rows.length,
    fallbacks,
    prep: { histFilesRead: prepMeta.histFilesRead, avgHistPerSat: prepMeta.avgHistPerSat, filteredFutureGp: prepMeta.filteredFutureGp },
    bins: binsOut,
  };
}

async function main() {
  const cycle = arg('--cycle', 'eval');
  const workers = Number(arg('--workers', '14'));
  const smoke = has('--smoke');
  const preFreezeTrain = has('--pre-freeze-train');
  checkFrozenAndPins(cycle, preFreezeTrain);
  if (arg('--worker') !== null) {
    await runWorker(cycle, Number(arg('--worker')), workers, smoke);
    return;
  }
  const t0 = Date.now();
  const cycles = cycle === 'both' ? ['train', 'eval'] : [cycle];
  const existing = fs.existsSync(OUT_PATH) && !smoke && !preFreezeTrain ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')) : {
    schema: 'sdn-ap-amendment6-starlink-11k-1',
    issue: CFG.issue,
    registrationCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: OAE, encoding: 'utf8' }).trim(),
    configSha256: sha256File(CFG_PATH),
    modules: CFG.modules,
    cycles: {},
  };
  for (const cyc of cycles) {
    prepareCycleCache(cyc, workers, smoke);
    await Promise.all(Array.from({ length: workers }, (_, w) => new Promise((resolve, reject) => {
      const c = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=4096', SELF,
        '--cycle', cyc, '--worker', String(w), '--workers', String(workers),
        ...(smoke ? ['--smoke'] : []), ...(preFreezeTrain ? ['--pre-freeze-train'] : [])],
        { stdio: 'inherit', env: process.env });
      c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cyc} worker ${w} exited ${code}`))));
    })));
    const agg = aggregateCycle(cyc, workers, smoke);
    if (smoke || preFreezeTrain) {
      console.log(`${preFreezeTrain ? 'PRE-FREEZE TRAIN' : 'SMOKE'} PASS:`, JSON.stringify(agg.bins, null, 2));
      return;
    }
    existing.cycles[cyc] = agg;
    existing.generatedUtc = nowUtc();
    existing.wallSec = +((Date.now() - t0) / 1000).toFixed(1);
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(existing, null, 2) + '\n');
    console.log(`\n=== [${cyc}] COMPLETE -> ${OUT_PATH} ===`);
    console.log(JSON.stringify(agg.bins, null, 2));
  }
}

await main();
process.exit(0);
