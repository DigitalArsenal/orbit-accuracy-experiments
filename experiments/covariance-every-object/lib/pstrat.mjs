// Part 1's P_strat lookup (frozen-constants.json): 3x3 RTN position covariance in km^2, linear in age between bin midpoints, held beyond the first and last usable midpoint.
import { BINS } from './pairs.mjs';
import { cholesky, solveLower } from './linalg.mjs';
const MID = BINS.map(([lo, hi]) => (lo + hi) / 2);
const mat = (p) => [[p[0], p[1], p[2]], [p[1], p[3], p[4]], [p[2], p[4], p[5]]]; // RR RT RN TT TN NN
export function pAt(pStrat, regime, age) {
  const cells = pStrat[regime]; const use = cells.map((c, i) => (c && c.P && c.n > 0 ? i : -1)).filter((i) => i >= 0); if (!use.length) return null;
  if (age <= MID[use[0]]) return mat(cells[use[0]].P); if (age >= MID[use[use.length - 1]]) return mat(cells[use[use.length - 1]].P);
  let h = 0; while (MID[use[h + 1]] < age) h++;
  const a = use[h], b = use[h + 1], w = (age - MID[a]) / (MID[b] - MID[a]);
  return mat(cells[a].P.map((x, i) => (1 - w) * x + w * cells[b].P[i]));
}
export function d2(P, e) { const L = cholesky(P); if (!L) return NaN; const y = solveLower(L, e.map((x) => [x])); return y.reduce((s, r) => s + r[0] * r[0], 0); }
