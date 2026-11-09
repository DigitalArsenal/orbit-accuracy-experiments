import fs from "node:fs";
import path from "node:path";
import * as flatbuffers from "flatbuffers";
import * as F from "spacedatastandards.org/lib/js/FRM/main.js";
import * as P from "spacedatastandards.org/lib/js/PRW/main.js";
import { EOP } from "spacedatastandards.org/lib/js/EOP/main.js";
import { createStandaloneHarness } from "space-data-module-sdk/testing/isomorphic";
import { encodeHttpResponse } from "space-data-module-sdk/runtime-contracts";
import { assertAllowedPath } from "./hold-gate.mjs";

export const MODULES_ROOT =
  process.env.SDN_MODULES_ROOT || new URL("../../../../../repos/main-packages/space-data-network-modules", import.meta.url).pathname;

const T = (schemaName, fileIdentifier, rootTypeName) => ({
  schemaName,
  fileIdentifier,
  rootTypeName,
  wireFormat: "flatbuffer",
});

export const TYPES = Object.freeze({
  OCM: T("OCM.fbs", "$OCM", "OCM"),
  OEM: T("OEM.fbs", "$OEM", "OEM"),
  OMM: T("OMM.fbs", "$OMM", "OMM"),
  PCF: T("PCF.fbs", "$PCF", "PCF"),
  SPW: T("SPW.fbs", "$SPW", "SPW"),
  PVN: T("PVN.fbs", "$PVN", "PVN"),
  TDM: T("TDM.fbs", "$TDM", "TDM"),
  EOO: T("EOO.fbs", "$EOO", "EOO"),
  GST: T("GST.fbs", "$GST", "GST"),
  EOP: T("EOP.fbs", "$EOP", "EOP"),
  FRM: T("FRM.fbs", "$FRM", "FRM"),
  ACW: T("ACW.fbs", "$ACW", "ACW"),
  PRW: T("PRW.fbs", "$PRW", "PRW"),
  MNV: T("MNV.fbs", "$MNV", "MNV"),
  ERM: T("ERM.fbs", "$ERM", "ERM"),
  ASG: T("ASG.fbs", "$ASG", "ASG"),
  EST: T("Estimation.fbs", "$EST", "EstimationEnvelope"),
  HRSP: T("HttpResponse.fbs", "HRSP", "HttpResponse"),
  MCFG: T("ModuleConfig.fbs", "MCFG", "ModuleConfig"),
});

export async function loadWasmModule(relOrAbsWasmPath, { enableThreads = false } = {}) {
  const full = path.isAbsolute(relOrAbsWasmPath)
    ? relOrAbsWasmPath
    : path.join(MODULES_ROOT, relOrAbsWasmPath);
  return createStandaloneHarness("browser", full, {
    surface: "direct",
    ...(enableThreads ? { enableThreads: true } : {}),
  });
}

/**
 * Loads IERS finals.daily.iau2000.txt through WASM data-source/eop-parser and returns:
 *  - eopStreamBytes (size-prefixed $EOP stream)
 *  - eopFrames (individual $EOP frames for foundation/frames)
 *  - earthOrientationPrw (size-prefixed $PRW EARTH_ORIENTATION for propagator/ffm & observation-od)
 */
