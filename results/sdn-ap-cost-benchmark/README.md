# The cost of each theory on the current builds

Registered in `experiments/sdn-ap-cost-benchmark/BENCHMARK.md` before any run. One machine: Mac Studio (Mac15,14), Apple M3 Ultra, 28 cores (20 performance, 8 efficiency), 256 GiB, macOS 26.3.1, Node.js v25.4.0; one process at a time; every module wasi-sequential on the main thread. Step 300 s everywhere: the fit reads a 48 h arc thinned to 300 s (at most 577 states); the flight writes 2016 states, every 300 s for 7 days. 32 registered windows over 8 regimes of the comparison explorer's precise-orbit rows: Low orbit, laser spheres; Low orbit, altimetry; Laser geodetic; Geostationary; Inclined geosynchronous; Strong drag, 2026; Near 700 km; Medium Earth orbit.

## Builds

| Module | Version | SHA-256 of the dist | Commit |
| --- | --- | --- | --- |
| propagator/sdn-ap | 0.5.2 | `74388314396a8f8c4bc962b63566b01ee8a99e1d8a295e8233fac36d5683500d` | 890c8655f2 |
| propagator/sgp4-xp | 0.2.2 | `1f8aa4c7e3c01a9eb6c499a6730be827afee2b969f535410af32c74237f17877` | 890c8655f2 |
| propagator/sgp4 | 1.4.1 | `2fe246b716c78a4b947cd95e70e126b7a738cbbb9775e5196f07b1fe551f4643` | 890c8655f2 |
| propagator/ffm | 2.2.0 | `d635a3d57a2c9ca91d111f74aad38b9d748d6c16199b22c6922af21c92fe2153` | 890c8655f2 |
| analysis/estimation | 0.7.0 | `7a555ca5b3ed0b021dd5b7986bd73dd8f8dc5125a2aa7943e3b3e983320d6bcd` | 9a05d899b9 |
| analysis/gp-error-model | 0.11.0 | `8e13eddbd5ccc3e0ee121f3b851e8314e426715cf5517823aa8d925566ef0e19` | fbda894501 |

Each wasm by `git show` at its commit, SHA-256 checked before it is loaded. propagator/sgp4-xp is the Space Force library's module, timed as a black box through its published methods; nothing of it is read. Whiteroom XP is propagator/sdn-ap at the theory's own forces.

## Per object-day, median over the windows (10th to 90th percentile, windows)

| Arm | Fit CPU s | Fit wall s | Flight CPU s | Flight wall s |
| --- | --- | --- | --- | --- |
| SGP4 | 0.0284 (0.02327 to 0.3817, n 25) | 0.02482 (0.0231 to 0.3814, n 25) | 0.0008864 (0.0005559 to 0.00239, n 25) | 0.0006133 (0.000545 to 0.0008345, n 25) |
| XP, whiteroom | 0.05375 (0.03682 to 0.06603, n 28) | 0.05219 (0.03616 to 0.06487, n 28) | 0.00802 (0.006138 to 0.00918, n 28) | 0.007557 (0.006052 to 0.008505, n 28) |
| XP, Space Force | 0.4632 (0.2789 to 1.053, n 28) | 0.4634 (0.2788 to 1.05, n 28) | 0.008246 (0.004916 to 0.01248, n 28) | 0.007299 (0.003573 to 0.01198, n 28) |
| AP | 0.5024 (0.06903 to 1.073, n 28) | 0.4977 (0.06907 to 1.073, n 28) | 0.1108 (0.02 to 0.1377, n 28) | 0.1108 (0.02002 to 0.1379, n 28) |
| FFM 20×20 | 0.3864 (0.3626 to 1.528, n 28) | 0.3168 (0.3018 to 1.396, n 28) | 0.1476 (0.1165 to 0.5298, n 28) | 0.1684 (0.114 to 0.5556, n 28) |
| FFM 40×40 | 2.117 (1.447 to 2.834, n 13) | 2.043 (1.373 to 2.712, n 13) | 0.9671 (0.7664 to 1.043, n 13) | 0.9612 (0.7582 to 1.031, n 13) |

A fit per object-day is the 48 h fit's time divided by 2; a flight per object-day the 7-day flight's divided by 7. CPU: user plus system time of the process across the call; wall: elapsed, on a shared machine (the load in table.json). One warm-up call per arm and phase is not counted. sdn-ap runs with its thread pool bounded to one; every other module is sequential. The laser products are on 120 s and 180 s grids: the harness thins them to every round(300 / step)-th state, 360 s apart (481 states); every other arc is 577 states at 300 s.

## One call, seconds, median (10th to 90th percentile)

