# Screening scale: CPU and events against the number of objects (report-only)

Registration: `SCREENING-SCALE.md`. N is an index, the current catalog = 1. `counts.jsonl` holds the raw counts for the whitepaper only; the site, the chart and marketing never read it.

## Fit of ln(value) on ln(N index)

| Series | Quantity | n | p | Interval | P(1\|1) | P(2\|1) | P(2\|2) | P(1\|2) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| ladder | cpu | 10 | 1.377 | 1.244 to 1.511 | 0.96 | 0.00 | 0.95 | 0.00 | undecided |
| ladder | events | 10 | 2.024 | 1.998 to 2.051 | 0.95 | 0.00 | 0.95 | 0.00 | p = 2 |
| ladder | propagation | 10 | 1.083 | 1.027 to 1.139 | 0.95 | 0.00 | 0.94 | 0.00 | undecided |
| ladder | search | 10 | 1.442 | 1.345 to 1.540 | 0.96 | 0.00 | 0.95 | 0.00 | undecided |
| ladder | refine | 10 | 2.031 | 1.821 to 2.242 | 0.95 | 0.00 | 0.95 | 0.00 | p = 2 |
| dates | cpu | 8 | 2.961 | 1.875 to 4.047 | 0.44 | 0.02 | 0.46 | 0.02 | undecided |
| dates | events | 8 | 5.337 | 2.676 to 7.998 | 0.09 | 0.02 | 0.09 | 0.02 | undecided |

P(a\|b): the share of 2000 simulated fits at a true p = b that the three-way rule calls "p = a".

## Runs

| Case | Index | CPU total s | Propagation s | Search s | Refine s | Index s | Host s | Wall s | Events | Propagation share |
|---|---|---|---|---|---|---|---|---|---|---|
| current-full-r1 | 1.0000 | 834.6 | 202.4 | 374.4 | 159.0 | 40.4 | 58.3 | 268.6 | 1069553 | 0.243 |
| current-full-r2 | 1.0000 | 834.0 | 203.4 | 367.9 | 154.4 | 41.1 | 67.2 | 204.3 | 1069553 | 0.244 |
| current-full-r3 | 1.0000 | 836.9 | 208.5 | 374.3 | 152.1 | 39.2 | 62.8 | 191.8 | 1069553 | 0.249 |
| date-2022-12-21 | 0.7379 | 317.9 | 116.4 | 158.7 | 21.5 | 8.9 | 12.5 | 71.0 | 195199 | 0.366 |
| date-2023-06-21 | 0.7621 | 333.5 | 120.1 | 167.3 | 24.4 | 9.6 | 12.1 | 76.4 | 194860 | 0.360 |
| date-2023-12-21 | 0.7790 | 347.8 | 122.7 | 175.8 | 25.3 | 9.9 | 14.1 | 76.5 | 217894 | 0.353 |
| date-2024-06-21 | 0.7979 | 355.1 | 122.8 | 182.0 | 26.2 | 10.7 | 13.5 | 122.4 | 190288 | 0.346 |
| date-2024-12-21 | 0.8209 | 367.7 | 129.3 | 190.1 | 24.1 | 11.3 | 12.9 | 106.2 | 201604 | 0.352 |
| date-2025-06-21 | 0.8436 | 386.8 | 133.8 | 201.7 | 26.5 | 11.7 | 13.2 | 94.3 | 222839 | 0.346 |
| date-2025-12-21 | 0.9001 | 443.4 | 142.1 | 229.3 | 37.1 | 14.0 | 20.8 | 110.2 | 324247 | 0.320 |
| ladder-1-2-s1 | 0.5000 | 226.3 | 82.7 | 107.7 | 21.3 | 4.4 | 10.2 | 50.5 | 263796 | 0.366 |
| ladder-1-2-s2 | 0.5000 | 221.5 | 82.0 | 104.6 | 21.7 | 4.4 | 8.9 | 43.0 | 260897 | 0.370 |
| ladder-1-2-s3 | 0.5000 | 229.0 | 82.9 | 107.7 | 22.6 | 4.5 | 11.3 | 49.7 | 272200 | 0.362 |
| ladder-1-4-s1 | 0.2500 | 88.9 | 39.2 | 39.7 | 5.5 | 1.2 | 3.3 | 21.3 | 64589 | 0.441 |
| ladder-1-4-s2 | 0.2500 | 90.6 | 40.2 | 40.8 | 5.5 | 1.1 | 3.0 | 20.7 | 65972 | 0.444 |
| ladder-1-4-s3 | 0.2500 | 90.3 | 40.2 | 40.1 | 5.7 | 1.1 | 3.1 | 21.2 | 67011 | 0.446 |
| ladder-1-8-s1 | 0.1250 | 39.2 | 19.6 | 16.2 | 1.6 | 0.4 | 1.3 | 10.0 | 16091 | 0.499 |
| ladder-1-8-s2 | 0.1250 | 40.7 | 20.2 | 16.7 | 1.8 | 0.5 | 1.6 | 11.1 | 15310 | 0.495 |
| ladder-1-8-s3 | 0.1250 | 39.1 | 19.6 | 16.1 | 1.7 | 0.4 | 1.3 | 9.8 | 16473 | 0.501 |