export async function loadEopContext(
  eopParserHost,
  finalsPath = (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive") + "/hac/iers-eop/2026/2026-11-07/finals.daily.iau2000.txt"
) {
  assertAllowedPath(finalsPath);
  const body = new Uint8Array(fs.readFileSync(finalsPath));
  const res = await eopParserHost.invoke({
    methodId: "parse_finals2000a",
    inputs: [
      {
        portId: "response",
        typeRef: TYPES.HRSP,
        payload: encodeHttpResponse({
          url: "https://datacenter.iers.org/data/latestVersion/finals.daily.iau2000.txt",
          status: 200,
          error: "",
          headers: { "content-type": "text/plain" },
          body,
          retrievedMs: Date.parse("2026-11-07T08:47:00Z"),
        }),
      },
    ],
  });
  if (res.statusCode !== 0) {
    throw new Error(`eop-parser failed: ${res.errorCode}: ${res.errorMessage}`);
  }
  const eopStreamBytes = new Uint8Array(res.outputs.find((o) => o.portId === "records").payload);
  const eopRows = [];
  const buf = Buffer.from(eopStreamBytes);
  for (let i = 0; i < buf.length; ) {
    const n = buf.readUInt32LE(i);
    eopRows.push(
      EOP.getRootAsEOP(new flatbuffers.ByteBuffer(Uint8Array.from(buf.subarray(i + 4, i + 4 + n)))).unpack()
    );
    i += 4 + n;
  }

  // Keep 2026 rows for compact per-call $EOP frames
  const rows2026 = eopRows.filter((r) => String(r.DATE || "").startsWith("2026") || (r.MJD >= 61000 && r.MJD <= 61500));
  const activeRows = rows2026.length > 50 ? rows2026 : eopRows.slice(-450);

  const eopFrames = activeRows.map((row) => {
    const b = new flatbuffers.Builder(512);
    EOP.finishEOPBuffer(b, row.pack(b));
    return { portId: "earth_orientation", typeRef: TYPES.EOP, payload: b.asUint8Array().slice() };
  });

  const prwBuilder = new flatbuffers.Builder(1 << 16);
  const eoArm = Object.assign(new P.PRWEarthOrientationT(), { ROWS: activeRows });
  P.PRW.finishSizePrefixedPRWBuffer(prwBuilder, Object.assign(new P.PRWT(), { EARTH_ORIENTATION: eoArm }).pack(prwBuilder));
  const earthOrientationPrw = prwBuilder.asUint8Array().slice();

  return { eopStreamBytes, eopRows: activeRows, eopFrames, earthOrientationPrw };
}

/**
 * Pure WASM state transform via foundation/frames (`ITRF -> GCRF`, `GCRF -> ITRF`, `EME2000 -> GCRF`).
 * Input & output units: km and km/s (converted internally to m and m/s for $FRM).
 */
export async function transformStateKm(framesHost, eopFrames, { fromAxis, toAxis, epochIso, rKm, vKmS }) {
  const normIso = /Z$/i.test(epochIso) ? epochIso : `${epochIso}Z`;
  const axisEnum = (ax) => {
    if (ax === "GCRF" || ax === "ICRF") return { name: "GCRF", type: F.rfmAxisType.ICRF };
    if (ax === "ITRF") return { name: "ITRF", type: F.rfmAxisType.BODY_FIXED };
    if (ax === "EME2000" || ax === "J2000") return { name: "MEAN_EQUATOR_EQUINOX_J2000", type: F.rfmAxisType.MEAN_EQUATOR_EQUINOX_J2000 };
    throw new Error(`Unsupported axis ${ax}`);
  };
  const src = axisEnum(fromAxis);
  const dst = axisEnum(toAxis);
  const earth = () => new F.RFMOriginT(F.rfmOriginKind.CELESTIAL_BODY, 399);
  const srcSys = new F.RFMCoordinateSystemT(src.name, src.type, earth(), 399, normIso, "UTC");
  const dstSys = new F.RFMCoordinateSystemT(dst.name, dst.type, earth(), 399, normIso, "UTC");
  const sMeters = [rKm[0] * 1000, rKm[1] * 1000, rKm[2] * 1000, vKmS[0] * 1000, vKmS[1] * 1000, vKmS[2] * 1000];
  const sv = new F.FRMStateVectorT(
    F.frmStateRepresentation.CARTESIAN,
    sMeters,
    new F.FRMVector3T(sMeters[0], sMeters[1], sMeters[2]),
    new F.FRMVector3T(sMeters[3], sMeters[4], sMeters[5]),
    src.name,
    normIso,
    "UTC",
    3.986004418e14
  );
  const req = new F.FRMFrameTransformRequestT(
    F.frmOperationCode.STATE_TRANSFORM,
    null,
    null,
    0,
    0,
    null,
    srcSys,
    dstSys,
    sv,
    F.frmStateRepresentation.CARTESIAN,
    normIso,
    "UTC",
    null
  );
  const b = new flatbuffers.Builder(1024);
  F.FRM.finishFRMBuffer(b, new F.FRMT(req, null).pack(b));
  const res = await framesHost.invoke({
    methodId: "transform_frame_position",
    inputs: [{ portId: "request", typeRef: TYPES.FRM, payload: b.asUint8Array() }, ...(eopFrames ?? [])],
  });
  if (res.statusCode !== 0) {
    throw new Error(`foundation/frames invoke error: ${res.errorCode}: ${res.errorMessage}`);
  }
  const out = F.FRM.getRootAsFRM(new flatbuffers.ByteBuffer(new Uint8Array(res.outputs[0].payload))).FRAME_TRANSFORM_RESULT();
  if (!out || out.STATUS() !== F.frmResultStatus.OK) {
    throw new Error(`foundation/frames status ${out?.STATUS()}: ${out?.ERROR_MESSAGE()}`);
  }
  const ts = out.TARGET_STATE();
  return {
    rKm: [ts.POSITION().X() * 1e-3, ts.POSITION().Y() * 1e-3, ts.POSITION().Z() * 1e-3],
    vKmS: [ts.VELOCITY().X() * 1e-3, ts.VELOCITY().Y() * 1e-3, ts.VELOCITY().Z() * 1e-3],
  };
}
