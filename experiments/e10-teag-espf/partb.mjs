// Part B (PLAN.md section 3): synthetic cases with known truth, the variants
// of section 2 and the per-epoch scores of section 4. Scenario framing and
// statistics only: truth, frames, measurements, filters and every MVEE are
// the modules'.
import { config, rng, cholesky, mahalanobis2, msOf, iso, logDetOf, chi2Quantile6, halfWidth } from './common.mjs';
import { buildScenario, propagateTruth } from './scenario.mjs';
import { runSequential, runBatch } from './filters.mjs';
import { propagate } from './hpop.mjs';
import { mvee } from './teag.mjs';
import { rtnAxes } from '../../harness/frames.mjs';

const ARCSEC = Math.PI / 180 / 3600;
export const CASES = Object.keys(config.partB.cases);
export const allSeeds = () => [...config.partB.devSeeds, ...config.partB.testSeeds];
export const seedSpec = (id) => allSeeds().find((s) => s.id === id);
export const isDevSeed = (id) => config.partB.devSeeds.some((s) => s.id === id);
const diagonal = (sigma) => Array.from({ length: 36 }, (_, i) => (i % 7 === 0 ? sigma[i / 7] ** 2 : 0));

// One Part B scenario: truth, observations, the initial estimate, the truth's
// RTN axes at each observation (foundation/frames), the filter model.
export async function buildCase(m, env, eopStream, seedId, caseId) {
  const seed = seedSpec(seedId), c = config.partB.cases[caseId];
  const epochMs = msOf(seed.epoch), endMs = epochMs + config.partB.arcHours * 3600e3;
  const truthModel = config.forceModels['leo-jb2008'];
  const spec = {
    truth: { epochMs, endMs, stepS: config.partB.truthStepS, state: config.partB.state }, truthModel,
    stations: Object.values(config.stations), minElevationDeg: config.partB.minElevationDeg,
    sensor: { intervalS: c.intervalS ?? config.partB.sensor.intervalS, noiseRad: config.partB.sensor.noiseArcsec * ARCSEC, lightTime: config.partB.sensor.lightTime },
    seed: seed.seed, target: { id: 'target', norad: 99001, objectId: '2026-999A' },
  };
  if (c.eventHours) {
    const ms = epochMs + c.eventHours * 3600e3;
    if (c.alongTrackDeltaV) {
      // Along the truth's velocity at the event (B4).
      const [x] = await propagateTruth(m, env, spec, [ms]);
      const v = Math.hypot(x[3], x[4], x[5]);
      spec.events = [{ ms, deltaV: [3, 4, 5].map((i) => (c.alongTrackDeltaV * x[i]) / v) }];
    } else {
      spec.events = [{ ms, forces: { b: truthModel.forces.b * c.scale, agom: truthModel.forces.agom * c.scale } }];
    }
  }
  if (c.probability) spec.contamination = { probability: c.probability, noiseRad: c.outlierArcsec * ARCSEC, seed: seed.seed + c.simulatorSeedOffset, drawSeed: seed.seed + c.drawSeedOffset };
  const sc = await buildScenario(m, env, eopStream, spec);
  // B3: the RA bias of one station, on the simulated values.
  if (c.raBiasArcsec) for (const o of sc.observations) if (c.raBiasArcsec[o.station]) o.values[0] += c.raBiasArcsec[o.station] * ARCSEC;
  // One initial error per seed, shared by the cases; scaled in B2.
  const g = rng(seed.seed), z = Array.from({ length: 6 }, () => g.normal());
  const sigma = config.partB.p0Sigma, scale = c.initialErrorScale ?? 1;
  const initial = { ms: epochMs, state: config.partB.state.map((x, i) => x + scale * sigma[i] * z[i]), covariance: diagonal(sigma) };
  const rtn = [];
  for (const [k, o] of sc.observations.entries()) rtn.push(await rtnAxes(m.frames, iso(o.ms), sc.truthAtObs[k]));
  return {
    seedId, caseId, epochMs, endMs, filterModel: c.filterModel ?? 'leo-jb2008', initial,
    observations: sc.observations, truthAtObs: sc.truthAtObs, rtn, events: spec.events ?? [], windows: sc.windows.length,
  };
}

// Variant names: E26:k=<kappa>, E25, E25T:l=<lambda_t>, EKF, UKF, BLS, SMF.
export function variantSpec(name) {
  const [id, arg] = name.split(':');
  const value = arg ? Number(arg.split('=')[1]) : undefined;
  const f = config.filters, psd = [f.processNoisePsd, f.processNoisePsd, f.processNoisePsd];
  switch (id) {
    case 'E26': return { id, name, estimator: 'ESPF_2026', processNoisePsd: psd, espf: { pcrbTrigger: value, recordSupport: true } };
    case 'E25': return { id, name, estimator: 'ESPF_2025', processNoisePsd: psd, espf: { recordSupport: true } };
    case 'E25T': return { id, name, estimator: 'ESPF_2025', processNoisePsd: psd, espf: { regenerationScale: f.espf2025t.regenerationScale, decayRate: value, recordSupport: true } };
    case 'EKF': return { id, name, estimator: 'EXTENDED_KALMAN_FILTER', processNoisePsd: psd, sigmaEdit: f.sigmaEdit };
    case 'UKF': return { id, name, estimator: 'UNSCENTED_KALMAN_FILTER', processNoisePsd: psd, sigmaEdit: f.sigmaEdit };
    case 'SMF': {
      const s = f.setMembership;
      return { id, name, estimator: 'ELLIPSOIDAL_SET_MEMBERSHIP', processNoisePsd: psd, setMembership: { initialBoundScale: s.initialBoundScale, processBoundScale: s.processBoundScale, measurementBoundScale: s.measurementBoundScale, criterion: s.criterion } };
    }
    case 'BLS': return { id, name, batch: true };
    default: throw new Error(`unknown variant ${name}`);
  }
}

