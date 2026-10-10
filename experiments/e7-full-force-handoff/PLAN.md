# E7 — Full-force HPOP from an OMM, against SGP4

Pre-registration. Status: **frozen** by the commit that sets
`"frozen": true` in [`config.json`](config.json), after the train and
validation windows fixed the choices of section 5 (`config.json` `chosen`:
B rule `nominal` for LEO-POD and SLR-LEO; arc spans GPS 14 d, LEO-POD 2 d,
SLR-LEO 7 d, SLR-MEO 28 d; debiasing windows GPS 30 d, LEO-POD 15 d,
SLR-LEO 60 d, SLR-MEO 60 d; correlation form exponential with a nugget in
every regime). That commit's SHA is recorded in every later run manifest. The code refuses the
test window until `config.json` and this file are committed with
`"frozen": true` and unchanged in the checkout.

Graph task: `e7-full-force-handoff-20261009`.

## 1. Question

The Evidence-Supported ASO Catalog whitepaper, section 5 ("Initializing
numerical propagation from an OMM"), hands an element set to numerical
propagation: SGP4 at zero elapsed time gives a TEME state, the state is
rotated to GCRF, and HPOP propagates it. Does that handoff, with **every
force HPOP carries** (the owner's definition of HPOP; no reduced or resident
model is called HPOP here), predict an object's position better than the
same OMM propagated by SGP4 over the next 0 to 7 days? If not from one
state, does fitting HPOP to an arc of the object's OMMs (with diagonal or
correlated weights, from published, debiased or E1-corrected OMMs) change
the answer?

## 2. Products

One row per variant of `config.json` `variants` (the harness runs the table;
a later experiment can reuse it with another table).

