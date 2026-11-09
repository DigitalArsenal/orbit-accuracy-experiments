import fs from "node:fs";
import path from "node:path";
import * as flatbuffers from "flatbuffers";
import * as P from "spacedatastandards.org/lib/js/PRW/main.js";
import * as PCF from "spacedatastandards.org/lib/js/PCF/main.js";
import { OCM } from "spacedatastandards.org/lib/js/OCM/main.js";
import { OEM } from "spacedatastandards.org/lib/js/OEM/main.js";
import { TDM } from "spacedatastandards.org/lib/js/TDM/main.js";
import { EOO, EOOT } from "spacedatastandards.org/lib/js/EOO/main.js";
import { ASG } from "spacedatastandards.org/lib/js/ASG/main.js";
import { encodeModuleConfig, decodeFlowNotice } from "space-data-module-sdk/runtime-contracts";

import { TYPES } from "./wasm-hosts.mjs";
import { buildGcrfOemBytes } from "./truth-and-optical-loader.mjs";
import { buildPvnBytes } from "./hold-gate.mjs";

export const ALL_REGIME_OPTICAL_WASM_PATH =
  new URL("../wasm/optical-astrometry-all-regimes.wasm", import.meta.url).pathname;

// Ensure ATMOSPHERE_MODEL is serialized on wire even when equal to schema default NRLMSISE00 (0)
const origAddAtm = PCF.PCFForceModel.addAtmosphereModel;
PCF.PCFForceModel.addAtmosphereModel = (b, v) => {
  const was = b.force_defaults;
  b.forceDefaults(true);
  origAddAtm(b, v);
  b.forceDefaults(was);
};

export function buildApFitPcfBytes({ eccentricity = 0.001, weatherHorizonDays = 30 } = {}) {
  const tesseral = eccentricity > 0.048 ? 0 : 31;
  const c = new PCF.PCFT();
  c.THEORY = PCF.pcfTheory.AP;
  c.FORCES = Object.assign(new PCF.PCFForceModelT(), {
    EPHEMERIS_SOURCE: "",
    ATMOSPHERE_MODEL: PCF.pcfAtmosphereFamily.NRLMSISE00,
    WEATHER_SOURCE: PCF.pcfWeatherSource.RECORDS,
    HAS_MAXIMUM_TESSERAL_DEGREE: tesseral > 0,
    MAXIMUM_TESSERAL_DEGREE: tesseral,
    HAS_MAXIMUM_DEGREE: true,
    MAXIMUM_DEGREE: 20,
  });
  c.FIT = Object.assign(new PCF.PCFFitPolicyT(), {
    WEATHER_HORIZON_DAYS: weatherHorizonDays,
  });
  const b = new flatbuffers.Builder(256);
  b.finish(c.pack(b), "$PCF");
  return b.asUint8Array().slice();
}

function computeOsculatingSmaEcc(st) {
  const mu = 398600.4418;
  const rx = st[0], ry = st[1], rz = st[2];
  const vx = st[3], vy = st[4], vz = st[5];
  const r = Math.hypot(rx, ry, rz);
  const v2 = vx * vx + vy * vy + vz * vz;
  const rv = rx * vx + ry * vy + rz * vz;
  const invA = 2.0 / r - v2 / mu;
  const smaKm = invA > 1e-9 ? 1.0 / invA : 42164.0;
  const c = v2 - mu / r;
  const ex = (c * rx - rv * vx) / mu;
  const ey = (c * ry - rv * vy) / mu;
  const ez = (c * rz - rv * vz) / mu;
  const eccentricity = Math.min(0.95, Math.hypot(ex, ey, ez));
  return { rKm: r, smaKm, eccentricity };
}

/**
 * Fits a dense GCRF ephemeris (Metop-SG, ESA GNSS, WAAS SBAS, DORIS, Sentinel-1 POD, ILRS)
 * directly through WASM `propagator/sdn-ap@0.6.5` `fit` -> canonical MEAN_ELEMENT_THEORY = AP $OCM.
 */
