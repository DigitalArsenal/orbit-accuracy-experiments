Report only. On the refit's held-out windows, flown on 0.6.1: beyond 2 sigma 1.21 % to 15.93 % per axis at days 1, 3 and 7 against 4.55 % (heavier 5, lighter 1, not decidable 12 of 18); beyond 3 sigma 0.00 % to 4.25 % against 0.27 % (heavier 5, lighter 0, not decidable 13). Per axis the factor on sigma that would make each share nominal is: median 0.477 to 1.35, 2 sigma 0.790 to 1.45, 3 sigma 0.769 to 1.82 (cells within a factor of two: 17, 18, 18 of 18). The joint figure is worse: Mahalanobis beyond the 5 % chi-square 3 quantile 5.67 % to 48.65 % and beyond the 0.27 % quantile 1.54 % to 33.69 %, the whole covariance needing a factor of 1.52, 1.39 and 9.94 at days 1, 3 and 7 in strong drag for the 0.27 % share. Median band: 8 of 18 pooled; 7 on Swarm alone, 6 on GRACE-FO alone; 11 with Swarm reduced to one independent group, 3 of the 3 cells it changes being cross-track cells where the two groups lie on opposite sides of the band: that is averaging, not calibration.

# AP covariance tails (PLAN.md)

Rows: propagator/sdn-ap 0.6.1, wasm 05dd4a6600fb4c65d5841e1f49dc26df64fca7c14f1084644cafcfa875fe0a87 (primary, the coverage study's windows re-flown with the full RIC block); propagator/sdn-ap 0.6.0, wasm 0b5280f05176fc755dbfb859fd8028fc495759d7537024c53043f498c91faa63, re-weighted to the refit's row (control). Nothing flown here. That 0.6.3 and 0.6.4 have the same covariance is the site's statement, not tested here. z = forward error component / propagated 1-sigma. Both arms pooled, as the refit. n counts arm-samples: two arms of each daily window, so n far overstates the information; n_eff is the cluster-robust effective n (independent group x 7-day cutoff block), and the groups are Swarm A+C, Swarm B and GRACE-FO in strong drag, Sentinel-1 near 700 km. Intervals are 95 %: B-sat over satellites (exact), B-hier over groups then weeks (decision interval). Few clusters make all of them coarse; a percentile interval over 3 groups does not have its nominal coverage.

## Tail shares per axis and lead (0.6.1, held-out)

| Regime | Lead | Axis | n | Median \|z\| | >2 sigma | B-sat | B-hier | n_eff | Reading | >3 sigma | B-sat | B-hier | n_eff | Calibrated count at n_eff | Reading |
|---|---|---|---:|---:|---:|---|---|---:|---|---:|---|---|---:|---:|---|
| Strong drag, 2025 | 1 h | R | 1036 | 0.650 | 0.00 % | [0.00, 0.00 %] | [0.00, 0.00 %] | undefined | not decidable | 0.00 % | [0.00, 0.00 %] | [0.00, 0.00 %] | undefined | undefined | not decidable |
| Strong drag, 2025 | 1 h | I | 1036 | 0.659 | 6.66 % | [3.58, 8.70 %] | [1.37, 10.58 %] | 315 | not decidable | 0.48 % | [0.18, 0.89 %] | [0.00, 1.24 %] | 605 | 1.63 (too few to resolve) | not decidable |
| Strong drag, 2025 | 1 h | C | 1036 | 0.618 | 4.44 % | [2.41, 6.71 %] | [1.91, 8.71 %] | 357 | not decidable | 0.58 % | [0.00, 1.61 %] | [0.00, 2.73 %] | 305 | 0.823 (too few to resolve) | not decidable |
| Strong drag, 2025 | 6 h | R | 1036 | 0.640 | 0.10 % | [0.00, 0.27 %] | [0.00, 0.34 %] | 1,046 | lighter | 0.00 % | [0.00, 0.00 %] | [0.00, 0.00 %] | undefined | undefined | not decidable |
| Strong drag, 2025 | 6 h | I | 1036 | 0.360 | 2.99 % | [1.36, 4.38 %] | [0.41, 5.12 %] | 462 | not decidable | 0.48 % | [0.00, 0.98 %] | [0.00, 1.18 %] | 811 | 2.19 (too few to resolve) | not decidable |
| Strong drag, 2025 | 6 h | C | 1036 | 0.690 | 6.37 % | [2.29, 11.09 %] | [1.39, 14.29 %] | 294 | not decidable | 1.93 % | [0.34, 3.83 %] | [0.00, 5.28 %] | 368 | 0.994 (too few to resolve) | not decidable |
| Strong drag, 2025 | 12 h | R | 1036 | 0.587 | 2.22 % | [1.95, 2.59 %] | [0.96, 3.56 %] | 493 | lighter | 0.10 % | [0.00, 0.27 %] | [0.00, 0.34 %] | 1,046 | 2.82 (too few to resolve) | not decidable |
| Strong drag, 2025 | 12 h | I | 1036 | 0.370 | 3.47 % | [1.26, 5.37 %] | [0.56, 6.27 %] | 384 | not decidable | 1.06 % | [0.21, 1.79 %] | [0.00, 2.31 %] | 475 | 1.28 (too few to resolve) | not decidable |
| Strong drag, 2025 | 12 h | C | 1036 | 0.825 | 10.42 % | [5.05, 15.21 %] | [3.09, 18.74 %] | 244 | not decidable | 2.51 % | [0.69, 4.29 %] | [0.00, 5.87 %] | 413 | 1.11 (too few to resolve) | not decidable |
| Strong drag, 2025 | day 1 | R | 1036 | 0.635 | 3.86 % | [0.84, 6.44 %] | [0.39, 7.53 %] | 340 | not decidable | 0.48 % | [0.00, 0.98 %] | [0.00, 1.36 %] | 413 | 1.11 (too few to resolve) | not decidable |
| Strong drag, 2025 | day 1 | I | 1036 | 0.468 | 5.12 % | [2.83, 7.07 %] | [1.63, 8.35 %] | 298 | not decidable | 1.83 % | [1.16, 2.41 %] | [0.43, 3.24 %] | 372 | 1.00 (too few to resolve) | heavier |
| Strong drag, 2025 | day 1 | C | 1036 | 0.781 | 10.91 % | [7.45, 14.40 %] | [6.38, 16.91 %] | 372 | heavier | 0.58 % | [0.11, 0.98 %] | [0.00, 1.46 %] | 453 | 1.22 (too few to resolve) | not decidable |
| Strong drag, 2025 | day 2 | R | 1036 | 0.709 | 7.14 % | [4.13, 9.33 %] | [2.82, 10.76 %] | 392 | not decidable | 0.77 % | [0.23, 1.17 %] | [0.00, 1.81 %] | 437 | 1.18 (too few to resolve) | not decidable |
| Strong drag, 2025 | day 2 | I | 1036 | 0.591 | 7.24 % | [5.03, 9.12 %] | [3.45, 10.30 %] | 400 | not decidable | 1.74 % | [1.35, 2.18 %] | [0.56, 3.00 %] | 433 | 1.17 (too few to resolve) | heavier |
| Strong drag, 2025 | day 2 | C | 1036 | 0.897 | 9.07 % | [6.08, 11.25 %] | [4.04, 13.57 %] | 266 | not decidable | 0.39 % | [0.00, 0.72 %] | [0.00, 1.20 %] | 417 | 1.13 (too few to resolve) | not decidable |
| Strong drag, 2025 | day 3 | R | 1036 | 0.745 | 12.26 % | [10.55, 13.77 %] | [8.59, 16.09 %] | 318 | heavier | 4.05 % | [1.49, 6.35 %] | [0.57, 7.75 %] | 246 | 0.664 (too few to resolve) | heavier |
| Strong drag, 2025 | day 3 | I | 1036 | 0.679 | 9.94 % | [8.48, 11.25 %] | [6.33, 13.19 %] | 337 | heavier | 1.93 % | [1.54, 2.33 %] | [0.64, 3.59 %] | 363 | 0.980 (too few to resolve) | heavier |
| Strong drag, 2025 | day 3 | C | 1036 | 0.874 | 6.27 % | [4.36, 8.14 %] | [3.25, 10.48 %] | 313 | not decidable | 0.10 % | [0.00, 0.27 %] | [0.00, 0.34 %] | 1,046 | 2.82 (too few to resolve) | not decidable |
| Strong drag, 2025 | day 5 | R | 1036 | 0.801 | 15.25 % | [10.89, 18.42 %] | [8.49, 21.40 %] | 236 | heavier | 5.50 % | [2.64, 7.58 %] | [1.28, 9.21 %] | 349 | 0.941 (too few to resolve) | heavier |
| Strong drag, 2025 | day 5 | I | 1036 | 0.804 | 11.97 % | [10.48, 13.15 %] | [8.20, 15.77 %] | 294 | heavier | 2.32 % | [1.57, 2.95 %] | [0.97, 4.11 %] | 401 | 1.08 (too few to resolve) | heavier |
| Strong drag, 2025 | day 5 | C | 1036 | 0.737 | 4.63 % | [2.86, 6.71 %] | [1.85, 9.25 %] | 253 | not decidable | 0.00 % | [0.00, 0.00 %] | [0.00, 0.00 %] | undefined | undefined | not decidable |
| Strong drag, 2025 | day 7 (167 h) | R | 1036 | 0.754 | 9.36 % | [6.37, 14.49 %] | [5.26, 17.96 %] | 466 | heavier | 4.25 % | [2.41, 7.25 %] | [1.73, 9.37 %] | 404 | 1.09 (too few to resolve) | heavier |
| Strong drag, 2025 | day 7 (167 h) | I | 1036 | 0.910 | 15.93 % | [14.11, 18.43 %] | [11.18, 21.67 %] | 254 | heavier | 1.74 % | [0.54, 3.22 %] | [0.55, 4.24 %] | 669 | 1.81 (too few to resolve) | heavier |
| Strong drag, 2025 | day 7 (167 h) | C | 1036 | 0.794 | 3.28 % | [0.46, 6.67 %] | [0.00, 8.84 %] | 337 | not decidable | 0.00 % | [0.00, 0.00 %] | [0.00, 0.00 %] | undefined | undefined | not decidable |
| Near 700 km, 2026 | 1 h | R | 235 | 0.452 | 0.85 % | [0.06, 1.59 %] | [0.00, 2.56 %] | 121 | lighter | 0.00 % | [0.00, 0.00 %] | [0.00, 0.00 %] | undefined | undefined | not decidable |
| Near 700 km, 2026 | 1 h | I | 235 | 0.633 | 11.49 % | [9.79, 13.09 %] | [8.40, 15.67 %] | 246 | heavier | 2.98 % | [1.85, 4.05 %] | [0.00, 6.32 %] | 98 | 0.264 (too few to resolve) | not decidable |
| Near 700 km, 2026 | 1 h | C | 235 | 0.459 | 1.28 % | [0.10, 2.39 %] | [0.00, 2.74 %] | 266 | lighter | 0.43 % | [0.03, 0.80 %] | [0.00, 1.27 %] | 241 | 0.651 (too few to resolve) | not decidable |
| Near 700 km, 2026 | 6 h | R | 237 | 0.562 | 0.42 % | [0.03, 0.80 %] | [0.00, 1.28 %] | 245 | lighter | 0.00 % | [0.00, 0.00 %] | [0.00, 0.00 %] | undefined | undefined | not decidable |
| Near 700 km, 2026 | 6 h | I | 237 | 0.273 | 8.02 % | [5.39, 10.54 %] | [4.29, 12.39 %] | 164 | not decidable | 0.84 % | [0.06, 1.59 %] | [0.00, 2.56 %] | 122 | 0.329 (too few to resolve) | not decidable |
| Near 700 km, 2026 | 6 h | C | 237 | 0.701 | 1.27 % | [0.09, 2.39 %] | [0.00, 2.78 %] | 261 | lighter | 0.42 % | [0.03, 0.80 %] | [0.00, 1.27 %] | 242 | 0.654 (too few to resolve) | not decidable |
| Near 700 km, 2026 | 12 h | R | 237 | 0.680 | 0.00 % | [0.00, 0.00 %] | [0.00, 0.00 %] | undefined | not decidable | 0.00 % | [0.00, 0.00 %] | [0.00, 0.00 %] | undefined | undefined | not decidable |
| Near 700 km, 2026 | 12 h | I | 237 | 0.350 | 6.33 % | [3.56, 9.17 %] | [2.94, 10.76 %] | 140 | not decidable | 0.00 % | [0.00, 0.00 %] | [0.00, 0.00 %] | undefined | undefined | not decidable |
| Near 700 km, 2026 | 12 h | C | 237 | 0.551 | 2.95 % | [0.22, 5.76 %] | [1.15, 5.00 %] | 245 | not decidable | 1.69 % | [0.13, 3.29 %] | [0.38, 3.46 %] | 211 | 0.569 (too few to resolve) | heavier |
| Near 700 km, 2026 | day 1 | R | 247 | 0.638 | 1.21 % | [0.09, 2.35 %] | [0.00, 3.00 %] | 170 | lighter | 0.40 % | [0.03, 0.78 %] | [0.00, 1.23 %] | 253 | 0.682 (too few to resolve) | not decidable |
| Near 700 km, 2026 | day 1 | I | 247 | 0.322 | 5.67 % | [4.15, 7.19 %] | [1.49, 10.73 %] | 87 | not decidable | 0.81 % | [0.06, 1.55 %] | [0.00, 2.47 %] | 124 | 0.333 (too few to resolve) | not decidable |
| Near 700 km, 2026 | day 1 | C | 247 | 0.660 | 6.48 % | [0.49, 12.52 %] | [3.35, 10.09 %] | 193 | not decidable | 2.83 % | [0.21, 5.48 %] | [0.00, 5.81 %] | 125 | 0.337 (too few to resolve) | not decidable |
| Near 700 km, 2026 | day 2 | R | 247 | 0.679 | 2.83 % | [1.70, 3.97 %] | [0.75, 5.45 %] | 159 | not decidable | 0.81 % | [0.06, 1.56 %] | [0.00, 2.46 %] | 126 | 0.340 (too few to resolve) | not decidable |
| Near 700 km, 2026 | day 2 | I | 247 | 0.442 | 5.26 % | [4.12, 6.41 %] | [1.49, 9.73 %] | 99 | not decidable | 1.62 % | [0.87, 2.36 %] | [0.00, 3.88 %] | 141 | 0.380 (too few to resolve) | not decidable |
| Near 700 km, 2026 | day 2 | C | 247 | 0.658 | 4.05 % | [0.30, 7.82 %] | [0.00, 9.24 %] | 65 | not decidable | 1.21 % | [0.09, 2.35 %] | [0.00, 3.67 %] | 83 | 0.223 (too few to resolve) | not decidable |
| Near 700 km, 2026 | day 3 | R | 247 | 0.638 | 3.24 % | [0.99, 5.51 %] | [1.17, 5.60 %] | 208 | not decidable | 0.40 % | [0.03, 0.78 %] | [0.00, 1.23 %] | 253 | 0.682 (too few to resolve) | not decidable |
| Near 700 km, 2026 | day 3 | I | 247 | 0.487 | 5.67 % | [4.90, 6.44 %] | [1.55, 10.42 %] | 89 | not decidable | 1.21 % | [0.84, 1.58 %] | [0.00, 3.00 %] | 165 | 0.446 (too few to resolve) | not decidable |
| Near 700 km, 2026 | day 3 | C | 247 | 0.560 | 3.64 % | [0.27, 7.04 %] | [0.00, 9.58 %] | 43 | not decidable | 2.02 % | [0.15, 3.91 %] | [0.00, 6.12 %] | 49 | 0.133 (too few to resolve) | not decidable |
| Near 700 km, 2026 | day 5 | R | 247 | 1.01 | 11.74 % | [9.15, 14.31 %] | [7.38, 15.94 %] | 199 | heavier | 0.00 % | [0.00, 0.00 %] | [0.00, 0.00 %] | undefined | undefined | not decidable |
| Near 700 km, 2026 | day 5 | I | 247 | 0.644 | 7.69 % | [7.29, 8.10 %] | [1.68, 14.74 %] | 56 | not decidable | 2.43 % | [1.69, 3.17 %] | [0.00, 5.81 %] | 93 | 0.251 (too few to resolve) | not decidable |
| Near 700 km, 2026 | day 5 | C | 247 | 0.450 | 4.45 % | [0.33, 8.61 %] | [0.00, 10.59 %] | 46 | not decidable | 0.00 % | [0.00, 0.00 %] | [0.00, 0.00 %] | undefined | undefined | not decidable |
| Near 700 km, 2026 | day 7 (167 h) | R | 249 | 0.852 | 6.43 % | [5.66, 7.20 %] | [3.35, 9.40 %] | 225 | not decidable | 0.00 % | [0.00, 0.00 %] | [0.00, 0.00 %] | undefined | undefined | not decidable |
| Near 700 km, 2026 | day 7 (167 h) | I | 249 | 0.674 | 10.44 % | [9.73, 11.14 %] | [2.41, 20.08 %] | 41 | not decidable | 3.21 % | [2.48, 3.94 %] | [0.00, 7.61 %] | 71 | 0.191 (too few to resolve) | not decidable |
| Near 700 km, 2026 | day 7 (167 h) | C | 249 | 0.380 | 3.61 % | [0.27, 6.93 %] | [0.78, 7.11 %] | 118 | not decidable | 0.00 % | [0.00, 0.00 %] | [0.00, 0.00 %] | undefined | undefined | not decidable |

Gaussian: 4.55 % and 0.27 %. Reading: "heavier" if B-hier's lower bound exceeds the reference; "lighter" if its upper bound is below it and a calibrated covariance would expect at least 5 hits at n_eff (amendment 1; 14 registered "lighter" readings in this study's main grid moved to "not decidable"); otherwise "not decidable". "Too few to resolve": a calibrated covariance would expect under 5 hits at n_eff, so a share at or below 0.27 % cannot be confirmed, while a large excess can still be seen. n_eff is an estimate and is unstable for rare events; above n means no cluster effect could be detected.

