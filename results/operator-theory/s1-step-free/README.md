# FFM against AP on step-free Sentinel-1 windows, 2025

Report only, `experiments/operator-theory/S1-STEP-FREE.md`. Its windows are spent (amendment 1): no verdict rests on this table.

Builds: FFM `propagator/ffm` 2.2.0 (dist d635a3d57a2c, modules f1517ef68e) fitted by `analysis/estimation` 0.7.0 (7a555ca5b3ed) at CHEAPER.md's settings; AP on modules ea824356: sdn-ap 0.5.1 (d29acd2b5d92), sgp4-xp 0.2.1 (816fd137d761); the flag's `foundation/orbits` 0.1.0 (dist 7fb367fa947c, modules f1517ef68e).

Windows: Sentinel-1A and 1C, cutoff every day from 2025-10-05 to 2025-12-28, 170 in all; both arms scored on 166; FFM failed on 4, AP on 4.

The registered cell, step-free at day 7 from a 24 h fit: 26 windows, FFM worse in 65.4 % [23.1 %, 100 %], median FFM/AP 1.957 [0.17, 3.449].

Against the thresholds (share under 50 %, median under 1, at least 30 windows) it is inconclusive: 26 step-free windows. Without the floor, its share is not under 50 % and its median not under 1, so it would fail. As registered after amendment 1 it is report only, so it neither passes nor fails.

| Day | Flagged n | FFM / AP median km, flagged | FFM worse, flagged | Median FFM/AP, flagged | Step-free n | FFM / AP median km, step-free | FFM worse, step-free | Median FFM/AP, step-free | Unchecked n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 48 | 0.0701 / 0.175 | 33.3 % | 0.585 | 106 | 0.0182 / 0.1384 | 13.2 % | 0.157 | 8 |
| 2 | 70 | 0.9052 / 0.5888 | 54.3 % | 1.135 | 81 | 0.1204 / 0.4499 | 30.9 % | 0.284 | 11 |
| 3 | 88 | 1.559 / 1.007 | 69.3 % | 1.419 | 64 | 0.4447 / 0.8953 | 39.1 % | 0.444 | 10 |
| 7 | 127 | 7.182 / 3.404 | 80.3 % | 2.224 | 26 | 3.472 / 2.027 | 65.4 % | 1.957 | 7 |

The flag: `lib/steps.mjs` as registered (revolution time means of `foundation/orbits`' osculating semimajor axis; a step of 8 m or more against the drift), a window flagged when a step falls in [cutoff - 24 h, cutoff + the lead], step-free when none does and the detector covered both, unchecked otherwise. `table.json` holds every window's steps and every figure.
