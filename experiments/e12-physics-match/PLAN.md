# E12 — Operator physics forensics: the physics-match gauntlet

Pre-registration. Status: **draft**. It is frozen by the commit that sets
`"frozen": true` in [`config.json`](config.json); that commit's SHA is in every
later run manifest. The operator steps (40–60) refuse to run until
`config.json` and this file are committed with `"frozen": true` and unchanged
in the checkout. The synthetic steps (00–30) are development and validation
and may run before the freeze; their results are reported as such.

"Gauntlet" here is the **physics-match gauntlet**: a tournament of physics
hypotheses. It is not the stack's graph/gauntlet receipt system.

## 1. Question

Owner, 2026-10-10: "We need to figure out what physics operators are using,
so we need a gauntlet to do matches and heuristics/AI/ML to figure it out."
The standing OD gate: "The fitter (OD) should be able to start with the first
half of any data and reproduce the second half within 1 cm", "Using all the
different perturbations", "If no maneuvers".

For each operator ephemeris source, which physics and conventions does the
operator's propagator use? Configured to match, how close does our HPOP's
first-half fit reproduce the second half of a maneuver-free segment, and to
what physical cause is each remaining difference owed?

## 2. Sources

| Provider | File | Label | Notes |
| --- | --- | --- | --- |
| SpaceX Starlink | MEME, 3 d at 60 s | EME2000 / UTC | prediction; covariance not used; `ephemeris_source` recorded |
| NASA ISS | OEM, 15 d at 240 s | EME2000 / UTC | prediction; header mass, Cd, drag and SRP areas, event table |
| Planet | per-satellite OEM, 5 d at 60 s | EME2000 / UTC | prediction, 1 mm digits, Lagrange 5 stated |
| China Manned Space (Tiangong) | OEM, 7 d at 240 s | EME2000 / UTC | prediction (BACC) |
| ILRS CPF | CPF v2, per prediction centre | ITRF / UTC | prediction, 1 mm digits; centres listed per target |
| Intelsat | ECF ephemeris, 9 d at 1800 s | Earth-fixed / UTC | prediction, no creation time stated |
| GNSS precise (control) | ESA rapid SP3, 1 d at 300 s | IGS20 / GPS | definitive orbit, not a prediction (IGS at BKG unreachable from this network) |

Space-Track-hosted operator ephemerides (OneWeb, Kuiper, Iridium, Telesat,
Orbcomm, AST, EUMETSAT) and SES are not fetched: the archiver does not hold
them and Space-Track is never used here. GNSS broadcast ephemerides need a
module that evaluates the broadcast model; none exists, so they are not run.
CelesTrak is not read.

**Data rule.** Operator ephemerides live in memory only, inside the step that
fetches and scores them (`operators-fetch.mjs`: serial requests, at least 5 s
apart per host, one retry after 60 s on 5xx, a provider stops at its first 403
or 429). Only derived results are written: hypothesis scores, fitted
parameters, residual fingerprints, the identified configuration, and
provenance (URL, retrieval time, SHA-256 and size of the served bytes).

## 3. Engines

- **HPOP**, `propagator/hpop` 1.2.0 (Knocke Earth radiation, FES2004 ocean
  tides), space-data-network-modules `f6ec6918` (HPOP 1.2.0 merged with main
  `34869f3d`), WASM SHA-256 in `config.json` `modulesBinary` (the code refuses
  another binary). Fits by `analysis/estimation` 0.3.0 `fit_batch` version 2
  (Levenberg–Marquardt, Cd·A/m and Cr·A/m bounded at 0). Frames and time by
  `foundation/frames` and `foundation/time`; Earth orientation by
  `data-source/eop-parser`.
- **Orekit 13.1.6** (`reference/OrekitTruth.java`) generates synthetic truths
  with models HPOP lacks (DTM2000 density, the EIGEN-6S field), constants set
  to HPOP's so differences are model differences.

## 4. Hypothesis space

A hypothesis fixes every axis (`hypothesis.mjs` `AXES`):