const sub = (a, b) => a.map((x, i) => x - b[i]);
const norm3 = (v, o = 0) => Math.hypot(v[o], v[o + 1], v[o + 2]);
const CHI95 = chi2Quantile6(0.95), CHI997 = chi2Quantile6(0.997);

// d^2 of truth in {(x - c)' S^-1 (x - c)}; null when S is not positive definite.
function d2(shape, center, truth) {
  const l = cholesky(shape, 6);
  return l ? { d2: mahalanobis2(l, 6, sub(truth, center)), logDet: logDetOf(l, 6) } : null;
}

// Runs one variant on one scenario and scores every epoch (PLAN.md section 4).
export async function runAndScore(ctx, sc, variant) {
  // The batch takes sc.batchObservations (with sc.batchCovariances) when the
  // sequential records are LINEAR (Part C).
  const result = variant.batch
    ? await runBatch(ctx, sc.initial, sc.batchObservations ?? sc.observations, { sigmaEdit: config.filters.batch.sigmaEditThreshold, maximumIterations: config.filters.batch.maximumIterations, stmAtEpochs: true, observationCovariances: sc.batchCovariances ?? [] })
    : await runSequential(ctx, variant, sc.initial, sc.observations);
  const rows = [];
  for (const [k, e] of result.epochs.entries()) {
    const truth = sc.truthAtObs[k], u = sc.rtn[k];
    const row = { ms: e.ms, pos: norm3(sub(e.estimate, truth)), vel: norm3(sub(e.estimate, truth), 3) };
    const extents = (shape, c) => [0, 1, 2].map((i) => halfWidth(shape, u.slice(3 * i, 3 * i + 3), c));
    if (variant.id === 'E26' || variant.id === 'E25' || variant.id === 'E25T') {
      const s = e.support;
      Object.assign(row, { qMin: s.qMin, choquet: s.choquet, information: s.information, inconsistent: !!s.inconsistent, survivors: s.survivors, sigma: s.sigma, accepted: e.accepted });
      const pts = s.survivorPoints ?? [], pi = s.survivorPossibility ?? [];
      if (variant.id === 'E26') {
        // The posterior set: the MVEE of the survivors.
        const set = await mvee(ctx.codec, ctx.est, pts, 6);
        const q = set ? d2(set.shape, set.center, truth) : null;
        Object.assign(row, { inSet: !!q && q.d2 <= 1, dSet: q ? Math.sqrt(q.d2) : null, logDet: q?.logDet ?? null, extents: set ? extents(set.shape, 1) : null });
      } else {
        // The posterior spread about the mode, d <= r = 3.
        const q = d2(e.shape, e.estimate, truth);
        Object.assign(row, { inSet: !!q && q.d2 <= 9, dSet: q ? Math.sqrt(q.d2) : null, logDet: q ? q.logDet + 6 * Math.log(9) : null, extents: extents(e.shape, 3) });
      }
      for (const alpha of [0.05, 0.5]) {
        const cut = [];
        pi.forEach((p, j) => { if (p >= alpha) cut.push(...pts.slice(6 * j, 6 * j + 6)); });
        const count = cut.length / 6;
        let inside = false;
        if (count >= 13) {
          const set = await mvee(ctx.codec, ctx.est, cut, 6);
          const q = set ? d2(set.shape, set.center, truth) : null;
          inside = !!q && q.d2 <= 1;
        }
        row[`inAlpha${alpha}`] = inside;
        row[`countAlpha${alpha}`] = count;
      }
    } else if (variant.id === 'SMF') {
      const q = d2(e.shape, e.estimate, truth);
      Object.assign(row, { inSet: !!q && q.d2 <= 1, dSet: q ? Math.sqrt(q.d2) : null, logDet: q?.logDet ?? null, extents: extents(e.shape, 1), inconsistent: !!e.support?.inconsistent, accepted: e.accepted });
    } else {
      const covariance = e.shape ?? e.covariance;
      const q = covariance ? d2(covariance, e.estimate, truth) : null;
      Object.assign(row, {
        nis: e.nis ?? null, accepted: e.accepted ?? true,
        in95: !!q && q.d2 <= CHI95, in997: !!q && q.d2 <= CHI997, dSet: q ? Math.sqrt(q.d2) : null,
        logDet: q ? q.logDet + 6 * Math.log(CHI997) : null, extents: covariance ? extents(covariance, Math.sqrt(CHI997)) : null,
      });
    }
    rows.push(row);
  }
  return { rows, calls: result.calls, seconds: result.seconds, failure: result.failure ?? null, fit: result.fit ?? null, scored: rows.length, observations: sc.observations.length };
}