| Arm | Fit, 48 h arc | Flight, 7 days |
| --- | --- | --- |
| SGP4 | 0.0568 (0.04654 to 0.7634, n 25) CPU, 0.04963 (0.0462 to 0.7628, n 25) wall | 0.006205 (0.003891 to 0.01673, n 25) CPU, 0.004293 (0.003815 to 0.005841, n 25) wall |
| XP, whiteroom | 0.1075 (0.07363 to 0.1321, n 28) CPU, 0.1044 (0.07231 to 0.1297, n 28) wall | 0.05614 (0.04296 to 0.06426, n 28) CPU, 0.0529 (0.04236 to 0.05953, n 28) wall |
| XP, Space Force | 0.9264 (0.5578 to 2.107, n 28) CPU, 0.9268 (0.5577 to 2.101, n 28) wall | 0.05772 (0.03441 to 0.08737, n 28) CPU, 0.05109 (0.02501 to 0.08388, n 28) wall |
| AP | 1.005 (0.1381 to 2.145, n 28) CPU, 0.9955 (0.1381 to 2.146, n 28) wall | 0.7758 (0.14 to 0.9641, n 28) CPU, 0.7757 (0.1401 to 0.9652, n 28) wall |
| FFM 20×20 | 0.7727 (0.7251 to 3.056, n 28) CPU, 0.6336 (0.6035 to 2.791, n 28) wall | 1.034 (0.8158 to 3.709, n 28) CPU, 1.179 (0.7981 to 3.889, n 28) wall |
| FFM 40×40 | 4.234 (2.895 to 5.667, n 13) CPU, 4.085 (2.746 to 5.423, n 13) wall | 6.769 (5.364 to 7.299, n 13) CPU, 6.728 (5.308 to 7.214, n 13) wall |

## Memory

| Arm | Peak linear memory, pages (MiB) | maxRSS, fits (MiB) | maxRSS, flights (MiB) | Module bytes | Bytes per object, median (10th to 90th) |
| --- | --- | --- | --- | --- | --- |
| SGP4 | 1024 (64) | 411.5 | 417.9 | gp-error-model 2,230,296; sgp4 1,295,483 | 640 (632 to 640): the $OMM the fitter emits |
| XP, whiteroom | 1069 (66.81) | 228.5 | 316.4 | sdn-ap 936,984 | 2640 (2640 to 2656): the $OCM |
| XP, Space Force | 256 (16) | 256.7 | 305.9 | sgp4-xp 1,030,209 | 1800 (1792 to 1816): the $OCM |
| AP | 1155 (72.19) | 240 | 336.3 | sdn-ap 936,984 | 4232 (4224 to 4296): the $OCM |
| FFM 20×20 | 1877 (117.3) | 1117 | 1101 | estimation 769,257; ffm 2,752,551 | 234 (232 to 236): the fit's epoch, state and parameters as UTF-8 JSON (no FlatBuffer product in the harness) |
| FFM 40×40 | 1879 (117.4) | 1128 | 1108 | estimation 769,257; ffm 2,752,551 | 234 (216 to 236): the fit's epoch, state and parameters as UTF-8 JSON (no FlatBuffer product in the harness) |

Peak linear memory: the largest WebAssembly.Memory the arm's process held, read after each call; every module runs one instance for the arm's whole phase. maxRSS: process.resourceUsage() of the arm's own process; the FFM arms' figure carries the harness's planetary kernel and Earth-orientation frames beside the two modules. The sdn-ap epoch store (SPEC 14) is not measured here: the harness has no snapshot codec for it.

## By regime, CPU seconds per object-day, median

| Regime | SGP4 fit | XP, whiteroom fit | XP, Space Force fit | AP fit | FFM 20×20 fit | FFM 40×40 fit | SGP4 flight | XP, whiteroom flight | XP, Space Force flight | AP flight | FFM 20×20 flight | FFM 40×40 flight |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Low orbit, laser spheres | 0.02634 | 0.04756 | 0.8115 | 0.5024 | 1.126 | 2.117 | 0.002917 | 0.007802 | 0.01413 | 0.1175 | 0.5246 | 1.043 |
| Low orbit, altimetry | 0.0274 | 0.05894 | 0.9683 | 0.6312 | 0.9089 | 1.661 | 0.001291 | 0.008202 | 0.01208 | 0.1151 | 0.4665 | 0.9303 |
| Laser geodetic | 0.03167 | 0.03636 | 0.2236 | 0.3174 | 0.3606 | — | 0.0006827 | 0.006462 | 0.004916 | 0.08423 | 0.1425 | — |
| Geostationary | 0.3817 | 0.05911 | 0.3556 | 0.06591 | 0.3775 | — | 0.0008076 | 0.008969 | 0.005835 | 0.01978 | 0.1195 | — |
| Inclined geosynchronous | 0.1321 | 0.05375 | 0.4134 | 0.0824 | 0.3739 | — | 0.0007856 | 0.008662 | 0.007774 | 0.02073 | 0.1158 | — |
| Strong drag, 2026 | 0.02381 | 0.054 | 0.787 | 0.6223 | 1.491 | 2.635 | 0.00057 | 0.007962 | 0.01051 | 0.1251 | 0.4978 | 0.9721 |
| Near 700 km | 0.02327 | 0.05955 | 0.4425 | 0.6444 | 0.7913 | 1.447 | 0.0005556 | 0.00754 | 0.002803 | 0.1194 | 0.3884 | 0.7664 |
| Medium Earth orbit | 0.0257 | 0.04313 | 0.4348 | 1.155 | 0.3819 | — | 0.0005896 | 0.006138 | 0.005116 | 0.1592 | 0.1214 | — |

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

Not run by registration:

- FFM 40×40: 15 windows at or above 8,400 km (no such arm in the harness)

## Not measured

- The sdn-ap epoch store's bytes per series (SPEC 14): no snapshot codec in the harness.
- Highly elliptical orbits and the next-file (centers' and operators' files) regimes: outside this registration (BENCHMARK.md).
- FFM 40×40 at or above 8,400 km: the harness defines no such arm.

Rows: `/opt/data/sdn-archive/operator-theory/sdn-ap-cost-benchmark`. Reproduce the table: `node experiments/sdn-ap-cost-benchmark/run.mjs --check`.
