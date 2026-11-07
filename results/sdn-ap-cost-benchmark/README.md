# The cost of each theory on the current builds

Registered in `experiments/sdn-ap-cost-benchmark/BENCHMARK.md` before any run. One machine: Mac Studio (Mac15,14), Apple M3 Ultra, 28 cores (20 performance, 8 efficiency), 256 GiB, macOS 26.3.1, Node.js v25.4.0; one process at a time; propagator/sdn-ap with its thread pool bounded to one, every other module a sequential artifact. Step 300 s everywhere: the fit reads a 48 h arc thinned to 300 s (at most 577 states); the flight writes 2016 states, every 300 s for 7 days. 32 registered windows over 8 regimes of the comparison explorer's precise-orbit rows: Low orbit, laser spheres; Low orbit, altimetry; Laser geodetic; Geostationary; Inclined geosynchronous; Strong drag, 2026; Near 700 km; Medium Earth orbit.

## Builds

| Module | Version | SHA-256 of the dist | Commit |
| --- | --- | --- | --- |
| propagator/sdn-ap | 0.6.3 | `aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e` | 93cb5a0584 |
| propagator/sgp4-xp | 0.2.2 | `1f8aa4c7e3c01a9eb6c499a6730be827afee2b969f535410af32c74237f17877` | 890c8655f2 |
| propagator/sgp4 | 1.4.1 | `2fe246b716c78a4b947cd95e70e126b7a738cbbb9775e5196f07b1fe551f4643` | 890c8655f2 |
| propagator/ffm | 2.2.1 | `a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4` | 9cb02c8e22 |
| analysis/estimation | 0.7.0 | `7a555ca5b3ed0b021dd5b7986bd73dd8f8dc5125a2aa7943e3b3e983320d6bcd` | 9a05d899b9 |
| analysis/gp-error-model | 0.11.0 | `8e13eddbd5ccc3e0ee121f3b851e8314e426715cf5517823aa8d925566ef0e19` | fbda894501 |

The shipped build of each arm, one per module: the columns below, the comparison page and the paper read these. Each wasm by `git show` at its commit, SHA-256 checked before it is loaded. propagator/sgp4-xp is the Space Force library's module, timed as a black box through its published methods; nothing of it is read. Whiteroom XP is propagator/sdn-ap at the theory's own forces. The same arms on the earlier builds stand beside them in the section "The shipped builds beside the earlier ones".

## Per object-day, median over the windows (10th to 90th percentile, windows)

| Arm | Fit CPU s | Fit wall s | Flight CPU s | Flight wall s |
| --- | --- | --- | --- | --- |
| SGP4 | 0.0284 (0.02327 to 0.3817, n 25) | 0.02482 (0.0231 to 0.3814, n 25) | 0.0008864 (0.0005559 to 0.00239, n 25) | 0.0006133 (0.000545 to 0.0008345, n 25) |
| XP, whiteroom | 0.05476 (0.03579 to 0.06792, n 28) | 0.05461 (0.03525 to 0.06566, n 28) | 0.008046 (0.006198 to 0.009005, n 28) | 0.007805 (0.005819 to 0.008402, n 28) |
| XP, Space Force | 0.4632 (0.2789 to 1.053, n 28) | 0.4634 (0.2788 to 1.05, n 28) | 0.008246 (0.004916 to 0.01248, n 28) | 0.007299 (0.003573 to 0.01198, n 28) |
| AP | 0.5249 (0.06938 to 1.2, n 28) | 0.519 (0.06938 to 1.2, n 28) | 0.1109 (0.02054 to 0.1379, n 28) | 0.1109 (0.02007 to 0.1378, n 28) |
| FFM 20×20 | 0.3916 (0.3592 to 1.507, n 28) | 0.3163 (0.3008 to 1.405, n 28) | 0.1415 (0.1123 to 0.5063, n 28) | 0.1318 (0.1045 to 0.4991, n 28) |
| FFM 40×40 | 2.108 (1.401 to 2.84, n 13) | 2.024 (1.346 to 2.706, n 13) | 0.9477 (0.7484 to 1.035, n 13) | 0.9394 (0.7382 to 1.023, n 13) |

