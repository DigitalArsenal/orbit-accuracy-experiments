// propagator/hpop execution requests with every force the module carries
// (SDS 1.240.0 PRW), and the environment inputs those forces read: the JPL
// kernel, IERS Earth orientation, SET's JB2008 drivers and daily space
// weather for NRLMSISE-00. Encoding, decoding and the selection of published
// rows only; the propagation, frames, time scales and force models are the
// module's. SI units. Physical coefficients ride on unit area and mass, so
// DRAG_COEFFICIENT carries Cd*A/m and REFLECTIVITY_COEFFICIENT Cr*A/m
// (m^2/kg), as in E2 and E5.
import fs from 'node:fs';
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { sha256 } from './modules.mjs';
import { PRW_TYPE, instant } from './prw.mjs';

const DAY_MS = 86400000;
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

// request: {epoch (ISO UTC), state [m, m/s] GCRF, samples [ISO UTC],
//   forces {degree, order, thirdBodies [NAIF ids], srp, drag, atmosphere ('JB2008' | 'NRLMSISE00' | ...),
//     solidTides (bool, IERS 2010), relativity ('IERS_2010' | 'SCHWARZSCHILD' | undefined)},
//   coefficients {b: Cd*A/m, agom: Cr*A/m (m^2/kg, cannonball), boxWing {block ('GPS_IIR' |
//     'GPS_IIR_M' | 'GPS_IIF'), massKg} (the GNSS box-wing a priori in place of the cannonball),
//     ecom2 {D0, Y0, B0, D2_COS, ..., B3_SIN} (m/s^2, added to the a priori)},
//   parameters [{kind}] solved for (their values come from coefficients), stm (bool),
//   covariance [(6 + p)^2] (SI, GCRF, over the state and the parameters) | null,
//   integrator {tolerance, maxStep}}
// SDS 1.241.0: RADIATION_PRESSURE_MODEL, GNSS_BLOCK and ECOM2.
export const ECOM2_TERMS = ['D0', 'Y0', 'B0', 'D2_COS', 'D2_SIN', 'D4_COS', 'D4_SIN', 'B1_COS', 'B1_SIN', 'B3_COS', 'B3_SIN'];
export function executionFrame(request) {
  const f = request.forces, it = request.integrator, c = request.coefficients ?? {};
  const forces = table('PRWForceConfiguration', {
    GRAVITY_CHOICE: P.prwGravitySelection.EGM2008, ENABLE_POINT_MASS: true, GRAVITATIONAL_PARAMETER: 398600.4418e9,
    ENABLE_J2: false, ENABLE_J3: false, ENABLE_J4: false, ENABLE_HIGHER_ZONALS: false,
    MAXIMUM_DEGREE: f.degree, HAS_MAXIMUM_DEGREE: true, MAXIMUM_ORDER: f.order, HAS_MAXIMUM_ORDER: true,
    ENABLE_THIRD_BODY: (f.thirdBodies ?? []).length > 0, THIRD_BODY_IDS: f.thirdBodies ?? [],
    ENABLE_SRP: !!f.srp, ENABLE_DRAG: !!f.drag,
    INITIAL_MASS_KG: c.boxWing ? c.boxWing.massKg : 1, AREA_M2: 1,
    REFLECTIVITY_COEFFICIENT: f.srp && !c.boxWing ? c.agom : 0,
    RADIATION_PRESSURE_MODEL: c.boxWing ? P.prwRadiationPressureFamily.GNSS_BOX_WING : P.prwRadiationPressureFamily.CANNONBALL,
    GNSS_BLOCK: c.boxWing ? P.prwGnssSpacecraftBlock[c.boxWing.block] : P.prwGnssSpacecraftBlock.UNSPECIFIED,
    ECOM2: c.ecom2 ? table('PRWEcom2', Object.fromEntries(ECOM2_TERMS.map((t) => [`${t}_M_S2`, c.ecom2[t] ?? 0]))) : null,
    DRAG_COEFFICIENT: f.drag ? c.b : 0,
    ATMOSPHERE_MODEL: P.prwAtmosphereFamily[f.atmosphere ?? 'NRLMSISE00'],
    EPHEMERIS_SOURCE: 'JPL_SPK',
    SOLID_TIDES: f.solidTides ? P.prwSolidTideModel.IERS_2010 : P.prwSolidTideModel.NONE,
    RELATIVITY: f.relativity ? P.prwRelativityTerms[f.relativity] : P.prwRelativityTerms.NONE,
  });
  const execution = table('PRWExecutionRequest', {
    INITIAL: table('PRWResidentState', {
      STATE: table('FRMStateVector', {
        REPRESENTATION: P.frmStateRepresentation.CARTESIAN, POSITION: vector(request.state.slice(0, 3)), VELOCITY: vector(request.state.slice(3, 6)),
        COORDINATE_SYSTEM_NAME: 'GCRF', EPOCH: request.epoch, EPOCH_TIME_SYSTEM: 'UTC',
      }),
      COORDINATE_SYSTEM: gcrf(), HAS_MASS_KG: false, MASS_KG: 0,
    }),
    TARGET_EPOCH: instant(request.samples.at(-1), 'UTC'),
    INTEGRATOR: table('PRWIntegratorSettings', {
      ALGORITHM: P.prwSolverAlgorithm.RK78, INITIAL_STEP_SECONDS: 30, MINIMUM_STEP_SECONDS: 0.01, MAXIMUM_STEP_SECONDS: it.maxStep,
      ABSOLUTE_TOLERANCES: Array(6).fill(it.tolerance * 1000), RELATIVE_TOLERANCE: it.tolerance, MAXIMUM_STEPS: 2000000,
    }),
    FORCES: forces,
    INCLUDE_STM: !!request.stm, STM_TECHNIQUE: P.prwDerivativeTechnique.ANALYTIC,
    DENSITY_TREATMENT: f.drag ? P.prwDensityTreatment.FINITE_DIFFERENCE : P.prwDensityTreatment.NEGLECTED,
    DYNAMIC_PARAMETERS: (request.parameters ?? []).map((p) => P.prwDynamicParameter[p.kind]),
    INITIAL_COVARIANCE: request.covariance ? table('PRWStateMatrix', { DIMENSION: 6 + (request.parameters ?? []).length, VALUES: request.covariance }) : null,
    SAMPLE_EPOCHS: request.samples.map((s) => instant(s, 'UTC')),
  });
  return { portId: 'request', typeRef: PRW_TYPE, payload: encode('EXECUTION_REQUEST', execution) };
}

