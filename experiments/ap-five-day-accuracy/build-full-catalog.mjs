import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import os from "node:os";
import { Worker } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import * as flatbuffers from "flatbuffers";
import * as PCF from "spacedatastandards.org/lib/js/PCF/main.js";
import { DCL } from "spacedatastandards.org/lib/js/DCL/main.js";
import { OCM } from "spacedatastandards.org/lib/js/OCM/OCM.js";
import { meanElementSource } from "spacedatastandards.org/lib/js/OCM/meanElementSource.js";
import { OEM } from "spacedatastandards.org/lib/js/OEM/OEM.js";
import { assertNoUserDefined } from "../../../../repos/main-packages/space-data-network-modules/common/tests/no-user-defined.mjs";

import { assertAllowedPath, isHeldForStudy, CREDITS } from "./lib/hold-gate.mjs";
import { buildSpaceWeather } from "./lib/space-weather.mjs";
import { loadPhysicalRegistry } from "./lib/physical-registry.mjs";
import { loadGpHistory, jdOf } from "./lib/gp-history-loader.mjs";
import { classifyOrbitRegime } from "./lib/crlb-covariance.mjs";
import { loadWasmModule, loadEopContext, TYPES } from "./lib/wasm-hosts.mjs";
import { buildCausalDcaAndRollingPriors } from "./lib/tle-upgrades-host.mjs";
import {
  loadReferenceOemIndex,
  loadMetopSgGcrfSeries,
  loadWaasSbasGcrfByPrn,
  scanSatnogsOpticalSessions,
  convertBucketViaSatnogsSource,
  convertGenericOpticalSiteNightViaSatnogsSource,
  loadIauScoreOptical,
  loadFinkZtfTracklets,
  collapseFinkZtfToExposureSights,
  selectBestDenseNightCluster,
  utcMs,
} from "./lib/truth-and-optical-loader.mjs";
import {
  ALL_REGIME_OPTICAL_WASM_PATH,
  fitDenseGcrfOemToApOcm,
} from "./lib/external-and-optical-ap-engine.mjs";
import { evalSgp4OwnEpochs, propagateSingleTleSgp4Gcrf } from "./lib/ssn-epoch-engine.mjs";

const OUT_DIR = (process.env.AP_CATALOG_STORE || "/opt/data/ap-crlb-catalog-2026-11-08");
const WORKER_SCRIPT = new URL("./lib/fit-worker.mjs", import.meta.url);
const OPTICAL_WORKER_SCRIPT = new URL("./lib/optical-fit-worker.mjs", import.meta.url);
fs.mkdirSync(OUT_DIR, { recursive: true });

function quantile(arr, q) {
  if (!arr || !arr.length) return NaN;
  const a = [...arr].sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? a[lo] : a[lo] * (hi - pos) + a[hi] * (pos - lo);
}

function extractSigmaRtnFromOcm(ocmBytes, rTeme = null, vTeme = null) {
  const root = OCM.getRootAsOCM(new flatbuffers.ByteBuffer(ocmBytes));
  if (root.covarianceDataLength() < 6) return [NaN, NaN, NaN];
  const c00 = root.COVARIANCE_DATA(0), c10 = root.COVARIANCE_DATA(1), c11 = root.COVARIANCE_DATA(2);
  const c20 = root.COVARIANCE_DATA(3), c21 = root.COVARIANCE_DATA(4), c22 = root.COVARIANCE_DATA(5);
  if (!rTeme || !vTeme) {
    return [Math.sqrt(Math.max(0, c00)) * 1000, Math.sqrt(Math.max(0, c11)) * 1000, Math.sqrt(Math.max(0, c22)) * 1000];
  }
  const rr = Math.hypot(...rTeme);
  const h = [rTeme[1] * vTeme[2] - rTeme[2] * vTeme[1], rTeme[2] * vTeme[0] - rTeme[0] * vTeme[2], rTeme[0] * vTeme[1] - rTeme[1] * vTeme[0]];
  const hh = Math.hypot(...h);
  if (!(rr > 0 && hh > 0)) {
    return [Math.sqrt(Math.max(0, c00)) * 1000, Math.sqrt(Math.max(0, c11)) * 1000, Math.sqrt(Math.max(0, c22)) * 1000];
  }
  const U = [rTeme[0] / rr, rTeme[1] / rr, rTeme[2] / rr];
  const W = [h[0] / hh, h[1] / hh, h[2] / hh];
  const V = [W[1] * U[2] - W[2] * U[1], W[2] * U[0] - W[0] * U[2], W[0] * U[1] - W[1] * U[0]];
  const P = [[c00, c10, c20], [c10, c11, c21], [c20, c21, c22]];
  const quad = (u) => {
    let s = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += u[i] * P[i][j] * u[j];
    return Math.sqrt(Math.max(0, s)) * 1000;
  };
  return [quad(U), quad(V), quad(W)];
}

function frameOcm(ocmBytes) {
  const framed = new Uint8Array(4 + ocmBytes.length);
  new DataView(framed.buffer).setUint32(0, ocmBytes.length, true);
  framed.set(ocmBytes, 4);
  return framed;
}

const t0 = performance.now();
console.log("=== 1. Building Causal 2026-11-08 Space Weather Stream, Fleet $DCL, & Multi-Month Priors ===");
const spw = buildSpaceWeather({ firstDate: "2026-06-15", lastDate: "2026-12-20", cutoffDate: "2026-11-08" });
const spwOutPath = path.join(OUT_DIR, "space-weather-2026-11-08.spw.stream");
fs.writeFileSync(spwOutPath, spw.bytes);

const reg = loadPhysicalRegistry();
const allObjects = loadGpHistory({
  satcatRegistry: reg,
  startDay: "2026-10-25",
  cutoffIso: "2026-11-08T23:59:59.999999",
  windowDays: 14.5,
});

