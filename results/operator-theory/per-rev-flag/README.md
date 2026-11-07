# The per-revolution maneuver flag on every stored window

Post hoc, `experiments/operator-theory/PER-REV-FLAG.md`: the rule was chosen after the Sentinel-1 analysis `S1-24H-DAY7.md`, and every window here was read before. `experiments/operator-theory/per-rev-flag.mjs` flies FFM24 (propagator/ffm 2.2.0) over [cutoff - 72 h, cutoff + 168 h] on each window; `per-rev-flag-table.mjs` writes `table.json` and this file from its rows. Strong drag (Swarm, GRACE-FO) is held and not flown.

## Windows flown

| Regime | Windows | Flown | FFM24 fitted and flown | Not flown, by reason |
| --- | --- | --- | --- | --- |
| Near 700 km | 300 | 300 | 287 | coverage: 13 |
| Geostationary (GFZ) | 45 | 45 | 41 | coverage: 4 |
| Geostationary, WAAS | 84 | 84 | 79 | coverage: 5 |
| Low orbit, laser spheres | 75 | 75 | 61 | coverage: 14 |
| Laser geodetic | 44 | 44 | 44 | - |
| Medium Earth orbit | 750 | 750 | 749 | coverage: 1 |
| Inclined geosynchronous | 60 | 60 | 60 | - |
| Low orbit, altimetry | 138 | 138 | 136 | coverage: 2 |
| Highly elliptical, TESS | 7 | 7 | 7 | - |
| Highly elliptical, THEMIS and Chandra | 19 | 19 | 19 | - |

## FFM against AP, burn and burn-free on the new flag

Before: the 8 m truth step (Sentinel-1, altimetry, WAAS), the geosynchronous burn record (GFZ geostationary) or TESS's perigee steps, flagged / burn-free / unchecked / no record. After: this rule, flagged / burn-free / unchecked / not flown. Ratios are exp(median ln(FFM / AP)) with 95 % object-week intervals.

