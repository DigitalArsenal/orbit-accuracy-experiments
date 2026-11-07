# The geosynchronous SGP4 baseline in one SGP4 mode; the Space Force XP gap by fitter and library

Report only, a re-measurement: `experiments/operator-theory/GEO-SGP4.md`, registered at 25a997b before any fit (runs 2026-11-04T14:15:42.596Z to 2026-11-04T14:19:23.848Z, 519 rows). `S` is the stored SGP4 arm (gp-error-model 0.11.0, improved mode); `S1` the same fit on gp-error-model 0.14.0 (AFSPC mode, the mode `propagator/sgp4` flies). Median 3D error, km, with the 95th percentile in brackets, on the windows where both scored.

## Arm (a): S beside S1

| Group | Windows | Satellites | Failed S / S1 | Day | Paired | S | S1 | Median shift | 95th shift |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GE | 45 | 9 | 10 / 12 | 1 | 30 | 2.52 (3.70) | 2.52 (3.70) | 0.0 m | 0.0 m |
| GE | 45 | 9 | 10 / 12 | 2 | 32 | 3.90 (6.55) | 3.90 (6.55) | 0.0 m | 0.0 m |
| GE | 45 | 9 | 10 / 12 | 3 | 28 | 5.53 (10.0) | 5.53 (10.0) | 0.0 m | -0.0 m |
| GE | 45 | 9 | 10 / 12 | 7 | 30 | 14.8 (103.3) | 14.8 (103.3) | 0.0 m | -0.0 m |
| IG | 60 | 12 | 11 / 10 | 1 | 46 | 2.01 (3.08) | 2.01 (3.08) | 0.0 m | 0.0 m |
| IG | 60 | 12 | 11 / 10 | 2 | 46 | 3.35 (5.83) | 3.35 (5.83) | 0.0 m | -0.0 m |
| IG | 60 | 12 | 11 / 10 | 3 | 46 | 5.76 (9.30) | 5.76 (9.30) | 0.0 m | -0.0 m |
| IG | 60 | 12 | 11 / 10 | 7 | 45 | 23.4 (47.7) | 23.4 (47.7) | -0.0 m | 0.0 m |
| WA 24 h | 84 | 3 | 21 / 20 | 1 | 61 | 6.10 (21.5) | 6.29 (21.5) | 195.4 m | -1.4 m |
| WA 24 h | 84 | 3 | 21 / 20 | 2 | 59 | 11.2 (74.9) | 14.4 (70.0) | 3220.1 m | -4951.8 m |
| WA 24 h | 84 | 3 | 21 / 20 | 3 | 62 | 17.5 (166.2) | 19.5 (163.1) | 1974.3 m | -3056.9 m |
| WA 24 h | 84 | 3 | 21 / 20 | 7 | 61 | 39.4 (886.8) | 42.4 (848.9) | 2941.1 m | -37894.7 m |
| WA 72 h | 84 | 3 | 28 / 26 | 1 | 54 | 8.91 (15.7) | 8.91 (15.7) | 0.0 m | 0.0 m |
| WA 72 h | 84 | 3 | 28 / 26 | 2 | 53 | 13.6 (25.4) | 13.6 (25.4) | 0.0 m | 0.0 m |
| WA 72 h | 84 | 3 | 28 / 26 | 3 | 53 | 25.4 (46.6) | 25.4 (46.6) | 0.0 m | 0.0 m |
| WA 72 h | 84 | 3 | 28 / 26 | 7 | 53 | 52.1 (181.4) | 52.1 (181.4) | 0.0 m | 0.0 m |
| GF 24 h | 3 | 2 | 0 / 0 | 1 | 3 | 2.10 (5.96) | 2.10 (5.89) | -0.0 m | -67.9 m |
| GF 24 h | 3 | 2 | 0 / 0 | 2 | 2 | 3.99 (6.21) | 3.99 (6.21) | -0.0 m | -0.0 m |
| GF 24 h | 3 | 2 | 0 / 0 | 3 | 2 | 5.27 (8.24) | 5.27 (8.24) | 0.0 m | 0.0 m |
| GF 24 h | 3 | 2 | 0 / 0 | 7 | 0 | - (-) | - (-) | - m | - m |
| GF 48 h | 2 | 1 | 0 / 0 | 1 | 2 | 4.02 (6.32) | 4.02 (6.32) | 0.0 m | 0.0 m |
| GF 48 h | 2 | 1 | 0 / 0 | 2 | 2 | 6.09 (8.50) | 6.09 (8.50) | 0.0 m | 0.0 m |
| GF 48 h | 2 | 1 | 0 / 0 | 3 | 1 | 8.38 (8.38) | 8.38 (8.38) | -0.0 m | -0.0 m |
| GF 48 h | 2 | 1 | 0 / 0 | 7 | 0 | - (-) | - (-) | - m | - m |