| ID | What propagates | Modules |
| --- | --- | --- |
| S | The latest OMM, by SGP4 (baseline) | `analysis/gp-error-model` `accumulate` |
| H-epoch | **The handoff**: HPOP from the OMM's epoch state, B by the rule chosen on validation | `analysis/epoch-state` `derive`, `propagator/hpop` `invoke` |
| H-arc | HPOP fitted by weighted batch least squares to the epoch states of the object's OMMs over the arc span chosen on validation (state, plus Cd·A/m in the drag regimes or four ECOM2 coefficients for GPS; state only for SLR-MEO), arcs split at maneuvers (section 4), diagonal weights | + `analysis/estimation` `fit_batch`, `analysis/maneuver-detection` |
| H-arc-GLS | H-arc with the inter-OMM error correlation (section 5) in the weights | as H-arc |
| H-arc-debiased | H-arc on OMMs whose along-track bias was removed by a model fitted to the object's own history before the cutoff (section 4) | as H-arc |
| H-epoch-E1, H-arc-E1 | H-epoch and H-arc from E1-corrected OMMs (GPS; E1's frozen model `results/e1/fit/e1-gps-epoch-20-fit-20261009T172522Z/model.json`, M3* = M3c-K2-ridge1000) | as above |
| S-E1, S-debiased | SGP4 from the corrected OMM (descriptive) | as S |
| H-truth | HPOP from the precise orbit's own state at the first target: the dynamics alone (descriptive) | as H-epoch |
| H-epoch:other-B | H-epoch with the B rule not chosen (drag regimes; descriptive) | as H-epoch |
| H-epoch-JB2008-released, H-epoch-JB2008-observed, H-arc-JB2008-observed | JB2008 instead of the operational NRLMSISE-00: with SET's drivers as public at the cutoff (45 days late, held), or with the drivers observed over the prediction (a hindcast; LEO-POD, descriptive) | as above |

Every orbit computation runs in a module through the
`space-data-module-sdk` harness; this repository frames records, applies the
module's RTN rotation to a difference vector and a covariance, and computes
statistics.

## 3. Force model (HPOP, full force)

`propagator/hpop` PRW execution path, `space-data-network-modules` main at
`095c20a6`, HPOP WASM SHA-256 `0d1f6264…` (`config.json` `modulesBinary`;
the code refuses another binary), SDS 1.241.0.

| Force | GPS | LEO-POD | SLR-LEO | SLR-MEO |
| --- | --- | --- | --- | --- |
| Earth gravity, EGM2008 in Earth-fixed axes with IERS EOP 20 C04 | 20 × 20 | 70 × 70 | 70 × 70 | 30 × 30 |
| Sun, Moon, Venus, Mars, Jupiter (JPL DE440s) | yes | yes | yes | yes |
| Solar radiation pressure, conical shadow | GNSS box-wing a priori (IIR, IIR-M, IIF) at the IGS SINEX mass; cannonball for GPS III | cannonball, nominal Cr·A/m | cannonball, nominal Cr·A/m | cannonball, nominal Cr·A/m |
| ECOM2 (CODE; D0, B0, B1 cos/sin), fitted | arc fits only | — | — | — |
| Drag (operational: NRLMSISE-00 with released drivers; section 4) | — | yes | yes | — |
| IERS 2010 solid Earth tides (steps 1 and 2) | yes | yes | yes | yes |
| IERS 2010 relativity (Schwarzschild, Lense–Thirring, de Sitter) | yes | yes | yes | yes |

Integrator: RK78, relative tolerance 1e-13, steps of at most 300 s.

**Degrees.** A degree-n term falls off as (R/r)ⁿ: at GPS (r ≈ 26,560 km)
that ratio is 0.24 and the terms above degree 12 are below 1e-10 m/s²; 20 × 20
leaves margin. LAGEOS and LARES-2 (r ≈ 12,270 km, ratio 0.52) and ETALON need
little more; 30 × 30 leaves margin. Below 2,000 km the field matters to high
degree: 70 × 70 is the largest field the module carries; LEO orbit
determination commonly uses 70 to 120, so the terms above 70 are a stated
omission.

**Not carried by the module, so not modelled**: ocean tides, pole tides,
Earth albedo and infrared radiation pressure (in the library, not on the PRW
request), drag above 2,000 km, a box-wing for GPS III (no published surface
set; GPS III uses the cannonball, 1500 kg, 20 m², Cr 1.3, as V1 and E3), and
the eclipse-season yaw manoeuvres of the box-wing attitude.

**GPS radiation pressure.** H-epoch and H-truth use the box-wing a priori
(Rodriguez-Solano et al. 2012) of the satellite's block, from the IGS
satellite metadata SINEX (block by NORAD number, in-orbit mass at the epoch).
ECOM2 needs fitted coefficients, so it enters only the arc fits: the state
and four ECOM2 coefficients (D0, B0, B1 cos, B1 sin) fitted together, each
starting at 0 with an a priori σ of 2e-9 m/s². Four, because
`analysis/estimation` `fit_batch` solves for at most four dynamic parameters
(HPOP carries all eleven); of the five-term reduced ECOM (D0, Y0, B0, B1
cos/sin) Y0, the smallest, is dropped.

**Physical coefficients** (nominal, not fitted, `config.json` `physical`):
Cr·A/m from mass, cross-section and Cr per object (spheres from the ILRS
mission pages; Swarm and Sentinel-1 from published dimensions, rounded); Cd
2.2.

**B from an OMM.** B* is not a ballistic coefficient: it is SGP4's fitted
drag term and absorbs other along-track error. Two rules; validation chooses
for H-epoch, per drag regime:

- `bstar`: Cd·A/m = 2 B* / (ρ₀ R_E) = 12.741621 B* m²/kg (B* in 1/R_E,
  ρ₀ = 2.461e-8 kg/m³ SGP4's reference density, R_E = 6378.135 km); a
  negative B* is taken as 0.
- `nominal`: Cd·A/m = 2.2 A/m from the object's nominal mass and
  cross-section.

The arc fits start B from `bstar` and fit it (a priori σ 0.02 m²/kg for
LEO-POD, 0.002 m²/kg for the SLR-LEO spheres, whose nominal Cd·A/m is 6e-4
to 1.2e-2). `propagator/hpop` refuses a negative Cd·A/m (a module gap: the
estimator's iterate is unconstrained). When a fit asks for one, or converges
to one, the arc is fitted again with a constant in-track acceleration in
place of B (a priori σ 1e-7 m/s² for LEO-POD, 5e-9 m/s² for SLR-LEO, about
the drag acceleration of each regime), B held at its starting value; the
report counts these fallbacks.

## 4. Data, the information cutoff and the methods' inputs

**Information cutoff.** Each sample's cutoff is its OMM's `CREATION_DATE`.
Every variant (except those marked "observed") reads only what was public by
then:

| Input | Rule at the cutoff |
| --- | --- |
| OMMs | `CREATION_DATE` at or before the cutoff (arcs, debiasing history, maneuver detection) |
| Earth orientation (IERS EOP 20 C04 through `data-source/eop-parser`) | Rows for days up to the cutoff's day minus 1 (the IERS rapid service is daily; the C04 values stand in for the rapid values released then); later days repeat the last released row |
| NRLMSISE-00 drivers (operational) | NOAA SWPC's Report of Solar-Geophysical Activity (RSGA, issued daily at 22:00 UTC, archived at SWPC's warehouse): the newest report issued by the cutoff gives the observed F10.7 and estimated Ap of its day d and three days of predictions, day d+3 held after; days before d take GFZ Potsdam's observed Kp, ap and F10.7 (definitive values standing in for those released then). Kp of a predicted day from its Ap by the standard ap-Kp table. The 81-day centred F10.7 mean: over the released observed days in the window when at least 41 are, otherwise the last 81 released days |
| JB2008 drivers (SET SOLFSMY/DTCFILE) | Public 45 days late: rows to the cutoff's day minus 45 days, the last released row (hourly DTC at its last hour) held after. JB2008 therefore runs operationally only from 45-day-old drivers (H-epoch-JB2008-released); with the observed drivers it is a hindcast |
| Truth used by the debiasing | Released by the cutoff: Sentinel-1 POEORB at the creation time in its name; ESA final GNSS orbits 14 days after the product's span, Swarm 30 days, NSGF SLR arcs 3 days, ILRS weekly arcs 7 days (service latencies; `config.json` `cutoff`) |
| E1's model, the train weights and correlation, the IGS SINEX, DE440s | Fixed before every window they are used on |

Horizons count from the OMM's epoch (the handoff's start); the cutoff's lag
behind the epoch is reported.

**Truth and windows.**

| Regime | Objects | Truth |
| --- | --- | --- |
| GPS | every GPS satellite in the ESA final orbits | ESA0OPSFIN (5 min) through `analysis/reference-states` |
| LEO-POD | Swarm A/B/C, Sentinel-1A/1C/1D | Swarm `SP3*COM` (10 s), Sentinel-1 `AUX_POEORB` (10 s) |
| SLR-LEO | Starlette, Stella, LARETS, WESTPAC, Ajisai, LARES | NSGF SLR arcs |
| SLR-MEO | LAGEOS-1/2, ETALON-1/2, LARES-2 | ILRS weekly combination; NSGF (LARES-2) |

GRACE-FO, COSMIC-2 and TerraSAR-X/TanDEM-X precise orbits are not converted
by `analysis/reference-states` on this machine and are not used.

| Window | From | To | Use |
| --- | --- | --- | --- |
| Dev | 2025-10-01 | 2025-10-12 | Plumbing and acceptance (section 8); nothing chosen |
| Train | 2025-10-15 | 2025-12-31 | Weights and the correlation model (section 5) |
| Validation | 2026-01-15 | 2026-03-31 | The choices of section 5 |
| Test (locked) | 2026-05-01 | 2026-08-10 | Read once, after the freeze |

The test window lies inside E1's test window, so E1's model never saw it,
and ends where the truth (Swarm 08-19, SLR 08-29) still covers 7 days.

**Samples.** For each object and each product time t (the window's start at
00:00 UTC plus multiples of the stride: test GPS 14 days, LEO-POD 14,
SLR-LEO 14, SLR-MEO 10, the j-th object of a regime starting j mod stride
days later so the samples cover every day of the window; validation 5, 6,
6, 5, not staggered; set by the compute a 70 × 70 arc fit costs on a shared
machine, at most 10 processes), the OMM with the latest epoch among
the object's OMMs created at or before t, at most 1 day old. **Targets**: for
each horizon h in {0, 6, 12, 24, 48, 72, 168} hours, the first truth state at
or after the OMM's epoch + h, at most 15 min later; a horizon without one is
missing for every variant alike.

**Arcs.** The object's OMMs created by the cutoff with epochs in [epoch −
span, epoch]. An arc needs at least 3 OMMs, unless it was split.

