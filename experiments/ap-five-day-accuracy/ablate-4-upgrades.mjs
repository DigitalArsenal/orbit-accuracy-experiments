import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import * as flatbuffers from "flatbuffers";
import * as PCF from "spacedatastandards.org/lib/js/PCF/main.js";
import * as ERM from "spacedatastandards.org/lib/js/ERM/main.js";
import { OEM } from "spacedatastandards.org/lib/js/OEM/main.js";

import { assertAllowedPath, isHeldForStudy } from "./lib/hold-gate.mjs";
import { jdOf } from "./lib/gp-history-loader.mjs";
import { buildSpaceWeather } from "./lib/space-weather.mjs";
import { loadPhysicalRegistry } from "./lib/physical-registry.mjs";
import { classifyOrbitRegime } from "./lib/crlb-covariance.mjs";
import { loadWasmModule, loadEopContext, TYPES } from "./lib/wasm-hosts.mjs";
import {
  loadReferenceOemIndex,
  loadMetopSgGcrfSeries,
  loadWaasSbasGcrfByPrn,
  utcMs,
} from "./lib/truth-and-optical-loader.mjs";
import {
  ROUND50_AP_TUNING,
  mergeApTuning,
  fitPureOwnEpochAp,
  propagateSingleTleSgp4Gcrf,
} from "./lib/ssn-epoch-engine.mjs";
import {
  CALIBRATION_SPHERES,
  buildCausalDcaAndRollingPriors,
} from "./lib/tle-upgrades-host.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TIDES_WASM_PATH = path.resolve(__dirname, "wasm/sdn-ap-tides.wasm");
const HORIZONS_H = [0, 24, 48, 72, 96, 120];

