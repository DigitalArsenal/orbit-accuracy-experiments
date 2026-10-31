# XP2 fit design on unseen dates

## Reading

On 1,214 windows where none of these fits had been scored before, every registered statement passed. Drag from a 12 h full-force fit with elements from the last 17 h (RFa12) beat the public element set by 11.1, 25.1, 27.8, 28.7 % at days 1, 2, 3 and 7. It still beat it by 6.6, 17.3, 21.6, 22.9 % with its arcs ending when the public set was created, so the two had the same data age. SGP4-XP with NRLMSISE-00 beat SGP4 refit to the same truth and the same 72 h arc by 13.4, 22.0, 27.6, 28.9 %, and RFa12 beat plain SGP4 fitted to the same 17 h by 4.5, 18.2, 26.6, 27.0 %.

What it means: on these satellites the redesigned fit beats the public set and a matched SGP4 refit, and the old 72 h design was the problem. The same module with the old fit (X2) stands at +5.3, +0.7, -6.9, -20.8 % against the public set, and changing only the fit (RF17 against X2) moved it by -11.5, -18.3, -18.6, -10.2 %.

What it does not mean: every fitted arm read precise products, which are not real-time, so this says nothing about a console fed by anything else. The pool is 87 % Swarm, and on GRACE-FO alone (158 windows) RFa12's day-7 interval holds 0. No console default and no catalog claim follows.

The early leads are flattered by older public sets on these dates: the set's median age is 10.09 h here against 5.42 h on the windows of the diagnosis. In the youngest third of windows, a set under 8.67 h old, RFa12 stands at -3.8 [-7.8, -1.0], -18.8 [-29.9, -8.6], -25.2 [-40.1, -9.3], -23.7 [-45.7, +2.6] %, and at day 7 its interval holds 0. There plain SGP4 on the same 17 h ties the public set, so that lead is not data age. R17 passes on the pool, but at days 1 and 2 its lead is nearly all data age (103 and 92 % of it), and neither span alone meets the rule.

Windows with Ap at least 40 in the arc (n 132) still miss the tail rule at days 3 and 7: RFa12's upper bounds on the p95 ratio are 1.29 and 1.16 against 1.10.

Task `experiments-xp2-fit-design-fresh-20261031`. Registered before any score: commit 60fb94a617 (`experiments/xp2-fit-design/PLAN.md`). Modules 9a05d899b, every wasm SHA-256 checked; no module changed. 395 windows on Swarm A, B, C and GRACE-FO 1, 2 (cutoffs 2025-10-04 to 2025-12-21) and 819 on Swarm A, B, C (2025-01-01 to 2025-09-30); 0 excluded by XM's rules, 0 with a row error. Rows digest e4cff2a36484. Medians are percent change in the 3D RMS position error at days 1, 2, 3, 7, with 97.5 % percentile intervals on ISO-week clusters unless marked.

## What a pass means

Every fitted arm reads truth-quality precise products, which are not real-time, and P is the public set available at the cutoff. A pass at the cutoff reading answers the theory-and-fit question with zero-latency precise truth, not the console supply question. The parity reading removes the data age, not the data quality. No result here changes a module, the console default or a public claim by itself.

## Verdicts: two fixed sequences

