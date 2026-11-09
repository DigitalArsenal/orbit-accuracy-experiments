import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as flatbuffers from "flatbuffers";
import * as DCL_NS from "../../../../../../repos/main-packages/spacedatastandards.org/lib/js/DCL/main.js";
import { PVN } from "../../../../../../repos/main-packages/spacedatastandards.org/lib/js/PVN/PVN.js";
import { loadWasmModule } from "./wasm-hosts.mjs";
import { classifyOrbitRegime } from "./crlb-covariance.mjs";
import { buildPvnBytes } from "./hold-gate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TLEUP_WASM_PATH = path.resolve(__dirname, "../wasm/tle-astrodynamics-upgrades.wasm");

if (!fs.existsSync(TLEUP_WASM_PATH)) {
  throw new Error(`Missing compiled WASM ${TLEUP_WASM_PATH} — run build-tle-upgrades-wasm.mjs first`);
}

export const tleupHost = await loadWasmModule(TLEUP_WASM_PATH);

// Known rigid spherical calibration satellites (exact geometry, orientation-independent Cd ~ 2.20)
export const CALIBRATION_SPHERES = new Map([
  [900, { name: "CALSPHERE 1", amM2Kg: 0.205, cd: 2.20, sigLnB: 0.05 }],
  [902, { name: "CALSPHERE 2", amM2Kg: 0.0205, cd: 2.20, sigLnB: 0.05 }],
  [1512, { name: "RIGIDSPHERE 2", amM2Kg: 0.0268, cd: 2.20, sigLnB: 0.06 }],
  [1520, { name: "CALSPHERE 4A", amM2Kg: 0.0462, cd: 2.20, sigLnB: 0.06 }],
  [5398, { name: "LCS 4", amM2Kg: 0.0282, cd: 2.20, sigLnB: 0.05 }],
  [7646, { name: "STARLETTE", amM2Kg: 0.000957, cd: 2.20, sigLnB: 0.05 }],
  [8820, { name: "LAGEOS 1", amM2Kg: 0.000694, cd: 2.20, sigLnB: 0.05 }],
  [16908, { name: "AJISAI", amM2Kg: 0.00530, cd: 2.20, sigLnB: 0.05 }],
  [22195, { name: "LAGEOS 2", amM2Kg: 0.000697, cd: 2.20, sigLnB: 0.05 }],
  [22824, { name: "STELLA", amM2Kg: 0.000942, cd: 2.20, sigLnB: 0.05 }],
  [27944, { name: "LARETS", amM2Kg: 0.00153, cd: 2.20, sigLnB: 0.05 }],
]);

export function classifySpacecraftBlock(obj, regime = null) {
  const norad = obj?.norad ?? 0;
  if (CALIBRATION_SPHERES.has(norad)) return 0;
  const nm = String(obj?.name || "").toUpperCase();
  if (nm.includes("LAGEOS") || nm.includes("STARLETTE") || nm.includes("AJISAI") || nm.includes("STELLA") || nm.includes("CALSPHERE") || nm.includes("LARETS")) {
    return 0;
  }
  if (nm.includes("NAVSTAR") || nm.includes("GPS")) {
    if (nm.includes("BIII") || nm.includes("GPS III") || norad >= 43873) return 3;
    if (nm.includes("BIIF") || (norad >= 36585 && norad <= 41328)) return 2;
    if (nm.includes("BIIR") || norad < 36585) return 1;
    return 2;
  }
  if (nm.includes("GSAT") || nm.includes("GALILEO")) return 4;
  if (nm.includes("GLONASS")) return 5;
  if (regime === "MEO" && nm.includes("COSMOS")) {
    const last = obj?.tles?.[obj.tles.length - 1];
    if (last && last.n > 2.10 && last.n < 2.16 && last.inc > 63.0 && last.inc < 67.0) return 5;
  }
  if (nm.includes("BEIDOU") || nm.includes("QZS")) return 6;
  if (regime === "GEO" && (!obj?.objectType || obj.objectType === "PAYLOAD")) {
    const last = obj?.tles?.[obj.tles.length - 1];
    if (!last || (last.e < 0.05 && last.inc < 18.0)) return 7;
  }
  return 0;
}

export function cidV1RawSha256Wasm(bytes) {
  const x = tleupHost.instance.exports;
  const pIn = x.tleup_alloc(bytes.length + 8);
  const pOut = x.tleup_alloc(128);
  new Uint8Array(tleupHost.memory.buffer, pIn, bytes.length).set(bytes);
  const n = x.tleup_cid_v1_raw_sha256(pIn, bytes.length, pOut, 128);
  const cid = Buffer.from(tleupHost.memory.buffer, pOut, n).toString("utf8");
  x.tleup_free(pIn);
  x.tleup_free(pOut);
  if (!cid) throw new Error("WASM cid_v1_raw_sha256 failed");
  return cid;
}