**Maneuvers.** `analysis/maneuver-detection` (`detect_maneuvers`, default
thresholds) on the SGP4 trajectories of the object's OMMs created by the
cutoff, from the cutoff back over the regime's longest span plus 10 days.
Each trajectory is SGP4's, computed by `analysis/gp-error-model`
`accumulate` against a fixed carrier state (the module returns SGP4 minus
the carrier in the carrier's RTN axes, which are the GCRF axes, so adding
the carrier back is a translation), on a 60 s (LEO) or 300 s grid from the
OMM's epoch forward past the next OMM's (the module scores forward only),
at most 4 days. The module needs consecutive blocks to overlap, so the
history is cut where one block ends before the next begins (a longer OMM
gap: a blind spot), and each run of at least 7 blocks is searched; a
detection the module refuses leaves the arc whole and is counted.
An arc with a maneuver detected inside it **splits**: it starts after the
last such maneuver, keeps at least the sample's own OMM, and is fitted
whatever its length. Every sample is also classed for the report, from the
same detection over every OMM (later ones included): maneuver before the
cutoff in the arc span; maneuver in the prediction span; none detected.

**Debiasing** (after Hallgarten La Casta and Amato 2024, arXiv:2412.15793).
The along-track error of each OMM at its epoch, in seconds of flight (SGP4
minus truth, T component, over the truth's speed), is modelled per object as
a constant plus one sinusoid in the Moon's mean anomaly (E1's anomaly pair,
from module-computed Moon geometry), by ridge regression (λ 1 on the pair)
over the latest W days of the object's OMMs that were created by the cutoff
and whose truth was released by it; with 3 to 9 such OMMs, a constant only;
fewer, no correction. The correction is applied as E1 applies one (mean
anomaly + n·Δt, Δt = − the predicted error). Hallgarten La Casta and Amato
build their models from an OMM-based error metric, without precise orbits;
this one uses the object's released precise orbits, which only objects with
precise orbits have.

