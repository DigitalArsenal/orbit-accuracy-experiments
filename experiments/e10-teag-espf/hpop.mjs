// propagator/hpop execution requests with every force the module carries
// (SDS 1.240.0 PRW): EGM2008 to the configured degree in Earth-fixed axes with
// IERS EOP, Sun, Moon and planets from a JPL DE440 excerpt, cannonball
// radiation pressure with conical shadow, drag (JB2008 with SET's drivers, or
// NRLMSISE-00 with GFZ's), IERS 2010 solid tides and relativity. Adapted from
// E7's harness/full-force.mjs (task/e7-full-force-20261009, e59ac6b, not yet
// on main) and E5's hpop.mjs. Encoding, decoding and the selection of
// published driver rows only; SI units, UTC epochs. Physical coefficients ride
// on unit area and mass: DRAG_COEFFICIENT carries Cd*A/m and
// REFLECTIVITY_COEFFICIENT Cr*A/m (m^2/kg), as in E2, E5 and E7.
import fs from 'node:fs';
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { sha256 } from '../../harness/modules.mjs';
import { PRW_TYPE, instant, kernelFrame } from '../../harness/prw.mjs';
import { c04Records, eopFrame } from '../../harness/eop.mjs';
import { DAY_MS, iso } from './common.mjs';

const table = (name, fields = {}) => Object.assign(new P[`${name}T`](), fields);
const vector = (v) => table('FRMVector3', { X: v[0], Y: v[1], Z: v[2] });
const gcrf = () => table('RFMCoordinateSystem', {
  NAME: 'GCRF', AXIS_TYPE: P.rfmAxisType.ICRF, AXIS_REFERENCE_BODY_ID: 399,
  ORIGIN: table('RFMOrigin', { KIND: P.rfmOriginKind.CELESTIAL_BODY, CELESTIAL_BODY_ID: 399 }),
});
function encode(arm, value, size = 1 << 16) {
  const b = new flatbuffers.Builder(size);
  P.PRW.finishSizePrefixedPRWBuffer(b, table('PRW', { [arm]: value }).pack(b));
  return b.asUint8Array().slice();
}
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);

// SET's SOLFSMY.TXT and DTCFILE.TXT as published.
export function readSetIndices(solfsmy, dtcfile) {
  const solBytes = fs.readFileSync(solfsmy), dtcBytes = fs.readFileSync(dtcfile);
  const doy = (y, d) => new Date(Date.UTC(y, 0, d)).toISOString().slice(0, 10);
  const sol = new Map(), dtc = new Map();
  for (const line of solBytes.toString('latin1').split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t.length < 12 || !/^\d{4}$/.test(t[0])) continue;
    sol.set(doy(+t[0], +t[1]), { F10: +t[3], F10_CENTRED_81: +t[4], S10: +t[5], S10_CENTRED_81: +t[6], M10: +t[7], M10_CENTRED_81: +t[8], Y10: +t[9], Y10_CENTRED_81: +t[10] });
  }
  for (const line of dtcBytes.toString('latin1').split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t[0] !== 'DTC' || t.length < 27) continue;
    dtc.set(doy(+t[1], +t[2]), t.slice(3, 27).map(Number));
  }
  return { sol, dtc, sha256: { solfsmy: sha256(solBytes), dtcfile: sha256(dtcBytes) } };
}
function jb2008Rows(set, fromMs, toMs) {
  const rows = [];
  for (let t = dayMs(isoDay(fromMs)); t <= toMs; t += DAY_MS) {
    const date = isoDay(t);
    if (!set.sol.has(date) || !set.dtc.has(date)) throw new Error(`no SOLFSMY or DTCFILE row for ${date}`);
    rows.push({ DATE: date, ...set.sol.get(date), DTC_HOURLY_K: [...set.dtc.get(date)] });
  }
  return rows;
}
// GFZ Potsdam's Kp_ap_Ap_SN_F107_since_1932.txt as published.
export function readGfzKp(file) {
  const bytes = fs.readFileSync(file);
  const days = new Map();
  for (const line of bytes.toString('latin1').split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const t = line.trim().split(/\s+/);
    days.set(`${t[0]}-${t[1].padStart(2, '0')}-${t[2].padStart(2, '0')}`, { kp: t.slice(7, 15).map(Number), ap: t.slice(15, 23).map(Number), Ap: +t[23], f107obs: +t[25], f107adj: +t[26] });
  }
  return { days, sha256: sha256(bytes) };
}
// $SPW rows as CSSI lays them out (E5's and E7's rule): Kp x10, ap, daily Ap,
// observed F10.7 and its 81-day centred mean over the reported days.
function spwRows(gfz, fromMs, toMs) {
  const { days } = gfz;
  const filled = (t) => {
    const d = days.get(isoDay(t));
    if (d && d.f107obs > 0) return d;
    const near = (step) => { for (let k = 1; k <= 10; ++k) { const e = days.get(isoDay(t + step * k * DAY_MS)); if (e && e.f107obs > 0) return e; } return null; };
    const a = near(-1), b = near(1);
    if (!a || !b) throw new Error(`no F10.7 near ${isoDay(t)}`);
    return { f107obs: (a.f107obs + b.f107obs) / 2, f107adj: (a.f107adj + b.f107adj) / 2 };
  };
  const rows = [];
  for (let t = dayMs(isoDay(fromMs)); t <= toMs; t += DAY_MS) {
    const date = isoDay(t), d = days.get(date);
    if (!d) throw new Error(`no GFZ row for ${date}`);
    const window = [];
    for (let k = -40; k <= 40; ++k) { const e = days.get(isoDay(t + k * DAY_MS)); if (e && e.f107obs > 0) window.push(e.f107obs); }
    if (window.length < 75) throw new Error(`81-day F10.7 window has ${window.length} days around ${date}`);
    const kp10 = d.kp.map((k) => Math.round(k * 10)), f = filled(t);
    rows.push({
      DATE: date, KP1: kp10[0], KP2: kp10[1], KP3: kp10[2], KP4: kp10[3], KP5: kp10[4], KP6: kp10[5], KP7: kp10[6], KP8: kp10[7],
      KP_SUM: kp10.reduce((a, b) => a + b, 0), AP1: d.ap[0], AP2: d.ap[1], AP3: d.ap[2], AP4: d.ap[3], AP5: d.ap[4], AP6: d.ap[5], AP7: d.ap[6], AP8: d.ap[7],
      AP_AVG: d.Ap, F107_OBS: f.f107obs, F107_ADJ: f.f107adj, F107_DATA_TYPE: 0,
      F107_OBS_CENTER81: window.reduce((a, b) => a + b, 0) / window.length,
    });
  }
  return rows;
}

