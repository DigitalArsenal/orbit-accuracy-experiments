import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import * as flatbuffers from "flatbuffers";
import * as PCF from "spacedatastandards.org/lib/js/PCF/main.js";
import { OEM } from "spacedatastandards.org/lib/js/OEM/main.js";

import { isHeldForStudy, CREDITS } from "./lib/hold-gate.mjs";
import { loadGpHistory, isoFromJd } from "./lib/gp-history-loader.mjs";
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
import { fitDenseGcrfOemToApOcm } from "./lib/external-and-optical-ap-engine.mjs";
import {
  BASELINE_AP_TUNING,
  mergeApTuning,
  evalSgp4OwnEpochs,
  propagateSingleTleSgp4Gcrf,
} from "./lib/ssn-epoch-engine.mjs";

const OUT_DIR = (process.env.AP_CATALOG_STORE || "/opt/data/ap-crlb-catalog-2026-11-08");
const LOG_PATH = path.join(OUT_DIR, "tle-50-round-optimization-log.json");
const HORIZONS_H = [0, 24, 48, 72, 96, 120];
const NUM_WORKERS = 14;

const quantile = (arr, q) => {
  if (!arr?.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] * (hi - pos) + s[hi] * (pos - lo);
};
const rms = (arr) => (arr?.length ? Math.sqrt(arr.reduce((a, x) => a + x * x, 0) / arr.length) : NaN);
const jdFromMs = (ms) => {
  const d = ms / 86400000;
  return { whole: Math.floor(d) + 2440587.5, frac: d - Math.floor(d) };
};

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
  if (res.statusCode !== 0 || !res.outputs.length) return null;
  const oem = OEM.getRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(res.outputs[0].payload)));
  const blk = oem.EPHEMERIS_DATA_BLOCK(0);
  const states = [];
  for (let i = 0; i < blk.ephemerisDataLinesLength(); i++) {
    const l = blk.EPHEMERIS_DATA_LINES(i);
    states.push({ rGcrf: [l.X(), l.Y(), l.Z()], vGcrf: [l.X_DOT(), l.Y_DOT(), l.Z_DOT()] });
  }
  return states;
}

function summarizeSatSet(satResults, mode = "ap") {
  const byH = new Map(HORIZONS_H.map((h) => [h, []]));
  const satLossPcts = [];
  const satDrifts = [];

  for (const sat of satResults) {
    let e0 = NaN, e120 = NaN;
    for (const hr of sat.horizons) {
      const val = mode === "ap" ? hr.ap3d : mode === "sgp" ? hr.sgp3d : hr.tier1Ap3d;
      if (!Number.isFinite(val)) continue;
      byH.get(hr.h).push({ val, sgp: hr.sgp3d, d2: hr.d2 });
      if (hr.h === 0) e0 = val;
      if (hr.h === 120) e120 = val;
    }
    if (Number.isFinite(e0) && e0 > 0.1 && Number.isFinite(e120)) {
      satLossPcts.push(((e120 - e0) / e0) * 100.0);
      satDrifts.push(e120 - e0);
    }
  }

  const h0 = byH.get(0) || [];
  const h120 = byH.get(120) || [];
  if (!h0.length || !h120.length) return null;

  const v = (h) => (byH.get(h) || []).map((x) => x.val);
  const med0 = quantile(v(0), 0.5);
  const p68_0 = quantile(v(0), 0.6827);
  const rms0 = rms(v(0));
  const med24 = quantile(v(24), 0.5);
  const med48 = quantile(v(48), 0.5);
  const med72 = quantile(v(72), 0.5);
  const med96 = quantile(v(96), 0.5);
  const med120 = quantile(v(120), 0.5);
  const p68_120 = quantile(v(120), 0.6827);
  const rms120 = rms(v(120));

  const addedDriftMedM = med120 - med0;
  const addedDriftP68M = p68_120 - p68_0;
  const quadDriftMedM = med120 > med0 ? Math.sqrt(med120 * med120 - med0 * med0) : 0.0;
  const lossPct5d_Med = ((med120 - med0) / Math.max(0.01, med0)) * 100.0;
  const lossPct5d_P68 = ((p68_120 - p68_0) / Math.max(0.01, p68_0)) * 100.0;
  const propSharePct5d_Med = med120 > med0 ? ((med120 - med0) / med120) * 100.0 : 0.0;
  const medPerSatLossPct5d = quantile(satLossPcts, 0.5);
  const medPerSatDriftM = quantile(satDrifts, 0.5);

  const sgpMed0 = quantile(h0.map((x) => x.sgp), 0.5);
  const sgpMed120 = quantile(h120.map((x) => x.sgp), 0.5);
  const winRate0 = (100 * h0.filter((x) => x.val < x.sgp).length) / h0.length;
  const winRate120 = (100 * h120.filter((x) => x.val < x.sgp).length) / h120.length;

  const d2_0 = h0.map((x) => x.d2).filter(Number.isFinite);
  const d2_120 = h120.map((x) => x.d2).filter(Number.isFinite);
  const cov1s_0 = d2_0.length ? (100 * d2_0.filter((x) => x <= 3.5267).length) / d2_0.length : NaN;
  const cov2s_0 = d2_0.length ? (100 * d2_0.filter((x) => x <= 8.0249).length) / d2_0.length : NaN;
  const cov1s_120 = d2_120.length ? (100 * d2_120.filter((x) => x <= 3.5267).length) / d2_120.length : NaN;
  const cov2s_120 = d2_120.length ? (100 * d2_120.filter((x) => x <= 8.0249).length) / d2_120.length : NaN;
  const medMahalD_0 = d2_0.length ? quantile(d2_0.map(Math.sqrt), 0.5) : NaN;
  const medMahalD_120 = d2_120.length ? quantile(d2_120.map(Math.sqrt), 0.5) : NaN;

  return {
    n: h120.length,
    med0: Number(med0.toFixed(2)),
    p68_0: Number(p68_0.toFixed(2)),
    rms0: Number(rms0.toFixed(2)),
    med24: Number(med24.toFixed(2)),
    med48: Number(med48.toFixed(2)),
    med72: Number(med72.toFixed(2)),
    med96: Number(med96.toFixed(2)),
    med120: Number(med120.toFixed(2)),
    p68_120: Number(p68_120.toFixed(2)),
    rms120: Number(rms120.toFixed(2)),
    addedDriftMedM: Number(addedDriftMedM.toFixed(2)),
    addedDriftP68M: Number(addedDriftP68M.toFixed(2)),
    quadDriftMedM: Number(quadDriftMedM.toFixed(2)),
    lossPct5d_Med: Number(lossPct5d_Med.toFixed(2)),
    lossPct5d_P68: Number(lossPct5d_P68.toFixed(2)),
    propSharePct5d_Med: Number(propSharePct5d_Med.toFixed(2)),
    medPerSatLossPct5d: Number(medPerSatLossPct5d.toFixed(2)),
    medPerSatDriftM: Number(medPerSatDriftM.toFixed(2)),
    gainVsSgp0: Number((sgpMed0 / Math.max(0.01, med0)).toFixed(3)),
    gainVsSgp120: Number((sgpMed120 / Math.max(0.01, med120)).toFixed(3)),
    winRate0: Number(winRate0.toFixed(1)),
    winRate120: Number(winRate120.toFixed(1)),
    cov1s_0: Number.isFinite(cov1s_0) ? Number(cov1s_0.toFixed(1)) : null,
    cov2s_0: Number.isFinite(cov2s_0) ? Number(cov2s_0.toFixed(1)) : null,
    cov1s_120: Number.isFinite(cov1s_120) ? Number(cov1s_120.toFixed(1)) : null,
    cov2s_120: Number.isFinite(cov2s_120) ? Number(cov2s_120.toFixed(1)) : null,
    medMahalD_0: Number.isFinite(medMahalD_0) ? Number(medMahalD_0.toFixed(3)) : null,
    medMahalD_120: Number.isFinite(medMahalD_120) ? Number(medMahalD_120.toFixed(3)) : null,
  };
}