export async function fitDenseGcrfOemToApOcm(
  sdnApHost,
  {
    norad,
    objectName,
    objectId,
    originator = "SDN-AP",
    states,
    eccentricity = 0.001,
    spwBytes,
    pvnSpec,
  }
) {
  if (!states || states.length < 8) {
    return { ok: false, error: `too-few-states:${states?.length ?? 0}` };
  }
  const oemBytes = buildGcrfOemBytes({ norad, objectName, objectId, originator, states });
  const pcfBytes = buildApFitPcfBytes({ eccentricity });
  const pvnBytes = buildPvnBytes(pvnSpec);

  // Set fit epoch placement to latest state of the fit interval (mode 2)
  sdnApHost.instance.exports.sdnap_fit_epoch_diagnostic?.(2);

  const res = await sdnApHost.invoke({
    methodId: "fit",
    inputs: [
      { portId: "ephemeris", typeRef: TYPES.OEM, payload: oemBytes },
      { portId: "configuration", typeRef: TYPES.PCF, payload: pcfBytes },
      { portId: "provenance", typeRef: TYPES.PVN, payload: pvnBytes },
      ...(spwBytes ? [{ portId: "space_weather", typeRef: TYPES.SPW, payload: spwBytes }] : []),
    ],
  });

  if (res.statusCode !== 0) {
    return { ok: false, error: `${res.errorCode ?? "fit-error"}: ${res.errorMessage ?? ""}` };
  }
  const ocmPayload = new Uint8Array(res.outputs.find((o) => o.portId === "elements").payload);
  const root = OCM.getRootAsOCM(new flatbuffers.ByteBuffer(ocmPayload));
  if (root.userDefinedParametersLength() !== 0) {
    throw new Error("USER_DEFINED_PARAMETERS violation on sdn-ap fit output");
  }
  const unpacked = root.unpack();
  return {
    ok: true,
    ocmBytes: ocmPayload,
    ocm: unpacked,
    epoch: unpacked.MEAN_ELEMENTS?.EPOCH,
    fitRmsM: (unpacked.ORBIT_DETERMINATION?.FIT_STATISTICS?.FIT_RMS_KM ?? NaN) * 1000,
    bterm: unpacked.MEAN_ELEMENTS?.BTERM ?? 0,
    agom: unpacked.MEAN_ELEMENTS?.AGOM ?? 0,
  };
}

/**
 * Pure-WASM All-Regime (LEO + MEO + HEO + GEO) Angles-Only Open Optical -> AP $OCM Pipeline (zero SGP4 seeding!):
 *   1. analysis/optical-astrometry `initial_orbit` (Gooding / far-sight multi-rev + eccentric HEO IOD)
 *   2. flows/angles-only-od (`plan` / `select`) + flows/observation-od (`step` with per-obs $EOO uncertainty & per-station timing consider sigmas)
 *      + analysis/estimation (`fit_batch`) + propagator/ffm (`invoke`, EGM2008 36x36 + Sun/Moon + SRP + IN_TRACK_ACCELERATION)
 *   3. propagator/ffm (`propagate_oem`) 24h (LEO) or 48h (MEO/HEO/GEO) dense GCRF carry
 *   4. propagator/sdn-ap@0.6.5 (`fit`) -> canonical MEAN_ELEMENT_THEORY = AP $OCM with carried $PVN!
 */
