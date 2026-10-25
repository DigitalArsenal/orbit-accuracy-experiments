# V1c5 — realistic SGP4/GP uncertainty for mixed-catalog screening

Selected on training weeks only: **P-axes-mle/risk/UNFLAGGED: 0/24 cells realistic on the fresh test** (claimed population: unflagged samples). Training issues 2026-08-03 to 2026-10-03 in eight weekly folds (every target precedes 2026-10-07); selection by purged rolling-origin cross-validation (folds F3, F4, F5, F6, F7, F8) on the worst-fold realistic count. Test: issue days 2026-10-09 to 2026-10-20, never read before the selection was pushed. Rule: mean d²/3 in [0.8, 1.25], 95 % coverage in [0.93, 0.97], at least 30 samples from 3 objects.

[Frozen plan A](../../experiments/v1c5/PLAN.md) · [Plan B](../../experiments/v1c5/PLAN-B.md) · [Metrics](metrics.json) · [Reader table](table.json) · [Manifest](manifest.json) · [Selection](selection.json)

## Candidates

| Candidate | Cross-validation realistic /24 by fold | Mean | Min | Test claimed /24 | Test all | Test unflagged | Test flagged (pooled /6) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| N-none/single/ALL | F3 1, F4 1, F5 0, F6 0, F7 1, F8 1 | 0.67 | 0 | 0/24 | 0 | 0 | 0 |
| F-none/single/ALL | F3 4, F4 2, F5 0, F6 1, F7 2, F8 1 | 1.67 | 0 | 0/24 | 0 | 0 | 0 |
| P-none/single/ALL | F3 3, F4 0, F5 0, F6 0, F7 0, F8 0 | 0.50 | 0 | 2/24 | 2 | 2 | 0 |
| N-scalar-mle/single/ALL | F3 5, F4 3, F5 3, F6 5, F7 2, F8 9 | 4.50 | 2 | 0/24 | 0 | 0 | 0 |
| N-coverage/single/ALL | F3 4, F4 5, F5 2, F6 3, F7 2, F8 3 | 3.17 | 2 | 0/24 | 0 | 0 | 0 |
| N-axes-mle/single/ALL | F3 2, F4 5, F5 1, F6 3, F7 3, F8 10 | 4.00 | 1 | 0/24 | 0 | 0 | 0 |
| F-scalar-mle/single/ALL | F3 6, F4 5, F5 1, F6 4, F7 4, F8 8 | 4.67 | 1 | 0/24 | 0 | 0 | 0 |
| F-coverage/single/ALL | F3 3, F4 3, F5 3, F6 4, F7 3, F8 3 | 3.17 | 3 | 1/24 | 1 | 1 | 0 |
| F-axes-mle/single/ALL | F3 3, F4 4, F5 4, F6 2, F7 3, F8 10 | 4.33 | 2 | 2/24 | 2 | 1 | 0 |
| P-scalar-mle/single/ALL | F3 4, F4 4, F5 2, F6 3, F7 4, F8 4 | 3.50 | 2 | 1/24 | 1 | 1 | 0 |
| P-coverage/single/ALL | F3 2, F4 6, F5 2, F6 1, F7 1, F8 4 | 2.67 | 1 | 1/24 | 1 | 1 | 0 |
| P-axes-mle/single/ALL | F3 2, F4 3, F5 4, F6 2, F7 3, F8 5 | 3.17 | 2 | 0/24 | 0 | 0 | 0 |
| N-scalar-mle/single/UNFLAGGED | F3 4, F4 3, F5 3, F6 5, F7 2, F8 5 | 3.67 | 2 | 0/24 | 0 | 0 | 0 |
| N-coverage/single/UNFLAGGED | F3 5, F4 3, F5 2, F6 3, F7 2, F8 3 | 3.00 | 2 | 0/24 | 0 | 0 | 0 |
| N-axes-mle/single/UNFLAGGED | F3 3, F4 5, F5 1, F6 3, F7 3, F8 5 | 3.33 | 1 | 2/24 | 4 | 2 | 0 |
| F-scalar-mle/single/UNFLAGGED | F3 7, F4 5, F5 1, F6 5, F7 4, F8 3 | 4.17 | 1 | 0/24 | 0 | 0 | 0 |
| F-coverage/single/UNFLAGGED | F3 3, F4 3, F5 3, F6 4, F7 3, F8 1 | 2.83 | 1 | 1/24 | 1 | 1 | 0 |
| F-axes-mle/single/UNFLAGGED | F3 4, F4 4, F5 4, F6 2, F7 3, F8 11 | 4.67 | 2 | 2/24 | 2 | 2 | 0 |
| P-scalar-mle/single/UNFLAGGED | F3 4, F4 4, F5 2, F6 3, F7 4, F8 4 | 3.50 | 2 | 1/24 | 1 | 1 | 0 |
| P-coverage/single/UNFLAGGED | F3 2, F4 6, F5 2, F6 1, F7 1, F8 3 | 2.50 | 1 | 1/24 | 1 | 1 | 0 |
| P-axes-mle/single/UNFLAGGED | F3 3, F4 3, F5 4, F6 2, F7 3, F8 4 | 3.17 | 2 | 1/24 | 0 | 1 | 0 |
| N-scalar-mle/flag/ALL | F3 4, F4 3, F5 3, F6 5, F7 2, F8 5 | 3.67 | 2 | 0/24 | 0 | 0 | 0 |
| N-coverage/flag/ALL | F3 5, F4 3, F5 2, F6 3, F7 2, F8 4 | 3.17 | 2 | 0/24 | 0 | 0 | 0 |
| N-axes-mle/flag/ALL | F3 3, F4 5, F5 1, F6 3, F7 3, F8 5 | 3.33 | 1 | 1/24 | 1 | 2 | 0 |
| F-scalar-mle/flag/ALL | F3 7, F4 5, F5 1, F6 5, F7 4, F8 3 | 4.17 | 1 | 0/24 | 0 | 0 | 0 |
| F-coverage/flag/ALL | F3 3, F4 4, F5 3, F6 4, F7 3, F8 1 | 3.00 | 1 | 1/24 | 1 | 1 | 0 |
| F-axes-mle/flag/ALL | F3 2, F4 4, F5 4, F6 2, F7 3, F8 11 | 4.33 | 2 | 2/24 | 2 | 2 | 0 |
| P-scalar-mle/flag/ALL | F3 4, F4 4, F5 2, F6 3, F7 5, F8 4 | 3.67 | 2 | 1/24 | 1 | 1 | 0 |
| P-coverage/flag/ALL | F3 2, F4 6, F5 2, F6 1, F7 1, F8 3 | 2.50 | 1 | 1/24 | 1 | 1 | 0 |
| P-axes-mle/flag/ALL | F3 5, F4 3, F5 4, F6 2, F7 3, F8 4 | 3.50 | 2 | 0/24 | 0 | 1 | 0 |
| N-scalar-mle/flag/UNFLAGGED | F3 4, F4 3, F5 3, F6 5, F7 2, F8 5 | 3.67 | 2 | 0/24 | 0 | 0 | 0 |
| N-coverage/flag/UNFLAGGED | F3 5, F4 3, F5 2, F6 3, F7 2, F8 3 | 3.00 | 2 | 0/24 | 0 | 0 | 0 |
| N-axes-mle/flag/UNFLAGGED | F3 3, F4 5, F5 1, F6 3, F7 3, F8 5 | 3.33 | 1 | 2/24 | 1 | 2 | 0 |
| F-scalar-mle/flag/UNFLAGGED | F3 7, F4 5, F5 1, F6 5, F7 4, F8 3 | 4.17 | 1 | 0/24 | 0 | 0 | 0 |
| F-coverage/flag/UNFLAGGED | F3 3, F4 3, F5 3, F6 4, F7 3, F8 1 | 2.83 | 1 | 1/24 | 1 | 1 | 0 |
| F-axes-mle/flag/UNFLAGGED | F3 4, F4 4, F5 4, F6 2, F7 3, F8 11 | 4.67 | 2 | 2/24 | 2 | 2 | 0 |
| P-scalar-mle/flag/UNFLAGGED | F3 4, F4 4, F5 2, F6 3, F7 4, F8 4 | 3.50 | 2 | 1/24 | 1 | 1 | 0 |
| P-coverage/flag/UNFLAGGED | F3 2, F4 6, F5 2, F6 1, F7 1, F8 3 | 2.50 | 1 | 1/24 | 1 | 1 | 0 |
| P-axes-mle/flag/UNFLAGGED | F3 3, F4 3, F5 4, F6 2, F7 3, F8 4 | 3.17 | 2 | 1/24 | 0 | 1 | 0 |
| N-scalar-mle/risk/ALL | F3 4, F4 3, F5 3, F6 5, F7 2, F8 5 | 3.67 | 2 | 0/24 | 0 | 0 | 0 |
| N-coverage/risk/ALL | F3 5, F4 3, F5 2, F6 3, F7 1, F8 3 | 2.83 | 1 | 0/24 | 0 | 0 | 0 |
| N-axes-mle/risk/ALL | F3 3, F4 5, F5 1, F6 4, F7 3, F8 6 | 3.67 | 1 | 0/24 | 0 | 0 | 0 |
| F-scalar-mle/risk/ALL | F3 7, F4 5, F5 2, F6 4, F7 4, F8 4 | 4.33 | 2 | 0/24 | 0 | 0 | 0 |
| F-coverage/risk/ALL | F3 3, F4 3, F5 3, F6 4, F7 3, F8 1 | 2.83 | 1 | 1/24 | 1 | 1 | 0 |
| F-axes-mle/risk/ALL | F3 3, F4 4, F5 3, F6 2, F7 3, F8 11 | 4.33 | 2 | 1/24 | 1 | 1 | 0 |
| P-scalar-mle/risk/ALL | F3 4, F4 4, F5 2, F6 3, F7 5, F8 4 | 3.67 | 2 | 1/24 | 1 | 1 | 0 |
| P-coverage/risk/ALL | F3 2, F4 6, F5 2, F6 0, F7 3, F8 3 | 2.67 | 0 | 1/24 | 1 | 1 | 0 |
| P-axes-mle/risk/ALL | F3 2, F4 2, F5 6, F6 5, F7 3, F8 4 | 3.67 | 2 | 0/24 | 0 | 0 | 0 |
| N-scalar-mle/risk/UNFLAGGED | F3 4, F4 3, F5 3, F6 5, F7 2, F8 5 | 3.67 | 2 | 0/24 | 0 | 0 | 0 |
| N-coverage/risk/UNFLAGGED | F3 5, F4 3, F5 2, F6 3, F7 1, F8 3 | 2.83 | 1 | 0/24 | 0 | 0 | 0 |
| N-axes-mle/risk/UNFLAGGED | F3 4, F4 8, F5 1, F6 4, F7 3, F8 6 | 4.33 | 1 | 0/24 | 0 | 0 | 0 |
| F-scalar-mle/risk/UNFLAGGED | F3 7, F4 5, F5 2, F6 4, F7 4, F8 3 | 4.17 | 2 | 0/24 | 0 | 0 | 0 |
| F-coverage/risk/UNFLAGGED | F3 3, F4 3, F5 3, F6 4, F7 4, F8 1 | 3.00 | 1 | 1/24 | 1 | 1 | 0 |
| F-axes-mle/risk/UNFLAGGED | F3 4, F4 7, F5 3, F6 2, F7 3, F8 11 | 5.00 | 2 | 1/24 | 1 | 1 | 0 |
| P-scalar-mle/risk/UNFLAGGED | F3 4, F4 4, F5 2, F6 3, F7 4, F8 4 | 3.50 | 2 | 1/24 | 1 | 1 | 0 |
| P-coverage/risk/UNFLAGGED | F3 2, F4 6, F5 2, F6 0, F7 3, F8 3 | 2.67 | 0 | 1/24 | 1 | 1 | 0 |
| P-axes-mle/risk/UNFLAGGED (selected) | F3 3, F4 3, F5 6, F6 5, F7 3, F8 4 | 4.00 | 3 | 0/24 | 0 | 0 | 0 |

