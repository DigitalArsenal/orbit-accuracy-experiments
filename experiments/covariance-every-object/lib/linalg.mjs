// Small dense symmetric linear algebra on arrays of arrays (n <= 6). Numerics only.
export const zeros = (n, m = n) => Array.from({ length: n }, () => new Array(m).fill(0));
export const eye = (n) => { const a = zeros(n); for (let i = 0; i < n; i++) a[i][i] = 1; return a; };
export function matmul(A, B) {
  const n = A.length, m = B[0].length, k = B.length, C = zeros(n, m);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { let s = 0; for (let t = 0; t < k; t++) s += A[i][t] * B[t][j]; C[i][j] = s; }
  return C;
}
export const transpose = (A) => A[0].map((_, j) => A.map((r) => r[j]));
export const sub = (A, B) => A.map((r, i) => r.map((v, j) => v - B[i][j]));
export const add = (A, B) => A.map((r, i) => r.map((v, j) => v + B[i][j]));
export const sym = (A) => A.map((r, i) => r.map((v, j) => 0.5 * (v + A[j][i])));
/** Lower Cholesky factor, or null when A is not positive definite. */
export function cholesky(A) {
  const n = A.length, L = zeros(n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) { if (!(s > 0)) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
  }
  return L;
}
/** Solve L X = B for lower-triangular L. */
export function solveLower(L, B) {
  const n = L.length, m = B[0].length, X = zeros(n, m);
  for (let c = 0; c < m; c++) for (let i = 0; i < n; i++) {
    let s = B[i][c];
    for (let k = 0; k < i; k++) s -= L[i][k] * X[k][c];
    X[i][c] = s / L[i][i];
  }
  return X;
}
/** Cyclic Jacobi eigendecomposition of a symmetric matrix: { values, vectors (columns) }. */
export function eigSym(A0) {
  const n = A0.length, A = A0.map((r) => r.slice()), V = eye(n);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0, diag = 0;
    for (let i = 0; i < n; i++) { diag += A[i][i] ** 2; for (let j = i + 1; j < n; j++) off += A[i][j] ** 2; }
    if (off <= 1e-60 * (diag + off) || off === 0) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      if (A[p][q] === 0) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  return { values: A.map((r, i) => r[i]), vectors: V };
}
