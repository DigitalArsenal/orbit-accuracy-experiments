// The model of PLAN.md section 2, as statistics on stored rows: P_w(L) = D_o g_w(L) P_C2(L) D_o + C_w. Arithmetic on covariance terms only; every d2 is gp-error-model pair_statistics.
// A lower-6 RTN matrix is [RR, TR, TT, NR, NT, NN]. No orbit computation here.
export const AXES = [0, 2, 5]; // the diagonal of a lower-6 matrix: R, T, N
const unit = { RR: [1, 0, 0, 0, 0, 0], TT: [0, 0, 1, 0, 0, 0], NN: [0, 0, 0, 0, 0, 1] };

/** C2's frozen class covariance from a lead's stored terms: k_e A + diag(f^2) + q_T U_T + q_RN (U_R + U_N) + s2 D_tau (lower 6, m^2). */
export function pC2(p, t) {
  const m = [0, 0, 0, 0, 0, 0];
  const add = (w, c) => { for (let k = 0; k < 6; k += 1) m[k] += w * c[k]; };
  add(p.k_e, t.A);
  if (p.f_R) add(p.f_R ** 2, unit.RR);
  if (p.f_T) add(p.f_T ** 2, unit.TT);
  if (p.f_N) add(p.f_N ** 2, unit.NN);
  if (p.q_T) add(p.q_T, t.UT);
  if (p.q_RN) { add(p.q_RN, t.UR); add(p.q_RN, t.UN); }
  if (p.s2) add(p.s2, p.tau === 'inf' ? t.Dinf : t.D1);
  return m;
}
/** D g P D with D = diag(e^(u_k/2)): lower 6. */
export function scaled(m, g, u = [0, 0, 0]) {
  const d = u.map((x) => Math.exp(x / 2));
  return [m[0] * g * d[0] * d[0], m[1] * g * d[1] * d[0], m[2] * g * d[1] * d[1], m[3] * g * d[2] * d[0], m[4] * g * d[2] * d[1], m[5] * g * d[2] * d[2]];
}
/** C2-A1's NSGF truth term as a variance per axis: statedSigmaM^2 / 2 (R2 only). */
export const truthTerm = (sigma) => (sigma ? (sigma * sigma) / 2 : 0);
/** ln det of a lower-6 matrix plus a diagonal term. */
export function logDet(m, c = 0) {
  const a = m[0] + c, b = m[1], cc = m[2] + c, d = m[3], e = m[4], f = m[5] + c;
  return Math.log(Math.max(a * (cc * f - e * e) - b * (b * f - e * d) + d * (b * e - cc * d), 1e-300));
}
/** The per-sample log score from d2 and the composed covariance. */
export const logScore = (d2, m, c = 0) => -0.5 * (d2 + logDet(m, c) + 3 * Math.log(2 * Math.PI));

/** (a) g_w(L) = (chi2nu_w / chi2nu~_o(E))^(a0 + a1 log10 L), unclamped. */
export const gOf = (chi, chiRef, a0, a1, L) => (chiRef > 0 && chi > 0 ? (chi / chiRef) ** (a0 + a1 * Math.log10(L)) : 1);

const median = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
export { median };

/**
 * axes-mle-ref (b): u = argmin 1/2 sum_j [e_j^2 / (e^u a_j + c_j) + ln(e^u a_j + c_j)] + (n0/4) u^2, for one axis and lead. A coarse scan, then golden-section with a fixed count, so the
 * result is the same on every run. samples [{ e, a, c }]; no samples: 0.
 */
export function axesMleRef(samples, n0) {
  if (!samples.length) return 0;
  const f = (u) => { const eu = Math.exp(u); let s = (n0 / 4) * u * u; for (const { e, a, c } of samples) { const v = eu * a + c; s += 0.5 * ((e * e) / v + Math.log(v)); } return s; };
  let best = -14, fb = Infinity;
  for (let u = -14; u <= 14 + 1e-9; u += 0.25) { const y = f(u); if (y < fb) { fb = y; best = u; } }
  let lo = best - 0.25, hi = best + 0.25;
  const R = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - R * (hi - lo), x2 = lo + R * (hi - lo), f1 = f(x1), f2 = f(x2);
  for (let i = 0; i < 80; i += 1) {
    if (f1 <= f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - R * (hi - lo); f1 = f(x1); } else { lo = x1; x1 = x2; f1 = f2; x2 = lo + R * (hi - lo); f2 = f(x2); }
  }
  return (lo + hi) / 2;
}

/** Availability (PLAN.md section 2): a file with last epoch `lastMs` of a family is available at max(last epoch + lambda, Last-Modified). */
const GPS_EPOCH = Date.UTC(1980, 0, 6);
export function availableAt(family, lastMs, lastModifiedMs = null, lambdaDays = { nsgf: 3, ilrsa: 11, esaAfterBatch: 14 }) {
  const DAY = 86400e3;
  let t;
  if (family === 'nsgf') t = lastMs + lambdaDays.nsgf * DAY;
  else if (family === 'ilrsa') t = lastMs + lambdaDays.ilrsa * DAY;
  else { const week = Math.floor((lastMs - 1000 - GPS_EPOCH) / (7 * DAY)); t = GPS_EPOCH + (week + 1) * 7 * DAY + lambdaDays.esaAfterBatch * DAY; }
  return lastModifiedMs ? Math.max(t, lastModifiedMs) : t;
}
