# Registered confirmation on unread HEO windows of the sdn-ap 0.4.6 frame fix

Registered by the commit named in `check.mjs`; 1462 windows read. Intervals are the 95 % percentile interval of a 10,000-draw cluster bootstrap by ISO week of the cutoff. Verdicts follow the registered point criterion; `interval inside` says whether the whole interval meets it too.

## Statements

| Statement | Verdict |
|---|---|
| H1. Paired day-3 AP less XP on unread HEO windows within 50 m of zero | PASS |
| H2. AP not worse than XP at days 1, 3 and 7 on unread HEO windows | PASS |
| H3.GD. GD: 0.4.6 frame fix does not regress the median forward error by more than 5 % | PASS |
| H3.LS. LS: 0.4.6 frame fix does not regress the median forward error by more than 5 % | PASS |
| H3.DO. DO: 0.4.6 frame fix does not regress the median forward error by more than 5 % | PASS |
| H3.GN. GN: 0.4.6 frame fix does not regress the median forward error by more than 5 % | PASS |
| H3.HX. HX: 0.4.6 frame fix does not regress the median forward error by more than 5 % | PASS |
| H3.IG. IG: 0.4.6 frame fix does not regress the median forward error by more than 5 % | REPORT ONLY (criterion met) |
| H3.GE. GE: 0.4.6 frame fix does not regress the median forward error by more than 5 % | REPORT ONLY (criterion met) |

### H1. Paired day-3 AP less XP on unread HEO windows within 50 m of zero: PASS

Median over the pooled unread HEO windows (HE and HX) of AP less XP forward error at day 3, within +-50 m.

- day 3: median paired AP72 less XP72 0.0016 m [-3.8712, 2.6145]; within +-50 m, interval inside; n 88, weeks 39

### H2. AP not worse than XP at days 1, 3 and 7 on unread HEO windows: PASS

AP5 rule 1 reversed: AP is worse at a day when the 97.5 % interval of the median ln(e_AP / e_XP) lies wholly above 0 and the median AP less XP exceeds 50 m.

- day 1: median AP72 / XP72 -0.0344 % [-0.8850, 0.0268] %, median AP72 less XP72 -0.0986 m; reverse rule 1 does not hold, material (above 50 m) no; not worse; n 88, weeks 39
- day 3: median AP72 / XP72 0.0001 % [-0.4475, 0.3159] %, median AP72 less XP72 0.0016 m; reverse rule 1 does not hold, material (above 50 m) no; not worse; n 88, weeks 39
- day 7: median AP72 / XP72 0.0000 % [-0.1616, 0.1831] %, median AP72 less XP72 0.0002 m; reverse rule 1 does not hold, material (above 50 m) no; not worse; n 84, weeks 38, noBin 4

### H3.GD. GD: 0.4.6 frame fix does not regress the median forward error by more than 5 %: PASS

Median over GD windows of e(0.4.6) / e(0.4.5), 72 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 40, weeks 10
- day 3: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 40, weeks 10
- day 7: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 40, weeks 10

### H3.LS. LS: 0.4.6 frame fix does not regress the median forward error by more than 5 %: PASS

Median over LS windows of e(0.4.6) / e(0.4.5), 72 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 56, weeks 10, noBin 5, coverage 4
- day 3: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 57, weeks 10, noBin 4, coverage 4
- day 7: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 57, weeks 10, noBin 4, coverage 4

### H3.DO. DO: 0.4.6 frame fix does not regress the median forward error by more than 5 %: PASS

Median over DO windows of e(0.4.6) / e(0.4.5), 72 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 125, weeks 10, coverage 1
- day 3: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 102, weeks 10, noBin 23, coverage 1
- day 7: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 78, weeks 10, noBin 47, coverage 1

### H3.GN. GN: 0.4.6 frame fix does not regress the median forward error by more than 5 %: PASS

Median over GN windows of e(0.4.6) / e(0.4.5), 72 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 954, weeks 13, noBin 2, coverage 16
- day 3: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 947, weeks 13, noBin 9, coverage 16
- day 7: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 952, weeks 13, noBin 4, coverage 16

### H3.HX. HX: 0.4.6 frame fix does not regress the median forward error by more than 5 %: PASS

Median over HX windows of e(0.4.6) / e(0.4.5), 72 h fits, at most 1.05 at days 1, 3 and 7.

