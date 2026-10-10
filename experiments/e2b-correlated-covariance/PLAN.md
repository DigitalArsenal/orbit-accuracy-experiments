# E2b — Correlated OMM errors: cross-covariance, covariance products, covariance intersection, and the literature baselines

Plan. Status: **frozen** by the commit that sets `"frozen": true` in
[`config.json`](config.json) (2026-10-09), after train and validation and
before any read of the test window. Pinned in `config.json`: the train
products (`fitted`: T0, S(g), the correlation model R, C2a/C2b/C5, E3's
selection ranks; SHA-256 checked by the scoring step) and the validation
choice (`chosen`: GPS T0, LEO-POD T0, SLR-LEO T0, SLR-MEO T0). The code
refuses the test window unless both files are committed unchanged. Changes
made to the draft before the freeze are listed at the end, before any
amendment.

Lane: claude-e2b. Modules: `analysis/gp-error-model` at
space-data-network-modules `d3cc1211` (branch
`task/e2b-correlated-covariance-20261009`): `common_epoch`, `map_covariance`
(SGP4, two-body and Lambert state transition matrices) and `screening_cases`,
added for this experiment with tests against python-sgp4, pyerfa and an
independent two-body propagator.

## 1. Question

[E2](../e2-catalog-covariance/PLAN.md)'s C2b variant and its H4 test subtract
a reference set's own error second moment from consecutive-OMM differences.
That assumes the two sets' errors are uncorrelated. In fact

  Cov(e₁ − e₂) = P₁ + P₂ − C₁₂ − C₁₂ᵀ,

and consecutive OMMs share tracking data, so C₁₂ ≠ 0: subtracting P₂ does
not recover P₁, and no scalar scale (C5, reduced-χ² scaling) repairs a
missing correlation structure. E2's H4 already showed the symptom in GPS: the
consecutive differences were smaller than the at-epoch error, so the
corrected moment was not positive definite. E2 also left four literature
baselines unrun (C1a, C1b, C3a, C3b) for want of module functions.

1. Against precise orbits (train window), what are P(τ) and C₁₂(Δt) for
   consecutive and near OMMs, by regime?
2. Do covariance products that model the correlation reach consistency where
   C2a, C2b and C5 did not? Mean d²/3 and coverage, energy score, and the
   effect on probability of collision in the screening geometries of
   `analysis/gp-error-model` (head-on and 90° crossing).
3. How do the literature baselines C1a, C1b, C3a and C3b score on the same
   footing?
