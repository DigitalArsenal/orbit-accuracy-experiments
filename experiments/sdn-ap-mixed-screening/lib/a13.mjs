// Amendment A13: the calibrated covariances of the conjunction contrast (parts 2, 3 and 5). C2's frozen constants (FFM and SGP4-XP, each
// by its receipt's SHA-256), the group's class, and the lead records of the calibrated arms composed as C2 composes them (gp-error-model
// covarianceTerms in the predicted state's RTN axes): FFM's k_e A5 carried by propagator/ffm with PROCESS_NOISE from E (600 s; the
// hand-off at E symmetrized, C2-A5) plus the floor and sigma_delta^2 D_tau; SGP4-XP's k_e A_xp plus the floor. Each calibrated record
// takes the A5 record's error (A13 part 5 point 2). Encoding, routing and record keeping; every covariance and d2 is a module's.
import fs from 'node:fs';
import path from 'node:path';
import { config, root, sha256 } from '../common.mjs';

const C2 = path.join(root, 'results/ffm-covariance-calibration');
const PINS = { ffm: ['frozen-constants.json', '7806980c7e3d655eaf7da31a32a4cb760293be53488a468e99b761b98726c837'], xp: ['sgp4xp/frozen-constants.json', '3f21116ca436d8edb38c47a9ab4661137b618f95e9cce9e52da7523bd9d04992'] };
const load = ([file, sha]) => {
  const b = fs.readFileSync(path.join(C2, file));
  if (sha256(b) !== sha) throw new Error(`${file} is not A13's frozen constants (${sha.slice(0, 12)})`);
  return JSON.parse(b).classes;
};
export const FFM_CONSTANTS = load(PINS.ffm), XP_CONSTANTS = load(PINS.xp);
/** The group's C2 class (A13 part 2): ISS I, laser L, Starlink R1 (weather M, by transfer). Laser's FFM arms reported beside: LP, R2. */
export const CLASS = { iss: 'I', laser: 'L', starlink: 'R1' };
export const LASER_BESIDE = { ffmCalLP: 'LP', ffmCalR2: 'R2' };

const unit = { RR: [1, 0, 0, 0, 0, 0], TT: [0, 0, 1, 0, 0, 0], NN: [0, 0, 0, 0, 0, 1] };
const floorTerms = (p) => [['f_R', unit.RR], ['f_T', unit.TT], ['f_N', unit.NN]].filter(([k]) => p[k]).map(([k, u]) => ({ weight: p[k] ** 2, covariance: u }));
// a synthetic pair whose RTN axes are the inertial axes (C2's d2Of), so stored RTN errors and terms are used as is
const P0 = [7e6, 0, 0], V0 = [0, 7.5e3, 0];

/** The calibration tools: { ffmCal(ctx, fit, E, leadsGcrf, settings, a5, keys), xpCal(a5, cls), close }. */
export async function openA13() {
  const { openPairs } = await import(path.join(root, 'experiments/ffm-covariance-calibration/lib/pairs.mjs'));
  const { windowTerms, ffmNoiseCovariances } = await import(path.join(root, 'experiments/ffm-covariance-calibration/lib/products.mjs'));
  const pairs = await openPairs(config.a12.modulesLinks);
  /** Composed records { L: { err (km), cov (packed lower RTN, km^2), d2 } } from per-lead terms (m^2) and the A5 records' errors. */
  const compose = async (a5, termsByL) => {
    const Ls = Object.keys(termsByL).filter((L) => a5[L]?.err);
    if (!Ls.length) return {};
    const st = await pairs.stats(Ls.map((L) => ({ predicted: { position: P0, velocity: V0, covarianceTerms: termsByL[L], covarianceAxes: 'RTN' }, truth: { position: P0.map((x, k) => x - a5[L].err[k] * 1000), velocity: V0 } })), 'predicted');
    return Object.fromEntries(Ls.map((L, i) => [L, { epoch: a5[L].epoch, err: a5[L].err, cov: st[i].predictedRtn.map((x) => Number((x * 1e-6).toPrecision(9))), d2: Number(st[i].d2Predicted.toPrecision(9)) }]));
  };
  return {
    /** FFM's calibrated records for each class key in `keys` ({ arm: classKey }): fit (epoch, state, parameters, covariance, reducedChiSquare),
     *  E (ms), leads [{ L, line: { epoch, r, v } }] (GCRF km), settings { forces, integrator, fixed }, a5 the arm's A5 records. */
    async ffmCal(ctx, fit, E, leads, settings, a5, keys) {
      const use = leads.filter(({ L }) => a5[L]?.err);
      if (!use.length) return Object.fromEntries(Object.keys(keys).map((arm) => [arm, {}]));
      const needD = Object.values(keys).some((c) => FFM_CONSTANTS[c].parameters.s2);
      const terms = needD ? await windowTerms(ctx, pairs, fit, E, use, settings) : null;
      const out = {};
      for (const [arm, c] of Object.entries(keys)) {
        const p = FFM_CONSTANTS[c].parameters;
        const noise = await ffmNoiseCovariances(ctx, pairs, fit, E, use, settings, [p.q_RN ?? 0, p.q_T ?? 0, p.q_RN ?? 0], p.k_e);
        const byL = Object.fromEntries(use.map(({ L }, j) => {
          const t = [{ weight: 1, covariance: noise[j].rtn }, ...floorTerms(p)];
          if (p.s2) t.push({ weight: p.s2, covariance: p.tau === 'inf' ? terms.leads[j].terms.Dinf : terms.leads[j].terms.D1 });
          return [L, t];
        }));
        out[arm] = await compose(a5, byL);
      }
      return out;
    },
    /** SGP4-XP's calibrated records of class `cls` from its A5 records (the module covariance in the truth's RTN axes, km^2). */
    async xpCal(a5, cls) {
      const p = XP_CONSTANTS[cls].parameters;
      const byL = Object.fromEntries(Object.entries(a5).filter(([, r]) => Array.isArray(r?.cov)).map(([L, r]) => [L, [{ weight: p.k_e, covariance: r.cov.map((x) => x * 1e6) }, ...floorTerms(p)]]));
      return compose(a5, byL);
    },
    pairs,
    close: () => pairs.close(),
  };
}
