# Registered confirmation on unread 24 h windows of the sdn-ap 0.4.7 short-arc AGOM prior

Registered by the commit named in `check.mjs`; 3643 windows read. Intervals are the 95 % percentile interval of a 10,000-draw cluster bootstrap by ISO week of the cutoff. Verdicts follow the registered point criterion; `interval inside` says whether the whole interval meets it too.

## Statements

| Statement | Verdict |
|---|---|
| G1. Paired day-3 whiteroom XP less Space Force XP within 10 m of zero on unread GNSS, a gain of at least 29 m against the 0.4.5 fitter | PASS |
| G1.NG. GPS alone | REPORT ONLY (criterion met) |
| G1.NR. GLONASS alone | REPORT ONLY (criterion met) |
| G1.NE. Galileo alone | REPORT ONLY (criterion met) |
| G0. Control on AP5's read GNSS windows, cutoffs to 2026-05-24 (the module's figures on its 748 windows to 2026-05-31: +56.107 m and -4.097 m) | REPORT ONLY (criterion met) |
| G2.GNSS. GNSS: AP 0.4.7 not worse than AP 0.4.5 by more than 5 % in the median | PASS |
| G2.NG. NG: AP 0.4.7 not worse than AP 0.4.5 by more than 5 % in the median | PASS |
| G2.NR. NR: AP 0.4.7 not worse than AP 0.4.5 by more than 5 % in the median | PASS |
| G2.NE. NE: AP 0.4.7 not worse than AP 0.4.5 by more than 5 % in the median | PASS |
| G2.S1. S1: AP 0.4.7 not worse than AP 0.4.5 by more than 5 % in the median | PASS |
| G2.LS. LS: AP 0.4.7 not worse than AP 0.4.5 by more than 5 % in the median | PASS |
| G2.DO. DO: AP 0.4.7 not worse than AP 0.4.5 by more than 5 % in the median | PASS |
| G2.HC. HC: AP 0.4.7 not worse than AP 0.4.5 by more than 5 % in the median | PASS |
| G3.S1. S1: whiteroom XP 0.4.7 not worse than 0.4.5 by more than 5 % in the median | PASS |
| G3.LS. LS: whiteroom XP 0.4.7 not worse than 0.4.5 by more than 5 % in the median | PASS |
| G3.DO. DO: whiteroom XP 0.4.7 not worse than 0.4.5 by more than 5 % in the median | PASS |
| G3.HC. HC: whiteroom XP 0.4.7 not worse than 0.4.5 by more than 5 % in the median | PASS |

### G1. Paired day-3 whiteroom XP less Space Force XP within 10 m of zero on unread GNSS, a gain of at least 29 m against the 0.4.5 fitter: PASS

Pooled NG, NR, NE, 24 h fits, day 3: the median over windows of XP less U is within +-10 m of zero, and median(X45 less U) less median(XP less U) is at least 29 m. Both must hold.

- day 3: median paired XP24 less U24 -6.029 m [-9.117, -2.963] (within +-10 m: yes); gain against X4524 53.708 m [51.077, 56.969] (at least 29 m: yes); interval inside yes; n 2488, weeks 25, noBin 25, coverage 22

### G1.NG. GPS alone: REPORT ONLY (criterion met)

As G1 on NG alone. REPORT ONLY.

- day 3: median paired XP24 less U24 -7.149 m [-11.050, -3.377] (within +-10 m: yes); gain against X4524 46.306 m [42.669, 50.184] (at least 29 m: yes); interval inside no; n 1035, weeks 25, noBin 19, coverage 9

### G1.NR. GLONASS alone: REPORT ONLY (criterion met)

As G1 on NR alone. REPORT ONLY.

- day 3: median paired XP24 less U24 -7.733 m [-11.893, -0.907] (within +-10 m: yes); gain against X4524 75.677 m [65.103, 81.089] (at least 29 m: yes); interval inside no; n 687, weeks 25, noBin 3, coverage 11

### G1.NE. Galileo alone: REPORT ONLY (criterion met)

As G1 on NE alone. REPORT ONLY.

- day 3: median paired XP24 less U24 -5.086 m [-8.231, -1.299] (within +-10 m: yes); gain against X4524 55.615 m [51.555, 60.806] (at least 29 m: yes); interval inside yes; n 766, weeks 25, noBin 3, coverage 2

