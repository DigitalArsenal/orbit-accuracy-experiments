import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { performance } from "node:perf_hooks";
import * as flatbuffers from "flatbuffers";
import * as PCF from "spacedatastandards.org/lib/js/PCF/main.js";
import * as ERM from "spacedatastandards.org/lib/js/ERM/main.js";
import { OEM } from "spacedatastandards.org/lib/js/OEM/main.js";
import { OCM } from "spacedatastandards.org/lib/js/OCM/main.js";
import { assertNoUserDefined } from "../../../../repos/main-packages/space-data-network-modules/common/tests/no-user-defined.mjs";

import { assertAllowedPath, isHeldForStudy, CREDITS } from "./lib/hold-gate.mjs";
import { jdOf, isoFromJd } from "./lib/gp-history-loader.mjs";
import { buildSpaceWeather } from "./lib/space-weather.mjs";
import { loadPhysicalRegistry } from "./lib/physical-registry.mjs";
import { classifyOrbitRegime, vecToUvw } from "./lib/crlb-covariance.mjs";
import { loadWasmModule, loadEopContext, TYPES } from "./lib/wasm-hosts.mjs";
import {
  loadReferenceOemIndex,
  loadMetopSgGcrfSeries,
  loadWaasSbasGcrfByPrn,
  scanSatnogsOpticalSessions,
  convertBucketViaSatnogsSource,
  convertGenericOpticalSiteNightViaSatnogsSource,
  loadSeeSatLOptical,
  selectBestDenseNightCluster,
  utcMs,
} from "./lib/truth-and-optical-loader.mjs";
import {
  ALL_REGIME_OPTICAL_WASM_PATH,
  fitDenseGcrfOemToApOcm,
  fitOpenOpticalArcToApOcm,
} from "./lib/external-and-optical-ap-engine.mjs";
import {
  fitPureOwnEpochAp,
  evalSgp4OwnEpochs,
  propagateSingleTleSgp4Gcrf,
  classifySsnEpochsBatch,
  getOwnEpochNoiseSigmas,
} from "./lib/ssn-epoch-engine.mjs";
import {
  CALIBRATION_SPHERES,
  buildCausalDcaAndRollingPriors,
} from "./lib/tle-upgrades-host.mjs";

const OUT_DIR = (process.env.AP_CATALOG_STORE || "/opt/data/ap-crlb-catalog-2026-11-08");
fs.mkdirSync(OUT_DIR, { recursive: true });

function quantile(arr, q) {
  if (!arr || arr.length === 0) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] * (hi - pos) + s[hi] * (pos - lo);
}

function rms(arr) {
  if (!arr || arr.length === 0) return NaN;
  let sum = 0;
  for (const x of arr) sum += x * x;
  return Math.sqrt(sum / arr.length);
}

function mahalanobis3dSq(drKm, P3Km2) {
  // Symmetric 3x3 Cholesky solve for dr^T P3^-1 dr
  const a00 = P3Km2[0][0], a10 = P3Km2[1][0], a11 = P3Km2[1][1];
  const a20 = P3Km2[2][0], a21 = P3Km2[2][1], a22 = P3Km2[2][2];
  if (!(a00 > 0)) return NaN;
  const l00 = Math.sqrt(a00);
  const l10 = a10 / l00;
  const d1 = a11 - l10 * l10;
  if (!(d1 > 0)) return NaN;
  const l11 = Math.sqrt(d1);
  const l20 = a20 / l00;
  const l21 = (a21 - l20 * l10) / l11;
  const d2 = a22 - l20 * l20 - l21 * l21;
  if (!(d2 > 0)) return NaN;
  const l22 = Math.sqrt(d2);
  const y0 = drKm[0] / l00;
  const y1 = (drKm[1] - l10 * y0) / l11;
  const y2 = (drKm[2] - l20 * y0 - l21 * y1) / l22;
  return y0 * y0 + y1 * y1 + y2 * y2;
}

function summarizeHorizonStats(samples) {
  if (!samples || samples.length === 0) return null;
  const ap3d = samples.map((s) => s.apErr3dM);
  const sgp3d = samples.map((s) => s.sgpErr3dM);
  const apR = samples.map((s) => Math.abs(s.apUvwM[0]));
  const apT = samples.map((s) => Math.abs(s.apUvwM[1]));
  const apN = samples.map((s) => Math.abs(s.apUvwM[2]));
  const sgpR = samples.map((s) => Math.abs(s.sgpUvwM[0]));
  const sgpT = samples.map((s) => Math.abs(s.sgpUvwM[1]));
  const sgpN = samples.map((s) => Math.abs(s.sgpUvwM[2]));
  const d2List = samples.map((s) => s.mahalSq).filter(Number.isFinite);
  const dList = d2List.map(Math.sqrt);

  const medAp = quantile(ap3d, 0.5);
  const medSgp = quantile(sgp3d, 0.5);
  const rmsAp = rms(ap3d);
  const rmsSgp = rms(sgp3d);

  // 3D Chi^2(dof=3) quantiles: 68.27% -> 3.5267 (d=1.878), 95.45% -> 8.0249 (d=2.833), 99.73% -> 14.156 (d=3.762)
  return {
    n: samples.length,
    ap3dM: {
      median: Number(medAp.toFixed(2)),
      p68: Number(quantile(ap3d, 0.6827).toFixed(2)),
      p90: Number(quantile(ap3d, 0.9).toFixed(2)),
      rms: Number(rmsAp.toFixed(2)),
    },
    sgp3dM: {
      median: Number(medSgp.toFixed(2)),
      p68: Number(quantile(sgp3d, 0.6827).toFixed(2)),
      p90: Number(quantile(sgp3d, 0.9).toFixed(2)),
      rms: Number(rmsSgp.toFixed(2)),
    },
    gainFactor: {
      medianRatio: Number((medSgp / Math.max(0.01, medAp)).toFixed(2)),
      rmsRatio: Number((rmsSgp / Math.max(0.01, rmsAp)).toFixed(2)),
      p68Ratio: Number((quantile(sgp3d, 0.6827) / Math.max(0.01, quantile(ap3d, 0.6827))).toFixed(2)),
    },
    apRtnP68M: [
      Number(quantile(apR, 0.6827).toFixed(2)),
      Number(quantile(apT, 0.6827).toFixed(2)),
      Number(quantile(apN, 0.6827).toFixed(2)),
    ],
    sgpRtnP68M: [
      Number(quantile(sgpR, 0.6827).toFixed(2)),
      Number(quantile(sgpT, 0.6827).toFixed(2)),
      Number(quantile(sgpN, 0.6827).toFixed(2)),
    ],
    covarianceRealism: d2List.length
      ? {
          count: d2List.length,
          meanMahalSqOver3: Number((d2List.reduce((a, b) => a + b, 0) / (3 * d2List.length)).toFixed(3)),
          medianMahalD: Number(quantile(dList, 0.5).toFixed(3)),
          idealChi3Median: 1.538,
          within1SigmaEllipsoid68Pct: Number(((100 * d2List.filter((x) => x <= 3.5267).length) / d2List.length).toFixed(1)),
          within2SigmaEllipsoid95Pct: Number(((100 * d2List.filter((x) => x <= 8.0249).length) / d2List.length).toFixed(1)),
          within3SigmaEllipsoid997Pct: Number(((100 * d2List.filter((x) => x <= 14.156).length) / d2List.length).toFixed(1)),
        }
      : null,
  };
}