// The environment of an arc [fromMs, toMs]: kernel, EOP, JB2008 and daily
// space-weather frames, built once and reused by every execution request.
export async function environment({ parser, kernelPath, eopPath, setPaths, kpPath, fromMs, toMs }) {
  const kernelBytes = fs.readFileSync(kernelPath);
  const eop = await c04Records(parser, eopPath);
  const mjd = (ms) => Math.floor(ms / DAY_MS) + 40587;
  const set = readSetIndices(setPaths.solfsmy, setPaths.dtcfile);
  const gfz = readGfzKp(kpPath);
  const pad = 10 * DAY_MS;  // drivers' lags and the 81-day window are read inside the module
  const encodeRows = (arm, name, rows) => encode(arm, table(name, { ROWS: rows }), 1 << 20);
  // Drag drivers past the published rows (SET's files end before Part C's
  // last GPS arcs) leave that frame absent; propagate() refuses a drag model
  // without its frame, and a model without drag never needs it.
  const optional = (build) => { try { return build(); } catch (error) { return { missing: String(error.message ?? error) }; } };
  return {
    kernel: kernelFrame(kernelBytes),
    eop: (() => { const f = eopFrame(eop.records, mjd(fromMs) - 2, mjd(toMs) + 2); return { portId: f.portId, typeRef: f.typeRef, payload: f.payload }; })(),
    eopRecords: eop.records,
    jb2008: optional(() => ({ portId: 'jb2008_indices', typeRef: PRW_TYPE, payload: encodeRows('JB2008_INDICES', 'PRWJB2008IndicesTable', jb2008Rows(set, fromMs - pad, toMs + DAY_MS).map((r) => table('PRWJB2008Indices', r))) })),
    spaceWeather: optional(() => ({ portId: 'space_weather', typeRef: PRW_TYPE, payload: encodeRows('SPACE_WEATHER', 'PRWSpaceWeatherTable', spwRows(gfz, fromMs - pad, toMs + DAY_MS).map((r) => table('SPW', r))) })),
    sha256: { kernel: sha256(kernelBytes), eop: eop.sha256, ...set.sha256, kp: gfz.sha256 },
  };
}

