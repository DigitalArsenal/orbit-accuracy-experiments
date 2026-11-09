import { parentPort, workerData } from "node:worker_threads";
import * as flatbuffers from "flatbuffers";
import * as PCF from "spacedatastandards.org/lib/js/PCF/main.js";
import { OCM } from "spacedatastandards.org/lib/js/OCM/OCM.js";

import { loadWasmModule, TYPES } from "./wasm-hosts.mjs";
import { ALL_REGIME_OPTICAL_WASM_PATH, fitOpenOpticalArcToApOcm } from "./external-and-optical-ap-engine.mjs";

function extractSigmaRtnFromStateAndCov(ocmBytes) {
  const root = OCM.getRootAsOCM(new flatbuffers.ByteBuffer(ocmBytes));
  if (root.covarianceDataLength() < 6) return [NaN, NaN, NaN];
  const c00 = root.COVARIANCE_DATA(0);
  const c10 = root.COVARIANCE_DATA(1);
  const c11 = root.COVARIANCE_DATA(2);
  const c20 = root.COVARIANCE_DATA(3);
  const c21 = root.COVARIANCE_DATA(4);
  const c22 = root.COVARIANCE_DATA(5);
  if (root.stateDataLength() >= 6) {
    const r = [root.STATE_DATA(0), root.STATE_DATA(1), root.STATE_DATA(2)];
    const v = [root.STATE_DATA(3), root.STATE_DATA(4), root.STATE_DATA(5)];
    const rr = Math.hypot(...r);
    const h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]];
    const hh = Math.hypot(...h);
    if (rr > 0 && hh > 0) {
      const U = [r[0] / rr, r[1] / rr, r[2] / rr];
      const W = [h[0] / hh, h[1] / hh, h[2] / hh];
      const V = [W[1] * U[2] - W[2] * U[1], W[2] * U[0] - W[0] * U[2], W[0] * U[1] - W[1] * U[0]];
      const P = [
        [c00, c10, c20],
        [c10, c11, c21],
        [c20, c21, c22],
      ];
      const quad = (u) => {
        let s = 0;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += u[i] * P[i][j] * u[j];
        return Math.sqrt(Math.max(0, s)) * 1000.0;
      };
      return [quad(U), quad(V), quad(W)];
    }
  }
  return [Math.sqrt(Math.max(0, c00)) * 1000, Math.sqrt(Math.max(0, c11)) * 1000, Math.sqrt(Math.max(0, c22)) * 1000];
}

if (workerData?.isOpticalWorker) {
  const [optical, anglesFlow, obsOd, estimation, ffm, sdnAp] = await Promise.all([
    loadWasmModule(ALL_REGIME_OPTICAL_WASM_PATH),
    loadWasmModule("flows/angles-only-od/dist/isomorphic/module.wasm"),
    loadWasmModule("flows/observation-od/dist/isomorphic/module.wasm"),
    loadWasmModule("analysis/estimation/dist/isomorphic/module.wasm"),
    loadWasmModule("propagator/ffm/dist/isomorphic/module.wasm"),
    loadWasmModule("propagator/sdn-ap/dist/isomorphic/module.wasm"),
  ]);

  const bPcfLive = new flatbuffers.Builder(256);
  bPcfLive.finish(
    Object.assign(new PCF.PCFT(), {
      OUTPUT: Object.assign(new PCF.PCFOutputT(), {
        FRAME: PCF.pcfOutputFrame.GCRF,
        EPOCHS: ["2026-11-08T12:00:00.000000", "2026-11-09T12:00:00.000000"],
        MAXIMUM_STATES: 100,
      }),
    }).pack(bPcfLive),
    "$PCF"
  );
  const pcfLivePayload = bPcfLive.asUint8Array().slice();

  const hosts = { optical, anglesFlow, obsOd, estimation, ffm, sdnAp };
  const eopStreamBytes = new Uint8Array(workerData.eopStreamBytes);
  const earthOrientationPrw = new Uint8Array(workerData.earthOrientationPrw);
  const spwBytes = new Uint8Array(workerData.spwBytes);
  const jobs = workerData.jobs ?? [];

  const results = [];
  for (const job of jobs) {
    try {
      const fit = await fitOpenOpticalArcToApOcm(hosts, {
        norad: job.norad,
        objectId: job.objectId || `${job.norad}`,
        tdms: job.tdms.map((b) => new Uint8Array(b)),
        uncertainties: (job.eoos ?? []).map((b) => new Uint8Array(b)),
        stations: job.stations.map((b) => new Uint8Array(b)),
        stationTimingSigmas: job.timingSigmas ?? {},
        eopStreamBytes,
        earthOrientationPrw,
        spwBytes,
        pvnBytes: job.pvnBytes ? new Uint8Array(job.pvnBytes) : null,
      });

      if (!fit.ok) {
        results.push({ norad: job.norad, ok: false, stage: fit.stage, error: fit.error, metaExtra: job.metaExtra });
        continue;
      }

      // Verify live propagation on 2026-11-08 / 2026-11-09
      const liveCheck = await sdnAp.invoke({
        methodId: "propagate",
        inputs: [
          { portId: "ocm", typeRef: TYPES.OCM, payload: fit.ocmBytes },
          { portId: "configuration", typeRef: TYPES.PCF, payload: pcfLivePayload },
        ],
      });
      if (liveCheck.statusCode !== 0) {
        results.push({
          norad: job.norad,
          ok: false,
          stage: "live-propagate",
          error: `${liveCheck.errorCode}: ${liveCheck.errorMessage}`,
          metaExtra: job.metaExtra,
        });
        continue;
      }

      const sigmaRtnM = extractSigmaRtnFromStateAndCov(fit.ocmBytes);
      results.push({
        norad: job.norad,
        ok: true,
        ocmBytes: fit.ocmBytes,
        epoch: fit.epoch,
        smaKm: fit.smaKm,
        eccentricity: fit.eccentricity,
        bterm: fit.ocm.MEAN_ELEMENTS?.BTERM ?? 0,
        agom: fit.ocm.MEAN_ELEMENTS?.AGOM ?? 0,
        meanMotion: fit.ocm.MEAN_ELEMENTS?.MEAN_MOTION ?? 0,
        meanEcc: fit.ocm.MEAN_ELEMENTS?.ECCENTRICITY ?? fit.eccentricity,
        obsUsed: fit.obsUsed,
        residualRmsArcsec: fit.residualRmsArcsec,
        weightedRms: fit.weightedRms,
        fitRmsM: fit.fitRmsM,
        sigmaRtnM,
        rss3dSigmaM: Math.hypot(...sigmaRtnM),
        metaExtra: job.metaExtra,
      });
    } catch (err) {
      results.push({
        norad: job.norad,
        ok: false,
        stage: "exception",
        error: String(err?.message || err),
        metaExtra: job.metaExtra,
      });
    }
  }

  await Promise.all([
    optical.destroy?.(),
    anglesFlow.destroy?.(),
    obsOd.destroy?.(),
    estimation.destroy?.(),
    ffm.destroy?.(),
    sdnAp.destroy?.(),
  ]);
  parentPort.postMessage({ results });
}