4. Fusing estimates whose cross-correlation is unknown: covariance
   intersection (Julier and Uhlmann 1997) against selection (E3's rule) and
   naive independent fusion, scored for error and covariance consistency
   against precise orbits. Covariance intersection guarantees a consistent
   covariance only for unbiased estimates; it cannot remove a bias the
   estimates share.

## 2. Hypotheses

| ID | Statement | Role | Supported if |
| --- | --- | --- | --- |
| H1 | Consecutive OMMs' errors at the later set's epoch are positively correlated along track. | Primary (Q1) | train, every regime: ρ_T > 0 with its 95 % lower bound > 0 |
| H2 | The correlation-aware product chosen on validation is consistent. | Primary (Q2) | test, every regime, at 0, 1 and 3 days: E2's three criteria (§7) |
| H3 | It is a better forecast than E2's best catalog-history variant. | Key secondary (Q2) | test, per regime: 1-day energy score ratio chosen / C5, upper bound < 1 |
| H4 | The measured correlation, not independence, explains the observable differences. | Secondary (Q2) | test, per regime: consecutive differences' mean d²/3 in [0.8, 1.25] under the correlated prediction, below 0.8 under independence |
| H5 | (descriptive) C1a, C1b, C3a and C3b on the same samples and statistics. | Q3 | consistency stated by E2's criteria, per regime and horizon |
| H6a | Naive fusion of an object's latest OMMs is overconfident. | Q4 | test, per regime, h = 1 d: mean d²/3 lower bound > 1.25 |
| H6b | Covariance intersection is no more overconfident than its inputs. | Q4 | test, per regime, h = 1 d: CI's mean d²/3 ≤ the largest input's |
| H6c | Covariance intersection is more accurate than selection. | Q4 | test, per regime, h = 1 d: median 3D error ratio CI / SEL, upper bound < 0.95 |

Each hypothesis is decided by its own rule; no family-wise correction is
applied (E2's practice). Every other number is descriptive.

## 3. Data

| Input | Source | Role |
| --- | --- | --- |
| Element sets | Space-Track `gp_history` (local archive, by creation day), SGP4 theory, ephemeris type 0; epochs within 1 s are one set (the later creation kept), as E2 | Everything |
| Precise orbits | `analysis/reference-states` output (GCRF, UTC) in `/opt/data/sdn-archive/reference-states/reference` | Truth |

Regimes (objects fixed here; NORAD numbers in `config.json`):

| Regime | Objects | Precise orbit (sampling) |
| --- | --- | --- |
| GPS | GPS satellites in ESA's final orbits (SP3 `G`) | ESA `ESA0OPSFIN` (5 min); IGS `IGS0OPSFIN` (15 min) on days without an ESA file (E2) |
| LEO-POD | Swarm A, B, C; Sentinel-1A, 1C, 1D | Swarm `SP3xCOM` (10 s); Copernicus `AUX_POEORB` (10 s) |
| SLR-LEO | Starlette, Stella, WESTPAC, Ajisai, LARES, LARETS | NSGF SLR arcs (2 min) |
| SLR-MEO | LAGEOS-1, LAGEOS-2, LARES-2, ETALON-1, ETALON-2 | ILRS combined arcs; NSGF for LARES-2 (2 min) |

Windows: E2's. They fit: precise orbits for every regime now cover train
and validation (E2 had GPS only), and the test window up to each product's
end (Swarm 2026-08-19; Sentinel-1A 07-01, 1C and 1D 08-31; ILRS 08-29; NSGF
08-28; ESA 09-23). Samples without a precise orbit are counted, not
imputed.

| Window | From | To | Use |
| --- | --- | --- | --- |
| Dev | 2024-10-01 | 2024-11-15 | GPS harness checks (A0) only |
| Train | 2025-10-01 | 2026-03-31 | Q1; every fitted number |
| Validation | 2026-04-01 | 2026-06-30 | Product choice (§7) |
| Test (locked) | 2026-07-01 | 2026-09-15 | Read once, after the freeze |

## 4. Measurement (Q1)

Every orbit computation runs in `analysis/gp-error-model`; this repository
selects records and computes statistics.

**Targets.** Every element set j with epoch in the window (E2's rule, [from,
to + 1 d)) is an anchor. For τ = 0, 1, 3 and 7 days its target is the first
precise-orbit epoch at or after epoch_j + τ, within the product's sampling
interval. At the target, every set of the object with epoch in
[epoch_j − 7 d, epoch_j] is propagated by SGP4 (`common_epoch`, origin the
precise state) and its error e (SGP4 minus precise, RTN of the precise
state, km and km/s) recorded with its age a = target − epoch.

From the targets:

- **Scoring samples** (j, τ): e_j at age a_j ≈ τ (plus at most one sampling
  interval). E2's footing: every set as published, age from its epoch.
- **Pair samples** (i, j, τ): two sets of the group at one target, i older,
  gap g = epoch_j − epoch_i ≤ 7 d; *consecutive* when i is j's predecessor,
  *near* otherwise.
- **P samples**: every (set, precise epoch) error once, by age.

**Statistics (train), per regime.** P(a): second moment about zero, mean and
covariance of e by age bin (§ config `ageBinsDays`, 0 to 14 days). C₁₂(g, τ):
for consecutive and for all near pairs, by gap bin (0–0.25, 0.25–0.5, 0.5–1,
1–2, 2–3, 3–5, 5–7 days) and τ: the cross second moment E[e_i e_jᵀ], the two
marginal second moments on the same pairs, the correlation matrix
R = D_i⁻¹ C D_j⁻¹ (D the square roots of the marginals' diagonals), the
difference second moment Σ_d = E[(e_i − e_j)(e_i − e_j)ᵀ] and its split into
P_i + P_j and −(C + Cᵀ). Per-axis correlations ρ_R, ρ_T, ρ_N with 95 %
cluster-bootstrap intervals (objects), and the same after removing each
object's mean errors (what is left when persistent errors are taken out).
E2's H4 again: Σ_d at gaps up to half
a day minus P(0), and whether it is positive definite. The model is written
to `results/e2b/train/correlation-model.json` (schema in that file) for E7
and the E9 capstone.

## 5. Covariance products (Q2, Q3)

Each gives a 3×3 RTN position covariance for set j at its scoring targets.

| ID | Definition | Fitted on |
| --- | --- | --- |
| C2a | E2: covariance (about the mean) of consecutive-set differences, gap in τ ± 0.5 d (τ = 0: 0–0.5 d), first later set per bin (`accumulate` without reference states) | train |
| C2b | E2: C2a − ½ C2a(τ = 0) (independence assumed) | train |
| C5 | E2: C2a × k(τ)², k so that mean d² = 3 on train | train |
| T0 | The measured covariance: P(a) of §4 (second moment about zero), linear in age between bin centres. By the identity it is what a difference covariance corrected with the measured cross-covariance recovers | train |
| K1 | κ_R · T0(a): κ_R the mean over the regime's consecutive pairs (gap ≤ 3 d) whose later set was created in the 28 days up to j's creation of dᵀ S(g)⁻¹ d / 3, d the consecutive difference (`common_epoch`, origin the later set) and S(g) its train second moment in gap bin g. Scales the measured covariance with the observable disagreement of recent sets | train (T0, S) |
| K1o | The same with the object's own pairs (at least 8; otherwise κ_R) | train (T0, S) |
| C1a | Osweiler (2006): the sets created by j's creation with epochs in [epoch_j − 14 d, epoch_j] (at least 7) propagated to epoch_j; the 6×6 sample covariance (n − 1) of their RTN residuals about the mean, in j's axes; mapped to each target by SGP4's state transition matrix (`map_covariance` `sgp4`) | — |
| C1b | Thompson, Gossner, Sais and Cunningham (2019): the same residual covariance, rotated with j's state and mapped back to the epoch of the oldest set along that set's Lambert arc (their section 4: the representative covariance at a set epoch), then mapped from epoch_j to each target along j's Lambert arc (`map_covariance` `lambert`) | — |
| C3a, C3b | Geul, Mooij and Noomen (2017) / Verhaeghe et al. (2025), as E2 pre-registered them: the sets created by j's creation with epochs in [epoch_j − W, epoch_j] (at least 4), W = ΔtPW(a) = 3 d below 2000 km mean altitude and 7 d above, propagated to the window's midpoint; over all M unordered pairs, Σ̂ = f Σ d dᵀ in the mean state's RTN axes with f = 1/(2M) (C3a) or 1/(4M) (C3b); taken as the covariance at epoch_j in j's axes and mapped by SGP4's state transition matrix | — |

Diagnostics, not products: E2's H4 subtraction Σ_d − P(0) (independence),
and the share of samples where C2b, C1a, C1b or C3 is not positive definite.

**Literature sources.** Thompson et al. (2019) was read in full. Osweiler's
thesis, Geul et al. and Verhaeghe et al. could not be retrieved from this
machine (access controls); C1a follows the thesis abstract and E2's
pre-registered description, and C3a/C3b follow E2's description without the
papers' robust weighting, with ΔtPW(a) set here. Thompson's Lambert
construction (their eqs. 9–15) approximates the two-body state transition
matrix along the Lambert arc by finite differences; the module computes that
matrix exactly (complex step) and its test checks it against an independent
propagator.

## 6. Fusion (Q4)

At each issue time T (00:00 UTC every day of the window) and object, the
estimates are the object's three latest sets usable at T (created and with
epoch at or before T, E3's rule), each propagated to the target (the first
precise epoch at or after T + h, h = 0, 1, 3, 7 d; `common_epoch`). Each
estimate's covariance is the chosen product at its age. Same-provider sets
share tracking data, so their cross-correlation is real and unknown to a
fuser: the setting covariance intersection is for. No independent second
provider of element sets has history for these objects in these windows
(E3's GNSS products cover only August–September 2026).

| ID | Estimate and covariance |
| --- | --- |
| SEL | E3's rule: the candidate (latest, second, third) with the lowest train median 3D error for the regime and horizon (at least 30 train samples), with its own covariance |
| NAIVE | Information fusion as if independent: P = (Σ P_k⁻¹)⁻¹, x = P Σ P_k⁻¹ x_k |
| CI | Covariance intersection: P⁻¹ = Σ ω_k P_k⁻¹, x = P Σ ω_k P_k⁻¹ x_k, ω on the simplex minimizing det P (Julier and Uhlmann 1997; grid of 0.01 and the best point refined; Stone Soup's track-fusion example uses the same rule) |
| GLS | Descriptive: the best linear unbiased estimate with the joint covariance whose off-diagonal blocks come from the train correlation model, C_kl = D_k R(g_kl, a_l) D_l (§4); counted as failed where that joint covariance is not positive definite |

Statistics: 3D error (median, RMS) and its ratio to SEL with a pigeonhole
(object × issue day) bootstrap as E3; mean d²/3 and coverage as §7; the mean
error vector and its share of the mean square error (shared bias), for every
method.

## 7. Endpoints, choice and statistics

**Consistency (E2's H1 criteria).** d² = eᵀC⁻¹e of the 3D position error.
Consistent when mean d²/3 is in [0.8, 1.25], 95 % ellipsoid coverage
(d² ≤ 7.815) in [0.93, 0.97], and the Cramér–von Mises W² of F_χ²(3)(d²)
below 0.461 times the design effect of the object clusters. Intervals: 2000
cluster-bootstrap resamples by object, seed 20261009, percentile.

Also per product, regime and τ: the energy score (Gneiting and Raftery 2007;
200 Gaussian draws per sample, E2's estimator), the Gaussian log score, the
normalized σ per axis, the share not positive definite, and the probability
of collision effect: 500 pairs of scoring samples of different objects per
regime and τ (seeded), each object with its own product covariance, scored by
`screening_cases` (hard body 20 m, Pc alert at 1e-4, misses 0–5000 m, four
directions, head-on and 90° crossing): the Pc alert rate on collision cases
(miss ≤ 20 m) and on misses of 1 and 5 km, and the mean Pc at zero miss.

**Choice on validation.** Per regime, among T0, K1 and K1o: the lowest mean
1-day energy score; a product whose 95 % interval overlaps the best one's is
tied, and ties go to the simpler (T0, then K1, then K1o). Recorded in
`results/e2b/validation/selection.json` and `config.json` (`chosen`) before
the freeze.

**H3** compares on the samples both products cover; the ratio of mean energy
scores with its cluster-bootstrap interval. **H4** uses the consecutive
differences d of every regime object in the test window (no precise orbit
needed), gaps up to 3 days: correlated prediction S(g), the train second
moment of consecutive differences in the pair's gap bin, which on the train
pairs equals P_old + P_new − C − Cᵀ (the identity of section 1); independent
prediction T0(g) + T0(0).

## 8. Order of work

1. Modules: `common_epoch`, `map_covariance`, `screening_cases` (done,
   `da4a33f5`).
2. This draft committed.
3. Dev: A0 checks — `common_epoch` reproduces `accumulate`'s reference-mode
   errors at the same epochs; the identity Σ_d = P_i + P_j − C − Cᵀ holds on
   the samples to rounding; counts.
4. Train: measurement (§4), consecutive differences, C2a, fusion targets;
   every fitted number (`results/e2b/train`).
5. Validation: every product and baseline, the choice (§7), fusion.
6. Freeze: `fitted` and `chosen` pinned in `config.json`, `"frozen": true`,
   committed with this plan. Then the test window, once.

## 9. Threats to validity

- **E2's test window was read before this plan.** E2's GPS test results (F2,
  C2a–C5) are public and were read when this experiment was designed. The
  products and baselines here are new and none was scored on test-window
  data before the freeze; LEO and SLR have no prior test-window result.
- **Few objects outside GPS**: six (LEO-POD), six (SLR-LEO), five (SLR-MEO,
  mixing LAGEOS at 5,900 km and ETALON at 19,100 km). Their intervals are
  wide; their results are descriptive in practice.
- **Manoeuvres** are not removed (Swarm and Sentinel-1 orbit control, GPS
  repositioning). Every sample counts, as in E2; heavy tails move mean d²
  more than coverage.
- **Truth gaps**: SLR arcs leave gaps; test-window truth ends before the
  window for LEO and SLR.
- **Axes**: products are in the RTN axes of SGP4's state, errors in the
  precise state's; the angle between them is below 10⁻³ rad.
- **Ages from epoch**, as E2: GPS sets appear about 12 hours after their
  epoch (train median); fusion (§6) uses creation times.
- **One provider**: fusion here combines one provider's sets; a second,
  independent provider would change H6c.

## 10. Outputs

`runs/<run-id>/` (ignored): per-target and per-sample tables, manifests.
Committed under `results/e2b/`: per window `metrics.json`, `manifest.json`
and `README.md` (generated from the metrics), the train products and
`correlation-model.json`, and `validation/selection.json`.

## References

- Gneiting, T., Raftery, A. E. (2007). Strictly proper scoring rules,
  prediction, and estimation. JASA 102(477), 359–378.
- Geul, J., Mooij, E., Noomen, R. (2017). TLE uncertainty estimation using
  robust weighted differencing. Advances in Space Research 59(10),
  2522–2535. doi:10.1016/j.asr.2017.02.038.
- Julier, S. J., Uhlmann, J. K. (1997). A non-divergent estimation algorithm
  in the presence of unknown correlations. Proceedings of the American
  Control Conference, 2369–2373.
- Osweiler, V. P. (2006). Covariance estimation and autocorrelation of NORAD
  two-line element sets. MS thesis, AFIT/GSS/ENY/06-M09
  (https://scholar.afit.edu/etd/3531/).
- Owen, A. B. (2007). The pigeonhole bootstrap. Annals of Applied Statistics
  1(2), 386–411.
- Stone Soup (open-source tracking framework), track-to-track fusion example
  with covariance intersection.
- Thompson, B. F., Gossner, J. R., Sais, B. J., Cunningham, E. A. (2019).
  Fast covariance propagation for two-line element sets. AMOS Technical
  Conference (https://amostech.com/TechnicalPapers/2019/Astrodynamics/Thompson.pdf).
- Verhaeghe, De Clerk, Lauwens, Delabie, Vandepitte, Vandenbussche (2025).
  Predicting TLE covariance using transformer-based time series
  forecasting. SmallSat Conference, SSC25-IV-03.
- E2: [experiments/e2-catalog-covariance/PLAN.md](../e2-catalog-covariance/PLAN.md);
  E3: [experiments/e3-combined-catalog/PLAN.md](../e3-combined-catalog/PLAN.md).

## Changes to the draft before the freeze

Dated, with their reasons; none followed from an outcome.

- **2026-10-09, sampling intervals.** The first train run of step 10 took the
  sampling interval from product names, with 2 minutes for every SLR arc.
  The arcs are sampled at 2 min (LAGEOS, LARES-2), 3 min (Stella), 4 min
  (Ajisai) and 15 min (ETALON), so most ETALON targets and many SLR-LEO
  targets found no precise epoch within the interval used. Each span's
  interval now comes from its index entry, as section 4 states; the SLR
  regimes' train measurement was rerun. GPS and LEO-POD were unaffected.
- **2026-10-09, C1b where the Lambert arc is undefined.** Thompson et al.'s
  arc between two positions has no plane when the transfer angle is near 0°
  or 180°, which is common: element-set epochs tend to fall at one orbital
  phase, so whole revolutions return to the start (on two dev-window GPS
  satellites, 63 of 120 maps back were refused at a 1° limit). The paper does
  not treat the case. There C1b uses the two-body state transition matrix
  from SGP4's state at the earlier epoch (the limit the module already uses
  for arcs of seconds), and the share of such maps is reported per regime.
- **2026-10-09, the module's Kepler solution.** On real two-week Lambert arcs
  of many revolutions (LAGEOS, Swarm, Sentinel-1, SLR LEO) the module's
  Newton iteration for the universal anomaly could wander to another root, so
  C1b's map back failed on 4 % to 10 % of anchors in those regimes. The module
  now brackets the root (`d3cc1211`); the pinned artifact changed before any
  product was scored, and every run was repeated with it.
- **2026-10-09, C1b diagnostics.** Thompson et al.'s rule picks the branch
  whose energy is nearest SGP4's; over tens of revolutions both branches have
  nearly that energy, and the one chosen can be a nearly radial ellipse (a
  perigee radius of tens of kilometres on LAGEOS). C1b is scored as the paper
  defines it; also reported is the share of C1b samples whose arcs have a
  perigee below the Earth's radius, and C1b on the others.
- **2026-10-09, T0's bins.** Age bins with fewer than 30 samples are left out
  of T0's interpolation (`products.t0.minimumBinSamples`).
- **2026-10-09, H4's correlated prediction.** As first written, the
  correlated prediction was assembled from parts, T0(g) + T0(0) − Ĉ − Ĉᵀ with
  Ĉ = D(g) R(g, 0) D(0). Where the correlations approach 1 that is a small
  difference of large matrices, estimated separately, and it was not positive
  definite for essentially every validation pair in LEO-POD, SLR-LEO and
  SLR-MEO (the code then also skipped the independent prediction: a bug). It
  is now the same quantity measured directly on the train pairs, S(g) (equal
  to P_old + P_new − C − Cᵀ there by the identity), for gaps up to 3 days; the
  independent prediction is unchanged and scored on the same pairs. The
  validation H4 values of the first version had been seen (GPS: mean d²/3
  22.4 correlated, 3.0 independent; the other regimes undefined); H4 is
  decided on the test window only. The GLS fusion keeps its assembled joint
  covariance and reports its failures (section 6).
- **2026-10-09, a precise-orbit screen.** One ILRS ETALON-2 record
  (2026-04-10 00:00 UTC) lies 1,329 km inside its neighbours' radius, so the
  SGP4 error against it was 8,133 km and the 7-day SLR-MEO statistics were
  meaningless; the same day's ETALON-1 file has such records too. A target
  whose precise epoch departs in radius from the mean of its neighbours' by
  more than 10 km (`measurement.truthScreenKm`; smooth orbits stay within
  about 2 km at these samplings) is now counted as missing, not re-snapped.
  Over train and validation it flags 12 epochs, all ETALON on 2026-04-10, and
  none in GPS, LEO-POD or SLR-LEO. Steps 10 and 40 were rerun.