## Node condition and moved windows

A window crosses when two successive hourly TEME nodes of its truth lie one in [0, 90) and the other in (270, 360) degrees; near when it does not cross and comes within 5 degrees of 0. A window moves when |S1 - S| exceeds 1 m at any scored day. The modes' Lyddane branches can part only below 0.2 rad.

| Group | Counted | Crosses (down, up) | Near | Neither | Median inclination, deg | Below 0.2 rad | Moved with condition | Moved without |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GE | 45 | 0 (0, 0) | 0 | 45 | 2.86 | 45 | 0 | 0 |
| IG | 60 | 0 (0, 0) | 0 | 60 | 54.9 | 0 | 0 | 0 |
| WA 24 h | 84 | 16 (7, 16) | 3 | 65 | 0.019 | 84 | 4 | 9 |
| WA 72 h | 84 | 20 (9, 20) | 3 | 61 | 0.019 | 84 | 0 | 4 |
| GF 24 h | 3 | 0 (0, 0) | 0 | 3 | 0.023 | 3 | 0 | 1 |
| GF 48 h | 2 | 0 (0, 0) | 0 | 2 | 0.023 | 2 | 0 | 0 |
| HE all 336 h (count only) | 7 | 0 | 0 | 7 | 55.6 (55.4 to 55.8) | 0 | - | - |
| HE all 72 h (count only) | 7 | 0 | 0 | 7 | 55.6 (55.4 to 55.9) | 0 | - | - |
| HE TESS 336 h (count only) | 7 | 0 | 0 | 7 | 55.6 (55.4 to 55.8) | 0 | - | - |
| HE TESS 72 h (count only) | 7 | 0 | 0 | 7 | 55.6 (55.4 to 55.9) | 0 | - | - |
| HX all 168 h (count only) | 7 | 0 | 0 | 7 | 71.9 (71.7 to 72.2) | 0 | - | - |
| HX all 72 h (count only) | 19 | 0 | 0 | 19 | 11.9 (8.14 to 72.1) | 8 | - | - |
| HX THEMIS A 72 h (count only) | 4 | 0 | 0 | 4 | 11.9 (11.8 to 11.9) | 0 | - | - |
| HX CHANDRA 168 h (count only) | 7 | 0 | 0 | 7 | 71.9 (71.7 to 72.2) | 0 | - | - |
| HX CHANDRA 72 h (count only) | 7 | 0 | 0 | 7 | 71.9 (71.7 to 72.1) | 0 | - | - |
| HX THEMIS D 72 h (count only) | 4 | 0 | 0 | 4 | 8.14 (8.14 to 8.15) | 4 | - | - |
| HX THEMIS E 72 h (count only) | 4 | 0 | 0 | 4 | 8.17 (8.17 to 8.19) | 4 | - | - |

Every moved window (read after the run; no rule rests on it): the fitted S1 set's inclination and node at its epoch, and the truth's nearest osculating node to 0.

