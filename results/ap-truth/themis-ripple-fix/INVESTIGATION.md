# Fit sensitivity (THEMIS-RIPPLE-FIX.md Amendment 8)

Rows: /opt/data/sdn-archive/operator-theory/themis-ripple-fix/fit-investigation (run.mjs, 12 THEMIS windows, vacuum, 72 h fits, 7 days
at 300 s). Table: investigation.json (investigation.mjs). Builds: base = sdn-ap 0.6.1 dist (05dd4a66); C1 43692be6 (own exact grid
per set, in-flight re-grid); C2 (shared grids, re-grid); C3 eca9db70 (shared grids, no re-grid; modules WIP a1421173e); C4 d1c0c907
(own exact grid per set, no re-grid; C3 with the cache's sharing tolerance zero).

Paired ratio candidate / base of the 3D RMS per window, median [95 % window-cluster bootstrap]; margin 1.05 on the upper bound:

| Arm | Roughness (m) | Day 1 ratio | Day 3 ratio | Day 7 ratio | Unpaired medians d1 / d3 / d7 (m) | Fit residual RMS (km) | Iterations | Fit (s) |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| base | 2.820 | 1 | 1 | 1 | 195.1 / 405.1 / 1004.7 | 0.0879 | 16.5 | 25.3 |
| C1 | 0.073 | 0.958 [0.920, 1.419] | 0.999 [0.975, 1.017] | 1.011 [0.965, 1.052] | 222.4 / 411.9 / 983.2 | 0.0646 | 16.5 | 133.1 |
| C2 | 0.071 | 0.962 [0.928, 1.746] | 1.010 [0.975, 1.380] | 1.010 [0.949, 1.052] | 228.3 / 564.1 / 983.2 | 0.0646 | 17.5 | 113.3 |
| C3 | 0.073 | 0.957 [0.928, 0.995] | 1.010 [0.976, 1.017] | 1.015 [0.985, 1.051] | 220.9 / 647.5 / 1080.2 | 0.0646 | 17 | 7.1 |
| C4 | 0.073 | 0.951 [0.916, 0.975] | 0.999 [0.975, 1.014] | 0.999 [0.973, 1.039] | 194.5 / 503.5 / 983.4 | 0.0619 | 17 | 31.6 |

Fitted mean elements against the base's (median absolute): e 3e-8 to 5e-8, mean anomaly 9e-6 to 1.4e-5 deg (C4 smallest).
Every candidate fits the arc better than the base (residual RMS 62 to 65 m against 88 m).

Reading: per window the candidate equals the base within a few percent at days 3 and 7 on 11 of 12 windows; the unpaired day-3 median
moves because the window errors cluster between 300 and 790 m and the median changes window. One window fails on every candidate:
THEMIS A 2013-02-15, day 3 314.1 m on the base against 3,238.9 m on C4 (3,072.3 m on C1): a fit that lands elsewhere. C4 clears the
paired margin at days 1, 3 and 7; C3 misses it at day 7 by 0.001 (1.051); C1 and C2 miss it at day 1. Shared element-linear grids in a
fit's perturbed sets (C3) cost consistency; an exact grid per set (C4) restores it at 31.6 s per fit.
The second-order hypothesis was not tested (the residual spectrum is the next box's).