// Enrich MEO / HEO / GEO objects (n <= 10.5 or e >= 0.08) with full 45-day GP history for multi-lunar-period secular de-aliasing!
const deepOrbitNorads = new Set(
  allObjects
    .filter((o) => {
      const last = o.tles.at(-1);
      return last && (last.n <= 10.5 || last.e >= 0.08);
    })
    .map((o) => o.norad)
);
if (deepOrbitNorads.size > 0) {
  const deepObjects = loadGpHistory({
    satcatRegistry: reg,
    startDay: "2026-09-23",
    cutoffIso: "2026-11-08T23:59:59.999999",
    windowDays: 45.5,
    noradAllowlist: deepOrbitNorads,
  });
  const deepMap = new Map(deepObjects.map((o) => [o.norad, o.tles]));
  for (const o of allObjects) {
    const deepTles = deepMap.get(o.norad);
    if (deepTles && deepTles.length > o.tles.length) {
      o.tles = deepTles;
    }
  }
}
const objByNorad = new Map(allObjects.map((o) => [o.norad, o]));

// Build 135-day multi-month causal GP history pool from daily GP snapshots (2026-06-24..2026-10-25) + recent sub-daily GP history
// to solve Fleet-Wide Passive LEO $DCL (DCA_COMMON_MODE) and Multi-Month Rolling Kalman BTERM & AGOM Priors!
const multiMonthByNorad = new Map();
for (const o of allObjects) {
  multiMonthByNorad.set(o.norad, [...o.tles]);
}
{
  const gpDir = (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive") + "/spacetrack/gp/2026";
  assertAllowedPath(gpDir);
  const minD70 = Date.UTC(2026, 5, 22) / 86400000;
  const gpSnapFiles = fs
    .readdirSync(gpDir)
    .filter((f) => f.endsWith(".json.gz") && f.slice(0, 10) >= "2026-06-24" && f.slice(0, 10) <= "2026-10-25")
    .sort();
  for (const f of gpSnapFiles) {
    const arr = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(gpDir, f))).toString("utf8"));
    for (let i = 0; i < arr.length; i++) {
      const r = arr[i];
      const norad = Number(r.NORAD_CAT_ID);
      const list = multiMonthByNorad.get(norad);
      if (!list) continue;
      const ep = r.EPOCH;
      if (!ep || ep > "2026-11-08T23:59:59.999999") continue;
      const sc = reg.get(norad);
      if (isHeldForStudy(norad, r.OBJECT_NAME || sc?.name || "", ep)) continue;
      const n = Number(r.MEAN_MOTION), e = Number(r.ECCENTRICITY);
      if (!(n > 0.05) || !(e >= 0.0 && e < 0.995)) continue;
      const jd = jdOf(ep);
      if (!jd) continue;
      const d70 = jd.whole - 2440587.5 + jd.frac;
      if (d70 < minD70) continue;
      list.push({
        norad,
        epoch: ep,
        whole: jd.whole,
        frac: jd.frac,
        d70,
        n,
        e,
        inc: Number(r.INCLINATION),
        raan: Number(r.RA_OF_ASC_NODE),
        argp: Number(r.ARG_OF_PERICENTER),
        ma: Number(r.MEAN_ANOMALY),
        bstar: Number(r.BSTAR) || 0,
        ndot: Number(r.MEAN_MOTION_DOT) || 0,
        nddot: Number(r.MEAN_MOTION_DDOT) || 0,
        gpId: Number(r.GP_ID) || 0,
        name: r.OBJECT_NAME || null,
        objectId: r.OBJECT_ID || null,
        objectType: r.OBJECT_TYPE || null,
      });
    }
  }
}
const multiMonthObjects = allObjects.map((o) => {
  const list = multiMonthByNorad.get(o.norad);
  list.sort((a, b) => a.d70 - b.d70 || a.gpId - b.gpId);
  const dedup = [];
  for (const it of list) {
    if (dedup.length > 0 && Math.abs(it.d70 - dedup[dedup.length - 1].d70) * 86400.0 < 60.0) {
      if (it.gpId >= dedup[dedup.length - 1].gpId) dedup[dedup.length - 1] = it;
    } else {
      dedup.push(it);
    }
  }
  return { norad: o.norad, name: o.name, objectId: o.objectId, objectType: o.objectType, tles: dedup };
});
multiMonthByNorad.clear();

const cutoffNov8Jd = jdOf("2026-11-08T23:59:59.999999");
const cutoffNov8D70 = cutoffNov8Jd.whole - 2440587.5 + cutoffNov8Jd.frac;
const { dcaRecord, rollingPriors } = buildCausalDcaAndRollingPriors({
  catalogObjects: multiMonthObjects,
  targetObjects: multiMonthObjects,
  physicalPriors: reg,
  spw,
  cutoffD70: cutoffNov8D70,
});
multiMonthObjects.length = 0; // release multi-month TLE arrays once $DCL & rolling posteriors are computed

let dcaOutFile = null;
if (dcaRecord?.dclBytes) {
  if (!DCL.bufferHasIdentifier(new flatbuffers.ByteBuffer(dcaRecord.dclBytes))) {
    throw new Error("Emitted $DCL buffer lacks $DCL identifier");
  }
  dcaOutFile = "tle-fleet-dca-2026-11-08.dcl";
  fs.writeFileSync(path.join(OUT_DIR, dcaOutFile), dcaRecord.dclBytes);
  console.log(
    `  Built Fleet Passive LEO $DCL (${dcaOutFile}, cid=${dcaRecord.cid}): sats=${dcaRecord.satCount}, arcs=${dcaRecord.arcsUsed}, sAtIssue=${dcaRecord.sAtIssue.toFixed(4)} (${Math.exp(dcaRecord.sAtIssue).toFixed(3)}x), postfitRms=${dcaRecord.postfitRms.toFixed(3)}; rolling priors=${rollingPriors.size}`
  );
}

