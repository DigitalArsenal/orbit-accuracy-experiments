// SDS records for the SDN-AP model: precise truth as an $OEM (GCRF, UTC), the
// $PCF configuration the SDN-AP module requires on its configuration port, and
// the $OMM and $OEM it answers with. Encoding and decoding only: the fits and
// the propagation are the modules'.
//
// The site's SDS binding (1.243.0) predates $PCF (SDS 1.264.0), so the $PCF is
// built here with the FlatBuffers runtime, field for field from
// schema/PCF/main.fbs: table PCF, field 2 THEORY (enum pcfTheory : ubyte,
// UNSPECIFIED 0, SGP4 1, SGP4XP 2, SDNAP 3), every other field at its documented
// default, file identifier "$PCF".
import * as flatbuffers from 'flatbuffers';
import { CATT, CelestialFrame, CelestialFrameWrapperT, OEM, OEMT, RFMT, RFMUnion, ephemerisDataBlockT, ephemerisDataLineT, timingStandard } from 'spacedatastandards.org/lib/js/OEM/main.js';
import { OMM } from 'spacedatastandards.org/lib/js/OMM/main.js';

export const TYPES = {
  OEM: { schemaName: 'OEM.fbs', fileIdentifier: '$OEM', rootTypeName: 'OEM', wireFormat: 'flatbuffer' },
  OMM: { schemaName: 'OMM.fbs', fileIdentifier: '$OMM', rootTypeName: 'OMM', wireFormat: 'flatbuffer' },
  PCF: { schemaName: 'PCF.fbs', fileIdentifier: '$PCF', rootTypeName: 'PCF', wireFormat: 'flatbuffer' },
};
export const THEORY = { UNSPECIFIED: 0, SGP4: 1, SGP4XP: 2, SDNAP: 3 };
const PCF_FIELDS = 13; // CONFIGURATION_ID .. OUTPUT
const PCF_THEORY_FIELD = 2;

export const frame = (portId, type, payload) => ({ portId, typeRef: TYPES[type], payload });
export const outputsOf = (response, port) => response.outputs.filter((f) => f.portId === port).map((f) => new Uint8Array(f.payload));

/** A $PCF that names the theory and leaves every other field at its default. */
export function pcf(theory) {
  const b = new flatbuffers.Builder(64);
  b.startObject(PCF_FIELDS);
  b.addFieldInt8(PCF_THEORY_FIELD, theory, 0);
  b.finish(b.endObject(), '$PCF');
  return b.asUint8Array().slice();
}

/**
 * An $OEM block of truth states (GCRF, UTC, km and km/s). `useable` limits the
 * fit to [start, stop]; a grid template passes zero states at its epochs.
 * `sizePrefixed` for readers that take only the size-prefixed form
 * (analysis/gp-error-model).
 */
export function oem(object, epochsMs, position, velocity, { useable = null, sizePrefixed = false } = {}) {
  const block = new ephemerisDataBlockT();
  block.OBJECT = Object.assign(new CATT(), { NORAD_CAT_ID: object.norad, OBJECT_ID: object.objectId ?? '', OBJECT_NAME: object.name });
  block.CENTER_NAME = 'EARTH';
  block.TIME_SYSTEM = timingStandard.UTC;
  block.REFERENCE_FRAME = Object.assign(new RFMT(), { REFERENCE_FRAME_type: RFMUnion.CelestialFrameWrapper,
    REFERENCE_FRAME: Object.assign(new CelestialFrameWrapperT(), { frame: CelestialFrame.GCRF }) });
  block.START_TIME = new Date(epochsMs[0]).toISOString();
  block.STOP_TIME = new Date(epochsMs.at(-1)).toISOString();
  if (useable) {
    block.USEABLE_START_TIME = new Date(useable[0]).toISOString();
    block.USEABLE_STOP_TIME = new Date(useable[1]).toISOString();
  }
  block.EPHEMERIS_DATA_LINES = epochsMs.map((ms, i) => {
    const line = new ephemerisDataLineT();
    line.EPOCH = new Date(ms).toISOString();
    [line.X, line.Y, line.Z] = position ? position.slice(3 * i, 3 * i + 3) : [0, 0, 0];
    [line.X_DOT, line.Y_DOT, line.Z_DOT] = velocity ? velocity.slice(3 * i, 3 * i + 3) : [0, 0, 0];
    return line;
  });
  const message = new OEMT();
  message.EPHEMERIS_DATA_BLOCK = [block];
  const b = new flatbuffers.Builder(1 << 20);
  if (sizePrefixed) OEM.finishSizePrefixedOEMBuffer(b, message.pack(b)); else OEM.finishOEMBuffer(b, message.pack(b));
  return b.asUint8Array().slice();
}

const sizePrefixed = (bytes, id) => new TextDecoder().decode(bytes.subarray(8, 12)) === id;

/** An $OMM's fields, plain or size-prefixed. */
export function readOmm(bytes) {
  const bb = new flatbuffers.ByteBuffer(bytes);
  return (sizePrefixed(bytes, '$OMM') ? OMM.getSizePrefixedRootAsOMM(bb) : OMM.getRootAsOMM(bb)).unpack();
}

/** The states of an $OEM's first block: [{ ms, r, v }], km and km/s. */
export function readOem(bytes) {
  const bb = new flatbuffers.ByteBuffer(bytes);
  const message = (sizePrefixed(bytes, '$OEM') ? OEM.getSizePrefixedRootAsOEM(bb) : OEM.getRootAsOEM(bb)).unpack();
  const block = message.EPHEMERIS_DATA_BLOCK[0];
  return { frame: block.REFERENCE_FRAME, lines: block.EPHEMERIS_DATA_LINES.map((l) => ({ ms: Date.parse(l.EPOCH.endsWith('Z') ? l.EPOCH : `${l.EPOCH}Z`), r: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT] })) };
}
