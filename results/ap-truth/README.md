# AP against precise orbits

## Reading

AP is SGP4-XP with parts replaced: NRLMSISE-00 for the atmosphere, tesseral gravity, the zonal tail to J20. On 944 forecasts it was never tuned on, in low orbit with strong drag, its median error against precise orbits is 0.16, 0.60, 1.45 and 11.5 km at days 1, 2, 3 and 7, with drag from a 12 h full-force fit and elements from the last 17 h; with everything from a 24 h fit of its own it is 0.23, 0.88, 2.12 and 13.5 km. Every registered statement of that test passed.

What it means: in low orbit AP's gain is largest early, where XP's tesseral floor dominates. It is 69 % below the earlier recipe at day 1 and 21 % at day 2, from its own 24 h fit. By day 7 the error is the density forecast and gravity no longer matters: with FFM drag it is 2 % below the earlier recipe, and the 95th percentile does not move.

What it does not mean: every fit reads precise products, which are not real-time, so this says nothing about a service fed by anything else. The pool is 83 % Swarm. The two tests' windows were read for other arms before AP, though never for AP. In medium Earth orbit AP's gain over `X2` comes from fitting solar pressure, which `X2` held fixed, not from its gravity terms: on laser-ranging files with both free, AP and XP are level there (below). In the storm cut, day 7 is about 17 km for every arm in it.

## Tests

Registered before any AP fit of their windows: `experiments/operator-theory/AP.md` (Part T) at 2167a6cb19 and `AP2.md` at a6d33855e5. Build: modules 783133149a, wasm 0b021c575466, FORCES `MAXIMUM_TESSERAL_DEGREE` 31, `MAXIMUM_DEGREE` 20, NRLMSISE-00 on as-issued weather, the module's own priors. Truth, grid, weather and coverage rules are those of `results/xp2-fit-design` and `results/xp-atmosphere-merit`. Tables: `table-t.md` and `table-t2.md`; the same as JSON beside them. Medians over forecasts of the day's 3D RMS, km, 95th in brackets.

| Orbit | Satellites | Fit | Forecasts | Day 1 | Day 2 | Day 3 | Day 7 |
|---|---|---|---:|---:|---:|---:|---:|
| Low, strong drag, 2025 | Swarm A, B, C; GRACE-FO 1, 2 | Drag from a 12 h FFM fit, elements from the last 17 h | 944 | 0.162 (0.54) | 0.598 (2.96) | 1.454 (7.85) | 11.48 (51.8) |
| Low, strong drag, 2025 | the same | Everything from the last 24 h | 944 | 0.226 (0.74) | 0.875 (3.43) | 2.122 (8.40) | 13.53 (51.3) |
| Low, strong drag, 2026 | the same | Everything from the last 24 h | 750 | 0.235 (0.77) | 0.881 (3.45) | 2.041 (8.39) | 12.01 (56.6) |
| Near 700 km, 2026 | Sentinel-1A, 1C | Everything from the last 72 h | 257 to 259 | 0.192 (1.11) | 0.502 (2.40) | 0.906 (4.45) | 3.026 (12.8) |
| Near 700 km, 2026 | the same | Everything from the last 24 h | 274 to 276 | 0.126 (0.72) | 0.370 (2.33) | 0.728 (3.14) | 2.087 (12.0) |
| Medium Earth orbit, 2026 | GPS, GLONASS, Galileo (5) | Everything from the last 72 h | 746 to 749 | 0.038 (0.07) | 0.054 (0.10) | 0.070 (0.14) | 0.143 (0.45) |

## Verdicts

| Statement | Result |
|---|---|
| AP's 24 h fit beats the public set, rules 1, 2, 3 at days 1, 2, 3, 7, on the 944 | PASS |
| AP's 24 h fit beats the earlier recipe at days 1 and 2 | PASS |
| AP with FFM drag beats AP's 24 h fit at days 1 and 2 | PASS |
| AP's 72 h fit beats the public set near 700 km, rules 1, 2, 3 | FAIL: rule 2 at days 1 and 2, the 95th percentile's upper bound +15 % and +40 % against +10 %; rule 1 holds at every lead |
| AP's 72 h fit beats the public set in medium Earth orbit, rules 1, 2, 3 | PASS |

Near 700 km the 24 h fit is closer than the registered 72 h fit at every lead, and meets every rule there, but it was not the registered arm, so that is report only.

## Laser-ranging orbits

AP.md's Parts L and H: 19,399 pairs on the 54 days of `experiments/operator-theory/CHEAPER.md`, 2026-03-01 to 05-03, AP and XP from the same build with the same priors, so both fit solar pressure. The reference is the first 3 h of a newer prediction of the same object from the same center: the center's later solution, not independent truth. Weather is observed history. Table: `table-l.md`. Medians over pairs, km, 95th in brackets.

| Group | Fit | Arm | 72 h | 120 h | 168 h |
|---|---|---|---:|---:|---:|
| Low, 17 satellites | 48 h | AP | 0.086 (1.93) | 0.224 (5.66) | 0.484 (12.3) |
| Low | 48 h | XP | 0.619 (2.52) | 0.865 (6.68) | 1.253 (16.5) |
| Low | 72 h | AP | 0.072 (2.23) | 0.177 (5.32) | 0.370 (11.8) |
| Low | 72 h | XP | 0.477 (2.67) | 0.682 (7.31) | 0.997 (15.2) |
| Navigation, 28 satellites | 72 h | AP | 0.037 (0.08) | 0.079 (0.18) | 0.143 (0.40) |
| Navigation | 72 h | XP | 0.038 (0.08) | 0.080 (0.20) | 0.145 (0.42) |
| Geodetic, 4 satellites, report only | 72 h | AP | 0.030 (0.06) | 0.040 (0.08) | 0.064 (0.13) |
| Geodetic | 72 h | XP | 0.057 (0.17) | 0.078 (0.20) | 0.119 (0.24) |

| Statement | Result |
|---|---|
| Part L: AP beats XP at 48 h fits on low orbits, at 72 h and 168 h | PASS: AP less XP -0.430 km [-0.626, -0.370] and -0.685 km [-0.927, -0.519] |
| Part H: AP does not lose to XP at 72 h fits on navigation satellites | PASS: top of the interval 0.001 km of 0.005 at 72 h, 0.002 km of 0.020 at 168 h |

So above the drag regime AP adds nothing on navigation satellites and costs nothing there. On the geodetic group it looks better, too few objects to claim. Fit and flight per file in that run under load: AP 0.59 and 0.20 s, XP 0.18 and 0.06 s on low orbits. FFM on the same pairs is in `results/operator-theory/cheaper`.

## Corrections

- The verdict script first counted a window with under 90 % of its arc's states as a failure. The registered rule says it leaves the cell and is counted, so I corrected the script before these tables were committed. The two tests' failures are then 0. Near 700 km this moved the first reading of the median interval at day 7 from holding 0 to below 0; the statement fails on rule 2 either way.
- `X2` here is the older pinned build, which holds AGOM at 0.01 m^2/kg.
- `cycle-ap.sh laser` exited with a syntax error at its last line, after its scoring workers had started, because the script was edited while bash was running it: bash reads a running script by byte offset. The added lines were for another part. The workers ran on and finished with empty logs, with all 19,399 pairs.
