import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import * as flatbuffers from "flatbuffers";
import * as PCF from "spacedatastandards.org/lib/js/PCF/main.js";
import * as ERM from "spacedatastandards.org/lib/js/ERM/main.js";
import { OEM } from "spacedatastandards.org/lib/js/OEM/main.js";
import { assertNoUserDefined } from "../../../../../repos/main-packages/space-data-network-modules/common/tests/no-user-defined.mjs";

import { assertAllowedPath, isHeldForStudy, CREDITS } from "./lib/hold-gate.mjs";
import { jdOf } from "./lib/gp-history-loader.mjs";
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
  utcMs,
} from "./lib/truth-and-optical-loader.mjs";
import {
  ALL_REGIME_OPTICAL_WASM_PATH,
  fitDenseGcrfOemToApOcm,
  fitOpenOpticalArcToApOcm,
} from "./lib/external-and-optical-ap-engine.mjs";
import {
  DEFAULT_AP_TUNING,
  mergeApTuning,
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIDES_WASM_PATH = path.resolve(__dirname, "wasm/sdn-ap-tides.wasm");
const OUT_DIR = (process.env.AP_CATALOG_STORE || "/opt/data/ap-crlb-catalog-2026-11-08");
const HORIZONS_H = [0, 24, 48, 72, 96, 120];

function quantile(arr, q) {
  if (!arr || arr.length === 0) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] * (hi - pos) + s[hi] * (pos - lo);
}
function rms(arr) {
  if (!arr || arr.length === 0) return NaN;
  let sum = 0;
  for (const x of arr) sum += x * x;
  return Math.sqrt(sum / arr.length);
}
function mahalanobis3dSq(drKm, P3Km2) {
  const a00 = P3Km2[0][0], a10 = P3Km2[1][0], a11 = P3Km2[1][1];
  const a20 = P3Km2[2][0], a21 = P3Km2[2][1], a22 = P3Km2[2][2];
  if (!(a00 > 0)) return NaN;
  const l00 = Math.sqrt(a00), l10 = a10 / l00;
  const d1 = a11 - l10 * l10;
  if (!(d1 > 0)) return NaN;
  const l11 = Math.sqrt(d1), l20 = a20 / l00, l21 = (a21 - l20 * l10) / l11;
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
  const medAp = quantile(ap3d, 0.5), medSgp = quantile(sgp3d, 0.5);
  const rmsAp = rms(ap3d), rmsSgp = rms(sgp3d);
  return {
    n: samples.length,
    apWinRatePct: Number(((100 * samples.filter((s) => s.apErr3dM < s.sgpErr3dM).length) / samples.length).toFixed(1)),
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
      p68Ratio: Number((quantile(sgp3d, 0.6827) / Math.max(0.01, quantile(ap3d, 0.6827))).toFixed(2)),
      rmsRatio: Number((rmsSgp / Math.max(0.01, rmsAp)).toFixed(2)),
    },
    apRtnP68M: [Number(quantile(apR, 0.6827).toFixed(1)), Number(quantile(apT, 0.6827).toFixed(1)), Number(quantile(apN, 0.6827).toFixed(1))],
    sgpRtnP68M: [Number(quantile(sgpR, 0.6827).toFixed(1)), Number(quantile(sgpT, 0.6827).toFixed(1)), Number(quantile(sgpN, 0.6827).toFixed(1))],
    covarianceRealism: d2List.length
      ? {
          count: d2List.length,
          medianMahalD: Number(quantile(dList, 0.5).toFixed(3)),
          within1Sigma68Pct: Number(((100 * d2List.filter((x) => x <= 3.5267).length) / d2List.length).toFixed(1)),
          within2Sigma95Pct: Number(((100 * d2List.filter((x) => x <= 8.0249).length) / d2List.length).toFixed(1)),
          within3Sigma997Pct: Number(((100 * d2List.filter((x) => x <= 14.156).length) / d2List.length).toFixed(1)),
        }
      : null,
  };
}