Run-to-run range of the total CPU over the three full-catalog repeats: 0.3 percent of the median.

## Propagation share by theory

| Theory | Flown | Covered share of the catalog | Propagation share of the screen CPU | Note |
|---|---|---|---|---|
| SGP4 | yes | 1.0000 | 0.244 | range over cases 0.243 to 0.501; zero-cost propagator bound 1.32x |
| SGP4-XP | no | 0.3839 | - | covered share below one half of the catalog: not flown, not extrapolated |
| AP | no | 0.0000 | - | covered share below one half of the catalog: not flown, not extrapolated |
| FFM | no | 0.3388 | - | covered share below one half of the catalog: not flown, not extrapolated |

## Timing arm: propagation CPU per state at 7 days x 60 s, the cost benchmark's own flights (median over a regime's windows, microseconds)

| Arm | Build | pooled | Low orbit, laser spheres | Low orbit, altimetry | Laser geodetic | Geostationary | Inclined geosynchronous | Strong drag, 2026 | Near 700 km | Medium Earth orbit |
|---|---|---|---|---|---|---|---|---|---|---|
| SGP4 | sgp4 1.4.1 | 1.95 (n 25) | 3.69 (n 3) | 1.88 (n 4) | 2.02 (n 4) | 2.70 (n 4) | 2.56 (n 1) | 1.81 (n 4) | 1.80 (n 2) | 1.91 (n 3) |
| XP | sdn-ap 0.6.3 | 21.47 (n 28) | 23.98 (n 3) | 22.17 (n 4) | 20.21 (n 4) | 20.32 (n 4) | 19.96 (n 4) | 20.77 (n 4) | 25.51 (n 2) | 21.05 (n 3) |
| XPU | sgp4-xp 0.2.2 | 25.27 (n 28) | 39.61 (n 3) | 42.83 (n 4) | 16.66 (n 4) | 21.52 (n 4) | 25.15 (n 4) | 39.60 (n 4) | 24.39 (n 2) | 18.19 (n 3) |
| AP | sdn-ap 0.6.3 | 334.59 (n 28) | 356.06 (n 3) | 354.95 (n 4) | 289.17 (n 4) | 35.72 (n 4) | 37.51 (n 4) | 376.25 (n 4) | 360.80 (n 2) | 340.02 (n 3) |
| FFM20 | ffm 2.2.1 | 233.53 (n 28) | 598.18 (n 3) | 573.55 (n 4) | 229.57 (n 4) | 196.76 (n 4) | 196.21 (n 4) | 546.75 (n 4) | 460.62 (n 2) | 195.63 (n 3) |
| FFM40 | ffm 2.2.1 | 1055.24 (n 13) | 1111.49 (n 3) | 1049.40 (n 4) | - | - | - | 1068.89 (n 4) | 898.96 (n 2) | - |

