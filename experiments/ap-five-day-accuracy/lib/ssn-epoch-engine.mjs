import fs from "node:fs";
import path from "node:path";
import * as flatbuffers from "flatbuffers";
import * as A from "spacedatastandards.org/lib/js/ACW/main.js";
import * as PCF from "spacedatastandards.org/lib/js/PCF/main.js";
import * as P from "spacedatastandards.org/lib/js/PRW/main.js";
import { OCM, OCMT } from "spacedatastandards.org/lib/js/OCM/OCM.js";
import { HeaderT } from "spacedatastandards.org/lib/js/OCM/Header.js";
import { MetadataT } from "spacedatastandards.org/lib/js/OCM/Metadata.js";
import { OCMMeanElementsT } from "spacedatastandards.org/lib/js/OCM/OCMMeanElements.js";
import { PerturbationsT } from "spacedatastandards.org/lib/js/OCM/Perturbations.js";
import { OrbitDeterminationT } from "spacedatastandards.org/lib/js/OCM/OrbitDetermination.js";
import { OCMDynamicParameterT } from "spacedatastandards.org/lib/js/OCM/OCMDynamicParameter.js";
import { OCMFitStatisticsT } from "spacedatastandards.org/lib/js/OCM/OCMFitStatistics.js";
import { OCMCovariancePropagationT } from "spacedatastandards.org/lib/js/OCM/OCMCovariancePropagation.js";
import { CVRT } from "spacedatastandards.org/lib/js/OCM/CVR.js";
import { covarianceOrdering } from "spacedatastandards.org/lib/js/OCM/covarianceOrdering.js";
import { covarianceRule } from "spacedatastandards.org/lib/js/OCM/covarianceRule.js";
import { covarianceCalibration } from "spacedatastandards.org/lib/js/OCM/covarianceCalibration.js";
import { estimatorCategory } from "spacedatastandards.org/lib/js/OCM/estimatorCategory.js";
import { meanElementSource } from "spacedatastandards.org/lib/js/OCM/meanElementSource.js";
import { pcfDensityCorrection } from "spacedatastandards.org/lib/js/OCM/pcfDensityCorrection.js";
import { prwDynamicParameter } from "spacedatastandards.org/lib/js/OCM/prwDynamicParameter.js";
import { ATMT } from "spacedatastandards.org/lib/js/ATM/ATM.js";
import { AtmosphericModelFamily } from "spacedatastandards.org/lib/js/ATM/AtmosphericModelFamily.js";
import { SPW, SPWT } from "spacedatastandards.org/lib/js/SPW/SPW.js";
import { F107DataType } from "spacedatastandards.org/lib/js/SPW/F107DataType.js";
import { RFMT } from "spacedatastandards.org/lib/js/RFM/RFM.js";
import { CustomFrameWrapperT } from "spacedatastandards.org/lib/js/RFM/CustomFrameWrapper.js";
import { CustomFrame } from "spacedatastandards.org/lib/js/RFM/CustomFrame.js";
import { RFMUnion } from "spacedatastandards.org/lib/js/RFM/RFMUnion.js";
import { pcfWeatherSource } from "spacedatastandards.org/lib/js/PCF/pcfWeatherSource.js";
import { OEM, OEMT, ephemerisDataBlockT, ephemerisDataLineT, CATT, timingStandard } from "spacedatastandards.org/lib/js/OEM/main.js";
import { OMM, OMMT } from "spacedatastandards.org/lib/js/OMM/main.js";
import { MNV } from "spacedatastandards.org/lib/js/MNV/main.js";
import { PVN } from "spacedatastandards.org/lib/js/PVN/main.js";

import { TYPES } from "./wasm-hosts.mjs";
import { isoFromJd } from "./gp-history-loader.mjs";
import { classifyOrbitRegime, vecToUvw } from "./crlb-covariance.mjs";
import { buildPvnBytes } from "./hold-gate.mjs";
import { classifySpacecraftBlock, boxwingForecastRatioWasm, dealiasAndSolveGlsWasm } from "./tle-upgrades-host.mjs";

const TWO_PI = 2 * Math.PI;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// Force scalar defaults ONLY on SPW fields whose valid values include 0 (OBS=0, AP_AVG=0), never on table offsets!
const origAddF107Type = SPW.addF107DataType;
SPW.addF107DataType = (b, v) => { const w = b.force_defaults; b.forceDefaults(true); origAddF107Type(b, v); b.forceDefaults(w); };
const origAddApAvg = SPW.addApAvg;
SPW.addApAvg = (b, v) => { const w = b.force_defaults; b.forceDefaults(true); origAddApAvg(b, v); b.forceDefaults(w); };

// SPEC 12.5 exact AP process-noise constants from propagator/sdn-ap/src/covariance.inc
const K_DRAG_REGIME_KM = 2500.0;
const K_NOISE_AP = [
  // [0] DRAG (hp < 2500 km)
  { s_e: 1.8579913326733934e-7, s_i: 1.12761105007012e-6, s_l: 7.647194501793458e-7, c: 0.112126311682426, k_F: 1.5127596877626373 },
  // [1] ABOVE (hp >= 2500 km)
  { s_e: 9.696153866117182e-7, s_i: 8.153112791954473e-7, s_l: 4.753573962018311e-6, c: 0.0, k_F: 1.0 },
];

// Real SSN Phased-Array Radar & GEODSS Optical Network (Exa Research #1, Johnson 2022)
export const SSN_SENSORS = [
  { id: "EGLIN", kind: "RADAR", lat: 30.5724, lon: -86.2148, altM: 45, minElDeg: 3 },
  { id: "BEALE", kind: "RADAR", lat: 39.1361, lon: -121.3511, altM: 113, minElDeg: 3 },
  { id: "CAVALIER", kind: "RADAR", lat: 48.7244, lon: -97.8997, altM: 350, minElDeg: 3 },
  { id: "CAPE_COD", kind: "RADAR", lat: 41.7522, lon: -70.5381, altM: 80, minElDeg: 3 },
  { id: "CLEAR", kind: "RADAR", lat: 64.2906, lon: -149.1869, altM: 175, minElDeg: 3 },
  { id: "THULE", kind: "RADAR", lat: 76.5703, lon: -68.2992, altM: 250, minElDeg: 3 },
  { id: "FYLINGDALES", kind: "RADAR", lat: 54.3617, lon: -0.6700, altM: 260, minElDeg: 3 },
  { id: "COBRA_DANE", kind: "RADAR", lat: 52.7372, lon: 174.0919, altM: 60, minElDeg: 3 },
  { id: "GLOBUS_II", kind: "RADAR", lat: 70.3671, lon: 31.1271, altM: 70, minElDeg: 3 },
  { id: "KWAJALEIN_SF", kind: "RADAR", lat: 8.7230, lon: 167.7320, altM: 15, minElDeg: 5 },
  { id: "MILLSTONE", kind: "RADAR", lat: 42.6175, lon: -71.4911, altM: 131, minElDeg: 5 },
  { id: "ASCENSION", kind: "RADAR", lat: -7.9694, lon: -14.3939, altM: 100, minElDeg: 5 },
  { id: "LEARMONTH", kind: "RADAR", lat: -22.2389, lon: 114.0889, altM: 30, minElDeg: 5 },
  { id: "GEODSS_SOCORRO", kind: "OPTICAL", lat: 33.8172, lon: -106.6599, altM: 1511, minElDeg: 15 },
  { id: "GEODSS_MAUI", kind: "OPTICAL", lat: 20.7083, lon: -156.2572, altM: 3058, minElDeg: 15 },
  { id: "GEODSS_DIEGO", kind: "OPTICAL", lat: -7.4117, lon: 72.4522, altM: 10, minElDeg: 15 },
];

const SSN_GROUND_STATIONS = SSN_SENSORS.map((st) =>
  Object.assign(new A.ACWGroundStationT(), {
    STATION_ID: st.id,
    NAME: st.id,
    LATITUDE_RAD: st.lat * DEG2RAD,
    LONGITUDE_RAD: st.lon * DEG2RAD,
    ALTITUDE_M: st.altM,
    MIN_ELEVATION_RAD: st.minElDeg * DEG2RAD,
    CHANNEL_CAPACITY: 1,
  })
);
const OPTICAL_IDS = new Set(SSN_SENSORS.filter((s) => s.kind === "OPTICAL").map((s) => s.id));

/**
 * Calibrated empirical 1-sigma RTN position (km) & velocity (km/s) noise floors at t = t_epoch,
 * derived directly from phase2-ssn-epoch-probe.mjs (2,192 real Oct-Nov 2026 TLE epochs vs precision GCRF truth).
 */
export function getOwnEpochNoiseSigmas(regime, ssnClass) {
  // Base P68 RTN position (m) and velocity (mm/s) by regime
  let posM, velMmS;
  switch (regime) {
    case "LOW_LEO":
      posM = [135.0, 650.0, 120.0];
      velMmS = [750.0, 185.0, 270.0];
      break;
    case "MID_LEO":
      posM = [116.7, 518.2, 104.1];
      velMmS = [624.4, 151.5, 242.0];
      break;
    case "HIGH_LEO":
      posM = [107.1, 562.2, 100.3];
      velMmS = [609.4, 143.0, 229.5];
      break;
    case "MEO":
      if (ssnClass === "SSN_RADAR_LAST_OBS" || ssnClass === "SSN_OPTICAL_LAST_OBS") {
        posM = [175.8, 919.6, 112.6];
        velMmS = [138.4, 29.5, 16.4];
      } else if (ssnClass === "OPERATOR_BOUNDARY") {
        posM = [250.0, 4200.0, 180.0];
        velMmS = [655.4, 45.0, 25.0];
      } else {
        posM = [254.6, 1591.2, 167.6];
        velMmS = [195.7, 39.6, 21.0];
      }
      return {
        sigPosKm: posM.map((x) => x * 1e-3),
        // Down-weight osculating in-track velocity (8x) so local tesseral/geoid anomaly dU(r0) never corrupts secular mean motion n,
        // while keeping radial & cross-track velocity (2x) to break ascending-node (ey, inc) degeneracy!
        sigVelKmS: [velMmS[0] * 2.0e-6, velMmS[1] * 8.0e-6, velMmS[2] * 2.0e-6],
      };
    case "GEO":
      if (ssnClass === "SSN_RADAR_LAST_OBS" || ssnClass === "SSN_OPTICAL_LAST_OBS") {
        posM = [781.3, 1472.4, 480.4];
        velMmS = [81.1, 78.9, 40.0];
      } else {
        posM = [893.2, 1724.3, 857.4];
        velMmS = [100.6, 90.4, 61.8];
      }
      if (ssnClass === "OPERATOR_BOUNDARY") {
        posM = [posM[0] * 1.4, posM[1] * 2.2, posM[2] * 1.4];
        velMmS = velMmS.map((v) => v * 1.6);
      }
      return {
        sigPosKm: posM.map((x) => x * 1e-3),
        sigVelKmS: [velMmS[0] * 2.0e-6, velMmS[1] * 8.0e-6, velMmS[2] * 2.0e-6],
      };
    case "HEO":
    default:
      posM = [309.1, 1128.4, 131.0];
      velMmS = [132.1, 52.5, 28.5];
      break;
  }

  // Apply SSN epoch provenance multipliers for LEO / HEO (Exa Research #1)
  let multT = 1.0, multRN = 1.0;
  if (ssnClass === "SSN_RADAR_LAST_OBS") {
    multT = 0.82;
    multRN = 0.88;
  } else if (ssnClass === "SSN_OPTICAL_LAST_OBS") {
    multT = 0.90;
    multRN = 0.92;
  } else if (ssnClass === "OPERATOR_BOUNDARY") {
    multT = 2.50;
    multRN = 1.35;
  }

  return {
    sigPosKm: [(posM[0] * multRN) * 1e-3, (posM[1] * multT) * 1e-3, (posM[2] * multRN) * 1e-3],
    // Down-weight osculating in-track velocity (8x) so local tesseral/geoid anomaly dU(r0) never corrupts secular mean motion n,
    // while radial & cross-track velocity (2x) cleanly resolve ascending-node (ey, inc)!
    sigVelKmS: [(velMmS[0] * multT * 2.0) * 1e-6, (velMmS[1] * multRN * 8.0) * 1e-6, (velMmS[2] * multRN * 2.0) * 1e-6],
  };
}

/**
 * Evaluates each TLE strictly at its own epoch (minutes = 0.0 ONLY) via WASM SGP4,
 * transforming to GCRF and ECEF via WASM sdnap_frame_probe.
 */
export function evalSgp4OwnEpochs(sdnApHost, tles) {
  const x = sdnApHost.instance.exports;
  const K = tles.length;
  if (K === 0) return [];
  const pRow = x.sdnap_alloc(Math.max(112, K * 112));
  const pMin = x.sdnap_alloc(Math.max(8, K * 8));
  const pOut = x.sdnap_alloc(Math.max(48, K * 48));
  const pSt = x.sdnap_alloc(Math.max(4, K * 4));
  const pIn6 = x.sdnap_alloc(48);
  const pOut6 = x.sdnap_alloc(48);

  for (let i = 0; i < K; i++) {
    const t = tles[i];
    const f64 = new Float64Array(sdnApHost.memory.buffer, pRow + i * 112, 13);
    f64.fill(0);
    f64[0] = t.whole; f64[1] = t.frac; f64[2] = t.n; f64[3] = t.e;
    f64[4] = t.inc; f64[5] = t.raan; f64[6] = t.argp; f64[7] = t.ma;
    f64[8] = t.bstar; f64[9] = t.ndot; f64[10] = t.nddot;
    const u32 = new Uint32Array(sdnApHost.memory.buffer, pRow + i * 112 + 104, 2);
    u32[0] = t.norad >>> 0;
    u32[1] = 0; // kTheorySgp4
  }
  x.sdnap_init_elements(pRow, K);
  new Float64Array(sdnApHost.memory.buffer, pMin, K).fill(0.0);
  x.sdnap_propagate_minutes_soa(pMin, 0, K, pOut, pSt);

  const raw = Float64Array.from(new Float64Array(sdnApHost.memory.buffer, pOut, K * 6));
  const st = Int32Array.from(new Int32Array(sdnApHost.memory.buffer, pSt, K));
  const out = [];
  for (let i = 0; i < K; i++) {
    const jd = tles[i];
    const rTeme = [raw[i], raw[K + i], raw[2 * K + i]];
    const vTeme = [raw[3 * K + i], raw[4 * K + i], raw[5 * K + i]];
    new Float64Array(sdnApHost.memory.buffer, pIn6, 6).set([...rTeme, ...vTeme]);
    x.sdnap_frame_probe(jd.whole, jd.frac, pIn6, pOut6, 1); // TEME -> GCRF
    const g = Float64Array.from(new Float64Array(sdnApHost.memory.buffer, pOut6, 6));
    x.sdnap_frame_probe(jd.whole, jd.frac, pIn6, pOut6, 2); // TEME -> ECEF
    const ecef = Float64Array.from(new Float64Array(sdnApHost.memory.buffer, pOut6, 6));
    out.push({
      status: st[i],
      epochIso: isoFromJd(jd.whole, jd.frac),
      rGcrf: [g[0], g[1], g[2]],
      vGcrf: [g[3], g[4], g[5]],
      rTeme,
      vTeme,
      rEcefKm: [ecef[0], ecef[1], ecef[2]],
      vEcefKm: [ecef[3], ecef[4], ecef[5]],
    });
  }
  x.sdnap_free(pRow); x.sdnap_free(pMin); x.sdnap_free(pOut); x.sdnap_free(pSt); x.sdnap_free(pIn6); x.sdnap_free(pOut6);
  return out;
}

/**
 * Evaluates a single reference TLE forward on stock SGP4 to arbitrary target JDs ( strictly for
 * the SGP4 baseline comparator in our benchmark — NEVER used inside AP fitting!).
 */
