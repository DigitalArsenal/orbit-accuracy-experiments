// E7's predictions, each computed by modules (PLAN.md section 4):
//
// - SGP4 from an element set, scored by analysis/gp-error-model `accumulate`
//   (SGP4, TEME -> GCRF, error in the truth state's RTN axes), with +-1 s age
//   bins around each target's truth epoch.
// - propagator/hpop with every force it carries, from an epoch state
//   (analysis/epoch-state: SGP4 at zero elapsed time, TEME -> GCRF), from a
//   batch fit to an arc of epoch states (analysis/estimation fit_batch,
//   answered by propagator/hpop), or from the truth state itself; the GCRF
//   difference to truth, and a propagated covariance, are rotated into the
//   truth state's RTN axes by foundation/frames' rotation.
//
// This file routes records between modules, applies the module's rotation
// to a difference vector and a covariance, and forms d^2 = e' P^-1 e. It
// computes no orbit.
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { json } from '../../harness/modules.mjs';
import { ommFrame } from '../../harness/records.mjs';
import { rtnAxes } from '../../harness/frames.mjs';
import { decodeSamples, executionFrame } from '../../harness/full-force.mjs';
import { conditioned, epochStates, estEpoch } from '../e2-catalog-covariance/product.mjs';
import { EST_TYPE, decodeResult, positionObservation, seedStruct } from '../e2-catalog-covariance/estimation-wire.mjs';
import { DAY_MS, config } from './common.mjs';

export { epochStates, conditioned };
const stripZ = (s) => s.replace(/Z$/, '');

// SGP4: per target, [R, T, N] in metres (null where no single-sample bin).
// One accumulate call per truth file, so a bin never holds a state twice.
export async function sgp4Errors(ctx, products, set, targets) {
  const half = config.binHalfWidthSeconds / 86400;
  const byFile = new Map();
  targets.forEach((t, k) => { if (!t.missing) { if (!byFile.has(t.file)) byFile.set(t.file, []); byFile.get(t.file).push(k); } });
  const out = targets.map(() => null);
  const counts = { calls: 0, multi: 0, missing: 0 };
  for (const [file, ks] of byFile) {
    const bins = ks.map((k) => { const age = (targets[k].ms - set.epochMs) / DAY_MS; return [Math.max(0, age - half), age + half]; });
    const entry = products.entries(set.norad).find((e) => e.file === file);
    const acc = await ctx['gp-error-model'].invokeJson('accumulate', [ommFrame([set]), products.frame(entry), json('options', { ageBinsDays: bins, referenceStepSeconds: 0 })], 'accumulator');
    ++counts.calls;
    const byAge = new Map();
    for (const s of acc.strata) { if (s.n === 1) byAge.set(s.age, s.sum); else if (s.n > 1) ++counts.multi; }
    ks.forEach((k, i) => { if (byAge.has(i)) out[k] = byAge.get(i).slice(0, 3).map((v) => v * 1000); else ++counts.missing; });
  }
  return { errors: out, counts };
}

// The RTN rotation of every target's truth state (module), cached per target.
export async function targetAxes(ctx, targets) {
  for (const t of targets) {
    if (t.missing || t.axes) continue;
    t.axes = await rtnAxes(ctx.frames, stripZ(t.epoch), [...t.r, ...t.v].map((x) => x * 1000));
  }
}
export function rtnError(t, position) {
  const d = [0, 1, 2].map((i) => position[i] - t.r[i] * 1000);
  return [0, 1, 2].map((row) => t.axes[3 * row] * d[0] + t.axes[3 * row + 1] * d[1] + t.axes[3 * row + 2] * d[2]);
}
// d^2 of an RTN error under a GCRF position covariance (m^2; the leading 3x3
// of an n x n matrix), both at a target.
export function mahalanobis(t, errorRtn, covariance, n) {
  const G = [0, 1, 2].map((i) => [0, 1, 2].map((j) => covariance[i * n + j]));
  const A = [0, 1, 2].map((r) => [0, 1, 2].map((c) => t.axes[3 * r + c]));
  const S = A.map((ar) => A.map((ac) => ar.reduce((s, x, i) => s + x * G[i].reduce((u, g, j) => u + g * ac[j], 0), 0)));
  const det = S[0][0] * (S[1][1] * S[2][2] - S[1][2] * S[2][1]) - S[0][1] * (S[1][0] * S[2][2] - S[1][2] * S[2][0]) + S[0][2] * (S[1][0] * S[2][1] - S[1][1] * S[2][0]);
  if (!(det > 0)) return null;
  const inv = [
    [S[1][1] * S[2][2] - S[1][2] * S[2][1], S[0][2] * S[2][1] - S[0][1] * S[2][2], S[0][1] * S[1][2] - S[0][2] * S[1][1]],
    [S[1][2] * S[2][0] - S[1][0] * S[2][2], S[0][0] * S[2][2] - S[0][2] * S[2][0], S[0][2] * S[1][0] - S[0][0] * S[1][2]],
    [S[1][0] * S[2][1] - S[1][1] * S[2][0], S[0][1] * S[2][0] - S[0][0] * S[2][1], S[0][0] * S[1][1] - S[0][1] * S[1][0]],
  ].map((row) => row.map((x) => x / det));
  return errorRtn.reduce((s, e, i) => s + e * inv[i].reduce((u, v, j) => u + v * errorRtn[j], 0), 0);
}

