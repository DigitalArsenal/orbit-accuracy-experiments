# Alerts per real conjunction, per theory (report-only)

**Real geometry and real forecast errors, simulated pairing. No covariance anywhere; this is not a collision-probability result.**

Registration: `ALERTS-PER-CONJUNCTION.md`. Arm 1: input precise orbits. Arm 2: input public element sets. Arm 2 is on other windows than arm 1; the two are never paired.

## Alerts per true event: 99 percent caught, one radius per regime pair

| Input | Theory | 1 day | 3 days | 5 days |
|---|---|---:|---:|---:|
| Precise orbits | SGP4 | 148 (21.7 to 3087) | 11142 (523 to 50710) | not measured |
| Precise orbits | XP, whiteroom | 759 (13.2 to 3203) | 9241 (405 to 51580) | 19235 (1661 to 53550), at least |
| Precise orbits | XP, Space Force | 134 (15.2 to 2961) | 12424 (450 to 50910), at least | not measured |
| Precise orbits | AP | 208 (2.63 to 3100) | 39202 (82.5 to 51360), at least | 18241 (469 to 52410), at least |
| Precise orbits | FFM | 567 (2.50 to 3330) | 14225 (78.6 to 51300), at least | not measured |
| Public element sets | SGP4 on public sets | 7854 (4465 to 9752) | 8009 (4491 to 9584) | not measured |
| None | Perfect forecast | 0.990 | | |

A perfect forecast gives about 1. Intervals: percentile bootstrap, 400 replicates; they cover the error rows, the draws and the thinning, not the one week of catalog or the few satellites behind each regime.

**Do not print the table above.** Its 99 percent falls on a jump, not on a stable tail. 3 of the 121 altimetry windows at 3 days, all SENTINEL-6B and all flagged with a burn, err by 192 to 2626 km on AP, and by about as much on every other theory. Drawn for either object, they reach about 5 percent of the encounters in that band, so the band's radius lands on or beside them almost by chance. That is why each primary interval is so wide, and why the primary point ratios fall outside their own intervals.

## Chosen after the first reading: one radius for all, 99 percent

The one radius for all was registered beside the primary reading; its ratio to AP was added after the first reading. The rare tail stays under 1 percent of true events, so this figure is stable.

| Input | Theory | 1 day | 3 days | 5 days |
|---|---|---:|---:|---:|
| Precise orbits | SGP4 | 19.3 (16.6 to 22.8) | 617 (520 to 767) | not measured |
| Precise orbits | XP, whiteroom | 17.2 (13.6 to 20.9) | 557 (430 to 717) | 2677 (1913 to 3262) |
| Precise orbits | XP, Space Force | 18.9 (15.8 to 22.9) | 624 (491 to 767) | not measured |
| Precise orbits | AP | 3.53 (2.34 to 5.80) | 156 (68.6 to 329) | 786 (367 to 1245) |
| Precise orbits | FFM | 3.34 (2.34 to 5.27) | 153 (68.1 to 320) | not measured |
| Public element sets, the ISS below 600 km | SGP4 on public sets | 12737 (6546 to 17530) | 13456 (6635 to 17590) | not measured |
| Public element sets, laser spheres below 600 km | SGP4 on public sets | | 30.9 (2.83 to 36.5) | not measured |

| AP alerts over | 1 day | 3 days | 5 days |
|---|---:|---:|---:|
| SGP4 | 0.183 (0.136 to 0.263) | 0.253 (0.135 to 0.431) | not measured |
| XP, whiteroom | 0.205 (0.165 to 0.288) | 0.280 (0.160 to 0.458) | 0.294 (0.188 to 0.416) |
| XP, Space Force | 0.187 (0.144 to 0.262) | 0.250 (0.138 to 0.436) | not measured |
| FFM | 1.06 (0.936 to 1.12) | 1.02 (0.906 to 1.13) | not measured |

The public figure below 600 km depends on the analogue, by a large factor: neither the ISS, with its reboosts, nor the laser spheres, which fly above 690 km, is a typical object in that band, and that band holds most true events. The public arm therefore gives no single figure.

## Sensitivity to the share caught, 3 days ahead

