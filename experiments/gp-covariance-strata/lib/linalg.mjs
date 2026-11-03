// symmetric 3x3 helpers, packed [xx, xy, xz, yy, yz, zz]
export const full = (m) => [[m[0], m[1], m[2]], [m[1], m[3], m[4]], [m[2], m[4], m[5]]];
export const pack = (A) => [A[0][0], A[0][1], A[0][2], A[1][1], A[1][2], A[2][2]];
export const mul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
export const tr = (A) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[j][i]));
// eigenvalues of a symmetric 3x3 (Jacobi), ascending
export function eigvals(m) {
  const A = full(m).map((r) => r.slice());
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) off += A[i][j] ** 2;
    if (off < 1e-300) break;
    for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]); const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)); const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
    }
  }
  return [A[0][0], A[1][1], A[2][2]].sort((a, b) => a - b);
}
// lambda_max of N^-1/2 M N^-1/2 for symmetric positive definite N: the largest generalized eigenvalue, via the Cholesky factor of N
export function lamMax(N, M) {
  const A = full(N), L = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) { let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j]; }
  const inv = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];   // L^-1
  for (let i = 0; i < 3; i++) { inv[i][i] = 1 / L[i][i]; for (let j = 0; j < i; j++) { let s = 0; for (let k = j; k < i; k++) s -= L[i][k] * inv[k][j]; inv[i][j] = s / L[i][i]; } }
  const S = mul(mul(inv, full(M)), tr(inv));
  return eigvals(pack([[S[0][0], (S[0][1] + S[1][0]) / 2, (S[0][2] + S[2][0]) / 2], [0, S[1][1], (S[1][2] + S[2][1]) / 2], [0, 0, S[2][2]]]))[2];
}
export const frob = (m) => Math.hypot(m[0], m[3], m[5], Math.SQRT2 * m[1], Math.SQRT2 * m[2], Math.SQRT2 * m[4]);
