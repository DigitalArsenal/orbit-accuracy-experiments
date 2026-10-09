# VCM parity

The bar for the stack's high-fidelity products: everything a Vector
Covariance Message carries (spacedatastandards.org
`survey/legacy-messages/vcm`) can be carried through PRW, propagated by
`propagator/hpop`, and produced by this repository's experiments with
covariance whose realism is measured. Status as of 2026-10-08, against
SDS 1.240.0 (schema on branch `task/prw-environment-20261008`, not yet
released) and space-data-network-modules branch `task/hpop-lockdown-20261008`
(`750b6399`). Orekit figures are the largest position difference over a day,
from `propagator/hpop/tests/orekit_reference.test.mjs`.

## Inputs: VCM field → PRW → HPOP

| VCM line | PRW (SDS 1.240.0) | HPOP | Evidence |
| --- | --- | --- | --- |
| J2K POS/VEL | `INITIAL.STATE` with `MEAN_EQUATOR_EQUINOX_J2000` axes | IAU 2000 frame bias in and out (states, covariance, STM, impulses, burns) | Orekit E1: LEO 9.1 mm, GPS 0.43 mm |
| ECI (TEME of date), EFG POS/VEL | — (redundant with J2K) | Not read; written by `analysis/vcm-adapter` | — |
| EPOCH TIME (UTC) | `TIMInstant` UTC; integration on TT | Exact two-part TT | `foundation/time`, V1 |
| GEOPOTENTIAL: EGM-96 mmZ,nnT | `GRAVITY_CHOICE` `EGM96`, `MAXIMUM_DEGREE`, `MAXIMUM_ORDER`, `MAXIMUM_TESSERAL_DEGREE` | Embedded EGM96 and EGM2008 to 70 | Orekit G1 (EGM96 70×70 GPS 0.43 mm; 36×36 LEO 9.1 mm), G2 (36Z,24T LEO 9.2 mm) |
| DRAG: JAC70/MSIS90, JBH09 | `ATMOSPHERE_MODEL` `JACCHIA_ROBERTS`, `JB2008`, `NRLMSISE00` | Jacchia-Roberts (GMAT port); JB2008 (Orekit port) on `JB2008_INDICES`; NRLMSISE-00 | Ports equal to their sources (bit for bit, 2e-14); Jacchia-Roberts against the diffusion equations integrated numerically, within 4.3 % (2 % from 300 km); Orekit J1 (JB2008 on SET indices) 1.6 cm. HASDM's dynamic calibration is not in a VCM and is not reproduced. |
| LUNAR/SOLAR ON/OFF | `ENABLE_THIRD_BODY`, `THIRD_BODY_IDS` [10, 301] | DE440 kernel | Orekit F4/Z1 |
| SOLAR RAD PRESS ON/OFF, AGOM | `ENABLE_SRP`, Cr·A/m from `REFLECTIVITY_COEFFICIENT`, `AREA_M2`, `INITIAL_MASS_KG` | Cannonball, conical shadow; steps end on the penumbra and umbra boundaries | Orekit F5/Z2: 9.8 mm (LEO), 300 s steps |
| SOLID EARTH TIDES ON/OFF | `SOLID_TIDES` `IERS_2010` | IERS 2010 §6.2 steps 1–2 | Orekit T1: LEO 9.1 mm, GPS 0.43 mm; V1 E-f |
| IN-TRACK THRUST ON/OFF, THRUST ACCEL | `IN_TRACK_ACCELERATION_M_S2` | Constant along N×r̂ | Orekit I1: 9.1 mm on a 560 m effect |
| BALLISTIC COEF B, BDOT | Cd·A/m from `DRAG_COEFFICIENT`·`AREA_M2`/`INITIAL_MASS_KG`; `DRAG_AREA_OVER_MASS_RATE_M2_KG_S` | B(t) = B + Ḃ (t − t₀) | Orekit B1: 1.2 cm on 1.4 km |
| SOLAR FLUX F10, AVG F10, AVG AP | `WEATHER` (held constant) or `SPACE_WEATHER` daily `$SPW` rows | NRLMSISE-00 and Jacchia-Roberts readings of the daily table | Orekit W1: LEO 1.5 cm on 4.4 km |
| TAI-UTC, UT1-UTC, UT1 RATE, POLAR MOT X,Y | `EARTH_ORIENTATION` `$EOP` rows | IAU 2006/2000A CIO chain with the rows | Orekit, every Earth-fixed case. `analysis/vcm-adapter` expands a VCM's single point to daily rows (UT1 − UTC moving at the stated rate, stepping at the stated leap second, polar motion held). |
| IAU 1980 NUTAT n TERMS | — | IAU 2006/2000A instead | Not reproduced (SP's truncated nutation is a frame approximation, not a dynamical input) |
| TIME CONST LEAP SECOND TIME | — | ERFA's leap-second table; the adapter's EOP rows step there | — |
| INTEGRATOR MODE, COORD SYS, STEP MODE, FIXED STEP, STEP SIZE SELECTION, INITIAL STEP SIZE, ERROR CONTROL | `INTEGRATOR` (algorithm, initial/min/max step, tolerances) | RK4/RKF45/RKF78/RK78/RKDP87/BS | Integrator choice is not reproduced; accuracy is set by our own tolerances (Orekit suite: ≤ 1.6 cm a day with samples, ≤ 2.8 cm for a final epoch alone, RK78 1e-13, 300 s steps) |
| PARTIALS: ANALYTIC / FULL NUM / FAST NUM | `STM_TECHNIQUE` `ANALYTIC` / `FINITE_DIFFERENCE` | Both | Orekit C1: STM columns 1.2e-5 (LEO), 4e-11 (GPS) |
| COVARIANCE (equinoctial, 6×6 to 10×10 with B, BDOT, AGOM, T, consider) | `INITIAL_COVARIANCE` with `DYNAMIC_PARAMETERS`, Cartesian SI | [[Φ, S], [0, I]] P₀ [[Φ, S], [0, I]]ᵀ, process noise on the state; the samples carried span by span | Orekit C1 parameter Jacobians: B 5.0e-6, BDOT 3.7e-6, AGOM 1.4e-4 (LEO) and 5e-10 (GPS), T 5.1e-6; `analysis/vcm-adapter` transforms the equinoctial covariance exactly (below) |
| VECTOR U,V,W SIGMAS | Derived from the covariance | — | The adapter reproduces the sample's printed sigmas from its covariance |
| WTD RMS, EDR, C.M. OFFSET | — | — | Orbit-determination metadata, not propagation inputs; the adapter scales the covariance by WTD RMS² by default, as SP's printed sigmas are |

## The adapter: `analysis/vcm-adapter`

`read` turns one VCM into the PRW request above, the daily EOP rows, a
`$VCM` record and a report; `write` turns HPOP's result back into a VCM.
The equinoctial covariance is transformed to Cartesian by J P Jᵀ with J
evaluated exactly (forward-mode dual numbers through the closed-form
conversion), the B, BDOT, AGOM and T rows the fit solved for carried as
`DYNAMIC_PARAMETERS`. The format states no units for the covariance. Four
messages settle the mean-motion row: the survey's sample (an ISS solution)
and three SP messages on hand, which are not redistributed (geostationary,
GPS, and an orbit of eccentricity 0.59 with perigee in the atmosphere). Read
as dn/n, with the covariance scaled by max(1, WTD RMS)², the transformed
covariance reproduces every printed U, V and W sigma of all four within 1 %.
No absolute unit does: the eccentric message's radial sigma is 45.8 m
printed and 45.8 m as dn/n, but 36.9 m with n in radians per 1000 s and
51.1 m in rev/day; radians per 1000 s, which the ISS sample alone had
suggested (8.40 m against 8.4), misses the geostationary and GPS radial
sigmas by factors of 2.0 and 1.7. The eccentric message (WTD RMS 0.86)
matches only unscaled, the others (1.09 to 1.15) only scaled. Tested: the
sample within 1 %, the private messages when `VCM_PRIVATE_DIR` names them, an
independent finite-difference Jacobian (2.3e-7 of the sigmas), and a round
trip VCM → HPOP → VCM → read in SP's number format (1.8e-5).

## Remaining gaps

1. **The units of the B, BDOT, AGOM and T rows of the covariance.** The
   printed sigmas do not cover them. The adapter reads the B and AGOM rows as
   fractions of their values by default, like the mean-motion row
   (`parameterRows: "fractional"`; 1.5 % to 9.7 % of the value in the four
   messages, against 0.38 to 5.6 times the value as printed). One measurement
   supports it: the GPS message, propagated a day by HPOP against ESA's final
   orbit for the satellite, has radial and in-track errors with RMS 0.46 and
   0.64 of their sigmas when its AGOM row is a fraction; as printed, the
   sigmas overstate the radial error about 20 times and the in-track error
   about 7 times after half a day (in-track sigma 1.29 km at 24 h against an
   error of 93 m). Cross-track, which the reading does not touch, is 1.27.
   One satellite over one day; E2's covariance-realism tests are where it
   gets calibrated. BDOT and T rows are still taken as printed.
2. **Consider parameters** (C1, C2, …) have no PRW force and are dropped.
3. **`$VCM` has no fields for B, BDOT, AGOM, T or the parameter rows of the
   covariance**; they travel in the PRW request and the adapter's report.
   Products that need them should be written as `$OCM` (the schema the
   `$VCM` header marks as its successor) or as VCM text.
4. **JBH09** runs as JB2008 on SET's indices, which a VCM does not carry; the
   caller supplies `jb2008_indices`.

## Outputs: producing VCM-equivalent products

A product is at parity when it carries a state, the model it was fitted
with (gravity, drag model and B/BDOT, AGOM, tides, thrust), the Earth
orientation and space weather it used, and a covariance over the state and
those parameters whose realism has been measured against precise orbits.
[E2](../experiments/e2-catalog-covariance/PLAN.md) is the experiment that
builds such products from public catalog history and from the at-epoch
corrections of [E1](../experiments/e1-gps-epoch/PLAN.md), and measures them;
`analysis/vcm-adapter` writes them as VCMs.
