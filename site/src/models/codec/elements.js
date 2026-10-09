// $MPE element sets for analysis/epoch-state and $OPM records for
// foundation/orbits. Encoding only.
import * as flatbuffers from 'flatbuffers';
import { MPE, MPET, meanElementSource } from 'spacedatastandards.org/lib/js/MPE/main.js';
import { OEM } from 'spacedatastandards.org/lib/js/OEM/main.js';
import { OPM, OPMT } from 'spacedatastandards.org/lib/js/OPM/main.js';

export const OPM_TYPE = { schemaName: 'OPM.fbs', fileIdentifier: '$OPM', rootTypeName: 'OPM' };

// Element sets {entityId, epochUnix (s), MEAN_MOTION, ECCENTRICITY, INCLINATION,
// RA_OF_ASC_NODE, ARG_OF_PERICENTER, MEAN_ANOMALY, BSTAR} as one aligned
// stream: size-prefixed $MPE frames, each padded to 8 bytes.
export function mpeStream(records) {
  const frames = records.map((r) => {
    const b = new flatbuffers.Builder(256);
    MPE.finishSizePrefixedMPEBuffer(b, new MPET(r.entityId, r.epochUnix, r.MEAN_MOTION, r.ECCENTRICITY, r.INCLINATION, r.RA_OF_ASC_NODE,
      r.ARG_OF_PERICENTER, r.MEAN_ANOMALY, r.BSTAR, meanElementSource.SGP4).pack(b));
    return b.asUint8Array().slice();
  });
  const padded = frames.map((f) => f.length + ((8 - (f.length % 8)) % 8));
  const bytes = new Uint8Array(padded.reduce((a, b) => a + b, 0));
  let at = 0;
  frames.forEach((f, i) => { bytes.set(f, at); at += padded[i]; });
  return { portId: 'elements', payload: bytes, typeRef: { schemaName: 'MPE.fbs', fileIdentifier: '$MPE', rootTypeName: 'MPE', wireFormat: 'aligned-binary', requiredAlignment: 8, byteLength: bytes.byteLength } };
}

// analysis/epoch-state derive: {states: [{r, v}] (GCRF, km, km/s), report}.
export async function deriveEpochStates(epochState, records) {
  const response = await epochState.invoke('derive', [mpeStream(records)]);
  const report = JSON.parse(new TextDecoder().decode(response.outputs.find((o) => o.portId === 'report').payload));
  const bytes = response.outputs.find((o) => o.portId === 'states')?.payload ?? new Uint8Array();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const states = [];
  for (let at = 0; at < bytes.length;) {
    const n = view.getUint32(at, true);
    if (n === 0) { at += 4; continue; }
    const oem = OEM.getSizePrefixedRootAsOEM(new flatbuffers.ByteBuffer(bytes.slice(at, at + 4 + n))).unpack();
    const line = oem.EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES[0];
    states.push({ id: oem.EPHEMERIS_DATA_BLOCK[0].OBJECT?.OBJECT_ID ?? null, epoch: line.EPOCH, r: [line.X, line.Y, line.Z], v: [line.X_DOT, line.Y_DOT, line.Z_DOT], comment: oem.EPHEMERIS_DATA_BLOCK[0].COMMENT ?? oem.COMMENT });
    at += 4 + n;
  }
  return { states, report };
}

export function opmBytes(o) {
  const b = new flatbuffers.Builder(512);
  OPM.finishOPMBuffer(b, Object.assign(new OPMT(), { CCSDS_OPM_VERS: '3.0', OBJECT_NAME: o.name, OBJECT_ID: o.id, CENTER_NAME: 'EARTH', REF_FRAME: 'EME2000', TIME_SYSTEM: 'UTC', EPOCH: o.epoch,
    SEMI_MAJOR_AXIS: o.a, ECCENTRICITY: o.e, INCLINATION: o.i, RA_OF_ASC_NODE: o.raan, ARG_OF_PERICENTER: o.argp, TRUE_ANOMALY: o.nu, GM: o.gm }).pack(b));
  return b.asUint8Array().slice();
}
export const decodeOemLine = (bytes) => {
  const buffer = new flatbuffers.ByteBuffer(new Uint8Array(bytes));
  const oem = (OEM.bufferHasIdentifier(buffer) ? OEM.getRootAsOEM(buffer) : OEM.getSizePrefixedRootAsOEM(buffer)).unpack();
  const l = oem.EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES[0];
  return { r: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT], frame: oem.EPHEMERIS_DATA_BLOCK[0].REFERENCE_FRAME };
};
