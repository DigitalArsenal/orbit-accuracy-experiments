// $FRM state transforms for foundation/frames, with optional $EOP rows.
// Encoding only; the rotation is the module's.
import * as flatbuffers from 'flatbuffers';
import { EOP } from 'spacedatastandards.org/lib/js/EOP/main.js';
import { FRM, FRMFrameTransformRequestT, FRMStateVectorT, FRMT, FRMVector3T, RFMCoordinateSystemT, RFMOriginT, frmOperationCode, frmResultStatus,
  frmStateRepresentation, rfmAxisType, rfmOriginKind } from 'spacedatastandards.org/lib/js/FRM/main.js';

const FRM_TYPE = { schemaName: 'FRM.fbs', fileIdentifier: '$FRM', rootTypeName: 'FRM' };
const EOP_TYPE = { schemaName: 'EOP.fbs', fileIdentifier: '$EOP', rootTypeName: 'EOP' };
const AXES = { GCRF: rfmAxisType.ICRF, ITRF: rfmAxisType.BODY_FIXED, TEME: rfmAxisType.TRUE_EQUATOR_MEAN_EQUINOX_OF_DATE };
const system = (name, epoch) => new RFMCoordinateSystemT(name, AXES[name], new RFMOriginT(rfmOriginKind.CELESTIAL_BODY, 399), 399, epoch, 'UTC', null);
const encode = (finish, root) => { const b = new flatbuffers.Builder(4096); finish(b, root.pack(b)); return b.asUint8Array().slice(); };

// One state from frame `from` to frame `to` (GCRF, ITRF, TEME) at a UTC ISO
// epoch: {r, v} in km and km/s. eopRows: EOPT objects, when the rotation
// needs Earth orientation.
export async function transformState(frames, { from, to, epochIso, r, v = [0, 0, 0], eopRows = [] }) {
  const m = (a) => a.map((x) => x * 1000);
  const request = encode(FRM.finishFRMBuffer, new FRMT(new FRMFrameTransformRequestT(frmOperationCode.STATE_TRANSFORM, null, null, 0, 0, null,
    system(from, epochIso), system(to, epochIso),
    new FRMStateVectorT(frmStateRepresentation.CARTESIAN, [...m(r), ...m(v)], new FRMVector3T(...m(r)), new FRMVector3T(...m(v)), from, epochIso, 'UTC', 3.986004415e14),
    frmStateRepresentation.CARTESIAN, epochIso, 'UTC', null), null));
  const response = await frames.invoke('transform_frame_position', [{ portId: 'request', typeRef: FRM_TYPE, payload: request },
    ...eopRows.map((row) => ({ portId: 'earth_orientation', typeRef: EOP_TYPE, payload: encode(EOP.finishEOPBuffer, row) }))]);
  const result = FRM.getRootAsFRM(new flatbuffers.ByteBuffer(response.outputs[0].payload)).FRAME_TRANSFORM_RESULT();
  if (result.STATUS() !== frmResultStatus.OK) throw new Error(`foundation/frames: ${result.ERROR_MESSAGE()}`);
  const t = result.TARGET_STATE();
  return { r: [t.POSITION().X(), t.POSITION().Y(), t.POSITION().Z()].map((x) => x / 1000), v: [t.VELOCITY().X(), t.VELOCITY().Y(), t.VELOCITY().Z()].map((x) => x / 1000) };
}
