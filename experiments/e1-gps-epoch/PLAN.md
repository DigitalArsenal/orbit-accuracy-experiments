# E1 — Correcting GPS element sets at epoch

Pre-registration. Status: **draft, not frozen**. The plan is frozen by
the commit that sets `"frozen": true` in [`config.json`](config.json); that
commit's SHA is recorded in every later run manifest. Nothing in the test
window is read before that commit, except the baseline check A0 below, which
fits nothing.

Owner: Edgesource. Graph task: `orbit-accuracy-e1-gps-epoch-20261008`
(parent `space-safety-onboarding-program-20261008`).

## 1. Question

Can a public SGP4 element set's state at its epoch be made more accurate,
with an uncertainty that is honest, using only information available when
the element set is published?

E1 answers it for GPS, where every satellite has an independent precise
orbit (IGS final orbits), two published methods exist to replicate, and our
covariance calibration already fails (GP error model, 2026-08: persistent
per-satellite along-track offsets of −1.6 to +3.8 km). E2 repeats the
protocol in LEO 600–800 km once E1 is reported.

## 2. Hypotheses

| ID | Hypothesis | Kind |
| --- | --- | --- |
| H1 | A learned along-track correction reduces 3D position RMS error at epoch by at least 50 % on future data for the same satellites. | Primary, confirmatory |
| H2 | The correction still reduces it by at least 30 % for satellites in an orbital plane the model never saw. | Key secondary, confirmatory |
| H3 | The corrected product's stated covariance passes the existing calibration gate on held-out data. | Key secondary, confirmatory |
| H4 | A numerical arc fit to corrected element sets predicts better than SGP4 at 1, 3 and 7 days. | Exploratory |

Prior evidence: Ly, Lucken & Giolito (2020) report 65 % on GPS (2.2 km to
680 m 3D RMS at epoch, trained on 2018, tested on 2019). Hallgarten La Casta &
Amato (2025) report about 75 % with per-satellite models and about 30–40 %
with one model across GNSS satellites. H1's 50 % sits between them; H2's 30 %
is the generalised figure.

## 3. Data

All inputs are read from local copies with their hashes recorded; nothing is
fetched during a run.

| Input | Source | Role |
| --- | --- | --- |
| Element sets | Space-Track `gp_history`, one file per creation day: `/opt/data/sdn-archive/spacetrack/gp_history/by-creation` | What is corrected. `MEAN_ELEMENT_THEORY` SGP4 and `EPHEMERIS_TYPE` 0 only. Duplicates (same object, epochs within 1 s) keep the later record, as `gp-error-model` does. |
| Truth | IGS final orbits `IGS0OPSFIN`, 15 min, through `analysis/reference-states` (IGS20 → GCRF by IAU 2006/2000A with IERS EOP 20 C04; identities from the IGS satellite metadata SINEX) | Independent reference. Stated accuracy about 2.5 cm per axis. |
| Ephemerides for covariates | Deterministic Sun and Moon geometry at each element set's epoch | Covariates only; known in advance, so no leakage. |

The object set is every GPS satellite that appears in the IGS products for a
window. Element sets never leave the machine (Space-Track terms); only
aggregates, per-cluster sufficient statistics and hashes are committed.

### Windows (by element-set epoch, UTC)

| Window | From | To | Use |
| --- | --- | --- | --- |
| Train | 2024-10-01 | 2025-09-30 | Fit corrections and variance models. A full year, so every lunar and seasonal phase is seen. |
| Validation | 2025-10-01 | 2026-03-31 | Choose among candidate models and hyperparameters, by the rule in §5. |
| Test (locked) | 2026-04-01 | 2026-09-15 | Read once, after the freeze commit, by the evaluation step. |
| A0 | 2026-08-02 | 2026-08-15 | Harness check against the 2026-08 calibration inputs. Baseline only, nothing fitted. |

Truth must cover each element set's epoch plus 7 days. The test end allows for
the IGS final-orbit latency of about two weeks.

### Generalisation tiers

| Tier | Trained on | Scored on |
| --- | --- | --- |
| G1, future time | All satellites, train window | All satellites, test window |
| G2, unseen plane | Five of six orbital planes | The sixth, test window; six folds, pooled |
| G3, unseen generation | GPS IIR, IIR-M and IIF | GPS III and IIIF (international designator year 2018 or later), test window |

Planes are assigned by clustering each satellite's right ascension of the
ascending node, from its element set nearest 2024-10-01, into six groups at
the largest gaps. The assignment is written to the inventory and frozen.

## 4. Methods

Every orbit computation runs in an SDN module through the
`space-data-module-sdk` harness. The experiment code does bookkeeping and
statistics only.