| Input | Theory | 95 percent | 99 percent | 99.9 percent | 99 percent, one radius for all | 99 percent, without encounters under 100 m/s |
|---|---|---:|---:|---:|---:|---:|
| Precise orbits | SGP4 | 478 (336 to 11600) | 11142 (523 to 50710) | 18202 (744 to 52960) | 617 (520 to 767) | 11217 (525 to 51060) |
| Precise orbits | XP, whiteroom | 318 (278 to 13150) | 9241 (405 to 51580) | 43231 (585 to 53010) | 557 (430 to 717) | 9304 (406 to 51940) |
| Precise orbits | XP, Space Force | 372 (314 to 15820) | 12424 (450 to 50910) | 20295 (635 to 53010) | 624 (491 to 767) | 12508 (452 to 51260) |
| Precise orbits | AP | 49.8 (31.7 to 12430) | 39202 (82.5 to 51360) | 43203 (230 to 52650) | 156 (68.6 to 329) | 39474 (82.5 to 51720) |
| Precise orbits | FFM | 46.5 (29.5 to 15170) | 14225 (78.6 to 51300) | 35147 (220 to 52590) | 153 (68.1 to 320) | 14322 (78.4 to 51660) |
| Public element sets | SGP4 on public sets | 5624 (3205 to 7559) | 8009 (4491 to 9584) | 9776 (5181 to 10840) | 13456 (6635 to 17590) | 8061 (4516 to 9639) |

## AP against each theory, 3 days ahead, 99 percent

| Comparator | AP alerts / comparator alerts | Interval | Verdict |
|---|---:|---|---|
| SGP4 | 3.52 | 0.140 to 2.50 | undecided |
| XP, whiteroom | 4.24 | 0.192 to 2.48 | undecided |
| XP, Space Force | 3.15 | 0.179 to 2.49 | undecided |
| FFM | 2.76 | 0.353 to 2.52 | undecided |

Rule: AP fewer if the upper bound is below 0.9, AP not fewer if the lower bound is at or above 0.9, else undecided. Pass chances (`sizing.json`, synthetic errors, committed before any alert): P(fewer | true ratio 1) 0.005, P(not fewer | 1) 0.065, P(fewer | 0.5) 0.45, P(not fewer | 0.5) 0.

## The same ratio under each other reading

| Reading | Over SGP4 | Over XP, whiteroom | Over XP, Space Force | Over FFM |
|---|---:|---:|---:|---:|
| Only windows all five flew | 0.801 (0.117 to 2.46) | 0.344 (0.172 to 2.39) | 1.01 (0.157 to 2.44) | 1.04 (0.346 to 2.95) |
| 750 to 2000 km on the laser spheres | 0.202 (0.105 to 0.315) | 0.267 (0.154 to 0.390) | 0.245 (0.136 to 0.367) | 1.04 (0.932 to 1.12) |
| Near 700 km and altimetry without burn windows | 0.199 (0.103 to 0.309) | 0.267 (0.152 to 0.377) | 0.244 (0.133 to 0.348) | 1.03 (0.935 to 1.14) |

Public element sets at 3 days: 30.1 (2.83 to 36.1) with the laser spheres' errors also below 600 km; 6303 (3896 to 8472) with a uniformly random error direction.

## By regime pair, 3 days ahead, 99 percent

