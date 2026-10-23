# V1c3 — pre-registered covariance calibration

Selected on August training only: **SGP4 F-coverage: 4/24 test cells; FFM-1 coverage: 3/24**.

Training issues: 2026-08-03–24; every target precedes August 28 UTC. Test: V1c2’s unchanged September 7–26 pairs. Both issue and truth times are disjoint; objects overlap. The population prior has older training and a broader published validation domain.

The exact paper rule and V1c2 bootstrap/verdict implementation are imported: mean d²/3 in [0.8,1.25], coverage in [0.93,0.97], at least 30 samples and three objects; 2,000 object-cluster resamples. No test tuning or truth exclusions. All covariance operations, fits and STM transport run in WASM.

[Frozen plan](../../experiments/v1c3-console-covariance-calibration/PLAN.md) · [All metrics](metrics.json) · [Manifest](manifest.json) · [MODEL application](MODEL.json)

| Mode | Candidate | Training realistic /24 | Test realistic /24 |
| --- | --- | ---: | ---: |
| SGP4 | N-none | 0 | 0 |
| SGP4 | N-scalar-mle | 8 | 3 |
| SGP4 | N-coverage | 12 | 3 |
| SGP4 | N-axes-mle | 9 | 1 |
| SGP4 | F-none | 4 | 3 |
| SGP4 | F-scalar-mle | 7 | 7 |
| SGP4 | F-coverage (selected) | 14 | 4 |
| SGP4 | F-axes-mle | 11 | 7 |
| SGP4 | P-none | 1 | 0 |
| SGP4 | P-scalar-mle | 6 | 6 |
| SGP4 | P-coverage | 12 | 2 |
| SGP4 | P-axes-mle | 4 | 6 |
| FFM-1 | none | 1 | 4 |
| FFM-1 | scalar-mle | 2 | 2 |
| FFM-1 | coverage (selected) | 10 | 3 |
| FFM-1 | axes-mle | 2 | 1 |

## Selected SGP4: F-coverage