console.log(`Loaded ${allObjects.length} non-held active catalog objects (${deepOrbitNorads.size} deep MEO/HEO/GEO with 45d arcs) in ${((performance.now() - t0) / 1000).toFixed(2)}s`);

// Read study results if present to check whether causal Nov 3 ESA_GNSS beats Nov 8 TLEs
let useEsaGnssForNov8 = false;
const studyPath = path.join(OUT_DIR, "pure-accuracy-study-results.json");
if (fs.existsSync(studyPath)) {
  const st = JSON.parse(fs.readFileSync(studyPath, "utf8"));
  useEsaGnssForNov8 = !!st.gnssLagCheckNov3ToNov8?.useEsaGnssInNov8Catalog;
  console.log(`Study result loaded: useEsaGnssInNov8Catalog=${useEsaGnssForNov8}`);
}

// ============================================================================
// 2. Build External Precision & Open-Optical Enhanced AP $OCM Layer
// ============================================================================
console.log("=== 2. Fitting External Precision & Open-Optical Enhanced AP $OCMs ===");
const [eopParser, framesHost, satnogsSrc, sdnAp] = await Promise.all([
  loadWasmModule("data-source/eop-parser/dist/isomorphic/module.wasm"),
  loadWasmModule("foundation/frames/dist/isomorphic/module.wasm"),
  loadWasmModule("data-source/satnogs-optical-source/dist/isomorphic/module.wasm"),
  loadWasmModule("propagator/sdn-ap/dist/isomorphic/module.wasm", { enableThreads: true }),
]);
const eopCtx = await loadEopContext(eopParser);

// Map<norad, { meta, framedBuf }> for objects superseded by verified higher-accuracy external/open-optical AP $OCMs
const enhancedByNorad = new Map();

// 2A. EUMETSAT Metop-SG A1 (NORAD 65159): Nov 7..Nov 8T23:55Z operational AUX_POFD -> AP $OCM (~12 m accuracy!)
{
  const metopStates = await loadMetopSgGcrfSeries(framesHost, eopCtx.eopRows, {
    startIso: "2026-11-07T00:00:00",
    stopIso: "2026-11-08T23:55:00",
    stepMinutes: 5,
  });
  const fit = await fitDenseGcrfOemToApOcm(sdnAp, {
    norad: 65159,
    objectName: "METOP-SG A1",
    objectId: "2025-173A",
    states: metopStates,
    eccentricity: 0.0012,
    spwBytes: spw.bytes,
    pvnSpec: { sourceId: "eumetsat-metopsg-pofd", lineage: CREDITS.EUMETSAT_METOPSG },
  });
  if (fit.ok) {
    const o = objByNorad.get(65159);
    const ownRef = o?.tles?.length ? evalSgp4OwnEpochs(sdnAp, [o.tles.at(-1)])[0] : null;
    const sigM = extractSigmaRtnFromOcm(fit.ocmBytes, ownRef?.rTeme, ownRef?.vTeme);
    const { regime, hpKm } = classifyOrbitRegime(fit.ocm.MEAN_ELEMENTS.MEAN_MOTION, fit.ocm.MEAN_ELEMENTS.ECCENTRICITY);
    enhancedByNorad.set(65159, {
      framedBuf: frameOcm(fit.ocmBytes),
      meta: {
        norad: 65159,
        name: o?.name || "METOP-SG A1",
        objectId: o?.objectId || "2025-173A",
        objectType: o?.objectType || "PAYLOAD",
        ok: true,
        sourceTier: "ap-external-pod-metopsg",
        theory: "AP",
        epoch: fit.epoch,
        regime,
        perigeeAltKm: Number(hpKm.toFixed(1)),
        mTle: o?.tles?.length ?? 0,
        arcDays: 2.0,
        fitRmsM: Number(fit.fitRmsM.toFixed(2)),
        bterm: Number(fit.bterm.toPrecision(6)),
        agom: Number(fit.agom.toPrecision(6)),
        hasDiscos: !!reg.get(65159)?.discos,
        sigmaRtnM: sigM.map((x) => Number(x.toFixed(2))),
        rss3dSigmaM: Number(Math.hypot(...sigM).toFixed(2)),
        byteLength: fit.ocmBytes.length,
      },
    });
    console.log(`  Enhanced 65159 (METOP-SG A1) via EUMETSAT AUX_POFD: epoch=${fit.epoch}, fitRms=${fit.fitRmsM.toFixed(2)}m`);
  }
}

