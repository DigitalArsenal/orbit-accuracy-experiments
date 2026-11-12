// The numerical propagator's settings (FFM forces, integrator and what the fit estimates). No module here.
/** lib/host.mjs apriori: diagonal, position 100 km, velocity 10 m/s, each parameter by its own sigma. */
export function apriori(parameterSigmas = []) {
  const diag = [...Array(3).fill(1e10), ...Array(3).fill(100), ...parameterSigmas.map((s) => s * s)];
  const m = diag.length;
  return Array.from({ length: m * m }, (_, j) => (Math.floor(j / m) === j % m ? diag[j % m] : 0));
}
const LITE = { degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined };
const FULL = { degree: 70, order: 70, thirdBodies: [10, 301], srp: true, drag: false, solidTides: true, relativity: 'IERS_2010' };
const LOW40 = { degree: 40, order: 40, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined };
const LOW70 = { degree: 70, order: 70, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: 'IERS_2010' };
const I8_300 = { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, I8_120 = { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, I10 = { tolerance: 1e-10, maxStep: 120, minStep: 1e-4 };
const I13 = { tolerance: 1e-13, maxStep: 120, minStep: 1e-4 };
/** The weight of a reference's positions in a fit: sigma = max(OBSERVATION_SIGMA_FLOOR_M, the object's median piece closure), fixed before the
 *  fit from the burn detector's list (lib/arms.mjs objectSigmaM). An object with no list, or whose pieces close within the floor (every precise
 *  orbit measured so far but the laser geodetic satellites' and the WAAS broadcast ephemeris's), is weighed at the floor, the one sigma of
 *  every fit before this rule. */
export const OBSERVATION_SIGMA_FLOOR_M = 10;
const COMMON = { sigmaM: OBSERVATION_SIGMA_FLOOR_M, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01 };
const cannon = { parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]) };
/** The a priori sigma (m/s^2) of each ECOM2 term of the five-term arms: D0 1e-6 and 1e-7 on the other four, which a precise reference determines
 *  itself (E5, E5F: the navigation, geostationary and inclined geosynchronous rows). */
const ecom = (terms, sigma = (t) => (t === 'D0' ? 1e-6 : 1e-7)) => ({ parameters: terms.map((t) => ({ kind: `ECOM2_${t}`, value: 0 })), fixed: { agom: 0 }, apriori: apriori(terms.map(sigma)) });
/** The prior of E5G: of the rows fitted with the four empirical terms (the E5 settings), one whose reference's own noise is above the 10 m floor
 *  (OBSERVATION_SIGMA_FLOOR_M) takes the prior sized from the precise-reference geosynchronous rows, because its data cannot determine Y0, B0,
 *  B1cos and B1sin; a row with a precise reference keeps the terms free. D0 stays free at 1e-6. Y0, B0, B1cos and B1sin are three times the 95th percentile of their absolute value over 115 fits of the
 *  geostationary and inclined geosynchronous rows with the terms free (95 fits of 72 h and 20 of 24 h; a precise orbit of the satellite is the
 *  reference): 95th percentiles 2.26e-9, 1.42e-9, 1.20e-8 and 2.33e-9, largest 3.12e-9, 1.99e-9, 2.59e-8 and 4.20e-9. The commercial geostationary
 *  row (E5G) is the one row on it: its reference, the WAAS broadcast ephemeris, closes to 127 to 572 m over 6 h pieces, and under the free terms its
 *  24 h fits carry B1cos of 1e-7 to 3e-7 (ten times any precise-reference satellite) that forecast worse than a sphere. Where it was measured on
 *  precise-reference rows the prior does not hold: the two navigation rows' median numerical day-5 error at 24 h rose by 1.5 m and 3.4 m on samples
 *  of 12 windows each, and on the geostationary row 4 of 8 windows at 24 h were worse, by up to 22.8 m: those rows keep E5 and E5F. */
export const ECOM2_PRIOR_SIGMA = { D0: 1e-6, Y0: 6.78e-9, B0: 4.25e-9, B1_COS: 3.59e-8, B1_SIN: 6.98e-9 };
const E5 = ['D0', 'Y0', 'B0', 'B1_COS', 'B1_SIN'];
const dragSrp = (bSeed = 0.01, bSigma = 0.1) => ({ parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: bSeed }, { kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([bSigma, 0.2]) });
/** Each setting: forces, integrator and estimation. table.mjs names the one it compares in plain words from these fields. */
export const SETTINGS = {
  // reduced (the published cells' numerical arm: all-regimes.mjs ffmHigh / ffmLow)
  F20: { forces: LITE, integrator: I8_300, ...COMMON, ...cannon },
  L40: { forces: LOW40, integrator: I8_120, ...COMMON, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]) },
  // drag and radiation coefficient fitted, below 8,400 km
  L40S: { forces: LOW40, integrator: I8_120, ...COMMON, ...dragSrp() },
  L70S: { forces: LOW70, integrator: I10, ...COMMON, ...dragSrp() },
  // L70S at tolerance 1e-13 (stack #520): with drag, the integration restarts at each change of the weather rows, and at 1e-10 the steps
  // after a restart leave the flight meters to tens of meters from the converged orbit; at 1e-13 under 1 m
  L70S13: { forces: LOW70, integrator: I13, ...COMMON, ...dragSrp() },
  // ECOM2 radiation, navigation and geosynchronous buses
  E5: { forces: LITE, integrator: I8_300, ...COMMON, ...ecom(E5) },
  E5F: { forces: FULL, integrator: I10, ...COMMON, ...ecom(E5) },
  // E5 and E5F with the prior of ECOM2_PRIOR_SIGMA: the commercial geostationary row's configured and full settings (E5GL, E5G)
  E5GL: { forces: LITE, integrator: I8_300, ...COMMON, ...ecom(E5, (t) => ECOM2_PRIOR_SIGMA[t]) },
  E5G: { forces: FULL, integrator: I10, ...COMMON, ...ecom(E5, (t) => ECOM2_PRIOR_SIGMA[t]) },
  // E5F with D0 alone (the sphere's own term): the comparison arm of before-next-event.mjs, never a row's arm
  E1F: { forces: FULL, integrator: I10, ...COMMON, ...ecom(['D0']) },
  // the full setting, cannonball radiation fitted; Fbest adds ocean tides and Earth radiation pressure
  Ffull: { forces: FULL, integrator: I10, ...COMMON, ...cannon },
  Fbest: { forces: { ...FULL, oceanTides: true, earthRadiation: true }, integrator: I10, ...COMMON, ...cannon },
};
/** The settings flown per regime beside the reduced one (refly.mjs): CONFIGURED as FFMc, FULL as FFMq (where it is the configured one, FFMc's row). */
export const CONFIGURED = { T: 'L40S', P: 'L40S', S1: 'L40S', LS: 'L40S', DO: 'L40S', GD: 'Ffull', GN: 'E5', GN_GAL: 'E5', IG: 'E5', GE: 'E5', WA: 'E5GL', HX: 'Ffull', HE: 'Ffull', HE72: 'Ffull' };
export const FULL_SETTING = { T: 'L70S', P: 'L70S', S1: 'L70S', LS: 'L70S', DO: 'L70S', GD: 'Ffull', GN: 'E5F', GN_GAL: 'E5F', IG: 'E5F', GE: 'E5F', WA: 'E5G', HX: 'Ffull', HE: 'Ffull', HE72: 'Ffull' };
export const reducedFor = (high) => (high ? 'F20' : 'L40');
