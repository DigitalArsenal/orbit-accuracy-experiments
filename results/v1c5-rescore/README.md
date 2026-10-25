# V1c5 rescore: the frozen SGP4/GP covariance on a screening criterion

The model is V1c5's `P-axes-mle/risk/UNFLAGGED`, unchanged. Truth is extended with COSMIC-2 near-real-time orbits (LEO 400-800 km: 63/63/61/57/51/45 samples per horizon from 6 objects, was 8 to 11 from 1). On the unflagged samples of issue days 2026-10-09 to 2026-10-20: **6 of 24 cells are REALISTIC under the Gaussian rule** (LEO 400-800 km), 18 of 24 statistically compatible; under the screening criterion the 24 cells are 6 calibrated, 8 pessimistic, 0 overconfident, 10 insufficient.

[Frozen plan](../../experiments/v1c5-rescore/PLAN.md) · [Config](../../experiments/v1c5-rescore/config.json) · [Fits](fits.json) · [Metrics](metrics.json) · [Reader table](table.json) · [Manifest](manifest.json)

## Result by class (unflagged samples, all horizons)

A level is covered when the share of samples with F(d²) at most p is p within the 95 % object-cluster bootstrap interval ("ok"); "over" means fewer samples inside the p-ellipsoid than p (the covariance is too small), "wide" more (too large). — marks a level the sample cannot reach. A verdict is OVERCONFIDENT if any evaluable level from 0.90 is "over", else PESSIMISTIC if any evaluable level is "wide"; the number in brackets is the highest evaluable level.

| Class | Predictor | n / objects | 0.50 | 0.90 | 0.95 | 0.99 | Verdict (reach) |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| GPS | G | 1756 / 30 | 0.873 [0.793, 0.934] wide | 0.970 [0.925, 1.000] wide | 0.970 [0.925, 1.000] ok | 0.972 [0.929, 1.000] ok | PESSIMISTIC (0.99) |
| GPS | T | 1756 / 30 | 0.691 [0.590, 0.783] wide | 0.970 [0.924, 0.999] wide | 0.972 [0.929, 1.000] ok | 0.983 [0.958, 1.000] ok | PESSIMISTIC (0.99) |
| GPS | Q | 1756 / 30 | 0.714 [0.617, 0.801] wide | 0.956 [0.902, 0.989] wide | 0.970 [0.925, 1.000] ok | 0.991 [0.971, 1.000] ok | PESSIMISTIC (0.99) |
| LEO 400-800 km | G | 340 / 6 | 0.462 [0.383, 0.547] ok | 0.932 [0.866, 0.982] ok | 0.959 [0.891, 0.997] ok | — | CALIBRATED (0.95) |
| LEO 400-800 km | T | 340 / 6 | 0.485 [0.403, 0.569] ok | 0.962 [0.894, 1.000] ok | 0.974 [0.921, 1.000] ok | — | CALIBRATED (0.95) |
| LEO 400-800 km | Q | 340 / 6 | 0.503 [0.409, 0.597] ok | 0.938 [0.877, 0.988] ok | 0.971 [0.912, 1.000] ok | — | CALIBRATED (0.95) |
| SLR LEO 800-1500 km | G | 298 / 5 | 0.540 [0.436, 0.648] ok | 0.869 [0.767, 0.973] ok | 0.923 [0.849, 0.997] ok | — | CALIBRATED (0.95) |
| SLR LEO 800-1500 km | T | 298 / 5 | 0.567 [0.456, 0.678] ok | 0.879 [0.773, 0.976] ok | 0.926 [0.853, 0.997] ok | — | CALIBRATED (0.95) |
| SLR LEO 800-1500 km | Q | 298 / 5 | 0.577 [0.457, 0.691] ok | 0.866 [0.758, 0.973] ok | 0.930 [0.862, 0.997] ok | — | CALIBRATED (0.95) |
| SLR MEO | G | 40 / 5 | 0.575 [0.200, 0.933] ok | — | — | — | INSUFFICIENT (0.5) |
| SLR MEO | T | 40 / 5 | 0.375 [0.000, 0.780] ok | — | — | — | INSUFFICIENT (0.5) |
| SLR MEO | Q | 40 / 5 | 0.350 [0.000, 0.760] ok | — | — | — | INSUFFICIENT (0.5) |
| ALL CLASSES | G | 2434 / 46 | 0.770 [0.692, 0.841] wide | 0.949 [0.911, 0.979] wide | 0.962 [0.929, 0.988] ok | 0.972 [0.942, 0.993] ok | PESSIMISTIC (0.99) |
| ALL CLASSES | T | 2434 / 46 | 0.642 [0.563, 0.717] wide | 0.952 [0.913, 0.981] wide | 0.963 [0.930, 0.988] ok | 0.982 [0.964, 0.996] ok | PESSIMISTIC (0.99) |
| ALL CLASSES | Q | 2434 / 46 | 0.662 [0.582, 0.733] wide | 0.941 [0.899, 0.974] ok | 0.965 [0.933, 0.990] ok | 0.989 [0.973, 0.998] ok | PESSIMISTIC (0.99) |

