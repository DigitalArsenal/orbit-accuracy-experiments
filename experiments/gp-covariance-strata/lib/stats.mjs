// Statistics only: second moments, the module's age interpolation, coverage and the label rule. No orbit physics.
import { BINS } from './bins.mjs';
export const CHI2_95 = 7.814727903251179, CHI2_99 = 11.344866730144373, Z95 = 1.959963984540054;
export const CENTER = BINS.map(([lo, hi]) => 0.5 * (lo + hi));
export const MIN_BIN_SAMPLES = 30;
// symmetric 3x3 as [xx, xy, xz, yy, yz, zz]
export function inv3(p) {
  const [a, b, c, d, e, f] = p;
  const A = d * f - e * e, B = c * e - b * f, C = b * e - c * d;
  const det = a * A + b * B + c * C;
  return [A / det, B / det, C / det, (a * f - c * c) / det, (b * c - a * e) / det, (a * d - b * b) / det];
}
export const quad = (v, q) => v[0] * (q[0] * v[0] + q[1] * v[1] + q[2] * v[2]) + v[1] * (q[1] * v[0] + q[3] * v[1] + q[4] * v[2]) + v[2] * (q[2] * v[0] + q[4] * v[1] + q[5] * v[2]);
export function quantileSorted(a, q) {
  const h = (a.length - 1) * q, i = Math.floor(h);
  return i + 1 < a.length ? a[i] + (h - i) * (a[i + 1] - a[i]) : a[i];
}
// the module's clip: centre at the median, scale (q84.1345 - q15.8655)/2 per position component, keep within k scales
export function clippedMoment(es, k = 5) {
  const med = [], sc = [];
  for (let c = 0; c < 3; c++) {
    const s = Float64Array.from(es, (e) => e[c]).sort();
    med.push(quantileSorted(s, 0.5)); sc.push((quantileSorted(s, 0.841345) - quantileSorted(s, 0.158655)) / 2);
  }
  const m = [0, 0, 0, 0, 0, 0]; let n = 0;
  for (const e of es) {
    if ([0, 1, 2].some((c) => sc[c] > 0 && Math.abs(e[c] - med[c]) > k * sc[c])) continue;
    m[0] += e[0] * e[0]; m[1] += e[0] * e[1]; m[2] += e[0] * e[2]; m[3] += e[1] * e[1]; m[4] += e[1] * e[2]; m[5] += e[2] * e[2]; n++;
  }
  return { P: m.map((x) => x / Math.max(1, n)), kept: n, of: es.length };
}
// cells[b] = {P} or null. Linear in age between usable bin centres, held beyond (gp-error-model calibrate_covariance).
export function interp(cells, age) {
  let lo = -1, hi = -1;
  for (let b = 0; b < cells.length; b++) {
    if (!cells[b]) continue;
    if (CENTER[b] <= age) lo = b;
    if (CENTER[b] >= age && hi < 0) hi = b;
  }
  if (lo < 0) return cells[hi].P;
  if (hi < 0 || lo === hi) return cells[lo].P;
  const f = (age - CENTER[lo]) / (CENTER[hi] - CENTER[lo]), A = cells[lo].P, B = cells[hi].P;
  return A.map((x, i) => x + f * (B[i] - x));
}
// Row table: arrays e (n x 3), age, b, cluster, t. Rows are indexed by integer ids into the table.
export function d2Of(tab, i, P) { return quad([tab.e[3 * i], tab.e[3 * i + 1], tab.e[3 * i + 2]], inv3(P)); }
export const half = (b, age) => (age < CENTER[b] ? 0 : 1);
// stride subsample of an index list down to at most m
export function sample(ids, m) { if (ids.length <= m) return ids; const out = []; const s = ids.length / m; for (let i = 0; i < m; i++) out.push(ids[Math.floor(i * s)]); return out; }

// The label rule's coverage points on a list of {d2, z:[3], half}.
export function labelStats(rows, o1b = true) {
  const n = rows.length; if (!n) return { n: 0 };
  const cov = (f, sel) => { let k = 0, m = 0; for (const r of rows) if (!sel || sel(r)) { m++; if (f(r)) k++; } return m ? k / m : NaN; };
  const c95 = cov((r) => r.d2 <= CHI2_95), c99 = cov((r) => r.d2 <= CHI2_99);
  const h0 = cov((r) => r.d2 <= CHI2_95, (r) => r.half === 0), h1 = cov((r) => r.d2 <= CHI2_95, (r) => r.half === 1);
  const ax = [0, 1, 2].map((a) => ({ share: cov((r) => Math.abs(r.z[a]) <= Z95), mean: rows.reduce((s, r) => s + r.z[a], 0) / n }));
  const inBand = (x) => x >= 0.93 && x <= 0.97;
  const L1 = inBand(c95) && inBand(h0) && inBand(h1);
  const L2 = c99 >= 0.975;
  const L3 = ax.every((a) => inBand(a.share) && Math.abs(a.mean) <= 0.5);
  return { n, c95, c99, h0, h1, ax, L1, L2, L3, label: L1 && L2 && (!o1b || L3) };
}
