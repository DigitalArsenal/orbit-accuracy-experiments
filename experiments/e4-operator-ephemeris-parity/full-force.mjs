// Amendment A4: propagator/hpop execution requests with every force the
// module carries (SDS 1.243.0 PRW), the environment those forces read as it
// was released at a product's cut-off, and the batch fit of an arc of epoch
// states (analysis/estimation fit_batch, answered by propagator/hpop).
//
// Copied from E7's draft harness (harness/full-force.mjs and
// harness/cutoff-environment.mjs at 2dbbd6a) and E2's product.mjs
// (fitProduct), so that E4 does not depend on an unfrozen experiment; the
// Earth radiation and ocean tide fields are new in SDS 1.243.0. Encoding,
// decoding and the selection of published rows only: the propagation, force
// models, frames and time scales are the modules'. SI units. The physical
// coefficients ride on unit area and mass, so DRAG_COEFFICIENT carries Cd*A/m
// and REFLECTIVITY_COEFFICIENT Cr*A/m (m^2/kg), as in E2 and E7; Earth
// radiation pressure acts on the same Cr*A/m (the cannonball's).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { sha256 } from '../../harness/modules.mjs';
import { PRW_TYPE, instant } from '../../harness/prw.mjs';
import { EST_TYPE, decodeResult, positionObservation, seedStruct } from '../e2-catalog-covariance/estimation-wire.mjs';
import { estEpoch } from '../e2-catalog-covariance/product.mjs';

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
//   forces {degree, order, thirdBodies [NAIF ids], drag, atmosphere, solidTides,
//     oceanTidesDegree, earthRadiation, earthRadiationResolutionDeg, relativity},
//   coefficients {b: Cd*A/m, agom: Cr*A/m}, parameters [{kind}] solved for
//   (their values come from coefficients), stm (bool),
//   covariance [(6 + p)^2] (SI, GCRF, over the state and the parameters) | null,
//   noise {q [3] m^2/s^3 RTN, intervalSeconds} | null, integrator {tolerance, maxStep}}
export function executionFrame(request) {
  const f = request.forces, it = request.integrator, c = request.coefficients;
  const parameters = request.parameters ?? [];
  const forces = table('PRWForceConfiguration', {
    GRAVITY_CHOICE: P.prwGravitySelection.EGM2008, ENABLE_POINT_MASS: true, GRAVITATIONAL_PARAMETER: 398600.4418e9,
    ENABLE_J2: false, ENABLE_J3: false, ENABLE_J4: false, ENABLE_HIGHER_ZONALS: false,
    MAXIMUM_DEGREE: f.degree, HAS_MAXIMUM_DEGREE: true, MAXIMUM_ORDER: f.order, HAS_MAXIMUM_ORDER: true,
    ENABLE_THIRD_BODY: f.thirdBodies.length > 0, THIRD_BODY_IDS: f.thirdBodies,
    ENABLE_SRP: true, ENABLE_DRAG: !!f.drag,
    INITIAL_MASS_KG: 1, AREA_M2: 1, REFLECTIVITY_COEFFICIENT: c.agom,
    RADIATION_PRESSURE_MODEL: P.prwRadiationPressureFamily.CANNONBALL,
    DRAG_COEFFICIENT: f.drag ? c.b : 0,
    ATMOSPHERE_MODEL: P.prwAtmosphereFamily[f.atmosphere ?? 'NRLMSISE00'],
    EPHEMERIS_SOURCE: 'JPL_SPK',
    SOLID_TIDES: f.solidTides ? P.prwSolidTideModel.IERS_2010 : P.prwSolidTideModel.NONE,
    RELATIVITY: f.relativity ? P.prwRelativityTerms[f.relativity] : P.prwRelativityTerms.NONE,
    EARTH_RADIATION: f.earthRadiation ? P.prwEarthRadiationModel.KNOCKE : P.prwEarthRadiationModel.NONE,
    EARTH_RADIATION_RESOLUTION_DEG: f.earthRadiationResolutionDeg ?? 15,
    OCEAN_TIDES: f.oceanTidesDegree ? P.prwOceanTideModel.FES2004 : P.prwOceanTideModel.NONE,
    OCEAN_TIDE_MAXIMUM_DEGREE: f.oceanTidesDegree ?? 30, OCEAN_TIDE_MAXIMUM_ORDER: f.oceanTidesDegree ?? 30,
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
    DYNAMIC_PARAMETERS: parameters.map((p) => P.prwDynamicParameter[p.kind]),
    INITIAL_COVARIANCE: request.covariance ? table('PRWStateMatrix', { DIMENSION: 6 + parameters.length, VALUES: request.covariance }) : null,
    PROCESS_NOISE: request.noise ? table('PRWProcessNoise', {
      MODEL: P.prwProcessNoiseModel.WHITE_ACCELERATION, AXES: P.prwProcessNoiseAxes.RADIAL_TRANSVERSE_NORMAL,
      SPECTRAL_DENSITY_M2_S3: request.noise.q, DISCRETIZATION_SECONDS: request.noise.intervalSeconds,
    }) : null,
    SAMPLE_EPOCHS: request.samples.map((s) => instant(s, 'UTC')),
  });
  return { portId: 'request', typeRef: PRW_TYPE, payload: encode('EXECUTION_REQUEST', execution) };
}

