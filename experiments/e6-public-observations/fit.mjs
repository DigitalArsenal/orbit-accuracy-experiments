// E6's anchored orbit fit (PLAN.md §4.3): analysis/estimation `fit_batch`
// (batch least squares of the GCRF state and the drag parameter B), answered
// by propagator/hpop with the full force model, on the object's element-set
// history (each set's epoch state as a full-state pseudo-observation with
// the GP error model's at-epoch covariance) and sparse public measurements
// (SatNOGS range rates; ILRS laser ranges; optical RA/Dec).
// Measurements come in segments (one pass of one station). A segment may
// carry nuisance terms fit_batch cannot hold (module gap, PLAN.md §7): for
// SatNOGS, a bias (transmitter and station oscillator offset), a drift and
// a timing lag (station tuning and clock). They are estimated from the
// fit's residuals between fits — per segment, weighted least squares of the
// residual on the segment's basis functions with Gaussian priors — the
// measurements are corrected for them, and fit_batch runs again
// (block-coordinate descent, over-relaxed). The first round weights the
// measurements down by firstRoundSigmaFactor; a segment whose whitened
// residual RMS stays above segmentEditRms is edited. This file routes
// records and fits those statistical nuisance terms; every orbit, frame and
// measurement prediction is a module's.
import { EST_TYPE, decodeResult, seedStruct } from '../e2-catalog-covariance/estimation-wire.mjs';
import { estEpoch } from '../e2-catalog-covariance/product.mjs';
import { decodeSamples, executionFrame } from '../../harness/hpop-execution.mjs';

export { conditioned } from '../e2-catalog-covariance/product.mjs';

const zero3 = [0, 0, 0];
function observation(epoch, o, flags) {
  const m = o.media ?? {};
  return {
    epoch, value: [0, 0, 0, 0], sigma: [1, 1, 1, 1], station_position_m: o.station ?? zero3, station_velocity_mps: o.stationVelocity ?? zero3, station_east: zero3, station_north: zero3,
    station_up: zero3, remote_position_m: zero3, remote_velocity_mps: zero3, frequency_hz: 0, transmitter_delay_seconds: 0, receiver_delay_seconds: 0,
    transponder_delay_seconds: 0, elevation_rad: m.elevationRad ?? 0, station_latitude_rad: m.latitudeRad ?? 0, station_height_m: m.heightM ?? 0, pressure_hpa: m.pressureHpa ?? 0,
    temperature_k: m.temperatureK ?? 0, relative_humidity: m.relativeHumidity ?? 0, wavelength_m: m.wavelengthM ?? 0, total_electron_content: 0, total_electron_content_rate_per_second: 0,
    turnaround_numerator: 1, turnaround_denominator: 1, kind: o.kind, value_count: o.values.length, flags, transmitter_index: 0, receiver_index: 0,
  };
}