function loadUnifiedGpStore({ archiveRoot = (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive"), satcatRegistry, deepNorads }) {
  assertAllowedPath(archiveRoot);
  const byNorad = new Map();
  const minD70 = Date.UTC(2026, 5, 15) / 86400000;
  const ingest = (arr, fileDate, isSnapshot) => {
    const isRecentWindow = fileDate >= "2026-10-20";
    for (let i = 0; i < arr.length; i++) {
      const r = arr[i];
      const norad = Number(r.NORAD_CAT_ID);
      if (!Number.isInteger(norad) || norad <= 0) continue;
      const n = Number(r.MEAN_MOTION), e = Number(r.ECCENTRICITY);
      if (!(n > 0.05) || !(e >= 0.0 && e < 0.995)) continue;
      const isDeepOrbit = n <= 10.5 || e >= 0.08;
      const isLeoCal = CALIBRATION_SPHERES.has(norad) || (n >= 14.10 && n <= 15.88 && e < 0.04 && norad % 10 === 0);
      // Keep daily snapshots across catalog from June 20 onward for 135d rolling priors, and sub-daily gp_history where needed
      if (!isSnapshot && !isRecentWindow && !deepNorads.has(norad) && !isLeoCal && !(isDeepOrbit && fileDate >= "2026-09-16")) continue;
      const sc = satcatRegistry.get(norad);
      const objName = r.OBJECT_NAME || sc?.name || "";
      const ep = r.EPOCH;
      if (!ep || isHeldForStudy(norad, objName, ep)) continue;
      if ((r.DECAY_DATE && r.DECAY_DATE <= "2026-11-08") || (sc?.decayDate && sc.decayDate <= "2026-11-08")) continue;
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
    ingest(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(gpDir, f))).toString("utf8")), f.slice(0, 10), true);
  }
  const histDir = `${archiveRoot}/spacetrack/gp_history/by-creation/2026`;
  for (const f of fs.readdirSync(histDir).filter((x) => x.endsWith(".json.gz") && x.slice(0, 10) >= "2026-08-10" && x.slice(0, 10) <= "2026-11-08").sort()) {
    ingest(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(histDir, f))).toString("utf8")), f.slice(0, 10), false);
  }
  for (const [norad, list] of byNorad.entries()) {
    list.sort((a, b) => a.d70 - b.d70 || a.gpId - b.gpId);
    const dedup = [];
    for (const it of list) {
      if (dedup.length > 0 && Math.abs(it.d70 - dedup[dedup.length - 1].d70) * 86400.0 < 60.0) {
        if (it.gpId >= dedup[dedup.length - 1].gpId) dedup[dedup.length - 1] = it;
      } else dedup.push(it);
    }
    byNorad.set(norad, dedup);
  }
  function sliceCausal(norad, cutoffIso, windowDays = 46.0) {
    const list = byNorad.get(norad);
    if (!list || !list.length) return null;
    const cJd = jdOf(cutoffIso.replace(/Z$/i, ""));
    const cD70 = cJd.whole - 2440587.5 + cJd.frac;
    const cCreate = cutoffIso.replace(/Z$/i, "").slice(0, 19);
    const causal = list.filter((t) => t.d70 <= cD70 + 1e-9 && t.d70 >= cD70 - (windowDays + 2.0) && (!t.creationDate || t.creationDate <= cCreate));
    if (!causal.length) return null;
    const latest = causal.at(-1);
    if (cD70 - latest.d70 > 14.0) return null;
    return {
      norad,
      name: latest.name,
      objectId: latest.objectId,
      objectType: latest.objectType,
      tles: causal.filter((t) => t.d70 >= latest.d70 - windowDays - 1e-9),
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
  if (res.statusCode !== 0 || !res.outputs.length) return { ok: false };
  const oem = OEM.getRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(res.outputs[0].payload)));
  const blk = oem.EPHEMERIS_DATA_BLOCK(0);
  const states = [];
  for (let i = 0; i < blk.ephemerisDataLinesLength(); i++) {
    const l = blk.EPHEMERIS_DATA_LINES(i);
    let P3 = null;
    if (i < blk.covarianceMatrixLinesLength()) {
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

const t0 = performance.now();
const [eopParser, framesHost, accessHost, mnvHost, satnogsSrc, optical, anglesFlow, obsOd, estimation, ffm, sdnAp, sdnApTides] =
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
    loadWasmModule("propagator/ffm/dist/isomorphic/module.wasm"),
    loadWasmModule("propagator/sdn-ap/dist/isomorphic/module.wasm"),
    loadWasmModule(TIDES_WASM_PATH),
  ]);

const bErm = new flatbuffers.Builder(256);
ERM.ERM.finishERMBuffer(bErm, Object.assign(new ERM.ERMT(), { MODEL_NAME: "WGS-84" }).pack(bErm));
const ermPayload = bErm.asUint8Array().slice();

const eopCtx = await loadEopContext(eopParser);
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