### G0. Control on AP5's read GNSS windows, cutoffs to 2026-05-24 (the module's figures on its 748 windows to 2026-05-31: +56.107 m and -4.097 m): REPORT ONLY (criterion met)

As G1 on GNr, 24 h fits, day 3. REPORT ONLY: AP5's windows are read.

- day 3: median paired XP24 less U24 -4.242 m [-11.325, 2.909] (within +-10 m: yes); gain against X4524 60.348 m [54.166, 68.839] (at least 29 m: yes); interval inside no; n 718, weeks 21, noBin 1, coverage 1

### G2.GNSS. GNSS: AP 0.4.7 not worse than AP 0.4.5 by more than 5 % in the median: PASS

Median over NG+NR+NE windows of e(AP) / e(A45), 24 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio AP24 / A4524 0.5131 [0.5048, 0.5218]; ratio of medians 0.5286; at most 1.05, interval inside; n 2500, weeks 25, noBin 13, coverage 22
- day 3: median paired ratio AP24 / A4524 0.4558 [0.4481, 0.4633]; ratio of medians 0.4800; at most 1.05, interval inside; n 2488, weeks 25, noBin 25, coverage 22
- day 7: median paired ratio AP24 / A4524 0.5152 [0.5043, 0.5280]; ratio of medians 0.5138; at most 1.05, interval inside; n 2491, weeks 25, noBin 22, coverage 22

### G2.NG. NG: AP 0.4.7 not worse than AP 0.4.5 by more than 5 % in the median: PASS

Median over NG windows of e(AP) / e(A45), 24 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio AP24 / A4524 0.5117 [0.5046, 0.5220]; ratio of medians 0.5134; at most 1.05, interval inside; n 1044, weeks 25, noBin 10, coverage 9
- day 3: median paired ratio AP24 / A4524 0.4577 [0.4468, 0.4678]; ratio of medians 0.4573; at most 1.05, interval inside; n 1035, weeks 25, noBin 19, coverage 9
- day 7: median paired ratio AP24 / A4524 0.5222 [0.5088, 0.5376]; ratio of medians 0.5074; at most 1.05, interval inside; n 1046, weeks 25, noBin 8, coverage 9

### G2.NR. NR: AP 0.4.7 not worse than AP 0.4.5 by more than 5 % in the median: PASS

Median over NR windows of e(AP) / e(A45), 24 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio AP24 / A4524 0.4659 [0.4584, 0.4739]; ratio of medians 0.4503; at most 1.05, interval inside; n 687, weeks 25, noBin 3, coverage 11
- day 3: median paired ratio AP24 / A4524 0.4159 [0.4111, 0.4226]; ratio of medians 0.4086; at most 1.05, interval inside; n 687, weeks 25, noBin 3, coverage 11
- day 7: median paired ratio AP24 / A4524 0.4249 [0.4209, 0.4283]; ratio of medians 0.4153; at most 1.05, interval inside; n 679, weeks 25, noBin 11, coverage 11

### G2.NE. NE: AP 0.4.7 not worse than AP 0.4.5 by more than 5 % in the median: PASS

Median over NE windows of e(AP) / e(A45), 24 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio AP24 / A4524 0.5560 [0.5413, 0.5673]; ratio of medians 0.5524; at most 1.05, interval inside; n 769, weeks 25, coverage 2
- day 3: median paired ratio AP24 / A4524 0.4988 [0.4849, 0.5103]; ratio of medians 0.5050; at most 1.05, interval inside; n 766, weeks 25, noBin 3, coverage 2
- day 7: median paired ratio AP24 / A4524 0.6386 [0.6161, 0.6657]; ratio of medians 0.6507; at most 1.05, interval inside; n 766, weeks 25, noBin 3, coverage 2

### G2.S1. S1: AP 0.4.7 not worse than AP 0.4.5 by more than 5 % in the median: PASS

Median over S1 windows of e(AP) / e(A45), 24 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio AP24 / A4524 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 52, weeks 12
- day 3: median paired ratio AP24 / A4524 1.0000 [1.0000, 1.0000]; ratio of medians 0.9983; at most 1.05, interval inside; n 52, weeks 12
- day 7: median paired ratio AP24 / A4524 1.0000 [1.0000, 1.0000]; ratio of medians 0.9991; at most 1.05, interval inside; n 52, weeks 12

