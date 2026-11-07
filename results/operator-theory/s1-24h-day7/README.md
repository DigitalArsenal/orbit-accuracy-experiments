# FFM from 24 h fits against AP at day 7 on step-free Sentinel-1 windows: the cause

Exploratory, `experiments/operator-theory/S1-24H-DAY7.md` (and its two amendments): every window here was read before, so nothing passes or fails. `table.json` holds every window's measures and every figure below; the rows are in `/opt/data/sdn-archive/operator-theory/s1-24h-day7`.

Windows: 2025, all 26 step-free day-7 windows of `results/operator-theory/s1-step-free`; 2026, 26 of the 128 of `results/operator-theory/maneuver-flags` (the first by SHA-256 of `s1-24h-day7|<key>`). Flown again: FFM24 and AP24 equal the stored day-7 rows on 26 and 26 of 26 windows of 2025, AP24 on 26 of 26 of 2026; 2026's FFM24 flies on 2.2.0 here (median 2.902 km against 2.0.4's stored 2.917).

## The cause: burns under the flag

47 of the 52 windows hold a step of the truth's mean semimajor axis that the 8 m flag missed: FFM24's flight less the truth, revolution by revolution, changes by 3.16 to 10.58 m (median 6.25) between consecutive revolutions, the truth rising. On the other 5 the largest change is 0.09 to 0.22 m, though each spans eight daily product joins. The same steps recur from consecutive cutoffs. The truth's own revolution means (`lib/steps.mjs` at 4 m) find 45 of the 47 within 13 h, at most 7.70 m, sizing them from 3.08 m smaller to 1.94 m larger than the flight-differenced step (median 0.13 m smaller). The flight difference sees them cleanly because the truth's single revolution means carry meter-level daily signals that FFM's flight shares.

Every FFM loss at day 7 is such a window: 35 losses (17 of 26 in 2025, 18 of 26 in 2026), classed maneuver under the flag 35, density 0, fitted B 0, something else 0. The step falls in the fit arc in 0, across the cutoff in 6 (FFM24 starts -3.28 to -9.58 m low, its along-track growth linear in 5 of 6) and in the forecast in 29.

FFM's fitted B against the truth's decay, on the 5 windows with no step: the truth decays -2.009 m/day (median); FFM24's decay error is -0.042 m/day at B 0.0083 m²/kg, AP24's 1.551 m/day at BTERM 0.002 (the median of its 600 to 800 km band prior, posterior sigma of ln B 0.27). AP flies about a quarter of the truth's drag; FFM's decay is within 17.1 % of the truth's on each. FFM wins all 5 at day 7 (median FFM/AP 0.102: 0.5555 against 5.182 km), with quadratic along-track growth on 5 and 5 of 5 for FFM and AP. Where a burn raises the orbit, AP's light drag has already held it up: its two errors cancel in part, and that is its day-7 win.

Weather over the forecast days, as-issued against definitive (median of the window means): F10.7 120.7 against 122.7 (2025), 112.2 against 115 (2026); Ap 11.4 against 13.6, 11.3 against 13.5.

## Hypotheses, day 7 (day 1 last), FFM against AP24 unless named