| Axis | Levels |
| --- | --- |
| frame (reading of the file's frame) | EME2000, GCRF, TEME, TOD, MOD (inertial files); ITRF (Earth-fixed files) |
| timeScale (reading of its epochs) | UTC, TAI, GPS, TT |
| eop | FINALS (IERS finals2000A as published), ZERO (no Earth orientation: UT1 = UTC, no polar motion or pole offsets) |
| gravityModel, degree | EGM2008 or EGM96; degree = order in {2 (J2), 4 (J2–J4), 8, 12, 20, 24, 36, 48, 70} |
| thirdBodies | none; Sun and Moon; + Venus, Mars, Jupiter (DE440s) |
| solidTides, oceanTides | IERS 2010 solid tides; FES2004 30×30 ocean tides |
| relativity | none, Schwarzschild, IERS 2010 |
| srp, earthRadiation | cannonball with conical shadow, or none; Knocke albedo and IR |
| atmosphere × spaceWeather (DRAG) | NRLMSISE-00, JB2008, Jacchia–Roberts, Harris–Priester, exponential, none; inputs OBSERVED (GFZ; SET for JB2008), FORECAST (what was public at the file's creation: NOAA SWPC's 3-day RSGA forecast, then held; SET's drivers 45 days late, then held), CONSTANT (F10.7 = F10.7a = 150, Ap 15, Kp 3) |

Solve-for parameters: the state at the segment's first point, Cd·A/m with
drag, Cr·A/m with radiation pressure (Earth radiation scales with it). The
default hypothesis is HPOP's full force on the file's labels: EGM2008 70×70,
Sun, Moon and planets, solid and ocean tides, IERS 2010 relativity,
cannonball SRP with Earth radiation, NRLMSISE-00 on the FORECAST inputs below
1500 km (no drag above).

Not in HPOP, so not testable as hypotheses (section 10 lists the gaps): JGM-3,
GGM05C, EIGEN-6C4 fields; DTM2000/2020, MSIS-86/90, NRLMSIS 2.x, Jacchia 70/71
as distinct models; a selectable shadow model (none, cylindrical, oblate-Earth
penumbra); the solar flux constant and its AU scaling (degenerate with a
fitted Cr·A/m over days); box-wing outside GPS; IAU 1976/1980 Earth
orientation with EOP; NRLMSISE-00 with the 3-hourly ap history; the 27-day
outlook as an input; integrators other than RK78 for the fit (the operator's
integrator and output interpolation are read as residual fingerprints only).

## 5. The tournament

`gauntlet.mjs`. For one maneuver-free segment:

1. **Score of a hypothesis.** Convert the published states to GCRF/UTC under
   its frame, scale and EOP readings; fit the state and its parameters to the
   **first half** (at most `fit.maxFitPoints` evenly spaced points, positions,
   1 mm sigma); propagate the fit to **every** point. Closure = RMS and max 3D
   difference over the second half; fit RMS over the first half; full-span
   RMS; BIC = 3n ln(RSS/3n) + k ln 3n on the first half.
2. **Search.** Incumbent = the default (or the classifier's proposal, section
   6). Axes in the order frame, timeScale, eop, gravityModel, degree,
   thirdBodies, solidTides, oceanTides, relativity, srp, earthRadiation, DRAG
   (largest signature first). Every admissible level of the axis challenges
   the incumbent with the other axes held.
3. **Replacement rule.** The best challenger replaces the incumbent only if
   its closure RMS is at least 10 % lower (`closureMargin`), the incumbent's
   closure is above the 2 mm floor (`floorM`), and its first-half BIC is not
   worse by more than 10 (`bicSlack`).
4. **Passes** repeat (at most 3) until one changes nothing. In the last pass,
   each axis's margin is the closure ratio of its best other level to the
   winner: **strong** (ratio ≥ 2 and ΔBIC ≥ 10), **moderate** (≥ 1.11),
   **weak** (below), **unresolved** (both at or under the floor).

Bayesian optimization is not used: one pass is 30–40 fits, which the tree
search affords.

## 6. Fingerprints and classifiers

`fingerprint.mjs`: from the default fit's residuals in the fitted orbit's RTN
axes (module rotation), 47 features: fit and closure RMS; regime (altitude,
inclination, span, step); per-component shares and means; second-half
along-track linear and quadratic trends (density, drag inputs); harmonics at
1, 2, 3 cycles per revolution and their growth (state, gravity, frame);
the daily term and the Earth-fixed phases u − θ and 2(u − θ) (Earth rotation:
time scale, EOP, tesserals); radial and along-track steps in the cylindrical
shadow and the along-track slope change at entry and exit (radiation pressure
and its shadow). `harness/boosting.mjs`: gradient-boosted trees (multinomial
deviance, depth 3, 120 rounds, rate 0.1), one classifier per axis, trained on
the synthetic training set (section 7). The classifiers propose each axis's
three most probable levels; the tournament's first pass tests only those and
the incumbent's. Every proposal is confirmed by closure, never accepted on
probability.

## 7. Synthetic ground truth

`synthetic.mjs`: a seed fixes the regime (LEO 340–560 km, 1 d at 60 s; LEO
650–1250 km, 1.5 d; MEO 19 000–23 300 km, 2 d at 300 s; GEO, 3 d at 600 s),
the orbit, an epoch in 2026-02-01..08-15 (observed inputs exist), every axis
of the generating hypothesis from `config.synthetic.prior`, Cd·A/m and
Cr·A/m, and how the file is published: frame and time scale (written in the
truth's frame and scale but labelled EME2000/UTC) and digits (1 mm, 0.1 mm,
1 µm). HPOP generates the truth. Only configs and seeds are kept.

- **Training set** (`synthetic.sets.train`, 320 seeds): the default fit's
  fingerprint and the oracle fit (the generating hypothesis).
- **Validation set** (`synthetic.sets.validate`, 36 seeds): the full
  tournament, with the classifiers' proposals.
- **Beyond-HPOP set** (Orekit truths: DTM2000 density; EIGEN-6S field): the
  tournament must not close them to the floor; the closest HPOP hypothesis and
  its residual fingerprint are reported.

## 8. Acceptance and endpoints

Synthetic:
- **A1 (1 cm gate).** With the generating hypothesis, every training case's
  half-split closure RMS ≤ 1 cm (and its max reported).
- **A2 (recovery).** Per axis, the tournament's confusion matrix on the
  validation set; recovery is counted only where the axis acts (drag axes in
  drag regimes, Earth radiation with SRP). An axis whose wrong level closes
  within the floor is "unresolved", not an error.
- **A3 (closure of the identified hypothesis).** Its closure RMS ≤ 1 cm on
  every validation case where the truth is within HPOP's space.
- Classifier 5-fold cross-validated accuracy per axis against the majority
  rate.

Operators (after the freeze):
- Per provider (CPF: per prediction centre), the identified configuration
  with each axis's confidence; the consensus over the dev segments (the
  per-axis majority of strong and moderate identifications; default where
  none).
- Closure (RMS, max) of the default and of the consensus configuration on
  held-out segments, per segment and the provider median.
- The attribution of what remains (section 9).

## 9. Operator procedure

1. **Sample.** Deterministic: providers' listings sorted by the SHA-256 of
   (seed, name). Segments are split into dev and held-out by the parity of
   the SHA-256 of their object id, so one object never lands in both.
2. **Maneuver screen.** The default hypothesis is fitted to consecutive
   windows (`operators.screenWindowHours`); a window is flagged when its fit
   RMS exceeds `screenFactor` × the file's median window RMS and
   `screenFloorM`, or (ISS) when a listed event falls in it. The segment is
   the longest run of unflagged windows, cut to `maxSegmentDays` from its
   start; shorter than `minSegmentDays` is skipped and reported.
3. **Dev:** the tournament (section 5). **Held-out:** the default and the
   consensus configuration only.
4. **Attribution** of the final residual from its fingerprint: along-track
   quadratic → density/space-weather difference; 1/rev growth with a radial
   bias → state or GM; Earth-fixed or daily terms → Earth orientation, time
   scale or tesseral gravity; shadow steps → radiation pressure or shadow
   model; a closure at the digits' floor → publication rounding. A residual
   that matches none is reported unattributed.

## 10. Reporting

`results/e12/README.md`: per provider the identified configuration and
confidence, default versus matched closure, the HPOP gaps the evidence points
to, and the synthetic validation. Failures are results.

## Amendments

None yet.