## Mahalanobis against chi-square 3 (full RIC position block)

| Regime | Lead | n | Mean d2/3 | Median d2 | KS | >7.815 (5 %) | B-hier | Reading | >11.345 (1 %) | B-hier | Reading | >14.156 (0.27 %) | B-hier | Reading | n_eff (5 %) | Whole-covariance factor, 5 % | 0.27 % |
|---|---|---:|---:|---:|---:|---:|---|---|---:|---|---|---:|---|---|---:|---:|---:|
| Strong drag, 2025 | 1 h | 1036 | 0.920 | 2.03 | 0.0722 | 3.86 % | [2.34, 5.85 %] | not decidable | 1.06 % | [0.31, 2.27 %] | not decidable | 0.58 % | [0.00, 1.79 %] | not decidable | 604 | 0.984  | 1.02  |
| Strong drag, 2025 | 6 h | 1036 | 0.834 | 1.72 | 0.152 | 4.15 % | [1.26, 7.85 %] | not decidable | 1.45 % | [0.00, 3.10 %] | not decidable | 0.87 % | [0.00, 2.16 %] | not decidable | 492 | 0.947  | 1.19  |
| Strong drag, 2025 | 12 h | 1036 | 0.985 | 2.00 | 0.0980 | 7.72 % | [2.92, 12.36 %] | not decidable | 3.28 % | [1.05, 5.50 %] | heavier | 1.35 % | [0.00, 2.96 %] | not decidable | 352 | 1.07  | 1.15  |
| Strong drag, 2025 | day 1 | 1036 | 1.09 | 2.20 | 0.0649 | 7.14 % | [3.27, 10.02 %] | not decidable | 3.19 % | [1.43, 4.96 %] | heavier | 1.54 % | [0.46, 3.24 %] | heavier | 423 | 1.08 [0.897, 1.19] | 1.52 [1.07, 1.90] |
| Strong drag, 2025 | day 2 | 1036 | 1.26 | 2.76 | 0.0882 | 9.94 % | [4.61, 13.91 %] | not decidable | 2.51 % | [0.69, 4.15 %] | not decidable | 1.93 % | [0.56, 3.29 %] | heavier | 562 | 1.10  | 1.54  |
| Strong drag, 2025 | day 3 | 1036 | 1.56 | 3.22 | 0.164 | 13.22 % | [7.33, 18.09 %] | heavier | 5.69 % | [1.57, 9.73 %] | heavier | 2.70 % | [0.60, 4.83 %] | heavier | 337 | 1.23 [1.05, 1.33] | 1.39 [1.05, 4.72] |
| Strong drag, 2025 | day 5 | 1036 | 4.55 | 4.62 | 0.300 | 28.76 % | [12.61, 42.06 %] | heavier | 18.15 % | [5.73, 29.48 %] | heavier | 13.71 % | [4.50, 22.30 %] | heavier | 177 | 2.01  | 3.48  |
| Strong drag, 2025 | day 7 (167 h) | 1036 | 43.5 | 7.50 | 0.459 | 48.65 % | [30.33, 63.44 %] | heavier | 37.36 % | [17.83, 54.30 %] | heavier | 33.69 % | [15.04, 50.26 %] | heavier | 174 | 5.71 [2.06, 7.60] | 9.94 [2.73, 70.7] |
| Near 700 km, 2026 | 1 h | 235 | 1.25 | 1.51 | 0.217 | 4.68 % | [1.40, 8.23 %] | not decidable | 2.98 % | [0.00, 6.32 %] | not decidable | 2.98 % | [0.00, 6.32 %] | not decidable | 129 | 0.985  | 2.39  |
| Near 700 km, 2026 | 6 h | 237 | 1.08 | 2.46 | 0.0580 | 5.06 % | [2.25, 9.18 %] | not decidable | 1.27 % | [0.00, 3.00 %] | not decidable | 1.27 % | [0.00, 3.00 %] | not decidable | 145 | 0.997  | 1.28  |
| Near 700 km, 2026 | 12 h | 237 | 0.960 | 2.04 | 0.0980 | 5.49 % | [2.64, 9.43 %] | not decidable | 2.11 % | [0.44, 3.95 %] | not decidable | 0.84 % | [0.00, 1.99 %] | not decidable | 168 | 1.00  | 1.52  |
| Near 700 km, 2026 | day 1 | 247 | 1.02 | 1.82 | 0.124 | 8.91 % | [4.28, 13.69 %] | not decidable | 4.05 % | [1.48, 6.80 %] | heavier | 3.24 % | [0.78, 6.11 %] | heavier | 119 | 1.15 [0.902, 1.41] | 1.33 [1.08, 1.44] |
| Near 700 km, 2026 | day 2 | 247 | 0.959 | 1.90 | 0.142 | 6.88 % | [2.51, 12.29 %] | not decidable | 3.24 % | [0.75, 6.49 %] | not decidable | 2.02 % | [0.00, 4.49 %] | not decidable | 89 | 1.12  | 1.33  |
| Near 700 km, 2026 | day 3 | 247 | 0.968 | 2.19 | 0.0884 | 5.67 % | [1.20, 12.19 %] | not decidable | 1.62 % | [0.00, 4.15 %] | not decidable | 1.62 % | [0.00, 4.15 %] | not decidable | 54 | 1.03 [0.849, 1.19] | 1.33 [0.808, 1.35] |
| Near 700 km, 2026 | day 5 | 247 | 1.14 | 2.49 | 0.0920 | 7.69 % | [0.97, 15.32 %] | not decidable | 2.43 % | [0.00, 5.99 %] | not decidable | 1.21 % | [0.00, 3.00 %] | not decidable | 47 | 1.04  | 1.12  |
| Near 700 km, 2026 | day 7 (167 h) | 249 | 1.06 | 2.16 | 0.0771 | 7.23 % | [0.00, 15.52 %] | not decidable | 3.21 % | [0.00, 7.69 %] | not decidable | 2.01 % | [0.00, 4.69 %] | not decidable | 39 | 1.09 [0.908, 1.33] | 1.21 [0.738, 1.25] |