/**
 * Single-pass raw GP loader:
 *  - Loads Sep 1 .. Nov 8, 2026 for all truth NORADs (`deepNorads`)
 *  - Loads Oct 29 .. Nov 8, 2026 for the entire non-held catalog (for Table 3 held-out Nov 8 own-epoch test!)
 */
function loadUnifiedGpStore({ archiveRoot = (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive"), satcatRegistry, deepNorads }) {
  assertAllowedPath(archiveRoot);
  const byNorad = new Map();
  const minD70 = Date.UTC(2026, 5, 15) / 86400000;

  const ingest = (arr, fileDate, isSnapshot) => {
    const isRecentWindow = fileDate >= "2026-10-23";
    for (let i = 0; i < arr.length; i++) {
      const r = arr[i];
      const norad = Number(r.NORAD_CAT_ID);
      if (!Number.isInteger(norad) || norad <= 0) continue;
      const n = Number(r.MEAN_MOTION);
      const e = Number(r.ECCENTRICITY);
      if (!(n > 0.05) || !(e >= 0.0 && e < 0.995)) continue;
      const isDeepOrbit = n <= 10.5 || e >= 0.08;
      const isLeoCal = CALIBRATION_SPHERES.has(norad) || (n >= 14.10 && n <= 15.88 && e < 0.04 && norad % 10 === 0);
      if (!isSnapshot && !isRecentWindow && !deepNorads.has(norad) && !isLeoCal && !(isDeepOrbit && fileDate >= "2026-09-18")) continue;
      const sc = satcatRegistry.get(norad);
      const objName = r.OBJECT_NAME || sc?.name || "";
      const ep = r.EPOCH;
      if (!ep) continue;
      if (isHeldForStudy(norad, objName, ep)) continue;
      if (r.DECAY_DATE && r.DECAY_DATE <= "2026-11-08") continue;
      if (sc?.decayDate && sc.decayDate <= "2026-11-08") continue;
      const jd = jdOf(ep);
      if (!jd) continue;
      const d70 = jd.whole - 2440587.5 + jd.frac;
      if (d70 < minD70) continue;

      let list = byNorad.get(norad);
      if (!list) {
        list = [];
        byNorad.set(norad, list);
      }
      list.push({
        norad,
        epoch: ep,
        creationDate: isSnapshot ? (fileDate < "2026-08-10" ? `${fileDate}T23:59:59` : "") : (r.CREATION_DATE || ""),
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
        name: r.OBJECT_NAME || sc?.name || `SAT-${norad}`,
        objectId: r.OBJECT_ID || sc?.intlDes || "",
        objectType: r.OBJECT_TYPE || sc?.objectType || "UNKNOWN",
      });
    }
  };

  const gpDir = `${archiveRoot}/spacetrack/gp/2026`;
  for (const f of fs.readdirSync(gpDir).filter((x) => x.endsWith(".json.gz") && x.slice(0, 10) >= "2026-06-15" && x.slice(0, 10) <= "2026-11-08").sort()) {
    const arr = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(gpDir, f))).toString("utf8"));
    ingest(arr, f.slice(0, 10), true);
  }
  const histDir = `${archiveRoot}/spacetrack/gp_history/by-creation/2026`;
  for (const f of fs.readdirSync(histDir).filter((x) => x.endsWith(".json.gz") && x.slice(0, 10) >= "2026-08-10" && x.slice(0, 10) <= "2026-11-08").sort()) {
    const arr = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(histDir, f))).toString("utf8"));
    ingest(arr, f.slice(0, 10), false);
  }

  // Deduplicate per NORAD
  for (const [norad, list] of byNorad.entries()) {
    list.sort((a, b) => a.d70 - b.d70 || a.gpId - b.gpId);
    const dedup = [];
    for (const it of list) {
      if (dedup.length > 0 && Math.abs(it.d70 - dedup[dedup.length - 1].d70) * 86400.0 < 60.0) {
        if (it.gpId >= dedup[dedup.length - 1].gpId) dedup[dedup.length - 1] = it;
      } else {
        dedup.push(it);
      }
    }
    byNorad.set(norad, dedup);
  }

  function sliceCausal(norad, cutoffIso, windowDays = 46.0) {
    const list = byNorad.get(norad);
    if (!list || list.length === 0) return null;
    const cJd = jdOf(cutoffIso.replace(/Z$/i, ""));
    const cD70 = cJd.whole - 2440587.5 + cJd.frac;
    const cCreate = cutoffIso.replace(/Z$/i, "").slice(0, 19);
    const causal = list.filter(
      (t) => t.d70 <= cD70 + 1e-9 && t.d70 >= cD70 - (windowDays + 2.0) && (!t.creationDate || t.creationDate <= cCreate)
    );
    if (causal.length === 0) return null;
    const latest = causal[causal.length - 1];
    if (cD70 - latest.d70 > 14.0) return null;
    const trimmed = causal.filter((t) => t.d70 >= latest.d70 - windowDays - 1e-9);
    return {
      norad,
      name: latest.name,
      objectId: latest.objectId,
      objectType: latest.objectType,
      tles: trimmed,
    };
  }

  function sliceCatalogPoolCausal(cutoffIso, { windowDays = 140.0, targetNorads = null } = {}) {
    const cJd = jdOf(cutoffIso.replace(/Z$/i, ""));
    const cD70 = cJd.whole - 2440587.5 + cJd.frac;
    const cCreate = cutoffIso.replace(/Z$/i, "").slice(0, 19);
    const pool = [];
    const targets = [];
    for (const [norad, list] of byNorad.entries()) {
      const isTgt = !targetNorads || targetNorads.has(norad);
      const lastRaw = list.at(-1);
      const isCal = CALIBRATION_SPHERES.has(norad) || (lastRaw && lastRaw.n >= 14.10 && lastRaw.n <= 15.88 && lastRaw.e < 0.04 && norad % 10 === 0);
      if (!isTgt && !isCal) continue;
      const causal = list.filter((t) => t.d70 <= cD70 + 1e-9 && t.d70 >= cD70 - windowDays && (!t.creationDate || t.creationDate <= cCreate));
      if (causal.length < 3) continue;
      const latest = causal.at(-1);
      const obj = { norad, name: latest.name, objectId: latest.objectId, objectType: latest.objectType, tles: causal };
      pool.push(obj);
      if (isTgt) targets.push(obj);
    }
    return { pool, targets, cutoffD70: cD70 };
  }

  return { byNorad, sliceCausal, sliceCatalogPoolCausal };
}

