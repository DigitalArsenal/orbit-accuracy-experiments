// FFM-1 truth for the maneuver and reentry measurements (amendment A10; DESIGN section 5.5, M22, M23, M28): impulses and finite burns planted in the
// published FFM-1 propagator (the typed request's IMPULSES and FINITE_BURNS, as analysis/od/scripts/operator-environment.mjs plants its test
// maneuver), synthetic daily space weather for the decays, and the end of a trajectory at 100 km (FFM-1's own stop). The module integrates; this file builds
// typed requests and reads typed answers. Burn directions are named in FFM-1's RTN axes: R radial, T = N x R in-track, N along r x v (the $MNV U, V, W).
import fs from 'node:fs';
import path from 'node:path';
import * as fb from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';
import { sha256 } from '../common.mjs';
import { iso } from './windows.mjs';

const table = (name, fields = {}) => Object.assign(new P[`${name}T`](), fields);
const vec3 = (v) => table('FRMVector3', { X: v[0], Y: v[1], Z: v[2] });
const decodePrw = (bytes) => P.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(bytes))).unpack();

/** The saved environment's two daily tables, decoded once: the template rows of the synthetic ones. */
export function templates(context) {
  const get = (port) => decodePrw(context.inputs.find((i) => i.portId === port).payload);
  const eop = get('earth_orientation').EARTH_ORIENTATION, spw = get('space_weather').SPACE_WEATHER;
  return { eopRow: eop.ROWS.at(-1), spwRow: spw.ROWS.at(-1) };
}

