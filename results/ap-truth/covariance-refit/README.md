Acceptance NOT met: the realism E2E does not pass; on the held-out windows 10 of 18 cells (per regime, R, I and C, days 1, 3 and 7) lie outside median |z| 0.603 to 0.754; the record's acceptance line "realism E2E PASS" is not met and the fitted row earns no realism label.

# AP DRAG process-noise re-fit (COVARIANCE-REFIT.md)

Fitted from the coverage study's rows (sdn-ap 0.6.0, `/opt/data/sdn-archive/operator-theory/covariance-coverage`) by re-weighting the module's own per-term variances; training and held-out windows disjoint by cutoff with a 10-day guard. z = forward error component over the propagated 1-sigma; calibrated median |z| 0.674, band 0.603 to 0.754; within 1 and 2 sigma calibrated 0.683 and 0.954. Windows (window keys with a flown arm): Strong drag, 2025 training 396, held-out 518; Near 700 km, 2026 training 140, held-out 130.

## The DRAG row

| Term | 0.6.0 | Fitted |
|---|---:|---:|
| s_e | 0.0030020720101006817 | 1.8579913326733934e-7 |
| s_i | 0.0000013729304605949328 | 0.00000112761105007012 |
| s_l | 0.00022005794330391744 | 7.647194501793458e-7 |
| c | 0.5245440617486178 | 0.112126311682426 |
| k_F | 1 | 1.5127596877626373 |

Loss (training): 0.6.0 30.6, fitted 0.0747. Starts: 0.6.0 row 0.0747; s_e, s_l, c / 100; s_i x 1 0.0747; s_e, s_l, c / 1000; s_i x 10 0.0747; s_e, s_l, c / 10000; s_i x 100 0.0752.

Held-out verdict (median |z| inside [0.603, 0.754] per regime on R, I and C at days 1, 3, 7): FAIL; training: outside.

## Median |z| per regime (both arms), before and after