| Group | h | n / objects | Mean d²/3 [95% CI] | Median d²/3 | 95% coverage [CI] | Non-PD / unavailable | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| GPS | 1 | 631 / 32 | 684.60 [2.1944, 1980.3] | 0.55498 | 0.90491 [0.85238, 0.94969] | 5 | NOT REALISTIC (overconfident) |
| GPS | 6 | 630 / 32 | 1418.7 [2.2062, 4186.5] | 0.57818 | 0.90794 [0.85692, 0.95118] | 6 | NOT REALISTIC (overconfident) |
| GPS | 12 | 628 / 32 | 720.47 [3.3207, 2080.6] | 0.65454 | 0.89809 [0.84590, 0.94497] | 8 | NOT REALISTIC (overconfident) |
| GPS | 24 | 631 / 32 | 750.07 [4.6540, 2153.4] | 0.65514 | 0.89540 [0.83937, 0.94313] | 9 | NOT REALISTIC (overconfident) |
| GPS | 48 | 627 / 32 | 876.85 [10.589, 2519.7] | 0.73307 | 0.89952 [0.84490, 0.94532] | 13 | NOT REALISTIC (overconfident) |
| GPS | 72 | 621 / 32 | 996.49 [20.627, 2872.3] | 0.75022 | 0.90016 [0.84279, 0.94806] | 19 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 1 | 48 / 3 | 1.6543 [1.4036, 1.8630] | 1.5988 | 0.83333 [0.78571, 0.85714] | 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 6 | 46 / 3 | 1.0666 [0.50999, 1.5709] | 0.88737 | 0.91304 [0.80000, 1.0000] | 0 | NOT REALISTIC (coverage) |
| LEO 400-800 km | 12 | 46 / 3 | 1.2414 [1.1184, 1.3538] | 1.1428 | 0.93478 [0.84615, 1.0000] | 0 | REALISTIC |
| LEO 400-800 km | 24 | 46 / 3 | 1.4343 [1.0569, 1.8051] | 1.2721 | 0.84783 [0.70000, 1.0000] | 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 48 | 44 / 3 | 1.3708 [1.2320, 1.4772] | 1.3622 | 0.95455 [0.91667, 1.0000] | 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 72 | 42 / 3 | 1.0696 [1.0070, 1.1367] | 0.87530 | 0.97619 [0.90909, 1.0000] | 0 | NOT REALISTIC (coverage) |
| SLR LEO 800-1500 km | 1 | 99 / 5 | 0.95860 [0.72208, 1.2778] | 0.78150 | 0.95960 [0.90000, 1.0000] | 0 | REALISTIC |
| SLR LEO 800-1500 km | 6 | 98 / 5 | 0.68813 [0.38973, 1.1231] | 0.45735 | 0.97959 [0.95918, 1.0000] | 0 | NOT REALISTIC (pessimistic) |
| SLR LEO 800-1500 km | 12 | 98 / 5 | 1.1483 [0.87881, 1.4077] | 0.96991 | 0.93878 [0.86170, 0.99000] | 0 | REALISTIC |
| SLR LEO 800-1500 km | 24 | 100 / 5 | 1.0571 [0.81831, 1.4434] | 0.79146 | 0.92000 [0.81000, 0.99000] | 0 | NOT REALISTIC (coverage) |
| SLR LEO 800-1500 km | 48 | 100 / 5 | 0.86185 [0.60761, 1.2415] | 0.70027 | 0.96000 [0.88000, 1.0000] | 0 | REALISTIC |
| SLR LEO 800-1500 km | 72 | 100 / 5 | 0.74260 [0.45588, 1.1535] | 0.53075 | 0.95000 [0.85000, 1.0000] | 0 | NOT REALISTIC (pessimistic) |
| SLR MEO | 1 | 55 / 4 | 0.57258 [0.13071, 1.0562] | 0.26640 | 1.0000 [1.0000, 1.0000] | 4 | NOT REALISTIC (pessimistic) |
| SLR MEO | 6 | 53 / 4 | 0.85358 [0.077872, 1.6246] | 0.33934 | 0.90566 [0.80769, 1.0000] | 6 | NOT REALISTIC (coverage) |
| SLR MEO | 12 | 53 / 4 | 0.73862 [0.13689, 1.3635] | 0.25614 | 0.96226 [0.88462, 1.0000] | 6 | NOT REALISTIC (pessimistic) |
| SLR MEO | 24 | 50 / 4 | 0.65869 [0.13160, 1.2297] | 0.20559 | 0.98000 [0.93750, 1.0000] | 6 | NOT REALISTIC (pessimistic) |
| SLR MEO | 48 | 45 / 4 | 0.69124 [0.17690, 1.2290] | 0.27335 | 1.0000 [1.0000, 1.0000] | 8 | NOT REALISTIC (pessimistic) |
| SLR MEO | 72 | 41 / 4 | 0.60035 [0.17734, 1.0445] | 0.33326 | 1.0000 [1.0000, 1.0000] | 9 | NOT REALISTIC (pessimistic) |

## Selected FFM-1: coverage

