// propagator/hpop execution requests for E8: every force the module carries
// in LEO (config.propagation.forces: EGM2008 70 x 70, Sun, Moon, Venus, Mars
// and Jupiter from DE440s, cannonball radiation pressure, drag, IERS 2010
// solid tides and relativity), Cd*A/m as a dynamic parameter or fixed, and
// the JB2008 drivers. E5's encoder (experiments/e5-density-calibration/
// hpop.mjs) with the gravity selection, third bodies and relativity of a full
// force model; E5's decoders and driver frame are reused. Encoding only; SI.
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { PRW_TYPE, instant } from '../../harness/prw.mjs';

export { decodeSamples, jb2008Frame } from '../e5-density-calibration/hpop.mjs';

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

// request: {epoch (ISO UTC), state [m, m/s] GCRF, samples [ISO UTC], forces
//   (config.propagation.forces + atmosphere), parameters [{kind, value}],
//   fixed {b, agom}, stm (bool), integrator {tolerance, maxStep}}
export function executionFrame(request) {
  const f = request.forces, it = request.integrator;
  const value = (kind, fallback) => request.parameters.find((p) => p.kind === kind)?.value ?? fallback;
  const forces = table('PRWForceConfiguration', {
    GRAVITY_CHOICE: P.prwGravitySelection[f.gravity], ENABLE_POINT_MASS: true, GRAVITATIONAL_PARAMETER: 398600.4418e9,
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
