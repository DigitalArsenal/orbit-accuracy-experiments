import { parentPort, workerData } from "node:worker_threads";
import * as flatbuffers from "flatbuffers";
import * as ERM from "../../../../../../repos/main-packages/spacedatastandards.org/lib/js/ERM/main.js";
import * as PCF from "../../../../../../repos/main-packages/spacedatastandards.org/lib/js/PCF/main.js";
import { OCM } from "../../../../../../repos/main-packages/spacedatastandards.org/lib/js/OCM/OCM.js";

import { loadWasmModule, TYPES } from "./wasm-hosts.mjs";
import { fitPureOwnEpochAp, evalSgp4OwnEpochs } from "./ssn-epoch-engine.mjs";
import { vecToUvw } from "./crlb-covariance.mjs";

function extractSigmaRtnM(ocmBytes, rTeme, vTeme) {
  const root = OCM.getRootAsOCM(new flatbuffers.ByteBuffer(ocmBytes));
  if (root.covarianceDataLength() < 6) return [NaN, NaN, NaN];
  const c00 = root.COVARIANCE_DATA(0);
  const c10 = root.COVARIANCE_DATA(1);
  const c11 = root.COVARIANCE_DATA(2);
  const c20 = root.COVARIANCE_DATA(3);
  const c21 = root.COVARIANCE_DATA(4);
  const c22 = root.COVARIANCE_DATA(5);

  const rr = Math.hypot(...rTeme);
  const h = [
    rTeme[1] * vTeme[2] - rTeme[2] * vTeme[1],
    rTeme[2] * vTeme[0] - rTeme[0] * vTeme[2],
    rTeme[0] * vTeme[1] - rTeme[1] * vTeme[0],
  ];
  const hh = Math.hypot(...h);
  if (!(rr > 0 && hh > 0)) {
    return [Math.sqrt(Math.max(0, c00)) * 1000, Math.sqrt(Math.max(0, c11)) * 1000, Math.sqrt(Math.max(0, c22)) * 1000];
  }
  const U = [rTeme[0] / rr, rTeme[1] / rr, rTeme[2] / rr];
  const W = [h[0] / hh, h[1] / hh, h[2] / hh];
  const V = [W[1] * U[2] - W[2] * U[1], W[2] * U[0] - W[0] * U[2], W[0] * U[1] - W[1] * U[0]];
  const P = [
    [c00, c10, c20],
    [c10, c11, c21],
    [c20, c21, c22],
  ];
  const quad = (u) => {
    let s = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) s += u[i] * P[i][j] * u[j];
    }
    return Math.sqrt(Math.max(0, s)) * 1000.0;
  };
  return [quad(U), quad(V), quad(W)];
}