// Stitch Nov 3..Nov 11 Metop-SG A1 operational POD for full 5-day (+120h) held-out evaluation!
const metopEarly = await loadMetopSgGcrfSeries(framesHost, eopCtx.eopRows, {
  zipPath: (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive") + "/hac/eumetsat-metopsg/AUX_POFD/SGA1________AUX_POFD___S20261103000000Z_E20261108000000Z_G20261105064404Z_FDS__OPE_OPER.SIP.zip",
  startIso: "2026-11-03T00:00:00",
  stopIso: "2026-11-06T00:00:00",
  stepMinutes: 5,
});
const metopLate = await loadMetopSgGcrfSeries(framesHost, eopCtx.eopRows, {
  zipPath: (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive") + "/hac/eumetsat-metopsg/AUX_POFD/SGA1________AUX_POFD___S20261106000000Z_E20261111000000Z_G20261108064405Z_FDS__OPE_OPER.SIP.zip",
  startIso: "2026-11-06T00:00:00",
  stopIso: "2026-11-11T00:00:00",
  stepMinutes: 5,
});
const metopStates = [...metopEarly, ...metopLate].sort((a, b) => a.ms - b.ms);

// Load 10 days (DOY 298..307 = Oct 25..Nov 3) of WAAS SBAS GEO for full 5-day (+120h) held-out evaluation!
const waasMap = await loadWaasSbasGcrfByPrn(framesHost, eopCtx.eopRows, {
  doys: [298, 299, 300, 301, 302, 303, 304, 305, 306, 307],
});

const deepNorads = new Set([...refIdx.byNorad.keys(), 65159, ...waasMap.keys()]);
const gpStore = loadUnifiedGpStore({ satcatRegistry: physReg, deepNorads });
console.log(`Initialized 5-Day Benchmark (${deepNorads.size} truth sats, ${gpStore.byNorad.size} catalog objects) in ${((performance.now() - t0) / 1000).toFixed(1)}s`);

const jdFromMs = (ms) => {
  const totalDays = ms / 86400000;
  return { whole: Math.floor(totalDays) + 2440587.5, frac: totalDays - Math.floor(totalDays) };
};

async function scorePairAgainstTruth({ ocmBytes, refTle, baseMs, truthAtMs, propHost = sdnAp }) {
  const validTargets = [];
  for (const h of HORIZONS_H) {
    const tMs = baseMs + h * 3600000;
    const tr = truthAtMs(tMs);
    if (tr) validTargets.push({ h, tMs, iso: new Date(tMs).toISOString(), jd: jdFromMs(tMs), tr });
  }
  if (!validTargets.length) return [];
  const apProp = await propagateApOcmGcrf(propHost, ocmBytes, validTargets.map((t) => t.iso));
  if (!apProp.ok) return [];
  const sgpProp = propagateSingleTleSgp4Gcrf(sdnAp, refTle, validTargets.map((t) => t.jd));
  const out = [];
  for (let i = 0; i < validTargets.length; i++) {
    const tgt = validTargets[i], apSt = apProp.states[i], sgpSt = sgpProp[i];
    if (!apSt || !sgpSt || sgpSt.status !== 0) continue;
    const drApKm = [apSt.rGcrf[0] - tgt.tr.r[0], apSt.rGcrf[1] - tgt.tr.r[1], apSt.rGcrf[2] - tgt.tr.r[2]];
    const drSgpKm = [sgpSt.rGcrf[0] - tgt.tr.r[0], sgpSt.rGcrf[1] - tgt.tr.r[1], sgpSt.rGcrf[2] - tgt.tr.r[2]];
    const refVel = tgt.tr.v && tgt.tr.v.some((v) => v !== 0) ? tgt.tr.v : apSt.vGcrf;
    out.push({
      h: tgt.h,
      apErr3dM: Math.hypot(...drApKm) * 1000,
      sgpErr3dM: Math.hypot(...drSgpKm) * 1000,
      apUvwM: vecToUvw(tgt.tr.r, refVel, drApKm).map((x) => x * 1000),
      sgpUvwM: vecToUvw(tgt.tr.r, refVel, drSgpKm).map((x) => x * 1000),
      mahalSq: apSt.P3 ? mahalanobis3dSq(drApKm, apSt.P3) : NaN,
    });
  }
  return out;
}

// ============================================================================
// TIER 1 & TIER 2: 5-DAY (+120h) EXTERNAL/OPTICAL & BLIND TLE-ONLY vs TRUTH
// ============================================================================
const t1ByFam = new Map();
const addT1 = (fam, rows) => {
  if (!t1ByFam.has(fam)) t1ByFam.set(fam, new Map());
  for (const r of rows) {
    if (!t1ByFam.get(fam).has(r.h)) t1ByFam.get(fam).set(r.h, []);
    t1ByFam.get(fam).get(r.h).push(r);
  }
};

const truthEvalCases = [];

// 1A. EUMETSAT Metop-SG A1: Fit Nov 4-5 -> Score Nov 5..Nov 10 (+120h = 5 days!)
{
  const cutoffIso = "2026-11-05T23:55:00Z";
  const cutoffMs = utcMs(cutoffIso);
  truthEvalCases.push({ norad: 65159, family: "EUMETSAT_METOPSG_LEO", cutoffMs, customSeries: metopStates });
  const fitStates = metopStates.filter((s) => s.ms >= cutoffMs - 48 * 3600e3 && s.ms <= cutoffMs);
  const causalObj = gpStore.sliceCausal(65159, cutoffIso);
  const spw = getCausalSpw(cutoffIso);
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
    addT1(
      "EUMETSAT_METOPSG_LEO",
      await scorePairAgainstTruth({
        ocmBytes: fit.ocmBytes,
        refTle: causalObj.tles.at(-1),
        baseMs: utcMs(fit.epoch),
        truthAtMs: (tMs) => refIdx.stateAtExactOrHermite(metopStates, tMs, 600),
      })
    );
  }
}

// 1B. SatNOGS Optical Unseeded -> 5-day (+120h) vs IDS_DORIS Truth
{
  const optScan = scanSatnogsOpticalSessions({
    startSession: "2026-09-03",
    stopSession: "2026-09-16",
    filterNorads: new Set([66514, 46984]),
  });
  for (const [norad, s0, s1] of [
    [66514, "2026-09-03", "2026-09-06"],
    [66514, "2026-09-12", "2026-09-14"],
    [46984, "2026-09-12", "2026-09-14"],
  ]) {
    const sessMap = optScan.byNorad.get(norad);
    if (!sessMap) continue;
    const buckets = [...sessMap.values()].filter((b) => b.session >= s0 && b.session <= s1 && b.stationId !== 7);
    if (new Set(buckets.map((b) => b.session)).size < 2) continue;
    const tdms = [], eoos = [], stations = [], timingSigmas = {};
    let pvnBytes = null;
    for (const b of buckets) {
      const subB = b.rows.length > 100 ? { ...b, rows: b.rows.filter((_, idx) => idx % 4 === 0) } : b;
      const conv = await convertBucketViaSatnogsSource(satnogsSrc, subB);
      tdms.push(...conv.tdms);
      eoos.push(...conv.eoos);
      stations.push(...conv.stations);
      pvnBytes = conv.provenance;
      timingSigmas[`SATNOGS-OPTICAL-${String(b.stationId).padStart(4, "0")}`] = 0.025;
    }
    const spw = getCausalSpw(`${s1}T23:59:59Z`);
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
    if (fit.ok) {
      const baseMs = utcMs(fit.epoch);
      const causalObj = gpStore.sliceCausal(norad, new Date(baseMs).toISOString());
      const series = refIdx.getSeries(norad, baseMs - 3600e3, baseMs + 125 * 3600e3);
      if (causalObj && series.length) {
        addT1(
          "SATNOGS_OPTICAL_UNSEEDED_LEO",
          await scorePairAgainstTruth({
            ocmBytes: fit.ocmBytes,
            refTle: causalObj.tles.at(-1),
            baseMs,
            truthAtMs: (tMs) => refIdx.stateAtExactOrHermite(series, tMs, 900),
          })
        );
      }
    }
  }
}

// 1C. WAAS SBAS GEO: Fit Oct 27-28 -> Score Oct 28..Nov 2 (+120h = 5 days!)
for (const [norad, wInfo] of waasMap.entries()) {
  const cutoffIso = "2026-10-28T23:55:00Z";
  const cutoffMs = utcMs(cutoffIso);
  truthEvalCases.push({ norad, family: "WAAS_SBAS_GEO", cutoffMs, customSeries: wInfo.states });
  const fitStates = wInfo.states.filter((s) => s.ms >= cutoffMs - 48 * 3600e3 && s.ms <= cutoffMs);
  const causalObj = gpStore.sliceCausal(norad, cutoffIso);
  const spw = getCausalSpw(cutoffIso);
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
      addT1(
        "WAAS_SBAS_GEO",
        await scorePairAgainstTruth({
          ocmBytes: fit.ocmBytes,
          refTle: causalObj.tles.at(-1),
          baseMs: utcMs(fit.epoch),
          truthAtMs: (tMs) => refIdx.stateAtExactOrHermite(wInfo.states, tMs, 1800),
        })
      );
    }
  }
}

