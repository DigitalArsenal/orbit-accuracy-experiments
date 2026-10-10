// Fusion of an object's latest element sets (PLAN.md section 6), on their
// errors (km, RTN of the precise state) and covariances (lower 3x3, km^2).
// Statistics only. Each method returns the fused error and covariance.
import { full3, inv3, det3, lower3, invert, isPDn, mv3 } from './linalg.mjs';

const addM = (a, b) => a.map((v, i) => v + b[i]);
const scaleM = (a, s) => a.map((v) => v * s);

// Information-weighted combination with weights w: P = (sum w_k I_k)^-1, e = P sum w_k I_k e_k.
function combine(info, errors, w) {
  let I = Array(9).fill(0), y = [0, 0, 0];
  info.forEach((Ik, k) => {
    if (!w[k]) return;
    I = addM(I, scaleM(Ik, w[k]));
    y = addM(y, mv3(Ik, errors[k]).map((v) => v * w[k]));
  });
  const P = inv3(I);
  return { e: mv3(P, y), P: lower3(P), weights: w };
}

export function naive(errors, covs) {
  const info = covs.map((c) => inv3(full3(c)));
  return combine(info, errors, covs.map(() => 1));
}

// Covariance intersection (Julier and Uhlmann 1997): weights on the simplex
// minimizing det P, on a grid of `step` and then refined tenfold around the best.
export function covarianceIntersection(errors, covs, step) {
  const info = covs.map((c) => inv3(full3(c)));
  const k = info.length;
  if (k === 1) return combine(info, errors, [1]);
  const detInfo = (w) => det3(info.reduce((acc, Ik, i) => addM(acc, scaleM(Ik, w[i])), Array(9).fill(0)));
  const simplex = (center, half, h) => {
    const out = [];
    const lo = (i) => Math.max(0, (center ? center[i] - half : 0)), hi = (i) => Math.min(1, (center ? center[i] + half : 1));
    if (k === 2) for (let a = lo(0); a <= hi(0) + 1e-12; a += h) out.push([a, 1 - a]);
    else for (let a = lo(0); a <= hi(0) + 1e-12; a += h) for (let b = lo(1); b <= hi(1) + 1e-12 && a + b <= 1 + 1e-12; b += h) out.push([a, b, Math.max(0, 1 - a - b)]);
    return out;
  };
  let best = null, bestValue = -Infinity;
  for (const w of simplex(null, 0, step)) { const v = detInfo(w); if (v > bestValue) { bestValue = v; best = w; } }
  for (const w of simplex(best, step, step / 10)) { const v = detInfo(w); if (v > bestValue) { bestValue = v; best = w; } }
  return combine(info, errors, best);
}

// Best linear unbiased estimate with a joint covariance: blocks covs[k] on the
// diagonal, cross(k, l) = E[e_k e_l'] (row-major 3x3) off it. Null when the
// joint covariance is not positive definite.
export function gls(errors, covs, cross) {
  const k = covs.length, n = 3 * k;
  const S = Array(n * n).fill(0);
  for (let a = 0; a < k; ++a) for (let b = 0; b < k; ++b) {
    const block = a === b ? full3(covs[a]) : cross(a, b);
    if (!block) return null;
    for (let i = 0; i < 3; ++i) for (let j = 0; j < 3; ++j) S[(3 * a + i) * n + 3 * b + j] = block[3 * i + j];
  }
  if (!isPDn(S, n)) return null;
  const Si = invert(S, n);
  // H = [I; I; ...]: H' S^-1 H sums the 3x3 blocks of S^-1; H' S^-1 e sums its block rows times e.
  const A = Array(9).fill(0), y = [0, 0, 0];
  for (let a = 0; a < k; ++a) for (let b = 0; b < k; ++b) for (let i = 0; i < 3; ++i) for (let j = 0; j < 3; ++j) {
    const v = Si[(3 * a + i) * n + 3 * b + j];
    A[3 * i + j] += v;
    y[i] += v * errors[b][j];
  }
  const P = inv3(A);
  return { e: mv3(P, y), P: lower3(P) };
}