export async function fitOpenOpticalArcToApOcm(
  hosts, // { optical, anglesFlow, obsOd, estimation, ffm, sdnAp }
  {
    norad,
    objectId = `${norad}`,
    tdms, // Array<Uint8Array> ($TDM per crossing/track)
    uncertainties = [], // Array<Uint8Array> ($EOO per-observation RA/Dec uncertainty)
    stations = [], // Array<Uint8Array> ($GST)
    stationTimingSigmas = {}, // { 'SATNOGS-OPTICAL-0011': 0.025, ... }
    angleSigmaArcsec = 25,
    flowConfig = { revolutionOffsetMin: -3, revolutionOffsetMax: 3, weightedRmsLimit: 4.5, minimumArcHours: 8 },
    eopStreamBytes,
    earthOrientationPrw,
    de440KernelPrw = null,
    spwBytes,
    pvnBytes,
    enableSrp = true,
  }
) {
  const effectivePvnBytes =
    pvnBytes ??
    buildPvnBytes({
      sourceId: "optical-study",
      lineage: "angles-only-optical",
    });
  const invoke = async (h, methodId, inputs) => {
    const r = await h.invoke({ methodId, inputs });
    if (r.statusCode !== 0) return { error: `${r.errorCode ?? ""}: ${r.errorMessage ?? ""}` };
    return r;
  };
  const out = (r, port) => r.outputs.filter((o) => o.portId === port).map((o) => new Uint8Array(o.payload));

  // 1. Angles-only initial orbit via WASM analysis/optical-astrometry:
  //    Try standard LEO crossing config first, then wider crossing gap / 2-sight crossing configs for sparse MEO/HEO/GEO/SCORE/SeeSat/ZTF tracks,
  //    plus consecutive-subset fallback when a tracklet contains an outlier.
  const iodConfigs = [
    null,
    { crossingGapSeconds: 900, crossingObservations: 3 },
    { crossingGapSeconds: 1800, crossingObservations: 2 },
  ];
  const runIodOnce = (tdmSubset, cfg) =>
    invoke(hosts.optical, "initial_orbit", [
      ...tdmSubset.map((p) => ({ portId: "angles", typeRef: TYPES.TDM, payload: p })),
      { portId: "earth_orientation", typeRef: TYPES.EOP, payload: eopStreamBytes },
      ...(cfg ? [{ portId: "config", typeRef: TYPES.MCFG, payload: encodeModuleConfig(cfg) }] : []),
    ]);

  let iodRes = null;
  for (const cfg of iodConfigs) {
    iodRes = await runIodOnce(tdms, cfg);
    if (!iodRes.error) break;
  }
  if (iodRes?.error && tdms.length >= 2) {
    outer: for (const cfg of [null, { crossingGapSeconds: 1800, crossingObservations: 2 }]) {
      for (let i = 0; i + 1 < tdms.length; i++) {
        const sub = tdms.slice(i, Math.min(tdms.length, i + 3));
        const tryRes = await runIodOnce(sub, cfg);
        if (!tryRes.error) {
          iodRes = tryRes;
          break outer;
        }
      }
    }
  }
  if (!iodRes || iodRes.error) {
    return { ok: false, stage: "initial_orbit", error: iodRes?.error || "no-iod" };
  }
  const initialOcm = out(iodRes, "orbit")[0];
  const iodUnpacked = OCM.getRootAsOCM(new flatbuffers.ByteBuffer(initialOcm)).unpack();
  const iodOrb = computeOsculatingSmaEcc(iodUnpacked.STATE_DATA);

  // Build PRW execution template for FFM (EGM2008 36x36 + Analytical Sun/Moon + optional SRP + IN_TRACK_ACCELERATION)
  const table = (name, fields = {}) => Object.assign(new P[`${name}T`](), fields);
  const prw = (arm, value) => {
    const b = new flatbuffers.Builder(1 << 15);
    P.PRW.finishSizePrefixedPRWBuffer(b, table("PRW", { [arm]: value }).pack(b));
    return b.asUint8Array().slice();
  };
  const t0 = iodUnpacked.STATE_EPOCHS[0];
  const maxStepIntegrator = iodOrb.smaKm > 15000 ? 300 : 120;
  const templateExec = prw(
    "EXECUTION_REQUEST",
    table("PRWExecutionRequest", {
      INITIAL: table("PRWResidentState", {
        STATE: table("FRMStateVector", {
          REPRESENTATION: P.frmStateRepresentation.CARTESIAN,
          POSITION: table("FRMVector3", { X: 0, Y: 0, Z: 0 }),
          VELOCITY: table("FRMVector3", { X: 0, Y: 0, Z: 0 }),
          COORDINATE_SYSTEM_NAME: "GCRF",
          EPOCH: t0,
          EPOCH_TIME_SYSTEM: "UTC",
        }),
        COORDINATE_SYSTEM: table("RFMCoordinateSystem", {
          NAME: "GCRF",
          AXIS_TYPE: P.rfmAxisType.ICRF,
          AXIS_REFERENCE_BODY_ID: 399,
          ORIGIN: table("RFMOrigin", { KIND: P.rfmOriginKind.CELESTIAL_BODY, CELESTIAL_BODY_ID: 399 }),
        }),
        CATALOG_NUMBER: Number(norad) >>> 0,
        OBJECT_ID: objectId,
        VALID: true,
      }),
      TARGET_EPOCH: table("TIMInstant", {
        TIME_SYSTEM: P.timingStandard.UTC,
        EPOCH_FORMAT: P.timEpochRepresentation.ISO8601,
        ISO8601: t0,
      }),
      SAMPLE_EPOCHS: [],
      INTEGRATOR: table("PCFIntegratorSettings", {
        ALGORITHM: P.pcfIntegratorAlgorithm.RK78,
        INITIAL_STEP_SECONDS: 30,
        MINIMUM_STEP_SECONDS: 0.001,
        MAXIMUM_STEP_SECONDS: maxStepIntegrator,
        ABSOLUTE_TOLERANCES: Array(6).fill(1e-9),
        RELATIVE_TOLERANCE: 1e-12,
        MAXIMUM_STEPS: 500000,
      }),
      FORCES: table("PCFForceModel", {
        GRAVITY_CHOICE: P.pcfGravitySelection.EGM2008,
        ENABLE_POINT_MASS: true,
        GRAVITATIONAL_PARAMETER: 3.986004415e14,
        MAXIMUM_DEGREE: 36,
        HAS_MAXIMUM_DEGREE: true,
        MAXIMUM_ORDER: 36,
        HAS_MAXIMUM_ORDER: true,
        ENABLE_THIRD_BODY: true,
        THIRD_BODY_IDS: [10, 301],
        EPHEMERIS_SOURCE: de440KernelPrw ? "JPL_SPK" : "Analytical",
        ENABLE_SRP: enableSrp,
        RADIATION_PRESSURE_MODEL: P.pcfRadiationPressureFamily.CANNONBALL,
        REFLECTIVITY_COEFFICIENT: 1.2,
        ENABLE_DRAG: false,
        INITIAL_MASS_KG: 500,
        AREA_M2: 4.0,
        HAS_IN_TRACK_ACCELERATION_M_S2: true,
        IN_TRACK_ACCELERATION_M_S2: 0,
      }),
      STM_TECHNIQUE: P.prwDerivativeTechnique.ANALYTIC,
      DYNAMIC_PARAMETERS: [P.prwDynamicParameter.IN_TRACK_ACCELERATION],
    })
  );

  const stepCfgBase = {
    angleSigmaArcsec,
    minimumArcHours: 0,
    maximumIterations: 25,
    ...Object.fromEntries(Object.entries(stationTimingSigmas).map(([id, sig]) => [`timeBiasSigmaS.${id}`, sig])),
  };
  const stepConfigDefault = encodeModuleConfig({ ...stepCfgBase, editThreshold: 5 });
  const stepConfigWide = encodeModuleConfig({ ...stepCfgBase, editThreshold: 80, maximumIterations: 14 });
  const uncFrames = uncertainties.map((p) => ({ portId: "uncertainty", typeRef: TYPES.EOO, payload: p }));

  const tdmFirstLastMs = (buf) => {
    let minMs = Infinity, maxMs = -Infinity;
    const tdm = TDM.getRootAsTDM(new flatbuffers.ByteBuffer(buf));
    for (let i = 0; i < tdm.segmentsLength(); i++) {
      const seg = tdm.SEGMENTS(i);
      if (!seg) continue;
      for (let j = 0; j < seg.observationsLength(); j++) {
        const ep = seg.OBSERVATIONS(j)?.EPOCH();
        if (!ep) continue;
        const ms = Date.parse(/[zZ]$/.test(ep) ? ep : `${ep}Z`);
        if (Number.isFinite(ms)) {
          if (ms < minMs) minMs = ms;
          if (ms > maxMs) maxMs = ms;
        }
      }
    }
    return { minMs, maxMs };
  };

  const computeTdmsSpanHours = (obsList) => {
    let minMs = Infinity, maxMs = -Infinity;
    for (const buf of obsList) {
      const { minMs: a, maxMs: b } = tdmFirstLastMs(buf);
      if (a < minMs) minMs = a;
      if (b > maxMs) maxMs = b;
    }
    return maxMs > minMs ? (maxMs - minMs) / 3600000.0 : 0;
  };

  const stripExecDynamicParams = (execBytes) => {
    const req = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(execBytes)).unpack().EXECUTION_REQUEST;
    req.DYNAMIC_PARAMETERS = [];
    if (req.FORCES) {
      req.FORCES.HAS_IN_TRACK_ACCELERATION_M_S2 = false;
      req.FORCES.IN_TRACK_ACCELERATION_M_S2 = 0;
    }
    return prw("EXECUTION_REQUEST", req);
  };

  const reseedExecFromOcm = (execBytes, ocmBytes, keepDyn = false) => {
    const req = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(execBytes)).unpack().EXECUTION_REQUEST;
    const o = OCM.getRootAsOCM(new flatbuffers.ByteBuffer(ocmBytes)).unpack();
    const st = o.STATE_DATA;
    const ep = o.STATE_EPOCHS?.[0];
    if (st?.length >= 6 && ep) {
      req.INITIAL.STATE.POSITION = table("FRMVector3", { X: st[0] * 1000, Y: st[1] * 1000, Z: st[2] * 1000 });
      req.INITIAL.STATE.VELOCITY = table("FRMVector3", { X: st[3] * 1000, Y: st[4] * 1000, Z: st[5] * 1000 });
      req.INITIAL.STATE.EPOCH = /[zZ]$/.test(ep) ? ep : `${ep}Z`;
    }
    if (!keepDyn) {
      req.DYNAMIC_PARAMETERS = [];
      if (req.FORCES) {
        req.FORCES.HAS_IN_TRACK_ACCELERATION_M_S2 = false;
        req.FORCES.IN_TRACK_ACCELERATION_M_S2 = 0;
      }
    }
    return prw("EXECUTION_REQUEST", req);
  };

  const runBatchOd = async (obsList, executionBytes, cfgBytes = stepConfigDefault) => {
    const fixed = [
      ...obsList.map((p) => ({ portId: "observations", typeRef: TYPES.TDM, payload: p })),
      ...uncFrames,
      ...stations.map((p) => ({ portId: "stations", typeRef: TYPES.GST, payload: p })),
      { portId: "earth_orientation", typeRef: TYPES.PRW, payload: earthOrientationPrw },
      { portId: "execution", typeRef: TYPES.PRW, payload: executionBytes },
      { portId: "config", typeRef: TYPES.MCFG, payload: cfgBytes },
      { portId: "provenance", typeRef: TYPES.PVN, payload: effectivePvnBytes },
    ];
    let sent = null, result = null, samples = null;
    for (let iter = 0; iter < 400; iter++) {
      const r = await invoke(hosts.obsOd, "step", [
        ...fixed,
        ...(sent ? [{ portId: "estimation", typeRef: TYPES.EST, payload: sent }] : []),
        ...(result ? [{ portId: "result", typeRef: TYPES.EST, payload: result }] : []),
        ...(samples ? [{ portId: "samples", typeRef: TYPES.PRW, payload: samples }] : []),
      ]);
      if (r.error) return { error: r.error };
      const [ocm] = out(r, "ocm");
      const [propagation] = out(r, "propagation");
      const [next] = out(r, "estimation");
      if (ocm) return { ocm };
      if (propagation) {
        const p = await invoke(hosts.ffm, "invoke", [
          { portId: "request", typeRef: TYPES.PRW, payload: propagation },
          { portId: "earth_orientation", typeRef: TYPES.PRW, payload: earthOrientationPrw },
          ...(de440KernelPrw ? [{ portId: "kernel", typeRef: TYPES.PRW, payload: de440KernelPrw }] : []),
        ]);
        if (p.error) return { error: `ffm: ${p.error}` };
        samples = out(p, "response")[0];
        continue;
      }
      sent = next;
      samples = null;
      const est = await invoke(hosts.estimation, "fit_batch", [{ portId: "request", typeRef: TYPES.EST, payload: sent }]);
      if (est.error) return { error: `estimation: ${est.error}` };
      result = out(est, "result")[0];
    }
    return { error: "max-od-steps-exceeded" };
  };

  // 2. Multi-stage revolution-count & full-arc selection via WASM flows/angles-only-od (up to 32 nights)
  const flowCfgInput = flowConfig
    ? [{ portId: "config", typeRef: TYPES.MCFG, payload: encodeModuleConfig(flowConfig) }]
    : [];

  const runAnglesFlowWithInitial = async (initOcmBuf) => {
    const common = [
      ...tdms.map((p) => ({ portId: "observations", typeRef: TYPES.TDM, payload: p })),
      { portId: "initial", typeRef: TYPES.OCM, payload: initOcmBuf },
      ...flowCfgInput,
    ];
    let curStage = null;
    for (let s = 1; s <= 32; s++) {
      const stageIn = curStage ? [{ portId: "stage", typeRef: TYPES.OCM, payload: curStage }] : [];
      const planned = await invoke(hosts.anglesFlow, "plan", [
        ...common,
        ...stageIn,
        { portId: "execution", typeRef: TYPES.PRW, payload: templateExec },
      ]);
      if (planned.error) return { ok: false, stage: `plan-${s}`, error: planned.error };
      const notice = decodeFlowNotice(out(planned, "report")[0]);
      if (notice.reason === "complete") break;
      const candidates = out(planned, "execution");
      const stageObs = out(planned, "observations");
      const stageSpanHours = computeTdmsSpanHours(stageObs);
      const ocms = [], kept = [];
      for (const candExec of candidates) {
        const effExec = stageSpanHours < 16.0 ? stripExecDynamicParams(candExec) : candExec;
        const f = await runBatchOd(stageObs, effExec, stepConfigDefault);
        if (f.ocm) {
          ocms.push(f.ocm);
          kept.push(effExec);
        }
      }
      const trySelect = (candOcms, candKept) =>
        invoke(hosts.anglesFlow, "select", [
          ...common,
          ...stageIn,
          ...candOcms.map((p) => ({ portId: "candidates", typeRef: TYPES.OCM, payload: p })),
          ...candKept.map((p) => ({ portId: "executions", typeRef: TYPES.PRW, payload: p })),
        ]);

      let chosen = ocms.length > 0 ? await trySelect(ocms, kept) : { error: "empty" };
      if (chosen.error) {
        // Fallback: wide sigma-edit warmup (80 sigma, 6-DOF, central <= 3 rev candidates) so Night 2 isn't sigma-rejected from J2 seed,
        // followed by default 5-sigma outlier-editing polish from the warmed state!
        const fbOcms = [], fbKept = [];
        const midIdx = Math.floor(candidates.length / 2);
        const fbCandidates =
          candidates.length <= 3 ? candidates : candidates.slice(Math.max(0, midIdx - 1), Math.min(candidates.length, midIdx + 2));
        for (const candExec of fbCandidates) {
          const effExec6 = stripExecDynamicParams(candExec);
          const warm = await runBatchOd(stageObs, effExec6, stepConfigWide);
          if (!warm.ocm) continue;
          const polSeed = reseedExecFromOcm(candExec, warm.ocm, stageSpanHours >= 20.0);
          const pol = await runBatchOd(stageObs, polSeed, stepConfigDefault);
          if (pol.ocm) {
            fbOcms.push(pol.ocm);
            fbKept.push(polSeed);
          } else {
            fbOcms.push(warm.ocm);
            fbKept.push(reseedExecFromOcm(effExec6, warm.ocm, false));
          }
        }
        chosen = await trySelect(fbOcms, fbKept);
      }
      if (chosen.error) return { ok: false, stage: `select-${s}`, error: chosen.error };
      curStage = out(chosen, "selected")[0];
      if (decodeFlowNotice(out(chosen, "report")[0]).reason === "complete") break;
    }
    if (!curStage) return { ok: false, stage: "angles-flow", error: "no-selected-estimate" };
    return { ok: true, stage: curStage };
  };

  let flowRes = await runAnglesFlowWithInitial(initialOcm);
  if (!flowRes.ok && tdms.length >= 2) {
    // If single-night Gooding IOD produced a degenerate intra-night seed, try cross-night adjacent TDM pair IOD!
    const tdmSpans = tdms.map((buf, idx) => ({ idx, buf, ...tdmFirstLastMs(buf) })).filter((x) => Number.isFinite(x.minMs)).sort((a, b) => a.minMs - b.minMs);
    let bestPair = null, bestGap = Infinity;
    for (let i = 0; i + 1 < tdmSpans.length; i++) {
      const gapH = (tdmSpans[i + 1].minMs - tdmSpans[i].maxMs) / 3600000.0;
      if (gapH >= 8.0 && gapH < bestGap) {
        bestGap = gapH;
        bestPair = [tdmSpans[i].buf, tdmSpans[i + 1].buf];
      }
    }
    if (bestPair) {
      for (const cfg of iodConfigs) {
        const pairIod = await runIodOnce(bestPair, cfg);
        if (!pairIod.error) {
          const altFlow = await runAnglesFlowWithInitial(out(pairIod, "orbit")[0]);
          if (altFlow.ok) {
            flowRes = altFlow;
            break;
          }
        }
      }
    }
  }
  if (!flowRes.ok) return flowRes;
  const stage = flowRes.stage;

  // 3. Propagate 24h (LEO) or 48h (MEO/HEO/GEO) dense GCRF carry via WASM propagator/ffm `propagate_oem`
  const estOcm = OCM.getRootAsOCM(new flatbuffers.ByteBuffer(stage)).unpack();
  const estEpoch = estOcm.STATE_EPOCHS[0];
  const execUnpacked = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(templateExec)).unpack().EXECUTION_REQUEST;
  const st = estOcm.STATE_DATA;
  const estOrb = computeOsculatingSmaEcc(st);
  execUnpacked.INITIAL.STATE.POSITION = table("FRMVector3", { X: st[0] * 1000, Y: st[1] * 1000, Z: st[2] * 1000 });
  execUnpacked.INITIAL.STATE.VELOCITY = table("FRMVector3", { X: st[3] * 1000, Y: st[4] * 1000, Z: st[5] * 1000 });
  execUnpacked.INITIAL.STATE.EPOCH = estEpoch;
  for (const dp of estOcm.ORBIT_DETERMINATION?.OD_DYNAMIC_PARAMETERS ?? []) {
    if (dp.PARAMETER === P.prwDynamicParameter.IN_TRACK_ACCELERATION) {
      execUnpacked.FORCES.HAS_IN_TRACK_ACCELERATION_M_S2 = true;
      execUnpacked.FORCES.IN_TRACK_ACCELERATION_M_S2 = dp.VALUE;
    }
  }
  execUnpacked.DYNAMIC_PARAMETERS = [];
  execUnpacked.SAMPLE_EPOCHS = [];
  const fitStopRaw = estOcm.ORBIT_DETERMINATION?.FIT_STATISTICS?.FIT_STOP || estEpoch;
  const stopIso = /[zZ]$/.test(fitStopRaw) ? fitStopRaw : `${fitStopRaw}Z`;
  const stopMs = Date.parse(stopIso.replace(/(\.\d{3})\d*Z$/, "$1Z"));
  const carryHours = estOrb.smaKm > 10000 ? 48 : 24;
  const stepSeconds = estOrb.smaKm > 18000 ? 120 : 60;
  const startIso = new Date(stopMs - carryHours * 3600e3).toISOString();
  execUnpacked.TARGET_EPOCH.ISO8601 = stopIso;
  const bCarryPcf = new flatbuffers.Builder(512);
  bCarryPcf.finish(
    Object.assign(new PCF.PCFT(), {
      OUTPUT: Object.assign(new PCF.PCFOutputT(), {
        FRAME: PCF.pcfOutputFrame.GCRF,
        START_TIME: startIso,
        STOP_TIME: stopIso,
        STEP_SECONDS: stepSeconds,
      }),
    }).pack(bCarryPcf),
    "$PCF"
  );

  const carryRes = await invoke(hosts.ffm, "propagate_oem", [
    { portId: "request", typeRef: TYPES.PRW, payload: prw("EXECUTION_REQUEST", execUnpacked) },
    { portId: "configuration", typeRef: TYPES.PCF, payload: bCarryPcf.asUint8Array().slice() },
    { portId: "earth_orientation", typeRef: TYPES.PRW, payload: earthOrientationPrw },
    ...(de440KernelPrw ? [{ portId: "kernel", typeRef: TYPES.PRW, payload: de440KernelPrw }] : []),
  ]);
  if (carryRes.error) return { ok: false, stage: "ffm-carry", error: carryRes.error };
  const carryOemBytes = out(carryRes, "ephemeris")[0];

  // 4. Fit carried GCRF $OEM through WASM propagator/sdn-ap@0.6.5 `fit` with true osculating eccentricity
  hosts.sdnAp.instance.exports.sdnap_fit_epoch_diagnostic?.(2);
  const fitRes = await invoke(hosts.sdnAp, "fit", [
    { portId: "ephemeris", typeRef: TYPES.OEM, payload: carryOemBytes },
    {
      portId: "configuration",
      typeRef: TYPES.PCF,
      payload: buildApFitPcfBytes({ eccentricity: Math.max(0.0005, estOrb.eccentricity) }),
    },
    { portId: "provenance", typeRef: TYPES.PVN, payload: effectivePvnBytes },
    ...(spwBytes ? [{ portId: "space_weather", typeRef: TYPES.SPW, payload: spwBytes }] : []),
  ]);
  if (fitRes.error) return { ok: false, stage: "sdn-ap-fit", error: fitRes.error };
  const apOcmBytes = out(fitRes, "elements")[0];
  const apRoot = OCM.getRootAsOCM(new flatbuffers.ByteBuffer(apOcmBytes));
  if (apRoot.userDefinedParametersLength() !== 0) {
    throw new Error("USER_DEFINED_PARAMETERS violation on optical AP $OCM");
  }
  const apUnpacked = apRoot.unpack();
  return {
    ok: true,
    ocmBytes: apOcmBytes,
    ocm: apUnpacked,
    estimateOcm: estOcm,
    epoch: apUnpacked.MEAN_ELEMENTS?.EPOCH,
    smaKm: estOrb.smaKm,
    eccentricity: estOrb.eccentricity,
    obsUsed: estOcm.ORBIT_DETERMINATION?.OD_OBSERVATIONS_USED ?? 0,
    residualRmsArcsec: estOcm.ORBIT_DETERMINATION?.OD_RESIDUAL_RMS ?? NaN,
    weightedRms: estOcm.ORBIT_DETERMINATION?.WEIGHTED_RMS ?? NaN,
    fitRmsM: (apUnpacked.ORBIT_DETERMINATION?.FIT_STATISTICS?.FIT_RMS_KM ?? NaN) * 1000,
  };
}

