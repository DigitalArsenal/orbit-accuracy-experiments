// The physics-match gauntlet's hypothesis space: one hypothesis is a full
// description of how an operator's propagator could have produced its
// ephemeris (the conventions of the published states, the force model, its
// environment inputs and the solve-for parameters). This file names the
// axes and their levels, validates a hypothesis, and frames it as a
// propagator/hpop PRW execution request (SDS 1.243.0). The propagation,
// frames, time scales and force models are the modules'.
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { PRW_TYPE, instant } from '../../harness/prw.mjs';

// Axis -> levels. The order of AXES is the order of the hierarchical search
// (largest signature first, PLAN.md section 5).
export const AXES = {
  frame: ['EME2000', 'GCRF', 'TEME', 'TOD', 'MOD', 'ITRF'],
  timeScale: ['UTC', 'TAI', 'GPS', 'TT'],
  eop: ['FINALS', 'ZERO'],
  gravityModel: ['EGM2008', 'EGM96'],
  degree: [2, 4, 8, 12, 20, 24, 36, 48, 70],
  thirdBodies: ['NONE', 'SUN_MOON', 'SUN_MOON_PLANETS'],
  ephemeris: ['DE440', 'DE430', 'DE421', 'DE405'],
  solidTides: [false, true],
  oceanTides: [false, true],
  relativity: ['NONE', 'SCHWARZSCHILD', 'IERS_2010'],
  srp: ['NONE', 'CANNONBALL'],
  earthRadiation: [false, true],
  atmosphere: ['NONE', 'NRLMSISE00', 'JB2008', 'JACCHIA_ROBERTS', 'HARRIS_PRIESTER', 'EXPONENTIAL'],
  spaceWeather: ['OBSERVED', 'FORECAST', 'CONSTANT'],
};

// NAIF ids of the third-body levels (DE440s: barycentres for the planets).
const BODIES = { NONE: [], SUN_MOON: [10, 301], SUN_MOON_PLANETS: [10, 301, 2, 4, 5] };
// Models that read space weather (the others are static).
export const WEATHER_MODELS = new Set(['NRLMSISE00', 'JB2008', 'JACCHIA_ROBERTS']);

// The default: HPOP's full force (owner 2026-10-09) on the file's labelled
// frame and time scale (defaultFor). Degree 70 is the module's ceiling.
export const DEFAULT = Object.freeze({
  frame: 'EME2000', timeScale: 'UTC', eop: 'FINALS',
  gravityModel: 'EGM2008', degree: 70,
  thirdBodies: 'SUN_MOON_PLANETS', ephemeris: 'DE440', solidTides: true, oceanTides: true, relativity: 'IERS_2010',
  srp: 'CANNONBALL', earthRadiation: true,
  atmosphere: 'NRLMSISE00', spaceWeather: 'FORECAST',
});

export const defaultFor = (label) => ({ ...DEFAULT, frame: label.frame, timeScale: label.timeScale });

export function validate(h) {
  for (const [axis, levels] of Object.entries(AXES)) {
    if (!(axis in h)) throw new Error(`hypothesis without ${axis}`);
    if (!levels.includes(h[axis])) throw new Error(`hypothesis ${axis}=${h[axis]} is not one of ${levels.join(', ')}`);
  }
  if ((h.solidTides || h.oceanTides) && h.degree < 2) throw new Error('tides need a field');
  if (h.earthRadiation && h.srp === 'NONE') throw new Error('Earth radiation rides on the cannonball coefficient (PLAN.md section 4)');
  return h;
}