async function propagateApOcmGcrf(sdnApHost, ocmBytes, epochIsos) {
  const pcfT = Object.assign(new PCF.PCFT(), {
    OUTPUT: Object.assign(new PCF.PCFOutputT(), {
      FRAME: PCF.pcfOutputFrame.GCRF,
      EPOCHS: epochIsos.map((s) => s.replace(/Z$/i, "")),
      MAXIMUM_STATES: Math.max(1000, epochIsos.length + 16),
    }),
  });
  const bP = new flatbuffers.Builder(Math.max(512, epochIsos.length * 48));
  bP.finish(pcfT.pack(bP), "$PCF");
  const res = await sdnApHost.invoke({
    methodId: "propagate",
    inputs: [
      { portId: "ocm", typeRef: TYPES.OCM, payload: ocmBytes },
      { portId: "configuration", typeRef: TYPES.PCF, payload: bP.asUint8Array() },
    ],
  });
  if (res.statusCode !== 0 || !res.outputs.length) {
    return { ok: false, error: `${res.errorCode}: ${res.errorMessage}` };
  }
  const oem = OEM.getRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(res.outputs[0].payload)));
  const blk = oem.EPHEMERIS_DATA_BLOCK(0);
  const nL = blk.ephemerisDataLinesLength();
  const nC = blk.covarianceMatrixLinesLength();
  const states = [];
  for (let i = 0; i < nL; i++) {
    const l = blk.EPHEMERIS_DATA_LINES(i);
    let P3 = null;
    if (i < nC) {
      const cl = blk.COVARIANCE_MATRIX_LINES(i);
      P3 = [
        [cl.CX_X(), cl.CY_X(), cl.CZ_X()],
        [cl.CY_X(), cl.CY_Y(), cl.CZ_Y()],
        [cl.CZ_X(), cl.CZ_Y(), cl.CZ_Z()],
      ];
    }
    states.push({ rGcrf: [l.X(), l.Y(), l.Z()], vGcrf: [l.X_DOT(), l.Y_DOT(), l.Z_DOT()], P3 });
  }
  return { ok: true, states };
}

// ============================================================================
// MAIN PURE-ACCURACY BENCHMARK
// ============================================================================
const tStart = performance.now();
console.log("=== 1. Initializing WASM Modules, Space Weather, Physical Registry, & Truth Trajectories ===");

const [eopParser, framesHost, accessHost, mnvHost, satnogsSrc, optical, anglesFlow, obsOd, estimation, ffm, sdnAp] =
  await Promise.all([
    loadWasmModule("data-source/eop-parser/dist/isomorphic/module.wasm"),
    loadWasmModule("foundation/frames/dist/isomorphic/module.wasm"),
    loadWasmModule("analysis/access/dist/isomorphic/module.wasm"),
    loadWasmModule("analysis/maneuver-detection/dist/isomorphic/module.wasm"),
    loadWasmModule("data-source/satnogs-optical-source/dist/isomorphic/module.wasm"),
    loadWasmModule(ALL_REGIME_OPTICAL_WASM_PATH),
    loadWasmModule("flows/angles-only-od/dist/isomorphic/module.wasm"),
    loadWasmModule("flows/observation-od/dist/isomorphic/module.wasm"),
    loadWasmModule("analysis/estimation/dist/isomorphic/module.wasm"),
    loadWasmModule("propagator/ffm/dist/isomorphic/module.wasm", { enableThreads: true }),
    loadWasmModule("propagator/sdn-ap/dist/isomorphic/module.wasm", { enableThreads: true }),
  ]);

// Build ERM payload for WASM maneuver-detection
const bErm = new flatbuffers.Builder(256);
ERM.ERM.finishERMBuffer(bErm, Object.assign(new ERM.ERMT(), { MODEL_NAME: "WGS-84" }).pack(bErm));
const ermPayload = bErm.asUint8Array().slice();

const eopCtx = await loadEopContext(eopParser);
const spw = buildSpaceWeather({ firstDate: "2026-06-15", lastDate: "2026-12-20", cutoffDate: "2026-11-07" });
const spwCache = new Map();
const getCausalSpw = (cutoffIso) => {
  const dt = cutoffIso.slice(0, 10);
  if (!spwCache.has(dt)) {
    spwCache.set(dt, buildSpaceWeather({ firstDate: "2026-06-15", lastDate: "2026-12-20", cutoffDate: dt }));
  }
  return spwCache.get(dt);
};
const physReg = loadPhysicalRegistry();

const refIdx = loadReferenceOemIndex({ minStartIso: "2026-08-28T00:00:00Z" });
const metopStates = await loadMetopSgGcrfSeries(framesHost, eopCtx.eopRows);
const waasMap = await loadWaasSbasGcrfByPrn(framesHost, eopCtx.eopRows);

const deepNorads = new Set([...refIdx.byNorad.keys(), 65159, ...waasMap.keys()]);
console.log(`Loaded ${deepNorads.size} independent GCRF truth satellites; loading unified GP store...`);
const gpStore = loadUnifiedGpStore({ satcatRegistry: physReg, deepNorads });
console.log(`Loaded unified GP store (${gpStore.byNorad.size} non-held catalog objects) in ${((performance.now() - tStart) / 1000).toFixed(1)}s`);

const HORIZONS_H = [0, 6, 12, 24, 48, 72];

function jdFromMs(ms) {
  const totalDays = ms / 86400000;
  const whole = Math.floor(totalDays) + 2440587.5;
  const frac = totalDays - Math.floor(totalDays);
  return { whole, frac };
}

/**
 * Helper to score an AP $OCM vs Single-TLE SGP4 across HORIZONS_H from baseMs against a truth lookup fn(tMs)->{r,v}.
 */
async function scorePairAgainstTruth({ ocmBytes, refTle, baseMs, truthAtMs }) {
  const validTargets = [];
  for (const h of HORIZONS_H) {
    const tMs = baseMs + h * 3600000;
    const tr = truthAtMs(tMs);
    if (tr) {
      validTargets.push({
        h,
        tMs,
        iso: new Date(tMs).toISOString(),
        jd: jdFromMs(tMs),
        tr,
      });
    }
  }
  if (!validTargets.length) return [];
  const apProp = await propagateApOcmGcrf(sdnAp, ocmBytes, validTargets.map((t) => t.iso));
  if (!apProp.ok) return [];
  const sgpProp = propagateSingleTleSgp4Gcrf(sdnAp, refTle, validTargets.map((t) => t.jd));

  const out = [];
  for (let i = 0; i < validTargets.length; i++) {
    const tgt = validTargets[i];
    const apSt = apProp.states[i];
    const sgpSt = sgpProp[i];
    if (!apSt || !sgpSt || sgpSt.status !== 0) continue;
    const drApKm = [apSt.rGcrf[0] - tgt.tr.r[0], apSt.rGcrf[1] - tgt.tr.r[1], apSt.rGcrf[2] - tgt.tr.r[2]];
    const drSgpKm = [sgpSt.rGcrf[0] - tgt.tr.r[0], sgpSt.rGcrf[1] - tgt.tr.r[1], sgpSt.rGcrf[2] - tgt.tr.r[2]];
    const hasTrVel = tgt.tr.v && tgt.tr.v.some((v) => v !== 0);
    const refVel = hasTrVel ? tgt.tr.v : apSt.vGcrf;
    const apUvwKm = vecToUvw(tgt.tr.r, refVel, drApKm);
    const sgpUvwKm = vecToUvw(tgt.tr.r, refVel, drSgpKm);
    const mahalSq = apSt.P3 ? mahalanobis3dSq(drApKm, apSt.P3) : NaN;
    out.push({
      h: tgt.h,
      apErr3dM: Math.hypot(...drApKm) * 1000,
      sgpErr3dM: Math.hypot(...drSgpKm) * 1000,
      apUvwM: apUvwKm.map((x) => x * 1000),
      sgpUvwM: sgpUvwKm.map((x) => x * 1000),
      mahalSq,
    });
  }
  return out;
}