export function propagateSingleTleSgp4Gcrf(sdnApHost, tle, targetJds) {
  const x = sdnApHost.instance.exports;
  const M = targetJds.length;
  if (M === 0) return [];
  const pRow = x.sdnap_alloc(M * 112);
  const pMin = x.sdnap_alloc(M * 8);
  const pOut = x.sdnap_alloc(M * 48);
  const pSt = x.sdnap_alloc(M * 4);
  const pIn6 = x.sdnap_alloc(48);
  const pOut6 = x.sdnap_alloc(48);

  for (let j = 0; j < M; j++) {
    const f64 = new Float64Array(sdnApHost.memory.buffer, pRow + j * 112, 13);
    f64.fill(0);
    f64[0] = tle.whole; f64[1] = tle.frac; f64[2] = tle.n; f64[3] = tle.e;
    f64[4] = tle.inc; f64[5] = tle.raan; f64[6] = tle.argp; f64[7] = tle.ma;
    f64[8] = tle.bstar; f64[9] = tle.ndot; f64[10] = tle.nddot;
    const u32 = new Uint32Array(sdnApHost.memory.buffer, pRow + j * 112 + 104, 2);
    u32[0] = tle.norad >>> 0;
    u32[1] = 0; // kTheorySgp4
  }
  x.sdnap_init_elements(pRow, M);

  const mins = targetJds.map((jd) => ((jd.whole - tle.whole) + (jd.frac - tle.frac)) * 1440.0);
  new Float64Array(sdnApHost.memory.buffer, pMin, M).set(mins);
  x.sdnap_propagate_minutes_soa(pMin, 0, M, pOut, pSt);

  const raw = Float64Array.from(new Float64Array(sdnApHost.memory.buffer, pOut, M * 6));
  const st = Int32Array.from(new Int32Array(sdnApHost.memory.buffer, pSt, M));
  const out = [];
  for (let j = 0; j < M; j++) {
    const jd = targetJds[j];
    new Float64Array(sdnApHost.memory.buffer, pIn6, 6).set([
      raw[j], raw[M + j], raw[2 * M + j],
      raw[3 * M + j], raw[4 * M + j], raw[5 * M + j],
    ]);
    x.sdnap_frame_probe(jd.whole, jd.frac, pIn6, pOut6, 1);
    const g = Float64Array.from(new Float64Array(sdnApHost.memory.buffer, pOut6, 6));
    out.push({ status: st[j], rGcrf: [g[0], g[1], g[2]], vGcrf: [g[3], g[4], g[5]] });
  }
  x.sdnap_free(pRow); x.sdnap_free(pMin); x.sdnap_free(pOut); x.sdnap_free(pSt); x.sdnap_free(pIn6); x.sdnap_free(pOut6);
  return out;
}

/**
 * Classifies all TLE epochs of a satellite in ONE WASM `analysis/access` call (Exa Research #1).
 */
export async function classifySsnEpochsBatch(accessHost, tles, sgpOwn) {
  const classes = new Array(tles.length).fill("OTHER_EPOCH");
  if (!accessHost || tles.length === 0) return classes;
  const queryIndices = [];
  const samples = [];
  const eps = 1e-6;

  for (let i = 0; i < tles.length; i++) {
    if (sgpOwn[i].status !== 0) continue;
    const { rTeme, vTeme } = sgpOwn[i];
    const rNorm = Math.hypot(...rTeme);
    const latDeg = Math.asin(Math.max(-1, Math.min(1, rTeme[2] / rNorm))) * RAD2DEG;
    if (Math.abs(latDeg) < 1.5 && vTeme[2] > 0) {
      classes[i] = "ASCENDING_NODE";
      continue;
    }
    const fracSec = (tles[i].frac * 86400.0) % 60.0;
    if (fracSec < 0.02 || fracSec > 59.98) {
      classes[i] = "OPERATOR_BOUNDARY";
      continue;
    }
    queryIndices.push(i);
  }

  if (queryIndices.length === 0) return classes;
  queryIndices.sort((a, b) => (tles[a].whole - tles[b].whole) + (tles[a].frac - tles[b].frac));
  const jdTts = [];
  for (let q = 0; q < queryIndices.length; q++) {
    const idx = queryIndices[q];
    const jdTt = tles[idx].whole + tles[idx].frac + (37 + 32.184) / 86400.0;
    if (jdTts.length > 0 && jdTt - jdTts[jdTts.length - 1] <= 4 * eps) {
      jdTts.push(jdTt);
      continue;
    }
    if (samples.length > 0) {
      const midJd = 0.5 * (samples[samples.length - 1].JULIAN_DATE_TT + (jdTt - eps));
      samples.push(Object.assign(new A.ACWStateSampleT(), {
        JULIAN_DATE_TT: midJd,
        POSITION_X_M: 0, POSITION_Y_M: 0, POSITION_Z_M: 0,
        VELOCITY_X_MPS: 0, VELOCITY_Y_MPS: 0, VELOCITY_Z_MPS: 0,
      }));
    }
    const { rEcefKm, vEcefKm } = sgpOwn[idx];
    samples.push(Object.assign(new A.ACWStateSampleT(), {
      JULIAN_DATE_TT: jdTt - eps,
      POSITION_X_M: rEcefKm[0] * 1000, POSITION_Y_M: rEcefKm[1] * 1000, POSITION_Z_M: rEcefKm[2] * 1000,
      VELOCITY_X_MPS: vEcefKm[0] * 1000, VELOCITY_Y_MPS: vEcefKm[1] * 1000, VELOCITY_Z_MPS: vEcefKm[2] * 1000,
    }));
    samples.push(Object.assign(new A.ACWStateSampleT(), {
      JULIAN_DATE_TT: jdTt + eps,
      POSITION_X_M: rEcefKm[0] * 1000, POSITION_Y_M: rEcefKm[1] * 1000, POSITION_Z_M: rEcefKm[2] * 1000,
      VELOCITY_X_MPS: vEcefKm[0] * 1000, VELOCITY_Y_MPS: vEcefKm[1] * 1000, VELOCITY_Z_MPS: vEcefKm[2] * 1000,
    }));
    jdTts.push(jdTt);
  }

  if (samples.length >= 2) {
    const req = Object.assign(new A.ACWRequestT(), {
      OPERATION: A.acwOperationCode.COMPUTE_ACCESS_WINDOWS,
      EVALUATION_MODE: A.acwEvaluationMode.DISCRETE,
      GROUND_STATIONS: SSN_GROUND_STATIONS,
      STATES: samples,
    });
    const b = new flatbuffers.Builder(Math.max(4096, samples.length * 128));
    A.ACW.finishACWBuffer(b, new A.ACWT(req, null).pack(b));
    const r = await accessHost.invoke({
      methodId: "compute_access_windows",
      inputs: [{ portId: "request", typeRef: TYPES.ACW, payload: b.asUint8Array() }],
    });
    if (r.statusCode === 0 && r.outputs.length > 0) {
      const res = A.ACW.getRootAsACW(new flatbuffers.ByteBuffer(new Uint8Array(r.outputs[0].payload))).RESULT();
      if (res) {
        const nW = res.windowsLength();
        for (let w = 0; w < nW; w++) {
          const win = res.WINDOWS(w);
          const t0 = win.START_JULIAN_DATE_TT() - 2 * eps;
          const t1 = win.END_JULIAN_DATE_TT() + 2 * eps;
          const isOpt = OPTICAL_IDS.has(win.STATION_ID());
          for (let q = 0; q < queryIndices.length; q++) {
            if (jdTts[q] >= t0 && jdTts[q] <= t1) {
              const idx = queryIndices[q];
              if (classes[idx] !== "SSN_RADAR_LAST_OBS") {
                classes[idx] = isOpt ? "SSN_OPTICAL_LAST_OBS" : "SSN_RADAR_LAST_OBS";
              }
            }
          }
        }
      }
    }
  }
  return classes;
}

/**
 * Exa Research #2 Forward-Backward Consistency Maneuver Screen + Full WASM `analysis/maneuver-detection`
 * (`detect_maneuvers` + `e14-s3-kc.erm`).
 * Returns the clean post-maneuver subset of TLEs (`cleanIndices`) and maneuver metadata (`maneuverInfo`).
 */
