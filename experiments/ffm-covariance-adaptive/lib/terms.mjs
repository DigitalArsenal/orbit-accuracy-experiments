// A window's terms and its references (PLAN.md section 2). C2's windowTerms (ffm-covariance-calibration lib/products.mjs: the composition's A, U_R, U_T, U_N, D_1, D_inf in the predicted RTN
// axes, the same FFM run, grid and module calls), extended so that one FFM run also serves the reference: each lead may carry a truth line, a reference state with its covariance, or both.
// lib/products.mjs itself is not edited; P4 holds this extension equal to it on C2's windows. Encoding, routing and record keeping only; every orbit computation is a module's.
import path from 'node:path';
import { root, HOUR, DAY, iso } from '../common.mjs';

const { executionFrame, decodeSamples } = await import(path.join(root, 'harness/ffm-execution.mjs'));
const { sampleGrid, STEP_S } = await import(path.join(root, 'experiments/ffm-covariance-calibration/lib/products.mjs'));
const stateBlock = (values, n) => Array.from({ length: 36 }, (_, k) => values[n * Math.floor(k / 6) + (k % 6)]);
const column = (stm, n, j) => Array.from({ length: 6 }, (_, r) => stm[n * r + j]);
const zero36 = Array(36).fill(0);
const msOf = (e) => Date.parse(/Z$/.test(e) ? e : `${e}Z`);

/** A fitted product carried to `epochs` (ms) with its a posteriori covariance (formal x max(1, reduced chi-square), A5's rule): [{ epochMs, state, covariance 36 }]. */
export async function carry(ctx, fit, epochs, settings) {
  const scale = Math.max(1, fit.reducedChiSquare ?? 1), cov0 = fit.covariance.map((x) => x * scale);
  const sorted = [...epochs].sort((a, b) => a - b);
  const samples = decodeSamples(await ctx.ffm.invoke('invoke', [
    executionFrame({ epoch: fit.epoch, state: fit.state, samples: sorted.map(iso), forces: settings.forces, parameters: fit.parameters, fixed: settings.fixed ?? {}, stm: false, covariance: cov0, noise: null, integrator: settings.integrator }),
    ...ctx.inputs,
  ]));
  return sorted.map((t, i) => ({ epochMs: t, state: samples[i].state, covariance: stateBlock(samples[i].covariance, samples[i].n) }));
}

/**
 * The terms of one window. leads [{ L, epochMs, line | null, ref: { state, covariance } | null }]; E is t_in. Returns { leads: [{ L, epoch, truthSigmaM, errRtnM | null, terms, ref: { errRtnM, covRtn, minusTruthRtnM } | null }], cov0Scale, samples }.
 * A lead with neither truth nor reference is left out. With no reference this returns what C2's windowTerms returns, field for field, and the same module calls in the same order.
 */
export async function windowTermsRef(ctx, pairs, fit, E, allLeads, settings) {
  const leads = allLeads.filter((x) => x.line || x.ref);
  const epochOf = (x) => (x.line ? msOf(x.line.epoch) : x.epochMs);
  const leadMs = leads.map(epochOf);
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
  const nr = await pairs.noise({ start: iso(E), discretizationSeconds: STEP_S, samples: grid.map((t) => ({ epoch: iso(t), state: at.get(t).state, stm: at.get(t).stm })), targets: leadMs.map(iso) });
  const U = new Map(nr.targets.map((r) => [msOf(r.epoch), r.u]));
  const bIndex = fit.parameters.findIndex((p) => p.kind === 'DRAG_AREA_OVER_MASS');
  const D = { D1: null, Dinf: null };
  if (bIndex >= 0 && fit.parameters[bIndex].value > 0) {
    const b = fit.parameters[bIndex].value, j = 6 + bIndex;
    const segments = [1, 2, 3].map((k) => ({ from: iso(E + (k - 1) * DAY), to: iso(E + k * DAY + (k === 3 ? DAY : 0)), lead: k }));
    const epochs = leadMs.map((t) => ({ epoch: iso(t), stm: stateBlock(at.get(t).stm, n), s: column(at.get(t).stm, n, j) }));
    for (const [key, tau] of [['D1', 1], ['Dinf', Infinity]]) {
      const C = [0, 1, 2].map((a) => [0, 1, 2].map((c) => (Number.isFinite(tau) ? Math.exp(-Math.abs(a - c) / tau) : 1)));
      const r = await pairs.dcp({ leadCovariance: C, start: iso(E), segments, ballisticCoefficient: b, startSample: { stm: stateBlock(sE.stm, n), s: column(sE.stm, n, j) }, epochs });
      D[key] = new Map(r.epochs.map((x) => [msOf(x.epoch), x.covariance]));
    }
  }
  const pairList = [], keys = [];
  leads.forEach((x, i) => {
    const t = leadMs[i], s = at.get(t), u = U.get(t) ?? [zero36, zero36, zero36];
    const predicted = { position: s.state.slice(0, 3), velocity: s.state.slice(3, 6) };
    const refTruth = x.ref ? { position: x.ref.state.slice(0, 3), velocity: x.ref.state.slice(3, 6) } : null;
    const truth = x.line ? { position: x.line.r.map((q) => q * 1000), velocity: x.line.v.map((q) => q * 1000) } : refTruth;
    const terms = { A: stateBlock(s.covariance, s.n), UR: u[0], UT: u[1], UN: u[2], D1: D.D1?.get(t) ?? zero36, Dinf: D.Dinf?.get(t) ?? zero36 };
    for (const [name, m] of Object.entries(terms)) { pairList.push({ predicted: { ...predicted, covariance: m, covarianceAxes: 'INERTIAL' }, truth }); keys.push([i, name]); }
    if (x.ref) { pairList.push({ predicted: { ...predicted, covariance: x.ref.covariance, covarianceAxes: 'INERTIAL' }, truth: refTruth }); keys.push([i, 'ref']); }
    if (x.ref && x.line) { pairList.push({ predicted: { ...refTruth, covariance: x.ref.covariance, covarianceAxes: 'INERTIAL' }, truth }); keys.push([i, 'refTruth']); }
  });
  const stats = pairList.length ? await pairs.stats(pairList, 'predicted') : [];
  const out = leads.map((x, i) => ({ L: x.L, epoch: x.line ? x.line.epoch : iso(leadMs[i]), truthSigmaM: x.line ? (x.line.sigma ?? null) : null, errRtnM: null, terms: {}, ...(x.ref ? { ref: {} } : {}) }));
  stats.forEach((s, k) => {
    const [i, name] = keys[k];
    if (name === 'ref') { out[i].ref.errRtnM = s.errorRtn; out[i].ref.covRtn = s.predictedRtn; return; }
    if (name === 'refTruth') { out[i].ref.minusTruthRtnM = s.errorRtn; return; }
    out[i].terms[name] = s.predictedRtn;
    if (leads[i].line) out[i].errRtnM ??= s.errorRtn;
  });
  return { leads: out, cov0Scale: scale, samples: grid.length };
}