// HPOP from {epoch (ISO UTC), state [m, m/s]} at initialMs to every
// non-missing target. request: {forces, coefficients, parameters, covariance,
// drivers, cutoffMs}. Returns {errors: [[R, T, N] m | null], d2: [number |
// null] | null}. A target at the initial epoch takes the initial state.
export async function hpopErrors(ctx, initial, initialMs, targets, request) {
  const later = targets.filter((t) => !t.missing && t.ms > initialMs);
  const out = new Map();
  if (later.length) {
    const samples = decodeSamples(await ctx.hpop.invoke('invoke', [
      executionFrame({ epoch: initial.epoch, state: initial.state, samples: later.map((t) => stripZ(t.epoch)), forces: request.forces,
        coefficients: request.coefficients, parameters: request.covariance ? request.parameters : [], covariance: request.covariance ?? null, integrator: config.integrator }),
      ...ctx.inputsFor(initialMs, later.at(-1).ms, request.forces, request),
    ]));
    if (samples.length !== later.length) throw new Error(`propagator/hpop returned ${samples.length} samples for ${later.length} epochs`);
    later.forEach((t, k) => out.set(t, samples[k]));
  }
  const errors = targets.map((t) => {
    if (t.missing) return null;
    if (t.ms <= initialMs) return rtnError(t, initial.state.slice(0, 3));
    return rtnError(t, out.get(t).state.slice(0, 3));
  });
  const d2 = request.covariance ? targets.map((t, k) => {
    const s = out.get(t);
    return s?.covariance && errors[k] ? mahalanobis(t, errors[k], s.covariance, s.n) : null;
  }) : null;
  return { errors, d2 };
}

// Coefficients with solved-for values: Cd*A/m, Cr*A/m, or ECOM2 terms
// (PRW DYNAMIC_PARAMETERS ECOM2_<term>).
export function withParameters(fixed, parameters, values) {
  const out = { ...fixed, ...(fixed.ecom2 ? { ecom2: { ...fixed.ecom2 } } : {}) };
  parameters.forEach((p, i) => {
    if (p.kind === 'DRAG_AREA_OVER_MASS') out.b = values[i];
    else if (p.kind === 'SRP_AREA_OVER_MASS') out.agom = values[i];
    else if (p.kind.startsWith('ECOM2_')) out.ecom2 = { ...(out.ecom2 ?? {}), [p.kind.slice(6)]: values[i] };
    else throw new Error(`unknown parameter ${p.kind}`);
  });
  return out;
}

// Batch fit of the state at reference.epoch (and the solved-for coefficients)
// to full-state pseudo-observations [{epoch, state, covariance [36] RTN}].
// settings: {parameters [{kind, value}], apriori, forces, fixed, drivers,
// cutoffMs}. Adapted from E2's fitProduct with E7's full-force request.
// Returns {status, fit, rounds, hpopCalls}; throws on a module failure.
export async function fitArc(ctx, reference, referenceMs, observations, settings) {
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
      maximum_iterations: config.fit.maximumIterations, correction_tolerance: config.fit.correctionTolerance, sigma_edit_threshold: config.fit.sigmaEditThreshold,
    },
  };
  const answers = [];
  let hpopCalls = 0;
  const earliestMs = Math.min(...observations.map((o) => Date.parse(`${o.epoch.slice(0, 23)}Z`)), referenceMs);
  for (let round = 0; ; ++round) {
    const response = await ctx.estimation.invoke('fit_batch', [{ portId: 'request', typeRef: EST_TYPE, payload: ctx.codec.encode({ request, propagation_answers: answers }) }]);
    const out = decodeResult(response.outputs.find((o) => o.portId === 'result').payload);
    if (out.status !== 1) return { status: out.status, fit: out.fit, rounds: round, hpopCalls };
    const q0 = out.queries[0];
    const coefficients = withParameters(settings.fixed, settings.parameters, q0.parameter_values);
    const samples = decodeSamples(await ctx.hpop.invoke('invoke', [
      executionFrame({ epoch: reference.epoch, state: q0.seed.state, samples: out.queries.map((q) => isoByLabel.get(JSON.stringify(q.target_epoch))),
        forces: settings.forces, coefficients, parameters: settings.parameters, stm: true, integrator: config.integrator }),
      ...ctx.inputsFor(earliestMs, referenceMs, settings.forces, settings),
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
    if (round > config.fit.maximumIterations + 1) throw new Error('fit_batch kept asking for propagation');
  }
}