| Regime | Set | Lead | n | R before | I before | C before | R after | I after | C after | R within 1, 2 sigma | I within 1, 2 sigma | C within 1, 2 sigma | mean d2/3 (diag) | inside 95 % (diag) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---:|---:|
| Strong drag, 2025 | training | 1 h | 792 | 0.0123 | 3.47e-3 | 0.937 | 0.656 | 0.649 | 0.767 | 0.683, 1.00 | 0.693, 0.965 | 0.652, 0.948 | 0.964 | 0.956 |
| Strong drag, 2025 | training | 6 h | 792 | 2.26e-3 | 1.48e-3 | 0.846 | 0.653 | 0.419 | 0.745 | 0.702, 0.987 | 0.899, 0.990 | 0.615, 0.919 | 0.859 | 0.963 |
| Strong drag, 2025 | training | 12 h | 792 | 1.19e-3 | 1.32e-3 | 0.778 | 0.691 | 0.370 | 0.766 | 0.717, 0.972 | 0.857, 0.992 | 0.639, 0.908 | 0.897 | 0.953 |
| Strong drag, 2025 | training | day 1 | 792 | 6.32e-4 | 1.92e-3 | 0.825 | 0.682 | 0.495 | 0.983 | 0.681, 0.960 | 0.777, 0.977 | 0.509, 0.855 | 1.17 | 0.924 |
| Strong drag, 2025 | training | day 2 | 792 | 3.66e-4 | 3.54e-3 | 0.776 | 0.719 | 0.634 | 1.12 | 0.649, 0.949 | 0.703, 0.960 | 0.437, 0.890 | 1.27 | 0.928 |
| Strong drag, 2025 | training | day 3 | 792 | 2.61e-4 | 4.96e-3 | 0.712 | 0.658 | 0.674 | 1.12 | 0.662, 0.912 | 0.693, 0.947 | 0.432, 0.934 | 1.41 | 0.874 |
| Strong drag, 2025 | training | day 5 | 792 | 2.01e-4 | 7.59e-3 | 0.596 | 0.680 | 0.657 | 1.05 | 0.676, 0.909 | 0.673, 0.924 | 0.465, 0.966 | 1.32 | 0.888 |
| Strong drag, 2025 | training | day 7 (167 h) | 792 | 2.15e-4 | 0.0103 | 0.502 | 0.673 | 0.715 | 0.936 | 0.707, 0.934 | 0.645, 0.900 | 0.557, 0.994 | 1.22 | 0.900 |
| Strong drag, 2025 | held-out | 1 h | 1036 | 0.0125 | 3.75e-3 | 0.751 | 0.650 | 0.659 | 0.618 | 0.760, 1.00 | 0.694, 0.933 | 0.715, 0.956 | 0.910 | 0.956 |
| Strong drag, 2025 | held-out | 6 h | 1036 | 2.19e-3 | 1.28e-3 | 0.808 | 0.640 | 0.360 | 0.690 | 0.719, 0.999 | 0.890, 0.970 | 0.691, 0.936 | 0.816 | 0.958 |
| Strong drag, 2025 | held-out | 12 h | 1036 | 1.05e-3 | 1.36e-3 | 0.856 | 0.587 | 0.370 | 0.825 | 0.738, 0.978 | 0.874, 0.965 | 0.586, 0.896 | 0.997 | 0.921 |
| Strong drag, 2025 | held-out | day 1 | 1036 | 5.77e-4 | 2.03e-3 | 0.678 | 0.635 | 0.468 | 0.781 | 0.691, 0.961 | 0.809, 0.949 | 0.604, 0.891 | 1.12 | 0.917 |
| Strong drag, 2025 | held-out | day 2 | 1036 | 3.89e-4 | 3.83e-3 | 0.649 | 0.709 | 0.591 | 0.897 | 0.649, 0.929 | 0.713, 0.928 | 0.552, 0.909 | 1.30 | 0.889 |
| Strong drag, 2025 | held-out | day 3 | 1036 | 3.29e-4 | 5.94e-3 | 0.579 | 0.745 | 0.679 | 0.874 | 0.619, 0.877 | 0.648, 0.901 | 0.547, 0.937 | 1.47 | 0.870 |
| Strong drag, 2025 | held-out | day 5 | 1036 | 3.09e-4 | 0.0110 | 0.482 | 0.801 | 0.804 | 0.737 | 0.581, 0.847 | 0.582, 0.880 | 0.599, 0.954 | 1.63 | 0.834 |
| Strong drag, 2025 | held-out | day 7 (167 h) | 1036 | 3.24e-4 | 0.0164 | 0.491 | 0.754 | 0.910 | 0.794 | 0.618, 0.906 | 0.543, 0.841 | 0.589, 0.967 | 1.56 | 0.840 |
| Near 700 km, 2026 | training | 1 h | 259 | 7.01e-3 | 3.95e-3 | 0.575 | 0.443 | 0.714 | 0.473 | 0.849, 0.988 | 0.641, 0.888 | 0.942, 0.996 | 1.30 | 0.946 |
| Near 700 km, 2026 | training | 6 h | 260 | 1.69e-3 | 1.71e-3 | 0.649 | 0.641 | 0.483 | 0.650 | 0.700, 0.985 | 0.665, 0.819 | 0.781, 0.996 | 2.12 | 0.912 |
| Near 700 km, 2026 | training | 12 h | 260 | 7.84e-4 | 1.80e-3 | 0.364 | 0.560 | 0.525 | 0.466 | 0.765, 0.981 | 0.688, 0.835 | 0.827, 0.988 | 2.81 | 0.888 |
| Near 700 km, 2026 | training | day 1 | 264 | 4.33e-4 | 1.62e-3 | 0.333 | 0.629 | 0.482 | 0.677 | 0.761, 0.985 | 0.708, 0.841 | 0.788, 0.992 | 2.15 | 0.894 |
| Near 700 km, 2026 | training | day 2 | 264 | 2.37e-4 | 2.38e-3 | 0.223 | 0.669 | 0.704 | 0.565 | 0.784, 0.977 | 0.667, 0.830 | 0.845, 0.989 | 2.19 | 0.867 |
| Near 700 km, 2026 | training | day 3 | 264 | 1.49e-4 | 2.46e-3 | 0.169 | 0.618 | 0.736 | 0.470 | 0.814, 0.966 | 0.614, 0.826 | 0.902, 0.992 | 2.28 | 0.864 |
| Near 700 km, 2026 | training | day 5 | 264 | 1.12e-4 | 2.68e-3 | 0.133 | 0.682 | 0.799 | 0.392 | 0.723, 0.973 | 0.545, 0.788 | 0.939, 0.996 | 2.51 | 0.826 |
| Near 700 km, 2026 | training | day 7 (167 h) | 262 | 7.23e-5 | 3.31e-3 | 0.0846 | 0.578 | 0.984 | 0.276 | 0.779, 0.954 | 0.508, 0.718 | 0.958, 1.00 | 2.47 | 0.794 |
| Near 700 km, 2026 | held-out | 1 h | 235 | 6.73e-3 | 3.24e-3 | 0.555 | 0.452 | 0.633 | 0.459 | 0.838, 0.991 | 0.694, 0.885 | 0.834, 0.987 | 1.22 | 0.957 |
| Near 700 km, 2026 | held-out | 6 h | 237 | 1.54e-3 | 9.55e-4 | 0.736 | 0.562 | 0.273 | 0.701 | 0.637, 0.996 | 0.743, 0.920 | 0.650, 0.987 | 0.930 | 0.954 |
| Near 700 km, 2026 | held-out | 12 h | 237 | 9.18e-4 | 1.18e-3 | 0.418 | 0.680 | 0.350 | 0.551 | 0.726, 1.00 | 0.789, 0.937 | 0.789, 0.970 | 0.857 | 0.945 |
| Near 700 km, 2026 | held-out | day 1 | 247 | 4.38e-4 | 1.07e-3 | 0.385 | 0.638 | 0.322 | 0.660 | 0.765, 0.988 | 0.777, 0.943 | 0.648, 0.935 | 0.980 | 0.907 |
| Near 700 km, 2026 | held-out | day 2 | 247 | 2.27e-4 | 1.52e-3 | 0.267 | 0.679 | 0.442 | 0.658 | 0.656, 0.972 | 0.745, 0.947 | 0.781, 0.960 | 0.942 | 0.939 |
| Near 700 km, 2026 | held-out | day 3 | 247 | 1.50e-4 | 1.63e-3 | 0.207 | 0.638 | 0.487 | 0.560 | 0.656, 0.968 | 0.745, 0.943 | 0.826, 0.964 | 0.953 | 0.939 |
| Near 700 km, 2026 | held-out | day 5 | 247 | 1.54e-4 | 2.16e-3 | 0.149 | 1.01 | 0.644 | 0.450 | 0.498, 0.879 | 0.721, 0.923 | 0.874, 0.955 | 1.16 | 0.915 |
| Near 700 km, 2026 | held-out | day 7 (167 h) | 249 | 1.05e-4 | 2.28e-3 | 0.116 | 0.852 | 0.674 | 0.380 | 0.582, 0.936 | 0.655, 0.896 | 0.880, 0.964 | 1.10 | 0.920 |