| Id | Contrast | Form | At 97.5 %, ISO week | 95 %; orbit group x week at 97.5 % | False-positive rate on these dates, % (whole statement, least favorable null, at 97.5 %) | Own cells at 97.5 % |
|---|---|---|---|---|---|---|
| M1 | RF17 / X2 | rule 1, 4 leads | PASS | meets, meets | 2.3 (gw 2.7); rule 1 by lead 2.3, 2.2, 2.2, 2.3; 95 % whole 4.2 | primary misses; extension meets; Swarm A+C meets; Swarm B meets; GRACE-FO misses |
| M2 | X2 / S72L | XM's rule | PASS | meets, meets | 1.6 (gw 4.6); rule 1 by lead 1.6, 1.4, 1.1, 1.2; 95 % whole 2.8 | primary meets; extension meets; Swarm A+C meets; Swarm B meets; GRACE-FO meets |
| F1 | RFa12 / P | XM's rule | PASS | meets, meets | 2.3 (gw 3.5); rule 1 by lead 2.3, 1.9, 2.3, 1.3; 95 % whole 3.9 | primary meets; extension meets; Swarm A+C meets; Swarm B meets; GRACE-FO misses |
| F2 | RFa12 / S17LP | rule 1, 4 leads | PASS | meets, meets | 2.5 (gw 6); rule 1 by lead 1.8, 2.1, 1.9, 2.5; 95 % whole 4.3 | primary meets; extension meets; Swarm A+C meets; Swarm B meets; GRACE-FO misses |
| F3 | RFa12c / P | XM's rule | PASS | meets, meets | 1.9 (gw 5.5); rule 1 by lead 1.2, 1.8, 2, 2.7; 95 % whole 3.1 | primary misses; extension meets; Swarm A+C meets; Swarm B misses; GRACE-FO misses |
| F4 | RFa24 / P | XM's rule | PASS | meets, meets | 2.3 (gw 5.4); rule 1 by lead 2.3, 1.5, 0.9, 1.5; 95 % whole 3.8 | primary meets; extension meets; Swarm A+C meets; Swarm B meets; GRACE-FO misses |
| F5 | RF17 / P | XM's rule | PASS | meets, meets | 1.5 (gw 4.6); rule 1 by lead 1.5, 1.5, 1.3, 1.3; 95 % whole 2.8 | primary meets; extension meets; Swarm A+C meets; Swarm B misses; GRACE-FO misses |
| F6 | R17 / P | XM's rule | PASS | meets, meets | 2.5 (gw 3.9); rule 1 by lead 2.8, 2.6, 2.2, 1.5; 95 % whole 4 | primary misses; extension misses; Swarm A+C meets; Swarm B misses; GRACE-FO misses |

## Matched inputs: X2 against S72L, the owner's direct question

Rule 1 at every lead: met at 97.5 % on ISO weeks (95 %: met; orbit group x week 97.5 %: met). Rule 2 at every lead: met at 97.5 % (95 %: met; orbit group x week 97.5 %: met).

## Against the public set, cutoff reading

| | Day 1 | Day 2 | Day 3 | Day 7 | p95 upper bound | Pairs, clusters |
|---|---|---|---|---|---|---|
| RFa12 / P | -11.1 [-14.5, -7.8] | -25.1 [-32.1, -18.5] | -27.8 [-37.5, -19.5] | -28.7 [-40.0, -13.0] | 0.551652, 0.654141, 0.744854, 0.872361 | 1214, 51 |
| RFa24 / P | -9.5 [-12.2, -6.8] | -20.1 [-27.2, -15.9] | -27.3 [-34.1, -20.4] | -26.7 [-35.9, -18.5] | 0.600117, 0.684319, 0.75779, 0.748909 | 1214, 51 |
| RF17 / P | -7.9 [-10.0, -5.1] | -15.9 [-21.0, -9.7] | -24.1 [-30.9, -15.9] | -27.7 [-37.3, -16.8] | 0.721725, 0.835557, 0.857273, 0.810969 | 1214, 51 |
| R17 / P | -5.1 [-8.0, -3.2] | -8.7 [-16.3, -0.7] | -14.0 [-22.3, -4.8] | -20.9 [-31.1, -8.3] | 0.739642, 0.827913, 0.842339, 0.817784 | 1214, 51 |
| X2 / P | +5.3 [+2.2, +7.7] | +0.7 [-7.0, +9.0] | -6.9 [-16.7, +5.4] | -20.8 [-28.9, -7.9] | 1.006561, 0.96739, 0.936304, 0.823163 | 1214, 51 |
| S17LP / P (data age) | -5.3 [-8.3, -2.5] | -8.0 [-11.4, -3.9] | -6.4 [-9.5, -2.6] | -3.3 [-4.8, -0.9] | 0.741238, 0.904842, 0.984268, 1.015413 | 1214, 51 |
| S72L / P | +21.7 [+17.4, +26.3] | +31.3 [+20.2, +43.0] | +25.9 [+12.9, +42.3] | +7.7 [-4.2, +22.8] | 1.359624, 1.406463, 1.471539, 1.34456 | 1214, 51 |
| S17LF / P | -0.6 [-3.5, +2.2] | +4.6 [-1.8, +13.0] | +7.3 [-1.9, +18.8] | +3.1 [-8.8, +15.8] | 0.951455, 1.181252, 1.266246, 1.266096 | 1214, 51 |