## Selected: P-axes-mle/risk/UNFLAGGED (unflagged samples)

| Class | h | n / objects | Mean d²/3 [95% CI] | Median d²/3 | 95% coverage [CI] | Non-PD / unavailable | Verdict | Compatible |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | :---: |
| GPS | 1 | 307 / 30 | 3.0295 [0.28802, 8.5448] | 0.14559 | 0.96417 [0.90624, 1.0000] | 0 / 0 | NOT REALISTIC (overconfident) | yes |
| GPS | 6 | 307 / 30 | 1.1330 [0.21704, 2.7693] | 0.094645 | 0.97068 [0.92783, 1.0000] | 0 / 0 | NOT REALISTIC (coverage) | yes |
| GPS | 12 | 307 / 30 | 3.2169 [0.31764, 9.2572] | 0.15934 | 0.97068 [0.92783, 1.0000] | 0 / 0 | NOT REALISTIC (overconfident) | yes |
| GPS | 24 | 308 / 30 | 3.4576 [0.29541, 10.055] | 0.15083 | 0.96753 [0.92176, 1.0000] | 0 / 0 | NOT REALISTIC (overconfident) | yes |
| GPS | 48 | 278 / 30 | 3.9401 [0.22874, 11.926] | 0.16608 | 0.97482 [0.93207, 1.0000] | 0 / 0 | NOT REALISTIC (overconfident) | yes |
| GPS | 72 | 249 / 30 | 4.7012 [0.23885, 14.455] | 0.19840 | 0.97590 [0.93670, 1.0000] | 0 / 0 | NOT REALISTIC (overconfident) | yes |
| LEO 400-800 km | 1 | 11 / 1 | 1.0059 [1.0059, 1.0059] | 0.93493 | 1.0000 [1.0000, 1.0000] | 0 / 0 | INSUFFICIENT | — |
| LEO 400-800 km | 6 | 11 / 1 | 0.71558 [0.71558, 0.71558] | 0.49378 | 1.0000 [1.0000, 1.0000] | 0 / 0 | INSUFFICIENT | — |
| LEO 400-800 km | 12 | 11 / 1 | 0.75071 [0.75071, 0.75071] | 0.68804 | 1.0000 [1.0000, 1.0000] | 0 / 0 | INSUFFICIENT | — |
| LEO 400-800 km | 24 | 10 / 1 | 0.71594 [0.71594, 0.71594] | 0.73145 | 1.0000 [1.0000, 1.0000] | 0 / 0 | INSUFFICIENT | — |
| LEO 400-800 km | 48 | 9 / 1 | 0.50651 [0.50651, 0.50651] | 0.39647 | 1.0000 [1.0000, 1.0000] | 0 / 0 | INSUFFICIENT | — |
| LEO 400-800 km | 72 | 8 / 1 | 0.50821 [0.50821, 0.50821] | 0.38176 | 1.0000 [1.0000, 1.0000] | 0 / 0 | INSUFFICIENT | — |
| SLR LEO 800-1500 km | 1 | 55 / 5 | 0.93145 [0.57685, 1.3792] | 0.59270 | 0.92727 [0.85455, 1.0000] | 0 / 0 | NOT REALISTIC (coverage) | yes |
| SLR LEO 800-1500 km | 6 | 55 / 5 | 1.3318 [0.87100, 1.7926] | 1.0201 | 0.90909 [0.80000, 1.0000] | 0 / 0 | NOT REALISTIC (overconfident) | yes |
| SLR LEO 800-1500 km | 12 | 53 / 5 | 0.90260 [0.65106, 1.2282] | 0.79697 | 0.98113 [0.93878, 1.0000] | 0 / 0 | NOT REALISTIC (coverage) | yes |
| SLR LEO 800-1500 km | 24 | 50 / 5 | 0.86757 [0.52845, 1.2067] | 0.60897 | 0.92000 [0.84000, 1.0000] | 0 / 0 | NOT REALISTIC (coverage) | yes |
| SLR LEO 800-1500 km | 48 | 45 / 5 | 1.1643 [0.62797, 1.7551] | 0.51976 | 0.88889 [0.75556, 1.0000] | 0 / 0 | NOT REALISTIC (coverage) | yes |
| SLR LEO 800-1500 km | 72 | 40 / 5 | 1.3377 [0.64205, 2.1180] | 0.79808 | 0.90000 [0.80000, 1.0000] | 0 / 0 | NOT REALISTIC (overconfident) | yes |
| SLR MEO | 1 | 10 / 5 | 1.2510 [0.34067, 1.9823] | 0.94070 | 0.90000 [0.70000, 1.0000] | 0 / 0 | INSUFFICIENT | — |
| SLR MEO | 6 | 10 / 5 | 1.3769 [0.26433, 2.4895] | 0.95396 | 0.80000 [0.60000, 1.0000] | 0 / 0 | INSUFFICIENT | — |
| SLR MEO | 12 | 10 / 5 | 1.3929 [0.37782, 2.4074] | 1.2661 | 0.90000 [0.70000, 1.0000] | 0 / 0 | INSUFFICIENT | — |
| SLR MEO | 24 | 6 / 5 | 0.70522 [0.18657, 1.5690] | 0.43296 | 1.0000 [1.0000, 1.0000] | 0 / 0 | INSUFFICIENT | — |
| SLR MEO | 48 | 2 / 1 | 9.9749e-7 [9.9749e-7, 9.9749e-7] | 9.9749e-7 | 1.0000 [1.0000, 1.0000] | 0 / 0 | INSUFFICIENT | — |
| SLR MEO | 72 | 2 / 1 | 3.5418e-7 [3.5418e-7, 3.5418e-7] | 3.5418e-7 | 1.0000 [1.0000, 1.0000] | 0 / 0 | INSUFFICIENT | — |

