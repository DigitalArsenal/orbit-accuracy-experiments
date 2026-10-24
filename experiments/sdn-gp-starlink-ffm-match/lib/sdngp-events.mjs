// The maneuver, detection and reentry methods of the SDN-AP module (build 35cd83a2b714 on; amendment A10) through their published surfaces: typed $MNV in, $OMM / $MNV / $RDM out.
// JavaScript here encodes and decodes records and counts; every number comes out of the module.
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { flatbuffers, OMM } from './sds.mjs';

const require = createRequire(import.meta.url);
const standards = path.dirname(require.resolve('spacedatastandards.org/package.json'));
const load = (code) => import(pathToFileURL(path.join(standards, `lib/js/${code}/main.js`)));
export const [MNV, RDM] = await Promise.all(['MNV', 'RDM'].map(load));
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

/** `maneuver`: a fitted Earth set across burns [{ startUtc, endUtc, dvKmS }]: { ok, elements: [$OMM bytes], maneuvers: [unpacked $MNV] } or { ok: false, error }. Build 35cd83a2b714's manifest declares no environment port for it. */
export async function maneuver(sdngp, { omm, burns }) {
  const inputs = [{ portId: 'omm', typeRef: T('OMM'), payload: omm }, ...burns.map((b) => ({ portId: 'maneuvers', typeRef: T('MNV'), payload: mnvBytes(b) }))];
  const r = await sdngp.raw.h.invoke({ methodId: 'maneuver', inputs });
  if (r.statusCode !== 0) return fail(r);
  return { ok: true, elements: port(r, 'elements'), maneuvers: port(r, 'maneuvers').map((m) => rootOf(MNV.MNV, 'MNV', m).unpack()) };
}

/** `detect_maneuvers`: one plain or size-prefixed Earth TEME $OEM block: { ok, elements: [unpacked $OMM], maneuvers: [unpacked $MNV] } or { ok: false, error }. No environment port in build 35cd83a2b714. */
export async function detectManeuvers(sdngp, { oem }) {
  const r = await sdngp.raw.h.invoke({ methodId: 'detect_maneuvers', inputs: [{ portId: 'ephemeris', typeRef: T('OEM'), payload: oem }] });
  if (r.statusCode !== 0) return fail(r);
  return { ok: true, elements: port(r, 'elements').map((o) => rootOf(OMM.OMM, 'OMM', o).unpack()), maneuvers: port(r, 'maneuvers').map((m) => rootOf(MNV.MNV, 'MNV', m).unpack()) };
}

/** `reentry`: one Earth set with the weather: { ok, rdm: unpacked $RDM } or { ok: false, error }. */
export async function reentry(sdngp, { omm, weatherTable }) {
  const r = await sdngp.raw.h.invoke({ methodId: 'reentry', inputs: env([{ portId: 'omm', typeRef: T('OMM'), payload: omm }], weatherTable) });
  if (r.statusCode !== 0) return fail(r);
  return { ok: true, rdm: rootOf(RDM.RDM, 'RDM', port(r, 'reentry')[0]).unpack() };
}

/** `load_environment`: replaces the instance's environment with a $PRW space-weather table (as FFM reads it); the instance keeps it for the calls that follow (amendment A10d). */
export async function loadEnvironment(sdngp, weatherTable) {
  const r = await sdngp.raw.h.invoke({ methodId: 'load_environment', inputs: [{ portId: 'space_weather_table', typeRef: T('PRW'), payload: weatherTable }] });
  return r.statusCode === 0 ? { ok: true } : fail(r);
}