// 1D. All Reference GCRF Truth Satellites with >= 122h (5.1 days) continuous future truth
for (const [norad, entries] of refIdx.byNorad.entries()) {
  const latestStop = entries.at(-1).stop;
  if (latestStop < utcMs("2026-09-20T00:00:00Z")) continue;
  const family = entries.at(-1).family;
  const cutoffMs = latestStop - 122 * 3600000; // Full +120h (5 days) held-out truth!
  const series = refIdx.getSeries(norad, cutoffMs - 52 * 3600000, latestStop);
  const fitStates = series.filter((s) => s.ms >= cutoffMs - 48 * 3600000 && s.ms <= cutoffMs);
  const check120 = refIdx.stateAtExactOrHermite(series, cutoffMs + 118 * 3600000, 1200);
  if (fitStates.length < 24 || !check120) continue;

  truthEvalCases.push({ norad, family, cutoffMs, customSeries: null });
  const cutoffIso = new Date(cutoffMs).toISOString();
  const causalObj = gpStore.sliceCausal(norad, cutoffIso);
  if (!causalObj) continue;
  const spw = getCausalSpw(cutoffIso);
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
    addT1(
      family,
      await scorePairAgainstTruth({
        ocmBytes: fit.ocmBytes,
        refTle: causalObj.tles.at(-1),
        baseMs: utcMs(fit.epoch),
        truthAtMs: (tMs) => refIdx.stateAtExactOrHermite(series, tMs, 1200),
      })
    );
  }
}