export function forecastSpwBartelsWasm({
  obsMjd,
  obsF107,
  obsAp,
  sgarfMjd,
  sgarfF107,
  sgarfAp,
  cutoffMjd,
  gridStartMjd,
  gridCount,
}) {
  const x = tleupHost.instance.exports;
  const nObs = obsMjd.length;
  const nSg = sgarfMjd.length;
  const pObsM = x.tleup_alloc(Math.max(8, nObs * 4));
  const pObsF = x.tleup_alloc(Math.max(8, nObs * 8));
  const pObsA = x.tleup_alloc(Math.max(8, nObs * 8));
  const pSgM = x.tleup_alloc(Math.max(8, nSg * 4));
  const pSgF = x.tleup_alloc(Math.max(8, nSg * 8));
  const pSgA = x.tleup_alloc(Math.max(8, nSg * 8));
  const pOutF = x.tleup_alloc(gridCount * 8);
  const pOutC = x.tleup_alloc(gridCount * 8);
  const pOutA = x.tleup_alloc(gridCount * 8);
  const pOutP = x.tleup_alloc(gridCount * 4);

  if (nObs > 0) {
    new Int32Array(tleupHost.memory.buffer, pObsM, nObs).set(obsMjd);
    new Float64Array(tleupHost.memory.buffer, pObsF, nObs).set(obsF107);
    new Float64Array(tleupHost.memory.buffer, pObsA, nObs).set(obsAp);
  }
  if (nSg > 0) {
    new Int32Array(tleupHost.memory.buffer, pSgM, nSg).set(sgarfMjd);
    new Float64Array(tleupHost.memory.buffer, pSgF, nSg).set(sgarfF107);
    new Float64Array(tleupHost.memory.buffer, pSgA, nSg).set(sgarfAp);
  }

  const rc = x.tleup_forecast_spw_bartels(
    pObsM, pObsF, pObsA, nObs,
    pSgM, pSgF, pSgA, nSg,
    cutoffMjd, gridStartMjd, gridCount,
    pOutF, pOutC, pOutA, pOutP
  );
  const outF107 = Float64Array.from(new Float64Array(tleupHost.memory.buffer, pOutF, gridCount));
  const outF107C81 = Float64Array.from(new Float64Array(tleupHost.memory.buffer, pOutC, gridCount));
  const outAp = Float64Array.from(new Float64Array(tleupHost.memory.buffer, pOutA, gridCount));
  const outIsPrd = Int32Array.from(new Int32Array(tleupHost.memory.buffer, pOutP, gridCount));

  x.tleup_free(pObsM); x.tleup_free(pObsF); x.tleup_free(pObsA);
  x.tleup_free(pSgM); x.tleup_free(pSgF); x.tleup_free(pSgA);
  x.tleup_free(pOutF); x.tleup_free(pOutC); x.tleup_free(pOutA); x.tleup_free(pOutP);
  if (rc !== 0) throw new Error(`tleup_forecast_spw_bartels failed (${rc})`);
  return { outF107, outF107C81, outAp, outIsPrd };
}

export function setSpwTableWasm(spw) {
  const x = tleupHost.instance.exports;
  const srcRows = spw.fullRows || spw.rows;
  const N = srcRows.length;
  const pM = x.tleup_alloc(Math.max(8, N * 4));
  const pF = x.tleup_alloc(Math.max(8, N * 8));
  const pC = x.tleup_alloc(Math.max(8, N * 8));
  const pA = x.tleup_alloc(Math.max(8, N * 8));
  const mjdArr = new Int32Array(N);
  const fArr = new Float64Array(N);
  const cArr = new Float64Array(N);
  const aArr = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const r = srcRows[i];
    mjdArr[i] = Math.round(Date.parse(`${r.date}T00:00:00Z`) / 86400000) + 40587;
    fArr[i] = r.f107;
    cArr[i] = r.f107Center81;
    aArr[i] = r.ap;
  }
  new Int32Array(tleupHost.memory.buffer, pM, N).set(mjdArr);
  new Float64Array(tleupHost.memory.buffer, pF, N).set(fArr);
  new Float64Array(tleupHost.memory.buffer, pC, N).set(cArr);
  new Float64Array(tleupHost.memory.buffer, pA, N).set(aArr);
  x.tleup_set_spw_table(pM, pF, pC, pA, N);
  x.tleup_free(pM); x.tleup_free(pF); x.tleup_free(pC); x.tleup_free(pA);
}