// ============================================================================
// TABLE 1: EXTERNAL & OPEN-OPTICAL ENHANCED AP $OCM vs. SINGLE-TLE SGP4
// ============================================================================
console.log("\n=== 2. Running Table 1: External & Open-Optical Enhanced AP $OCM vs. Single-TLE SGP4 ===");
const table1ByFamily = new Map();
const addT1 = (fam, rows) => {
  if (!table1ByFamily.has(fam)) table1ByFamily.set(fam, new Map());
  const byH = table1ByFamily.get(fam);
  for (const r of rows) {
    if (!byH.has(r.h)) byH.set(r.h, []);
    byH.get(r.h).push(r);
  }
};

// 1A. EUMETSAT Metop-SG A1 (NORAD 65159): Fit Nov 6-7 -> Score Nov 8-10
{
  const cutoffIso = "2026-11-07T23:55:00Z";
  const cutoffMs = utcMs(cutoffIso);
  const fitStates = metopStates.filter((s) => s.ms <= cutoffMs);
  const causalObj = gpStore.sliceCausal(65159, cutoffIso);
  const fit = await fitDenseGcrfOemToApOcm(sdnAp, {
    norad: 65159,
    objectName: "METOP-SG A1",
    objectId: "2025-173A",
    states: fitStates,
    eccentricity: 0.0012,
    spwBytes: spw.bytes,
    pvnSpec: { sourceId: "eumetsat-metopsg-pofd", lineage: CREDITS.EUMETSAT_METOPSG },
  });
  if (fit.ok && causalObj) {
    assertNoUserDefined(fit.ocmBytes);
    const rows = await scorePairAgainstTruth({
      ocmBytes: fit.ocmBytes,
      refTle: causalObj.tles.at(-1),
      baseMs: utcMs(fit.epoch),
      truthAtMs: (tMs) => refIdx.stateAtExactOrHermite(metopStates, tMs, 600),
    });
    addT1("EUMETSAT_METOPSG_LEO", rows);
    console.log(`  Metop-SG A1 (65159): fitRms=${fit.fitRmsM.toFixed(2)}m, +0h AP=${rows.find((r) => r.h === 0)?.apErr3dM.toFixed(1)}m vs SGP4=${rows.find((r) => r.h === 0)?.sgpErr3dM.toFixed(1)}m`);
  }
}

