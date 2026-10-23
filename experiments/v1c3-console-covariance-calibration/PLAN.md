# V1c3 — pre-registered console covariance calibration

Frozen registration, 2026-10-23. No V1c3 calibration or test run preceded this
plan. V1, V1c and V1c2 are immutable. Previously published V1c2 aggregate
failures motivated the hypotheses; its test is therefore a frozen confirmation
set, not a newly blinded dataset. Failures remain results.

## Data and split

Training uses E3's issue days 2026-08-03 through 2026-08-24 inclusive,
00:00:00 GPS (previous UTC day 23:59:42), all available objects in the same
four E3 groups. Targets are 1, 6, 12, 24, 48 and 72 hours after issue,
using E3's first reference at/after target within 900 seconds. The latest
causally available public OMM, its 31-day history and 45-day creation archive
lookback follow V1c2. No clipping/exclusion on truth. Missing inputs are counted.
All training target epochs precede 2026-08-28 UTC. Test issue days are exactly
V1c2's 2026-09-07 through 2026-09-26, 960 frozen pairs. Thus both issue and
truth times are disjoint, even though objects may overlap. No September
samples enter a fit or selection. Truth products, source priorities, OMM
eligibility and duplicates are E3/V1c2's unchanged rules and local archive.
The existing E14 population model has its own older fit and broader published
validation window; this is not independent validation of that prior.

## Fixed candidates and numerical execution

SGP4 bases: N = unmodified object_covariance output; F = N plus the E14
S3-KC population covariance evaluated at age zero in the predicted state's
RTN axes (floor added only when N is EMPIRICAL; POPULATION fallback is not
doubled); P = E14 S3-KC population evaluated at actual element age.
Cross each base with {none, scalar-mle, coverage, axes-mle}: twelve candidates,
ordered N-none, N-scalar-mle, N-coverage, N-axes-mle, F-none, F-scalar-mle,
F-coverage, F-axes-mle, P-none, P-scalar-mle, P-coverage, P-axes-mle.
Fits are per E3 group × nominal horizon, minimum 30 finite samples from three
objects; coverage target .95. Insufficient strata retain factor one with an
explicit INSUFFICIENT label. No centered errors or bias corrections.

Select one complete SGP4 candidate using training only. FFM seeds use that
candidate's covariance at issue, applying its 1-hour group factors at issue
(left endpoint hold, fixed in advance). Transport each additive seed term
through the FFM-1 resident STM; summation and calibration remain in WASM.
No Q is added. FFM candidates, in order: none, scalar-mle, coverage,
axes-mle, fitted per group × horizon on training, again minimum 30/3.
SGP4's selection is fixed before FFM training, and both selections, all fitted
models and their hashes must be committed and pushed before test evaluation.
Every SGP4 and FFM candidate is evaluated on test, without changing selections.

All dynamics, frames, covariance construction/addition/rotation/scaling,
STM transport, inversion and d² run in existing gp-error-model / FFM WASM
methods. JavaScript only orchestrates and computes statistical summaries.
Population and factors travel as typed $ERM MODEL records. Addition uses
pair_statistics covarianceTerms; independent STM transport is linear and
sums the transported terms in the same module. Fit errors and covariances use
predicted RTN axes; reported scores use V1c2's truth RTN axes.
Test FFM positions are imported verbatim from V1c's frozen recorded coverage
positions; test truth, pair/horizon eligibility, V1c2 baseline metrics,
bootstrap and verdict code are imported unchanged. Training positions use
that same FFM-1 catalog coverage call sequence. No frozen source is edited.

## Selection and endpoints

Select globally within each mode by: (1) most REALISTIC training cells,
(2) fewest INSUFFICIENT training cells, (3) smallest sum of squared normalized
violations of the two point-estimate bounds across the 24 cells, then (4)
registered order. For mean m, violation is max(0,.8-m,m-1.25)/.45; for coverage
c it is max(0,.93-c,c-.97)/.04. Nonfinite/insufficient cells contribute 1e12.
No threshold, candidate, factor or selection may change after test access.

The primary endpoint is realistic cells /24 for the selected candidate in
each mode. The paper's exact rule is mean d²/3 in [.8,1.25], 95% coverage
in [.93,.97], at least 30 samples and three objects. Reuse V1c2 summarize and
E14 cell/bootstrap/verdict code unchanged (2,000 object-cluster resamples,
seed 20261017, 95% intervals). Report every candidate, every cell, missing
and non-positive-definite counts, means and medians. No assertion that all
24 will pass: an unsuccessful confirmation is a reported scientific result.

GPS diagnostics: rank objects and local sample keys by contribution to d²;
report top contributions, mean versus median, module log determinants and
marginal variances for tail samples, covariance status, and temporal error
jumps. These diagnose ill-conditioning and possible maneuvers; they never
exclude samples or prove maneuver causation without independent evidence.
Commit aggregates only, never OMM, raw truth or individual scores.

## Tolerances, controls and verification

Require the imported baseline's metrics to reproduce byte-equivalent parsed
JSON and its existing exact checks. Replayed baseline d² relative tolerance
1e-8 (absolute 1e-10); SGP4/coverage position agreement 0.1 m; covariance
symmetry relative 1e-10 and zero-time transport relative 1e-8, as V1c2.
The existing V1c2 covariance-resident nominal discrepancy is preserved and
reported; it does not replace frozen coverage positions. Verify the identity
calibration and sum-of-transport implementation through actual recorded
WASM outputs. All input/source/artifact/selection hashes enter the manifest.

One E2E: `node experiments/v1c3-console-covariance-calibration/run.mjs --check`.
It re-derives all tables and selections from the local recorded run, checks
frozen baseline equality, disjoint times, model provenance and every test
candidate. Missing local data is an explicit failure/skip, never a pass.
No unit suites, Docker, production SSH/deploy, or speed rerun. Docker parity
is waived by the owner's 2026-10-22 ruling. Check applicable native WasmEdge
0.16.4 AOT compatibility with prewarm-aot and headless browser execution;
record any inherited runtime limitation honestly. At most four single-thread
workers, dispatch only below 1-minute load 20 (hard ceiling 21), pause new
work at the ceiling; disk floor 20 GiB. Keep raw replay under ignored runs/.