The same at 95 % on ISO weeks, and at 97.5 % on orbit group x week:

| | Day 1 | Day 2 | Day 3 | Day 7 | p95 upper bound | Pairs, clusters |
|---|---|---|---|---|---|---|
| RFa12 / P, 95 % | -11.1 [-14.1, -8.1] | -25.1 [-31.3, -19.4] | -27.8 [-36.4, -20.7] | -28.7 [-39.0, -15.7] | 0.537107, 0.625692, 0.732516, 0.856345 | 1214, 51 |
| RF17 / P, 95 % | -7.9 [-9.6, -5.5] | -15.9 [-20.5, -10.2] | -24.1 [-30.1, -16.6] | -27.7 [-36.6, -18.0] | 0.700576, 0.819813, 0.839651, 0.797512 | 1214, 51 |
| RFa12 / P, gw | -11.1 [-14.0, -8.3] | -25.1 [-31.0, -19.9] | -27.8 [-35.3, -22.0] | -28.7 [-38.2, -19.1] | 0.53337, 0.63352, 0.750328, 0.863354 | 1214, 114 |
| RF17 / P, gw | -7.9 [-9.5, -5.5] | -15.9 [-20.1, -10.5] | -24.1 [-30.0, -17.1] | -27.7 [-35.1, -19.2] | 0.681014, 0.832629, 0.85795, 0.812356 | 1214, 114 |

## Matched and diagnostic contrasts

| | Day 1 | Day 2 | Day 3 | Day 7 | p95 upper bound | Pairs, clusters |
|---|---|---|---|---|---|---|
| X2 / S72L | -13.4 [-15.9, -11.8] | -22.0 [-27.6, -17.2] | -27.6 [-33.0, -20.9] | -28.9 [-37.4, -18.9] | 0.807962, 0.778686, 0.762227, 0.76529 | 1214, 51 |
| X2 / S72L, 95 % | -13.4 [-15.6, -11.9] | -22.0 [-26.8, -17.6] | -27.6 [-32.6, -21.4] | -28.9 [-36.7, -20.2] | 0.800159, 0.765395, 0.748045, 0.748806 | 1214, 51 |
| X2 / S72L, gw | -13.4 [-15.2, -11.9] | -22.0 [-26.4, -17.8] | -27.6 [-32.5, -21.8] | -28.9 [-35.5, -21.3] | 0.807271, 0.772633, 0.753051, 0.754686 | 1214, 114 |
| R17 / S17LF | -4.8 [-7.1, -3.5] | -15.5 [-21.1, -10.9] | -21.6 [-29.1, -15.2] | -27.0 [-36.6, -17.8] | 0.855291, 0.827356, 0.798416, 0.793043 | 1214, 51 |
| RF17 / X2 | -11.5 [-13.0, -9.5] | -18.3 [-20.5, -14.5] | -18.6 [-22.6, -14.1] | -10.2 [-14.3, -6.8] | 0.801329, 0.977319, 1.016812, 1.038526 | 1214, 51 |
| RFa12 / S17LP | -4.5 [-6.3, -3.5] | -18.2 [-25.0, -12.5] | -26.6 [-33.9, -16.9] | -27.0 [-37.2, -11.9] | 0.780978, 0.786403, 0.82366, 0.899704 | 1214, 51 |
| RF17 / S17LP | -2.5 [-3.3, -1.7] | -9.9 [-13.9, -6.0] | -17.9 [-25.1, -10.4] | -23.5 [-33.6, -13.6] | 1.060656, 1.046086, 0.933258, 0.829558 | 1214, 51 |
| R17 / S17LP | -1.3 [-2.4, -0.3] | -3.9 [-8.8, +2.2] | -8.8 [-17.7, +0.1] | -19.1 [-27.5, -8.4] | 1.081383, 1.02038, 0.928389, 0.84011 | 1214, 51 |
| RFa12 / RF17 | -2.1 [-3.7, -1.0] | -10.7 [-15.2, -5.2] | -10.2 [-17.3, -2.0] | -1.9 [-12.2, +9.6] | 0.84068, 0.933258, 1.04817, 1.242829 | 1214, 51 |

