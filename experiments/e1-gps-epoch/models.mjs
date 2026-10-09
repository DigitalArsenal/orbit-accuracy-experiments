// Statistical models of E1 (PLAN.md §4): regressions for the along-track
// time offset (M3a–c) and the variance model of the corrected product (M4).
// Statistics on module outputs only; no orbit computation here.

// ── Small dense linear algebra ──

// Solves A x = b for symmetric positive definite A (Cholesky). A: array of rows.
export function solveSpd(A, b) {
  const n = b.length;
  const L = A.map((row) => row.slice());
  for (let j = 0; j < n; ++j) {
    for (let k = 0; k < j; ++k) L[j][j] -= L[j][k] * L[j][k];
    if (!(L[j][j] > 0)) throw new Error('matrix is not positive definite');
    L[j][j] = Math.sqrt(L[j][j]);
    for (let i = j + 1; i < n; ++i) {
      for (let k = 0; k < j; ++k) L[i][j] -= L[i][k] * L[j][k];
      L[i][j] /= L[j][j];
    }
  }
  const y = new Array(n);
  for (let i = 0; i < n; ++i) { let s = b[i]; for (let k = 0; k < i; ++k) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; --i) { let s = y[i]; for (let k = i + 1; k < n; ++k) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  let logDet = 0;
  for (let i = 0; i < n; ++i) logDet += 2 * Math.log(L[i][i]);
  return { x, logDet };
}

const zeros = (n) => new Array(n).fill(0);
const outer = (p) => Array.from({ length: p }, () => zeros(p));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

// ── Feature standardization ──

export function standardizer(rows) {
  const p = rows[0].length;
  const mean = zeros(p), sd = zeros(p);
  for (const r of rows) r.forEach((x, k) => { mean[k] += x / rows.length; });
  for (const r of rows) r.forEach((x, k) => { sd[k] += (x - mean[k]) ** 2 / rows.length; });
  return { mean, sd: sd.map((v) => Math.sqrt(v) || 1) };
}
export const standardize = (s, row) => row.map((x, k) => (x - s.mean[k]) / s.sd[k]);

// ── Ridge regression with an intercept per group (fixed effects) or one ──
// rows: standardized features; groups: a key per row or null (one intercept).
// Penalty λ on the feature coefficients only.
export function fitRidge(rows, y, { groups = null, lambda = 0 } = {}) {
  const keys = groups ? [...new Set(groups)].sort((a, b) => a - b) : [null];
  const g = groups ? new Map(keys.map((k, i) => [k, i])) : null;
  const q = keys.length, p = rows[0].length, m = q + p;
  const A = outer(m), b = zeros(m);
  const x = new Array(m);
  rows.forEach((r, i) => {
    x.fill(0);
    x[g ? g.get(groups[i]) : 0] = 1;
    for (let k = 0; k < p; ++k) x[q + k] = r[k];
    for (let a = 0; a < m; ++a) {
      if (x[a] === 0) continue;
      b[a] += x[a] * y[i];
      for (let c = 0; c < m; ++c) A[a][c] += x[a] * x[c];
    }
  });
  for (let k = 0; k < p; ++k) A[q + k][q + k] += lambda;
  const { x: coef } = solveSpd(A, b);
  const intercepts = Object.fromEntries(keys.map((k, i) => [k ?? 'all', coef[i]]));
  const pooled = keys.length > 1 ? keys.reduce((s, k, i) => s + coef[i], 0) / keys.length : coef[0];
  const beta = coef.slice(q);
  const residuals = rows.map((r, i) => y[i] - (g ? coef[g.get(groups[i])] : coef[0]) - dot(beta, r));
  return { kind: groups ? 'fixed-effects' : 'pooled', intercepts, pooledIntercept: pooled, beta, lambda, sigma: Math.sqrt(residuals.reduce((s, e) => s + e * e, 0) / Math.max(1, rows.length - m)) };
}

// ── Random intercept per group, variance components by REML ──
// y = Xβ + u_g + ε, u ~ N(0, τ²), ε ~ N(0, σ²); X includes the intercept.
// γ = τ²/σ² maximizes the restricted likelihood (golden section on log γ);
// β is the GLS estimate at γ, with ridge λ on the non-intercept columns.
export function fitReml(rows, y, groups, { lambda = 0 } = {}) {
  const p = rows[0].length + 1;
  const keys = [...new Set(groups)].sort((a, b) => a - b);
  const index = new Map(keys.map((k, i) => [k, i]));
  const XtX = outer(p), Xty = zeros(p);
  const s = keys.map(() => zeros(p)), t = zeros(keys.length), n = zeros(keys.length);
  let yy = 0;
  rows.forEach((r, i) => {
    const x = [1, ...r], gi = index.get(groups[i]);
    for (let a = 0; a < p; ++a) {
      Xty[a] += x[a] * y[i];
      s[gi][a] += x[a];
      for (let c = 0; c < p; ++c) XtX[a][c] += x[a] * x[c];
    }
    t[gi] += y[i];
    n[gi] += 1;
    yy += y[i] * y[i];
  });
  const N = y.length;
  const at = (gamma, ridge) => {
    const A = XtX.map((row) => row.slice()), b = Xty.slice();
    let yVy = yy, logDetV = 0;
    keys.forEach((_, i) => {
      const c = gamma / (1 + n[i] * gamma);
      for (let a = 0; a < p; ++a) {
        b[a] -= c * s[i][a] * t[i];
        for (let d = 0; d < p; ++d) A[a][d] -= c * s[i][a] * s[i][d];
      }
      yVy -= c * t[i] * t[i];
      logDetV += Math.log(1 + n[i] * gamma);
    });
    const unpenalized = solveSpd(A, b);
    for (let k = 1; k < p; ++k) A[k][k] += ridge;
    const { x: beta } = ridge ? solveSpd(A, b) : unpenalized;
    const rss = yVy - dot(b, unpenalized.x);
    const sigma2 = rss / (N - p);
    return { beta, sigma2, logLik: -0.5 * ((N - p) * Math.log(sigma2) + logDetV + unpenalized.logDet) };
  };
  // Golden section on log γ in [-15, 8].
  let lo = -15, hi = 8;
  const phi = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - phi * (hi - lo), x2 = lo + phi * (hi - lo);
  let f1 = at(Math.exp(x1), 0).logLik, f2 = at(Math.exp(x2), 0).logLik;
  for (let it = 0; it < 80; ++it) {
    if (f1 > f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - phi * (hi - lo); f1 = at(Math.exp(x1), 0).logLik; }
    else { lo = x1; x1 = x2; f1 = f2; x2 = lo + phi * (hi - lo); f2 = at(Math.exp(x2), 0).logLik; }
  }
  const gamma = Math.exp((lo + hi) / 2);
  const fit = at(gamma, lambda);
  // BLUPs: u_g = γ/(1 + n_g γ) Σ (y − Xβ) over the group.
  const resid = zeros(keys.length);
  rows.forEach((r, i) => { resid[index.get(groups[i])] += y[i] - fit.beta[0] - dot(fit.beta.slice(1), r); });
  const effects = Object.fromEntries(keys.map((k, i) => [k, gamma / (1 + n[i] * gamma) * resid[i]]));
  return { kind: 'random-intercept', intercept: fit.beta[0], beta: fit.beta.slice(1), effects, sigma2: fit.sigma2, tau2: gamma * fit.sigma2, gamma, lambda, restrictedLogLik: fit.logLik };
}

// Prediction from any of the three fits; an unseen group gets the pooled
// intercept (fixed effects) or u = 0 (random intercept).
export function predict(fit, row, group) {
  if (fit.kind === 'random-intercept') return fit.intercept + (fit.effects[group] ?? 0) + dot(fit.beta, row);
  if (fit.kind === 'fixed-effects') return (fit.intercepts[group] ?? fit.pooledIntercept) + dot(fit.beta, row);
  return fit.intercepts.all + dot(fit.beta, row);
}

// ── Minimum-CRPS variance model (Gneiting et al. 2005) ──
// y ~ N(0, σ²), log σ = wᵀz with z = [1, covariates]. CRPS of N(0, σ²) at y:
// σ [ z(2Φ(z) − 1) + 2φ(z) − 1/√π ], z = y/σ; ∂CRPS/∂σ = 2φ(z) − 1/√π.
const SQRT_PI = Math.sqrt(Math.PI);
const phiN = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
// Φ through the Chebyshev fit to erfc in Press et al., Numerical Recipes
// (fractional error below 1.2e-7).
export function PhiN(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * x);
  const erfc = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return z >= 0 ? 1 - erfc / 2 : erfc / 2;
}
export const crpsNormal = (y, sigma) => { const z = y / sigma; return sigma * (z * (2 * PhiN(z) - 1) + 2 * phiN(z) - 1 / SQRT_PI); };

