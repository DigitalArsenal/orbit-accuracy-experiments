// VENDORED for E13 (experiments/e13-open-dca): frames.mjs with convertRepresentation and fromGcrf added
// Source: orbit-accuracy-experiments task/e4-a4-full-force-20261009 at 70484b2 (E4 amendments A5/A6), not yet on main.
// Unchanged from the source.
// Delete this directory and import harness/frames.mjs when E4 A5/A6 lands; keep the two in step until then.
// foundation/frames `transform_frame_position` requests ($FRM, SDS RFM
// selectors). Encoding and decoding only: the rotations, their epochs and the
// state transforms are the module's.
import * as fb from 'flatbuffers';
import {
  FRM, FRMT, FRMFrameTransformRequestT, FRMStateVectorT, FRMVector3T, RFMCoordinateSystemT, RFMOriginT,
  frmOperationCode, frmResultStatus, frmStateRepresentation, rfmAxisType, rfmOriginKind,
} from 'spacedatastandards.org/lib/js/FRM/main.js';

const FRM_TYPE = { schemaName: 'FRM.fbs', fileIdentifier: '$FRM', rootTypeName: 'FRM' };
const earth = () => new RFMOriginT(rfmOriginKind.CELESTIAL_BODY, 399);
const object = (id) => Object.assign(new RFMOriginT(rfmOriginKind.SPACE_OBJECT), { OBJECT_ID: id });
const system = (name, axis, origin, epoch) => new RFMCoordinateSystemT(name, rfmAxisType[axis], origin, 399, epoch, 'UTC');
// state [m, m/s]
const stateVector = (state, name, epoch) => new FRMStateVectorT(frmStateRepresentation.CARTESIAN, [...state],
  new FRMVector3T(state[0], state[1], state[2]), new FRMVector3T(state[3], state[4], state[5]), name, epoch, 'UTC', 3.986004418e14);

function frame(request, portId) {
  const b = new fb.Builder(2048);
  FRM.finishFRMBuffer(b, new FRMT(request, null).pack(b));
  return { portId, typeRef: FRM_TYPE, payload: b.asUint8Array() };
}

function result(response) {
  const r = FRM.getRootAsFRM(new fb.ByteBuffer(new Uint8Array(response.outputs[0].payload))).FRAME_TRANSFORM_RESULT();
  if (!r || r.STATUS() !== frmResultStatus.OK) throw new Error(`foundation/frames: ${r?.ERROR_MESSAGE() ?? 'no result'}`);
  return r;
}

// A state on an Earth-centred inertial axis set (MEAN_EQUATOR_EQUINOX_J2000,
// ICRF, ...) to GCRF. epoch: ISO UTC; state [m, m/s]. Returns [m, m/s].
export async function toGcrf(frames, axis, epoch, state) {
  const request = Object.assign(new FRMFrameTransformRequestT(), {
    OPERATION: frmOperationCode.STATE_TRANSFORM,
    SOURCE_COORDINATE_SYSTEM: system(axis, axis, earth(), epoch),
    TARGET_COORDINATE_SYSTEM: system('GCRF', 'ICRF', earth(), epoch),
    SOURCE_STATE: stateVector(state, axis, epoch), TARGET_REPRESENTATION: frmStateRepresentation.CARTESIAN,
    EPOCH: epoch, EPOCH_TIME_SYSTEM: 'UTC',
  });
  const t = result(await frames.invoke('transform_frame_position', [frame(request, 'request')])).TARGET_STATE();
  const p = t.POSITION(), v = t.VELOCITY();
  return [p.X(), p.Y(), p.Z(), v.X(), v.Y(), v.Z()];
}

// The GCRF -> RTN rotation (rows R, T, N) of an object whose GCRF state
// [m, m/s] is given, at epoch (ISO UTC): row-major 3x3.
export async function rtnAxes(frames, epoch, state) {
  const request = Object.assign(new FRMFrameTransformRequestT(), {
    OPERATION: frmOperationCode.FRAME_ROTATION,
    SOURCE_COORDINATE_SYSTEM: system('GCRF', 'ICRF', earth(), epoch),
    TARGET_COORDINATE_SYSTEM: system('RTN', 'ORBITAL_RADIAL_TRANSVERSE_NORMAL', object('e4'), epoch),
    EPOCH: epoch, EPOCH_TIME_SYSTEM: 'UTC',
  });
  const objectState = Object.assign(new FRMFrameTransformRequestT(), {
    SOURCE_STATE: stateVector(state, 'ICRF', epoch), SOURCE_COORDINATE_SYSTEM: system('ICRF', 'ICRF', object('e4'), epoch),
  });
  const m = result(await frames.invoke('transform_frame_position', [frame(request, 'request'), frame(objectState, 'object_state')])).ROTATION_DCM();
  return [m.M11(), m.M12(), m.M13(), m.M21(), m.M22(), m.M23(), m.M31(), m.M32(), m.M33()];
}

// One state's element set in another representation on the same axes
// (STATE_REPRESENTATION_CONVERT, mu = 3.986004418e14 m^3/s^2), SDS order and
// SI units: CARTESIAN [m, m/s], KEPLERIAN [a m, e, i, RAAN, AOP, TA rad],
// MODIFIED_KEPLERIAN [perigee radius m, apogee radius m, i, RAAN, AOP, TA rad].
// epoch: ISO UTC.
export async function convertRepresentation(frames, epoch, from, elements, to) {
  const source = new FRMStateVectorT(frmStateRepresentation[from], [...elements],
    from === 'CARTESIAN' ? new FRMVector3T(elements[0], elements[1], elements[2]) : null,
    from === 'CARTESIAN' ? new FRMVector3T(elements[3], elements[4], elements[5]) : null, 'GCRF', epoch, 'UTC', 3.986004418e14);
  const request = Object.assign(new FRMFrameTransformRequestT(), {
    OPERATION: frmOperationCode.STATE_REPRESENTATION_CONVERT,
    SOURCE_COORDINATE_SYSTEM: system('GCRF', 'ICRF', earth(), epoch),
    SOURCE_STATE: source, TARGET_REPRESENTATION: frmStateRepresentation[to],
    EPOCH: epoch, EPOCH_TIME_SYSTEM: 'UTC',
  });
  const t = result(await frames.invoke('transform_frame_position', [frame(request, 'request')])).TARGET_STATE();
  return Array.from({ length: t.elementsLength() }, (_, i) => t.ELEMENTS(i));
}

// A GCRF state [m, m/s] on another Earth-centred inertial axis set (the
// inverse of toGcrf). epoch: ISO UTC.
export async function fromGcrf(frames, axis, epoch, state) {
  const request = Object.assign(new FRMFrameTransformRequestT(), {
    OPERATION: frmOperationCode.STATE_TRANSFORM,
    SOURCE_COORDINATE_SYSTEM: system('GCRF', 'ICRF', earth(), epoch),
    TARGET_COORDINATE_SYSTEM: system(axis, axis, earth(), epoch),
    SOURCE_STATE: stateVector(state, 'GCRF', epoch), TARGET_REPRESENTATION: frmStateRepresentation.CARTESIAN,
    EPOCH: epoch, EPOCH_TIME_SYSTEM: 'UTC',
  });
  const t = result(await frames.invoke('transform_frame_position', [frame(request, 'request')])).TARGET_STATE();
  const p = t.POSITION(), v = t.VELOCITY();
  return [p.X(), p.Y(), p.Z(), v.X(), v.Y(), v.Z()];
}
