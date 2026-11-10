// The numerical arms' settings, by the names the round-0 referee gave them (rerun/ref-ffm.mjs), with what each may be called. No module here.
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
const COMMON = { sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01 };
const cannon = { parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]) };
const ecom = (terms) => ({ parameters: terms.map((t) => ({ kind: `ECOM2_${t}`, value: 0 })), fixed: { agom: 0 }, apriori: apriori(terms.map((t) => (t === 'D0' ? 1e-6 : 1e-7))) });
const E5 = ['D0', 'Y0', 'B0', 'B1_COS', 'B1_SIN'];
const dragSrp = (bSeed = 0.01, bSigma = 0.1) => ({ parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: bSeed }, { kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([bSigma, 0.2]) });
/** Each arm: forces, integrator and estimation. */
export const SETTINGS = {
  // the reduced setting the published cells flew (all-regimes.mjs ffmHigh / ffmLow; truth-compare.mjs the same): not "full-force"
  F20: { describe: 'reduced, above 8,400 km: 20x20, Sun and Moon, cannonball radiation coefficient fitted, no tides, no relativity, RK78 1e-8, steps to 300 s', forces: LITE, integrator: I8_300, ...COMMON, ...cannon },
  L40: { describe: 'reduced, below 8,400 km: 40x40, Sun and Moon, solid tides, NRLMSISE-00 drag fitted, radiation coefficient held at 0.02 m2/kg, RK78 1e-8, steps to 120 s', forces: LOW40, integrator: I8_120, ...COMMON, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]) },
  // configured (REF-1 to REF-3, BUD-1, BUD-2) and the extras the findings ask for
  L40S: { describe: '40x40, Sun and Moon, solid tides, NRLMSISE-00 drag and radiation coefficient fitted (seed 0.02, sigma 0.2 m2/kg), RK78 1e-8, steps to 120 s', forces: LOW40, integrator: I8_120, ...COMMON, ...dragSrp() },
  L70S: { describe: '70x70, Sun and Moon, solid tides, relativity, NRLMSISE-00 drag and radiation coefficient fitted, RK78 1e-10, steps to 120 s', forces: LOW70, integrator: I10, ...COMMON, ...dragSrp() },
  L40S_B2: { describe: 'L40S with the drag prior AP uses at 600 to 800 km (seed 0.002, sigma 0.002 m2/kg)', forces: LOW40, integrator: I8_120, ...COMMON, ...dragSrp(0.002, 0.002) },
  E5: { describe: '20x20, Sun and Moon, ECOM2 D0, Y0, B0, B1 cos, B1 sin fitted from zero (no cannonball), no tides, no relativity, RK78 1e-8, steps to 300 s', forces: LITE, integrator: I8_300, ...COMMON, ...ecom(E5) },
  E5F: { describe: 'registered full setting with ECOM2: 70x70, Sun and Moon, solid tides, relativity, ECOM2 D0, Y0, B0, B1 cos, B1 sin fitted from zero, RK78 1e-10, steps to 120 s', forces: FULL, integrator: I10, ...COMMON, ...ecom(E5) },
  Ffull: { describe: 'registered full setting: 70x70, Sun and Moon, solid tides, relativity, cannonball fitted, RK78 1e-10, steps to 120 s', forces: FULL, integrator: I10, ...COMMON, ...cannon },
  Fbest: { describe: 'Ffull plus ocean tides (FES2004 to degree 30) and Earth radiation pressure (Knocke)', forces: { ...FULL, oceanTides: true, earthRadiation: true }, integrator: I10, ...COMMON, ...cannon },
  // BUD-3's model orbit (flown only, never fitted): conservative forces alone, from the qualified fit's state
  Fcons: { describe: 'model orbit: 70x70, Sun and Moon, solid tides, relativity, no drag, no radiation pressure, RK78 1e-10, steps to 120 s', forces: { ...FULL, srp: false }, integrator: I10, ...COMMON, parameters: [], fixed: {}, apriori: [] },
};
/** The configured reference per group: REF-1 radiation coefficient fitted in low orbit; REF-2 ECOM2 for navigation and geosynchronous buses; REF-3
 *  the registered full setting on the geodetic spheres (Fbest flown beside it); the full setting, one model whatever the radius, on the eccentric
 *  orbits (BUD-7). */
export const CONFIGURED = { T: 'L40S', P: 'L40S', S1: 'L40S', LS: 'L40S', DO: 'L40S', GD: 'Ffull', GN: 'E5', GN_GAL: 'E5', IG: 'E5', GE: 'E5', WA: 'E5', HX: 'Ffull', HE: 'Ffull' };
/** The qualified reference per group (goal.md, qualification 1): the registered full settings (70x70, solid tides, relativity, 1e-10) with the
 *  radiation model fitted for the satellite: a coefficient on spheres and eccentric orbits, ECOM2 on navigation and geosynchronous buses, drag
 *  fitted below 8,400 km. Where it is the configured arm, the configured row stands for it. */
export const QUALIFIED = { T: 'L70S', P: 'L70S', S1: 'L70S', LS: 'L70S', DO: 'L70S', GD: 'Ffull', GN: 'E5F', GN_GAL: 'E5F', IG: 'E5F', GE: 'E5F', WA: 'E5F', HX: 'Ffull', HE: 'Ffull' };
export const isFullSetting = (arm) => { const s = SETTINGS[arm]; return !!s && s.forces.degree >= 70 && s.forces.solidTides && !!s.forces.relativity && s.integrator.tolerance <= 1e-10 && s.parameters.some((p) => p.kind === 'SRP_AREA_OVER_MASS' || p.kind.startsWith('ECOM2_')); };
export const reducedFor = (high) => (high ? 'F20' : 'L40');