| Group | Window | Condition | Truth node nearest 0, deg | S1 inclination, deg | S1 node, deg | Largest shift, km |
| --- | --- | --- | --- | --- | --- | --- |
| WA 24 h | SES-15 2026-09-28 | no | 86.4 | 0.0453 | 330.5 | 0.001 |
| WA 24 h | EUTELSAT 117 WEST B 2026-09-26 | holds | 0.571 | 0.0295 | 331.6 | 0.002 |
| WA 24 h | SES-15 2026-09-26 | no | 86.5 | 0.0452 | 321.5 | 0.005 |
| WA 24 h | GALAXY 30 (G-30) 2026-10-10 | no | 115.4 | 0.0040 | 226.2 | 572.5 |
| WA 24 h | EUTELSAT 117 WEST B 2026-09-12 | holds | 0.090 | 0.0330 | 347.4 | 875.5 |
| WA 24 h | EUTELSAT 117 WEST B 2026-10-26 | holds | 0.666 | 0.0301 | 69.9 | 581.4 |
| WA 24 h | EUTELSAT 117 WEST B 2026-10-18 | holds | 3.58 | 0.0068 | 348.0 | 229.1 |
| WA 24 h | SES-15 2026-09-16 | no | 92.2 | 0.0418 | 329.9 | 0.016 |
| WA 24 h | SES-15 2026-09-30 | no | 86.4 | 0.0389 | 324.1 | 0.003 |
| WA 24 h | SES-15 2026-10-02 | no | 86.4 | 0.0357 | 331.3 | 445.0 |
| WA 24 h | SES-15 2026-10-14 | no | 73.6 | 0.0290 | 316.2 | 315.7 |
| WA 24 h | SES-15 2026-10-18 | no | 73.6 | 0.0282 | 324.2 | 489.7 |
| WA 24 h | SES-15 2026-10-22 | no | 64.7 | 0.0306 | 323.6 | 168.8 |
| WA 72 h | GALAXY 30 (G-30) 2026-10-22 | no | 94.6 | 0.0015 | 227.5 | 6.50 |
| WA 72 h | GALAXY 30 (G-30) 2026-09-06 | no | 130.1 | 0.0351 | 316.1 | 0.001 |
| WA 72 h | GALAXY 30 (G-30) 2026-10-10 | no | 115.4 | 0.0051 | 220.4 | 0.002 |
| WA 72 h | GALAXY 30 (G-30) 2026-09-14 | no | 149.0 | 0.0460 | 343.7 | 0.021 |
| GF 24 h | 2026-11-01T06:30:00.000Z 24 | no | 59.4 | - | - | 0.075 |

## Ratios against both XP builds

Windows where S, S1, whiteroom XP and Space Force XP all scored that day. Ratio: exp of the median by window of ln(SGP4 / XP), 95 % interval from 10,000 draws of satellites.

