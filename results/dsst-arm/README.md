# DSST beside SGP4, both XPs, AP and FFM

**These rows do not measure DSST. No comparison with DSST is claimed.** Review round 0 of stack issue 316, finding DSST-1 (major): the driver (`experiments/dsst-arm/DsstArm.java`, line 185) builds the zonal force as `new DSSTZonal(provider)` (every committed version of the driver does, 524cd018ac11 and e4b12e1807a6 among them), which gives the zonal field no body-fixed frame, so J2 acts about the GCRF Z axis instead of the Earth's pole of date, 521 arc seconds away in 2026 (precession since J2000). The predicted out-of-plane drift from that pole error, computed per row from the row's own fitted mean elements, matches the observed growth of the cross-track error row by row (603 rows with a 24 h fit: observed median 1.456 km per day, predicted 1.476; correlation 0.999). The kilometers in the DSST column below are the driver's pole, not DSST and not Orekit.

What the rows still say, from the amended run's 1,257 rows (driver e4b12e1807a6, `/opt/data/sdn-archive/operator-theory/dsst-arm/`, never tabulated before; the referee's `rerun/16-dsst-in-plane.mjs`): the in-plane error, sqrt(radial² + in-track²), in strong drag with a 24 h fit, 587 windows, DSST against AP: 0.334 against 0.300 km (2025, day 1), 0.212 against 0.214 (2026, day 1), 2.113 against 2.150 (2026, day 3), 13.44 against 13.02 (2026, day 7); the median paired AP/DSST in-plane ratio is 1.00 to 1.10 at every lead. On the laser spheres AP's in-plane error is 0.14 to 0.41 of DSST's, with 35 of 121 DSST fits failing. The DSST fits were bent by the plane drift, so its in-plane figures are upper bounds. Smaller faults of the arm: the radiation coefficient held at 0.01 m²/kg wherever drag is solved; no prior on the drag coefficient; 48 fits stop at the 50-iteration limit.

Fix (not run here): `new DSSTZonal(itrf, provider)` (and the J2-squared model given the same frame) in `DsstArm.java`, a dated amendment, and the run completed on every registered window. Closing test (DSST-1): on the rerun rows the day-1-to-day-2 cross-track growth is under 0.05 km per day (median) and its correlation with the pole prediction under 0.3; the table, AP beside DSST on the same windows with the paired ratio and a blocked interval, is committed and printed whatever it shows.

The table below is the earlier, superseded run (driver 524cd018ac11, 390 rows), which the plan's amendment of 2026-11-05 (review 2, item 5) bars from any comparison; it is kept as the record of what was run.

## The superseded run's table

Registered: `experiments/dsst-arm/DSST.md at 55740c7c3133a1a0f1d448bbfdd0d5d8c27c463a`. 390 DSST rows (90 failed fits, counted; 32 unscored windows). Median km / 95th percentile km (n) per cell; `table.json` carries every column's build, the paired AP-over-DSST ratio with its interval, and the cost rows.

Build: Orekit 13.1 (bbda7dae7dda), Hipparchus 4.0.1, openjdk version "25.0.2" 2026-01-20, DsstArm.java 524cd018ac11. Cost rows on Mac Studio, Apple M3 Ultra, 28 cores, single thread.

