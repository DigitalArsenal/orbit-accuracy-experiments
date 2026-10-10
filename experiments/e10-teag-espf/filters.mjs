// One estimator over one observation sequence through analysis/estimation
// (run_estimation; extension v3 for ESPF and the set-membership filter;
// fit_batch for the batch), every propagation answered by propagator/hpop at
// full force. Sequential runs take one observation per request and carry the
// posterior to the next request (the state and covariance, or the support
// state), as the module's README recommends for long arcs. Framing and
// counting only.
import { epochOf, msOfEpoch } from './estimation-codec.mjs';
import { iso } from './common.mjs';
import { propagate } from './hpop.mjs';

const zero3 = [0, 0, 0];
// Phi P Phi' (6 x 6, row-major).
function carry(phi, p) {
  const fp = new Array(36).fill(0), out = new Array(36).fill(0);
  for (let a = 0; a < 6; ++a) for (let b = 0; b < 6; ++b) for (let k = 0; k < 6; ++k) fp[a * 6 + b] += phi[a * 6 + k] * p[k * 6 + b];
  for (let a = 0; a < 6; ++a) for (let b = 0; b < 6; ++b) for (let k = 0; k < 6; ++k) out[a * 6 + b] += fp[a * 6 + k] * phi[b * 6 + k];
  return out;
}
const ICRF = 2;  // orbpro.propagator.ReferenceFrame (the request frame is GCRF)
// An estimation observation (RA/Dec, the station's GCRF position and velocity).
function observationStruct(T, o, lightTime) {
  return T('EstimationObservation', {
    epoch: T('EstimationEpoch', epochOf(o.ms)), value: [0, 0, 0, 0], sigma: [1, 1, 0, 0],
    stationPositionM: o.stationGcrf.slice(0, 3), stationVelocityMps: o.stationGcrf.slice(3, 6),
    stationEast: zero3, stationNorth: zero3, stationUp: zero3, remotePositionM: zero3, remoteVelocityMps: zero3,
    frequencyHz: 0, transmitterDelaySeconds: 0, receiverDelaySeconds: 0, transponderDelaySeconds: 0, elevationRad: 0,
    stationLatitudeRad: 0, stationHeightM: 0, pressureHpa: 0, temperatureK: 0, relativeHumidity: 0, wavelengthM: 0,
    totalElectronContent: 0, totalElectronContentRatePerSecond: 0, turnaroundNumerator: 1, turnaroundDenominator: 1,
    kind: o.kind ?? 6, valueCount: o.values.length, flags: lightTime ? 2 : 3, transmitterIndex: 0, receiverIndex: 0,
  });
}
// LINEAR records (o.kind 23) carry y = H x + offset (o.linearMatrix, value_count x 6).
const extended = (T, o, lightTime) => T('ExtendedObservation', {
  observation: observationStruct(T, o, lightTime), values: [...o.values], sigmas: [...o.sigmas],
  ...(o.linearMatrix ? { linearMatrix: [...o.linearMatrix], linearOffset: [...o.linearOffset] } : {}),
});

// Answers every query of one round by HPOP; counts calls.
async function answer(ctx, queries, stm) {
  const out = [];
  for (const q of queries) {
    const from = msOfEpoch(q.seed.epoch), to = msOfEpoch(q.targetEpoch);
    const [s] = await propagate(ctx.hpop, ctx.env, ctx.filterModel, { epochIso: iso(from), state: q.seed.state, sampleIsos: [iso(to)], stm });
    ctx.calls.hpop += 1;
    out.push(ctx.codec.T('PropagationAnswer', { query: q, sample: ctx.codec.T('EstimationPropagatorSample', { epoch: q.targetEpoch, state: s.state, stm: s.stm ?? new Array(36).fill(0) }) }));
  }
  return out;
}

async function runRequest(ctx, method, envelope, stm) {
  const { codec, est } = ctx;
  for (let round = 0; ; ++round) {
    const response = await est.invoke(method, [codec.frame('request', codec.pack(envelope)), ...(method === 'run_estimation' ? [codec.frame('propagator_samples', codec.pack(codec.T('EstimationEnvelope', { propagatorSamples: [] })))] : [])]);
    ctx.calls.estimation += 1;
    const result = codec.unpack(response.outputs.find((o) => o.portId === 'result').payload).result;
    if (result.status !== 1) return result;
    envelope.propagationAnswers.push(...await answer(ctx, result.propagationRequests, stm));
    if (round > 400) throw new Error('continuation does not finish');
  }
}

