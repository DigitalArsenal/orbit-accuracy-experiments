# E16 — Better start states from public OMMs across regimes, and whether a correction transfers to objects it was not trained on

Pre-registration. Status: **frozen** by the commit that sets `"frozen": true` in [`config.json`](config.json)
(2026-10-11, owner-approved the same day). Two locks guard the test window (`common.mjs`, `assertWindowReadable`):
this file and `config.json` (and `amendments.json`, when it exists) committed and unchanged, **and**
`results/e16/selection.json` committed and unchanged. The selection is written by the validation step (section 11,
step 4) after the freeze; it holds every choice the test applies.

Lane: E16. Branch `task/e16-cross-regime-epoch-20261011`. Modules: `space-data-network-modules` main at `e1e6577a`
(`propagator/hpop` 1.3.0, `analysis/estimation` 0.3.0 with `fit_batch` version 2, `analysis/gp-error-model` 0.3.0,
`analysis/epoch-state` 0.1.0, `analysis/density-calibration` 0.4.0, `analysis/maneuver-detection` 0.3.0,
`foundation/frames`, `foundation/time`, `data-source/eop-parser`). Every module's WASM SHA-256 is pinned in
`config.json` at the freeze; the code refuses other artifacts.

**Read before the freeze**: file names, counts and date spans of the truth products; the Planet name crosswalk (family
counts) and, to see the layout, the first two state lines of one Planet file (2026-03-01, validation window); EUMETSAT
Data Store search results (counts of products and receivers, no file); published results of E1, E2b, E3, E7, E13, E14
and E15's train interim. **No OMM was scored against any truth by E16 before the freeze.**

## 1. Question

