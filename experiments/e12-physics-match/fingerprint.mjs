// Residual fingerprints (PLAN.md section 6): the shape of the difference
// between a fitted orbit and the published states, as a fixed-length feature
// vector a classifier can read. Inputs are module outputs: the GCRF residual
// vectors and fitted states of fit.mjs scoreHypothesis, foundation/frames' RTN
// rotation of each fitted state, and the Sun's position from propagator/hpop.
// Everything here is statistics on those outputs (least-squares projections,
// RMS, ratios) and the geometry of where each point sits (orbit phase,
// cylindrical shadow); no orbit is computed.
const R_EARTH = 6378137;
const OMEGA_EARTH = 7.2921150e-5; // rad/s, for the Earth-fixed phase only
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const n = Math.hypot(...a); return a.map((x) => x / n); };
const rms = (xs) => (xs.length ? Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length) : 0);
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const log10 = (x) => Math.log10(Math.max(x, 1e-9));

// Least squares y ~ X b (columns as functions of the sample index): returns b.
function lsq(columns, y) {
  const p = columns.length, n = y.length;
  const A = Array.from({ length: p }, () => Array(p).fill(0)), r = Array(p).fill(0);
  for (let k = 0; k < n; ++k) for (let i = 0; i < p; ++i) { r[i] += columns[i][k] * y[k]; for (let j = 0; j < p; ++j) A[i][j] += columns[i][k] * columns[j][k]; }
  for (let i = 0; i < p; ++i) A[i][i] += 1e-12 * (A[i][i] || 1);
  // Gaussian elimination with partial pivoting.
  for (let c = 0; c < p; ++c) {
    let m = c; for (let i = c + 1; i < p; ++i) if (Math.abs(A[i][c]) > Math.abs(A[m][c])) m = i;
    [A[c], A[m]] = [A[m], A[c]]; [r[c], r[m]] = [r[m], r[c]];
    for (let i = c + 1; i < p; ++i) { const f = A[i][c] / A[c][c]; for (let j = c; j < p; ++j) A[i][j] -= f * A[c][j]; r[i] -= f * r[c]; }
  }
  const b = Array(p).fill(0);
  for (let i = p - 1; i >= 0; --i) { let s = r[i]; for (let j = i + 1; j < p; ++j) s -= A[i][j] * b[j]; b[i] = s / A[i][i]; }
  return b;
}

// The feature names, in vector order.
export const FEATURES = (() => {
  const out = ['log_fit_rms', 'log_closure_rms', 'log_closure_max', 'log_closure_over_fit', 'altitude_km', 'inclination_deg', 'radius_spread', 'span_days', 'log_step_s'];
  for (const c of ['R', 'T', 'N']) out.push(`${c}_fit_share`, `${c}_closure_share`, `${c}_mean`);
  out.push('T_closure_lin', 'T_closure_quad', 'R_closure_lin', 'N_closure_lin');
  for (const c of ['R', 'T', 'N']) for (const k of [1, 2, 3]) out.push(`${c}_rev${k}`);
  for (const c of ['R', 'T', 'N']) out.push(`${c}_rev1_growth`);
  for (const c of ['R', 'T', 'N']) out.push(`${c}_daily`);
  for (const c of ['R', 'T']) for (const k of [1, 2]) out.push(`${c}_earthfixed${k}`);
  out.push('R_shadow_step', 'T_shadow_step', 'shadow_fraction', 'T_entry_exit');
  return out;
})();