A fit per object-day is the 48 h fit's time divided by 2; a flight per object-day the 7-day flight's divided by 7. CPU: user plus system time of the process across the call; wall: elapsed, on a shared machine (the load in table.json). One warm-up call per arm and phase is not counted. sdn-ap runs with its thread pool bounded to one; every other module is sequential. The laser products are on 120 s and 180 s grids: the harness thins them to every round(300 / step)-th state, 360 s apart (481 states); every other arc is 577 states at 300 s.

## One call, seconds, median (10th to 90th percentile)

| Arm | Fit, 48 h arc | Flight, 7 days |
| --- | --- | --- |
| SGP4 | 0.0568 (0.04654 to 0.7634, n 25) CPU, 0.04963 (0.0462 to 0.7628, n 25) wall | 0.006205 (0.003891 to 0.01673, n 25) CPU, 0.004293 (0.003815 to 0.005841, n 25) wall |
| XP, whiteroom | 0.1095 (0.07157 to 0.1358, n 28) CPU, 0.1092 (0.0705 to 0.1313, n 28) wall | 0.05632 (0.04339 to 0.06303, n 28) CPU, 0.05463 (0.04073 to 0.05881, n 28) wall |
| XP, Space Force | 0.9264 (0.5578 to 2.107, n 28) CPU, 0.9268 (0.5577 to 2.101, n 28) wall | 0.05772 (0.03441 to 0.08737, n 28) CPU, 0.05109 (0.02501 to 0.08388, n 28) wall |
| AP | 1.05 (0.1388 to 2.399, n 28) CPU, 1.038 (0.1388 to 2.4, n 28) wall | 0.7765 (0.1438 to 0.965, n 28) CPU, 0.7763 (0.1405 to 0.9649, n 28) wall |
| FFM 20×20 | 0.7831 (0.7184 to 3.014, n 28) CPU, 0.6327 (0.6016 to 2.811, n 28) wall | 0.9904 (0.7861 to 3.544, n 28) CPU, 0.9224 (0.7312 to 3.494, n 28) wall |
| FFM 40×40 | 4.216 (2.802 to 5.679, n 13) CPU, 4.048 (2.692 to 5.413, n 13) wall | 6.634 (5.239 to 7.244, n 13) CPU, 6.576 (5.168 to 7.159, n 13) wall |

## Memory

| Arm | Peak linear memory, pages (MiB) | maxRSS, fits (MiB) | maxRSS, flights (MiB) | Module bytes | Bytes per object, median (10th to 90th) |
| --- | --- | --- | --- | --- | --- |
| SGP4 | 1024 (64) | 411.5 | 417.9 | gp-error-model 2,230,296; sgp4 1,295,483 | 640 (632 to 640): the $OMM the fitter emits |
| XP, whiteroom | 1068 (66.75) | 235.1 | 345.9 | sdn-ap 966,222 | 2728 (2728 to 2744): the $OCM |
| XP, Space Force | 256 (16) | 256.7 | 305.9 | sgp4-xp 1,030,209 | 1800 (1792 to 1816): the $OCM |
| AP | 1154 (72.13) | 262.4 | 334.8 | sdn-ap 966,222 | 4320 (4312 to 4384): the $OCM |
| FFM 20×20 | 1877 (117.3) | 1136 | 1102 | estimation 769,257; ffm 2,754,046 | 234 (232 to 236): the fit's epoch, state and parameters as UTF-8 JSON (no FlatBuffer product in the harness) |
| FFM 40×40 | 1879 (117.4) | 1133 | 1114 | estimation 769,257; ffm 2,754,046 | 234 (216 to 236): the fit's epoch, state and parameters as UTF-8 JSON (no FlatBuffer product in the harness) |

Peak linear memory: the largest WebAssembly.Memory the arm's process held, read after each call; every module runs one instance for the arm's whole phase. maxRSS: process.resourceUsage() of the arm's own process; the FFM arms' figure carries the harness's planetary kernel and Earth-orientation frames beside the two modules. The sdn-ap epoch store (SPEC 14) is not measured here: the harness has no snapshot codec for it.

## By regime, CPU seconds per object-day, median