/** Constant daily space weather for `days` days from `startDate` (YYYY-MM-DD): F10.7 = its 81-day averages = f107, Ap = ap, Kp from Ap (the usual table), as one `space_weather` port. */
export function syntheticWeather(context, { f107, ap, kp, startDate, days }) {
  const { spwRow } = templates(context);
  const rows = Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.parse(`${startDate}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
    const row = Object.assign(new spwRow.constructor(), spwRow, { DATE: date, AP_AVG: ap, F107_OBS: f107, F107_OBS_CENTER81: f107, F107_OBS_LAST81: f107, KP_SUM: Math.round(kp * 10) * 8 });
    for (let k = 1; k <= 8; k += 1) { row[`KP${k}`] = Math.round(kp * 10); row[`AP${k}`] = -1; }
    return row;
  });
  const b = new fb.Builder(1 << 16);
  b.finishSizePrefixed(Object.assign(new P.PRWT(), { SPACE_WEATHER: table('PRWSpaceWeatherTable', { ROWS: rows }) }).pack(b), '$PRW');
  return { portId: 'space_weather', typeRef: { schemaName: 'PRW.fbs', fileIdentifier: '$PRW', rootTypeName: 'PRW', wireFormat: 'flatbuffer' }, payload: b.asUint8Array().slice() };
}

/** One Earth-orientation row used as is over the whole arc (the port's documented single-row form): a decay of a few hundred days needs no table. */
export function singleRowEop(context) {
  const { eopRow } = templates(context);
  const b = new fb.Builder(1024);
  b.finishSizePrefixed(Object.assign(new P.PRWT(), { EARTH_ORIENTATION: table('PRWEarthOrientation', { ROWS: [eopRow] }) }).pack(b), '$PRW');
  return { portId: 'earth_orientation', typeRef: { schemaName: 'PRW.fbs', fileIdentifier: '$PRW', rootTypeName: 'PRW', wireFormat: 'flatbuffer' }, payload: b.asUint8Array().slice() };
}

/** A context whose inputs replace the named ports (the kernel and the rest stay). */
export const withInputs = (context, ...frames) => ({ ...context, inputs: [...context.inputs.filter((i) => !frames.some((f) => f.portId === i.portId)), ...frames] });

const BASIS = { INERTIAL: P.prwSteeringBasis.INTEGRATION_FRAME, RTN: P.prwSteeringBasis.RTN_AXES };

/**
 * FFM-1 from a GCRF state [m, m/s] at `epoch` (ISO UTC) to the sample epochs (ms), with impulses [{ ms, dv: [m/s x3], basis: 'RTN' | 'INERTIAL' }] and finite burns
 * [{ startS, stopS, accel: [m/s2 x3 in the basis], basis }] (seconds after `epoch`; constant acceleration, Isp so large that the mass is constant).
 * Returns { ok: true, samples: [{ ms, state }] } or, when the trajectory descends below 100 km (FFM-1's end), { ok: false, reentry: { epochUtc, heightKm }, error }.
 */
export async function propagateEvents(modules, context, { epoch, state, cdAm, crAm, epochs, integrator, forces = {}, impulses = [], finiteBurns = [] }) {
  const c = context.catalog;
  const request = c.fullForceRequest({ epoch, state, target: iso(epochs.at(-1)), cdAm, crAm, integrator: { ...c.CATALOG_INTEGRATOR, ...integrator }, forces });
  request.SAMPLE_EPOCHS = epochs.map((t) => c.instant(iso(t)));
  if (impulses.length) request.IMPULSES = impulses.map((m) => table('PRWImpulse', { EPOCH: c.instant(iso(m.ms)), DELTA_V: vec3(m.dv), VECTOR_BASIS: BASIS[m.basis ?? 'RTN'] }));
  if (finiteBurns.length) {
    request.INCLUDE_MASS_DYNAMICS = true;
    request.INTEGRATOR.ABSOLUTE_TOLERANCES = [...request.INTEGRATOR.ABSOLUTE_TOLERANCES, request.INTEGRATOR.RELATIVE_TOLERANCE];
    request.FINITE_BURNS = finiteBurns.map((b) => table('PRWFiniteBurn', {
      START: table('PRWBurnBoundary', { ELAPSED_SECONDS: b.startS, HAS_ELAPSED_SECONDS: true }), STOP: table('PRWBurnBoundary', { ELAPSED_SECONDS: b.stopS, HAS_ELAPSED_SECONDS: true }),
      THRUST_LAW: P.prwThrustPrescription.ACCELERATION, ACCELERATION_M_S2: Math.hypot(...b.accel), HAS_ACCELERATION_M_S2: true, SPECIFIC_IMPULSE_SECONDS: b.isp ?? 1e12,
      VECTOR_BASIS: BASIS[b.basis ?? 'RTN'], DIRECTION: vec3(b.accel.map((x) => x / Math.hypot(...b.accel))), THROTTLE: [],
    }));
  }
  const dir = path.join(modules, 'propagator/ffm');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json')));
  const harness = await createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(dir, 'dist/isomorphic/module.wasm')), manifest, surface: 'direct' });
  try {
    const response = await harness.invoke({ methodId: 'invoke', inputs: [{ portId: 'request', typeRef: c.TYPE, payload: c.encode('EXECUTION_REQUEST', request) }, ...context.inputs] });
    if (response.statusCode !== 0) {
      const m = /descends below 100 km geodetic altitude \(([\d.]+) km\) at (\d{4}-\d\d-\d\dT[\d:.]+) UTC/.exec(String(response.errorMessage));
      return { ok: false, error: `${response.errorCode}: ${String(response.errorMessage).slice(0, 300)}`, reentry: m ? { epochUtc: `${m[2]}Z`, heightKm: Number(m[1]) } : null };
    }
    const result = c.prw.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(response.outputs.find((f) => f.portId === 'response').payload))).unpack().EXECUTION_RESULT;
    if (!result?.SAMPLES || result.SAMPLES.length !== epochs.length) return { ok: false, error: 'FFM did not return all epochs', reentry: null };
    return {
      ok: true, wasmSha256: sha256(fs.readFileSync(path.join(dir, 'dist/isomorphic/module.wasm'))),
      samples: result.SAMPLES.map((s, i) => { const v = s.STATE.STATE; return { ms: epochs[i], state: ['POSITION', 'VELOCITY'].flatMap((k) => ['X', 'Y', 'Z'].map((a) => v[k][a])), valid: s.STATE.VALID !== false }; }),
    };
  } finally { await harness.destroy(); }
}

/**
 * NRLMSISE-00 (anomalous oxygen included) by FFM-1's ATMOSPHERE_REQUEST at the given points, one harness for all:
 * points [{ epochMs, altKm, latDeg, lonDeg, lstHours, f107, f107Avg, ap }] -> [{ densityKgM3, scaleHeightM }].
 */
export async function atmosphere(modules, context, points) {
  const c = context.catalog;
  const dir = path.join(modules, 'propagator/ffm');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json')));
  const harness = await createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(dir, 'dist/isomorphic/module.wasm')), manifest, surface: 'direct' });
  try {
    const out = [];
    for (const p of points) {
      const request = table('PRWAtmosphereRequest', {
        EPOCH: c.instant(iso(p.epochMs)), ATMOSPHERE_MODEL: P.prwAtmosphereFamily.NRLMSISE00, ALTITUDE_M: p.altKm * 1000, LATITUDE_RAD: ((p.latDeg ?? 0) * Math.PI) / 180, LONGITUDE_RAD: ((p.lonDeg ?? 0) * Math.PI) / 180,
        LOCAL_SOLAR_TIME_HOURS: p.lstHours ?? 14, HAS_LOCAL_SOLAR_TIME_HOURS: true, F107: p.f107, F107_AVERAGE: p.f107Avg ?? p.f107, AP_INDEX: p.ap, INCLUDE_ANOMALOUS_OXYGEN: true,
      });
      const response = await harness.invoke({ methodId: 'invoke', inputs: [{ portId: 'request', typeRef: c.TYPE, payload: c.encode('ATMOSPHERE_REQUEST', request) }] });
      if (response.statusCode !== 0) throw new Error(`FFM-1 atmosphere: ${response.errorCode}: ${String(response.errorMessage).slice(0, 200)}`);
      const r = decodePrw(response.outputs.find((f) => f.portId === 'response').payload).ATMOSPHERE_RESULT;
      out.push({ densityKgM3: r.DENSITY_KG_M3, scaleHeightM: r.HAS_SCALE_HEIGHT_M ? r.SCALE_HEIGHT_M : null });
    }
    return out;
  } finally { await harness.destroy(); }
}