## 5. Fitted choices (train and validation)

- **Weights (train).** For each regime, the second moment about zero of the
  SGP4 epoch-state error 6-vector (R, T, N and their rates) at the first
  truth state after every OMM epoch in the window, each component clipped at
  5 robust sigma; for GPS also of E1-corrected OMMs (H-arc-E1). Each
  pseudo-observation's 6 × 6 RTN covariance. `results/e7/train/weights.json`,
  pinned by SHA-256 at the freeze.
- **Correlation model (train; form on validation).** For each regime and RTN
  component, the correlation of two OMMs' at-epoch errors (same object; the
  same clip) in bins of the time between their epochs (0–6, 6–12, 12–24,
  24–48, 48–96, 96–168 h), and two forms fitted to it by pair-weighted least
  squares: exponential ρ(Δt) = exp(−Δt/τ), and exponential with a nugget
  ρ = (1 − w) exp(−Δt/τ). The form with the smaller pair-weighted squared
  error against the validation window's correlations is chosen per regime
  (equal: exponential). `results/e7/train/correlation.json`, pinned. E2b
  (`results/e2b/train/correlation-model.json`) measures a different
  correlation: of two OMMs' errors at a common epoch (the older one
  propagated to the newer one's), which is high in every regime because
  SGP4's error depends on the time and orbit phase it is evaluated at. An
  arc's pseudo-observations each sit at their own epoch, where the relevant
  correlation is the one measured here; E2b's is reported beside it.
- **How H-arc-GLS uses it.** `fit_batch` takes one covariance per
  observation and no covariance between observations, so a true generalized
  least squares fit across OMMs cannot be posed to it (a module gap,
  reported). H-arc-GLS carries the correlation the way that interface allows:
  each component's variance is inflated by n / n_eff, n_eff = 1ᵀ C⁻¹ 1 the
  number of independent observations of the arc's common mean under the
  model's correlation matrix C over the arc's epochs (the GLS information of
  a common error). This changes the weights between components and against
  the a priori, and the fitted covariance; it is not the full GLS estimate.