### G2.LS. LS: AP 0.4.7 not worse than AP 0.4.5 by more than 5 % in the median: PASS

Median over LS windows of e(AP) / e(A45), 24 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio AP24 / A4524 1.0000 [1.0000, 1.0000]; ratio of medians 1.0065; at most 1.05, interval inside; n 56, weeks 9, noBin 8, coverage 6
- day 3: median paired ratio AP24 / A4524 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 61, weeks 10, noBin 3, coverage 6
- day 7: median paired ratio AP24 / A4524 1.0000 [1.0000, 1.0000]; ratio of medians 0.9713; at most 1.05, interval inside; n 60, weeks 10, noBin 4, coverage 6

### G2.DO. DO: AP 0.4.7 not worse than AP 0.4.5 by more than 5 % in the median: PASS

Median over DO windows of e(AP) / e(A45), 24 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio AP24 / A4524 0.9988 [0.9976, 0.9995]; ratio of medians 0.9935; at most 1.05, interval inside; n 133, weeks 10
- day 3: median paired ratio AP24 / A4524 0.9997 [0.9993, 0.9999]; ratio of medians 0.9965; at most 1.05, interval inside; n 131, weeks 10, noBin 2
- day 7: median paired ratio AP24 / A4524 1.0000 [1.0000, 1.0000]; ratio of medians 1.0003; at most 1.05, interval inside; n 97, weeks 10, noBin 36

### G2.HC. HC: AP 0.4.7 not worse than AP 0.4.5 by more than 5 % in the median: PASS

Median over HC windows of e(AP) / e(A45), 24 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio AP24 / A4524 0.9961 [0.9244, 1.0499]; ratio of medians 1.0341; at most 1.05, interval inside; n 43, weeks 13
- day 3: median paired ratio AP24 / A4524 1.0122 [1.0026, 1.0306]; ratio of medians 1.0013; at most 1.05, interval inside; n 43, weeks 13
- day 7: median paired ratio AP24 / A4524 1.0293 [1.0006, 1.0539]; ratio of medians 1.0181; at most 1.05, interval not inside; n 43, weeks 13

### G3.S1. S1: whiteroom XP 0.4.7 not worse than 0.4.5 by more than 5 % in the median: PASS

Median over S1 windows of e(XP) / e(X45), 24 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio XP24 / X4524 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 52, weeks 12
- day 3: median paired ratio XP24 / X4524 1.0000 [1.0000, 1.0000]; ratio of medians 0.9991; at most 1.05, interval inside; n 52, weeks 12
- day 7: median paired ratio XP24 / X4524 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 52, weeks 12

### G3.LS. LS: whiteroom XP 0.4.7 not worse than 0.4.5 by more than 5 % in the median: PASS

Median over LS windows of e(XP) / e(X45), 24 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio XP24 / X4524 1.0000 [1.0000, 1.0000]; ratio of medians 0.9996; at most 1.05, interval inside; n 56, weeks 9, noBin 8, coverage 6
- day 3: median paired ratio XP24 / X4524 1.0000 [1.0000, 1.0001]; ratio of medians 1.0001; at most 1.05, interval inside; n 61, weeks 10, noBin 3, coverage 6
- day 7: median paired ratio XP24 / X4524 1.0000 [1.0000, 1.0008]; ratio of medians 1.0253; at most 1.05, interval inside; n 60, weeks 10, noBin 4, coverage 6

### G3.DO. DO: whiteroom XP 0.4.7 not worse than 0.4.5 by more than 5 % in the median: PASS

Median over DO windows of e(XP) / e(X45), 24 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio XP24 / X4524 1.0000 [1.0000, 1.0000]; ratio of medians 0.9986; at most 1.05, interval inside; n 133, weeks 10
- day 3: median paired ratio XP24 / X4524 1.0000 [1.0000, 1.0003]; ratio of medians 1.0024; at most 1.05, interval inside; n 131, weeks 10, noBin 2
- day 7: median paired ratio XP24 / X4524 1.0000 [1.0000, 1.0011]; ratio of medians 1.0000; at most 1.05, interval inside; n 97, weeks 10, noBin 36

