# E2 — Covariance from catalog history

Status: **draft, not frozen.** Nothing here has read a test window. The
numbers become binding in `config.json` at the freeze commit; the code
refuses the test window until `config.json` says `"frozen": true` and both
files are committed unchanged.

## 1. Question

Can the public catalog history — the sequence of element sets an object has
had — be turned into VCM-equivalent products: a state at epoch, the dynamical
parameters a VCM carries (B, BDOT, AGOM), and a covariance over all of them
that stays realistic as it is propagated, for GPS and for low Earth orbit?
And does starting from the at-epoch corrections of [E1](../e1-gps-epoch/PLAN.md)
("improved element sets at epoch") make those products better?

Realistic means that the position error against precise orbits, scaled by
the stated covariance, is distributed as the covariance says, at every
horizon a conjunction screen uses. The parity target is in
[docs/vcm-parity.md](../../docs/vcm-parity.md).

## 2. Hypotheses

| ID | Statement | Role |
| --- | --- | --- |
| H1 | For the method chosen on validation, the squared Mahalanobis distance of the 3D position error is consistent with χ²(3) at 0, 1, 3 and 7 days, in each regime (§5). | Primary |
| H2 | Products fitted to E1-corrected element sets (F3) have smaller position RMS than products fitted to the published ones (F2) at 0 and 1 day, for GPS. | Key secondary |
| H3 | Without process noise, propagated covariances are too small for LEO beyond 1 day; tuned white-acceleration noise (F4) restores H1 there. | Secondary |
| H4 | The empirical catalog-history covariance (consecutive-set differences) is too large at epoch when its pseudo-truth error is not removed, and consistent once it is. | Secondary, diagnostic |

## 3. Data

| Input | Source | Role |
| --- | --- | --- |
| Element sets | Space-Track `gp_history` (local archive, `/opt/data/sdn-archive/spacetrack/gp_history/by-creation`); SGP4 theory only | Pseudo-observations and baseline |
| GPS truth | IGS final orbits `IGS0OPSFIN`, 15 min | Scoring |
| LEO truth | Copernicus Sentinel-1C/1D precise orbits (`AUX_POEORB`), ESA Swarm A/B/C (`SP3*COM`) | Scoring, ~450–700 km |
| SLR truth | ILRS combined orbits (LAGEOS-1/2, ETALON-1/2); NSGF orbits (Starlette, Stella, LARES, LARETS, WESTPAC) | Scoring, compact cannonball targets |
| Earth orientation | IERS finals2000A / EOP 20 C04 as `$EOP` | PRW `EARTH_ORIENTATION` |
| Space weather | CelesTrak `SW-All` as `$SPW`; SET SOLFSMY/DTCFILE as `PRWJB2008Indices` | Drag drivers |

Truth on hand covers 2026-08-02..15 for every source above. The windows
below need the same products for the train and validation periods; acquiring
them is part of the order of work. Element sets never leave the machine.

### Windows (draft)

| Window | From | To | Use |
| --- | --- | --- | --- |
| Train | 2025-10-01 | 2026-03-31 | Noise models, process noise, fit spans |
| Validation | 2026-04-01 | 2026-06-30 | Method choice |
| Test (locked) | 2026-07-01 | 2026-09-15 | Read once after the freeze |
| Dev | 2024-10-01 | 2024-11-15 | Harness development and checks (GPS); outside every E2 window, so nothing here reads the test window before the freeze (replaces A0, which lay inside it) |

## 4. Methods

All orbit computation runs in modules: SGP4 (`analysis/gp-error-model`
`accumulate` and the SGP4 module), `propagator/hpop` through PRW (SDS
1.240.0: `DYNAMIC_PARAMETERS`, `PROCESS_NOISE`, `EARTH_ORIENTATION`,
`SPACE_WEATHER`/`JB2008_INDICES`), and the estimator in `analysis/estimation`.
This repository fits noise models and computes statistics.

| ID | Method |
| --- | --- |
| B0 | SGP4 as published, scored for accuracy only (no covariance), and with the existing GP error model's covariance (`analysis/gp-error-model` `docs/model-2026-08-scaled.json`) as the baseline for realism. |
| H4 inputs | The consecutive-difference second moment by regime and age (0–0.5, 0.5–1, 1–2, 2–3, 3–5, 5–7 days; `analysis/gp-error-model` `accumulate` without reference states), and the pseudo-truth error: the second moment about zero of SGP4 at each set's epoch against every precise-orbit epoch within 15 minutes after it, on train. |

