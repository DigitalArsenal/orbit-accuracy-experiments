# E2 — Covariance from catalog history

Status: **draft, not frozen.** Nothing here has read a test window. The
numbers become binding in `config.json` at the freeze commit.

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
| H2 | Products fitted to E1-corrected element sets (C3) have smaller position RMS than products fitted to the published ones (C2) at 0 and 1 day, for GPS. | Key secondary |
| H3 | Without process noise, propagated covariances are too small for LEO beyond 1 day; tuned white-acceleration noise (C4) restores H1 there. | Secondary |
| H4 | The empirical catalog-history covariance (C1) is too large at epoch when its pseudo-truth error is not removed, and consistent once it is. | Secondary, diagnostic |

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
| A0 | 2026-08-02 | 2026-08-15 | Harness check on the truth already held; nothing fitted |

## 4. Methods

All orbit computation runs in modules: SGP4 (`analysis/gp-error-model`
`accumulate` and the SGP4 module), `propagator/hpop` through PRW (SDS
1.240.0: `DYNAMIC_PARAMETERS`, `PROCESS_NOISE`, `EARTH_ORIENTATION`,
`SPACE_WEATHER`/`JB2008_INDICES`), and the estimator in `analysis/estimation`.
This repository fits noise models and computes statistics.

| ID | Method |
| --- | --- |
| C0 | SGP4 as published, scored for accuracy only (no covariance), and with the existing GP error model's covariance (`analysis/gp-error-model`) as the baseline for realism. |
| C1 | **Catalog-history empirical covariance** (Osweiler 2006; Flohrer, Krag & Klinkrad 2008): each element set propagated to the epochs of the object's later element sets within 7 days; RTN differences against those sets give the error covariance as a function of age, per object and regime. The later sets' own at-epoch error is a pseudo-truth error: estimated on train against precise orbits at age 0 and subtracted (H4). |
| C2 | **Pseudo-observation fit** (Levit & Marshall 2011): HPOP's state at a reference epoch, with B (LEO) and AGOM, fitted by weighted batch least squares to SGP4 positions from the object's element sets over a fit span (3, 5 or 7 days, chosen on validation); weights from C1 at the pseudo-observations' ages. Covariance: the formal (JᵀWJ)⁻¹ over state and parameters, from HPOP's STM with parameter columns, scaled by the fit's reduced χ². Propagated with HPOP (covariance with parameters). |
| C3 | **C2 on E1-corrected element sets** (the improved element sets at epoch, M3* of E1) with E1's M4 variance as weights. GPS first; LEO when E1's corrections exist there. |
| C4 | **Process noise**: C2/C3 with white-acceleration noise in RTN (PRW `PROCESS_NOISE`), spectral densities per regime fitted on train so that the mean squared Mahalanobis distance is 3 at 1 and 3 days. |

Force models: GPS — EGM2008 12×12, Sun, Moon, solid tides, cannonball
radiation pressure (AGOM fitted); LEO — EGM2008 36×36, Sun, Moon, solid
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
mean(d²)/3 within [0.8, 1.25], 95 % ellipsoid coverage within [0.93, 0.97],
and the Cramér–von Mises statistic against χ²(3) below its 5 % critical value
after accounting for within-object correlation (block bootstrap by object).
Supported if all hold for every regime at 0, 1 and 3 days; 7 days reported.

**H2.** Ratio of 3D position RMS, C3/C2, at 0 and 1 day for GPS, with a
block-bootstrap 95 % interval; supported if the upper bound is below 0.9.

**Method choice on validation.** The energy score (Gneiting & Raftery 2007)
of the position forecast at 1 day, pooled over regimes, picks among C2, C3,
C4 and their fit spans; ties within the bootstrap interval go to the
simpler method.

Also reported: the covariance scale factor that would make each method
consistent (the classical "covariance realism" scaling), and the effect of
the remaining mis-scaling on the probability of collision for the screening
geometries of the conjunction whitepaper.

## 6. Threats to validity

- C1's pseudo-truth is itself the catalog; if its at-epoch error is
  misestimated, C1 and the weights of C2 inherit it (H4 measures it).
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
5. A0 on 2026-08-02..15: C1 and C2 end to end, nothing fitted, harness
   checks against direct HPOP runs.
6. Freeze.

## Open before the freeze

- Fit-span grid and the maneuver-detection threshold.
- Whether BDOT is fitted or held at zero for spans under 3 days.
- LEO E1 corrections (C3 for LEO) — depends on E1's LEO extension.

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
- Osweiler, V. P. (2006). Covariance estimation and autocorrelation of NORAD
  two-line element sets. MS thesis, AFIT.
- Poore, A. B., et al. (2016). Covariance and uncertainty realism in space
  surveillance and tracking. Report of the Working Group on Covariance
  Realism.
- Vallado, D. A., Seago, J. H. (2009). Covariance realism. AAS 09-334.
