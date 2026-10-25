# V1c5 rescore and a screening criterion for SGP4/GP uncertainty

Registration A, 2026-10-25 (task console-covariance-v1c5-rescore-and-screening-criterion-20261025), frozen by the first commit of this
file and `config.json`. Registration of the fits (stage B) is the pushed `results/v1c5-rescore/fits.json`; the test (stage C) is read after it.

Owner position (2026-10-25): "We are trying to compete on accuracy with owner operator ephemerides and observations, while having them in
the same scenario with SGP4 and assigning a realistic and appropriate uncertainty to SGP4 to allow for accurate screening." The output of
this experiment is the input of `experiments-sdn-ap-mixed-scenario-screening` parts 3 and 4.

## 1. Why

V1c5 (`results/v1c5`) froze `P-axes-mle/risk/UNFLAGGED` on the training weeks and scored it on the fresh test (issue days 2026-10-09 to
10-20): 0 of 24 cells REALISTIC, 12 of 24 statistically compatible. Two things limited that reading.

1. **Missing truth.** LEO 400-800 km had 8 to 11 samples from one object per cell and SLR MEO 2 to 10: COSMIC-2 in the archive ended on
   2026-10-07. UCAR publishes the COSMIC-2 near-real-time orbits to doy 297 without login, so LEO 400-800 km can be tested.
2. **The rule is not the screening question.** Mean d²/3 in [0.8, 1.25] with 95 % coverage in [0.93, 0.97] is a Gaussian-core rule: the
   coverage band (half width 0.02) is narrower than the sampling error of a cell of 70 samples (about 0.026), and nothing in it says how
   often an object is outside the ellipsoid that a probability-of-collision screen trusts at 99 % or 99.9 %. V1c5 also showed a heavy tail
   (GPS errors that grow after an unobserved burn).

Screening trusts the covariance as a tail probability. This experiment registers that criterion and re-scores the frozen model on it, without
changing the model.

## 2. What is frozen and what is scored

The model is V1c5's selected candidate, byte for byte (`frozenModel` in `config.json`: selection.json, the `.erm`, their SHA-256). No refit,
no re-selection, no change of tiers or event rule. Windows, runtime pins, event rule, rule bands and bootstrap (2,000 object-cluster resamples,
seed 20261017) are V1c5's (`base` in `config.json`), and V1c5's code is imported unchanged for arcs, flags, scores and the Gaussian rule.
All covariance arithmetic, calibration and d² stay in `analysis/gp-error-model` WASM. JavaScript counts, ranks, evaluates distribution
functions of d² (a one-dimensional statistic, not orbit physics) and computes bootstrap intervals.

## 3. Truth (acquired before this registration; no score existed)

Test issue days 2026-10-09 to 10-20 as V1c5; targets to 2026-10-23, of which only those before the end of the observed Earth orientation
(2026-10-20) can be converted: later targets stay missing horizons and are counted.

- **COSMIC-2** near-real-time orbits (`leoOrb_nrt_2026_<doy>.tar.gz`, UCAR/CDAAC, anonymous, DOI 10.5065/T353-C093, doy 280 to 297, SHA-256 in
  `config.json`) converted by the modules reference-states script into reference states (doy 280 to 292 have Earth orientation). New
  conversions are added to the archive's `leoOrb_` products; the archive's product wins on a name clash.
- **ILRS combined** orbits: the latest arc is 261010 (as in V1c5); nothing newer is published. SLR MEO is unchanged.
- **Swarm**: not published for any day from 2026-10-03 (the server lacks the reduced-dynamic and kinematic pair). Unchanged.
- **Sentinel-1** POE: arcs end 2026-10-06, before the window. Unchanged. GPS (ESA final) and SLR daily arcs are V1c5's refreshed truth.
- Nothing is excluded on truth. The download cache (`local-archive/`), logs and merged symlink roots are kept in the durable run directory
  `/opt/data/sdn-archive/v1c5-rescore/`; every OEM file whose states are used is hashed in the manifest.