// One fit_batch solution. obs [{epoch ISO, kind, values, covariance (value_count^2, GCRF for PV), station, stationVelocity, media}],
// reference {epoch ISO, state, parameters?} (first guess, at or before every observation).
async function solve(ctx, obs, reference, settings) {
  const { estimation, hpop, codec, inputs } = ctx;
  const isoByLabel = new Map(obs.map((o) => [JSON.stringify(estEpoch(o.epoch)), o.epoch]));
  const request = {
    config: {
      initial_epoch: estEpoch(reference.epoch), initial_state: reference.state, initial_covariance: Array(36).fill(0),
      process_noise_spectral_density: Array(6).fill(0), state_convergence_tolerance: 0, rms_convergence_tolerance: 0, sigma_edit_threshold: 0,
      dynamic_model_correlation_time_seconds: 0, maximum_iterations: 0, reference_frame: 'ICRF', estimator: 'BATCH_WEIGHTED_LEAST_SQUARES', process_noise: 'NONE', flags: 0,
    },
    extended_observations: obs.map((o) => ({ observation: observation(estEpoch(o.epoch), o, settings.flags?.[o.kind] ?? 3), values: o.values, sigmas: o.values.map(() => 1) })),
    ...(settings.errorModels ? { error_models: settings.errorModels } : {}),
    propagator_port_id: 'propagator/hpop', propagator_capability: 'plugin_propagate plugin_compute_stm',
    batch_options: {
      parameter_kinds: settings.parameters.map((p) => ({ DRAG_AREA_OVER_MASS: 1, DRAG_AREA_OVER_MASS_RATE: 2, SRP_AREA_OVER_MASS: 3, IN_TRACK_ACCELERATION: 4 })[p.kind]),
      parameter_values: reference.parameters ?? settings.parameters.map((p) => p.value),
      apriori_covariance: settings.apriori,
      observation_covariances: obs.flatMap((o) => o.covariance),
      covariance_axes: 0,
      maximum_iterations: settings.maximumIterations, correction_tolerance: settings.correctionTolerance, sigma_edit_threshold: settings.sigmaEditThreshold,
    },
  };
  const answers = [];
  let hpopCalls = 0;
  for (let round = 0; ; ++round) {
    const response = await estimation.invoke('fit_batch', [{ portId: 'request', typeRef: EST_TYPE, payload: codec.encode({ request, propagation_answers: answers }) }]);
    const out = decodeResult(response.outputs.find((o) => o.portId === 'result').payload);
    if (out.status !== 1) return { fit: out.fit, status: out.status, hpopCalls };
    const q0 = out.queries[0];
    const parameters = settings.parameters.map((p, i) => ({ kind: p.kind, value: q0.parameter_values[i] }));
    // One sample per distinct epoch (two stations may share an instant).
    const epochs = [...new Set(out.queries.map((q) => isoByLabel.get(JSON.stringify(q.target_epoch))))];
    const unique = decodeSamples(await hpop.invoke('invoke', [
      executionFrame({ epoch: reference.epoch, state: q0.seed.state, samples: epochs, forces: settings.forces, parameters, fixed: settings.fixed, stm: true, covariance: null, noise: null, integrator: settings.integrator }),
      ...inputs,
    ]));
    ++hpopCalls;
    const byEpoch = new Map(epochs.map((e, i) => [e, unique[i]]));
    out.queries.forEach((q) => {
      const s = byEpoch.get(isoByLabel.get(JSON.stringify(q.target_epoch))), n = s.n, stm = [], sensitivity = [];
      for (let i = 0; i < 6; ++i) {
        for (let j = 0; j < 6; ++j) stm.push(s.stm[i * n + j]);
        for (let j = 6; j < n; ++j) sensitivity.push(s.stm[i * n + j]);
      }
      answers.push({ query: { sequence: q.sequence, seed: seedStruct(q), target_epoch: q.target_epoch, parameter_values: q.parameter_values }, sample: { epoch: q.target_epoch, state: s.state, stm }, sensitivity });
    });
    if (round > settings.maximumIterations + 1) throw new Error('fit_batch kept asking for propagation');
  }
}

// Weighted least squares of y on the basis rows with Gaussian priors
// (prior sigma Infinity or null = free, 0 = fixed at the mean). k <= 3.
export function nuisanceFit(rows, priors) {
  const k = priors.length, A = Array.from({ length: k }, () => Array(k).fill(0)), b = Array(k).fill(0);
  for (const r of rows) for (let i = 0; i < k; ++i) { b[i] += r.w * r.phi[i] * r.y; for (let j = 0; j < k; ++j) A[i][j] += r.w * r.phi[i] * r.phi[j]; }
  priors.forEach((p, i) => {
    if (p.sigma === 0) {
      // Fixed at its mean: move its known contribution to the right side.
      for (let r = 0; r < k; ++r) if (r !== i) b[r] -= A[r][i] * p.mean;
      A[i].fill(0); A.forEach((row) => { row[i] = 0; }); A[i][i] = 1; b[i] = p.mean;
    } else if (p.sigma !== null && Number.isFinite(p.sigma)) { A[i][i] += 1 / p.sigma ** 2; b[i] += p.mean / p.sigma ** 2; }
  });
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < k; ++c) {
    let piv = c; for (let r = c + 1; r < k; ++r) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-300) return priors.map((p) => p.mean);
    for (let r = 0; r < k; ++r) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= k; ++j) M[r][j] -= f * M[c][j]; }
  }
  return M.map((row, i) => row[k] / row[i]);
}