// 2B. ESA Final GNSS (if verified superior on Nov 8 in pure-accuracy-study-results.json & maneuver-free Nov 3..8)
if (useEsaGnssForNov8) {
  const refIdx = loadReferenceOemIndex({ minStartIso: "2026-11-01T00:00:00Z" });
  let gnssEnhanced = 0;
  for (const [norad, entries] of refIdx.byNorad.entries()) {
    if (entries.at(-1).family !== "ESA_GNSS") continue;
    const o = objByNorad.get(norad);
    if (!o || o.tles.length < 2) continue;
    // Ensure zero station-keeping burn between Nov 3 and Nov 8
    const nov3Stop = entries.at(-1).stop;
    if (nov3Stop < utcMs("2026-11-03T12:00:00Z")) continue;
    let burned = false;
    for (let k = 0; k + 1 < o.tles.length; k++) {
      const a = o.tles[k], b = o.tles[k + 1];
      const dt = b.d70 - a.d70;
      if (dt <= 0) continue;
      const midJd = { whole: Math.floor((a.d70 + b.d70) * 0.5) + 2440587.5, frac: ((a.d70 + b.d70) * 0.5) % 1 };
      const ma = propagateSingleTleSgp4Gcrf(sdnAp, a, [midJd])[0];
      const mb = propagateSingleTleSgp4Gcrf(sdnAp, b, [midJd])[0];
      if (ma.status !== 0 || mb.status !== 0 || Math.hypot(mb.rGcrf[0] - ma.rGcrf[0], mb.rGcrf[1] - ma.rGcrf[1], mb.rGcrf[2] - ma.rGcrf[2]) > 2.5) {
        burned = true;
        break;
      }
    }
    if (burned) continue;
    const series = refIdx.getSeries(norad, nov3Stop - 48 * 3600000, nov3Stop);
    const fit = await fitDenseGcrfOemToApOcm(sdnAp, {
      norad,
      objectName: o.name,
      objectId: o.objectId,
      states: series,
      eccentricity: o.tles.at(-1).e,
      spwBytes: spw.bytes,
      pvnSpec: { sourceId: "esa-final-gnss-sp3", lineage: CREDITS.ESA_GNSS },
    });
    if (fit.ok) {
      const ownRef = evalSgp4OwnEpochs(sdnAp, [o.tles.at(-1)])[0];
      const sigM = extractSigmaRtnFromOcm(fit.ocmBytes, ownRef?.rTeme, ownRef?.vTeme);
      const { regime, hpKm } = classifyOrbitRegime(fit.ocm.MEAN_ELEMENTS.MEAN_MOTION, fit.ocm.MEAN_ELEMENTS.ECCENTRICITY);
      enhancedByNorad.set(norad, {
        framedBuf: frameOcm(fit.ocmBytes),
        meta: {
          norad,
          name: o.name,
          objectId: o.objectId,
          objectType: o.objectType,
          ok: true,
          sourceTier: "ap-external-sp3-gnss",
          theory: "AP",
          epoch: fit.epoch,
          regime,
          perigeeAltKm: Number(hpKm.toFixed(1)),
          mTle: o.tles.length,
          arcDays: 2.0,
          fitRmsM: Number(fit.fitRmsM.toFixed(2)),
          bterm: Number(fit.bterm.toPrecision(6)),
          agom: Number(fit.agom.toPrecision(6)),
          hasDiscos: !!reg.get(norad)?.discos,
          sigmaRtnM: sigM.map((x) => Number(x.toFixed(2))),
          rss3dSigmaM: Number(Math.hypot(...sigM).toFixed(2)),
          byteLength: fit.ocmBytes.length,
        },
      });
      gnssEnhanced++;
    }
  }
  console.log(`  Enhanced ${gnssEnhanced} maneuver-free GNSS MEO satellites via ESA Final SP3`);
}

// 2C. All-Regime Unseeded Open Optical (`SatNOGS Optical` Oct 26..Nov 8 + `IAU CPS SCORE` + `Fink ZTF Palomar`)
const optScanNov = scanSatnogsOpticalSessions({ startSession: "2026-10-26", stopSession: "2026-11-08" });
const scoreMap = loadIauScoreOptical();
const finkTracklets = loadFinkZtfTracklets();
const finkSights = collapseFinkZtfToExposureSights(finkTracklets);

const optCandidates = [];
for (const [norad, sessMap] of optScanNov.byNorad.entries()) {
  const gpObj = objByNorad.get(norad);
  const sc = reg.get(norad);
  const objName = gpObj?.name || sc?.name || "";
  if (isHeldForStudy(norad, objName, "2026-11-08T00:00:00Z")) continue;
  if (sc?.decayDate && sc.decayDate <= "2026-11-08") continue;
  const rawBuckets = [...sessMap.values()].filter((b) => b.stationId !== 7);
  const clustered = selectBestDenseNightCluster(rawBuckets, (b) => b.session, {
    maxGapDays: 4.0,
    maxSpanDays: 7.5,
    maxNights: 4,
    minObservationsPerNight: 3,
  });
  const nights = new Set(clustered.map((b) => b.session));
  if (nights.size < 2) continue;
  const mTle = gpObj?.tles?.length ?? 0;
  const lastTle = gpObj?.tles?.at(-1);
  const isDeep = lastTle ? lastTle.n <= 10.5 || lastTle.e >= 0.08 : true;
  if (mTle <= 2 || isDeep || nights.size >= 3) {
    optCandidates.push({ norad, cleanBuckets: clustered, nightsCount: nights.size, mTle, isDeep });
  }
}
// Prioritize mTle === 0 (net-new objects!), mTle <= 2 (sparse GP), deep-space (HEO/GEO/MEO), and >=3 nights!
optCandidates.sort(
  (a, b) =>
    (a.mTle === 0 ? -1 : 1) - (b.mTle === 0 ? -1 : 1) ||
    (a.mTle <= 2 ? -1 : 1) - (b.mTle <= 2 ? -1 : 1) ||
    (b.isDeep ? 1 : 0) - (a.isDeep ? 1 : 0) ||
    b.nightsCount - a.nightsCount
);