| Hypothesis | Set | Windows | n | FFM worse | Median FFM/AP | FFM / AP median km | Baseline FFM worse | Baseline median | Day 1: FFM worse, median (baseline) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 2025 | all | 26 | 65.4 % | 1.957 | 3.472 / 2.027 | 65.4 % | 1.957 | 15.4 %, 0.174 (15.4 %, 0.174) |
| baseline | 2025 | no step | 5 | 0 % | 0.102 | 0.5555 / 5.182 | 0 % | 0.102 | 0 %, 0.048 (0 %, 0.048) |
| baseline | 2026 | all | 26 | 69.2 % | 2.155 | 2.902 / 1.626 | 69.2 % | 2.155 | 11.5 %, 0.188 (11.5 %, 0.188) |
| baseline | both | all | 52 | 67.3 % | 1.985 | 3.229 / 1.765 | 67.3 % | 1.985 | 13.5 %, 0.181 (13.5 %, 0.181) |
| baseline | both | no step | 5 | 0 % | 0.102 | 0.5555 / 5.182 | 0 % | 0.102 | 0 %, 0.048 (0 %, 0.048) |
| a: 48 h fit | 2025 | all | 26 | 61.5 % | 1.817 | 2.617 / 2.027 | 65.4 % | 1.957 | 34.6 %, 0.264 (15.4 %, 0.174) |
| a: 48 h fit | 2025 | no step | 5 | 0 % | 0.136 | 0.743 / 5.182 | 0 % | 0.102 | 0 %, 0.128 (0 %, 0.048) |
| a: 48 h fit | 2026 | all | 26 | 69.2 % | 1.67 | 2.874 / 1.626 | 69.2 % | 2.155 | 30.8 %, 0.482 (11.5 %, 0.188) |
| a: 48 h fit | both | all | 52 | 65.4 % | 1.769 | 2.874 / 1.765 | 67.3 % | 1.985 | 32.7 %, 0.368 (13.5 %, 0.181) |
| a: 48 h fit | both | no step | 5 | 0 % | 0.136 | 0.743 / 5.182 | 0 % | 0.102 | 0 %, 0.128 (0 %, 0.048) |
| b: B held at the object's history | 2025 | all | 24 | 75 % | 2.508 | 3.593 / 1.903 | 70.8 % | 2.271 | 16.7 %, 0.204 (16.7 %, 0.198) |
| b: B held at the object's history | 2025 | no step | 3 | 0 % | 0.179 | 0.9754 / 5.043 | 0 % | 0.17 | 0 %, 0.273 (0 %, 0.085) |
| b: B held at the object's history | 2026 | all | 26 | 73.1 % | 2.527 | 3.062 / 1.626 | 69.2 % | 2.155 | 23.1 %, 0.357 (11.5 %, 0.188) |
| b: B held at the object's history | both | all | 50 | 74 % | 2.508 | 3.402 / 1.759 | 70 % | 2.271 | 20 %, 0.25 (14 %, 0.189) |
| b: B held at the object's history | both | no step | 3 | 0 % | 0.179 | 0.9754 / 5.043 | 0 % | 0.17 | 0 %, 0.273 (0 %, 0.085) |
| c: definitive weather | 2025 | all | 26 | 65.4 % | 1.658 | 2.998 / 2.027 | 65.4 % | 1.957 | 15.4 %, 0.184 (15.4 %, 0.174) |
| c: definitive weather | 2025 | no step | 5 | 0 % | 0.185 | 1.051 / 5.182 | 0 % | 0.102 | 0 %, 0.061 (0 %, 0.048) |
| c: definitive weather | 2026 | all | 26 | 73.1 % | 2.026 | 3.078 / 1.626 | 69.2 % | 2.155 | 11.5 %, 0.133 (11.5 %, 0.188) |
| c: definitive weather | both | all | 52 | 69.2 % | 1.802 | 3.02 / 1.765 | 67.3 % | 1.985 | 13.5 %, 0.156 (13.5 %, 0.181) |
| c: definitive weather | both | no step | 5 | 0 % | 0.185 | 1.051 / 5.182 | 0 % | 0.102 | 0 %, 0.061 (0 %, 0.048) |
| c: both arms on definitive weather | 2025 | all | 26 | 65.4 % | 1.536 | 2.998 / 2 | 65.4 % | 1.856 | 15.4 %, 0.181 (15.4 %, 0.179) |
| c: both arms on definitive weather | 2025 | no step | 5 | 0 % | 0.179 | 1.051 / 5.76 | 0 % | 0.096 | 0 %, 0.059 (0 %, 0.046) |
| c: both arms on definitive weather | 2026 | all | 26 | 73.1 % | 1.927 | 3.078 / 1.488 | 69.2 % | 2.071 | 11.5 %, 0.128 (11.5 %, 0.187) |
| c: both arms on definitive weather | both | all | 52 | 69.2 % | 1.866 | 3.02 / 1.841 | 67.3 % | 1.966 | 13.5 %, 0.152 (13.5 %, 0.18) |
| c: both arms on definitive weather | both | no step | 5 | 0 % | 0.179 | 1.051 / 5.76 | 0 % | 0.096 | 0 %, 0.059 (0 %, 0.046) |

(a) 48 h fits leave the day-7 loss (65.4 %) and lose day 1's margin (median 0.368 against 0.181). (b) B held at the median of the object's own fits of the 30 days before (5 fits or more; none on S1|39634|2025-10-06 and 10-07) is worse (74 %, median 2.508). (c) the definitive weather moves FFM's median day-7 error from 3.229 to 3.02 km and leaves it worse in 69.2 %: density is not the cause. No arm loses a window with no step; the 2026 sample holds none.

## The fix proposal