// segments: [{key, kind, nuisance: {basis(point) -> [phi], priors: [{mean, sigma}], start [theta]} | null,
//   points: [{time ISO, values [..], sigmas [..], station, stationVelocity, media}]}]
// priors: [{epoch ISO, state [6], covariance [36] GCRF}] (element-set pseudo-observations).
// reference: {epoch, state} first guess at or before every observation.
// options: {outer, tolerance, relaxation, firstRoundSigmaFactor, segmentEditRms}.
export async function fitOrbit(ctx, segments, priors, reference, settings, options) {
  let points = segments.flatMap((s, si) => s.points.map((p) => ({ ...p, si })));
  const theta = segments.map((s) => (s.nuisance ? [...s.nuisance.start] : []));
  const status = segments.map(() => ({ rms: null, edited: false }));
  const correction = (p) => (segments[p.si].nuisance ? segments[p.si].nuisance.basis(p).reduce((a, phi, i) => a + phi * theta[p.si][i], 0) : 0);
  let guess = { ...reference };
  let result = null, hpopCalls = 0, lastChange = Infinity, rounds = 0;
  // Rounds: the nuisance iterations; without nuisance terms, one round, or
  // two when the first one is weighted down (a robust start).
  const hasNuisance = segments.some((s) => s.nuisance);
  const outerRounds = hasNuisance ? options.outer : (options.firstRoundSigmaFactor ?? 1) > 1 && segments.length ? 2 : 1;
  for (let outer = 0; outer < outerRounds; ++outer) {
    const factor = outer === 0 ? options.firstRoundSigmaFactor ?? 1 : 1;
    const obs = points.map((p) => ({
      epoch: p.time, kind: segments[p.si].kind, values: p.values.length === 1 ? [p.values[0] - correction(p)] : p.values,
      covariance: p.values.length === 1 ? [(p.sigmas[0] * factor) ** 2] : p.sigmas.flatMap((s, i) => p.sigmas.map((_, j) => (i === j ? (s * factor) ** 2 : 0))),
      station: p.station, stationVelocity: p.stationVelocity, media: p.media, point: p,
    }));
    for (const pr of priors) obs.push({ epoch: pr.epoch, kind: pr.kind ?? 'POSITION_VELOCITY', values: pr.values ?? pr.state, covariance: pr.covariance });
    obs.sort((a, b) => Date.parse(a.epoch) - Date.parse(b.epoch));
    let out;
    try { out = await solve(ctx, obs, guess, settings); } catch (e) {
      // A step the propagator refuses (e.g. B driven non-physical): keep the
      // previous round's solution when there is one.
      if (result) { result.stoppedBy = e.message.slice(0, 200); break; }
      throw e;
    }
    hpopCalls += out.hpopCalls;
    if (!out.fit || !out.fit.estimate?.length) return { failed: `fit_batch status ${out.status}`, hpopCalls };
    result = { ...out, obs };
    guess = { epoch: reference.epoch, state: out.fit.estimate.slice(0, 6), parameters: out.fit.estimate.slice(6) };
    rounds = outer + 1;
    if (outer === outerRounds - 1) break;
    if (!hasNuisance) continue;
    // Residuals of scalar measurements (whitening by sigma: r = z * sigma).
    const rejected = new Set(out.fit.rejectedObservationIndices);
    const rows = segments.map(() => []);
    let w = 0;
    obs.forEach((o, i) => {
      if (o.point && o.values.length === 1 && !rejected.has(i) && segments[o.point.si].nuisance) {
        const sigma = Math.sqrt(o.covariance[0]) / factor;
        rows[o.point.si].push({ y: out.fit.whitenedResiduals[w] * Math.sqrt(o.covariance[0]) + correction(o.point), phi: segments[o.point.si].nuisance.basis(o.point), w: 1 / sigma ** 2 });
      }
      w += o.values.length;
    });
    lastChange = 0;
    segments.forEach((s, si) => {
      if (!s.nuisance || !rows[si].length) return;
      const next = nuisanceFit(rows[si], s.nuisance.priors);
      const omega = outer === 0 ? 1 : options.relaxation ?? 1;
      const before = theta[si];
      theta[si] = before.map((v, i) => v + omega * (next[i] - v));
      const shift = rows[si].reduce((a, r) => a + r.w * (r.phi.reduce((x, phi, i) => x + phi * (theta[si][i] - before[i]), 0)) ** 2, 0) / rows[si].length;
      lastChange = Math.max(lastChange, Math.sqrt(shift));
      status[si].rms = Math.sqrt(rows[si].reduce((a, r) => a + r.w * (r.y - r.phi.reduce((x, phi, i) => x + phi * next[i], 0)) ** 2, 0) / rows[si].length);
    });
    if (options.segmentEditRms) {
      for (const st of status) if (st.rms !== null && st.rms > options.segmentEditRms) st.edited = true;
      points = points.filter((p) => !status[p.si].edited);
    }
    if (lastChange < options.tolerance) break;
  }
  return {
    fit: result.fit, status: result.status, epoch: reference.epoch, state: result.fit.estimate.slice(0, 6), parameters: result.fit.estimate.slice(6),
    nuisance: segments.map((s, i) => ({ key: s.key, theta: theta[i], ...status[i] })), hpopCalls, lastChange, outer: rounds, stoppedBy: result.stoppedBy ?? null,
    measurementsUsed: points.length,
  };
}

// The fitted product at sample epochs (ISO UTC, ascending, at or after its
// epoch) with its covariance over state and parameters propagated by HPOP:
// [{epoch, state [m, m/s], covariance [n*n], n}].
export async function propagateFit(ctx, product, samples, settings, covariance) {
  const parameters = settings.parameters.map((p, i) => ({ kind: p.kind, value: product.parameters[i] }));
  return decodeSamples(await ctx.hpop.invoke('invoke', [
    executionFrame({ epoch: product.epoch, state: product.state, samples, forces: settings.forces, parameters, fixed: settings.fixed,
      stm: false, covariance, noise: settings.processNoise ?? null, integrator: settings.integrator }),
    ...ctx.inputs,
  ]));
}