function summarizeAll(satResults, mode = "ap") {
  const all = summarizeSatSet(satResults, mode);
  const byRegime = {};
  const byFamily = {};
  const regGroups = new Map();
  const famGroups = new Map();
  for (const s of satResults) {
    if (!regGroups.has(s.regime)) regGroups.set(s.regime, []);
    regGroups.get(s.regime).push(s);
    if (!famGroups.has(s.family)) famGroups.set(s.family, []);
    famGroups.get(s.family).push(s);
  }
  for (const [r, list] of regGroups.entries()) byRegime[r] = summarizeSatSet(list, mode);
  for (const [f, list] of famGroups.entries()) byFamily[f] = summarizeSatSet(list, mode);
  return { all, byRegime, byFamily };
}

// Strictly monotone composite objective (positive partial derivatives wrt both med0 and med120)
function scoreStats(st, ownerSt = null, includeCov = false) {
  if (!st || !Number.isFinite(st.med0) || !Number.isFinite(st.med120)) return 1e12;
  const midAvg = (st.med24 + st.med48 + st.med72 + st.med96) * 0.25;
  const ownerDrift = ownerSt ? Math.max(0.0, ownerSt.med120 - ownerSt.med0) : 0.0;
  const excessDriftMed = Math.max(0.0, (st.med120 - st.med0) - ownerDrift);
  const excessDriftP68 = Math.max(0.0, st.p68_120 - st.p68_0);

  let s =
    1.55 * st.med0 +
    0.45 * st.p68_0 +
    0.45 * midAvg +
    1.55 * st.med120 +
    0.55 * st.p68_120 +
    0.95 * excessDriftMed +
    0.40 * excessDriftP68;

  if (includeCov && st.cov1s_0 !== null && st.cov1s_120 !== null) {
    s +=
      Math.abs(st.cov1s_0 - 68.27) * 8.0 +
      Math.abs(st.cov2s_0 - 95.45) * 10.0 +
      Math.abs(st.cov1s_120 - 68.27) * 8.0 +
      Math.abs(st.cov2s_120 - 95.45) * 10.0;
  }
  return s;
}

function scoreFleet(summary, ownerSummary, includeCov = false) {
  const globalScore = scoreStats(summary.all, ownerSummary.all, includeCov);
  let regBonus = 0.0;
  const weights = { MID_LEO: 0.20, HIGH_LEO: 0.25, MEO: 0.35, HEO: 0.12, GEO: 0.08 };
  for (const [r, w] of Object.entries(weights)) {
    if (summary.byRegime[r]) {
      const scale = r === "GEO" ? 0.25 : 1.0;
      regBonus += w * scale * scoreStats(summary.byRegime[r], ownerSummary.byRegime[r], includeCov);
    }
  }
  return 0.55 * globalScore + 0.45 * regBonus;
}