E1 learned an along-track correction of GPS OMMs at epoch against IGS orbits: 61 % [53, 67] less 3D RMS error on its
own satellites, 6 % on an unseen orbital plane and −3.5 % on a new generation. E7 handed OMMs to HPOP (the full force
model) and scored them against precise orbits (test 2026-05-01..08-10), as the ratio of HPOP's median 3D error to
SGP4's: from the OMM's own epoch state HPOP is worse everywhere by 72 h; from an E1-corrected epoch state it is 0.32
at epoch, 1.45 at 24 h and 8.0 at 7 d (a corrected position does not correct the orbital energy); fitted to an arc of
past OMMs it holds the error flat (laser-ranged LEO spheres 0.32–0.51 to 12 h), but the arc keeps the bias the OMMs
share (E2b: consecutive OMMs' along-track errors correlate at 0.6–1.0); fitted to an arc of E1-corrected GPS OMMs it
is 0.47 at 24 h and 0.53 at 48 h, and 0.59–0.63 at 3–7 d, undecided with 110 samples.

E16 asks two questions.

- **Q1, transfer.** Can a correction of OMMs at epoch, learned where truth exists at scale (LEO operator fleets and
  precise-orbit missions, laser-ranged spheres, every GNSS constellation, IGSO and GEO), be applied to objects it was
  not trained on: unseen objects, operators, planes and shells, generations, constellations and orbit classes?
  A hypothesis to test, not a claim: LEO may transfer better than GNSS, because LEO OMM error at epoch is dominated by
  drag, which objects in a shell share, rather than by a per-satellite bias.
- **Q2, LEO arcs.** Do HPOP fits to an arc of a LEO object's OMMs, with the drag coefficient B and its rate Ḃ
  estimated, beat SGP4 at one to three days; does E13's open density correction improve them; do generalized least
  squares with the measured inter-OMM correlation, or an arc of corrected OMMs, improve them?

Beside both: an honest covariance for the corrected product of an unseen object.

## 2. Prior art and the novel claim

Search of 2026-10-11 in Crossref, Semantic Scholar (lookups by DOI), arXiv and OpenAlex, and the ESA Space Debris
Conference, AMOS, NTRS, HAL and DTIC libraries; publisher bot walls were not worked around. **R** full text read,
**Rp** main sections, **A** abstract, **M** metadata only.

| Work | What it found | St |
| --- | --- | --- |
| Ly, Lucken and Giolito 2020, *J. Space Saf. Eng.* 7(3), 302, [10.1016/j.jsse.2020.07.032](https://doi.org/10.1016/j.jsse.2020.07.032) | GPS along-track correction at epoch fitted on 14 satellites (2018), scored on the other 15 (2019): −63 % mean (−25 to −82 % by satellite). The mean-error feature is not specified; two identifiers appear in both lists. The authors expect no carry-over to LEO. E1: 61 % on seen satellites, 6 % on an unseen plane | R |
| Hallgarten La Casta and Amato 2025, *Adv. Space Res.* 75(10), 7259, [10.1016/j.asr.2025.03.046](https://doi.org/10.1016/j.asr.2025.03.046) (arXiv:2412.15793) | Per-satellite debiasing for pseudo-OD in MEO and GEO (SLR calibrators): post-fit −80 %; models "not generalised"; successive element sets' biases highly correlated, weights diagonal | R |
| Hallgarten La Casta and Amato, 9th European Conf. Space Debris, paper 282 | One model for Galileo and GPS: RMSE −30 % (per-satellite −75 %), fitted and scored on the same satellites and year; LAGEOS not debiasable | R |
| Peng and Bai 2018, *Adv. Space Res.* 61(10), 2628, [10.1016/j.asr.2018.03.001](https://doi.org/10.1016/j.asr.2018.03.001); 2018 *JSR* [10.2514/1.A34171](https://doi.org/10.2514/1.A34171); 2019 *JAS* [10.1007/s40295-019-00158-3](https://doi.org/10.1007/s40295-019-00158-3); series to 2021 | Machine-learned orbit-prediction corrections, one model per object on real element sets. Simulated transfer: residual 40 % of the error after an inclination shift of 2–4°, 86 % after +50 km, failure beyond +60 km | R (2018 ASR); A/M (rest) |
| Acciarini, Baydin and Izzo 2025, *Acta Astronaut.* 226, 694, [10.1016/j.actaastro.2024.10.063](https://doi.org/10.1016/j.actaastro.2024.10.063) | Differentiable SGP4 + learned correction, 1,519 Starlinks: on 225 satellites at altitudes unseen in training, RMSE −34 % over three days of SpaceX's file (a forecast after its first hours) | R |
| Moody, Axelrad and Russell 2026, IEEE Aerospace, [10.1109/AERO66936.2026.11520009](https://doi.org/10.1109/AERO66936.2026.11520009) | Learned argument-of-latitude error and covariance of VCM products: 200 held-out LEO satellites, 7-day along-track σ 12 → 6.2 km; transfer across satellites works, across time it does not | R |
| Zhang et al. 2026, preprint [10.21203/rs.3.rs-10714895/v1](https://doi.org/10.21203/rs.3.rs-10714895/v1) | GRACE-FO element-set residuals to Sentinel-1A (precise orbits): −23 % with no history of the target, more with it | R |
| Yao et al. 2026, *IEEE Access* 14, 88083, [10.1109/ACCESS.2026.3698264](https://doi.org/10.1109/ACCESS.2026.3698264) | B* correction (FY-3A): 3D RMSE −17 % to −28 % at 48–96 h; "favourable" on FY-3B | A |
| Li, Zhang, Huang and Sang 2021, *Acta Astronaut.* 188, 405, [10.1016/j.actaastro.2021.08.002](https://doi.org/10.1016/j.actaastro.2021.08.002); Curzi, Modenini and Tortora 2022, *CEAS Space J.* 14, 197, [10.1007/s12567-021-00375-3](https://doi.org/10.1007/s12567-021-00375-3); San-Juan et al. 2017, *Acta Astronaut.* 137, 254 | Error-pattern mining and transfer; recurrent correction with uncertainty; hybrid SGP4 (one satellite, model-error truth) | M, M, R |
| Levit and Marshall 2011, *Adv. Space Res.* 47(7), 1107, [10.1016/j.asr.2010.10.017](https://doi.org/10.1016/j.asr.2010.10.017) | Full-force fit to a 10-day arc of SGP4 pseudo-observations, four spheres, ILRS truth: about 100 m/day against SGP4's 1,500; below one day the element sets' bias dominates; no B fitted | R |
| Bennett, Sang, Smith and Zhang 2012, AMOS; Sang, Bennett and Smith 2013, *Adv. Space Res.* 52(1), 117 | 10-day element-set arcs with B from the mean B* (C_D estimated for GRACE): better than SGP4 in 93–98 % of 7-day runs; B from element-set decay to about 10 % | R; A |
| Chen and Lin 2023, *Aerospace* 10(6), 532; Vallado, Bastida Virgili and Flohrer, 6th ECSD; Aida and Kirschner, 6th ECSD | Starlink element-set arcs: 5-day prediction about twice SGP4's accuracy; B* absorbs model error | A, R, A |
| Osweiler 2006 (AFIT, DTIC ADA446817); Flohrer, Krag and Klinkrad 2008; Geul, Mooij and Noomen 2017, [10.1016/j.asr.2017.02.038](https://doi.org/10.1016/j.asr.2017.02.038) | Element-set error statistics; successive sets "still correlated", not modelled; no generalized least squares | R, R, M |
| Chen, Du and Sang 2019, *J. Spat. Sci.* 64(1), 97, [10.1080/14498596.2017.1371089](https://doi.org/10.1080/14498596.2017.1371089); Gondelach and Linares 2020, 2021; Gershman 2026, [10.64631/vfnq1575](https://doi.org/10.64631/vfnq1575); Parker and Linares 2026 | Density calibrated from 20–40 objects' element sets lowers the 10-day error of the other objects by about 30 %; Kalman density from element sets; co-varying B*; correlated drag response across LEO satellites | A, Rp, Rp, A |
| Jankovic 2026, arXiv:2605.19850 | Starlink: high-fidelity propagation from one element set is worse than SGP4 in 65–75 % of pairs | Rp |

**Not claimed** (done before): cross-satellite transfer within one constellation or between two named satellites
(Ly 2020; Acciarini 2025; Moody 2026; Zhang 2026); its failure at other altitudes or orbits (Peng and Bai 2018;
Hallgarten La Casta and Amato); numerical fits to element-set arcs beating SGP4 at 5–30 days, with a fitted drag
term (Levit and Marshall 2011; Bennett 2012; Chen and Lin 2023); fleet-calibrated density from element sets helping
other objects (Chen, Du and Sang 2019); the correlation of successive sets (Osweiler; Hallgarten La Casta and Amato).

**Claimed if measured, and reported either way** (not found in this search):

1. A correction learned on precise truth in every regime at once (LEO operator fleets, LEO precise-orbit missions of
   many operators, laser-ranged spheres, every GNSS constellation, IGSO and GEO), with leave-one-group-out transfer to
   unseen objects, operators, planes and shells, generations, constellations and orbit classes.
2. LEO against GNSS transfer measured on the same footing, with the per-object and shared shares of the error that
   explain it.
3. A fleet nowcast: other operators' released orbit-determination states correcting an object's OMM at its creation.
4. Ḃ estimated inside an OMM-arc HPOP fit, with an open fleet density correction (E13), scored at one to three days
   against precise orbits and operator states.
5. Generalized least squares across an arc with the measured inter-OMM correlation.
6. The corrected product's covariance checked against truth for unseen objects.

## 3. Data

All inputs are local copies with their SHA-256 in each run's manifest; nothing is fetched during a run.

### 3.1 Element sets

Space-Track `gp_history` by creation day (`/opt/data/sdn-archive/spacetrack/gp_history/by-creation`),
`MEAN_ELEMENT_THEORY` SGP4, `EPHEMERIS_TYPE` 0, epochs within 1 s of each other are one set (the later creation
kept), creation up to 3 days after the epoch window (E7). Element sets and per-sample tables stay on this machine.

### 3.2 Truth

| Regime class | Objects (NORAD numbers in `config.json`) | Truth | Spacing | Released (for the fleet nowcast, 5.3) |
| --- | --- | --- | --- | --- |
| LEO-PL | Planet: SuperDove flocks 4BE, 4G, 4H, 4Q, 4Y, SkySat, Pelican, Tanager (about 140 a day) | Planet's daily orbit-determination states (`planet_YYYYMMDD.states`, TT, J2000; E13's reader), identities from the same day's `planet_mc_YYYYMMDD.tle` | one a day | 6 h after the state (E13) |
| LEO-POD | Swarm A, B, C; Sentinel-1A, 1C, 1D; GRACE-FO; COSMIC-2 (five); CryoSat-2, SARAL, Sentinel-3A, 3B, Sentinel-6A, 6B, Jason-3, HY-2C, HY-2D, SWOT (DORIS) | `analysis/reference-states` conversions (TU Delft Swarm, Copernicus POEORB, GFZ RSO, UCAR NRT, CNES SSALTO via IDS) | 10–60 s | per product (`config.json` `release`) |
| SLR-LEO | Starlette, Stella, LARETS, WESTPAC, Ajisai, LARES | NSGF 4-day SLR arcs | 2 min | 3 d |
| GNSS | GPS, Galileo, GLONASS, BeiDou MEO | ESA `ESA0OPSFIN`; GFZ `GFZ0MGXRAP` for satellites ESA does not carry | 5 min | 14 d (ESA), 2 d (GFZ) |
| IGSO/GEO | BeiDou IGSO and GEO, QZSS (QZO and GEO): mean motion below 1.1 rev/day (GEO when inclined less than 10°) | as GNSS | 5 min | as GNSS |
| SLR-MEO | LAGEOS-1, LAGEOS-2, ETALON-1, ETALON-2, LARES-2 | ILRS combined weekly arcs; NSGF (LARES-2) | 2 min | 7 d, 3 d |

Truth accuracy is centimetres to decimetres for the precise orbits and 4–10 m for Planet's states (E13), against OMM
errors of hundreds of metres to kilometres.

**Not used, and why.** SpaceX's Starlink ephemerides: no archive before 2026-10-09 (E13 and E15 collect them live
since 2026-10-10). Commercial radio-occultation receivers through EUMETSAT (Spire, PlanetiQ): about 15 receivers a day
(searched 2026-10-11), about 2 MB per occultation file, and E15's reader is bound to E15's live download budget; the
operators they would add are covered by Planet (a fleet) and the precise-orbit missions (many operators). NASA's ISS
OEM, CMSE's Tiangong OEM, Intelsat and SES files: current versions only. SpaceMapper AOE: a second catalogue, not truth.

### 3.3 Windows (by OMM epoch, UTC)

| Window | LEO, SLR, IGSO/GEO | GNSS MEO | Use |
| --- | --- | --- | --- |
| Train | 2025-10-01 .. 2026-01-31 | 2024-10-01 .. 2026-01-31 | Correction models, weights, correlations |
| Validation | 2026-02-01 .. 2026-03-31 | same | Every choice; `selection.json` |
| Test (locked) | 2026-04-01 .. 2026-07-31 | same | Read once, after `selection.json` is committed |

LEO truth starts on 2025-10-01; GNSS MEO trains on all the earlier data, as E1 trained on a full year. The test window
ends on 2026-07-31 so that E13's density correction (2025-10-01 .. 2026-07-31) and three-day horizons are covered.

**What earlier experiments read in these windows.** GPS OMM errors: E1 (validation 2025-10..2026-03, test
2026-04-01..09-15) and E7 (test 2026-05-01..08-10). GNSS, LEO-POD and SLR OMM errors: E2b, E3, E7 and E14 (aggregates
published). Planet states: E13 (drag, not OMM errors). No experiment has scored a correction model on these objects in
this test window, nor Space-Track OMMs against Planet's states.

## 4. Samples and errors

**Epoch samples (Q1).** Every OMM with epoch in the window whose object has a truth state in [epoch, epoch + W]:
W = 15 min for every regime class except LEO-PL, W = 6 h for LEO-PL (one state a day). The target is the first truth
state in that span. The error e is SGP4 minus truth in the truth state's RTN axes (R radial, N orbit normal, T = N ×
R), from `analysis/gp-error-model` `accumulate` with a ±1 s age bin around the target (E7), in km. Ages 1 d and 3 d are
scored the same way for descriptive tables (dense truth: the first state at or after epoch + a, within 15 min;
LEO-PL: the state with age in [a − 12 h, a + 12 h)).

**Prediction samples (Q2).** E7's schedule: for each Q2 object and each product time t (the window start plus
multiples of the stride, object j starting j mod stride days later), the OMM with the latest epoch among those created
by t, at most 1 day old; its `CREATION_DATE` is the information cutoff. Targets at h ∈ {0, 6 h, 12 h, 24 h, 48 h,
72 h}: dense truth, the first state at or after epoch + h within 15 min; LEO-PL, h = 0 within 6 h and the day bins
24 h, 48 h, 72 h as above (no 6 h or 12 h target). A target without truth is missing for every product alike.

**Clip (E1 amendment 2).** Per regime class, window, age and RTN component: C0's median ± 5 robust sigma (1.4826 ×
MAD). The mask is fixed on C0's errors; every method is scored on the same OMMs.

## 5. Q1 methods: corrections and their transfer

### 5.1 The correction

E1's form. The response is the along-track error at the target in seconds of flight, y = e_T / |v|, |v| the speed of
the OMM's epoch state from `analysis/epoch-state` `derive`. A correction Δt = −ŷ is applied as an edit of the OMM, mean
anomaly + n·Δt (E1 `shiftAlongTrack`), and the edited OMM is scored by the same modules. The corrected product is itself
an OMM. Only the along-track component is corrected; R and N are reported.

### 5.2 Covariates (all known at the OMM's creation)

| Group | Covariates | Computed by |
| --- | --- | --- |
| G | E1's: real solid harmonics of the Moon's and the Sun's directions in the orbit-plane axes up to degree K; both anomaly pairs | `foundation/frames`, `analysis/epoch-state` (E1 `geometry.mjs`, `features.mjs`) |
| O | sin u, cos u, sin 2u, cos 2u (u = argument of perigee + mean anomaly); eccentricity; cos i; ln n; hours from epoch to creation; hours since the previous OMM's epoch; that OMM's mean-motion change per day (0 and an indicator when none within 3 d) | element-set fields (bookkeeping) |
| W (LEO) | B*; Ap mean over the 24 h and over the 24–72 h before the cutoff; F10.7 of the previous day and its 81-day mean; B* × each of these | GFZ Kp/ap/F10.7 and NOAA SWPC RSGA as released at the cutoff (E7 `releasedSpwRows`) |
| F (LEO) | Fleet nowcast f: the median of y over the OMMs of *training* objects (never the scored object) whose mean motion is within Δn of the scored OMM's, with epochs in [cutoff − L, cutoff] and truth released by the cutoff (section 3.2); f = 0 and an indicator when fewer than 5 contribute | the epoch samples' module errors (bookkeeping) |

Every covariate is standardized on the train window. F is the only covariate that reads truth of the window being
scored, and only the training objects' truth released before the cutoff: the operational form of "other satellites in
the same shell tell you what drag did".

### 5.3 Candidate models

| Family | Regime group | Model | Grid |
| --- | --- | --- | --- |
| C0 | all | none: the OMM as published | — |
| M3a, M3b | MEO/GEO | E1's replications of Ly et al. (2020) and Hallgarten La Casta and Amato (2025) | λ ∈ {0, 10, 100, 1000} |
| C1 | LEO: G + O + W; MEO/GEO: G (= E1's M3c) | y = covariates × β + u_object + ε, u ~ N(0, τ²), σ² and τ² by REML, β by GLS with ridge λ on the standardized covariates (E1 `fitReml`) | K ∈ {1, 2} (LEO), {1, 2, 3} (MEO/GEO); λ ∈ {0, 10, 100, 1000} |
| C2 | LEO | y = a + b·f + u_object + ε (fleet only) | L ∈ {12, 24, 48} h; Δn ∈ {0.05, 0.1, 0.2} rev/day |
| C3 | LEO | C1's covariates and f | C1's and C2's chosen settings |

Regime groups are fitted separately: **LEO** (LEO-PL, LEO-POD, SLR-LEO together) and **MEO/GEO** (GNSS, IGSO/GEO,
SLR-MEO together). Only train OMMs inside the train window's C0 clip at age 0 are fitted. An object the model never saw
gets u = 0 (M3a: the mean object effect).

### 5.4 Tiers: who is held out

Each tier assigns every object of a regime group to a fold; the fold's model is fitted on the other folds' objects
(train window) and scored on the fold's objects; folds are pooled. Assignments are fixed in the inventory (step 10)
before any error is computed, from the train window's element sets and names only.

| Tier | LEO | MEO/GEO |
| --- | --- | --- |
| T (seen, future time) | every object in training | every object in training |
| O (unseen objects) | 5 folds, salted hash of the NORAD number, stratified by regime class and Planet family | 5 folds, stratified by constellation |
| P (unseen operators) | leave one out: Planet; ESA (Swarm, CryoSat-2); Copernicus (Sentinel-1, -3, -6); US-led (GRACE-FO, COSMIC-2, Jason-3, SWOT); Asian (SARAL, HY-2C, HY-2D); passive spheres | leave one constellation out: GPS, Galileo, GLONASS, BeiDou, QZSS; and GNSS → SLR-MEO spheres |
| S (unseen planes and shells) | leave one mean-motion band out: ≥ 15.2, 15.0–15.2, 14.6–15.0, 13.5–14.6, < 13.5 rev/day; and leave one inclination class out: < 60°, 60–80°, > 80° | leave one orbital plane out within each MEO constellation (E1's node clustering: GPS 6, GLONASS 3, Galileo 3, BeiDou MEO 3) |
| N (unseen generations) | leave one Planet family out: SuperDove, SkySat, Pelican and Tanager | leave one generation out: GPS III/IIIF; Galileo FOC; GLONASS-K; BeiDou-3 (launch year cuts in `config.json`) |
| M (unseen orbit class) | — | MEO → IGSO and GEO |

### 5.5 Choice on validation

Per regime group, the candidate with the lowest clipped 3D RMS at epoch on the validation window's **tier O** held-out
samples (pooled over folds). A candidate within 1 % of the lowest ties with it; ties go to the simpler: C2, C1, C3;
larger λ; smaller K; shorter L; narrower Δn. The chosen specification M* is fitted per fold and tier on the train
window and applied unchanged to the test window: nothing is refitted on test. Every candidate's validation numbers, and
every family's best on test, are reported, so the choice cannot hide a loser.

### 5.6 The corrected product's covariance

M4: per regime class, a diagonal RTN covariance at epoch, the second moment about zero of M*'s tier O held-out errors
inside the C0 clip on the validation window (out of sample: M* is fitted on train). The published OMM's covariance is
made the same way from C0's errors (a reference). Scored by `analysis/gp-error-model`'s coverage test (d² against
χ²₃) and E14's cell rule.

## 6. Q2 methods: LEO arc fits

### 6.1 Force model (HPOP, full force)

`propagator/hpop` 1.3.0 execution path: EGM2008 70 × 70 with IERS EOP 20 C04 (the largest field the module carries);
Sun, Moon, Venus, Mars, Jupiter (DE440s); solar radiation pressure, cannonball with nominal Cr·A/m, conical shadow;
Earth radiation pressure (Knocke, the same Cr·A/m); drag (6.3); IERS 2010 solid tides; FES2004 ocean tides 30 × 30;
IERS 2010 relativity. RK78, relative tolerance 1e-13, steps of at most 300 s. Nominal Cr·A/m per object in
`config.json` `physical` (published mass and dimensions, rounded; Planet by family). The harness's request builder
gains the two forces E7 did not set (ocean tides, Earth radiation); their default stays off for every earlier caller.

### 6.2 Products

| ID | What propagates | Weights |
| --- | --- | --- |
| S | The latest OMM by SGP4 (baseline) | — |
| S-corr | The latest OMM corrected by M* from the tier O fold that holds the object out | — |
| A | HPOP fitted by `analysis/estimation` `fit_batch` to the epoch states of the object's OMMs created by the cutoff with epochs in [epoch − span, epoch]: state, B (Cd·A/m) and, if chosen, Ḃ; operational NRLMSISE-00 | diagonal (WLS) |
| A-GLS | A with the inter-OMM correlation as one covariance block per arc (`covariance_blocks`) | correlated, own-epoch model (6.4) |
| A-GLS-E2b | A-GLS with E2b's consecutive-OMM correlation for the position components | correlated, E2b |
| A-corr | A on OMMs corrected as S-corr | diagonal, corrected-error moments |
| A-JB | A with JB2008 on SET's drivers as published (a hindcast background) | diagonal |
| A-JB-E13 | A-JB plus E13's temperature correction a00(t) on JB2008's hourly DTC: the causal nowcast and forecast of E13's selected solver from calibration-Dove arcs that ended at least 6 h before the cutoff | diagonal |

Each fit starts B from the OMM's B* (Cd·A/m = 12.741621 B*, E7; 0.01 m²/kg when B* ≤ 0) with a priori σ_B =
max(0.02 m²/kg, B start) and lower bound 0; Ḃ starts at 0 with σ_Ḃ = 0.5 σ_B per day. The state's a priori is E7's
(100 km, 10 m/s). Pseudo-observations are full 6-D states with E7's train-window second-moment weights (re-estimated
on E16's train window per regime class; A-corr's from the validation window's corrected errors). Arcs split after a
manoeuvre that `analysis/maneuver-detection` finds in them (E7 section 4). The fit's covariance is the formal one times
max(1, reduced χ²), propagated with the parameters.

### 6.3 Atmosphere and the information cutoff

Operational drivers are those public at the cutoff (E7): NRLMSISE-00 with GFZ observed indices before the newest NOAA
SWPC RSGA and that report's estimates and 3-day predictions; Earth orientation to the cutoff's day minus 1. A-JB and
A-JB-E13 use SET's JB2008 drivers as published (public 45 days late), so the pair is a hindcast; the pair isolates the
effect of E13's correction. E13's correction is computed by E13's own code (`common-mode.mjs` `nowcast`, `sAt`,
`kappa.mjs`) with E13's committed `selection.json`; the Planet satellites among E13's 36 calibration Doves are not Q2
objects.

### 6.4 The inter-OMM correlation

A pseudo-observation is an OMM's state at its own epoch, so GLS needs the correlation of two OMMs' errors each at its
own epoch, by the time between them: E7's empirical correlation by lag bin and its two forms (exponential; exponential
with a nugget), fitted on E16's train window per regime class and RTN component, the form chosen on validation (E7's
rule). E2b measured a different quantity (two OMMs' errors at a common epoch, 0.6–1.0 along track); A-GLS-E2b applies
E2b's per-axis consecutive and near-pair correlations by gap bin (`results/e2b/train/correlation-model.json`, regime
LEO-POD for LEO-PL and LEO-POD, SLR-LEO for SLR-LEO) to the position components, the velocity components as A-GLS. The
module regularizes a block whose correlation matrix is not positive definite (eigenvalues raised to 1e-3) and reports
it.

### 6.5 Objects, choices and strides

Q2 objects: the LEO-POD and SLR-LEO objects whose mean motion is at least 13.8 rev/day (below about 1,000 km), and up
to 24 Planet satellites: E13's 12 held-out Doves, and up to 4 SkySats, 4 Pelicans or Tanager and 4 other SuperDoves
outside E13's sample, drawn by salted hash. Choices on validation, per regime class, by the lowest median 3D error of A
at 72 h on paired samples (equal: the shorter span, then Ḃ off): span ∈ {2, 4} d (SLR-LEO {4, 7} d) × Ḃ ∈ {off, on};
validation stride 10 days. Test stride: the smallest whole number of days, at least 7, for which the cost measured on
validation (median CPU seconds per sample and product) times the test samples is at most 150 CPU-hours; written to
`selection.json`.

## 7. Hypotheses, statistics and decision rules

| ID | Statement | Supported when (test window) |
| --- | --- | --- |
| H1 (primary) | LEO corrections transfer to unseen objects | LEO tier O: R ≥ 0.20 and its 95 % lower bound > 0 |
| H2 | LEO transfers better than MEO/GEO | R(LEO, tier O) − R(MEO/GEO, tier O) ≥ 0.10 and its lower bound > 0 |
| H3 | LEO corrections transfer to unseen operators | LEO tier P: R ≥ 0.10 and its lower bound > 0 |
| H4 | LEO arc fits beat SGP4 at one to three days | ρ(A / S) at 24 h and at 72 h, each with upper bound < 1 |
| H5 | E13's correction improves the arc fits | ρ(A-JB-E13 / A-JB) at 24 h and at 72 h, each with upper bound < 1 |
| H6 | The corrected product's covariance is realistic for unseen LEO objects | LEO tier O at epoch, M4: mean d²/3 ∈ [0.8, 1.25] and 95 % coverage ∈ [0.93, 0.97] (E14's rule) |

**Primary statistic (Q1).** R = 1 − RMS₃ᴅ(M*) / RMS₃ᴅ(C0) at epoch over the tier's held-out samples inside the C0 clip
(E1). **Q2 statistic.** ρ = median 3D(V) / median 3D(C) on the samples where both exist (E7); "meaningfully better"
when the upper bound is below 0.8 is reported beside each rule.

**Intervals.** Two-way cluster (pigeonhole) bootstrap over objects and UTC days of the OMM epoch (Owen 2007), 10,000
resamples, percentile 95 % intervals, seed 20261011. H2 resamples LEO and MEO/GEO objects and the shared days in one
draw. **p-values** (one-sided, from the same draws, (1 + count)/(1 + resamples)): H1, H3 the share with R ≤ 0; H2 the
share with the difference ≤ 0; H4, H5 the larger over the two horizons of the share with ρ ≥ 1; H6 the share of draws
whose cell fails E14's rule.

**Multiplicity.** H1 is tested alone at α = 0.05. H2–H6 are one family under Holm at α = 0.05. A hypothesis is
supported only when its own rule holds and its test rejects. Everything else is descriptive and labelled so.

**No-harm rule.** Per tier and regime group, among held-out objects with at least 10 test samples: an object is harmed
when its clipped RMS₃ᴅ under M* exceeds C0's by more than 10 %. The correction is fit to serve that tier only if at
most 10 % of such objects are harmed (at most one when there are fewer than ten); a failure is stated in the report's
first paragraph. Q2: the objects whose median 3D ratio A/S at 72 h exceeds 1.10 are counted and listed.

**Descriptive.** Every tier of section 5.4 in both groups; R per regime class; RTN components; ages 1 d and 3 d of S
and S-corr; per-object reductions; the share of along-track variance that is per-object (τ²/(τ² + σ²)) and the share
the shared covariates explain, per regime class (the mechanism behind the LEO-versus-GNSS hypothesis); Q2: every
product against S and A, A-GLS and A-GLS-E2b against A, A-corr against A, A-JB-E13 against S, all horizons, 95th
percentiles, the operational counts (scored over attempted, failures as unbounded), fits' convergence, bounds hit,
regularized blocks, splits, fitted B and Ḃ, and the covariance realism of the A family (E14's rule per horizon).

## 8. Acceptance of the harness (before the selection)

On train-window data: (A1) per-sample `accumulate` errors summed over a day equal one batch call to 1e-9 relative
(E1 A0.2); (A2) Planet truth: the module's TT − UTC is 69.184 s on every state (37 leap seconds), the J2000 → GCRF
rotation moves a state by less than 2 m (the frame bias), and C0's median 3D error against Planet is reported beside
E4's 0.59 km for Planet's own element sets; (A3) a 10 s
mean-anomaly shift moves the at-epoch T error by |v|·10 s to within 1 % in every regime class; (A4) a known-answer arc:
pseudo-observations generated by HPOP with known B and Ḃ and noise are fitted back within 3 formal sigma; (A5)
A-JB-E13 with a00 ≡ 0 equals A-JB to the last bit, and A-GLS with zero correlation equals A; (A6) two runs on the same
inputs give byte-identical sample tables. A failure stops E16 until it is explained.

## 9. Threats to validity

- **Planet's truth is sparse** (one state a day, so W = 6 h and the "epoch" sample is at a median age near 3 h) and
  is the operator's own orbit determination (4–10 m), not an independent precise orbit.
- **The fleet nowcast reads the test window's truth of training objects**, released by the cutoff; this is how it
  would run, and the scored objects' truth is never read by it.
- **Folds pool heterogeneous objects.** Planet dominates LEO tier O by count; R is reported per regime class and per
  object beside the pooled value.
- **Selection on held-out objects of the validation window** and testing on the same objects in the test window: the
  objects are held out of every fit, not of the choice.
- **Manoeuvres.** Q1: the C0 clip; Q2: detection and arc splits with E7's limits; medians are robust, 95th percentiles
  are not.
- **E13's correction** is calibrated on Planet Doves near 480 km and was not supported for prediction in E13 (H4, H5);
  A-JB and A-JB-E13 run on SET's definitive drivers (a hindcast).
- **Nominal Cr·A/m** for the Q2 objects; B absorbs part of their error.
- **Not blind for the baseline**: SGP4's aggregate accuracy for the GNSS, LEO-POD and SLR objects in parts of this test
  window is published (section 3.3).

## 10. Outputs, provenance and licences

Runs write `runs/<run-id>/` (ignored): sample tables, `manifest.json` (harness/provenance.mjs: command, config hash,
commits, every module's WASM SHA-256, every input's SHA-256), `metrics.json`. Committed under `results/e16/`: manifests,
metrics, fitted models (coefficients only), `selection.json` and READMEs generated from metrics. Never committed: element
sets, per-sample tables, Planet states or rows derived from them per sample, operator files. Results use every source;
credits come from `data/licenses.json` (`harness/credit-lines.mjs`).

## 11. Order of work

1. This plan and `config.json` (`"frozen": true`) committed and pushed.
2. Inventory (objects, families, folds, Q2 objects); acceptance A1–A6.
3. Train: epoch samples and covariates; candidate models per tier; Q2 weights and correlations.
4. Validation: candidates scored, M* chosen, M4 fitted; Q2 choices and test strides; `selection.json` committed and
   pushed.
5. Test, once: Q1 scoring; Q2 products in shards; evaluation; reports generated from the metrics.

## Amendments

Dated changes after the freeze, with their reasons, appended here; changed numbers go to `amendments.json`, which the
code merges over `config.json` (never edited after the freeze). Every amendment is listed in the results.

## References

- Ly, D., Lucken, R. and Giolito, D. 2020. Correcting TLEs at epoch: application to the GPS constellation. *J. Space
  Safety Eng.* 7(3).
- Hallgarten La Casta, M. I. and Amato, D. 2025. Generalisable bias correction of two-line element sets in the medium
  Earth orbit regime. 9th European Conference on Space Debris.
- Levit, C. and Marshall, W. 2011. Improved orbit predictions using two-line elements. *Adv. Space Res.* 47(7),
  1107–1115.
- Owen, A. B. 2007. The pigeonhole bootstrap. *Ann. Appl. Stat.* 1(2).
- Holm, S. 1979. A simple sequentially rejective multiple test procedure. *Scand. J. Stat.* 6.
- Knocke, P. C., Ries, J. C. and Tapley, B. D. 1988. Earth radiation pressure effects on satellites. AIAA 88-4292.