| ID | Method | Where |
| --- | --- | --- |
| M0 | SGP4 as published (Vallado 2020, WGS-72, opsmode i) | `analysis/gp-error-model` `accumulate` |
| M3a | Ly et al. (2020) replication: along-track angle = satellite mean + Moon-distance seasonal term with a Sun-distance phase shift. Their mean-error feature F is not specified in the paper; our reconstruction is documented in the step's code. | Experiment fit; applied as an element-set edit |
| M3b | Hallgarten La Casta & Amato (2025) replication: one sinusoid in the Moon's mean anomaly, amplitude a sine of the right ascension of the ascending node, one parameter set for all satellites | Same |
| M3c | Hierarchical harmonic regression (ours): along-track time offset = Sun/Moon harmonic covariates × β + a per-satellite random effect u ~ N(0, τ²), fitted by restricted maximum likelihood. An unseen satellite gets u = 0 and τ² in its predictive variance. | Same |
| M4 | Variance model for the corrected product: per-axis RTN variance, log-linear in the covariates, fitted by minimum CRPS (Gneiting et al. 2005). A split-conformal 95 % region (Mahalanobis radius from validation scores) alongside. | Experiment fit |
| M2 | Arc fit: EKF on a sequence of corrected element-set states as pseudo-observations, HPOP with Sun and Moon, cannonball radiation pressure and the 20×20 field; RTS smoothing reported separately as retrospective only | `analysis/estimation` + `propagator/hpop` (exploratory) |

**How a correction is applied.** A correction is an along-track time offset
Δt. It is applied as an edit to the element set, mean anomaly + n·Δt, and
the edited set goes through the same unchanged modules as M0. The correction
therefore never touches positions directly, and the corrected product is
itself an SGP4 element set.

**Scoring.** `accumulate` is called once per element set with reference
states and narrow age bins [a, a + 15 min] for a in {0, 0.5, 1, 2, 3, 5, 7}
days, with `referenceStepSeconds` 0. Each bin holds at most one reference
epoch, so the module's per-bin sums are the per-sample RTN errors
(prediction − truth; R radial, N orbit normal, T = N × R). "At epoch" means
the first IGS epoch after the element-set epoch, at most 15 min later.

## 5. Endpoints, statistics and decision rules

**Primary (H1).** R = 1 − RMS₃ᴅ(M3*) / RMS₃ᴅ(M0) at age 0, tier G1, test
window, where M3* is the method chosen on validation (below). Supported if
R ≥ 0.50 and the 95 % lower confidence bound is ≥ 0.40.

**H2.** The same R in tier G2. Supported if R ≥ 0.30 and the lower bound is
above 0.

**H3.** On the test window, the corrected product's covariance (M4) passes
the gate used by `gp-error-model`: 1σ and 2σ containment within 5 points of
nominal, at most 1 % outside 3σ, at least 30 samples from at least 3
objects, at ages 0–0.5, 0.5–1, 1–2 and 2–3 days. Also reported: the
conformal region's empirical coverage, which should fall in [0.935, 0.965].

**No-harm check.** The number of satellites whose test RMS gets worse by more
than 10 % under M3*. Reported for every tier; more than one is flagged in the
report's first paragraph.

**Model choice.** M3* is the M3 variant with the lowest validation RMS at age
0 in tier G1. Hyperparameters (ridge penalty, harmonic order up to 3) are
chosen the same way. All three variants are reported on test, so the choice
cannot hide a loser.

**Confidence intervals.** Errors are correlated within a satellite and across
satellites on the same day (shared Sun and Moon geometry). Every interval is
a two-way cluster bootstrap over satellites and UTC days (pigeonhole
bootstrap, Owen 2007), 10,000 resamples, percentile intervals, fixed seed
recorded in the manifest. Statistics are paired: every method is scored on
the same element sets against the same truth.

**Multiplicity.** H1, H2 and H3 are one family, tested by Holm's procedure at
α = 0.05. Everything else is descriptive and labelled so.