export function computeMsisArcLnbWasm(arcs11Float64, nArcs) {
  const x = tleupHost.instance.exports;
  if (nArcs <= 0) return { outLnb: new Float64Array(0), outWeight: new Float64Array(0), validCount: 0 };
  const pIn = x.tleup_alloc(nArcs * 11 * 8);
  const pLnb = x.tleup_alloc(nArcs * 8);
  const pW = x.tleup_alloc(nArcs * 8);
  new Float64Array(tleupHost.memory.buffer, pIn, nArcs * 11).set(arcs11Float64);
  const validCount = x.tleup_compute_msis_arc_lnb(pIn, nArcs, pLnb, pW);
  const outLnb = Float64Array.from(new Float64Array(tleupHost.memory.buffer, pLnb, nArcs));
  const outWeight = Float64Array.from(new Float64Array(tleupHost.memory.buffer, pW, nArcs));
  x.tleup_free(pIn); x.tleup_free(pLnb); x.tleup_free(pW);
  return { outLnb, outWeight, validCount };
}

export function solveFleetDcaWasm({
  arcs7Float64,
  nArcs,
  issueMs,
  stepHours = 12.0,
  historyDays = 28.0,
  forecastTauHours = 96.0,
  forecastSpanHours = 240.0,
  globalLevelPriorSigma = 0.25,
}) {
  const x = tleupHost.instance.exports;
  const maxNodes = 256;
  const pIn = x.tleup_alloc(Math.max(8, nArcs * 7 * 8));
  const pMs = x.tleup_alloc(maxNodes * 8);
  const pS = x.tleup_alloc(maxNodes * 8);
  const pSt = x.tleup_alloc(6 * 8);
  new Float64Array(tleupHost.memory.buffer, pIn, nArcs * 7).set(arcs7Float64);
  const nOut = x.tleup_solve_fleet_dca(
    pIn, nArcs, issueMs, stepHours, historyDays, forecastTauHours, forecastSpanHours,
    globalLevelPriorSigma, pMs, pS, maxNodes, pSt
  );
  const nodeMs = nOut > 0 ? Float64Array.from(new Float64Array(tleupHost.memory.buffer, pMs, nOut)) : null;
  const nodeS = nOut > 0 ? Float64Array.from(new Float64Array(tleupHost.memory.buffer, pS, nOut)) : null;
  const stats = Float64Array.from(new Float64Array(tleupHost.memory.buffer, pSt, 6));
  x.tleup_free(pIn); x.tleup_free(pMs); x.tleup_free(pS); x.tleup_free(pSt);
  if (nOut <= 0) return null;
  return {
    nodeTimesMs: Array.from(nodeMs, (v) => BigInt(Math.round(v))),
    nodeTimesMsNum: Array.from(nodeMs, (v) => Math.round(v)),
    nodeLogScale: Array.from(nodeS),
    converged: stats[0] > 0.5,
    iterations: Math.round(stats[1]),
    arcsUsed: Math.round(stats[2]),
    satCount: Math.round(stats[3]),
    postfitRms: stats[4],
    sAtIssue: stats[5],
  };
}

/**
 * Packs a canonical SDS $DCL FlatBuffer (`dclCorrectionForm.LogDensityNodes`) and computes its CIDv1!
 */
