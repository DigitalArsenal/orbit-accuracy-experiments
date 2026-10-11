// $OEM ephemeris versions and $MNV planned maneuvers for
// analysis/maneuver-detection's compare_ephemerides, framed as the modules
// repository's study frames NASA's ISS files (study/lib/nasa.mjs). Encoding
// and decoding only; the comparison is the module's.
import * as flatbuffers from 'flatbuffers';
import { CATT, CelestialFrame, CelestialFrameWrapperT, OEM, OEMT, RFMT, RFMUnion, ephemerisDataBlockT, ephemerisDataLineT, timingStandard } from 'spacedatastandards.org/lib/js/OEM/main.js';
import { MNV, MNVT, maneuverStatus } from 'spacedatastandards.org/lib/js/MNV/main.js';

export const TYPES = {
  OEM: { schemaName: 'OEM.fbs', fileIdentifier: '$OEM', rootTypeName: 'OEM', wireFormat: 'flatbuffer' },
  MNV: { schemaName: 'MNV.fbs', fileIdentifier: '$MNV', rootTypeName: 'MNV', wireFormat: 'flatbuffer' },
};
export { maneuverStatus };
export const jsonFrame = (portId, value) => ({ portId, payload: new TextEncoder().encode(JSON.stringify(value)), typeRef: { schemaName: 'application/json' } });
export const outputsOf = (response, port) => response.outputs.filter((f) => f.portId === port).map((f) => new Uint8Array(f.payload));
export const jsonOf = (response, port) => JSON.parse(new TextDecoder().decode(outputsOf(response, port)[0]));
export const unpackMnv = (bytes) => MNV.getRootAsMNV(new flatbuffers.ByteBuffer(bytes)).unpack();

// One trajectory version (EME2000, UTC, km, km/s) as a $OEM whose CREATION_DATE
// is its issue time. v: {url, created, epochsUnixMs, position [], velocity []}.
export function versionOem(v, object) {
  const b = new ephemerisDataBlockT();
  b.OBJECT = Object.assign(new CATT(), { NORAD_CAT_ID: object.norad, OBJECT_ID: object.objectId, OBJECT_NAME: object.name });
  b.COMMENT = `NASA ISS trajectory ${v.url.split('/iss-coords/')[1] ?? v.url}`;
  b.CENTER_NAME = 'EARTH';
  b.TIME_SYSTEM = timingStandard.UTC;
  b.REFERENCE_FRAME = Object.assign(new RFMT(), { REFERENCE_FRAME_type: RFMUnion.CelestialFrameWrapper,
    REFERENCE_FRAME: Object.assign(new CelestialFrameWrapperT(), { frame: CelestialFrame.EME2000 }) });
  b.EPHEMERIS_DATA_LINES = v.epochsUnixMs.map((ms, i) => {
    const l = new ephemerisDataLineT();
    l.EPOCH = new Date(ms).toISOString();
    [l.X, l.Y, l.Z] = v.position.slice(3 * i, 3 * i + 3);
    [l.X_DOT, l.Y_DOT, l.Z_DOT] = v.velocity.slice(3 * i, 3 * i + 3);
    return l;
  });
  const m = new OEMT();
  m.CREATION_DATE = v.created;
  m.EPHEMERIS_DATA_BLOCK = [b];
  const builder = new flatbuffers.Builder(1 << 20);
  OEM.finishOEMBuffer(builder, m.pack(builder));
  return builder.asUint8Array().slice();
}

// A planned burn as a size-prefixed $MNV (delta-V in km/s).
export function plannedMnv(burn, object) {
  const t = Object.assign(new MNVT(), {
    ID: `ISS:${burn.tig}:${burn.name}`, SAT_NO: object.norad, ORIG_OBJECT_ID: object.objectId, STATUS: maneuverStatus.PLANNED,
    EVENT_START_TIME: burn.tig, EVENT_END_TIME: burn.tig, DELTA_VEL: burn.dvMps / 1000,
    DESCRIPTION: `NASA plan issued ${burn.planIssued}: ${burn.name}, ${burn.dvMps} m/s, HA ${burn.haKm} km, HP ${burn.hpKm} km`,
  });
  const builder = new flatbuffers.Builder(1024);
  MNV.finishSizePrefixedMNVBuffer(builder, t.pack(builder));
  return builder.asUint8Array().slice();
}