G is the frozen model read as Gaussian; T is Student-t scale mixture on the same covariance and Q is empirical level multipliers, both fitted on the training out-of-fold population only (`fits.json`).

## Recommendation

| Class | Choice | Log score T - G per sample [95 % CI] | Overconfident levels G / T | Verdict G / T |
| --- | --- | --- | --- | --- |
| GPS | **T** | 4.830 [0.780, 13.502] | 0 / 0 | PESSIMISTIC / PESSIMISTIC |
| LEO 400-800 km | **G** | -0.027 [-0.060, 0.024] | 0 / 0 | CALIBRATED / CALIBRATED |
| SLR LEO 800-1500 km | **G** | 0.007 [-0.008, 0.029] | 0 / 0 | CALIBRATED / CALIBRATED |
| SLR MEO | **G** | 0.350 [-1.088, 1.834] | 0 / 0 | INSUFFICIENT / INSUFFICIENT |

The rule (PLAN section 6): T when its log-score gain over G has an interval above 0 and it has no more overconfident levels; otherwise G.

## Pc-like tail ratios (unflagged, all horizons)

Observed share outside the (1 - α) ellipsoid divided by α [95 % CI]. A Gaussian-covariance screen under-warns by that factor at that Mahalanobis radius when the ratio is above 1.

| Class | Predictor | α = 0.10 | α = 0.05 | α = 0.01 |
| --- | --- | --- | --- | --- |
| GPS | G | 0.30 [0.00, 0.75] | 0.59 [0.00, 1.50] | 2.85 [0.00, 7.12] |
| GPS | T | 0.30 [0.01, 0.76] | 0.57 [0.00, 1.42] | 1.65 [0.00, 4.19] |
| GPS | Q | 0.44 [0.11, 0.98] | 0.59 [0.00, 1.50] | 0.91 [0.00, 2.85] |
| LEO 400-800 km | G | 0.68 [0.18, 1.34] | 0.82 [0.06, 2.18] | — |
| LEO 400-800 km | T | 0.38 [0.00, 1.06] | 0.53 [0.00, 1.58] | — |
| LEO 400-800 km | Q | 0.62 [0.12, 1.23] | 0.59 [0.00, 1.76] | — |
| SLR LEO 800-1500 km | G | 1.31 [0.27, 2.33] | 1.54 [0.07, 3.02] | — |
| SLR LEO 800-1500 km | T | 1.21 [0.24, 2.27] | 1.48 [0.07, 2.93] | — |
| SLR LEO 800-1500 km | Q | 1.34 [0.27, 2.42] | 1.41 [0.07, 2.75] | — |
| SLR MEO | G | — | — | — |
| SLR MEO | T | — | — | — |
| SLR MEO | Q | — | — | — |