12/24 cells are statistically compatible with the rule (both bootstrap intervals overlap its bands, at least 30 samples from 3 objects): a report-only reading, since a cell of about 70 samples misses the coverage band of 0.93 to 0.97 by chance more often than not even when its covariance is right.

Split for P-axes-mle/risk/UNFLAGGED: 0/24 cells over all samples, 0/24 over unflagged samples, 0/6 horizons over flagged samples (pooled over classes).

| Flagged samples, pooled | n / objects | Mean d²/3 | 95% coverage | Verdict |
| --- | ---: | ---: | ---: | --- |
| h 1 | 53 / 7 | 4.0233 | 0.83019 | NOT REALISTIC (overconfident) |
| h 6 | 53 / 7 | 3.9865 | 0.81132 | NOT REALISTIC (overconfident) |
| h 12 | 53 / 7 | 10.604 | 0.79245 | NOT REALISTIC (overconfident) |
| h 24 | 52 / 7 | 10.570 | 0.80769 | NOT REALISTIC (overconfident) |
| h 48 | 49 / 7 | 10.242 | 0.79592 | NOT REALISTIC (overconfident) |
| h 72 | 45 / 7 | 10.266 | 0.77778 | NOT REALISTIC (overconfident) |

## Realistic by class and lead time

Cells REALISTIC on the test for P-axes-mle/risk/UNFLAGGED on its claimed population; nothing else may be labelled realistic.