| Regime | SGP4 fit | XP, whiteroom fit | XP, Space Force fit | AP fit | FFM 20×20 fit | FFM 40×40 fit | SGP4 flight | XP, whiteroom flight | XP, Space Force flight | AP flight | FFM 20×20 flight | FFM 40×40 flight |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Low orbit, laser spheres | 0.02634 | 0.05096 | 0.8115 | 0.5249 | 1.131 | 2.108 | 0.002917 | 0.007855 | 0.01413 | 0.1163 | 0.525 | 1.035 |
| Low orbit, altimetry | 0.0274 | 0.05908 | 0.9683 | 0.6326 | 0.9185 | 1.63 | 0.001291 | 0.007908 | 0.01208 | 0.1157 | 0.4654 | 0.9223 |
| Laser geodetic | 0.03167 | 0.03554 | 0.2236 | 0.3266 | 0.3592 | — | 0.0006827 | 0.006764 | 0.004916 | 0.08415 | 0.1333 | — |
| Geostationary | 0.3817 | 0.05824 | 0.3556 | 0.06302 | 0.3783 | — | 0.0008076 | 0.008982 | 0.005835 | 0.02023 | 0.1139 | — |
| Inclined geosynchronous | 0.1321 | 0.05484 | 0.4134 | 0.08504 | 0.362 | — | 0.0007856 | 0.008401 | 0.007774 | 0.02105 | 0.1123 | — |
| Strong drag, 2026 | 0.02381 | 0.0552 | 0.787 | 0.6487 | 1.481 | 2.608 | 0.00057 | 0.008037 | 0.01051 | 0.1239 | 0.4888 | 0.9477 |
| Near 700 km | 0.02327 | 0.0612 | 0.4425 | 0.6658 | 0.7853 | 1.401 | 0.0005556 | 0.007747 | 0.002803 | 0.1185 | 0.3777 | 0.7466 |
| Medium Earth orbit | 0.0257 | 0.04459 | 0.4348 | 1.259 | 0.3786 | — | 0.0005896 | 0.005773 | 0.005116 | 0.1601 | 0.1133 | — |

## The shipped builds beside the earlier ones

The arms whose module shipped since the registered run, on every build measured, the same windows, measures and statistics (BENCHMARK.md, amendment 2026-11-06). The shipped build's row is the column above; every other row is a comparison column of table.json, by hash.

| Column | Build | Fit CPU s per object-day | Flight CPU s per object-day | Windows, fit / flight | Peak linear memory (MiB) | 1-minute load, min to max |
| --- | --- | --- | --- | --- | --- | --- |
| XP, whiteroom, shipped | propagator/sdn-ap 0.6.3, `aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e`, 93cb5a0584 | 0.05476 (0.03579 to 0.06792, n 28) | 0.008046 (0.006198 to 0.009005, n 28) | 28 / 28 | 66.75 | 12.13 to 12.55 |
| XP, whiteroom, propagator/sdn-ap 0.5.2 74388314396a | propagator/sdn-ap 0.5.2, `74388314396a8f8c4bc962b63566b01ee8a99e1d8a295e8233fac36d5683500d`, 890c8655f2 | 0.05375 (0.03682 to 0.06603, n 28) | 0.00802 (0.006138 to 0.00918, n 28) | 28 / 28 | 66.81 | in table.json by arm |
| XP, whiteroom, propagator/sdn-ap 0.6.2 84d50dca4efd | propagator/sdn-ap 0.6.2, `84d50dca4efdfea87eff7e3b4618d795c26a7d0a6df0e877341e69bc73161f41`, e1e4fad87a | 0.0541 (0.03703 to 0.06733, n 28) | 0.008018 (0.006305 to 0.009027, n 28) | 28 / 28 | 66.81 | 12.32 to 12.73 |
| AP, shipped | propagator/sdn-ap 0.6.3, `aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e`, 93cb5a0584 | 0.5249 (0.06938 to 1.2, n 28) | 0.1109 (0.02054 to 0.1379, n 28) | 28 / 28 | 72.13 | 11.72 to 12.91 |
| AP, propagator/sdn-ap 0.5.2 74388314396a | propagator/sdn-ap 0.5.2, `74388314396a8f8c4bc962b63566b01ee8a99e1d8a295e8233fac36d5683500d`, 890c8655f2 | 0.5024 (0.06903 to 1.073, n 28) | 0.1108 (0.02 to 0.1377, n 28) | 28 / 28 | 72.19 | in table.json by arm |
| AP, propagator/sdn-ap 0.6.2 84d50dca4efd | propagator/sdn-ap 0.6.2, `84d50dca4efdfea87eff7e3b4618d795c26a7d0a6df0e877341e69bc73161f41`, e1e4fad87a | 0.511 (0.07168 to 1.133, n 28) | 0.1098 (0.02035 to 0.1385, n 28) | 28 / 28 | 72.19 | 12.26 to 12.75 |
| FFM 20×20, shipped | propagator/ffm 2.2.1, `a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4`, 9cb02c8e22 | 0.3916 (0.3592 to 1.507, n 28) | 0.1415 (0.1123 to 0.5063, n 28) | 28 / 28 | 117.3 | 11.82 to 13.88 |
| FFM 20×20, propagator/ffm 2.2.0 d635a3d57a2c | propagator/ffm 2.2.0, `d635a3d57a2c9ca91d111f74aad38b9d748d6c16199b22c6922af21c92fe2153`, 890c8655f2 | 0.3864 (0.3626 to 1.528, n 28) | 0.1476 (0.1165 to 0.5298, n 28) | 28 / 28 | 117.3 | in table.json by arm |
| FFM 40×40, shipped | propagator/ffm 2.2.1, `a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4`, 9cb02c8e22 | 2.108 (1.401 to 2.84, n 13) | 0.9477 (0.7484 to 1.035, n 13) | 13 / 13 | 117.4 | 11.76 to 13.37 |
| FFM 40×40, propagator/ffm 2.2.0 d635a3d57a2c | propagator/ffm 2.2.0, `d635a3d57a2c9ca91d111f74aad38b9d748d6c16199b22c6922af21c92fe2153`, 890c8655f2 | 2.117 (1.447 to 2.834, n 13) | 0.9671 (0.7664 to 1.043, n 13) | 13 / 13 | 117.4 | in table.json by arm |

