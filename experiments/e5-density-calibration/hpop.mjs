// propagator/hpop requests for E5 (SDS 1.240.0 PRW): an execution request
// with drag (JB2008 or NRLMSISE-00), Cd*A/m as a dynamic parameter, and the
// environment inputs (DE440 kernel, IERS EOP, SET JB2008 indices or daily
// space weather); and the single-point ATMOSPHERE_REQUEST for NRLMSISE-00
// densities. Encoding and decoding only; SI units. Adapted from E2's
// hpop.mjs (parameters ride on unit area and mass: Cd = B, Cr = AGOM).
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { PRW_TYPE, instant } from '../../harness/prw.mjs';

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

export const jb2008Frame = (rows) => ({ portId: 'jb2008_indices', typeRef: PRW_TYPE,
  payload: encode('JB2008_INDICES', table('PRWJB2008IndicesTable', { ROWS: rows.map((r) => table('PRWJB2008Indices', r)) })) });
export const spaceWeatherFrame = (rows) => ({ portId: 'space_weather', typeRef: PRW_TYPE,
  payload: encode('SPACE_WEATHER', table('PRWSpaceWeatherTable', { ROWS: rows.map((r) => table('SPW', r)) })) });

// request: {epoch (ISO UTC), state [m, m/s] GCRF, samples [ISO UTC],
//   forces {degree, order, thirdBodies, srp, drag, solidTides, atmosphere},
//   parameters [{kind, value}], fixed {b, agom}, stm (bool), integrator {tolerance, maxStep}}
export function executionFrame(request) {
  const f = request.forces, it = request.integrator;
  const value = (kind, fallback) => request.parameters.find((p) => p.kind === kind)?.value ?? fallback;
  const forces = table('PRWForceConfiguration', {
    GRAVITY_CHOICE: P.prwGravitySelection.SPHERICAL_HARMONICS, ENABLE_POINT_MASS: true, GRAVITATIONAL_PARAMETER: 398600.4418e9,
    ENABLE_J2: false, ENABLE_J3: false, ENABLE_J4: false, ENABLE_HIGHER_ZONALS: false,
    MAXIMUM_DEGREE: f.degree, HAS_MAXIMUM_DEGREE: true, MAXIMUM_ORDER: f.order, HAS_MAXIMUM_ORDER: true,
    ENABLE_THIRD_BODY: (f.thirdBodies ?? []).length > 0, THIRD_BODY_IDS: f.thirdBodies ?? [],
    ENABLE_SRP: !!f.srp, ENABLE_DRAG: !!f.drag,
    INITIAL_MASS_KG: 1, AREA_M2: 1,
    REFLECTIVITY_COEFFICIENT: value('SRP_AREA_OVER_MASS', request.fixed?.agom ?? 0),
    DRAG_COEFFICIENT: value('DRAG_AREA_OVER_MASS', request.fixed?.b ?? 0),
    ATMOSPHERE_MODEL: P.prwAtmosphereFamily[f.atmosphere],
    EPHEMERIS_SOURCE: 'JPL_SPK',
    SOLID_TIDES: f.solidTides ? P.prwSolidTideModel.IERS_2010 : P.prwSolidTideModel.NONE,
    RELATIVITY: P.prwRelativityTerms.NONE,
  });
  const execution = table('PRWExecutionRequest', {
    INITIAL: table('PRWResidentState', {
      STATE: table('FRMStateVector', {
        REPRESENTATION: P.frmStateRepresentation.CARTESIAN, POSITION: vector(request.state.slice(0, 3)), VELOCITY: vector(request.state.slice(3, 6)),
        COORDINATE_SYSTEM_NAME: 'GCRF', EPOCH: request.epoch, EPOCH_TIME_SYSTEM: 'UTC',
      }),
      COORDINATE_SYSTEM: gcrf(), HAS_MASS_KG: false, MASS_KG: 0,
    }),
    TARGET_EPOCH: instant(request.target ?? request.samples.at(-1), 'UTC'),
    INTEGRATOR: table('PRWIntegratorSettings', {
      ALGORITHM: P.prwSolverAlgorithm.RK78, INITIAL_STEP_SECONDS: 60, MINIMUM_STEP_SECONDS: 0.01, MAXIMUM_STEP_SECONDS: it.maxStep,
      ABSOLUTE_TOLERANCES: Array(6).fill(it.tolerance * 1000), RELATIVE_TOLERANCE: it.tolerance, MAXIMUM_STEPS: 1000000,
    }),
    FORCES: forces,
    INCLUDE_STM: !!request.stm, STM_TECHNIQUE: P.prwDerivativeTechnique.ANALYTIC,
    DENSITY_TREATMENT: f.drag ? P.prwDensityTreatment.FINITE_DIFFERENCE : P.prwDensityTreatment.NEGLECTED,
    DYNAMIC_PARAMETERS: request.parameters.map((p) => P.prwDynamicParameter[p.kind]),
    SAMPLE_EPOCHS: request.samples.map((s) => instant(s, 'UTC')),
  });
  return { portId: 'request', typeRef: PRW_TYPE, payload: encode('EXECUTION_REQUEST', execution) };
}

// The samples, in request order: {epoch, state [m, m/s], stm [n*n] | null, n}.
export function decodeSamples(response) {
  const frame = response.outputs.find((o) => o.portId === 'response');
  const root = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(frame.payload))).unpack();
  if (!root.EXECUTION_RESULT) throw new Error('propagator/hpop: no execution result');
  return root.EXECUTION_RESULT.SAMPLES.map((s) => {
    const st = s.STATE.STATE;
    return {
      epoch: st.EPOCH,
      state: [st.POSITION.X, st.POSITION.Y, st.POSITION.Z, st.VELOCITY.X, st.VELOCITY.Y, st.VELOCITY.Z],
      n: s.STM?.DIMENSION ?? 6,
      stm: s.STM ? s.STM.VALUES : null,
    };
  });
}

// NRLMSISE-00 total mass density (gtd7d, anomalous oxygen included) at one
// geodetic point, with the drivers hpop's space_weather reading gives it.
export function atmosphereFrame({ epoch, altKm, latDeg, lonDeg, f107, f107a, ap }) {
  const request = table('PRWAtmosphereRequest', {
    ATMOSPHERE_MODEL: P.prwAtmosphereFamily.NRLMSISE00, EPOCH: instant(epoch, 'UTC'), ALTITUDE_M: altKm * 1000,
    LATITUDE_RAD: latDeg * Math.PI / 180, LONGITUDE_RAD: lonDeg * Math.PI / 180, HAS_LOCAL_SOLAR_TIME_HOURS: false,
    F107: f107, F107_AVERAGE: f107a, AP_INDEX: ap, INCLUDE_ANOMALOUS_OXYGEN: true,
  });
  return { portId: 'request', typeRef: PRW_TYPE, payload: encode('ATMOSPHERE_REQUEST', request, 1024) };
}
export function decodeAtmosphere(response) {
  const frame = response.outputs.find((o) => o.portId === 'response');
  const root = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(frame.payload))).unpack();
  if (!root.ATMOSPHERE_RESULT) throw new Error('propagator/hpop: no atmosphere result');
  return root.ATMOSPHERE_RESULT.DENSITY_KG_M3;
}