| Group | h | n / objects | Mean d²/3 [95% CI] | Median d²/3 | 95% coverage [CI] | Non-PD / unavailable | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| GPS | 1 | 631 / 32 | 687.44 [2.2714, 1976.3] | 0.52776 | 0.90650 [0.85327, 0.95141] | 5 | NOT REALISTIC (overconfident) |
| GPS | 6 | 631 / 32 | 830.00 [1.9106, 2416.9] | 0.55114 | 0.90650 [0.85326, 0.95268] | 5 | NOT REALISTIC (overconfident) |
| GPS | 12 | 631 / 32 | 409.90 [2.7895, 1163.3] | 0.51504 | 0.92868 [0.87777, 0.96994] | 5 | NOT REALISTIC (overconfident) |
| GPS | 24 | 635 / 32 | 293.77 [3.1659, 826.84] | 0.57886 | 0.91811 [0.85851, 0.96395] | 5 | NOT REALISTIC (overconfident) |
| GPS | 48 | 635 / 32 | 166.41 [2.9998, 467.87] | 0.63076 | 0.90551 [0.83840, 0.95762] | 5 | NOT REALISTIC (overconfident) |
| GPS | 72 | 635 / 32 | 126.01 [2.9262, 355.82] | 0.62996 | 0.89606 [0.82177, 0.95570] | 5 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 1 | 48 / 3 | 1.2085 [0.93957, 1.3960] | 1.1295 | 0.95833 [0.92857, 1.0000] | 0 | REALISTIC |
| LEO 400-800 km | 6 | 46 / 3 | 1.0287 [0.82617, 1.1471] | 0.95329 | 1.0000 [1.0000, 1.0000] | 0 | NOT REALISTIC (coverage) |
| LEO 400-800 km | 12 | 46 / 3 | 1.3081 [1.0031, 1.5726] | 1.1765 | 0.91304 [0.80000, 1.0000] | 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 24 | 46 / 3 | 1.0388 [0.86854, 1.1484] | 0.90025 | 0.97826 [0.92308, 1.0000] | 0 | NOT REALISTIC (coverage) |
| LEO 400-800 km | 48 | 44 / 3 | 1.0899 [0.88317, 1.2445] | 1.0053 | 0.97727 [0.95000, 1.0000] | 0 | NOT REALISTIC (coverage) |
| LEO 400-800 km | 72 | 42 / 3 | 0.45465 [0.37207, 0.53857] | 0.43771 | 1.0000 [1.0000, 1.0000] | 0 | NOT REALISTIC (pessimistic) |
| SLR LEO 800-1500 km | 1 | 99 / 5 | 0.89820 [0.62307, 1.2077] | 0.74018 | 0.97980 [0.93939, 1.0000] | 0 | NOT REALISTIC (coverage) |
| SLR LEO 800-1500 km | 6 | 98 / 5 | 0.90379 [0.52605, 1.3257] | 0.68664 | 0.93878 [0.86000, 1.0000] | 0 | REALISTIC |
| SLR LEO 800-1500 km | 12 | 98 / 5 | 0.95682 [0.62054, 1.3019] | 0.74438 | 0.94898 [0.88776, 1.0000] | 0 | REALISTIC |
| SLR LEO 800-1500 km | 24 | 100 / 5 | 1.2585 [0.82205, 1.7971] | 0.96644 | 0.87000 [0.73000, 1.0000] | 0 | NOT REALISTIC (overconfident) |
| SLR LEO 800-1500 km | 48 | 100 / 5 | 1.1995 [0.58372, 1.9842] | 0.68699 | 0.89000 [0.77000, 1.0000] | 0 | NOT REALISTIC (coverage) |
| SLR LEO 800-1500 km | 72 | 100 / 5 | 1.2590 [0.60977, 2.2299] | 0.67181 | 0.92000 [0.81000, 0.99000] | 0 | NOT REALISTIC (overconfident) |
| SLR MEO | 1 | 55 / 4 | 0.42538 [0.29215, 0.62282] | 0.35511 | 1.0000 [1.0000, 1.0000] | 4 | NOT REALISTIC (pessimistic) |
| SLR MEO | 6 | 55 / 4 | 0.46999 [0.069421, 0.90703] | 0.19184 | 0.98182 [0.94231, 1.0000] | 4 | NOT REALISTIC (pessimistic) |
| SLR MEO | 12 | 55 / 4 | 0.18653 [0.10401, 0.26609] | 0.15215 | 1.0000 [1.0000, 1.0000] | 4 | NOT REALISTIC (pessimistic) |
| SLR MEO | 24 | 52 / 4 | 0.44428 [0.13907, 0.80037] | 0.22514 | 1.0000 [1.0000, 1.0000] | 4 | NOT REALISTIC (pessimistic) |
| SLR MEO | 48 | 49 / 4 | 0.65483 [0.53641, 0.81728] | 0.50437 | 1.0000 [1.0000, 1.0000] | 4 | NOT REALISTIC (pessimistic) |
| SLR MEO | 72 | 46 / 4 | 0.55654 [0.22261, 0.95932] | 0.37903 | 1.0000 [1.0000, 1.0000] | 4 | NOT REALISTIC (pessimistic) |