// Precompute causal Fleet $DCL + Multi-Month Rolling Priors per unique Tier 2 cutoff date!
const dcaCache = new Map();
const getCausalDca = (cutoffIso, targetNorads = deepNorads) => {
  const dt = cutoffIso.slice(0, 10);
  const key = `${dt}:${targetNorads ? "deep" : "all"}`;
  if (!dcaCache.has(key)) {
    const spw = getCausalSpw(cutoffIso);
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
        spw,
        cutoffD70,
      })
    );
  }
  return dcaCache.get(key);
};

// Tier 2: Blind TLE-Only Pure Own-Epoch AP vs Single-TLE SGP4 across 0..120h (5 days)!
const t2AllByH = new Map();
const t2ByRegime = new Map();
const t2ByFam = new Map();
const t2TidesAllByH = new Map();
const t2TidesByRegime = new Map();

for (const tc of truthEvalCases) {
  const cutoffIso = new Date(tc.cutoffMs).toISOString();
  const causalObj = gpStore.sliceCausal(tc.norad, cutoffIso, 46.0);
  if (!causalObj || !causalObj.tles.length) continue;
  const spw = getCausalSpw(cutoffIso);
  const { dcaRecord, rollingPriors } = getCausalDca(cutoffIso, deepNorads);
  const rollingPrior = rollingPriors.get(tc.norad) || null;
  const fit = await fitPureOwnEpochAp({
    sdnApHost: sdnAp,
    accessHost,
    mnvHost,
    ermPayload,
    obj: causalObj,
    spw,
    physicalPrior: physReg.get(tc.norad),
    dcaRecord,
    rollingPrior,
  });
  if (!fit.ok) continue;
  assertNoUserDefined(fit.ocmBytes);
  const refTle = causalObj.tles.at(-1);
  const baseMs = utcMs(fit.epoch);
  const series = tc.customSeries ?? refIdx.getSeries(tc.norad, baseMs - 3600000, baseMs + 126 * 3600000);
  const maxBracketSec = tc.family === "WAAS_SBAS_GEO" ? 1800 : 1200;
  const rows = await scorePairAgainstTruth({
    ocmBytes: fit.ocmBytes,
    refTle,
    baseMs,
    truthAtMs: (tMs) => refIdx.stateAtExactOrHermite(series, tMs, maxBracketSec),
  });
  if (!rows.length) continue;
  if (rows[0].sgpErr3dM > 15000 && rows[0].apErr3dM > 15000) continue; // SP3 slot reassignment

  // Screen post-cutoff thrusting between cutoffMs and cutoffMs+120h using post-cutoff TLE midpoint check so we measure pure 5d physics!
  const futureTles = (gpStore.byNorad.get(tc.norad) ?? []).filter(
    (t) => t.d70 > refTle.d70 && t.d70 <= refTle.d70 + 5.3
  );
  let postCutoffBurn = false;
  let prev = refTle;
  for (const ft of futureTles) {
    const dt = ft.d70 - prev.d70;
    if (dt > 0.05) {
      const midJd = jdFromMs(((prev.d70 + ft.d70) * 0.5) * 86400000);
      const ma = propagateSingleTleSgp4Gcrf(sdnAp, prev, [midJd])[0];
      const mb = propagateSingleTleSgp4Gcrf(sdnAp, ft, [midJd])[0];
      if (ma.status === 0 && mb.status === 0) {
        const jump = Math.hypot(mb.rGcrf[0] - ma.rGcrf[0], mb.rGcrf[1] - ma.rGcrf[1], mb.rGcrf[2] - ma.rGcrf[2]);
        if (jump > Math.max(8.0, 6.0 * dt)) {
          postCutoffBurn = true;
          break;
        }
      }
    }
    prev = ft;
  }
  if (postCutoffBurn) continue;

  for (const r of rows) {
    if (!t2AllByH.has(r.h)) t2AllByH.set(r.h, []);
    t2AllByH.get(r.h).push(r);
    if (!t2ByRegime.has(fit.regime)) t2ByRegime.set(fit.regime, new Map());
    if (!t2ByRegime.get(fit.regime).has(r.h)) t2ByRegime.get(fit.regime).set(r.h, []);
    t2ByRegime.get(fit.regime).get(r.h).push(r);
    if (!t2ByFam.has(tc.family)) t2ByFam.set(tc.family, new Map());
    if (!t2ByFam.get(tc.family).has(r.h)) t2ByFam.get(tc.family).set(r.h, []);
    t2ByFam.get(tc.family).get(r.h).push(r);
  }

  // Also evaluate in-propagator IERS 2010 solid-Earth k2 tides WASM (`wasm/sdn-ap-tides.wasm`)
  const fitTides = await fitPureOwnEpochAp({
    sdnApHost: sdnApTides,
    accessHost,
    mnvHost,
    ermPayload,
    obj: causalObj,
    spw,
    physicalPrior: physReg.get(tc.norad),
    dcaRecord,
    rollingPrior,
    tuning: mergeApTuning(DEFAULT_AP_TUNING, { enableTides: false }),
  });
  if (fitTides.ok) {
    const rowsTides = await scorePairAgainstTruth({
      ocmBytes: fitTides.ocmBytes,
      refTle,
      baseMs: utcMs(fitTides.epoch),
      truthAtMs: (tMs) => refIdx.stateAtExactOrHermite(series, tMs, maxBracketSec),
      propHost: sdnApTides,
    });
    for (const r of rowsTides) {
      if (!t2TidesAllByH.has(r.h)) t2TidesAllByH.set(r.h, []);
      t2TidesAllByH.get(r.h).push(r);
      if (!t2TidesByRegime.has(fitTides.regime)) t2TidesByRegime.set(fitTides.regime, new Map());
      if (!t2TidesByRegime.get(fitTides.regime).has(r.h)) t2TidesByRegime.get(fitTides.regime).set(r.h, []);
      t2TidesByRegime.get(fitTides.regime).get(r.h).push(r);
    }
  }
}