## AP's flight over FFM 40×40's, low Earth orbit

Flight CPU seconds per object-day, AP over FFM 40×40, on the windows below 8,400 km both arms completed: per window, median (10th to 90th percentile, windows); per regime, each regime's median over the other's, and the median of those (the site's rule; its rounded reciprocal is the front page's fraction).

- Shipped: AP on propagator/sdn-ap 0.6.3 (`aa3ed22aa61a`) over FFM 40×40 on propagator/ffm 2.2.1 (`a91331207752`): per window 0.1263 (0.1057 to 0.1587, n 13); per regime Low orbit, laser spheres 0.1124, Low orbit, altimetry 0.1254, Strong drag, 2026 0.1307, Near 700 km 0.1587, median 0.1281, about 1/8.
- sdn-ap-0.6.2 over ffm-2.2.1: AP on propagator/sdn-ap 0.6.2 (`84d50dca4efd`) over FFM 40×40 on propagator/ffm 2.2.1 (`a91331207752`): per window 0.1258 (0.1089 to 0.158, n 13); per regime Low orbit, laser spheres 0.114, Low orbit, altimetry 0.1259, Strong drag, 2026 0.1318, Near 700 km 0.1579, median 0.1288, about 1/8.
- a13cb468: AP on propagator/sdn-ap 0.5.2 (`74388314396a`) over FFM 40×40 on propagator/ffm 2.2.0 (`d635a3d57a2c`): per window 0.1238 (0.1066 to 0.1558, n 13); per regime Low orbit, laser spheres 0.1127, Low orbit, altimetry 0.1237, Strong drag, 2026 0.1287, Near 700 km 0.1558, median 0.1262, about 1/8.

## Runs

