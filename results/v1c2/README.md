# V1c2: console covariance realism

Generated from `v1c2-console-covariance-realism-run-20261022T233324Z`. [Frozen plan](../../experiments/v1c2-console-covariance-realism/PLAN.md), [metrics](metrics.json), [manifest](manifest.json).

The paper’s position-only rule is mean d²/3 in [0.8, 1.25] and 95% coverage in [0.93, 0.97], with at least 30 samples from 3 objects. Intervals use its object-cluster bootstrap (2,000 draws; registered seed 20261017). No bias removal, covariance fit or truth covariance is added.

V1c’s E3 object/issue selection, public OMM anchor, precise truth and six horizons are unchanged. SGP4 covariance uses object_covariance at the target element-set age. FFM covariance uses its value at sim start as P0, transported by the FFM-1 resident STM without process noise, and is scored against the recorded V1c coverage-path positions.

## SGP4

Realistic: **0/24 cells** (0.000%); 0/24 testable cells.

| Class | h | n / objects | Mean d²/3 [95% interval] | 95% coverage | Empirical / population / refused | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| GPS | 1 | 631 / 32 | 1044.5 [2.988, 3059.0] | 0.848 | 506 / 125 / 5 | NOT REALISTIC (overconfident) |
| GPS | 6 | 630 / 32 | 1920.3 [2.877, 5712.6] | 0.870 | 552 / 78 / 6 | NOT REALISTIC (overconfident) |
| GPS | 12 | 628 / 32 | 932.1 [4.654, 2728.4] | 0.844 | 583 / 45 / 8 | NOT REALISTIC (overconfident) |
| GPS | 24 | 631 / 32 | 980.4 [6.556, 2861.3] | 0.837 | 587 / 44 / 9 | NOT REALISTIC (overconfident) |
| GPS | 48 | 627 / 32 | 998.5 [13.341, 2909.1] | 0.869 | 589 / 38 / 13 | NOT REALISTIC (overconfident) |
| GPS | 72 | 621 / 32 | 963.2 [20.461, 2806.4] | 0.897 | 586 / 35 / 19 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 1 | 48 / 3 | 6.888 [5.217, 8.421] | 0.208 | 48 / 0 / 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 6 | 46 / 3 | 3.774 [1.660, 5.256] | 0.391 | 46 / 0 / 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 12 | 46 / 3 | 4.266 [3.281, 4.921] | 0.304 | 46 / 0 / 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 24 | 46 / 3 | 2.700 [2.019, 3.375] | 0.609 | 46 / 0 / 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 48 | 44 / 3 | 1.312 [1.166, 1.414] | 0.886 | 44 / 0 / 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 72 | 42 / 3 | 0.898 [0.875, 0.959] | 1.000 | 42 / 0 / 0 | NOT REALISTIC (coverage) |
| SLR LEO 800-1500 km | 1 | 99 / 5 | 4.067 [3.050, 5.801] | 0.424 | 99 / 0 / 0 | NOT REALISTIC (overconfident) |
| SLR LEO 800-1500 km | 6 | 98 / 5 | 2.596 [1.372, 4.515] | 0.745 | 98 / 0 / 0 | NOT REALISTIC (overconfident) |
| SLR LEO 800-1500 km | 12 | 98 / 5 | 2.798 [2.252, 3.430] | 0.531 | 98 / 0 / 0 | NOT REALISTIC (overconfident) |
| SLR LEO 800-1500 km | 24 | 100 / 5 | 2.369 [1.860, 3.128] | 0.670 | 100 / 0 / 0 | NOT REALISTIC (overconfident) |
| SLR LEO 800-1500 km | 48 | 100 / 5 | 1.000 [0.784, 1.408] | 0.920 | 100 / 0 / 0 | NOT REALISTIC (coverage) |
| SLR LEO 800-1500 km | 72 | 100 / 5 | 0.566 [0.351, 0.939] | 0.970 | 100 / 0 / 0 | NOT REALISTIC (pessimistic) |
| SLR MEO | 1 | 55 / 4 | 0.330 [0.055, 0.637] | 1.000 | 38 / 17 / 4 | NOT REALISTIC (pessimistic) |
| SLR MEO | 6 | 53 / 4 | 0.381 [0.027, 0.746] | 1.000 | 39 / 14 / 6 | NOT REALISTIC (pessimistic) |
| SLR MEO | 12 | 53 / 4 | 0.325 [0.050, 0.610] | 1.000 | 39 / 14 / 6 | NOT REALISTIC (pessimistic) |
| SLR MEO | 24 | 50 / 4 | 0.305 [0.047, 0.585] | 1.000 | 36 / 14 / 6 | NOT REALISTIC (pessimistic) |
| SLR MEO | 48 | 45 / 4 | 0.257 [0.052, 0.471] | 1.000 | 33 / 12 / 8 | NOT REALISTIC (pessimistic) |
| SLR MEO | 72 | 41 / 4 | 0.194 [0.047, 0.349] | 1.000 | 30 / 11 / 9 | NOT REALISTIC (pessimistic) |

