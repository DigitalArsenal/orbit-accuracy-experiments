// The composed covariance of an arm for stored samples (PLAN.md section 2), and its d2 by gp-error-model pair_statistics. Arithmetic and routing only.
import { AXES, scaled, gOf, axesMleRef } from './model.mjs';
import { groupOf } from './windows.mjs';
import { openPairs } from './modules.mjs';

const P0 = [7e6, 0, 0], V0 = [0, 7.5e3, 0];
let pairs = null;
/** d2 and per-axis z of each sample under composed covariances. */
export async function d2Of(list) {
  pairs ??= await openPairs('pin');
  const out = [];
  for (let i = 0; i < list.length; i += 4000) {
    const st = await pairs.stats(list.slice(i, i + 4000).map((s) => ({ predicted: { position: P0, velocity: V0, covarianceTerms: [{ weight: 1, covariance: s.m }], covarianceAxes: 'RTN' }, truth: { position: P0.map((x, k) => x - s.l.err[k]), velocity: V0, ...(s.l.C ? { covariance: [s.l.C, 0, s.l.C, 0, 0, s.l.C], covarianceAxes: 'RTN' } : {}) } })), 'predicted');
    for (const x of st) out.push(x.d2Combined ?? x.d2Predicted);
  }
  return out;
}
/** The covariance of arm (a0, a1, n0, useG, useU, kappa) for every sample. */
export function compose(samples, { a0 = 0, a1 = 0, n0 = 1, useG = false, useU = false, kRef = null, history = 'reference', kappa = 1 }) {
  const memo = new Map();
  return samples.map((s) => {
    const { w, l } = s, L = l.L;
    const g = useG ? gOf(w.chi, w.chiRef, a0, a1, L) : 1;
    let u = [0, 0, 0];
    if (useU) {
      const key = `${w.norad}|${w.tIn}|${L}`;
      if (memo.has(key)) u = memo.get(key);
      else {
        const H = w.hist.get(L) ?? [];
        if (history === 'truth') {
          // the forecast against the later file's truth at the lead epoch, the same history and availability; no reference fit
          const T = H.filter(({ l: jl }) => jl.err);
          u = [0, 1, 2].map((k) => axesMleRef(T.map(({ j, l: jl }) => ({ e: jl.err[k], a: (useG ? gOf(j.chi, j.chiRef, a0, a1, L) : 1) * jl.P[AXES[k]], c: jl.C })), n0));
        } else {
          const k_ = kRef[groupOf(L)];
          u = [0, 1, 2].map((k) => axesMleRef(H.map(({ j, l: jl }) => ({ e: jl.ref.errRtnM[k], a: (useG ? gOf(j.chi, j.chiRef, a0, a1, L) : 1) * jl.P[AXES[k]], c: k_[k] * jl.ref.covRtn[AXES[k]] + jl.C })), n0));
        }
        memo.set(key, u);
      }
    }
    return { ...s, g, u, m: scaled(l.P, kappa * g, u) }; // kappa only for C3-a-k, the class-scale comparator (C3-A10)
  });
}