| Regime | Fit, h | Lead, h | FFM | Windows | Before | After | FFM/AP all | FFM/AP flagged | FFM/AP burn-free | Interval, burn-free | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Near 700 km | 24 | 24 | 2.2.0 | 276 | 34 / 220 / 22 / 0 | 87 / 167 / 22 / 0 | 0.232 | 1.101 | 0.133 | [0.104, 0.166] | explained: FFM ahead of AP on the burn-free windows |
| Near 700 km | 24 | 48 | 2.2.0 | 274 | 46 / 200 / 28 / 0 | 149 / 97 / 28 / 0 | 0.786 | 1.331 | 0.168 | [0.118, 0.199] | explained: FFM ahead of AP on the burn-free windows |
| Near 700 km | 24 | 72 | 2.2.0 | 275 | 60 / 182 / 33 / 0 | 201 / 50 / 24 / 0 | 1.173 | 1.421 | 0.172 | [0.106, 0.206] | explained: FFM ahead of AP on the burn-free windows |
| Near 700 km | 24 | 168 | 2.2.0 | 274 | 116 / 128 / 30 / 0 | 267 / 5 / 2 / 0 | 2.055 | 2.098 | 0.185 | [0.143, 0.813] | explained: FFM ahead of AP on the burn-free windows |
| Near 700 km | 72 | 24 | 2.2.0 | 259 | 56 / 184 / 19 / 0 | 196 / 50 / 13 / 0 | 0.977 | 1 | 0.395 | [0.281, 0.659] | explained: FFM ahead of AP on the burn-free windows |
| Near 700 km | 72 | 48 | 2.2.0 | 258 | 65 / 169 / 24 / 0 | 220 / 28 / 10 / 0 | 1.024 | 1.029 | 0.714 | [0.431, 0.956] | explained: FFM ahead of AP on the burn-free windows |
| Near 700 km | 72 | 72 | 2.2.0 | 258 | 75 / 155 / 28 / 0 | 230 / 18 / 10 / 0 | 1.04 | 1.044 | 0.926 | [0.496, 1.321] | explained: parity on the burn-free windows (the interval holds 1) |
| Near 700 km | 72 | 168 | 2.2.0 | 257 | 122 / 108 / 27 / 0 | 250 / 2 / 5 / 0 | 1.037 | 1.038 | 0.538 | [0.538, 0.538] | explained: FFM ahead of AP on the burn-free windows |
| Geostationary (GFZ) | 72 | 24 | 2.2.0 | 32 | 2 / 30 / 0 / 0 | 0 / 32 / 0 / 0 | 0.624 | - | 0.624 | [0.505, 0.679] | explained: FFM ahead of AP on the burn-free windows |
| Geostationary (GFZ) | 72 | 48 | 2.2.0 | 33 | 6 / 27 / 0 / 0 | 2 / 31 / 0 / 0 | 0.937 | 0.999 | 0.908 | [0.793, 1.162] | explained: parity on the burn-free windows (the interval holds 1) |
| Geostationary (GFZ) | 72 | 72 | 2.2.0 | 30 | 5 / 25 / 0 / 0 | 2 / 28 / 0 / 0 | 1.088 | 0.999 | 1.142 | [0.904, 1.527] | explained: parity on the burn-free windows (the interval holds 1) |
| Geostationary (GFZ) | 72 | 168 | 2.2.0 | 32 | 14 / 18 / 0 / 0 | 8 / 23 / 1 / 0 | 1.04 | 0.999 | 1.463 | [1.028, 1.97] | FFM defect: FFM worse than AP on the burn-free windows |
| Geostationary, WAAS | 24 | 24 | 2.0.4 | 77 | 13 / 64 / 0 / 0 | 0 / 73 / 4 / 0 | 1 | - | 1 | [0.999, 1.001] | explained: parity on the burn-free windows (the interval holds 1) |
| Geostationary, WAAS | 24 | 48 | 2.0.4 | 74 | 21 / 53 / 0 / 0 | 69 / 3 / 2 / 0 | 1.001 | 1.001 | 1.188 | [0.997, 2.454] | explained: parity on the burn-free windows (the interval holds 1) |
| Geostationary, WAAS | 24 | 72 | 2.0.4 | 78 | 22 / 56 / 0 / 0 | 76 / 1 / 1 / 0 | 1.001 | 1.001 | 0.998 | [0.998, 0.998] | explained: FFM ahead of AP on the burn-free windows |
| Geostationary, WAAS | 24 | 168 | 2.0.4 | 76 | 33 / 43 / 0 / 0 | 75 / 1 / 0 / 0 | 1 | 1 | 0.998 | [0.998, 0.998] | explained: FFM ahead of AP on the burn-free windows |
| Geostationary, WAAS | 72 | 24 | 2.0.4 | 76 | 22 / 53 / 1 / 0 | 72 / 1 / 3 / 0 | 0.999 | 0.999 | 0.997 | [0.997, 0.997] | explained: FFM ahead of AP on the burn-free windows |
| Geostationary, WAAS | 72 | 48 | 2.0.4 | 73 | 27 / 45 / 1 / 0 | 70 / 0 / 3 / 0 | 1 | 1 | - | - | undecided: no burn-free window |
| Geostationary, WAAS | 72 | 72 | 2.0.4 | 75 | 27 / 47 / 1 / 0 | 73 / 0 / 2 / 0 | 1 | 1 | - | - | undecided: no burn-free window |
| Geostationary, WAAS | 72 | 168 | 2.0.4 | 74 | 33 / 40 / 1 / 0 | 71 / 0 / 3 / 0 | 1 | 1 | - | - | undecided: no burn-free window |
| Low orbit, laser spheres | 24 | 24 | 2.2.0 | 51 | 0 / 0 / 0 / 51 | 28 / 21 / 2 / 0 | 0.663 | 0.451 | 0.979 | [0.877, 1.063] | false alarms 28 (0.549) |
| Low orbit, laser spheres | 24 | 48 | 2.2.0 | 49 | 0 / 0 / 0 / 49 | 29 / 18 / 2 / 0 | 0.831 | 0.542 | 1.24 | [0.923, 1.772] | false alarms 29 (0.592) |
| Low orbit, laser spheres | 24 | 72 | 2.2.0 | 43 | 0 / 0 / 0 / 43 | 25 / 16 / 2 / 0 | 0.907 | 0.626 | 1.198 | [0.961, 2.061] | false alarms 25 (0.581) |
| Low orbit, laser spheres | 24 | 168 | 2.2.0 | 49 | 0 / 0 / 0 / 49 | 29 / 16 / 4 / 0 | 0.569 | 0.504 | 0.67 | [0.47, 1.022] | false alarms 29 (0.592) |
| Low orbit, laser spheres | 72 | 24 | 2.2.0 | 56 | 0 / 0 / 0 / 56 | 26 / 20 / 10 / 0 | 1.019 | 0.876 | 1.446 | [1.21, 1.78] | false alarms 26 (0.464) |
| Low orbit, laser spheres | 72 | 48 | 2.2.0 | 54 | 0 / 0 / 0 / 54 | 27 / 18 / 9 / 0 | 1.028 | 0.927 | 1.077 | [0.962, 1.636] | false alarms 27 (0.5) |
| Low orbit, laser spheres | 72 | 72 | 2.2.0 | 50 | 0 / 0 / 0 / 50 | 25 / 15 / 10 / 0 | 0.968 | 0.845 | 0.958 | [0.746, 1.813] | false alarms 25 (0.5) |
| Low orbit, laser spheres | 72 | 168 | 2.2.0 | 56 | 0 / 0 / 0 / 56 | 29 / 15 / 12 / 0 | 0.76 | 0.796 | 0.541 | [0.299, 1.261] | false alarms 29 (0.518) |
| Laser geodetic | 72 | 24 | 2.2.0 | 43 | 0 / 0 / 0 / 43 | 1 / 42 / 0 / 0 | 0.096 | 0.535 | 0.095 | [0.073, 0.298] | false alarms 1 (0.023) |
| Laser geodetic | 72 | 48 | 2.2.0 | 43 | 0 / 0 / 0 / 43 | 1 / 42 / 0 / 0 | 0.215 | 0.707 | 0.211 | [0.139, 0.455] | false alarms 1 (0.023) |
| Laser geodetic | 72 | 72 | 2.2.0 | 43 | 0 / 0 / 0 / 43 | 1 / 42 / 0 / 0 | 0.304 | 0.724 | 0.292 | [0.183, 0.572] | false alarms 1 (0.023) |
| Laser geodetic | 72 | 168 | 2.2.0 | 43 | 0 / 0 / 0 / 43 | 1 / 41 / 1 / 0 | 0.631 | 0.79 | 0.499 | [0.301, 0.772] | false alarms 1 (0.023) |
| Medium Earth orbit | 24 | 24 | 2.2.0 | 748 | 0 / 0 / 0 / 748 | 0 / 748 / 0 / 0 | 0.053 | - | 0.053 | [0.042, 0.06] | - |
| Medium Earth orbit | 24 | 48 | 2.2.0 | 748 | 0 / 0 / 0 / 748 | 1 / 747 / 0 / 0 | 0.1 | 0.939 | 0.1 | [0.078, 0.111] | - |
| Medium Earth orbit | 24 | 72 | 2.2.0 | 748 | 0 / 0 / 0 / 748 | 2 / 746 / 0 / 0 | 0.143 | 0.886 | 0.143 | [0.114, 0.161] | - |
| Medium Earth orbit | 24 | 168 | 2.2.0 | 748 | 0 / 0 / 0 / 748 | 7 / 741 / 0 / 0 | 0.317 | 0.971 | 0.314 | [0.246, 0.35] | - |
| Medium Earth orbit | 72 | 24 | 2.2.0 | 746 | 0 / 0 / 0 / 746 | 0 / 746 / 0 / 0 | 0.276 | - | 0.276 | [0.221, 0.353] | - |
| Medium Earth orbit | 72 | 48 | 2.2.0 | 746 | 0 / 0 / 0 / 746 | 1 / 745 / 0 / 0 | 0.468 | 0.996 | 0.468 | [0.395, 0.555] | - |
| Medium Earth orbit | 72 | 72 | 2.2.0 | 746 | 0 / 0 / 0 / 746 | 3 / 743 / 0 / 0 | 0.614 | 0.996 | 0.611 | [0.528, 0.708] | - |
| Medium Earth orbit | 72 | 168 | 2.2.0 | 746 | 0 / 0 / 0 / 746 | 9 / 737 / 0 / 0 | 0.853 | 0.988 | 0.843 | [0.787, 0.904] | - |
| Inclined geosynchronous | 72 | 24 | 2.2.0 | 60 | 0 / 0 / 0 / 60 | 6 / 54 / 0 / 0 | 0.198 | 0.185 | 0.2 | [0.176, 0.282] | - |
| Inclined geosynchronous | 72 | 48 | 2.2.0 | 60 | 0 / 0 / 0 / 60 | 22 / 38 / 0 / 0 | 0.364 | 0.362 | 0.373 | [0.331, 0.751] | - |
| Inclined geosynchronous | 72 | 72 | 2.2.0 | 60 | 0 / 0 / 0 / 60 | 40 / 20 / 0 / 0 | 0.564 | 0.588 | 0.526 | [0.423, 0.873] | - |
| Inclined geosynchronous | 72 | 168 | 2.2.0 | 59 | 0 / 0 / 0 / 59 | 59 / 0 / 0 / 0 | 0.921 | 0.921 | - | - | - |
| Low orbit, altimetry | 24 | 24 | 2.2.0 | 136 | 13 / 123 / 0 / 0 | 12 / 124 / 0 / 0 | 0.121 | 1.001 | 0.113 | [0.096, 0.14] | - |
| Low orbit, altimetry | 24 | 48 | 2.2.0 | 132 | 17 / 115 / 0 / 0 | 17 / 115 / 0 / 0 | 0.152 | 1.076 | 0.136 | [0.102, 0.158] | - |
| Low orbit, altimetry | 24 | 72 | 2.2.0 | 121 | 21 / 100 / 0 / 0 | 21 / 100 / 0 / 0 | 0.144 | 1.098 | 0.12 | [0.095, 0.142] | - |
| Low orbit, altimetry | 24 | 168 | 2.2.0 | 103 | 32 / 71 / 0 / 0 | 32 / 69 / 2 / 0 | 0.182 | 1.202 | 0.129 | [0.102, 0.152] | - |
| Low orbit, altimetry | 72 | 24 | 2.2.0 | 136 | 23 / 113 / 0 / 0 | 23 / 113 / 0 / 0 | 0.474 | 0.997 | 0.286 | [0.244, 0.472] | - |
| Low orbit, altimetry | 72 | 48 | 2.2.0 | 132 | 27 / 105 / 0 / 0 | 28 / 104 / 0 / 0 | 0.548 | 1 | 0.397 | [0.301, 0.507] | - |
| Low orbit, altimetry | 72 | 72 | 2.2.0 | 121 | 29 / 92 / 0 / 0 | 30 / 91 / 0 / 0 | 0.708 | 1 | 0.421 | [0.311, 0.584] | - |
| Low orbit, altimetry | 72 | 168 | 2.2.0 | 103 | 40 / 63 / 0 / 0 | 40 / 61 / 2 / 0 | 0.905 | 1 | 0.442 | [0.326, 0.512] | - |
| Highly elliptical, TESS | 72 | 24 | 2.2.0 | 7 | 6 / 1 / 0 / 0 | 0 / 0 / 7 / 0 | 0.623 | - | - | - | - |
| Highly elliptical, TESS | 72 | 48 | 2.2.0 | 7 | 6 / 1 / 0 / 0 | 0 / 0 / 7 / 0 | 1.354 | - | - | - | - |
| Highly elliptical, TESS | 72 | 72 | 2.2.0 | 7 | 6 / 1 / 0 / 0 | 0 / 0 / 7 / 0 | 1.638 | - | - | - | - |
| Highly elliptical, TESS | 72 | 168 | 2.2.0 | 7 | 7 / 0 / 0 / 0 | 0 / 0 / 7 / 0 | 2.012 | - | - | - | - |
| Highly elliptical, TESS | 336 | 24 | 2.2.0 | 7 | 6 / 1 / 0 / 0 | 0 / 0 / 7 / 0 | 0.73 | - | - | - | - |
| Highly elliptical, TESS | 336 | 48 | 2.2.0 | 7 | 6 / 1 / 0 / 0 | 0 / 0 / 7 / 0 | 0.443 | - | - | - | - |
| Highly elliptical, TESS | 336 | 72 | 2.2.0 | 7 | 6 / 1 / 0 / 0 | 0 / 0 / 7 / 0 | 0.47 | - | - | - | - |
| Highly elliptical, TESS | 336 | 168 | 2.2.0 | 7 | 7 / 0 / 0 / 0 | 0 / 0 / 7 / 0 | 0.653 | - | - | - | - |
| Highly elliptical, THEMIS and Chandra | 72 | 24 | 2.2.0 | 19 | 0 / 0 / 0 / 19 | 0 / 15 / 4 / 0 | 0.076 | - | 0.078 | [0.053, 0.907] | - |
| Highly elliptical, THEMIS and Chandra | 72 | 48 | 2.2.0 | 19 | 0 / 0 / 0 / 19 | 0 / 17 / 2 / 0 | 0.08 | - | 0.081 | [0.047, 0.945] | - |
| Highly elliptical, THEMIS and Chandra | 72 | 72 | 2.2.0 | 19 | 0 / 0 / 0 / 19 | 3 / 16 / 0 / 0 | 0.086 | 0.177 | 0.084 | [0, 0.231] | - |
| Highly elliptical, THEMIS and Chandra | 72 | 168 | 2.2.0 | 19 | 0 / 0 / 0 / 19 | 6 / 13 / 0 / 0 | 0.235 | 0.978 | 0.167 | [0.14, 0.979] | - |
| Highly elliptical, THEMIS and Chandra | 168 | 24 | 2.2.0 | 7 | 0 / 0 / 0 / 7 | 0 / 3 / 4 / 0 | 0.961 | - | 0.952 | [0.936, 0.957] | - |
| Highly elliptical, THEMIS and Chandra | 168 | 48 | 2.2.0 | 7 | 0 / 0 / 0 / 7 | 0 / 3 / 4 / 0 | 0.974 | - | 0.871 | [0.83, 1.029] | - |
| Highly elliptical, THEMIS and Chandra | 168 | 72 | 2.2.0 | 7 | 0 / 0 / 0 / 7 | 2 / 1 / 4 / 0 | 0.98 | 0.963 | 1.044 | [1.044, 1.044] | - |
| Highly elliptical, THEMIS and Chandra | 168 | 168 | 2.2.0 | 7 | 0 / 0 / 0 / 7 | 5 / 0 / 2 / 0 | 0.986 | 0.997 | - | - | - |