/**
 * Pure-WASM Optical Sky Residual & Association Evaluator (`sdn-ap` `propagate` + `analysis/association` `associate_observations`).
 * Evaluates topocentric RA/Dec residuals (with ERFA IAU 2006/2000A CIO Earth orientation, one-way light-time,
 * and diurnal aberration) for an AP $OCM against independent optical astrometry (`SeeSat-L`, `SCORE`, `ZTF`).
 * Zero JS physics!
 */
export async function evaluateApOcmAgainstOpticalSightsWasm(
  sdnApHost,
  assocHost,
  { ocmBytes, sights, eopStreamBytes }
) {
  if (!sights || sights.length === 0) return { ok: false, error: "no-sights" };
  // Build dense prediction epoch grid bracketing each sight (-120s, -60s, 0s, +60s, +120s) so WASM association interpolates with sub-cm accuracy
  const gridMsSet = new Set();
  for (const s of sights) {
    for (const offSec of [-120, -60, 0, 60, 120]) {
      gridMsSet.add(Math.round(s.ms + offSec * 1000));
    }
  }
  const gridIso = [...gridMsSet].sort((a, b) => a - b).map((ms) => new Date(ms).toISOString().replace(/Z$/i, ""));
  const pcfT = Object.assign(new PCF.PCFT(), {
    OUTPUT: Object.assign(new PCF.PCFOutputT(), {
      FRAME: PCF.pcfOutputFrame.GCRF,
      EPOCHS: gridIso,
      MAXIMUM_STATES: Math.max(2000, gridIso.length + 32),
    }),
  });
  const bP = new flatbuffers.Builder(Math.max(1024, gridIso.length * 48));
  bP.finish(pcfT.pack(bP), "$PCF");
  const propRes = await sdnApHost.invoke({
    methodId: "propagate",
    inputs: [
      { portId: "ocm", typeRef: TYPES.OCM, payload: ocmBytes },
      { portId: "configuration", typeRef: TYPES.PCF, payload: bP.asUint8Array() },
    ],
  });
  if (propRes.statusCode !== 0 || !propRes.outputs.length) {
    return { ok: false, error: `propagate: ${propRes.errorCode}: ${propRes.errorMessage}` };
  }
  const predOemBytes = new Uint8Array(propRes.outputs[0].payload);

  const eooInputs = sights.map((s, idx) => {
    const e = Object.assign(new EOOT(), {
      ID: `obs-${idx}`,
      OB_TIME: new Date(s.ms).toISOString().replace(/Z$/i, ""),
      IMAGE_SET_ID: String(s.trackletId || s.station || idx),
      SENSOR_ID: String(s.station || "OPT"),
      UCT: true,
      RA: s.raDeg,
      DECLINATION: s.decDeg,
      RA_MEASURED: true,
      DECLINATION_MEASURED: true,
      RA_UNC: Math.max(1.5, s.sigmaArcsec ?? 15) / 3600,
      DECLINATION_UNC: Math.max(1.5, s.sigmaArcsec ?? 15) / 3600,
      SENLAT: s.latDeg,
      SENLON: s.lonDeg,
      SENALT: (s.altM ?? 0) / 1000,
    });
    const b = new flatbuffers.Builder(512);
    EOO.finishEOOBuffer(b, e.pack(b));
    return { portId: "optical_observations", typeRef: TYPES.EOO, payload: b.asUint8Array() };
  });

  const asgRes = await assocHost.invoke({
    methodId: "associate_observations",
    inputs: [
      ...eooInputs,
      { portId: "predictions", typeRef: TYPES.OEM, payload: predOemBytes },
      { portId: "earth_orientation", typeRef: TYPES.EOP, payload: eopStreamBytes },
    ],
  });
  if (asgRes.statusCode !== 0) {
    return { ok: false, error: `association: ${asgRes.errorCode}: ${asgRes.errorMessage}` };
  }
  const repBytes = new Uint8Array(asgRes.outputs.find((o) => o.portId === "report").payload);
  const asgRoot = ASG.getRootAsASG(new flatbuffers.ByteBuffer(repBytes));
  const rep = asgRoot.ASSOCIATION_REPORT();
  const cLightKmS = 299792.458;
  const rows = [];
  for (let i = 0; i < rep.observationsLength(); i++) {
    const ob = rep.OBSERVATIONS(i);
    if (ob.candidatesLength() === 0) continue;
    const cand = ob.CANDIDATES(0);
    const s = sights[ob.INDEX()];
    const dRaDeg = cand.RESIDUAL(0);
    const dDecDeg = cand.RESIDUAL(1);
    const cosDec = Math.cos((s.decDeg * Math.PI) / 180);
    const angErrArcsec = Math.hypot(dRaDeg * cosDec, dDecDeg) * 3600;
    const rangeKm = cand.LIGHT_TIME_S() * cLightKmS;
    const skyPlaneMissM = rangeKm > 0 ? rangeKm * ((angErrArcsec * Math.PI) / (180 * 3600)) * 1000 : NaN;
    rows.push({
      ms: s.ms,
      epochIso: s.epochIso,
      station: s.station || "OPT",
      dRaArcsec: dRaDeg * cosDec * 3600,
      dDecArcsec: dDecDeg * 3600,
      angErrArcsec,
      rangeKm,
      skyPlaneMissM,
      d2: cand.D2(),
      inGate: cand.IN_GATE(),
      posterior: cand.POSTERIOR(),
    });
  }
  return { ok: true, rows };
}
