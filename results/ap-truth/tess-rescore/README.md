# TESS re-scored on the ten-minute nodes

Registration: experiments/operator-theory/TESS-RESCORE.md. 7 windows (cutoffs 2026-07-27 to 09-07, weekly), fits of 72 h and 336 h, vacuum; every arm on its cells.json build. Report only.
CC: fit and scored on the chord-filled series (300 s; cells.json's figures). NN: fit and scored on the kernels' ten-minute nodes only. CN: the chord fit scored on the nodes.
NS: the NN fit scored on one kernel only (the newest file that covers the whole forecast; no solution switch inside). Median km (95th percentile km) over the windows of each lead day's 3D RMS.

Control: 560 of 560 window values equal the stored before (CC) and after (NN) values of results/ap-truth/tess-nodes-20261105.json; cells.json's TESS cells from CC: equal.
Nodes: 40320 NN epochs scored, 0 off the node lattice, 0 at a nearest node, 0 interpolated. The lead ends (24, 48, 72, 168 h, 00:00 UTC) land exactly on nodes: yes, every window.

| Fit h | Lead h | Arm | CC | CN | NN | NS | NN - CC (median) |
|---:|---:|---|---|---|---|---|---:|
| 72 | 24 | SGP4 | 1909.4 (3501.5) | 1913.5 (3508.2) | 1911.4 (3500.6) | 1911.4 (3500.7) | 2 |
| 72 | 24 | XP | 0.6604 (0.8761) | 0.4965 (0.9048) | 0.6163 (1.213) | 0.6044 (1.222) | -0.0441 |
| 72 | 24 | XPU | 1.732 (3.161) | 1.633 (2.871) | 1.633 (2.871) | 1.589 (2.87) | -0.099 |
| 72 | 24 | AP | 0.623 (0.8282) | 0.4508 (0.8469) | 0.5944 (1.15) | 0.5863 (1.157) | -0.0286 |
| 72 | 24 | FFM20 | 1.003 (1.292) | 1.029 (1.283) | 0.3327 (0.7073) | 0.3441 (0.6997) | -0.6703 |
| 72 | 48 | SGP4 | 4803.6 (7943.6) | 4808.7 (7952) | 4804.9 (7937.7) | 4804.9 (7937.8) | 1.3 |
| 72 | 48 | XP | 1.061 (1.464) | 1.086 (1.509) | 1.359 (3.445) | 1.459 (3.465) | 0.298 |
| 72 | 48 | XPU | 3.973 (7.934) | 4.046 (7.821) | 4.046 (7.821) | 4.049 (7.827) | 0.073 |
| 72 | 48 | AP | 0.9305 (1.3) | 0.961 (1.341) | 1.356 (3.347) | 1.397 (3.365) | 0.4255 |
| 72 | 48 | FFM20 | 1.727 (2.16) | 1.75 (2.139) | 0.9964 (2.13) | 0.9247 (2.131) | -0.7306 |
| 72 | 72 | SGP4 | 7707.6 (13168.6) | 7712.4 (13178.4) | 7706.9 (13155.8) | 7706.9 (13155.9) | -0.7 |
| 72 | 72 | XP | 1.386 (2.43) | 1.302 (2.496) | 2.491 (6.597) | 2.619 (6.593) | 1.105 |
| 72 | 72 | XPU | 7.139 (14.444) | 7.226 (14.392) | 7.226 (14.392) | 7.227 (14.407) | 0.087 |
| 72 | 72 | AP | 1.391 (2.174) | 1.252 (2.242) | 2.425 (6.492) | 2.556 (6.49) | 1.034 |
| 72 | 72 | FFM20 | 2.21 (2.699) | 2.221 (2.662) | 1.622 (4.272) | 1.62 (4.289) | -0.588 |
| 72 | 168 | SGP4 | 28191.7 (43368.7) | 28201 (43385.5) | 28170.1 (43328.3) | 28170.1 (43328.4) | -21.6 |
| 72 | 168 | XP | 6.541 (12.247) | 6.499 (12.394) | 12.452 (23.925) | 12.459 (23.917) | 5.911 |
| 72 | 168 | XPU | 42.85 (50.081) | 42.881 (50.071) | 42.881 (50.071) | 42.878 (50.063) | 0.031 |
| 72 | 168 | AP | 6.59 (11.895) | 6.549 (12.038) | 12.643 (23.831) | 12.651 (23.822) | 6.053 |
| 72 | 168 | FFM20 | 5.115 (11.336) | 5.048 (11.525) | 11.654 (17.992) | 11.66 (17.981) | 6.539 |
| 336 | 24 | SGP4 | 5762.5 (8020.4) | 5769.1 (8029.2) | 5765.8 (8027.9) | 5765.8 (8027.9) | 3.3 |
| 336 | 24 | XP | 1.792 (8.174) | 1.74 (8.075) | 1.81 (8.084) | 1.809 (8.094) | 0.018 |
| 336 | 24 | XPU | 1.974 (7.777) | 1.797 (7.681) | 1.853 (7.672) | 1.853 (7.681) | -0.121 |
| 336 | 24 | AP | 1.9 (8.19) | 1.847 (8.092) | 1.856 (8.195) | 1.86 (8.206) | -0.044 |
| 336 | 24 | FFM20 | 1.7 (6.673) | 1.687 (6.613) | 1.366 (6.688) | 1.362 (6.689) | -0.334 |
| 336 | 48 | SGP4 | 8931.1 (12573.5) | 8935.1 (12580.4) | 8932.4 (12579.7) | 8932.4 (12579.6) | 1.3 |
| 336 | 48 | XP | 4.348 (14.172) | 4.213 (14.112) | 4.758 (14.153) | 4.751 (14.18) | 0.41 |
| 336 | 48 | XPU | 4.584 (12.479) | 4.469 (12.419) | 4.741 (12.321) | 4.736 (12.33) | 0.157 |
| 336 | 48 | AP | 4.528 (14.306) | 4.404 (14.247) | 4.705 (14.225) | 4.7 (14.252) | 0.177 |
| 336 | 48 | FFM20 | 2.442 (9.784) | 2.345 (9.722) | 2.006 (9.844) | 1.986 (9.833) | -0.436 |
| 336 | 72 | SGP4 | 10547.5 (16283.3) | 10549.4 (16289.9) | 10547.6 (16288.7) | 10547.6 (16288.7) | 0.1 |
| 336 | 72 | XP | 6.955 (21.34) | 6.928 (21.302) | 8.032 (21.153) | 8.113 (21.178) | 1.077 |
| 336 | 72 | XPU | 7.737 (18.597) | 7.711 (18.543) | 8.033 (18.356) | 8.115 (18.353) | 0.296 |
| 336 | 72 | AP | 7.018 (21.486) | 6.991 (21.448) | 8.07 (21.26) | 8.157 (21.285) | 1.052 |
| 336 | 72 | FFM20 | 3.129 (14.251) | 3.016 (14.184) | 3.173 (14.367) | 3.147 (14.339) | 0.044 |
| 336 | 168 | SGP4 | 16656 (55812.5) | 16649.1 (55833.6) | 16641.5 (55825) | 16641.5 (55825) | -14.5 |
| 336 | 168 | XP | 26.251 (88.061) | 26.232 (88.016) | 26.661 (87.677) | 26.65 (87.677) | 0.41 |
| 336 | 168 | XPU | 25.747 (83.791) | 25.728 (83.744) | 26.268 (83.656) | 26.256 (83.657) | 0.521 |
| 336 | 168 | AP | 26.275 (87.692) | 26.256 (87.646) | 26.601 (88.216) | 26.589 (88.217) | 0.326 |
| 336 | 168 | FFM20 | 11.758 (67.111) | 11.716 (67.023) | 11.947 (67.892) | 11.947 (67.893) | 0.189 |

## The day-3/7 worsening (72 h fit; the four windows 07-27, 08-10, 08-24, 09-07; medians over the four, km)

| Arm | Day | CC | CN | NN | NS | NN - CC | of it, the fit (NN - CN) | of it, the scoring (CN - CC) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| SGP4 | 3 | 10939.98 | 10947.43 | 10931.21 | 10931.20 | -8.78 | -16.22 | 7.45 |
| SGP4 | 7 | 31284.67 | 31295.60 | 31258.54 | 31258.53 | -26.13 | -37.06 | 10.93 |
| XP | 3 | 1.33 | 1.27 | 6.31 | 6.33 | 4.91 | 5.02 | -0.11 |
| XP | 7 | 5.44 | 5.42 | 20.68 | 20.67 | 14.09 | 14.12 | -0.03 |
| XPU | 3 | 12.74 | 12.67 | 12.67 | 12.67 | -0.06 | 0.00 | -0.06 |
| XPU | 7 | 45.51 | 45.49 | 45.49 | 45.49 | -0.01 | 0.00 | -0.01 |
| AP | 3 | 1.35 | 1.23 | 6.18 | 6.20 | 4.81 | 4.92 | -0.11 |
| AP | 7 | 5.33 | 5.31 | 20.70 | 20.70 | 14.18 | 14.21 | -0.03 |
| FFM20 | 3 | 2.53 | 2.45 | 3.56 | 3.56 | 0.88 | 0.93 | -0.04 |
| FFM20 | 7 | 4.95 | 4.90 | 17.36 | 17.35 | 10.77 | 10.81 | -0.04 |

## AP ablations (72 h fit; NN - CC median over the four windows, and the medians over all 7)

| Arm | Windows | build SHA-256 | Day 3 NN - CC | Day 7 NN - CC | Day 1 CC / NN (7) | Day 3 CC / NN (7) | Day 7 CC / NN (7) |
|---|---:|---|---:|---:|---|---|---|
| AP(0,20)@0.5.1 | 7 | d29acd2b5d92 | 4.81 | 14.18 | 0.62 / 0.59 | 1.39 / 2.43 | 6.59 / 12.64 |
| AP(4,20)@0.5.1 | 7 | d29acd2b5d92 | 4.81 | 14.18 | 0.62 / 0.59 | 1.39 / 2.43 | 6.59 / 12.64 |
| AP(12,20)@0.5.1 | 7 | d29acd2b5d92 | 4.81 | 14.18 | 0.62 / 0.59 | 1.39 / 2.43 | 6.59 / 12.64 |
| AP(31,0)@0.5.1 | 7 | d29acd2b5d92 | 4.81 | 14.18 | 0.62 / 0.59 | 1.39 / 2.43 | 6.59 / 12.64 |
| AP(0,0)@0.5.1 | 7 | d29acd2b5d92 | 4.91 | 14.09 | 0.66 / 0.62 | 1.39 / 2.49 | 6.54 / 12.45 |
| AP(31,20)@0.6.1 | 7 | 05dd4a6600fb | 4.81 | 14.18 | 0.62 / 0.59 | 1.39 / 2.43 | 6.59 / 12.64 |
| AP(0,20)@0.6.1 | 7 | 05dd4a6600fb | 4.81 | 14.18 | 0.62 / 0.59 | 1.39 / 2.43 | 6.59 / 12.64 |
| AP(31,20)@0.5.1>0.6.1 | 7 | d29acd2b5d92 > 05dd4a6600fb | 4.81 | 14.18 | 0.62 / 0.59 | 1.39 / 2.43 | 6.59 / 12.64 |
| AP(31,20)@0.6.1>0.5.1 | 7 | 05dd4a6600fb > d29acd2b5d92 | 4.81 | 14.18 | 0.62 / 0.59 | 1.39 / 2.43 | 6.59 / 12.64 |
| AP(31,20)@0.4.14 | 7 | 525d57599048 | 4.81 | 14.18 | 0.62 / 0.59 | 1.39 / 2.43 | 6.59 / 12.64 |
| AP(31,20)@0.4.15 | 7 | 2cdec7f54d7b | 4.81 | 14.18 | 0.62 / 0.59 | 1.39 / 2.43 | 6.59 / 12.64 |

## Windows: switches, velocity steps and their effect (72 h fit)

| Cutoff | Four | Switches in arc / forecast | Velocity steps (epoch, radius km, |dv| mm/s, where) | Step effect day 3 / 7 (km) | Floor day 3 / 7 (km; controls) | AP CC / CN / NN day 3 | AP day 7 | XP day 7 | FFM day 3 | FFM day 7 |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-07-27 | yes | 0 / 2 | 08-02T09:40 368422 3.2 forecast, 153.7 h after the cutoff | 0.00 / 0.19 | 0.52 / 1.77 (3) | 1.11 / 1.12 / 2.42 | 2.51 / 2.49 / 6.29 | 2.73 / 2.72 / 6.28 | 2.21 / 2.22 / 0.81 | 3.16 / 3.17 / 4.68 |
| 2026-08-03 |  | 0 / 2 | 08-02T09:40 368422 3.2 arc, 14.3 h before the cutoff; 08-09T13:50 131255 4.2 forecast, 157.8 h after the cutoff | 2.62 / 16.39 | 0.01 / 0.05 (3) | 2.39 / 2.46 / 2.37 | 9.79 / 9.73 / 9.29 | 10.86 / 10.81 / 8.66 | 0.87 / 0.96 / 0.85 | 4.49 / 4.56 / 4.03 |
| 2026-08-10 | yes | 0 / 2 | 08-09T13:50 131255 4.2 arc, 10.2 h before the cutoff; 08-16T15:50 366609 4.5 forecast, 159.8 h after the cutoff | 6.32 / 22.81 | 0.01 / 0.06 (4) | 1.30 / 1.20 / 6.15 | 8.97 / 8.92 / 19.98 | 8.83 / 8.78 / 19.89 | 2.44 / 2.37 / 4.38 | 8.59 / 8.54 / 18.05 |
| 2026-08-17 |  | 0 / 2 | 08-16T15:50 366609 4.5 arc, 8.2 h before the cutoff; 08-23T23:10 138430 3.7 forecast, 167.2 h after the cutoff | 2.91 / 27.73 | 0.03 / 0.23 (4) | 0.89 / 0.96 / 0.90 | 3.10 / 3.11 / 2.66 | 2.61 / 2.59 / 2.90 | 1.46 / 1.52 / 1.46 | 9.91 / 10.06 / 9.58 |
| 2026-08-24 | yes | 0 / 2 | 08-23T23:10 138430 3.7 arc, 0.8 h before the cutoff | 4.10 / 17.94 | 0.06 / 0.30 (4) | 1.39 / 1.25 / 6.61 | 6.59 / 6.55 / 24.86 | 6.54 / 6.50 / 24.97 | 2.74 / 2.72 / 4.02 | 4.78 / 4.75 / 16.86 |
| 2026-08-31 |  | 0 / 2 | 08-31T05:50 365325 5.0 forecast, 5.8 h after the cutoff | 1.45 / 7.65 | 0.04 / 0.07 (3) | 1.68 / 1.73 / 1.71 | 12.80 / 13.03 / 12.64 | 12.84 / 13.07 / 12.45 | 1.62 / 1.68 / 1.62 | 11.95 / 12.15 / 11.65 |
| 2026-09-07 | yes | 0 / 0 | 09-07T11:30 133807 6.4 forecast, 11.5 h after the cutoff | 2.89 / 17.18 | 0.17 / 0.13 (1) | 1.44 / 1.31 / 6.22 | 4.08 / 4.07 / 21.43 | 4.34 / 4.34 / 21.48 | 2.61 / 2.54 / 3.10 | 5.12 / 5.05 / 17.86 |

## Verdict

Clean re-score: holds. 560 of 560 window values reproduce the stored chord-filled and node-only figures; cells.json's TESS cells come out of CC unchanged;
40,320 scored epochs, every one a kernel node, none interpolated, none moved to a nearest node; every lead end is a node.

Where the change lies: in the fit, not the scoring. The chord fits scored on the nodes (CN) equal the chord-filled figures (AP day 7 on the four windows
5.31 against 5.33 km); the whole change comes from fitting on the nodes (NN - CN 14.21 km of NN - CC 14.18 km). The Space Force XP does not move because
its fit thins any arc to at most 240 states (propagator/sgp4-xp src/fit.hpp), which on both series are the same 1,200 s subset of nodes: CN equals NN.
Arcs of the four windows hold or approach perigee (07-26 04:00, 08-09 13:40, 08-23 22:40; 09-07 07:50 eight hours after the cutoff), where the chord states
sit up to about 1 km inside the orbit; the other three arcs end near apogee, where NN moves from CC by -2.2 to +0.3 km at day 7 (AP, XP, FFM).

Named term: TESS's perigee velocity steps (momentum unloads, 3.7 to 6.4 mm/s in the kernels). On 08-10 and 08-24 the step lies 10.2 h and 0.8 h before the
cutoff, on 09-07 11.5 h after it; its effect by module (two FFM fits either side of it, flown alike) is 6.3, 4.1 and 2.9 km at day 3 and 22.8, 17.9 and 17.2 km
at day 7, against a floor of 0.3 km or less, and the node-only day-7 errors are 20.0, 24.9 and 21.4 km (AP), 19.9, 25.0 and 21.5 km (XP), 18.0, 16.9 and
17.9 km (FFM). The chord fits had hidden those maneuvers' effect: the earlier lower figures were compensating error. 07-27 holds no step in its arc or before
day 7 (the next, 3.2 mm/s at apogee, 153.7 h in): its node-only day 7 (AP 6.29, XP 6.28, FFM 4.68 km) is the arms' own error, which the chord states
offset (2.51, 2.73, 3.16 km), and no tested term names it.

AP's terms: not involved. Every tesseral cap (0, 4, 12, 31), the zonal tail off, 0.6.1, 0.5.1 and 0.6.1 sets flown across builds, and 0.4.14 against 0.4.15
give the same figures to the meter; (0, 0) moves AP to whiteroom XP's figures. The wide tesseral series (0.4.15 on, e above 0.3) leaves no trace on TESS
at these builds, and FFM, a numerical integration with no such series, worsens alike.

Worsening explained by the registered rule: no. The step accounts for three of the four windows at day 7 and for 08-10 and 08-24 at day 3; 09-07's day-3
effect (2.89 km) falls just short of half its AP error (3.11 km), and 07-27 has no step. TESS stays withheld; the SDN-AP session reports to the owner.
Stated plainly: the node-only figures are the clean ones; the day-3/7 rise on three windows is unmodeled perigee momentum unloads, which a site record
would carry as burns in the fit or forecast, and one window's rise remains unattributed.

experiments-heo-truth-nodes-20261104 is folded here: it reached the same cause (one in ten kernel records is an orbit state, the rest chords; velocity
steps at apsides), the reader keeps the nodes since db3b1ab5 (experiments/ap6-heo/TRUTH-SERIES.md, truth-series.e2e.mjs), and this re-score measures what
it predicted, that the perigee windows' earlier lead was partly compensating error. Its Chandra joins and SPICE cross-check are not covered here.

Rule: worsening (NN above CC by more than 10 % at day 3 or 7, 72 h fit, 7-window median) in AP, XP, FFM20; fit side (NN - CN at least half of NN - CC for AP, XP and FFM): yes;
ablations moving AP's worsening by more than 25 %: none; XP and FFM worsen alike: yes; wide tesseral series involved: no;
a step's module effect at least half the NN error at days 3 and 7 and at least twice the floor, on each of the four windows: no; an ablation returning NN within 25 % of CC: none.
Condition 1, clean re-score: holds. Condition 2, worsening explained: does not hold. TESS: stays withheld.
