// Covariates of E1's methods (PLAN.md §4), built from the module-computed
// geometry in geometry.mjs. Each method's design row is a function of one
// set's geometry and the train-window scales in `scales`.
//
// Moon and Sun "anomaly" pair: the geocentric distance and its rate, each
// divided by its train-window standard deviation, with the distance about
// its train mean and its sign reversed. For a near-Keplerian body these are
// close to (cos M, sin M) of its mean anomaly M, up to a scale.
//
// Plane geometry: the unit vector to the body in the orbit plane's axes
// (x toward the ascending node, y in the plane, z the orbit normal), which
// geometry.mjs takes from the modules as the in-plane angle λ and the
// elevation β. M3c uses the real solid harmonics of that unit vector up to
// degree K — the directional terms of a third body's potential.

export function scalesOf(geoms) {
  const stat = (xs) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return { mean: m, sd: Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) };
  };
  return {
    moonDistance: stat(geoms.map((g) => g.moon.distanceKm)), moonRate: stat(geoms.map((g) => g.moon.rateKmS)),
    sunDistance: stat(geoms.map((g) => g.sun.distanceKm)), sunRate: stat(geoms.map((g) => g.sun.rateKmS)),
  };
}

function anomaly(g, scales) {
  return {
    mc: -(g.moon.distanceKm - scales.moonDistance.mean) / scales.moonDistance.sd,
    ms: g.moon.rateKmS / scales.moonRate.sd,
    sc: -(g.sun.distanceKm - scales.sunDistance.mean) / scales.sunDistance.sd,
    ss: g.sun.rateKmS / scales.sunRate.sd,
  };
}

// Real solid harmonics (unnormalized) of a unit vector, degrees 1..K.
function harmonics(lambda, beta, K) {
  const x = Math.cos(beta) * Math.cos(lambda), y = Math.cos(beta) * Math.sin(lambda), z = Math.sin(beta);
  const out = [x, y, z];
  if (K >= 2) out.push(x * y, x * z, y * z, x * x - y * y, 3 * z * z - 1);
  if (K >= 3) out.push(x * (x * x - 3 * y * y), y * (3 * x * x - y * y), z * (x * x - y * y), x * y * z, x * (5 * z * z - 1), y * (5 * z * z - 1), z * (5 * z * z - 3));
  return out;
}

// Design rows (before standardization), per method.
export const designs = {
  // M3a, Ly et al. (2020) as reconstructed: a satellite mean (fixed effect)
  // plus a Moon-distance seasonal term whose phase moves with the Sun's
  // distance, linearized: (cos M☾, sin M☾) and their products with
  // (cos M☉, sin M☉).
  M3a: (g, scales) => {
    const a = anomaly(g, scales);
    return [a.mc, a.ms, a.sc * a.mc, a.sc * a.ms, a.ss * a.mc, a.ss * a.ms];
  },
  // M3b, Hallgarten La Casta & Amato (2025): one sinusoid in the Moon's mean
  // anomaly whose amplitude is a sinusoid of the right ascension of the
  // ascending node, one parameter set: [1, sin Ω, cos Ω] ⊗ (cos M☾, sin M☾).
  M3b: (g, scales) => {
    const a = anomaly(g, scales);
    const so = Math.sin(g.raan), co = Math.cos(g.raan);
    return [a.mc, a.ms, so * a.mc, so * a.ms, co * a.mc, co * a.ms];
  },
  // M3c (ours): solid harmonics of the Moon's and the Sun's directions in the
  // orbit plane up to degree K, and both anomaly pairs.
  M3c: (g, scales, K) => {
    const a = anomaly(g, scales);
    return [...harmonics(g.moon.lambda, g.moon.beta, K), ...harmonics(g.sun.lambda, g.sun.beta, K), a.mc, a.ms, a.sc, a.ss];
  },
};

// M4's log-variance covariates: both anomaly pairs.
export const varianceCovariates = (g, scales) => { const a = anomaly(g, scales); return [a.mc, a.ms, a.sc, a.ss]; };