## Cells (unflagged samples)

Gaussian rule (mean d²/3 in [0.8, 1.25], 95 % coverage in [0.93, 0.97], 30 samples from 3 objects) beside the screening criterion. Screening: G 6 calibrated, 8 pessimistic, 0 overconfident, 10 insufficient; T 5 calibrated, 9 pessimistic, 0 overconfident, 10 insufficient; Q 6 calibrated, 8 pessimistic, 0 overconfident, 10 insufficient.

| Class | h | n / objects | Mean d²/3 [95 % CI] | 95 % coverage [CI] | Rule | Compatible | G | T | Q |
| --- | ---: | ---: | --- | --- | --- | :---: | --- | --- | --- |
| GPS | 1 | 307 / 30 | 3.0295 [0.28802, 8.5448] | 0.96417 [0.90624, 1.0000] | NOT REALISTIC (overconfident) | yes | PESSIMISTIC (0.95) | PESSIMISTIC (0.95) | PESSIMISTIC (0.95) |
| GPS | 6 | 307 / 30 | 1.1330 [0.21704, 2.7693] | 0.97068 [0.92783, 1.0000] | NOT REALISTIC (coverage) | yes | PESSIMISTIC (0.95) | PESSIMISTIC (0.95) | PESSIMISTIC (0.95) |
| GPS | 12 | 307 / 30 | 3.2169 [0.31764, 9.2572] | 0.97068 [0.92783, 1.0000] | NOT REALISTIC (overconfident) | yes | PESSIMISTIC (0.95) | PESSIMISTIC (0.95) | PESSIMISTIC (0.95) |
| GPS | 24 | 308 / 30 | 3.4576 [0.29541, 10.055] | 0.96753 [0.92176, 1.0000] | NOT REALISTIC (overconfident) | yes | PESSIMISTIC (0.95) | PESSIMISTIC (0.95) | PESSIMISTIC (0.95) |
| GPS | 48 | 278 / 30 | 3.9401 [0.22874, 11.926] | 0.97482 [0.93207, 1.0000] | NOT REALISTIC (overconfident) | yes | PESSIMISTIC (0.95) | PESSIMISTIC (0.95) | PESSIMISTIC (0.95) |
| GPS | 72 | 249 / 30 | 4.7012 [0.23885, 14.455] | 0.97590 [0.93670, 1.0000] | NOT REALISTIC (overconfident) | yes | PESSIMISTIC (0.95) | PESSIMISTIC (0.95) | PESSIMISTIC (0.95) |
| LEO 400-800 km | 1 | 63 / 6 | 1.0571 [0.93799, 1.1505] | 0.96825 [0.92982, 1.0000] | REALISTIC | yes | PESSIMISTIC (0.9) | PESSIMISTIC (0.9) | PESSIMISTIC (0.9) |
| LEO 400-800 km | 6 | 63 / 6 | 1.0081 [0.77232, 1.2475] | 0.95238 [0.85714, 1.0000] | REALISTIC | yes | CALIBRATED (0.9) | CALIBRATED (0.9) | CALIBRATED (0.9) |
| LEO 400-800 km | 12 | 61 / 6 | 0.99832 [0.55336, 1.4310] | 0.96721 [0.93443, 1.0000] | REALISTIC | yes | CALIBRATED (0.9) | PESSIMISTIC (0.9) | CALIBRATED (0.9) |
| LEO 400-800 km | 24 | 57 / 6 | 0.88863 [0.65184, 1.1387] | 0.96491 [0.89474, 1.0000] | REALISTIC | yes | CALIBRATED (0.9) | CALIBRATED (0.9) | CALIBRATED (0.9) |
| LEO 400-800 km | 48 | 51 / 6 | 0.98859 [0.62044, 1.4817] | 0.94118 [0.82353, 1.0000] | REALISTIC | yes | CALIBRATED (0.9) | CALIBRATED (0.9) | CALIBRATED (0.9) |
| LEO 400-800 km | 72 | 45 / 6 | 1.0455 [0.65032, 1.4938] | 0.95556 [0.86667, 1.0000] | REALISTIC | yes | INSUFFICIENT (0.5) | INSUFFICIENT (0.5) | INSUFFICIENT (0.5) |
| SLR LEO 800-1500 km | 1 | 55 / 5 | 0.93145 [0.57685, 1.3792] | 0.92727 [0.85455, 1.0000] | NOT REALISTIC (coverage) | yes | CALIBRATED (0.9) | CALIBRATED (0.9) | CALIBRATED (0.9) |
| SLR LEO 800-1500 km | 6 | 55 / 5 | 1.3318 [0.87100, 1.7926] | 0.90909 [0.80000, 1.0000] | NOT REALISTIC (overconfident) | yes | CALIBRATED (0.9) | CALIBRATED (0.9) | CALIBRATED (0.9) |
| SLR LEO 800-1500 km | 12 | 53 / 5 | 0.90260 [0.65106, 1.2282] | 0.98113 [0.93878, 1.0000] | NOT REALISTIC (coverage) | yes | PESSIMISTIC (0.9) | PESSIMISTIC (0.9) | PESSIMISTIC (0.9) |
| SLR LEO 800-1500 km | 24 | 50 / 5 | 0.86757 [0.52845, 1.2067] | 0.92000 [0.84000, 1.0000] | NOT REALISTIC (coverage) | yes | INSUFFICIENT (0.5) | INSUFFICIENT (0.5) | INSUFFICIENT (0.5) |
| SLR LEO 800-1500 km | 48 | 45 / 5 | 1.1643 [0.62797, 1.7551] | 0.88889 [0.75556, 1.0000] | NOT REALISTIC (coverage) | yes | INSUFFICIENT (0.5) | INSUFFICIENT (0.5) | INSUFFICIENT (0.5) |
| SLR LEO 800-1500 km | 72 | 40 / 5 | 1.3377 [0.64205, 2.1180] | 0.90000 [0.80000, 1.0000] | NOT REALISTIC (overconfident) | yes | INSUFFICIENT (0.5) | INSUFFICIENT (0.5) | INSUFFICIENT (0.5) |
| SLR MEO | 1 | 10 / 5 | 1.2510 [0.34067, 1.9823] | 0.90000 [0.70000, 1.0000] | INSUFFICIENT | — | INSUFFICIENT | INSUFFICIENT | INSUFFICIENT |
| SLR MEO | 6 | 10 / 5 | 1.3769 [0.26433, 2.4895] | 0.80000 [0.60000, 1.0000] | INSUFFICIENT | — | INSUFFICIENT | INSUFFICIENT | INSUFFICIENT |
| SLR MEO | 12 | 10 / 5 | 1.3929 [0.37782, 2.4074] | 0.90000 [0.70000, 1.0000] | INSUFFICIENT | — | INSUFFICIENT | INSUFFICIENT | INSUFFICIENT |
| SLR MEO | 24 | 6 / 5 | 0.70522 [0.18657, 1.5690] | 1.0000 [1.0000, 1.0000] | INSUFFICIENT | — | INSUFFICIENT | INSUFFICIENT | INSUFFICIENT |
| SLR MEO | 48 | 2 / 1 | 9.9749e-7 [9.9749e-7, 9.9749e-7] | 1.0000 [1.0000, 1.0000] | INSUFFICIENT | — | INSUFFICIENT | INSUFFICIENT | INSUFFICIENT |
| SLR MEO | 72 | 2 / 1 | 3.5418e-7 [3.5418e-7, 3.5418e-7] | 1.0000 [1.0000, 1.0000] | INSUFFICIENT | — | INSUFFICIENT | INSUFFICIENT | INSUFFICIENT |