- a13cb468 (the registered run, 2026-11-05): arms SGP4, XP, XPU, AP, FFM20, FFM40; 2026-11-05T05:03:46.998Z to 2026-11-05T05:10:20.963Z, 394 s of wall time; shared with other lanes; the load before and after each arm in load; rows `/opt/data/sdn-archive/operator-theory/sdn-ap-cost-benchmark`.
- sdn-ap-0.6.2 (propagator/sdn-ap 0.6.2): arms XP, AP; 2026-11-06T07:12:32.800Z to 2026-11-06T07:13:28.325Z, 55.52 s of wall time; load ceiling 22.83; the DSST run's seven accuracy JVMs SIGSTOPped through the DSST governor from 2026-11-06T07:05:58Z to 07:19:17Z, around the benchmark (07:12:32Z to 07:18:58Z); the FFM rerun lane's eight single-thread scoring workers ran throughout (disclosed by the coordinator at 07:12Z); 1-minute load 11.7 to 12.7 at every phase boundary, under the ceiling; rows `/opt/data/sdn-archive/operator-theory/sdn-ap-cost-benchmark/builds/sdn-ap-0.6.2-84d50dca`.
- sdn-ap-0.6.3 (propagator/sdn-ap 0.6.3): arms XP, AP; 2026-11-06T07:13:28.498Z to 2026-11-06T07:14:24.532Z, 56.03 s of wall time; load ceiling 22.83; the DSST run's seven accuracy JVMs SIGSTOPped through the DSST governor from 2026-11-06T07:05:58Z to 07:19:17Z, around the benchmark (07:12:32Z to 07:18:58Z); the FFM rerun lane's eight single-thread scoring workers ran throughout (disclosed by the coordinator at 07:12Z); 1-minute load 11.7 to 12.7 at every phase boundary, under the ceiling; rows `/opt/data/sdn-archive/operator-theory/sdn-ap-cost-benchmark/builds/sdn-ap-0.6.3-aa3ed22a`.
- ffm-2.2.1 (propagator/ffm 2.2.1): arms FFM20, FFM40; 2026-11-06T07:14:24.712Z to 2026-11-06T07:18:58.599Z, 273.9 s of wall time; load ceiling 22.83; the DSST run's seven accuracy JVMs SIGSTOPped through the DSST governor from 2026-11-06T07:05:58Z to 07:19:17Z, around the benchmark (07:12:32Z to 07:18:58Z); the FFM rerun lane's eight single-thread scoring workers ran throughout (disclosed by the coordinator at 07:12Z); 1-minute load 11.7 to 12.7 at every phase boundary, under the ceiling; rows `/opt/data/sdn-archive/operator-theory/sdn-ap-cost-benchmark/builds/ffm-2.2.1-a9133120`.

## Rows refused by the load ceiling

- none

## Windows an arm did not complete