| Group | Day | Windows | Satellites | S / whiteroom | S1 / whiteroom | S / Space Force | S1 / Space Force |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GE | 1 | 30 | 9 | 67.0 [62.8, 80.7] | 67.0 [62.8, 80.7] | 12.5 [11.3, 13.5] | 12.5 [11.3, 13.5] |
| GE | 2 | 32 | 9 | 67.3 [61.2, 86.6] | 67.3 [61.2, 86.6] | 18.4 [16.8, 23.2] | 18.4 [16.8, 23.0] |
| GE | 3 | 28 | 9 | 72.8 [52.9, 90.0] | 72.8 [52.9, 90.0] | 24.9 [21.6, 30.6] | 24.9 [21.6, 30.6] |
| GE | 7 | 30 | 9 | 50.8 [0.896, 94.3] | 50.8 [0.896, 94.3] | 42.5 [0.896, 61.3] | 42.5 [0.896, 63.7] |
| IG | 1 | 46 | 12 | 55.8 [45.8, 66.4] | 55.8 [45.8, 66.1] | 12.8 [10.8, 13.9] | 12.8 [11.1, 13.9] |
| IG | 2 | 46 | 12 | 62.7 [51.5, 72.7] | 62.7 [51.5, 72.7] | 21.0 [16.4, 24.9] | 21.0 [16.4, 24.9] |
| IG | 3 | 46 | 12 | 69.7 [61.9, 83.8] | 69.7 [61.9, 83.8] | 29.4 [23.1, 38.3] | 29.4 [22.9, 38.2] |
| IG | 7 | 45 | 12 | 120.9 [97.1, 154.7] | 120.9 [97.1, 154.7] | 97.6 [72.1, 103.1] | 97.6 [72.1, 103.0] |
| WA 24 h | 1 | 61 | 3 | 2.80 [1.39, 16.1] | 2.88 [1.39, 19.2] | 2.78 [1.36, 5.38] | 2.82 [1.36, 5.38] |
| WA 24 h | 2 | 59 | 3 | 1.91 [1.24, 5.61] | 2.25 [1.39, 6.02] | 1.99 [1.23, 5.48] | 2.11 [1.39, 6.39] |
| WA 24 h | 3 | 62 | 3 | 2.27 [1.61, 7.73] | 2.65 [1.88, 7.73] | 2.26 [1.65, 7.90] | 2.55 [1.94, 7.90] |
| WA 24 h | 7 | 61 | 3 | 1.41 [1.14, 22.8] | 1.53 [1.21, 21.7] | 1.38 [1.11, 21.7] | 1.47 [1.21, 21.2] |
| WA 72 h | 1 | 54 | 3 | 1.83 [1.03, 1.95] | 1.83 [1.03, 1.95] | 1.84 [1.03, 1.94] | 1.84 [1.03, 1.94] |
| WA 72 h | 2 | 53 | 3 | 3.02 [0.856, 4.09] | 3.02 [0.856, 4.09] | 3.02 [0.859, 4.14] | 3.02 [0.859, 4.14] |
| WA 72 h | 3 | 53 | 3 | 2.92 [0.979, 3.83] | 2.92 [0.979, 3.83] | 2.93 [0.989, 3.93] | 2.93 [0.989, 3.93] |
| WA 72 h | 7 | 53 | 3 | 2.35 [0.953, 5.34] | 2.35 [0.953, 5.34] | 2.33 [0.951, 5.41] | 2.33 [0.951, 5.41] |
| GF 24 h | 1 | 3 | 2 | 1.06 [1.06, 1.09] | 1.04 [1.04, 1.09] | 1.12 [1.12, 1.16] | 1.11 [1.11, 1.16] |
| GF 24 h | 2 | 2 | 1 | 0.731 [0.731, 0.731] | 0.731 [0.731, 0.731] | 0.783 [0.783, 0.783] | 0.783 [0.783, 0.783] |
| GF 24 h | 3 | 2 | 1 | 0.691 [0.691, 0.691] | 0.691 [0.691, 0.691] | 0.744 [0.744, 0.744] | 0.744 [0.744, 0.744] |
| GF 24 h | 7 | 0 | 0 | - | - | - | - |
| GF 48 h | 1 | 2 | 1 | 1.17 [1.17, 1.17] | 1.17 [1.17, 1.17] | 1.20 [1.20, 1.20] | 1.20 [1.20, 1.20] |
| GF 48 h | 2 | 2 | 1 | 1.45 [1.45, 1.45] | 1.45 [1.45, 1.45] | 1.48 [1.48, 1.48] | 1.48 [1.48, 1.48] |
| GF 48 h | 3 | 1 | 1 | 0.746 [0.746, 0.746] | 0.746 [0.746, 0.746] | 0.743 [0.743, 0.743] | 0.743 [0.743, 0.743] |
| GF 48 h | 7 | 0 | 0 | - | - | - | - |

## Arm (b): fitter by library, GE and IG, 72 h

WW: whiteroom set on the whiteroom propagator (stored); SS: Space Force set on the Space Force library 9.1.1.0 (stored); WS: whiteroom set on the Space Force library; SW: Space Force set on the whiteroom propagator. Windows where all four scored that day.