## Student-t fit and level multipliers

Fitted on the training out-of-fold population (folds F3 to F8, unflagged): ν per class, c per class and horizon. A ν of 2.5 is the lowest value of the registered grid (heavier tails than any finite-variance Student-t). Multipliers scale the frozen covariance so the p-ellipsoid covers p under the fit.

| Class | ν | Pooled c | Log-lik T / Gaussian | Multiplier T (p = 0.90 / 0.95 / 0.99) at 1 h | at 72 h | Q (p = 0.90 / 0.95 / 0.99) |
| --- | ---: | ---: | --- | --- | --- | --- |
| GPS | 2.5 | 0.301 | -11753 / -97796 | 1.127 / 1.673 / 4.429 | 0.981 / 1.458 / 3.858 | 0.681 / 0.843 / 7.876 |
| LEO 400-800 km | 15 | 0.988 | -4290 / -4465 | 1.279 / 1.351 / 1.533 | 1.077 / 1.137 / 1.291 | 1.028 / 1.125 / 1.255 |
| SLR LEO 800-1500 km | 1000 | 1.032 | -2586 / -2592 | 0.974 / 0.975 / 0.976 | 1.160 / 1.160 / 1.163 | 0.978 / 1.019 / 1.094 |
| SLR MEO | 2.5 | 0.176 | -1387 / -3.70e+9 | 0.671 / 0.996 / 2.637 | 0.552 / 0.820 / 2.171 | 1.268 / 1.309 / 1.169 |

