// propagator/sgp4 1.2.0 propagate_ephemeris framing, as the modules
// repository's maneuver-detection study frames it (study/lib/host.mjs):
// a PropagatorBatchRequest (schemas/StateVector.fbs) built field by field,
// $OMM element sets on the `omm` port, and one $OEM per object out.
// Encoding and decoding only; the propagation is the module's.
import * as flatbuffers from 'flatbuffers';
import { OEM } from 'spacedatastandards.org/lib/js/OEM/main.js';

export const PROP = { schemaName: 'orbpro.propagator.PropagatorBatchRequest', fileIdentifier: 'PROP', rootTypeName: 'PropagatorBatchRequest' };
export const OMM_TYPE = { schemaName: 'orbpro.sds.omm', fileIdentifier: '$OMM', rootTypeName: 'OMM' };
// ReferenceFrame (StateVector.fbs): the axes of propagate_ephemeris.
export const FRAME = { TEME: 0, ICRF: 2 };
const julian = (ms) => ms / 86400000 + 2440587.5;

// One block per object from startMs to stopMs every stepSeconds, in `frame`.
export function ephemerisRequest({ catalogNumbers, startMs, stopMs, stepSeconds, frame = FRAME.ICRF }) {
  const b = new flatbuffers.Builder(256);
  b.startVector(4, catalogNumbers.length, 4);
  for (let i = catalogNumbers.length - 1; i >= 0; --i) b.addInt32(catalogNumbers[i]);
  const cat = b.endVector();
  b.startObject(10);
  b.addFieldFloat64(0, julian(startMs), 0);   // epoch
  b.addFieldOffset(4, cat, 0);                // catalog_numbers
  b.addFieldInt8(5, frame, 3);                // output_frame (default ECEF)
  b.addFieldFloat64(6, julian(stopMs), 0);    // stop_epoch
  b.addFieldFloat64(7, stepSeconds, 0);       // step_seconds
  b.addFieldInt8(8, 0, 0);                    // element_set_blocks: one block
  b.addFieldInt32(9, 2, 2);                   // neighbour_sets
  b.finish(b.endObject());
  return b.asUint8Array().slice();
}

// The first block of an $OEM: [{ms, r [km], v [km/s]}].
export function ephemerisLines(bytes) {
  const block = OEM.getRootAsOEM(new flatbuffers.ByteBuffer(bytes)).unpack().EPHEMERIS_DATA_BLOCK[0];
  if (!block || /^REFUSED/.test(block.COMMENT ?? '')) throw new Error(`propagator/sgp4: ${block?.COMMENT ?? 'no ephemeris'}`);
  return block.EPHEMERIS_DATA_LINES.map((l) => ({ ms: Date.parse(/Z$/.test(l.EPOCH) ? l.EPOCH : `${l.EPOCH}Z`), r: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT] }));
}
