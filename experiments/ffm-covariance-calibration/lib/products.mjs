// C2's per-window terms (PLAN.md 3.1): from one fitted product, one propagator/ffm run from the fit epoch t0 with A5's covariance
// (formal x max(1, reduced chi-square)) and the dense STM sampled at E, at every 600 s step end of each lead's noise grid from E, and at
// the leads; then gp-error-model:
//   - A(t): FFM's carried covariance at each lead;
//   - U_R, U_T, U_N: noise_responses from E (600 s discretization, the STM's own Phi(t) Phi(t_j)^-1);
//   - D_tau (tau = 1 day, infinite): dcp_covariance from E with unit sigma_delta, lead-day covariance exp(-|i-j|/tau) over K = 3 days,
//     the start-relative B sensitivity from the STM's B column (only when B is a dynamic parameter);
//   - every term and the error taken to the predicted state's RTN axes by pair_statistics (position blocks, lower triangle, m^2).
// The composition P_cal = k_e A + diag(f^2) + q_T U_T + q_RN (U_R + U_N) + sigma_delta^2 D_tau is pair_statistics' covarianceTerms
// (lib/score.mjs). Encoding, routing and record keeping only.
import path from 'node:path';
import { HOUR, DAY, iso } from '../common.mjs';

const harness = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../harness/ffm-execution.mjs');
const { executionFrame, decodeSamples } = await import(harness);
export const STEP_S = 600;
const msOf = (e) => Date.parse(/Z$/.test(e) ? e : `${e}Z`);
const stateBlock = (values, n) => Array.from({ length: 36 }, (_, k) => values[n * Math.floor(k / 6) + (k % 6)]);
const column = (stm, n, j) => Array.from({ length: 6 }, (_, r) => stm[n * r + j]);
const zero36 = Array(36).fill(0);

/** Sample epochs (ms): E, every step end of each lead's grid (n = ceil(dt / 600 s) equal steps from E), and the leads. */
export function sampleGrid(E, leadMs) {
  const set = new Set([E]);
  for (const t of leadMs) { const dt = t - E, n = Math.ceil(dt / (STEP_S * 1000) - 1e-9), h = dt / n; for (let j = 1; j < n; j += 1) set.add(Math.round(E + j * h)); set.add(t); }
  return [...set].sort((a, b) => a - b);
}

/**
 * Terms of one window. ctx: v3 ctx (ffm, inputs); pairs: lib/pairs.mjs; fit: fitV3's product (epoch, state, parameters, covariance,
 * reducedChiSquare); leads [{L, line {epoch, r, v (km, km/s), sigma}}]; settings {forces, integrator, fixed}.
 * Returns [{ L, epoch, errRtnM, terms: {A, UR, UT, UN, D1, Dinf} (lower 6, m^2, predicted RTN), truthSigmaM }].
 */