## GPS tail diagnostics

Object aggregates include every finite sample; the top-ten ranges describe each object’s largest d² observations. Local sample keys and complete scores remain in the ignored run. Error changes and marginal variances diagnose tails but cannot identify maneuvers or prove ill-conditioning without independent evidence.

### SGP4 uncalibrated

| Object | n | Fraction of total d² | Mean d²/3 | Median d²/3 | Maximum d²/3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 36585 | 120 | 0.92317 | 33058 | 1.3586 | 1.9500e+5 |
| 68791 | 98 | 0.057173 | 2506.9 | 59.752 | 18531 |
| 62339 | 107 | 0.013096 | 525.95 | 1.0632 | 3393.8 |
| 32260 | 117 | 0.0032879 | 120.76 | 1.3721 | 3904.4 |
| 45854 | 117 | 0.0023534 | 86.433 | 0.86114 | 1170.2 |

### SGP4 selected

| Object | n | Fraction of total d² | Mean d²/3 | Median d²/3 | Maximum d²/3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 36585 | 120 | 0.89105 | 25396 | 1.2260 | 1.3744e+5 |
| 68791 | 98 | 0.075242 | 2625.9 | 48.514 | 18685 |
| 62339 | 107 | 0.026890 | 859.51 | 1.8046 | 6125.0 |
| 32260 | 117 | 0.0034513 | 100.89 | 1.0009 | 3417.9 |
| 45854 | 117 | 0.0024713 | 72.242 | 0.76393 | 1228.8 |

### FFM-1 selected

| Object | n | Fraction of total d² | Mean d²/3 | Median d²/3 | Maximum d²/3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 36585 | 120 | 0.86750 | 11483 | 0.80477 | 80781 |
| 68791 | 105 | 0.10401 | 1573.4 | 69.497 | 16229 |
| 62339 | 117 | 0.022808 | 309.64 | 2.1544 | 3214.7 |
| 32260 | 117 | 0.0023537 | 31.954 | 1.3463 | 669.49 |
| 45854 | 117 | 0.0017553 | 23.830 | 0.63728 | 192.41 |

## Integrity and limits

Run v1c3-console-covariance-calibration-20261023; 4 bounded single-threaded workers; peak dispatch load 19.9892578125. Training missing inputs and test missing horizons are retained in metrics. Frozen V1c2 baseline: 0/24 in both modes, reproduced unchanged.

Shared-host load exceeded the requested ceiling of 21, including while this experiment was stopped. Dispatch remained below 20; later collection used progressively lower thresholds for additional workers and an own-process pause watchdog. These scheduling changes preserve the registered maximum of four workers and all numerical settings. See [scheduling observations](scheduling-observations.json).

The selected configuration is an experimental aggregate MODEL, not evidence that every object has realistic covariance. Cell-level success does not certify individual objects. FFM uses the selected SGP4 seed and horizon factors with no process noise; test positions are frozen V1c coverage positions. V1c2’s covariance-resident nominal discrepancy remains an inherited limitation.

Exact V1c2 artifacts run through the same SDK harness. Native WasmEdge 0.16.4 accepted gp-error-model but rejects the frozen FFM’s exception instructions. This known flow-artifact defect belongs to ffm-memory-measured-sizing-20261022; the coordinator determined it does not block this experiment. Docker waived by owner ruling 2026-10-22. No unit suites, speed rerun, production SSH or deployment.

Sources: Space-Track / USSPACECOM / 18th Space Defense Squadron; ILRS; IGS (Johnston et al. 2017); © ESA/ESOC 2026; © ESA 2026 SW_SP3xCOM_2_; modified Copernicus Sentinel data 2026. GFZ weather CC BY 4.0 (Matzka et al. 2021; F10.7 DRAO/Natural Resources Canada); NOAA SWPC public-domain forecast fills. [Data terms](../../docs/data-licenses.md). No raw OMM or truth is redistributed.

E2E: `node experiments/v1c3-console-covariance-calibration/run.mjs --check`.