## FFM-1

Realistic: **0/24 cells** (0.000%); 0/24 testable cells.

| Class | h | n / objects | Mean d²/3 [95% interval] | 95% coverage | Empirical / population / refused | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| GPS | 1 | 631 / 32 | 1045.5 [3.094, 3045.1] | 0.848 | 503 / 128 / 5 | NOT REALISTIC (overconfident) |
| GPS | 6 | 631 / 32 | 1416.6 [2.490, 4167.5] | 0.840 | 503 / 128 / 5 | NOT REALISTIC (overconfident) |
| GPS | 12 | 631 / 32 | 563.0 [2.923, 1627.7] | 0.911 | 503 / 128 / 5 | NOT REALISTIC (overconfident) |
| GPS | 24 | 635 / 32 | 313.2 [2.704, 898.0] | 0.921 | 505 / 130 / 5 | NOT REALISTIC (overconfident) |
| GPS | 48 | 635 / 32 | 149.1 [2.364, 425.1] | 0.923 | 505 / 130 / 5 | NOT REALISTIC (overconfident) |
| GPS | 72 | 635 / 32 | 107.1 [2.248, 306.0] | 0.913 | 505 / 130 / 5 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 1 | 48 / 3 | 5.419 [3.439, 7.646] | 0.333 | 48 / 0 / 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 6 | 46 / 3 | 6.168 [4.197, 8.357] | 0.217 | 46 / 0 / 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 12 | 46 / 3 | 6.361 [3.906, 9.110] | 0.174 | 46 / 0 / 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 24 | 46 / 3 | 6.669 [4.701, 8.547] | 0.196 | 46 / 0 / 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 48 | 44 / 3 | 6.802 [4.392, 9.228] | 0.182 | 44 / 0 / 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 72 | 42 / 3 | 6.818 [4.432, 8.707] | 0.190 | 42 / 0 / 0 | NOT REALISTIC (overconfident) |
| SLR LEO 800-1500 km | 1 | 99 / 5 | 4.465 [3.078, 6.449] | 0.364 | 99 / 0 / 0 | NOT REALISTIC (overconfident) |
| SLR LEO 800-1500 km | 6 | 98 / 5 | 4.902 [2.744, 7.574] | 0.357 | 98 / 0 / 0 | NOT REALISTIC (overconfident) |
| SLR LEO 800-1500 km | 12 | 98 / 5 | 5.379 [3.371, 7.968] | 0.337 | 98 / 0 / 0 | NOT REALISTIC (overconfident) |
| SLR LEO 800-1500 km | 24 | 100 / 5 | 5.546 [3.299, 9.024] | 0.360 | 100 / 0 / 0 | NOT REALISTIC (overconfident) |
| SLR LEO 800-1500 km | 48 | 100 / 5 | 6.110 [3.101, 10.695] | 0.330 | 100 / 0 / 0 | NOT REALISTIC (overconfident) |
| SLR LEO 800-1500 km | 72 | 100 / 5 | 7.963 [3.517, 15.335] | 0.400 | 100 / 0 / 0 | NOT REALISTIC (overconfident) |
| SLR MEO | 1 | 55 / 4 | 0.571 [0.274, 0.939] | 1.000 | 38 / 17 / 4 | NOT REALISTIC (pessimistic) |
| SLR MEO | 6 | 55 / 4 | 0.390 [0.039, 0.781] | 0.982 | 38 / 17 / 4 | NOT REALISTIC (pessimistic) |
| SLR MEO | 12 | 55 / 4 | 0.294 [0.126, 0.481] | 1.000 | 38 / 17 / 4 | NOT REALISTIC (pessimistic) |
| SLR MEO | 24 | 52 / 4 | 0.228 [0.055, 0.431] | 1.000 | 35 / 17 / 4 | NOT REALISTIC (pessimistic) |
| SLR MEO | 48 | 49 / 4 | 0.301 [0.181, 0.462] | 1.000 | 32 / 17 / 4 | NOT REALISTIC (pessimistic) |
| SLR MEO | 72 | 46 / 4 | 0.279 [0.080, 0.538] | 1.000 | 29 / 17 / 4 | NOT REALISTIC (pessimistic) |