// variant: {estimator ('EXTENDED_KALMAN_FILTER' | 'UNSCENTED_KALMAN_FILTER' |
//   'ESPF_2025' | 'ESPF_2026' | 'ELLIPSOIDAL_SET_MEMBERSHIP'), options {...},
//   sigmaEdit, processNoisePsd [3]}; initial {ms, state [6], covariance [36]}.
// Returns {epochs: [{ms, estimate, shape, nis, accepted, support}], calls, seconds, failure}.
export async function runSequential(ctx, variant, initial, observations, { lightTime = true } = {}) {
  const { codec } = ctx;
  const T = codec.T;
  const stm = variant.estimator === 'EXTENDED_KALMAN_FILTER' || variant.estimator === 'ELLIPSOIDAL_SET_MEMBERSHIP';
  const setBased = ['ESPF_2025', 'ESPF_2026', 'ELLIPSOIDAL_SET_MEMBERSHIP'].includes(variant.estimator);
  ctx.calls = { hpop: 0, estimation: 0 };
  const started = process.hrtime.bigint();
  let state = [...initial.state], covariance = [...initial.covariance], support = null, previousMs = initial.ms;
  const epochs = [];
  let failure = null;
  for (const o of observations) {
    const options = T('SequentialOptions', { nonlinearPropagation: true, ukfAlpha: 1, ukfBeta: 2, ukfKappa: 0, adaptationRate: 0.05, minimumProcessScale: 0.01, maximumProcessScale: 100, maximumMeasurementScale: 100 });
    if (variant.estimator.startsWith('ESPF')) options.espf = Object.assign(new codec.api.EspfOptionsT(), variant.espf ?? {});
    if (variant.estimator === 'ELLIPSOIDAL_SET_MEMBERSHIP') options.setMembership = Object.assign(new codec.api.SetMembershipOptionsT(), variant.setMembership ?? {});
    if (support) options.initialSupport = support;
    const config = T('EstimationConfig', {
      initialEpoch: T('EstimationEpoch', epochOf(previousMs)), initialState: state, initialCovariance: covariance,
      processNoiseSpectralDensity: [...(variant.processNoisePsd ?? [0, 0, 0]), 0, 0, 0],
      stateConvergenceTolerance: 0, rmsConvergenceTolerance: 0, sigmaEditThreshold: variant.sigmaEdit ?? 1e9,
      dynamicModelCorrelationTimeSeconds: 0, maximumIterations: 0, referenceFrame: ICRF,
      estimator: codec.api.EstimatorKind[variant.estimator],
      processNoise: (variant.processNoisePsd ?? [0, 0, 0]).some((v) => v > 0) ? codec.api.ProcessNoiseKind.STATE_NOISE_COMPENSATION : codec.api.ProcessNoiseKind.NONE, flags: 0,
    });
    const envelope = T('EstimationEnvelope', {
      request: T('EstimationRequest', { config, observations: [], extendedObservations: [extended(T, o, lightTime)], propagatorPortId: 'propagator/hpop', propagatorCapability: 'plugin_propagate plugin_compute_stm', traceId: 'e10', options }),
      propagationAnswers: [],
    });
    let result;
    try {
      result = await runRequest(ctx, 'run_estimation', envelope, stm);
    } catch (error) {
      failure = { ms: o.ms, message: String(error.message ?? error) };
      break;
    }
    const h = result.filterHistory.at(-1), x = result.extendedHistory?.at(-1);
    const s = setBased ? result.supportHistory.at(-1) : null;
    epochs.push({
      ms: o.ms, estimate: h.filteredState, shape: h.filteredCovariance, nis: h.normalizedInnovationSquared,
      accepted: x ? x.accepted : !(result.rejectedObservationIndices ?? []).length,
      support: s ? {
        count: s.supportCount, survivors: s.survivorCount, medoid: s.medoidIndex, choquet: s.choquetSurprisal, information: s.information,
        shift: s.normalizationShift, qMin: s.minimumWhitenedInnovation, basinRadius: s.basinRadius, pcrbFloor: s.pcrbFloor,
        logVolumeChange: s.logVolumeChange, sigma: s.sigma, radius: s.radius, meanSurprisal: s.meanSurprisal, regime: s.regimeLogDet,
        inconsistent: s.inconsistent, carried: s.carriedShape, predicted: s.predictedShape,
        survivorPoints: s.survivors?.length ? s.survivors : undefined, survivorPossibility: s.survivorPossibility?.length ? s.survivorPossibility : undefined,
      } : undefined,
    });
    if (setBased) support = result.finalSupport;
    state = [...h.filteredState];
    covariance = [...h.filteredCovariance];
    previousMs = o.ms;
  }
  return { epochs, calls: ctx.calls, seconds: Number(process.hrtime.bigint() - started) / 1e9, failure };
}

