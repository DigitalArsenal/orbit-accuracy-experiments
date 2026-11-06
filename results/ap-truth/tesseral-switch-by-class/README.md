# The tesseral switch by orbit class: propagator/sdn-ap 0.6.4 against 0.6.3

Registration: experiments/operator-theory/TESSERAL-SWITCH-BY-CLASS.md. Base 0.6.3 dist aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e (modules 03ee86234); 0.6.4 dist e245de29ea050b08244dc9d69fd892ad2473699843b92988fd34a47a466b15f8 (modules 416a67e9a6411840f5b385f9c350018fe9922e3d); ffm 2.2.1 a91331207752. Class rule: resonance.inc band_of: 1 one-day (0.8017 to 1.2033 rev/day), 2 half-day (1.6045 to 2.4067), 3 eight-hour (2.4067 to 3.6100), 4 sixteen-hour (1.2033 to 1.8050), 0 none; the grid above e 0.05 in class 0, above e 0.3 in every resonance class.

## Summary
P1 accuracy: DOES NOT HOLD (no fail true; passes kept true; grid not worse false; unmeasured none). Cells flown 25, grid exercised on 0.6.4 in 20: grid passes 9, undecided 11, fails 0; paired forward RMS better 16, equal 0, worse 4. Verdicts on 0.6.3: pass 2, undecided 15, fail 8; on 0.6.4: pass 10, undecided 15, fail 0.
Where 0.6.4's forward RMS is higher than 0.6.3's (Ajisai|0.15: raw 86.92 -> 98.70 m, tesseral 27.51 -> 9.69, secular 42.67 -> 70.61, fit RMS 51.1 -> 42.3 m; Jason-3|0.07: raw 28.33 -> 29.28 m, tesseral 11.54 -> 2.23, secular 19.11 -> 28.15, fit RMS 23.7 -> 13.6 m; Jason-3|0.1: raw 51.96 -> 57.62 m, tesseral 16.27 -> 3.30, secular 43.09 -> 56.57, fit RMS 34.6 -> 19.8 m; Ajisai|0.1: raw 44.67 -> 46.09 m, tesseral 18.43 -> 5.16, secular 6.28 -> 24.70, fit RMS 29.3 -> 21.7 m): the tesseral share fell and the secular share (the fit's forward-day drift, reported beside the tesseral model and never charged to it in the all-regimes line) rose. Tesseral forward share lower on 0.6.4 in 20 of 20 exercised cells.
P2 catalog budget (0.6.4, persistent instances, 1,000 seeded records: 500 band, 250 above, 250 outside): DOES NOT HOLD; cold median 33.6 ms (target 100), warm refresh slowest worker 5436 ms (target 5,000), peak 466 MB per worker (target 512), refused 0.
P3 identity: HOLDS; seeded sets outside the band equal 106 of 106; in-band seeded sets differ 10 of 10 (by construction); published examples equal 56 of 56 (56 published) (none in the band); unmeasured none.
Version step requested: NO.

## Validation cells and the in-band published cells (all-regimes frame; each cell fitted and flown on 0.6.3 and on 0.6.4, the reference shared)
| Cell | Class | Role | Fitted e 0.6.3 / 0.6.4 (grid exercised) | 0.6.3 verdict (legs) | 0.6.4 verdict (legs) | Grid reads | Forward RMS / max / rough 0.6.3 -> 0.6.4 (m) | Bounds | Tesseral share forward 0.6.3 -> 0.6.4 [0.6.4 interval] | Tesseral in-arc | Mixed forward | Secular forward | Paired forward RMS delta (m) | Landed 0.6.3 row |
| --- | --: | --- | --: | --- | --- | --- | --- | --: | --- | --- | --- | --- | --- | --- |
| Starlette|0.07 | 0 | validation | 0.0691 / 0.0691 (yes) | undecided (attributed) (undecided / not applicable) | undecided (attributed) (undecided / not applicable) | grid undecided | 67.89 / 181.15 / 3.000 -> 62.07 / 131.84 / 0.455 | 9.09 / 45.45 / 2.272 | 15.41 -> 6.60 [0.00, 23.75] | 13.99 -> 11.45 | 8.68 -> 3.71 | 41.57 -> 41.05 | -5.83 (better; resolution 3.3e-2) | - |
| Starlette|0.15 | 0 | validation | - | below the perigee floor | - | - | - | - | - | - | - | - | - | - |
| Starlette|0.05 | 0 | validation | 0.0491 / 0.0491 (NO) | undecided (attributed) (undecided / not applicable) | undecided (attributed) (undecided / not applicable) | grid not exercised (fitted e at or below 0.05) | 42.25 / 118.97 / 2.267 -> 42.25 / 118.97 / 2.267 | 8.82 / 44.09 / 2.204 | 11.40 -> 11.40 [2.45, 20.36] | 11.17 -> 11.17 | 5.45 -> 5.45 | 19.76 -> 19.76 | 0.00 (equal; resolution 3.3e-2) | undecided (attributed), 42.25 m |
| Starlette|0.1 | 0 | validation, published in band | 0.0990 / 0.0990 (yes) | undecided (attributed) (undecided / not applicable) | undecided (attributed) (undecided / not applicable) | grid undecided | 136.28 / 319.37 / 3.608 -> 130.24 / 247.42 / 0.699 | 9.95 / 49.77 / 2.488 | 21.98 -> 10.62 [0.00, 35.87] | 21.04 -> 17.11 | 15.85 -> 7.84 | 106.63 -> 106.03 | -6.04 (better; resolution 3.3e-2) | undecided (attributed), 136.28 m |
| Ajisai|0.07 | 0 | validation | 0.0692 / 0.0692 (yes) | undecided (attributed) (undecided / not applicable) | undecided (attributed) (undecided / not applicable) | grid undecided | 30.09 / 84.95 / 2.065 -> 28.63 / 51.22 / 0.306 | 7.45 / 37.27 / 1.863 | 13.29 -> 3.45 [0.00, 14.08] | 9.87 -> 3.94 | 3.28 -> 1.03 | 3.43 -> 12.88 | -1.46 (better; resolution 2.9e-2) | - |
| Ajisai|0.15 | 0 | validation | 0.1491 / 0.1491 (yes) | undecided (attributed) (undecided / not applicable) | undecided (attributed) (undecided / not applicable) | grid undecided | 86.92 / 191.70 / 3.347 -> 98.70 / 172.51 / 0.607 | 14.13 / 70.65 / 3.533 | 27.51 -> 9.69 [0.00, 37.08] | 21.77 -> 10.73 | 10.97 -> 3.32 | 42.67 -> 70.61 | 11.78 (worse; resolution 2.9e-2) | - |
| LARES|0.07 | 0 | validation | 0.0694 / 0.0694 (yes) | undecided (attributed) (undecided / not applicable) | pass (attributed) (pass / not applicable) | grid passes | 25.50 / 54.56 / 2.258 -> 14.26 / 26.84 / 0.317 | 10.03 / 50.15 / 2.508 | 10.96 -> 2.90 [0.00, 6.26] | 8.62 -> 3.88 | 0.00 -> 0.00 | 15.23 -> 10.32 | -11.24 (better; resolution 2.9e-2) | - |
| LARES|0.15 | 0 | validation | 0.1493 / 0.1493 (yes) | fail (attributed) (fail / not applicable) | undecided (attributed) (undecided / not applicable) | grid undecided | 85.23 / 219.19 / 3.857 -> 69.01 / 137.04 / 0.397 | 15.30 / 76.51 / 3.825 | 25.18 -> 13.24 [0.32, 26.17] | 18.32 -> 11.11 | 0.00 -> 0.00 | 69.72 -> 61.42 | -16.22 (better; resolution 2.9e-2) | - |
| LARES|0.05 | 0 | validation | 0.0495 / 0.0495 (NO) | undecided (attributed) (undecided / not applicable) | undecided (attributed) (undecided / not applicable) | grid not exercised (fitted e at or below 0.05) | 20.16 / 41.65 / 1.593 -> 20.16 / 41.65 / 1.593 | 9.69 / 48.44 / 2.422 | 8.09 -> 8.09 [4.64, 11.55] | 6.89 -> 6.89 | 0.00 -> 0.00 | 13.25 -> 13.25 | 0.00 (equal; resolution 2.9e-2) | undecided (attributed), 20.16 m |
| LARES|0.1 | 0 | validation, published in band | 0.0994 / 0.0994 (yes) | undecided (attributed) (undecided / not applicable) | pass (attributed) (pass / not applicable) | grid passes | 36.34 / 80.06 / 2.931 -> 20.65 / 41.21 / 0.330 | 10.98 / 54.91 / 2.745 | 15.78 -> 4.59 [0.00, 9.32] | 11.65 -> 4.39 | 0.00 -> 0.00 | 21.61 -> 14.23 | -15.69 (better; resolution 2.9e-2) | undecided (attributed), 36.34 m |
| Jason-3|0.07 | 0 | validation | 0.0694 / 0.0694 (yes) | undecided (attributed) (undecided / not applicable) | pass (attributed) (pass / not applicable) | grid passes | 28.33 / 68.47 / 2.362 -> 29.28 / 44.94 / 0.218 | 10.93 / 54.64 / 2.732 | 11.54 -> 2.23 [0.00, 6.44] | 10.50 -> 5.99 | 0.00 -> 0.00 | 19.11 -> 28.15 | 0.95 (worse; resolution 2.9e-2) | - |
| Jason-3|0.15 | 0 | validation | - | below the perigee floor | - | - | - | - | - | - | - | - | - | - |
| Jason-3|0.05 | 0 | validation | 0.0494 / 0.0494 (NO) | undecided (attributed) (undecided / not applicable) | undecided (attributed) (undecided / not applicable) | grid not exercised (fitted e at or below 0.05) | 18.98 / 50.28 / 1.822 -> 18.98 / 50.28 / 1.822 | 10.21 / 51.07 / 2.553 | 8.50 -> 8.50 [6.40, 10.59] | 8.20 -> 8.20 | 0.00 -> 0.00 | 9.99 -> 9.99 | -0.00 (equal; resolution 2.9e-2) | undecided (attributed), 18.98 m |
| Jason-3|0.1 | 0 | validation, published in band | 0.0993 / 0.0993 (yes) | undecided (attributed) (undecided / not applicable) | pass (attributed) (pass / not applicable) | grid passes | 51.96 / 125.23 / 3.019 -> 57.62 / 76.55 / 0.226 | 12.66 / 63.31 / 3.165 | 16.27 -> 3.30 [0.00, 11.23] | 14.89 -> 7.29 | 0.00 -> 0.00 | 43.09 -> 56.57 | 5.66 (worse; resolution 2.9e-2) | undecided (attributed), 51.96 m |
| Sentinel-3|0.07 | 0 | validation | 0.0694 / 0.0694 (yes) | pass (attributed) (pass / not applicable) | pass (attributed) (pass / not applicable) | grid passes | 50.76 / 132.08 / 3.491 -> 46.16 / 111.01 / 0.372 | 23.65 / 118.25 / 5.913 | 11.01 -> 8.33 [0.00, 21.27] | 17.71 -> 11.00 | 12.15 -> 12.15 | 31.92 -> 31.50 | -4.60 (better; resolution 3.7e-2) | - |
| Sentinel-3|0.15 | 0 | validation | - | below the perigee floor | - | - | - | - | - | - | - | - | - | - |
| Sentinel-3|0.05 | 0 | validation | 0.0495 / 0.0495 (NO) | pass (attributed) (pass / not applicable) | pass (attributed) (pass / not applicable) | grid not exercised (fitted e at or below 0.05) | 33.43 / 92.10 / 2.682 -> 33.43 / 92.10 / 2.682 | 20.72 / 103.62 / 5.181 | 8.92 -> 8.92 [0.63, 17.22] | 13.60 -> 13.60 | 6.09 -> 6.09 | 18.21 -> 18.21 | 0.00 (equal; resolution 3.7e-2) | pass (attributed), 33.43 m |
| Sentinel-3|0.1 | 0 | validation | - | below the perigee floor | - | - | - | - | - | - | - | - | - | - |
| CryoSat-2|0.07 | 0 | validation | 0.0694 / 0.0694 (yes) | undecided (attributed) (undecided / not applicable) | undecided (attributed) (undecided / not applicable) | grid undecided | 171.80 / 341.22 / 3.756 -> 170.07 / 333.76 / 0.400 | 17.03 / 85.13 / 4.257 | 19.21 -> 14.31 [0.00, 32.38] | 23.64 -> 20.31 | 0.00 -> 0.00 | 165.77 -> 166.01 | -1.73 (better; resolution 4.0e-2) | - |
| CryoSat-2|0.15 | 0 | validation | - | below the perigee floor | - | - | - | - | - | - | - | - | - | - |
| CryoSat-2|0.05 | 0 | validation | 0.0495 / 0.0495 (NO) | undecided (attributed) (undecided / not applicable) | undecided (attributed) (undecided / not applicable) | grid not exercised (fitted e at or below 0.05) | 74.43 / 178.68 / 2.744 -> 74.43 / 178.68 / 2.744 | 16.65 / 83.24 / 4.162 | 13.60 -> 13.60 [1.84, 25.36] | 16.68 -> 16.68 | 0.00 -> 0.00 | 68.05 -> 68.05 | 0.00 (equal; resolution 4.0e-2) | undecided (attributed), 74.43 m |
| CryoSat-2|0.1 | 0 | validation | - | below the perigee floor | - | - | - | - | - | - | - | - | - | - |
| LAGEOS-1|0.07 | 0 | validation | 0.0698 / 0.0698 (yes) | undecided (attributed) (undecided / not applicable) | pass (attributed) (pass / not applicable) | grid passes | 7.78 / 17.59 / 0.675 -> 3.29 / 5.18 / 0.228 | 2.73 / 13.67 / 0.684 | 4.31 -> 0.43 [0.00, 1.70] | 3.89 -> 0.15 | 2.13 -> 0.43 | 3.01 -> 2.88 | -4.50 (better; resolution 1.3e-2) | - |
| LAGEOS-1|0.15 | 0 | validation | 0.1497 / 0.1497 (yes) | fail (attributed) (fail / not applicable) | pass (attributed) (pass / not applicable) | grid passes | 15.76 / 41.87 / 1.273 -> 4.18 / 6.23 / 0.218 | 2.92 / 14.61 / 0.731 | 9.08 -> 0.47 [0.00, 1.93] | 7.75 -> 0.32 | 4.23 -> 0.53 | 4.96 -> 3.81 | -11.58 (better; resolution 1.3e-2) | - |
| LAGEOS-2|0.07 | 0 | validation | 0.0697 / 0.0697 (yes) | undecided (attributed) (undecided / not applicable) | undecided (attributed) (undecided / not applicable) | grid undecided | 9.00 / 23.38 / 0.585 -> 3.24 / 5.86 / 0.080 | 2.05 / 10.23 / 0.512 | 4.05 -> 0.70 [0.00, 2.38] | 6.55 -> 0.31 | 3.16 -> 1.02 | 2.41 -> 2.26 | -5.76 (better; resolution 1.4e-2) | - |
| LAGEOS-2|0.15 | 0 | validation | 0.1496 / 0.1496 (yes) | fail (attributed) (fail / not applicable) | undecided (attributed) (undecided / not applicable) | grid undecided | 18.20 / 51.65 / 1.135 -> 4.55 / 9.67 / 0.089 | 2.14 / 10.72 / 0.536 | 8.49 -> 1.23 [0.00, 4.18] | 13.63 -> 0.49 | 6.63 -> 2.23 | 2.68 -> 2.02 | -13.65 (better; resolution 1.4e-2) | - |
| Ajisai|0.1 | 0 | published in band (probe cell) | 0.0992 / 0.0992 (yes) | fail (attributed) (fail / not applicable) | undecided (attributed) (undecided / not applicable) | grid undecided | 44.67 / 116.01 / 2.601 -> 46.09 / 81.24 / 0.393 | 8.70 / 43.49 / 2.174 | 18.43 -> 5.16 [0.00, 21.01] | 13.42 -> 5.35 | 5.32 -> 1.43 | 6.28 -> 24.70 | 1.43 (worse; resolution 2.9e-2) | fail (attributed), 44.67 m |
| LAGEOS-1|0.1 | 0 | published in band (probe cell) | 0.0998 / 0.0998 (yes) | fail (attributed) (fail / not applicable) | pass (attributed) (pass / not applicable) | grid passes | 10.63 / 26.07 / 0.895 -> 3.44 / 5.37 / 0.224 | 2.79 / 13.95 / 0.697 | 6.14 -> 0.45 [0.00, 1.80] | 5.32 -> 0.20 | 2.79 -> 0.48 | 3.24 -> 3.01 | -7.19 (better; resolution 1.3e-2) | fail (attributed), 10.63 m |
| LAGEOS-1|0.2 | 0 | published in band (probe cell) | 0.1997 / 0.1997 (yes) | fail (attributed) (fail / not applicable) | pass (attributed) (pass / not applicable) | grid passes | 22.44 / 62.70 / 1.609 -> 6.61 / 10.26 / 0.208 | 3.12 / 15.61 / 0.781 | 11.85 -> 0.44 [0.00, 1.86] | 10.27 -> 0.52 | 5.73 -> 0.47 | 10.07 -> 6.42 | -15.83 (better; resolution 1.3e-2) | fail (attributed), 22.44 m |
| LAGEOS-2|0.1 | 0 | published in band (probe cell) | 0.0997 / 0.0997 (yes) | fail (attributed) (fail / not applicable) | undecided (attributed) (undecided / not applicable) | grid undecided | 12.42 / 32.72 / 0.803 -> 3.54 / 6.94 / 0.083 | 2.07 / 10.36 / 0.518 | 5.70 -> 0.84 [0.00, 2.87] | 9.28 -> 0.36 | 4.47 -> 1.36 | 2.47 -> 2.19 | -8.88 (better; resolution 1.4e-2) | fail (attributed), 12.42 m |
| LAGEOS-2|0.2 | 0 | published in band (probe cell) | 0.1996 / 0.1996 (yes) | fail (attributed) (fail / not applicable) | undecided (attributed) (undecided / not applicable) | grid undecided | 24.15 / 72.96 / 1.396 -> 6.70 / 14.85 / 0.110 | 2.25 / 11.26 / 0.563 | 11.33 -> 1.91 [0.00, 6.49] | 17.60 -> 0.72 | 8.77 -> 3.70 | 3.54 -> 2.02 | -17.45 (better; resolution 1.4e-2) | fail (attributed), 24.15 m |

## Catalog budget on persistent instances (THEMIS-RIPPLE-FIX.md Amendment 16 targets: cold median <= 100 ms per record on one worker; warm refresh of 1,000 records to a new epoch on 8 workers <= 5 s; peak wasm memory <= 512 MB per worker)
Host: 28 cores (Apple M3 Ultra), 256 GB, node v25.4.0. Records: seeded AP sets (caps 31 / 20, BTERM 0, AGOM 0, epoch 2026-10-29T00:00:00); cold = each record's first flight to the epoch + 1 min on a fresh persistent worker; warm = the 8 workers' refresh of their 125 records to the epoch + 1 day after loading them.
| Build | Started | Cold median ms, one worker (per class) | Cold mean ms | One-worker refresh median ms | 8-worker load, slowest worker ms | 8-worker refresh, slowest worker ms | Peak wasm MB per worker (each after refresh) | Refused | Within budget |
| --- | --- | --: | --: | --: | --: | --- | --- | --: | --- |
| 0.6.4 e245de29ea05 | 2026-11-06T12:40:19.856Z | 33.6 (band 33.1, above 107.8, outside 3.9) | 41.5 | 33.7 | 10880 | 5436 (43.5 per record per worker; band 3.3, above 64.9, outside 4.1 median) | 466.0 (456, 456, 456, 456, 457, 457, 64, 65) | 0 | cold within / warm OVER / memory within |
| 0.6.3 aa3ed22aa61a | 2026-11-06T12:42:10.749Z | 42.9 (band 45.2, above 108.1, outside 3.8) | 48.4 | 42.8 | 10809 | 5842 (46.7 per record per worker; band 45.5, above 64.9, outside 4.0 median) | 465.9 (64, 64, 64, 64, 457, 457, 64, 65) | 0 | cold within / warm OVER / memory within |

Beside it, report only (Amendment 1): the same 8 workers with record k on worker k mod 8 (every worker holds about 62 band, 31 above and 31 outside records): refresh slowest worker 2308 ms on 0.6.4 (18.5 per record per worker; peak 361 MB), 5674 ms on 0.6.3 (peak 171 MB). The registered assignment above puts the 250 above-e-0.3 records (the grid path 0.6.3 already flies, unchanged by 0.6.4) on two workers alone.

## Identity (seeded sets, caps 31 / 20, 65 epochs over a day in GCRF, 0.6.4 against 0.6.3 with PRODUCER's version read as 0.6.3)
| Regime | e | Class | Band | Result | Max position difference (m) | $OEM bytes |
| --- | --: | --: | --- | --- | --: | --: |
| Starlette | 0.001 | 0 | outside | equal | 0 | 6288 |
| Starlette | 0.01 | 0 | outside | equal | 0 | 6288 |
| Starlette | 0.05 | 0 | outside | equal | 0 | 6288 |
| Starlette | 0.1 | 0 | IN BAND | differs | 89.220 | 6288 |
| Starlette | 0.2 | 0 | IN BAND | below the perigee floor | - | - |
| Starlette | 0.3 | 0 | IN BAND | below the perigee floor | - | - |
| Starlette | 0.31 | 0 | outside | below the perigee floor | - | - |
| Starlette | 0.5 | 0 | outside | below the perigee floor | - | - |
| Ajisai | 0.001 | 0 | outside | equal | 0 | 6288 |
| Ajisai | 0.01 | 0 | outside | equal | 0 | 6288 |
| Ajisai | 0.05 | 0 | outside | equal | 0 | 6288 |
| Ajisai | 0.1 | 0 | IN BAND | differs | 63.098 | 6288 |
| Ajisai | 0.2 | 0 | IN BAND | below the perigee floor | - | - |
| Ajisai | 0.3 | 0 | IN BAND | below the perigee floor | - | - |
| Ajisai | 0.31 | 0 | outside | below the perigee floor | - | - |
| Ajisai | 0.5 | 0 | outside | below the perigee floor | - | - |
| LARES | 0.001 | 0 | outside | equal | 0 | 6288 |
| LARES | 0.01 | 0 | outside | equal | 0 | 6288 |
| LARES | 0.05 | 0 | outside | equal | 0 | 6288 |
| LARES | 0.1 | 0 | IN BAND | differs | 51.793 | 6288 |
| LARES | 0.2 | 0 | IN BAND | below the perigee floor | - | - |
| LARES | 0.3 | 0 | IN BAND | below the perigee floor | - | - |
| LARES | 0.31 | 0 | outside | below the perigee floor | - | - |
| LARES | 0.5 | 0 | outside | below the perigee floor | - | - |
| Jason-3 | 0.001 | 0 | outside | equal | 0 | 6288 |
| Jason-3 | 0.01 | 0 | outside | equal | 0 | 6288 |
| Jason-3 | 0.05 | 0 | outside | equal | 0 | 6288 |
| Jason-3 | 0.1 | 0 | IN BAND | differs | 61.807 | 6288 |
| Jason-3 | 0.2 | 0 | IN BAND | below the perigee floor | - | - |
| Jason-3 | 0.3 | 0 | IN BAND | below the perigee floor | - | - |
| Jason-3 | 0.31 | 0 | outside | below the perigee floor | - | - |
| Jason-3 | 0.5 | 0 | outside | below the perigee floor | - | - |
| Sentinel-3 | 0.001 | 0 | outside | equal | 0 | 6288 |
| Sentinel-3 | 0.01 | 0 | outside | equal | 0 | 6288 |
| Sentinel-3 | 0.05 | 0 | outside | equal | 0 | 6288 |
| Sentinel-3 | 0.1 | 0 | IN BAND | below the perigee floor | - | - |
| Sentinel-3 | 0.2 | 0 | IN BAND | below the perigee floor | - | - |
| Sentinel-3 | 0.3 | 0 | IN BAND | below the perigee floor | - | - |
| Sentinel-3 | 0.31 | 0 | outside | below the perigee floor | - | - |
| Sentinel-3 | 0.5 | 0 | outside | below the perigee floor | - | - |
| CryoSat-2 | 0.001 | 0 | outside | equal | 0 | 6288 |
| CryoSat-2 | 0.01 | 0 | outside | equal | 0 | 6288 |
| CryoSat-2 | 0.05 | 0 | outside | equal | 0 | 6288 |
| CryoSat-2 | 0.1 | 0 | IN BAND | below the perigee floor | - | - |
| CryoSat-2 | 0.2 | 0 | IN BAND | below the perigee floor | - | - |
| CryoSat-2 | 0.3 | 0 | IN BAND | below the perigee floor | - | - |
| CryoSat-2 | 0.31 | 0 | outside | below the perigee floor | - | - |
| CryoSat-2 | 0.5 | 0 | outside | below the perigee floor | - | - |
| LAGEOS-1 | 0.001 | 0 | outside | equal | 0 | 6288 |
| LAGEOS-1 | 0.01 | 0 | outside | equal | 0 | 6288 |
| LAGEOS-1 | 0.05 | 0 | outside | equal | 0 | 6288 |
| LAGEOS-1 | 0.1 | 0 | IN BAND | differs | 22.734 | 6288 |
| LAGEOS-1 | 0.2 | 0 | IN BAND | differs | 51.157 | 6288 |
| LAGEOS-1 | 0.3 | 0 | IN BAND | differs | 88.879 | 6288 |
| LAGEOS-1 | 0.31 | 0 | outside | equal | 0 | 6288 |
| LAGEOS-1 | 0.5 | 0 | outside | below the perigee floor | - | - |
| LAGEOS-2 | 0.001 | 0 | outside | equal | 0 | 6288 |
| LAGEOS-2 | 0.01 | 0 | outside | equal | 0 | 6288 |
| LAGEOS-2 | 0.05 | 0 | outside | equal | 0 | 6288 |
| LAGEOS-2 | 0.1 | 0 | IN BAND | differs | 25.444 | 6288 |
| LAGEOS-2 | 0.2 | 0 | IN BAND | differs | 52.493 | 6288 |
| LAGEOS-2 | 0.3 | 0 | IN BAND | differs | 77.020 | 6288 |
| LAGEOS-2 | 0.31 | 0 | outside | equal | 0 | 6288 |
| LAGEOS-2 | 0.5 | 0 | outside | below the perigee floor | - | - |
| Etalon | 0.001 | 2 | outside | equal | 0 | 6288 |
| Etalon | 0.01 | 2 | outside | equal | 0 | 6288 |
| Etalon | 0.05 | 2 | outside | equal | 0 | 6288 |
| Etalon | 0.1 | 2 | outside | equal | 0 | 6288 |
| Etalon | 0.2 | 2 | outside | equal | 0 | 6288 |
| Etalon | 0.3 | 2 | outside | equal | 0 | 6288 |
| Etalon | 0.31 | 2 | outside | equal | 0 | 6288 |
| Etalon | 0.5 | 2 | outside | equal | 0 | 6288 |
| GPS | 0.001 | 2 | outside | equal | 0 | 6288 |
| GPS | 0.01 | 2 | outside | equal | 0 | 6288 |
| GPS | 0.05 | 2 | outside | equal | 0 | 6288 |
| GPS | 0.1 | 2 | outside | equal | 0 | 6288 |
| GPS | 0.2 | 2 | outside | equal | 0 | 6288 |
| GPS | 0.3 | 2 | outside | equal | 0 | 6288 |
| GPS | 0.31 | 2 | outside | equal | 0 | 6288 |
| GPS | 0.5 | 2 | outside | equal | 0 | 6288 |
| Galileo | 0.001 | 2 | outside | equal | 0 | 6288 |
| Galileo | 0.01 | 2 | outside | equal | 0 | 6288 |
| Galileo | 0.05 | 2 | outside | equal | 0 | 6288 |
| Galileo | 0.1 | 2 | outside | equal | 0 | 6288 |
| Galileo | 0.2 | 2 | outside | equal | 0 | 6288 |
| Galileo | 0.3 | 2 | outside | equal | 0 | 6288 |
| Galileo | 0.31 | 2 | outside | equal | 0 | 6288 |
| Galileo | 0.5 | 2 | outside | equal | 0 | 6288 |
| GLONASS | 0.001 | 2 | outside | equal | 0 | 6288 |
| GLONASS | 0.01 | 2 | outside | equal | 0 | 6288 |
| GLONASS | 0.05 | 2 | outside | equal | 0 | 6288 |
| GLONASS | 0.1 | 2 | outside | equal | 0 | 6288 |
| GLONASS | 0.2 | 2 | outside | equal | 0 | 6288 |
| GLONASS | 0.3 | 2 | outside | equal | 0 | 6288 |
| GLONASS | 0.31 | 2 | outside | equal | 0 | 6288 |
| GLONASS | 0.5 | 2 | outside | equal | 0 | 6288 |
| IGSO | 0.001 | 1 | outside | equal | 0 | 6288 |
| IGSO | 0.01 | 1 | outside | equal | 0 | 6288 |
| IGSO | 0.05 | 1 | outside | equal | 0 | 6288 |
| IGSO | 0.1 | 1 | outside | equal | 0 | 6288 |
| IGSO | 0.2 | 1 | outside | equal | 0 | 6288 |
| IGSO | 0.3 | 1 | outside | equal | 0 | 6288 |
| IGSO | 0.31 | 1 | outside | equal | 0 | 6288 |
| IGSO | 0.5 | 1 | outside | equal | 0 | 6288 |
| QZSS | 0.001 | 1 | outside | equal | 0 | 6288 |
| QZSS | 0.01 | 1 | outside | equal | 0 | 6288 |
| QZSS | 0.05 | 1 | outside | equal | 0 | 6288 |
| QZSS | 0.1 | 1 | outside | equal | 0 | 6288 |
| QZSS | 0.2 | 1 | outside | equal | 0 | 6288 |
| QZSS | 0.3 | 1 | outside | equal | 0 | 6288 |
| QZSS | 0.31 | 1 | outside | equal | 0 | 6288 |
| QZSS | 0.5 | 1 | outside | equal | 0 | 6288 |
| GEO | 0.001 | 1 | outside | equal | 0 | 6288 |
| GEO | 0.01 | 1 | outside | equal | 0 | 6288 |
| GEO | 0.05 | 1 | outside | equal | 0 | 6288 |
| GEO | 0.1 | 1 | outside | equal | 0 | 6288 |
| GEO | 0.2 | 1 | outside | equal | 0 | 6288 |
| GEO | 0.3 | 1 | outside | equal | 0 | 6288 |
| GEO | 0.31 | 1 | outside | equal | 0 | 6288 |
| GEO | 0.5 | 1 | outside | equal | 0 | 6288 |
| Molniya | 0.001 | 2 | outside | equal | 0 | 6288 |
| Molniya | 0.01 | 2 | outside | equal | 0 | 6288 |
| Molniya | 0.05 | 2 | outside | equal | 0 | 6288 |
| Molniya | 0.1 | 2 | outside | equal | 0 | 6288 |
| Molniya | 0.2 | 2 | outside | equal | 0 | 6288 |
| Molniya | 0.3 | 2 | outside | equal | 0 | 6288 |
| Molniya | 0.31 | 2 | outside | equal | 0 | 6288 |
| Molniya | 0.5 | 2 | outside | equal | 0 | 6288 |
| GTO | 0.001 | 2 | outside | equal | 0 | 6288 |
| GTO | 0.01 | 2 | outside | equal | 0 | 6288 |
| GTO | 0.05 | 2 | outside | equal | 0 | 6288 |
| GTO | 0.1 | 2 | outside | equal | 0 | 6288 |
| GTO | 0.2 | 2 | outside | equal | 0 | 6288 |
| GTO | 0.3 | 2 | outside | equal | 0 | 6288 |
| GTO | 0.31 | 2 | outside | equal | 0 | 6288 |
| GTO | 0.5 | 2 | outside | equal | 0 | 6288 |
| THEMIS D | 0.001 | 1 | outside | equal | 0 | 6288 |
| THEMIS D | 0.01 | 1 | outside | equal | 0 | 6288 |
| THEMIS D | 0.05 | 1 | outside | equal | 0 | 6288 |
| THEMIS D | 0.1 | 1 | outside | equal | 0 | 6288 |
| THEMIS D | 0.2 | 1 | outside | equal | 0 | 6288 |
| THEMIS D | 0.3 | 1 | outside | equal | 0 | 6288 |
| THEMIS D | 0.31 | 1 | outside | equal | 0 | 6288 |
| THEMIS D | 0.5 | 1 | outside | equal | 0 | 6288 |

## Published examples (results/ap-truth/compare/examples, flown over each window in TEME on both builds)
| Example | Regime | n (rev/day) | e | Class | Band | Epochs | Result |
| --- | --- | --: | --: | --: | --- | --: | --- |
| best-geostationary | Geostationary | 1.0027 | 0.00033 | 1 | outside | 2879 | equal |
| best-highly-elliptical-themis-and-chandra | Highly elliptical, THEMIS and Chandra | 1.0499 | 0.82198 | 1 | above 0.3 | 2879 | equal |
| best-inclined-geosynchronous | Inclined geosynchronous | 1.0029 | 0.00365 | 1 | outside | 2879 | equal |
| best-laser-geodetic | Laser geodetic | 6.3906 | 0.00091 | 0 | outside | 2880 | equal |
| best-low-orbit-laser-spheres | Low orbit, laser spheres | 12.4435 | 0.00132 | 0 | outside | 14368 | equal |
| best-medium-earth-orbit | Medium Earth orbit | 2.0058 | 0.01288 | 2 | outside | 2879 | equal |
| best-near-700-km | Near 700 km | 14.6010 | 0.00119 | 0 | outside | 14302 | equal |
| best-strong-drag-2025 | Strong drag, 2025 | 15.2621 | 0.00144 | 0 | outside | 11519 | equal |
| next-china-space-station-css | Low orbit, crewed | 15.6046 | 0.00048 | 0 | outside | 4500 | equal |
| next-cne-low-orbit | Low orbit | 14.0092 | 0.00095 | 0 | outside | 4500 | equal |
| next-cod-navigation | Navigation | 2.1311 | 0.00208 | 2 | outside | 900 | equal |
| next-dgf-geodetic | Geodetic | 6.3906 | 0.00071 | 0 | outside | 900 | equal |
| next-dgf-low-orbit | Low orbit | 13.8214 | 0.02105 | 0 | outside | 4500 | equal |
| next-esa-low-orbit | Low orbit | 14.5285 | 0.00133 | 0 | outside | 4500 | equal |
| next-esa-navigation | Navigation | 1.7047 | 0.00039 | 2 | outside | 900 | equal |
| next-esa-ultra-rapid-glonass | Navigation, ultra-rapid | 2.1311 | 0.00128 | 2 | outside | 613 | equal |
| next-esa-ultra-rapid-gps | Navigation, ultra-rapid | 2.0056 | 0.01140 | 2 | outside | 613 | equal |
| next-eum-low-orbit | Low orbit | 12.8129 | 0.00009 | 0 | outside | 4500 | equal |
| next-gal-navigation | Navigation | 1.7048 | 0.00035 | 2 | outside | 900 | equal |
| next-gfz-low-orbit | Low orbit | 15.2015 | 0.00128 | 0 | outside | 4500 | equal |
| next-gsf-navigation | Navigation | 2.0057 | 0.00211 | 2 | outside | 900 | equal |
| next-hds-low-orbit | Low orbit | 15.2015 | 0.00125 | 0 | outside | 4500 | equal |
| next-hts-geodetic | Geodetic | 6.4728 | 0.01398 | 0 | outside | 900 | equal |
| next-hts-low-orbit | Low orbit | 14.6476 | 0.00069 | 0 | outside | 4500 | equal |
| next-intelsat-intelsat | Geostationary, station-kept | 1.0027 | 0.00023 | 1 | outside | 900 | equal |
| next-isr-navigation | Navigation | 1.0028 | 0.00178 | 1 | outside | 900 | equal |
| next-nasa-iss-iss | Low orbit, crewed | 15.4817 | 0.00154 | 0 | outside | 4500 | equal |
| next-planet-flock--planet | Low orbit, imaging fleet | 15.5414 | 0.00148 | 0 | outside | 780 | equal |
| next-qss-navigation | Navigation | 1.0027 | 0.00027 | 1 | outside | 900 | equal |
| next-ses-ses | Geostationary, station-kept | 1.0027 | 0.00031 | 1 | outside | 168 | equal |
| next-sgf-geodetic | Geodetic | 6.4728 | 0.01398 | 0 | outside | 900 | equal |
| next-sgf-low-orbit | Low orbit | 14.6476 | 0.00137 | 0 | outside | 4500 | equal |
| next-sha-low-orbit | Low orbit | 13.8008 | 0.00121 | 0 | outside | 4500 | equal |
| next-sha-navigation | Navigation | 1.8623 | 0.00057 | 2 | outside | 900 | equal |
| truth-geostationary-c006-bds-2g | Geostationary | 1.0026 | 0.00098 | 1 | outside | 2879 | equal |
| truth-highly-elliptical-themis-and-chandra-chandra | Highly elliptical, THEMIS and Chandra | 0.3779 | 0.68474 | 0 | above 0.3 | 2880 | equal |
| truth-highly-elliptical-themis-and-chandra-themis-a | Highly elliptical, THEMIS and Chandra | 1.0494 | 0.82390 | 1 | above 0.3 | 2879 | equal |
| truth-inclined-geosynchronous-c005-bds-2i | Inclined geosynchronous | 1.0030 | 0.00500 | 1 | outside | 2879 | equal |
| truth-inclined-geosynchronous-c009-bds-2i | Inclined geosynchronous | 1.0026 | 0.01438 | 1 | outside | 2879 | equal |
| truth-laser-geodetic-etalon-1 | Laser geodetic | 2.1316 | 0.00218 | 2 | outside | 2880 | equal |
| truth-laser-geodetic-lageos-2 | Laser geodetic | 6.4728 | 0.01427 | 0 | outside | 2880 | equal |
| truth-laser-geodetic-lares-2 | Laser geodetic | 6.3906 | 0.00091 | 0 | outside | 2880 | equal |
| truth-low-orbit-laser-spheres-ajisai | Low orbit, laser spheres | 12.4435 | 0.00132 | 0 | outside | 14368 | equal |
| truth-medium-earth-orbit-e218-gal-2 | Medium Earth orbit | 1.7047 | 0.00017 | 2 | outside | 2879 | equal |
| truth-medium-earth-orbit-g053-gps-iir-m | Medium Earth orbit | 2.0057 | 0.01273 | 2 | outside | 2879 | equal |
| truth-medium-earth-orbit-g073-gps-iif | Medium Earth orbit | 2.0057 | 0.01096 | 2 | outside | 2879 | equal |
| truth-medium-earth-orbit-r743-glo-m | Medium Earth orbit | 2.1311 | 0.00256 | 2 | outside | 2879 | equal |
| truth-medium-earth-orbit-r859-glo-m- | Medium Earth orbit | 2.1311 | 0.00129 | 2 | outside | 2879 | equal |
| truth-near-700-km-sentinel-1a | Near 700 km | 14.6010 | 0.00119 | 0 | outside | 14373 | equal |
| truth-near-700-km-sentinel-1c | Near 700 km | 14.6010 | 0.00119 | 0 | outside | 14357 | equal |
| truth-strong-drag-2025-swarm-a | Strong drag, 2025 | 15.4352 | 0.00143 | 0 | outside | 11519 | equal |
| truth-strong-drag-2025-swarm-b | Strong drag, 2025 | 15.2641 | 0.00139 | 0 | outside | 11519 | equal |
| truth-strong-drag-2025-swarm-c | Strong drag, 2025 | 15.4434 | 0.00144 | 0 | outside | 11519 | equal |
| truth-strong-drag-2026-swarm-a | Strong drag, 2026 | 15.4955 | 0.00140 | 0 | outside | 11519 | equal |
| truth-strong-drag-2026-swarm-b | Strong drag, 2026 | 15.2878 | 0.00146 | 0 | outside | 11519 | equal |
| truth-strong-drag-2026-swarm-c | Strong drag, 2026 | 15.4988 | 0.00141 | 0 | outside | 11519 | equal |