export async function screenAndSegmentManeuvers(sdnApHost, mnvHost, ermPayload, tles, fixResonantThrustScreen = false) {
  if (tles.length < 3) {
    return { cleanIndices: tles.map((_, i) => i), maneuverInfo: { detected: false, events: [] } };
  }

  const { regime, aKm, hpKm, nRadS } = classifyOrbitRegime(tles[tles.length - 1].n, tles[tles.length - 1].e);
  const vCircMps = aKm * 1000.0 * nRadS;

  // Precompute per-pair rate-adjusted SMA steps so we can detect fine (>= 6 mm/s) station-keeping burns
  // via object-adaptive 8x median(|dvSma|) outlier ratio without false positives on noisy objects (Exa Research #2)!
  const K = tles.length;
  const pairDvSma = [];
  for (let i = 0; i < K - 1; i++) {
    const dtDays = tles[i + 1].d70 - tles[i].d70;
    if (dtDays <= 1e-4 || dtDays > 7.5) continue;
    const dnPred = 2.0 * (tles[i].ndot || 0) * dtDays;
    const dnUnmodeled = (tles[i + 1].n - tles[i].n) - dnPred;
    pairDvSma.push(Math.abs((vCircMps / 3.0) * (dnUnmodeled / tles[i].n)));
  }
  const sortedDv = [...pairDvSma].sort((a, b) => a - b);
  const medDvSma = sortedDv.length ? sortedDv[Math.floor(sortedDv.length * 0.5)] : 0.05;

  // 1. Fast forward-backward midpoint + object-adaptive SMA-step screen via WASM SGP4
  const x = sdnApHost.instance.exports;
  let candidateManeuver = false;
  let heuristicLastJumpIdx = -1;
  let maxStepEquivMps = 0;
  let maxMidpointJumpKm = 0;

  const pRow = x.sdnap_alloc(2 * 112);
  const pMin = x.sdnap_alloc(16);
  const pOut = x.sdnap_alloc(96);
  const pSt = x.sdnap_alloc(8);

  const writeRow = (slot, t) => {
    const f64 = new Float64Array(sdnApHost.memory.buffer, pRow + slot * 112, 13);
    f64.fill(0);
    f64[0] = t.whole; f64[1] = t.frac; f64[2] = t.n; f64[3] = t.e;
    f64[4] = t.inc; f64[5] = t.raan; f64[6] = t.argp; f64[7] = t.ma;
    f64[8] = t.bstar; f64[9] = t.ndot; f64[10] = t.nddot;
    new Uint32Array(sdnApHost.memory.buffer, pRow + slot * 112 + 104, 2).set([t.norad >>> 0, 0]);
  };

  for (let i = 0; i < K - 1; i++) {
    const dtDays = tles[i + 1].d70 - tles[i].d70;
    if (dtDays <= 1e-4) continue;
    if (dtDays > 7.5) {
      heuristicLastJumpIdx = i;
      continue;
    }
    const dnPred = 2.0 * (tles[i].ndot || 0) * dtDays;
    const dnUnmodeled = (tles[i + 1].n - tles[i].n) - dnPred;
    const dvSmaMps = Math.abs((vCircMps / 3.0) * (dnUnmodeled / tles[i].n));
    const diRad = (tles[i + 1].inc - tles[i].inc) * DEG2RAD;
    const dvPlaneMps = vCircMps * Math.abs(diRad);
    const dvStep = Math.hypot(dvSmaMps, dvPlaneMps);
    if (dvStep > maxStepEquivMps) maxStepEquivMps = dvStep;

    // Forward-backward midpoint SGP4 consistency check (Exa Research #2)
    writeRow(0, tles[i]);
    writeRow(1, tles[i + 1]);
    x.sdnap_init_elements(pRow, 2);
    const halfMin = 0.5 * dtDays * 1440.0;
    new Float64Array(sdnApHost.memory.buffer, pMin, 2).set([halfMin, -halfMin]);
    x.sdnap_propagate_minutes_soa(pMin, 0, 2, pOut, pSt);
    const raw = new Float64Array(sdnApHost.memory.buffer, pOut, 12);
    const st = new Int32Array(sdnApHost.memory.buffer, pSt, 2);
    let midDistKm = 0, midCrossKm = 0;
    if (st[0] === 0 && st[1] === 0) {
      const r0 = [raw[0], raw[2], raw[4]];
      const r1 = [raw[1], raw[3], raw[5]];
      const v1 = [raw[7], raw[9], raw[11]];
      const dr = [r1[0] - r0[0], r1[1] - r0[1], r1[2] - r0[2]];
      midDistKm = Math.hypot(dr[0], dr[1], dr[2]);
      midCrossKm = Math.abs(vecToUvw(r1, v1, dr)[2]);
      if (midDistKm > maxMidpointJumpKm) maxMidpointJumpKm = midDistKm;
    } else {
      heuristicLastJumpIdx = i;
      continue;
    }

    // Calibrated 3.5-sigma SGP4 midpoint consistency gates + object-adaptive fine station-keeping detector
    const maxJumpKm =
      regime === "LOW_LEO" ? Math.max(8.0, 8.0 * dtDays) :
      regime === "MID_LEO" ? Math.max(4.5, 4.0 * dtDays) :
      regime === "HIGH_LEO" ? Math.max(3.5, 3.0 * dtDays) :
      regime === "MEO" ? Math.max(4.5, 3.5 * dtDays) :
      regime === "GEO" ? Math.max(8.0, 5.0 * dtDays) : Math.max(12.0, 8.0 * dtDays);
    const maxCrossKm =
      regime === "GEO" ? Math.max(4.5, 3.0 * dtDays) :
      regime === "MEO" ? Math.max(2.5, 1.8 * dtDays) : Math.max(2.0, 1.5 * dtDays);
    const dvTrigMps = regime === "LOW_LEO" ? 0.65 : 0.35;
    const isFineStationKeepingBurn =
      sortedDv.length >= 5 &&
      dvSmaMps >= 0.006 &&
      dvSmaMps > 8.5 * Math.max(0.0005, medDvSma) &&
      (hpKm > 1200 || dnUnmodeled < 0 || dvSmaMps > 0.025);

    if (midDistKm > maxJumpKm || midCrossKm > maxCrossKm || (dvSmaMps > dvTrigMps && midDistKm > 2.0) || isFineStationKeepingBurn) {
      candidateManeuver = true;
      heuristicLastJumpIdx = i;
    }
  }
  x.sdnap_free(pRow); x.sdnap_free(pMin); x.sdnap_free(pOut); x.sdnap_free(pSt);

  // 2. If physical candidate maneuver detected AND mnvHost + ermPayload available, invoke full WASM analysis/maneuver-detection!
  const events = [];
  const parseIsoMs = (s) => Date.parse(/[zZ]$/.test(s) ? s : `${s}Z`);
  if (candidateManeuver && mnvHost && ermPayload && tles.length >= 4) {
    try {
      const ommParts = tles.map((t) => {
        const o = Object.assign(new OMMT(), {
          OBJECT_NAME: t.name ?? `SAT-${t.norad}`,
          OBJECT_ID: t.objectId ?? "",
          NORAD_CAT_ID: t.norad,
          EPOCH: isoFromJd(t.whole, t.frac),
          MEAN_ELEMENT_THEORY: meanElementSource.SGP4,
          MEAN_MOTION: t.n,
          ECCENTRICITY: t.e,
          INCLINATION: t.inc,
          RA_OF_ASC_NODE: t.raan,
          ARG_OF_PERICENTER: t.argp,
          MEAN_ANOMALY: t.ma,
          BSTAR: t.bstar,
          MEAN_MOTION_DOT: t.ndot,
          MEAN_MOTION_DDOT: t.nddot,
          GP_ID: t.gpId || 0,
        });
        const b = new flatbuffers.Builder(512);
        OMM.finishSizePrefixedOMMBuffer(b, o.pack(b));
        return Buffer.from(b.asUint8Array());
      });
      const ommStreamBytes = new Uint8Array(Buffer.concat(ommParts));
      const first = await mnvHost.invoke({
        methodId: "detect_maneuvers",
        inputs: [{ portId: "element_sets", typeRef: TYPES.OMM, payload: ommStreamBytes }],
      });

      const reqOut = first.outputs?.find((o) => o.portId === "propagation_requests");
      if (first.statusCode === 0 && reqOut) {
        const prw = P.PRW.getRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(reqOut.payload))).unpack();
        const winReq = prw.WINDOW_REQUEST;
        if (winReq && winReq.QUERIES?.length > 0) {
          // Answer each SGP4 TEME window query using WASM sdn-ap SGP4!
          const blocks = [];
          for (const q of winReq.QUERIES) {
            const setIdx = Number(q.SET_INDEX ?? q.ELEMENT_SET_INDEX ?? 0);
            const tle = tles[Math.min(tles.length - 1, Math.max(0, setIdx))];
            const startMs = Number(q.START_MS ?? parseIsoMs(q.START_TIME));
            const stopMs = Number(q.STOP_MS ?? parseIsoMs(q.STOP_TIME));
            const stepS = Number(q.STEP_SECONDS ?? 60);
            const sampleIsos = [];
            const sampleJds = [];
            for (let ms = startMs; ; ms = Math.min(stopMs, ms + stepS * 1000)) {
              const whole = Math.floor(ms / 86400000) + 2440587.5;
              const frac = (ms - Math.floor(ms / 86400000) * 86400000) / 86400000;
              sampleJds.push({ whole, frac });
              sampleIsos.push(new Date(ms).toISOString());
              if (ms >= stopMs) break;
            }
            // Propagate in TEME via WASM sdn-ap
            const M = sampleJds.length;
            const pR = x.sdnap_alloc(112), pM = x.sdnap_alloc(M * 8), pO = x.sdnap_alloc(M * 48), pS = x.sdnap_alloc(M * 4);
            const f64 = new Float64Array(sdnApHost.memory.buffer, pR, 13);
            f64.fill(0);
            f64[0] = tle.whole; f64[1] = tle.frac; f64[2] = tle.n; f64[3] = tle.e;
            f64[4] = tle.inc; f64[5] = tle.raan; f64[6] = tle.argp; f64[7] = tle.ma;
            f64[8] = tle.bstar; f64[9] = tle.ndot; f64[10] = tle.nddot;
            new Uint32Array(sdnApHost.memory.buffer, pR + 104, 2).set([tle.norad >>> 0, 0]);
            x.sdnap_init_elements(pR, 1);
            new Float64Array(sdnApHost.memory.buffer, pM, M).set(
              sampleJds.map((jd) => ((jd.whole - tle.whole) + (jd.frac - tle.frac)) * 1440.0)
            );
            x.sdnap_propagate_minutes_soa(pM, M, 1, pO, pS);
            const raw = Float64Array.from(new Float64Array(sdnApHost.memory.buffer, pO, M * 6));
            const st = Int32Array.from(new Int32Array(sdnApHost.memory.buffer, pS, M));
            x.sdnap_free(pR); x.sdnap_free(pM); x.sdnap_free(pO); x.sdnap_free(pS);

            const blk = new ephemerisDataBlockT();
            blk.OBJECT = Object.assign(new CATT(), { NORAD_CAT_ID: tle.norad, OBJECT_ID: tle.objectId ?? "" });
            blk.CENTER_NAME = "EARTH";
            blk.TIME_SYSTEM = timingStandard.UTC;
            blk.REFERENCE_FRAME = Object.assign(new RFMT(), { NAME: "TEME" });
            if (st.some((c) => c !== 0)) {
              blk.COMMENT = "REFUSED SGP4 propagation error";
            } else {
              blk.EPHEMERIS_DATA_LINES = sampleIsos.map((ep, k) =>
                Object.assign(new ephemerisDataLineT(), {
                  EPOCH: ep,
                  X: raw[6 * k], Y: raw[6 * k + 1], Z: raw[6 * k + 2],
                  X_DOT: raw[6 * k + 3], Y_DOT: raw[6 * k + 4], Z_DOT: raw[6 * k + 5],
                })
              );
            }
            blocks.push(blk);
          }
          const oemT = Object.assign(new OEMT(), {
            CCSDS_OEM_VERS: "2.0",
            CREATION_DATE: "2026-11-08T00:00:00Z",
            ORIGINATOR: "SDN-AP",
            EPHEMERIS_DATA_BLOCK: blocks,
          });
          const bOem = new flatbuffers.Builder(Math.max(4096, blocks.length * 4096));
          OEM.finishOEMBuffer(bOem, oemT.pack(bOem));

          const second = await mnvHost.invoke({
            methodId: "detect_maneuvers",
            inputs: [
              { portId: "element_sets", typeRef: TYPES.OMM, payload: ommStreamBytes },
              { portId: "error_model", typeRef: TYPES.ERM, payload: ermPayload },
              { portId: "propagation", typeRef: TYPES.OEM, payload: bOem.asUint8Array() },
            ],
          });
          if (second.statusCode === 0) {
            for (const o of second.outputs.filter((f) => f.portId === "maneuvers")) {
              const m = MNV.getRootAsMNV(new flatbuffers.ByteBuffer(new Uint8Array(o.payload))).unpack();
              const winMatch = /burn window \(99\.73 %\): (\S+) to (\S+)\./.exec(m.DESCRIPTION ?? "");
              events.push({
                eventStartTime: m.EVENT_START_TIME,
                windowEnd: (winMatch?.[2] ?? m.EVENT_START_TIME).replace(/\.$/, ""),
                dvRtnMps: [m.DELTA_VEL_U * 1000, m.DELTA_VEL_V * 1000, m.DELTA_VEL_W * 1000],
                dvMagMps: Math.hypot(m.DELTA_VEL_U, m.DELTA_VEL_V, m.DELTA_VEL_W) * 1000,
              });
            }
          }
        }
      }
    } catch {
      // Fall back cleanly to physical midpoint jump index if PRW field layout differs
    }
  }

  // Detect continuous low-thrust / electric propulsion:
  // When fixResonantThrustScreen is true:
  //  - Above 1450 km (MEO/HEO/GEO), natural J22 triaxial libration causes monotonic da/dt -> never flag as electric propulsion.
  //  - Between 800..1450 km, natural drag is < 3 m/day, so sustained |da/dt| > 130 m/day (raising or lowering) is low-thrust.
  //  - Below 800 km, dn > 0 (da/dt < 0) is NATURAL ATMOSPHERIC DRAG DECAY — only sustained orbit RAISING (dn < 0 -> negSteps) is thrust!
  let continuousThrust = false;
  const spanDays = tles[K - 1].d70 - tles[0].d70;
  const ctAltOk = fixResonantThrustScreen ? (hpKm > 350.0 && hpKm < 1450.0) : (hpKm > 900.0);
  if (ctAltOk && K >= 6 && spanDays >= 6.0) {
    let posSteps = 0, negSteps = 0;
    const daPerDayM = [];
    for (let i = 0; i < K - 1; i++) {
      const dtDays = tles[i + 1].d70 - tles[i].d70;
      if (dtDays <= 0.05 || dtDays > 7.5) continue;
      const dn = tles[i + 1].n - tles[i].n;
      if (dn > 0) posSteps++;
      else if (dn < 0) negSteps++;
      const daM = Math.abs((-2.0 / 3.0) * (aKm * 1000.0) * (dn / tles[i].n)) / dtDays;
      daPerDayM.push(daM);
    }
    const signedNetDaM = (-2.0 / 3.0) * (aKm * 1000.0) * ((tles[K - 1].n - tles[0].n) / tles[0].n);
    const netDaM = fixResonantThrustScreen && hpKm <= 800.0 ? signedNetDaM : Math.abs(signedNetDaM);
    const totalDir = posSteps + negSteps;
    const minNetDa = fixResonantThrustScreen ? 800.0 : 400.0;
    const minMedDa = fixResonantThrustScreen ? 120.0 : 45.0;
    const minFrac = fixResonantThrustScreen ? 0.88 : 0.85;
    if (totalDir >= 5 && netDaM > minNetDa) {
      const relevantSteps = fixResonantThrustScreen && hpKm <= 800.0 ? negSteps : Math.max(posSteps, negSteps);
      const sameSignFrac = relevantSteps / totalDir;
      const sortedDa = [...daPerDayM].sort((a, b) => a - b);
      const medDaMDay = sortedDa[Math.floor(sortedDa.length * 0.5)] || 0;
      if (sameSignFrac >= minFrac && medDaMDay > minMedDa) {
        continuousThrust = true;
      }
    }
  }

  let cutAfterD70 = -Infinity;
  if (events.length > 0 && maxMidpointJumpKm > 2.0) {
    const latestEv = events[events.length - 1];
    const tCutMs = parseIsoMs(latestEv.windowEnd);
    if (Number.isFinite(tCutMs)) cutAfterD70 = tCutMs / 86400000;
  }
  if (!(cutAfterD70 > -Infinity) && heuristicLastJumpIdx >= 0) {
    cutAfterD70 = 0.5 * (tles[heuristicLastJumpIdx].d70 + tles[heuristicLastJumpIdx + 1].d70);
  }

  if (cutAfterD70 > -Infinity) {
    const post = [];
    for (let i = 0; i < tles.length; i++) {
      if (tles[i].d70 > cutAfterD70) post.push(i);
    }
    if (post.length >= 1) {
      return {
        cleanIndices: post,
        maneuverInfo: {
          detected: true,
          continuousThrust,
          cutAfterIso: new Date(cutAfterD70 * 86400000).toISOString(),
          maxMidpointJumpKm,
          maxStepEquivMps,
          postBurnCount: post.length,
          events,
        },
      };
    }
  }

  return {
    cleanIndices: tles.map((_, i) => i),
    maneuverInfo: { detected: false, continuousThrust, maxMidpointJumpKm, maxStepEquivMps, events },
  };
}

// Wrap angle in degrees into [0, 360)
function wrap360(deg) {
  let x = deg % 360.0;
  if (x < 0) x += 360.0;
  return x;
}

// Convert non-singular parameter vector theta = [ex, ey, incDeg, raanDeg, uMDeg, nRevDay, lnBterm, lnAgom] -> classical AP elements
function thetaToClassical(theta) {
  const ex = theta[0], ey = theta[1];
  let e = Math.hypot(ex, ey);
  if (e < 1e-7) e = 1e-7;
  if (e > 0.98) e = 0.98;
  const argpRad = Math.atan2(ey, ex);
  const argpDeg = wrap360(argpRad * RAD2DEG);
  const uMDeg = wrap360(theta[4]);
  const maDeg = wrap360(uMDeg - argpDeg);
  const incDeg = Math.max(0.001, Math.min(179.999, theta[2]));
  const raanDeg = wrap360(theta[3]);
  const nRevDay = Math.max(0.05, Math.min(20.0, theta[5]));
  const bterm = Math.min(25.0, Math.max(1e-6, Math.exp(theta[6])));
  const agom = Math.min(5.0, Math.max(1e-6, Math.exp(theta[7])));
  return { n: nRevDay, e, inc: incDeg, raan: raanDeg, argp: argpDeg, ma: maDeg, bterm, agom };
}

// Build a compact trial AP $OCM for internal Gauss-Newton iteration (carries only the needed window of SPW rows!)
function buildTrialApOcmBytes(norad, epochIso, el, spwRowsSubset, tesseralOverride = null, dcaSubset = null) {
  const tesseral = tesseralOverride !== null ? tesseralOverride : (el.e > 0.048 ? 0 : 31);
  const rfmTeme = Object.assign(new RFMT(), {
    REFERENCE_FRAME_type: RFMUnion.CustomFrameWrapper,
    REFERENCE_FRAME: Object.assign(new CustomFrameWrapperT(), { frame: CustomFrame.TEMEOFEPOCH }),
    NAME: "TEMEOFEPOCH",
  });
  const ocmT = new OCMT();
  ocmT.HEADER = Object.assign(new HeaderT(), { CCSDS_OCM_VERS: "3.0", ORIGINATOR: "SDN-AP" });
  ocmT.METADATA = Object.assign(new MetadataT(), {
    OBJECT_NAME: String(norad),
    TIME_SYSTEM: "UTC",
    NORAD_CAT_ID: norad,
  });
  ocmT.CENTER_NAME = "EARTH";
  ocmT.TRAJ_REF_FRAME = rfmTeme;
  ocmT.TRAJ_FRAME_EPOCH = epochIso;
  ocmT.ORB_AVERAGING = "BROUWER";
  ocmT.MEAN_ELEMENTS = Object.assign(new OCMMeanElementsT(), {
    MEAN_ELEMENT_THEORY: meanElementSource.AP,
    EPOCH: epochIso,
    MEAN_MOTION: el.n,
    ECCENTRICITY: el.e,
    INCLINATION: el.inc,
    RA_OF_ASC_NODE: el.raan,
    ARG_OF_PERICENTER: el.argp,
    MEAN_ANOMALY: el.ma,
    BTERM: el.bterm,
    AGOM: el.agom,
  });
  const pertProps = {
    ATMOSPHERIC_MODEL: Object.assign(new ATMT(), { MODEL: AtmosphericModelFamily.NRLMSIS00E, YEAR: 2000 }),
    GRAVITY_MODEL: "EGM-96",
    MAXIMUM_TESSERAL_DEGREE: tesseral,
    MAXIMUM_ZONAL_DEGREE: 20,
    WEATHER_SOURCE: pcfWeatherSource.RECORDS,
    SW_DATA_SOURCE: "GFZ/SWPC",
    SW_INTERP_METHOD: "LINEAR",
    SPACE_WEATHER: spwRowsSubset,
  };
  if (dcaSubset) {
    pertProps.DENSITY_CORRECTION = pcfDensityCorrection.DCA_COMMON_MODE;
    pertProps.DENSITY_CORRECTION_CID = dcaSubset.cid;
    pertProps.DENSITY_CORRECTION_NODE_TIMES_MS = dcaSubset.nodeTimesMs;
    pertProps.DENSITY_CORRECTION_LOG_DENSITY_SCALE_DIMENSIONLESS = dcaSubset.nodeLogScale;
  }
  ocmT.PERTURBATIONS = Object.assign(new PerturbationsT(), pertProps);
  const b = new flatbuffers.Builder(4096);
  OCM.finishOCMBuffer(b, ocmT.pack(b));
  return b.asUint8Array();
}

// Symmetric Cholesky / Gauss-Jordan solver for small SPD normal matrices (dim <= 8)
function solveSpdAndInvert(A, rhs, n) {
  // Augmented Gauss-Jordan with diagonal pivoting safety
  const M = Array.from({ length: n }, (_, i) => {
    const row = new Float64Array(2 * n + 1);
    for (let j = 0; j < n; j++) row[j] = A[i * n + j];
    row[n + i] = 1.0;
    row[2 * n] = rhs[i];
    return row;
  });

  for (let col = 0; col < n; col++) {
    let piv = col;
    let maxAbs = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > maxAbs) {
        maxAbs = Math.abs(M[r][col]);
        piv = r;
      }
    }
    if (maxAbs < 1e-18) return null;
    if (piv !== col) {
      const tmp = M[col];
      M[col] = M[piv];
      M[piv] = tmp;
    }
    const diag = M[col][col];
    for (let j = col; j <= 2 * n; j++) M[col][j] /= diag;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let j = col; j <= 2 * n; j++) M[r][j] -= f * M[col][j];
    }
  }

  const dx = new Float64Array(n);
  const inv = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    dx[i] = M[i][2 * n];
    for (let j = 0; j < n; j++) inv[i * n + j] = M[i][n + j];
  }
  return { dx, inv };
}