| Group | Day | Windows | Satellites | WW | SS | WS | SW | WS / WW | WS / SS | SW / SS | SW / WW |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GE | 1 | 32 | 9 | 0.037 (0.049) | 0.213 (0.260) | 0.213 (0.258) | 0.048 (0.064) | 5.56 [4.48, 6.19] | 0.992 [0.984, 1.00] | 0.216 [0.188, 0.292] | 1.24 [1.04, 1.49] |
| GE | 2 | 33 | 9 | 0.051 (1.46) | 0.210 (1.56) | 0.208 (1.58) | 0.065 (1.45) | 3.04 [2.51, 3.73] | 0.980 [0.947, 1.01] | 0.379 [0.268, 0.530] | 1.19 [0.998, 1.63] |
| GE | 3 | 30 | 9 | 0.070 (4.70) | 0.188 (4.71) | 0.172 (4.77) | 0.086 (4.66) | 2.22 [1.65, 2.47] | 0.966 [0.896, 1.01] | 0.574 [0.445, 0.659] | 1.13 [0.989, 1.61] |
| GE | 7 | 32 | 9 | 0.225 (112.0) | 0.294 (112.0) | 0.287 (112.0) | 0.248 (112.0) | 1.18 [1.000, 1.42] | 1.00 [0.911, 1.05] | 0.900 [0.822, 1.00] | 0.999 [0.916, 1.33] |
| IG | 1 | 60 | 12 | 0.038 (0.060) | 0.166 (0.238) | 0.164 (0.236) | 0.053 (0.077) | 4.45 [3.69, 5.36] | 0.985 [0.977, 0.990] | 0.290 [0.268, 0.320] | 1.27 [1.13, 1.59] |
| IG | 2 | 60 | 12 | 0.057 (0.083) | 0.183 (0.245) | 0.173 (0.245) | 0.075 (0.116) | 3.07 [2.73, 3.37] | 0.966 [0.943, 0.981] | 0.432 [0.393, 0.489] | 1.19 [1.12, 1.46] |
| IG | 3 | 60 | 12 | 0.079 (0.132) | 0.180 (0.263) | 0.162 (0.252) | 0.095 (0.176) | 2.32 [1.84, 2.58] | 0.958 [0.921, 0.978] | 0.607 [0.503, 0.633] | 1.16 [1.06, 1.35] |
| IG | 7 | 59 | 12 | 0.164 (0.496) | 0.232 (0.588) | 0.215 (0.506) | 0.183 (0.580) | 1.12 [1.08, 1.26] | 0.930 [0.877, 0.999] | 0.902 [0.866, 0.933] | 1.08 [1.00, 1.17] |

- GE: 45 windows, 9 satellites; failed WW 10, SS 10, WS 10, SW 10 (coverage; coverage). Refits against the stored cells: whiteroom 35 of 35 identical (largest difference 0.000 m), Space Force 35 of 35 (0.000 m). Registered rule at day 1: library cleared no; fit confirmed no.
- IG: 60 windows, 12 satellites; failed WW 0, SS 0, WS 0, SW 0. Refits against the stored cells: whiteroom 60 of 60 identical (largest difference 0.000 m), Space Force 60 of 60 (0.000 m). Registered rule at day 1: library cleared no; fit confirmed no.

## Reading

