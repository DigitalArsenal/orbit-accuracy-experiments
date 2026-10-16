// VENDORED for E13 (experiments/e13-open-dca): the full-force FFM ephemeris fitter
// Source: orbit-accuracy-experiments task/e4-a4-full-force-20261009 at 70484b2 (E4 amendments A5/A6), not yet on main.
// Patched by the starlink-forecast lane (lockSrp, lockDrag, upper bound on Cd*A/m, exported normalize/fitRun/residualRows); imports re-pointed at this repository.
// Delete this directory and import harness/ephemeris-fit.mjs when E4 A5/A6 lands; keep the two in step until then.
// The full-force FFM orbit fitted to one operator ephemeris, in memory: no
// file is read or written for the ephemeris (owner rule, 2026-10-10: the
// ephemeris lives in memory only as long as the fit takes; only the derived
// OCM and its statistics are kept). E4 amendment A6 and E11's capture loop
// call it on each operator file version.
//
// The algorithm is the one agreed with the operator-ephemeris OD lane (its
// analysis/od "ffm" mode) and E11, 2026-10-10:
// - every state to GCRF (EME2000/J2000 through the IAU 2006 frame bias), UTC;
// - maneuver-free segments: a gap over three median steps, an operator-listed
//   event and a residual jump (below) each end one; `spanSeconds` (> 0) keeps
//   only the points within that span of the first;
// - per segment, the initial state and epoch at its first point; at most 720
//   evenly spaced points enter the fit; positions only, equal 1 m sigmas,
//   empty a priori; analysis/estimation 0.3.0 fit_batch with
//   Levenberg-Marquardt, correction tolerance 1e-3, at most 25 iterations;
// - drag regime (osculating perigee altitude below 2500 km, where
//   propagator/ffm applies drag): Cd*A/m (lower bound 0), a signed in-track
//   acceleration and Cr*A/m (lower bound 0); above: Cr*A/m (lower bound 0) and
//   ECOM2 Y0 and B0, with D2, D4, B1 and B3 (cos, sin) when the fitted span is
//   at least a day;
// - every force: EGM2008 70x70, Sun, Moon, Venus, Mars and Jupiter (DE440s),
//   cannonball SRP, Knocke Earth radiation, NRLMSISE-00 drag (drag regime),
//   IERS 2010 solid tides, FES2004 ocean tides 30x30, IERS 2010 relativity;
//   RK78 at relative tolerance 1e-13, at most three steps per shortest
//   wavelength of the field at perigee (300 s at most); propagator/ffm
//   restarts the integration where NRLMSISE-00's daily and 3-hourly inputs
//   change and reads them inside each span (wasm 1b1df5e3 and later: earlier
//   builds mix two days' inputs within a step, about 1 cm a day in LEO);
// - the exact residuals of the fitted orbit at EVERY point of the segment
//   (model - ephemeris, in each point's RTN axes): 3D, R, T, N RMS and max,
//   the per-coordinate RMS (3D/sqrt 3, CelesTrak's rms.txt convention), N and
//   span; with a reference element set, SGP4 scored on the same points (the
//   frame-error gate);
// - the half-split closure (owner, 2026-10-10: "start with the first half of
//   any data and reproduce the second half within 1 cm", with every
//   perturbation, without maneuvers): the same fit on the points at or before
//   the segment's mid-time, propagated to every later point; the same
//   statistics there, with the split epoch;
// - residual jumps: the second difference of the residuals (an acceleration
//   mismatch) beyond 10 robust scales (1.4826 MAD) and 1e-6 m/s^2 marks a
//   maneuver; the segment is split around it and both parts are refitted.
//
//   const env = await ephemerisFitEnv({ modulesDir, eopFinals, gfzKp, swpcRsga, kernelPath });
//   const { segments } = await fitEphemeris(env, input);
//   const { ocm, stats, closure, trajectory } = segments[0];
//   const later = await trajectory(['2026-10-12T00:00:00Z']);
//   await env.destroy();
//
// The orbit computation is the modules': propagator/ffm (SDS 1.243.0 PRW),
// analysis/estimation, foundation/frames (EME2000/J2000 to GCRF, RTN axes,
// element sets), foundation/time (TT to UTC) and analysis/gp-error-model
// (SGP4 residuals). This file frames requests, rotates differences by the
// modules' RTN axes and computes statistics.
import fs from 'node:fs';
import path from 'node:path';
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import * as O from 'spacedatastandards.org/lib/js/OCM/main.js';
import { json, loadModule, sha256, gitState } from '../../../harness/modules.mjs';
import { kernelFrame } from '../../../harness/prw.mjs';
import { eopFrame } from '../../../harness/eop.mjs';
import { readRsga, releasedEopRecords, releasedSpwRows } from '../../../harness/cutoff-environment.mjs';
import { ECOM2_TERMS, decodeSamples, executionFrame, readGfzKp, spaceWeatherFrame } from './full-force.mjs';
import { convertRepresentation, rtnAxes, toGcrf } from './frames.mjs';
import { convertIso } from '../../../harness/time.mjs';
import { ommFrame, OEM_TYPE } from '../../../harness/records.mjs';
import { EST_TYPE, decodeResult, estimationCodec, positionObservation, seedStruct } from '../../e5-density-calibration/estimation-wire.mjs';

const DAY_MS = 86400000;
const R_EARTH_M = 6378137;
const MU = 3.986004418e14;
const mjdOf = (ms) => Math.floor(ms / DAY_MS) + 40587;
// Epochs are ms since 1970 as floats that keep microseconds (operator files
// such as BACC's state epochs like 21:59:59.999999); text carries six digits.
const isoMs = (text) => {
  const m = /^(.*T\d\d:\d\d:\d\d)(?:\.(\d+))?[zZ]?$/.exec(text);
  return m ? Date.parse(`${m[1]}Z`) + (m[2] ? Number(`0.${m[2]}`) * 1000 : 0) : Date.parse(/[zZ]$/.test(text) ? text : `${text}Z`);
};
const iso = (ms) => {
  let s = Math.floor(ms / 1000), us = Math.round((ms - s * 1000) * 1000);
  if (us >= 1e6) { s += 1; us -= 1e6; }
  return `${new Date(s * 1000).toISOString().slice(0, 19)}.${String(us).padStart(6, '0')}Z`;
};
const noZ = (text) => text.replace(/Z$/, '');

