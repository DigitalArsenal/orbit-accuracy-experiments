import { parentPort, workerData } from "node:worker_threads";
import * as flatbuffers from "flatbuffers";
import * as PCF from "spacedatastandards.org/lib/js/PCF/main.js";
import * as ERM from "spacedatastandards.org/lib/js/ERM/main.js";
import { OEM } from "spacedatastandards.org/lib/js/OEM/main.js";

import { vecToUvw } from "./crlb-covariance.mjs";
import { loadWasmModule, TYPES } from "./wasm-hosts.mjs";
import {
  fitPureOwnEpochAp,
  evalSgp4OwnEpochs,
  classifySsnEpochsBatch,
} from "./ssn-epoch-engine.mjs";

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
  if (res.statusCode !== 0 || !res.outputs.length) return null;
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
  return states;
}

const { tasks, spwByDate } = workerData;

const [accessHost, mnvHost, sdnAp] = await Promise.all([
  loadWasmModule("analysis/access/dist/isomorphic/module.wasm"),
  loadWasmModule("analysis/maneuver-detection/dist/isomorphic/module.wasm"),
  loadWasmModule("propagator/sdn-ap/dist/isomorphic/module.wasm"),
]);

const bErm = new flatbuffers.Builder(256);
ERM.ERM.finishERMBuffer(bErm, Object.assign(new ERM.ERMT(), { MODEL_NAME: "WGS-84" }).pack(bErm));
const ermPayload = bErm.asUint8Array().slice();

// Precompute invariant own-epoch SGP4 GCRF states (minutes = 0.0 ONLY) & SSN access classifications per satellite
const precomputedByNorad = new Map();
for (const task of tasks) {
  const tles = task.causalObj.tles;
  const sgpAll = evalSgp4OwnEpochs(sdnAp, tles);
  const validTles = [];
  const validSgp = [];
  const sgpByKey = new Map();
  for (let i = 0; i < tles.length; i++) {
    const k = tles[i].d70.toFixed(9);
    sgpByKey.set(k, sgpAll[i]);
    if (sgpAll[i].status === 0 && sgpAll[i].rGcrf.every(Number.isFinite)) {
      validTles.push(tles[i]);
      validSgp.push(sgpAll[i]);
    }
  }
  const ssnAll = await classifySsnEpochsBatch(accessHost, validTles, validSgp);
  const ssnByKey = new Map();
  for (let i = 0; i < validTles.length; i++) {
    ssnByKey.set(validTles[i].d70.toFixed(9), ssnAll[i]);
  }
  precomputedByNorad.set(task.norad, {
    sgpByKey,
    ssnByKey,
    mnvCache: new Map(),
  });
}

parentPort.postMessage({ type: "ready", count: tasks.length });

parentPort.on("message", async (msg) => {
  if (msg.type === "shutdown") {
    process.exit(0);
  }
  if (msg.type !== "eval") return;
  const { round, tuning } = msg;
  const satResults = [];

  for (const task of tasks) {
    const fit = await fitPureOwnEpochAp({
      sdnApHost: sdnAp,
      accessHost,
      mnvHost,
      ermPayload,
      obj: task.causalObj,
      spw: spwByDate[task.spwDate],
      physicalPrior: task.physicalPrior,
      tuning,
      precomputed: precomputedByNorad.get(task.norad),
    });
    if (!fit.ok) continue;

    const apStates = await propagateApOcmGcrf(sdnAp, fit.ocmBytes, task.targets.map((t) => t.iso));
    if (!apStates) continue;

    const horizons = [];
    for (let i = 0; i < task.targets.length; i++) {
      const tgt = task.targets[i];
      const apSt = apStates[i];
      if (!apSt) continue;
      const drAp = [apSt.rGcrf[0] - tgt.tr.r[0], apSt.rGcrf[1] - tgt.tr.r[1], apSt.rGcrf[2] - tgt.tr.r[2]];
      const refVel = tgt.tr.v && tgt.tr.v.some((v) => v !== 0) ? tgt.tr.v : apSt.vGcrf;
      const uvwAp = vecToUvw(tgt.tr.r, refVel, drAp);
      horizons.push({
        h: tgt.h,
        ap3d: Math.hypot(...drAp) * 1000,
        sgp3d: tgt.sgp3d,
        tier1Ap3d: tgt.tier1Ap3d,
        apT: uvwAp[1] * 1000,
        d2: apSt.P3 ? mahalanobis3dSq(drAp, apSt.P3) : NaN,
      });
    }
    if (horizons.length > 0) {
      satResults.push({
        norad: task.norad,
        family: task.family,
        regime: fit.regime,
        mTle: fit.mTle,
        arcDays: fit.arcDays,
        bterm: fit.bterm,
        agom: fit.agom,
        horizons,
      });
    }
  }

  parentPort.postMessage({ type: "result", round, satResults });
});