// The samples, in request order: {epoch, state [m, m/s], stm [n*n] | null,
// covariance [n*n] | null, n, steps}.
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

// ── environment ──
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayStart = (ms) => Math.floor(ms / DAY_MS) * DAY_MS;
export const mjdOf = (ms) => Math.floor(ms / DAY_MS) + 40587;

// IERS finals2000A through data-source/eop-parser: [{mjd, row}] (E2's eopRecords).
export async function finalsRecords(parser, file) {
  const body = fs.readFileSync(file);
  const response = await parser.invoke('parse_finals2000a', [{ portId: 'body', payload: body, typeRef: { wireFormat: 'aligned-binary', requiredAlignment: 1, byteLength: body.length } }]);
  const out = Buffer.from(response.outputs.find((f) => f.portId === 'records').payload);
  const records = [];
  for (let at = 0; at < out.length;) {
    const n = out.readUInt32LE(at);
    const row = P.EOP.getRootAsEOP(new flatbuffers.ByteBuffer(new Uint8Array(out.subarray(at + 4, at + 4 + n)))).unpack();
    records.push({ mjd: row.MJD, row });
    at += 4 + n;
  }
  return { records, sha256: sha256(body) };
}

// Rows for MJD <= the cut-off's MJD - latencyDays are released; later days
// repeat the last released row (E7's releasedEopRecords).
export function releasedEopFrame(records, cutoffMs, latencyDays, fromMjd, toMjd) {
  const last = mjdOf(cutoffMs) - latencyDays;
  const base = records.filter((r) => r.mjd <= last).at(-1);
  if (!base) throw new Error(`no EOP row released by MJD ${last}`);
  const rows = records.filter((r) => r.mjd >= fromMjd && r.mjd <= Math.min(toMjd, last)).map((r) => r.row);
  for (let mjd = Math.max(fromMjd, last + 1); mjd <= toMjd; ++mjd)
    rows.push(Object.assign(Object.create(Object.getPrototypeOf(base.row)), base.row, { MJD: mjd, DATE: `${isoDay((mjd - 40587) * DAY_MS)}T00:00:00Z` }));
  const b = new flatbuffers.Builder(1 << 16);
  P.PRW.finishSizePrefixedPRWBuffer(b, Object.assign(new P.PRWT(), { EARTH_ORIENTATION: Object.assign(new P.PRWEarthOrientationT(), { ROWS: rows }) }).pack(b));
  return { portId: 'earth_orientation', typeRef: PRW_TYPE, payload: b.asUint8Array().slice() };
}

export const spaceWeatherFrame = (rows) => ({ portId: 'space_weather', typeRef: PRW_TYPE,
  payload: encode('SPACE_WEATHER', table('PRWSpaceWeatherTable', { ROWS: rows.map((r) => table('SPW', r)) })) });

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