Data age, S17LP's median as a share of the arm's lead over P, %: RFa12 48, 32, 23, 11; RFa24 55, 40, 23, 12; RF17 67, 50, 27, 12; R17 103, 92, 46, 16.

## Parity: arcs ending at the set's creation

| | Day 1 | Day 2 | Day 3 | Day 7 | p95 upper bound | Pairs, clusters |
|---|---|---|---|---|---|---|
| RFa12c / P | -6.6 [-8.8, -3.9] | -17.3 [-23.8, -10.4] | -21.6 [-31.0, -11.6] | -22.9 [-32.9, -9.8] | 0.75259, 0.799832, 0.816923, 0.870055 | 1214, 51 |
| RFa24c / P (primary span) | -4.0 [-8.0, -0.2] | -17.9 [-28.7, -8.7] | -27.0 [-39.6, -9.0] | -23.5 [-43.3, +3.2] | 0.970237, 1.016018, 1.041191, 0.881088 | 395, 12 |
| RF17c / P (primary span) | -0.6 [-5.1, +6.8] | -12.8 [-23.9, +9.8] | -19.2 [-35.2, +5.4] | -27.8 [-46.8, -13.9] | Infinity, Infinity, Infinity, 1.024792 | 395, 12 |
| R17c / P | +2.1 [-0.6, +5.4] | +2.9 [-6.6, +13.2] | -6.3 [-18.9, +4.7] | -15.6 [-26.4, -1.2] | 1.150534, 1.161702, 1.087082, 0.874591 | 1214, 51 |
| S17LPc / P (calibrator) | +1.0 [-1.1, +3.2] | -0.5 [-3.7, +3.0] | -0.7 [-3.8, +1.8] | -0.9 [-2.4, +0.5] | 1.078401, 1.115942, 1.043005, 1.02694 | 1214, 51 |
| RFa12c / S17LPc | -6.5 [-8.7, -5.3] | -16.8 [-23.2, -11.4] | -22.8 [-30.8, -16.5] | -23.2 [-33.4, -11.2] | 0.767806, 0.806978, 0.838326, 0.870666 | 1214, 51 |
| RFa12c / P, sets created within 6 h | -5.4 [-7.9, -2.8] | -16.8 [-25.7, -9.2] | -20.7 [-35.1, -8.7] | -19.7 [-36.8, -4.2] | 0.806089, 0.863098, 0.917181, 0.930388 | 736, 51 |

Reading of RFa12c by lead: day 1 lead; day 2 lead; day 3 lead; day 7 lead. A tie has an interval holding 0 inside -9.1 to +10 %; a wider interval holding 0 is "not determined". The calibrator S17LPc: day 1 holds 0; day 2 holds 0; day 3 holds 0; day 7 holds 0. Parity arms read the weather rows of the cutoff.

## The public set's age on these dates

P's age at 00:00 UTC, hours: pool median 10.09, p90 18.4; primary span 6.74; extension 10.34; XM's windows 5.42. By month: 2025-01 10.05, 2025-02 10.08, 2025-03 9.98, 2025-04 10.6, 2025-05 10.34, 2025-06 10.43, 2025-07 9.75, 2025-08 10.35, 2025-09 17.61, 2025-10 8.8, 2025-11 5.45, 2025-12 8.99. Days in the spans whose archive file holds no set of these five objects: 2025-04-30, 2025-05-01, 2025-08-22, 2025-11-09, 2025-11-10. Terciles cut at 8.67 and 10.8 h; if these dates flatter the arms, the oldest third below shows it.

**RFa12 / P by span, group, age and storm**