// A short stable label, e.g. "EME2000/UTC/FINALS EGM2008 70 SMP st ot IERS_2010 CB er NRLMSISE00:FORECAST".
// The frame and scale are readings of the file's labels; the rest is the model.
export function label(h) {
  return [
    `${h.frame}/${h.timeScale}/${h.eop}`,
    `${h.gravityModel} ${h.degree}`,
    `${{ NONE: '-', SUN_MOON: 'SM', SUN_MOON_PLANETS: 'SMP' }[h.thirdBodies]}${h.thirdBodies === 'NONE' ? '' : `:${h.ephemeris}`}`,
    h.solidTides ? 'st' : '-', h.oceanTides ? 'ot' : '-', h.relativity,
    h.srp === 'CANNONBALL' ? 'CB' : '-', h.earthRadiation ? 'er' : '-',
    h.atmosphere === 'NONE' ? 'nodrag' : WEATHER_MODELS.has(h.atmosphere) ? `${h.atmosphere}:${h.spaceWeather}` : h.atmosphere,
  ].join(' ');
}

// The solve-for parameters a hypothesis implies (PRW DYNAMIC_PARAMETERS),
// with their bounds: Cd*A/m with drag, Cr*A/m with radiation pressure.
export function parametersOf(h, start = {}) {
  const out = [];
  if (h.atmosphere !== 'NONE') out.push({ kind: 'DRAG_AREA_OVER_MASS', value: start.b ?? 0.01, lower: 0 });
  if (h.srp === 'CANNONBALL') out.push({ kind: 'SRP_AREA_OVER_MASS', value: start.agom ?? 0.01, lower: 0 });
  return out;
}

const table = (name, fields = {}) => Object.assign(new P[`${name}T`](), fields);
const vector = (v) => table('FRMVector3', { X: v[0], Y: v[1], Z: v[2] });
const gcrf = () => table('RFMCoordinateSystem', {
  NAME: 'GCRF', AXIS_TYPE: P.rfmAxisType.ICRF, AXIS_REFERENCE_BODY_ID: 399,
  ORIGIN: table('RFMOrigin', { KIND: P.rfmOriginKind.CELESTIAL_BODY, CELESTIAL_BODY_ID: 399 }),
});
const noZ = (text) => text.replace(/Z$/, '');

// PRW force configuration of a hypothesis with coefficients {b, agom}
// (m^2/kg, on unit area and mass) and an optional constant weather
// ({f107, f107a, ap, kp}, the CONSTANT space-weather level).
function forcesOf(h, c, weather) {
  // Degree 2 is the J2 term alone (EGM2008); from 4 up the full field, degree = order.
  const field = h.degree <= 2 ? { GRAVITY_CHOICE: P.prwGravitySelection.J2_ONLY }
    : { GRAVITY_CHOICE: P.prwGravitySelection[h.gravityModel], MAXIMUM_DEGREE: h.degree, HAS_MAXIMUM_DEGREE: true, MAXIMUM_ORDER: h.degree, HAS_MAXIMUM_ORDER: true };
  if (h.gravityModel === 'EGM96' && h.degree <= 2) throw new Error('the J2 selection is EGM2008\'s');
  const drag = h.atmosphere !== 'NONE', srp = h.srp === 'CANNONBALL';
  return table('PRWForceConfiguration', {
    ENABLE_POINT_MASS: true, GRAVITATIONAL_PARAMETER: 3.986004415e14,
    ENABLE_J2: false, ENABLE_J3: false, ENABLE_J4: false, ENABLE_HIGHER_ZONALS: false,
    ...field,
    ENABLE_THIRD_BODY: BODIES[h.thirdBodies].length > 0, THIRD_BODY_IDS: BODIES[h.thirdBodies],
    ENABLE_SRP: srp, ENABLE_DRAG: drag, INITIAL_MASS_KG: 1, AREA_M2: 1,
    REFLECTIVITY_COEFFICIENT: srp ? c.agom : 0,
    RADIATION_PRESSURE_MODEL: P.prwRadiationPressureFamily.CANNONBALL, // inert while ENABLE_SRP is false
    EARTH_RADIATION: h.earthRadiation ? P.prwEarthRadiationModel.KNOCKE : P.prwEarthRadiationModel.NONE,
    EARTH_RADIATION_RESOLUTION_DEG: 15,
    DRAG_COEFFICIENT: drag ? c.b : 0,
    ATMOSPHERE_MODEL: drag ? P.prwAtmosphereFamily[h.atmosphere] : P.prwAtmosphereFamily.NRLMSISE00,
    WEATHER: weather ? table('PRWSpaceWeather', { EPOCH: instant('2000-01-01T12:00:00', 'UTC'), F107: weather.f107, F107_AVERAGE: weather.f107a, AP_INDEX: weather.ap, KP_INDEX: weather.kp }) : null,
    EPHEMERIS_SOURCE: 'JPL_SPK',
    SOLID_TIDES: h.solidTides ? P.prwSolidTideModel.IERS_2010 : P.prwSolidTideModel.NONE,
    OCEAN_TIDES: h.oceanTides ? P.prwOceanTideModel.FES2004 : P.prwOceanTideModel.NONE,
    OCEAN_TIDE_MAXIMUM_DEGREE: 30, OCEAN_TIDE_MAXIMUM_ORDER: 30,
    RELATIVITY: P.prwRelativityTerms[h.relativity],
  });
}