// Exact SPEC 12 add_floor in TEME (matches propagator/sdn-ap/src/covariance.inc lines 264-289)
function addFloorTeme6x6(floor6, r0, v0, S6) {
  const rr = r0[0] * r0[0] + r0[1] * r0[1] + r0[2] * r0[2];
  const invRn = 1.0 / Math.sqrt(rr);
  const U = [r0[0] * invRn, r0[1] * invRn, r0[2] * invRn];
  const h = [
    r0[1] * v0[2] - r0[2] * v0[1],
    r0[2] * v0[0] - r0[0] * v0[2],
    r0[0] * v0[1] - r0[1] * v0[0],
  ];
  const hh = h[0] * h[0] + h[1] * h[1] + h[2] * h[2];
  const invWn = 1.0 / Math.sqrt(hh);
  const W = [h[0] * invWn, h[1] * invWn, h[2] * invWn];
  const V = [W[1] * U[2] - W[2] * U[1], W[2] * U[0] - W[0] * U[2], W[0] * U[1] - W[1] * U[0]];
  const B = [U, V, W];
  const M = [
    [floor6[0], floor6[1], floor6[3]],
    [floor6[1], floor6[2], floor6[4]],
    [floor6[3], floor6[4], floor6[5]],
  ];
  const w2 = hh / (rr * rr);
  const BM = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let c = 0; c < 3; c++) {
      BM[i][c] = B[0][i] * M[0][c] + B[1][i] * M[1][c] + B[2][i] * M[2][c];
    }
  }
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j <= i; j++) {
      const s = BM[i][0] * B[0][j] + BM[i][1] * B[1][j] + BM[i][2] * B[2][j];
      S6[i * 6 + j] += s;
      S6[(3 + i) * 6 + (3 + j)] += w2 * s;
      if (j !== i) {
        S6[j * 6 + i] += s;
        S6[(3 + j) * 6 + (3 + i)] += w2 * s;
      }
    }
  }
}

// Convert SGP4 WGS-72 Kozai mean motion (rev/day) -> Brouwer mean motion (rev/day) analytically (zero propagation)
function kozaiToBrouwerMeanMotion(nKozaiRevDay, e, incDeg) {
  const XKE = 0.07436691613317342;
  const J2 = 0.001082616;
  const noKozai = (nKozaiRevDay * TWO_PI) / 1440.0;
  const a1 = Math.pow(XKE / noKozai, 2.0 / 3.0);
  const cosio = Math.cos(incDeg * DEG2RAD);
  const x3thm1 = 3.0 * cosio * cosio - 1.0;
  const betao2 = Math.max(1e-6, 1.0 - e * e);
  const betao = Math.sqrt(betao2);
  const temp0 = (0.75 * J2 * x3thm1) / (betao * betao2);
  const del1 = temp0 / (a1 * a1);
  const ao = a1 * (1.0 - del1 * (1.0 / 3.0 + del1 * (1.0 + (134.0 / 81.0) * del1)));
  const delo = temp0 / (ao * ao);
  return nKozaiRevDay / (1.0 + delo);
}

/**
 * Exact Round-0 Baseline configuration (reproduces task-9637 / prior benchmark bit-for-bit).
 */
export const BASELINE_AP_TUNING = {
  fitTesseralMode: "baseline", // "baseline" | "leoZero" | "allZeroFit"
  emitMaxEcc: 0.048,
  subsampleMode: "tail", // "tail" | "even"
  enableContinuousThrustScreen: false,
  continuousThrustMaxTles: 3,
  continuousThrustNoiseMult: 4.0,
  useDiscosDragPrior: false,
  cdPrior: 2.2,
  bstarTrustAltKm: 575.0,
  dragCeilingKm: 675.0,
  dragMinTles: 5,
  dragMinArcDays: 2.5,
  priorSigLnB_Discos: 0.25,
  priorSigLnB_NoDiscos: 0.25,
  srpEnableRegimes: [],
  srpMinTles: 8,
  srpMinArcDays: 8.0,
  priorSigLnA: 0.25,
  clusterTauDays: 0.0,
  clusterStrength: 0.0,
  ascNodeExtraTMult: 1.0,
  velRMult: 1.0,
  velTMult: 1.0,
  velNMult: 1.0,
  huberK: 2.5,
  maxIterStageB: 4,
  covScaleMult: 1.0,
  covFloorMult: 1.0,
  // Four structural astrodynamics & estimator upgrades (toggleable per upgrade):
  enableDcaCommonMode: false,
  dcaCeilingKm: 1000.0,
  enableRollingPriors: false,
  fixResonantThrustScreen: false,
  shortArcPriorScale: false,
  enableAr1Gls: false,
  enableTides: false,
  enableBoxwing: false,
  boxwingForecastDays: 5.0,
  regimes: {
    LOW_LEO: {
      windowDays: 5.0, maxTles: 14, qProcT: 0.06, agePow: 1.5,
      priorSigNKmDay_Multi: 2.5, priorSigNKmDay_Short: 2.5,
      crPrior: 1.25, defaultAgom: 0.006, noiseMeanMotionMult: 1.0,
      polishMode: "none", polishWindowDays: 2.0, polishQProcT: 0.02, polishMinArcDays: 3.0, polishMinTles: 3,
    },
    MID_LEO: {
      windowDays: 7.0, maxTles: 20, qProcT: 0.015, agePow: 1.5,
      priorSigNKmDay_Multi: 0.85, priorSigNKmDay_Short: 0.85,
      crPrior: 1.25, defaultAgom: 0.006, noiseMeanMotionMult: 1.0,
      polishMode: "none", polishWindowDays: 2.5, polishQProcT: 0.01, polishMinArcDays: 3.5, polishMinTles: 3,
    },
    HIGH_LEO: {
      windowDays: 8.0, maxTles: 20, qProcT: 0.006, agePow: 1.5,
      priorSigNKmDay_Multi: 0.85, priorSigNKmDay_Short: 0.85,
      crPrior: 1.25, defaultAgom: 0.006, noiseMeanMotionMult: 1.0,
      polishMode: "none", polishWindowDays: 3.0, polishQProcT: 0.005, polishMinArcDays: 4.0, polishMinTles: 3,
    },
    MEO: {
      windowDays: 14.0, maxTles: 20, qProcT: 0.002, agePow: 1.5,
      priorSigNKmDay_Multi: 0.85, priorSigNKmDay_Short: 0.85,
      crPrior: 1.25, defaultAgom: 0.006, noiseMeanMotionMult: 1.0,
      polishMode: "none", polishWindowDays: 13.66, polishQProcT: 0.0, polishMinArcDays: 6.0, polishMinTles: 4,
    },
    HEO: {
      windowDays: 8.0, maxTles: 20, qProcT: 0.04, agePow: 1.5,
      priorSigNKmDay_Multi: 0.85, priorSigNKmDay_Short: 0.85,
      crPrior: 1.25, defaultAgom: 0.012, noiseMeanMotionMult: 1.0,
      polishMode: "none", polishWindowDays: 4.0, polishQProcT: 0.01, polishMinArcDays: 4.0, polishMinTles: 3,
    },
    GEO: {
      windowDays: 14.0, maxTles: 20, qProcT: 0.008, agePow: 1.5,
      priorSigNKmDay_Multi: 0.85, priorSigNKmDay_Short: 0.85,
      crPrior: 1.25, defaultAgom: 0.012, noiseMeanMotionMult: 1.0,
      polishMode: "none", polishWindowDays: 13.66, polishQProcT: 0.002, polishMinArcDays: 6.0, polishMinTles: 4,
    },
  },
};

export function mergeApTuning(base, patch = {}) {
  const out = {
    ...base,
    ...patch,
    srpEnableRegimes: patch.srpEnableRegimes ? [...patch.srpEnableRegimes] : [...(base.srpEnableRegimes || [])],
    regimes: {},
  };
  for (const r of Object.keys(base.regimes)) {
    const mergedReg = { ...base.regimes[r], ...(patch.regimes?.[r] || {}) };
    if (mergedReg.ar1TauDays) mergedReg.ar1TauDays = [...mergedReg.ar1TauDays];
    if (mergedReg.ar1Eta) mergedReg.ar1Eta = [...mergedReg.ar1Eta];
    out.regimes[r] = mergedReg;
  }
  return out;
}

// Round-50 Champion Baseline Tuning (preserved immutably for A/B ablation comparison)
export const ROUND50_AP_TUNING = mergeApTuning(BASELINE_AP_TUNING, {
  fitTesseralMode: "leoZero",
  emitMaxEcc: 0.45,
  subsampleMode: "even",
  enableContinuousThrustScreen: true,
  continuousThrustMaxTles: 3,
  continuousThrustNoiseMult: 4.0,
  useDiscosDragPrior: true,
  cdPrior: 2.25,
  bstarTrustAltKm: 740.0,
  dragCeilingKm: 1050.0,
  dragMinTles: 5,
  dragMinArcDays: 2.5,
  priorSigLnB_Discos: 0.15,
  priorSigLnB_NoDiscos: 0.45,
  srpEnableRegimes: ["MEO", "HEO", "GEO"],
  srpMinTles: 8,
  srpMinArcDays: 8.0,
  priorSigLnA: 0.38,
  clusterTauDays: 0.40,
  clusterStrength: 0.80,
  velRMult: 0.85,
  velTMult: 2.2,
  velNMult: 0.85,
  huberK: 2.5,
  maxIterStageB: 4,
  covScaleMult: 3.3473,
  covFloorMult: 2.4231,
  regimes: {
    LOW_LEO: {
      windowDays: 5.0,
      maxTles: 24,
      qProcT: 0.06,
      priorSigNKmDay_Multi: 25.0,
      priorSigNKmDay_Short: 2.5,
      polishMode: "3dof_inplane",
      polishWindowDays: 1.3,
      polishQProcT: 0.015,
      polishMinArcDays: 3.0,
      polishMinTles: 3,
    },
    MID_LEO: {
      windowDays: 7.0,
      maxTles: 32,
      qProcT: 0.015,
      priorSigNKmDay_Multi: 25.0,
      polishMode: "3dof_inplane",
      polishWindowDays: 1.5,
      polishQProcT: 0.008,
      polishMinArcDays: 3.5,
      polishMinTles: 3,
    },
    HIGH_LEO: {
      windowDays: 6.2,
      maxTles: 28,
      qProcT: 0.008,
      priorSigNKmDay_Multi: 25.0,
      noiseMeanMotionMult: 0.1495,
      polishMode: "3dof_inplane",
      polishWindowDays: 1.8,
      polishQProcT: 0.004,
      polishMinArcDays: 4.0,
      polishMinTles: 3,
    },
    MEO: {
      windowDays: 43.34,
      maxTles: 88,
      qProcT: 0.00015,
      priorSigNKmDay_Multi: 30.0,
      crPrior: 1.32,
      defaultAgom: 0.0065,
      noiseMeanMotionMult: 0.1495,
      polishMode: "3dof_inplane",
      polishWindowDays: 1.8,
      polishQProcT: 0.002,
      polishMinArcDays: 6.0,
      polishMinTles: 4,
    },
    HEO: {
      windowDays: 19.54,
      maxTles: 48,
      qProcT: 0.001,
      priorSigNKmDay_Multi: 30.0,
      crPrior: 1.30,
      defaultAgom: 0.012,
      noiseMeanMotionMult: 0.4057,
      polishMode: "5dof_geom",
      polishWindowDays: 0.8,
      polishQProcT: 0.003,
      polishMinArcDays: 4.0,
      polishMinTles: 3,
      polishMinK: 1,
      polishAnchorEcc: 0.0004,
      polishVelMult: 2.0,
    },
    GEO: {
      windowDays: 27.32,
      maxTles: 60,
      qProcT: 0.001,
      priorSigNKmDay_Multi: 35.0,
      crPrior: 1.30,
      defaultAgom: 0.012,
      noiseMeanMotionMult: 1.0,
      polishMode: "3dof_inplane",
      polishWindowDays: 1.0,
      polishQProcT: 0.004,
      polishMinArcDays: 6.0,
      polishMinTles: 4,
      polishMinK: 1,
      polishAnchorEcc: 0.0003,
      polishVelMult: 12.0,
    },
  },
});

export let DEFAULT_AP_TUNING = mergeApTuning(ROUND50_AP_TUNING, {
  // Upgrade #1: Fleet-wide passive LEO $DCL DCA_COMMON_MODE (750..980 km HIGH_LEO thermospheric common-mode)
  enableDcaCommonMode: true,
  dcaMinAltKm: 750.0,
  dcaCeilingKm: 980.0,
  // Upgrade #2: Multi-month Huber-Kalman BTERM & AGOM tracking + J22 resonant-libration-safe thrust screen + short-arc prior scaling
  fixResonantThrustScreen: true,
  shortArcPriorScale: true,
  enableRollingPriors: true,
  rollingBtermMinAltKm: 750.0,
  rollingBtermMaxAltKm: 980.0,
  minRollingSigLnB: 0.16,
  rollingAgomRegimes: ["MEO", "HEO"],
  // Upgrade #3: Analytical SGP4-to-AP 31x31 tesseral short-periodic de-biasing + Exact AR(1)+White Cholesky GLS
  enableAr1Gls: true,
  // Upgrade #4: Block-specific attitude-law Box-Wing SRP modulation + IERS 2010 degree-2 solid-Earth k2 tides
  enableBoxwing: true,
  enableTides: true,
  boxwingForecastDays: 3.0,
  regimes: {
    LOW_LEO: {
      ar1TauDays: [0.4, 0.4, 0.4, 0.3, 0.3, 0.3],
      ar1Eta: [0.20, 0.25, 0.20, 0.15, 0.15, 0.15],
      clusterStrengthOverride: 0.0,
    },
    MID_LEO: {
      ar1TauDays: [0.6, 0.6, 0.6, 0.4, 0.4, 0.4],
      ar1Eta: [0.19, 0.247, 0.19, 0.22, 0.22, 0.22],
      clusterStrengthOverride: 0.0,
    },
    HIGH_LEO: {
      spBiasTessAlpha: -0.45,
      spBiasNodeOnly: true,
      ar1TauDays: [0.85, 0.85, 0.85, 0.5, 0.5, 0.5],
      ar1Eta: [0.228, 0.285, 0.228, 0.28, 0.28, 0.28],
      clusterStrengthOverride: 0.0,
    },
    MEO: {
      spBiasTessAlpha: -1.0,
      ar1TauDays: [0.6, 0.6, 0.6, 0.42, 0.42, 0.42],
      ar1Eta: [0.38, 0.38, 0.38, 0.209, 0.209, 0.209],
      clusterStrengthOverride: 0.0,
    },
    HEO: {
      spBiasTessAlpha: -1.0,
      ar1TauDays: [0.6, 0.6, 0.6, 0.42, 0.42, 0.42],
      ar1Eta: [0.247, 0.266, 0.247, 0.18, 0.18, 0.18],
      clusterStrengthOverride: 0.0,
    },
    GEO: {
      spBiasTessAlpha: -0.5,
      ar1TauDays: [0.6, 0.6, 0.6, 0.42, 0.42, 0.42],
      ar1Eta: [0.323, 0.323, 0.323, 0.22, 0.22, 0.22],
      clusterStrengthOverride: 0.0,
    },
  },
});

function subsampleEvenly(arr, maxLen) {
  if (arr.length <= maxLen) return arr;
  if (maxLen <= 1) return [arr[arr.length - 1]];
  const out = [];
  let prevIdx = -1;
  for (let j = 0; j < maxLen; j++) {
    const idx = Math.round((j * (arr.length - 1)) / (maxLen - 1));
    if (idx !== prevIdx) {
      out.push(arr[idx]);
      prevIdx = idx;
    }
  }
  return out;
}