| | Day 1 | Day 2 | Day 3 | Day 7 | p95 upper bound | Pairs, clusters |
|---|---|---|---|---|---|---|
| primary | -13.6 [-19.4, -6.5] | -33.1 [-44.9, -21.4] | -41.0 [-54.0, -20.8] | -35.1 [-53.0, -2.8] | 0.568073, 0.7196, 0.740195, 0.850169 | 395, 12 |
| extension | -10.2 [-14.2, -6.8] | -20.7 [-29.5, -12.7] | -24.0 [-33.5, -15.0] | -25.9 [-38.6, -7.9] | 0.607775, 0.687412, 0.827786, 0.974472 | 819, 40 |
| Swarm A+C | -14.1 [-17.5, -9.9] | -32.0 [-39.5, -22.6] | -32.9 [-42.0, -22.9] | -27.8 [-39.1, -14.1] | 0.468915, 0.676273, 0.810076, 0.909334 | 704, 51 |
| Swarm B | -8.1 [-11.2, -5.2] | -11.1 [-19.3, -5.4] | -16.3 [-24.1, -5.4] | -29.4 [-40.5, -11.8] | 0.715294, 0.791559, 0.892713, 0.890408 | 352, 51 |
| GRACE-FO | -9.3 [-15.2, -4.1] | -30.0 [-40.1, -19.1] | -43.9 [-56.5, -19.1] | -38.2 [-54.3, +29.4] | 0.708634, 0.781566, 1.023376, 0.990512 | 158, 12 |
| P age, youngest third | -3.8 [-7.8, -1.0] | -18.8 [-29.9, -8.6] | -25.2 [-40.1, -9.3] | -23.7 [-45.7, +2.6] | 0.79745, 1.095516, 1.003724, 1.022682 | 405, 45 |
| P age, middle third | -10.2 [-14.4, -5.3] | -15.1 [-27.4, -5.7] | -16.6 [-30.0, +0.3] | -16.9 [-37.8, +2.4] | 0.684794, 0.822009, 1.010934, 1.22501 | 405, 50 |
| P age, oldest third | -21.6 [-27.0, -16.4] | -40.5 [-48.2, -31.0] | -45.5 [-56.6, -27.4] | -39.6 [-51.0, -25.2] | 0.407454, 0.689591, 0.755656, 0.918614 | 404, 49 |
| Ap at least 40 in the arc | -18.9 [-25.9, -11.2] | -30.7 [-46.8, -15.1] | -34.8 [-56.1, -0.7] | -6.2 [-53.3, +76.8] | 0.684365, 1.01616, 1.285902, 1.160331 | 132, 15 |
| set created within 6 h | -6.5 [-10.6, -3.7] | -18.9 [-28.2, -10.6] | -23.4 [-33.5, -11.5] | -20.7 [-38.1, +1.7] | 0.701358, 0.867662, 0.910627, 0.957325 | 736, 51 |

**RF17 / P by span, group, age and storm**

| | Day 1 | Day 2 | Day 3 | Day 7 | p95 upper bound | Pairs, clusters |
|---|---|---|---|---|---|---|
| primary | -8.1 [-11.7, -2.2] | -19.7 [-32.3, -8.6] | -25.6 [-42.3, -9.3] | -32.2 [-48.4, -14.3] | 0.80381, 1.022015, 0.919727, 0.759759 | 395, 12 |
| extension | -7.7 [-10.3, -4.7] | -13.4 [-20.4, -7.3] | -23.1 [-30.3, -15.0] | -25.0 [-37.4, -12.3] | 0.782434, 0.875574, 0.894578, 0.902289 | 819, 40 |
| Swarm A+C | -8.7 [-11.0, -5.1] | -19.1 [-27.2, -9.6] | -28.1 [-35.7, -18.9] | -28.1 [-37.5, -17.6] | 0.656665, 0.834003, 0.891291, 0.804532 | 704, 51 |
| Swarm B | -7.5 [-9.9, -4.3] | -9.6 [-16.6, -1.3] | -16.0 [-24.3, +1.3] | -26.5 [-37.2, -6.0] | 0.819297, 1.000384, 1.067746, 0.848248 | 352, 51 |
| GRACE-FO | -3.8 [-9.9, -1.1] | -17.2 [-28.9, -10.1] | -24.8 [-48.3, -10.3] | -25.5 [-49.6, +18.5] | 0.878327, 1.234056, 1.256657, 0.8714 | 158, 12 |
| P age, youngest third | +0.4 [-2.2, +5.3] | -2.9 [-15.6, +16.8] | -14.3 [-29.8, +7.1] | -27.8 [-44.2, -1.9] | 1.438668, 1.591785, 1.40118, 1.097705 | 405, 45 |
| P age, middle third | -7.2 [-12.1, -4.3] | -14.4 [-24.8, -3.6] | -23.0 [-32.7, -3.4] | -23.3 [-38.2, -3.9] | 0.915989, 0.995049, 0.980977, 0.968183 | 405, 50 |
| P age, oldest third | -18.5 [-24.9, -12.7] | -30.4 [-37.0, -21.0] | -31.1 [-40.0, -24.8] | -28.9 [-40.0, -19.9] | 0.510006, 0.700703, 0.712425, 0.736862 | 404, 49 |
| Ap at least 40 in the arc | -9.6 [-19.0, +1.4] | -2.9 [-34.5, +19.4] | -6.2 [-40.3, +29.1] | -25.6 [-46.3, +14.4] | 0.910232, 1.201475, 1.236818, 0.918103 | 132, 15 |
| set created within 6 h | -3.3 [-7.0, -0.6] | -7.1 [-16.5, -0.6] | -17.8 [-28.0, -5.3] | -27.5 [-37.5, -12.2] | 1.066135, 1.130462, 1.048102, 0.91347 | 736, 51 |