## Integrity and limits

960 object/issue pairs; 113 skipped; 5031 paired truth samples; 729 absent horizons. Non-positive-definite or unavailable covariance counts are retained in metrics. FFM status labels describe P0, not a calibration verdict on its transported covariance.

Maximum SGP4 error difference from V1c: 0.000 m; replayed coverage difference 0.000 m; state-only resident/recorded coverage difference 0.001 m (registered tolerance 0.1 m). Maximum zero-time covariance relative difference: 2.249e-16.

Covariance-resident nominal position versus recorded Fast coverage: maximum 0.426 m; 44 samples MISS the original 0.1 m control. Attaching P0 selects the module’s seed-to-target variational RK branch (ResidentDynamics::covariance), instead of the Fast nominal path. All FFM scores use unchanged recorded Fast positions.

Amendments A2–A3: the first 0.124510245 m diagnostic miss was also present without covariance, so covariance-branch attribution alone was rejected. The catalog rounds its seed through UTC Julian date before encoding ISO; foundation/time now encodes that same instant for both resident controls. The paired original wall-clock ISO seed reaches 0.129 m difference; the normalized state-only control above must pass 0.1 m. Neither the covariance scores nor thresholds were tuned.

Modules built from `6b1132cb3d548c838931fc6b7d425ab315069a7f`; v25.4.0, darwin 25.3.0 arm64; 28 logical CPUs, 6 independent single-threaded WASM workers. Load at start/end: 14.657/17.582/16.366 / 13.909/15.304/17.299; peak sampled at dispatch 20.953. This is a covariance test; the frozen V1c CPU benchmark is not rerun. Amendment A4 changes only scheduling; all 9 completed sequential pilot arcs reproduce exactly.

The history prior compares OMMs with later OMMs, which may share errors; EMPIRICAL does not assert truth calibration. This retrospective E3 window overlaps the population model’s existing validation domain and is not new independent validation of its fit. No maneuver exclusions were introduced. Linear STM transport without process noise does not model force error, maneuvers or nonlinear uncertainty growth.

Inputs and credits: Space-Track / USSPACECOM / 18th Space Defense Squadron; ILRS; IGS (Johnston et al. 2017); © Navigation Support Office at ESA/ESOC 2026; © ESA 2026, SW_SP3xCOM_2_; Contains modified Copernicus Sentinel data 2026. Weather: GFZ historical drivers (CC BY 4.0, Matzka et al. 2021, doi:10.1029/2020SW002641; F10.7 DRAO/Natural Resources Canada), NOAA SWPC public-domain forecast fills for absent centered-average dates, exactly as V1c. No CelesTrak/CSSI weather. [Data terms](../../docs/data-licenses.md). Raw OMM, states and individual scores remain local.

Amendment A1 (before covariance scoring): request the stateless resident covariance only at scored horizons, while replaying catalog coverage every 300 seconds. The module restarts the STM at the seed for every request; intermediate discarded covariance requests cannot affect an endpoint.

Verification: `node experiments/v1c2-console-covariance-realism/run.mjs --check`. Unit tests, Docker, speed reruns and deployment are outside this experiment. V1 and V1c remain as published.
