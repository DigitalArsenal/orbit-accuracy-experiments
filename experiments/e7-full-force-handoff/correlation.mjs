// The error correlation between an object's OMMs (PLAN.md section 5): the
// empirical correlation of the at-epoch errors of two OMMs of one object as a
// function of the time between their epochs, per RTN component, its fitted
// forms, and the weight inflation that carries it into a fit whose
// observation covariances are per OMM. Statistics on module outputs only.
import { median } from '../../harness/stats.mjs';

const HOUR_MS = 3600000;
export const COMPONENTS = ['R', 'T', 'N', 'dR', 'dT', 'dN'];

// records: [{norad, epochMs, e [6]}]. Records with a component outside
// clipRobustSigma robust sigma of its median are dropped (as the weights).
// Returns per component the bins [{lo, hi, pairs, meanLagHours, rho}].
export function empiricalCorrelation(records, lagBinsHours, { clipRobustSigma, madScale }) {
  const centre = COMPONENTS.map((_, k) => median(records.map((r) => r.e[k])));
  const scale = COMPONENTS.map((_, k) => madScale * median(records.map((r) => Math.abs(r.e[k] - centre[k]))));
  const kept = records.filter((r) => r.e.every((x, k) => Math.abs(x - centre[k]) <= clipRobustSigma * scale[k]));
  const byObject = new Map();
  for (const r of kept) { if (!byObject.has(r.norad)) byObject.set(r.norad, []); byObject.get(r.norad).push(r); }
  const maxLag = lagBinsHours.at(-1)[1] * HOUR_MS;
  const acc = COMPONENTS.map(() => lagBinsHours.map(([lo, hi]) => ({ lo, hi, pairs: 0, lag: 0, sxy: 0, sxx: 0, syy: 0 })));
  for (const list of byObject.values()) {
    list.sort((a, b) => a.epochMs - b.epochMs);
    for (let i = 0; i < list.length; ++i) {
      for (let j = i + 1; j < list.length && list[j].epochMs - list[i].epochMs <= maxLag; ++j) {
        const lagH = (list[j].epochMs - list[i].epochMs) / HOUR_MS;
        const b = lagBinsHours.findIndex(([lo, hi]) => lagH > lo && lagH <= hi);
        if (b < 0) continue;
        for (let k = 0; k < 6; ++k) {
          const c = acc[k][b];
          c.pairs += 1; c.lag += lagH; c.sxy += list[i].e[k] * list[j].e[k]; c.sxx += list[i].e[k] ** 2; c.syy += list[j].e[k] ** 2;
        }
      }
    }
  }
  return {
    records: records.length, kept: kept.length,
    components: Object.fromEntries(COMPONENTS.map((name, k) => [name, acc[k].map((c) => ({
      lo: c.lo, hi: c.hi, pairs: c.pairs, meanLagHours: c.pairs ? c.lag / c.pairs : null, rho: c.pairs ? c.sxy / Math.sqrt(c.sxx * c.syy) : null,
    }))])),
  };
}

// The correlation of two OMMs dt hours apart under a form.
export function rho(form, p, dtHours) {
  if (dtHours === 0) return 1;
  if (form === 'exponential') return Math.exp(-dtHours / p.tauHours);
  if (form === 'exponential-nugget') return (1 - p.nugget) * Math.exp(-dtHours / p.tauHours);
  if (form === 'none') return 0;
  throw new Error(`unknown correlation form ${form}`);
}

// Least-squares fit of a form to the bins (weights: pairs), by grid search.
export function fitForm(form, bins) {
  const used = bins.filter((b) => b.pairs > 0 && b.rho !== null);
  const sse = (p) => used.reduce((a, b) => a + b.pairs * (b.rho - rho(form, p, b.meanLagHours)) ** 2, 0);
  let best = null;
  const taus = Array.from({ length: 241 }, (_, i) => 10 ** (-1 + i * 0.0125) * 24);  // 2.4 h to 100 days, log-spaced
  for (const tauHours of taus) {
    const nuggets = form === 'exponential-nugget' ? Array.from({ length: 96 }, (_, i) => i / 100) : [0];
    for (const nugget of nuggets) {
      const p = { tauHours, nugget };
      const s = sse(p);
      if (!best || s < best.sse) best = { ...p, sse: s };
    }
  }
  return { form, tauHours: best.tauHours, nugget: form === 'exponential-nugget' ? best.nugget : 0, sse: best.sse, pairs: used.reduce((a, b) => a + b.pairs, 0) };
}
export const sseOf = (form, p, bins) => bins.filter((b) => b.pairs > 0 && b.rho !== null).reduce((a, b) => a + b.pairs * (b.rho - rho(form, p, b.meanLagHours)) ** 2, 0);

// Inflation of each component's variance for an arc with these epochs: the
// number of OMMs over the effective number of independent ones for their
// common mean, n / (1' C^-1 1) with C from the form (Gaussian elimination;
// C is symmetric positive definite for these forms).
export function inflation(epochsMs, form, p) {
  const n = epochsMs.length;
  if (n < 2) return 1;
  const C = epochsMs.map((a) => epochsMs.map((b) => rho(form, p, Math.abs(a - b) / HOUR_MS)));
  const x = Array(n).fill(1);
  const A = C.map((row, i) => [...row, x[i]]);
  for (let c = 0; c < n; ++c) {
    let piv = c;
    for (let r = c + 1; r < n; ++r) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < n; ++r) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; ++k) A[r][k] -= f * A[c][k];
    }
  }
  const neff = A.reduce((s, row, i) => s + row[n] / row[i], 0);
  return Math.max(1, n / neff);
}

// The 6x6 RTN covariance with each component scaled by its inflation:
// D S D, D = diag(sqrt(f_k)).
export function inflate(covarianceRtn, factors) {
  const d = factors.map(Math.sqrt);
  return covarianceRtn.map((v, idx) => v * d[Math.floor(idx / 6)] * d[idx % 6]);
}