// NOAA SWPC's Report of Solar-Geophysical Activity (RSGA), issued daily at
// 22:00 UTC: observed and three days of predicted Penticton F10.7, observed,
// estimated and three days of predicted Ap. `sources`: yearly *_RSGA.tar.gz
// archives and directories of *RSGA.txt files, as SWPC's warehouse serves them.
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function parseRsga(text) {
  const issued = /:Issued:\s+(\d{4})\s+(\w{3})\s+(\d+)\s+(\d{2})(\d{2})\s+UTC/.exec(text);
  if (!issued) return null;
  const year = Number(issued[1]);
  const issuedMs = Date.UTC(year, MONTHS[issued[2]], Number(issued[3]), Number(issued[4]), Number(issued[5]));
  // A date "15 Nov" near the issue: the year that puts it within 200 days.
  const dateMs = (d, m) => {
    let t = Date.UTC(year, MONTHS[m], Number(d));
    if (t - issuedMs > 200 * DAY_MS) t = Date.UTC(year - 1, MONTHS[m], Number(d));
    if (issuedMs - t > 200 * DAY_MS) t = Date.UTC(year + 1, MONTHS[m], Number(d));
    return t;
  };
  const flux = text.slice(text.indexOf('10.7 cm Flux'));
  const fObs = /Observed\s+(\d+)\s+(\w{3})\s+(\d+)/.exec(flux);
  const fPred = /Predicted\s+(\d+)\s+(\w{3})-(\d+)\s+(\w{3})\s+(\d+)\/(\d+)\/(\d+)/.exec(flux);
  const geo = text.slice(text.indexOf('Geomagnetic A Indices'));
  const aObs = /Observed Afr\/Ap\s+(\d+)\s+(\w{3})\s+(\d+)\/(\d+)/.exec(geo);
  const aEst = /Estimated Afr\/Ap\s+(\d+)\s+(\w{3})\s+(\d+)\/(\d+)/.exec(geo);
  const aPred = /Predicted Afr\/Ap\s+(\d+)\s+(\w{3})-(\d+)\s+(\w{3})\s+(\d+)\/(\d+)-(\d+)\/(\d+)-(\d+)\/(\d+)/.exec(geo);
  if (!fObs || !fPred || !aEst || !aPred) return null;
  const p0 = dateMs(fPred[1], fPred[2]), ap0 = dateMs(aPred[1], aPred[2]);
  return {
    issuedMs,
    f107: [{ day: dateMs(fObs[1], fObs[2]), value: Number(fObs[3]), kind: 'observed' }, ...[5, 6, 7].map((k, i) => ({ day: p0 + i * DAY_MS, value: Number(fPred[k]), kind: 'predicted' }))],
    ap: [
      ...(aObs ? [{ day: dateMs(aObs[1], aObs[2]), value: Number(aObs[4]), kind: 'observed' }] : []),
      { day: dateMs(aEst[1], aEst[2]), value: Number(aEst[4]), kind: 'estimated' },
      ...[6, 8, 10].map((k, i) => ({ day: ap0 + i * DAY_MS, value: Number(aPred[k]), kind: 'predicted' })),
    ],
  };
}
export function readRsga(sources, cacheDir) {
  const reports = [];
  const files = {};
  for (const src of sources) {
    let dir = src;
    if (src.endsWith('.tar.gz')) {
      dir = path.join(cacheDir, path.basename(src, '.tar.gz'));
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); execFileSync('tar', ['-xzf', src, '-C', dir]); }
      files[path.basename(src)] = sha256(fs.readFileSync(src));
    }
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /RSGA\.txt$/.test(e.name) ? [path.join(d, e.name)] : []));
    for (const f of walk(dir)) {
      const text = fs.readFileSync(f, 'latin1');
      if (!src.endsWith('.tar.gz')) files[path.basename(f)] = sha256(Buffer.from(text, 'latin1'));
      const r = parseRsga(text);
      if (r) reports.push(r);
    }
  }
  reports.sort((a, b) => a.issuedMs - b.issuedMs);
  return { reports, files };
}

// Kp (x10) for a daily Ap from the standard ap-Kp table (Bartels' scale).
const KP10 = [0, 3, 7, 10, 13, 17, 20, 23, 27, 30, 33, 37, 40, 43, 47, 50, 53, 57, 60, 63, 67, 70, 73, 77, 80, 83, 87, 90];
const AP = [0, 2, 3, 4, 5, 6, 7, 9, 12, 15, 18, 22, 27, 32, 39, 48, 56, 67, 80, 94, 111, 132, 154, 179, 207, 236, 300, 400];
const kp10Of = (ap) => KP10[AP.reduce((best, v, i) => (Math.abs(v - ap) < Math.abs(AP[best] - ap) ? i : best), 0)];