| Pair | Share of true events | Theory | Radius km | Alerts per true event |
|---|---:|---|---:|---:|
| SD-SD | 0.932 | SGP4 | 41.9 (37.6 to 46.1) | 523 (445 to 596) |
| DO-DO | 0.0327 | SGP4 | 959 (5.84 to 2463) | 269960 (33.4 to 399300) |
| S1-S1 | 0.0183 | SGP4 | 14.8 (10.1 to 24.4) | 155 (76.5 to 417) |
| S1-DO | 0.0104 | SGP4 | 355 (8.01 to 1881) | 161470 (63.4 to 861100) |
| SD-S1 | 0.00395 | SGP4 | 23.4 (20.7 to 32.1) | 656 (464 to 1358) |
| SD-DO | 0.00156 | SGP4 | 23.4 (18.3 to 2275) | 511 (312 to 19030000) |
| sparse | 0.00126 | SGP4 | 454 (149 to 2402) | 108020 (16280 to 316900) |
| SD-SD | 0.932 | XP, whiteroom | 39.9 (33.4 to 44.8) | 488 (371 to 570) |
| DO-DO | 0.0327 | XP, whiteroom | 911 (6.66 to 2463) | 253160 (42.4 to 399500) |
| S1-S1 | 0.0183 | XP, whiteroom | 12.2 (7.85 to 24.7) | 106 (43.4 to 417) |
| S1-DO | 0.0104 | XP, whiteroom | 191 (6.69 to 2153) | 47092 (43.1 to 873400) |
| SD-S1 | 0.00395 | XP, whiteroom | 29.5 (18.9 to 30.7) | 1090 (390 to 1220) |
| SD-DO | 0.00156 | XP, whiteroom | 66.0 (17.5 to 2286) | 4103 (284 to 19060000) |
| sparse | 0.00126 | XP, whiteroom | 25.6 (18.2 to 2426) | 607 (304 to 314700) |
| SD-SD | 0.932 | XP, Space Force | 42.7 (36.5 to 47.1) | 538 (423 to 612) |
| DO-DO | 0.0327 | XP, Space Force | 914 (6.63 to 2466) | 253860 (42.0 to 399300) |
| S1-S1 | 0.0183 | XP, Space Force | 10.1 (7.69 to 23.6) | 73.0 (42.0 to 400) |
| S1-DO | 0.0104 | XP, Space Force | 544 (7.02 to 1987) | 316430 (47.8 to 871700) |
| SD-S1 | 0.00395 | XP, Space Force | 25.3 (19.8 to 32.7) | 781 (435 to 1316) |
| SD-DO | 0.00156 | XP, Space Force | 42.3 (18.1 to 2162) | 1780 (312 to 18950000) |
| sparse | 0.00126 | XP, Space Force | 2225 (19.6 to 2401) | 252260 (338 to 316200) |
| SD-SD | 0.932 | AP | 18.0 (11.0 to 23.7) | 133 (58.1 to 221) |
| DO-DO | 0.0327 | AP | 911 (6.33 to 2465) | 252720 (39.2 to 399600) |
| S1-S1 | 0.0183 | AP | 10.1 (6.60 to 21.7) | 72.8 (31.7 to 326) |
| S1-DO | 0.0104 | AP | 782 (6.35 to 2011) | 533460 (37.2 to 873900) |
| SD-S1 | 0.00395 | AP | 17.5 (7.16 to 21.4) | 356 (55.6 to 520) |
| SD-DO | 0.00156 | AP | 1587 (6.48 to 2214) | 16219000 (40.2 to 19020000) |
| sparse | 0.00126 | AP | 9.70 (5.91 to 2381) | 82.0 (35.3 to 314700) |
| SD-SD | 0.932 | FFM | 17.7 (11.1 to 23.1) | 129 (58.6 to 212) |
| DO-DO | 0.0327 | FFM | 1192 (6.47 to 2465) | 285820 (40.0 to 399200) |
| S1-S1 | 0.0183 | FFM | 14.1 (6.75 to 21.3) | 142 (32.0 to 358) |
| S1-DO | 0.0104 | FFM | 696 (6.22 to 2007) | 451720 (36.6 to 873900) |
| SD-S1 | 0.00395 | FFM | 9.40 (7.14 to 20.7) | 103 (55.2 to 507) |
| SD-DO | 0.00156 | FFM | 173 (6.32 to 2224) | 32746 (37.3 to 18980000) |
| sparse | 0.00126 | FFM | 9.32 (6.22 to 2427) | 81.3 (37.1 to 278000) |
| SD-SD | 0.933 | SGP4 on public sets | 296 (192 to 346) | 8082 (4720 to 9691) |
| DO-DO | 0.0328 | SGP4 on public sets | 6.39 (1.68 to 7.43) | 38.5 (2.69 to 53.0) |
| S1-S1 | 0.0183 | SGP4 on public sets | 6.47 (1.73 to 7.94) | 31.1 (2.72 to 47.5) |
| S1-DO | 0.0104 | SGP4 on public sets | 4.99 (1.60 to 7.43) | 23.6 (2.49 to 52.3) |
| SD-S1 | 0.00396 | SGP4 on public sets | 174 (105 to 186) | 107620 (21250 to 142100) |
| SD-DO | 0.00156 | SGP4 on public sets | 164 (96.3 to 185) | 25826 (7011 to 41110) |
| sparse | 0 | SGP4 on public sets | n/a (n/a to n/a) | n/a (n/a to n/a) |