**Outliers.** The primary analysis keeps every sample. A sensitivity analysis
applies `gp-error-model`'s 5 robust-sigma clip, and another drops element
sets with more than 10 km 3D error at epoch (Ly et al.'s rule). Both are
reported beside the primary result, never instead of it.

**Secondary, descriptive.** RTN components and velocity at every age, per
satellite and per tier; the age measured from creation as well as from
epoch (an element set is often published hours after its epoch); CRPS and
energy score; probability-integral-transform histograms.

## 6. Acceptance of the harness (A0)

Before any model is fitted:

1. **Public vectors.** `analysis/epoch-state`, loaded through this harness,
   reproduces Vallado's SGP4 verification set within the module's own
   tolerances (5e-8 km, 5e-9 km/s).
2. **Per-sample equals aggregate.** For the A0 window, the per-sample errors
   summed over GPS equal the `accumulate` sums for the whole batch run in one
   call, to 1e-9 relative. The harness adds nothing to the numbers.
3. **Reproduction.** The harness rebuilds `analysis/gp-error-model`'s
   published `docs/truth-2026-08.json` from the same archive and reference
   states: every stratum's count, mean and covariance, raw and clipped, to
   1e-9 relative. Equal outputs mean the harness feeds the module the same
   inputs the published run did. A failure stops E1 until it is explained.
4. **Determinism.** Two runs on the same inputs produce byte-identical
   per-sample tables.

## 7. Threats to validity

- **Identity.** PRN, SVN and NORAD mappings change over a satellite's life.
  The mapping comes from the IGS metadata SINEX current at each product's
  midpoint; changes in the window are listed in the inventory.
- **Manoeuvres.** GPS station-keeping and repositioning appear as large
  errors. They stay in the primary analysis (§5).
- **Leakage.** Corrections use only covariates known at the element set's
  epoch and, for satellite effects, training-window truth. The test window is
  read once.
- **Reference error.** IGS finals are about 2.5 cm per axis, four orders
  below the effect.
- **Frames and time.** TEME → GCRF (IAU 2006/2000A plus the equation of the
  equinoxes) inside the modules; GPS time → UTC in `reference-states`. The
  module tests cover both.
- **Reconstruction of M3a.** Ly et al. do not give the functional form of F.
  A failure of M3a is a failure of our reconstruction, and is reported as
  such.
- **Scope.** GPS satellites are well-tracked, non-drag, mostly
  non-manoeuvring. Nothing here transfers to LEO or debris; E2 tests LEO, and
  no experiment here addresses debris.

## 8. Outputs and provenance

Each run writes `runs/<run-id>/` (ignored by git): per-sample tables,
`manifest.json` and `metrics.json`. A run's summary is committed under
`results/e1/<run-id>/`: the manifest, the metrics and `REPORT.md`, which is
generated from the metrics and never typed by hand.

The manifest records: the command and arguments; the config hash; this
repository's commit and whether it was dirty; the modules repository's commit;
each module's name, version and WASM SHA-256; the SDK and SDS versions; Node's
version and the host; the SHA-256 of every input file read; start and end
times; and the bootstrap seed. A whitepaper cites a result by run ID and
commit.

## 9. Order of work

1. A0 on the 2026-08 inputs already on disk.
2. Fetch IGS finals 2024-09-24 to 2026-09-22 with
   `analysis/reference-states/scripts/fetch-reference-products.mjs --products gps`
   into `/opt/data/sdn-archive/reference-states`, and convert them.
3. Fit M3a–c and M4 on train; choose on validation.
4. Freeze: set `"frozen": true`, commit, push.
5. Evaluate on test, once. Generate the report.
6. M2, exploratory. Then E2 in LEO.

## Amendments

Dated changes to this plan, with their reasons. Amendments after the freeze
are reported with the results.

- **2026-10-08, before the freeze and before any model was fitted.** A0.3
  first required each satellite's median along-track error at age 0 over the
  A0 window to fall within the 2026-08 validation's GPS range (−1.6 to +3.8
  km). The first A0 run (`e1-gps-epoch-10-baseline-20261008T153449Z`) failed
  it: six of 32 satellites were outside, down to −3.2 km. That range is not
  defined at age 0 alone, so the check did not compare like with like.
  Replaced by the rebuild of the published `truth-2026-08.json` above.

## References

- Ly, D., Lucken, R. and Giolito, D. Correcting TLEs at epoch: Application to
  the GPS constellation. *Journal of Space Safety Engineering* 7(3), 2020.
- Hallgarten La Casta, M. I. and Amato, D. Generalisable bias correction of
  two-line element sets in the medium Earth orbit regime. 9th European
  Conference on Space Debris, 2025.
- Levit, C. and Marshall, W. Improved orbit predictions using two-line
  elements. *Advances in Space Research* 47(7), 2011.
- Gneiting, T., Raftery, A. E., Westveld, A. H. and Goldman, T. Calibrated
  probabilistic forecasting using ensemble model output statistics and minimum
  CRPS estimation. *Monthly Weather Review* 133, 2005.
- Owen, A. B. The pigeonhole bootstrap. *Annals of Applied Statistics* 1(2),
  2007.
- Holm, S. A simple sequentially rejective multiple test procedure.
  *Scandinavian Journal of Statistics* 6, 1979.
- Vallado, D. A., Crawford, P., Hujsak, R. and Kelso, T. S. Revisiting
  Spacetrack Report #3. AIAA 2006-6753.