- **B rule (validation)**, per drag regime: the rule with the lower median
  3D error of H-epoch at 72 h (paired; equal: `bstar`).
- **Arc span (validation)**, per regime: among {2, 4, 7} days (LEO) or {2,
  4, 7, 14, 28} days (GPS, SLR-MEO; long arcs after Hallgarten La Casta and
  Amato), the spans that produce a prediction for at least 90 % of the
  validation samples with an S error at 72 h; of those, the lowest median 3D
  error of H-arc at 72 h on the samples where every eligible span has one
  (equal: shorter). H-arc-GLS, H-arc-debiased and H-arc-E1 use it.
- **Debiasing window (validation)**, per regime: W in {15, 30, 60} days with
  the lowest median 3D error of S-debiased at 72 h (paired; equal: shorter),
  the window chosen by forecast performance as Levit and Marshall (2011)
  chose theirs.

The choices are written into `config.json` (`chosen`) before the freeze.

## 6. Endpoints, statistics and decision rules

**Error.** Prediction minus truth at the target, in the truth state's RTN
axes (R radial, N orbit normal, T = N × R): for SGP4 from `accumulate`, for
the HPOP variants from the GCRF difference rotated by `foundation/frames`.
The 3D error is its norm.

**Primary statistics** per regime × variant × horizon: median and 95th
percentile of the 3D error with 95 % intervals. **Operational acceptance,
beside them**: the untrimmed 3D RMS, the 99th percentile and the maximum;
samples scored over samples attempted (every sample of the regime with truth
at the horizon); and the median, 95th and 99th percentiles with every
failure and missing prediction counted as unbounded. **Covariance realism**
of the fitted variants (H-arc family): the fit's formal covariance times
max(1, reduced χ²), propagated by HPOP over the state and the fitted
parameters; at each horizon, the mean of d²/3 (d² = eᵀ P⁻¹ e, the 3D
position error under the 3 × 3 position covariance, both in RTN) and the
share inside the 95 % ellipsoid (d² ≤ 7.815). **Secondary**: median |R|,
|T|, |N|, and each axis's share of the squared error after a 5 robust-sigma
clip on the 3D error.

**Paired ratio.** For a variant V and comparator C (S unless stated), on the
samples where both exist: ρ = median 3D(V) / median 3D(C), with its interval
from a two-way (object × UTC day of the OMM epoch) pigeonhole bootstrap (Owen
2007), 2,000 resamples, seed 20261009, 95 % percentile.

**Classes.** At each horizon: *meaningfully better* when the upper bound of
ρ is below 0.8; *better* when it is below 1; *worse* when the lower bound is
above 1; otherwise *undecided*.

**The owner's question, per regime.** For H-epoch (primary), and H-arc,
H-arc-GLS, H-arc-debiased, H-epoch-E1 and H-arc-E1 (key secondary): **yes**
if meaningfully better than S at 24 h, 48 h, 72 h and 7 days; **partly** if
meaningfully better at some of them and worse at none; **no** otherwise.
These are classifications over many comparisons, not one test; the 0.8
margin is the guard, and every interval is reported.

**Also reported.** H-arc against H-epoch; H-arc-GLS and H-arc-debiased
against H-arc; the E1 variants against their uncorrected twins; H-truth
beside H-epoch (where H-truth is far below H-epoch, the initial state
dominates the error); the sensitivity variants against H-epoch or H-arc; the
maneuver classes; the fits' convergence, splits, iterations, fitted
coefficients and inflation factors. A failed sample (a module error, a fit
that does not converge, too few OMMs) is missing from its variant's primary
statistics and counted in the operational ones.

## 7. Threats to validity

- **Operational drivers** are the public ones (NOAA SWPC 3-day forecasts);
  JB2008's public drivers are 45 days late, so the operational drag model is
  NRLMSISE-00. The hindcasts with observed drivers bound what better drivers
  would give.
