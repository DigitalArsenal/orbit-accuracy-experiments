# VCM parity

The bar for the stack's high-fidelity products: everything a Vector
Covariance Message carries (spacedatastandards.org
`survey/legacy-messages/vcm`) can be carried through PRW, propagated by
`propagator/hpop`, and produced by this repository's experiments with
covariance whose realism is measured. Status as of 2026-10-08, against
SDS 1.240.0 (schema on branch `task/prw-environment-20261008`, not yet
released) and modules commits `5695d427`, `e13b7bac`, `2bfce56a`, `eede9c8d`
(branch `task/hpop-lockdown-20261008`).

## Inputs: VCM field → PRW → HPOP

| VCM line | PRW (SDS 1.240.0) | HPOP | Evidence |
| --- | --- | --- | --- |
| J2K POS/VEL | `INITIAL.STATE` with `MEAN_EQUATOR_EQUINOX_J2000` axes | IAU 2000 frame bias in and out (states, covariance, STM, impulses, burns) | Orekit E1 cases: LEO 1.4 cm, GPS 0.42 mm a day |
| ECI (TEME of date), EFG POS/VEL | — (redundant with J2K) | Not accepted; use J2K | — |
| EPOCH TIME (UTC) | `TIMInstant` UTC; integration on TT | Exact two-part TT | `foundation/time`, V1 |
| GEOPOTENTIAL: EGM-96 mmZ,nnT | `GRAVITY_CHOICE` `EGM96`, `MAXIMUM_DEGREE`, `MAXIMUM_ORDER`, `MAXIMUM_TESSERAL_DEGREE` | Embedded EGM96 and EGM2008 to 70 | Orekit G1 (EGM96 70×70 GPS 0.43 mm; 36×36 LEO 1.1 cm), G2 (36Z,24T LEO 1.2 cm) |
| DRAG: JAC70/MSIS90, JBH09 | `ATMOSPHERE_MODEL` `JACCHIA_70`, `JB2008`, `NRLMSISE00` | J70 as Jacchia-Roberts (GMAT port); JB2008 (Orekit port) on `JB2008_INDICES`; NRLMSISE-00 | Ports equal to their sources (2e-14, bit for bit); Orekit J1 (JB2008 on SET indices) 6 mm a day. HASDM's dynamic calibration is not in a VCM and is not reproduced. |
| LUNAR/SOLAR ON/OFF | `ENABLE_THIRD_BODY`, `THIRD_BODY_IDS` [10, 301] | DE440 kernel | Orekit F4/Z1 |
| SOLAR RAD PRESS ON/OFF, AGOM | `ENABLE_SRP`, Cr·A/m from `REFLECTIVITY_COEFFICIENT`, `AREA_M2`, `INITIAL_MASS_KG` | Cannonball, conical shadow | Orekit F5/Z2 |
| SOLID EARTH TIDES ON/OFF | `SOLID_TIDES` `IERS_2010` | IERS 2010 §6.2 steps 1–2 | Orekit T1: LEO 1.3 cm, GPS 0.41 mm |
| IN-TRACK THRUST ON/OFF, THRUST ACCEL | `IN_TRACK_ACCELERATION_M_S2` | Constant along N×r̂ | Orekit I1: 1.3 cm on a 560 m effect |
| BALLISTIC COEF B, BDOT | Cd·A/m from `DRAG_COEFFICIENT`·`AREA_M2`/`INITIAL_MASS_KG`; `DRAG_AREA_OVER_MASS_RATE_M2_KG_S` | B(t) = B + Ḃ (t − t₀) | Orekit B1: 1.1 cm on 1.4 km |
| SOLAR FLUX F10, AVG F10, AVG AP | `WEATHER` (held constant) or `SPACE_WEATHER` daily `$SPW` rows | NRLMSISE-00 and J70 readings of the daily table | Orekit W1: LEO 2.2 cm on 4.4 km |
| TAI-UTC, UT1-UTC, UT1 RATE, POLAR MOT X,Y | `EARTH_ORIENTATION` `$EOP` rows | IAU 2006/2000A CIO chain with the rows | Orekit, every Earth-fixed case. A VCM's single point is expanded to daily rows by the caller (UT1 − UTC + rate × days, polar motion held). |
| IAU 1980 NUTAT n TERMS | — | IAU 2006/2000A instead | Not reproduced (SP's truncated nutation is a frame approximation, not a dynamical input) |
| TIME CONST LEAP SECOND TIME | — | ERFA's leap-second table | — |
| INTEGRATOR MODE, COORD SYS, STEP MODE, FIXED STEP, STEP SIZE SELECTION, INITIAL STEP SIZE, ERROR CONTROL | `INTEGRATOR` (algorithm, initial/min/max step, tolerances) | RK4/RKF45/RKF78/RK78 | Integrator choice is not reproduced; accuracy is set by our own tolerances (Orekit suite: ≤ 3 cm a day at the documented settings) |
| PARTIALS: ANALYTIC / FULL NUM / FAST NUM | `STM_TECHNIQUE` `ANALYTIC` / `FINITE_DIFFERENCE` | Both | Orekit C1: STM columns 1e-5 (LEO), 4e-11 (GPS) |
| COVARIANCE (equinoctial, 6×6 to 10×10 with B, BDOT, AGOM, T, consider) | `INITIAL_COVARIANCE` with `DYNAMIC_PARAMETERS`, Cartesian SI | [[Φ, S], [0, I]] P₀ [[Φ, S], [0, I]]ᵀ, process noise on the state | Orekit C1 parameter Jacobians: B, BDOT, T 5e-6; AGOM 4e-3 in LEO (penumbra edges); `prw_parameters.test.mjs` |
| VECTOR U,V,W SIGMAS | Derived from the covariance | — | — |
| WTD RMS, EDR, C.M. OFFSET | — | — | Orbit-determination metadata, not propagation inputs |

## Gaps

1. **Equinoctial ↔ Cartesian covariance.** A VCM's covariance is in
   equinoctial elements (with the retrograde factor). The Jacobian belongs in
   a module (frames or a VCM adapter), not here; the units of the VCM's N, B
   and AGOM rows must be confirmed against the AFSPC VCM interface document
   before any VCM covariance is consumed.
2. **A VCM adapter module.** SDS `$VCM` ↔ PRW execution request (state,
   forces, EOP rows, covariance with parameters) and back, so our products
   can be written as VCMs (or OCMs) and SP VCMs read.
3. **Jacchia 1970 magnitude.** At equal exospheric temperature our J70
   (GMAT's Jacchia-Roberts, faithfully ported) gives 2–3× JB2008's density at
   400–700 km, and 1.7–2.1× NRLMSISE-00's. An independent Jacchia-Roberts
   (SatelliteToolbox.jl `jr1971`, its documented 700 km example) is 1.87× its
   JB2008, so the excess is the model's; but the GMAT port is 35 % above
   SatelliteToolbox at that example (810 K against 832 K exospheric
   temperature, and GMAT's semiannual/latitudinal factor 1.19). To be settled
   against SAO SR 313's tables before J70 is used quantitatively.
4. **Sample propagation cost.** HPOP re-propagates every sample from the
   initial epoch on the variational path (quadratic in the number of
   samples); experiments that sample densely should use the plain path (steps
   of at most 10 s with radiation pressure in LEO) unless they need the STM.
5. **Shadow events.** Neither integrator locates penumbra edges; the step
   guidance above stands in for event location.

## Outputs: producing VCM-equivalent products

A product is at parity when it carries a state, the model it was fitted
with (gravity, drag model and B/BDOT, AGOM, tides, thrust), the Earth
orientation and space weather it used, and a covariance over the state and
those parameters whose realism has been measured against precise orbits.
[E2](../experiments/e2-catalog-covariance/PLAN.md) is the experiment that
builds such products from public catalog history and from the at-epoch
corrections of [E1](../experiments/e1-gps-epoch/PLAN.md), and measures them.
