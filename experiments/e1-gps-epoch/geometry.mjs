// Sun and Moon geometry at an element set's epoch, for E1's covariates
// (PLAN.md §3, "Ephemerides for covariates"). Every vector here is computed
// by a module:
//
// - foundation/frames (`transform_frame_position`, $FRM STATE_TRANSFORM):
//   the Moon's and the Sun's geocentric GCRF states (ERFA ephemerides), and
//   their positions in the radial/transverse/normal axes of a point on the
//   orbit;
// - analysis/epoch-state (`derive`): that point, the GCRF state of the
//   element set with eccentricity, argument of perigee and mean anomaly set
//   to zero, which SGP4 puts at the ascending node of the set's own plane.
//
// This file frames requests, subtracts two module outputs (the body and the
// Earth's centre, both seen from the node point in the same axes) and takes
// norms, angles and a dot product of the results. Those are covariates for
// a regression, not orbit computations.
import * as fb from 'flatbuffers';
import {
  FRM, FRMT, FRMFrameTransformRequestT, FRMStateVectorT, FRMVector3T,
  RFMCoordinateSystemT, RFMOriginT, frmOperationCode, frmResultStatus,
  frmStateRepresentation, rfmAxisType, rfmOriginKind,
} from 'spacedatastandards.org/lib/js/FRM/main.js';
import { decodeOemStream, mpeFrame } from '../../harness/records.mjs';
import { epochMs } from '../../harness/gp-archive.mjs';

const FRM_TYPE = { schemaName: 'FRM.fbs', fileIdentifier: '$FRM', rootTypeName: 'FRM' };
const EARTH = 399, MOON = 301, SUN = 10;
const NODE_ID = 'e1-node-point';
const EARTH_GM = 3.986004418e14;

const body = (id) => new RFMOriginT(rfmOriginKind.CELESTIAL_BODY, id);
const nodeOrigin = () => Object.assign(new RFMOriginT(rfmOriginKind.SPACE_OBJECT), { OBJECT_ID: NODE_ID });
const system = (name, axis, origin, epoch) => new RFMCoordinateSystemT(name, axis, origin, EARTH, epoch, 'UTC');
const stateOf = (position, velocity, name, epoch) => new FRMStateVectorT(frmStateRepresentation.CARTESIAN,
  [...position, ...velocity], new FRMVector3T(...position), new FRMVector3T(...velocity), name, epoch, 'UTC', EARTH_GM);

function frame(request, portId) {
  const b = new fb.Builder(2048);
  FRM.finishFRMBuffer(b, new FRMT(request, null).pack(b));
  return { portId, typeRef: FRM_TYPE, payload: b.asUint8Array() };
}

// The centre of `origin` (a body) as a state in `target`, metres and m/s.
async function centreIn(frames, epoch, originId, target, extra = []) {
  const request = Object.assign(new FRMFrameTransformRequestT(), {
    OPERATION: frmOperationCode.STATE_TRANSFORM,
    SOURCE_COORDINATE_SYSTEM: system(`body-${originId}`, rfmAxisType.ICRF, body(originId), epoch),
    TARGET_COORDINATE_SYSTEM: target,
    SOURCE_STATE: stateOf([0, 0, 0], [0, 0, 0], `body-${originId}`, epoch),
    TARGET_REPRESENTATION: frmStateRepresentation.CARTESIAN,
    EPOCH: epoch, EPOCH_TIME_SYSTEM: 'UTC',
  });
  const response = await frames.invoke('transform_frame_position', [frame(request, 'request'), ...extra]);
  const result = FRM.getRootAsFRM(new fb.ByteBuffer(response.outputs[0].payload)).FRAME_TRANSFORM_RESULT();
  if (result.STATUS() !== frmResultStatus.OK) throw new Error(`foundation/frames: ${result.ERROR_MESSAGE()}`);
  const s = result.TARGET_STATE();
  return { r: [s.POSITION().X(), s.POSITION().Y(), s.POSITION().Z()], v: [s.VELOCITY().X(), s.VELOCITY().Y(), s.VELOCITY().Z()] };
}

const norm = (x) => Math.hypot(x[0], x[1], x[2]);
const iso = (text) => (/[zZ]$/.test(text) ? text : `${text}Z`);

// Node points for many sets in one epoch-state call: [{r, v}] in km, km/s.
async function nodePoints(epochState, sets) {
  const records = sets.map((s, i) => ({
    entityId: `node-${i}`,
    epochUnix: epochMs(s.epoch) / 1000,
    MEAN_MOTION: s.elements.MEAN_MOTION, ECCENTRICITY: 0, INCLINATION: s.elements.INCLINATION,
    RA_OF_ASC_NODE: s.elements.RA_OF_ASC_NODE, ARG_OF_PERICENTER: 0, MEAN_ANOMALY: 0, BSTAR: 0,
  }));
  const response = await epochState.invoke('derive', [mpeFrame(records)]);
  const states = decodeOemStream(response.outputs.find((f) => f.portId === 'states').payload);
  if (states.length !== sets.length) throw new Error(`analysis/epoch-state derived ${states.length} of ${sets.length} node points`);
  return states.map((o) => {
    const l = o.EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES[0];
    return { r: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT] };
  });
}

// Geometry of one body seen from the plane of one set.
//   distanceKm, rateKmS: geocentric distance and its rate (GCRF);
//   lambda: angle in the orbit plane from the ascending node, rad;
//   beta: elevation above the orbit plane, rad.
async function bodyGeometry(frames, epoch, id, rtn, earthInRtn) {
  const gcrf = await centreIn(frames, epoch, id, system('GCRF', rfmAxisType.ICRF, body(EARTH), epoch));
  const fromNode = await centreIn(frames, epoch, id, rtn.target, [rtn.object]);
  const g = [0, 1, 2].map((k) => fromNode.r[k] - earthInRtn[k]);
  const d = norm(gcrf.r);
  return {
    distanceKm: d / 1000,
    rateKmS: (gcrf.r[0] * gcrf.v[0] + gcrf.r[1] * gcrf.v[1] + gcrf.r[2] * gcrf.v[2]) / d / 1000,
    lambda: Math.atan2(g[1], g[0]),
    beta: Math.asin(g[2] / norm(g)),
  };
}

// Covariates for sets [{epoch, elements}]: [{moon, sun, raan}] (raan in rad,
// the set's own RA_OF_ASC_NODE).
export async function geometry(frames, epochState, sets) {
  const nodes = await nodePoints(epochState, sets);
  const out = [];
  for (let i = 0; i < sets.length; ++i) {
    const epoch = iso(sets[i].epoch);
    const node = nodes[i];
    const object = Object.assign(new FRMFrameTransformRequestT(), {
      SOURCE_STATE: stateOf(node.r.map((x) => x * 1000), node.v.map((x) => x * 1000), 'ICRF', epoch),
      SOURCE_COORDINATE_SYSTEM: system('ICRF', rfmAxisType.ICRF, nodeOrigin(), epoch),
    });
    const rtn = {
      target: system('node-RTN', rfmAxisType.ORBITAL_RADIAL_TRANSVERSE_NORMAL, nodeOrigin(), epoch),
      object: frame(object, 'object_state'),
    };
    const earth = (await centreIn(frames, epoch, EARTH, rtn.target, [rtn.object])).r;
    out.push({
      moon: await bodyGeometry(frames, epoch, MOON, rtn, earth),
      sun: await bodyGeometry(frames, epoch, SUN, rtn, earth),
      raan: sets[i].elements.RA_OF_ASC_NODE * Math.PI / 180,
    });
  }
  return out;
}
