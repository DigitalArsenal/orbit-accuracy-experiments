#!/usr/bin/env node
// The site's VCM: a SYNTHETIC SP Vector Covariance Message, made from a
// made-up orbit and a made-up covariance, written by analysis/vcm-adapter's
// own `write` and read back by its `read` as a check. It stands in for the
// survey's sample, whose source is not recorded (data/licenses.json:
// sds-vcm-sample, not reproduced). Nothing here is an observation, a catalog
// entry or a real object: the identifiers are invented, the state is a
// Kepler orbit chosen for the page, and the covariance is a hand-set RTN
// sigma and correlation table rotated to the inertial axes.
//
//   node site/synthetic-vcm.mjs [--modules DIR]    # prints the message
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { loadModule, modulesRoot } from '../harness/modules.mjs';
import { PRW_TYPE } from '../harness/prw.mjs';

const GM = 398600.4415;  // km^3/s^2, EGM-96's value, which the message's GEOPOTENTIAL line names

// The made-up orbit: sun-synchronous-like, 7001.5 km semi-major axis.
export const SYNTHETIC = Object.freeze({
  epoch: '2026-08-14T06:00:00.000',
  elements: { a: 7001.5, e: 0.0011, iDeg: 98.2, raanDeg: 62.5, argpDeg: 71.0, meanDeg: 204.3 },
  // 1-sigma position (m) and velocity (m/s) in radial, in-track, cross-track axes.
  sigmaRtn: [9.0, 41.0, 7.0, 0.043, 0.0098, 0.0075],
  // Correlations among (r, t, n, vr, vt, vn) and the drag coefficient B (7th).
  correlations: { '0,1': -0.31, '0,3': 0.12, '0,4': 0.58, '1,3': -0.91, '1,4': -0.22, '2,5': -0.84, '0,6': 0.18, '1,6': 0.52, '3,6': -0.44, '4,6': -0.12 },
  ballisticCoefficientM2Kg: 0.00912,  // B
  ballisticSigmaFraction: 0.043,
  weightedRms: 1.0873,
  header: {
    indicator: 'SYNTHETIC: made-up identifiers, state and covariance; not an observation and not a real object.',
    center: 'SYNTHETIC', satelliteNumber: 99999, internationalDesignator: '9999-999Z', commonName: 'SYNTHETIC 1', epochRev: 41872,
    geopotential: 'EGM-96', zonals: 70, tesserals: 70, drag: 'JAC70/MSIS90', lunarSolar: 'ON', solarRadiationPressure: 'OFF',
    solidEarthTides: 'ON', inTrackThrust: 'OFF', f10: 148, averageF10: 142, averageAp: 12.0,
    taiMinusUtcS: 37, ut1MinusUtcS: -0.0412, ut1RateMsPerDay: 0.211, polarX: 0.1127, polarY: 0.4241, nutationTerms: 4,
    integratorMode: 'ASW', partials: 'FAST NUM', stepMode: 'AUTO', fixedStep: 'OFF', stepSizeSelection: 'MANUAL', initialStepSize: 20, errorControl: 1e-14,
  },
});

const rad = (d) => (d * Math.PI) / 180;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => a.map((x) => x / Math.hypot(...a));

// Kepler elements to an inertial position (km) and velocity (km/s).
function keplerState({ a, e, iDeg, raanDeg, argpDeg, meanDeg }) {
  const M = rad(meanDeg);
  let E = M;
  for (let k = 0; k < 30; ++k) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const n = Math.sqrt(GM / a ** 3), r = a * (1 - e * Math.cos(E));
  const vx = (-a * a * n * Math.sin(E)) / r, vy = (a * a * n * Math.sqrt(1 - e * e) * Math.cos(E)) / r;
  const [cO, sO, ci, si, cw, sw] = [Math.cos(rad(raanDeg)), Math.sin(rad(raanDeg)), Math.cos(rad(iDeg)), Math.sin(rad(iDeg)), Math.cos(rad(argpDeg)), Math.sin(rad(argpDeg))];
  const R = [[cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci], [sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci], [sw * si, cw * si]];
  return { r: R.map(([p, q]) => p * x + q * y), v: R.map(([p, q]) => p * vx + q * vy) };
}