## The ISS demo figure, predicted

The demo's ISS sample at its last state 2026-07-14T00:00:00.000 (12.0 h from its start, 6.00 h after the fit's end), the coverage study's flights re-weighted to the fitted row (a prediction, not a flight of a build): 1-sigma R / I / C 5.10 / 37.8 / 0.0229 km before, 0.0166 / 0.147 / 0.0153 km after, against the error 6.76e-3 / 0.308 / 0.0159 km (|z| after 0.408 / 2.09 / 1.04).

## Median |z| per arm after, days 1, 3, 7

| Regime | Set | Arm | Lead | n | R | I | C |
|---|---|---|---|---:|---:|---:|---:|
| Strong drag, 2025 | training | AP24 | day 1 | 396 | 0.615 | 0.623 | 0.985 |
| Strong drag, 2025 | training | AP24 | day 3 | 396 | 0.591 | 0.774 | 1.13 |
| Strong drag, 2025 | training | AP24 | day 7 (167 h) | 396 | 0.647 | 0.754 | 0.934 |
| Strong drag, 2025 | training | APRa12 | day 1 | 396 | 0.724 | 0.342 | 0.975 |
| Strong drag, 2025 | training | APRa12 | day 3 | 396 | 0.749 | 0.587 | 1.11 |
| Strong drag, 2025 | training | APRa12 | day 7 (167 h) | 396 | 0.686 | 0.642 | 0.942 |
| Strong drag, 2025 | held-out | AP24 | day 1 | 518 | 0.648 | 0.560 | 0.814 |
| Strong drag, 2025 | held-out | AP24 | day 3 | 518 | 0.723 | 0.797 | 0.907 |
| Strong drag, 2025 | held-out | AP24 | day 7 (167 h) | 518 | 0.781 | 0.949 | 0.808 |
| Strong drag, 2025 | held-out | APRa12 | day 1 | 518 | 0.623 | 0.381 | 0.747 |
| Strong drag, 2025 | held-out | APRa12 | day 3 | 518 | 0.756 | 0.556 | 0.862 |
| Strong drag, 2025 | held-out | APRa12 | day 7 (167 h) | 518 | 0.733 | 0.873 | 0.773 |
| Near 700 km, 2026 | training | AP72 | day 1 | 126 | 0.616 | 0.652 | 0.697 |
| Near 700 km, 2026 | training | AP72 | day 3 | 126 | 0.582 | 0.891 | 0.456 |
| Near 700 km, 2026 | training | AP72 | day 7 (167 h) | 125 | 0.668 | 1.19 | 0.283 |
| Near 700 km, 2026 | training | AP24 | day 1 | 138 | 0.661 | 0.423 | 0.661 |
| Near 700 km, 2026 | training | AP24 | day 3 | 138 | 0.686 | 0.688 | 0.492 |
| Near 700 km, 2026 | training | AP24 | day 7 (167 h) | 137 | 0.525 | 0.768 | 0.271 |
| Near 700 km, 2026 | held-out | AP72 | day 1 | 121 | 0.651 | 0.383 | 0.758 |
| Near 700 km, 2026 | held-out | AP72 | day 3 | 121 | 0.737 | 0.508 | 0.589 |
| Near 700 km, 2026 | held-out | AP72 | day 7 (167 h) | 122 | 0.739 | 0.799 | 0.369 |
| Near 700 km, 2026 | held-out | AP24 | day 1 | 126 | 0.635 | 0.301 | 0.653 |
| Near 700 km, 2026 | held-out | AP24 | day 3 | 126 | 0.588 | 0.483 | 0.538 |
| Near 700 km, 2026 | held-out | AP24 | day 7 (167 h) | 127 | 0.886 | 0.599 | 0.395 |