function quantile(arr, q) {
  if (!arr || !arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] * (hi - pos) + s[hi] * (pos - lo);
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

// ============================================================================
// WORKER THREAD: Evaluates a shard of the 121 5-day truth cases
// ============================================================================
if (!isMainThread && workerData?.isAblateWorker) {
  const [accessHost, mnvHost, sdnApCanon, sdnApTides] = await Promise.all([
    loadWasmModule("analysis/access/dist/isomorphic/module.wasm"),
    loadWasmModule("analysis/maneuver-detection/dist/isomorphic/module.wasm"),
    loadWasmModule("propagator/sdn-ap/dist/isomorphic/module.wasm"),
    loadWasmModule(TIDES_WASM_PATH),
  ]);
  const bErm = new flatbuffers.Builder(256);
  ERM.ERM.finishERMBuffer(bErm, Object.assign(new ERM.ERMT(), { MODEL_NAME: "WGS-84" }).pack(bErm));
  const ermPayload = bErm.asUint8Array().slice();
  const physMap = new Map(workerData.physEntries);

  const cases = workerData.cases.map((c) => ({
    ...c,
    dcaRecord: c.dcaPayload
      ? {
          cid: c.dcaPayload.cid,
          nodeTimesMsNum: c.dcaPayload.nodeTimesMsNum,
          nodeTimesMs: c.dcaPayload.nodeTimesMsStr.map((s) => BigInt(s)),
          nodeLogScale: c.dcaPayload.nodeLogScale,
        }
      : null,
    preCanon: { sgpByKey: new Map(), ssnByKey: new Map(), mnvCache: new Map() },
    preTides: { sgpByKey: new Map(), ssnByKey: new Map(), mnvCache: new Map() },
  }));

  parentPort.on("message", async (msg) => {
    if (msg.cmd === "quit") {
      await Promise.all([accessHost.destroy?.(), mnvHost.destroy?.(), sdnApCanon.destroy?.(), sdnApTides.destroy?.()]);
      process.exit(0);
    }
    const { tuning, useTidesWasm, passDca, passRolling, useAug5Slice } = msg;
    const host = useTidesWasm ? sdnApTides : sdnApCanon;
    const rows = [];
    for (const pc of cases) {
      const obj = useAug5Slice ? pc.causalObjAug5 : pc.causalObj;
      if (!obj || !obj.tles.length) continue;
      const fit = await fitPureOwnEpochAp({
        sdnApHost: host,
        accessHost,
        mnvHost,
        ermPayload,
        obj,
        spw: pc.spw,
        physicalPrior: physMap.get(pc.norad) || null,
        dcaRecord: passDca ? pc.dcaRecord : null,
        rollingPrior: passRolling ? pc.rollingPrior : null,
        tuning,
        precomputed: useTidesWasm ? pc.preTides : pc.preCanon,
      });
      if (!fit.ok) continue;
      const apProp = await propagateApOcmGcrf(host, fit.ocmBytes, pc.targets.map((t) => t.iso));
      if (!apProp.ok) continue;
      for (let i = 0; i < pc.targets.length; i++) {
        const tgt = pc.targets[i], apSt = apProp.states[i], sgpSt = pc.sgpProp[i];
        if (!apSt || !sgpSt || sgpSt.status !== 0) continue;
        const drApKm = [apSt.rGcrf[0] - tgt.tr.r[0], apSt.rGcrf[1] - tgt.tr.r[1], apSt.rGcrf[2] - tgt.tr.r[2]];
        const drSgpKm = [sgpSt.rGcrf[0] - tgt.tr.r[0], sgpSt.rGcrf[1] - tgt.tr.r[1], sgpSt.rGcrf[2] - tgt.tr.r[2]];
        rows.push({
          h: tgt.h,
          apErr3dM: Math.hypot(...drApKm) * 1000,
          sgpErr3dM: Math.hypot(...drSgpKm) * 1000,
          mahalSq: apSt.P3 ? mahalanobis3dSq(drApKm, apSt.P3) : NaN,
          regime: fit.regime,
          norad: pc.norad,
          name: obj.name,
          mTle: fit.mTle,
        });
      }
    }
    parentPort.postMessage({ rows });
  });
}

// ============================================================================
// MAIN THREAD
// ============================================================================
if (isMainThread) {
  function loadFastMultiMonthGpStore({ archiveRoot = (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive"), satcatRegistry, deepNorads }) {
    assertAllowedPath(archiveRoot);
    const byNorad = new Map();
    const minD70 = Date.UTC(2026, 5, 15) / 86400000;

    const ingest = (arr, fileDate, isSnapshot) => {
      for (let i = 0; i < arr.length; i++) {
        const r = arr[i];
        const norad = Number(r.NORAD_CAT_ID);
        if (!Number.isInteger(norad) || norad <= 0) continue;
        const n = Number(r.MEAN_MOTION), e = Number(r.ECCENTRICITY);
        if (!(n > 0.05) || !(e >= 0.0 && e < 0.995)) continue;

        const isTarget = deepNorads.has(norad) || CALIBRATION_SPHERES.has(norad);
        const isLeoCalSample = n >= 14.10 && n <= 15.88 && e < 0.04 && (norad % 10 === 0);
        if (!isTarget && !isLeoCalSample) continue;

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
          // Pre-Aug-10 daily GP snapshots were archived on fileDate -> strictly causal after fileDate!
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

    // Daily GP snapshots for full 145-day span (2026-06-15..2026-11-08) — fast (~3.5s)
    const gpDir = `${archiveRoot}/spacetrack/gp/2026`;
    for (const f of fs.readdirSync(gpDir).filter((x) => x.endsWith(".json.gz") && x.slice(0, 10) >= "2026-06-15" && x.slice(0, 10) <= "2026-11-08").sort()) {
      ingest(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(gpDir, f))).toString("utf8")), f.slice(0, 10), true);
    }
    // High-cadence gp_history for truth window (2026-08-10..2026-11-08)
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

    function sliceCausal(norad, cutoffIso, windowDays = 46.0, minFloorD70 = 0) {
      const list = byNorad.get(norad);
      if (!list || !list.length) return null;
      const cJd = jdOf(cutoffIso.replace(/Z$/i, ""));
      const cD70 = cJd.whole - 2440587.5 + cJd.frac;
      const cCreate = cutoffIso.replace(/Z$/i, "").slice(0, 19);
      const causal = list.filter(
        (t) =>
          t.d70 >= minFloorD70 &&
          t.d70 <= cD70 + 1e-9 &&
          t.d70 >= cD70 - (windowDays + 2.0) &&
          (!t.creationDate || t.creationDate <= cCreate)
      );
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

    function sliceCatalogPoolCausal(cutoffIso, windowDays = 140.0) {
      const cJd = jdOf(cutoffIso.replace(/Z$/i, ""));
      const cD70 = cJd.whole - 2440587.5 + cJd.frac;
      const cCreate = cutoffIso.replace(/Z$/i, "").slice(0, 19);
      const out = [];
      for (const [norad, list] of byNorad.entries()) {
        const causal = list.filter((t) => t.d70 <= cD70 + 1e-9 && t.d70 >= cD70 - windowDays && (!t.creationDate || t.creationDate <= cCreate));
        if (causal.length < 3) continue;
        const latest = causal.at(-1);
        out.push({ norad, name: latest.name, objectId: latest.objectId, objectType: latest.objectType, tles: causal });
      }
      return { pool: out, cutoffD70: cD70 };
    }

    return { byNorad, sliceCausal, sliceCatalogPoolCausal };
  }

  const t0 = performance.now();
  const [eopParser, framesHost, sdnApMain] = await Promise.all([
    loadWasmModule("data-source/eop-parser/dist/isomorphic/module.wasm"),
    loadWasmModule("foundation/frames/dist/isomorphic/module.wasm"),
    loadWasmModule("propagator/sdn-ap/dist/isomorphic/module.wasm"),
  ]);
  const eopCtx = await loadEopContext(eopParser);
  const physReg = loadPhysicalRegistry();
  const refIdx = loadReferenceOemIndex({ minStartIso: "2026-08-28T00:00:00Z" });

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
  const waasMap = await loadWaasSbasGcrfByPrn(framesHost, eopCtx.eopRows, {
    doys: [298, 299, 300, 301, 302, 303, 304, 305, 306, 307],
  });

  const deepNorads = new Set([...refIdx.byNorad.keys(), 65159, ...waasMap.keys()]);
  const gpStore = loadFastMultiMonthGpStore({ satcatRegistry: physReg, deepNorads });

  const truthEvalCases = [];
  truthEvalCases.push({ norad: 65159, family: "EUMETSAT_METOPSG_LEO", cutoffMs: utcMs("2026-11-05T23:55:00Z"), customSeries: metopStates });
  for (const [norad, wInfo] of waasMap.entries()) {
    truthEvalCases.push({ norad, family: "WAAS_SBAS_GEO", cutoffMs: utcMs("2026-10-28T23:55:00Z"), customSeries: wInfo.states });
  }
  for (const [norad, entries] of refIdx.byNorad.entries()) {
    const latestStop = entries.at(-1).stop;
    if (latestStop < utcMs("2026-09-20T00:00:00Z")) continue;
    const family = entries.at(-1).family;
    const cutoffMs = latestStop - 122 * 3600000;
    const series = refIdx.getSeries(norad, cutoffMs - 52 * 3600000, latestStop);
    const fitStates = series.filter((s) => s.ms >= cutoffMs - 48 * 3600000 && s.ms <= cutoffMs);
    const check120 = refIdx.stateAtExactOrHermite(series, cutoffMs + 118 * 3600000, 1200);
    if (fitStates.length < 24 || !check120) continue;
    truthEvalCases.push({ norad, family, cutoffMs, customSeries: null });
  }

  const spwCache = new Map();
  const dcaCache = new Map();
  const uniqueDates = [...new Set(truthEvalCases.map((tc) => new Date(tc.cutoffMs).toISOString().slice(0, 10)))].sort();
  for (const dt of uniqueDates) {
    const spw = buildSpaceWeather({ firstDate: "2026-06-15", lastDate: "2026-12-20", cutoffDate: dt });
    spwCache.set(dt, spw);
    const cutoffIso = `${dt}T23:59:59Z`;
    const { pool, cutoffD70 } = gpStore.sliceCatalogPoolCausal(cutoffIso, 140.0);
    const tgtPool = pool.filter((o) => deepNorads.has(o.norad));
    dcaCache.set(
      dt,
      buildCausalDcaAndRollingPriors({
        catalogObjects: pool,
        targetObjects: tgtPool,
        physicalPriors: physReg,
        spw,
        cutoffD70,
      })
    );
  }

  const jdFromMs = (ms) => {
    const totalDays = ms / 86400000;
    return { whole: Math.floor(totalDays) + 2440587.5, frac: totalDays - Math.floor(totalDays) };
  };

  // Apply the EXACT benchmark-5day.mjs SP3 slot-reassignment + post-cutoff burn filter (121 maneuver-free cases!)
  const aug5D70 = Date.UTC(2026, 7, 5) / 86400000;
  const preppedCases = [];
  for (const tc of truthEvalCases) {
    const cutoffIso = new Date(tc.cutoffMs).toISOString();
    const causalObj = gpStore.sliceCausal(tc.norad, cutoffIso, 46.0);
    const causalObjAug5 = gpStore.sliceCausal(tc.norad, cutoffIso, 46.0, aug5D70);
    if (!causalObj || !causalObj.tles.length) continue;
    const refTle = causalObj.tles.at(-1);
    const baseMs = Math.round(refTle.d70 * 86400000);
    const series = tc.customSeries || refIdx.getSeries(tc.norad, baseMs - 3600000, baseMs + 126 * 3600000);
    const maxGap = tc.family === "WAAS_SBAS_GEO" ? 1800 : 1200;
    const targets = [];
    for (const h of HORIZONS_H) {
      const tMs = baseMs + h * 3600000;
      const tr = refIdx.stateAtExactOrHermite(series, tMs, maxGap);
      if (tr) targets.push({ h, tMs, iso: new Date(tMs).toISOString(), jd: jdFromMs(tMs), tr });
    }
    if (!targets.length) continue;
    const sgpProp = propagateSingleTleSgp4Gcrf(sdnApMain, refTle, targets.map((t) => t.jd));
    if (!sgpProp[0] || sgpProp[0].status !== 0) continue;
    const sgpErr0M =
      Math.hypot(
        sgpProp[0].rGcrf[0] - targets[0].tr.r[0],
        sgpProp[0].rGcrf[1] - targets[0].tr.r[1],
        sgpProp[0].rGcrf[2] - targets[0].tr.r[2]
      ) * 1000;
    if (sgpErr0M > 15000) continue; // SP3 PRN/NORAD slot reassignment

    // Screen post-cutoff thrusting between cutoffMs and cutoffMs+120h (exact benchmark-5day.mjs lines 545-566)
    const futureTles = (gpStore.byNorad.get(tc.norad) ?? []).filter(
      (t) => t.d70 > refTle.d70 && t.d70 <= refTle.d70 + 5.3
    );
    let postCutoffBurn = false;
    let prev = refTle;
    for (const ft of futureTles) {
      const dtDays = ft.d70 - prev.d70;
      if (dtDays > 0.05) {
        const midJd = jdFromMs(((prev.d70 + ft.d70) * 0.5) * 86400000);
        const ma = propagateSingleTleSgp4Gcrf(sdnApMain, prev, [midJd])[0];
        const mb = propagateSingleTleSgp4Gcrf(sdnApMain, ft, [midJd])[0];
        if (ma.status === 0 && mb.status === 0) {
          const jump = Math.hypot(mb.rGcrf[0] - ma.rGcrf[0], mb.rGcrf[1] - ma.rGcrf[1], mb.rGcrf[2] - ma.rGcrf[2]);
          if (jump > Math.max(8.0, 6.0 * dtDays)) {
            postCutoffBurn = true;
            break;
          }
        }
      }
      prev = ft;
    }
    if (postCutoffBurn) continue;

    const dt = cutoffIso.slice(0, 10);
    const dRec = dcaCache.get(dt).dcaRecord;
    preppedCases.push({
      norad: tc.norad,
      family: tc.family,
      causalObj,
      causalObjAug5,
      targets,
      sgpProp,
      spw: { rows: spwCache.get(dt).rows },
      dcaPayload: dRec
        ? {
            cid: dRec.cid,
            nodeTimesMsNum: dRec.nodeTimesMsNum,
            nodeTimesMsStr: dRec.nodeTimesMs.map(String),
            nodeLogScale: dRec.nodeLogScale,
          }
        : null,
      rollingPrior: dcaCache.get(dt).rollingPriors.get(tc.norad) || null,
    });
  }

  console.log(`Prepared ${preppedCases.length} exact maneuver-free 5-day truth cases & ${gpStore.byNorad.size} multi-month GP histories in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  for (const dt of uniqueDates.slice(-4)) {
    const d = dcaCache.get(dt).dcaRecord;
    if (d) {
      console.log(`  [$DCL ${dt}] sats=${d.satCount}, arcs=${d.arcsUsed}, sAtIssue=${d.sAtIssue.toFixed(4)} (${Math.exp(d.sAtIssue).toFixed(3)}x), rms=${d.postfitRms.toFixed(3)}`);
    }
  }

  // Spawn 8 persistent worker threads
  const NUM_WORKERS = 8;
  const physEntries = [...deepNorads]
    .map((n) => [n, physReg.get(n)])
    .filter(([, v]) => v);
  const buckets = Array.from({ length: NUM_WORKERS }, () => []);
  preppedCases.forEach((c, idx) => buckets[idx % NUM_WORKERS].push(c));
  const workers = buckets.map((cases) => {
    const w = new Worker(__filename, {
      workerData: { isAblateWorker: true, cases, physEntries },
    });
    w.setMaxListeners(50);
    return w;
  });

  const summaryLog = [];
  async function runSuite(label, tuning, { useTidesWasm = false, passDca = false, passRolling = false, useAug5Slice = false } = {}) {
    const tStart = performance.now();
    const allRows = (
      await Promise.all(
        workers.map(
          (w) =>
            new Promise((resolve, reject) => {
              w.once("message", (m) => resolve(m.rows));
              w.once("error", reject);
              w.postMessage({ tuning, useTidesWasm, passDca, passRolling, useAug5Slice });
            })
        )
      )
    ).flat();

    const byH = new Map(HORIZONS_H.map((h) => [h, []]));
    const byReg0 = new Map(), byReg120 = new Map(), sgpByReg120 = new Map();
    for (const r of allRows) {
      byH.get(r.h).push(r);
      if (r.h === 0) {
        if (!byReg0.has(r.regime)) byReg0.set(r.regime, []);
        byReg0.get(r.regime).push(r.apErr3dM);
      }
      if (r.h === 120) {
        if (!byReg120.has(r.regime)) byReg120.set(r.regime, []);
        if (!sgpByReg120.has(r.regime)) sgpByReg120.set(r.regime, []);
        byReg120.get(r.regime).push(r.apErr3dM);
        sgpByReg120.get(r.regime).push(r.sgpErr3dM);
      }
    }

    const h0 = byH.get(0), h72 = byH.get(72), h120 = byH.get(120);
    const med0 = quantile(h0.map((x) => x.apErr3dM), 0.5);
    const med72 = quantile(h72.map((x) => x.apErr3dM), 0.5);
    const med120 = quantile(h120.map((x) => x.apErr3dM), 0.5);
    const sgp0 = quantile(h0.map((x) => x.sgpErr3dM), 0.5);
    const sgp120 = quantile(h120.map((x) => x.sgpErr3dM), 0.5);
    const win120 = (100 * h120.filter((x) => x.apErr3dM < x.sgpErr3dM).length) / h120.length;
    const d2All = allRows.map((x) => x.mahalSq).filter(Number.isFinite);
    const cov1 = (100 * d2All.filter((x) => x <= 3.5267).length) / Math.max(1, d2All.length);
    const cov2 = (100 * d2All.filter((x) => x <= 8.0249).length) / Math.max(1, d2All.length);

    const regStr = ["MID_LEO", "HIGH_LEO", "MEO", "HEO", "GEO"]
      .map((r) => `${r}:${quantile(byReg0.get(r) || [], 0.5).toFixed(0)}->${quantile(byReg120.get(r) || [], 0.5).toFixed(0)}(sgp:${quantile(sgpByReg120.get(r) || [], 0.5).toFixed(0)})`)
      .join(" | ");

    console.log(
      `[${label.padEnd(45)}] N=${h120.length} | +0h=${med0.toFixed(1)}m(sgp ${sgp0.toFixed(0)}) | +72h=${med72.toFixed(1)}m | +120h=${med120.toFixed(1)}m(sgp ${sgp120.toFixed(0)}) | drift=+${(med120 - med0).toFixed(1)}m | win=${win120.toFixed(1)}% | cov=${cov1.toFixed(1)}/${cov2.toFixed(1)}% [${((performance.now() - tStart) / 1000).toFixed(1)}s]\n` +
        `   ${regStr}`
    );
    const rec = {
      label,
      n120: h120.length,
      med0: Number(med0.toFixed(2)),
      med72: Number(med72.toFixed(2)),
      med120: Number(med120.toFixed(2)),
      drift120: Number((med120 - med0).toFixed(2)),
      sgp0: Number(sgp0.toFixed(2)),
      sgp120: Number(sgp120.toFixed(2)),
      win120: Number(win120.toFixed(1)),
      cov1: Number(cov1.toFixed(1)),
      cov2: Number(cov2.toFixed(1)),
      regimes120: Object.fromEntries(
        ["MID_LEO", "HIGH_LEO", "MEO", "HEO", "GEO"].map((r) => [
          r,
          {
            ap0: Number(quantile(byReg0.get(r) || [], 0.5).toFixed(1)),
            ap120: Number(quantile(byReg120.get(r) || [], 0.5).toFixed(1)),
            sgp120: Number(quantile(sgpByReg120.get(r) || [], 0.5).toFixed(1)),
          },
        ])
      ),
    };
    summaryLog.push(rec);
    return rec;
  }

  console.log("\n=== Running Clean Cumulative 4-Upgrade Ladder + Champion Verification ===");

  // 0. Round-50 Baseline (Aug-5 GP slice)
  await runSuite("0. Round-50 Tuning + Bartels SPW (Aug5)", ROUND50_AP_TUNING, { useAug5Slice: true });

  // 1. Upgrade #1: Causal Bartels SPW + Multi-Month GP + Fleet Passive LEO $DCL DCA_COMMON_MODE (HIGH_LEO 750..980 km)
  const cfgU1 = mergeApTuning(ROUND50_AP_TUNING, {
    enableDcaCommonMode: true,
    dcaMinAltKm: 750.0,
    dcaCeilingKm: 980.0,
  });
  await runSuite("1. + Upgrade #1 ($DCL 750..980km + SPW)", cfgU1, { passDca: true });

  // 2. Upgrade #2: + Resonant-Libration Thrust Screen Fix + Multi-Month Rolling Kalman BTERM/AGOM
  const cfgU2NoShort = mergeApTuning(cfgU1, {
    fixResonantThrustScreen: true,
    shortArcPriorScale: false,
    enableRollingPriors: true,
    rollingBtermMinAltKm: 750.0,
    rollingBtermMaxAltKm: 980.0,
    minRollingSigLnB: 0.16,
    rollingAgomRegimes: ["MEO", "HEO"],
  });
  await runSuite("2a. + Upgrade #2 (Rolling+ResFix, noShort)", cfgU2NoShort, { passDca: true, passRolling: true });

  const cfgU2 = mergeApTuning(cfgU2NoShort, { shortArcPriorScale: true });
  await runSuite("2b. + Upgrade #2 (+ shortArcPriorScale)", cfgU2, { passDca: true, passRolling: true });

  // 3a. Upgrade #3a: + Analytical SGP4-to-AP Tesseral Short-Periodic De-Biasing
  const cfgU3a = mergeApTuning(cfgU2, {
    regimes: {
      HIGH_LEO: { spBiasTessAlpha: -0.45, spBiasNodeOnly: true },
      MEO: { spBiasTessAlpha: -1.0 },
      HEO: { spBiasTessAlpha: -1.0 },
      GEO: { spBiasTessAlpha: -0.5 },
    },
  });
  await runSuite("3a. + Upgrade #3a (SGP4->AP Tesseral DeBias)", cfgU3a, { passDca: true, passRolling: true });

  // 3b. Upgrade #3b: + Exact AR(1) + White Nugget Cholesky GLS (test eta=0.38 vs eta=0.50)
  for (const [tag, etaPos, tauDays] of [
    ["eta=0.38,tau=0.6d", 0.38, 0.6],
    ["eta=0.50,tau=0.8d", 0.50, 0.8],
  ]) {
    const cfgU3bTry = mergeApTuning(cfgU3a, {
      enableAr1Gls: true,
      regimes: {
        LOW_LEO: {
          ar1TauDays: [0.4, 0.4, 0.4, 0.3, 0.3, 0.3],
          ar1Eta: [0.20, 0.25, 0.20, 0.15, 0.15, 0.15],
          clusterStrengthOverride: 0.0,
        },
        MID_LEO: {
          ar1TauDays: [0.6, 0.6, 0.6, 0.4, 0.4, 0.4],
          ar1Eta: [etaPos * 0.5, etaPos * 0.65, etaPos * 0.5, 0.22, 0.22, 0.22],
          clusterStrengthOverride: 0.0,
        },
        HIGH_LEO: {
          ar1TauDays: [0.85, 0.85, 0.85, 0.5, 0.5, 0.5],
          ar1Eta: [etaPos * 0.6, etaPos * 0.75, etaPos * 0.6, 0.28, 0.28, 0.28],
          clusterStrengthOverride: 0.0,
        },
        MEO: {
          ar1TauDays: [tauDays, tauDays, tauDays, tauDays * 0.7, tauDays * 0.7, tauDays * 0.7],
          ar1Eta: [etaPos, etaPos, etaPos, etaPos * 0.55, etaPos * 0.55, etaPos * 0.55],
          clusterStrengthOverride: 0.0,
        },
        HEO: {
          ar1TauDays: [tauDays, tauDays, tauDays, tauDays * 0.7, tauDays * 0.7, tauDays * 0.7],
          ar1Eta: [etaPos * 0.65, etaPos * 0.7, etaPos * 0.65, 0.3, 0.3, 0.3],
          clusterStrengthOverride: 0.0,
        },
        GEO: {
          ar1TauDays: [tauDays, tauDays, tauDays, tauDays * 0.7, tauDays * 0.7, tauDays * 0.7],
          ar1Eta: [etaPos * 0.85, etaPos * 0.85, etaPos * 0.85, 0.45, 0.45, 0.45],
          clusterStrengthOverride: 0.0,
        },
      },
    });
    await runSuite(`3b. + Upgrade #3b AR(1) GLS [${tag}]`, cfgU3bTry, { passDca: true, passRolling: true });
  }

  const cfgU3 = mergeApTuning(cfgU3a, {
    enableAr1Gls: true,
    regimes: {
      LOW_LEO: {
        ar1TauDays: [0.4, 0.4, 0.4, 0.3, 0.3, 0.3],
        ar1Eta: [0.20, 0.25, 0.20, 0.15, 0.15, 0.15],
        clusterStrengthOverride: 0.0,
      },
      MID_LEO: {
        ar1TauDays: [0.6, 0.6, 0.6, 0.4, 0.4, 0.4],
        ar1Eta: [0.22, 0.28, 0.22, 0.18, 0.18, 0.18],
        clusterStrengthOverride: 0.0,
      },
      HIGH_LEO: {
        ar1TauDays: [0.85, 0.85, 0.85, 0.5, 0.5, 0.5],
        ar1Eta: [0.25, 0.32, 0.25, 0.20, 0.20, 0.20],
        clusterStrengthOverride: 0.0,
      },
      MEO: {
        ar1TauDays: [0.7, 0.7, 0.7, 0.5, 0.5, 0.5],
        ar1Eta: [0.42, 0.42, 0.42, 0.24, 0.24, 0.24],
        clusterStrengthOverride: 0.0,
      },
      HEO: {
        ar1TauDays: [0.6, 0.6, 0.6, 0.45, 0.45, 0.45],
        ar1Eta: [0.25, 0.28, 0.25, 0.18, 0.18, 0.18],
        clusterStrengthOverride: 0.0,
      },
      GEO: {
        ar1TauDays: [0.7, 0.7, 0.7, 0.5, 0.5, 0.5],
        ar1Eta: [0.38, 0.38, 0.38, 0.22, 0.22, 0.22],
        clusterStrengthOverride: 0.0,
      },
    },
  });

  // 4. Upgrade #4: + Block-Specific Box-Wing SRP + Solid-Earth k2 Tides (both canonical sdn-ap@0.6.5 and zero-perm-bias sdn-ap-tides.wasm)
  const cfgU4Canon = mergeApTuning(cfgU3, {
    enableBoxwing: true,
    enableTides: true,
  });
  await runSuite("4a. + Upgrade #4 (BoxWing+Tides, canon AP)", cfgU4Canon, { passDca: true, passRolling: true });

  const cfgU4Tides = mergeApTuning(cfgU3, {
    enableBoxwing: true,
    enableTides: false,
  });
  await runSuite("4b. + Upgrade #4 (BoxWing + sdn-ap-tides)", cfgU4Tides, { passDca: true, passRolling: true, useTidesWasm: true });

  // 5. Calibrate 3D Mahalanobis Covariance Realism (target 1-sigma ~68.3%, 2-sigma ~95.4%)
  for (const [covScale, covFloor] of [
    [0.86, 1.05],
    [0.80, 1.10],
  ]) {
    const cfgCov = mergeApTuning(cfgU4Canon, {
      covScaleMult: ROUND50_AP_TUNING.covScaleMult * covScale,
      covFloorMult: ROUND50_AP_TUNING.covFloorMult * covFloor,
    });
    await runSuite(`5. Cov Calibration [s=${covScale},f=${covFloor}]`, cfgCov, { passDca: true, passRolling: true });
  }

  fs.writeFileSync((process.env.AP_CATALOG_STORE || "/opt/data/ap-crlb-catalog-2026-11-08") + "/four-upgrades-ablation.json", JSON.stringify(summaryLog, null, 2));
  for (const w of workers) w.postMessage({ cmd: "quit" });
}