const tStart = performance.now();
console.log("Loading WASM hosts, EOP, Space Weather, DISCOS/SATCAT & GCRF Truth Suites...");

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
  startIso: "2026-11-03T00:00:00", stopIso: "2026-11-06T00:00:00", stepMinutes: 5,
});
const metopLate = await loadMetopSgGcrfSeries(framesHost, eopCtx.eopRows, {
  zipPath: (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive") + "/hac/eumetsat-metopsg/AUX_POFD/SGA1________AUX_POFD___S20261106000000Z_E20261111000000Z_G20261108064405Z_FDS__OPE_OPER.SIP.zip",
  startIso: "2026-11-06T00:00:00", stopIso: "2026-11-11T00:00:00", stepMinutes: 5,
});
const metopStates = [...metopEarly, ...metopLate].sort((a, b) => a.ms - b.ms);
const waasMap = await loadWaasSbasGcrfByPrn(framesHost, eopCtx.eopRows, { doys: [298, 299, 300, 301, 302, 303, 304, 305, 306, 307] });

const deepNorads = new Set([...refIdx.byNorad.keys(), 65159, ...waasMap.keys()]);
const allGpObjs = loadGpHistory({
  startDay: "2026-08-10",
  cutoffIso: "2026-11-08T23:59:59.999999",
  windowDays: 90.0,
  satcatRegistry: physReg,
  noradAllowlist: deepNorads,
});
const gpByNorad = new Map(allGpObjs.map((o) => [o.norad, o]));

const spwByDate = {};
const getCausalSpw = (cutoffIso) => {
  const dt = cutoffIso.slice(0, 10);
  if (!spwByDate[dt]) {
    const built = buildSpaceWeather({ firstDate: "2026-08-05", lastDate: "2026-12-20", cutoffDate: dt });
    spwByDate[dt] = { rows: built.rows, bytes: built.bytes };
  }
  return spwByDate[dt];
};

function sliceCausalWide(norad, cutoffIso, windowDays = 46.0) {
  const obj = gpByNorad.get(norad);
  if (!obj) return null;
  const cD70 = Date.parse(/[zZ]$/.test(cutoffIso) ? cutoffIso : `${cutoffIso}Z`) / 86400000;
  const causal = obj.tles.filter((t) => t.d70 <= cD70 + 1e-9 && t.d70 >= cD70 - (windowDays + 2.0));
  if (!causal.length) return null;
  const latest = causal.at(-1);
  if (cD70 - latest.d70 > 14.0) return null;
  return {
    norad,
    name: latest.name || obj.name,
    objectId: latest.objectId || obj.objectId,
    objectType: latest.objectType || obj.objectType,
    tles: causal.filter((t) => t.d70 >= latest.d70 - windowDays - 1e-9),
  };
}

const rawCases = [
  { norad: 65159, family: "EUMETSAT_METOPSG_LEO", cutoffMs: utcMs("2026-11-05T23:55:00Z"), customSeries: metopStates },
  ...[...waasMap.entries()].map(([norad, w]) => ({ norad, family: "WAAS_SBAS_GEO", cutoffMs: utcMs("2026-10-28T23:55:00Z"), customSeries: w.states })),
];
for (const [norad, entries] of refIdx.byNorad.entries()) {
  const latestStop = entries.at(-1).stop;
  if (latestStop < utcMs("2026-09-20T00:00:00Z")) continue;
  const family = entries.at(-1).family;
  const cutoffMs = latestStop - 122 * 3600000;
  const series = refIdx.getSeries(norad, cutoffMs - 98 * 3600000, latestStop);
  const fitStates = series.filter((s) => s.ms >= cutoffMs - 48 * 3600000 && s.ms <= cutoffMs);
  const check120 = refIdx.stateAtExactOrHermite(series, cutoffMs + 118 * 3600000, 1200);
  if (fitStates.length < 24 || !check120) continue;
  rawCases.push({ norad, family, cutoffMs, customSeries: null });
}

const workerTasks = [];
for (const tc of rawCases) {
  const cutoffIso = new Date(tc.cutoffMs).toISOString();
  if (isHeldForStudy(tc.norad, "", cutoffIso)) continue;
  const causalObj = sliceCausalWide(tc.norad, cutoffIso, 46.0);
  if (!causalObj?.tles?.length) continue;

  const refTle = causalObj.tles.at(-1);
  const refOwn = evalSgp4OwnEpochs(sdnApMain, [refTle])[0];
  if (!refOwn || refOwn.status !== 0) continue;
  const refEpochIso = isoFromJd(refTle.whole, refTle.frac);
  const baseMs = utcMs(refEpochIso);

  const futureTles = (gpByNorad.get(tc.norad)?.tles ?? []).filter((t) => t.d70 > refTle.d70 && t.d70 <= refTle.d70 + 5.3);
  let postCutoffBurn = false, prev = refTle;
  for (const ft of futureTles) {
    const dt = ft.d70 - prev.d70;
    if (dt > 0.05) {
      const midJd = jdFromMs(((prev.d70 + ft.d70) * 0.5) * 86400000);
      const ma = propagateSingleTleSgp4Gcrf(sdnApMain, prev, [midJd])[0];
      const mb = propagateSingleTleSgp4Gcrf(sdnApMain, ft, [midJd])[0];
      if (ma.status === 0 && mb.status === 0) {
        const jump = Math.hypot(mb.rGcrf[0] - ma.rGcrf[0], mb.rGcrf[1] - ma.rGcrf[1], mb.rGcrf[2] - ma.rGcrf[2]);
        if (jump > Math.max(8.0, 6.0 * dt)) { postCutoffBurn = true; break; }
      }
    }
    prev = ft;
  }
  if (postCutoffBurn) continue;

  const series = tc.customSeries ?? refIdx.getSeries(tc.norad, baseMs - 100 * 3600000, baseMs + 128 * 3600000);
  const maxBracketSec = tc.family === "WAAS_SBAS_GEO" ? 1800 : 1200;
  const rawTargets = HORIZONS_H.map((h) => {
    const tMs = baseMs + h * 3600000;
    const tr = refIdx.stateAtExactOrHermite(series, tMs, maxBracketSec);
    return tr ? { h, tMs, iso: new Date(tMs).toISOString(), jd: jdFromMs(tMs), tr } : null;
  }).filter(Boolean);
  if (rawTargets.length < 2 || rawTargets[0].h !== 0 || rawTargets.at(-1).h !== 120) continue;

  const sgpStates = propagateSingleTleSgp4Gcrf(sdnApMain, refTle, rawTargets.map((t) => t.jd));
  if (sgpStates.some((s) => s.status !== 0)) continue;
  const sgp0 = Math.hypot(
    sgpStates[0].rGcrf[0] - rawTargets[0].tr.r[0],
    sgpStates[0].rGcrf[1] - rawTargets[0].tr.r[1],
    sgpStates[0].rGcrf[2] - rawTargets[0].tr.r[2]
  ) * 1000;
  if (sgp0 > 15000) continue;

  const spw = getCausalSpw(cutoffIso);
  const spwDate = cutoffIso.slice(0, 10);
  let podFitStates = series.filter((s) => s.ms >= baseMs - 48 * 3600000 && s.ms <= baseMs);
  if (podFitStates.length < 16) {
    podFitStates = series.filter((s) => s.ms >= tc.cutoffMs - 48 * 3600000 && s.ms <= tc.cutoffMs);
  }
  let tier1States = null;
  if (podFitStates.length >= 12) {
    const t1Fit = await fitDenseGcrfOemToApOcm(sdnApMain, {
      norad: tc.norad,
      objectName: causalObj.name,
      objectId: causalObj.objectId,
      states: podFitStates,
      eccentricity: refTle.e,
      spwBytes: spw.bytes,
      pvnSpec: { sourceId: tc.family.toLowerCase(), lineage: CREDITS[tc.family] || tc.family },
    });
    if (t1Fit.ok) {
      tier1States = await propagateApOcmGcrf(sdnApMain, t1Fit.ocmBytes, rawTargets.map((t) => t.iso));
    }
  }

  const targets = rawTargets.map((t, idx) => {
    const drSgp = [
      sgpStates[idx].rGcrf[0] - t.tr.r[0],
      sgpStates[idx].rGcrf[1] - t.tr.r[1],
      sgpStates[idx].rGcrf[2] - t.tr.r[2],
    ];
    const drT1 = tier1States?.[idx]
      ? [
          tier1States[idx].rGcrf[0] - t.tr.r[0],
          tier1States[idx].rGcrf[1] - t.tr.r[1],
          tier1States[idx].rGcrf[2] - t.tr.r[2],
        ]
      : null;
    return {
      h: t.h,
      iso: t.iso,
      tr: t.tr,
      sgp3d: Math.hypot(...drSgp) * 1000,
      tier1Ap3d: drT1 ? Math.hypot(...drT1) * 1000 : NaN,
    };
  });

  const lastTgt = targets.at(-1);
  if (Number.isFinite(lastTgt.tier1Ap3d) && lastTgt.tier1Ap3d > 35000 && lastTgt.sgp3d > 35000) continue;

  workerTasks.push({
    norad: tc.norad,
    family: tc.family,
    spwDate,
    physicalPrior: physReg.get(tc.norad) || null,
    causalObj,
    targets,
  });
}

const dummySatsForRef = workerTasks.map((t) => ({
  norad: t.norad,
  family: t.family,
  regime: classifyOrbitRegime(t.causalObj.tles.at(-1).n, t.causalObj.tles.at(-1).e).regime,
  horizons: t.targets.map((x) => ({ h: x.h, ap3d: x.tier1Ap3d, sgp3d: x.sgp3d, tier1Ap3d: x.tier1Ap3d, d2: NaN })),
}));
const ownerSummary = summarizeAll(dummySatsForRef, "tier1");
const sgpSummary = summarizeAll(dummySatsForRef, "sgp");

console.log(`Prepared N=${workerTasks.length} paired maneuver-free 5-day truth trajectories in ${((performance.now() - tStart) / 1000).toFixed(1)}s`);
console.log(
  `Owner/Operator AP (Tier 1): +0h Med=${ownerSummary.all.med0}m -> +120h Med=${ownerSummary.all.med120}m | 5d Loss=${ownerSummary.all.lossPct5d_Med}% | Added Drift=+${ownerSummary.all.addedDriftMedM}m`
);
console.log(
  `Single-TLE SGP4 Baseline  : +0h Med=${sgpSummary.all.med0}m -> +120h Med=${sgpSummary.all.med120}m | 5d Loss=${sgpSummary.all.lossPct5d_Med}% | Added Drift=+${sgpSummary.all.addedDriftMedM}m`
);
for (const [r, st] of Object.entries(ownerSummary.byRegime)) {
  const sg = sgpSummary.byRegime[r];
  console.log(`  [${r.padEnd(8)} N=${String(st.n).padStart(3)}] Owner AP: ${st.med0}m -> ${st.med120}m (+${st.addedDriftMedM}m, ${st.lossPct5d_Med}%) | SGP4: ${sg.med0}m -> ${sg.med120}m (+${sg.addedDriftMedM}m, ${sg.lossPct5d_Med}%)`);
}

const buckets = Array.from({ length: NUM_WORKERS }, () => []);
workerTasks.forEach((task, idx) => buckets[idx % NUM_WORKERS].push(task));

const workers = [];
await Promise.all(
  buckets.map(
    (tasks) =>
      new Promise((resolve, reject) => {
        const w = new Worker(new URL("./lib/opt-round-worker.mjs", import.meta.url), {
          workerData: { tasks, spwByDate },
        });
        w.setMaxListeners(100);
        w.once("message", (msg) => {
          if (msg.type === "ready") {
            workers.push(w);
            resolve();
          }
        });
        w.once("error", reject);
      })
  )
);
console.log(`All ${workers.length} WASM optimization workers initialized and precomputed.\n`);

async function runEvalRound(roundNum, tuning) {
  const r0 = performance.now();
  const chunks = await Promise.all(
    workers.map(
      (w) =>
        new Promise((resolve, reject) => {
          const onErr = (err) => {
            w.off("message", onMsg);
            reject(err);
          };
          const onMsg = (msg) => {
            if (msg.type === "result" && msg.round === roundNum) {
              w.off("message", onMsg);
              w.off("error", onErr);
              resolve(msg.satResults);
            }
          };
          w.on("message", onMsg);
          w.once("error", onErr);
          w.postMessage({ type: "eval", round: roundNum, tuning });
        })
    )
  );
  const satResults = chunks.flat();
  const summary = summarizeAll(satResults, "ap");
  const elapsedSec = Number(((performance.now() - r0) / 1000).toFixed(2));
  return { satResults, summary, elapsedSec };
}

let bestCfg = mergeApTuning(BASELINE_AP_TUNING);
let bestSummary = null;
let bestFleetScore = Infinity;
const roundLogs = [];

async function executeRound(roundNum, spec) {
  const { name, targetScope = "ALL", includeCov = false, isVerification = false, buildCandidate } = spec;
  const candCfg = buildCandidate(bestCfg, bestSummary);
  const { summary, elapsedSec } = await runEvalRound(roundNum, candCfg);

  let accepted = false;
  let candScore = scoreFleet(summary, ownerSummary, includeCov);
  let refScore = bestSummary ? scoreFleet(bestSummary, ownerSummary, includeCov) : Infinity;

  if (roundNum === 1 || isVerification) {
    accepted = true;
  } else if (targetScope === "ALL") {
    if (candScore < refScore - 1e-6) accepted = true;
  } else if (targetScope === "LEO_ALL") {
    const cLeo =
      0.65 * scoreStats(summary.byRegime.HIGH_LEO, ownerSummary.byRegime.HIGH_LEO, includeCov) +
      0.35 * scoreStats(summary.byRegime.MID_LEO, ownerSummary.byRegime.MID_LEO, includeCov);
    const bLeo =
      0.65 * scoreStats(bestSummary.byRegime.HIGH_LEO, ownerSummary.byRegime.HIGH_LEO, includeCov) +
      0.35 * scoreStats(bestSummary.byRegime.MID_LEO, ownerSummary.byRegime.MID_LEO, includeCov);
    if (cLeo < bLeo - 1e-6) accepted = true;
  } else {
    const candReg = scoreStats(summary.byRegime[targetScope], ownerSummary.byRegime[targetScope], includeCov);
    const bestReg = scoreStats(bestSummary.byRegime[targetScope], ownerSummary.byRegime[targetScope], includeCov);
    if (candReg < bestReg - 1e-6) accepted = true;
  }

  if (accepted) {
    bestCfg = candCfg;
    bestSummary = summary;
    bestFleetScore = scoreFleet(bestSummary, ownerSummary, false);
  }

  const a = summary.all;
  const regKey = targetScope === "LEO_ALL" ? "HIGH_LEO" : targetScope;
  const regTag = regKey !== "ALL" && summary.byRegime[regKey]
    ? ` | ${regKey}: ${summary.byRegime[regKey].med0}m->${summary.byRegime[regKey].med120}m (${summary.byRegime[regKey].lossPct5d_Med}%, +${summary.byRegime[regKey].addedDriftMedM}m)`
    : "";
  const statusStr = isVerification ? "VERIFY" : accepted ? "ACCEPT" : "reject";
  console.log(
    `[R${String(roundNum).padStart(2, "0")}] ${statusStr} (${elapsedSec.toFixed(2)}s) ${name.padEnd(46)} | ` +
    `All: ${a.med0.toFixed(0)}m -> ${a.med120.toFixed(0)}m (5dLoss=${a.lossPct5d_Med.toFixed(1)}%, Drift=+${a.addedDriftMedM.toFixed(0)}m, Gain0=${a.gainVsSgp0.toFixed(2)}x, Gain120=${a.gainVsSgp120.toFixed(2)}x, Win120=${a.winRate120}%, Cov1s=${a.cov1s_0}/${a.cov1s_120}%)${regTag}`
  );

  roundLogs.push({
    round: roundNum,
    name,
    targetScope,
    accepted,
    elapsedSec,
    fleetScore: Number(candScore.toFixed(2)),
    incumbentFleetScore: Number(bestFleetScore.toFixed(2)),
    all: summary.all,
    byRegime: summary.byRegime,
    byFamily: summary.byFamily,
  });
}

// ============================================================================
// 50 SYSTEMATIC ASTRODYNAMICAL & STATISTICAL OPTIMIZATION ROUNDS
// ============================================================================
const ROUNDS = [
  // --- WAVE 1: Foundational Physics & Two-Pass Architecture (Rounds 01-12) ---
  {
    name: "Baseline Round-0 Reproduction",
    targetScope: "ALL",
    buildCandidate: () => mergeApTuning(BASELINE_AP_TUNING),
  },
  {
    name: "Unbias Secular Mean-Motion Prior + Even Subsample",
    targetScope: "ALL",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        subsampleMode: "even",
        regimes: {
          LOW_LEO: { priorSigNKmDay_Multi: 25.0, maxTles: 24 },
          MID_LEO: { priorSigNKmDay_Multi: 25.0, maxTles: 32 },
          HIGH_LEO: { priorSigNKmDay_Multi: 25.0, maxTles: 36 },
          MEO: { priorSigNKmDay_Multi: 30.0, maxTles: 48 },
          HEO: { priorSigNKmDay_Multi: 30.0, maxTles: 40 },
          GEO: { priorSigNKmDay_Multi: 35.0, maxTles: 48 },
        },
      }),
  },
  {
    name: "DISCOS Physical Drag Prior >=740km + High-LEO Drag <=1050km",
    targetScope: "HIGH_LEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        useDiscosDragPrior: true,
        cdPrior: 2.25,
        bstarTrustAltKm: 740.0,
        dragCeilingKm: 1050.0,
        priorSigLnB_Discos: 0.25,
        priorSigLnB_NoDiscos: 0.45,
      }),
  },
  {
    name: "LEO-Zero Fit Tesseral De-Aliasing + HEO Emit<=0.45",
    targetScope: "ALL",
    buildCandidate: (b) => mergeApTuning(b, { fitTesseralMode: "leoZero", emitMaxEcc: 0.45 }),
  },
  {
    name: "Compare All-Zero Fit Tesseral De-Aliasing",
    targetScope: "ALL",
    buildCandidate: (b) => mergeApTuning(b, { fitTesseralMode: "allZeroFit", emitMaxEcc: 0.45 }),
  },
  {
    name: "Two-Pass Stage C 3DOF In-Plane Polish (2.0d)",
    targetScope: "ALL",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          LOW_LEO: { polishMode: "3dof_inplane", polishWindowDays: 1.3, polishQProcT: 0.015 },
          MID_LEO: { polishMode: "3dof_inplane", polishWindowDays: 1.5, polishQProcT: 0.008 },
          HIGH_LEO: { polishMode: "3dof_inplane", polishWindowDays: 1.8, polishQProcT: 0.004 },
          MEO: { polishMode: "3dof_inplane", polishWindowDays: 1.8, polishQProcT: 0.002 },
          HEO: { polishMode: "3dof_inplane", polishWindowDays: 1.5, polishQProcT: 0.003 },
          GEO: { polishMode: "3dof_inplane", polishWindowDays: 2.0, polishQProcT: 0.004 },
        },
      }),
  },
  {
    name: "Position-Dominated Stage C Polish (polishVelMult=12x)",
    targetScope: "ALL",
    buildCandidate: (b) => mergeApTuning(b, { polishVelMult: 12.0 }),
  },
  {
    name: "27.32d (2.00*T_lunar) Secular Window in MEO/GEO/HEO",
    targetScope: "ALL",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          MEO: { windowDays: 27.32, maxTles: 60, qProcT: 0.0 },
          HEO: { windowDays: 19.54, maxTles: 48, qProcT: 0.001 },
          GEO: { windowDays: 19.54, maxTles: 48, qProcT: 0.002 },
        },
      }),
  },
  {
    name: "Enable MAP SRP (AGOM) Estimation in MEO/HEO/GEO",
    targetScope: "ALL",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        srpEnableRegimes: ["MEO", "HEO", "GEO"],
        priorSigLnA: 0.22,
        regimes: {
          MEO: { crPrior: 1.32, defaultAgom: 0.0065 },
          HEO: { crPrior: 1.30, defaultAgom: 0.012 },
          GEO: { crPrior: 1.30, defaultAgom: 0.012 },
        },
      }),
  },
  {
    name: "Temporal Burst De-Clustering (tau=0.55d, s=1.0)",
    targetScope: "ALL",
    buildCandidate: (b) => mergeApTuning(b, { clusterTauDays: 0.55, clusterStrength: 1.0 }),
  },
  {
    name: "Velocity Weight Balance (0.85x R/N, 2.2x T)",
    targetScope: "ALL",
    buildCandidate: (b) => mergeApTuning(b, { velRMult: 0.85, velTMult: 2.2, velNMult: 0.85 }),
  },
  {
    name: "Huber IRLS Outlier Threshold k=1.95 + 5 Stage-B Iters",
    targetScope: "ALL",
    buildCandidate: (b) => mergeApTuning(b, { huberK: 1.95, maxIterStageB: 5, enableContinuousThrustScreen: true }),
  },

  // --- WAVE 2: Deep MEO Secular Lunar Nulling & Epoch Phase Polish (Rounds 13-26) ---
  {
    name: "MEO Secular Window: 33.59d (2.4590*T_lunar Exact Slope Null)",
    targetScope: "MEO",
    buildCandidate: (b) => mergeApTuning(b, { regimes: { MEO: { windowDays: 33.59, maxTles: 72, qProcT: 0.0 } } }),
  },
  {
    name: "MEO Secular Window: 40.98d (3.00*T_lunar Triple Period)",
    targetScope: "MEO",
    buildCandidate: (b) => mergeApTuning(b, { regimes: { MEO: { windowDays: 40.98, maxTles: 84, qProcT: 0.0 } } }),
  },
  {
    name: "MEO Secular Window: 43.34d (3.173*T_lunar 3rd Slope Null)",
    targetScope: "MEO",
    buildCandidate: (b) => mergeApTuning(b, { regimes: { MEO: { windowDays: 43.34, maxTles: 88, qProcT: 0.0 } } }),
  },
  {
    name: "MEO Secular Window: 19.54d (1.4303*T_lunar 1st Slope Null)",
    targetScope: "MEO",
    buildCandidate: (b) => mergeApTuning(b, { regimes: { MEO: { windowDays: 19.54, maxTles: 52, qProcT: 0.0 } } }),
  },
  {
    name: "MEO SRP Prior Flexibility Sweep (priorSigLnA=0.38)",
    targetScope: "MEO",
    buildCandidate: (b) => mergeApTuning(b, { priorSigLnA: 0.38 }),
  },
  {
    name: "MEO SRP Prior Tight Sweep (priorSigLnA=0.12)",
    targetScope: "MEO",
    buildCandidate: (b) => mergeApTuning(b, { priorSigLnA: 0.12 }),
  },
  {
    name: "MEO Stage C: Latest Single-TLE 3DOF Anchor (win=0.0d, K=1, anc=2e-4)",
    targetScope: "MEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          MEO: { polishMode: "3dof_inplane", polishWindowDays: 0.0, polishMinK: 1, polishAnchorEcc: 2e-4, polishVelMult: 20.0 },
        },
      }),
  },
  {
    name: "MEO Stage C: Latest Single-TLE 1DOF u_M Anchor (win=0.0d, K=1)",
    targetScope: "MEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          MEO: { polishMode: "1dof_uM", polishWindowDays: 0.0, polishMinK: 1, polishVelMult: 20.0 },
        },
      }),
  },
  {
    name: "MEO Stage C: Ultra-Fresh 0.85d 3DOF Polish (anc=1.5e-4)",
    targetScope: "MEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          MEO: { polishMode: "3dof_inplane", polishWindowDays: 0.85, polishMinK: 1, polishQProcT: 0.05, polishAnchorEcc: 1.5e-4, polishVelMult: 20.0 },
        },
      }),
  },
  {
    name: "MEO Stage C: 1.4d 3DOF Polish + Steep Recency (qT=0.08)",
    targetScope: "MEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          MEO: { polishMode: "3dof_inplane", polishWindowDays: 1.4, polishMinK: 2, polishQProcT: 0.08, polishAnchorEcc: 2e-4, polishVelMult: 15.0 },
        },
      }),
  },
  {
    name: "MEO Stage C: 1.4d 5DOF Geom Polish (velMult=1.2, anc=4e-4)",
    targetScope: "MEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          MEO: { polishMode: "5dof_geom", polishWindowDays: 1.4, polishMinK: 2, polishQProcT: 0.02, polishAnchorEcc: 4e-4, polishVelMult: 1.2 },
        },
      }),
  },
  {
    name: "MEO Stage C: 2.5d 3DOF Polish + Recency qT=0.04",
    targetScope: "MEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          MEO: { polishMode: "3dof_inplane", polishWindowDays: 2.5, polishMinK: 2, polishQProcT: 0.04, polishAnchorEcc: 2.5e-4, polishVelMult: 15.0 },
        },
      }),
  },
  {
    name: "MEO Secular Mild Recency Weighting (qProcT=0.00015)",
    targetScope: "MEO",
    buildCandidate: (b) => mergeApTuning(b, { regimes: { MEO: { qProcT: 0.00015 } } }),
  },
  {
    name: "MEO Secular De-Weight Osculating Velocity (velTMult=4.0)",
    targetScope: "MEO",
    buildCandidate: (b) => mergeApTuning(b, { velTMult: 4.0, velRMult: 1.2, velNMult: 1.0 }),
  },

  // --- WAVE 3: Deep HIGH_LEO (Metop-SG + DORIS) & MID_LEO (Sentinel-1) Optimization (Rounds 27-37) ---
  {
    name: "HIGH_LEO Single-Pass 8.0d Secular DISCOS Arc (polish=none)",
    targetScope: "HIGH_LEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        useDiscosDragPrior: true,
        bstarTrustAltKm: 740.0,
        dragCeilingKm: 1050.0,
        regimes: { HIGH_LEO: { windowDays: 8.0, maxTles: 36, qProcT: 0.006, polishMode: "none" } },
      }),
  },
  {
    name: "HIGH_LEO 8.0d Secular + Latest-TLE 1DOF Phase Polish (u_M)",
    targetScope: "HIGH_LEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          HIGH_LEO: { windowDays: 8.0, maxTles: 36, qProcT: 0.006, polishMode: "1dof_uM", polishWindowDays: 0.8, polishMinK: 1, polishVelMult: 15.0 },
        },
      }),
  },
  {
    name: "HIGH_LEO Solve Drag <=1050km with Tight DISCOS Prior (sig=0.15)",
    targetScope: "HIGH_LEO",
    buildCandidate: (b) => mergeApTuning(b, { dragCeilingKm: 1050.0, priorSigLnB_Discos: 0.15 }),
  },
  {
    name: "HIGH_LEO Drag Coefficient Sweep: Cd=2.45",
    targetScope: "HIGH_LEO",
    buildCandidate: (b) => mergeApTuning(b, { cdPrior: 2.45 }),
  },
  {
    name: "HIGH_LEO Drag Coefficient Sweep: Cd=2.05",
    targetScope: "HIGH_LEO",
    buildCandidate: (b) => mergeApTuning(b, { cdPrior: 2.05 }),
  },
  {
    name: "HIGH_LEO Drag Coefficient Sweep: Cd=1.80",
    targetScope: "HIGH_LEO",
    buildCandidate: (b) => mergeApTuning(b, { cdPrior: 1.80 }),
  },
  {
    name: "HIGH_LEO Fixed Physical DISCOS Drag (dragCeiling=740km)",
    targetScope: "HIGH_LEO",
    buildCandidate: (b) => mergeApTuning(b, { dragCeilingKm: 740.0 }),
  },
  {
    name: "HIGH_LEO 10.5d Extended Secular Arc + 1DOF Phase Polish",
    targetScope: "HIGH_LEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          HIGH_LEO: { windowDays: 10.5, maxTles: 42, qProcT: 0.003, polishMode: "1dof_uM", polishWindowDays: 0.8, polishMinK: 1, polishVelMult: 15.0 },
        },
      }),
  },
  {
    name: "HIGH_LEO 6.2d Responsive Solar-Max Arc",
    targetScope: "HIGH_LEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          HIGH_LEO: { windowDays: 6.2, maxTles: 28, qProcT: 0.008 },
        },
      }),
  },
  {
    name: "MID_LEO 6.0d Arc + 1.0d 3DOF Position-Dominated Polish",
    targetScope: "MID_LEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          LOW_LEO: { windowDays: 4.5, qProcT: 0.05, polishMode: "3dof_inplane", polishWindowDays: 0.9, polishMinK: 1, polishAnchorEcc: 3e-4, polishVelMult: 10.0 },
          MID_LEO: { windowDays: 6.0, maxTles: 28, qProcT: 0.015, polishMode: "3dof_inplane", polishWindowDays: 1.0, polishMinK: 1, polishAnchorEcc: 2e-4, polishVelMult: 10.0 },
        },
      }),
  },
  {
    name: "MID_LEO BSTAR-DISCOS Trust Boundary 710km",
    targetScope: "MID_LEO",
    buildCandidate: (b) => mergeApTuning(b, { bstarTrustAltKm: 710.0 }),
  },

  // --- WAVE 4: HEO (QZS) & GEO (WAAS/IGSO) Deep Polish (Rounds 38-44) ---
  {
    name: "HEO 19.54d Secular + Latest-TLE 5DOF Polish (K=1)",
    targetScope: "HEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          HEO: { windowDays: 19.54, maxTles: 48, qProcT: 0.001, polishMode: "5dof_geom", polishWindowDays: 0.8, polishMinK: 1, polishAnchorEcc: 4e-4, polishVelMult: 2.0 },
        },
      }),
  },
  {
    name: "HEO 9.0d Compact Arc + Latest-TLE 3DOF Polish",
    targetScope: "HEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          HEO: { windowDays: 9.0, maxTles: 30, qProcT: 0.006, polishMode: "3dof_inplane", polishWindowDays: 0.8, polishMinK: 1, polishAnchorEcc: 3e-4, polishVelMult: 10.0 },
        },
      }),
  },
  {
    name: "HEO 5.0d Local Resonance Arc + Fixed DISCOS SRP",
    targetScope: "HEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        srpEnableRegimes: (b.srpEnableRegimes || []).filter((r) => r !== "HEO"),
        regimes: {
          HEO: { windowDays: 5.0, maxTles: 22, qProcT: 0.012, polishMode: "3dof_inplane", polishWindowDays: 0.8, polishMinK: 1, polishAnchorEcc: 3e-4, polishVelMult: 8.0 },
        },
      }),
  },
  {
    name: "GEO 27.32d (2*T_lunar) Secular + 1.0d 3DOF Polish",
    targetScope: "GEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          GEO: { windowDays: 27.32, maxTles: 60, qProcT: 0.001, polishMode: "3dof_inplane", polishWindowDays: 1.0, polishMinK: 1, polishAnchorEcc: 3e-4, polishVelMult: 12.0 },
        },
      }),
  },
  {
    name: "GEO 13.66d (1*T_lunar) Secular + 1.2d 5DOF Polish",
    targetScope: "GEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          GEO: { windowDays: 13.66, maxTles: 40, qProcT: 0.003, polishMode: "5dof_geom", polishWindowDays: 1.2, polishMinK: 2, polishAnchorEcc: 4e-4, polishVelMult: 4.0 },
        },
      }),
  },
  {
    name: "GEO Fixed DISCOS SRP vs Solved SRP Check",
    targetScope: "GEO",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        srpEnableRegimes: (b.srpEnableRegimes || []).filter((r) => r !== "GEO"),
      }),
  },
  {
    name: "Cross-Regime Temporal De-Clustering Fine Sweep (tau=0.40d, s=0.80)",
    targetScope: "ALL",
    buildCandidate: (b) => mergeApTuning(b, { clusterTauDays: 0.40, clusterStrength: 0.80 }),
  },

  // --- WAVE 5: Adaptive Local Perturbation & Closed-Loop Covariance Realism (Rounds 45-50) ---
  {
    name: "Adaptive Step -4% on Winning MEO & HIGH_LEO Windows",
    targetScope: "ALL",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          MEO: { windowDays: Number((b.regimes.MEO.windowDays * 0.96).toFixed(2)) },
          HIGH_LEO: { windowDays: Number((b.regimes.HIGH_LEO.windowDays * 0.96).toFixed(2)) },
        },
      }),
  },
  {
    name: "Adaptive Step +4% on Winning MEO & HIGH_LEO Windows",
    targetScope: "ALL",
    buildCandidate: (b) =>
      mergeApTuning(b, {
        regimes: {
          MEO: { windowDays: Number((b.regimes.MEO.windowDays * 1.04).toFixed(2)) },
          HIGH_LEO: { windowDays: Number((b.regimes.HIGH_LEO.windowDays * 1.04).toFixed(2)) },
        },
      }),
  },
  {
    name: "Adaptive Fine Step on MEO SRP CrPrior (1.24 vs 1.32)",
    targetScope: "MEO",
    buildCandidate: (b) => mergeApTuning(b, { regimes: { MEO: { crPrior: 1.24 } } }),
  },
  {
    name: "Closed-Loop 3D Mahalanobis Covariance Calibration Pass 1",
    targetScope: "ALL",
    includeCov: true,
    buildCandidate: (b, prevSum) => {
      const d0 = prevSum?.all?.medMahalD_0 || 1.8;
      const d120 = prevSum?.all?.medMahalD_120 || 0.9;
      const scaleMult = Math.max(0.5, Math.min(9.0, b.covScaleMult * Math.pow(d0 / 1.5382, 2.0)));
      const floorMult = Math.max(0.5, Math.min(5.0, b.covFloorMult * Math.pow(d0 / 1.5382, 1.5)));
      const nmMultMeo = Math.max(0.05, Math.min(2.5, Math.pow(d120 / 1.5382, 1.5)));
      return mergeApTuning(b, {
        covScaleMult: Number(scaleMult.toFixed(4)),
        covFloorMult: Number(floorMult.toFixed(4)),
        regimes: {
          MEO: { noiseMeanMotionMult: Number(nmMultMeo.toFixed(4)) },
          HIGH_LEO: { noiseMeanMotionMult: Number(Math.max(0.15, nmMultMeo).toFixed(4)) },
          HEO: { noiseMeanMotionMult: Number(Math.max(0.12, nmMultMeo).toFixed(4)) },
        },
      });
    },
  },
  {
    name: "Closed-Loop 3D Mahalanobis Covariance Calibration Pass 2",
    targetScope: "ALL",
    includeCov: true,
    buildCandidate: (b, prevSum) => {
      const d0 = prevSum?.all?.medMahalD_0 || 1.54;
      const d120 = prevSum?.all?.medMahalD_120 || 1.54;
      const adj0 = Math.max(0.7, Math.min(1.6, Math.pow(d0 / 1.5382, 1.8)));
      const adj120 = Math.max(0.35, Math.min(1.8, Math.pow(d120 / 1.5382, 1.4)));
      return mergeApTuning(b, {
        covScaleMult: Number((b.covScaleMult * adj0).toFixed(4)),
        covFloorMult: Number((b.covFloorMult * Math.sqrt(adj0)).toFixed(4)),
        regimes: {
          MEO: { noiseMeanMotionMult: Number(Math.max(0.03, b.regimes.MEO.noiseMeanMotionMult * adj120).toFixed(4)) },
          HIGH_LEO: { noiseMeanMotionMult: Number(Math.max(0.10, b.regimes.HIGH_LEO.noiseMeanMotionMult * adj120).toFixed(4)) },
        },
      });
    },
  },
  {
    name: "Final Locked Champion Verification (Round 50)",
    targetScope: "ALL",
    includeCov: true,
    isVerification: true,
    buildCandidate: (b) => mergeApTuning(b),
  },
];

