# V1c2 — Console covariance realism

Frozen registration, 2026-10-22. Commit this plan and config before reading the
test window. V1 and V1c are immutable. This companion tests uncertainty, not a
new trajectory model or calibration fit.

## Inputs and paired population

Import V1c's frozen config, V1 horizons (1, 6, 12, 24, 48, 72 hours), E3 config,
Products truth reader, observed-final EOP filter, archive readers, and module
transport unchanged. Use the exact V1c E3 object/issue pairs, selected OMMs,
truth products and first-at-or-after epochs (900 s tolerance), 2026-09-07 through
2026-09-26. Verify against the recorded V1c run and its input hashes. No
maneuver screening or post hoc object exclusion. Missing truth/OMM stays missing.

The only extra input is the object's causal OMM history needed by the console:
31 days before the set in force through one second after it, restricted to
records created by the sim start. Read sufficient preceding creation days;
the module applies its own 30-day, 200-set, duplicate and pair-age rules.
The anchor is the same OMM V1c selected, even if later sets become available.
No truth is supplied to covariance derivation. Embedded E14 S3-KC is the
population prior; no retraining, scaling or tuning on this window.

## Methods

SGP4: invoke gp-error-model object_covariance at each target's age measured
from the anchor OMM epoch, retaining EMPIRICAL/POPULATION/refusal labels. Score
against the same SGP4 trajectory and precise position as V1c.

FFM: obtain P0 from the same object_covariance request at sim start. Seed the
FFM resident module with V1c's SGP4 ECEF state transformed by the catalog
module into GCRF. Use the landed FFM-1 catalog configuration, including the
module's B* to Cd*A/m conversion and Cr*A/m = 0.02. Ingest P0 and request the
resident covariance Phi(t,ts) P0 Phi(t,ts)^T. No process noise. Query forward at
V1c's 300-second cadence. Score this covariance against the **recorded V1c
coverage-path position**, with the resident trajectory beside it as a control.
All propagation, transforms, covariance transport and position Mahalanobis
computations run in WASM modules. JavaScript orchestrates and counts.

## Endpoints and decisions, fixed before the run

For each of four E3 classes and six horizons, report both modes: usable n,
distinct objects, mean d²/3 with the paper's object-cluster bootstrap 95%
interval (2,000 resamples, seed 20261017), 95% ellipsoid coverage, status counts,
and verdict. Import E14's realism statistics unchanged. Position-only d² uses
the predicted covariance; no truth covariance is added and no bias is removed.
REALISTIC requires n >= 30, objects >= 3, mean d²/3 in [0.8,1.25] and coverage
in [0.93,0.97], inclusive. The chi-square threshold is 7.814727903251179.
Report realistic/all 24 cells and realistic/testable cells per mode. Missing
or non-positive-definite covariance is counted and reported, never imputed.

Integrity controls: exact input SHA-256 matches for inherited inputs; SGP4
position-error agreement with V1c within 0.1 m; FFM resident/recorded coverage
position agreement within 0.1 m. A larger difference is a reported failed
control requiring a measured cause, not silent substitution. Covariance matrices
must be finite, symmetric to 1e-10 relative and dimension 6; zero-time resident
P must agree with P0 to 1e-8 relative. No hypothesis requires a favorable result.

## Execution and provenance

Build every invoked module in a private worktree at modules origin/main. One
sequential worker; record source commits, package/runtime versions, WASM and
input hashes, machine load and wall time. Disk guard >=20 GiB. The inherited
environment uses GFZ CC BY 4.0 drivers and NOAA public-domain forecast fills,
never CelesTrak/CSSI. No speed rerun is needed: V1c's speed results stay frozen.
Commit aggregates, manifest and report only; OMMs, precise states and per-sample
records stay in ignored runs/. Preserve local replay materials outside removed
worktrees. No Docker, unit tests, production deployment or paper edits.

## Verification

`node experiments/v1c2-console-covariance-realism/run.mjs --check` re-derives
both tables and shares from the recorded local run, checks the registration,
input/module hashes, paired completeness, labels and integrity controls. Run
the graph gauntlet on the exact candidate before landing by merge.

## Amendment A1 — 2026-10-22, before any covariance scores

Source inspection at modules 6b1132cb shows that resident covariance propagation
starts from the original seed on every request (ResidentDynamics::covariance,
resident_dynamics.cpp). Request covariance only at the six scored horizons;
intermediate requests cannot affect it. Replay the catalog coverage trajectory
at the registered 300-second cadence. This avoids repeated, discarded STM work
and preserves the same P0, force model, target covariances and scored samples.

## Amendment A2 — 2026-10-22, after the first diagnostic horizon

The first Starlette 1-hour diagnostic differed from recorded Fast coverage by
0.124510245 m when the resident seed carried P0, missing the registered 0.1 m
control. No complete arc or result table had been produced. Source inspection
shows covariance requests run a seed-to-target variational RK integration;
state-only resident requests use the Fast coverage implementation. Add a paired
resident with identical state, configuration, environment and coefficients but
without P0, at the original 300 s cadence. Its position must agree with recorded
coverage within the unchanged 0.1 m threshold. Report the covariance-resident
nominal discrepancy separately, including the count exceeding 0.1 m. Attribute
that discrepancy to the covariance-enabled branch only when the paired
state-only control passes. The covariance scores still use recorded V1c Fast
positions; no trajectory, covariance, threshold or sample is replaced.

## Amendment A3 — 2026-10-22, after the paired state-only diagnostic

The state-only resident also failed the 0.1 m check, so A2's conditional branch
attribution is **not established**. The catalog converts its UTC Julian-date
seed to an ISO string internally; the harness resident instead received the
unrounded wall-clock ISO timestamp. Normalize the resident seed's timestamp
from the same catalog Julian date through foundation/time (no JavaScript time
scale conversion), and repeat both controls. Retain a second state-only
resident with the original ISO timestamp to measure the timestamp effect in
the same run. Keep the 0.1 m criterion and all V1c scored positions unchanged.
P0 still comes from the SGP4-mode age at the requested sim start. Report both
timestamp controls and the covariance-branch nominal discrepancy; do not
attribute a residual to the covariance branch unless the timestamp-normalized
state-only resident passes. No complete diagnostic arc had yet been recorded.
