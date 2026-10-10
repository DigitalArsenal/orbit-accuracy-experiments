// propagator/hpop execution requests with the full force model (SDS 1.240.0
// PRW): EGM2008 to the stated degree and order in Earth-fixed axes (IERS EOP
// on the earth_orientation input), Sun and Moon from a JPL DE440 kernel,
// cannonball radiation pressure with the conical shadow, drag (JB2008 on SET
// drivers, or NRLMSISE-00 on daily space weather), IERS 2010 solid tides and
// relativity; dynamic parameters with their STM columns; an initial
// covariance over state and parameters and white-acceleration process noise.
// Encoding and decoding only; SI units. The parameters ride on unit area and
// mass: Cd = B (m^2/kg), Cr = AGOM (m^2/kg).
import fs from 'node:fs';
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { PRW_TYPE, instant, kernelFrame } from './prw.mjs';
import { sha256 } from './modules.mjs';

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
//   forces {degree, order, thirdBodies [NAIF], srp, drag, atmosphere ('JB2008' | 'NRLMSISE00'), solidTides, relativity ('IERS_2010' | ...)},
//   parameters [{kind, value}], fixed {b, agom}, stm (bool), covariance [(6+p)^2] | null,
//   noise {q [3] m^2/s^3 RTN, intervalSeconds} | null, integrator {tolerance, maxStep}}
export function executionFrame(request) {
  const f = request.forces, it = request.integrator;
  const value = (kind, fallback) => request.parameters.find((p) => p.kind === kind)?.value ?? fallback;
  const n = 6 + request.parameters.length;
  const forces = table('PRWForceConfiguration', {
    GRAVITY_CHOICE: P.prwGravitySelection.SPHERICAL_HARMONICS, ENABLE_POINT_MASS: true, GRAVITATIONAL_PARAMETER: 398600.4418e9,
    ENABLE_J2: false, ENABLE_J3: false, ENABLE_J4: false, ENABLE_HIGHER_ZONALS: false,
    MAXIMUM_DEGREE: f.degree, HAS_MAXIMUM_DEGREE: true, MAXIMUM_ORDER: f.order, HAS_MAXIMUM_ORDER: true,
    ENABLE_THIRD_BODY: (f.thirdBodies ?? []).length > 0, THIRD_BODY_IDS: f.thirdBodies ?? [],
    ENABLE_SRP: !!f.srp, ENABLE_DRAG: !!f.drag,
    INITIAL_MASS_KG: 1, AREA_M2: 1,
    REFLECTIVITY_COEFFICIENT: value('SRP_AREA_OVER_MASS', request.fixed?.agom ?? 0),
    DRAG_COEFFICIENT: value('DRAG_AREA_OVER_MASS', request.fixed?.b ?? 0),
    ATMOSPHERE_MODEL: P.prwAtmosphereFamily[f.atmosphere ?? 'NRLMSISE00'],
    EPHEMERIS_SOURCE: 'JPL_SPK',
    SOLID_TIDES: f.solidTides ? P.prwSolidTideModel.IERS_2010 : P.prwSolidTideModel.NONE,
    RELATIVITY: P.prwRelativityTerms[f.relativity ?? 'NONE'],
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
      ALGORITHM: P.prwSolverAlgorithm.RK78, INITIAL_STEP_SECONDS: 60, MINIMUM_STEP_SECONDS: it.minStep ?? 0.01, MAXIMUM_STEP_SECONDS: it.maxStep,
      ABSOLUTE_TOLERANCES: Array(6).fill(it.tolerance * 1000), RELATIVE_TOLERANCE: it.tolerance, MAXIMUM_STEPS: 1000000,
    }),
    FORCES: forces,
    INCLUDE_STM: !!request.stm, STM_TECHNIQUE: P.prwDerivativeTechnique.ANALYTIC,
    DENSITY_TREATMENT: f.drag ? P.prwDensityTreatment.FINITE_DIFFERENCE : P.prwDensityTreatment.NEGLECTED,
    DYNAMIC_PARAMETERS: request.parameters.map((p) => P.prwDynamicParameter[p.kind]),
    INITIAL_COVARIANCE: request.covariance ? table('PRWStateMatrix', { DIMENSION: n, VALUES: request.covariance }) : null,
    PROCESS_NOISE: request.noise ? table('PRWProcessNoise', {
      MODEL: P.prwProcessNoiseModel.WHITE_ACCELERATION, AXES: P.prwProcessNoiseAxes.RADIAL_TRANSVERSE_NORMAL,
      SPECTRAL_DENSITY_M2_S3: request.noise.q, DISCRETIZATION_SECONDS: request.noise.intervalSeconds,
    }) : null,
    SAMPLE_EPOCHS: request.samples.map((s) => instant(s, 'UTC')),
  });
  return { portId: 'request', typeRef: PRW_TYPE, payload: encode('EXECUTION_REQUEST', execution) };
}

// The samples, in request order: {epoch, state [m, m/s], stm [n*n] | null, covariance [n*n] | null, n}.
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
    };
  });
}