export const VERSION = 'ephemeris-fit 2 (2026-10-10: OD-lane algorithm, half-split closure, residual-jump segments)';
export const SETTINGS = {
  forces: { degree: 70, order: 70, thirdBodies: [10, 301, 2, 4, 5], srp: true, atmosphere: 'NRLMSISE00', solidTides: true,
    oceanTidesDegree: 30, earthRadiation: true, earthRadiationResolutionDeg: 15, relativity: 'IERS_2010' },
  dragCeilingAltitudeM: 2500e3,
  integrator: { tolerance: 1e-13, maxStep: 300 },
  fit: { inTrack: true, maximumIterations: 25, correctionTolerance: 1e-3, sigmaM: 1, maxFitPoints: 720, ecom2FullSpanSeconds: 86400 },
  segments: { gapSteps: 3, minimumPoints: 12, eventGuardSeconds: 1800, maximumSplits: 8 },
  jumps: { k: 10, floorMps2: 1e-6 },
  apriori: { cdAreaOverMass: 0.01, crAreaOverMass: 0.02 },
};
export const CRITERION = "sqrt(dx' N dx / (6 + p)) below the correction tolerance (analysis/estimation 0.3.0 fit_batch, Levenberg-Marquardt)";
const UNBOUNDED = 1e300;
const FFM_MAX_SAMPLES = 10000;
const merge = (base, over = {}) => Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? { ...v, ...(over[k] ?? {}) } : (over[k] ?? v)]));

// ── analysis/estimation v2 result fields E2's decoder does not read ──
const slot = (bb, t, s) => bb.__offset(t, 4 + 2 * s);
function decodeFitV2(bytes) {
  const bb = new flatbuffers.ByteBuffer(new Uint8Array(bytes));
  const root = bb.readInt32(bb.position()) + bb.position();
  const result = bb.__indirect(root + slot(bb, root, 1));
  const eo = slot(bb, result, 8), fo = slot(bb, result, 12);
  const out = { error: eo ? bb.__string(result + eo) : null, boundStatus: [], covarianceRtn: [] };
  if (!fo) return out;
  const t = bb.__indirect(result + fo);
  const vec = (s, read, width) => { const o = slot(bb, t, s); if (!o) return []; const a = bb.__vector(t + o), n = bb.__vector_len(t + o); return Array.from({ length: n }, (_, i) => read(a + width * i)); };
  out.boundStatus = vec(16, (at) => bb.readUint8(at), 1);
  out.covarianceRtn = vec(17, (at) => bb.readFloat64(at), 8);
  return out;
}
const estEpoch = (text) => {
  const ms = isoMs(text.slice(0, 19)), day = Math.floor(ms / DAY_MS), frac = /\.(\d+)/.exec(text)?.[1] ?? '0';
  return { jd_day: day + 2440587.5, seconds: (ms - day * DAY_MS) / 1000 + Number(`0.${frac}`) };
};

// ── environment ──
async function finalsRecords(parser, file) {
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

// Modules and environment inputs, loaded once. Earth orientation and space
// weather are framed as released at each fit's issue time (E7's rule):
// finals2000A rows to the day before, the last held; GFZ Kp/ap/F10.7 before
// the newest NOAA SWPC RSGA's day, that report and its 3-day forecast, then held.
export async function ephemerisFitEnv({ modulesDir, eopFinals, gfzKp, swpcRsga, kernelPath, kernelSha256, rsgaCacheDir, eopLatencyDays = 1 }) {
  const names = ['propagator/ffm', 'analysis/estimation', 'foundation/frames', 'foundation/time', 'data-source/eop-parser', 'analysis/gp-error-model'];
  const modules = {};
  for (const name of names) modules[name] = await loadModule(modulesDir, name);
  const kernelBytes = fs.readFileSync(kernelPath);
  const kernelHash = sha256(kernelBytes);
  if (kernelSha256 && kernelHash !== kernelSha256) throw new Error(`${kernelPath}: SHA-256 differs from the pinned kernel`);
  const kernel = kernelFrame(kernelBytes);
  const eop = await finalsRecords(modules['data-source/eop-parser'], eopFinals);
  const gfz = readGfzKp(gfzKp);
  const rsga = readRsga([swpcRsga].flat(), rsgaCacheDir ?? path.join(path.dirname(kernelPath), 'rsga'));
  const codec = await estimationCodec(modulesDir, path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'node_modules/space-data-module-sdk/schemas/orbpro'));
  const provenance = {
    fitter: VERSION,
    modules: Object.values(modules).map((m) => m.provenance),
    modulesRepository: gitState(modulesDir),
    inputs: { kernel: { file: path.basename(kernelPath), sha256: kernelHash }, eopFinals: { file: path.basename(eopFinals), sha256: eop.sha256 }, gfzKp: { file: path.basename(gfzKp), sha256: gfz.sha256 }, swpcRsga: rsga.files },
  };
  return {
    modules, codec, provenance,
    // The environment frames of a request over [fromMs, toMs] as released at issueMs.
    inputsFor(issueMs, fromMs, toMs, forces) {
      const from = mjdOf(fromMs) - 2, to = mjdOf(toMs) + 2;
      return [kernel, eopFrame(releasedEopRecords(eop.records, issueMs, eopLatencyDays, from, to), from, to),
        ...(forces.drag ? [spaceWeatherFrame(releasedSpwRows(gfz, rsga, issueMs, fromMs - 2 * DAY_MS, toMs + 2 * DAY_MS).rows)] : [])];
    },
    async destroy() { for (const m of Object.values(modules)) await m.destroy(); },
  };
}