// $SPW rows for [fromMs, toMs] as released at cutoffMs (E7's
// releasedSpwRows): GFZ's observed values for the days before the newest
// RSGA's day d, that RSGA's observed F10.7 and estimated Ap for d, its
// predictions for d+1..d+3, and day d+3 held after that. Each row's 81-day
// centred F10.7 mean is taken over the released observed days inside the 81
// days when at least 41 are, otherwise over the last 81 released days.
export function releasedSpwRows(gfz, rsga, cutoffMs, fromMs, toMs) {
  const issue = rsga.reports.filter((r) => r.issuedMs <= cutoffMs).at(-1);
  if (!issue) throw new Error(`no RSGA issued by ${new Date(cutoffMs).toISOString()}`);
  const d = issue.f107[0].day;
  const observedF = new Map();
  for (const [date, v] of gfz.days) { const t = Date.parse(`${date}T00:00:00Z`); if (t < d && v.f107obs > 0) observedF.set(t, v.f107obs); }
  observedF.set(d, issue.f107[0].value);
  const fAt = (t) => issue.f107.filter((x) => x.day <= t).at(-1).value;
  const apAt = (t) => (issue.ap.filter((x) => x.day <= t && x.kind !== 'observed').at(-1) ?? issue.ap.at(-1)).value;
  const trailing = [];
  for (let k = 0; k < 81; ++k) { const v = observedF.get(d - k * DAY_MS); if (v) trailing.push(v); }
  if (trailing.length < 75) throw new Error(`only ${trailing.length} released F10.7 days in the 81 before ${isoDay(d)}`);
  const trailingMean = trailing.reduce((a, b) => a + b, 0) / trailing.length;
  const rows = [];
  for (let t = dayStart(fromMs); t <= toMs; t += DAY_MS) {
    const window = [];
    for (let k = -40; k <= 40; ++k) { const v = observedF.get(t + k * DAY_MS); if (v) window.push(v); }
    const center = window.length >= 41 ? window.reduce((a, b) => a + b, 0) / window.length : trailingMean;
    if (t < d) {
      const g = gfz.days.get(isoDay(t));
      if (!g) throw new Error(`no GFZ row for ${isoDay(t)}`);
      const kp10 = g.kp.map((k) => Math.round(k * 10));
      const f = g.f107obs > 0 ? g.f107obs : center;
      rows.push({ DATE: isoDay(t), KP1: kp10[0], KP2: kp10[1], KP3: kp10[2], KP4: kp10[3], KP5: kp10[4], KP6: kp10[5], KP7: kp10[6], KP8: kp10[7],
        KP_SUM: kp10.reduce((a, b) => a + b, 0), AP1: g.ap[0], AP2: g.ap[1], AP3: g.ap[2], AP4: g.ap[3], AP5: g.ap[4], AP6: g.ap[5], AP7: g.ap[6], AP8: g.ap[7],
        AP_AVG: g.Ap, F107_OBS: f, F107_ADJ: g.f107adj > 0 ? g.f107adj : f, F107_DATA_TYPE: 0, F107_OBS_CENTER81: center });
    } else {
      const ap = apAt(t), kp = kp10Of(ap), f = fAt(t);
      rows.push({ DATE: isoDay(t), KP1: kp, KP2: kp, KP3: kp, KP4: kp, KP5: kp, KP6: kp, KP7: kp, KP8: kp, KP_SUM: 8 * kp,
        AP1: ap, AP2: ap, AP3: ap, AP4: ap, AP5: ap, AP6: ap, AP7: ap, AP8: ap, AP_AVG: ap, F107_OBS: f, F107_ADJ: f, F107_DATA_TYPE: t === d ? 0 : 1, F107_OBS_CENTER81: center });
    }
  }
  return { rows, issue: new Date(issue.issuedMs).toISOString() };
}