// The 7x7 covariance in SI (m, m/s, then B in m^2/kg), inertial axes.
function covariance(s, spec) {
  const n = 7, sigma = [...spec.sigmaRtn, spec.ballisticSigmaFraction * spec.ballisticCoefficientM2Kg];
  const C = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (const [key, c] of Object.entries(spec.correlations)) { const [i, j] = key.split(',').map(Number); C[i][j] = C[j][i] = c; }
  // Positive definite? A Cholesky factorization says.
  const L = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; ++i) for (let j = 0; j <= i; ++j) {
    let sum = C[i][j];
    for (let k = 0; k < j; ++k) sum -= L[i][k] * L[j][k];
    if (i === j) { if (!(sum > 1e-9)) throw new Error('the synthetic correlation table is not positive definite'); L[i][i] = Math.sqrt(sum); } else L[i][j] = sum / L[j][j];
  }
  const rHat = unit(s.r), nHat = unit(cross(s.r, s.v)), tHat = cross(nHat, rHat);
  const axes = [rHat, tHat, nHat];
  const T = Array.from({ length: n }, () => Array(n).fill(0));  // RTN -> inertial
  for (let i = 0; i < 3; ++i) for (let j = 0; j < 3; ++j) { T[i][j] = axes[j][i]; T[3 + i][3 + j] = axes[j][i]; }
  T[6][6] = 1;
  const Prtn = C.map((row, i) => row.map((c, j) => c * sigma[i] * sigma[j]));
  const TP = T.map((row) => Prtn[0].map((_, j) => row.reduce((acc, t, k) => acc + t * Prtn[k][j], 0)));
  return TP.flatMap((row) => T.map((trow) => row.reduce((acc, v, k) => acc + v * trow[k], 0)));
}

const table = (name, fields) => Object.assign(new P[`${name}T`](), fields);

// The EXECUTION_RESULT analysis/vcm-adapter's `write` takes, built directly.
function resultFrame(spec) {
  const s = keplerState(spec.elements);
  const vec = (v, k) => table('FRMVector3', { X: v[0] * k, Y: v[1] * k, Z: v[2] * k });
  const state = table('FRMStateVector', {
    REPRESENTATION: P.frmStateRepresentation.CARTESIAN, POSITION: vec(s.r, 1000), VELOCITY: vec(s.v, 1000),
    COORDINATE_SYSTEM_NAME: 'EME2000', EPOCH: spec.epoch, EPOCH_TIME_SYSTEM: 'UTC',
  });
  const sample = table('PRWPropagationSample', {
    STATE: table('PRWResidentState', {
      STATE: state,
      COORDINATE_SYSTEM: table('RFMCoordinateSystem', { NAME: 'EME2000', AXIS_TYPE: P.rfmAxisType.MEAN_EQUATOR_EQUINOX_J2000, AXIS_REFERENCE_BODY_ID: 399,
        ORIGIN: table('RFMOrigin', { KIND: P.rfmOriginKind.CELESTIAL_BODY, CELESTIAL_BODY_ID: 399 }) }),
    }),
    COVARIANCE: table('PRWStateMatrix', { DIMENSION: 7, VALUES: covariance(s, spec) }),
  });
  const result = table('PRWExecutionResult', { FINAL_SAMPLE: sample, SAMPLES: [], EPHEMERIS_SOURCE: 'Analytical', DYNAMIC_PARAMETERS: [P.prwDynamicParameter.DRAG_AREA_OVER_MASS] });
  const b = new flatbuffers.Builder(2048);
  P.PRW.finishSizePrefixedPRWBuffer(b, table('PRW', { EXECUTION_RESULT: result }).pack(b));
  return { portId: 'result', typeRef: PRW_TYPE, payload: b.asUint8Array().slice() };
}

// The message text, and the adapter's own reading of it (the check).
export async function syntheticVcm(adapter, spec = SYNTHETIC) {
  const json = (portId, value) => ({ portId, payload: Buffer.from(JSON.stringify(value)) });
  const header = { ...spec.header, ballisticCoefficient: spec.ballisticCoefficientM2Kg, weightedRms: spec.weightedRms, parameterRows: 'fractional' };
  const written = await adapter.invoke('write', [resultFrame(spec), json('header', header)]);
  const text = Buffer.from(written.outputs.find((o) => o.portId === 'message').payload).toString('utf8');
  const read = await adapter.invoke('read', [{ portId: 'message', payload: Buffer.from(text) }, json('options', { ephemerisSource: 'Analytical', arcSeconds: 86400 })]);
  const report = JSON.parse(Buffer.from(read.outputs.find((o) => o.portId === 'report').payload).toString('utf8'));
  for (let i = 0; i < 3; ++i) {
    if (Math.abs(report.recomputedUvwSigmasKm[i] / report.statedUvwSigmasKm[i] - 1) > 0.01) throw new Error(`the synthetic VCM's recomputed sigma ${i} is off its printed value by more than 1 %`);
  }
  return { text, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { modules: { type: 'string' } } });
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const v1 = JSON.parse(fs.readFileSync(path.join(repo, 'experiments/v1-hpop-physical-truth/config.json'), 'utf8'));
  const root = modulesRoot({ flag: values.modules, configured: v1.inputs.modules, repoRoot: repo });
  const adapter = await loadModule(root, 'analysis/vcm-adapter');
  const { text } = await syntheticVcm(adapter);
  process.stdout.write(text);
  await adapter.destroy();
}
