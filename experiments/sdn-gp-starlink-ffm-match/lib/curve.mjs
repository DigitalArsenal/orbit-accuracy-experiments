// Least-squares statistics on module outputs (amendment A7): a quadratic trend plus one sinusoid whose period is scanned.
// This is regression on a series of numbers the modules returned (in-track differences between two propagations); it
// computes no dynamics, frames or covariances.

/** Solves A x = b (n x n, Gaussian elimination with partial pivoting). */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r += 1) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k += 1) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Linear least squares y ~ sum_k c_k columns[k]. Returns { coefficients, rss } or null when singular. */
export function leastSquares(columns, y) {
  const k = columns.length;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (let i = 0; i < y.length; i += 1) {
    for (let r = 0; r < k; r += 1) {
      const cr = columns[r][i];
      b[r] += cr * y[i];
      for (let c = r; c < k; c += 1) A[r][c] += cr * columns[c][i];
    }
  }
  for (let r = 0; r < k; r += 1) for (let c = 0; c < r; c += 1) A[r][c] = A[c][r];
  const coefficients = solve(A, b);
  if (!coefficients) return null;
  let rss = 0;
  for (let i = 0; i < y.length; i += 1) {
    let m = 0;
    for (let r = 0; r < k; r += 1) m += coefficients[r] * columns[r][i];
    rss += (y[i] - m) ** 2;
  }
  return { coefficients, rss };
}

/**
 * y(t) ~ c0 + c1 s + c2 s^2 + a sin(2 pi t / P) + b cos(2 pi t / P), s = t scaled to [-1, 1], P scanned over
 * [minPeriod, maxPeriod] (same unit as t) in `steps` steps. Returns the best period, the amplitude hypot(a, b),
 * the RMS of the residual, and the RMS of the residual of the quadratic alone.
 */
export function quadraticPlusSinusoid(t, y, { minPeriod, maxPeriod, steps = 160 }) {
  const t0 = t[0], half = (t[t.length - 1] - t[0]) / 2 || 1;
  const s = t.map((x) => (x - t0 - half) / half);
  const one = s.map(() => 1), s2 = s.map((v) => v * v);
  const quad = leastSquares([one, s, s2], y);
  if (!quad) return null;
  let best = null;
  for (let k = 0; k <= steps; k += 1) {
    const period = minPeriod + ((maxPeriod - minPeriod) * k) / steps;
    const w = (2 * Math.PI) / period;
    const fit = leastSquares([one, s, s2, t.map((x) => Math.sin(w * x)), t.map((x) => Math.cos(w * x))], y);
    if (fit && (!best || fit.rss < best.rss)) best = { period, rss: fit.rss, a: fit.coefficients[3], b: fit.coefficients[4] };
  }
  if (!best) return null;
  return { period: best.period, amplitude: Math.hypot(best.a, best.b), rmsResidual: Math.sqrt(best.rss / y.length), rmsQuadraticResidual: Math.sqrt(quad.rss / y.length) };
}
