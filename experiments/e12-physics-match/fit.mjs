// One hypothesis against one maneuver-free segment (PLAN.md section 5):
// analysis/estimation fit_batch (answered by propagator/hpop under the
// hypothesis) fits the state at the first point and the hypothesis's
// solve-for parameters to the FIRST HALF of the segment's positions; the
// fitted orbit is then propagated to every point of the segment and scored:
// fit RMS on the first half, closure RMS and max on the second half (every
// point), the full-span RMS, and the Bayesian information criterion of the
// first-half fit. This file routes records and computes statistics; the
// orbit computation is the modules'.
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { EST_TYPE, decodeResult, positionObservation, seedStruct } from '../e2-catalog-covariance/estimation-wire.mjs';
import { estEpoch } from '../e2-catalog-covariance/product.mjs';
import { decodeSamples } from '../../harness/full-force.mjs';
import { executionFrame, parametersOf, withParameters } from './hypothesis.mjs';

const norm = (v) => Math.hypot(v[0], v[1], v[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// Evenly spaced subset of at most n items (first and last kept).
export function thin(items, n) {
  if (items.length <= n) return items;
  const out = [];
  for (let k = 0; k < n; ++k) out.push(items[Math.round((k * (items.length - 1)) / (n - 1))]);
  return out;
}

// Velocity at point i from its neighbours' positions (a five-point
// Lagrange derivative): only a starting guess for the estimator.
function velocityGuess(points, i) {
  const k = Math.min(Math.max(i, 2), points.length - 3);
  const t = points.slice(k - 2, k + 3).map((p) => p.ms / 1000), x = points.slice(k - 2, k + 3).map((p) => p.position);
  const ti = points[i].ms / 1000;
  const v = [0, 0, 0];
  for (let j = 0; j < 5; ++j) {
    let dj = 0;
    for (let m = 0; m < 5; ++m) {
      if (m === j) continue;
      let prod = 1 / (t[j] - t[m]);
      for (let l = 0; l < 5; ++l) if (l !== j && l !== m) prod *= (ti - t[l]) / (t[j] - t[l]);
      dj += prod;
    }
    for (let c = 0; c < 3; ++c) v[c] += dj * x[j][c];
  }
  return v;
}

// propagator/hpop under h from {epoch, state} with coefficients to the sample
// epochs (ISO UTC, after the epoch). Returns decoded samples.
export async function propagate(env, h, segment, start, coefficients, samples, { parameters = [], stm = false, integrator }) {
  const fromMs = Math.min(Date.parse(start.epoch), Date.parse(samples[0]));
  const toMs = Math.max(Date.parse(start.epoch), Date.parse(samples.at(-1)));
  const { frames, weather } = env.inputsFor(h, fromMs, toMs, segment.cutoffMs);
  const response = await env.hpop.invoke('invoke', [
    executionFrame({ h, epoch: start.epoch, state: start.state, samples, coefficients, parameters, stm, weather, integrator }), ...frames,
  ]);
  const out = decodeSamples(response);
  if (out.length !== samples.length) throw new Error(`propagator/hpop returned ${out.length} samples for ${samples.length}`);
  return out;
}

// The integrator of a segment: config.fit.integrator's tolerance, with the
// maximum step a fixed fraction of the orbital period (LEO 30 s) up to a cap.
export function integratorFor(settings, meanRadiusM) {
  const period = 2 * Math.PI * Math.sqrt(meanRadiusM ** 3 / 3.986004415e14);
  return { tolerance: settings.integrator.tolerance, maxStep: Math.min(settings.integrator.maxStepCap, Math.max(settings.integrator.maxStep, period / settings.integrator.stepsPerPeriod)) };
}

// fit_batch of the state at points[0] and h's parameters to points
// ([{epoch, ms, position}]). start: {state?, b?, agom?}. Returns
// {epoch, state, coefficients, parameters, fit, rounds}.
export async function fitPositions(env, h, segment, points, settings, start = {}) {
  const parameters = parametersOf(h, start);
  const epoch = points[0].epoch;
  const state0 = start.state ?? [...points[0].position, ...(points[0].velocity ?? velocityGuess(points, 0))];
  const isoByLabel = new Map(points.map((p) => [JSON.stringify(estEpoch(p.epoch.replace(/Z$/, ''))), p.epoch]));
  const request = {
    config: {
      initial_epoch: estEpoch(epoch.replace(/Z$/, '')), initial_state: state0, initial_covariance: Array(36).fill(0),
      process_noise_spectral_density: Array(6).fill(0), state_convergence_tolerance: 0, rms_convergence_tolerance: 0, sigma_edit_threshold: 0,
      dynamic_model_correlation_time_seconds: 0, maximum_iterations: 0, reference_frame: 'ICRF', estimator: 'BATCH_WEIGHTED_LEAST_SQUARES', process_noise: 'NONE', flags: 0,
    },
    extended_observations: points.slice(1).map((p) => ({
      observation: positionObservation(estEpoch(p.epoch.replace(/Z$/, '')), p.position),
      values: p.position, sigmas: [settings.sigmaM, settings.sigmaM, settings.sigmaM],
    })),
    propagator_port_id: 'propagator/hpop', propagator_capability: 'plugin_propagate plugin_compute_stm',
    batch_options: {
      parameter_kinds: parameters.map((p) => P.prwDynamicParameter[p.kind]),
      parameter_values: parameters.map((p) => p.value),
      // Every parameter here has a lower bound of 0 and no upper bound (an
      // absent vector is no bound; NaN has no JSON form for flatc).
      ...(parameters.length ? { parameter_lower_bounds: parameters.map((p) => p.lower) } : {}),
      levenberg_marquardt: true,
      maximum_iterations: settings.maximumIterations, correction_tolerance: settings.correctionTolerance, sigma_edit_threshold: 0,
    },
  };
  const answers = [];
  for (let round = 0; ; ++round) {
    const response = await env.estimation.invoke('fit_batch', [{ portId: 'request', typeRef: EST_TYPE, payload: env.codec.encode({ request, propagation_answers: answers }) }]);
    const out = decodeResult(response.outputs.find((o) => o.portId === 'result').payload);
    if (out.status !== 1) {
      if (!out.fit) throw new Error(`fit_batch status ${out.status} without a result`);
      const values = out.fit.estimate.slice(6, 6 + parameters.length);
      return { epoch, state: out.fit.estimate.slice(0, 6), coefficients: withParameters({ b: 0, agom: 0 }, parameters, values), parameters, fit: out.fit, rounds: round };
    }
    const q0 = out.queries[0];
    const coefficients = withParameters({ b: 0, agom: 0 }, parameters, q0.parameter_values);
    const samples = await propagate(env, h, segment, { epoch, state: q0.seed.state }, coefficients, out.queries.map((q) => isoByLabel.get(JSON.stringify(q.target_epoch))),
      { parameters, stm: true, integrator: segment.integrator ?? settings.integrator });
    out.queries.forEach((q, k) => {
      const s = samples[k], n = s.n, stm = [], sensitivity = [];
      for (let i = 0; i < 6; ++i) {
        for (let j = 0; j < 6; ++j) stm.push(s.stm[i * n + j]);
        for (let j = 6; j < n; ++j) sensitivity.push(s.stm[i * n + j]);
      }
      answers.push({ query: { sequence: q.sequence, seed: seedStruct(q), target_epoch: q.target_epoch, parameter_values: q.parameter_values }, sample: { epoch: q.target_epoch, state: s.state, stm }, sensitivity });
    });
    if (round > 3 * settings.maximumIterations) throw new Error('fit_batch kept asking for propagation');
  }
}

// Fit h to the first half of a converted segment and score the whole segment.
// points: [{epoch, ms, position}] in GCRF/UTC, time-ordered. Returns the
// scores and, with keepResiduals, the GCRF residual vectors and fitted states.
export async function scoreHypothesis(env, h, segment, points, settings, { start = {}, keepResiduals = false } = {}) {
  const midMs = (points[0].ms + points.at(-1).ms) / 2;
  const first = points.filter((p) => p.ms <= midMs), second = points.filter((p) => p.ms > midMs);
  const fitted = await fitPositions(env, h, segment, thin(first, settings.maxFitPoints), settings, start);
  const later = points.slice(1);
  const samples = await propagate(env, h, segment, { epoch: fitted.epoch, state: fitted.state }, fitted.coefficients, later.map((p) => p.epoch), { integrator: segment.integrator ?? settings.integrator });
  const residuals = [sub(fitted.state, points[0].position)].concat(samples.map((s, k) => sub(s.state, later[k].position)));
  const states = [fitted.state].concat(samples.map((s) => s.state));
  const d = residuals.map(norm);
  const rmsOf = (xs) => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length);
  const nFirst = first.length, dFirst = d.slice(0, nFirst), dSecond = d.slice(nFirst);
  // BIC of the first-half fit on its 3n scalar residuals with the noise
  // variance profiled out: 3n ln(RSS/3n) + k ln(3n), k = 6 + parameters.
  const n3 = 3 * nFirst, rss = dFirst.reduce((a, x) => a + x * x, 0);
  const k = 6 + fitted.parameters.length;
  return {
    converged: fitted.fit.converged, iterations: fitted.fit.iterations, rounds: fitted.rounds,
    parameters: Object.fromEntries(fitted.parameters.map((p, i) => [p.kind, fitted.fit.estimate[6 + i]])),
    boundStatus: fitted.fit.bound_status ?? null,
    fitRms: rmsOf(dFirst), closureRms: rmsOf(dSecond), closureMax: Math.max(...dSecond), fullRms: rmsOf(d),
    bic: n3 * Math.log(Math.max(rss, 1e-30) / n3) + k * Math.log(n3), k, nFirst, nSecond: second.length,
    start: { state: fitted.state, b: fitted.coefficients.b, agom: fitted.coefficients.agom },
    ...(keepResiduals ? { residuals, states } : {}),
  };
}