const opticalJobs = [];
for (const cand of optCandidates.slice(0, 140)) {
  const tdms = [], eoos = [], stations = [], timingSigmas = {};
  let pvnBytes = null;
  for (const b of cand.cleanBuckets) {
    const subB = b.rows.length > 96 ? { ...b, rows: b.rows.filter((_, idx) => idx % Math.ceil(b.rows.length / 48) === 0) } : b;
    const conv = await convertBucketViaSatnogsSource(satnogsSrc, subB);
    tdms.push(...conv.tdms);
    eoos.push(...conv.eoos);
    stations.push(...conv.stations);
    pvnBytes = conv.provenance;
    timingSigmas[`SATNOGS-OPTICAL-${String(b.stationId).padStart(4, "0")}`] = Math.max(
      0.020,
      (b.stationJson?.station?.timing?.sigma_ms ?? 25) * 1e-3
    );
  }
  // Fuse co-observed IAU CPS SCORE multi-site measurements if present within the cluster window
  const scoreObs = (scoreMap.get(cand.norad) || []).filter((s) => s.epochIso >= "2026-10-26" && s.sigmaArcsec <= 90);
  if (scoreObs.length >= 2) {
    const convScore = await convertGenericOpticalSiteNightViaSatnogsSource(satnogsSrc, {
      norad: cand.norad,
      stationIdNum: 9001,
      stationName: "IAU-CPS-SCORE",
      latDeg: scoreObs[0].latDeg,
      lonDeg: scoreObs[0].lonDeg,
      altM: scoreObs[0].altM,
      obsList: scoreObs.filter((x) => Math.hypot(x.latDeg - scoreObs[0].latDeg, x.lonDeg - scoreObs[0].lonDeg) < 0.05),
      minSigmaArcsec: 20,
      minimumMeasurements: 2,
    });
    if (convScore.tdms.length) {
      tdms.push(...convScore.tdms);
      eoos.push(...convScore.eoos);
      stations.push(...convScore.stations);
      timingSigmas[convScore.stationKey] = 0.15;
    }
  }
  const gpObj = objByNorad.get(cand.norad);
  const sc = reg.get(cand.norad);
  opticalJobs.push({
    norad: cand.norad,
    objectId: gpObj?.objectId || sc?.intlDes || `${cand.norad}`,
    tdms,
    eoos,
    stations,
    timingSigmas,
    pvnBytes,
    metaExtra: { nightsCount: cand.nightsCount, mTle: cand.mTle },
  });
}

const optWorkerCount = Math.min(16, Math.max(2, opticalJobs.length));
const optBuckets = Array.from({ length: optWorkerCount }, () => []);
opticalJobs.forEach((job, idx) => optBuckets[idx % optWorkerCount].push(job));

const optWorkerRes = opticalJobs.length
  ? await Promise.all(
      optBuckets.map(
        (jobs) =>
          new Promise((resolve, reject) => {
            const w = new Worker(OPTICAL_WORKER_SCRIPT, {
              workerData: {
                isOpticalWorker: true,
                eopStreamBytes: eopCtx.eopStreamBytes,
                earthOrientationPrw: eopCtx.earthOrientationPrw,
                spwBytes: spw.bytes,
                jobs,
              },
            });
            w.once("message", (msg) => resolve(msg.results));
            w.once("error", reject);
          })
      )
    )
  : [];

const opticalSidecarFrames = [];
const opticalFittedRecords = [];
for (const r of optWorkerRes.flat()) {
  if (!r.ok || !(r.fitRmsM < 350 && r.weightedRms <= 3.5)) continue;
  const ocmBytes = new Uint8Array(r.ocmBytes);
  assertNoUserDefined(ocmBytes);
  const framed = frameOcm(ocmBytes);
  opticalSidecarFrames.push(framed);
  const o = objByNorad.get(r.norad);
  const sc = reg.get(r.norad);
  const { regime, hpKm } = classifyOrbitRegime(r.meanMotion, r.meanEcc);
  const mTle = r.metaExtra?.mTle ?? (o?.tles?.length ?? 0);
  const promote = mTle <= 2 && !enhancedByNorad.has(r.norad);
  opticalFittedRecords.push({
    norad: r.norad,
    name: o?.name || sc?.name || `SAT-${r.norad}`,
    regime,
    perigeeAltKm: Number(hpKm.toFixed(1)),
    mTle,
    nights: r.metaExtra?.nightsCount ?? 2,
    obsUsed: r.obsUsed,
    residualRmsArcsec: Number(r.residualRmsArcsec.toFixed(2)),
    fitRmsM: Number(r.fitRmsM.toFixed(2)),
    epoch: r.epoch,
    promotedToMasterCatalog: promote,
  });
  if (promote) {
    enhancedByNorad.set(r.norad, {
      framedBuf: framed,
      meta: {
        norad: r.norad,
        name: o?.name || sc?.name || `SAT-${r.norad}`,
        objectId: o?.objectId || sc?.intlDes || "",
        objectType: o?.objectType || sc?.objectType || "UNKNOWN",
        ok: true,
        sourceTier: mTle === 0 ? "ap-open-optical-net-new" : "ap-open-optical-angles-only",
        theory: "AP",
        epoch: r.epoch,
        regime,
        perigeeAltKm: Number(hpKm.toFixed(1)),
        mTle,
        arcDays: r.metaExtra?.nightsCount ?? 2,
        fitRmsM: Number(r.fitRmsM.toFixed(2)),
        bterm: Number(r.bterm.toPrecision(6)),
        agom: Number(r.agom.toPrecision(6)),
        hasDiscos: !!sc?.discos,
        sigmaRtnM: r.sigmaRtnM.map((x) => Number(x.toFixed(2))),
        rss3dSigmaM: Number(r.rss3dSigmaM.toFixed(2)),
        byteLength: ocmBytes.length,
      },
    });
  }
}
if (opticalSidecarFrames.length > 0) {
  fs.writeFileSync(path.join(OUT_DIR, "open-optical-2026-11-08.ocm.stream"), Buffer.concat(opticalSidecarFrames));
}
console.log(
  `  Open Optical All-Regime (16 workers): ${opticalFittedRecords.length}/${opticalJobs.length} unseeded multi-night AP $OCMs converged (${opticalFittedRecords.filter((x) => x.promotedToMasterCatalog).length} promoted, including ${opticalFittedRecords.filter((x) => x.mTle === 0 && x.promotedToMasterCatalog).length} mTle=0 net-new objects); ${scoreMap.size} non-held SCORE sats; ${finkSights.length} ZTF Palomar 1.5" sights`
);

// Annotate objects observed in Nov 1..8 SatNOGS Optical / IAU CPS SCORE
const satnogsObservedSet = new Set(optScanNov.byNorad.keys());
const scoreObservedSet = new Set(
  [...scoreMap.entries()].filter(([, obs]) => obs.some((x) => x.epochIso >= "2026-11-01")).map(([n]) => n)
);