**Catalog-history (TLE) covariance variants** (owner request 2026-10-09;
sources in the references). Each gives a 3×3 RTN position covariance for
an element set propagated by SGP4 to τ = 0, 1, 3 and 7 days, estimated on
train and scored on validation and test against precise orbits (every
element set of the window as published; its SGP4 error at the first
precise-orbit epoch within 4 minutes after epoch + τ, from `accumulate`
with reference states, one sample per bin). Metrics: mean d² (target 3)
with an object-cluster bootstrap interval, 95 % coverage (d² ≤ 7.815), the
Kolmogorov–Smirnov distance to χ²(3), the standard deviation of each
axis's normalized error, and the mean Gaussian log score (m). All through
`analysis/gp-error-model` (`accumulate` without reference states: older
sets propagated to newer sets' epochs, RTN differences in the newer set's
axes).

| ID | Method | Status |
| --- | --- | --- |
| C0 | Flohrer, Krag & Klinkrad (2008) class look-up σ (UVW by eccentricity, inclination, perigee height), constant in τ | Not run: the published table values are not on hand. |
| C1a | Osweiler (2006): per object, the TLEs of the last 14 days propagated to the newest epoch, 6×6 RTN covariance about the mean residual, propagated with a linearized SGP4 STM | Not run: no module gives an SGP4 state transition matrix, or maps an RTN covariance through one. |
| C1b | Thompson et al. (2019): C1a's residuals mapped with a two-body Lambert STM | Not run: no module maps an RTN covariance through a Lambert or two-body STM and back. |
| C2a | Δt-binned covariance (±0.5 d; τ = 0: 0–0.5 d), about the mean, by regime (Osweiler's bins) | Run. |
| C2a-quad | Per-axis σ²(τ) = a + bτ + cτ² fitted to 0.5-d bins to 7.5 d, diagonal (Huo, Li & Han 2016) | Run. |
| C2b | C2a minus half the covariance of pairs under 0.5 d (the reference set's own error) | Run. |
| C2c | C2a after mean-motion jump editing (consecutive differences beyond 5 robust σ split an object's history) and a 3-robust-σ clip (gp-error-model `clip`) | Run. |
| C3a, C3b | Geul, Mooij & Noomen (2017) / Verhaeghe et al. (2025): TLEs in a centred window ΔtPW(a) propagated to its midpoint, pairwise differences in the mean state's RTN, factor 1/(2M) (C3a) or 1/(4M) (C3b) | Not run: no module propagates a set of element sets to a common epoch and returns their RTN differences. |
| C4 | C2a pooled by Flohrer's orbit classes | Run; for GPS (one class) identical to C2a. gp-error-model classes go by altitude and eccentricity, not inclination. |
| C5 | C2a times k(τ)², k fitted on train so that mean d² = 3 | Run; scored held out on validation and test. |

**Fit products** (the VCM-equivalent products; named F to keep the
variant IDs apart):

| ID | Method |
| --- | --- |
| F2 | **Pseudo-observation fit** (after Levit & Marshall 2011): `propagator/hpop`'s state at the product epoch with AGOM (GPS; B for LEO), fitted by weighted batch least squares (`analysis/estimation` `fit_batch`, HPOP answering its queries with the STM and parameter columns) to the full GCRF state of each of the object's element sets at its own epoch (`analysis/epoch-state`) over a fit span of 3, 5 or 7 days (chosen on validation). Each pseudo-observation is weighted by the regime's at-epoch error second moment from train, a 6×6 covariance in the RTN axes of the observed state. A priori: the state at 100 km and 10 m/s (no information), AGOM 0.02 ± 0.01 m²/kg. Covariance: the formal (JᵀWJ + P₀⁻¹)⁻¹ over state and parameters, scaled by the fit's reduced χ² when it exceeds 1 (the convention of SP's VCM sigmas, docs/vcm-parity.md), propagated by HPOP with the parameters. On the dev window the reduced χ² was about 0.1: consecutive element sets agree with each other far better than with the truth, so scaling down would manufacture confidence. |
| F3 | **F2 on E1-corrected element sets** (the improved element sets at epoch, M3* of E1) with E1's M4 variance as weights. GPS first; LEO when E1's corrections exist there. |
| F4 | **Process noise**: F2/F3 with white-acceleration noise in RTN (PRW `PROCESS_NOISE`, 600 s steps). HPOP gives, at each scoring epoch, A (the product's covariance, no noise) and U (zero initial covariance, unit density on each RTN axis), so P(q) = A + qU. One density q ≥ 0 per regime and fit span (equal on R, T and N), fitted on train to minimize Σ over 1 and 3 days of (mean d²/3 − 1)². |

Products. For each object, a product time every 7 days from the window's
start; the product epoch is the epoch of the object's last element set at
or before it (none if that is more than a day old), and its fit uses the
sets in [epoch − span, epoch] (at least 3). Scoring epochs: the first
precise-orbit epoch at or after the product epoch plus 0, 1, 3 and 7 days
(within 15 minutes). A product whose reduced χ² exceeds the train
products' 0.99 quantile is edited as a maneuver (GPS NANUs are not on hand).
A product that fails or does not converge is counted and reported, never
scored.

Force models: GPS — EGM2008 12×12, Sun and Moon (JPL DE440s), IERS 2010
solid tides, cannonball radiation pressure (AGOM fitted), IERS finals2000A
Earth orientation, RK78 at 1e-12 with steps of at most 300 s; LEO — EGM2008 36×36, Sun, Moon, solid
tides, NRLMSISE-00 and JB2008 on daily drivers (both reported), cannonball
radiation pressure, B fitted (BDOT when the fit span exceeds 3 days).
Maneuvering objects are excluded where a maneuver is known (GPS NANUs,
Sentinel/Swarm orbit-control flags) or detected (a fit residual jump above
the threshold set on train).

## 5. Endpoints and decision rules (draft)

Regimes: GPS; LEO 400–550 km (Swarm, Starlette/Stella region); LEO 650–800
km (Sentinel-1, LARETS); SLR MEO (LAGEOS, ETALON). Horizons 0, 1, 3, 7 days
from the product epoch.

**H1.** For each regime and horizon, with d² the squared Mahalanobis distance
of the 3D position error under the stated 3×3 position covariance:
mean(d²)/3 within [0.8, 1.25], 95 % ellipsoid coverage (d² ≤ 7.815) within
[0.93, 0.97], and the Cramér–von Mises W² of F_χ²(3)(d²) against the uniform
below its 5 % critical value (0.461) times the design effect of the object
clusters (the cluster-bootstrap variance of the mean PIT over its iid value
1/(12n), at least 1). Intervals: 2000 cluster-bootstrap resamples by object.
Supported if all hold for every regime tested at 0, 1 and 3 days; 7 days
reported.

**H2.** Ratio of 3D position RMS, F3/F2, at 0 and 1 day for GPS, with a
block-bootstrap 95 % interval; supported if the upper bound is below 0.9.

**Method choice on validation.** The energy score (Gneiting & Raftery 2007)
of the position forecast at 1 day (200 Gaussian draws per sample), pooled
over regimes, picks among F2, F3, F4 and their fit spans; a method whose
95 % cluster-bootstrap interval overlaps the best one's is tied, and ties go
to the simpler method (F2 before F3 before F4, then the shorter span).

**H4.** At 0–0.5 days, against precise orbits: the consecutive-difference second moment (raw) is
too large if mean d²/3 < 0.8, and the same with the train at-epoch second
moment subtracted is consistent if mean d²/3 is within [0.8, 1.25]. If the
subtraction leaves a position block that is not positive definite, the
corrected covariance does not exist and H4 is not supported.

Also reported: the covariance scale factor that would make each method
consistent (the classical "covariance realism" scaling), and the effect of
the remaining mis-scaling on the probability of collision for the screening
geometries of the conjunction whitepaper.

## 6. Threats to validity

- C1's pseudo-truth is itself the catalog; if its at-epoch error is
  misestimated, the C variants and the weights of F2 inherit it (H4 measures it).
- Element sets are not independent observations: consecutive sets share
  tracking data. Fit spans and weights are chosen on validation, and the
  formal covariance is scaled, not trusted.
- Drag dominates LEO error; space-weather nowcasts at the product epoch are
  known later than the element sets (the test uses only drivers published by
  the product epoch, forecasts thereafter).
- Truth products have their own errors (cm for IGS, POEORB, Swarm, SLR),
  negligible against the metres scored.
- Few SLR objects: their results are descriptive.

## 7. Order of work

1. Release SDS 1.240.0 and pin HPOP to it (schema and HPOP are ready on
   their branches).
2. VCM adapter / equinoctial covariance in a module (vcm-parity gap 1–2), so
   products can be written as `$VCM`/`$OCM`.
3. Confirm `analysis/estimation` can run the batch fit with HPOP's STM and
   parameter columns; otherwise extend it there.
4. Acquire train and validation truth for every source above.
5. Dev window (2024-10-01..11-15): H4 inputs, the C variants and F2 end to end; harness checks.
6. Train: H4 inputs, the C variants, the products for every span, the maneuver threshold and F4's
   densities. Validation: the products for every span and the method
   choice. These numbers go into `config.json` (`fitted`, `chosen`).
7. Freeze: `"frozen": true`, committed with this plan. Then the test
   window, once.

Settled before the freeze: the fit spans (3, 5, 7 days, chosen on
validation); the maneuver edit (the train reduced-χ² quantile); BDOT held at
zero (LEO is not tested, Amendment 1).

## References

- Flohrer, T., Krag, H., Klinkrad, H. (2008). Assessment and categorization
  of TLE orbit errors for the US SSN catalogue. AMOS Technical Conference.
- Gneiting, T., Raftery, A. E. (2007). Strictly proper scoring rules,
  prediction, and estimation. JASA 102(477), 359–378.
- Levit, C., Marshall, W. (2011). Improved orbit predictions using
  two-line elements. Advances in Space Research 47(7), 1107–1115.
- Ly, D., Lucken, R., Giolito, D. (2020). Correcting TLEs at epoch:
  application to the GPS constellation. Journal of Space Safety Engineering
  7(3).
- Geul, J., Mooij, E., Noomen, R. (2017). TLE uncertainty estimation using
  robust weighted differencing. Advances in Space Research 59(10),
  2522–2535. doi:10.1016/j.asr.2017.02.038.
- Huo, Y., Li, Z., Han, C. (2016). Covariance propagation of two-line
  element data. 28th Chinese Control and Decision Conference (CCDC),
  3836–3841. doi:10.1109/CCDC.2016.7531654
  (https://ieeexplore.ieee.org/document/7531654; paywalled, method from the
  abstract).
- Osweiler, V. P. (2006). Covariance estimation and autocorrelation of NORAD
  two-line element sets. MS thesis, AFIT/GSS/ENY/06-M09
  (https://scholar.afit.edu/etd/3531/).
- Poore, A. B., et al. (2016). Covariance and uncertainty realism in space
  surveillance and tracking. Report of the Working Group on Covariance
  Realism.
- Thompson, Gossner, Sais, Cunningham (2019). Fast covariance propagation
  for two-line element sets. AMOS Technical Conference
  (https://amostech.com/TechnicalPapers/2019/Astrodynamics/Thompson.pdf),
  doi:10.64861/twqd5985.
- Vallado, D. A., Seago, J. H. (2009). Covariance realism. AAS 09-334.
- Verhaeghe, De Clerk, Lauwens, Delabie, Vandepitte, Vandenbussche (2025).
  Predicting TLE covariance using transformer-based time series
  forecasting. SmallSat Conference, SSC25-IV-03
  (https://digitalcommons.usu.edu/cgi/viewcontent.cgi?article=6135&context=smallsat).

## Amendment 1 (2026-10-09, before the freeze)

Data on hand when the train and validation windows were run:

- **LEO and SLR truth.** Precise orbits for Sentinel-1, Swarm and the SLR
  satellites exist only for 2026-08-02..15 (inside the test window); none
  for train or validation. The LEO and SLR regimes are therefore not
  tested: no LEO density can be fitted on train and no LEO method chosen on
  validation. H1 is evaluated for GPS only, and H3 (a LEO hypothesis) is
  not tested.
- **E1 corrections.** E1 has not produced corrected element sets (M3*, M4),
  so F3 cannot be run and H2 is not tested.
- **GPS truth** is ESA's final orbits `ESA0OPSFIN` (5 min) for every window,
  GPS satellites only (SP3 identifiers G01–G32). Where an ESA day is not on
  hand (2026-08-02..15, held as IGS products for V1 and E1), the IGS final
  orbit `IGS0OPSFIN` (15 min) of that day is used instead, never both.
- **A0** lay inside the test window; it is replaced by the dev window
  above, and nothing of E2 read 2026-08-02..15 before the freeze.