// SET's JB2008 drivers (SOLFSMY.TXT, DTCFILE.TXT) as PRW JB2008_INDICES rows
// for every day from..to (ISO dates, inclusive). Reading and re-framing only.
export function jb2008Drivers(solfsmyPath, dtcfilePath) {
  const solText = fs.readFileSync(solfsmyPath, 'latin1'), dtcText = fs.readFileSync(dtcfilePath, 'latin1');
  const iso = (y, doy) => new Date(Date.UTC(y, 0, doy)).toISOString().slice(0, 10);
  const sol = new Map(), dtc = new Map();
  for (const line of solText.split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t.length < 12 || line.trim().startsWith('#') || !/^\d{4}$/.test(t[0])) continue;
    sol.set(iso(+t[0], +t[1]), { F10: +t[3], F10_CENTRED_81: +t[4], S10: +t[5], S10_CENTRED_81: +t[6], M10: +t[7], M10_CENTRED_81: +t[8], Y10: +t[9], Y10_CENTRED_81: +t[10], SOURCE_FLAGS: t[11] });
  }
  for (const line of dtcText.split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t[0] !== 'DTC' || t.length < 27) continue;
    dtc.set(iso(+t[1], +t[2]), t.slice(3, 27).map(Number));
  }
  return {
    sha256: { solfsmy: sha256(Buffer.from(solText, 'latin1')), dtcfile: sha256(Buffer.from(dtcText, 'latin1')) },
    frame(from, to) {
      const rows = [];
      for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) {
        const date = new Date(t).toISOString().slice(0, 10);
        if (!sol.has(date) || !dtc.has(date)) throw new Error(`no SOLFSMY or DTCFILE row for ${date}`);
        rows.push(table('PRWJB2008Indices', { DATE: date, ...sol.get(date), DTC_HOURLY_K: dtc.get(date) }));
      }
      return { portId: 'jb2008_indices', typeRef: PRW_TYPE, payload: encode('JB2008_INDICES', table('PRWJB2008IndicesTable', { ROWS: rows })) };
    },
  };
}

// GFZ's Kp/ap/Ap/F10.7 file (Kp_ap_Ap_SN_F107_since_1932.txt) as daily
// $SPW rows for NRLMSISE-00, laid out as CSSI lays them out: Kp x10, ap,
// daily Ap, observed and adjusted F10.7, and the 81-day centred mean of the
// observed values over the days the file reports (at least minimumDays of
// the 81; a recent day has only its past half). A day the file does not yet
// report repeats the last reported day (persistence, as a forecast would).
// A day without F10.7 (-1) takes the mean of the nearest reported days.
// Reading and re-framing only.
export function gfzSpaceWeather(path, { minimumDays = 40 } = {}) {
  const text = fs.readFileSync(path, 'latin1');
  const days = new Map();
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const t = line.trim().split(/\s+/);
    days.set(`${t[0]}-${t[1].padStart(2, '0')}-${t[2].padStart(2, '0')}`, { kp: t.slice(7, 15).map(Number), ap: t.slice(15, 23).map(Number), Ap: +t[23], f107obs: +t[25], f107adj: +t[26] });
  }
  const last = [...days.keys()].sort().at(-1);
  const DAY = 86400000, isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
  const get = (date) => days.get(date <= last ? date : last);
  const f107 = (t) => {
    const d = get(isoDay(t));
    if (d && d.f107obs > 0) return { obs: d.f107obs, adj: d.f107adj };
    const near = (step) => { for (let k = 1; k <= 10; ++k) { const e = get(isoDay(t + step * k * DAY)); if (e && e.f107obs > 0) return e; } return null; };
    const a = near(-1), b = near(1);
    if (!a || !b) throw new Error(`no F10.7 near ${isoDay(t)}`);
    return { obs: (a.f107obs + b.f107obs) / 2, adj: (a.f107adj + b.f107adj) / 2 };
  };
  return {
    sha256: sha256(Buffer.from(text, 'latin1')),
    lastReported: last,
    frame(from, to) {
      const rows = [];
      for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) {
        const date = isoDay(t), d = get(date);
        if (!d) throw new Error(`no GFZ row for ${date}`);
        const window = [];
        for (let k = -40; k <= 40; ++k) { const day = isoDay(t + k * DAY); const e = day <= last ? days.get(day) : null; if (e && e.f107obs > 0) window.push(e.f107obs); }
        if (window.length < minimumDays) throw new Error(`81-day F10.7 window has ${window.length} days around ${date}`);
        const kp10 = d.kp.map((k) => Math.round(k * 10)), f = f107(t);
        rows.push(table('SPW', {
          DATE: date, KP1: kp10[0], KP2: kp10[1], KP3: kp10[2], KP4: kp10[3], KP5: kp10[4], KP6: kp10[5], KP7: kp10[6], KP8: kp10[7],
          KP_SUM: kp10.reduce((a, b) => a + b, 0), AP1: d.ap[0], AP2: d.ap[1], AP3: d.ap[2], AP4: d.ap[3], AP5: d.ap[4], AP6: d.ap[5], AP7: d.ap[6], AP8: d.ap[7],
          AP_AVG: d.Ap, F107_OBS: f.obs, F107_ADJ: f.adj, F107_DATA_TYPE: 0, F107_OBS_CENTER81: window.reduce((a, b) => a + b, 0) / window.length,
        }));
      }
      return { portId: 'space_weather', typeRef: PRW_TYPE, payload: encode('SPACE_WEATHER', table('PRWSpaceWeatherTable', { ROWS: rows })) };
    },
  };
}

export { kernelFrame };