No change to `propagator/ffm` or `analysis/estimation`: FFM's 24 h B reproduces the truth's decay where nothing thrusts, and neither a longer arc (a), a history B (b) nor the definitive weather (c) removes a loss. The losses are station keeping the 8 m time-mean flag cannot see, the owner's exemption. The change is the harness's flag (`experiments/operator-theory/lib/steps.mjs`, used by `maneuver-flags.mjs` and the step-free registrations): flag a window where the FFM24 flight less the truth changes by 1 m or more between consecutive revolutions (holes up to 7 periods, the drift removed) in [cutoff - 24 h, cutoff + the lead], and test FFM against AP only on the windows it leaves step-free. Supported by the per-window classes (35 of 35 losses) and by the step-free row of every hypothesis (FFM worse on 0 of 5). The 8 m rule stays for the burns that move a forecast by tens of km.

## Registration

None was run: fewer than 30 unread windows exist. Sentinel-1A and 1C cutoffs with truth over [cutoff - 24 h, cutoff + 7 d] before the hold: every one from 2025-10-04 to 12-28 and from 2026-01-01 to 05-31 is spent (experiments/ffm-short-arc (registered 2026-11-01; S1-STEP-FREE.md amendment 1): 2025-10-05 to 2025-12-21; experiments/ap-short-arc-priors-confirm (S1-STEP-FREE.md amendment 1): 2025-10-04 to 2025-12-18, every 3rd day; experiments/operator-theory/S1-STEP-FREE.md (2026-11-04): 2025-10-05 to 2025-12-28; experiments/operator-theory/AP5.md (xp-atmosphere-merit period; maneuver-flags, ffm-losses-to-ap): 2026-01-01 to 2026-05-31); 2025-10-02 lacks its arc (the truth starts on 10-01) and 12-29 to 12-31 lack the 2026-01-01 file. 2 remain (S1|39634|2025-10-03, S1|62261|2025-10-03), their forecast spans read by S1-STEP-FREE.md's windows, and S1|39634|2025-10-03's arc fitted here for (b)'s history. Held: every Sentinel-1 cutoff from 2026-06-01 (C2), Sentinel-1D; the archive's Sentinel-1A truth runs to 2026-07-01 and 1C's to 2026-10-15, all under the hold past 2026-06-08. Thirty windows step-free under the proposed flag, at this sample's rate (5 of 52), take about 156 days of both satellites' truth outside every read span: the release of the C2 hold, or Sentinel-1A and 1C precise orbits from before 2025-10-01, which the archive does not hold.

## Builds

FFM: `propagator/ffm` 2.2.0 (dist d635a3d5, modules f1517ef6) by `analysis/estimation` 0.7.0 (7a555ca5) at CHEAPER.md's settings, solar pressure held at 0.02 m²/kg. AP on modules ea824356: sdn-ap 0.5.1 (d29acd2b5d92), sgp4-xp 0.2.1 (816fd137d761), AP24 as S1-STEP-FREE.md. Mean semimajor axis: `foundation/orbits` 0.1.0 (dist 7fb367fa). Weather: as-issued as S1-STEP-FREE.md; definitive XM's `rowsM` (GFZ). Holds: no held object, no Sentinel-1 cutoff from 2026-06-01, no truth after 2026-06-08.

## Windows