## Why the band is not met (amendment 1, report only)

Median |z| R / I / C at days 1 | 3 | 7.

| Diagnostic | Loss | Regime | Training | Held-out |
|---|---:|---|---|---|
| Own row per regime: s_e 2.82727e-7, s_i 0.00000174214, s_l 4.01405e-7, c 0.1202, k_F 1.65363 | 4.67e-3 | Strong drag, 2025 | 0.649 / 0.682 / 0.766; 0.617 / 0.699 / 0.754; 0.620 / 0.686 / 0.611 | 0.604 / 0.603 / 0.623; 0.699 / 0.684 / 0.589; 0.703 / 0.861 / 0.523 |
| Own row per regime: s_e 2.89442e-11, s_i 6.55646e-7, s_l 6.58237e-7, c 1.71992, k_F 1.27647 | 0.0237 | Near 700 km, 2026 | 0.681 / 0.552 / 0.815; 0.635 / 0.752 / 0.713; 0.541 / 0.711 / 0.449 | 0.694 / 0.371 / 0.835; 0.686 / 0.544 / 0.853; 0.842 / 0.635 / 0.629 |
| One row, s_i + c_i n-dot_ng: s_e 1.84011e-7, s_i 6.25474e-7, s_l 7.64805e-7, c 0.111801, k_F 1.52067, c_i 0.108834 | 0.0268 | Strong drag, 2025 | 0.680 / 0.495 / 0.779; 0.658 / 0.676 / 0.763; 0.673 / 0.717 / 0.626 | 0.633 / 0.469 / 0.573; 0.746 / 0.681 / 0.540; 0.755 / 0.912 / 0.481 |
| One row, s_i + c_i n-dot_ng: s_e 1.84011e-7, s_i 6.25474e-7, s_l 7.64805e-7, c 0.111801, k_F 1.52067, c_i 0.108834 | 0.0268 | Near 700 km, 2026 | 0.628 / 0.481 / 0.762; 0.617 / 0.736 / 0.716; 0.579 / 0.984 / 0.454 | 0.636 / 0.322 / 0.784; 0.637 / 0.487 / 0.853; 0.853 / 0.674 / 0.643 |

Cross-track at day 7 over s_i 1e-9 to 1e-3 and k_F 0.01 to 100 (quarter-decade steps; the rest at the fitted row): where the strong-drag median |z| is inside the band, the near-700 km one is training 0.1651 to 0.1919 (2 points); held-out 0.2588 to 0.3181 (14 points).

The 3D figures here take d^2 as the sum of the three z^2 (the rows keep no cross-axis covariance); the module's E2E takes the full position block. Rows read: 1246; arms flown: 2345; windows in the guard: 50; hold-outs: 0. Re-weighting at the 0.6.0 row reproduces the rows' full variances within 3.33e-7 relative, at all terms 0 the noise-off ones within 0.00e+0.