// Weighted batch least squares of the state at the first observation's epoch
// (fit_batch, state only), from the initial state propagated there; then the
// fit propagated to every observation epoch.
// With stmAtEpochs, each epoch also carries the fit's state covariance
// carried by HPOP's state transition matrix, Phi P Phi'.
// observationCovariances: value_count^2 values per observation, concatenated
// (request axes), replacing the sigmas.
export async function runBatch(ctx, initial, observations, { sigmaEdit = 3, maximumIterations = 20, lightTime = true, stmAtEpochs = false, observationCovariances = [] } = {}) {
  const { codec } = ctx;
  const T = codec.T;
  ctx.calls = { hpop: 0, estimation: 0 };
  const started = process.hrtime.bigint();
  const config = T('EstimationConfig', {
    initialEpoch: T('EstimationEpoch', epochOf(initial.ms)), initialState: initial.state, initialCovariance: new Array(36).fill(0),
    processNoiseSpectralDensity: [0, 0, 0, 0, 0, 0], stateConvergenceTolerance: 0, rmsConvergenceTolerance: 0, sigmaEditThreshold: 0,
    dynamicModelCorrelationTimeSeconds: 0, maximumIterations: 0, referenceFrame: ICRF, estimator: codec.api.EstimatorKind.BATCH_WEIGHTED_LEAST_SQUARES,
    processNoise: codec.api.ProcessNoiseKind.NONE, flags: 0,
  });
  const envelope = T('EstimationEnvelope', {
    request: T('EstimationRequest', {
      config, observations: [], extendedObservations: observations.map((o) => extended(T, o, lightTime)), propagatorPortId: 'propagator/hpop',
      propagatorCapability: 'plugin_propagate plugin_compute_stm', traceId: 'e10',
      batchOptions: T('BatchFitOptions', { parameterKinds: [], parameterValues: [], aprioriCovariance: initial.covariance, observationCovariances: [...observationCovariances], maximumIterations, correctionTolerance: 1e-3, sigmaEditThreshold: sigmaEdit, covarianceAxes: 0 }),
    }),
    propagationAnswers: [],
  });
  let result, failure = null;
  try {
    // fit_batch asks one seed per iteration for every observation epoch: one HPOP call.
    for (let round = 0; ; ++round) {
      const response = await ctx.est.invoke('fit_batch', [codec.frame('request', codec.pack(envelope))]);
      ctx.calls.estimation += 1;
      result = codec.unpack(response.outputs.find((o) => o.portId === 'result').payload).result;
      if (result.status !== 1) break;
      const qs = result.propagationRequests, seed = qs[0].seed;
      const samples = await propagate(ctx.hpop, ctx.env, ctx.filterModel, { epochIso: iso(msOfEpoch(seed.epoch)), state: seed.state, sampleIsos: qs.map((q) => iso(msOfEpoch(q.targetEpoch))), stm: true });
      ctx.calls.hpop += 1;
      envelope.propagationAnswers.push(...qs.map((q, k) => T('PropagationAnswer', { query: q, sample: T('EstimationPropagatorSample', { epoch: q.targetEpoch, state: samples[k].state, stm: samples[k].stm }), sensitivity: [] })));
      if (round > 60) throw new Error('fit_batch does not finish');
    }
  } catch (error) {
    failure = { message: String(error.message ?? error) };
  }
  const fit = result?.batchFit;
  let epochs = [];
  if (fit && !failure) {
    const samples = await propagate(ctx.hpop, ctx.env, ctx.filterModel, { epochIso: iso(initial.ms), state: fit.estimate.slice(0, 6), sampleIsos: observations.map((o) => iso(o.ms)), stm: stmAtEpochs });
    ctx.calls.hpop += 1;
    const p = fit.covariance.length === 36 ? fit.covariance : null;
    epochs = observations.map((o, k) => ({ ms: o.ms, estimate: samples[k].state, ...(stmAtEpochs && p ? { covariance: carry(samples[k].stm, p) } : {}) }));
  }
  return { epochs, fit: fit ? { converged: fit.converged, iterations: fit.iterations, weightedRms: fit.weightedRms, estimate: fit.estimate, covariance: fit.covariance, rejected: fit.rejectedObservationIndices?.length ?? 0 } : null, calls: ctx.calls, seconds: Number(process.hrtime.bigint() - started) / 1e9, failure };
}
