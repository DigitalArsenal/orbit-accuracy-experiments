// Part 1a's FFM arm (PLAN.md amendment A3): analysis/estimation `fit_batch` answered by propagator/ffm on the operator track, the state at
// the track's first epoch with B and AGOM, through E6's fitOrbit and propagateFit (experiments/e6-public-observations fit.mjs, variant R:
// no element-set history, two rounds), with config.part1.starlink.ffm and the Earth orientation and space weather of config.environment
// (B1's tables, sliced to the arc). JavaScript routes records; the fit, the dynamics and the frames are the modules'.
import path from 'node:path';
import { config, root, g1Dir } from '../common.mjs';

const F = config.part1.starlink.ffm;
const iso = (t) => new Date(t).toISOString();
const short = (e) => String(e?.message ?? e).slice(0, 200);

/** The settings of one satellite's fit: the seeds by NORAD id, E6's a priori with A3's sigmas. */
export function settingsFor(norad) {
  const seeds = F.parameters.map((p) => (typeof p.seed === 'number' ? p.seed : norad < 56000 ? p.seed.belowNorad56000 : p.seed.fromNorad56000));
  const n = 6 + seeds.length;
  const diagonal = [...Array(3).fill(F.apriori.positionSigmaM ** 2), ...Array(3).fill(F.apriori.velocitySigmaMS ** 2), ...seeds.map((s) => (F.apriori.parameterFraction * s) ** 2)];
  return {
    forces: F.forces, integrator: F.integrator, maximumIterations: F.maximumIterations, correctionTolerance: F.correctionTolerance, sigmaEditThreshold: F.sigmaEditThreshold,
    parameters: F.parameters.map((p, i) => ({ kind: p.kind, value: seeds[i] })), fixed: {},
    apriori: Array.from({ length: n * n }, (_, k) => (Math.floor(k / n) === k % n ? diagonal[k % n] : 0)),
  };
}

/** The modules and the environment, opened once: { fit(norad, track, E), predict(product, norad, epochsMs, E), provenance, close }. */
export async function openFfmFit(modules) {
  const { loadModule } = await import(path.join(root, 'harness/modules.mjs'));
  const { estimationCodec } = await import(path.join(root, 'experiments/e2-catalog-covariance/estimation-wire.mjs'));
  const { fitOrbit, propagateFit } = await import(path.join(root, 'experiments/e6-public-observations/fit.mjs'));
  const FFM = await import(path.join(g1Dir, 'lib/ffm.mjs'));
  const { ffmEnvironment } = await import(path.join(root, 'experiments/sdn-ap-baselines/lib/environment.mjs'));
  const estimation = await loadModule(modules, 'analysis/estimation'), ffm = await loadModule(modules, 'propagator/ffm');
  const codec = await estimationCodec(modules, path.join(root, 'node_modules/space-data-module-sdk/schemas/orbpro'));
  const g1Context = await FFM.loadEnvironment(modules, { archive: '/opt/data/sdn-archive', store: path.join('/opt/data/sdn-archive', 'sdn-gp-starlink-ffm-match') });
  const env = await ffmEnvironment(modules, g1Context);
  // one environment per satellite: the track's first epoch to 72 h after E (inputsFor adds two days either side)
  const ctxFor = (fromMs, E) => ({ estimation, ffm, codec, inputs: env.inputsFor(fromMs, E + 72 * 3600e3) });
  const sigma = F.measurement.sigmaM;
  return {
    provenance: { estimation: estimation.provenance, ffm: ffm.provenance },
    /** The fit on the track ([{epoch, r, v}] km, km/s, GCRF): { ok, converged, epoch, state (m, m/s), parameters, ... } or { ok: false, error }. */
    async fit(norad, track, E) {
      const settings = settingsFor(norad);
      const segments = [{ key: 'operator-track', kind: F.measurement.kind, nuisance: null, points: track.map((l) => ({ time: l.epoch, values: l.r.map((x) => x * 1000), sigmas: [sigma, sigma, sigma] })) }];
      const reference = { epoch: track[0].epoch, state: [...track[0].r, ...track[0].v].map((x) => x * 1000) };
      const t0 = Date.now();
      try {
        const p = await fitOrbit(ctxFor(Date.parse(track[0].epoch), E), segments, [], reference, settings, { outer: 1, tolerance: 0.05, relaxation: 1, firstRoundSigmaFactor: F.firstRoundSigmaFactor, segmentEditRms: 0 });
        if (p.failed) return { ok: false, error: p.failed, seconds: (Date.now() - t0) / 1000 };
        const f = p.fit;
        return {
          ok: !!f.converged, ...(f.converged ? {} : { error: 'not converged' }), converged: !!f.converged, epoch: p.epoch, state: p.state, parameters: settings.parameters.map((q, i) => ({ kind: q.kind, value: p.parameters[i] })),
          reducedChiSquare: f.reducedChiSquare, weightedRms: f.weightedRms ?? null, measurements: f.measurementCount, rejected: f.rejectedObservationIndices?.length ?? 0, iterations: f.iterations,
          ffmCalls: p.ffmCalls, rounds: p.outer, stoppedBy: p.stoppedBy, seconds: (Date.now() - t0) / 1000,
          covariance: Array.from(f.covariance ?? []), // fit_batch's formal covariance of [state, B, AGOM] at the fit epoch (m, m/s), for amendment A4
        };
      } catch (error) { return { ok: false, error: short(error), seconds: (Date.now() - t0) / 1000 }; }
    },
    /** The fitted product carried by propagator/ffm to epochs (ms): [{ r, v }] km, km/s, GCRF. */
    async predict(product, norad, epochsMs, E) {
      const settings = { ...settingsFor(norad), parameters: product.parameters };
      const states = await propagateFit(ctxFor(Date.parse(product.epoch), E), { epoch: product.epoch, state: product.state, parameters: product.parameters.map((p) => p.value) }, epochsMs.map(iso), settings, null);
      return states.map((s) => ({ r: s.state.slice(0, 3).map((x) => x / 1000), v: s.state.slice(3, 6).map((x) => x / 1000) }));
    },
    async close() { for (const m of [estimation, ffm]) await m.destroy?.(); },
  };
}