- day 1: median paired ratio A4672 / A4572 1.0240 [0.9798, 1.0597]; ratio of medians 0.9868; at most 1.05, interval not inside; n 79, weeks 35
- day 3: median paired ratio A4672 / A4572 1.0153 [0.9967, 1.0320]; ratio of medians 0.9895; at most 1.05, interval inside; n 79, weeks 35
- day 7: median paired ratio A4672 / A4572 1.0100 [0.9818, 1.0517]; ratio of medians 1.0417; at most 1.05, interval not inside; n 79, weeks 35

### H3.IG. IG: 0.4.6 frame fix does not regress the median forward error by more than 5 %: REPORT ONLY (criterion met)

Median over IG windows of e(0.4.6) / e(0.4.5), 72 h fits, at most 1.05 at days 1, 3 and 7. REPORT ONLY: no unread truth exists, the windows are AP6's (read).

- day 1: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 60, weeks 2
- day 3: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 60, weeks 2
- day 7: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 59, weeks 2, noBin 1

### H3.GE. GE: 0.4.6 frame fix does not regress the median forward error by more than 5 %: REPORT ONLY (criterion met)

Median over GE windows of e(0.4.6) / e(0.4.5), 72 h fits, at most 1.05 at days 1, 3 and 7. REPORT ONLY: no unread truth exists, the windows are AP6's (read).

- day 1: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 32, weeks 2, noBin 3, coverage 10
- day 3: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 30, weeks 2, noBin 5, coverage 10
- day 7: median paired ratio A4672 / A4572 1.0000 [1.0000, 1.0000]; ratio of medians 1.0000; at most 1.05, interval inside; n 32, weeks 2, noBin 3, coverage 10

## Report-only paired contrasts (median of a less b, meters)