if (workerData?.isWorker) {
  const [sdnApHost, accessHost, mnvHost] = await Promise.all([
    loadWasmModule("propagator/sdn-ap/dist/isomorphic/module.wasm"),
    loadWasmModule("analysis/access/dist/isomorphic/module.wasm"),
    loadWasmModule("analysis/maneuver-detection/dist/isomorphic/module.wasm"),
  ]);

  const bErm = new flatbuffers.Builder(256);
  ERM.ERM.finishERMBuffer(bErm, Object.assign(new ERM.ERMT(), { MODEL_NAME: "WGS-84" }).pack(bErm));
  const ermPayload = bErm.asUint8Array().slice();

  const bPcfLive = new flatbuffers.Builder(256);
  const pcfLiveObj = Object.assign(new PCF.PCFT(), {
    OUTPUT: Object.assign(new PCF.PCFOutputT(), {
      FRAME: PCF.pcfOutputFrame.GCRF,
      EPOCHS: ["2026-11-08T12:00:00.000000", "2026-11-09T12:00:00.000000"],
      MAXIMUM_STATES: 100,
    }),
  });
  bPcfLive.finish(pcfLiveObj.pack(bPcfLive), "$PCF");
  const pcfLivePayload = bPcfLive.asUint8Array().slice();

  const regMap = new Map(workerData.regEntries ?? []);
  const rollingMap = new Map(workerData.rollingEntries ?? []);
  const dcaRecord = workerData.dcaPayload
    ? {
        cid: workerData.dcaPayload.cid,
        nodeTimesMsNum: workerData.dcaPayload.nodeTimesMsNum,
        nodeTimesMs: workerData.dcaPayload.nodeTimesMsStr.map((s) => BigInt(s)),
        nodeLogScale: workerData.dcaPayload.nodeLogScale,
      }
    : null;
  const spw = { rows: workerData.spwRows };
  const objects = workerData.objects ?? [];

  const framedChunks = [];
  let totalBytes = 0;
  const meta = [];

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const reg = regMap.get(obj.norad) ?? null;
    const rollingPrior = rollingMap.get(obj.norad) ?? null;
    try {
      const fit = await fitPureOwnEpochAp({
        sdnApHost,
        accessHost,
        mnvHost,
        ermPayload,
        obj,
        spw,
        physicalPrior: reg,
        dcaRecord,
        rollingPrior,
      });

      if (!fit.ok) {
        meta.push({
          norad: obj.norad,
          name: obj.name,
          objectId: obj.objectId,
          objectType: obj.objectType,
          ok: false,
          error: fit.error,
        });
        continue;
      }

      if (fit.epoch < "2026-11-06T00:00:00" || fit.hpKm < 260) {
        const liveRes = await sdnApHost.invoke({
          methodId: "propagate",
          inputs: [
            { portId: "ocm", typeRef: TYPES.OCM, payload: fit.ocmBytes },
            { portId: "configuration", typeRef: TYPES.PCF, payload: pcfLivePayload },
          ],
        });
        if (liveRes.statusCode !== 0) {
          meta.push({
            norad: obj.norad,
            name: obj.name,
            objectId: obj.objectId,
            objectType: obj.objectType,
            ok: false,
            error: "decayed-before-catalog-window",
          });
          continue;
        }
      }

      const ownLatest = evalSgp4OwnEpochs(sdnApHost, [obj.tles[obj.tles.length - 1]])[0];
      const sigmaRtnM = extractSigmaRtnM(fit.ocmBytes, ownLatest.rTeme, ownLatest.vTeme);

      const framed = new Uint8Array(4 + fit.ocmBytes.length);
      new DataView(framed.buffer).setUint32(0, fit.ocmBytes.length, true);
      framed.set(fit.ocmBytes, 4);

      const streamOffset = totalBytes;
      totalBytes += framed.length;
      framedChunks.push(framed);

      meta.push({
        norad: obj.norad,
        name: obj.name,
        objectId: obj.objectId,
        objectType: obj.objectType || reg?.objectType || "UNKNOWN",
        ok: true,
        sourceTier: fit.mTle >= 2 ? "ap-own-epoch-multi-tle" : "ap-own-epoch-single-tle",
        theory: "AP",
        epoch: fit.epoch,
        regime: fit.regime,
        perigeeAltKm: Number(fit.hpKm.toFixed(1)),
        mTle: fit.mTle,
        arcDays: Number(fit.arcDays.toFixed(3)),
        ssnEpochProvenance: fit.ssnClassCounts,
        maneuverDetected: !!fit.maneuverInfo?.detected,
        fitRmsM: Number(fit.fitRmsM.toFixed(2)),
        bterm: Number(fit.bterm.toPrecision(6)),
        agom: Number(fit.agom.toPrecision(6)),
        solveDrag: fit.solveDrag,
        solveSrp: fit.solveSrp,
        hasDcaCommonMode: Boolean(
          OCM.getRootAsOCM(new flatbuffers.ByteBuffer(fit.ocmBytes)).PERTURBATIONS()?.DENSITY_CORRECTION() ===
            PCF.pcfDensityCorrection.DCA_COMMON_MODE
        ),
        hasRollingPrior: Boolean(rollingPrior && ((rollingPrior.btermSegsUsed ?? 0) > 0 || (rollingPrior.agomSegsUsed ?? 0) > 0)),
        hasDiscos: !!reg?.discos,
        sigmaRtnM: sigmaRtnM.map((x) => Number(x.toFixed(2))),
        rss3dSigmaM: Number(Math.hypot(...sigmaRtnM).toFixed(2)),
        streamOffset,
        byteLength: fit.ocmBytes.length,
      });
    } catch (err) {
      meta.push({
        norad: obj.norad,
        name: obj.name,
        objectId: obj.objectId,
        objectType: obj.objectType,
        ok: false,
        error: String(err?.message || err),
      });
    }
  }

  const outBuf = new Uint8Array(totalBytes);
  let pos = 0;
  for (const c of framedChunks) {
    outBuf.set(c, pos);
    pos += c.length;
  }

  await Promise.all([sdnApHost.destroy?.(), accessHost.destroy?.(), mnvHost.destroy?.()]);
  parentPort.postMessage({ meta, streamBuffer: outBuf.buffer }, [outBuf.buffer]);
}