// The samples, in request order: {epoch, state [m, m/s], stm [n*n] | null,
// covariance [n*n] | null, n}.
export function decodeSamples(response) {
  const frame = response.outputs.find((o) => o.portId === 'response');
  const root = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(frame.payload))).unpack();
  if (!root.EXECUTION_RESULT) throw new Error('propagator/hpop: no execution result');
  return root.EXECUTION_RESULT.SAMPLES.map((s) => {
    const st = s.STATE.STATE;
    return {
      epoch: st.EPOCH,
      state: [st.POSITION.X, st.POSITION.Y, st.POSITION.Z, st.VELOCITY.X, st.VELOCITY.Y, st.VELOCITY.Z],
      n: s.STM?.DIMENSION ?? s.COVARIANCE?.DIMENSION ?? 6,
      stm: s.STM ? s.STM.VALUES : null,
      covariance: s.COVARIANCE ? s.COVARIANCE.VALUES : null,
      steps: Number(s.ACCEPTED_STEPS ?? 0),
    };
  });
}

export const jb2008Frame = (rows) => ({ portId: 'jb2008_indices', typeRef: PRW_TYPE,
  payload: encode('JB2008_INDICES', table('PRWJB2008IndicesTable', { ROWS: rows.map((r) => table('PRWJB2008Indices', r)) })) });
export const spaceWeatherFrame = (rows) => ({ portId: 'space_weather', typeRef: PRW_TYPE,
  payload: encode('SPACE_WEATHER', table('PRWSpaceWeatherTable', { ROWS: rows.map((r) => table('SPW', r)) })) });

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (iso) => Date.parse(`${iso}T00:00:00Z`);

// SET's SOLFSMY.TXT and DTCFILE.TXT as published: {sol: date -> indices,
// dtc: date -> 24 hourly DTC (K), sha256}.
export function readSetIndices(solfsmy, dtcfile) {
  const solBytes = fs.readFileSync(solfsmy), dtcBytes = fs.readFileSync(dtcfile);
  const iso = (y, doy) => new Date(Date.UTC(y, 0, doy)).toISOString().slice(0, 10);
  const sol = new Map(), dtc = new Map();
  for (const line of solBytes.toString('latin1').split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t.length < 12 || !/^\d{4}$/.test(t[0])) continue;
    sol.set(iso(+t[0], +t[1]), { F10: +t[3], F10_CENTRED_81: +t[4], S10: +t[5], S10_CENTRED_81: +t[6], M10: +t[7], M10_CENTRED_81: +t[8], Y10: +t[9], Y10_CENTRED_81: +t[10] });
  }
  for (const line of dtcBytes.toString('latin1').split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t[0] !== 'DTC' || t.length < 27) continue;
    dtc.set(iso(+t[1], +t[2]), t.slice(3, 27).map(Number));
  }
  return { sol, dtc, sha256: { solfsmy: sha256(solBytes), dtcfile: sha256(dtcBytes) } };
}

// JB2008 rows for the days [fromMs, toMs] as SET published them.
export function jb2008Rows(set, fromMs, toMs) {
  const rows = [];
  for (let t = dayMs(isoDay(fromMs)); t <= toMs; t += DAY_MS) {
    const date = isoDay(t);
    if (!set.sol.has(date) || !set.dtc.has(date)) throw new Error(`no SOLFSMY or DTCFILE row for ${date}`);
    rows.push({ DATE: date, ...set.sol.get(date), DTC_HOURLY_K: [...set.dtc.get(date)] });
  }
  return rows;
}

// GFZ Potsdam's Kp_ap_Ap_SN_F107_since_1932.txt as published: date ->
// {kp [8], ap [8], Ap, f107obs, f107adj}.
export function readGfzKp(file) {
  const bytes = fs.readFileSync(file);
  const days = new Map();
  for (const line of bytes.toString('latin1').split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const t = line.trim().split(/\s+/);
    days.set(`${t[0]}-${t[1].padStart(2, '0')}-${t[2].padStart(2, '0')}`,
      { kp: t.slice(7, 15).map(Number), ap: t.slice(15, 23).map(Number), Ap: +t[23], f107obs: +t[25], f107adj: +t[26] });
  }
  return { days, sha256: sha256(bytes) };
}

// $SPW rows (CSSI layout) for the days [from, to] (ms) from GFZ's file, as
// E5 frames them: Kp x10, ap, daily Ap, observed F10.7 and its 81-day centred
// mean over the reported days (at least 75 of 81); a day without F10.7 takes
// the mean of the nearest reported days before and after it.
export function spwRows(gfz, fromMs, toMs) {
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