export function fitCrps(zs, y) {
  const p = zs[0].length + 1;
  const loss = (w) => {
    let f = 0;
    const g = zeros(p);
    zs.forEach((z, i) => {
      const x = [1, ...z];
      const sigma = Math.exp(dot(w, x));
      f += crpsNormal(y[i], sigma);
      const d = (2 * phiN(y[i] / sigma) - 1 / SQRT_PI) * sigma;
      for (let k = 0; k < p; ++k) g[k] += d * x[k];
    });
    return { f: f / y.length, g: g.map((v) => v / y.length) };
  };
  // BFGS with a backtracking line search.
  let w = zeros(p);
  w[0] = Math.log(Math.sqrt(y.reduce((s, v) => s + v * v, 0) / y.length) || 1e-6);
  let H = Array.from({ length: p }, (_, i) => zeros(p).map((_, j) => (i === j ? 1 : 0)));
  let cur = loss(w);
  let iterations = 0;
  for (; iterations < 500; ++iterations) {
    const dir = H.map((row) => -dot(row, cur.g));
    let step = 1, next, wn;
    for (let k = 0; k < 40; ++k) {
      wn = w.map((v, i) => v + step * dir[i]);
      next = loss(wn);
      if (next.f <= cur.f + 1e-4 * step * dot(cur.g, dir)) break;
      step /= 2;
    }
    const sv = wn.map((v, i) => v - w[i]), yv = next.g.map((v, i) => v - cur.g[i]);
    const sy = dot(sv, yv);
    w = wn;
    const done = Math.abs(cur.f - next.f) < 1e-12 * Math.max(1, Math.abs(cur.f)) && Math.max(...next.g.map(Math.abs)) < 1e-9;
    cur = next;
    if (done) break;
    if (sy > 1e-16) {
      const rho = 1 / sy;
      const Hy = H.map((row) => dot(row, yv));
      const yHy = dot(yv, Hy);
      H = H.map((row, i) => row.map((h, j) => h - rho * (Hy[i] * sv[j] + sv[i] * Hy[j]) + (rho * rho * yHy + rho) * sv[i] * sv[j]));
    }
  }
  return { w, meanCrps: cur.f, iterations };
}
export const sigmaOf = (fit, z) => Math.exp(dot(fit.w, [1, ...z]));
