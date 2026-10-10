// H-arc-v2's fit (PLAN.md sections 2, 5, 6): analysis/estimation `fit_batch`
// version 2 on an arc of OMM epoch states, answered by propagator/hpop, with
// bounded parameters, Levenberg–Marquardt, and one regularised covariance
// block across the arc. E7's request and answer loop (fitArc) with the
// version-2 options; the covariance block is assembled here from the class's
// second moment and correlation model. Framing and bookkeeping only.
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { decodeSamples, executionFrame } from '../../harness/full-force.mjs';
import { estEpoch } from '../e2-catalog-covariance/product.mjs';
import { EST_TYPE, decodeResult, positionObservation, seedStruct } from '../e2-catalog-covariance/estimation-wire.mjs';
import { withParameters } from '../e7-full-force-handoff/methods.mjs';
import { COMPONENTS, rho } from '../e7-full-force-handoff/correlation.mjs';
import { config, HOUR_MS } from './common.mjs';

// The arc's covariance (6m x 6m, row-major, each OMM's own RTN axes):
// S_ab sqrt(rho_a(dt) rho_b(dt)), S the 6x6 second moment, rho_a component
// a's correlation between two OMMs dt apart (rho(0) = 1). The module raises
// it to positive definite (covariance_regularization) and reports the change.
export function covarianceBlock(epochsMs, S, models, form) {
  const m = epochsMs.length, n = 6 * m;
  const out = new Array(n * n);
  for (let i = 0; i < m; ++i) {
    for (let j = 0; j < m; ++j) {
      const dt = Math.abs(epochsMs[i] - epochsMs[j]) / HOUR_MS;
      const r = COMPONENTS.map((c) => (i === j ? 1 : rho(form, models[c][form], dt)));
      for (let a = 0; a < 6; ++a) for (let b = 0; b < 6; ++b) out[(6 * i + a) * n + 6 * j + b] = S[6 * a + b] * Math.sqrt(Math.max(0, r[a] * r[b]));
    }
  }
  return out;
}

// Batch fit of the state at reference.epoch and the dynamic parameters to
// full-state pseudo-observations [{epoch, state}] under one covariance block.
// settings: {parameters [{kind, value, lower, upper}], apriori ((6+p)^2),
// block (6m x 6m), forces, fixed, drivers, cutoffMs, dca, integrator}. Returns {status,
// fit, rounds, hpopCalls}; throws on a module failure.
export async function fitArcV2(ctx, reference, referenceMs, observations, settings) {
  const f = config.fit;
  const isoByLabel = new Map(observations.map((o) => [JSON.stringify(estEpoch(o.epoch)), o.epoch]));
  const bound = (x, sign) => (x === undefined || x === null ? sign * f.unbounded : x);
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
      covariance_axes: 1,
      maximum_iterations: f.maximumIterations, correction_tolerance: f.correctionTolerance, sigma_edit_threshold: f.sigmaEditThreshold,
      parameter_lower_bounds: settings.parameters.map((p) => bound(p.lower, -1)),
      parameter_upper_bounds: settings.parameters.map((p) => bound(p.upper, 1)),
      levenberg_marquardt: f.levenbergMarquardt, initial_damping: f.initialDamping,
      covariance_blocks: [{ observations: observations.map((_, i) => i), covariance: settings.block }],
      covariance_regularization: f.covarianceRegularization, correlation_floor: f.correlationFloor,
      rtn_covariance: f.rtnCovariance,
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
        forces: settings.forces, coefficients, parameters: settings.parameters, stm: true, integrator: settings.integrator ?? config.integrator }),
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
    // Levenberg–Marquardt spends one round per trial step.
    if (round > 4 * f.maximumIterations + 2) throw new Error('fit_batch kept asking for propagation');
  }
}