### G3.HC. HC: whiteroom XP 0.4.7 not worse than 0.4.5 by more than 5 % in the median: PASS

Median over HC windows of e(XP) / e(X45), 24 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio XP24 / X4524 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 43, weeks 13
- day 3: median paired ratio XP24 / X4524 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 43, weeks 13
- day 7: median paired ratio XP24 / X4524 1.0000 [1.0000, 1.0000]; ratio of medians 1.0925; at most 1.05, interval inside; n 43, weeks 13

## Report-only paired contrasts (median of a less b, meters)

- GNSS: AP less Space Force XP, days 1, 3, 7: day 1 -20.999 m [-21.983, -20.162] (n 2500); day 3 -64.009 m [-66.157, -61.649] (n 2488); day 7 -139.166 m [-146.586, -131.156] (n 2491)
- GNSS: AP 0.4.5 less Space Force XP, days 1, 3, 7: day 1 5.292 m [4.552, 6.216] (n 2500); day 3 19.783 m [17.606, 21.731] (n 2488); day 7 52.392 m [45.145, 57.062] (n 2491)
- GNSS: whiteroom XP less Space Force XP, days 1, 3, 7: day 1 -0.813 m [-1.713, -0.081] (n 2500); day 3 -6.029 m [-9.111, -2.981] (n 2488); day 7 -24.895 m [-31.294, -14.089] (n 2491)
- GNSS: whiteroom XP 0.4.5 less Space Force XP, days 1, 3, 7: day 1 17.402 m [16.472, 18.372] (n 2500); day 3 47.679 m [43.827, 52.580] (n 2488); day 7 101.353 m [92.321, 110.451] (n 2491)
- GNSS: whiteroom XP 0.4.7 less 0.4.5, days 1, 3, 7: day 1 -18.490 m [-18.940, -18.061] (n 2500); day 3 -56.018 m [-57.585, -54.646] (n 2488); day 7 -124.387 m [-127.408, -119.751] (n 2491)
- GNSS: AP 0.4.7 less 0.4.5, days 1, 3, 7: day 1 -27.104 m [-27.460, -26.584] (n 2500); day 3 -84.800 m [-86.001, -83.765] (n 2488); day 7 -184.347 m [-188.398, -179.841] (n 2491)
- GNr (read): XP less U, day 3 (the module: -4.097 m): day 3 -4.242 m [-11.292, 2.800] (n 718)
- GNr (read): X45 less U, day 3 (the module: +56.107 m): day 3 56.107 m [48.368, 64.993] (n 718)

## Medians (95th percentile), km

### NG

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| AP24 | 0.0263 (0.036) n 1044 | 0.0661 (0.102) n 1035 | 0.1795 (0.407) n 1046 |
| A4524 | 0.0513 (0.060) n 1044 | 0.1445 (0.169) n 1035 | 0.3539 (0.500) n 1046 |
| XP24 | 0.0441 (0.063) n 1044 | 0.1187 (0.194) n 1035 | 0.2966 (0.586) n 1046 |
| X4524 | 0.0583 (0.081) n 1044 | 0.1611 (0.242) n 1035 | 0.4016 (0.662) n 1046 |
| U24 | 0.0449 (0.072) n 1044 | 0.1260 (0.227) n 1035 | 0.3082 (0.664) n 1046 |

### NR

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| AP24 | 0.0321 (0.042) n 687 | 0.0856 (0.114) n 687 | 0.2002 (0.289) n 679 |
| A4524 | 0.0712 (0.080) n 687 | 0.2095 (0.236) n 687 | 0.4821 (0.543) n 679 |
| XP24 | 0.0620 (0.090) n 687 | 0.1736 (0.273) n 687 | 0.3972 (0.621) n 679 |
| X4524 | 0.0820 (0.118) n 687 | 0.2345 (0.351) n 687 | 0.5354 (0.798) n 679 |
| U24 | 0.0640 (0.128) n 687 | 0.1767 (0.389) n 687 | 0.4121 (0.872) n 679 |

