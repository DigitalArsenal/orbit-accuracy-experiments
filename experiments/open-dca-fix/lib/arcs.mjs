// Planet's states as the product reads them: analysis/density-calibration prepare_operator_states (TT and EME2000 to UTC and GCRF) and fit_energy_arcs (the energy fit against NRLMSISE-00),
// one arc at a time, on the weather as released at the arc's publication. And the same states' drag work under a time shift, for PLAN.md's W_N step. Encoding, decoding and selection only.
import fs from 'node:fs';
import path from 'node:path';
import { config, root, DAY, HOUR, iso } from '../common.mjs';
import { planetBytes } from './planet.mjs';
import { DCL, DCL_TYPE, flatbuffers } from './product.mjs';

export const calibration = () => new Set(JSON.parse(fs.readFileSync(path.join(root, config.planet.sample))).calibration);
/** Each calibration Dove's distinct states, oldest first: Map(hwid -> [{ttMs, state [m, m/s], file}]), a state's file the first that held it. */
export function planetSeries(days) {
  const keep = calibration(), series = new Map();
  for (const day of [...days].sort()) {
    const bytes = planetBytes(day);
    if (!bytes) continue;
    for (const line of bytes.toString().split('\n')) {
      const f = line.trim().split(/\s+/);
      if (f.length < 9 || !keep.has(f[0].toLowerCase())) continue;
      const id = f[0].toLowerCase(), ttMs = Date.UTC(2000, 0, 1, 12) + Math.round(Number(f[1]) * 1e3);
      if (!series.has(id)) series.set(id, new Map());
      if (!series.get(id).has(ttMs)) series.get(id).set(ttMs, { ttMs, state: f.slice(2, 8).map(Number), file: day });
    }
  }
  return new Map([...series].map(([id, m]) => [id, [...m.values()].sort((a, b) => a.ttMs - b.ttMs)]));
}
const T = (name, fields) => Object.assign(new DCL[`${name}T`](), fields);
/** The product's $DCL state series of one Dove's states: { payload, typeRef, portId }, its B seed set. */
export async function statesFrame(density, id, states, issueMs, seed) {
  const block = T('ephemerisDataBlock', { OBJECT: T('CAT', { OBJECT_ID: id }), CENTER_NAME: 'EARTH', TIME_SYSTEM: DCL.timingStandard.TT, REFERENCE_FRAME: T('RFM', { NAME: 'EME2000' }),
    EPHEMERIS_DATA_LINES: states.map((s) => T('ephemerisDataLine', { EPOCH: iso(s.ttMs), X: s.state[0] / 1000, Y: s.state[1] / 1000, Z: s.state[2] / 1000, X_DOT: s.state[3] / 1000, Y_DOT: s.state[4] / 1000, Z_DOT: s.state[5] / 1000 })) });
  const b = new flatbuffers.Builder(1 << 14);
  DCL.OEM.finishSizePrefixedOEMBuffer(b, T('OEM', { CCSDS_OEM_VERS: 3, CREATION_DATE: iso(issueMs), EPHEMERIS_DATA_BLOCK: [block] }).pack(b));
  const r = await density.invoke('prepare_operator_states', [{ portId: 'operator_states', typeRef: { schemaName: 'OEM.fbs', fileIdentifier: '$OEM', rootTypeName: 'OEM', wireFormat: 'flatbuffer' }, payload: b.asUint8Array().slice() }]);
  if (r.statusCode !== 0) throw new Error(`prepare_operator_states: ${r.errorMessage}`);
  const series = DCL.DCL.getRootAsDCL(new flatbuffers.ByteBuffer(new Uint8Array(r.outputs[0].payload))).unpack();
  if (seed) series.BALLISTIC_COEFFICIENT_M2_KG = seed;
  const c = new flatbuffers.Builder(1 << 14);
  DCL.DCL.finishDCLBuffer(c, series.pack(c));
  return { portId: 'request', typeRef: DCL_TYPE, payload: c.asUint8Array().slice(), lines: series.STATES.EPHEMERIS.EPHEMERIS_DATA_LINES };
}
/** One arc through fit_energy_arcs: { ok, startMs, endMs, y, B, sigma } or { ok: false, error }. */
export async function fitArc(density, F, id, a, b, publishedAt, rows, seed) {
  const request = await statesFrame(density, id, [a, b], publishedAt, seed), span = [a.ttMs - 2 * DAY, b.ttMs + 2 * DAY];
  const r = await density.invoke('fit_energy_arcs', [{ ...request, lines: undefined }, F.env.kernel, { portId: 'earth_orientation', typeRef: { schemaName: 'PRW.fbs', fileIdentifier: '$PRW', rootTypeName: 'PRW' }, payload: F.earthFrame(...span) }, { portId: 'space_weather', typeRef: { schemaName: 'PRW.fbs', fileIdentifier: '$PRW', rootTypeName: 'PRW' }, payload: F.weatherFrame(rows) }]);
  if (r.statusCode !== 0) return { ok: false, error: r.errorMessage };
  const o = DCL.DCL.getRootAsDCL(new flatbuffers.ByteBuffer(new Uint8Array(r.outputs[0].payload))).unpack().OBJECTS[0];
  if (!o?.OK) return { ok: false, error: o?.SKIPPED_REASON ?? 'no arc' };
  return { ok: true, startMs: Number(o.FIRST_MS), endMs: Number(o.LAST_MS), y: o.LN_B, B: o.BALLISTIC_COEFFICIENT_M2_KG, sigma: o.LN_B_SIGMA };
}
/** The NRLMSISE-00 drag work per unit B along GCRF states [{epoch, x[6] m, m/s}]. */
export async function dragWork(density, states, rows) {
  const lines = states.map((s) => T('ephemerisDataLine', { EPOCH: s.epoch, X: s.x[0] / 1000, Y: s.x[1] / 1000, Z: s.x[2] / 1000, X_DOT: s.x[3] / 1000, Y_DOT: s.x[4] / 1000, Z_DOT: s.x[5] / 1000 }));
  const value = T('DCL', { ATMOSPHERE: T('ATM', { MODEL: DCL.AtmosphericModelFamily.NRLMSIS00E, YEAR: 2000 }), BALLISTIC_COEFFICIENT_M2_KG: 1, SPACE_WEATHER: rows.map((r) => Object.assign(new DCL.SPWT(), { DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap })), STATES: T('dclStates', { EPHEMERIS: T('ephemerisDataBlock', { EPHEMERIS_DATA_LINES: lines }) }) });
  const b = new flatbuffers.Builder(1 << 16);
  DCL.DCL.finishDCLBuffer(b, value.pack(b));
  const r = await density.invoke('drag_work', [{ portId: 'request', typeRef: DCL_TYPE, payload: b.asUint8Array().slice() }]);
  if (r.statusCode !== 0) throw new Error(`drag_work: ${r.errorMessage}`);
  const o = DCL.DCL.getRootAsDCL(new flatbuffers.ByteBuffer(new Uint8Array(r.outputs[0].payload))).unpack();
  if (o.STATES.REFUSED.length) throw new Error(`drag_work refused ${o.STATES.REFUSED.length} states`);
  return o.STATES.CUMULATIVE_DRAG_WORK_J_KG.at(-1);
}
export const HOUR_MS = HOUR;
