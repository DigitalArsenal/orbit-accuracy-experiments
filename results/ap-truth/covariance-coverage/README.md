# AP covariance coverage (sdn-ap 0.6.0, wasm 0b5280f05176)

Report only (experiments/operator-theory/COVARIANCE-COVERAGE.md). Coverage z = AP's forward error component over its propagated 1-sigma, per radial (R), in-track (I) and cross-track (C) axis, from `analysis/gp-error-model` `pair_statistics` on `propagator/sdn-ap` 0.6.0 flights (modules 895b6b38). A calibrated covariance gives median |z| 0.674 (band 0.603 to 0.754); below it the covariance is too wide by the width factor 0.674 / median |z|.

## The ISS demo figure

The demo's sample (docs/assets/demo/nasa-iss-2026-07-13.oem, 181 states, 91 fitted), at its last state 2026-07-14T00:00:00.000 (12.0 h from its start, 6.00 h after the fit's end): in-track 1-sigma 37.78 km (0.031 km at the file's first state), error 0.3085 km (in-track 0.3080 km); with the four process-noise terms off the in-track 1-sigma is 0.0671 km.

## Median |z| by regime, arm, lead and axis

| Regime | Arm | Lead | n | R | I | C | I width factor | I median 1-sigma km | I median error km | mean d2/3 | inside 95 % |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Strong drag, 2025 | AP24 | 12 h | 944 | 1.08e-3 | 1.85e-3 | 0.866 | 364 | 76.0 | 0.141 | 0.584 | 0.965 |
| Strong drag, 2025 | AP24 | day 1 | 944 | 5.83e-4 | 2.47e-3 | 0.794 | 274 | 152 | 0.374 | 0.497 | 0.992 |
| Strong drag, 2025 | AP24 | day 3 | 944 | 2.74e-4 | 6.36e-3 | 0.686 | 106 | 454 | 2.89 | 0.292 | 1.00 |
| Strong drag, 2025 | AP24 | day 7 (167 h) | 944 | 2.92e-4 | 0.0142 | 0.533 | 47.6 | 1058 | 15.0 | 0.177 | 1.00 |
| Strong drag, 2025 | APRa12 | 12 h | 944 | 1.12e-3 | 1.05e-3 | 0.778 | 643 | 76.1 | 0.0799 | 0.557 | 0.963 |
| Strong drag, 2025 | APRa12 | day 1 | 944 | 6.21e-4 | 1.55e-3 | 0.717 | 435 | 152 | 0.235 | 0.452 | 0.993 |
| Strong drag, 2025 | APRa12 | day 3 | 944 | 3.10e-4 | 4.48e-3 | 0.620 | 151 | 454 | 2.03 | 0.265 | 1.00 |
| Strong drag, 2025 | APRa12 | day 7 (167 h) | 944 | 2.50e-4 | 0.0129 | 0.472 | 52.1 | 1058 | 13.7 | 0.160 | 1.00 |
| Near 700 km, 2026 | AP72 | 12 h | 260 | 9.92e-4 | 2.12e-3 | 0.432 | 318 | 74.8 | 0.159 | 0.406 | 0.981 |
| Near 700 km, 2026 | AP72 | day 1 | 267 | 4.33e-4 | 1.75e-3 | 0.386 | 386 | 149 | 0.261 | 0.306 | 0.978 |
| Near 700 km, 2026 | AP72 | day 3 | 267 | 1.58e-4 | 2.29e-3 | 0.195 | 295 | 447 | 1.03 | 0.119 | 0.993 |
| Near 700 km, 2026 | AP72 | day 7 (167 h) | 267 | 8.85e-5 | 3.46e-3 | 0.0949 | 195 | 1037 | 3.58 | 0.0507 | 1.00 |
| Near 700 km, 2026 | AP24 | 12 h | 277 | 7.11e-4 | 1.31e-3 | 0.363 | 514 | 75.0 | 0.0986 | 0.205 | 0.989 |
| Near 700 km, 2026 | AP24 | day 1 | 284 | 4.14e-4 | 1.27e-3 | 0.331 | 530 | 149 | 0.190 | 0.228 | 0.986 |
| Near 700 km, 2026 | AP24 | day 3 | 284 | 1.46e-4 | 2.03e-3 | 0.184 | 332 | 448 | 0.908 | 0.0945 | 0.996 |
| Near 700 km, 2026 | AP24 | day 7 (167 h) | 284 | 8.83e-5 | 2.16e-3 | 0.101 | 312 | 1038 | 2.24 | 0.0502 | 1.00 |

With the four process-noise terms off (the mapped fit covariance and the floor):

| Regime | Arm | Lead | R | I | C | mean d2/3 | inside 95 % |
|---|---|---|---:|---:|---:|---:|---:|
| Strong drag, 2025 | AP24 | day 1 | 0.814 | 9.67 | 1.44 | 102 | 0.0922 |
| Strong drag, 2025 | AP24 | day 3 | 1.08 | 16.9 | 3.39 | 315 | 0.0297 |
| Strong drag, 2025 | AP24 | day 7 (167 h) | 2.20 | 20.0 | 6.81 | 474 | 0.0138 |
| Strong drag, 2025 | APRa12 | day 1 | 0.885 | 9.50 | 1.40 | 187 | 0.106 |
| Strong drag, 2025 | APRa12 | day 3 | 1.31 | 64.6 | 3.44 | 7763 | 6.36e-3 |
| Strong drag, 2025 | APRa12 | day 7 (167 h) | 2.50 | 278 | 7.25 | 92555 | 1.06e-3 |
| Near 700 km, 2026 | AP72 | day 1 | 0.697 | 4.36 | 1.07 | 250 | 0.281 |
| Near 700 km, 2026 | AP72 | day 3 | 0.770 | 12.7 | 1.48 | 1753 | 0.0861 |
| Near 700 km, 2026 | AP72 | day 7 (167 h) | 1.01 | 26.7 | 1.98 | 3556 | 0.0487 |
| Near 700 km, 2026 | AP24 | day 1 | 0.780 | 7.07 | 1.01 | 181 | 0.0810 |
| Near 700 km, 2026 | AP24 | day 3 | 0.795 | 7.70 | 1.56 | 91.3 | 0.0951 |
| Near 700 km, 2026 | AP24 | day 7 (167 h) | 0.946 | 4.44 | 2.41 | 42.2 | 0.0915 |

## Which term grows

Median share of the in-track variance by term (each term switched off through the record's COV_PROPAGATION field and flown again; the floor from the record's FLOOR_VV_KM2).

| Regime | Arm | Lead | n | s_e | s_i | s_l | s_d | mapped fit | floor |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| Strong drag, 2025 | AP24 | 12 h | 944 | 0.0738 | 3.81e-9 | 0.926 | 3.15e-5 | 3.08e-8 | 1.03e-7 |
| Strong drag, 2025 | AP24 | 24 h | 944 | 0.0737 | 3.92e-9 | 0.926 | 1.27e-4 | 4.07e-8 | 2.60e-8 |
| Strong drag, 2025 | AP24 | 72 h | 944 | 0.0739 | 3.89e-9 | 0.925 | 1.14e-3 | 1.33e-7 | 2.91e-9 |
| Strong drag, 2025 | AP24 | 167 h | 944 | 0.0791 | 4.36e-9 | 0.915 | 6.14e-3 | 4.96e-7 | 5.30e-10 |
| Strong drag, 2025 | APRa12 | 12 h | 944 | 0.0737 | 3.81e-9 | 0.926 | 3.02e-5 | 4.62e-9 | 9.61e-8 |
| Strong drag, 2025 | APRa12 | 24 h | 944 | 0.0738 | 3.91e-9 | 0.926 | 1.21e-4 | 2.81e-9 | 2.42e-8 |
| Strong drag, 2025 | APRa12 | 72 h | 944 | 0.0735 | 3.89e-9 | 0.925 | 1.10e-3 | 1.80e-9 | 2.69e-9 |
| Strong drag, 2025 | APRa12 | 167 h | 944 | 0.0774 | 4.34e-9 | 0.915 | 5.88e-3 | 1.55e-9 | 4.90e-10 |
| Near 700 km, 2026 | AP72 | 12 h | 260 | 0.0811 | 4.67e-9 | 0.919 | 5.36e-9 | 2.96e-9 | 1.46e-7 |
| Near 700 km, 2026 | AP72 | 24 h | 267 | 0.0811 | 4.93e-9 | 0.919 | 2.16e-8 | 1.85e-9 | 3.71e-8 |
| Near 700 km, 2026 | AP72 | 72 h | 267 | 0.0811 | 5.98e-9 | 0.919 | 2.18e-7 | 1.98e-9 | 3.84e-9 |
| Near 700 km, 2026 | AP72 | 167 h | 267 | 0.0811 | 8.37e-9 | 0.919 | 1.08e-6 | 5.26e-9 | 9.04e-10 |
| Near 700 km, 2026 | AP24 | 12 h | 277 | 0.0811 | 4.27e-9 | 0.919 | 1.79e-9 | 1.58e-8 | 4.63e-8 |
| Near 700 km, 2026 | AP24 | 24 h | 284 | 0.0811 | 4.47e-9 | 0.919 | 7.18e-9 | 1.98e-8 | 1.16e-8 |
| Near 700 km, 2026 | AP24 | 72 h | 284 | 0.0811 | 4.99e-9 | 0.919 | 6.54e-8 | 6.56e-8 | 1.29e-9 |
| Near 700 km, 2026 | AP24 | 167 h | 284 | 0.0811 | 6.53e-9 | 0.919 | 3.55e-7 | 2.42e-7 | 2.41e-10 |

Growing term: mean longitude (s_l) (largest median in-track share at day 1 in 4 of 4 regime-arm cells): Strong drag, 2025 AP24 mean longitude (s_l) 0.926; Strong drag, 2025 APRa12 mean longitude (s_l) 0.926; Near 700 km, 2026 AP72 mean longitude (s_l) 0.919; Near 700 km, 2026 AP24 mean longitude (s_l) 0.919.

Noise sizes the fits wrote (median over windows):

| Regime | Arm | s_e (1/day) | s_i (1/day) | s_l | c | s_d (rad/day^2) | t_a (min) |
|---|---|---:|---:|---:|---:|---:|---:|
| Strong drag, 2025 | AP24 | 3.00e-3 | 1.37e-6 | 2.20e-4 | 0.525 | 5.00e-4 | 1435 |
| Strong drag, 2025 | APRa12 | 3.00e-3 | 1.37e-6 | 2.20e-4 | 0.525 | 4.90e-4 | 1015 |
| Near 700 km, 2026 | AP72 | 3.00e-3 | 1.37e-6 | 2.20e-4 | 0.525 | 6.53e-6 | 4317 |
| Near 700 km, 2026 | AP24 | 3.00e-3 | 1.37e-6 | 2.20e-4 | 0.525 | 3.63e-6 | 1435 |

## Control

Each stored fit of `ap/b051` reproduced by its producer's call on 0.6.0: truth 944 windows, 47200 scalars compared, 0 differing; truth2 302 windows, 13971 scalars compared, 0 differing. Unchanged repack flown byte-equal on 2445 of 2445; shares sum to 1 within 3.33e-7.

Build: `propagator/sdn-ap` 0.6.0, wasm SHA-256 `0b5280f05176fc755dbfb859fd8028fc495759d7537024c53043f498c91faa63` at modules `895b6b38de29bc284b4b50a02425a6c3a5fe81a2`. Rows: `/opt/data/sdn-archive/operator-theory/covariance-coverage`, run from this repository at `fe9555d460`.