Chi-square 3 median 2.366, mean d2/3 = 1. Blocks not positive definite: 0. The module's own d2 in the row against this 3 x 3 d2: max relative difference 2.35e-14 over 16570 samples. Whole-covariance factor: post-read, amendment 1.

## Why the joint and the axes disagree (post-read, amendment 1; explanation only)

Each axis can sit near nominal while d2 fails, because d2 also tests the correlation. In strong drag the block's R-I correlation grows with lead, so given the in-track error the block allows little radial error; the sigma_R given I column is what it allows and the residual column is what occurs. The quadratic term is the fit of e_R on e_I^2. At days 5 and 7 in strong drag, where the in-track errors are large enough to measure it, it matches -1 / (2r): the orbit's curvature is in e_R, as straight axes require. At short leads the term is noise. Removing that curvature from e_R makes d2 worse, not better, so curvature does not explain the miss; the cause is not settled here. r is a nominal radius, a size estimate only.

| Regime | Lead | d2 >7.815 | Sum z^2 >7.815 | d2 >14.156 | Sum z^2 >14.156 | d2 >7.815, curvature removed | rho(R, I) | 1 - rho^2, p10, median | sigma_R, km | sigma_I, km | sigma_R given I, km | Radial residual, km | Residual / sigma | e_I^2 / 2r, median, p90, km | Quadratic term, 1/km (expected) |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---|---|
| Strong drag, 2025 | 1 h | 3.86 % | 4.44 % | 0.58 % | 0.39 % | 3.86 % | -0.0159 | 0.994, 0.998 | 0.0178 | 0.0381 | 0.0178 | 0.0114 | 0.640 | 4.75e-8, 3.37e-7 | -0.0177 (-0.0000727) |
| Strong drag, 2025 | 6 h | 4.15 % | 4.15 % | 0.87 % | 0.97 % | 4.15 % | -0.0215 | 0.997, 1.00 | 0.0179 | 0.134 | 0.0179 | 0.0116 | 0.652 | 1.75e-7, 0.00000148 | -0.00600 (-0.0000727) |
| Strong drag, 2025 | 12 h | 7.72 % | 7.92 % | 1.35 % | 1.54 % | 7.72 % | -0.0585 | 0.977, 0.997 | 0.0181 | 0.274 | 0.0181 | 0.0105 | 0.582 | 7.83e-7, 0.00000782 | 0.000844 (-0.0000727) |
| Strong drag, 2025 | day 1 | 7.14 % | 8.30 % | 1.54 % | 2.12 % | 7.05 % | -0.182 | 0.839, 0.967 | 0.0188 | 0.641 | 0.0184 | 0.0114 | 0.614 | 0.00000685, 0.0000759 | 0.000153 (-0.0000727) |
| Strong drag, 2025 | day 2 | 9.94 % | 11.10 % | 1.93 % | 2.12 % | 10.42 % | -0.440 | 0.514, 0.806 | 0.0211 | 1.86 | 0.0190 | 0.0140 | 0.734 | 0.0000987, 0.00111 | -0.000123 (-0.0000727) |
| Strong drag, 2025 | day 3 | 13.22 % | 13.03 % | 2.70 % | 5.31 % | 13.90 % | -0.583 | 0.283, 0.660 | 0.0242 | 3.82 | 0.0197 | 0.0169 | 0.845 | 0.000530, 0.00640 | -0.0000447 (-0.0000727) |
| Strong drag, 2025 | day 5 | 28.76 % | 16.60 % | 13.71 % | 6.66 % | 35.81 % | -0.682 | 0.0722, 0.431 | 0.0321 | 10.1 | 0.0207 | 0.0291 | 1.40 | 0.00511, 0.0469 | -0.0000710 (-0.0000727) |
| Strong drag, 2025 | day 7 (167 h) | 48.65 % | 16.02 % | 33.69 % | 3.86 % | 61.78 % | -0.603 | 0.0105, 0.145 | 0.0588 | 19.2 | 0.0218 | 0.0501 | 2.24 | 0.0218, 0.188 | -0.0000698 (-0.0000727) |
| Near 700 km, 2026 | 1 h | 4.68 % | 4.25 % | 2.98 % | 2.98 % | 4.68 % | -0.00428 | 0.995, 1.00 | 0.0137 | 0.0318 | 0.0137 | 0.00625 | 0.434 | 3.36e-8, 0.00000232 | 0.0472 (-0.0000707) |
| Near 700 km, 2026 | 6 h | 5.06 % | 4.64 % | 1.27 % | 1.27 % | 5.06 % | -0.00260 | 0.999, 1.00 | 0.0137 | 0.128 | 0.0137 | 0.00746 | 0.547 | 9.14e-8, 0.00000524 | 0.0219 (-0.0000707) |
| Near 700 km, 2026 | 12 h | 5.49 % | 5.49 % | 0.84 % | 1.27 % | 5.49 % | -0.00101 | 0.999, 1.00 | 0.0138 | 0.251 | 0.0138 | 0.00963 | 0.686 | 5.57e-7, 0.0000104 | 0.0186 (-0.0000707) |
| Near 700 km, 2026 | day 1 | 8.91 % | 9.31 % | 3.24 % | 3.64 % | 8.91 % | -0.00197 | 0.997, 0.999 | 0.0138 | 0.499 | 0.0138 | 0.00897 | 0.645 | 0.00000182, 0.0000454 | 0.00428 (-0.0000707) |
| Near 700 km, 2026 | day 2 | 6.88 % | 6.07 % | 2.02 % | 2.02 % | 6.88 % | -0.00999 | 0.991, 0.997 | 0.0142 | 0.997 | 0.0142 | 0.00919 | 0.658 | 0.0000146, 0.000159 | 0.000403 (-0.0000707) |
| Near 700 km, 2026 | day 3 | 5.67 % | 6.07 % | 1.62 % | 1.62 % | 5.67 % | -0.0141 | 0.981, 0.994 | 0.0148 | 1.50 | 0.0147 | 0.00975 | 0.632 | 0.0000376, 0.000390 | 0.000441 (-0.0000707) |
| Near 700 km, 2026 | day 5 | 7.69 % | 8.50 % | 1.21 % | 2.43 % | 7.69 % | -0.0333 | 0.949, 0.986 | 0.0162 | 2.50 | 0.0159 | 0.0146 | 0.913 | 0.000183, 0.00137 | -0.000216 (-0.0000707) |
| Near 700 km, 2026 | day 7 (167 h) | 7.23 % | 8.03 % | 2.01 % | 2.41 % | 8.03 % | -0.0547 | 0.899, 0.977 | 0.0182 | 3.49 | 0.0175 | 0.0139 | 0.774 | 0.000393, 0.00368 | -0.0000683 (-0.0000707) |

