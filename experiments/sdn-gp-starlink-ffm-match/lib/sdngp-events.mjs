// The maneuver, detection, reentry and launch methods of the SDN-AP module (build 35cd83a2b714 on; amendments A10 and A12) through their published surfaces: typed $MNV in, $OMM / $MNV / $RDM out; $LAM / $BOV in
// for the launch methods. Build 35cd83a2b714's `maneuver` and `detect_maneuvers` have no environment port (the instance's environment, set by `load_environment`, is in force); a later build declares the
// weather ports on them, and the environment in force is then sent with every call.
// JavaScript here encodes and decodes records and counts; every number comes out of the module.
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { flatbuffers, OMM } from './sds.mjs';

const require = createRequire(import.meta.url);
const standards = path.dirname(require.resolve('spacedatastandards.org/package.json'));
const load = (code) => import(pathToFileURL(path.join(standards, `lib/js/${code}/main.js`)));
export const [MNV, RDM, LAM, BOV] = await Promise.all(['MNV', 'RDM', 'LAM', 'BOV'].map(load));
const T = (name) => ({ schemaName: `${name}.fbs`, fileIdentifier: `$${name}`, rootTypeName: name, wireFormat: 'flatbuffer' });

/** One record's root, plain or size-prefixed (the file identifier sits at byte 4 or at byte 8). */
export function rootOf(cls, name, bytes) {
  const u = new Uint8Array(bytes);
  const id = (o) => String.fromCharCode(...u.slice(o, o + 4));
  const bb = new flatbuffers.ByteBuffer(u);
  if (id(4) === `$${name}`) return cls[`getRootAs${name}`](bb);
  if (id(8) === `$${name}`) return cls[`getSizePrefixedRootAs${name}`](bb);
  throw new Error(`not a $${name} record`);
}

/** A $MNV record to send: { startUtc, endUtc | null, dvKmS: [U, V, W] } (U radial, W along r x v, V = W x U of the pre-maneuver state; no end: an impulse). */
export function mnvBytes({ startUtc, endUtc = null, dvKmS, id = 'G1' }) {
  const t = new MNV.MNVT();
  Object.assign(t, { ID: id, STATUS: MNV.maneuverStatus.PLANNED, EVENT_START_TIME: startUtc, DELTA_VEL_U: dvKmS[0], DELTA_VEL_V: dvKmS[1], DELTA_VEL_W: dvKmS[2], DELTA_VEL: Math.hypot(...dvKmS) });
  if (endUtc) t.EVENT_END_TIME = endUtc;
  const b = new flatbuffers.Builder(512);
  MNV.MNV.finishMNVBuffer(b, t.pack(b)); // plain: build 35cd83a2b714 refuses a size-prefixed $MNV as not verifiable
  return b.asUint8Array();
}

