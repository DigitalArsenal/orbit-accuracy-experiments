// Part 2 estimator and Loewner floor (PLAN.md section 2.4).
import { zeros, matmul, transpose, sub, add, sym, eigSym, cholesky, solveLower } from './linalg.mjs';

/** u_hat = argmin_u 1/2 sum [r2/(e^u a) + u] + (n0/4) u^2. r2: squared residuals, a: matching denominators. */
export function uHat(r2, a, n0) {
  if (r2.length === 0) return 0;
  const g = (u) => { let s = 0; for (let i = 0; i < r2.length; i++) s += 1 - r2[i] / (a[i] * Math.exp(u)); return 0.5 * s + 0.5 * n0 * u; };
  let lo = -30, hi = 30;
  if (g(lo) > 0) return lo; if (g(hi) < 0) return hi;
  for (let it = 0; it < 200; it++) { const mid = 0.5 * (lo + hi); if (g(mid) > 0) hi = mid; else lo = mid; if (hi - lo < 1e-13) break; }
  return 0.5 * (lo + hi);
}

/** D = diag over rows 0..5: axis k scales position row k and velocity row 3+k by exp(max(0,u_k)/2). */
export const dFactors = (u3) => [...u3, ...u3].map((u) => Math.exp(Math.max(0, u) / 2));

/** P_o = P + [D P D - P]_+ (PSD part), computed on the unit-diagonal scaling of P (D commutes with it). */
export function floorCov(P, d) {
  if (d.every((x) => x === 1)) return P.map((r) => r.slice());
  const n = P.length, s = P.map((r, i) => 1 / Math.sqrt(P[i][i]));
  const Pt = P.map((r, i) => r.map((v, j) => v * s[i] * s[j]));
  const DPD = Pt.map((r, i) => r.map((v, j) => v * d[i] * d[j]));
  const { values, vectors } = eigSym(sym(sub(DPD, Pt)));
  const pos = zeros(n);
  for (let m = 0; m < n; m++) if (values[m] > 0) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pos[i][j] += values[m] * vectors[i][m] * vectors[j][m];
  const Po = add(Pt, pos);
  return Po.map((r, i) => r.map((v, j) => v / (s[i] * s[j])));
}

/** Minimum eigenvalue of P^-1/2 Q P^-1/2 (invariant under diagonal scaling; evaluated on unit-diagonal P). */
export function minGenEig(P, Q) {
  const s = P.map((r, i) => 1 / Math.sqrt(P[i][i]));
  const sc = (M) => M.map((r, i) => r.map((v, j) => v * s[i] * s[j]));
  const L = cholesky(sc(P));
  const X = solveLower(L, sc(Q));
  const M = solveLower(L, transpose(X));
  return Math.min(...eigSym(sym(M)).values);
}

/** Orthonormal basis (3x2) of the plane normal to the relative velocity of two objects crossing at angle theta (RTN, object 1 along T). */
export function encounterBasis(theta) {
  const v1 = [0, 1, 0], v2 = [0, Math.cos(theta), Math.sin(theta)];
  const rel = v2.map((x, i) => x - v1[i]); const nr = Math.hypot(...rel); const n = rel.map((x) => x / nr);
  const e1 = [1, 0, 0]; // radial is normal to rel for crossings in the T-N plane
  const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
  return [[e1[0], e2[0]], [e1[1], e2[1]], [e1[2], e2[2]]];
}
export const project = (P3, B) => matmul(transpose(B), matmul(P3, B));