// forces: {degree, order, thirdBodies, srp, drag, atmosphere ('JB2008' | 'NRLMSISE00'),
//   solidTides, relativity ('IERS_2010'), b (Cd*A/m), agom (Cr*A/m)}; integrator {tolerance, maxStep}.
function execution({ epochIso, state, sampleIsos, forces: f, integrator: it, stm }) {
  const forces = table('PRWForceConfiguration', {
    GRAVITY_CHOICE: P.prwGravitySelection.EGM2008, ENABLE_POINT_MASS: true, GRAVITATIONAL_PARAMETER: 398600.4415e9,
    ENABLE_J2: false, ENABLE_J3: false, ENABLE_J4: false, ENABLE_HIGHER_ZONALS: false,
    MAXIMUM_DEGREE: f.degree, HAS_MAXIMUM_DEGREE: true, MAXIMUM_ORDER: f.order, HAS_MAXIMUM_ORDER: true,
    ENABLE_THIRD_BODY: (f.thirdBodies ?? []).length > 0, THIRD_BODY_IDS: f.thirdBodies ?? [],
    ENABLE_SRP: !!f.srp, ENABLE_DRAG: !!f.drag, INITIAL_MASS_KG: 1, AREA_M2: 1,
    REFLECTIVITY_COEFFICIENT: f.srp ? f.agom : 0, DRAG_COEFFICIENT: f.drag ? f.b : 0,
    ATMOSPHERE_MODEL: P.prwAtmosphereFamily[f.atmosphere ?? 'NRLMSISE00'], EPHEMERIS_SOURCE: 'JPL_SPK',
    SOLID_TIDES: f.solidTides ? P.prwSolidTideModel.IERS_2010 : P.prwSolidTideModel.NONE,
    RELATIVITY: f.relativity ? P.prwRelativityTerms[f.relativity] : P.prwRelativityTerms.NONE,
  });
  const exec = table('PRWExecutionRequest', {
    INITIAL: table('PRWResidentState', {
      STATE: table('FRMStateVector', {
        REPRESENTATION: P.frmStateRepresentation.CARTESIAN, POSITION: vector(state.slice(0, 3)), VELOCITY: vector(state.slice(3, 6)),
        COORDINATE_SYSTEM_NAME: 'GCRF', EPOCH: epochIso, EPOCH_TIME_SYSTEM: 'UTC',
      }),
      COORDINATE_SYSTEM: gcrf(), HAS_MASS_KG: false, MASS_KG: 0,
    }),
    TARGET_EPOCH: instant(sampleIsos.at(-1), 'UTC'),
    INTEGRATOR: table('PRWIntegratorSettings', {
      ALGORITHM: P.prwSolverAlgorithm.RK78, INITIAL_STEP_SECONDS: 30, MINIMUM_STEP_SECONDS: 0.01, MAXIMUM_STEP_SECONDS: it.maxStep,
      ABSOLUTE_TOLERANCES: Array(6).fill(it.tolerance * 1000), RELATIVE_TOLERANCE: it.tolerance, MAXIMUM_STEPS: 2000000,
    }),
    FORCES: forces,
    INCLUDE_STM: !!stm, STM_TECHNIQUE: P.prwDerivativeTechnique.ANALYTIC,
    DENSITY_TREATMENT: f.drag ? P.prwDensityTreatment.FINITE_DIFFERENCE : P.prwDensityTreatment.NEGLECTED,
    SAMPLE_EPOCHS: sampleIsos.map((s) => instant(s, 'UTC')),
  });
  return { portId: 'request', typeRef: PRW_TYPE, payload: encode('EXECUTION_REQUEST', exec) };
}

// One propagation of one state: samples [{state [m, m/s], stm [36] | null}] in
// sample order. The environment frames go with every request. HPOP takes at
// most 10,000 samples a request: longer lists go in chunks, each integrated
// from the same epoch and state (one trajectory, sampled in parts).
export const MAX_SAMPLES = 10000;
export async function propagate(hpop, env, model, { epochIso, state, sampleIsos, stm = false }) {
  if (sampleIsos.length > MAX_SAMPLES) {
    const out = [];
    for (let i = 0; i < sampleIsos.length; i += MAX_SAMPLES) out.push(...await propagate(hpop, env, model, { epochIso, state, sampleIsos: sampleIsos.slice(i, i + MAX_SAMPLES), stm }));
    return out;
  }
  const inputs = [execution({ epochIso, state, sampleIsos, forces: model.forces, integrator: model.integrator, stm }), env.kernel, env.eop];
  if (model.forces.drag) {
    const drivers = model.forces.atmosphere === 'JB2008' ? env.jb2008 : env.spaceWeather;
    if (drivers.missing) throw new Error(`drag drivers unavailable: ${drivers.missing}`);
    inputs.push(drivers);
  }
  const response = await hpop.invoke('invoke', inputs);
  const frame = response.outputs.find((o) => o.portId === 'response');
  const root = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(frame.payload))).unpack();
  if (!root.EXECUTION_RESULT) throw new Error('propagator/hpop: no execution result');
  return root.EXECUTION_RESULT.SAMPLES.map((s) => {
    const st = s.STATE.STATE;
    const n = s.STM?.DIMENSION ?? 6;
    const m = s.STM ? s.STM.VALUES : null;
    return {
      state: [st.POSITION.X, st.POSITION.Y, st.POSITION.Z, st.VELOCITY.X, st.VELOCITY.Y, st.VELOCITY.Z],
      stm: m ? Array.from({ length: 36 }, (_, k) => m[Math.floor(k / 6) * n + (k % 6)]) : null,
    };
  });
}
export { iso };