export function packFleetDclRecord(dcaSol, issueMs) {
  const pvnBytes = buildPvnBytes({
    sourceId: "spacetrack-gp-leo-fleet-dca",
    originator: "18th SDS / SDN-AP",
    licenseId: "Space-Track User Agreement; GFZ Kp/F10.7 CC-BY-4.0; NOAA SWPC Public Domain",
    lineage: "Fleet common-mode NRLMSISE-00 log-density calibration s(t) derived from passive LEO GP decay arcs",
  });
  const pvnT = PVN.getRootAsPVN(new flatbuffers.ByteBuffer(pvnBytes)).unpack();

  // Settings TO_MS marks the last solve epoch (<= issueMs); forecast nodes extend past TO_MS
  let lastSolveMs = Math.round(issueMs);
  for (const ms of dcaSol.nodeTimesMsNum) {
    if (ms <= issueMs + 1000) lastSolveMs = ms;
  }

  const dclT = Object.assign(new DCL_NS.DCLT(), {
    ID: `tle-fleet-dca-nrlmsise00-${Math.round(issueMs)}`,
    CREATED_AT_MS: BigInt(Math.round(issueMs)),
    PRODUCER: "com.spacedatanetwork.sdn-ap@0.6.5",
    PRODUCT: DCL_NS.dclProduct.DensityCalibration,
    STATUS: DCL_NS.dclStatus.Solved,
    ATMOSPHERE: Object.assign(new DCL_NS.ATMT(), {
      MODEL: DCL_NS.AtmosphericModelFamily.NRLMSIS00E,
      YEAR: 2000,
    }),
    SETTINGS: Object.assign(new DCL_NS.dclSettingsT(), {
      FROM_MS: dcaSol.nodeTimesMs[0],
      TO_MS: BigInt(lastSolveMs),
    }),
    CORRECTION: Object.assign(new DCL_NS.dclCorrectionT(), {
      FORM: DCL_NS.dclCorrectionForm.LogDensityNodes,
      NODE_TIMES_MS: dcaSol.nodeTimesMs,
      NODE_LOG_DENSITY_SCALE_DIMENSIONLESS: dcaSol.nodeLogScale,
    }),
    FIT: Object.assign(new DCL_NS.dclFitStatisticsT(), {
      ITERATIONS: dcaSol.iterations,
      CONVERGED: dcaSol.converged,
      OBSERVATIONS: dcaSol.arcsUsed,
      USED: dcaSol.arcsUsed,
      PARAMETERS: dcaSol.nodeTimesMs.length,
      POSTFIT_RMS: dcaSol.postfitRms,
    }),
    PROVENANCE: pvnT,
  });

  const b = new flatbuffers.Builder(8192);
  DCL_NS.DCL.finishDCLBuffer(b, dclT.pack(b));
  const dclBytes = b.asUint8Array().slice();
  const rootDcl = DCL_NS.DCL.getRootAsDCL(new flatbuffers.ByteBuffer(dclBytes));
  if (!DCL_NS.DCL.bufferHasIdentifier(new flatbuffers.ByteBuffer(dclBytes)) || !rootDcl.ID()) {
    throw new Error("Invalid $DCL FlatBuffer emitted");
  }
  const cid = cidV1RawSha256Wasm(dclBytes);
  return { dclBytes, cid, ...dcaSol };
}

/**
 * Solves causal fleet-wide TLE $DCL LogDensityNodes up to `cutoffD70` from passive LEO objects,
 * AND optionally tracks multi-month rolling Kalman BTERM & AGOM posteriors across `targetObjects`!
 */