Two defects of the fetch script on modules main (reported, not worked around in the product): its dependency `eop-parser/tests/harness.mjs`
imports `space-data-module-sdk/runtime-contracts`, absent from the 0.8.25 that `package.json` pins (the run used 0.9.16 in `node_modules`), and the
script ends with `ReferenceError: reference is not defined` after all outputs are written.

## 4. The screening criterion

For a sample with calibrated position covariance Σ and error e (RTN, truth minus prediction), d² = eᵀΣ⁻¹e (WASM `pair_statistics`, 3 degrees
of freedom). A predictor (section 5) gives a predictive CDF F of d². A sample is **covered at level p** when F(d²) ≤ p.

- **Levels:** p = 0.50, 0.90, 0.95, 0.99 (criterion) and 0.999 (deep tail, reported where evaluable).
- **Evaluable at p:** at least 30 samples from at least 3 objects, and n·min(p, 1 − p) ≥ 5 (five expected samples on the thinner side). So p = 0.90
  needs 50 samples, 0.95 needs 100, 0.99 needs 500, 0.999 needs 5,000.
- **Level status:** the covered share with its 95 % object-cluster bootstrap interval (V1c2/E14 code): OVERCONFIDENT if the interval is below p,
  PESSIMISTIC if above p, CALIBRATED otherwise.
- **Verdict** of a population: INSUFFICIENT if its highest evaluable level is below 0.90; else OVERCONFIDENT if any evaluable level at or above
  0.90 is OVERCONFIDENT; else PESSIMISTIC if any evaluable level is PESSIMISTIC; else CALIBRATED. Every verdict is reported with its **reach**
  (highest evaluable level): a CALIBRATED verdict with reach 0.90 says nothing about the 99 % tail.
- **Pc-like tail:** the tail ratio (1 − covered share)/α at α = 0.10, 0.05, 0.01, 0.001, with the same interval. A probability of
  collision of an object at Mahalanobis radius r computed from a Gaussian covariance is biased by that ratio at α = 1 − F(r²) (a ratio above 1 means
  the screen under-warns). One object is scored here; the conjunction's combined covariance and the other object's are the mixed-scenario experiment's.
- **Scopes:** each class × horizon cell (24), each class over all horizons (4), all classes (1). Cells of about 50 samples reach only 0.90; the
  class scopes carry the tail levels.