**S17LP / P by span, group, age and storm**

| | Day 1 | Day 2 | Day 3 | Day 7 | p95 upper bound | Pairs, clusters |
|---|---|---|---|---|---|---|
| primary | -5.9 [-10.3, +0.3] | -10.5 [-15.3, -5.7] | -8.0 [-12.2, -3.0] | -3.4 [-5.9, +2.3] | 0.798329, 1.00913, 1.070188, 1.060002 | 395, 12 |
| extension | -5.1 [-8.5, -2.1] | -6.7 [-11.3, -1.6] | -5.7 [-9.8, -1.2] | -3.2 [-5.3, -0.7] | 0.783121, 0.907496, 0.982023, 1.018256 | 819, 40 |
| Swarm A+C | -5.5 [-11.0, -1.9] | -9.4 [-15.0, -5.2] | -7.9 [-11.3, -3.5] | -3.2 [-4.8, -0.8] | 0.709693, 0.928265, 0.98521, 1.03607 | 704, 51 |
| Swarm B | -5.7 [-9.4, -2.5] | -6.2 [-10.6, +0.0] | -1.1 [-8.1, +4.8] | -3.7 [-7.0, -0.1] | 0.800852, 0.925412, 1.05714, 1.051445 | 352, 51 |
| GRACE-FO | -1.6 [-7.6, +4.5] | -6.0 [-13.9, +1.1] | -8.0 [-14.7, -0.8] | -3.2 [-6.8, +7.3] | 0.954031, 1.106742, 1.114077, 1.087016 | 158, 12 |
| P age, youngest third | +1.5 [-1.8, +4.5] | +0.7 [-6.4, +8.0] | +1.1 [-6.1, +7.7] | -0.8 [-4.0, +3.3] | 1.005922, 1.048352, 1.049671, 1.105554 | 405, 45 |
| P age, middle third | -3.3 [-8.8, -1.1] | -4.0 [-10.1, +2.7] | -4.3 [-9.1, +1.5] | -2.2 [-5.1, +0.9] | 0.871341, 0.987642, 1.051576, 1.037769 | 405, 50 |
| P age, oldest third | -15.5 [-21.4, -10.4] | -17.9 [-23.8, -12.6] | -12.9 [-17.0, -8.4] | -5.9 [-7.5, -3.5] | 0.652168, 0.944784, 0.977447, 1.061998 | 404, 49 |
| Ap at least 40 in the arc | -12.6 [-21.6, -0.8] | -9.0 [-19.0, +3.6] | -0.3 [-11.5, +8.5] | -0.7 [-7.3, +8.2] | 0.909953, 1.229636, 1.144605, 1.141756 | 132, 15 |
| set created within 6 h | -1.3 [-5.6, +1.3] | -3.8 [-9.7, +2.5] | -2.6 [-8.4, +2.9] | -1.9 [-4.4, +1.5] | 0.922739, 0.973019, 1.004629, 1.04046 | 736, 51 |