| Class | 1 h | 6 h | 12 h | 24 h | 48 h | 72 h |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| GPS | — | — | — | — | — | — |
| LEO 400-800 km | n/a | n/a | n/a | n/a | n/a | n/a |
| SLR LEO 800-1500 km | — | — | — | — | — | — |
| SLR MEO | n/a | n/a | n/a | n/a | n/a | n/a |

## Event rule

Custody gap or a maneuver-detection event within 7 days (computed from each object's own element sets before the issue time). Test: 56 of 636 pairs flagged.

| Class | Pairs | Flagged | By custody gap | By detector | Detector refusals |
| --- | ---: | ---: | ---: | ---: | ---: |
| GPS | 384 | 46 | 35 | 13 | 0 |
| LEO 400-800 km | 132 | 0 | 0 | 0 | 0 |
| SLR LEO 800-1500 km | 60 | 0 | 0 | 0 | 0 |
| SLR MEO | 60 | 10 | 10 | 0 | 0 |

### GPS d² concentration under P-axes-mle/risk/UNFLAGGED (all arcs)

| Object | n | Fraction of total d² | Mean d²/3 | Median d²/3 | Maximum d²/3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 29601 | 60 | 0.57183 | 77.160 | 0.043466 | 586.24 |
| 68791 | 63 | 0.29826 | 38.329 | 33.415 | 94.879 |
| 43873 | 63 | 0.051101 | 6.5669 | 1.7086 | 44.042 |
| 55268 | 63 | 0.022046 | 2.8331 | 1.4812 | 25.662 |
| 41019 | 63 | 0.0048960 | 0.62918 | 0.48338 | 1.9618 |

### SLR MEO d² concentration under P-axes-mle/risk/UNFLAGGED (all arcs)

| Object | n | Fraction of total d² | Mean d²/3 | Median d²/3 | Maximum d²/3 |
| --- | ---: | ---: | ---: | ---: | ---: |

## Extreme samples

Samples with d²/3 above 10000 (all arcs, no exclusions, object aggregates only).

| Class | Object | Samples | In flagged arcs | Truth epochs | Max d²/3 | Max position error (km) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |

## What the window could test

Cells that cannot reach 30 samples from 3 objects are INSUFFICIENT and count as not realistic; that is the truth available in the window, not the calibration: LEO 400-800 km 6/6 cells (8-11 samples, at most 1 objects); SLR MEO 6/6 cells (2-10 samples, at most 5 objects).

## Integrity and limits

Run v1c5; 6 bounded single-threaded workers. Test arcs 636 (199 skipped, 2459 samples, 1357 absent horizons). Cell success does not certify an object; the models are aggregate MODELs per class and horizon (and tier), fitted on training weeks only. The truth for the test window was refreshed on 2026-10-26 (download cache kept in the durable run directory). Sources: Space-Track / USSPACECOM / 18th Space Defense Squadron; ILRS; IGS (Johnston et al. 2017); © ESA/ESOC 2026; modified Copernicus Sentinel data 2026; ESA Swarm precise orbits; UCAR COSMIC Program, 2019: COSMIC-2 Data Products, doi:10.5065/T353-C093 (CC BY 4.0). GFZ weather CC BY 4.0.
E2E: `node experiments/v1c5/run.mjs --check`.