/**
 * Fits a canonical SPEC 12 / SPEC 15 `MEAN_ELEMENT_THEORY = AP` `$OCM` strictly to own-epoch
 * (`t = t_epoch`, minutes = 0.0) SGP4 GCRF states, using SSN sensor-fence weighting and maneuver segmentation!
 * 100% WASM physics (`sdn-ap@0.6.5` `propagate`), zero JS physics, zero `USER_DEFINED_*` fields!
 */
export async function fitPureOwnEpochAp({
  sdnApHost,
  accessHost = null,
  mnvHost = null,
  ermPayload = null,
  obj, // { norad, name, objectId, objectType, tles }
  spw, // output of buildSpaceWeather
  physicalPrior = null, // optional { areaToMassM2Kg } from DISCOS/SATCAT registry
  dcaRecord = null, // optional solved $DCL record from buildCausalDcaAndRollingPriors
  rollingPrior = null, // optional multi-month rolling Kalman BTERM/AGOM posterior from buildCausalDcaAndRollingPriors
  maxTles = 16,
  maxWindowDays = 8.0,
  tuning = null,
  precomputed = null, // optional { sgpByKey, ssnByKey, mnvCache }
}) {
  if (!obj.tles || obj.tles.length === 0) {
    return { ok: false, error: "no-tles" };
  }

  const cfg = tuning || DEFAULT_AP_TUNING;
  const latestRaw = obj.tles[obj.tles.length - 1];
  const initRegime = classifyOrbitRegime(latestRaw.n, latestRaw.e).regime;
  const initRegCfg = cfg.regimes[initRegime] || cfg.regimes.HEO;

  // 1. Regime-adaptive causal window (driven directly by cfg.regimes[initRegime])
  const effWindowDays = initRegCfg.windowDays;
  const effMaxTles = initRegCfg.maxTles;

  const latestD70 = latestRaw.d70;
  const recentTlesAll = obj.tles.filter((t) => latestD70 - t.d70 <= effWindowDays + 1e-6);
  const screenCap = Math.max(64, effMaxTles * 2);
  const screenPool = recentTlesAll.length <= screenCap ? recentTlesAll : recentTlesAll.slice(recentTlesAll.length - screenCap);

  // 2. Screen & segment unknown maneuvers across full recent window BEFORE capping (Exa Research #2)
  const fixResThrust = Boolean(cfg.fixResonantThrustScreen);
  let cleanIndices, maneuverInfo;
  const mnvKey = precomputed?.mnvCache && screenPool.length > 0
    ? `${obj.norad}:${screenPool.length}:${screenPool[0].d70.toFixed(7)}:${screenPool[screenPool.length - 1].d70.toFixed(7)}:fr${fixResThrust ? 1 : 0}`
    : null;
  if (mnvKey && precomputed.mnvCache.has(mnvKey)) {
    ({ cleanIndices, maneuverInfo } = precomputed.mnvCache.get(mnvKey));
  } else {
    ({ cleanIndices, maneuverInfo } = await screenAndSegmentManeuvers(sdnApHost, mnvHost, ermPayload, screenPool, fixResThrust));
    if (mnvKey) precomputed.mnvCache.set(mnvKey, { cleanIndices, maneuverInfo });
  }

  let cleanFull = cleanIndices.map((idx) => screenPool[idx]);
  if (cfg.enableContinuousThrustScreen && maneuverInfo.continuousThrust && cleanFull.length > cfg.continuousThrustMaxTles) {
    cleanFull = cleanFull.slice(cleanFull.length - cfg.continuousThrustMaxTles);
  }
  const cleanTles = cfg.subsampleMode === "even"
    ? subsampleEvenly(cleanFull, effMaxTles)
    : (cleanFull.length <= effMaxTles ? cleanFull : cleanFull.slice(cleanFull.length - effMaxTles));

  // 3. Evaluate SGP4 strictly at own epoch (t = t_epoch, minutes = 0.0 ONLY!)
  let sgpOwnAll;
  if (precomputed?.sgpByKey) {
    const missing = cleanTles.filter((t) => !precomputed.sgpByKey.has(t.d70.toFixed(9)));
    if (missing.length > 0) {
      const calc = evalSgp4OwnEpochs(sdnApHost, missing);
      for (let i = 0; i < missing.length; i++) precomputed.sgpByKey.set(missing[i].d70.toFixed(9), calc[i]);
    }
    sgpOwnAll = cleanTles.map((t) => precomputed.sgpByKey.get(t.d70.toFixed(9)));
  } else {
    sgpOwnAll = evalSgp4OwnEpochs(sdnApHost, cleanTles);
  }
  const validMask = sgpOwnAll.map((s) => s.status === 0 && s.rGcrf.every(Number.isFinite));
  const tles = cleanTles.filter((_, i) => validMask[i]);
  const sgpOwn = sgpOwnAll.filter((_, i) => validMask[i]);
  if (tles.length === 0) {
    return { ok: false, error: "all-sgp4-own-epochs-failed" };
  }

  // 4. Classify SSN operational epoch provenance via batched WASM analysis/access (Exa Research #1)
  let ssnClasses;
  if (precomputed?.ssnByKey) {
    const missIdx = [];
    for (let i = 0; i < tles.length; i++) {
      if (!precomputed.ssnByKey.has(tles[i].d70.toFixed(9))) missIdx.push(i);
    }
    if (missIdx.length > 0) {
      const calc = await classifySsnEpochsBatch(accessHost, missIdx.map((i) => tles[i]), missIdx.map((i) => sgpOwn[i]));
      for (let k = 0; k < missIdx.length; k++) precomputed.ssnByKey.set(tles[missIdx[k]].d70.toFixed(9), calc[k]);
    }
    ssnClasses = tles.map((t) => precomputed.ssnByKey.get(t.d70.toFixed(9)));
  } else {
    ssnClasses = await classifySsnEpochsBatch(accessHost, tles, sgpOwn);
  }

  const m = tles.length;
  const refTle = tles[m - 1];
  const refEpochIso = sgpOwn[m - 1].epochIso;
  const arcDays = tles[m - 1].d70 - tles[0].d70;
  const { regime, aKm, hpKm } = classifyOrbitRegime(refTle.n, refTle.e);
  const regCfg = cfg.regimes[regime] || cfg.regimes.HEO;

  // Decide dynamic solve-for parameters strictly where physically observable above TLE own-epoch noise
  const solveDrag = hpKm < cfg.dragCeilingKm && m >= cfg.dragMinTles && arcDays >= cfg.dragMinArcDays;
  const solveSrp = (cfg.srpEnableRegimes || []).includes(regime) && m >= cfg.srpMinTles && arcDays >= cfg.srpMinArcDays;
  const activeParamIndices = [0, 1, 2, 3, 4, 5];
  if (solveDrag) activeParamIndices.push(6);
  if (solveSrp) activeParamIndices.push(7);
  const npFit = activeParamIndices.length;

  // Build compact SPW slice covering [tles[0] - 2d .. tles[m-1] + 2d] for fast inner Gauss-Newton calls,
  // and full 35-day horizon SPW rows for the final emitted $OCM!
  const fitStartDate = new Date((tles[0].d70 - 2) * 86400000).toISOString().slice(0, 10);
  const fitStopDate = new Date((tles[m - 1].d70 + 3) * 86400000).toISOString().slice(0, 10);
  const emitStopDate = new Date((tles[m - 1].d70 + 32) * 86400000).toISOString().slice(0, 10);

  const toSpwT = (r) => {
    const props = {
      DATE: r.date,
      F107_OBS: r.f107,
      F107_OBS_CENTER81: r.f107Center81,
      AP_AVG: r.ap,
      F107_DATA_TYPE: r.dataType,
    };
    if (r.ap3h) {
      [props.AP_1, props.AP_2, props.AP_3, props.AP_4, props.AP_5, props.AP_6, props.AP_7, props.AP_8] = r.ap3h;
    }
    return Object.assign(new SPWT(), props);
  };
  const spwFitRows = spw.rows.filter((r) => r.date >= fitStartDate && r.date <= fitStopDate).map(toSpwT);
  const spwFullRows = spw.rows.filter((r) => r.date >= fitStartDate && r.date <= emitStopDate).map(toSpwT);

  // Upgrade #1: Fleet-wide passive LEO $DCL DCA_COMMON_MODE log-density calibration nodes
  const dcaMinKm = cfg.dcaMinAltKm ?? 0.0;
  const dcaMaxKm = cfg.dcaCeilingKm ?? 1000.0;
  const useDca = Boolean(cfg.enableDcaCommonMode && dcaRecord && hpKm >= dcaMinKm && hpKm < dcaMaxKm);
  let dcaFitSlice = null;
  if (useDca) {
    const minMs = (tles[0].d70 - 1.5) * 86400000;
    const maxMs = (tles[m - 1].d70 + 2.5) * 86400000;
    const subMs = [];
    const subS = [];
    for (let i = 0; i < dcaRecord.nodeTimesMsNum.length; i++) {
      const ms = dcaRecord.nodeTimesMsNum[i];
      if (ms >= minMs && ms <= maxMs) {
        subMs.push(dcaRecord.nodeTimesMs[i]);
        subS.push(dcaRecord.nodeLogScale[i]);
      }
    }
    dcaFitSlice = subMs.length >= 2
      ? { cid: dcaRecord.cid, nodeTimesMs: subMs, nodeLogScale: subS }
      : { cid: dcaRecord.cid, nodeTimesMs: dcaRecord.nodeTimesMs, nodeLogScale: dcaRecord.nodeLogScale };
  }

  // Initial parameter vector theta = [ex, ey, incDeg, raanDeg, uMDeg, nRevDay, lnBterm, lnAgom]
  const regAm = physicalPrior?.areaToMassM2Kg && Number.isFinite(physicalPrior.areaToMassM2Kg) && physicalPrior.areaToMassM2Kg > 0
    ? physicalPrior.areaToMassM2Kg
    : null;

  const rollBMinKm = cfg.rollingBtermMinAltKm ?? 560.0;
  const rollBMaxKm = cfg.rollingBtermMaxAltKm ?? 980.0;
  const minRollSigLnB = cfg.minRollingSigLnB ?? 0.16;

  let btermPrior;
  let priorSigLnB = regAm !== null ? cfg.priorSigLnB_Discos : cfg.priorSigLnB_NoDiscos;
  if (
    cfg.enableRollingPriors &&
    rollingPrior?.btermPost > 0 &&
    Number.isFinite(rollingPrior.sigLnBPost) &&
    hpKm >= rollBMinKm &&
    hpKm < rollBMaxKm
  ) {
    btermPrior = Math.min(5.0, Math.max(1e-5, rollingPrior.btermPost));
    priorSigLnB = Math.max(minRollSigLnB, Math.min(0.55, rollingPrior.sigLnBPost));
  } else if (cfg.enableRollingPriors && rollingPrior?.btermPost > 0 && regAm === null && hpKm < rollBMinKm) {
    // Below rollBMinKm, use empirical-Bayes/rolling BTERM mean only when DISCOS A/m is missing, keeping loose priorSigLnB so local solveDrag adapts freely!
    btermPrior = Math.min(5.0, Math.max(1e-5, rollingPrior.btermPost));
    priorSigLnB = cfg.priorSigLnB_NoDiscos;
  } else if (cfg.useDiscosDragPrior) {
    const posBstars = tles.map((t) => t.bstar).filter((b) => b > 1e-6 && b < 0.2).sort((a, b) => a - b);
    const medBstar = posBstars.length > 0 ? posBstars[Math.floor(posBstars.length * 0.5)] : null;
    const btermFromBstar = medBstar !== null ? Math.min(5.0, Math.max(1e-5, medBstar * 12.741621)) : null;
    if (regAm !== null) {
      const btermDiscos = Math.min(5.0, Math.max(1e-5, cfg.cdPrior * regAm));
      if (hpKm >= cfg.bstarTrustAltKm || btermFromBstar === null) {
        btermPrior = btermDiscos;
      } else {
        btermPrior = Math.exp(0.65 * Math.log(btermDiscos) + 0.35 * Math.log(btermFromBstar));
      }
    } else if (btermFromBstar !== null && hpKm < cfg.bstarTrustAltKm + 150.0) {
      btermPrior = btermFromBstar;
    } else {
      btermPrior = hpKm < 900.0 ? 0.012 : 0.008;
    }
  } else {
    btermPrior = Math.min(5.0, Math.max(1e-5, Math.abs(refTle.bstar || 5e-5) * 12.741621));
  }

  let agomPrior = regAm !== null
    ? Math.min(2.0, Math.max(1e-5, regCfg.crPrior * regAm))
    : regCfg.defaultAgom;
  let priorSigLnA = cfg.priorSigLnA;
  const rollAgomRegs = cfg.rollingAgomRegimes ?? ["MEO", "HEO"];
  if (
    cfg.enableRollingPriors &&
    rollAgomRegs.includes(regime) &&
    rollingPrior?.agomPost > 0 &&
    Number.isFinite(rollingPrior.sigLnAgomPost) &&
    hpKm >= 1200.0
  ) {
    agomPrior = Math.min(2.0, Math.max(1e-5, rollingPrior.agomPost));
    priorSigLnA = Math.max(0.08, Math.min(0.45, rollingPrior.sigLnAgomPost));
  }
  const blockCode = rollingPrior?.blockCode ?? classifySpacecraftBlock(obj, regime);

  const argp0Rad = refTle.argp * DEG2RAD;
  const e0 = Math.max(1e-6, refTle.e);
  const nBrouwer0 = kozaiToBrouwerMeanMotion(refTle.n, e0, refTle.inc);
  const theta = new Float64Array([
    e0 * Math.cos(argp0Rad),
    e0 * Math.sin(argp0Rad),
    refTle.inc,
    wrap360(refTle.raan),
    wrap360(refTle.argp + refTle.ma),
    nBrouwer0,
    Math.log(btermPrior),
    Math.log(agomPrior),
  ]);

  // Finite-difference step sizes in theta
  const fdSteps = [
    2e-6, // ex
    2e-6, // ey
    1e-4, // inc (deg)
    1e-4, // raan (deg)
    1e-4, // uM (deg)
    Math.max(1e-7, 2e-6 / Math.max(0.5, arcDays)), // n (rev/day)
    0.05, // lnBterm (5% relative)
    0.05, // lnAgom (5% relative)
  ];

  // Determine fit-time tesseral degree (de-aliases mean elements from SGP4's omitted t=0 short-period tesserals)
  const fitTesseralOverride =
    cfg.fitTesseralMode === "allZeroFit" ? 0 :
    cfg.fitTesseralMode === "leoZero" ? (regime.endsWith("LEO") ? 0 : null) : null;

  // Helper: propagate a batch of trial theta vectors at given epochIsos in GCRF (or TEME) in ONE WASM call!
  const evalBatchAp = async (thetaList, epochIsos, outputFrame = PCF.pcfOutputFrame.GCRF, tessOverride = fitTesseralOverride) => {
    const pcfT = Object.assign(new PCF.PCFT(), {
      OUTPUT: Object.assign(new PCF.PCFOutputT(), {
        FRAME: outputFrame,
        EPOCHS: epochIsos,
        MAXIMUM_STATES: Math.max(1000, thetaList.length * epochIsos.length + 16),
      }),
    });
    const bPcf = new flatbuffers.Builder(Math.max(512, epochIsos.length * 48));
    bPcf.finish(pcfT.pack(bPcf), "$PCF");
    const inputs = thetaList.map((th) => {
      const cl = thetaToClassical(th);
      const effTess = tessOverride !== null ? tessOverride : (cl.e > cfg.emitMaxEcc ? 0 : 31);
      return {
        portId: "ocm",
        typeRef: TYPES.OCM,
        payload: buildTrialApOcmBytes(obj.norad, refEpochIso, cl, spwFitRows, effTess, dcaFitSlice),
      };
    });
    inputs.push({ portId: "configuration", typeRef: TYPES.PCF, payload: bPcf.asUint8Array() });

    const res = await sdnApHost.invoke({ methodId: "propagate", inputs });
    if (res.statusCode !== 0 || res.outputs.length !== thetaList.length) {
      return null;
    }
    return res.outputs.map((o) => {
      const oem = OEM.getRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(o.payload)));
      const blk = oem.EPHEMERIS_DATA_BLOCK(0);
      const nL = blk.ephemerisDataLinesLength();
      const states = new Array(nL);
      for (let k = 0; k < nL; k++) {
        const l = blk.EPHEMERIS_DATA_LINES(k);
        states[k] = { r: [l.X(), l.Y(), l.Z()], v: [l.X_DOT(), l.Y_DOT(), l.Z_DOT()] };
      }
      return states;
    });
  };

  // Stage A: 2 fast single-epoch (t_0 = refEpochIso) iterations solving ONLY the 5 geometric Brouwer elements
  // [ex, ey, inc, raan, uM] (p = 0..4), keeping theta[5] = nBrouwer0 locked so osculating velocity truncation never corrupts mean motion!
  for (let initIt = 0; initIt < 2; initIt++) {
    const batch = [theta];
    for (let p = 0; p < 5; p++) {
      const thP = Float64Array.from(theta);
      thP[p] += fdSteps[p];
      batch.push(thP);
    }
    const res = await evalBatchAp(batch, [refEpochIso]);
    if (!res) break;
    const nom = res[0][0];
    const tgt = sgpOwn[m - 1];
    const errPosU = vecToUvw(tgt.rGcrf, tgt.vGcrf, [nom.r[0] - tgt.rGcrf[0], nom.r[1] - tgt.rGcrf[1], nom.r[2] - tgt.rGcrf[2]]);
    const errVelU = vecToUvw(tgt.rGcrf, tgt.vGcrf, [nom.v[0] - tgt.vGcrf[0], nom.v[1] - tgt.vGcrf[1], nom.v[2] - tgt.vGcrf[2]]);
    const err6 = [errPosU[0], errPosU[1], errPosU[2], errVelU[0], errVelU[1], errVelU[2]];
    const w6 = [1 / 0.05, 1 / 0.05, 1 / 0.05, 1 / 0.0002, 1 / 0.05, 1 / 0.0001];
    const A5 = new Float64Array(25);
    const b5 = new Float64Array(5);
    for (let p = 0; p < 5; p++) {
      const stepP = fdSteps[p];
      const stP = res[1 + p][0];
      const jPos = vecToUvw(tgt.rGcrf, tgt.vGcrf, [(stP.r[0] - nom.r[0]) / stepP, (stP.r[1] - nom.r[1]) / stepP, (stP.r[2] - nom.r[2]) / stepP]);
      const jVel = vecToUvw(tgt.rGcrf, tgt.vGcrf, [(stP.v[0] - nom.v[0]) / stepP, (stP.v[1] - nom.v[1]) / stepP, (stP.v[2] - nom.v[2]) / stepP]);
      const Jcol = [jPos[0], jPos[1], jPos[2], jVel[0], jVel[1], jVel[2]];
      for (let q = 0; q < 5; q++) {
        const stepQ = fdSteps[q];
        const stQ = res[1 + q][0];
        const qPos = vecToUvw(tgt.rGcrf, tgt.vGcrf, [(stQ.r[0] - nom.r[0]) / stepQ, (stQ.r[1] - nom.r[1]) / stepQ, (stQ.r[2] - nom.r[2]) / stepQ]);
        const qVel = vecToUvw(tgt.rGcrf, tgt.vGcrf, [(stQ.v[0] - nom.v[0]) / stepQ, (stQ.v[1] - nom.v[1]) / stepQ, (stQ.v[2] - nom.v[2]) / stepQ]);
        const JcolQ = [qPos[0], qPos[1], qPos[2], qVel[0], qVel[1], qVel[2]];
        let s = 0;
        for (let c = 0; c < 6; c++) s += Jcol[c] * JcolQ[c] * w6[c] * w6[c];
        A5[p * 5 + q] = s;
      }
      A5[p * 5 + p] += 1e-8;
      let rhs = 0;
      for (let c = 0; c < 6; c++) rhs -= Jcol[c] * err6[c] * w6[c] * w6[c];
      b5[p] = rhs;
    }
    const sol = solveSpdAndInvert(A5, b5, 5);
    if (!sol) break;
    for (let p = 0; p < 5; p++) theta[p] += sol.dx[p];
    theta[3] = wrap360(theta[3]);
    theta[4] = wrap360(theta[4]);
  }

  // Temporal density weights (de-clusters bursts of redundant same-day TLEs so multi-day windows integrate uniformly)
  const effClusterStrength = regCfg.clusterStrengthOverride !== undefined && regCfg.clusterStrengthOverride !== null
    ? regCfg.clusterStrengthOverride
    : cfg.clusterStrength;
  const clusterMult = new Float64Array(m).fill(1.0);
  if (cfg.clusterTauDays > 0 && effClusterStrength > 0 && m >= 3) {
    for (let k = 0; k < m; k++) {
      let nEff = 0.0;
      for (let j = 0; j < m; j++) {
        nEff += Math.exp(-Math.abs(tles[k].d70 - tles[j].d70) / cfg.clusterTauDays);
      }
      clusterMult[k] = Math.sqrt(1.0 + effClusterStrength * Math.max(0.0, nEff - 1.0));
    }
  }

  // Stage B: Multi-Epoch SSN-Weighted + Process-Noise IRLS Gauss-Newton / AR(1) Cholesky GLS (Secular Pass)
  const epochIsos = sgpOwn.map((s) => s.epochIso);

  // Upgrade #3a: Analytical SGP4-to-AP instantaneous 31x31 tesseral short-periodic de-biasing at each own epoch t_k
  let spBiasRvGcrf = null;
  const spBiasTessAlpha = regCfg.spBiasTessAlpha ?? 0.0;
  if (m >= 2 && Math.abs(spBiasTessAlpha) > 1e-6) {
    const pcfSp = Object.assign(new PCF.PCFT(), {
      OUTPUT: Object.assign(new PCF.PCFOutputT(), {
        FRAME: PCF.pcfOutputFrame.GCRF,
        EPOCHS: epochIsos,
        MAXIMUM_STATES: Math.max(1000, 2 * epochIsos.length + 16),
      }),
    });
    const bPcfSp = new flatbuffers.Builder(Math.max(512, epochIsos.length * 48));
    bPcfSp.finish(pcfSp.pack(bPcfSp), "$PCF");
    const clStageA = thetaToClassical(theta);
    const spRes = await sdnApHost.invoke({
      methodId: "propagate",
      inputs: [
        { portId: "ocm", typeRef: TYPES.OCM, payload: buildTrialApOcmBytes(obj.norad, refEpochIso, clStageA, spwFitRows, 31, dcaFitSlice) },
        { portId: "ocm", typeRef: TYPES.OCM, payload: buildTrialApOcmBytes(obj.norad, refEpochIso, clStageA, spwFitRows, 0, dcaFitSlice) },
        { portId: "configuration", typeRef: TYPES.PCF, payload: bPcfSp.asUint8Array() },
      ],
    });
    if (spRes.statusCode === 0 && spRes.outputs.length === 2) {
      const oem31 = OEM.getRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(spRes.outputs[0].payload))).EPHEMERIS_DATA_BLOCK(0);
      const oem0 = OEM.getRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(spRes.outputs[1].payload))).EPHEMERIS_DATA_BLOCK(0);
      if (oem31.ephemerisDataLinesLength() === m && oem0.ephemerisDataLinesLength() === m) {
        spBiasRvGcrf = new Float64Array(6 * m);
        for (let k = 0; k < m; k++) {
          const alphaK = regCfg.spBiasNodeOnly
            ? (ssnClasses[k] === "ASCENDING_NODE" ? spBiasTessAlpha : 0.0)
            : spBiasTessAlpha;
          if (alphaK === 0.0) continue;
          const l31 = oem31.EPHEMERIS_DATA_LINES(k);
          const l0 = oem0.EPHEMERIS_DATA_LINES(k);
          spBiasRvGcrf[k * 6 + 0] = alphaK * (l31.X() - l0.X());
          spBiasRvGcrf[k * 6 + 1] = alphaK * (l31.Y() - l0.Y());
          spBiasRvGcrf[k * 6 + 2] = alphaK * (l31.Z() - l0.Z());
          spBiasRvGcrf[k * 6 + 3] = alphaK * (l31.X_DOT() - l0.X_DOT());
          spBiasRvGcrf[k * 6 + 4] = alphaK * (l31.Y_DOT() - l0.Y_DOT());
          spBiasRvGcrf[k * 6 + 5] = alphaK * (l31.Z_DOT() - l0.Z_DOT());
        }
      }
    }
  }

  const qProcT_Km = regCfg.qProcT;
  const agePow = regCfg.agePow ?? 1.5;
  const buildEpochNoise = (qT, indices = null) => {
    const idxList = indices || tles.map((_, k) => k);
    return idxList.map((k) => {
      const t = tles[k];
      const base = getOwnEpochNoiseSigmas(regime, ssnClasses[k]);
      const ageDays = Math.max(0.0, tles[m - 1].d70 - t.d70);
      const procTKm = qT * Math.pow(ageDays, agePow);
      const procRNKm = 0.20 * procTKm;
      const ascMult = ssnClasses[k] === "ASCENDING_NODE" ? (cfg.ascNodeExtraTMult ?? 1.0) : 1.0;
      const cMult = clusterMult[k];
      return {
        sigPosKm: [
          Math.hypot(base.sigPosKm[0], procRNKm) * cMult,
          Math.hypot(base.sigPosKm[1] * ascMult, procTKm) * cMult,
          Math.hypot(base.sigPosKm[2], procRNKm) * cMult,
        ],
        sigVelKmS: [
          base.sigVelKmS[0] * (cfg.velRMult ?? 1.0) * (1.0 + 0.08 * ageDays) * cMult,
          base.sigVelKmS[1] * (cfg.velTMult ?? 1.0) * (1.0 + 0.08 * ageDays) * cMult,
          base.sigVelKmS[2] * (cfg.velNMult ?? 1.0) * (1.0 + 0.08 * ageDays) * cMult,
        ],
      };
    });
  };
  const epochNoise = buildEpochNoise(qProcT_Km);

  const maxIter = m === 1 ? 1 : (cfg.maxIterStageB ?? 4);
  let normalInv = null;
  let chi2Sum = 0;
  let dofCount = 0;
  let postFitUvwPosKm = [];
  let converged = true;

  const singleEpochPriors = [1e-2, 1e-2, 0.5, 0.5, 0.5, 1.5e-5];
  const huberK = cfg.huberK ?? 2.5;

  const useWasmGls = m >= 2 && Boolean(cfg.enableAr1Gls || spBiasRvGcrf !== null || cfg.enableTides || cfg.enableBoxwing);
  let d70ArrWasm = null;
  let tgtRvWasm = null;
  let sigRtnWasm = null;
  if (useWasmGls) {
    d70ArrWasm = Float64Array.from(tles, (t) => t.d70);
    tgtRvWasm = new Float64Array(6 * m);
    sigRtnWasm = new Float64Array(6 * m);
    for (let k = 0; k < m; k++) {
      const tgt = sgpOwn[k];
      tgtRvWasm[k * 6 + 0] = tgt.rGcrf[0];
      tgtRvWasm[k * 6 + 1] = tgt.rGcrf[1];
      tgtRvWasm[k * 6 + 2] = tgt.rGcrf[2];
      tgtRvWasm[k * 6 + 3] = tgt.vGcrf[0];
      tgtRvWasm[k * 6 + 4] = tgt.vGcrf[1];
      tgtRvWasm[k * 6 + 5] = tgt.vGcrf[2];
      const { sigPosKm, sigVelKmS } = epochNoise[k];
      sigRtnWasm[k * 6 + 0] = sigPosKm[0];
      sigRtnWasm[k * 6 + 1] = sigPosKm[1];
      sigRtnWasm[k * 6 + 2] = sigPosKm[2];
      sigRtnWasm[k * 6 + 3] = sigVelKmS[0];
      sigRtnWasm[k * 6 + 4] = sigVelKmS[1];
      sigRtnWasm[k * 6 + 5] = sigVelKmS[2];
    }
  }

  for (let iter = 0; iter < maxIter; iter++) {
    const batch = [theta];
    for (let a = 0; a < npFit; a++) {
      const idx = activeParamIndices[a];
      const thP = Float64Array.from(theta);
      thP[idx] += fdSteps[idx];
      batch.push(thP);
    }

    const res = await evalBatchAp(batch, epochIsos, PCF.pcfOutputFrame.GCRF, fitTesseralOverride);
    if (!res) {
      converged = false;
      break;
    }
    const nomStates = res[0];

    // Bayesian MAP priors: relax priorSigN on multi-day arcs, but tighten proportionally on short post-maneuver arcs!
    let priorNKmDay = m >= 2 && arcDays >= 1.0 ? regCfg.priorSigNKmDay_Multi : regCfg.priorSigNKmDay_Short;
    if (cfg.shortArcPriorScale && m >= 2 && (m <= 4 || arcDays < 2.5)) {
      const shortScale = Math.max(0.08, Math.min(1.0, (arcDays / 3.0) * (m / 5.0)));
      priorNKmDay = Math.max(regCfg.priorSigNKmDay_Short ?? 0.85, priorNKmDay * shortScale);
    }
    const priorSigN = priorNKmDay / (TWO_PI * aKm);

    let sol = null;
    if (useWasmGls) {
      const nomRvWasm = new Float64Array(6 * m);
      const jacRvWasm = new Float64Array(npFit * 6 * m);
      for (let k = 0; k < m; k++) {
        const nom = nomStates[k];
        nomRvWasm[k * 6 + 0] = nom.r[0];
        nomRvWasm[k * 6 + 1] = nom.r[1];
        nomRvWasm[k * 6 + 2] = nom.r[2];
        nomRvWasm[k * 6 + 3] = nom.v[0];
        nomRvWasm[k * 6 + 4] = nom.v[1];
        nomRvWasm[k * 6 + 5] = nom.v[2];
        for (let a = 0; a < npFit; a++) {
          const idx = activeParamIndices[a];
          const stP = res[1 + a][k];
          const invStep = 1.0 / fdSteps[idx];
          const base = (a * m + k) * 6;
          jacRvWasm[base + 0] = (stP.r[0] - nom.r[0]) * invStep;
          jacRvWasm[base + 1] = (stP.r[1] - nom.r[1]) * invStep;
          jacRvWasm[base + 2] = (stP.r[2] - nom.r[2]) * invStep;
          jacRvWasm[base + 3] = (stP.v[0] - nom.v[0]) * invStep;
          jacRvWasm[base + 4] = (stP.v[1] - nom.v[1]) * invStep;
          jacRvWasm[base + 5] = (stP.v[2] - nom.v[2]) * invStep;
        }
      }

      const priorPrec = new Float64Array(npFit);
      const priorDiff = new Float64Array(npFit);
      for (let a = 0; a < npFit; a++) {
        const idx = activeParamIndices[a];
        if (idx === 6) {
          priorPrec[a] = 1.0 / (priorSigLnB * priorSigLnB);
          priorDiff[a] = theta[6] - Math.log(btermPrior);
        } else if (idx === 7) {
          priorPrec[a] = 1.0 / (priorSigLnA * priorSigLnA);
          priorDiff[a] = theta[7] - Math.log(agomPrior);
        } else if (idx === 5) {
          priorPrec[a] = 1.0 / (priorSigN * priorSigN);
          priorDiff[a] = theta[5] - nBrouwer0;
        } else {
          priorPrec[a] = 1e-8;
          priorDiff[a] = 0.0;
        }
      }

      const currEl = thetaToClassical(theta);
      const wasmSol = dealiasAndSolveGlsWasm({
        m,
        np: npFit,
        d70Arr: d70ArrWasm,
        tgtRvGcrf: tgtRvWasm,
        spBiasRvGcrf,
        nomRvGcrf: nomRvWasm,
        jacRvGcrf: jacRvWasm,
        sigRtn: sigRtnWasm,
        ar1TauDays: cfg.enableAr1Gls ? (regCfg.ar1TauDays || null) : null,
        ar1Eta: cfg.enableAr1Gls ? (regCfg.ar1Eta || null) : null,
        orbParams: [refTle.d70, aKm, currEl.e, currEl.inc, currEl.raan, currEl.agom, huberK, iter],
        blockCode,
        enableTides: cfg.enableTides && hpKm >= 1200.0 ? 1 : 0,
        enableBoxwing: cfg.enableBoxwing && hpKm >= 1200.0 ? 1 : 0,
        priorPrec,
        priorDiff,
      });
      if (wasmSol) {
        sol = { dx: wasmSol.dx, inv: wasmSol.inv };
        chi2Sum = wasmSol.chi2Sum;
        dofCount = wasmSol.dofCount;
        postFitUvwPosKm = wasmSol.postFitUvwPosKm;
      }
    } else {
      const A = new Float64Array(npFit * npFit);
      const rhs = new Float64Array(npFit);
      chi2Sum = 0;
      dofCount = 0;
      postFitUvwPosKm = [];

      for (let k = 0; k < m; k++) {
        const nom = nomStates[k];
        const tgt = sgpOwn[k];
        const { sigPosKm, sigVelKmS } = epochNoise[k];

        const errPosGcrf = [nom.r[0] - tgt.rGcrf[0], nom.r[1] - tgt.rGcrf[1], nom.r[2] - tgt.rGcrf[2]];
        const errVelGcrf = [nom.v[0] - tgt.vGcrf[0], nom.v[1] - tgt.vGcrf[1], nom.v[2] - tgt.vGcrf[2]];
        const resPosUvw = vecToUvw(tgt.rGcrf, tgt.vGcrf, errPosGcrf);
        const resVelUvw = vecToUvw(tgt.rGcrf, tgt.vGcrf, errVelGcrf);
        postFitUvwPosKm.push(resPosUvw);

        const zPos = Math.hypot(
          resPosUvw[0] / sigPosKm[0],
          resPosUvw[1] / sigPosKm[1],
          resPosUvw[2] / sigPosKm[2]
        ) / Math.sqrt(3.0);
        const huberW = iter >= 1 && m >= 3 && zPos > huberK ? huberK / zPos : 1.0;

        const rVec = [
          resPosUvw[0], resPosUvw[1], resPosUvw[2],
          resVelUvw[0], resVelUvw[1], resVelUvw[2],
        ];
        const invSig = [
          huberW / sigPosKm[0], huberW / sigPosKm[1], huberW / sigPosKm[2],
          huberW / sigVelKmS[0], huberW / sigVelKmS[1], huberW / sigVelKmS[2],
        ];

        for (let c = 0; c < 6; c++) {
          const wz = rVec[c] * invSig[c];
          chi2Sum += wz * wz;
          dofCount++;
        }

        const Jk = Array.from({ length: npFit }, () => new Float64Array(6));
        for (let a = 0; a < npFit; a++) {
          const idx = activeParamIndices[a];
          const stP = res[1 + a][k];
          const dPos = [
            (stP.r[0] - nom.r[0]) / fdSteps[idx],
            (stP.r[1] - nom.r[1]) / fdSteps[idx],
            (stP.r[2] - nom.r[2]) / fdSteps[idx],
          ];
          const dVel = [
            (stP.v[0] - nom.v[0]) / fdSteps[idx],
            (stP.v[1] - nom.v[1]) / fdSteps[idx],
            (stP.v[2] - nom.v[2]) / fdSteps[idx],
          ];
          const uPos = vecToUvw(tgt.rGcrf, tgt.vGcrf, dPos);
          const uVel = vecToUvw(tgt.rGcrf, tgt.vGcrf, dVel);
          Jk[a][0] = uPos[0]; Jk[a][1] = uPos[1]; Jk[a][2] = uPos[2];
          Jk[a][3] = uVel[0]; Jk[a][4] = uVel[1]; Jk[a][5] = uVel[2];
        }

        for (let a = 0; a < npFit; a++) {
          let g = 0;
          for (let c = 0; c < 6; c++) g -= Jk[a][c] * rVec[c] * invSig[c] * invSig[c];
          rhs[a] += g;
          for (let b = 0; b <= a; b++) {
            let h = 0;
            for (let c = 0; c < 6; c++) h += Jk[a][c] * Jk[b][c] * invSig[c] * invSig[c];
            A[a * npFit + b] += h;
          }
        }
      }

      for (let a = 0; a < npFit; a++) {
        for (let b = 0; b < a; b++) A[b * npFit + a] = A[a * npFit + b];
      }

      for (let a = 0; a < npFit; a++) {
        const idx = activeParamIndices[a];
        if (idx === 6) {
          const w2 = 1.0 / (priorSigLnB * priorSigLnB);
          A[a * npFit + a] += w2;
          rhs[a] -= (theta[6] - Math.log(btermPrior)) * w2;
        } else if (idx === 7) {
          const w2 = 1.0 / (priorSigLnA * priorSigLnA);
          A[a * npFit + a] += w2;
          rhs[a] -= (theta[7] - Math.log(agomPrior)) * w2;
        } else if (idx === 5) {
          const w2 = 1.0 / (priorSigN * priorSigN);
          A[a * npFit + a] += w2;
          rhs[a] -= (theta[5] - nBrouwer0) * w2;
        } else if (m === 1) {
          A[a * npFit + a] += 1.0 / (singleEpochPriors[idx] * singleEpochPriors[idx]);
        } else {
          A[a * npFit + a] += 1e-8;
        }
      }

      sol = solveSpdAndInvert(A, rhs, npFit);
    }

    if (!sol) {
      converged = false;
      break;
    }
    normalInv = sol.inv;
    if (m === 1) break;

    let damp = 1.0;
    const maxDe = Math.hypot(sol.dx[0], sol.dx[1]);
    if (maxDe > 0.02) damp = Math.min(damp, 0.02 / maxDe);
    for (let a = 6; a < npFit; a++) {
      if (Math.abs(sol.dx[a]) > 1.0) damp = Math.min(damp, 1.0 / Math.abs(sol.dx[a]));
    }
    let stepNorm = 0;
    for (let a = 0; a < npFit; a++) {
      const idx = activeParamIndices[a];
      const d = sol.dx[a] * damp;
      theta[idx] += d;
      stepNorm += (d / fdSteps[idx]) ** 2;
    }
    theta[3] = wrap360(theta[3]);
    theta[4] = wrap360(theta[4]);
    theta[6] = Math.max(Math.log(1e-6), Math.min(Math.log(25.0), theta[6]));
    theta[7] = Math.max(Math.log(1e-6), Math.min(Math.log(5.0), theta[7]));
    if (Math.sqrt(stepNorm) < 0.05 && iter >= 1) break;
  }

  // Stage C: Optional Two-Pass Secular-to-Epoch Polish (locks unbiased secular n_AP, BTERM, AGOM from Stage B
  // while refining epoch geometric phase on causal polishWindowDays!)
  if (
    converged &&
    regCfg.polishMode &&
    regCfg.polishMode !== "none" &&
    m >= (regCfg.polishMinTles ?? 3) &&
    arcDays >= (regCfg.polishMinArcDays ?? 3.0)
  ) {
    const polishParams =
      regCfg.polishMode === "1dof_uM" ? [4] :
      regCfg.polishMode === "3dof_inplane" ? [0, 1, 4] : [0, 1, 2, 3, 4];
    const npPol = polishParams.length;
    const kPol = [];
    for (let k = 0; k < m; k++) {
      if (tles[m - 1].d70 - tles[k].d70 <= regCfg.polishWindowDays + 1e-6) kPol.push(k);
    }
    const minKPol = regCfg.polishMinK ?? 2;
    if (kPol.length < minKPol && m >= minKPol) {
      kPol.length = 0;
      for (let j = m - minKPol; j < m; j++) kPol.push(j);
    }
    if (kPol.length >= 1) {
      const polEpochs = kPol.map((k) => sgpOwn[k].epochIso);
      const polVelMult = regCfg.polishVelMult ?? (cfg.polishVelMult ?? 1.0);
      const polNoise = buildEpochNoise(regCfg.polishQProcT ?? 0.0, kPol).map((n) => ({
        sigPosKm: n.sigPosKm,
        sigVelKmS: n.sigVelKmS.map((v) => v * polVelMult),
      }));
      const thetaStageB = Float64Array.from(theta);
      const eccAnc = regCfg.polishAnchorEcc ?? 5e-3;
      const anchorPriors = [eccAnc, eccAnc, 0.05, 0.05, 0.25];
      for (let pIt = 0; pIt < 2; pIt++) {
        const batch = [theta];
        for (let a = 0; a < npPol; a++) {
          const idx = polishParams[a];
          const thP = Float64Array.from(theta);
          thP[idx] += fdSteps[idx];
          batch.push(thP);
        }
        const res = await evalBatchAp(batch, polEpochs, PCF.pcfOutputFrame.GCRF, fitTesseralOverride);
        if (!res) break;
        const nomStates = res[0];
        const APol = new Float64Array(npPol * npPol);
        const rhsPol = new Float64Array(npPol);
        for (let j = 0; j < kPol.length; j++) {
          const k = kPol[j];
          const nom = nomStates[j];
          const tgt = sgpOwn[k];
          const { sigPosKm, sigVelKmS } = polNoise[j];
          const resPosUvw = vecToUvw(tgt.rGcrf, tgt.vGcrf, [nom.r[0] - tgt.rGcrf[0], nom.r[1] - tgt.rGcrf[1], nom.r[2] - tgt.rGcrf[2]]);
          const resVelUvw = vecToUvw(tgt.rGcrf, tgt.vGcrf, [nom.v[0] - tgt.vGcrf[0], nom.v[1] - tgt.vGcrf[1], nom.v[2] - tgt.vGcrf[2]]);
          const zPos = Math.hypot(resPosUvw[0] / sigPosKm[0], resPosUvw[1] / sigPosKm[1], resPosUvw[2] / sigPosKm[2]) / Math.sqrt(3.0);
          const huberW = kPol.length >= 3 && zPos > huberK ? huberK / zPos : 1.0;
          const rVec = [resPosUvw[0], resPosUvw[1], resPosUvw[2], resVelUvw[0], resVelUvw[1], resVelUvw[2]];
          const invSig = [
            huberW / sigPosKm[0], huberW / sigPosKm[1], huberW / sigPosKm[2],
            huberW / sigVelKmS[0], huberW / sigVelKmS[1], huberW / sigVelKmS[2],
          ];
          const Jk = Array.from({ length: npPol }, () => new Float64Array(6));
          for (let a = 0; a < npPol; a++) {
            const idx = polishParams[a];
            const stP = res[1 + a][j];
            const uPos = vecToUvw(tgt.rGcrf, tgt.vGcrf, [(stP.r[0] - nom.r[0]) / fdSteps[idx], (stP.r[1] - nom.r[1]) / fdSteps[idx], (stP.r[2] - nom.r[2]) / fdSteps[idx]]);
            const uVel = vecToUvw(tgt.rGcrf, tgt.vGcrf, [(stP.v[0] - nom.v[0]) / fdSteps[idx], (stP.v[1] - nom.v[1]) / fdSteps[idx], (stP.v[2] - nom.v[2]) / fdSteps[idx]]);
            Jk[a][0] = uPos[0]; Jk[a][1] = uPos[1]; Jk[a][2] = uPos[2];
            Jk[a][3] = uVel[0]; Jk[a][4] = uVel[1]; Jk[a][5] = uVel[2];
          }
          for (let a = 0; a < npPol; a++) {
            let g = 0;
            for (let c = 0; c < 6; c++) g -= Jk[a][c] * rVec[c] * invSig[c] * invSig[c];
            rhsPol[a] += g;
            for (let b = 0; b <= a; b++) {
              let h = 0;
              for (let c = 0; c < 6; c++) h += Jk[a][c] * Jk[b][c] * invSig[c] * invSig[c];
              APol[a * npPol + b] += h;
            }
          }
        }
        for (let a = 0; a < npPol; a++) {
          for (let b = 0; b < a; b++) APol[b * npPol + a] = APol[a * npPol + b];
          const idx = polishParams[a];
          if ((kPol.length <= 2 || regCfg.polishAnchorEcc) && idx !== 4) {
            const w2 = 1.0 / (anchorPriors[idx] * anchorPriors[idx]);
            APol[a * npPol + a] += w2;
            rhsPol[a] -= (theta[idx] - thetaStageB[idx]) * w2;
          } else {
            APol[a * npPol + a] += 1e-8;
          }
        }
        const solPol = solveSpdAndInvert(APol, rhsPol, npPol);
        if (!solPol) break;
        for (let a = 0; a < npPol; a++) {
          const idx = polishParams[a];
          theta[idx] += solPol.dx[a];
        }
        theta[3] = wrap360(theta[3]);
        theta[4] = wrap360(theta[4]);
      }
    }
  }

  // Upgrade #4b: Project solved epoch AGOM(t_0) onto average forecast horizon [t_0 .. t_0 + horizonDays] via WASM attitude box-wing law
  if (cfg.enableBoxwing && blockCode > 0 && hpKm >= 1200.0) {
    const preEl = thetaToClassical(theta);
    const bwRatio = boxwingForecastRatioWasm({
      d70Ref: refTle.d70,
      horizonDays: cfg.boxwingForecastDays ?? 5.0,
      aKm,
      e: preEl.e,
      incDeg: preEl.inc,
      raanDeg: preEl.raan,
      blockCode,
    });
    if (Number.isFinite(bwRatio) && bwRatio > 0.5 && bwRatio < 2.0) {
      theta[7] = Math.max(Math.log(1e-6), Math.min(Math.log(5.0), theta[7] + Math.log(bwRatio)));
    }
  }

  const finalEl = thetaToClassical(theta);
  const emitTesseral = finalEl.e > cfg.emitMaxEcc ? 0 : 31;

  // 5. Compute TEMEOFEPOCH Jacobian at refEpochIso + physical non-gravitational rate ng_rate via ONE WASM propagate call
  //    using emitTesseral so (r0Teme, J0) match the emitted $OCM's MAXIMUM_TESSERAL_DEGREE identically!
  const refUtcStr = /[zZ]$/.test(refEpochIso) ? refEpochIso : `${refEpochIso}Z`;
  const plusOneHourIso = new Date(Date.parse(refUtcStr) + 3600000).toISOString();
  const zeroDragTheta = Float64Array.from(theta);
  zeroDragTheta[6] = Math.log(1e-9);

  const covBatch = [theta];
  for (let a = 0; a < npFit; a++) {
    const idx = activeParamIndices[a];
    const thP = Float64Array.from(theta);
    thP[idx] += fdSteps[idx];
    covBatch.push(thP);
  }
  covBatch.push(zeroDragTheta);

  const temeRes = await evalBatchAp(covBatch, [refEpochIso, plusOneHourIso], PCF.pcfOutputFrame.TEME, emitTesseral);

  // Calibrated covariance scale factor: Birge ratio max(1, chi2 / dof) * covScaleMult
  const effDof = Math.max(1, dofCount - npFit);
  let birgeScale2 = Math.max(1.0, Math.min(16.0, chi2Sum / effDof)) * (cfg.covScaleMult ?? 1.0);
  if (maneuverInfo.detected && m <= 2) {
    birgeScale2 *= 2.25;
  }

  // SPEC 12.5 AP process-noise regime
  const apNoiseRegime = hpKm < K_DRAG_REGIME_KM ? 0 : 1;
  const kNoise = K_NOISE_AP[apNoiseRegime];

  // Empirical UVW residual covariance floor
  const floor6 = [0, 0, 0, 0, 0, 0];
  const floorMult = cfg.covFloorMult ?? 1.0;
  if (postFitUvwPosKm.length >= 2) {
    for (const u of postFitUvwPosKm) {
      floor6[0] += u[0] * u[0];
      floor6[1] += u[1] * u[0];
      floor6[2] += u[1] * u[1];
      floor6[3] += u[2] * u[0];
      floor6[4] += u[2] * u[1];
      floor6[5] += u[2] * u[2];
    }
    const scaleF = (kNoise.k_F * floorMult) / (postFitUvwPosKm.length * Math.max(1.0, Math.sqrt(m)));
    for (let k = 0; k < 6; k++) floor6[k] *= scaleF;
  } else {
    const { sigPosKm } = epochNoise[m - 1];
    floor6[0] = (sigPosKm[0] * 0.35) ** 2 * floorMult;
    floor6[2] = (sigPosKm[1] * 0.35) ** 2 * floorMult;
    floor6[5] = (sigPosKm[2] * 0.35) ** 2 * floorMult;
  }
  floor6[0] = Math.max(floor6[0], (0.003) ** 2);
  floor6[2] = Math.max(floor6[2], (0.015) ** 2);
  floor6[5] = Math.max(floor6[5], (0.005) ** 2);

  // Build COV_PARAMETER_KINDS, OD_DYNAMIC_PARAMETERS, COVARIANCE_DATA (LTM), and COV_PROPAGATION
  const covKinds = [];
  const covParamNames = [];
  const covUnits = [];
  const odDynParams = [];
  if (solveDrag) {
    covKinds.push(prwDynamicParameter.DRAG_AREA_OVER_MASS);
    covParamNames.push("DRAG_AREA_OVER_MASS");
    covUnits.push("m**2/kg");
    odDynParams.push(Object.assign(new OCMDynamicParameterT(), {
      NAME: "DRAG_AREA_OVER_MASS",
      VALUE: finalEl.bterm,
      UNITS: "m**2/kg",
      SOLVED_FOR: true,
      PARAMETER: prwDynamicParameter.DRAG_AREA_OVER_MASS,
    }));
  }
  if (solveSrp) {
    covKinds.push(prwDynamicParameter.SRP_AREA_OVER_MASS);
    covParamNames.push("SRP_AREA_OVER_MASS");
    covUnits.push("m**2/kg");
    odDynParams.push(Object.assign(new OCMDynamicParameterT(), {
      NAME: "SRP_AREA_OVER_MASS",
      VALUE: finalEl.agom,
      UNITS: "m**2/kg",
      SOLVED_FOR: true,
      PARAMETER: prwDynamicParameter.SRP_AREA_OVER_MASS,
    }));
  }

  const nk = covKinds.length;
  const covSize = 6 + nk;
  const C = new Float64Array(covSize * covSize);
  let ngRatePerDay = 0.0;

  if (temeRes && normalInv) {
    const r0Teme = temeRes[0][0].r;
    const v0Teme = temeRes[0][0].v;

    const r1WithDrag = temeRes[0][1].r;
    const v1WithDrag = temeRes[0][1].v;
    const r1ZeroDrag = temeRes[1 + npFit][1].r;
    const drDragKm = [r1WithDrag[0] - r1ZeroDrag[0], r1WithDrag[1] - r1ZeroDrag[1], r1WithDrag[2] - r1ZeroDrag[2]];
    const uvwDragKm = vecToUvw(r1WithDrag, v1WithDrag, drDragKm);
    const dtDays = 1.0 / 24.0;
    const nRadDay = finalEl.n * TWO_PI;
    ngRatePerDay = (2.0 * Math.abs(uvwDragKm[1])) / (aKm * nRadDay * dtDays * dtDays);

    const J0 = new Float64Array(covSize * npFit);
    for (let a = 0; a < npFit; a++) {
      const idx = activeParamIndices[a];
      const stP = temeRes[1 + a][0];
      J0[0 * npFit + a] = (stP.r[0] - r0Teme[0]) / fdSteps[idx];
      J0[1 * npFit + a] = (stP.r[1] - r0Teme[1]) / fdSteps[idx];
      J0[2 * npFit + a] = (stP.r[2] - r0Teme[2]) / fdSteps[idx];
      J0[3 * npFit + a] = (stP.v[0] - v0Teme[0]) / fdSteps[idx];
      J0[4 * npFit + a] = (stP.v[1] - v0Teme[1]) / fdSteps[idx];
      J0[5 * npFit + a] = (stP.v[2] - v0Teme[2]) / fdSteps[idx];
    }
    let dynRow = 6;
    if (solveDrag) {
      const aDrag = activeParamIndices.indexOf(6);
      J0[dynRow * npFit + aDrag] = finalEl.bterm;
      dynRow++;
    }
    if (solveSrp) {
      const aSrp = activeParamIndices.indexOf(7);
      J0[dynRow * npFit + aSrp] = finalEl.agom;
    }

    for (let i = 0; i < covSize; i++) {
      for (let j = 0; j <= i; j++) {
        let s = 0;
        for (let a = 0; a < npFit; a++) {
          let pRowSum = 0;
          for (let b = 0; b < npFit; b++) {
            pRowSum += normalInv[a * npFit + b] * J0[j * npFit + b];
          }
          s += J0[i * npFit + a] * pRowSum;
        }
        C[i * covSize + j] = C[j * covSize + i] = birgeScale2 * s;
      }
    }

    const S6 = new Float64Array(36);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) S6[i * 6 + j] = C[i * covSize + j];
      S6[i * 6 + i] += i < 3 ? 1e-10 : 1e-16;
    }
    addFloorTeme6x6(floor6, r0Teme, v0Teme, S6);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) C[i * covSize + j] = 0.5 * (S6[i * 6 + j] + S6[j * 6 + i]);
    }
  }

  const covLtm = [];
  for (let i = 0; i < covSize; i++) {
    for (let j = 0; j <= i; j++) covLtm.push(C[i * covSize + j]);
  }

  // Exact SPEC 12 noise_invariant: NOISE_NON_GRAVITATIONAL_RAD_DAY2 === share * |ng_rate| * (n * 2 * pi)
  const nDayRad = finalEl.n * TWO_PI;
  const noiseNgRadDay2 = kNoise.c * Math.abs(ngRatePerDay) * nDayRad;
  const ctNoiseMult = cfg.enableContinuousThrustScreen && maneuverInfo.continuousThrust
    ? (cfg.continuousThrustNoiseMult ?? 4.0)
    : 1.0;
  const effNoiseMeanMotionRel = kNoise.s_l * (regCfg.noiseMeanMotionMult ?? 1.0) * ctNoiseMult;

  // Post-fit RMS diagnostics
  const fitRmsRtnKm = [0, 0, 0];
  let fitRms3dKm2 = 0, fitMaxKm = 0;
  for (const u of postFitUvwPosKm) {
    fitRmsRtnKm[0] += u[0] * u[0];
    fitRmsRtnKm[1] += u[1] * u[1];
    fitRmsRtnKm[2] += u[2] * u[2];
    const d2 = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
    fitRms3dKm2 += d2;
    if (Math.sqrt(d2) > fitMaxKm) fitMaxKm = Math.sqrt(d2);
  }
  const fitRmsKm = Math.sqrt(fitRms3dKm2 / Math.max(1, postFitUvwPosKm.length));

  // Build canonical $PVN provenance
  const pvnBytes = buildPvnBytes({
    sourceId: "spacetrack-gp-own-epoch",
    originator: "18th SDS / SDN-AP",
    licenseId: "Space-Track User Agreement",
    lineage: "Derived by SDN-AP pure own-epoch multi-TLE fitting (t = t_epoch) from Space-Track GP history",
  });
  const pvnUnpacked = PVN.getRootAsPVN(new flatbuffers.ByteBuffer(pvnBytes)).unpack();

  // Pack final self-contained SPEC 12 / SPEC 15 AP $OCM
  const rfmTeme = Object.assign(new RFMT(), {
    REFERENCE_FRAME_type: RFMUnion.CustomFrameWrapper,
    REFERENCE_FRAME: Object.assign(new CustomFrameWrapperT(), { frame: CustomFrame.TEMEOFEPOCH }),
    NAME: "TEMEOFEPOCH",
  });
  const ocmT = new OCMT();
  ocmT.HEADER = Object.assign(new HeaderT(), {
    CCSDS_OCM_VERS: "3.0",
    CREATION_DATE: new Date().toISOString(),
    ORIGINATOR: "SDN-AP",
  });
  ocmT.METADATA = Object.assign(new MetadataT(), {
    OBJECT_NAME: obj.name || `SAT-${obj.norad}`,
    INTERNATIONAL_DESIGNATOR: obj.objectId || "",
    CATALOG_NAME: "NORAD",
    OBJECT_DESIGNATOR: String(obj.norad),
    TIME_SYSTEM: "UTC",
    EPOCH_TZERO: refEpochIso,
    NORAD_CAT_ID: obj.norad,
  });
  ocmT.CENTER_NAME = "EARTH";
  ocmT.TRAJ_REF_FRAME = rfmTeme;
  ocmT.TRAJ_FRAME_EPOCH = refEpochIso;
  ocmT.ORB_AVERAGING = "BROUWER";
  ocmT.MEAN_ELEMENTS = Object.assign(new OCMMeanElementsT(), {
    MEAN_ELEMENT_THEORY: meanElementSource.AP,
    EPOCH: refEpochIso,
    MEAN_MOTION: finalEl.n,
    ECCENTRICITY: finalEl.e,
    INCLINATION: finalEl.inc,
    RA_OF_ASC_NODE: finalEl.raan,
    ARG_OF_PERICENTER: finalEl.argp,
    MEAN_ANOMALY: finalEl.ma,
    BTERM: finalEl.bterm,
    AGOM: finalEl.agom,
  });
  const emitPertProps = {
    ATMOSPHERIC_MODEL: Object.assign(new ATMT(), { MODEL: AtmosphericModelFamily.NRLMSIS00E, YEAR: 2000 }),
    GRAVITY_MODEL: "EGM-96",
    MAXIMUM_TESSERAL_DEGREE: emitTesseral,
    MAXIMUM_ZONAL_DEGREE: 20,
    WEATHER_SOURCE: pcfWeatherSource.RECORDS,
    SW_DATA_SOURCE: "GFZ Potsdam / NOAA SWPC",
    SW_DATA_EPOCH: spw.rows[spw.rows.length - 1]?.date ?? "2026-11-08",
    SW_INTERP_METHOD: "LINEAR",
    SPACE_WEATHER: spwFullRows,
  };
  if (useDca) {
    emitPertProps.DENSITY_CORRECTION = pcfDensityCorrection.DCA_COMMON_MODE;
    emitPertProps.DENSITY_CORRECTION_CID = dcaRecord.cid;
    emitPertProps.DENSITY_CORRECTION_NODE_TIMES_MS = dcaRecord.nodeTimesMs;
    emitPertProps.DENSITY_CORRECTION_LOG_DENSITY_SCALE_DIMENSIONLESS = dcaRecord.nodeLogScale;
  }
  ocmT.PERTURBATIONS = Object.assign(new PerturbationsT(), emitPertProps);
  ocmT.ORBIT_DETERMINATION = Object.assign(new OrbitDeterminationT(), {
    OD_ID: `AP-OWN-EPOCH-${obj.norad}`,
    OD_ALGORITHM: "IRLS-GAUSS-NEWTON-OWN-EPOCH",
    OD_METHOD: "EXA-SSN-OWN-EPOCH-AP",
    OD_EPOCH: refEpochIso,
    OD_OBSERVATIONS_TYPE: ["GP_OWN_EPOCH_STATE"],
    OD_OBSERVATIONS_USED: m,
    OD_ESTIMATOR: estimatorCategory.BatchLeastSquares,
    OD_RESIDUAL_RMS: fitRmsKm,
    OD_DYNAMIC_PARAMETERS: odDynParams,
    FIT_STATISTICS: Object.assign(new OCMFitStatisticsT(), {
      FIT_STATES: m,
      FIT_RMS_KM: fitRmsKm,
      FIT_MAX_KM: fitMaxKm,
      FIT_RADIAL_RMS_KM: Math.sqrt(fitRmsRtnKm[0] / Math.max(1, postFitUvwPosKm.length)),
      FIT_IN_TRACK_RMS_KM: Math.sqrt(fitRmsRtnKm[1] / Math.max(1, postFitUvwPosKm.length)),
      FIT_CROSS_TRACK_RMS_KM: Math.sqrt(fitRmsRtnKm[2] / Math.max(1, postFitUvwPosKm.length)),
      ITERATIONS: maxIter,
      CONVERGED: converged,
      FIT_START: sgpOwn[0].epochIso,
      FIT_STOP: refEpochIso,
    }),
  });

  if (covLtm.length === (covSize * (covSize + 1)) / 2 && covLtm.every(Number.isFinite)) {
    ocmT.COVARIANCE_DATA = covLtm;
    ocmT.COV_REF_FRAME = rfmTeme;
    ocmT.COV_TYPE = "CARTPV";
    ocmT.COV_ORDERING = covarianceOrdering.LTM;
    ocmT.COV_SIZE = covSize;
    if (nk > 0) {
      ocmT.COV_PARAMETERS = covParamNames;
      ocmT.COV_UNITS = covUnits;
      ocmT.COV_PARAMETER_KINDS = covKinds;
    }
    ocmT.COV_PROPAGATION = Object.assign(new OCMCovariancePropagationT(), {
      FLOOR_UU_KM2: floor6[0],
      FLOOR_VU_KM2: floor6[1],
      FLOOR_VV_KM2: floor6[2],
      FLOOR_WU_KM2: floor6[3],
      FLOOR_WV_KM2: floor6[4],
      FLOOR_WW_KM2: floor6[5],
      NOISE_ECCENTRICITY_PER_DAY: kNoise.s_e,
      NOISE_INCLINATION_PER_DAY: kNoise.s_i,
      NOISE_MEAN_MOTION_RELATIVE: effNoiseMeanMotionRel,
      NOISE_NON_GRAVITATIONAL_RAD_DAY2: noiseNgRadDay2,
      NOISE_START_MINUTES: 0.0,
      NON_GRAVITATIONAL_SHARE: kNoise.c,
      NON_GRAVITATIONAL_RATE_PER_DAY: ngRatePerDay,
    });
    ocmT.COV_REALISM = [
      Object.assign(new CVRT(), {
        RULE: covarianceRule.EMPIRICAL_RESIDUAL_CALIBRATED,
        CALIBRATION: covarianceCalibration.EMPIRICAL_FIT_RESIDUALS,
        MODEL_ID: "sdn-ap AP process noise + SSN own-epoch CRLB",
        REGIME: apNoiseRegime === 0 ? "DRAG" : "ABOVE",
        MAHALANOBIS_3D_MEAN: Math.sqrt(birgeScale2 * 3.0),
        SAMPLE_COUNT: m,
      }),
    ];
  }
  ocmT.PROVENANCE = pvnUnpacked;

  const bFinal = new flatbuffers.Builder(16384);
  OCM.finishOCMBuffer(bFinal, ocmT.pack(bFinal));
  const ocmBytes = bFinal.asUint8Array().slice();

  // Verify zero USER_DEFINED_* fields
  const verifyRoot = OCM.getRootAsOCM(new flatbuffers.ByteBuffer(ocmBytes));
  if (verifyRoot.userDefinedParametersLength() !== 0) {
    throw new Error("USER_DEFINED_PARAMETERS violation on own-epoch AP $OCM");
  }

  return {
    ok: true,
    ocmBytes,
    epoch: refEpochIso,
    regime,
    hpKm,
    mTle: m,
    arcDays,
    ssnClassCounts: ssnClasses.reduce((acc, c) => ((acc[c] = (acc[c] || 0) + 1), acc), {}),
    maneuverInfo,
    fitRmsM: fitRmsKm * 1000,
    bterm: finalEl.bterm,
    agom: finalEl.agom,
    solveDrag,
    solveSrp,
  };
}