- GE and IG: S1 equals S within 1 m on every window where both scored (GE 30 windows at day 1, IG 46); no GE or IG window meets the node condition. S1 fails 12 GE windows against S's 10, 10 IG against 11. The ratios against both XP builds are unchanged by the mode.
- WA and part F: SGP4 moves on windows the registered node condition does not mark (WA 24 h 9, WA 72 h 4, GF 24 h 1); these satellites are station-kept below 0.05 degrees (the part F window's broadcast truth has also grown since the stored run), and the condition reads the truth's osculating node, which at such inclinations need not track the theory's mean node (not tested).
- The 2x2, day 1: the whiteroom set flown on the Space Force library scores 0.992 times the Space Force set there (GE; IG 0.985), and the Space Force set on the whiteroom propagator 1.24 times the whiteroom set (GE; IG 1.27): the gap follows the propagator, not the fitter. Neither registered statement (library cleared, fit confirmed) is met.
- Arm (c), day 1: on 9.9 the whiteroom set scores 0.037 km and the Space Force set 0.048 km at GE (IG 0.038 and 0.053), equal to their whiteroom flights; the registered decision for every set and group: the 9.1.1.0 C/WASM build departs from the Space Force's own XP on these sets. The oracle's own 9.1.1.0 leg also flies every set within 7.9 m of the whiteroom flight, so the 0.1 to 0.24 km departure is the sgp4-xp module's flight of these sets, not 9.1.1.0 as the oracle runs it.
- Eclipse split: 39 of 45 GE windows and 0 of 60 IG windows enter the shadow cylinder; the module's 9.1.1.0-minus-whiteroom difference at day 1 is 0.123 km on IG with no shadow at all, so shadow does not explain it there; on GE it is 0.183 km on eclipsed windows and 0.058 km on the 5 sunlit ones.

## Amendment 1, arm (c): the same sets on Sgp4Prop 9.9

Amendment 1 (b67b1bf), written after the first run and before any of these flights (2026-11-04T14:31:17.686Z to 2026-11-04T14:36:05.439Z). Each fitter's set, as two-line text, flown on the whiteroom propagator, on the sgp4-xp module's 9.1.1.0, and on 9.9 through the oracle (predictions only). Median km (95th), windows where all three scored.

| Group | Set | Day | Windows | Satellites | Whiteroom | 9.1.1.0 (module) | 9.9 (oracle) | 9.9 / whiteroom | 9.9 / 9.1.1.0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GE | whiteroom fit | 1 | 32 | 9 | 0.037 (0.049) | 0.213 (0.258) | 0.037 (0.051) | 1.000 [1.000, 1.000] | 0.181 [0.162, 0.223] |
| GE | whiteroom fit | 2 | 33 | 9 | 0.051 (1.46) | 0.208 (1.58) | 0.051 (1.46) | 1.000 [1.000, 1.00] | 0.335 [0.267, 0.398] |
| GE | whiteroom fit | 3 | 30 | 9 | 0.070 (4.70) | 0.172 (4.77) | 0.071 (4.70) | 1.000 [1.000, 1.00] | 0.450 [0.404, 0.607] |
| GE | whiteroom fit | 7 | 32 | 9 | 0.225 (112.0) | 0.287 (112.0) | 0.225 (112.0) | 1.00 [1.000, 1.00] | 0.849 [0.705, 1.00] |
| GE | Space Force fit | 1 | 32 | 9 | 0.048 (0.064) | 0.213 (0.260) | 0.048 (0.064) | 1.00 [1.00, 1.00] | 0.216 [0.188, 0.292] |
| GE | Space Force fit | 2 | 33 | 9 | 0.065 (1.45) | 0.210 (1.56) | 0.065 (1.45) | 1.00 [1.00, 1.00] | 0.379 [0.262, 0.530] |
| GE | Space Force fit | 3 | 30 | 9 | 0.086 (4.66) | 0.188 (4.71) | 0.087 (4.66) | 1.00 [1.000, 1.00] | 0.574 [0.442, 0.659] |
| GE | Space Force fit | 7 | 32 | 9 | 0.248 (112.0) | 0.294 (112.0) | 0.248 (112.0) | 1.00 [1.000, 1.00] | 0.902 [0.822, 1.00] |
| IG | whiteroom fit | 1 | 60 | 12 | 0.038 (0.060) | 0.164 (0.236) | 0.038 (0.060) | 1.000 [1.000, 1.000] | 0.225 [0.186, 0.272] |
| IG | whiteroom fit | 2 | 60 | 12 | 0.057 (0.083) | 0.173 (0.245) | 0.057 (0.083) | 1.000 [1.000, 1.00] | 0.326 [0.296, 0.364] |
| IG | whiteroom fit | 3 | 60 | 12 | 0.079 (0.132) | 0.162 (0.252) | 0.079 (0.132) | 1.000 [1.000, 1.00] | 0.432 [0.388, 0.545] |
| IG | whiteroom fit | 7 | 59 | 12 | 0.164 (0.496) | 0.215 (0.506) | 0.164 (0.496) | 1.000 [1.000, 1.00] | 0.895 [0.794, 0.927] |
| IG | Space Force fit | 1 | 60 | 12 | 0.053 (0.077) | 0.166 (0.238) | 0.053 (0.077) | 1.000 [1.000, 1.00] | 0.290 [0.268, 0.320] |
| IG | Space Force fit | 2 | 60 | 12 | 0.075 (0.116) | 0.183 (0.245) | 0.075 (0.116) | 1.000 [1.000, 1.00] | 0.432 [0.385, 0.490] |
| IG | Space Force fit | 3 | 60 | 12 | 0.095 (0.176) | 0.180 (0.263) | 0.095 (0.176) | 1.000 [1.000, 1.00] | 0.607 [0.490, 0.633] |
| IG | Space Force fit | 7 | 59 | 12 | 0.183 (0.580) | 0.232 (0.588) | 0.183 (0.580) | 1.000 [1.000, 1.00] | 0.902 [0.866, 0.933] |

- GE, whiteroom fit: day-1 median of 9.9 is 0.0 m from the whiteroom flight and 175.7 m from the module's 9.1.1.0; registered decision: the 9.1.1.0 C/WASM build departs from the Space Force's own XP on these sets. The oracle's own 9.1.1.0 leg against the module's 9.1.1.0 flight: largest difference 0.238 km over 35 windows; against the whiteroom flight 7.901 m; 9.9 against whiteroom 5.919 m.
- GE, Space Force fit: day-1 median of 9.9 is 0.0 m from the whiteroom flight and 165.2 m from the module's 9.1.1.0; registered decision: the 9.1.1.0 C/WASM build departs from the Space Force's own XP on these sets. The oracle's own 9.1.1.0 leg against the module's 9.1.1.0 flight: largest difference 0.235 km over 35 windows; against the whiteroom flight 6.252 m; 9.9 against whiteroom 5.073 m.
- IG, whiteroom fit: day-1 median of 9.9 is 0.0 m from the whiteroom flight and 126.2 m from the module's 9.1.1.0; registered decision: the 9.1.1.0 C/WASM build departs from the Space Force's own XP on these sets. The oracle's own 9.1.1.0 leg against the module's 9.1.1.0 flight: largest difference 0.218 km over 60 windows; against the whiteroom flight 0.000 m; 9.9 against whiteroom 0.000 m.
- IG, Space Force fit: day-1 median of 9.9 is 0.0 m from the whiteroom flight and 112.4 m from the module's 9.1.1.0; registered decision: the 9.1.1.0 C/WASM build departs from the Space Force's own XP on these sets. The oracle's own 9.1.1.0 leg against the module's 9.1.1.0 flight: largest difference 0.214 km over 60 windows; against the whiteroom flight 0.000 m; 9.9 against whiteroom 0.000 m.

## Amendment 1: eclipse split

A window is eclipsed when any truth state of its 72 h arc or its seven days after the cutoff lies in the cylinder of radius 6,378.137 km behind the Earth from the Sun (the Sun from foundation/frames, hourly). Median of the 9.1.1.0-minus-whiteroom flight difference, km, by flag (count in brackets).

| Group | Day | Whiteroom set, eclipsed | Whiteroom set, sunlit | Space Force set, eclipsed | Space Force set, sunlit |
| --- | --- | --- | --- | --- | --- |
| GE | 1 | 0.183 (27) | 0.058 (5) | 0.177 (27) | 0.046 (5) |
| GE | 2 | 0.153 (28) | 0.048 (5) | 0.150 (28) | 0.036 (5) |
| GE | 3 | 0.106 (26) | 0.047 (4) | 0.098 (26) | 0.038 (4) |
| GE | 7 | 0.032 (27) | 0.059 (5) | 0.022 (27) | 0.038 (5) |
| IG | 1 | - (0) | 0.123 (60) | - (0) | 0.125 (60) |
| IG | 2 | - (0) | 0.118 (60) | - (0) | 0.109 (60) |
| IG | 3 | - (0) | 0.088 (60) | - (0) | 0.073 (60) |
| IG | 7 | - (0) | 0.027 (59) | - (0) | 0.026 (59) |

- GE: 39 of 45 windows eclipsed (39 in the arc, 31 in the flight), median 215.0 minutes in shadow.
- IG: 0 of 60 windows eclipsed (0 in the arc, 0 in the flight), median - minutes in shadow.

## Amendment 1: WA and part F windows that moved without the node rule (reported, not gated)

| Group | Window | S1 inclination, deg | S in-arc RMS, km | S1 in-arc RMS, km | Largest shift, km | Refits reproduce (S, S1) | Truth as stored |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WA 24 h | WA SES-15 2026-09-28 | 0.0453 | 1.38 | 1.38 | 0.001 | yes, yes | yes |
| WA 24 h | WA SES-15 2026-09-26 | 0.0452 | 2.57 | 2.57 | 0.005 | yes, yes | yes |
| WA 24 h | WA GALAXY 30 (G-30) 2026-10-10 | 0.0040 | 1.31 | 1.20 | 572.5 | yes, yes | yes |
| WA 24 h | WA SES-15 2026-09-16 | 0.0418 | 3.50 | 3.50 | 0.016 | yes, yes | yes |
| WA 24 h | WA SES-15 2026-09-30 | 0.0389 | 1.32 | 1.32 | 0.003 | yes, yes | yes |
| WA 24 h | WA SES-15 2026-10-02 | 0.0357 | 1.20 | 1.12 | 445.0 | yes, yes | yes |
| WA 24 h | WA SES-15 2026-10-14 | 0.0290 | 1.09 | 1.02 | 315.7 | yes, yes | yes |
| WA 24 h | WA SES-15 2026-10-18 | 0.0282 | 0.766 | 0.888 | 489.7 | yes, yes | yes |
| WA 24 h | WA SES-15 2026-10-22 | 0.0306 | 0.871 | 0.857 | 168.8 | yes, yes | yes |
| WA 72 h | WA GALAXY 30 (G-30) 2026-10-22 | 0.0015 | 3.23 | 3.36 | 6.50 | yes, yes | yes |
| WA 72 h | WA GALAXY 30 (G-30) 2026-09-06 | 0.0351 | 2.21 | 2.21 | 0.001 | yes, yes | yes |
| WA 72 h | WA GALAXY 30 (G-30) 2026-10-10 | 0.0051 | 3.41 | 3.41 | 0.002 | yes, yes | yes |
| WA 72 h | WA GALAXY 30 (G-30) 2026-09-14 | 0.0460 | 4.70 | 4.70 | 0.021 | yes, yes | yes |
| GF 24 h | 42709 2026-11-01T06:30:00.000Z 24 | 0.0210 | 0.598 | 0.599 | 0.075 | no, yes | no: the broadcast has grown since the stored run, so S cannot be reproduced and the shift is not the mode's |

## What else changed

`results/ap-truth/compare/regimes.json` and `regimes.md`: the GE and IG cells' SGP4 figures are S1's; every other cell is byte-identical to b635c6e. Unchanged files, SHA-256 equal to b635c6e: `table.json` yes, `table.md` yes, `cells.json` yes, `xp-versions.json` yes, `truth.json` yes. `table.json` holds no GE, IG, WA or geostationary-provider row. The WA and part F figures (`results/ap-truth/geo`) and the site's `cells.json` are outside this task's paths; their S1 figures are in `results.json` (`armA`).

Rebuild: `geo-sgp4-run.mjs --part a|n|b` into `<archive>/operator-theory/ap/geo-sgp4-one-mode/<part>`, then `geo-sgp4-table.mjs --out results/operator-theory/geo-sgp4-one-mode --compare results/ap-truth/compare`.