// ============================================================================
// 3. Parallel 22-Worker Pure Own-Epoch AP Fitting Across All Remaining Objects
// ============================================================================
const tleWorkerObjects = allObjects.filter((o) => !enhancedByNorad.has(o.norad));
const numWorkers = Math.min(22, Math.max(4, os.cpus().length - 2));
console.log(`=== 3. Launching ${numWorkers} Parallel WASM Workers Across ${tleWorkerObjects.length} Pure Own-Epoch TLE Objects ===`);

const workerBuckets = Array.from({ length: numWorkers }, () => []);
for (let i = 0; i < tleWorkerObjects.length; i++) {
  workerBuckets[i % numWorkers].push(tleWorkerObjects[i]);
}

const dcaPayload = dcaRecord
  ? {
      cid: dcaRecord.cid,
      nodeTimesMsNum: dcaRecord.nodeTimesMsNum,
      nodeTimesMsStr: dcaRecord.nodeTimesMs.map(String),
      nodeLogScale: dcaRecord.nodeLogScale,
    }
  : null;

const tFitStart = performance.now();
let completedWorkers = 0;
const workerOutputs = await Promise.all(
  workerBuckets.map(
    (bucket, wIdx) =>
      new Promise((resolve, reject) => {
        const regEntries = [];
        const rollingEntries = [];
        for (const o of bucket) {
          const r = reg.get(o.norad);
          if (r) regEntries.push([o.norad, { discos: !!r.discos, objectType: r.objectType, areaToMassM2Kg: r.areaToMassM2Kg }]);
          const rp = rollingPriors.get(o.norad);
          if (rp) rollingEntries.push([o.norad, rp]);
        }
        const w = new Worker(WORKER_SCRIPT, {
          workerData: {
            isWorker: true,
            spwRows: spw.rows,
            dcaPayload,
            objects: bucket,
            regEntries,
            rollingEntries,
          },
        });
        w.on("message", (msg) => {
          completedWorkers++;
          if (completedWorkers % 4 === 0 || completedWorkers === numWorkers) {
            console.log(
              `  Worker ${wIdx} finished (${completedWorkers}/${numWorkers} done, elapsed ${((performance.now() - tFitStart) / 1000).toFixed(1)}s)`
            );
          }
          resolve({ wIdx, meta: msg.meta, buf: new Uint8Array(msg.streamBuffer) });
        });
        w.on("error", reject);
        w.on("exit", (code) => {
          if (code !== 0) reject(new Error(`Worker ${wIdx} exited with non-zero code ${code}`));
        });
      })
  )
);

const fitWallSec = (performance.now() - tFitStart) / 1000.0;
console.log(
  `All ${numWorkers} workers completed ${tleWorkerObjects.length} objects in ${fitWallSec.toFixed(2)}s (${((fitWallSec * 1000) / Math.max(1, tleWorkerObjects.length)).toFixed(2)} ms/obj wall)!`
);

// ============================================================================
// 4. Assemble Ordered Size-Prefixed `catalog.ocm.stream` + `index.json` + 100% Gates
// ============================================================================
console.log("=== 4. Writing Ordered catalog.ocm.stream, index.json, and Running 100% Conformance Gates ===");
const allRecs = [];
for (const { framedBuf, meta } of enhancedByNorad.values()) {
  allRecs.push({ meta: { ...meta, streamOffset: 0 }, workerBuf: framedBuf });
}
for (const wo of workerOutputs) {
  for (const m of wo.meta) {
    allRecs.push({ meta: m, workerBuf: wo.buf });
  }
}
allRecs.sort((a, b) => a.meta.norad - b.meta.norad);

const streamPath = path.join(OUT_DIR, "catalog.ocm.stream");
const fd = fs.openSync(streamPath, "w");
const hash = crypto.createHash("sha256");

let globalOffset = 0;
let okCount = 0;
let failCount = 0;
let noUserDefPass = 0;
let apTheoryPass = 0;
let maneuverSegmentedCount = 0;
let dcaCommonModeCount = 0;
let rollingPriorCount = 0;

const indexEntries = [];
const byRegimeStats = {};
const byTypeCounts = {};
const bySourceTierCounts = {};
const globalSsnEpochCounts = {};