- **Maneuver detection** runs on SGP4 trajectories with the module's default
  (ISS-derived) thresholds, forward-only blocks (the crossing time is then the
  later set's epoch at best) and only OMMs created by the cutoff; it misses
  small burns (Sentinel-1 orbit control is centimetres per second).
- **Debiasing** needs the object's released precise orbits.
- **Truth gaps.** NSGF arcs leave gaps between arcs; Sentinel-1A truth ends
  2026-07-01. Missing horizons are counted, nothing is imputed.
- **Field truncation** at 70 in LEO, and the forces the module lacks
  (section 3).
- **Nominal coefficients** for Swarm and Sentinel-1 are rough; the arc fits
  fit B but not Cr·A/m in LEO.
- **Few objects** outside GPS (6, 6 and 5): their intervals are wide.

## 8. Acceptance of the harness (dev, before the freeze)

- A0.1 The RTN rotation from `foundation/frames` and the convention of
  `accumulate` agree on every dev target to 1e-12.
- A0.2 Every SGP4 target falls in a bin holding exactly one truth state.
- A0.3 H-truth at its seed is zero; SGP4 and H-epoch at the 0 h target:
  reported.
- A0.4 The carrier construction recovers SGP4's GCRF state at its first
  grid epoch (under a millisecond after the OMM's epoch) within 1 m and
  1 cm/s of `analysis/epoch-state`'s epoch state moved by its velocity over
  that interval.
- A0.5 Held Earth orientation after the cutoff moves H-epoch for GPS at 7 d
  by less than 1 m.

## 9. Order of work

1. Dev: steps 10 and 20 end to end; step 05.
2. Train: step 10 → weights and correlation. Validation: step 10 (the
   validation correlations), step 20, then step 30 writes the choices into
   `config.json`.
3. Freeze: set `"frozen": true`, commit.
4. Test: step 20 once; step 40 writes `results/e7/test/`.
5. Step 95: publish the non-Space-Track inputs under `data/e7/`.

## References

- Levit, C. and Marshall, W. 2011. Improved orbit predictions using
  two-line elements. Adv. Space Res. 47(7), 1107–1115.
  doi:10.1016/j.asr.2010.10.017, arXiv:1002.2277.
- Hallgarten La Casta, M. I. and Amato, D. 2024. Debiasing of two-line
  element sets for batch least squares pseudo-orbit determination in MEO and
  GEO. arXiv:2412.15793 (preprint submitted to Adv. Space Res.).
- Rodriguez-Solano, C. J., Hugentobler, U. and Steigenberger, P. 2012.
  Adjustable box-wing model for solar radiation pressure impacting GPS
  satellites. Adv. Space Res. 49(7), 1113–1128. doi:10.1016/j.asr.2012.01.016.
- Arnold, D. et al. 2015. CODE's new solar radiation pressure model for GNSS
  orbit determination. J. Geod. 89, 775–791. doi:10.1007/s00190-015-0814-4.
- Owen, A. B. 2007. The pigeonhole bootstrap. Ann. Appl. Stat. 1(2).

## Amendments

Dated changes, with their reasons; amendments after the freeze are reported
with the results.

**Before the freeze (2026-10-09), for the record.** Two validation batches
were stopped and discarded before this version of the plan: the first ran
on HPOP `7a81c1d5…` (modules `085dff2e`, cannonball for GPS, observed
drivers, no information cutoff) and was stopped when the coordinator moved
E7 to HPOP `0d1f6264…` with the GNSS box-wing and ECOM2; the second stopped
on a maneuver-detection framing fault (blocks that did not overlap). The
coordinator's review then added H-arc-GLS, H-arc-debiased, the maneuver
splits, the operational statistics and the information cutoff. The test
strides were set from the compute cost under a limit of ten processes. No
test-window record had been read.

**Before the freeze (2026-10-09): the in-track fallback.** The validation
batch (`v3`) found that HPOP refused 14–32 % of the LEO arc fits per span
because the estimator asked for a negative Cd·A/m, which would have made
every LEO span ineligible. The fallback of section 3 was added, and only the
(sample, variant) pairs that had failed so were run again with it (batch
`v3fix`, step 20 `--patch`); since the fallback changes nothing in a fit
that does not fail, the patched batch equals a full rerun with the fallback.
The choices of section 5 are made on `v3` patched by `v3fix`.
