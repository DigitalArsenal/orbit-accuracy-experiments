// A5's lead records (PLAN.md A4 point 2 and A5 point 8): for one window and arm, at each lead time L the truth epoch nearest E + L within
// the group's tolerance, the arm's predicted state with its own covariance, and pair_statistics' error and predicted position covariance in
// the truth's RTN axes with d² against the predicted covariance (part 3's realism and part 4's encounters both read these). SGP4-XP's
// covariance is the module's (sdnap_covariance_at, TEME; the truth goes to TEME by foundation/frames); FFM's is fit_batch's formal covariance
// times max(1, reduced chi-square), carried by propagator/ffm with the fitted state (GCRF). JavaScript routes records and picks epochs.
import { config } from '../common.mjs';
import { sgp4xpCovarianceAt, pairCovariance, convert } from './fits.mjs';

export const LEADS = config.a4.encounters.leadHours;
const H = 3600e3;
const round = (v, k = 9) => v.map((x) => Number(x.toPrecision(k)));
const record = (s) => ({ err: round(s.errorRtn), cov: round(s.predictedRtn), d2: Number(s.d2Predicted.toPrecision(9)) });

/** The truth line nearest E + L for each lead, within `toleranceSeconds`: [{ L, line }] (leads without one are left out). */
export function leadLines(truth, E, toleranceSeconds) {
  return LEADS.flatMap((L) => {
    const target = E + L * H;
    let best = null;
    for (const l of truth) { const d = Math.abs(Date.parse(l.epoch) - target); if (d <= toleranceSeconds * 1000 && (!best || d < best.d)) best = { d, l }; }
    return best ? [{ L, line: best.l }] : [];
  });
}

/** Truth lines in `axes` (EME2000 or GCRF) taken to `to` by foundation/frames: [{ epoch, r, v }]. */
const truthIn = async (a, lines, axes, to) => (await convert(a, lines, axes, to)).map((s, i) => ({ epoch: lines[i].epoch, ...s }));

/** SGP4-XP lead records of a fitted set: { L: { epoch, err, cov, d2 } }. */
export async function sgp4xpLeads(a, ommB64, leads, truthAxes) {
  if (!leads.length) return {};
  const epochs = leads.map(({ line }) => Date.parse(line.epoch));
  const predicted = await sgp4xpCovarianceAt(a, ommB64, epochs);
  const truth = await truthIn(a, leads.map(({ line }) => line), truthAxes, 'TEME');
  const stats = await pairCovariance(a, predicted, truth);
  return Object.fromEntries(leads.map(({ L, line }, i) => [L, { epoch: line.epoch, ...record(stats[i]) }]));
}

/** FFM lead records of a fitted product ({ epoch, state (m, m/s), parameters, covariance (n x n), reducedChiSquare }): { L: { epoch, err, cov, d2 } }.
 *  `carry(product, epochsMs, covariance)` is the FFM prediction with covariance (lib/ffm-fit.mjs predict). */
export async function ffmLeads(a, carry, product, leads, truthAxes) {
  if (!leads.length) return {};
  const n = Math.round(Math.sqrt(product.covariance.length));
  const scale = Math.max(1, product.reducedChiSquare ?? 1);
  const epochs = leads.map(({ line }) => Date.parse(line.epoch));
  const states = await carry(product, epochs, product.covariance.map((x) => x * scale));
  const predicted = states.map((s) => {
    const c = s.covariance, m = s.n ?? n; // the state block of [state, parameters], m and m/s -> km and km/s
    return { r: s.r, v: s.v, covariance: Array.from({ length: 36 }, (_, k) => c[Math.floor(k / 6) * m + (k % 6)] * 1e-6) };
  });
  const truth = await truthIn(a, leads.map(({ line }) => line), truthAxes, 'GCRF');
  const stats = await pairCovariance(a, predicted, truth);
  return Object.fromEntries(leads.map(({ L, line }, i) => [L, { epoch: line.epoch, ...record(stats[i]) }]));
}

/** Miss-distance-only lead records of states without covariance (the operator forecast) in the truth's axes: { L: { epoch, err } }. */
export async function stateLeads(a, states, leads) {
  if (!leads.length) return {};
  const unit = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1e-6, 0, 0, 0, 0, 0, 0, 1e-6, 0, 0, 0, 0, 0, 0, 1e-6];
  const stats = await pairCovariance(a, states.map((s) => ({ ...s, covariance: unit })), leads.map(({ line }) => line));
  return Object.fromEntries(leads.map(({ L, line }, i) => [L, { epoch: line.epoch, err: round(stats[i].errorRtn) }]));
}