const fail = (r) => ({ ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}` });
const port = (r, id) => r.outputs.filter((o) => o.portId === id).map((o) => new Uint8Array(o.payload));
const env = (inputs, weatherTable) => { if (weatherTable) inputs.push({ portId: 'space_weather_table', typeRef: T('PRW'), payload: weatherTable }); return inputs; };

/** The environment in force, as a weather port, for a method of a build that declares one for it (an earlier build gets it from `load_environment`). */
const forceEnvironment = (sdngp, methodId, inputs, weatherTable) => {
  const table = weatherTable ?? sdngp.environmentTable;
  if (table && sdngp.declares(methodId, 'space_weather_table')) inputs.push({ portId: 'space_weather_table', typeRef: T('PRW'), payload: table });
  return inputs;
};

/** `maneuver`: a fitted Earth set across burns [{ startUtc, endUtc, dvKmS }]: { ok, elements: [$OMM bytes], maneuvers: [unpacked $MNV] } or { ok: false, error }. `weatherTable` (a $PRW) goes as the port where the build declares one. */
export async function maneuver(sdngp, { omm, burns, weatherTable }) {
  const inputs = forceEnvironment(sdngp, 'maneuver', [{ portId: 'omm', typeRef: T('OMM'), payload: omm }, ...burns.map((b) => ({ portId: 'maneuvers', typeRef: T('MNV'), payload: mnvBytes(b) }))], weatherTable);
  const r = await sdngp.raw.h.invoke({ methodId: 'maneuver', inputs });
  if (r.statusCode !== 0) return fail(r);
  return { ok: true, elements: port(r, 'elements'), maneuvers: port(r, 'maneuvers').map((m) => rootOf(MNV.MNV, 'MNV', m).unpack()) };
}

/** `detect_maneuvers`: one plain or size-prefixed Earth TEME $OEM block: { ok, elements: [unpacked $OMM], maneuvers: [unpacked $MNV] } or { ok: false, error }. The environment in force goes as the weather port where the build declares one. */
export async function detectManeuvers(sdngp, { oem, weatherTable }) {
  const r = await sdngp.raw.h.invoke({ methodId: 'detect_maneuvers', inputs: forceEnvironment(sdngp, 'detect_maneuvers', [{ portId: 'ephemeris', typeRef: T('OEM'), payload: oem }], weatherTable) });
  if (r.statusCode !== 0) return fail(r);
  return { ok: true, elements: port(r, 'elements').map((o) => rootOf(OMM.OMM, 'OMM', o).unpack()), maneuvers: port(r, 'maneuvers').map((m) => rootOf(MNV.MNV, 'MNV', m).unpack()) };
}

/** `reentry`: one Earth set with the weather: { ok, rdm: unpacked $RDM } or { ok: false, error }. */
export async function reentry(sdngp, { omm, weatherTable }) {
  const r = await sdngp.raw.h.invoke({ methodId: 'reentry', inputs: env([{ portId: 'omm', typeRef: T('OMM'), payload: omm }], weatherTable) });
  if (r.statusCode !== 0) return fail(r);
  return { ok: true, rdm: rootOf(RDM.RDM, 'RDM', port(r, 'reentry')[0]).unpack() };
}

/** `load_environment`: the environment in force for the calls that follow (amendment A10d): an earlier build keeps the $PRW space-weather table in the instance; a build that declares the weather ports on
 * `detect_maneuvers` and `maneuver` is not told (the table is sent with each call, and nothing is left in the instance). */
export async function loadEnvironment(sdngp, weatherTable) {
  sdngp.environmentTable = weatherTable;
  if (sdngp.declares('detect_maneuvers', 'space_weather_table')) return { ok: true, perCall: true };
  const r = await sdngp.raw.h.invoke({ methodId: 'load_environment', inputs: [{ portId: 'space_weather_table', typeRef: T('PRW'), payload: weatherTable }] });
  return r.statusCode === 0 ? { ok: true } : fail(r);
}

// ---- launch methods (amendment A12) ----

/** A $BOV burnout vector to send: EFG position and velocity (the units are the build's to read; probed) at `epochUtc`. */
export function bovBytes({ epochUtc, efg, timeFromLaunch = 0 }) {
  const t = Object.assign(new BOV.BOVT(), { E_COORDINATE: efg[0], F_COORDINATE: efg[1], G_COORDINATE: efg[2], E_DOT: efg[3], F_DOT: efg[4], G_DOT: efg[5], EPOCH: epochUtc, TIME_FROM_LAUNCH: timeFromLaunch });
  const b = new flatbuffers.Builder(256);
  BOV.BOV.finishBOVBuffer(b, t.pack(b));
  return b.asUint8Array();
}

/** A $LAM with an INSERTION orbit: osculating elements at `epochUtc` (a in m, angles in degrees; the argument of latitude is the angle from the node to the position) in `frame` (TEME, GCRF, ICRF, EME2000 or J2000). */
export function lamBytes({ epochUtc, aM, eccentricity = 0, inclinationDeg, raanDeg, argPeriapsisDeg = 0, argLatitudeDeg, frame = 'GCRF', message = 'G1 A12' }) {
  const insertion = Object.assign(new LAM.lamInsertionOrbitT(), { EPOCH: epochUtc, TIME_FROM_LAUNCH_S: 0, REF_FRAME: frame, SEMI_MAJOR_AXIS_M: aM, ECCENTRICITY: eccentricity, INCLINATION_DEG: inclinationDeg, RAAN_DEG: raanDeg,
    ARGUMENT_OF_PERIAPSIS_DEG: argPeriapsisDeg, ARGUMENT_OF_LATITUDE_DEG: argLatitudeDeg, PERIAPSIS_ALTITUDE_M: aM * (1 - eccentricity) - 6378137, APOAPSIS_ALTITUDE_M: aM * (1 + eccentricity) - 6378137 });
  const t = Object.assign(new LAM.LAMT(), { MESSAGE_ID: message, ORIGINATOR: 'G1', TIME_SYSTEM: 'UTC', REF_FRAME: frame, ORBIT_INSERTION_EPOCH: epochUtc, INSERTION: insertion });
  const b = new flatbuffers.Builder(1024);
  LAM.LAM.finishLAMBuffer(b, t.pack(b));
  return b.asUint8Array();
}

/** `launch_set`: the first set of a burnout vector (or a $LAM bytes) with an optional prior $OMM: { ok, omm (bytes), unpacked } or { ok: false, error }. */
export async function launchSet(sdngp, { burnout, launch, prior }) {
  const inputs = [];
  if (burnout) inputs.push({ portId: 'burnout', typeRef: T('BOV'), payload: burnout });
  if (launch) inputs.push({ portId: 'launch', typeRef: T('LAM'), payload: launch });
  if (prior) inputs.push({ portId: 'prior', typeRef: T('OMM'), payload: prior });
  const r = await sdngp.raw.h.invoke({ methodId: 'launch_set', inputs });
  if (r.statusCode !== 0) return fail(r);
  const omm = port(r, 'elements')[0];
  return { ok: true, omm, unpacked: rootOf(OMM.OMM, 'OMM', omm).unpack() };
}

/** `launch_batch`: the batch-joint fit of N plain $OEM blocks (one block per object, passed as N ephemeris inputs) with an optional burnout vector, prior and catalog sets: { ok, sets: [{ omm, unpacked }] } or { ok: false, error }. */
export async function launchBatch(sdngp, { oems, burnout, launch, prior, catalog, weatherTable }) {
  const inputs = oems.map((payload) => ({ portId: 'ephemeris', typeRef: T('OEM'), payload }));
  if (burnout) inputs.push({ portId: 'burnout', typeRef: T('BOV'), payload: burnout });
  if (launch) inputs.push({ portId: 'launch', typeRef: T('LAM'), payload: launch });
  if (prior) inputs.push({ portId: 'prior', typeRef: T('OMM'), payload: prior });
  for (const c of catalog ?? []) inputs.push({ portId: 'catalog', typeRef: T('OMM'), payload: c });
  forceEnvironment(sdngp, 'launch_batch', inputs, weatherTable);
  const r = await sdngp.raw.h.invoke({ methodId: 'launch_batch', inputs });
  if (r.statusCode !== 0) return fail(r);
  return { ok: true, sets: port(r, 'elements').map((omm) => ({ omm, unpacked: rootOf(OMM.OMM, 'OMM', omm).unpack() })) };
}