export function buildCausalDcaAndRollingPriors({
  catalogObjects, // Map or Array of { norad, name, objectType, tles }
  targetObjects = null, // optional subset Map/Array for rolling BTERM/AGOM posteriors (defaults to catalogObjects)
  physicalPriors, // Map<norad, { areaToMassM2Kg, rcsSize }>
  spw,
  cutoffD70,
  stepHours = 12.0,
  historyDays = 28.0,
  forecastTauHours = 96.0,
  forecastSpanHours = 240.0,
  globalLevelPriorSigma = 0.25,
  maxCalibrationSats = 450,
}) {
  setSpwTableWasm(spw);
  const objs = catalogObjects instanceof Map ? [...catalogObjects.values()] : catalogObjects;
  const issueMs = cutoffD70 * 86400000;
  const dcaStartD70 = cutoffD70 - (historyDays + 2.0);

  // 1. Select passive non-maneuvering LEO calibration objects (310..840 km):
  //    Always include all CALIBRATION_SPHERES + debris/rocket-bodies + passive payloads with clean monotonic decay!
  const calCandidates = [];
  for (const obj of objs) {
    const tles = obj.tles.filter((t) => t.d70 >= dcaStartD70 && t.d70 <= cutoffD70 + 1e-9);
    if (tles.length < 6) continue;
    const last = tles[tles.length - 1];
    const { hpKm } = classifyOrbitRegime(last.n, last.e);
    if (hpKm < 310 || hpKm > 840 || last.e > 0.04) continue;

    // Reject active thrusters (check no upward SMA jump over >= 1.0d spans)
    let upwardJumps = 0;
    let validPairs = 0;
    const minDt = hpKm < 550 ? 0.8 : hpKm < 700 ? 1.8 : 4.0;
    for (let i = 0; i < tles.length - 1; i++) {
      let j = i + 1;
      while (j < tles.length - 1 && tles[j].d70 - tles[i].d70 < minDt) j++;
      const dt = tles[j].d70 - tles[i].d70;
      if (dt < minDt || dt > 16.0) continue;
      validPairs++;
      if (tles[j].n < tles[i].n - 1.5e-5) upwardJumps++; // mean motion dropped => orbit raised!
    }
    if (validPairs < 4 || upwardJumps > 0) continue;

    const isSphere = CALIBRATION_SPHERES.has(obj.norad);
    const isPassiveType = obj.objectType === "DEBRIS" || obj.objectType === "ROCKET BODY";
    const phys = physicalPriors?.get(obj.norad);
    const hasDiscos = !!(phys?.areaToMassM2Kg > 0);
    const priority = isSphere ? 1000 : (isPassiveType && hasDiscos ? 500 : isPassiveType ? 300 : hasDiscos ? 150 : 50);
    calCandidates.push({ obj, tles, hpKm, isSphere, phys, priority, validPairs });
  }

  calCandidates.sort((a, b) => (b.priority - a.priority) || (b.validPairs - a.validPairs));
  const selectedCal = calCandidates.slice(0, maxCalibrationSats);

  // Batch-evaluate NRLMSISE-00 unit-BTERM decay across all selected calibration TLE pairs in ONE WASM call!
  const rawMeta = [];
  const raw11 = [];
  for (const c of selectedCal) {
    const { obj, tles, hpKm, isSphere, phys } = c;
    let priorLnB = NaN, priorSig = 0.0;
    if (isSphere) {
      const sp = CALIBRATION_SPHERES.get(obj.norad);
      priorLnB = Math.log(sp.cd * sp.amM2Kg);
      priorSig = sp.sigLnB;
    } else if (phys?.areaToMassM2Kg > 0 && (obj.objectType === "ROCKET BODY" || obj.objectType === "PAYLOAD")) {
      priorLnB = Math.log(2.22 * phys.areaToMassM2Kg);
      priorSig = 0.22;
    }
    const minDt = hpKm < 550 ? 0.8 : hpKm < 700 ? 2.0 : 4.5;
    let nextStart = 0;
    while (nextStart < tles.length - 1) {
      let j = nextStart + 1;
      while (j < tles.length - 1 && tles[j].d70 - tles[nextStart].d70 < minDt) j++;
      const ta = tles[nextStart], tb = tles[j];
      const dt = tb.d70 - ta.d70;
      if (dt >= minDt && dt <= 16.0) {
        rawMeta.push({ norad: obj.norad, startMs: ta.d70 * 86400000, endMs: tb.d70 * 86400000, priorLnB, priorSig });
        raw11.push(ta.d70, ta.n, ta.e, ta.inc, ta.raan, ta.argp, tb.d70, tb.n, tb.e, tb.inc, tb.raan);
      }
      // Step forward non-overlapping so adjacent pairs don't double-count the same GP state noise!
      nextStart = j;
    }
  }

  let dcaRecord = null;
  if (rawMeta.length >= 20) {
    const { outLnb, outWeight } = computeMsisArcLnbWasm(new Float64Array(raw11), rawMeta.length);
    const dca7 = [];
    for (let j = 0; j < rawMeta.length; j++) {
      if (!Number.isFinite(outLnb[j]) || !(outWeight[j] > 0)) continue;
      const m = rawMeta[j];
      dca7.push(m.norad, m.startMs, m.endMs, outLnb[j], m.priorLnB, m.priorSig, outWeight[j]);
    }
    const nDca = dca7.length / 7;
    if (nDca >= 16) {
      const sol = solveFleetDcaWasm({
        arcs7Float64: new Float64Array(dca7),
        nArcs: nDca,
        issueMs,
        stepHours,
        historyDays,
        forecastTauHours,
        forecastSpanHours,
        globalLevelPriorSigma,
      });
      if (sol) {
        dcaRecord = packFleetDclRecord(sol, issueMs);
      }
    }
  }

  // 2. Compute multi-month rolling Kalman BTERM & AGOM posteriors + hierarchical empirical-Bayes priors on targetObjects
  const tgtList = targetObjects
    ? (targetObjects instanceof Map ? [...targetObjects.values()] : targetObjects)
    : objs;

  // Build hierarchical empirical-Bayes bucket priors from DISCOS + median B* across catalog objects
  // Bucket key: `${objType}:${rcsSize}:${altBand}`
  const bucketVals = new Map();
  for (const obj of objs) {
    const last = obj.tles[obj.tles.length - 1];
    if (!last) continue;
    const { hpKm } = classifyOrbitRegime(last.n, last.e);
    if (hpKm > 1050) continue;
    const phys = physicalPriors?.get(obj.norad);
    let lnEst = null;
    if (phys?.areaToMassM2Kg > 0) {
      lnEst = Math.log(2.22 * phys.areaToMassM2Kg);
    } else if (last.bstar > 2e-5 && last.bstar < 0.1 && hpKm < 700) {
      lnEst = Math.log(last.bstar * 12.741621);
    }
    if (lnEst !== null && Number.isFinite(lnEst)) {
      const altBand = Math.floor(hpKm / 150);
      const key = `${obj.objectType || "UNK"}:${phys?.rcsSize || "UNK"}:${altBand}`;
      let arr = bucketVals.get(key);
      if (!arr) { arr = []; bucketVals.set(key, arr); }
      arr.push(lnEst);
    }
  }
  const hierPriors = new Map();
  for (const [key, arr] of bucketVals) {
    if (arr.length < 5) continue;
    arr.sort((a, b) => a - b);
    const med = arr[Math.floor(arr.length * 0.5)];
    const mad = arr.map((v) => Math.abs(v - med)).sort((a, b) => a - b)[Math.floor(arr.length * 0.5)];
    hierPriors.set(key, { meanLnB: med, sigLnB: Math.max(0.22, Math.min(0.55, 1.4826 * mad)) });
  }

  const rollingStartD70 = cutoffD70 - 135.0; // up to 4.5 months of causal GP history
  const leoArc11 = [];
  const leoSliceByNorad = new Map();

  for (const obj of tgtList) {
    const hist = obj.tles.filter((t) => t.d70 >= rollingStartD70 && t.d70 <= cutoffD70 + 1e-9);
    if (hist.length < 3) continue;
    const last = hist[hist.length - 1];
    const { hpKm } = classifyOrbitRegime(last.n, last.e);
    if (hpKm < 950.0) {
      const minDt = hpKm < 550 ? 1.2 : hpKm < 700 ? 2.5 : 5.0;
      const startIdx = leoArc11.length / 11;
      const mids = [];
      let cur = 0;
      while (cur < hist.length - 1) {
        let nxt = cur + 1;
        while (nxt < hist.length - 1 && hist[nxt].d70 - hist[cur].d70 < minDt) nxt++;
        const ta = hist[cur], tb = hist[nxt];
        const dt = tb.d70 - ta.d70;
        if (dt >= minDt * 0.75 && dt <= 18.0) {
          leoArc11.push(ta.d70, ta.n, ta.e, ta.inc, ta.raan, ta.argp, tb.d70, tb.n, tb.e, tb.inc, tb.raan);
          mids.push(0.5 * (ta.d70 + tb.d70));
        }
        cur = nxt;
      }
      if (mids.length > 0) {
        leoSliceByNorad.set(obj.norad, { startIdx, count: mids.length, mids, hpKm, obj });
      }
    }
  }

  const rollingPriors = new Map();
  const x = tleupHost.instance.exports;

  if (leoArc11.length > 0) {
    const nTot = leoArc11.length / 11;
    const { outLnb, outWeight } = computeMsisArcLnbWasm(new Float64Array(leoArc11), nTot);
    const pSeg = x.tleup_alloc(128 * 3 * 8);
    const pPost = x.tleup_alloc(4 * 8);

    for (const [norad, info] of leoSliceByNorad) {
      const { startIdx, count, mids, hpKm, obj } = info;
      const phys = physicalPriors?.get(norad);
      const sp = CALIBRATION_SPHERES.get(norad);
      const altBand = Math.floor(hpKm / 150);
      const hier = hierPriors.get(`${obj.objectType || "UNK"}:${phys?.rcsSize || "UNK"}:${altBand}`);

      let baseLnB, baseSig;
      if (sp) {
        baseLnB = Math.log(sp.cd * sp.amM2Kg);
        baseSig = sp.sigLnB;
      } else if (phys?.areaToMassM2Kg > 0) {
        baseLnB = Math.log(2.25 * phys.areaToMassM2Kg);
        baseSig = 0.16;
      } else if (hier) {
        baseLnB = hier.meanLnB;
        baseSig = hier.sigLnB;
      } else {
        baseLnB = Math.log(hpKm < 850 ? 0.012 : 0.008);
        baseSig = 0.45;
      }

      const mCap = Math.min(128, count);
      const segView = new Float64Array(tleupHost.memory.buffer, pSeg, mCap * 3);
      const off = count - mCap;
      for (let k = 0; k < mCap; k++) {
        const lnbVal = outLnb[startIdx + off + k];
        let wVal = outWeight[startIdx + off + k];
        // Reject station-keeping / orbit-maintenance burn pairs where implied BTERM deviates > 2.3x from known DISCOS A/m
        if ((sp || phys?.areaToMassM2Kg > 0) && Number.isFinite(lnbVal) && Math.abs(lnbVal - baseLnB) > 0.85) {
          wVal = 0.0;
        }
        segView[k * 3 + 0] = mids[off + k];
        segView[k * 3 + 1] = lnbVal;
        segView[k * 3 + 2] = wVal;
      }
      x.tleup_track_rolling_ballistics(pSeg, mCap, baseLnB, baseSig, 0.015, dcaRecord ? 1 : 0, pPost);
      const post = new Float64Array(tleupHost.memory.buffer, pPost, 4);
      rollingPriors.set(norad, {
        btermPost: post[3],
        sigLnBPost: post[1],
        btermSegsUsed: Math.round(post[2]),
      });
    }
    x.tleup_free(pSeg);
    x.tleup_free(pPost);
  }

  // Also track multi-month rolling AGOM on deep-space (MEO / HEO / GEO) targetObjects
  const pTle6 = x.tleup_alloc(256 * 6 * 8);
  const pPostA = x.tleup_alloc(4 * 8);
  for (const obj of tgtList) {
    const hist = obj.tles.filter((t) => t.d70 >= rollingStartD70 && t.d70 <= cutoffD70 + 1e-9);
    if (hist.length < 8) continue;
    const last = hist[hist.length - 1];
    const { regime, hpKm } = classifyOrbitRegime(last.n, last.e);
    if (hpKm < 1200.0) continue;

    const phys = physicalPriors?.get(obj.norad);
    const sp = CALIBRATION_SPHERES.get(obj.norad);
    const blockCode = classifySpacecraftBlock(obj, regime);
    const defaultCr = regime === "MEO" ? 1.32 : 1.30;
    const defaultAgom = regime === "MEO" ? 0.0065 : 0.012;
    const baseAgom = sp
      ? 1.13 * sp.amM2Kg
      : phys?.areaToMassM2Kg > 0
      ? Math.min(2.0, Math.max(1e-5, defaultCr * phys.areaToMassM2Kg))
      : defaultAgom;
    const baseSigA = sp ? 0.04 : phys?.areaToMassM2Kg > 0 ? 0.20 : 0.38;

    const step = hist.length > 256 ? Math.ceil(hist.length / 256) : 1;
    const sub = [];
    for (let i = 0; i < hist.length && sub.length < 256; i += step) sub.push(hist[i]);
    const view = new Float64Array(tleupHost.memory.buffer, pTle6, sub.length * 6);
    for (let i = 0; i < sub.length; i++) {
      const t = sub[i];
      view[i * 6 + 0] = t.d70;
      view[i * 6 + 1] = t.n;
      view[i * 6 + 2] = t.e;
      view[i * 6 + 3] = t.inc;
      view[i * 6 + 4] = t.raan;
      view[i * 6 + 5] = t.argp;
    }
    x.tleup_track_rolling_agom(pTle6, sub.length, blockCode, Math.log(baseAgom), baseSigA, pPostA);
    const post = new Float64Array(tleupHost.memory.buffer, pPostA, 4);
    const prev = rollingPriors.get(obj.norad) || {};
    rollingPriors.set(obj.norad, {
      ...prev,
      agomPost: post[3],
      sigLnAgomPost: post[1],
      agomPairsUsed: Math.round(post[2]),
      blockCode,
    });
  }
  x.tleup_free(pTle6);
  x.tleup_free(pPostA);

  return { dcaRecord, rollingPriors };
}