// request: {h, epoch (ISO UTC), state [m, m/s] GCRF, samples [ISO UTC],
//   coefficients {b, agom}, parameters [{kind}] (STM columns), stm, weather,
//   integrator {tolerance, maxStep}}.
export function executionFrame({ h, epoch, state, samples, coefficients, parameters = [], stm = false, weather = null, integrator }) {
  const drag = h.atmosphere !== 'NONE';
  const execution = table('PRWExecutionRequest', {
    INITIAL: table('PRWResidentState', {
      STATE: table('FRMStateVector', {
        REPRESENTATION: P.frmStateRepresentation.CARTESIAN, POSITION: vector(state.slice(0, 3)), VELOCITY: vector(state.slice(3, 6)),
        COORDINATE_SYSTEM_NAME: 'GCRF', EPOCH: noZ(epoch), EPOCH_TIME_SYSTEM: 'UTC',
      }),
      COORDINATE_SYSTEM: gcrf(), HAS_MASS_KG: false, MASS_KG: 0,
    }),
    TARGET_EPOCH: instant(noZ(samples.at(-1)), 'UTC'),
    INTEGRATOR: table('PRWIntegratorSettings', {
      ALGORITHM: P.prwSolverAlgorithm.RK78, INITIAL_STEP_SECONDS: 30, MINIMUM_STEP_SECONDS: 0.001, MAXIMUM_STEP_SECONDS: integrator.maxStep,
      ABSOLUTE_TOLERANCES: Array(6).fill(integrator.tolerance * 1000), RELATIVE_TOLERANCE: integrator.tolerance, MAXIMUM_STEPS: 4000000,
    }),
    FORCES: forcesOf(h, coefficients, weather),
    INCLUDE_STM: stm, STM_TECHNIQUE: P.prwDerivativeTechnique.ANALYTIC,
    DENSITY_TREATMENT: drag ? P.prwDensityTreatment.FINITE_DIFFERENCE : P.prwDensityTreatment.NEGLECTED,
    DYNAMIC_PARAMETERS: parameters.map((p) => P.prwDynamicParameter[p.kind]),
    SAMPLE_EPOCHS: samples.map((s) => instant(noZ(s), 'UTC')),
  });
  const b = new flatbuffers.Builder(1 << 16);
  P.PRW.finishSizePrefixedPRWBuffer(b, table('PRW', { EXECUTION_REQUEST: execution }).pack(b));
  return { portId: 'request', typeRef: PRW_TYPE, payload: b.asUint8Array().slice() };
}

// Coefficients after a fit: the parameters' values over the fixed ones.
export function withParameters(fixed, parameters, values) {
  const out = { ...fixed };
  parameters.forEach((p, i) => {
    if (p.kind === 'DRAG_AREA_OVER_MASS') out.b = values[i];
    else if (p.kind === 'SRP_AREA_OVER_MASS') out.agom = values[i];
    else throw new Error(`unknown parameter ${p.kind}`);
  });
  return out;
}