## Same-window

Each theory's whole landed cell is the primary reading. A replicate resamples window keys jointly; a key a theory lacks drops from that theory alone.

| Cut | Lead days | Windows, any theory | Windows, all five |
|---|---:|---:|---:|
| Strong drag, 2025 | 1 | 944 | 944 |
| Strong drag, 2025 | 3 | 944 | 944 |
| Strong drag, 2026 | 1 | 750 | 750 |
| Strong drag, 2026 | 3 | 750 | 750 |
| Near 700 km | 1 | 259 | 259 |
| Near 700 km | 3 | 258 | 258 |
| Medium Earth orbit | 1 | 746 | 745 |
| Medium Earth orbit | 3 | 746 | 745 |
| Low orbit, altimetry | 1 | 136 | 136 |
| Low orbit, altimetry | 3 | 121 | 121 |
| Low orbit, laser spheres | 1 | 65 | 65 |
| Low orbit, laser spheres | 3 | 57 | 57 |
| Laser geodetic | 1 | 54 | 54 |
| Laser geodetic | 3 | 54 | 54 |
| Inclined geosynchronous | 1 | 60 | 49 |
| Inclined geosynchronous | 3 | 60 | 49 |
| Geostationary | 1 | 32 | 32 |
| Geostationary | 3 | 30 | 30 |
| Highly elliptical, THEMIS and Chandra | 1 | 19 | 19 |
| Highly elliptical, THEMIS and Chandra | 3 | 19 | 19 |

## Builds

- SGP4: analysis/gp-error-model 0.11.0, propagator/sgp4 1.4.1, refit to the same truth.
- XP, whiteroom: whiteroom XP, flown on sdn-ap 0.4.11; equal on 0.5.1, 0.6.3 and 0.6.4 by the cells.json provenance.
- XP, Space Force: Space Force XP through propagator/sgp4-xp 0.2.1.
- AP: sdn-ap: flown on 0.5.1, named 0.6.4 by the identities in cells.json provenance; THEMIS and Chandra flown on 0.6.3; day 5 flown on 0.5.1.
- FFM: propagator/ffm 2.2.0, RK78, analysis/estimation 0.7.0; 40x40 below 2000 km perigee, 20x20 elsewhere.
- SGP4 on public sets: SGP4 on the latest public element set, sdn-ap-gp-history-od baseline, no fit.
- screen: analysis/conjunction-assessment 0.18.4.

## Closure and geometry

- t0 equals B2's landed event set: true (digest `ef114fe59487d57ffc7c92be81fe22d01f443c564e3fce362897837ebb8f4eb7`).
- t1 seed 1's events under 5 km against B2's `ladder-1-8-s1`: 0.
- Each tier's weighted count in the band it shares with the tier below, relative, per seed: t1 under 5 km against t0 -0.037, -0.0837, -0.0141; t2 5 to 50 km against t1 -0.0483, -0.0557, 0.109; t3 5 to 300 km against t2 -0.0651, -0.0746, 0.115.
- True events under 100 m/s relative speed: 0.00693. True events by miss, share under 0.5 km: 0.265 (0.25 for a miss uniform over the plane).
- Realized catch at 99 percent, 3 days: SGP4 0.9905, XP, whiteroom 0.9898, XP, Space Force 0.9902, AP 0.9907, FFM 0.9907, SGP4 on public sets 0.9897.
- True events left out for want of error rows: 5 days 0.001263; public sets 0.001263 (highly elliptical).

## What this does not say

- The errors of the two objects are drawn independently. The rows come from the few satellites with precise orbits and are carried by regime to the whole catalog: most of the low catalog flies the errors of Swarm and GRACE-FO.
- "True" is SGP4's geometry from one week of the catalog, not what happened in orbit.
- This is no collision probability and uses no covariance. It derives no compute ratio, and uses none of B2's fits or timing rows.
- Arm 1 assumes precise orbits, which exist for a small share of the catalog. Arm 2 is what the public sets give; it holds SGP4 alone, because fitting another theory to SGP4-generated states is barred.
