# E7v2 — From OMM history to a full-force state at or near epoch, against SGP4

Pre-registration. Status: **draft** (not frozen). The commit that sets
`"frozen": true` in [`config.json`](config.json) freezes it, after the
train and validation windows have fixed the choices of section 10. Every
later run manifest records that commit's SHA. The code refuses the test
windows until `config.json` and this file are committed with
`"frozen": true` and unchanged in the checkout.

E7v2 is a new experiment, not an amendment of E7: E7's plan is frozen and
its test window has been read. It reuses E7's code (methods, debiasing,
maneuvers, correlation) under its own configuration.

## 1. Question

The owner, verbatim (2026-10-10): "The very specific question we should be
answering is using OMM history and current data can we derive more accurate
orbits using HPOP propagation from a derived position / velocity at or near
epoch".

Operationally: for an object with a history of OMMs, take the information
public at a cutoff t0 (the newest OMM's `CREATION_DATE`). Derive a position
and velocity at or near the newest OMM's epoch, either from that OMM alone
or by fitting full-force HPOP to the object's recent OMMs. Then propagate
the state with HPOP. Is the position over the next 6 hours to 7 days more
accurate than SGP4 from the newest OMM? 72 hours is the primary horizon.

The answer is given per regime and object class (section 3). It is scored
against precise orbits where they exist. Elsewhere it is scored against
later OMMs, whose own error and correlation with SGP4 are measured
(section 8).

**Why a second version.** E7 (test 2026-05-01..08-10) left every 72 h
ratio against SGP4 undecided, at n of about 86:

| E7 comparison at 72 h | ratio | 95 % CI |
| --- | --- | --- |
| GPS H-arc-E1 / S | 0.63 | 0.23–1.04 |
| SLR-LEO H-arc-GLS / S | 0.54 | 0.30–1.14 |
| SLR-MEO H-arc-debiased / S | 0.38 | 0.11–1.60 |

E7's fits were version 1:

- B was unbounded. A negative optimum was refused and refitted with an
  in-track term.
- Weights were diagonal, with a variance inflation in place of a correlated
  covariance.
- GPS used at most four ECOM2 terms.

E7 covered four truth-rich classes of mostly active satellites. E7v2 uses
analysis/estimation 0.3.0 (`fit_batch` version 2):

- bounds on B and Cr·A/m;
- a signed in-track acceleration;
- all eleven ECOM2 terms where solar radiation pressure matters;
- one regularised correlated covariance across each arc.

E7v2 also adds the passive catalog (rocket bodies, debris, dead payloads) in
every regime, and samples sized so that a ratio of 0.8 resolves (section 11).

## 2. Products

All products start from the same sample: object, cutoff t0, and newest OMM.
HPOP means `propagator/hpop` with every force it carries (section 6).

| ID | What propagates | Modules |
| --- | --- | --- |
| S | The newest OMM by SGP4 (baseline) | `analysis/gp-error-model` `accumulate` |
| S-debiased | S from the newest OMM after the class's debiasing (section 5) | as S |
| H-epoch | HPOP from the newest OMM's epoch state (SGP4 at zero elapsed time, TEME to GCRF); B from the class rule (section 6) | `analysis/epoch-state`, `propagator/hpop` |
| H-arc-v2 | HPOP from the state fitted at the newest OMM's epoch; see the fit details below | + `analysis/estimation` `fit_batch` v2, `analysis/maneuver-detection` |
| H-arc-v2-debiased | H-arc-v2 with every pseudo-observation debiased first (section 5) | as H-arc-v2 |
| H-arc-v2-DCA | H-arc-v2-debiased with drag from JB2008 and E5's DCA stand-in (section 7); drag regimes only, where the stand-in's inputs exist | as H-arc-v2 |
| H-truth | HPOP from the precise orbit's state at the first target; truth-rich classes only; the force-model floor (descriptive) | as H-epoch |

H-arc-v2 fit details:

- **Pseudo-observations:** the epoch states of the object's OMMs created by
  t0, with epochs in [epoch − span, epoch]. The arc is split after the last
  maneuver detected before t0, as in E7.
- **Parameters:** B bounded at 0, a signed in-track acceleration, and
  Cr·A/m or the eleven ECOM2 terms by class (section 6). Each has an a
  priori.
- **Covariance:** one regularised correlated covariance across the arc
  (section 5).
- **Solver:** Gauss–Newton with bounds: a step that leaves a bound is
  projected onto it. The fit stops when the step's size in the information
  metric, √(dxᵀN dx/n), is below 0.01 (E7: 0.001; the difference moves the
  state by under 1 % of its own uncertainty). There are no logarithmic
  transforms. Levenberg–Marquardt is not used: on dev it reached the same
  solution in the same number of rounds.
- **Starting point:** a sample's first arc product starts from the newest
  OMM's epoch state. Later arc products with the same span start from the
  state the first converged to. Parameters always start at their a priori
  values, so only the iteration count changes.
- **Span:** chosen per class on validation.

`analysis/estimation` 0.3.0 is the version at modules commit `34869f3d`.

The repository frames records, rotates difference vectors and covariances
with `foundation/frames`' RTN axes, and computes statistics. Every orbit
computation is a module's.

## 3. Classes

### Truth-rich (scored against precise orbits)

| Class | Objects | Truth (`analysis/reference-states`) | Retrospective test cell |
| --- | --- | --- | --- |
| GNSS-GE | GLONASS and Galileo satellites in ESA's final orbits | `ESA0OPSFIN` | **confirmatory** |
| GPS | GPS satellites | `ESA0OPSFIN` | read by E1, E2, E2b, E7, E10: reported, not confirmatory |
| LEO-POD | POD satellites no earlier experiment scored (list fixed before the freeze; see the bullets below) | the products named per satellite | **confirmatory** |
| LEO-POD-E7 | Swarm A, B, C; Sentinel-1A, -1C, -1D | `SW_OPER_SP3*COM`, `S1*_OPER` | read: reported |
| SLR-LEO | Starlette, Stella, Ajisai, WESTPAC, LARETS, LARES | `nsgf.orb.*` | read: reported |
| SLR-MEO | LAGEOS-1, -2, ETALON-1, -2, LARES-2 | `ilrsa.orb.*`, `nsgf.orb.lares2` | read: reported |

LEO-POD objects:

- **IDS DORIS orbits** (60 s SP3, kept at 300 s): CryoSat-2 (36508), SARAL
  (39086), Jason-3 (41240), Sentinel-3A (41335), Sentinel-3B (43437), HY-2C
  (46469), Sentinel-6A (46984), HY-2D (48621), SWOT (54754) and Sentinel-6B
  (66514). The SP3 files state no accuracy; 5 cm is assumed.
- **UCAR COSMIC-2 near-real-time orbits** (kept at 300 s): FM1, FM2 and FM4–6
  (44349, 44350, 44351, 44353, 44358; FM3 is absent). Each arc's sigma comes
  from its overlap with the others; arcs above 1 m are not used.
- **Excluded:** GRACE-FO C/D and TerraSAR-X. GFZ's orbits label their frame
  `CTS`, which `analysis/reference-states` refuses as not an ITRF
  realization; that is a module change, not made here.

### OMM-only (scored against later OMMs, section 8)

These are all confirmatory. A class is taken from the object's newest OMM
created in the 7 days before the window's selection date (section 4):
`OBJECT_TYPE`, mean motion n (rev/day), eccentricity e, and perigee and
apogee heights.

| Regime | Objects | Orbit |
| --- | --- | --- |
| LEO-drag | debris and rocket bodies | n > 11.25, perigee 250–600 km |
| LEO-upper | debris and rocket bodies | n > 11.25, perigee ≥ 600 km |
| MEO | rocket bodies; retired GNSS payloads | perigee > 2,000 km, apogee < 30,000 km, e < 0.25 |
| GEO+ | dead payloads, rocket bodies, debris | 0.9 ≤ n ≤ 1.1, e < 0.1 |
| HEO | rocket bodies, debris, payloads; subclasses below | e ≥ 0.25, perigee < 2,000 km |

Class rules:

- **Retired GNSS payloads:** objects named NAVSTAR/GPS, COSMOS (GLONASS),
  GALILEO/GIOVE, or BEIDOU/COMPASS, with no satellite–PRN assignment valid
  at the selection date in IGS's metadata (`igs_satellite_metadata.snx`).
- **Dead GEO payloads:** payloads in the GEO region drifting at
  |n − 1.00274| > 0.0025 rev/day (about 0.9°/day or more). That covers
  graveyard and drifting satellites.
- **HEO subclasses:**
  - GTO: apogee ≥ 30,000 km, inclination < 35°.
  - Molniya: period 690–750 min, inclination 60–66°.
  - HEO-other.
- **Exclusions:** objects with perigee below 250 km (decaying within days),
  `OBJECT_TYPE` UNKNOWN or TBA, and objects with a `DECAY_DATE`.

Active payloads are out of scope here. Operator ephemerides cover them (E4
amendment A5).

## 4. Windows and samples

| Window | Cutoffs (UTC) | Use |
| --- | --- | --- |
| dev | 2025-10-01 .. 2025-10-12 | plumbing; nothing is chosen |
| train | 2025-07-01 .. 2025-12-31 | weights, correlation, debiasing models (2025 is for training only; LEO and SLR truth starts about 2025-10-01) |
| validation | 2026-05-01 .. 2026-07-05 | the choices of section 10; the variances of section 11 |
| test (retrospective, locked) | 2026-07-20 .. 2026-08-31 | the answer; targets to 2026-09-07 (pseudo-truth to 09-09) |
| confirm (prospective, locked) | 2026-10-11 .. 2026-11-07 | confirmation on data that did not exist when this plan froze |

**Why this test window.** Every 2026 date up to 2026-10-09 lies inside
some earlier experiment's test or validation window, so no window is
unread at the date level. The window inventory is in `windows-read.md`;
its sources are each experiment's `PLAN.md`, `config.json` and run
manifests. Unread cells exist by class and object, and E7v2's
confirmatory cells are exactly those:

- **GLONASS and Galileo:** only E4 read them, with truth 2026-09-08..09-20.
  The test's last GNSS target is 2026-09-07.
- **The LEO-POD satellites above:** never converted to truth before this
  experiment.
- **OMM-only regimes:** E8 scored LEO rocket bodies and debris only in E5's
  windows (to 2026-07-08; OMMs loaded to 07-19). No experiment scored MEO,
  GEO+ or HEO passive objects.
- **GPS, Swarm, Sentinel-1 and the SLR satellites:** read in every 2026
  window through 09-26. They are reported in the test window as read cells.
  Their confirmatory answer comes from the prospective window.

**Prospective window.**

- Runs once every truth product covers its last target plus its release
  latency (section 8): ESA final ≤ 14 d, NSGF 3 d, ILRS 7 d, DORIS 21 d,
  GRACE-FO and COSMIC-2 3 d, Sentinel-1 20 d, Swarm 50 d.
- Earliest run 2026-12-08, latest 2027-01-31. A product still missing then
  leaves its cells unscored.
- Uses the frozen choices unchanged and the same statistics.

**Samples (truth-rich classes).** As in E7 (`schedule`):

- **Product times:** at a stride from each window's first day, staggered
  across objects.
- **Sample OMM:** at each product time, the object's OMM with the latest
  epoch among those created by then, at most 1 day old.
- **Cutoff:** that OMM's `CREATION_DATE`.

Strides:

| Class | Validation | Test and confirm |
| --- | --- | --- |
| GNSS-GE | 6 d | 1 d |
| LEO-POD | 11 d | 2 d |
| GPS, LEO-POD-E7, SLR-LEO, SLR-MEO | 11 d | 4 d |

The read classes take a coarser test stride: their test cells are reported,
not confirmatory, so their compute goes to the confirmatory cells.

A sample whose targets are all missing is not scheduled.

**Samples (OMM-only regimes).**

- **Population:** every object meeting a regime's rule at the selection date
  (validation 2026-04-30, test 2026-07-19, confirm 2026-10-10).
- **Objects:** K drawn per regime, without replacement, seeded by window
  and regime (section 11).
- **Product times:** uniform in the window. Validation takes one per object.
  Test and confirm take two per object, at least 14 days apart (one when the
  window is shorter than 28 days).
- **Sample OMM:** at each product time, the newest OMM created by then, at
  most 1 day old (3 days in GEO+).

## 5. Weights, correlation and debiasing

**Pseudo-observation covariance.** Each OMM's epoch state carries the
class's 6×6 RTN second moment S of the epoch error. One covariance block
spans the arc, with cross terms S_ab·√(ρ_a(Δt)ρ_b(Δt)): ρ_a is component
a's correlation between two OMMs' epoch errors Δt apart, exponential with a
nugget (E7's choice in every regime; not re-selected here). The module raises the block to positive definite
(`covariance_regularization` 1, correlation floor 1e-3) and reports what it
changed.

- **Truth-rich classes:** S and ρ come from the train window as in E7's
  step 10.
  - GPS, LEO-POD-E7, SLR-LEO and SLR-MEO reuse E7's
    `results/e7/train/{weights,correlation}.json`.
  - GNSS-GE and LEO-POD are trained here.
- **OMM-only regimes:**
  - **Correlation:** taken from a reference class: LEO-drag from LEO-POD-E7,
    LEO-upper from SLR-LEO, and MEO, GEO+ and HEO from GPS.
  - **S:** the reference's S scaled per component by (q_regime /
    q_reference)². q is the RMS of the R, T and N differences between
    consecutive OMMs at the later epoch (SGP4, gaps under one day), in the
    train window, computed the same way for both classes.

**Debiasing.**

- **Truth-rich classes.** One of two models, chosen per class on validation
  by S-debiased's median 3D error at 72 h (ties go to model a):
  - (a) E7's per-object history: the OMM's along-track error at epoch, in
    seconds of flight, as a constant plus the Moon-anomaly pair, by ridge 1.
    It is fitted to the object's OMMs whose precise orbit was released by
    t0, over the latest W days, with W in {15, 30, 60} chosen on
    validation.
  - (b) E1's form refitted per class on the train window: the Moon and Sun
    solid harmonics and anomaly pairs (M3c, K = 2) plus the argument of
    latitude at epoch (sin u, cos u, sin 2u, cos 2u), per-object effects,
    and ridge 1000, with the along-track error at epoch as the target. For
    GPS, (b) is E1's published model.
- **OMM-only regimes.** No truth exists, so a bias common to an object's
  OMMs cannot be identified from OMMs: later OMMs share it. What later OMMs
  can identify is the part of the along-track error that varies with the
  epoch's position in the orbit:
  - **Model:** per regime, ridge 1000 on the argument-of-latitude pairs
    alone, with no intercept and no object effects.
  - **Target:** each training OMM's along-track difference, in seconds of
    flight, from the next OMM of the same object within 2 days (SGP4 at the
    later epoch, minus that OMM's epoch state).
- **Applying a model.** Like E1's correction: the mean anomaly is shifted by
  minus the predicted error, then the epoch state is recomputed by
  `analysis/epoch-state`.

## 6. Force model and fit parameters

`propagator/hpop` through the PRW execution path, as pinned in `config.json`
`modulesBinary` (the code refuses another binary). JPL DE440s supplies the
Sun, Moon, Venus, Mars and Jupiter. Every regime uses:

- solid Earth tides (IERS 2010) and relativity (IERS 2010);
- integration tolerance 1e-12 in truth-rich classes and 1e-11 in OMM-only
  regimes, with a 300 s maximum step. E7 used 1e-13. On a dev LEO-drag
  sample, against 1e-13, positions after 1, 3 and 7 days moved by 0.015,
  0.05 and 0.33 m at 1e-12, and by 0.18, 1.3 and 6.6 m at 1e-11. Both are
  far below the errors compared;
- EOP rows released by t0 (one day late);
- drag from NRLMSISE-00 with the drivers released by t0 (E7: GFZ observed
  indices before the newest NOAA SWPC RSGA issued by t0, its observed F10.7
  and estimated Ap, its 3-day forecast, then held).

| Class | Gravity | Drag | SRP model | Fitted parameters (a priori σ) |
| --- | --- | --- | --- | --- |
| GPS, GNSS-GE | 20 × 20 | no | box-wing where published (GPS IIR, IIR-M, IIF), else cannonball | ECOM2 × 11 (D0 2e-8; others 2e-9 m/s²); in-track 1e-10 |
| LEO-POD, LEO-POD-E7 | 70 × 70 | yes | cannonball | B ≥ 0 (σ max(B₀, 0.01)); in-track 1e-7 |
| SLR-LEO | 70 × 70 | yes | sphere | B ≥ 0 (0.002); in-track 5e-9 |
| SLR-MEO | 30 × 30 | no | sphere | in-track 1e-11 |
| LEO-drag | 70 × 70 | yes | cannonball, Cr·A/m = 0.6 B₀ | B ≥ 0 (σ max(B₀, 0.01)); in-track 1e-7 |
| LEO-upper | 70 × 70 | yes | cannonball, Cr·A/m = 0.6 B₀ | B ≥ 0 (σ max(B₀, 0.01)); in-track 2e-8 |
| MEO | 20 × 20 | no | cannonball, Cr·A/m 0.01 | ECOM2 × 11 (D0 1e-7; others 1e-9); in-track 1e-10 |
| GEO+ | 12 × 12 | no | cannonball, Cr·A/m 0.02 | ECOM2 × 11 (D0 1e-6; others 1e-8); in-track 1e-10 |
| HEO | 70 × 70 | yes | cannonball, Cr·A/m = 0.6 B₀ | B ≥ 0 (σ max(B₀, 0.01)); ECOM2 × 11 (D0 1e-7; others 1e-9); in-track 1e-9 |

Coefficient conventions:

- **B₀:** Cd·A/m from B* (12.741621 B*, negative taken as 0) in OMM-only
  regimes and LEO-POD. It is the nominal value from physical data where
  `config.json` `physical` has it (E7's objects).
- **Pseudo-observation weights:** a priori state σ of 100 km and 10 m/s.
- **ECOM2:** the terms are accelerations added to the cannonball or
  box-wing a priori.
- **In-track:** a constant acceleration along T.

## 7. The DCA stand-in (H-arc-v2-DCA): a capability bound

E5's stand-in for the Dynamic Calibration of the Atmosphere corrects
JB2008's exospheric temperature by a global term a00. It is fitted per 3-hour
bin to public densities (Swarm A/B/C, GRACE-FO).

H-arc-v2-DCA uses JB2008 as follows:

- **Over the fit span:** JB2008 with SET's observed drivers, plus a00 from
  the bins (E5's analysis mode, D2).
- **After t0:**
  - The drivers are held at their last value before t0 (persistence).
  - a00 relaxes from the nowcast to the mean of the preceding 27 days'
    bins: level + (now − level)·exp(−(t − t0)/τ). The nowcast is the mean
    of the bins in the 12 h before t0, and τ = 12 h (E5's choice).
- **Coverage:** samples without a bin in the 12 h before t0, or with fewer
  than 7 days of bins in the preceding 27, get no H-arc-v2-DCA (counted,
  not a failure).

The bins are E5's published ones, plus E5's own computation for
2026-04-25..06-01 and 2026-07-10..08-01. The latter is recorded in
`runs/e7v2-dca/manifest.json` and must reproduce E5's published bins where
they overlap.

These inputs were **not** public at t0. SET publishes JB2008's drivers about
45 days late, and the densities come about 10 weeks late. So H-arc-v2-DCA
measures what a real-time DCA with real-time drivers would add, as the
Space Force's HASDM has them. It is not an operational product. The
operational products use NRLMSISE-00 with drivers released by t0
(section 6).

A latency-free public stand-in is a density from the OMM decay of the
catalog itself (E8, D5). If E8 lands before this plan freezes, a dated
amendment may add it as H-arc-v2-D5. In the test window the stand-in's
inputs exist only for cutoffs up to 2026-07-31.

## 8. Truth, pseudo-truth and errors

**Truth targets** (truth-rich classes, E7): the first precise-orbit state at
or after epoch + h within 15 minutes, for h ∈ {0, 6, 12, 24, 48, 72, 168}
hours.

**Pseudo-truth targets** (every class):

- **Target OMM:** the first OMM of the object with epoch in [epoch + h,
  epoch + h + max(1 h, h/4)], for h ∈ {6, 12, 24, 48, 72, 168} hours. The
  version used is the latest as read from the archive.
- **Target state:** that OMM's epoch state from `analysis/epoch-state`.
- **Comparison:** every product is evaluated at that OMM's epoch.

**Errors:** the product minus the (pseudo-)truth, in the (pseudo-)truth
state's RTN axes, in metres. The headline is the 3D norm.

**Pseudo-truth on truth-rich classes.** Every truth-rich sample is scored
against both truth types. Per class and horizon, at the pseudo-truth OMMs'
epochs, this measures:

- **The pseudo-truth's own error:** median, RMS and mean RTN bias of the
  pseudo-truth OMM's epoch state against truth. This is the floor below
  which no product can score.
- **The correlation favouring SGP4:** the correlation of S's along-track
  error with the pseudo-truth's along-track error. Later OMMs come from the
  same orbit-determination process as the OMM S propagates. Where their
  errors are positively correlated, S looks better against later OMMs than
  against truth, while an HPOP product does not share that error.
- **The bias factor:** (V/S under pseudo-truth) / (V/S under truth) at
  72 h, with an object-blocked bootstrap CI.

The OMM-only answers are reported with the bias factors of the
nearest truth-rich class (LEO-drag: LEO-POD; LEO-upper: SLR-LEO; MEO,
GEO+, HEO: GNSS). This is a caveat only. No OMM-only ratio is corrected
by it.

## 9. Statistics

**Primary.** Per regime, 72 h: the ratio of median 3D errors, product over
S, on paired samples.

- **Sample set:** every sample where S has a target. A product failure
  counts as an unbounded error for that product.
- **CI:** 95 % from an object-blocked bootstrap: objects resampled with
  replacement, each keeping all its samples; 4000 resamples, seed 20261010.
- **p-value:** two-sided, (1 + #{r* ≥ 1})/(B + 1) and the mirror, doubled.

**Family and decision.** Holm at α = 0.05 within each regime. The family is:

- H-arc-v2 / S;
- H-arc-v2-debiased / S;
- H-arc-v2-DCA / S (drag regimes with at least 50 covered samples).

A comparison's answer:

- **better:** Holm-adjusted p < 0.05 and ratio < 1;
- **meaningfully better:** also the Bonferroni-adjusted (1 − 0.05/m)
  upper bound below 0.8;
- **worse:** adjusted p < 0.05 and ratio > 1;
- **undecided:** otherwise.

**Secondary** (reported; no multiplicity claims):

- the other horizons (6 h, 1 d and 7 d named; 12 h and 48 h);
- each product against S-debiased and against H-epoch;
- the increments (debiased / v2, DCA / debiased);
- object classes within a regime (rocket body, debris, dead payload;
  GPS / GLONASS / Galileo; GTO / Molniya);
- E7's maneuver classes;
- E7's two-way (object × UTC day) bootstrap, as a sensitivity: a regime
  where it changes the answer is flagged;
- the median of per-sample ratios, and the ratio of 95th percentiles;
- the read cells of the test window.

**Operational acceptance** (E7's tables): per class, product and horizon,
the median, 95th and 99th percentiles, RMS, max, scored/attempted, and
unbounded failures.

**Covariance realism** (truth-rich classes, H-arc-v2 products): d² of the
error under the fit covariance, propagated by HPOP and scaled by
max(1, χ²_red). Reported as mean d²/3 and the fraction below χ²₃'s 95th
percentile.

## 10. Choices made on validation

Per class, each choice is the one minimizing the median 3D error at 72 h
against the class's primary truth type (ties: the simpler or shorter):

- **Arc span** for H-arc-v2:
  - LEO classes: 2, 4 or 7 d;
  - GNSS, MEO and SLR-MEO: 4, 7 or 14 d;
  - GEO+: 7, 14 or 28 d;
  - HEO: 4, 7 or 14 d.
- **Debiasing model and window** (truth-rich, section 5), judged by
  S-debiased.

The debiased and DCA products use the span chosen for H-arc-v2. Nothing
else is tuned. The choices are written to `config.json` `chosen` before the
freeze.

## 11. Power and sample sizes

**Target.** A true ratio of 0.8 must resolve with 80 % power under the
primary test. With Holm's first step at α/3 (two-sided), that needs a
standard error of the log ratio of 0.069.

**E7's errors at 72 h** (log ratio, from its 95 % CIs):

| E7 class, H-arc-type / S | n | objects | SE | factor to 0.069 |
| --- | --- | --- | --- | --- |
| GPS | 86 | 29 | 0.33–0.39 | 16–24 |
| LEO-POD | 39 | 6 | 0.41–0.44 | 27–31 |
| SLR-LEO | 44 | 6 | 0.34–0.35 | 19–20 |
| SLR-MEO | 26 | 5 | 0.52–0.69 | 43–74 |

E7's SE comes from its two-way bootstrap of a ratio of medians at small
n. With independent samples spread over many objects, the same dispersion
(log-error SD about 0.8–1.1) gives a standard error of about 1/√n.

**Sizing rule:**

- **Per-regime SE:** after validation, the object-blocked SE of H-arc-v2 /
  S at 72 h, with validation's sample design.
- **OMM-only regimes:** K_val = 40 objects with one sample each. Then
  K_test = min(population, ⌈1.2 · K_val · (SE_val/0.069)²⌉), between 100 and
  600 objects with two samples each. The lower bound keeps every regime's
  object classes represented. The upper bound is compute: a LEO sample costs
  about 4–5 minutes of one process (dev), and the machine allows 4 processes.
- **Truth-rich classes:** the objects are fixed and the strides are the
  minimum of section 4. The plan reports each class's minimum detectable
  ratio at 80 % power, from its validation SE scaled to the test's sample
  count.

The values fixed before the freeze are in `config.json` `sampleSizes`.

## 12. HPOP version

The test runs on the `propagator/hpop` binary pinned in `config.json`. At
the draft this is modules `34869f3d`, HPOP WASM `0d1f6264…` (version 1.1.0,
as in E7).

- **HPOP 1.2.0 lands before the freeze:** the plan pins it and re-runs
  validation on it.
- **It lands after the freeze but before the test read:** a dated amendment
  switches the pin, and validation is re-run before the test.
- **It lands after the test read:** the test is re-run on it as a
  sensitivity analysis. The frozen binary's result stays the answer.

## 13. Products for E9

Each H-arc-v2-type run writes, per sample, a product record to
`runs/<run>/products.jsonl.gz`: the fitted state, parameters and covariance
(GCRF and RTN), fit diagnostics, cutoff, sources and module hashes. These
records stay local. A committed `results/e7v2/products/index.json` gives
their schema, counts and SHA-256s, so E9 can read them on this machine.

## 14. Rules

- **Information cutoff:** every input a product reads was public by t0.
  The exception is H-arc-v2-DCA (section 7).
- **Information cutoff, scoring:** truth and pseudo-truth enter only
  scoring.
- **Element sets:** element sets and per-sample tables stay in `runs/`.
  Only aggregates are committed. Data licences follow
  `data/licenses.json`.
- **Compute:** nice, at most 12 threads, 1-minute load under about 55,
  disk floor 30 GiB.
- **Failures:** failures are results. A fit that does not converge is that
  product's failure for the sample (an unbounded error in section 9).
  Unconverged fits are not refitted with other settings.

## 15. Amendments

None yet. A deviation after the freeze is recorded here, dated, with its
reason, and reported in the results.