// ============================================================================
// TIER 3: CATALOG-WIDE 5-DAY BLIND FORECAST (Causal Nov 3 -> Held-Out Nov 8 Own Epochs!)
// ============================================================================
const spwNov3 = getCausalSpw("2026-11-03T23:59:59Z");
const cands5dByRegime = new Map();
for (const [norad, allTles] of gpStore.byNorad.entries()) {
  const nov8Tles = allTles.filter((t) => t.epoch >= "2026-11-08T00:00:00" && t.epoch <= "2026-11-08T23:59:59.999999");
  if (!nov8Tles.length) continue;
  const causalNov3 = gpStore.sliceCausal(norad, "2026-11-03T23:59:59.999999", 46.0);
  if (!causalNov3 || causalNov3.tles.length < 2) continue;
  const { regime } = classifyOrbitRegime(causalNov3.tles.at(-1).n, causalNov3.tles.at(-1).e);
  if (!cands5dByRegime.has(regime)) cands5dByRegime.set(regime, []);
  cands5dByRegime.get(regime).push({ norad, causalNov3, allTles, nov8Tles });
}

const t3TargetNorads = new Set();
for (const [, pool] of cands5dByRegime.entries()) {
  const stride = Math.max(1, Math.floor(pool.length / 150));
  for (let i = 0; i < pool.length; i += stride) t3TargetNorads.add(pool[i].norad);
}
const { dcaRecord: dcaNov3, rollingPriors: rollingNov3 } = (() => {
  const { pool, targets, cutoffD70 } = gpStore.sliceCatalogPoolCausal("2026-11-03T23:59:59Z", {
    windowDays: 140.0,
    targetNorads: t3TargetNorads,
  });
  return buildCausalDcaAndRollingPriors({
    catalogObjects: pool,
    targetObjects: targets,
    physicalPriors: physReg,
    spw: spwNov3,
    cutoffD70,
  });
})();

const t3FiveDaySamples = [];
for (const [regime, pool] of cands5dByRegime.entries()) {
  const stride = Math.max(1, Math.floor(pool.length / 150));
  for (let i = 0; i < pool.length && t3FiveDaySamples.filter((x) => x.regime === regime).length < 150; i += stride) {
    const item = pool[i];
    const refTleNov3 = item.causalNov3.tles.at(-1);
    const testTle = item.nov8Tles.at(-1);
    const dtDays = testTle.d70 - refTleNov3.d70;
    if (!(dtDays >= 4.0 && dtDays <= 6.2)) continue;

    // Screen unannounced burns between Nov 3 and Nov 8 across sequential TLE pairs
    const between = item.allTles.filter((t) => t.d70 >= refTleNov3.d70 - 1e-6 && t.d70 <= testTle.d70 + 1e-6);
    let burned = false;
    for (let k = 0; k + 1 < between.length; k++) {
      const a = between[k], b = between[k + 1];
      const dt = b.d70 - a.d70;
      if (dt <= 0.02) continue;
      const midJd = jdFromMs(((a.d70 + b.d70) * 0.5) * 86400000);
      const ma = propagateSingleTleSgp4Gcrf(sdnAp, a, [midJd])[0];
      const mb = propagateSingleTleSgp4Gcrf(sdnAp, b, [midJd])[0];
      if (ma.status !== 0 || mb.status !== 0) {
        burned = true;
        break;
      }
      const jump = Math.hypot(mb.rGcrf[0] - ma.rGcrf[0], mb.rGcrf[1] - ma.rGcrf[1], mb.rGcrf[2] - ma.rGcrf[2]);
      if (jump > Math.max(12.0, 9.0 * dt)) {
        burned = true;
        break;
      }
    }
    if (burned) continue;

    const ownNov8 = evalSgp4OwnEpochs(sdnAp, [testTle])[0];
    if (ownNov8.status !== 0) continue;
    const [ssnClassNov8] = await classifySsnEpochsBatch(accessHost, [testTle], [ownNov8]);

    const fit = await fitPureOwnEpochAp({
      sdnApHost: sdnAp,
      accessHost,
      mnvHost,
      ermPayload,
      obj: item.causalNov3,
      spw: spwNov3,
      physicalPrior: physReg.get(item.norad),
      dcaRecord: dcaNov3,
      rollingPrior: rollingNov3.get(item.norad) || null,
    });
    if (!fit.ok) continue;
    const apAtNov8 = await propagateApOcmGcrf(sdnAp, fit.ocmBytes, [ownNov8.epochIso]);
    if (!apAtNov8.ok) continue;
    const sgpAtNov8 = propagateSingleTleSgp4Gcrf(sdnAp, refTleNov3, [{ whole: testTle.whole, frac: testTle.frac }])[0];
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
    const gpNoise = getOwnEpochNoiseSigmas(regime, ssnClassNov8);
    t3FiveDaySamples.push({
      norad: item.norad,
      objectType: item.causalNov3.objectType,
      regime,
      ssnClassNov8,
      leadHours: dtDays * 24.0,
      apDiff3dM: Math.hypot(...drApKm) * 1000,
      sgpDiff3dM: Math.hypot(...drSgpKm) * 1000,
      gpFloor3dM: Math.hypot(...gpNoise.sigPosKm) * 1000,
    });
  }
}