export function boxwingForecastRatioWasm({ d70Ref, horizonDays, aKm, e, incDeg, raanDeg, blockCode }) {
  if (!blockCode || blockCode <= 0) return 1.0;
  return tleupHost.instance.exports.tleup_boxwing_forecast_ratio(
    d70Ref, horizonDays, aKm, e, incDeg, raanDeg, blockCode
  );
}

/**
 * Invokes Kernel 4 (`tleup_dealias_and_solve_gls`) in C++17 WASM.
 */
export function dealiasAndSolveGlsWasm({
  m,
  np,
  d70Arr,
  tgtRvGcrf, // Float64Array(6 * m)
  spBiasRvGcrf = null, // optional Float64Array(6 * m)
  nomRvGcrf, // Float64Array(6 * m)
  jacRvGcrf, // Float64Array(np * 6 * m)
  sigRtn, // Float64Array(6 * m)
  ar1TauDays = null, // Float64Array(6) or Array(6)
  ar1Eta = null, // Float64Array(6) or Array(6)
  orbParams, // [d70Ref, aKm, e, incDeg, raanDeg, agomCurr, huberK, iterIdx]
  blockCode = 0,
  enableTides = 0,
  enableBoxwing = 0,
  priorPrec, // Float64Array(np)
  priorDiff, // Float64Array(np)
}) {
  const x = tleupHost.instance.exports;
  const pD70 = x.tleup_alloc(m * 8);
  const pTgt = x.tleup_alloc(m * 6 * 8);
  const pSp = spBiasRvGcrf ? x.tleup_alloc(m * 6 * 8) : 0;
  const pNom = x.tleup_alloc(m * 6 * 8);
  const pJac = x.tleup_alloc(np * m * 6 * 8);
  const pSig = x.tleup_alloc(m * 6 * 8);
  const pTau = x.tleup_alloc(6 * 8);
  const pEta = x.tleup_alloc(6 * 8);
  const pOrb = x.tleup_alloc(8 * 8);
  const pFlg = x.tleup_alloc(3 * 4);
  const pPrP = x.tleup_alloc(np * 8);
  const pPrD = x.tleup_alloc(np * 8);
  const pDx = x.tleup_alloc(np * 8);
  const pInv = x.tleup_alloc(np * np * 8);
  const pUvw = x.tleup_alloc(m * 3 * 8);
  const pChi = x.tleup_alloc(2 * 8);

  new Float64Array(tleupHost.memory.buffer, pD70, m).set(d70Arr);
  new Float64Array(tleupHost.memory.buffer, pTgt, m * 6).set(tgtRvGcrf);
  if (pSp) new Float64Array(tleupHost.memory.buffer, pSp, m * 6).set(spBiasRvGcrf);
  new Float64Array(tleupHost.memory.buffer, pNom, m * 6).set(nomRvGcrf);
  new Float64Array(tleupHost.memory.buffer, pJac, np * m * 6).set(jacRvGcrf);
  new Float64Array(tleupHost.memory.buffer, pSig, m * 6).set(sigRtn);
  new Float64Array(tleupHost.memory.buffer, pTau, 6).set(ar1TauDays || [0, 0, 0, 0, 0, 0]);
  new Float64Array(tleupHost.memory.buffer, pEta, 6).set(ar1Eta || [0, 0, 0, 0, 0, 0]);
  new Float64Array(tleupHost.memory.buffer, pOrb, 8).set(orbParams);
  new Int32Array(tleupHost.memory.buffer, pFlg, 3).set([blockCode, enableTides ? 1 : 0, enableBoxwing ? 1 : 0]);
  new Float64Array(tleupHost.memory.buffer, pPrP, np).set(priorPrec);
  new Float64Array(tleupHost.memory.buffer, pPrD, np).set(priorDiff);

  const rc = x.tleup_dealias_and_solve_gls(
    m, np, pD70, pTgt, pSp, pNom, pJac, pSig, pTau, pEta, pOrb, pFlg, pPrP, pPrD, pDx, pInv, pUvw, pChi
  );

  let out = null;
  if (rc === 0) {
    const dx = Float64Array.from(new Float64Array(tleupHost.memory.buffer, pDx, np));
    const inv = Float64Array.from(new Float64Array(tleupHost.memory.buffer, pInv, np * np));
    const uvwRaw = Float64Array.from(new Float64Array(tleupHost.memory.buffer, pUvw, m * 3));
    const chi2 = Float64Array.from(new Float64Array(tleupHost.memory.buffer, pChi, 2));
    const postFitUvwPosKm = new Array(m);
    for (let k = 0; k < m; k++) {
      postFitUvwPosKm[k] = [uvwRaw[k * 3], uvwRaw[k * 3 + 1], uvwRaw[k * 3 + 2]];
    }
    out = { dx, inv, postFitUvwPosKm, chi2Sum: chi2[0], dofCount: Math.round(chi2[1]) };
  }

  x.tleup_free(pD70); x.tleup_free(pTgt); if (pSp) x.tleup_free(pSp);
  x.tleup_free(pNom); x.tleup_free(pJac); x.tleup_free(pSig);
  x.tleup_free(pTau); x.tleup_free(pEta); x.tleup_free(pOrb); x.tleup_free(pFlg);
  x.tleup_free(pPrP); x.tleup_free(pPrD); x.tleup_free(pDx); x.tleup_free(pInv);
  x.tleup_free(pUvw); x.tleup_free(pChi);
  return out;
}