Four windows per regime (the benchmark's), 32 pooled: the pooled figure is not the catalog's regime mix. FFM 40x40 flies below 8,400 km only. A window an arm refused or failed is absent from n.

## Amdahl conversion (a propagation 1/8 as costly; doublings = log2(1 / f) / p, f = (1 - s) + s / 8)

| Theory | Regime | s | f | Doublings | Interval from p | Years at 3.8 | Years at 9.6 (undecided fit) |
|---|---|---|---|---|---|---|---|
| SGP4 (measured in the screen) | all | 0.244 | 0.787 | 0.25 | 0.23 to 0.28 | 1.0 | 2.4 |
| XP (derived, s low) | pooled | 0.766 | 0.330 | 1.16 | 1.06 to 1.29 | 4.4 | 11.1 |
| XP (derived, s high) | pooled | 0.919 | 0.196 | 1.71 | 1.55 to 1.89 | 6.5 | 16.4 |
| XP (derived, s low) | Low orbit, laser spheres | 0.843 | 0.262 | 1.40 | 1.28 to 1.55 | 5.3 | 13.5 |
| XP (derived, s high) | Low orbit, laser spheres | 0.926 | 0.189 | 1.74 | 1.59 to 1.93 | 6.6 | 16.7 |
| XP (derived, s low) | Low orbit, altimetry | 0.762 | 0.333 | 1.15 | 1.05 to 1.28 | 4.4 | 11.1 |
| XP (derived, s high) | Low orbit, altimetry | 0.921 | 0.194 | 1.72 | 1.56 to 1.90 | 6.5 | 16.5 |
| XP (derived, s low) | Laser geodetic | 0.768 | 0.328 | 1.17 | 1.07 to 1.29 | 4.4 | 11.2 |
| XP (derived, s high) | Laser geodetic | 0.914 | 0.200 | 1.68 | 1.54 to 1.86 | 6.4 | 16.2 |
| XP (derived, s low) | Geostationary | 0.804 | 0.296 | 1.27 | 1.16 to 1.41 | 4.8 | 12.2 |
| XP (derived, s high) | Geostationary | 0.914 | 0.200 | 1.69 | 1.54 to 1.87 | 6.4 | 16.2 |
| XP (derived, s low) | Inclined geosynchronous | 0.797 | 0.302 | 1.25 | 1.14 to 1.39 | 4.8 | 12.0 |
| XP (derived, s high) | Inclined geosynchronous | 0.913 | 0.201 | 1.68 | 1.53 to 1.86 | 6.4 | 16.1 |
| XP (derived, s low) | Strong drag, 2026 | 0.754 | 0.340 | 1.13 | 1.03 to 1.25 | 4.3 | 10.8 |
| XP (derived, s high) | Strong drag, 2026 | 0.916 | 0.198 | 1.69 | 1.54 to 1.88 | 6.4 | 16.3 |
| XP (derived, s low) | Near 700 km | 0.760 | 0.335 | 1.15 | 1.04 to 1.27 | 4.4 | 11.0 |
| XP (derived, s high) | Near 700 km | 0.931 | 0.186 | 1.76 | 1.61 to 1.95 | 6.7 | 16.9 |
| XP (derived, s low) | Medium Earth orbit | 0.762 | 0.333 | 1.15 | 1.05 to 1.28 | 4.4 | 11.1 |
| XP (derived, s high) | Medium Earth orbit | 0.917 | 0.198 | 1.70 | 1.55 to 1.88 | 6.5 | 16.3 |
| XPU (derived, s low) | pooled | 0.772 | 0.325 | 1.18 | 1.07 to 1.30 | 4.5 | 11.3 |
| XPU (derived, s high) | pooled | 0.930 | 0.186 | 1.76 | 1.60 to 1.95 | 6.7 | 16.9 |
| XPU (derived, s low) | Low orbit, laser spheres | 0.860 | 0.247 | 1.46 | 1.33 to 1.62 | 5.6 | 14.0 |
| XPU (derived, s high) | Low orbit, laser spheres | 0.954 | 0.165 | 1.89 | 1.72 to 2.09 | 7.2 | 18.1 |
| XPU (derived, s low) | Low orbit, altimetry | 0.781 | 0.317 | 1.20 | 1.10 to 1.33 | 4.6 | 11.6 |
| XPU (derived, s high) | Low orbit, altimetry | 0.957 | 0.162 | 1.90 | 1.74 to 2.11 | 7.2 | 18.3 |
| XPU (derived, s low) | Laser geodetic | 0.760 | 0.335 | 1.14 | 1.04 to 1.27 | 4.3 | 11.0 |
| XPU (derived, s high) | Laser geodetic | 0.897 | 0.215 | 1.61 | 1.47 to 1.78 | 6.1 | 15.5 |
| XPU (derived, s low) | Geostationary | 0.807 | 0.294 | 1.28 | 1.17 to 1.42 | 4.9 | 12.3 |
| XPU (derived, s high) | Geostationary | 0.919 | 0.196 | 1.71 | 1.56 to 1.89 | 6.5 | 16.4 |
| XPU (derived, s low) | Inclined geosynchronous | 0.807 | 0.294 | 1.28 | 1.17 to 1.42 | 4.9 | 12.3 |
| XPU (derived, s high) | Inclined geosynchronous | 0.930 | 0.187 | 1.76 | 1.60 to 1.95 | 6.7 | 16.9 |
| XPU (derived, s low) | Strong drag, 2026 | 0.773 | 0.324 | 1.18 | 1.08 to 1.31 | 4.5 | 11.3 |
| XPU (derived, s high) | Strong drag, 2026 | 0.954 | 0.165 | 1.89 | 1.72 to 2.09 | 7.2 | 18.1 |
| XPU (derived, s low) | Near 700 km | 0.758 | 0.336 | 1.14 | 1.04 to 1.26 | 4.3 | 11.0 |
| XPU (derived, s high) | Near 700 km | 0.928 | 0.188 | 1.75 | 1.59 to 1.94 | 6.6 | 16.8 |
| XPU (derived, s low) | Medium Earth orbit | 0.756 | 0.338 | 1.13 | 1.03 to 1.26 | 4.3 | 10.9 |
| XPU (derived, s high) | Medium Earth orbit | 0.905 | 0.208 | 1.65 | 1.50 to 1.82 | 6.3 | 15.8 |
| AP (derived, s low) | pooled | 0.804 | 0.296 | 1.27 | 1.16 to 1.41 | 4.8 | 12.2 |
| AP (derived, s high) | pooled | 0.994 | 0.130 | 2.14 | 1.95 to 2.37 | 8.1 | 20.5 |
| AP (derived, s low) | Low orbit, laser spheres | 0.885 | 0.226 | 1.56 | 1.42 to 1.73 | 5.9 | 15.0 |
| AP (derived, s high) | Low orbit, laser spheres | 0.995 | 0.130 | 2.14 | 1.95 to 2.37 | 8.1 | 20.5 |
| AP (derived, s low) | Low orbit, altimetry | 0.799 | 0.301 | 1.26 | 1.15 to 1.39 | 4.8 | 12.1 |
| AP (derived, s high) | Low orbit, altimetry | 0.995 | 0.130 | 2.14 | 1.95 to 2.37 | 8.1 | 20.5 |
| AP (derived, s low) | Laser geodetic | 0.810 | 0.292 | 1.29 | 1.18 to 1.43 | 4.9 | 12.4 |
| AP (derived, s high) | Laser geodetic | 0.993 | 0.131 | 2.13 | 1.94 to 2.36 | 8.1 | 20.5 |
| AP (derived, s low) | Geostationary | 0.824 | 0.279 | 1.34 | 1.22 to 1.48 | 5.1 | 12.9 |
| AP (derived, s high) | Geostationary | 0.949 | 0.169 | 1.86 | 1.70 to 2.06 | 7.1 | 17.9 |
| AP (derived, s low) | Inclined geosynchronous | 0.819 | 0.283 | 1.32 | 1.20 to 1.46 | 5.0 | 12.7 |
| AP (derived, s high) | Inclined geosynchronous | 0.952 | 0.167 | 1.87 | 1.71 to 2.07 | 7.1 | 18.0 |
| AP (derived, s low) | Strong drag, 2026 | 0.793 | 0.306 | 1.24 | 1.13 to 1.37 | 4.7 | 11.9 |
| AP (derived, s high) | Strong drag, 2026 | 0.995 | 0.129 | 2.14 | 1.95 to 2.37 | 8.1 | 20.6 |
| AP (derived, s low) | Near 700 km | 0.791 | 0.307 | 1.24 | 1.13 to 1.37 | 4.7 | 11.9 |
| AP (derived, s high) | Near 700 km | 0.995 | 0.130 | 2.14 | 1.95 to 2.37 | 8.1 | 20.5 |
| AP (derived, s low) | Medium Earth orbit | 0.801 | 0.299 | 1.27 | 1.15 to 1.40 | 4.8 | 12.1 |
| AP (derived, s high) | Medium Earth orbit | 0.994 | 0.130 | 2.14 | 1.95 to 2.37 | 8.1 | 20.5 |
| FFM20 (derived, s low) | pooled | 0.803 | 0.297 | 1.27 | 1.16 to 1.41 | 4.8 | 12.2 |
| FFM20 (derived, s high) | pooled | 0.992 | 0.132 | 2.12 | 1.93 to 2.35 | 8.1 | 20.4 |
| FFM20 (derived, s low) | Low orbit, laser spheres | 0.886 | 0.225 | 1.56 | 1.43 to 1.73 | 5.9 | 15.0 |
| FFM20 (derived, s high) | Low orbit, laser spheres | 0.997 | 0.128 | 2.16 | 1.96 to 2.39 | 8.2 | 20.7 |
| FFM20 (derived, s low) | Low orbit, altimetry | 0.800 | 0.300 | 1.26 | 1.15 to 1.40 | 4.8 | 12.1 |
| FFM20 (derived, s high) | Low orbit, altimetry | 0.997 | 0.128 | 2.15 | 1.96 to 2.39 | 8.2 | 20.7 |
| FFM20 (derived, s low) | Laser geodetic | 0.809 | 0.292 | 1.29 | 1.17 to 1.43 | 4.9 | 12.4 |
| FFM20 (derived, s high) | Laser geodetic | 0.992 | 0.132 | 2.12 | 1.93 to 2.35 | 8.1 | 20.3 |
| FFM20 (derived, s low) | Geostationary | 0.847 | 0.258 | 1.42 | 1.29 to 1.57 | 5.4 | 13.6 |
| FFM20 (derived, s high) | Geostationary | 0.990 | 0.133 | 2.11 | 1.92 to 2.34 | 8.0 | 20.3 |
| FFM20 (derived, s low) | Inclined geosynchronous | 0.841 | 0.264 | 1.39 | 1.27 to 1.54 | 5.3 | 13.4 |
| FFM20 (derived, s high) | Inclined geosynchronous | 0.990 | 0.133 | 2.11 | 1.92 to 2.34 | 8.0 | 20.3 |
| FFM20 (derived, s low) | Strong drag, 2026 | 0.794 | 0.305 | 1.24 | 1.13 to 1.38 | 4.7 | 11.9 |
| FFM20 (derived, s high) | Strong drag, 2026 | 0.997 | 0.128 | 2.15 | 1.96 to 2.38 | 8.2 | 20.7 |
| FFM20 (derived, s low) | Near 700 km | 0.792 | 0.307 | 1.24 | 1.13 to 1.37 | 4.7 | 11.9 |
| FFM20 (derived, s high) | Near 700 km | 0.996 | 0.129 | 2.15 | 1.96 to 2.38 | 8.2 | 20.6 |
| FFM20 (derived, s low) | Medium Earth orbit | 0.799 | 0.300 | 1.26 | 1.15 to 1.39 | 4.8 | 12.1 |
| FFM20 (derived, s high) | Medium Earth orbit | 0.990 | 0.133 | 2.11 | 1.92 to 2.34 | 8.0 | 20.3 |
| FFM40 (derived, s low) | pooled | 0.806 | 0.295 | 1.28 | 1.17 to 1.42 | 4.9 | 12.3 |
| FFM40 (derived, s high) | pooled | 0.998 | 0.127 | 2.16 | 1.97 to 2.40 | 8.2 | 20.8 |
| FFM40 (derived, s low) | Low orbit, laser spheres | 0.887 | 0.224 | 1.57 | 1.43 to 1.74 | 6.0 | 15.0 |
| FFM40 (derived, s high) | Low orbit, laser spheres | 0.998 | 0.126 | 2.17 | 1.97 to 2.40 | 8.2 | 20.8 |
| FFM40 (derived, s low) | Low orbit, altimetry | 0.801 | 0.299 | 1.26 | 1.15 to 1.40 | 4.8 | 12.1 |
| FFM40 (derived, s high) | Low orbit, altimetry | 0.998 | 0.127 | 2.16 | 1.97 to 2.40 | 8.2 | 20.8 |
| FFM40 (derived, s low) | Strong drag, 2026 | 0.795 | 0.305 | 1.24 | 1.13 to 1.38 | 4.7 | 11.9 |
| FFM40 (derived, s high) | Strong drag, 2026 | 0.998 | 0.127 | 2.17 | 1.97 to 2.40 | 8.2 | 20.8 |
| FFM40 (derived, s low) | Near 700 km | 0.793 | 0.306 | 1.24 | 1.13 to 1.37 | 4.7 | 11.9 |
| FFM40 (derived, s high) | Near 700 km | 0.998 | 0.127 | 2.16 | 1.97 to 2.40 | 8.2 | 20.8 |

Derived series: derived from measured parts; only SGP4 flew the whole screen. Search, index and host CPU are SGP4 as measured at each N; propagation is the arm's measured CPU per state in that regime times N times 10,080; refine is a band (lower: as measured with SGP4; upper: scaled by the ratio of the arm's CPU per state to SGP4's in the same regime). Hidden assumption: candidate and event counts are held at SGP4's; whether better accuracy allows a smaller threshold is another study. The whole-screen bound 3 / p applies only to a speedup of the whole screen.

## Case order

Pearson correlation of ln(N index) with the 1-minute load (mean of start and end) across the 19 screen rows: 0.242; with the start time: 0.183. Load across the rows: 98.1 to 147.3.

## Quiet-window check

Not run: every absolute CPU figure in this file reads "under load, not quiet-checked" and is not for the page. The ratios and p stand with that caveat.

## Conversion

With p = 1.38 (95 percent interval 1.24 to 1.51; undecided) on the thinning ladder, one eighth of the compute buys 3 / p = 2.18 doublings of the object count (1.99 to 2.41): 8.3 years (7.5 to 9.2) at the payload doubling time of 3.8 years (catalog growth 2018-2026, exponential), and 20.9 years (19.1 to 23.2) at the all-objects fit of 9.6 years (2018-2026, undecided between exponential and linear). The real-dates fit gives p = 2.96 (1.87 to 4.05; undecided): 1.01 doublings, 3.9 years at 3.8 and 9.7 years at 9.6.

## Parity guard

Phased path and fused path on parity-1-8-s1: events 16091 and 16091, event-set digests equal.

## Verdict

Ladder p = 1.38 (1.24 to 1.51): undecided. Dates p = 2.96 (1.87 to 4.05): undecided. The two intervals do not overlap. Propagation takes 24.4 percent of the screen CPU at the full catalog (SGP4); a propagator of zero cost cuts the screen CPU at most by a factor 1.32.