| Reference | Regime | Fit h | Lead h | SGP4 | XP | XPU | AP | FFM20 | FFM40 | FFMfull | Center | DSST | AP/DSST median ratio [97.5 % interval of ln] |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| truth | Low orbit, laser spheres | 24 | 24 | 0.9878 / 3.055 (38) | 0.5673 / 0.9011 (38) | 0.7763 / 1.411 (38) | 0.0144 / 0.0706 (38) |  | 0.012 / 0.0163 (38) |  |  | 0.7764 / 1.518 (38) | 0.0236 [-3.9286, -3.5159] n 38 |
| truth | Low orbit, laser spheres | 24 | 48 | 3.769 / 11.469 (34) | 0.8431 / 1.953 (34) | 1.473 / 5.072 (34) | 0.0245 / 0.2776 (34) |  | 0.0256 / 0.0596 (34) |  |  | 1.476 / 2.971 (34) | 0.0218 [-4.1338, -3.5228] n 34 |
| truth | Low orbit, laser spheres | 24 | 72 | 6.428 / 24.778 (26) | 1.152 / 2.281 (26) | 1.867 / 11.351 (26) | 0.0301 / 0.5285 (26) |  | 0.0371 / 0.1703 (26) |  |  | 2.224 / 4.547 (26) | 0.0244 [-4.3637, -3.5626] n 26 |
| truth | Low orbit, laser spheres | 24 | 168 | 39.632 / 139.4 (32) | 2.625 / 5.888 (32) | 4.311 / 61.823 (32) | 0.1614 / 2.09 (32) |  | 0.1048 / 0.6987 (32) |  |  | 5.259 / 12.439 (32) | 0.0333 [-3.6009, -2.6832] n 32 |
| truth | Low orbit, laser spheres | 72 | 24 | 0.5705 / 0.8191 (49) | 0.4561 / 0.6862 (49) | 0.4738 / 0.676 (49) | 0.023 / 0.0693 (49) |  | 0.0237 / 0.0414 (49) |  |  | 1.513 / 2.958 (49) | 0.017 [-4.4496, -3.912] n 49 |
| truth | Low orbit, laser spheres | 72 | 48 | 0.6496 / 1.274 (44) | 0.5049 / 0.971 (44) | 0.5643 / 0.9284 (44) | 0.0358 / 0.171 (44) |  | 0.0393 / 0.1149 (44) |  |  | 2.202 / 6.015 (44) | 0.0181 [-4.4293, -3.823] n 44 |
| truth | Low orbit, laser spheres | 72 | 72 | 0.7559 / 2.073 (40) | 0.5847 / 1.466 (40) | 0.6132 / 1.501 (40) | 0.0512 / 0.2949 (40) |  | 0.0514 / 0.2695 (40) |  |  | 3.025 / 10.232 (40) | 0.0209 [-4.2445, -3.597] n 40 |
| truth | Low orbit, laser spheres | 72 | 168 | 2.112 / 7.981 (44) | 0.7992 / 6.113 (44) | 1.178 / 6.164 (44) | 0.1927 / 1.54 (44) |  | 0.1087 / 1.125 (44) |  |  | 6.145 / 31.486 (44) | 0.0269 [-3.7819, -3.0399] n 44 |
| truth | Strong drag, 2025 | 24 | 24 | 1.416 / 2.181 (42) | 1.441 / 2.203 (42) | 1.482 / 2.285 (42) | 0.2357 / 0.6099 (42) |  | 0.2165 / 0.5099 (42) |  |  | 1.069 / 1.587 (42) | 0.2045 [-2.0243, -1.4302] n 42 |
| truth | Strong drag, 2025 | 24 | 48 | 4.405 / 8.545 (42) | 4.41 / 8.505 (42) | 4.69 / 8.98 (42) | 1.014 / 3.293 (42) |  | 1.013 / 2.941 (42) |  |  | 3.008 / 3.685 (42) | 0.3501 [-1.1724, -0.5995] n 42 |
| truth | Strong drag, 2025 | 24 | 72 | 9.689 / 18.143 (42) | 9.603 / 17.777 (42) | 10.223 / 19.085 (42) | 2.447 / 9.415 (42) |  | 1.993 / 8.276 (42) |  |  | 4.791 / 9.233 (42) | 0.5332 [-0.8536, -0.2801] n 42 |
| truth | Strong drag, 2025 | 24 | 168 | 49.109 / 96.412 (42) | 48.322 / 94.81 (42) | 52.45 / 96.301 (42) | 13.089 / 72.638 (42) |  | 15.186 / 72.066 (42) |  |  | 16.929 / 69.49 (42) | 0.8803 [-0.4148, -0.0279] n 42 |
| truth | Strong drag, 2026 | 24 | 24 | 1.535 / 2.483 (56) | 1.502 / 2.47 (56) | 1.711 / 2.604 (56) | 0.315 / 1.075 (56) |  | 0.2679 / 0.9137 (56) |  |  | 1.773 / 2.06 (56) | 0.1769 [-2.0695, -1.348] n 56 |
| truth | Strong drag, 2026 | 24 | 48 | 5.402 / 9.627 (56) | 5.328 / 9.699 (56) | 5.694 / 9.753 (56) | 1.413 / 5.312 (56) |  | 1.353 / 5.067 (56) |  |  | 3.598 / 6.419 (56) | 0.3633 [-1.2539, -0.6964] n 56 |
| truth | Strong drag, 2026 | 24 | 72 | 10.981 / 23.345 (56) | 11.115 / 23.346 (56) | 12.096 / 24.018 (56) | 3.036 / 12.203 (56) |  | 2.687 / 11.696 (56) |  |  | 5.927 / 15.046 (56) | 0.5384 [-0.8914, -0.3908] n 56 |
| truth | Strong drag, 2026 | 24 | 168 | 61.715 / 135.9 (56) | 64.048 / 136.6 (56) | 66.178 / 142.9 (56) | 19.031 / 109.4 (56) |  | 18.98 / 102.8 (56) |  |  | 22.581 / 93.252 (56) | 0.8304 [-0.5076, -0.064] n 56 |
| truth | Strong drag, 2026 | 72 | 24 | 1.007 / 5.098 (73) | 0.9935 / 5.045 (73) | 1.002 / 5.009 (73) | 0.5728 / 2.625 (73) |  | 0.5535 / 2.773 (73) |  |  | 1.718 / 3.11 (73) | 0.317 [-1.4324, -0.6426] n 73 |
| truth | Strong drag, 2026 | 72 | 48 | 2.323 / 12.456 (73) | 2.366 / 12.247 (73) | 2.407 / 12.188 (73) | 1.527 / 8.298 (73) |  | 1.57 / 8.22 (73) |  |  | 4.74 / 11.606 (73) | 0.4264 [-1.0589, -0.4464] n 73 |
| truth | Strong drag, 2026 | 72 | 72 | 5.031 / 21.705 (73) | 5.305 / 21.193 (73) | 5.228 / 21.107 (73) | 3.616 / 26.636 (73) |  | 3.365 / 26.638 (73) |  |  | 11.414 / 24.157 (73) | 0.4127 [-1.2624, -0.5012] n 73 |
| truth | Strong drag, 2026 | 72 | 168 | 26.954 / 144.2 (73) | 27.75 / 146.4 (73) | 27.843 / 146.7 (73) | 21.69 / 116.2 (73) |  | 20.807 / 114.1 (73) |  |  | 83.419 / 137.1 (73) | 0.266 [-1.8021, -0.6998] n 73 |