for (const { meta, workerBuf } of allRecs) {
  // Gate 1: 100% Hold-List Gate
  if (isHeldForStudy(meta.norad, meta.name || "", meta.epoch || "2026-11-08T00:00:00Z")) {
    throw new Error(`HOLD_GATE_VIOLATION in catalog output: ${meta.norad} (${meta.name})`);
  }

  if (!meta.ok) {
    failCount++;
    indexEntries.push(meta);
    continue;
  }
  okCount++;
  const framedSlice = workerBuf.subarray(meta.streamOffset, meta.streamOffset + 4 + meta.byteLength);
  const plainSlice = workerBuf.subarray(meta.streamOffset + 4, meta.streamOffset + 4 + meta.byteLength);

  // Gate 2: 100% assertNoUserDefined Gate
  assertNoUserDefined(plainSlice);
  noUserDefPass++;

  // Gate 3: 100% MEAN_ELEMENT_THEORY = AP Gate
  const root = OCM.getRootAsOCM(new flatbuffers.ByteBuffer(plainSlice));
  if (root.MEAN_ELEMENTS()?.MEAN_ELEMENT_THEORY() !== meanElementSource.AP) {
    throw new Error(`Non-AP theory emitted for ${meta.norad}`);
  }
  apTheoryPass++;

  fs.writeSync(fd, framedSlice);
  hash.update(framedSlice);

  const openOpticalAvailable = satnogsObservedSet.has(meta.norad) || scoreObservedSet.has(meta.norad);
  const entry = {
    ...meta,
    openOpticalObservedNov1To8: openOpticalAvailable,
    streamOffset: globalOffset,
  };
  globalOffset += framedSlice.length;
  indexEntries.push(entry);

  if (meta.maneuverDetected) maneuverSegmentedCount++;
  if (meta.hasDcaCommonMode) dcaCommonModeCount++;
  if (meta.hasRollingPrior) rollingPriorCount++;
  byTypeCounts[meta.objectType || "UNKNOWN"] = (byTypeCounts[meta.objectType || "UNKNOWN"] || 0) + 1;
  bySourceTierCounts[meta.sourceTier] = (bySourceTierCounts[meta.sourceTier] || 0) + 1;
  for (const [cls, cnt] of Object.entries(meta.ssnEpochProvenance ?? {})) {
    globalSsnEpochCounts[cls] = (globalSsnEpochCounts[cls] || 0) + cnt;
  }

  const rs = (byRegimeStats[meta.regime] ??= {
    count: 0,
    multiTleCount: 0,
    discosCount: 0,
    mTles: [],
    arcDays: [],
    fitRmsM: [],
    sigR_m: [],
    sigT_m: [],
    sigN_m: [],
    rss3d_m: [],
  });
  rs.count++;
  if (meta.mTle >= 2) rs.multiTleCount++;
  if (meta.hasDiscos) rs.discosCount++;
  rs.mTles.push(meta.mTle);
  rs.arcDays.push(meta.arcDays);
  if (Number.isFinite(meta.fitRmsM)) rs.fitRmsM.push(meta.fitRmsM);
  if (meta.sigmaRtnM?.every(Number.isFinite)) {
    rs.sigR_m.push(meta.sigmaRtnM[0]);
    rs.sigT_m.push(meta.sigmaRtnM[1]);
    rs.sigN_m.push(meta.sigmaRtnM[2]);
    rs.rss3d_m.push(meta.rss3dSigmaM);
  }
}
fs.closeSync(fd);
const streamSha256 = hash.digest("hex");

// ============================================================================
// 5. Gate 4: Stratified 240-Object SDK `propagate` (GCRF + SPEC 12 Covariance Lines)
// ============================================================================
const streamFd = fs.openSync(streamPath, "r");
const validEntries = indexEntries.filter((e) => e.ok);
const verifySample = [];
// Include all external/optical enhanced objects (up to 40) + stratified TLE-only sample up to 240 total
for (const e of validEntries.filter((x) => !x.sourceTier.startsWith("ap-own-epoch")).slice(0, 40)) {
  const buf = Buffer.allocUnsafe(e.byteLength);
  fs.readSync(streamFd, buf, 0, e.byteLength, e.streamOffset + 4);
  verifySample.push({ entry: e, ocmBytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) });
}
const remTarget = 240 - verifySample.length;
const stride = Math.max(1, Math.floor(validEntries.length / remTarget));
for (let i = 0; i < validEntries.length && verifySample.length < 240; i += stride) {
  const e = validEntries[i];
  const buf = Buffer.allocUnsafe(e.byteLength);
  fs.readSync(streamFd, buf, 0, e.byteLength, e.streamOffset + 4);
  verifySample.push({ entry: e, ocmBytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) });
}
fs.closeSync(streamFd);

const cOutGcrf = Object.assign(new PCF.PCFT(), {
  OUTPUT: Object.assign(new PCF.PCFOutputT(), {
    FRAME: PCF.pcfOutputFrame.GCRF,
    EPOCHS: ["2026-11-08T12:00:00.000000", "2026-11-09T12:00:00.000000"],
    MAXIMUM_STATES: 2000,
  }),
});
const bPcf = new flatbuffers.Builder(256);
bPcf.finish(cOutGcrf.pack(bPcf), "$PCF");
const pcfGcrfBytes = bPcf.asUint8Array().slice();

let sdkGcrfPass = 0;
const sdkGcrfFailures = [];
for (let i = 0; i < verifySample.length; i += 30) {
  const batch = verifySample.slice(i, i + 30);
  const res = await sdnAp.invoke({
    methodId: "propagate",
    inputs: [
      ...batch.map((x) => ({ portId: "ocm", typeRef: TYPES.OCM, payload: x.ocmBytes })),
      { portId: "configuration", typeRef: TYPES.PCF, payload: pcfGcrfBytes },
    ],
  });
  if (res.statusCode === 0) {
    const oems = res.outputs.filter((o) => o.portId === "ephemeris");
    for (const o of oems) {
      const blk = OEM.getRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(o.payload))).EPHEMERIS_DATA_BLOCK(0);
      if (blk && blk.ephemerisDataLinesLength() === 2 && blk.covarianceMatrixLinesLength() === 2) {
        sdkGcrfPass++;
      }
    }
  } else {
    for (const item of batch) {
      const single = await sdnAp.invoke({
        methodId: "propagate",
        inputs: [
          { portId: "ocm", typeRef: TYPES.OCM, payload: item.ocmBytes },
          { portId: "configuration", typeRef: TYPES.PCF, payload: pcfGcrfBytes },
        ],
      });
      if (single.statusCode === 0) {
        const oems = single.outputs.filter((o) => o.portId === "ephemeris");
        const blk = oems[0] ? OEM.getRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(oems[0].payload))).EPHEMERIS_DATA_BLOCK(0) : null;
        if (blk && blk.ephemerisDataLinesLength() === 2 && blk.covarianceMatrixLinesLength() === 2) {
          sdkGcrfPass++;
        } else {
          sdkGcrfFailures.push({ norad: item.entry.norad, name: item.entry.name, reason: "missing-oem-lines" });
        }
      } else {
        sdkGcrfFailures.push({ norad: item.entry.norad, name: item.entry.name, statusCode: single.statusCode, errorMessage: single.errorMessage });
      }
    }
  }
}
if (sdkGcrfFailures.length > 0) {
  console.warn("Gate 4 failures:", JSON.stringify(sdkGcrfFailures));
}