## Log score of d² on the test (unflagged)

| Class | n | Gaussian | Student-t | T - G [95 % CI] |
| --- | ---: | ---: | ---: | --- |
| GPS | 1756 | -6.199 | -1.369 | 4.830 [0.780, 13.502] |
| LEO 400-800 km | 340 | -2.001 | -2.028 | -0.027 [-0.060, 0.024] |
| SLR LEO 800-1500 km | 298 | -2.185 | -2.178 | 0.007 [-0.008, 0.029] |
| SLR MEO | 40 | -3.250 | -2.900 | 0.350 [-1.088, 1.834] |

## Other views (G, T, Q; classes, all horizons)

All samples (unflagged and flagged) and flagged samples pooled; report-only, the frozen model claims unflagged samples only.

| View | Class | Predictor | n / objects | 0.50 | 0.90 | 0.95 | 0.99 | Verdict (reach) |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- |
| all | GPS | G | 2013 / 32 | 0.847 [0.760, 0.918] wide | 0.942 [0.871, 0.993] ok | 0.944 [0.873, 0.993] ok | 0.947 [0.878, 0.995] ok | PESSIMISTIC (0.99) |
| all | GPS | T | 2013 / 32 | 0.673 [0.579, 0.760] wide | 0.939 [0.868, 0.992] ok | 0.947 [0.878, 0.995] ok | 0.959 [0.893, 0.999] ok | PESSIMISTIC (0.99) |
| all | GPS | Q | 2013 / 32 | 0.696 [0.604, 0.780] wide | 0.922 [0.847, 0.979] ok | 0.942 [0.871, 0.993] ok | 0.974 [0.927, 1.000] ok | PESSIMISTIC (0.99) |
| all | LEO 400-800 km | G | 340 / 6 | 0.462 [0.383, 0.547] ok | 0.932 [0.866, 0.982] ok | 0.959 [0.891, 0.997] ok | — | CALIBRATED (0.95) |
| all | LEO 400-800 km | T | 340 / 6 | 0.485 [0.403, 0.569] ok | 0.962 [0.894, 1.000] ok | 0.974 [0.921, 1.000] ok | — | CALIBRATED (0.95) |
| all | LEO 400-800 km | Q | 340 / 6 | 0.503 [0.409, 0.597] ok | 0.938 [0.877, 0.988] ok | 0.971 [0.912, 1.000] ok | — | CALIBRATED (0.95) |
| all | SLR LEO 800-1500 km | G | 298 / 5 | 0.540 [0.436, 0.648] ok | 0.869 [0.767, 0.973] ok | 0.923 [0.849, 0.997] ok | — | CALIBRATED (0.95) |
| all | SLR LEO 800-1500 km | T | 298 / 5 | 0.567 [0.456, 0.678] ok | 0.879 [0.773, 0.976] ok | 0.926 [0.853, 0.997] ok | — | CALIBRATED (0.95) |
| all | SLR LEO 800-1500 km | Q | 298 / 5 | 0.577 [0.457, 0.691] ok | 0.866 [0.758, 0.973] ok | 0.930 [0.862, 0.997] ok | — | CALIBRATED (0.95) |
| all | SLR MEO | G | 88 / 5 | 0.807 [0.200, 0.979] ok | 0.875 [0.371, 1.000] ok | — | — | CALIBRATED (0.9) |
| all | SLR MEO | T | 88 / 5 | 0.716 [0.000, 0.943] ok | 0.830 [0.256, 0.979] ok | — | — | CALIBRATED (0.9) |
| all | SLR MEO | Q | 88 / 5 | 0.705 [0.000, 0.938] ok | 0.955 [0.743, 1.000] ok | — | — | CALIBRATED (0.9) |
| flaggedPooled | GPS | G | 257 / 6 | 0.673 [0.312, 1.000] ok | 0.747 [0.405, 1.000] ok | 0.767 [0.429, 1.000] ok | — | CALIBRATED (0.95) |
| flaggedPooled | SLR MEO | G | 48 / 1 | — | — | — | — | INSUFFICIENT |