const sumT3 = (list) => {
  if (!list.length) return null;
  const ap = list.map((x) => x.apDiff3dM), sgp = list.map((x) => x.sgpDiff3dM);
  const flRms = rms(list.map((x) => x.gpFloor3dM)), flMed = quantile(list.map((x) => x.gpFloor3dM), 0.5);
  const medAp = quantile(ap, 0.5), medSgp = quantile(sgp, 0.5);
  const p68Ap = quantile(ap, 0.6827), p68Sgp = quantile(sgp, 0.6827);
  const decP68Ap = Math.sqrt(Math.max(0, p68Ap ** 2 - flRms ** 2));
  const decP68Sgp = Math.sqrt(Math.max(0, p68Sgp ** 2 - flRms ** 2));
  const decMedAp = Math.sqrt(Math.max(0, medAp ** 2 - (0.76 * flMed) ** 2));
  const decMedSgp = Math.sqrt(Math.max(0, medSgp ** 2 - (0.76 * flMed) ** 2));
  return {
    n: list.length,
    medianLeadHours: Number(quantile(list.map((x) => x.leadHours), 0.5).toFixed(1)),
    apWinRatePct: Number(((100 * list.filter((x) => x.apDiff3dM < x.sgpDiff3dM).length) / list.length).toFixed(1)),
    rawM: {
      apMed: Number(medAp.toFixed(1)),
      sgpMed: Number(medSgp.toFixed(1)),
      medRatio: Number((medSgp / Math.max(1, medAp)).toFixed(2)),
      apP68: Number(p68Ap.toFixed(1)),
      sgpP68: Number(p68Sgp.toFixed(1)),
      p68Ratio: Number((p68Sgp / Math.max(1, p68Ap)).toFixed(2)),
    },
    deconvM: {
      apMed: Number(decMedAp.toFixed(1)),
      sgpMed: Number(decMedSgp.toFixed(1)),
      apP68: Number(decP68Ap.toFixed(1)),
      sgpP68: Number(decP68Sgp.toFixed(1)),
      p68Ratio: decP68Ap > 1 ? Number((decP68Sgp / decP68Ap).toFixed(2)) : null,
    },
  };
};

function summarize5DayLossFromHorizonMap(hMap) {
  if (!hMap) return null;
  const s0 = summarizeHorizonStats(hMap.get(0));
  const s120 = summarizeHorizonStats(hMap.get(120));
  if (!s0 || !s120) return null;
  return {
    n0: s0.n,
    n120: s120.n,
    apMed0M: s0.ap3dM.median,
    apMed120M: s120.ap3dM.median,
    apAddedDriftMedM: Number((s120.ap3dM.median - s0.ap3dM.median).toFixed(2)),
    apLossPct5dMed: Number((((s120.ap3dM.median - s0.ap3dM.median) / Math.max(0.01, s0.ap3dM.median)) * 100.0).toFixed(2)),
    sgpMed0M: s0.sgp3dM.median,
    sgpMed120M: s120.sgp3dM.median,
    sgpAddedDriftMedM: Number((s120.sgp3dM.median - s0.sgp3dM.median).toFixed(2)),
    sgpLossPct5dMed: Number((((s120.sgp3dM.median - s0.sgp3dM.median) / Math.max(0.01, s0.sgp3dM.median)) * 100.0).toFixed(2)),
    gainVsSgp0: s0.gainFactor.medianRatio,
    gainVsSgp120: s120.gainFactor.medianRatio,
    apWinRate120Pct: s120.apWinRatePct,
  };
}

