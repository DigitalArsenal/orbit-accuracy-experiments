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
const COMMON = { sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01 };
const cannon = { parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]) };
const ecom = (terms) => ({ parameters: terms.map((t) => ({ kind: `ECOM2_${t}`, value: 0 })), fixed: { agom: 0 }, apriori: apriori(terms.map((t) => (t === 'D0' ? 1e-6 : 1e-7))) });
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
  // the full setting, cannonball radiation fitted; Fbest adds ocean tides and Earth radiation pressure
  Ffull: { forces: FULL, integrator: I10, ...COMMON, ...cannon },
  Fbest: { forces: { ...FULL, oceanTides: true, earthRadiation: true }, integrator: I10, ...COMMON, ...cannon },
};
/** The settings flown per regime beside the reduced one (refly.mjs): CONFIGURED as FFMc, FULL as FFMq (where it is the configured one, FFMc's row). */
export const CONFIGURED = { T: 'L40S', P: 'L40S', S1: 'L40S', LS: 'L40S', DO: 'L40S', GD: 'Ffull', GN: 'E5', GN_GAL: 'E5', IG: 'E5', GE: 'E5', WA: 'E5', HX: 'Ffull', HE: 'Ffull', HE72: 'Ffull' };
export const FULL_SETTING = { T: 'L70S', P: 'L70S', S1: 'L70S', LS: 'L70S', DO: 'L70S', GD: 'Ffull', GN: 'E5F', GN_GAL: 'E5F', IG: 'E5F', GE: 'E5F', WA: 'E5F', HX: 'Ffull', HE: 'Ffull', HE72: 'Ffull' };
export const reducedFor = (high) => (high ? 'F20' : 'L40');