export async function windowTerms(ctx, pairs, fit, E, leads, settings) {
  const leadMs = leads.map((x) => msOf(x.line.epoch));
  const grid = sampleGrid(E, leadMs);
  const n = 6 + fit.parameters.length;
  const scale = Math.max(1, fit.reducedChiSquare ?? 1);
  const cov0 = fit.covariance.map((x) => x * scale);
  const samples = decodeSamples(await ctx.ffm.invoke('invoke', [
    executionFrame({ epoch: fit.epoch, state: fit.state, samples: grid.map(iso), forces: settings.forces, parameters: fit.parameters, fixed: settings.fixed ?? {}, stm: true, covariance: cov0, noise: null, integrator: settings.integrator }),
    ...ctx.inputs,
  ]));
  const at = new Map(grid.map((t, i) => [t, samples[i]]));
  const sE = at.get(E);
  // noise responses from E (the module discretizes each target's arc from start)
  const nr = await pairs.noise({ start: iso(E), discretizationSeconds: STEP_S, samples: grid.map((t) => ({ epoch: iso(t), state: at.get(t).state, stm: at.get(t).stm })), targets: leadMs.map(iso) });
  const U = new Map(nr.targets.map((r) => [msOf(r.epoch), r.u]));
  // density term (unit sigma_delta), tau = 1 day and infinite
  const bIndex = fit.parameters.findIndex((p) => p.kind === 'DRAG_AREA_OVER_MASS');
  const D = { D1: null, Dinf: null };
  if (bIndex >= 0) {
    const b = fit.parameters[bIndex].value, j = 6 + bIndex;
    const segments = [1, 2, 3].map((k) => ({ from: iso(E + (k - 1) * DAY), to: iso(E + k * DAY + (k === 3 ? DAY : 0)), lead: k }));
    const epochs = leadMs.map((t) => ({ epoch: iso(t), stm: stateBlock(at.get(t).stm, n), s: column(at.get(t).stm, n, j) }));
    for (const [key, tau] of [['D1', 1], ['Dinf', Infinity]]) {
      const C = [0, 1, 2].map((a) => [0, 1, 2].map((c) => (Number.isFinite(tau) ? Math.exp(-Math.abs(a - c) / tau) : 1)));
      const r = await pairs.dcp({ leadCovariance: C, start: iso(E), segments, ballisticCoefficient: b, startSample: { stm: stateBlock(sE.stm, n), s: column(sE.stm, n, j) }, epochs });
      D[key] = new Map(r.epochs.map((x) => [msOf(x.epoch), x.covariance]));
    }
  }
  // every term and the error in the predicted state's RTN axes
  const pairList = [], keys = [];
  leads.forEach((x, i) => {
    const t = leadMs[i], s = at.get(t), u = U.get(t) ?? [zero36, zero36, zero36];
    const predicted = { position: s.state.slice(0, 3), velocity: s.state.slice(3, 6) };
    const truth = { position: x.line.r.map((q) => q * 1000), velocity: x.line.v.map((q) => q * 1000) };
    const terms = { A: stateBlock(s.covariance, s.n), UR: u[0], UT: u[1], UN: u[2], D1: D.D1?.get(t) ?? zero36, Dinf: D.Dinf?.get(t) ?? zero36 };
    for (const [name, m] of Object.entries(terms)) { pairList.push({ predicted: { ...predicted, covariance: m, covarianceAxes: 'INERTIAL' }, truth }); keys.push([i, name]); }
  });
  const stats = pairList.length ? await pairs.stats(pairList, 'predicted') : [];
  const out = leads.map((x, i) => ({ L: x.L, epoch: x.line.epoch, truthSigmaM: x.line.sigma ?? null, errRtnM: null, terms: {} }));
  stats.forEach((s, k) => { const [i, name] = keys[k]; out[i].terms[name] = s.predictedRtn; out[i].errRtnM ??= s.errorRtn; });
  return { leads: out, cov0Scale: scale, samples: grid.length };
}

/**
 * The held-out path (PLAN.md 3.5 point 5): FFM carries A5's covariance from t0 to E, then from E with PROCESS_NOISE (white acceleration,
 * q [R, T, N] m^2/s^3, 600 s) to the leads; returns each lead's position covariance in the predicted RTN axes (lower 6, m^2) and the
 * predicted state. ctx, pairs, fit, E, leads, settings as windowTerms; q = [q_R, q_T, q_N].
 */
export async function ffmNoiseCovariances(ctx, pairs, fit, E, leads, settings, q, k_e = 1) {
  const scale = k_e * Math.max(1, fit.reducedChiSquare ?? 1);
  const cov0 = fit.covariance.map((x) => x * scale);
  const [atE] = decodeSamples(await ctx.ffm.invoke('invoke', [
    executionFrame({ epoch: fit.epoch, state: fit.state, samples: [iso(E)], forces: settings.forces, parameters: fit.parameters, fixed: settings.fixed ?? {}, stm: false, covariance: cov0, noise: null, integrator: settings.integrator }),
    ...ctx.inputs,
  ]));
  const leadIso = leads.map((x) => x.line.epoch);
  const out = decodeSamples(await ctx.ffm.invoke('invoke', [
    executionFrame({ epoch: iso(E), state: atE.state, samples: leadIso, forces: settings.forces, parameters: fit.parameters, fixed: settings.fixed ?? {}, stm: false, covariance: atE.covariance, noise: q && q.some((v) => v > 0) ? { q, intervalSeconds: STEP_S } : null, integrator: settings.integrator }),
    ...ctx.inputs,
  ]));
  const stats = await pairs.stats(out.map((s, i) => ({ predicted: { position: s.state.slice(0, 3), velocity: s.state.slice(3, 6), covariance: stateBlock(s.covariance, s.n), covarianceAxes: 'INERTIAL' },
    truth: { position: leads[i].line.r.map((v) => v * 1000), velocity: leads[i].line.v.map((v) => v * 1000) } })), 'predicted');
  return out.map((s, i) => ({ L: leads[i].L, state: s.state, rtn: stats[i].predictedRtn, errRtnM: stats[i].errorRtn }));
}