const out5d = {
  tier1ExternalAndOptical120h: Object.fromEntries(
    [...t1ByFam.entries()].map(([fam, m]) => [
      fam,
      {
        ...Object.fromEntries(HORIZONS_H.map((h) => [`+${h}h`, summarizeHorizonStats(m.get(h))]).filter(([, v]) => v)),
        fiveDayLossSummary: summarize5DayLossFromHorizonMap(m),
      },
    ])
  ),
  tier2BlindTleOnlyAgainstTruth: {
    allTruth: Object.fromEntries(HORIZONS_H.map((h) => [`+${h}h`, summarizeHorizonStats(t2AllByH.get(h))]).filter(([, v]) => v)),
    fiveDayLossAllTruth: summarize5DayLossFromHorizonMap(t2AllByH),
    byRegime0h: Object.fromEntries([...t2ByRegime.entries()].map(([r, m]) => [r, summarizeHorizonStats(m.get(0))])),
    byRegime120h: Object.fromEntries([...t2ByRegime.entries()].map(([r, m]) => [r, summarizeHorizonStats(m.get(120))])),
    fiveDayLossByRegime: Object.fromEntries([...t2ByRegime.entries()].map(([r, m]) => [r, summarize5DayLossFromHorizonMap(m)])),
    byFamily120h: Object.fromEntries([...t2ByFam.entries()].map(([f, m]) => [f, summarizeHorizonStats(m.get(120))])),
    fiveDayLossByFamily: Object.fromEntries([...t2ByFam.entries()].map(([f, m]) => [f, summarize5DayLossFromHorizonMap(m)])),
  },
  tier2WithSolidEarthTidesWasm: {
    allTruth: Object.fromEntries(HORIZONS_H.map((h) => [`+${h}h`, summarizeHorizonStats(t2TidesAllByH.get(h))]).filter(([, v]) => v)),
    fiveDayLossAllTruth: summarize5DayLossFromHorizonMap(t2TidesAllByH),
    byRegime0h: Object.fromEntries([...t2TidesByRegime.entries()].map(([r, m]) => [r, summarizeHorizonStats(m.get(0))])),
    byRegime120h: Object.fromEntries([...t2TidesByRegime.entries()].map(([r, m]) => [r, summarizeHorizonStats(m.get(120))])),
    fiveDayLossByRegime: Object.fromEntries([...t2TidesByRegime.entries()].map(([r, m]) => [r, summarize5DayLossFromHorizonMap(m)])),
  },
  tier3CatalogWide5DayNov3ToNov8OwnEpoch: {
    overall: sumT3(t3FiveDaySamples),
    debrisAndRocketBodies: sumT3(t3FiveDaySamples.filter((x) => /DEBRIS|ROCKET/i.test(x.objectType))),
    byRegime: Object.fromEntries([...cands5dByRegime.keys()].map((r) => [r, sumT3(t3FiveDaySamples.filter((x) => x.regime === r))])),
  },
  wallSeconds: Number(((performance.now() - t0) / 1000).toFixed(1)),
};

fs.writeFileSync(path.join(OUT_DIR, "five-day-accuracy-results.json"), JSON.stringify(out5d, null, 2));
console.log("\n=== TIER 1 (+120h / 5-Day External & Unseeded Open-Optical AP vs SGP4) ===");
for (const [fam, hObj] of Object.entries(out5d.tier1ExternalAndOptical120h)) {
  console.log(`  ${fam} @ +120h:`, JSON.stringify(hObj["+120h"] ?? hObj["+96h"]));
}
console.log("\n=== TIER 2 (0d..5d Blind TLE-Only Own-Epoch AP vs SGP4 Against Independent Truth) ===");
for (const [hk, st] of Object.entries(out5d.tier2BlindTleOnlyAgainstTruth.allTruth)) {
  console.log(
    `  ${hk} (N=${st.n}): AP Med=${st.ap3dM.median}m (P68=${st.ap3dM.p68}m, RMS=${st.ap3dM.rms}m) vs SGP4 Med=${st.sgp3dM.median}m (P68=${st.sgp3dM.p68}m, RMS=${st.sgp3dM.rms}m) | Gain=${st.gainFactor.medianRatio}x med / ${st.gainFactor.rmsRatio}x RMS | Win=${st.apWinRatePct}% | Cov(1/2/3sig)=${st.covarianceRealism?.within1Sigma68Pct}/${st.covarianceRealism?.within2Sigma95Pct}/${st.covarianceRealism?.within3Sigma997Pct}%`
  );
}
console.log("  Tier 2 @ +120h by Regime:", JSON.stringify(out5d.tier2BlindTleOnlyAgainstTruth.byRegime120h, null, 2));
console.log("\n=== TIER 3 (Catalog-Wide 5-Day Blind Forecast: Causal Nov 3 -> Held-Out Nov 8 Own Epochs) ===");
console.log(JSON.stringify(out5d.tier3CatalogWide5DayNov3ToNov8OwnEpoch, null, 2));
process.exit(0);
