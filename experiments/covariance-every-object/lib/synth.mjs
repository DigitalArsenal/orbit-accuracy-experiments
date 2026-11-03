// Synthetic objects for acceptance (a): seeded, correlated 6x6 P_strat with |rho| up to 0.95. No data.
export function rng(seed) { // mulberry32
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const normal = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/** Correlation R = w w' + v v' + diag(1 - w^2 - v^2); a pair with w_i = w_j = sqrt(rho) has corr rho. */
export function synthP(r, rhoTarget) {
  const n = 6, w = [], v = [];
  for (let i = 0; i < n; i++) {
    const sgn = r() < 0.5 ? -1 : 1;
    w.push(sgn * Math.sqrt(i < 2 ? rhoTarget : rhoTarget * r()));
    v.push(0.05 * (r() - 0.5));
  }
  const R = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => w[i] * w[j] + v[i] * v[j] + (i === j ? 1 - w[i] ** 2 - v[i] ** 2 : 0)));
  const sd = [0, 1, 2].map(() => Math.exp(Math.log(50) + r() * Math.log(100))); // 50 m .. 5 km position
  const sds = [...sd, ...sd.map((x) => x * 1e-3 * (0.5 + r()))]; // velocity sd, m/s
  let maxRho = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) maxRho = Math.max(maxRho, Math.abs(R[i][j]));
  return { P: R.map((row, i) => row.map((x, j) => x * sds[i] * sds[j])), maxRho };
}