- HE: AP less XP, day 3: day 3 0.001 m [-0.001, 0.003] (n 9)
- HX (Chandra): AP less XP, day 3: day 3 0.732 m [-7.934, 4.543] (n 79)
- HE and HX: 0.4.5 less XP (before the fix), days 1, 3, 7: day 1 -14.693 m [-31.295, 3.858] (n 88); day 3 -7.280 m [-31.810, 14.889] (n 88); day 7 -41.917 m [-134.267, 61.937] (n 84)
- HEr (AP6's seven windows, read): AP less XP, day 3 (the module's table: -0.000784 m): day 3 -0.001 m [-0.004, 0.003] (n 7)
- HEr: 0.4.5 less XP, day 3 (the module's table: +420.105792 m): day 3 420.106 m [183.541, 583.060] (n 7)
- 0.4.7 less 0.4.6 on 72 h arcs, every group (expected 0 m): day 1 0.000 m [0.000, 0.000] (n 1362); day 3 0.000 m [0.000, 0.000] (n 1331); day 7 0.000 m [0.000, 0.000] (n 1309)
- HE and HX: AP less Space Force XP, days 1, 3, 7: day 1 -101.326 m [-145.903, -74.601] (n 87); day 3 -34.983 m [-81.708, -9.501] (n 87); day 7 -85.134 m [-182.020, -11.879] (n 83)
- HE and HX: AP less FFM, days 1, 3, 7: day 1 141.966 m [97.813, 219.937] (n 85); day 3 386.411 m [334.492, 537.950] (n 85); day 7 615.079 m [262.824, 1130.711] (n 81)

## Medians (95th percentile), km

### HE

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| AP72 | 0.5072 (1.052) n 9 | 2.3229 (3.996) n 9 | 10.9252 (14.027) n 5 |
| A4672 | 0.5072 (1.052) n 9 | 2.3229 (3.996) n 9 | 10.9252 (14.027) n 5 |
| A4572 | 0.4195 (0.945) n 9 | 2.3477 (4.242) n 9 | 13.1506 (16.696) n 5 |
| XP72 | 0.5072 (1.052) n 9 | 2.3230 (3.996) n 9 | 10.9253 (14.027) n 5 |
| U72 | 0.8041 (1.526) n 9 | 3.1747 (7.151) n 9 | 21.2716 (26.567) n 5 |
| F72 | 0.1442 (0.418) n 9 | 1.0307 (1.976) n 9 | 8.7316 (10.035) n 5 |

### HX

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| AP72 | 0.2637 (0.970) n 79 | 0.8270 (3.217) n 79 | 2.5400 (9.933) n 79 |
| A4672 | 0.2637 (0.970) n 79 | 0.8270 (3.217) n 79 | 2.5400 (9.933) n 79 |
| A4572 | 0.2672 (1.018) n 79 | 0.8358 (3.140) n 79 | 2.4383 (9.865) n 79 |
| XP72 | 0.2768 (1.020) n 79 | 0.8439 (3.256) n 79 | 2.5179 (9.861) n 79 |
| U72 | 0.4174 (1.048) n 78 | 0.8434 (2.804) n 78 | 2.5956 (9.864) n 78 |
| F72 | 0.1163 (0.665) n 76 | 0.4541 (1.878) n 76 | 1.3879 (9.519) n 76 |

### HEr

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| AP72 | 0.6604 (0.876) n 7 | 1.3856 (2.430) n 7 | 6.5407 (12.247) n 7 |
| A4672 | 0.6604 (0.876) n 7 | 1.3856 (2.430) n 7 | 6.5407 (12.247) n 7 |
| A4572 | 0.7662 (1.094) n 7 | 2.0092 (2.395) n 7 | 7.6051 (13.796) n 7 |
| XP72 | 0.6604 (0.876) n 7 | 1.3856 (2.430) n 7 | 6.5407 (12.247) n 7 |
| U72 | - | - | - |
| F72 | - | - | - |

### GD

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| AP72 | 0.0130 (0.024) n 40 | 0.0160 (0.047) n 40 | 0.0252 (0.073) n 40 |
| A4672 | 0.0130 (0.024) n 40 | 0.0160 (0.047) n 40 | 0.0252 (0.073) n 40 |
| A4572 | 0.0130 (0.024) n 40 | 0.0160 (0.047) n 40 | 0.0252 (0.073) n 40 |

### LS

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| AP72 | 0.0239 (0.076) n 56 | 0.0645 (0.327) n 57 | 0.2258 (1.489) n 57 |
| A4672 | 0.0239 (0.076) n 56 | 0.0645 (0.327) n 57 | 0.2258 (1.489) n 57 |
| A4572 | 0.0239 (0.076) n 56 | 0.0645 (0.327) n 57 | 0.2258 (1.489) n 57 |

### DO

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| AP72 | 0.0720 (0.702) n 125 | 0.4590 (4.274) n 102 | 2.4003 (21.903) n 78 |
| A4672 | 0.0720 (0.702) n 125 | 0.4590 (4.274) n 102 | 2.4003 (21.903) n 78 |
| A4572 | 0.0720 (0.702) n 125 | 0.4590 (4.274) n 102 | 2.4003 (21.903) n 78 |

### GN

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| AP72 | 0.0244 (0.044) n 954 | 0.0494 (0.132) n 947 | 0.1409 (0.492) n 952 |
| A4672 | 0.0244 (0.044) n 954 | 0.0494 (0.132) n 947 | 0.1409 (0.492) n 952 |
| A4572 | 0.0244 (0.044) n 954 | 0.0494 (0.132) n 947 | 0.1409 (0.492) n 952 |

### IG

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| AP72 | 0.0257 (0.039) n 60 | 0.0363 (0.088) n 60 | 0.0577 (0.438) n 59 |
| A4672 | 0.0257 (0.039) n 60 | 0.0363 (0.088) n 60 | 0.0577 (0.438) n 59 |
| A4572 | 0.0257 (0.039) n 60 | 0.0363 (0.088) n 60 | 0.0577 (0.438) n 59 |

### GE

| Arm | Day 1 | Day 3 | Day 7 |
|---|---:|---:|---:|
| AP72 | 0.0288 (0.045) n 32 | 0.0543 (4.711) n 30 | 0.2312 (112.043) n 32 |
| A4672 | 0.0288 (0.045) n 32 | 0.0543 (4.711) n 30 | 0.2312 (112.043) n 32 |
| A4572 | 0.0288 (0.045) n 32 | 0.0543 (4.711) n 30 | 0.2312 (112.043) n 32 |

## Accounting

| Group | Cutoffs | Rows | Rows with an error | Arm failures |
|---|---:|---:|---:|---|
| HE | 9 | 9 | 0 | AP 0, A46 0, A45 0, XP 0, U 0, F 0 |
| HX | 79 | 79 | 0 | AP 0, A46 0, A45 0, XP 0, U 1, F 3 |
| HEr | 7 | 7 | 0 | AP 0, A46 0, A45 0, XP 0 |
| GD | 10 | 40 | 0 | AP 0, A46 0, A45 0 |
| LS | 13 | 65 | 0 | AP 4, A46 4, A45 4 |
| DO | 13 | 130 | 4 | AP 1, A46 1, A45 1 |
| GN | 13 | 1027 | 55 | AP 16, A46 16, A45 16 |
| IG | 5 | 60 | 0 | AP 0, A46 0, A45 0 |
| GE | 5 | 45 | 0 | AP 10, A46 10, A45 10 |