// residuals [[m]] and states [[m, m/s]] at points [{ms, epoch}], the RTN rows
// of each state (axes [[9]]), Sun unit vectors per point (sunDirs), midMs,
// scores {fitRms, closureRms, closureMax}. Returns {vector, named}.
export function fingerprint({ points, residuals, states, axes, sunDirs, midMs, scores }) {
  const n = points.length;
  const t0 = points[0].ms;
  const tDays = points.map((p) => (p.ms - t0) / 86400000);
  const rtn = residuals.map((d, k) => [0, 1, 2].map((row) => axes[k][3 * row] * d[0] + axes[k][3 * row + 1] * d[1] + axes[k][3 * row + 2] * d[2]));
  // Orbit phase u (from the ascending node) of each point, from its RTN axes.
  const u = axes.map((a) => {
    const R = [a[0], a[1], a[2]], N = [a[6], a[7], a[8]];
    const node = unit(cross([0, 0, 1], N));
    return Math.atan2(dot(cross(node, R), N), dot(node, R));
  });
  const radius = states.map((s) => Math.hypot(s[0], s[1], s[2]));
  const meanR = mean(radius);
  const inc = Math.acos(Math.max(-1, Math.min(1, mean(axes.map((a) => a[8]))))) * 180 / Math.PI;
  const span = tDays.at(-1), step = (points[1].ms - points[0].ms) / 1000;
  const first = [], second = [];
  points.forEach((p, k) => (p.ms <= midMs ? first : second).push(k));
  const comp = (c, idx) => idx.map((k) => rtn[k][c]);
  const total = rms(rtn.map((v) => Math.hypot(...v))) || 1e-9;
  const named = {
    log_fit_rms: log10(scores.fitRms), log_closure_rms: log10(scores.closureRms), log_closure_max: log10(scores.closureMax),
    log_closure_over_fit: log10(scores.closureRms) - log10(scores.fitRms),
    altitude_km: (meanR - R_EARTH) / 1000, inclination_deg: inc, radius_spread: (Math.max(...radius) - Math.min(...radius)) / meanR,
    span_days: span, log_step_s: Math.log10(step),
  };
  const fitTotal = rms(first.map((k) => Math.hypot(...rtn[k]))) || 1e-9, closeTotal = rms(second.map((k) => Math.hypot(...rtn[k]))) || 1e-9;
  ['R', 'T', 'N'].forEach((c, i) => {
    named[`${c}_fit_share`] = rms(comp(i, first)) / fitTotal;
    named[`${c}_closure_share`] = rms(comp(i, second)) / closeTotal;
    named[`${c}_mean`] = mean(rtn.map((v) => v[i])) / total;
  });
  // Closure trends: T ~ a + b tau + c tau^2 on the second half (tau days from mid).
  const tau = second.map((k) => (points[k].ms - midMs) / 86400000);
  const ones = tau.map(() => 1);
  const [, bT, cT] = lsq([ones, tau, tau.map((x) => x * x)], comp(1, second));
  const [, bR] = lsq([ones, tau], comp(0, second));
  const [, bN] = lsq([ones, tau], comp(2, second));
  Object.assign(named, { T_closure_lin: bT / total, T_closure_quad: cT / total, R_closure_lin: bR / total, N_closure_lin: bN / total });
  // Harmonics of the orbit phase, after a quadratic trend per component.
  const quad = [tDays.map(() => 1), tDays, tDays.map((x) => x * x)];
  const theta = points.map((p) => OMEGA_EARTH * (p.ms - t0) / 1000);
  ['R', 'T', 'N'].forEach((c, i) => {
    const y = rtn.map((v) => v[i]);
    const trend = lsq(quad, y);
    const z = y.map((v, k) => v - trend[0] - trend[1] * tDays[k] - trend[2] * tDays[k] ** 2);
    const harmonic = (phase) => { const [a, b] = lsq([phase.map(Math.cos), phase.map(Math.sin)], z); return Math.hypot(a, b) / total; };
    for (const k of [1, 2, 3]) named[`${c}_rev${k}`] = harmonic(u.map((x) => k * x));
    const [, , a1, b1] = lsq([u.map(Math.cos), u.map(Math.sin), u.map((x, k) => tDays[k] * Math.cos(x)), u.map((x, k) => tDays[k] * Math.sin(x))], z);
    named[`${c}_rev1_growth`] = Math.hypot(a1, b1) / total;
    named[`${c}_daily`] = harmonic(tDays.map((x) => 2 * Math.PI * x));
    if (i < 2) for (const k of [1, 2]) named[`${c}_earthfixed${k}`] = harmonic(u.map((x, j) => k * (x - theta[j])));
  });
  // Shadow: cylindrical umbra of each fitted position (geometry only).
  const shadow = states.map((s, k) => { const r = s.slice(0, 3), proj = dot(r, sunDirs[k]); return proj < 0 && Math.hypot(...r.map((x, j) => x - proj * sunDirs[k][j])) < R_EARTH; });
  const inS = [], outS = [];
  shadow.forEach((f, k) => (f ? inS : outS).push(k));
  const detrended = (i) => { const y = rtn.map((v) => v[i]); const tr = lsq([...quad, u.map(Math.cos), u.map(Math.sin)], y); return y.map((v, k) => v - tr[0] - tr[1] * tDays[k] - tr[2] * tDays[k] ** 2 - tr[3] * Math.cos(u[k]) - tr[4] * Math.sin(u[k])); };
  const dR = detrended(0), dT = detrended(1);
  named.R_shadow_step = inS.length && outS.length ? (mean(inS.map((k) => dR[k])) - mean(outS.map((k) => dR[k]))) / total : 0;
  named.T_shadow_step = inS.length && outS.length ? (mean(inS.map((k) => dT[k])) - mean(outS.map((k) => dT[k]))) / total : 0;
  named.shadow_fraction = inS.length / n;
  const entries = [], exits = [];
  for (let k = 1; k < n; ++k) { if (shadow[k] && !shadow[k - 1]) entries.push(k); if (!shadow[k] && shadow[k - 1]) exits.push(k); }
  const slope = (k) => (k + 1 < n ? dT[k + 1] - dT[k - 1] : 0);
  named.T_entry_exit = entries.length && exits.length ? (mean(entries.map(slope)) - mean(exits.map(slope))) / total : 0;
  return { vector: FEATURES.map((f) => (Number.isFinite(named[f]) ? named[f] : 0)), named };
}

// Sun unit vectors at every point from hourly Sun positions (linear
// interpolation of the direction; the Sun moves 0.04 deg an hour).
export async function sunDirections(env, points) {
  const t0 = Math.floor(points[0].ms / 3600000) * 3600000, t1 = Math.ceil(points.at(-1).ms / 3600000) * 3600000;
  const hours = []; for (let t = t0; t <= t1; t += 3600000) hours.push(new Date(t).toISOString());
  const sun = (await env.sunPositions(hours)).map(unit);
  return points.map((p) => { const x = (p.ms - t0) / 3600000, i = Math.min(Math.floor(x), sun.length - 2), f = x - i; return unit(sun[i].map((v, j) => v + f * (sun[i + 1][j] - v))); });
}