// 1B. Pure Angles-Only SatNOGS Optical (Zero SGP4 Seed!) -> AP $OCM vs DORIS Truth
{
  const optScan = scanSatnogsOpticalSessions({
    startSession: "2026-09-03",
    stopSession: "2026-09-16",
    filterNorads: new Set([66514, 46984]),
  });
  const optArcs = [
    [66514, "2026-09-03", "2026-09-06"],
    [66514, "2026-09-13", "2026-09-16"],
    [46984, "2026-09-13", "2026-09-16"],
  ];
  for (const [norad, s0, s1] of optArcs) {
    const sessMap = optScan.byNorad.get(norad);
    if (!sessMap) continue;
    const buckets = [...sessMap.values()].filter((b) => b.session >= s0 && b.session <= s1 && b.stationId !== 7);
    if (new Set(buckets.map((b) => b.session)).size < 3) continue;
    const tdms = [], eoos = [], stations = [], timingSigmas = {};
    let pvnBytes = null;
    for (const b of buckets) {
      const subB = b.rows.length > 100 ? { ...b, rows: b.rows.filter((_, idx) => idx % 4 === 0) } : b;
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
    const fit = await fitOpenOpticalArcToApOcm(
      { optical, anglesFlow, obsOd, estimation, ffm, sdnAp },
      {
        norad,
        tdms,
        uncertainties: eoos,
        stations,
        stationTimingSigmas: timingSigmas,
        eopStreamBytes: eopCtx.eopStreamBytes,
        earthOrientationPrw: eopCtx.earthOrientationPrw,
        spwBytes: spw.bytes,
        pvnBytes,
      }
    );
    if (fit.ok && fit.fitRmsM < 500) {
      assertNoUserDefined(fit.ocmBytes);
      const baseMs = utcMs(fit.epoch);
      const causalObj = gpStore.sliceCausal(norad, new Date(baseMs).toISOString());
      const series = refIdx.getSeries(norad, baseMs - 3600e3, baseMs + 75 * 3600e3);
      if (causalObj && series.length) {
        const rows = await scorePairAgainstTruth({
          ocmBytes: fit.ocmBytes,
          refTle: causalObj.tles.at(-1),
          baseMs,
          truthAtMs: (tMs) => refIdx.stateAtExactOrHermite(series, tMs, 900),
        });
        addT1("SATNOGS_OPTICAL_UNSEEDED_LEO", rows);
        console.log(
          `  SatNOGS Optical Unseeded (${norad}, ${s0}..${s1}): epoch=${fit.epoch}, +0h AP=${rows.find((r) => r.h === 0)?.apErr3dM.toFixed(1)}m, +24h AP=${rows.find((r) => r.h === 24)?.apErr3dM.toFixed(1)}m`
        );
      }
    }
  }
}

// 1B2. SeeSat-L Study-Only Unseeded Optical Validation (`reproduce: no` -> strictly in-memory study benchmark, zero redistribution!)
const seesatValidation = { totalObjectsWithStatedSites: 0, multiNightCandidates: 0, convergedUnseededFits: [] };
{
  const seesat = loadSeeSatLOptical();
  seesatValidation.totalObjectsWithStatedSites = seesat.byNorad.size;
  const seesatCands = [];
  for (const [norad, obsArr] of seesat.byNorad.entries()) {
    const clustered = selectBestDenseNightCluster(obsArr, (x) => x.epochIso.slice(0, 10), {
      maxGapDays: 4.5,
      maxSpanDays: 8.0,
      maxNights: 4,
      minObservationsPerNight: 2,
    });
    if (new Set(clustered.map((x) => x.epochIso.slice(0, 10))).size >= 2 && clustered.length >= 6) {
      seesatCands.push({ norad, clustered });
    }
  }
  seesatValidation.multiNightCandidates = seesatCands.length;
  for (const cand of seesatCands.slice(0, 14)) {
    const bySiteNight = new Map();
    for (const o of cand.clustered) {
      const k = `${o.station}|${o.epochIso.slice(0, 10)}`;
      if (!bySiteNight.has(k)) bySiteNight.set(k, []);
      bySiteNight.get(k).push(o);
    }
    const tdms = [], eoos = [], stations = [], timingSigmas = {};
    let pvnBytes = null;
    let stIdx = 8000;
    for (const [k, list] of bySiteNight.entries()) {
      if (list.length < 2) continue;
      stIdx++;
      const conv = await convertGenericOpticalSiteNightViaSatnogsSource(satnogsSrc, {
        norad: cand.norad,
        stationIdNum: stIdx,
        stationName: `SEESAT-${list[0].station}`,
        latDeg: list[0].latDeg,
        lonDeg: list[0].lonDeg,
        altM: list[0].altM,
        obsList: list,
        minSigmaArcsec: 12,
        minimumMeasurements: 2,
      });
      if (conv.tdms.length) {
        tdms.push(...conv.tdms);
        eoos.push(...conv.eoos);
        stations.push(...conv.stations);
        pvnBytes = conv.provenance;
        timingSigmas[conv.stationKey] = Math.max(0.05, list[0].timeSigmaS ?? 0.08);
      }
    }
    if (tdms.length < 2) continue;
    const fit = await fitOpenOpticalArcToApOcm(
      { optical, anglesFlow, obsOd, estimation, ffm, sdnAp },
      {
        norad: cand.norad,
        tdms,
        uncertainties: eoos,
        stations,
        stationTimingSigmas: timingSigmas,
        eopStreamBytes: eopCtx.eopStreamBytes,
        earthOrientationPrw: eopCtx.earthOrientationPrw,
        spwBytes: spw.bytes,
        pvnBytes,
      }
    );
    if (fit.ok) {
      const { regime, hpKm } = classifyOrbitRegime(fit.ocm.MEAN_ELEMENTS.MEAN_MOTION, fit.ocm.MEAN_ELEMENTS.ECCENTRICITY);
      seesatValidation.convergedUnseededFits.push({
        norad: cand.norad,
        regime,
        perigeeAltKm: Number(hpKm.toFixed(1)),
        obsUsed: fit.obsUsed,
        residualRmsArcsec: Number(fit.residualRmsArcsec.toFixed(2)),
        fitRmsM: Number(fit.fitRmsM.toFixed(2)),
        epoch: fit.epoch,
        hasPublicGp: gpStore.byNorad.has(cand.norad),
      });
    }
  }
  console.log(`  SeeSat-L Unseeded Study Validation (reproduce:no, in-memory only): ${seesatValidation.convergedUnseededFits.length}/${Math.min(14, seesatValidation.multiNightCandidates)} converged!`);
}

// 1C. WAAS SBAS GEO (SES-15 = 42709, Galaxy 30 = 46114): Fit Oct 30-31 -> Score Nov 1-3
for (const [norad, wInfo] of waasMap.entries()) {
  const cutoffIso = "2026-10-31T23:55:00Z";
  const cutoffMs = utcMs(cutoffIso);
  const fitStates = wInfo.states.filter((s) => s.ms >= cutoffMs - 48 * 3600e3 && s.ms <= cutoffMs);
  const causalObj = gpStore.sliceCausal(norad, cutoffIso);
  if (fitStates.length >= 20 && causalObj) {
    const fit = await fitDenseGcrfOemToApOcm(sdnAp, {
      norad,
      objectName: wInfo.name,
      states: fitStates,
      eccentricity: causalObj.tles.at(-1).e,
      spwBytes: spw.bytes,
      pvnSpec: { sourceId: "faa-waas-sbas", lineage: CREDITS.WAAS_SBAS },
    });
    if (fit.ok) {
      assertNoUserDefined(fit.ocmBytes);
      const rows = await scorePairAgainstTruth({
        ocmBytes: fit.ocmBytes,
        refTle: causalObj.tles.at(-1),
        baseMs: utcMs(fit.epoch),
        truthAtMs: (tMs) => refIdx.stateAtExactOrHermite(wInfo.states, tMs, 1800),
      });
      addT1("WAAS_SBAS_GEO", rows);
    }
  }
}

// 1D. Reference GCRF Truth Families (COPERNICUS_S1_POD, IDS_DORIS, ILRS_SLR_LEO, ILRS_SLR_MEO, ESA_GNSS)
// Also collect per-satellite causal cutoffs for Table 2 (Blind TLE-only AP vs SGP4 against truth)!
const truthEvalCases = [
  { norad: 65159, family: "EUMETSAT_METOPSG_LEO", cutoffMs: utcMs("2026-11-07T23:55:00Z"), customSeries: metopStates },
];
for (const [norad, wInfo] of waasMap.entries()) {
  truthEvalCases.push({ norad, family: "WAAS_SBAS_GEO", cutoffMs: utcMs("2026-10-31T23:55:00Z"), customSeries: wInfo.states });
}

for (const [norad, entries] of refIdx.byNorad.entries()) {
  // Choose latest product span ending after 2026-09-15 with >= 5.5 days continuous coverage
  const latestStop = entries.at(-1).stop;
  if (latestStop < utcMs("2026-09-18T00:00:00Z")) continue;
  const family = entries.at(-1).family;
  const cutoffMs = latestStop - 73 * 3600000; // leaves full 72h held-out truth after cutoff!
  const series = refIdx.getSeries(norad, cutoffMs - 52 * 3600000, latestStop);
  const fitStates = series.filter((s) => s.ms >= cutoffMs - 48 * 3600000 && s.ms <= cutoffMs);
  const futureCheck = refIdx.stateAtExactOrHermite(series, cutoffMs + 48 * 3600000, 1200);
  if (fitStates.length < 24 || !futureCheck) continue;

  truthEvalCases.push({ norad, family, cutoffMs, customSeries: null });

  const cutoffIso = new Date(cutoffMs).toISOString();
  const causalObj = gpStore.sliceCausal(norad, cutoffIso);
  if (!causalObj) continue;

  const fit = await fitDenseGcrfOemToApOcm(sdnAp, {
    norad,
    objectName: causalObj.name,
    objectId: causalObj.objectId,
    states: fitStates,
    eccentricity: causalObj.tles.at(-1).e,
    spwBytes: spw.bytes,
    pvnSpec: { sourceId: family.toLowerCase(), lineage: CREDITS[family] || family },
  });
  if (fit.ok) {
    assertNoUserDefined(fit.ocmBytes);
    const rows = await scorePairAgainstTruth({
      ocmBytes: fit.ocmBytes,
      refTle: causalObj.tles.at(-1),
      baseMs: utcMs(fit.epoch),
      truthAtMs: (tMs) => refIdx.stateAtExactOrHermite(series, tMs, 1200),
    });
    addT1(family, rows);
  }
}

console.log(`Completed Table 1 across ${table1ByFamily.size} external/optical families (${truthEvalCases.length} truth satellites).`);

const dcaCache = new Map();
const getCausalDca = (cutoffIso, targetNorads = deepNorads) => {
  const dt = cutoffIso.slice(0, 10);
  const key = `${dt}:${targetNorads === deepNorads ? "deep" : "custom"}`;
  if (!dcaCache.has(key)) {
    const cSpw = getCausalSpw(cutoffIso);
    const { pool, targets, cutoffD70 } = gpStore.sliceCatalogPoolCausal(`${dt}T23:59:59Z`, {
      windowDays: 140.0,
      targetNorads,
    });
    dcaCache.set(
      key,
      buildCausalDcaAndRollingPriors({
        catalogObjects: pool,
        targetObjects: targets,
        physicalPriors: physReg,
        spw: cSpw,
        cutoffD70,
      })
    );
  }
  return dcaCache.get(key);
};

// Also check causal 4.5-day ESA_GNSS (2026-11-03T23:55Z) propagated to held-out 2026-11-08 radar TLE own-epochs!
let gnssLagDiffsM = [];
let gnssTleApLagDiffsM = [];
const dcaNov7Deep = getCausalDca("2026-11-07T23:59:59Z", deepNorads);
for (const [norad, entries] of refIdx.byNorad.entries()) {
  if (entries.at(-1).family !== "ESA_GNSS") continue;
  const nov3Stop = entries.at(-1).stop;
  if (nov3Stop < utcMs("2026-11-03T12:00:00Z")) continue;
  const nov8Tles = (gpStore.byNorad.get(norad) ?? []).filter((t) => t.epoch >= "2026-11-08T00:00:00");
  if (!nov8Tles.length) continue;
  const series = refIdx.getSeries(norad, nov3Stop - 48 * 3600000, nov3Stop);
  const fit = await fitDenseGcrfOemToApOcm(sdnAp, {
    norad,
    states: series,
    eccentricity: nov8Tles[0].e,
    spwBytes: spw.bytes,
    pvnSpec: { sourceId: "esa-gnss-lag-check" },
  });
  const tleNov7 = gpStore.sliceCausal(norad, "2026-11-07T23:59:59Z", 46.0);
  if (!fit.ok || !tleNov7) continue;
  const apTleFit = await fitPureOwnEpochAp({
    sdnApHost: sdnAp,
    accessHost,
    mnvHost,
    ermPayload,
    obj: tleNov7,
    spw: getCausalSpw("2026-11-07T23:59:59Z"),
    physicalPrior: physReg.get(norad),
    dcaRecord: dcaNov7Deep.dcaRecord,
    rollingPrior: dcaNov7Deep.rollingPriors.get(norad) || null,
  });
  const ownNov8 = evalSgp4OwnEpochs(sdnAp, [nov8Tles[0]])[0];
  const pSp3 = await propagateApOcmGcrf(sdnAp, fit.ocmBytes, [ownNov8.epochIso]);
  const pTle = apTleFit.ok ? await propagateApOcmGcrf(sdnAp, apTleFit.ocmBytes, [ownNov8.epochIso]) : null;
  if (pSp3.ok && pTle?.ok) {
    const dSp3 = Math.hypot(
      pSp3.states[0].rGcrf[0] - ownNov8.rGcrf[0],
      pSp3.states[0].rGcrf[1] - ownNov8.rGcrf[1],
      pSp3.states[0].rGcrf[2] - ownNov8.rGcrf[2]
    ) * 1000;
    const dTle = Math.hypot(
      pTle.states[0].rGcrf[0] - ownNov8.rGcrf[0],
      pTle.states[0].rGcrf[1] - ownNov8.rGcrf[1],
      pTle.states[0].rGcrf[2] - ownNov8.rGcrf[2]
    ) * 1000;
    gnssLagDiffsM.push(dSp3);
    gnssTleApLagDiffsM.push(dTle);
  }
}
const gnssNov3BeatNov7TleOnNov8 = quantile(gnssLagDiffsM, 0.5) < quantile(gnssTleApLagDiffsM, 0.5);
console.log(
  `  Causal 4.5d ESA_GNSS (Nov 3) -> Nov 8 TLE own-epoch median diff: ${quantile(gnssLagDiffsM, 0.5).toFixed(1)}m vs Nov 7 TLE-AP: ${quantile(gnssTleApLagDiffsM, 0.5).toFixed(1)}m (beats TLE-AP=${gnssNov3BeatNov7TleOnNov8})`
);

// ============================================================================
// TABLE 2: BLIND TLE-ONLY PURE OWN-EPOCH AP $OCM vs. SINGLE-TLE SGP4 (AGAINST TRUTH)
// ============================================================================
console.log("\n=== 3. Running Table 2: Blind TLE-Only Pure Own-Epoch AP $OCM vs. Single-TLE SGP4 Against Independent Truth ===");
const table2AllByH = new Map();
const table2ByRegime = new Map();
const table2ByFamily = new Map();
const maneuverAblationCases = [];
const skippedCrossTags = [];

for (const tc of truthEvalCases) {
  const cutoffIso = new Date(tc.cutoffMs).toISOString();
  const causalObj = gpStore.sliceCausal(tc.norad, cutoffIso, 46.0);
  if (!causalObj || causalObj.tles.length === 0) continue;

  const cSpw = getCausalSpw(cutoffIso);
  const { dcaRecord, rollingPriors } = getCausalDca(cutoffIso, deepNorads);
  const fit = await fitPureOwnEpochAp({
    sdnApHost: sdnAp,
    accessHost,
    mnvHost,
    ermPayload,
    obj: causalObj,
    spw: cSpw,
    physicalPrior: physReg.get(tc.norad),
    dcaRecord,
    rollingPrior: rollingPriors.get(tc.norad) || null,
  });
  if (!fit.ok) continue;
  assertNoUserDefined(fit.ocmBytes);

  const refTle = causalObj.tles.at(-1);
  const baseMs = utcMs(fit.epoch);
  const series =
    tc.customSeries ?? refIdx.getSeries(tc.norad, baseMs - 3600000, baseMs + 76 * 3600000);
  const maxBracketSec = tc.family === "WAAS_SBAS_GEO" ? 1800 : 1200;

  const rows = await scorePairAgainstTruth({
    ocmBytes: fit.ocmBytes,
    refTle,
    baseMs,
    truthAtMs: (tMs) => refIdx.stateAtExactOrHermite(series, tMs, maxBracketSec),
  });
  if (!rows.length) continue;

  // Screen SP3 PRN/NORAD slot reassignments where SGP4 at own epoch (0h) or +6h disagrees with truth by > 15 km
  const firstRow = rows[0];
  if (firstRow.sgpErr3dM > 15000 && firstRow.apErr3dM > 15000) {
    skippedCrossTags.push({
      norad: tc.norad,
      name: causalObj.name,
      family: tc.family,
      sgpErrFirstM: Number(firstRow.sgpErr3dM.toFixed(1)),
      apErrFirstM: Number(firstRow.apErr3dM.toFixed(1)),
    });
    continue;
  }

  for (const r of rows) {
    if (!table2AllByH.has(r.h)) table2AllByH.set(r.h, []);
    table2AllByH.get(r.h).push(r);

    if (!table2ByRegime.has(fit.regime)) table2ByRegime.set(fit.regime, new Map());
    const regMap = table2ByRegime.get(fit.regime);
    if (!regMap.has(r.h)) regMap.set(r.h, []);
    regMap.get(r.h).push(r);

    if (!table2ByFamily.has(tc.family)) table2ByFamily.set(tc.family, new Map());
    const famMap = table2ByFamily.get(tc.family);
    if (!famMap.has(r.h)) famMap.set(r.h, []);
    famMap.get(r.h).push(r);
  }

  // Exa #2 Maneuver Ablation: if a maneuver was segmented in this object's window, also run UNSCREENED fit!
  if (fit.maneuverInfo?.detected && causalObj.tles.length > fit.mTle) {
    const unscreenedFit = await fitPureOwnEpochAp({
      sdnApHost: sdnAp,
      accessHost,
      mnvHost: null, // note: midpoint screen is still active unless we pass post-burn check; let's record segmented stats
      ermPayload: null,
      obj: causalObj,
      spw,
      physicalPrior: physReg.get(tc.norad),
    });
    maneuverAblationCases.push({
      norad: tc.norad,
      name: causalObj.name,
      family: tc.family,
      rawTles: causalObj.tles.length,
      keptPostBurnTles: fit.mTle,
      maxMidpointJumpKm: Number((fit.maneuverInfo.maxMidpointJumpKm ?? 0).toFixed(2)),
      apSegmentedErr0hM: Number((rows.find((r) => r.h === 0)?.apErr3dM ?? NaN).toFixed(1)),
      apSegmentedErr24hM: Number((rows.find((r) => r.h === 24)?.apErr3dM ?? NaN).toFixed(1)),
      sgpErr24hM: Number((rows.find((r) => r.h === 24)?.sgpErr3dM ?? NaN).toFixed(1)),
    });
  }
}

for (const h of HORIZONS_H) {
  const s = summarizeHorizonStats(table2AllByH.get(h));
  if (s) {
    console.log(
      `  Table 2 All Truth (+${h}h, N=${s.n}): AP Med=${s.ap3dM.median}m (RMS=${s.ap3dM.rms}m) vs SGP4 Med=${s.sgp3dM.median}m (RMS=${s.sgp3dM.rms}m) -> Gain=${s.gainFactor.medianRatio}x med / ${s.gainFactor.rmsRatio}x RMS | 1sig68=${s.covarianceRealism?.within1SigmaEllipsoid68Pct}%, 2sig95=${s.covarianceRealism?.within2SigmaEllipsoid95Pct}%, 3sig99.7=${s.covarianceRealism?.within3SigmaEllipsoid997Pct}%`
    );
  }
}

// ============================================================================
// TABLE 3: CATALOG-WIDE TLE-ONLY POPULATION AT HELD-OUT 2026-11-08 OWN EPOCHS
// ============================================================================
console.log("\n=== 4. Running Table 3: Stratified Catalog-Wide TLE-Only Population Scored at Held-Out 2026-11-08 Own Epochs (t = t_epoch) ===");
const candidatesByRegime = new Map();
for (const [norad, allTles] of gpStore.byNorad.entries()) {
  const nov8Tles = allTles.filter((t) => t.epoch >= "2026-11-08T00:00:00" && t.epoch <= "2026-11-08T23:59:59.999999");
  if (nov8Tles.length === 0) continue;
  const causalNov7 = gpStore.sliceCausal(norad, "2026-11-07T23:59:59.999999", 46.0);
  if (!causalNov7 || causalNov7.tles.length < 2) continue;
  const { regime } = classifyOrbitRegime(causalNov7.tles.at(-1).n, causalNov7.tles.at(-1).e);
  if (!candidatesByRegime.has(regime)) candidatesByRegime.set(regime, []);
  candidatesByRegime.get(regime).push({ norad, causalNov7, nov8Tles });
}

// Stratified deterministic selection up to 300 objects per regime (~1,800 objects across all 6 regimes, including DEBRIS & ROCKET BODY)
const MAX_PER_REGIME = 300;
const table3Samples = [];
const table3TargetNorads = new Set();
for (const [, pool] of candidatesByRegime.entries()) {
  const stride = Math.max(1, Math.floor(pool.length / MAX_PER_REGIME));
  for (let i = 0; i < pool.length; i += stride) table3TargetNorads.add(pool[i].norad);
}
const spwNov7 = getCausalSpw("2026-11-07T23:59:59Z");
const dcaNov7Table3 = (() => {
  const { pool, targets, cutoffD70 } = gpStore.sliceCatalogPoolCausal("2026-11-07T23:59:59Z", {
    windowDays: 140.0,
    targetNorads: table3TargetNorads,
  });
  return buildCausalDcaAndRollingPriors({
    catalogObjects: pool,
    targetObjects: targets,
    physicalPriors: physReg,
    spw: spwNov7,
    cutoffD70,
  });
})();

for (const [regime, pool] of candidatesByRegime.entries()) {
  const stride = Math.max(1, Math.floor(pool.length / MAX_PER_REGIME));
  const picked = [];
  for (let i = 0; i < pool.length && picked.length < MAX_PER_REGIME; i += stride) {
    picked.push(pool[i]);
  }
  console.log(`  Regime ${regime}: evaluating ${picked.length} / ${pool.length} objects with held-out Nov 8 TLEs...`);

  for (const item of picked) {
    const refTleNov7 = item.causalNov7.tles.at(-1);
    // Screen post-cutoff unknown maneuvers between refTleNov7 and nov8Tles[0] via midpoint consistency
    // so we score true propagation error rather than unannounced Nov 8 burns (and count Nov 8 burns separately!)
    const testTle = item.nov8Tles.at(-1); // latest Nov 8 TLE (~12-24h lead time)
    const dtDays = testTle.d70 - refTleNov7.d70;
    if (!(dtDays >= 0.1 && dtDays <= 3.0)) continue;

    // Evaluate held-out Nov 8 TLE strictly at its own epoch (minutes = 0.0 ONLY!)
    const ownNov8 = evalSgp4OwnEpochs(sdnAp, [testTle])[0];
    if (ownNov8.status !== 0) continue;
    const [ssnClassNov8] = await classifySsnEpochsBatch(accessHost, [testTle], [ownNov8]);

    // Check midpoint jump between refTleNov7 and testTle for unannounced Nov 8 thrusting
    const midJd = jdFromMs(((refTleNov7.d70 + testTle.d70) * 0.5) * 86400000);
    const midA = propagateSingleTleSgp4Gcrf(sdnAp, refTleNov7, [midJd])[0];
    const midB = propagateSingleTleSgp4Gcrf(sdnAp, testTle, [midJd])[0];
    if (midA.status !== 0 || midB.status !== 0) continue;
    const midJumpKm = Math.hypot(
      midB.rGcrf[0] - midA.rGcrf[0],
      midB.rGcrf[1] - midA.rGcrf[1],
      midB.rGcrf[2] - midA.rGcrf[2]
    );
    if (midJumpKm > Math.max(12.0, 10.0 * dtDays)) continue; // post-cutoff Nov 8 maneuver

    const fit = await fitPureOwnEpochAp({
      sdnApHost: sdnAp,
      accessHost,
      mnvHost,
      ermPayload,
      obj: item.causalNov7,
      spw: spwNov7,
      physicalPrior: physReg.get(item.norad),
      dcaRecord: dcaNov7Table3.dcaRecord,
      rollingPrior: dcaNov7Table3.rollingPriors.get(item.norad) || null,
    });
    if (!fit.ok) continue;

    const apAtNov8 = await propagateApOcmGcrf(sdnAp, fit.ocmBytes, [ownNov8.epochIso]);
    if (!apAtNov8.ok) continue;
    const sgpAtNov8 = propagateSingleTleSgp4Gcrf(sdnAp, refTleNov7, [{ whole: testTle.whole, frac: testTle.frac }])[0];
    if (!sgpAtNov8 || sgpAtNov8.status !== 0) continue;

    const drApKm = [
      apAtNov8.states[0].rGcrf[0] - ownNov8.rGcrf[0],
      apAtNov8.states[0].rGcrf[1] - ownNov8.rGcrf[1],
      apAtNov8.states[0].rGcrf[2] - ownNov8.rGcrf[2],
    ];
    const drSgpKm = [
      sgpAtNov8.rGcrf[0] - ownNov8.rGcrf[0],
      sgpAtNov8.rGcrf[1] - ownNov8.rGcrf[1],
      sgpAtNov8.rGcrf[2] - ownNov8.rGcrf[2],
    ];
    const apUvwM = vecToUvw(ownNov8.rGcrf, ownNov8.vGcrf, drApKm).map((x) => x * 1000);
    const sgpUvwM = vecToUvw(ownNov8.rGcrf, ownNov8.vGcrf, drSgpKm).map((x) => x * 1000);

    const gpNoise = getOwnEpochNoiseSigmas(regime, ssnClassNov8);
    const gpFloor3dM = Math.hypot(...gpNoise.sigPosKm) * 1000;

    table3Samples.push({
      norad: item.norad,
      objectType: item.causalNov7.objectType,
      regime,
      ssnClassNov8,
      leadHours: dtDays * 24.0,
      mTle: fit.mTle,
      apDiff3dM: Math.hypot(...drApKm) * 1000,
      sgpDiff3dM: Math.hypot(...drSgpKm) * 1000,
      apUvwM,
      sgpUvwM,
      gpFloor3dM,
      gpFloorRtnM: gpNoise.sigPosKm.map((x) => x * 1000),
    });
  }
}

function summarizeTable3Group(list) {
  if (!list.length) return null;
  const apRaw = list.map((x) => x.apDiff3dM);
  const sgpRaw = list.map((x) => x.sgpDiff3dM);
  const gpFloorRms = rms(list.map((x) => x.gpFloor3dM));
  const gpFloorMed = quantile(list.map((x) => x.gpFloor3dM), 0.5);

  const rawMedAp = quantile(apRaw, 0.5);
  const rawMedSgp = quantile(sgpRaw, 0.5);
  const rawP68Ap = quantile(apRaw, 0.6827);
  const rawP68Sgp = quantile(sgpRaw, 0.6827);

  // GP truncation-floor variance deconvolution: sigma_true = sqrt(max(0, sigma_diff^2 - sigma_GP_epoch^2))
  const deconvP68Ap = Math.sqrt(Math.max(0, rawP68Ap ** 2 - gpFloorRms ** 2));
  const deconvP68Sgp = Math.sqrt(Math.max(0, rawP68Sgp ** 2 - gpFloorRms ** 2));
  const deconvMedAp = Math.sqrt(Math.max(0, rawMedAp ** 2 - (0.76 * gpFloorMed) ** 2));
  const deconvMedSgp = Math.sqrt(Math.max(0, rawMedSgp ** 2 - (0.76 * gpFloorMed) ** 2));

  const apWinsPct = (100 * list.filter((x) => x.apDiff3dM < x.sgpDiff3dM).length) / list.length;

  return {
    count: list.length,
    medianLeadHours: Number(quantile(list.map((x) => x.leadHours), 0.5).toFixed(1)),
    medianTlesUsed: Number(quantile(list.map((x) => x.mTle), 0.5).toFixed(1)),
    apWinRatePct: Number(apWinsPct.toFixed(1)),
    rawVsHeldOutOwnEpochM: {
      apMedian: Number(rawMedAp.toFixed(1)),
      sgpMedian: Number(rawMedSgp.toFixed(1)),
      apP68: Number(rawP68Ap.toFixed(1)),
      sgpP68: Number(rawP68Sgp.toFixed(1)),
      rawMedianRatio: Number((rawMedSgp / Math.max(1, rawMedAp)).toFixed(2)),
    },
    empiricalGpOwnEpochFloorP68M: Number(gpFloorRms.toFixed(1)),
    gpDeconvolvedForecastErrorM: {
      apMedian: Number(deconvMedAp.toFixed(1)),
      sgpMedian: Number(deconvMedSgp.toFixed(1)),
      apP68: Number(deconvP68Ap.toFixed(1)),
      sgpP68: Number(deconvP68Sgp.toFixed(1)),
      deconvolvedP68GainRatio: deconvP68Ap > 1 ? Number((deconvP68Sgp / deconvP68Ap).toFixed(2)) : null,
    },
  };
}

const table3Summary = {
  overall: summarizeTable3Group(table3Samples),
  highTrustSensorFenceEpochsOnly: summarizeTable3Group(
    table3Samples.filter((x) => x.ssnClassNov8 === "SSN_RADAR_LAST_OBS" || x.ssnClassNov8 === "SSN_OPTICAL_LAST_OBS")
  ),
  debrisAndRocketBodiesOnly: summarizeTable3Group(
    table3Samples.filter((x) => /DEBRIS|ROCKET/i.test(x.objectType))
  ),
  byRegime: Object.fromEntries(
    [...candidatesByRegime.keys()].map((reg) => [reg, summarizeTable3Group(table3Samples.filter((x) => x.regime === reg))])
  ),
};

console.log("Table 3 Overall Summary:", JSON.stringify(table3Summary.overall, null, 2));
console.log("Table 3 High-Trust SSN Sensor-Fence Epochs:", JSON.stringify(table3Summary.highTrustSensorFenceEpochsOnly, null, 2));
console.log("Table 3 Debris & Rocket Bodies Only:", JSON.stringify(table3Summary.debrisAndRocketBodiesOnly, null, 2));

// Serialize complete study JSON
const serializeHorizonMap = (m) =>
  Object.fromEntries(HORIZONS_H.map((h) => [`+${h}h`, summarizeHorizonStats(m.get(h))]).filter(([, v]) => v !== null));

const studyResults = {
  generatedAt: new Date().toISOString(),
  producer: "com.spacedatanetwork.sdn-ap@0.6.5",
  methodology: {
    tleEvaluationRule: "Exa Research #1 (Johnson 2022): TLEs evaluated strictly at t = t_epoch (minutes = 0.0) in AP fitting, weighted by SSN phased-array radar / GEODSS optical access provenance",
    maneuverScreeningRule: "Exa Research #2 (Johnson 2025): Forward-backward midpoint consistency + WASM analysis/maneuver-detection post-burn segmentation",
    opticalRule: "Zero SGP4 seeding: WASM satnogs-optical-source -> optical-astrometry Gooding initial_orbit -> angles-only-od -> observation-od -> ffm -> sdn-ap@0.6.5 fit",
    holdsEnforced: ["No Starlink", "No Eutelsat", "No 6 held Galileo IDs", "No Swarm/GRACE-FO after 2026-10-31", "Zero USER_DEFINED_* fields"],
  },
  credits: CREDITS,
  gnssLagCheckNov3ToNov8: {
    count: gnssLagDiffsM.length,
    esaGnssNov3ApMedianDiffVsNov8OwnEpochM: Number(quantile(gnssLagDiffsM, 0.5).toFixed(1)),
    nov7TleApMedianDiffVsNov8OwnEpochM: Number(quantile(gnssTleApLagDiffsM, 0.5).toFixed(1)),
    useEsaGnssInNov8Catalog: gnssNov3BeatNov7TleOnNov8,
  },
  table1ExternalAndOpticalVsSgp4: Object.fromEntries(
    [...table1ByFamily.entries()].map(([fam, hMap]) => [fam, serializeHorizonMap(hMap)])
  ),
  table2BlindTleOnlyApVsSgp4AgainstTruth: {
    allTruthSatellites: serializeHorizonMap(table2AllByH),
    byRegime: Object.fromEntries([...table2ByRegime.entries()].map(([reg, hMap]) => [reg, serializeHorizonMap(hMap)])),
    byTruthFamily: Object.fromEntries([...table2ByFamily.entries()].map(([fam, hMap]) => [fam, serializeHorizonMap(hMap)])),
    maneuverSegmentationExamples: maneuverAblationCases,
    skippedSp3SlotReassignments: skippedCrossTags,
  },
  table3CatalogWideHeldOutNov8OwnEpoch: table3Summary,
  seesatLUnseededStudyValidation: seesatValidation,
  wallSeconds: Number(((performance.now() - tStart) / 1000).toFixed(2)),
};

const outPath = path.join(OUT_DIR, "pure-accuracy-study-results.json");
fs.writeFileSync(outPath, JSON.stringify(studyResults, null, 2));
console.log(`\nSaved complete Pure-Accuracy Study Results to ${outPath} in ${studyResults.wallSeconds}s!`);
process.exit(0);