if (ROUNDS.length !== 50) {
  throw new Error(`Expected 50 rounds, got ${ROUNDS.length}`);
}

for (let i = 0; i < ROUNDS.length; i++) {
  await executeRound(i + 1, ROUNDS[i]);
}

await Promise.all(workers.map((w) => w.terminate()));

const r1 = roundLogs[0];
const r50 = roundLogs[roundLogs.length - 1];

console.log("\n================================================================================");
console.log("50-ROUND TLE-ONLY AP OPTIMIZATION COMPLETE");
console.log("================================================================================");
console.log(`Owner/Operator AP (Tier 1): +0h=${ownerSummary.all.med0}m -> +120h=${ownerSummary.all.med120}m | 5d Loss=${ownerSummary.all.lossPct5d_Med}% | Added 5d Drift=+${ownerSummary.all.addedDriftMedM}m`);
console.log(`Single-TLE SGP4 Baseline  : +0h=${sgpSummary.all.med0}m -> +120h=${sgpSummary.all.med120}m | 5d Loss=${sgpSummary.all.lossPct5d_Med}% | Added 5d Drift=+${sgpSummary.all.addedDriftMedM}m`);
console.log(`Round 01 TLE-Only AP      : +0h=${r1.all.med0}m -> +120h=${r1.all.med120}m | 5d Loss=${r1.all.lossPct5d_Med}% | Added 5d Drift=+${r1.all.addedDriftMedM}m | Gain0=${r1.all.gainVsSgp0}x | Gain120=${r1.all.gainVsSgp120}x (${r1.all.winRate120}% win)`);
console.log(`Round 50 Champion TLE-AP  : +0h=${r50.all.med0}m -> +120h=${r50.all.med120}m | 5d Loss=${r50.all.lossPct5d_Med}% | Added 5d Drift=+${r50.all.addedDriftMedM}m | Gain0=${r50.all.gainVsSgp0}x | Gain120=${r50.all.gainVsSgp120}x (${r50.all.winRate120}% win)`);
console.log("\n=== ROUND 50 BY REGIME vs OWNER/OPERATOR AP & SGP4 ===");
for (const [reg, st] of Object.entries(r50.byRegime)) {
  const ow = ownerSummary.byRegime[reg];
  const sg = sgpSummary.byRegime[reg];
  const r0Reg = r1.byRegime[reg];
  console.log(
    `  ${reg.padEnd(9)} (N=${String(st.n).padStart(3)}): ` +
    `R01=${r0Reg.med0}->${r0Reg.med120}m (+${r0Reg.addedDriftMedM}m, ${r0Reg.lossPct5d_Med}%) | ` +
    `R50=${st.med0}->${st.med120}m (+${st.addedDriftMedM}m, ${st.lossPct5d_Med}%, Gain0=${st.gainVsSgp0}x, Gain120=${st.gainVsSgp120}x, Win120=${st.winRate120}%) | ` +
    `OwnerAP=${ow.med0}->${ow.med120}m (+${ow.addedDriftMedM}m, ${ow.lossPct5d_Med}%) | ` +
    `SGP4=${sg.med0}->${sg.med120}m (+${sg.addedDriftMedM}m, ${sg.lossPct5d_Med}%)`
  );
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
  LOG_PATH,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      totalElapsedSec: Number(((performance.now() - tStart) / 1000).toFixed(2)),
      pairedSatelliteCount: workerTasks.length,
      ownerOperatorApBaseline: ownerSummary,
      singleTleSgp4Baseline: sgpSummary,
      round01Baseline: r1,
      round50Champion: r50,
      winningTuning: bestCfg,
      rounds: roundLogs,
    },
    null,
    2
  )
);
console.log(`\nSaved complete 50-round log & winning tuning to ${LOG_PATH}`);