const regimeSummary = {};
for (const [regName, rs] of Object.entries(byRegimeStats)) {
  const q3 = (arr) => [
    Number(quantile(arr, 0.1).toFixed(1)),
    Number(quantile(arr, 0.5).toFixed(1)),
    Number(quantile(arr, 0.9).toFixed(1)),
  ];
  regimeSummary[regName] = {
    objects: rs.count,
    multiTleObjects: rs.multiTleCount,
    discosObjects: rs.discosCount,
    medianTlesUsed: Number(quantile(rs.mTles, 0.5).toFixed(1)),
    medianArcDays: Number(quantile(rs.arcDays, 0.5).toFixed(2)),
    medianFitRmsM: Number(quantile(rs.fitRmsM, 0.5).toFixed(1)),
    posteriorSigmaP10P50P90_M: {
      R: q3(rs.sigR_m),
      T: q3(rs.sigT_m),
      N: q3(rs.sigN_m),
      RSS_3D: q3(rs.rss3d_m),
    },
  };
}

fs.writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify(indexEntries));

const manifest = {
  catalogDate: "2026-11-08",
  generatedAt: new Date().toISOString(),
  producer: "com.spacedatanetwork.sdn-ap@0.6.5",
  sdsSchemaVersion: "spacedatastandards.org@1.279.0",
  sdkVersion: "space-data-module-sdk@0.9.14",
  methodology: {
    tleRule: "Pure own-epoch SGP4 evaluation (t = t_epoch, minutes = 0.0 ONLY) weighted by SSN phased-array radar / GEODSS optical access provenance (Exa Research #1)",
    maneuverRule: "Forward-backward midpoint consistency + WASM analysis/maneuver-detection post-burn segmentation (Exa Research #2)",
    externalAndOpticalRule: "Best-available accuracy fusion: operational POD / Final SP3 where causally superior + unseeded WASM SatNOGS Optical angles-only OD",
    holdsEnforced: ["No Starlink", "No Eutelsat", "No 6 held Galileo IDs", "No Swarm/GRACE-FO after 2026-10-31", "Zero USER_DEFINED_* fields"],
  },
  credits: CREDITS,
  spaceWeather: {
    file: "space-weather-2026-11-08.spw.stream",
    days: spw.rows.length,
    range: `${spw.rows[0].date}..${spw.rows.at(-1).date}`,
    nov08Observed: spw.byDate.get("2026-11-08"),
    forecastModel: "Bartels 27-day solar-rotation F10.7 recurrence + geomagnetic Ap storm relaxation",
  },
  densityCalibration: dcaRecord
    ? {
        file: dcaOutFile,
        cid: dcaRecord.cid,
        mode: "DCA_COMMON_MODE",
        passiveCalibrationSatellites: dcaRecord.satCount,
        nonOverlappingArcsUsed: dcaRecord.arcsUsed,
        logDensityScaleAtIssue: Number(dcaRecord.sAtIssue.toFixed(5)),
        densityMultiplierAtIssue: Number(Math.exp(dcaRecord.sAtIssue).toFixed(4)),
        postfitLogResidualRms: Number(dcaRecord.postfitRms.toFixed(4)),
        emittedLeoOcmsWithDcaCommonMode: dcaCommonModeCount,
        emittedOcmsWithMultiMonthRollingPrior: rollingPriorCount,
      }
    : null,
  catalogStream: {
    file: "catalog.ocm.stream",
    format: "size-prefixed-$OCM-flatbuffer-stream",
    totalBytes: globalOffset,
    totalMB: Number((globalOffset / (1024 * 1024)).toFixed(2)),
    sha256: streamSha256,
  },
  openOpticalSummary: {
    sidecarStream: opticalSidecarFrames.length ? "open-optical-2026-11-08.ocm.stream" : null,
    convergedUnseededMultiNightFits: opticalFittedRecords.length,
    satnogsObservedObjectsNov1To8: satnogsObservedSet.size,
    iauCpsScoreObservedObjectsNov1To8: scoreObservedSet.size,
    finkZtfPalomarTrackletsOct25ToNov8: finkTracklets.length,
    fittedExamples: opticalFittedRecords.slice(0, 15),
  },
  counts: {
    nonHeldActiveCatalogObjects: allObjects.length,
    emittedApOcms: okCount,
    refusedDecayingEdgeCases: failCount,
    maneuverSegmentedObjects: maneuverSegmentedCount,
    bySourceTier: bySourceTierCounts,
    byObjectType: byTypeCounts,
    ssnEpochProvenanceTotals: globalSsnEpochCounts,
  },
  verificationGates: {
    zeroHeldObjectsInCatalog: true,
    noUserDefinedChecked: noUserDefPass,
    noUserDefinedPassed: noUserDefPass,
    allRecordsMeanElementTheoryAp: apTheoryPass === okCount,
    sdkPropagateGcrfWithCovSampleSize: verifySample.length,
    sdkPropagateGcrfWithCovPassed: sdkGcrfPass,
  },
  byRegime: regimeSummary,
  performance: {
    workers: numWorkers,
    fitWallSeconds: Number(fitWallSec.toFixed(2)),
    msPerObjectWall: Number(((fitWallSec * 1000) / Math.max(1, tleWorkerObjects.length)).toFixed(3)),
    totalScriptSeconds: Number(((performance.now() - t0) / 1000).toFixed(2)),
  },
};

const manifestPath = path.join(OUT_DIR, "manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("\n=== FULL 2026-11-08 PURE-ACCURACY AP $OCM CATALOG COMPLETE ===");
console.log(JSON.stringify({ counts: manifest.counts, verificationGates: manifest.verificationGates, performance: manifest.performance }, null, 2));
process.exit(0);