// ── input states to GCRF on UTC (m, m/s) ──
export async function normalize(env, input) {
  const frames = env.modules['foundation/frames'], time = env.modules['foundation/time'];
  const out = [];
  for (const s of input.states) {
    let epoch = s.epoch;
    if ((input.timeScale ?? 'UTC') !== 'UTC') epoch = `${noZ(await convertIso(time, noZ(s.epoch), input.timeScale, 'UTC'))}Z`;
    const ms = isoMs(iso(isoMs(epoch)));  // canonical: microseconds
    const state = [...s.position, ...(s.velocity ?? [0, 0, 0])];
    let gcrf = state;
    if (input.frame === 'EME2000' || input.frame === 'J2000') gcrf = await toGcrf(frames, 'MEAN_EQUATOR_EQUINOX_J2000', iso(ms), state);
    else if (input.frame !== 'GCRF') throw new Error(`frame ${input.frame}: convert to GCRF first (EME2000, J2000 and GCRF are read here)`);
    out.push({ ms, state: gcrf, hasVelocity: !!s.velocity });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

// Contiguous runs of points: a gap over gapSteps median steps ends one, and
// so does each split [{fromMs, toMs}] (points inside a split belong to none).
function contiguous(points, splits, gapSteps) {
  const steps = points.slice(1).map((p, i) => p.ms - points[i].ms).sort((a, b) => a - b);
  const median = steps.length ? steps[steps.length >> 1] : 0;
  const runs = [];
  let run = [];
  const inside = (ms) => splits.some((s) => ms >= s.fromMs && ms <= s.toMs);
  for (const p of points) {
    const cut = run.length && (p.ms - run.at(-1).ms > gapSteps * median || splits.some((s) => s.fromMs > run.at(-1).ms && s.fromMs <= p.ms));
    if (cut) { runs.push(run); run = []; }
    if (!inside(p.ms)) run.push(p);
    else if (run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  return runs;
}
// At most `count` evenly spaced points by index, the first and last kept.
function thin(points, count) {
  if (points.length <= count) return points;
  return Array.from({ length: count }, (_, k) => points[Math.round(k * (points.length - 1) / (count - 1))]);
}

// ── the fit ──
// The regime and the integrator of a segment, from the osculating
// perigee and apogee radii of its first point (foundation/frames). The step
// is at most three per shortest wavelength of the degree-n field at perigee,
// 2 pi (r_p / v_p) / (3 n), and the configured maximum (the OD lane's rule:
// a longer step aliases the field and RK78's error estimate does not see it).
export async function segmentSetup(env, point, S = SETTINGS) {
  const [rp, ra] = await convertRepresentation(env.modules['foundation/frames'], iso(point.ms), 'CARTESIAN', point.state, 'MODIFIED_KEPLERIAN');
  const perigeeAltitudeM = rp - R_EARTH_M;
  const vp = Math.sqrt(MU * (2 / rp - 2 / (rp + ra)));
  const maxStep = Math.min(S.integrator.maxStep, 2 * Math.PI * (rp / vp) / (3 * S.forces.degree));
  return { regime: perigeeAltitudeM < S.dragCeilingAltitudeM ? 'LEO' : 'HIGH', perigeeAltitudeM, integrator: { ...S.integrator, maxStep } };
}
export function forcesFor(regime, S = SETTINGS) {
  return { ...S.forces, drag: regime === 'LEO' };
}
// The solved-for parameters of a fit over spanSeconds: [{kind, value, lower}].
// Above the drag regime ECOM2 D0 is not solved for: it acts along the Sun
// direction under the same shadow function as the cannonball's Cr*A/m, so
// the two are collinear (the OD lane's set, 2026-10-10).
export function parameterSet(regime, spanSeconds, apriori, S = SETTINGS) {
  // starlink-forecast patch: S.fit.lockSrp leaves Cr*A/m out of the solved-for list, so it stays at apriori.crAreaOverMass
  // (fitRun's `fixed.agom`) in the fit and in every later propagation of the product.
  // S.fit.lockDrag likewise keeps Cd*A/m at apriori.cdAreaOverMass (a nominal value, not fitted).
  if (regime === 'LEO') return [...(S.fit.lockDrag ? [] : [{ kind: 'DRAG_AREA_OVER_MASS', value: apriori.cdAreaOverMass, lower: 0, upper: 1.0 }]), ...(S.fit.inTrack === false ? [] : [{ kind: 'IN_TRACK_ACCELERATION', value: 0 }]), ...(S.fit.lockSrp ? [] : [{ kind: 'SRP_AREA_OVER_MASS', value: apriori.crAreaOverMass, lower: 0, upper: 1.0 }])];
  const terms = spanSeconds >= S.fit.ecom2FullSpanSeconds ? ECOM2_TERMS.filter((t) => t !== 'D0') : ['Y0', 'B0'];
  return [{ kind: 'SRP_AREA_OVER_MASS', value: apriori.crAreaOverMass, lower: 0 }, ...terms.map((t) => ({ kind: `ECOM2_${t}`, value: 0 }))];
}
export function withParameters(fixed, parameters, values) {
  const out = { ...fixed, ...(fixed.ecom2 ? { ecom2: { ...fixed.ecom2 } } : {}) };
  parameters.forEach((p, i) => {
    if (p.kind === 'DRAG_AREA_OVER_MASS') out.b = values[i];
    else if (p.kind === 'SRP_AREA_OVER_MASS') out.agom = values[i];
    else if (p.kind === 'IN_TRACK_ACCELERATION') out.inTrack = values[i];
    else if (p.kind.startsWith('ECOM2_')) out.ecom2 = { ...(out.ecom2 ?? {}), [p.kind.slice(6)]: values[i] };
    else throw new Error(`unknown parameter ${p.kind}`);
  });
  return out;
}

// The batch fit of one run of points (GCRF, UTC): {product, fit}.
export async function fitRun(env, points, ctx) {
  const { S, regime, forces, issuedMs } = ctx;
  const spanSeconds = (points.at(-1).ms - points[0].ms) / 1000;
  const kinds = parameterSet(regime, spanSeconds, ctx.apriori, S);
  const parameters = kinds.map(({ kind, value }) => ({ kind, value }));
  const fixed = regime === 'LEO' ? { b: ctx.apriori.cdAreaOverMass, agom: ctx.apriori.crAreaOverMass, inTrack: 0 } : { b: 0, agom: ctx.apriori.crAreaOverMass, ecom2: {} };
  const reference = { epoch: noZ(iso(points[0].ms)), state: points[0].state };
  const fitPoints = thin(points, S.fit.maxFitPoints);
  const observations = fitPoints.map((p) => ({ epoch: noZ(iso(p.ms)), values: p.state.slice(0, 3) }));
  const inputs = env.inputsFor(issuedMs, points[0].ms, points.at(-1).ms, forces);
  const isoByLabel = new Map(observations.map((o) => [JSON.stringify(estEpoch(o.epoch)), o.epoch]));
  const sg = S.fit.sigmaM ** 2;
  const request = {
    config: {
      initial_epoch: estEpoch(reference.epoch), initial_state: reference.state, initial_covariance: Array(36).fill(0),
      process_noise_spectral_density: Array(6).fill(0), state_convergence_tolerance: 0, rms_convergence_tolerance: 0, sigma_edit_threshold: 0,
      dynamic_model_correlation_time_seconds: 0, maximum_iterations: 0, reference_frame: 'ICRF', estimator: 'BATCH_WEIGHTED_LEAST_SQUARES', process_noise: 'NONE', flags: 0,
    },
    extended_observations: observations.map((o) => ({ observation: positionObservation(estEpoch(o.epoch), [0, 0, 0]), values: o.values, sigmas: [1, 1, 1] })),
    propagator_port_id: 'propagator/ffm', propagator_capability: 'plugin_propagate plugin_compute_stm',
    batch_options: {
      parameter_kinds: parameters.map((p) => P.prwDynamicParameter[p.kind]), parameter_values: parameters.map((p) => p.value),
      observation_covariances: observations.flatMap(() => [sg, 0, 0, 0, sg, 0, 0, 0, sg]), covariance_axes: 0,
      maximum_iterations: S.fit.maximumIterations, correction_tolerance: S.fit.correctionTolerance, sigma_edit_threshold: 0,
      parameter_lower_bounds: kinds.map((k) => k.lower ?? -UNBOUNDED), parameter_upper_bounds: kinds.map((k) => k.upper ?? UNBOUNDED),
      levenberg_marquardt: true, rtn_covariance: true,
    },
  };
  const answers = [];
  let ffmCalls = 0, result = null, bytes = null;
  for (let round = 0; ; ++round) {
    const response = await env.modules['analysis/estimation'].invoke('fit_batch', [{ portId: 'request', typeRef: EST_TYPE, payload: env.codec.encode({ request, propagation_answers: answers }) }]);
    bytes = response.outputs.find((o) => o.portId === 'result').payload;
    result = decodeResult(bytes);
    if (result.status !== 1) break;
    const q0 = result.queries[0];
    const samples = decodeSamples(await env.modules['propagator/ffm'].invoke('invoke', [
      executionFrame({ epoch: reference.epoch, state: q0.seed.state, samples: result.queries.map((q) => isoByLabel.get(JSON.stringify(q.target_epoch))),
        forces, coefficients: withParameters(fixed, parameters, q0.parameter_values), parameters, stm: true, integrator: ctx.integrator }),
      ...inputs,
    ]));
    ++ffmCalls;
    result.queries.forEach((q, k) => {
      const s = samples[k], n = s.n, stm = [], sensitivity = [];
      for (let i = 0; i < 6; ++i) {
        for (let j = 0; j < 6; ++j) stm.push(s.stm[i * n + j]);
        for (let j = 6; j < n; ++j) sensitivity.push(s.stm[i * n + j]);
      }
      answers.push({ query: { sequence: q.sequence, seed: seedStruct(q), target_epoch: q.target_epoch, parameter_values: q.parameter_values }, sample: { epoch: q.target_epoch, state: s.state, stm }, sensitivity });
    });
    if (round > 4 * S.fit.maximumIterations + 10) throw new Error('fit_batch kept asking for propagation');
  }
  const v2 = decodeFitV2(bytes);
  const f = result.fit;
  if (!f?.estimate?.length) throw new Error(`fit_batch returned no estimate (status ${result.status}${v2.error ? `: ${v2.error}` : ''})`);
  const n = 6 + parameters.length;
  const values = f.estimate.slice(6);
  const scale = Math.max(1, f.reducedChiSquare ?? 1);
  const fit = { status: result.status, ffmCalls, iterations: f.iterations, converged: !!f.converged, reducedChiSquare: f.reducedChiSquare, weightedRms: f.weightedRms,
    measurements: f.measurementCount, fitPoints: fitPoints.length, boundStatus: v2.boundStatus, covarianceRtn: v2.covarianceRtn,
    parameters: parameters.map((p, i) => ({ kind: p.kind, value: values[i], boundStatus: v2.boundStatus[i] ?? 0 })) };
  const product = { epoch: reference.epoch, state: f.estimate.slice(0, 6), values, parameters, n, regime,
    covariance: f.covariance.map((v) => v * scale), covarianceScale: scale, fixed: withParameters(fixed, parameters, values) };
  return { product, fit };
}

// Propagate a product {epoch (ISO UTC, no Z), state, fixed (coefficients), parameters} to epochs (ms,
// ascending, none before the epoch) under ctx {forces, integrator, issuedMs}: [{state, covariance, n}].
export async function propagate(env, product, epochsMs, ctx, { covariance = null } = {}) {
  const self = isoMs(product.epoch);
  const later = epochsMs.filter((ms) => ms !== self);
  const out = new Map();
  if (later.some((ms) => ms < self)) throw new Error('propagate: epochs before the product epoch');
  if (later.length) {
    // propagator/ffm takes at most 10000 epochs a request; it restarts the
    // integration at every epoch, so a request continued from the last
    // state of the previous one is the same integration (state only).
    const epochs = later;
    if (covariance && epochs.length > FFM_MAX_SAMPLES) throw new Error(`propagate: ${epochs.length} epochs with a covariance (at most ${FFM_MAX_SAMPLES})`);
    let start = { epoch: product.epoch, state: product.state };
    for (let at = 0; at < epochs.length; at += FFM_MAX_SAMPLES) {
      const chunk = epochs.slice(at, at + FFM_MAX_SAMPLES);
      const samples = decodeSamples(await env.modules['propagator/ffm'].invoke('invoke', [
        executionFrame({ epoch: start.epoch, state: start.state, samples: chunk.map((ms) => noZ(iso(ms))), forces: ctx.forces, coefficients: product.fixed,
          parameters: covariance ? product.parameters : [], covariance, integrator: ctx.integrator }),
        ...env.inputsFor(ctx.issuedMs, isoMs(start.epoch), chunk.at(-1), ctx.forces),
      ]));
      if (samples.length !== chunk.length) throw new Error(`propagator/ffm returned ${samples.length} samples for ${chunk.length} epochs`);
      chunk.forEach((ms, i) => out.set(ms, samples[i]));
      start = { epoch: noZ(iso(chunk.at(-1))), state: samples.at(-1).state };
    }
  }
  if (epochsMs.includes(self)) out.set(self, { state: product.state, covariance, n: 6 + (covariance ? product.parameters.length : 0) });
  return epochsMs.map((ms) => out.get(ms));
}

// Residuals of model states against the points, in each point's RTN axes
// (its own velocity, else the model's): rows [R, T, N] m, sign model - ephemeris.
export async function residualRows(env, points, model) {
  const frames = env.modules['foundation/frames'];
  const rows = [];
  for (let i = 0; i < points.length; ++i) {
    const p = points[i], m = model[i];
    const R = await rtnAxes(frames, iso(p.ms), p.hasVelocity ? p.state : [...p.state.slice(0, 3), ...m.slice(3, 6)]);
    const d = [0, 1, 2].map((k) => m[k] - p.state[k]);
    rows.push([0, 3, 6].map((r) => R[r] * d[0] + R[r + 1] * d[1] + R[r + 2] * d[2]));
  }
  return rows;
}
// Statistics of residual rows (m; the km fields are the OD lane's names).
export function statsOf(rows, points) {
  const n = rows.length;
  const rms = (k) => Math.sqrt(rows.reduce((a, r) => a + r[k] ** 2, 0) / n);
  const d3 = rows.map((r) => Math.hypot(r[0], r[1], r[2]));
  const rms3d = Math.sqrt(d3.reduce((a, x) => a + x * x, 0) / n);
  const max = (k) => Math.max(...rows.map((r) => Math.abs(r[k])));
  const spanSeconds = (points.at(-1).ms - points[0].ms) / 1000;
  const s = { n, span: [iso(points[0].ms), iso(points.at(-1).ms)], spanSeconds, rms3d, rmsPerCoordinate: rms3d / Math.sqrt(3), rmsR: rms(0), rmsT: rms(1), rmsN: rms(2),
    max3d: Math.max(...d3), maxR: max(0), maxT: max(1), maxN: max(2) };
  return { ...s, rms3dKm: rms3d / 1000, rmsPerCoordinateKm: s.rmsPerCoordinate / 1000, rmsRKm: s.rmsR / 1000, rmsTKm: s.rmsT / 1000, rmsNKm: s.rmsN / 1000, maxKm: s.max3d / 1000 };
}

// Residual jumps: the second difference of each RTN residual component over
// the sample times (an acceleration mismatch, m/s^2) beyond k robust scales
// (1.4826 MAD about the median) and the floor. Returns runs of flagged
// samples [{fromMs, toMs, peakMps2, component, samples}]: the points from the
// first flagged to the last are inside the run.
export function residualJumps(rows, points, { k, floorMps2 }) {
  const n = rows.length;
  if (n < 7) return [];
  const acc = [];
  for (let i = 1; i < n - 1; ++i) {
    const d0 = (points[i].ms - points[i - 1].ms) / 1000, d1 = (points[i + 1].ms - points[i].ms) / 1000;
    acc.push([0, 1, 2].map((c) => ((rows[i + 1][c] - rows[i][c]) / d1 - (rows[i][c] - rows[i - 1][c]) / d0) / ((d0 + d1) / 2)));
  }
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const flags = acc.map(() => null);
  for (let c = 0; c < 3; ++c) {
    const col = acc.map((a) => a[c]);
    const m = median(col), scale = 1.4826 * median(col.map((x) => Math.abs(x - m)));
    const limit = Math.max(k * scale, floorMps2);
    col.forEach((x, i) => { const e = Math.abs(x - m); if (e > limit && (!flags[i] || e > flags[i].peak)) flags[i] = { peak: e, component: 'RTN'[c] }; });
  }
  const runs = [];
  for (let i = 0; i < flags.length; ++i) {
    if (!flags[i]) continue;
    const last = runs.at(-1);
    // acc[i] is at point i + 1 and reads points i .. i + 2.
    if (last && i - last.lastIndex <= 2) { last.lastIndex = i; if (flags[i].peak > last.peakMps2) Object.assign(last, { peakMps2: flags[i].peak, component: flags[i].component }); }
    else runs.push({ firstIndex: i, lastIndex: i, peakMps2: flags[i].peak, component: flags[i].component });
  }
  return runs.map((r) => ({ fromMs: points[r.firstIndex + 1].ms, toMs: points[r.lastIndex + 1].ms, peakMps2: r.peakMps2, component: r.component, samples: r.lastIndex - r.firstIndex + 1 }));
}

// SGP4 from a reference element set at every point (analysis/gp-error-model
// accumulate, one narrow age bin per point): statistics in each point's RTN axes.
async function referenceStats(env, points, reference, norad) {
  if (points.some((p) => !p.hasVelocity)) return null;
  const t0 = isoMs(reference.epoch);
  const half = 1 / 86400;
  const { OEM, OEMT, ephemerisDataBlockT, ephemerisDataLineT, CATT, RFMT, RFMUnion, CelestialFrameWrapperT, CelestialFrame, timingStandard } = await import('spacedatastandards.org/lib/js/OEM/main.js');
  const lines = points.map((p) => new ephemerisDataLineT(noZ(iso(p.ms)), ...p.state.slice(0, 3).map((v) => v / 1000), ...p.state.slice(3, 6).map((v) => v / 1000)));
  const block = Object.assign(new ephemerisDataBlockT(), {
    OBJECT: Object.assign(new CATT(), { NORAD_CAT_ID: norad, OBJECT_ID: String(norad) }), CENTER_NAME: 'EARTH',
    REFERENCE_FRAME: Object.assign(new RFMT(), { REFERENCE_FRAME_type: RFMUnion.CelestialFrameWrapper, REFERENCE_FRAME: Object.assign(new CelestialFrameWrapperT(), { frame: CelestialFrame.GCRF }), NAME: 'GCRF' }),
    TIME_SYSTEM: timingStandard.UTC, START_TIME: lines[0].EPOCH, STOP_TIME: lines.at(-1).EPOCH, STATE_VECTOR_SIZE: 6, EPHEMERIS_DATA_LINES: lines,
  });
  const b = new flatbuffers.Builder(1 << 16);
  OEM.finishSizePrefixedOEMBuffer(b, Object.assign(new OEMT(), { CCSDS_OEM_VERS: 3, ORIGINATOR: 'ephemeris-fit', EPHEMERIS_DATA_BLOCK: [block] }).pack(b));
  const ages = points.map((p) => (p.ms - t0) / DAY_MS);
  if (ages.some((a) => a < 0)) return null;
  const acc = await env.modules['analysis/gp-error-model'].invokeJson('accumulate', [ommFrame([{ ...reference, norad }]),
    { portId: 'reference', typeRef: OEM_TYPE, payload: Buffer.from(b.asUint8Array()) },
    json('options', { ageBinsDays: ages.map((a) => [Math.max(0, a - half), a + half]), referenceStepSeconds: 0 })], 'accumulator');
  const rows = points.map(() => null);
  for (const s of acc.strata) if (s.n === 1) rows[s.age] = s.sum.slice(0, 3).map((v) => v * 1000);
  const kept = rows.map((r, i) => (r ? i : -1)).filter((i) => i >= 0);
  if (!kept.length) return null;
  return statsOf(kept.map((i) => rows[i]), kept.map((i) => points[i]));
}

// The half-split closure of a run: the fit on the points at or before the
// mid-time, propagated to every point; the statistics after the split (the
// closure) and before it (that fit's own exact residuals).
export async function halfSplitClosure(env, points, ctx) {
  const splitMs = points[0].ms + (points.at(-1).ms - points[0].ms) / 2;
  const first = points.filter((p) => p.ms <= splitMs), second = points.filter((p) => p.ms > splitMs);
  if (first.length < ctx.S.segments.minimumPoints || !second.length) return { splitEpoch: iso(splitMs), skipped: `${first.length} points before the split, ${second.length} after` };
  const { product, fit } = await fitRun(env, first, ctx);
  const model = (await propagate(env, product, points.map((p) => p.ms), ctx)).map((x) => x.state);
  const rows = await residualRows(env, points, model);
  const k = first.length;
  return {
    splitEpoch: iso(splitMs), ...statsOf(rows.slice(k), second),
    firstHalf: statsOf(rows.slice(0, k), first),
    fit: { iterations: fit.iterations, converged: fit.converged, ffmCalls: fit.ffmCalls, fitPoints: fit.fitPoints, reducedChiSquare: fit.reducedChiSquare, parameters: fit.parameters },
    rows: ctx.keepRows ? rows.slice(k) : undefined,
  };
}

// ── the OCM ──
function buildOcm(input, segment, env) {
  const { product, stats, fit, closure, d3, points, issuedMs, forces, referenceSgp4, index } = segment;
  const s = product.state, n = product.n, C = product.covariance;
  const lower = [];
  for (let i = 0; i < 6; ++i) for (let j = 0; j <= i; ++j) lower.push(C[i * n + j] / 1e6);
  const udp = (name, value) => Object.assign(new O.UserDefinedParametersT(), { PARAM_NAME: name, PARAM_VALUE: typeof value === 'string' ? value : JSON.stringify(value) });
  const frame = () => Object.assign(new O.RFMT(), { REFERENCE_FRAME_type: O.RFMUnion.CelestialFrameWrapper, REFERENCE_FRAME: Object.assign(new O.CelestialFrameWrapperT(), { frame: O.CelestialFrame.GCRF }), NAME: 'GCRF' });
  const id = `${input.source?.provider ?? 'operator'}-${input.object.norad}-${(input.source?.sha256 ?? '').slice(0, 16)}-${index}`;
  const epochZ = `${product.epoch}Z`;
  const ocm = Object.assign(new O.OCMT(), {
    HEADER: Object.assign(new O.HeaderT(), { CCSDS_OCM_VERS: '3.0', CREATION_DATE: iso(Date.now()), ORIGINATOR: 'SDN', MESSAGE_ID: id,
      COMMENT: [`Full-force FFM fitted to segment ${index} of the ${input.source?.provider ?? 'operator'} ephemeris ${input.source?.url ?? ''} (SHA-256 ${input.source?.sha256 ?? 'n/a'}), issued ${iso(issuedMs)}; ${VERSION}.`] }),
    METADATA: Object.assign(new O.MetadataT(), { OBJECT_NAME: input.object.name ?? '', OBJECT_DESIGNATOR: String(input.object.norad), CATALOG_NAME: 'SATCAT', TIME_SYSTEM: 'UTC',
      START_TIME: stats.span[0], STOP_TIME: stats.span[1], TIME_SPAN: stats.spanSeconds / 86400, EOP_SOURCE: 'IERS finals2000A, released at the issue time', CELESTIAL_SOURCE: 'JPL DE440s' }),
    TRAJ_TYPE: O.trajectoryType.CARTESIAN_PV, TRAJ_TYPE_DESCRIPTION: 'ESTIMATED', STATE_VECTOR_SIZE: 6,
    STATE_DATA: s.map((v) => v / 1000), STATE_EPOCHS: [epochZ], COVARIANCE_DATA: lower,
    CENTER_NAME: 'EARTH', TRAJ_REF_FRAME: frame(), COV_REF_FRAME: frame(),
    PERTURBATIONS: Object.assign(new O.PerturbationsT(), {
      GRAVITY_MODEL: 'EGM2008', GRAVITY_DEGREE: forces.degree, GRAVITY_ORDER: forces.order, GM: 398600.4418,
      N_BODY_PERTURBATIONS: ['SUN', 'MOON', 'VENUS', 'MARS', 'JUPITER'], OCEAN_TIDES_MODEL: `FES2004 ${forces.oceanTidesDegree}x${forces.oceanTidesDegree}`,
      SOLID_TIDES_MODEL: 'IERS 2010', SOLAR_RAD_PRESSURE: 'CANNONBALL', ALBEDO: `KNOCKE ${forces.earthRadiationResolutionDeg} DEG`, RELATIVITY: 'IERS 2010',
      ATMOSPHERIC_DRAG: forces.drag ? 'NRLMSISE-00 (GFZ Kp/ap/F10.7, NOAA SWPC RSGA; released at the issue time)' : 'NONE' }),
    ORBIT_DETERMINATION: Object.assign(new O.OrbitDeterminationT(), {
      OD_ID: id, OD_ALGORITHM: 'Batch least squares with Levenberg-Marquardt and parameter bounds', OD_METHOD: 'analysis/estimation 0.3.0 fit_batch, propagator/ffm full force', OD_EPOCH: epochZ,
      OD_OBSERVATIONS_TYPE: ['EPHEMERIS POSITION'], OD_OBSERVATIONS_USED: fit.fitPoints, OD_DATA_WEIGHTING: 'equal, 1 m per position component',
      OD_CONVERGENCE_CRITERIA: CRITERION, OD_EST_PARAMETERS: ['X', 'Y', 'Z', 'X_DOT', 'Y_DOT', 'Z_DOT', ...product.parameters.map((p) => p.kind)],
      OD_APRIORI_DATA: 'none', OD_ESTIMATOR: O.estimatorCategory.BatchLeastSquares,
      OD_RESIDUAL_RMS: stats.rms3dKm, OD_RESIDUALS_SERIES: d3.map((x) => x / 1000), OD_RESIDUAL_EPOCHS: points.map((p) => p.ms / 1000),
      WEIGHTED_RMS: fit.weightedRms ?? 0, OD_RESIDUALS: 'km, 3D, the fitted orbit minus the ephemeris at every point of the segment' }),
    USER_DEFINED_PARAMETERS: [
      udp('RESIDUALS', stats), udp('HALF_SPLIT_CLOSURE', { ...closure, rows: undefined }), udp('REFERENCE_SGP4_RESIDUALS', referenceSgp4 ?? 'none'),
      udp('ITERATIONS', String(fit.iterations)), udp('CONVERGED', String(fit.converged)), udp('REDUCED_CHI_SQUARE', String(fit.reducedChiSquare)), udp('COVARIANCE_SCALE', String(product.covarianceScale)),
      udp('PARAMETERS_SI', fit.parameters), udp('FIXED_COEFFICIENTS_SI', product.fixed), udp('COVARIANCE_FULL_SI', { dimension: n, values: C }),
      udp('COVARIANCE_RTN_SI', fit.covarianceRtn?.length ? { dimension: n, values: fit.covarianceRtn.map((v) => v * product.covarianceScale) } : 'none'),
      udp('SOURCE', input.source ?? {}), udp('ISSUED', iso(issuedMs)), udp('REGIME', product.regime), udp('INTEGRATOR', segment.integrator), udp('SEGMENT', { index, reason: segment.reason }),
      udp('FITTER', { harness: 'orbit-accuracy-experiments/harness/ephemeris-fit.mjs', ...env.provenance }),
    ],
  });
  const b = new flatbuffers.Builder(1 << 16);
  O.OCM.finishSizePrefixedOCMBuffer(b, ocm.pack(b));
  return { bytes: b.asUint8Array().slice(), json: ocm };
}

// input: {object: {norad, name}, source: {provider, url, sha256, issued (ISO)}, frame ('GCRF' | 'EME2000' | 'J2000'),
//   timeScale ('UTC' | 'TT'), states: [{epoch, position [m], velocity [m/s] | null}],
//   apriori: {cdAreaOverMass, crAreaOverMass} (starting values), spanSeconds (0: every point),
//   events: [{epoch, label}] (operator-listed maneuvers and configuration changes),
//   referenceElementSet: {epoch, elements} | null (SGP4 scored on the same points)}
// options: {settings (overrides of SETTINGS), closure (default true), jumps (default true), keepRows}
// Returns {segments: [{index, reason, regime, ocm, ocmJson, stats, closure, fit, product, referenceSgp4, trajectory}],
//   splits: [{from, to, reason, ...}], skipped: [{span, n, reason}], timing}.
export async function fitEphemeris(env, input, options = {}) {
  const started = performance.now();
  const S = merge(SETTINGS, options.settings);
  const apriori = { cdAreaOverMass: input.apriori?.cdAreaOverMass > 0 ? input.apriori.cdAreaOverMass : S.apriori.cdAreaOverMass,
    crAreaOverMass: input.apriori?.crAreaOverMass > 0 ? input.apriori.crAreaOverMass : S.apriori.crAreaOverMass };
  let all = await normalize(env, input);
  if (input.spanSeconds > 0) all = all.filter((p) => p.ms - all[0].ms <= input.spanSeconds * 1000);
  const splits = (input.events ?? []).map((e) => ({ fromMs: isoMs(e.epoch), toMs: isoMs(e.epoch) + S.segments.eventGuardSeconds * 1000, reason: 'operator event', label: e.label }));
  const segments = [], skipped = [];
  const queue = contiguous(all, splits, S.segments.gapSteps).map((run) => ({ run, reason: 'contiguous' }));
  let jumpSplits = 0;
  while (queue.length) {
    const { run, reason } = queue.shift();
    if (run.length < S.segments.minimumPoints || !run[0].hasVelocity) {
      skipped.push({ span: [iso(run[0].ms), iso(run.at(-1).ms)], n: run.length, reason: run.length < S.segments.minimumPoints ? 'too few points' : 'no velocity at the first point' });
      continue;
    }
    const { regime, perigeeAltitudeM, integrator } = await segmentSetup(env, run[0], S);
    const ctx = { S, regime, integrator, forces: forcesFor(regime, S), issuedMs: input.source?.issued ? isoMs(input.source.issued) : run[0].ms, apriori, keepRows: options.keepRows };
    const { product, fit } = await fitRun(env, run, ctx);
    const model = (await propagate(env, product, run.map((p) => p.ms), ctx)).map((x) => x.state);
    const rows = await residualRows(env, run, model);
    if (options.jumps !== false && jumpSplits < S.segments.maximumSplits) {
      const jumps = residualJumps(rows, run, S.jumps);
      if (jumps.length) {
        jumpSplits += jumps.length;
        const cut = jumps.map((j) => ({ fromMs: j.fromMs, toMs: j.toMs, reason: 'residual jump', peakMps2: j.peakMps2, component: j.component, samples: j.samples }));
        splits.push(...cut);
        for (const part of contiguous(run, cut, Infinity)) queue.push({ run: part, reason: 'split at a residual jump' });
        continue;
      }
    }
    const stats = statsOf(rows, run);
    const closure = options.closure === false ? null : await halfSplitClosure(env, run, ctx);
    const referenceSgp4 = input.referenceElementSet ? await referenceStats(env, run, input.referenceElementSet, input.object.norad) : null;
    const segment = { index: segments.length, reason, regime, perigeeAltitudeM, product, fit,
      stats: { ...stats, iterations: fit.iterations, converged: fit.converged, criterion: CRITERION, reducedChiSquare: fit.reducedChiSquare, regime, fitPoints: fit.fitPoints, parameters: fit.parameters },
      closure, referenceSgp4, d3: rows.map((r) => Math.hypot(...r)), points: run, issuedMs: ctx.issuedMs, forces: ctx.forces, integrator };
    const ocm = buildOcm(input, segment, env);
    segments.push({ index: segment.index, reason, regime, perigeeAltitudeM, ocm: ocm.bytes, ocmJson: ocm.json, stats: segment.stats, closure, referenceSgp4, fit, product,
      rows: options.keepRows ? rows : undefined, trajectory: (epochs) => trajectoryOf(env, product, epochs, ctx) });
  }
  segments.sort((a, b) => isoMs(a.stats.span[0]) - isoMs(b.stats.span[0]));
  segments.forEach((s, i) => { s.index = i; });
  return { segments, splits: splits.map(({ fromMs, toMs, ...rest }) => ({ from: iso(fromMs), to: iso(toMs), ...rest })), skipped, timing: { seconds: (performance.now() - started) / 1000, rssMB: process.memoryUsage().rss / 1e6 } };
}

async function trajectoryOf(env, product, epochs, ctx) {
  const ms = epochs.map(isoMs);
  const order = ms.map((_, i) => i).sort((a, b) => ms[a] - ms[b]);
  const samples = await propagate(env, product, order.map((i) => ms[i]), ctx, { covariance: product.covariance });
  const result = Array(ms.length);
  order.forEach((i, k) => {
    const s = samples[k];
    result[i] = { epoch: iso(ms[i]), state: s.state, covariance: s.covariance ? [0, 1, 2, 3, 4, 5].flatMap((a) => [0, 1, 2, 3, 4, 5].map((b) => s.covariance[a * s.n + b])) : null };
  });
  return result;
}

// An OCM's trajectory from its bytes (truth at a later file version): the
// fitted state, parameters and covariance it carries, with its force model.
export async function ocmTrajectory(env, ocmBytes, epochs, settings) {
  const S = merge(SETTINGS, settings);
  const o = O.OCM.getSizePrefixedRootAsOCM(new flatbuffers.ByteBuffer(new Uint8Array(ocmBytes))).unpack();
  const get = (name) => JSON.parse(o.USER_DEFINED_PARAMETERS.find((u) => u.PARAM_NAME === name)?.PARAM_VALUE ?? 'null');
  const params = get('PARAMETERS_SI'), cov = get('COVARIANCE_FULL_SI'), fixed = get('FIXED_COEFFICIENTS_SI'), regime = get('REGIME'), integrator = get('INTEGRATOR');
  const product = { epoch: noZ(o.STATE_EPOCHS[0]), state: Array.from(o.STATE_DATA, (v) => v * 1000), parameters: params.map((p) => ({ kind: p.kind })), fixed, covariance: cov.values, n: cov.dimension };
  return trajectoryOf(env, product, epochs, { S, integrator, forces: forcesFor(regime, S), issuedMs: isoMs(get('ISSUED')) });
}