**X2 / S72L by span, group, age and storm**

| | Day 1 | Day 2 | Day 3 | Day 7 | p95 upper bound | Pairs, clusters |
|---|---|---|---|---|---|---|
| primary | -19.6 [-24.9, -13.8] | -31.5 [-39.4, -21.9] | -35.2 [-40.1, -28.1] | -38.3 [-47.5, -26.1] | 0.797987, 0.748434, 0.744789, 0.731441 | 395, 12 |
| extension | -11.9 [-13.3, -10.5] | -18.7 [-24.0, -14.0] | -22.8 [-30.9, -16.7] | -25.1 [-34.0, -7.1] | 0.851328, 0.867257, 0.867852, 0.852095 | 819, 40 |
| Swarm A+C | -14.4 [-19.4, -12.4] | -24.7 [-32.8, -17.6] | -30.9 [-36.5, -21.3] | -29.8 [-40.5, -18.9] | 0.826699, 0.79578, 0.807623, 0.73042 | 704, 51 |
| Swarm B | -10.3 [-12.2, -8.5] | -15.3 [-20.0, -10.9] | -19.3 [-25.9, -13.3] | -20.5 [-32.7, -6.0] | 0.903426, 0.87751, 0.914268, 0.8367 | 352, 51 |
| GRACE-FO | -16.3 [-22.7, -13.8] | -31.1 [-40.0, -21.9] | -34.0 [-41.3, -23.8] | -38.5 [-54.8, -22.6] | 0.865653, 0.810606, 0.777246, 0.762434 | 158, 12 |
| P age, youngest third | -14.1 [-17.9, -10.1] | -18.9 [-29.5, -13.6] | -29.1 [-37.5, -18.1] | -34.3 [-44.0, -19.2] | 0.918317, 0.88035, 0.853141, 0.820257 | 405, 45 |
| P age, middle third | -11.9 [-14.8, -9.9] | -19.2 [-26.7, -11.7] | -22.3 [-33.0, -12.8] | -26.2 [-36.8, -10.0] | 0.949507, 0.924241, 0.891831, 0.966764 | 405, 50 |
| P age, oldest third | -14.7 [-20.1, -11.7] | -26.3 [-34.3, -18.3] | -29.8 [-36.1, -21.5] | -27.6 [-39.6, -7.4] | 0.834091, 0.751452, 0.806317, 0.726713 | 404, 49 |
| Ap at least 40 in the arc | -27.6 [-39.3, -15.3] | -42.8 [-54.7, -17.5] | -47.3 [-55.0, -20.9] | -47.5 [-62.4, -30.1] | 0.820476, 0.800492, 0.786048, 0.773015 | 132, 15 |
| set created within 6 h | -13.2 [-16.0, -10.6] | -19.4 [-26.5, -14.1] | -24.9 [-33.3, -18.2] | -28.1 [-37.5, -12.9] | 0.843552, 0.862756, 0.885238, 0.824888 | 736, 51 |


## Overall statement, report only

Per window the mean ln ratio over the four leads, the median's change, 97.5 % interval, ISO weeks: RFa12 / P -24.1 [-32.3, -16.1]; RFa24 / P -22.9 [-28.4, -16.7]; RF17 / P -19.3 [-26.4, -12.4]; R17 / P -13.3 [-20.6, -6.8]; S17LP / P -5.5 [-8.4, -2.5]; RFa12c / P -16.7 [-24.7, -10.3]; X2 / S72L -23.1 [-28.0, -17.6].

## The 12 h term, report only

A statistic at output with the constants frozen from XM's windows; nothing is fitted with it.