The R-C plane alone, against chi-square 2. Whether the joint miss is confined to the R-I plane; no statement about collision probability follows from it.

| Regime | Lead | >5.991 (5 %) | B-hier | Reading | >11.83 (0.27 %) | B-hier | Reading |
|---|---|---:|---|---|---:|---|---|
| Strong drag, 2025 | 1 h | 3.09 % | [1.01, 6.50 %] | not decidable | 0.39 % | [0.00, 1.70 %] | not decidable |
| Strong drag, 2025 | 6 h | 4.83 % | [1.35, 10.14 %] | not decidable | 0.87 % | [0.00, 2.10 %] | not decidable |
| Strong drag, 2025 | 12 h | 8.69 % | [2.58, 14.75 %] | not decidable | 1.16 % | [0.00, 2.64 %] | not decidable |
| Strong drag, 2025 | day 1 | 8.69 % | [4.13, 12.37 %] | not decidable | 0.97 % | [0.00, 3.26 %] | not decidable |
| Strong drag, 2025 | day 2 | 10.52 % | [4.41, 14.85 %] | not decidable | 0.39 % | [0.00, 1.12 %] | not decidable |
| Strong drag, 2025 | day 3 | 12.74 % | [7.82, 17.98 %] | heavier | 2.32 % | [0.00, 4.56 %] | not decidable |
| Strong drag, 2025 | day 5 | 13.32 % | [6.76, 19.03 %] | heavier | 5.02 % | [0.82, 8.98 %] | heavier |
| Strong drag, 2025 | day 7 (167 h) | 9.85 % | [4.03, 21.82 %] | not decidable | 3.19 % | [1.37, 6.65 %] | heavier |
| Near 700 km, 2026 | 1 h | 1.70 % | [0.00, 3.49 %] | lighter | 0.43 % | [0.00, 1.29 %] | not decidable |
| Near 700 km, 2026 | 6 h | 2.11 % | [0.00, 4.66 %] | lighter | 0.42 % | [0.00, 1.29 %] | not decidable |
| Near 700 km, 2026 | 12 h | 3.38 % | [1.59, 5.17 %] | not decidable | 1.27 % | [0.00, 3.06 %] | not decidable |
| Near 700 km, 2026 | day 1 | 6.07 % | [3.01, 9.66 %] | not decidable | 2.43 % | [0.74, 4.90 %] | heavier |
| Near 700 km, 2026 | day 2 | 4.45 % | [0.86, 8.64 %] | not decidable | 2.02 % | [0.00, 4.62 %] | not decidable |
| Near 700 km, 2026 | day 3 | 4.86 % | [0.81, 10.70 %] | not decidable | 1.21 % | [0.00, 3.73 %] | not decidable |
| Near 700 km, 2026 | day 5 | 8.10 % | [1.12, 17.58 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| Near 700 km, 2026 | day 7 (167 h) | 3.21 % | [0.84, 6.41 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |

## "Within about a factor of two": the factor on sigma per cell

k0 = median |z| / 0.6745; k2 = 95.45th percentile / 2; k3 = 99.73rd percentile / 3. k > 1: the covariance is too narrow by that factor at that level; k < 1: too wide. The claim holds in the tails on a cell if k lies in [0.5, 2].

| Regime | Lead | Axis | k0 | B-hier | k2 | B-hier | k3 | B-hier |
|---|---|---|---:|---|---:|---|---:|---|
| Strong drag, 2025 | day 1 | R | 0.941 | [0.814, 1.03] | 0.974 | [0.800, 1.13] | 1.05 | [0.672, 1.17] |
| Strong drag, 2025 | day 1 | I | 0.694 | [0.549, 0.817] | 1.02 | [0.716, 1.17] | 1.82 | [1.07, 2.16] |
| Strong drag, 2025 | day 1 | C | 1.16 | [0.844, 1.48] | 1.19 | [1.08, 1.34] | 1.08 | [0.942, 1.48] |
| Strong drag, 2025 | day 3 | R | 1.10 | [0.934, 1.23] | 1.44 | [1.19, 1.66] | 1.31 | [1.06, 1.47] |
| Strong drag, 2025 | day 3 | I | 1.01 | [0.886, 1.19] | 1.23 | [1.05, 1.38] | 1.53 | [1.16, 1.70] |
| Strong drag, 2025 | day 3 | C | 1.30 | [0.816, 1.79] | 1.07 | [0.887, 1.23] | 0.963 | [0.817, 1.01] |
| Strong drag, 2025 | day 7 (167 h) | R | 1.12 | [0.923, 1.62] | 1.45 | [1.05, 1.94] | 1.81 | [1.24, 2.48] |
| Strong drag, 2025 | day 7 (167 h) | I | 1.35 | [1.20, 1.59] | 1.29 | [1.20, 1.48] | 1.28 | [1.07, 1.46] |
| Strong drag, 2025 | day 7 (167 h) | C | 1.18 | [0.645, 1.76] | 0.937 | [0.662, 1.05] | 0.802 | [0.528, 0.822] |
| Near 700 km, 2026 | day 1 | R | 0.946 | [0.766, 1.05] | 0.790 | [0.747, 0.823] | 0.974 | [0.559, 1.06] |
| Near 700 km, 2026 | day 1 | I | 0.477 | [0.371, 0.581] | 1.09 | [0.797, 1.39] | 1.20 | [0.834, 1.31] |
| Near 700 km, 2026 | day 1 | C | 0.979 | [0.889, 1.12] | 1.20 | [0.917, 1.71] | 1.38 | [0.989, 1.47] |
| Near 700 km, 2026 | day 3 | R | 0.946 | [0.860, 1.09] | 0.938 | [0.904, 1.13] | 0.901 | [0.690, 1.06] |
| Near 700 km, 2026 | day 3 | I | 0.723 | [0.628, 0.945] | 1.02 | [0.732, 1.37] | 1.15 | [0.726, 1.26] |
| Near 700 km, 2026 | day 3 | C | 0.830 | [0.746, 0.953] | 0.862 | [0.659, 1.65] | 1.49 | [0.554, 1.53] |
| Near 700 km, 2026 | day 7 (167 h) | R | 1.26 | [1.03, 1.42] | 1.02 | [0.967, 1.13] | 0.829 | [0.732, 0.849] |
| Near 700 km, 2026 | day 7 (167 h) | I | 1.00 | [0.839, 1.32] | 1.33 | [0.881, 1.68] | 1.51 | [0.827, 1.57] |
| Near 700 km, 2026 | day 7 (167 h) | C | 0.564 | [0.507, 0.625] | 0.911 | [0.448, 1.04] | 0.769 | [0.701, 0.772] |

## How much of the verdict is Swarm

Strong-drag held-out windows: Swarm 360 of 518 (69.50 %), of which the dependent pair A and C 240. Strong-drag training: Swarm 396 of 396: the refit's strong-drag half of the loss saw no GRACE-FO. Strong drag is 9 of the 18 band cells; near 700 km, 2 satellites in 1 group, is the other 9.

| Reading of strong drag | Strong-drag cells inside the band (of 9) | Of 18 with near 700 km |
|---|---:|---:|
| All, as the refit pooled | 4 | 8 |
| Swarm only | 3 | 7 |
| GRACE-FO only | 2 | 6 |
| All, cutoffs from 2025-10-04 | 6 | 10 |
| Swarm, cutoffs from 2025-10-04 | 3 | 7 |
| GRACE-FO, cutoffs from 2025-10-04 | 2 | 6 |
| Swarm as one independent group (the reduced verdict) | 7 | 11 |
| Groups A+C, B, GRACE-FO equal | 3 | 7 |

Cells that flip between pooled and reduced: day 1 C, 0.781 to 0.706 (Swarm 0.884, GRACE-FO 0.560); day 3 C, 0.874 to 0.707 (Swarm 1.13, GRACE-FO 0.528); day 7 (167 h) C, 0.794 to 0.608 (Swarm 1.14, GRACE-FO 0.428). 3 of 3 lie where the two groups are on opposite sides of the band: a weighted median between them lands inside without either group being calibrated.

| Lead | Axis | All >2 | Swarm >2 | GRACE-FO >2 | Reduced >2 | Reduced interval | Reading | All >3 | Swarm >3 | GRACE-FO >3 | Reduced >3 | Reduced interval | Reading |
|---|---|---:|---:|---:|---:|---|---|---:|---:|---:|---:|---|---|
| day 1 | R | 3.86 % | 5.14 % | 0.95 % | 3.04 % | [1.67, 4.46 %] | lighter | 0.48 % | 0.69 % | 0.00 % | 0.35 % | [0.00, 0.88 %] | not decidable |
| day 1 | I | 5.12 % | 5.69 % | 3.80 % | 4.75 % | [2.36, 7.51 %] | not decidable | 1.83 % | 1.81 % | 1.90 % | 1.85 % | [0.50, 3.52 %] | heavier |
| day 1 | C | 10.91 % | 12.78 % | 6.65 % | 9.71 % | [6.81, 13.19 %] | heavier | 0.58 % | 0.83 % | 0.00 % | 0.42 % | [0.00, 0.98 %] | not decidable |
| day 3 | R | 12.26 % | 13.06 % | 10.44 % | 11.75 % | [8.02, 15.92 %] | heavier | 4.05 % | 5.28 % | 1.27 % | 3.27 % | [1.27, 5.69 %] | heavier |
| day 3 | I | 9.94 % | 10.69 % | 8.23 % | 9.46 % | [5.83, 13.18 %] | heavier | 1.93 % | 1.94 % | 1.90 % | 1.92 % | [0.44, 3.74 %] | heavier |
| day 3 | C | 6.27 % | 7.36 % | 3.80 % | 5.58 % | [3.26, 8.08 %] | not decidable | 0.10 % | 0.14 % | 0.00 % | 0.07 % | [0.00, 0.22 %] | not decidable |
| day 7 (167 h) | R | 9.36 % | 10.56 % | 6.65 % | 8.60 % | [6.29, 11.23 %] | heavier | 4.25 % | 4.86 % | 2.85 % | 3.85 % | [2.12, 6.04 %] | heavier |
| day 7 (167 h) | I | 15.93 % | 16.67 % | 14.24 % | 15.45 % | [10.54, 20.99 %] | heavier | 1.74 % | 1.94 % | 1.27 % | 1.61 % | [0.67, 2.69 %] | heavier |
| day 7 (167 h) | C | 3.28 % | 4.72 % | 0.00 % | 2.36 % | [1.31, 3.46 %] | lighter | 0.00 % | 0.00 % | 0.00 % | 0.00 % | [0.00, 0.00 %] | not decidable |

| Lead | Mahalanobis >5 % quantile: all | Swarm | GRACE-FO | Reduced | >0.27 % quantile: all | Swarm | GRACE-FO | Reduced |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| day 1 | 7.14 % | 8.47 % | 4.11 % | 6.29 % | 1.54 % | 1.67 % | 1.27 % | 1.47 % |
| day 3 | 13.22 % | 15.56 % | 7.91 % | 11.73 % | 2.70 % | 3.61 % | 0.63 % | 2.12 % |
| day 7 (167 h) | 48.65 % | 56.81 % | 30.06 % | 43.43 % | 33.69 % | 41.53 % | 15.82 % | 28.68 % |

GRACE-FO's held-out windows start 2025-10-04, Swarm's 2025-08-21: the common-span rows above separate season from satellite. The same storm reaches all five satellites, so groups are less independent than their count suggests.

## Per satellite

| Satellite | Lead | Axis | n | n_eff | Median \|z\| | Inside band | >2 sigma | B-hier | >3 sigma | B-hier | k2 | k3 |
|---|---|---|---:|---:|---:|---|---:|---|---:|---|---:|---:|
| Swarm B | day 1 | R | 240 | 166 | 0.605 | yes | 0.83 % | [0.00, 2.05 %] | 0.00 % | [0.00, 0.00 %] | 0.825 | 0.704 |
| Swarm B | day 1 | I | 240 | 117 | 0.387 | no | 2.08 % | [0.42, 4.17 %] | 0.83 % | [0.00, 2.54 %] | 0.824 | 1.38 |
| Swarm B | day 1 | C | 240 | 145 | 1.00 | no | 17.08 % | [11.79, 22.80 %] | 0.83 % | [0.00, 2.65 %] | 1.32 | 1.46 |
| Swarm B | day 3 | R | 240 | 227 | 0.717 | yes | 13.75 % | [8.75, 19.07 %] | 2.08 % | [0.00, 4.96 %] | 1.27 | 1.19 |
| Swarm B | day 3 | I | 240 | 219 | 0.642 | yes | 10.00 % | [4.78, 15.98 %] | 2.50 % | [0.00, 5.60 %] | 1.17 | 1.41 |
| Swarm B | day 3 | C | 240 | 126 | 1.09 | no | 9.58 % | [3.69, 17.24 %] | 0.00 % | [0.00, 0.00 %] | 1.21 | 0.935 |
| Swarm B | day 7 (167 h) | R | 240 | 189 | 1.14 | no | 18.75 % | [12.71, 25.00 %] | 9.58 % | [4.24, 15.45 %] | 1.85 | 2.08 |
| Swarm B | day 7 (167 h) | I | 240 | 108 | 1.06 | no | 20.42 % | [13.52, 27.35 %] | 4.17 % | [1.60, 7.02 %] | 1.47 | 1.35 |
| Swarm B | day 7 (167 h) | C | 240 | 324 | 1.17 | no | 9.58 % | [4.55, 15.18 %] | 0.00 % | [0.00, 0.00 %] | 1.05 | 0.821 |
| Swarm A | day 1 | R | 240 | 189 | 0.678 | yes | 7.50 % | [3.75, 11.67 %] | 0.83 % | [0.00, 2.07 %] | 1.06 | 1.06 |
| Swarm A | day 1 | I | 240 | 158 | 0.550 | no | 7.08 % | [3.13, 11.64 %] | 2.50 % | [0.42, 4.96 %] | 1.09 | 2.03 |
| Swarm A | day 1 | C | 240 | 158 | 0.892 | no | 11.67 % | [6.96, 16.54 %] | 0.42 % | [0.00, 1.27 %] | 1.19 | 0.982 |
| Swarm A | day 3 | R | 240 | 189 | 0.794 | no | 14.58 % | [8.20, 21.85 %] | 7.50 % | [3.25, 12.61 %] | 1.67 | 1.37 |
| Swarm A | day 3 | I | 240 | 174 | 0.676 | yes | 12.08 % | [7.44, 17.08 %] | 1.67 % | [0.00, 3.72 %] | 1.30 | 1.60 |
| Swarm A | day 3 | C | 240 | 93 | 1.16 | no | 6.67 % | [3.23, 10.57 %] | 0.42 % | [0.00, 1.28 %] | 1.05 | 0.983 |
| Swarm A | day 7 (167 h) | R | 240 | 121 | 0.648 | yes | 6.25 % | [3.25, 9.48 %] | 2.92 % | [0.81, 5.83 %] | 1.11 | 1.18 |
| Swarm A | day 7 (167 h) | I | 240 | 87 | 0.930 | no | 14.58 % | [8.47, 21.98 %] | 1.67 % | [0.00, 3.69 %] | 1.26 | 1.27 |
| Swarm A | day 7 (167 h) | C | 240 | 113 | 1.14 | no | 1.67 % | [0.00, 4.13 %] | 0.00 % | [0.00, 0.00 %] | 0.902 | 0.789 |
| Swarm C | day 1 | R | 240 | 309 | 0.637 | yes | 7.08 % | [3.63, 10.78 %] | 1.25 % | [0.00, 3.25 %] | 1.13 | 1.12 |
| Swarm C | day 1 | I | 240 | 158 | 0.529 | no | 7.92 % | [3.75, 12.60 %] | 2.08 % | [0.00, 4.55 %] | 1.11 | 1.85 |
| Swarm C | day 1 | C | 240 | 128 | 0.831 | no | 9.58 % | [5.08, 14.47 %] | 1.25 % | [0.00, 3.28 %] | 1.13 | 1.08 |
| Swarm C | day 3 | R | 240 | 151 | 0.788 | no | 10.83 % | [6.00, 16.67 %] | 6.25 % | [2.04, 11.44 %] | 1.61 | 1.36 |
| Swarm C | day 3 | I | 240 | 155 | 0.637 | yes | 10.00 % | [5.13, 15.79 %] | 1.67 % | [0.00, 4.51 %] | 1.19 | 1.45 |
| Swarm C | day 3 | C | 240 | 76 | 1.13 | no | 5.83 % | [2.48, 9.57 %] | 0.00 % | [0.00, 0.00 %] | 1.04 | 0.943 |
| Swarm C | day 7 (167 h) | R | 240 | 112 | 0.625 | yes | 6.67 % | [3.70, 9.92 %] | 2.08 % | [0.41, 4.24 %] | 1.20 | 1.52 |
| Swarm C | day 7 (167 h) | I | 240 | 85 | 0.916 | no | 15.00 % | [8.06, 23.25 %] | 0.00 % | [0.00, 0.00 %] | 1.20 | 0.961 |
| Swarm C | day 7 (167 h) | C | 240 | 131 | 1.10 | no | 2.92 % | [0.00, 6.45 %] | 0.00 % | [0.00, 0.00 %] | 0.888 | 0.789 |
| Sentinel-1A | day 1 | R | 124 | 277 | 0.606 | yes | 0.00 % | [0.00, 0.00 %] | 0.00 % | [0.00, 0.00 %] | 0.770 | 0.548 |
| Sentinel-1A | day 1 | I | 124 | 56 | 0.304 | no | 4.03 % | [0.00, 8.20 %] | 1.61 % | [0.00, 4.84 %] | 0.900 | 1.26 |
| Sentinel-1A | day 1 | C | 124 | 90 | 0.653 | yes | 0.00 % | [0.00, 0.00 %] | 0.00 % | [0.00, 0.00 %] | 0.835 | 0.624 |
| Sentinel-1A | day 3 | R | 124 | 147 | 0.666 | yes | 0.81 % | [0.00, 2.46 %] | 0.00 % | [0.00, 0.00 %] | 0.904 | 0.713 |
| Sentinel-1A | day 3 | I | 124 | 126 | 0.453 | no | 4.84 % | [0.00, 10.16 %] | 1.61 % | [0.00, 3.73 %] | 0.999 | 1.20 |
| Sentinel-1A | day 3 | C | 124 | 92 | 0.519 | no | 0.00 % | [0.00, 0.00 %] | 0.00 % | [0.00, 0.00 %] | 0.569 | 0.558 |
| Sentinel-1A | day 7 (167 h) | R | 124 | 95 | 0.820 | no | 7.26 % | [4.20, 10.48 %] | 0.00 % | [0.00, 0.00 %] | 1.04 | 0.819 |
| Sentinel-1A | day 7 (167 h) | I | 124 | 90 | 0.640 | yes | 9.68 % | [2.33, 18.60 %] | 2.42 % | [0.00, 5.88 %] | 1.21 | 1.38 |
| Sentinel-1A | day 7 (167 h) | C | 124 | 223 | 0.281 | no | 0.00 % | [0.00, 0.00 %] | 0.00 % | [0.00, 0.00 %] | 0.366 | 0.297 |
| GRACE-FO 1 | day 1 | R | 158 | 136 | 0.624 | yes | 1.27 % | [0.00, 3.09 %] | 0.00 % | [0.00, 0.00 %] | 0.840 | 0.678 |
| GRACE-FO 1 | day 1 | I | 158 | 92 | 0.435 | no | 3.16 % | [0.00, 7.05 %] | 1.27 % | [0.00, 3.85 %] | 0.877 | 1.32 |
| GRACE-FO 1 | day 1 | C | 158 | 143 | 0.560 | no | 6.33 % | [1.23, 12.82 %] | 0.00 % | [0.00, 0.00 %] | 1.13 | 0.947 |
| GRACE-FO 1 | day 3 | R | 158 | 82 | 0.676 | yes | 10.76 % | [5.00, 17.12 %] | 1.27 % | [0.00, 3.90 %] | 1.23 | 1.05 |
| GRACE-FO 1 | day 3 | I | 158 | 124 | 0.709 | yes | 6.96 % | [1.87, 12.84 %] | 1.27 % | [0.00, 3.85 %] | 1.05 | 1.29 |
| GRACE-FO 1 | day 3 | C | 158 | 89 | 0.537 | no | 3.80 % | [0.00, 7.89 %] | 0.00 % | [0.00, 0.00 %] | 0.815 | 0.815 |
| GRACE-FO 1 | day 7 (167 h) | R | 158 | 114 | 0.708 | yes | 6.96 % | [3.20, 10.96 %] | 3.16 % | [0.63, 6.43 %] | 1.21 | 1.78 |
| GRACE-FO 1 | day 7 (167 h) | I | 158 | 95 | 0.827 | no | 13.29 % | [6.10, 21.92 %] | 1.27 % | [0.00, 3.05 %] | 1.25 | 1.09 |
| GRACE-FO 1 | day 7 (167 h) | C | 158 | 106 | 0.428 | no | 0.00 % | [0.00, 0.00 %] | 0.00 % | [0.00, 0.00 %] | 0.640 | 0.508 |
| GRACE-FO 2 | day 1 | R | 158 | 119 | 0.618 | yes | 0.63 % | [0.00, 1.95 %] | 0.00 % | [0.00, 0.00 %] | 0.837 | 0.669 |
| GRACE-FO 2 | day 1 | I | 158 | 79 | 0.429 | no | 4.43 % | [0.00, 9.62 %] | 2.53 % | [0.00, 6.17 %] | 0.961 | 1.40 |
| GRACE-FO 2 | day 1 | C | 158 | 151 | 0.560 | no | 6.96 % | [2.00, 13.33 %] | 0.00 % | [0.00, 0.00 %] | 1.13 | 0.959 |
| GRACE-FO 2 | day 3 | R | 158 | 79 | 0.698 | yes | 10.13 % | [4.27, 16.67 %] | 1.27 % | [0.00, 3.85 %] | 1.23 | 1.06 |
| GRACE-FO 2 | day 3 | I | 158 | 95 | 0.781 | no | 9.49 % | [3.38, 16.46 %] | 2.53 % | [0.00, 6.17 %] | 1.33 | 1.33 |
| GRACE-FO 2 | day 3 | C | 158 | 72 | 0.525 | no | 3.80 % | [0.00, 8.00 %] | 0.00 % | [0.00, 0.00 %] | 0.836 | 0.816 |
| GRACE-FO 2 | day 7 (167 h) | R | 158 | 130 | 0.796 | no | 6.33 % | [2.50, 10.53 %] | 2.53 % | [0.00, 6.00 %] | 1.16 | 1.78 |
| GRACE-FO 2 | day 7 (167 h) | I | 158 | 79 | 0.859 | no | 15.19 % | [5.77, 26.67 %] | 1.27 % | [0.00, 3.05 %] | 1.29 | 1.08 |
| GRACE-FO 2 | day 7 (167 h) | C | 158 | 114 | 0.428 | no | 0.00 % | [0.00, 0.00 %] | 0.00 % | [0.00, 0.00 %] | 0.659 | 0.523 |
| Sentinel-1C | day 1 | R | 123 | 93 | 0.651 | yes | 2.44 % | [0.00, 5.88 %] | 0.81 % | [0.00, 2.44 %] | 0.814 | 1.01 |
| Sentinel-1C | day 1 | I | 123 | 67 | 0.371 | no | 7.32 % | [2.22, 13.93 %] | 0.00 % | [0.00, 0.00 %] | 1.11 | 0.946 |
| Sentinel-1C | day 1 | C | 123 | 177 | 0.687 | yes | 13.01 % | [6.67, 19.69 %] | 5.69 % | [1.39, 11.67 %] | 1.70 | 1.42 |
| Sentinel-1C | day 3 | R | 123 | 77 | 0.610 | yes | 5.69 % | [1.87, 9.30 %] | 0.81 % | [0.00, 2.44 %] | 1.02 | 0.981 |
| Sentinel-1C | day 3 | I | 123 | 40 | 0.639 | yes | 6.50 % | [2.24, 12.00 %] | 0.81 % | [0.00, 2.52 %] | 1.03 | 1.03 |
| Sentinel-1C | day 3 | C | 123 | 102 | 0.650 | yes | 7.32 % | [0.00, 19.66 %] | 4.07 % | [0.00, 12.61 %] | 1.09 | 1.51 |
| Sentinel-1C | day 7 (167 h) | R | 125 | 58 | 0.874 | no | 5.60 % | [1.69, 10.26 %] | 0.00 % | [0.00, 0.00 %] | 1.01 | 0.821 |
| Sentinel-1C | day 7 (167 h) | I | 125 | 42 | 0.725 | yes | 11.20 % | [2.46, 21.31 %] | 4.00 % | [0.00, 9.52 %] | 1.40 | 1.43 |
| Sentinel-1C | day 7 (167 h) | C | 125 | 37 | 0.533 | no | 7.20 % | [1.56, 14.05 %] | 0.00 % | [0.00, 0.00 %] | 1.05 | 0.770 |

One satellite's interval is over its own weeks only.

| Satellite | Lead | n | Mean d2/3 | >7.815 | >14.156 |
|---|---|---:|---:|---:|---:|
| Swarm B | day 1 | 240 | 1.12 | 7.08 % | 2.92 % |
| Swarm B | day 3 | 240 | 1.47 | 13.33 % | 2.92 % |
| Swarm B | day 7 (167 h) | 240 | 4.79 | 43.75 % | 23.33 % |
| Swarm A | day 1 | 240 | 1.27 | 8.75 % | 1.25 % |
| Swarm A | day 3 | 240 | 2.17 | 17.92 % | 4.58 % |
| Swarm A | day 7 (167 h) | 240 | 150 | 64.17 % | 51.25 % |
| Swarm C | day 1 | 240 | 1.20 | 9.58 % | 0.83 % |
| Swarm C | day 3 | 240 | 1.60 | 15.42 % | 3.33 % |
| Swarm C | day 7 (167 h) | 240 | 27.6 | 62.50 % | 50.00 % |
| Sentinel-1A | day 1 | 124 | 0.764 | 4.03 % | 0.81 % |
| Sentinel-1A | day 3 | 124 | 0.777 | 2.42 % | 0.81 % |
| Sentinel-1A | day 7 (167 h) | 124 | 0.911 | 4.84 % | 1.61 % |
| GRACE-FO 1 | day 1 | 158 | 0.808 | 3.16 % | 0.63 % |
| GRACE-FO 1 | day 3 | 158 | 1.10 | 6.96 % | 0.63 % |
| GRACE-FO 1 | day 7 (167 h) | 158 | 3.63 | 30.38 % | 15.19 % |
| GRACE-FO 2 | day 1 | 158 | 0.876 | 5.06 % | 1.90 % |
| GRACE-FO 2 | day 3 | 158 | 1.18 | 8.86 % | 0.63 % |
| GRACE-FO 2 | day 7 (167 h) | 158 | 3.90 | 29.75 % | 16.46 % |
| Sentinel-1C | day 1 | 123 | 1.28 | 13.82 % | 5.69 % |
| Sentinel-1C | day 3 | 123 | 1.16 | 8.94 % | 2.44 % |
| Sentinel-1C | day 7 (167 h) | 125 | 1.22 | 9.60 % | 2.40 % |

## The size of the 18-cell test

A calibrated covariance at each cell's effective n would land inside [0.603, 0.754] in about 15.0 of 18 cells; observed 8 of 18 (0.6.1). SE = 0.787 / sqrt(n_eff).

| Regime | Lead | Axis | n | n_eff of the median | SE | Chance inside if calibrated | Inside |
|---|---|---|---:|---:|---:|---:|---|
| Strong drag, 2025 | day 1 | R | 1036 | 554 | 0.0334 | 0.975 | yes |
| Strong drag, 2025 | day 1 | I | 1036 | 370 | 0.0409 | 0.934 | no |
| Strong drag, 2025 | day 1 | C | 1036 | 299 | 0.0455 | 0.902 | no |
| Strong drag, 2025 | day 3 | R | 1036 | 469 | 0.0363 | 0.961 | yes |
| Strong drag, 2025 | day 3 | I | 1036 | 429 | 0.0380 | 0.952 | yes |
| Strong drag, 2025 | day 3 | C | 1036 | 147 | 0.0649 | 0.754 | no |
| Strong drag, 2025 | day 7 (167 h) | R | 1036 | 340 | 0.0427 | 0.922 | yes |
| Strong drag, 2025 | day 7 (167 h) | I | 1036 | 253 | 0.0495 | 0.872 | no |
| Strong drag, 2025 | day 7 (167 h) | C | 1036 | 114 | 0.0738 | 0.693 | no |
| Near 700 km, 2026 | day 1 | R | 247 | 225 | 0.0524 | 0.849 | yes |
| Near 700 km, 2026 | day 1 | I | 247 | 86 | 0.0850 | 0.625 | no |
| Near 700 km, 2026 | day 1 | C | 247 | 460 | 0.0367 | 0.959 | yes |
| Near 700 km, 2026 | day 3 | R | 247 | 432 | 0.0379 | 0.953 | yes |
| Near 700 km, 2026 | day 3 | I | 247 | 86 | 0.0849 | 0.626 | no |
| Near 700 km, 2026 | day 3 | C | 247 | 174 | 0.0596 | 0.793 | no |
| Near 700 km, 2026 | day 7 (167 h) | R | 249 | 136 | 0.0675 | 0.736 | no |
| Near 700 km, 2026 | day 7 (167 h) | I | 249 | 60 | 0.102 | 0.542 | yes |
| Near 700 km, 2026 | day 7 (167 h) | C | 249 | 471 | 0.0363 | 0.962 | no |

## Near 700 km, burn-censored (second reading)

Primary figures above are uncensored, as the refit reported. Here by the model study's amendments 3 and 4 (a window-arm dropped if a step or unchecked stretch lies in its arc; a lead scored only if none lies in (cutoff, lead]); under 30 samples "not decidable". Strong drag cannot be censored: no maneuver record is held, so any Swarm or GRACE-FO maneuver is inside its shares.

| Lead | Axis | n | Median \|z\| | >2 sigma | B-hier | Reading | >3 sigma | B-hier | Reading |
|---|---|---:|---:|---:|---|---|---:|---|---|
| day 1 | R | 108 | 0.777 | 1.85 % | [0.00, 6.00 %] | not decidable | 0.93 % | [0.00, 3.00 %] | not decidable |
| day 1 | I | 108 | 0.212 | 0.00 % | [0.00, 0.00 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| day 1 | C | 108 | 0.834 | 4.63 % | [0.00, 11.31 %] | not decidable | 2.78 % | [0.00, 6.42 %] | not decidable |
| day 1 | d2 | 108 | 1.69 | 5.56 % | [0.00, 10.75 %] | not decidable | 2.78 % | [0.00, 6.42 %] | not decidable |
| day 3 | R | 51 | 0.595 | 7.84 % | [0.00, 16.67 %] | not decidable | 1.96 % | [0.00, 6.67 %] | not decidable |
| day 3 | I | 51 | 0.400 | 0.00 % | [0.00, 0.00 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| day 3 | C | 51 | 0.615 | 1.96 % | [0.00, 6.25 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| day 3 | d2 | 51 | 1.51 | 3.92 % | [0.00, 9.09 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| day 7 (167 h) | R | 10 | not decidable | | | | | | |
| day 7 (167 h) | I | 10 | not decidable | | | | | | |
| day 7 (167 h) | C | 10 | not decidable | | | | | | |
| day 7 (167 h) | d2 | 10 | not decidable | | | | | | |

For d2 the two columns are the 5 % and 0.27 % quantiles.

## Post-hoc arm, exploratory, not a calibration

Cross-track sigma of strong drag scaled by one constant at every lead. Measured on the refit's training block (396 windows, Swarm A, Swarm B, Swarm C, days 1, 3 and 7 pooled): k_tail 1.0898, k_median 1.4851. Tested on the held-out block, which neither measurement read; GRACE-FO is also a set of satellites they never saw. Designed after the held-out 2-sigma shares were public, so it is not a registered test. No form selected, nothing proposed for a module.

| Factor | Part | Lead | n | Median \|z_C\| | >2 sigma | B-hier | Reading | >3 sigma | B-hier | Reading |
|---|---|---|---:|---:|---:|---|---|---:|---|---|
| none | all | day 1 | 1036 | 0.781 | 10.91 % | [6.23, 16.94 %] | heavier | 0.58 % | [0.00, 1.50 %] | not decidable |
| none | all | day 3 | 1036 | 0.874 | 6.27 % | [3.08, 10.53 %] | not decidable | 0.10 % | [0.00, 0.34 %] | not decidable |
| none | all | day 7 (167 h) | 1036 | 0.794 | 3.28 % | [0.00, 8.96 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| none | Swarm | day 1 | 720 | 0.884 | 12.78 % | [8.51, 19.63 %] | heavier | 0.83 % | [0.00, 1.97 %] | not decidable |
| none | Swarm | day 3 | 720 | 1.13 | 7.36 % | [4.21, 12.87 %] | not decidable | 0.14 % | [0.00, 0.43 %] | not decidable |
| none | Swarm | day 7 (167 h) | 720 | 1.14 | 4.72 % | [1.23, 12.08 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| none | GRACE-FO | day 1 | 316 | 0.560 | 6.65 % | [1.74, 12.85 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| none | GRACE-FO | day 3 | 316 | 0.528 | 3.80 % | [0.00, 7.79 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| none | GRACE-FO | day 7 (167 h) | 316 | 0.428 | 0.00 % | [0.00, 0.00 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| k_tail 1.0898 | all | day 1 | 1036 | 0.717 | 8.01 % | [4.51, 13.16 %] | not decidable | 0.29 % | [0.00, 1.03 %] | not decidable |
| k_tail 1.0898 | all | day 3 | 1036 | 0.802 | 4.25 % | [2.04, 7.35 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| k_tail 1.0898 | all | day 7 (167 h) | 1036 | 0.729 | 1.35 % | [0.00, 4.19 %] | lighter | 0.00 % | [0.00, 0.00 %] | not decidable |
| k_tail 1.0898 | Swarm | day 1 | 720 | 0.811 | 9.03 % | [4.92, 16.31 %] | heavier | 0.42 % | [0.00, 1.70 %] | not decidable |
| k_tail 1.0898 | Swarm | day 3 | 720 | 1.04 | 4.72 % | [2.17, 9.49 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| k_tail 1.0898 | Swarm | day 7 (167 h) | 720 | 1.05 | 1.94 % | [0.00, 6.03 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| k_tail 1.0898 | GRACE-FO | day 1 | 316 | 0.514 | 5.70 % | [1.23, 11.25 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| k_tail 1.0898 | GRACE-FO | day 3 | 316 | 0.484 | 3.16 % | [0.00, 6.96 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| k_tail 1.0898 | GRACE-FO | day 7 (167 h) | 316 | 0.393 | 0.00 % | [0.00, 0.00 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| k_median 1.4851 | all | day 1 | 1036 | 0.526 | 0.58 % | [0.00, 1.48 %] | lighter | 0.00 % | [0.00, 0.00 %] | not decidable |
| k_median 1.4851 | all | day 3 | 1036 | 0.589 | 0.10 % | [0.00, 0.33 %] | lighter | 0.00 % | [0.00, 0.00 %] | not decidable |
| k_median 1.4851 | all | day 7 (167 h) | 1036 | 0.535 | 0.00 % | [0.00, 0.00 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| k_median 1.4851 | Swarm | day 1 | 720 | 0.595 | 0.83 % | [0.00, 2.01 %] | lighter | 0.00 % | [0.00, 0.00 %] | not decidable |
| k_median 1.4851 | Swarm | day 3 | 720 | 0.761 | 0.14 % | [0.00, 0.43 %] | lighter | 0.00 % | [0.00, 0.00 %] | not decidable |
| k_median 1.4851 | Swarm | day 7 (167 h) | 720 | 0.769 | 0.00 % | [0.00, 0.00 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| k_median 1.4851 | GRACE-FO | day 1 | 316 | 0.377 | 0.00 % | [0.00, 0.00 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| k_median 1.4851 | GRACE-FO | day 3 | 316 | 0.355 | 0.00 % | [0.00, 0.00 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |
| k_median 1.4851 | GRACE-FO | day 7 (167 h) | 316 | 0.288 | 0.00 % | [0.00, 0.00 %] | not decidable | 0.00 % | [0.00, 0.00 %] | not decidable |

| Factor | Part | Lead | n | d2 >7.815 | B-hier | Reading | d2 >11.345 | Reading | d2 >14.156 | B-hier | Reading |
|---|---|---|---:|---:|---|---|---:|---|---:|---|---|
| none | all | day 1 | 1036 | 7.14 % | [3.33, 10.13 %] | not decidable | 3.19 % | heavier | 1.54 % | [0.45, 3.24 %] | heavier |
| none | all | day 3 | 1036 | 13.22 % | [7.44, 18.22 %] | heavier | 5.69 % | heavier | 2.70 % | [0.57, 4.89 %] | heavier |
| none | all | day 7 (167 h) | 1036 | 48.65 % | [30.34, 63.68 %] | heavier | 37.36 % | heavier | 33.69 % | [15.13, 50.35 %] | heavier |
| none | Swarm | day 1 | 720 | 8.47 % | [5.19, 10.96 %] | heavier | 3.75 % | heavier | 1.67 % | [0.22, 4.17 %] | not decidable |
| none | Swarm | day 3 | 720 | 15.56 % | [10.08, 20.06 %] | heavier | 7.22 % | heavier | 3.61 % | [1.45, 5.88 %] | heavier |
| none | Swarm | day 7 (167 h) | 720 | 56.81 % | [39.74, 68.80 %] | heavier | 45.69 % | heavier | 41.53 % | [20.08, 55.99 %] | heavier |
| none | GRACE-FO | day 1 | 316 | 4.11 % | [0.00, 9.38 %] | not decidable | 1.90 % | not decidable | 1.27 % | [0.00, 3.09 %] | not decidable |
| none | GRACE-FO | day 3 | 316 | 7.91 % | [3.62, 12.50 %] | not decidable | 2.22 % | not decidable | 0.63 % | [0.00, 1.92 %] | not decidable |
| none | GRACE-FO | day 7 (167 h) | 316 | 30.06 % | [24.03, 37.04 %] | heavier | 18.35 % | heavier | 15.82 % | [9.26, 23.08 %] | heavier |
| k_tail 1.0898 | all | day 1 | 1036 | 5.69 % | [2.31, 8.39 %] | not decidable | 2.61 % | heavier | 1.35 % | [0.38, 2.61 %] | heavier |
| k_tail 1.0898 | all | day 3 | 1036 | 12.16 % | [6.77, 16.95 %] | heavier | 5.41 % | heavier | 2.41 % | [0.43, 4.62 %] | heavier |
| k_tail 1.0898 | all | day 7 (167 h) | 1036 | 48.07 % | [30.17, 63.80 %] | heavier | 36.97 % | heavier | 33.30 % | [14.86, 50.51 %] | heavier |
| k_tail 1.0898 | Swarm | day 1 | 720 | 7.08 % | [4.29, 9.48 %] | not decidable | 2.92 % | heavier | 1.39 % | [0.21, 3.27 %] | not decidable |
| k_tail 1.0898 | Swarm | day 3 | 720 | 14.03 % | [7.87, 18.62 %] | heavier | 6.81 % | heavier | 3.19 % | [0.96, 5.43 %] | heavier |
| k_tail 1.0898 | Swarm | day 7 (167 h) | 720 | 55.97 % | [38.57, 67.41 %] | heavier | 45.14 % | heavier | 40.97 % | [19.17, 55.57 %] | heavier |
| k_tail 1.0898 | GRACE-FO | day 1 | 316 | 2.53 % | [0.00, 5.49 %] | not decidable | 1.90 % | not decidable | 1.27 % | [0.00, 3.05 %] | not decidable |
| k_tail 1.0898 | GRACE-FO | day 3 | 316 | 7.91 % | [3.48, 12.65 %] | not decidable | 2.22 % | not decidable | 0.63 % | [0.00, 1.92 %] | not decidable |
| k_tail 1.0898 | GRACE-FO | day 7 (167 h) | 316 | 30.06 % | [24.01, 37.33 %] | heavier | 18.35 % | heavier | 15.82 % | [9.15, 23.46 %] | heavier |
| k_median 1.4851 | all | day 1 | 1036 | 3.47 % | [1.37, 5.57 %] | not decidable | 2.03 % | not decidable | 1.06 % | [0.21, 2.13 %] | not decidable |
| k_median 1.4851 | all | day 3 | 1036 | 9.94 % | [5.54, 14.35 %] | heavier | 4.73 % | heavier | 2.41 % | [0.45, 4.64 %] | heavier |
| k_median 1.4851 | all | day 7 (167 h) | 1036 | 45.85 % | [29.05, 60.82 %] | heavier | 35.91 % | heavier | 32.24 % | [14.52, 49.67 %] | heavier |
| k_median 1.4851 | Swarm | day 1 | 720 | 4.17 % | [1.99, 6.30 %] | not decidable | 2.08 % | not decidable | 0.97 % | [0.00, 2.29 %] | not decidable |
| k_median 1.4851 | Swarm | day 3 | 720 | 11.25 % | [5.91, 15.93 %] | heavier | 5.83 % | heavier | 3.19 % | [0.85, 5.40 %] | heavier |
| k_median 1.4851 | Swarm | day 7 (167 h) | 720 | 53.06 % | [34.76, 65.51 %] | heavier | 43.61 % | heavier | 39.44 % | [16.60, 54.94 %] | heavier |
| k_median 1.4851 | GRACE-FO | day 1 | 316 | 1.90 % | [0.00, 4.76 %] | lighter | 1.90 % | not decidable | 1.27 % | [0.00, 3.09 %] | not decidable |
| k_median 1.4851 | GRACE-FO | day 3 | 316 | 6.96 % | [2.44, 12.20 %] | not decidable | 2.22 % | not decidable | 0.63 % | [0.00, 1.95 %] | not decidable |
| k_median 1.4851 | GRACE-FO | day 7 (167 h) | 316 | 29.43 % | [23.13, 37.33 %] | heavier | 18.35 % | heavier | 15.82 % | [9.38, 23.72 %] | heavier |

## Control: the refit's literal rows (0.6.0 re-weighted, diagonal only)

A0's 18 medians equal the refit's table: yes; inside the band 8 of 18. Between A0 and the 0.6.1 flights over all 48 axis-lead cells: largest difference in median 0.0000700, in the 2-sigma share 0.40 %, in the 3-sigma share 0.00 %. Window-arm-lead keys only in A0: 0; only in A1: 0.

| Regime | Lead | Axis | n A0 | n A1 | Median A0 | Median A1 | >2 A0 | >2 A1 | >3 A0 | >3 A1 |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Strong drag, 2025 | day 1 | R | 1036 | 1036 | 0.635 | 0.635 | 3.86 % | 3.86 % | 0.48 % | 0.48 % |
| Strong drag, 2025 | day 1 | I | 1036 | 1036 | 0.468 | 0.468 | 5.12 % | 5.12 % | 1.83 % | 1.83 % |
| Strong drag, 2025 | day 1 | C | 1036 | 1036 | 0.781 | 0.781 | 10.91 % | 10.91 % | 0.58 % | 0.58 % |
| Strong drag, 2025 | day 3 | R | 1036 | 1036 | 0.745 | 0.745 | 12.26 % | 12.26 % | 4.05 % | 4.05 % |
| Strong drag, 2025 | day 3 | I | 1036 | 1036 | 0.679 | 0.679 | 9.94 % | 9.94 % | 1.93 % | 1.93 % |
| Strong drag, 2025 | day 3 | C | 1036 | 1036 | 0.874 | 0.874 | 6.27 % | 6.27 % | 0.10 % | 0.10 % |
| Strong drag, 2025 | day 7 (167 h) | R | 1036 | 1036 | 0.754 | 0.754 | 9.36 % | 9.36 % | 4.25 % | 4.25 % |
| Strong drag, 2025 | day 7 (167 h) | I | 1036 | 1036 | 0.910 | 0.910 | 15.93 % | 15.93 % | 1.74 % | 1.74 % |
| Strong drag, 2025 | day 7 (167 h) | C | 1036 | 1036 | 0.794 | 0.794 | 3.28 % | 3.28 % | 0.00 % | 0.00 % |
| Near 700 km, 2026 | day 1 | R | 247 | 247 | 0.638 | 0.638 | 1.21 % | 1.21 % | 0.40 % | 0.40 % |
| Near 700 km, 2026 | day 1 | I | 247 | 247 | 0.322 | 0.322 | 5.67 % | 5.67 % | 0.81 % | 0.81 % |
| Near 700 km, 2026 | day 1 | C | 247 | 247 | 0.660 | 0.660 | 6.48 % | 6.48 % | 2.83 % | 2.83 % |
| Near 700 km, 2026 | day 3 | R | 247 | 247 | 0.638 | 0.638 | 3.24 % | 3.24 % | 0.40 % | 0.40 % |
| Near 700 km, 2026 | day 3 | I | 247 | 247 | 0.487 | 0.487 | 5.67 % | 5.67 % | 1.21 % | 1.21 % |
| Near 700 km, 2026 | day 3 | C | 247 | 247 | 0.560 | 0.560 | 3.64 % | 3.64 % | 2.02 % | 2.02 % |
| Near 700 km, 2026 | day 7 (167 h) | R | 249 | 249 | 0.852 | 0.852 | 6.43 % | 6.43 % | 0.00 % | 0.00 % |
| Near 700 km, 2026 | day 7 (167 h) | I | 249 | 249 | 0.674 | 0.674 | 10.44 % | 10.44 % | 3.21 % | 3.21 % |
| Near 700 km, 2026 | day 7 (167 h) | C | 249 | 249 | 0.380 | 0.380 | 3.61 % | 3.61 % | 0.00 % | 0.00 % |

Rows read: A1 1246, A0 1246; hold-outs 0; in the guard 100. Not opened: `covariance-model/{p26,s1q4,dols}`.

## What these rows cannot support

- A burn-censored strong-drag reading: no maneuver record is held.
- More than a coarse between-group interval: 3 groups strong drag, 1 near 700 km.
- Any claim beyond these two regimes, or about a shape of the covariance in another.
- A statement that 0.6.3 or 0.6.4 behave the same: only 0.6.1 was flown on these windows.