### NE

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| AP24 | 0.0322 (0.048) n 769 | 0.0813 (0.141) n 766 | 0.2732 (0.478) n 766 |
| A4524 | 0.0583 (0.075) n 769 | 0.1611 (0.208) n 766 | 0.4198 (0.581) n 766 |
| XP24 | 0.0517 (0.096) n 769 | 0.1233 (0.230) n 766 | 0.3461 (0.672) n 766 |
| X4524 | 0.0691 (0.113) n 769 | 0.1803 (0.284) n 766 | 0.4651 (0.739) n 766 |
| U24 | 0.0513 (0.093) n 769 | 0.1433 (0.239) n 766 | 0.3759 (0.737) n 766 |

### GNr

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| XP24 | 0.0560 (0.089) n 718 | 0.1523 (0.254) n 718 | 0.3674 (0.606) n 718 |
| X4524 | 0.0747 (0.116) n 718 | 0.2122 (0.345) n 718 | 0.5000 (0.763) n 718 |
| U24 | 0.0539 (0.106) n 718 | 0.1498 (0.324) n 718 | 0.3676 (0.787) n 718 |

### S1

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| AP24 | 0.1434 (1.324) n 52 | 0.8931 (5.443) n 52 | 3.6156 (11.588) n 52 |
| A4524 | 0.1434 (1.324) n 52 | 0.8947 (5.443) n 52 | 3.6190 (11.588) n 52 |
| XP24 | 2.6712 (3.603) n 52 | 18.2780 (23.028) n 52 | 91.6317 (116.254) n 52 |
| X4524 | 2.6712 (3.603) n 52 | 18.2942 (23.031) n 52 | 91.6317 (116.271) n 52 |

### LS

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| AP24 | 0.0186 (0.039) n 56 | 0.0433 (0.167) n 61 | 0.1632 (0.891) n 60 |
| A4524 | 0.0185 (0.039) n 56 | 0.0433 (0.167) n 61 | 0.1681 (0.891) n 60 |
| XP24 | 0.5319 (0.954) n 56 | 1.1524 (2.412) n 61 | 3.2314 (5.983) n 60 |
| X4524 | 0.5322 (0.954) n 56 | 1.1523 (2.408) n 61 | 3.1517 (5.979) n 60 |

### DO

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| AP24 | 0.0368 (0.144) n 133 | 0.2670 (1.821) n 131 | 2.0906 (10.391) n 97 |
| A4524 | 0.0370 (0.144) n 133 | 0.2679 (1.824) n 131 | 2.0900 (10.388) n 97 |
| XP24 | 0.6936 (1.104) n 133 | 1.7085 (3.243) n 131 | 4.0830 (9.907) n 97 |
| X4524 | 0.6945 (1.104) n 133 | 1.7044 (3.237) n 131 | 4.0830 (9.904) n 97 |

### HC

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| AP24 | 0.1737 (13.711) n 43 | 1.1951 (17.204) n 43 | 3.1732 (31.714) n 43 |
| A4524 | 0.1680 (13.590) n 43 | 1.1936 (17.112) n 43 | 3.1167 (22.930) n 43 |
| XP24 | 0.1499 (13.698) n 43 | 1.2209 (17.214) n 43 | 3.3607 (31.770) n 43 |
| X4524 | 0.1499 (13.698) n 43 | 1.2209 (17.214) n 43 | 3.0762 (23.306) n 43 |

## Accounting

| Group | Cutoffs | Rows | Rows with an error | Arm failures |
|---|---:|---:|---:|---|
| NG | 34 | 1088 | 25 | AP 9, A45 9, XP 9, X45 9, U 9 |
| NR | 34 | 748 | 47 | AP 11, A45 11, XP 11, X45 11, U 11 |
| NE | 34 | 782 | 11 | AP 2, A45 2, XP 2, X45 2, U 2 |
| GNr | 144 | 720 | 0 | XP 1, X45 1, U 1 |
| S1 | 26 | 52 | 0 | AP 0, A45 0, XP 0, X45 0 |
| LS | 14 | 70 | 0 | AP 6, A45 6, XP 6, X45 6 |
| DO | 14 | 140 | 7 | AP 0, A45 0, XP 0, X45 0 |
| HC | 43 | 43 | 0 | AP 0, A45 0, XP 0, X45 0 |