## Cost

per window: CPU user plus system (OperatingSystemMXBean.getProcessCpuTime) and wall for the fit, per object-day of the arc, and for the flight, per object-day flown at the step named; peak heap (the heap pools' peak usage, reset before the call); the JVM's maximum resident set size per process (/usr/bin/time -l); jar bytes 8,496,500 (Orekit) + 3,055,806 (Hipparchus); one uncounted window warms the JVM; the 1-minute load average before and after each window is in its row.

| Input | Regime | Fit h | n | Fit CPU s / object-day | Fit wall | Flight CPU s / object-day | Flight wall | Step s | Peak heap MB |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| operator-file | Geodetic | 48 | 6 | 4.996 | 5.055 | 0.2749 | 0.2943 | 240 | 1150 |
| operator-file | Geodetic | 72 | 5 | 5.255 | 4.948 | 9.552 | 8.028 | 240 | 1227 |
| operator-file | Geostationary, station-kept | 48 | 2 | 11.96 | 14.85 | 0.2157 | 0.2797 | 300 | 1432 |
| operator-file | Low orbit, crewed | 24 | 4 | 30.35 | 30.17 | 0.3968 | 0.4057 | 240 | 1422 |
| operator-file | Low orbit, crewed | 48 | 9 | 10.02 | 12.04 | 0.3166 | 0.3622 | 240 | 1427 |
| operator-file | Low orbit | 48 | 2 | 11 | 11.1 | 0.4211 | 0.3049 | 210 | 1148 |
| operator-file | Low orbit | 72 | 3 | 9.446 | 9.733 | 0.2371 | 0.2369 | 210 | 1548 |
| operator-file | Navigation, ultra-rapid | 24 | 8 | 11.82 | 7.413 | 0.205 | 0.129 | 300 | 815 |
| operator-file | Navigation, ultra-rapid | 48 | 7 | 8.714 | 5.534 | 0.1769 | 0.1399 | 300 | 817 |
| operator-file | Navigation | 48 | 9 | 5.435 | 4.838 | 0.1974 | 0.1736 | 900 | 984 |
| operator-file | Navigation | 72 | 8 | 4.729 | 3.685 | 0.2753 | 0.227 | 900 | 1012 |
| precise-orbit | Geostationary, station-kept | 24 | 2 | 23.21 | 18.15 | 0.1486 | 0.139 | 512 | 975 |
| precise-orbit | Geostationary, station-kept | 72 | 9 | 12.34 | 12.04 | 0.1384 | 0.1401 | 512 | 1075 |
| precise-orbit | Geostationary | 72 | 5 | 7.414 | 8.314 | 0.1667 | 0.2764 | 300 | 2197 |
| precise-orbit | Highly elliptical, THEMIS and Chandra | 168 | 1 | 8.131 | 6.811 | 0.1547 | 0.1077 | 300 | 825 |
| precise-orbit | Highly elliptical | 72 | 2 | 5.769 | 6.479 | 22.82 | 24.76 | 300 | 3239 |
| precise-orbit | Inclined geosynchronous | 72 | 10 | 6.783 | 6.656 | 0.143 | 0.145 | 300 | 1867 |
| precise-orbit | Laser geodetic | 72 | 9 | 4.987 | 5.024 | 0.1157 | 0.1164 | 360 | 1475 |
| precise-orbit | Low orbit, altimetry | 24 | 7 | 13.36 | 13.49 | 0.1639 | 0.1659 | 300 | 1834 |
| precise-orbit | Low orbit, altimetry | 72 | 7 | 7.028 | 7.12 | 0.1683 | 0.1669 | 300 | 1889 |
| precise-orbit | Low orbit, laser spheres | 24 | 2 | 17.7 | 14.65 | 0.1392 | 0.1357 | 480 | 938 |
| precise-orbit | Low orbit, laser spheres | 72 | 7 | 9.163 | 9.149 | 0.1643 | 0.163 | 480 | 1194 |
| precise-orbit | Medium Earth orbit | 24 | 10 | 9.823 | 9.032 | 0.1327 | 0.137 | 300 | 1748 |
| precise-orbit | Medium Earth orbit | 72 | 10 | 5.075 | 4.959 | 0.1332 | 0.1335 | 300 | 1788 |
| precise-orbit | Near 700 km | 24 | 6 | 24.25 | 24.47 | 0.1743 | 0.1765 | 300 | 1809 |
| precise-orbit | Near 700 km | 72 | 5 | 5.416 | 5.482 | 0.1717 | 0.1734 | 300 | 1420 |
| precise-orbit | Strong drag, 2025 | 24 | 8 | 28.15 | 25.85 | 0.1921 | 0.1834 | 300 | 1058 |
| precise-orbit | Strong drag, 2026 | 24 | 9 | 27.95 | 24.79 | 0.1972 | 0.1858 | 300 | 1380 |
| precise-orbit | Strong drag, 2026 | 72 | 9 | 6.647 | 5.557 | 0.2029 | 0.1992 | 300 | 1305 |

Process ap/b0411/laser/forward: maximum resident set size 2164 MB, 60 windows, openjdk version "25.0.2" 2026-01-20.

Process ap/b0411/providers (ISS): maximum resident set size 2592 MB, 20 windows, openjdk version "25.0.2" 2026-01-20.

Process ap/b0411/providers: maximum resident set size 1859 MB, 60 windows, openjdk version "25.0.2" 2026-01-20.

Process ap/b051/regimes-hx: maximum resident set size 1117 MB, 12 windows, openjdk version "25.0.2" 2026-01-20.

Process ap/b051/regimes-wa: maximum resident set size 1820 MB, 20 windows, openjdk version "25.0.2" 2026-01-20.

Process ap/b051/regimes: maximum resident set size 5767 MB, 84 windows, openjdk version "25.0.2" 2026-01-20.

Process ap/b051/truth: maximum resident set size 1788 MB, 10 windows, openjdk version "25.0.2" 2026-01-20.

Process ap/b051/truth2: maximum resident set size 3458 MB, 60 windows, openjdk version "25.0.2" 2026-01-20.