| Window | FFM24 / AP24 day 7 km | Class | Step: hours from cutoff, m (truth rising) | FFM24 / AP24 decay error m/day | FFM24 B / AP24 BTERM m²/kg |
| --- | --- | --- | --- | --- | --- |
| S1\|39634\|2025-10-06 | 0.1472 / 5.1823 | FFM wins | none (0.09) | -0.042 / 1.551 | 0.007014 / 0.002005 |
| S1\|39634\|2025-10-07 | 0.5128 / 5.6762 | FFM wins | none (0.09) | 0.382 / 1.833 | 0.00834 / 0.002036 |
| S1\|39634\|2025-11-17 | 0.5555 / 5.4637 | FFM wins | none (0.22) | -0.09 / 1.507 | 0.009683 / 0.002023 |
| S1\|39634\|2025-11-18 | 0.881 / 4.9458 | FFM wins | none (0.09) | 0.302 / 1.522 | 0.007775 / 0.002025 |
| S1\|39634\|2025-11-19 | 0.8575 / 5.0427 | FFM wins | none (0.09) | -0.329 / 1.575 | 0.011259 / 0.002057 |
| S1\|39634\|2025-12-11 | 3.7899 / 1.6111 | maneuver under the flag | 49.4, 7.04 | -1.644 / -0.068 | 0.00739 / 0.002012 |
| S1\|39634\|2025-12-12 | 7.2196 / 0.6947 | maneuver under the flag | 25.4, 7.01 | -1.765 / 0.183 | 0.008778 / 0.002092 |
| S1\|39634\|2025-12-13 | 7.4226 / 2.1423 | maneuver under the flag | 1.4, 7.07 | -0.443 / 0.986 | 0.009882 / 0.002113 |
| S1\|39634\|2025-12-14 | 1.8264 / 2.8504 | FFM wins | 145.3, 6.25 | -1.039 / 0.293 | 0.009667 / 0.002029 |
| S1\|39634\|2025-12-15 | 0.9796 / 1.8778 | FFM wins | 121.3, 6.28 | -1.01 / -0.189 | 0.006752 / 0.002 |
| S1\|39634\|2025-12-16 | 1.8292 / 1.083 | maneuver under the flag | 97.3, 6.34 | -1.326 / -0.402 | 0.006661 / 0.001967 |
| S1\|39634\|2025-12-17 | 3.5978 / 0.3056 | maneuver under the flag | 73.3, 6.30 | -1.428 / -0.294 | 0.008812 / 0.001995 |
| S1\|62261\|2025-12-11 | 3.8267 / 2.3234 | maneuver under the flag | 50.2, 6.33 | -1.756 / 0.013 | 0.008055 / 0.002045 |
| S1\|62261\|2025-12-12 | 7.9408 / 0.3636 | maneuver under the flag | 26.2, 6.32 | -2.05 / 0.212 | 0.009903 / 0.002125 |
| S1\|62261\|2025-12-13 | 6.3186 / 1.6008 | maneuver under the flag | 2.2, 6.34 | -0.275 / 1.003 | 0.009017 / 0.002071 |
| S1\|62261\|2025-12-14 | 1.514 / 2.8621 | FFM wins | 144.4, 6.47 | -0.143 / 0.272 | 0.004378 / 0.002016 |
| S1\|62261\|2025-12-15 | 1.6242 / 1.9276 | FFM wins | 120.4, 6.47 | -1.26 / -0.219 | 0.007985 / 0.001983 |
| S1\|62261\|2025-12-16 | 3.2084 / 0.9302 | maneuver under the flag | 96.4, 6.49 | -1.756 / -0.463 | 0.008501 / 0.00199 |
| S1\|62261\|2025-12-17 | 3.4736 / 0.1168 | maneuver under the flag | 72.4, 6.48 | -1.284 / -0.274 | 0.00805 / 0.001983 |
| S1\|62261\|2025-12-18 | 3.4699 / 1.3486 | maneuver under the flag | 145.5, 9.70 | -1.519 / -0.868 | 0.00614 / 0.001998 |
| S1\|62261\|2025-12-19 | 4.9238 / 2.1261 | maneuver under the flag | 121.5, 9.73 | -2.054 / -1.211 | 0.007857 / 0.002036 |
| S1\|62261\|2025-12-20 | 4.4019 / 3.815 | maneuver under the flag | 97.5, 9.79 | -1.499 / -1.311 | 0.002942 / 0.001984 |
| S1\|62261\|2025-12-21 | 2.7198 / 0.4246 | maneuver under the flag | 73.5, 9.82 | -2.818 / -1.925 | 0.00634 / 0.001997 |
| S1\|62261\|2025-12-22 | 6.0879 / 1.7659 | maneuver under the flag | 49.5, 9.83 | -3.132 / -1.874 | 0.007775 / 0.001972 |
| S1\|62261\|2025-12-23 | 9.2842 / 4.1711 | maneuver under the flag | 25.5, 9.90 | -2.498 / -1.023 | 0.009148 / 0.002005 |
| S1\|62261\|2025-12-24 | 10.3139 / 6.701 | maneuver under the flag | 1.5, 9.93 | -0.574 / 0.542 | 0.007149 / 0.002018 |
| S1\|39634\|2026-01-14 | 0.7832 / 1.6992 | FFM wins | 72.7, 3.16 | 0.134 / 0.857 | 0.007091 / 0.001979 |
| S1\|39634\|2026-01-16 | 1.6659 / 0.6155 | maneuver under the flag | 118.5, 10.58 | -0.367 / 0.394 | 0.00553 / 0.001972 |
| S1\|39634\|2026-02-21 | 4.6717 / 1.7541 | maneuver under the flag | 3.3, 5.43 | -0.428 / 0.497 | 0.007579 / 0.001985 |
| S1\|39634\|2026-03-19 | 3.2487 / 0.9445 | maneuver under the flag | 49.1, 3.83 | -1.09 / 0.285 | 0.007957 / 0.002021 |
| S1\|39634\|2026-04-09 | 4.8209 / 1.0202 | maneuver under the flag | 47.1, 5.16 | -1.823 / -0.672 | 0.00878 / 0.001989 |
| S1\|39634\|2026-04-13 | 3.9839 / 1.1446 | maneuver under the flag | 122.2, 5.55 | -1.874 / -0.914 | 0.00922 / 0.001999 |
| S1\|39634\|2026-04-14 | 3.5459 / 2.0573 | maneuver under the flag | 98.2, 5.55 | -1.3 / -0.834 | 0.00534 / 0.001991 |
| S1\|39634\|2026-05-08 | 0.518 / 1.4609 | FFM wins | 122.9, 4.46 | -0.728 / -0.194 | 0.005726 / 0.001994 |
| S1\|39634\|2026-05-10 | 2.801 / 0.4793 | maneuver under the flag | 74.9, 4.45 | -1.457 / -0.734 | 0.007653 / 0.001987 |
| S1\|39634\|2026-05-12 | 4.3291 / 3.0165 | maneuver under the flag | 26.9, 4.47 | -1.096 / -0.606 | 0.005545 / 0.002 |
| S1\|39634\|2026-05-17 | 1.8357 / 2.0584 | FFM wins | 147.2, 4.81 | 0.24 / 0.303 | 0.002535 / 0.001985 |
| S1\|39634\|2026-05-18 | 0.9025 / 1.5529 | FFM wins | 123.2, 4.81 | -0.746 / -0.032 | 0.007934 / 0.002018 |
| S1\|62261\|2026-01-12 | 3.4033 / 0.1572 | maneuver under the flag | 73.8, 4.44 | -1.154 / -0.09 | 0.009284 / 0.002045 |
| S1\|62261\|2026-01-14 | 2.3162 / 0.6485 | maneuver under the flag | 25.8, 4.50 | 0.609 / 1.1 | 0.005512 / 0.001992 |
| S1\|62261\|2026-02-21 | 4.6883 / 2.6871 | maneuver under the flag | 0.9, 6.88 | -0.036 / 0.552 | 0.005617 / 0.001981 |
| S1\|62261\|2026-03-09 | 3.2827 / 2.1082 | maneuver under the flag | 118.8, 4.68 | -1.441 / -0.027 | 0.009965 / 0.002014 |
| S1\|62261\|2026-03-19 | 4.8782 / 1.7634 | maneuver under the flag | 48.3, 8.25 | -1.131 / -0.114 | 0.006372 / 0.002004 |
| S1\|62261\|2026-04-06 | 1.9379 / 2.1931 | FFM wins | 119.9, 4.66 | -1.228 / -0.066 | 0.009724 / 0.002055 |
| S1\|62261\|2026-04-08 | 4.0688 / 0.1385 | maneuver under the flag | 71.9, 4.63 | -1.415 / -0.274 | 0.010779 / 0.002015 |
| S1\|62261\|2026-04-20 | 2.2112 / 4.3948 | FFM wins | 119.6, 6.08 | -0.044 / 0.494 | 0.00589 / 0.001997 |
| S1\|62261\|2026-05-07 | 0.3427 / 2.0264 | FFM wins | 142.8, 4.76 | -0.606 / 0.091 | 0.006441 / 0.002015 |
| S1\|62261\|2026-05-10 | 2.618 / 1.0206 | maneuver under the flag | 70.8, 4.75 | -1.312 / -0.775 | 0.00617 / 0.001977 |
| S1\|62261\|2026-05-12 | 5.1515 / 3.1605 | maneuver under the flag | 22.8, 4.75 | -1.223 / -0.533 | 0.007151 / 0.002017 |
| S1\|62261\|2026-05-13 | 3.0023 / 4.0347 | FFM wins | -1.2, 4.74 | 0.156 / -0.105 | 0 / 0.00197 |
| S1\|62261\|2026-05-15 | 1.6883 / 0.3046 | maneuver under the flag | 24.9, 3.49 | -0.02 / 0.34 | 0.005022 / 0.00197 |
| S1\|62261\|2026-05-16 | 2.1467 / 0.5396 | maneuver under the flag | 0.9, 3.50 | 0.313 / 0.72 | 0.005633 / 0.00198 |