## d² concentration

### GPS under P-axes-mle/risk/UNFLAGGED (all arcs)

| Object | n | Fraction of total d² | Mean d²/3 | Median d²/3 | Maximum d²/3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 29601 | 60 | 0.57183 | 77.160 | 0.043466 | 586.24 |
| 68791 | 63 | 0.29826 | 38.329 | 33.415 | 94.879 |
| 43873 | 63 | 0.051101 | 6.5669 | 1.7086 | 44.042 |
| 55268 | 63 | 0.022046 | 2.8331 | 1.4812 | 25.662 |
| 41019 | 63 | 0.0048960 | 0.62918 | 0.48338 | 1.9618 |

## Truth and controls

Truth added for the rescore: COSMIC-2 near-real-time orbits (UCAR/CDAAC, doy 280 to 292 converted; later days have no Earth orientation). ILRS combined arcs end at 261010, Swarm is not published, Sentinel-1 POE ends before the window: SLR MEO stays at 40 unflagged samples and is INSUFFICIENT. The LEO 400-800 km truth is five COSMIC-2 satellites (NORAD 44349, 44350, 44351, 44353, 44358, one orbital shell) and one other object; the class result rests on that shell. LEO 400-800 km unflagged samples per horizon (1, 6, 12, 24, 48, 72 h): 63 (was 11), 63 (was 11), 61 (was 11), 57 (was 10), 51 (was 9), 45 (was 8).

Reproduction control: the cells of GPS, SLR LEO 800-1500 km, SLR MEO (all and unflagged views) and the flagged-pooled cells equal V1c5's `metrics.json` exactly.

## Integrity and limits

Run v1c5-rescore; 6 bounded single-threaded workers. Test arcs 636 (147 skipped, 2739 samples, 1077 absent horizons); 56 of 636 pairs flagged by V1c5's causal event rule. The fits were pushed before the test was read (`fitsFreeze` in the manifest).

The test window was already scored by V1c5, so it is not unseen for the form of T and Q; they are fitted on training folds only. One object is scored against truth: a conjunction also needs the other object. A CALIBRATED level means the bootstrap interval contains p, which with 5 or 6 objects is weak evidence; read it with the interval. About one level in twenty misses by chance, uncorrected.

E2E: `node experiments/v1c5-rescore/run.mjs --check`.