// ── batch fit ──
// The state at reference.epoch and the solved-for coefficients, fitted to
// full-state pseudo-observations [{epoch, state, covariance [36] RTN}].
// settings: {parameters [{kind, value}], apriori [(6+p)^2], forces, fixed
// {b, agom}, integrator, fit {maximumIterations, correctionTolerance,
// sigmaEditThreshold}}; inputs: the environment frames. Adapted from E2's
// fitProduct (one HPOP call per round, the STM and parameter columns
// answering every query). Returns {status, fit, rounds, hpopCalls}.
export function withParameters(fixed, parameters, values) {
  const out = { ...fixed };
  parameters.forEach((p, i) => {
    if (p.kind === 'DRAG_AREA_OVER_MASS') out.b = values[i];
    else if (p.kind === 'SRP_AREA_OVER_MASS') out.agom = values[i];
    else throw new Error(`unknown parameter ${p.kind}`);
  });
  return out;
}
export async function fitArc({ estimation, hpop, codec }, inputs, reference, observations, settings) {
  const isoByLabel = new Map(observations.map((o) => [JSON.stringify(estEpoch(o.epoch)), o.epoch]));
  const request = {
    config: {
      initial_epoch: estEpoch(reference.epoch), initial_state: reference.state, initial_covariance: Array(36).fill(0),
      process_noise_spectral_density: Array(6).fill(0), state_convergence_tolerance: 0, rms_convergence_tolerance: 0, sigma_edit_threshold: 0,
      dynamic_model_correlation_time_seconds: 0, maximum_iterations: 0, reference_frame: 'ICRF', estimator: 'BATCH_WEIGHTED_LEAST_SQUARES', process_noise: 'NONE', flags: 0,
    },
    extended_observations: observations.map((o) => ({
      observation: { ...positionObservation(estEpoch(o.epoch), [0, 0, 0]), kind: 'POSITION_VELOCITY', value_count: 6 },
      values: o.state, sigmas: [1, 1, 1, 1, 1, 1],
    })),
    propagator_port_id: 'propagator/hpop', propagator_capability: 'plugin_propagate plugin_compute_stm',
    batch_options: {
      parameter_kinds: settings.parameters.map((p) => P.prwDynamicParameter[p.kind]),
      parameter_values: settings.parameters.map((p) => p.value),
      apriori_covariance: settings.apriori,
      observation_covariances: observations.flatMap((o) => o.covariance),
      covariance_axes: 1,
      maximum_iterations: settings.fit.maximumIterations, correction_tolerance: settings.fit.correctionTolerance, sigma_edit_threshold: settings.fit.sigmaEditThreshold,
    },
  };
  const answers = [];
  let hpopCalls = 0;
  for (let round = 0; ; ++round) {
    const response = await estimation.invoke('fit_batch', [{ portId: 'request', typeRef: EST_TYPE, payload: codec.encode({ request, propagation_answers: answers }) }]);
    const out = decodeResult(response.outputs.find((o) => o.portId === 'result').payload);
    if (out.status !== 1) return { status: out.status, fit: out.fit, rounds: round, hpopCalls };
    const q0 = out.queries[0];
    const samples = decodeSamples(await hpop.invoke('invoke', [
      executionFrame({ epoch: reference.epoch, state: q0.seed.state, samples: out.queries.map((q) => isoByLabel.get(JSON.stringify(q.target_epoch))),
        forces: settings.forces, coefficients: withParameters(settings.fixed, settings.parameters, q0.parameter_values), parameters: settings.parameters,
        stm: true, integrator: settings.integrator }),
      ...inputs,
    ]));
    ++hpopCalls;
    out.queries.forEach((q, k) => {
      const s = samples[k], n = s.n, stm = [], sensitivity = [];
      for (let i = 0; i < 6; ++i) {
        for (let j = 0; j < 6; ++j) stm.push(s.stm[i * n + j]);
        for (let j = 6; j < n; ++j) sensitivity.push(s.stm[i * n + j]);
      }
      answers.push({
        query: { sequence: q.sequence, seed: seedStruct(q), target_epoch: q.target_epoch, parameter_values: q.parameter_values },
        sample: { epoch: q.target_epoch, state: s.state, stm },
        sensitivity,
      });
    });
    if (round > settings.fit.maximumIterations + 1) throw new Error('fit_batch kept asking for propagation');
  }
}