| | Day 1 | Day 2 | Day 3 | Day 7 | p95 upper bound | Pairs, clusters |
|---|---|---|---|---|---|---|
| P + term / P | -28.7 [-31.7, -26.0] | -7.3 [-9.2, -5.4] | -1.7 [-2.4, -1.2] | -0.1 [-0.1, -0.0] | 0.99969, 1.006244, 1.002333, 1.000178 | 1214, 51 |
| RFa12 + term / P + term | -26.5 [-31.4, -19.7] | -34.7 [-41.0, -26.6] | -32.6 [-41.6, -23.2] | -28.7 [-39.8, -14.0] | 0.482974, 0.646255, 0.744791, 0.869634 | 1214, 51 |
| RF17 + term / P + term | -17.5 [-21.2, -13.3] | -21.7 [-29.2, -14.7] | -26.2 [-33.4, -18.2] | -27.7 [-37.4, -16.8] | 0.701375, 0.835114, 0.855646, 0.808874 | 1214, 51 |
| R17 + term / P + term | -13.5 [-18.6, -8.8] | -12.1 [-21.1, -2.4] | -14.8 [-24.7, -5.5] | -21.0 [-31.1, -8.2] | 0.726541, 0.825973, 0.844165, 0.817444 | 1214, 51 |
| X2 + term / P + term | +10.5 [+3.5, +16.3] | +0.5 [-9.1, +11.8] | -7.3 [-18.4, +5.7] | -20.9 [-29.3, -7.9] | 1.027098, 0.965971, 0.936887, 0.822427 | 1214, 51 |
| S17LP + term / P + term | -12.6 [-17.9, -6.8] | -9.6 [-15.3, -5.4] | -6.8 [-10.9, -3.0] | -3.3 [-4.8, -0.8] | 0.733551, 0.901897, 0.984362, 1.016991 | 1214, 51 |
| RFa12 + term / P | -50.1 [-51.8, -48.4] | -43.1 [-47.5, -37.7] | -34.2 [-43.9, -26.3] | -28.7 [-40.1, -13.1] | 0.45877, 0.645344, 0.74968, 0.868076 | 1214, 51 |

## Data preparation

RSGA bulletins of the extension (2024-12-28 to 2025-09-30), normalized before any score: 93 failed XM's parser; 56 held only spaces after the slash; 37 held an observed Ap that is not a number (36 NA, one garbled N60), each taking the previous bulletin's estimate. Afr stands in for Ap on 1 line: 20250516RSGA.txt "Predicted Afr/Ap 17 May-19 May  013/ NA-021/ NA-021/ 10". On the primary span 0 bulletins changed. Windows reading a bulletin over 26 h old: 0. Swarm truth for the extension: ESA reduced-dynamic SP3 COM, newest baseline, file start days 2024-12-27 to 2025-09-29, converted by `fetch-swarm.mjs`, byte-identical to the archive's conversion on a spent day.

The GFZ file holds no F10.7 for 2025-02-12 and 2025-02-17; by XM3's rule a day without a row takes the last row at or before it.

## Failures and arms not run

R17c: 13 space-weather-out-of-range: The 'space_weather' rows start after a day. RF17: 2 fit: MAXIMUM_ITERATIONS. RF17c: 6 fit: analysis/estimation fit_batch; 1 fit: MAXIMUM_ITERATIONS. RFa24c: 1 no positive B from FFM 24 h. A failure is a loss in its cells; an arm not run leaves them, counted. The space-weather refusals of R17c and RF17c (13 windows, sets created 45.6 h or more before the cutoff) come from their 72 h arcs starting before the cutoff's rows (PLAN.md, Amendments 1 and 2): report-only arms, not fit failures, and RFa12c cannot reach them.

## Cost

FFM fit: RK78, relative tolerance 1e-10, absolute 1e-7, steps up to 120 s, input 300 s, seconds (median, p90, mean): RF17 24.94, 68.98, 34.05; RFa24 6.11, 9.11, 6.59; RFa12 2.59, 3.39, 2.7; RFa12c 2.57, 3.35, 2.68. XP fit: third-order Runge-Kutta grid about 3.1 h, no tolerance, input 300 s: X2 0.49 s; R17 0.1 s; RFa12 0.1 s. SGP4 fit: analytic, Levenberg-Marquardt 1e-10, input 300 s: S72L 0.13 s; S17LP 0.04 s. Output 300 s. Under 8 niced workers on a loaded machine.

## Disclosures

These dates were analyzed before for other questions; the spent-window selection of RFa12 and RF17, C2's every-second-day fit of Oct-Dec 2025 and plan H1's dev half are named in PLAN.md. The pool is 87 % Swarm. Space-Track, Planet and truth states stay in the local store; results are aggregates.
