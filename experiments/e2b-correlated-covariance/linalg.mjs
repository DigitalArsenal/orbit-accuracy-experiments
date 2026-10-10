// Small-matrix helpers for E2b's statistics on module outputs (no orbit
// computation). 3x3 covariances travel as lower triangles (RR, TR, TT, NR,
// NT, NN), the first six entries of the module's 6x6 lower triangle.

export const full3 = (l) => [l[0], l[1], l[3], l[1], l[2], l[4], l[3], l[4], l[5]];
export const lower3 = (m) => [m[0], 0.5 * (m[1] + m[3]), m[4], 0.5 * (m[2] + m[6]), 0.5 * (m[5] + m[7]), m[8]];
export const scale = (l, s) => l.map((v) => v * s);
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const lerp = (a, b, w) => a.map((v, i) => v + (b[i] - v) * w);

export function det3(m) {
  return m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
}
export function inv3(m) {
  const d = det3(m);
  return [
    (m[4] * m[8] - m[5] * m[7]) / d, (m[2] * m[7] - m[1] * m[8]) / d, (m[1] * m[5] - m[2] * m[4]) / d,
    (m[5] * m[6] - m[3] * m[8]) / d, (m[0] * m[8] - m[2] * m[6]) / d, (m[2] * m[3] - m[0] * m[5]) / d,
    (m[3] * m[7] - m[4] * m[6]) / d, (m[1] * m[6] - m[0] * m[7]) / d, (m[0] * m[4] - m[1] * m[3]) / d,
  ];
}
export const mul3 = (a, b) => Array.from({ length: 9 }, (_, k) => {
  const i = Math.floor(k / 3), j = k % 3;
  return a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j];
});
export const mv3 = (m, v) => [0, 1, 2].map((i) => m[3 * i] * v[0] + m[3 * i + 1] * v[1] + m[3 * i + 2] * v[2]);
export const t3 = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

// Positive definite by Cholesky (row-major 3x3).
export function isPD3(m) {
  if (!(m[0] > 0)) return false;
  const l10 = m[3] / Math.sqrt(m[0]), d1 = m[4] - l10 * l10;
  if (!(d1 > 0)) return false;
  const l20 = m[6] / Math.sqrt(m[0]), l21 = (m[7] - l20 * l10) / Math.sqrt(d1);
  return m[8] - l20 * l20 - l21 * l21 > 0;
}
export const isPD = (l) => Array.isArray(l) && l.every(Number.isFinite) && isPD3(full3(l));

// d^2 = e' C^-1 e (row-major 3x3); NaN unless C is positive definite.
export function mahalanobis(e, m) {
  if (!isPD3(m)) return NaN;
  const l00 = Math.sqrt(m[0]), l10 = m[3] / l00, l20 = m[6] / l00;
  const l11 = Math.sqrt(m[4] - l10 * l10), l21 = (m[7] - l20 * l10) / l11;
  const l22 = Math.sqrt(m[8] - l20 * l20 - l21 * l21);
  const z0 = e[0] / l00, z1 = (e[1] - l10 * z0) / l11, z2 = (e[2] - l20 * z0 - l21 * z1) / l22;
  return z0 * z0 + z1 * z1 + z2 * z2;
}

// Symmetric eigenvalues of a 3x3 (cyclic Jacobi), ascending.
export function eigenvalues3(m0) {
  const m = [...m0];
  for (let sweep = 0; sweep < 60; ++sweep) {
    const off = m[1] ** 2 + m[2] ** 2 + m[5] ** 2;
    if (off < 1e-40) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const apq = m[3 * p + q];
      if (Math.abs(apq) < 1e-300) continue;
      const theta = (m[3 * q + q] - m[3 * p + p]) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; ++k) { const kp = m[3 * k + p], kq = m[3 * k + q]; m[3 * k + p] = c * kp - s * kq; m[3 * k + q] = s * kp + c * kq; }
      for (let k = 0; k < 3; ++k) { const pk = m[3 * p + k], qk = m[3 * q + k]; m[3 * p + k] = c * pk - s * qk; m[3 * q + k] = s * pk + c * qk; }
    }
  }
  return [m[0], m[4], m[8]].sort((a, b) => a - b);
}

// n x n (row-major) inverse by Gauss-Jordan with partial pivoting; null if singular.
export function invert(a, n) {
  const m = Array.from({ length: n }, (_, i) => [...a.slice(i * n, i * n + n), ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; ++c) {
    let p = c;
    for (let r = c + 1; r < n; ++r) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (!(Math.abs(m[p][c]) > 0)) return null;
    [m[p], m[c]] = [m[c], m[p]];
    const d = m[c][c];
    for (let j = 0; j < 2 * n; ++j) m[c][j] /= d;
    for (let r = 0; r < n; ++r) {
      if (r === c) continue;
      const f = m[r][c];
      if (f) for (let j = 0; j < 2 * n; ++j) m[r][j] -= f * m[c][j];
    }
  }
  return m.flatMap((row) => row.slice(n));
}
// Cholesky test for an n x n symmetric matrix.
export function isPDn(a, n) {
  const l = Array(n * n).fill(0);
  for (let i = 0; i < n; ++i) for (let j = 0; j <= i; ++j) {
    let s = a[i * n + j];
    for (let k = 0; k < j; ++k) s -= l[i * n + k] * l[j * n + k];
    if (i === j) { if (!(s > 0)) return false; l[i * n + i] = Math.sqrt(s); }
    else l[i * n + j] = s / l[j * n + j];
  }
  return true;
}