- **Views:** unflagged samples (primary: the frozen model's claim); all samples and flagged samples pooled are reported for G only (the
  frozen model's FLAGGED tier), and for T and Q on all samples without a claim.
- **Gaussian rule:** V1c5's rule (REALISTIC, compatible) is computed by V1c5's code for every cell, so the per-cell results of both are in one table.

No correction for multiple comparisons: counts of cells and levels are reported as they stand, and about one level in twenty will miss by chance.

## 5. Predictors

All three keep the frozen covariance Σ; they differ in the law assigned to d².

- **G (Gaussian):** F is the χ² law with 3 degrees of freedom. This is the frozen model as V1c5 scored it.
- **T (Student-t scale mixture):** e | s ~ N(0, s·c·Σ) with s inverse-gamma(ν/2, ν/2) mixing; d²/c = 3·F(3, ν), CDF I_z(3/2, ν/2), z = d²/(d² + cν).
  ν per class from the grid in `config.json` (the Gaussian is the limit, ν = 1000 is near it), c per class × horizon, both by maximum likelihood of d²
  on the **training out-of-fold population** (V1c5's fold scores of the selected candidate, folds F3 to F8, unflagged arcs, POPULATION status), the
  models of which were each fitted on earlier folds only. A cell with fewer than 100 samples or 3 objects uses the class-pooled c at the class's ν;
  a class with fewer than 200 samples or 3 objects is not fitted (T = G).
- **Q (empirical level multipliers):** per class, k_p = empirical p-quantile of the training out-of-fold d² / χ²₃ quantile at p. A sample is covered at p when
  d² ≤ k_p·χ²₃ quantile. Q is the non-parametric reference: if T and Q disagree on the test, the tail shape is not stable or not Student-t.

Only the training population is used to fit; the test window never enters a fit. **Level multipliers:** for a screening engine that takes a Gaussian
covariance, the covariance scale that makes the p-level ellipsoid cover p of the samples is k_p(class, horizon) = Q_T(p)/χ²₃ quantile(p) for T
and k_p(class) for Q; both are published with the fits and their test coverage.

**Log score:** the mean log density of d² under G and T (higher is better), and its difference T − G with the cluster bootstrap, per class and for all classes.

## 6. Recommendation (the only decision rule)

For each class, on the unflagged samples over all horizons: T is recommended when the 95 % interval of the log-score difference T − G is above 0
and T has no more OVERCONFIDENT levels than G. Otherwise G. Q is never recommended; it is evidence. The recommendation, T parameters, level
multipliers and the per-cell results of both criteria are published as `results/v1c5-rescore/table.json` for the mixed-scenario experiment.

## 7. Controls

- The frozen model equals V1c5's selection and `.erm`.
- GPS, SLR LEO 800-1500 km and SLR MEO cells of the rescore equal V1c5's `metrics.json` (all three views): no truth was added for them; a difference is an error of the
  rescore. Only LEO 400-800 km may change.
- The arcs of the rescore are collected again from the same element sets with V1c5's code; the 24-cell Gaussian table is reported in full.

## 8. Stages and what each reads

A. **This registration.** Nothing is fitted, scored or counted for the rescore.
B. **Fit** (`run.mjs --stage fit`): T and Q from the training out-of-fold population. Reads no test element set, flag, arc or truth. Writes `results/v1c5-rescore/fits.json`,
   committed and pushed before C.
C. **Test** (`run.mjs --stage test`): flags and arcs for issue days 2026-10-09 to 10-20 on the extended truth, one scoring of the frozen model, then G, T, Q.
   Verifies that the fits are pushed and unchanged.

Durable run directory `/opt/data/sdn-archive/v1c5-rescore/` (runtime copy pinned by V1c5's hashes, truth, arcs, flags, scores, manifest); `run.mjs --check`
re-derives from it, and the repository carries a committed-artifact check for machines without it. At most 6 single-thread workers, disk floor 30 GiB.
No unit suites, Docker, production SSH or deployment.

## 9. Looks before this registration

- V1c5's README, metrics and table were read, including the Gaussian-rule result of its test window (GPS overconfident, SLR LEO coverage failures, LEO 400-800 km and SLR MEO insufficient)
  and its d² concentration (a few GPS objects carry the sum; Etalon-2 errors of 7,552 to 13,580 km from 2026-10-05). **The test window is therefore not unseen for the form of the variants.** T and Q
  are fitted on training folds only and their grids are fixed here; the form (Student-t, the coordinator's suggestion, and the empirical multipliers) was chosen before any out-of-fold fit was run. A window
  after 2026-10-20 is the unseen confirmation: it needs observed Earth orientation and truth that do not yet exist.
- The LEO 400-800 km cells are a first look: V1c5 had one object with at most 11 samples there.
- The sample counts of the out-of-fold population per class and horizon (123 to 1,112) were counted to set the minimum-sample rules of section 5. No fitted parameter, quantile or coverage was looked at.

## 10. Not claimed

One object's covariance is tested against truth; a conjunction's Pc also needs the other object's covariance and the encounter geometry (mixed-scenario part 4). A verdict holds for the mix of
objects of its scope in twelve days. Truth missing in the window (SLR MEO, Swarm, Sentinel-1) stays INSUFFICIENT; nothing is imputed.