- SGP4, LS|LARETS|2025-10-25, fit: coverage 859/960 on the product's 180 s grid
- SGP4, IG|C220 BDS-3I|2025-10-08, fit: not converged: no step lowers the cost; predicted decrease 0.000397 of the cost (stationary when <= 1e-06), position RMS 1.18 km (floor 1e-06)
- SGP4, IG|C009 BDS-2I|2025-10-08, fit: not converged: no step lowers the cost; predicted decrease 0.000213 of the cost (stationary when <= 1e-06), position RMS 1.28 km (floor 1e-06)
- SGP4, IG|C005 BDS-2I|2025-10-08, fit: not converged: no step lowers the cost; predicted decrease 0.000754 of the cost (stationary when <= 1e-06), position RMS 1.25 km (floor 1e-06)
- SGP4, S1|62261|2026-03-08, fit: coverage 0 states
- SGP4, S1|39634|2026-03-23, fit: coverage 0 states
- SGP4, GN|43058|2026-01-03, fit: coverage 0 states
- XP, whiteroom, LS|LARETS|2025-10-25, fit: coverage 859/960 on the product's 180 s grid
- XP, whiteroom, S1|62261|2026-03-08, fit: coverage 0 states
- XP, whiteroom, S1|39634|2026-03-23, fit: coverage 0 states
- XP, whiteroom, GN|43058|2026-01-03, fit: coverage 0 states
- XP, Space Force, LS|LARETS|2025-10-25, fit: coverage 859/960 on the product's 180 s grid
- XP, Space Force, S1|62261|2026-03-08, fit: coverage 0 states
- XP, Space Force, S1|39634|2026-03-23, fit: coverage 0 states
- XP, Space Force, GN|43058|2026-01-03, fit: coverage 0 states
- AP, LS|LARETS|2025-10-25, fit: coverage 859/960 on the product's 180 s grid
- AP, S1|62261|2026-03-08, fit: coverage 0 states
- AP, S1|39634|2026-03-23, fit: coverage 0 states
- AP, GN|43058|2026-01-03, fit: coverage 0 states
- FFM 20×20, LS|LARETS|2025-10-25, fit: coverage 859/960 on the product's 180 s grid
- FFM 20×20, S1|62261|2026-03-08, fit: coverage 0 states
- FFM 20×20, S1|39634|2026-03-23, fit: coverage 0 states
- FFM 20×20, GN|43058|2026-01-03, fit: coverage 0 states
- FFM 40×40, LS|LARETS|2025-10-25, fit: coverage 859/960 on the product's 180 s grid
- FFM 40×40, S1|62261|2026-03-08, fit: coverage 0 states
- FFM 40×40, S1|39634|2026-03-23, fit: coverage 0 states
- FFM 40×40, GN|43058|2026-01-03, fit: coverage 0 states
- XP, whiteroom, propagator/sdn-ap 0.5.2 74388314396a, LS|LARETS|2025-10-25, fit: coverage 859/960 on the product's 180 s grid
- XP, whiteroom, propagator/sdn-ap 0.5.2 74388314396a, S1|62261|2026-03-08, fit: coverage 0 states
- XP, whiteroom, propagator/sdn-ap 0.5.2 74388314396a, S1|39634|2026-03-23, fit: coverage 0 states
- XP, whiteroom, propagator/sdn-ap 0.5.2 74388314396a, GN|43058|2026-01-03, fit: coverage 0 states
- AP, propagator/sdn-ap 0.5.2 74388314396a, LS|LARETS|2025-10-25, fit: coverage 859/960 on the product's 180 s grid
- AP, propagator/sdn-ap 0.5.2 74388314396a, S1|62261|2026-03-08, fit: coverage 0 states
- AP, propagator/sdn-ap 0.5.2 74388314396a, S1|39634|2026-03-23, fit: coverage 0 states
- AP, propagator/sdn-ap 0.5.2 74388314396a, GN|43058|2026-01-03, fit: coverage 0 states
- FFM 20×20, propagator/ffm 2.2.0 d635a3d57a2c, LS|LARETS|2025-10-25, fit: coverage 859/960 on the product's 180 s grid
- FFM 20×20, propagator/ffm 2.2.0 d635a3d57a2c, S1|62261|2026-03-08, fit: coverage 0 states
- FFM 20×20, propagator/ffm 2.2.0 d635a3d57a2c, S1|39634|2026-03-23, fit: coverage 0 states
- FFM 20×20, propagator/ffm 2.2.0 d635a3d57a2c, GN|43058|2026-01-03, fit: coverage 0 states
- FFM 40×40, propagator/ffm 2.2.0 d635a3d57a2c, LS|LARETS|2025-10-25, fit: coverage 859/960 on the product's 180 s grid
- FFM 40×40, propagator/ffm 2.2.0 d635a3d57a2c, S1|62261|2026-03-08, fit: coverage 0 states
- FFM 40×40, propagator/ffm 2.2.0 d635a3d57a2c, S1|39634|2026-03-23, fit: coverage 0 states
- FFM 40×40, propagator/ffm 2.2.0 d635a3d57a2c, GN|43058|2026-01-03, fit: coverage 0 states
- XP, whiteroom, propagator/sdn-ap 0.6.2 84d50dca4efd, LS|LARETS|2025-10-25, fit: coverage 859/960 on the product's 180 s grid
- XP, whiteroom, propagator/sdn-ap 0.6.2 84d50dca4efd, S1|62261|2026-03-08, fit: coverage 0 states
- XP, whiteroom, propagator/sdn-ap 0.6.2 84d50dca4efd, S1|39634|2026-03-23, fit: coverage 0 states
- XP, whiteroom, propagator/sdn-ap 0.6.2 84d50dca4efd, GN|43058|2026-01-03, fit: coverage 0 states
- AP, propagator/sdn-ap 0.6.2 84d50dca4efd, LS|LARETS|2025-10-25, fit: coverage 859/960 on the product's 180 s grid
- AP, propagator/sdn-ap 0.6.2 84d50dca4efd, S1|62261|2026-03-08, fit: coverage 0 states
- AP, propagator/sdn-ap 0.6.2 84d50dca4efd, S1|39634|2026-03-23, fit: coverage 0 states
- AP, propagator/sdn-ap 0.6.2 84d50dca4efd, GN|43058|2026-01-03, fit: coverage 0 states

Not run by registration:

- FFM 40×40: 15 windows at or above 8,400 km (no such arm in the harness)
- FFM 40×40, propagator/ffm 2.2.0 d635a3d57a2c: 15 windows at or above 8,400 km (no such arm in the harness)

## Not measured

- The sdn-ap epoch store's bytes per series (SPEC 14): no snapshot codec in the harness.
- Highly elliptical orbits and the next-file (centers' and operators' files) regimes: outside this registration (BENCHMARK.md).
- FFM 40×40 at or above 8,400 km: the harness defines no such arm.

Rows: `/opt/data/sdn-archive/operator-theory/sdn-ap-cost-benchmark` (the reruns under `builds/<run>`). Reproduce the table: `node experiments/sdn-ap-cost-benchmark/run.mjs --check`.
