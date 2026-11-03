# AP against precise orbits

## Reading

AP is SGP4-XP with parts replaced: NRLMSISE-00 for the atmosphere, tesseral gravity, the zonal tail to J20, and since version 0.4.0 every first-order tesseral term to degree 12, near-resonant terms and states carried to TEME of their date. Against precise orbits, on forecasts it was never tuned on, its median error at days 1, 2, 3 and 7 is 0.13, 0.60, 1.44 and 11.7 km in low orbit with strong drag, and 0.022, 0.028, 0.038 and 0.093 km in medium Earth orbit.

What it means: in low orbit AP's gain is largest early. Against AP 0.3.0, 0.4.0 is 21.5 % closer at day 1, 2.2 % at day 2, and level after that, because by then the error is the density forecast. In medium Earth orbit 0.4.0 is 43 % closer at days 1 to 3 and 34 % at day 7, so the gravity terms and the frame now pay there, where 0.3.0 added nothing over XP with solar pressure free.

What it does not mean: every fit reads precise products, which are not real-time, so this says nothing about a service fed by anything else. The strong-drag pool is 83 % Swarm. The windows were read for AP 0.3.0 and for other arms before 0.4.0, though never for 0.4.0. Near 700 km its 72 h fit still fails its registered statement, on the 95th percentile. In the storm cut, day 7 is about 17 km for every arm in it.

Everything below `## AP 0.4.0` is AP 0.3.0's record: build 783133149a, wasm 0b021c575466.

## AP 0.4.0

`experiments/operator-theory/AP4.md`, registered at 2e59d1d before any fit of this build on these data: modules 148f3b9f20, wasm 715ef2fee512, `FORCES` 31, 20, NRLMSISE-00 on the same weather, the module's own priors. Each statement is this build against the same arm of 0.3.0, by pair, or against the public set where said. Tables: `table-t-040.md`, `table-t2-040.md`, `table-l-040.md`, the same as JSON beside them.

An exploration found what to replace: the spectrum of AP against FFM's own trajectory (read days, one file each of a few CPF targets, not a test) showed radial at 2 cycles per day, 26 to 47 m on every low satellite; in-track at n plus or minus whole cycles per day; lines at the integer nearest n; and cross-track once per orbit at about one microradian on every orbit from LEO to GPS. The first three are Kaula terms AP had left out. The last is the theory's mean elements read as TEME of date, though they hold the axes of the epoch.

Against precise orbits, median km, 95th in brackets:

| Orbit | Satellites | Fit | Build | Forecasts | Day 1 | Day 2 | Day 3 | Day 7 |
|---|---|---|---|---:|---:|---:|---:|---:|
| Low, strong drag, 2025 | Swarm A, B, C; GRACE-FO 1, 2 | Drag from a 12 h FFM fit, elements from the last 17 h | 0.4.0 | 944 | 0.126 (0.53) | 0.596 (2.94) | 1.441 (7.84) | 11.65 (52.3) |
| | | | 0.3.0 | | 0.162 (0.54) | 0.598 (2.96) | 1.454 (7.85) | 11.48 (51.8) |
| Low, strong drag, 2025 | the same | Everything from the last 24 h | 0.4.0 | 944 | 0.196 (0.70) | 0.880 (3.29) | 2.132 (8.58) | 13.10 (50.9) |
| | | | 0.3.0 | | 0.226 (0.74) | 0.875 (3.43) | 2.122 (8.40) | 13.53 (51.3) |
| Near 700 km, 2026 | Sentinel-1A, 1C | Everything from the last 72 h | 0.4.0 | 257 to 259 | 0.185 (1.11) | 0.491 (2.40) | 0.910 (4.47) | 3.135 (12.8) |
| | | | 0.3.0 | | 0.192 (1.11) | 0.502 (2.40) | 0.906 (4.45) | 3.026 (12.8) |
| Near 700 km, 2026 | the same | Everything from the last 24 h, report only | 0.4.0 | 274 to 276 | 0.105 (0.72) | 0.368 (2.34) | 0.749 (3.12) | 2.044 (12.2) |
| Medium Earth orbit, 2026 | GPS, GLONASS, Galileo (5) | Everything from the last 72 h | 0.4.0 | 746 to 749 | 0.022 (0.04) | 0.028 (0.07) | 0.038 (0.12) | 0.093 (0.41) |
| | | | 0.3.0 | | 0.038 (0.07) | 0.054 (0.10) | 0.070 (0.14) | 0.143 (0.45) |

On CHEAPER.md's 54 days, against each center's next prediction, not independent truth, hindsight weather, 19,399 pairs, median km:

| Group | Fit | Build | 24 h | 72 h | 120 h | 168 h |
|---|---|---|---:|---:|---:|---:|
| Low, 17 satellites | 48 h | 0.4.0 | 0.018 | 0.060 | 0.213 | 0.484 |
| | | 0.3.0 | 0.056 | 0.086 | 0.224 | 0.484 |
| Navigation, 28 satellites | 72 h | 0.4.0 | 0.020 | 0.025 | 0.056 | 0.104 |
| | | 0.3.0 | 0.027 | 0.037 | 0.079 | 0.143 |
| Geodetic, 4 satellites, report only | 72 h | 0.4.0 | 0.013 | 0.014 | 0.018 | 0.023 |
| | | 0.3.0 | 0.026 | 0.030 | 0.040 | 0.064 |

| Statement | Result |
|---|---|
| 1. `APRa12` at 0.4.0 beats 0.3.0: rule 1 at day 1; rules 2 and 3 at days 1, 2, 3, 7 | PASS: -21.5 % [-26.6, -15.6] at day 1 |
| 2. `AP24` at 0.4.0 beats 0.3.0: the same | PASS: -18.8 % [-24.1, -13.5] at day 1 |
| Near 700 km, `AP72` at 0.4.0 beats the public set: rules 1, 2, 3 at days 1, 2, 3, 7 | FAIL: rule 2 at days 1 and 2, the 95th percentile's upper bound +17.4 % and +39.5 % against +10 %; rule 1 holds at every lead |
| Medium Earth orbit, `AP72` at 0.4.0 beats 0.3.0: rule 1 at days 1 and 3; rules 2 and 3 at days 1, 2, 3, 7 | PASS: -42.7 % [-45.2, -41.5], -42.8 % [-45.3, -40.1] |
| Laser-ranging, low, 48 h fits, at 24 h and 72 h | PASS: -0.031 km [-0.036, -0.029], -0.021 km [-0.025, -0.014] |
| Laser-ranging, navigation, 72 h fits, at 72 h and 168 h | PASS: -0.011 km [-0.014, -0.009], -0.038 km [-0.048, -0.028] |

So the site moved to 0.4.0, as AP4.md set out. The near-700 km tail did not move with these terms, so they are not what limits it. On those 54 days, median fit RMS against each file: low at 48 h fits 54.1 m to 18.6 m, navigation at 72 h 30.5 m to 21.3 m, geodetic at 72 h 28.2 m to 12.3 m. Cost per file on low orbits at 48 h fits: fit 1.04 s and flight 0.23 s, against 0.58 s and 0.20 s for 0.3.0; the two ran under different loads, so read that as a rough ratio. On Starlink, Part S, report only, 0.4.0 is level with 0.3.0 at every lead (-0.004 km [-0.013, 0.006] at 24 h); see `## Starlink`.

The first build of these terms was worse above 8,400 km. It counted the half-day resonance class's terms twice, once in the rates and once at output time, and exploratory forward errors on read days showed it: fit RMS 30 m to 70 to 110 m on GLONASS and Etalon. That was fixed before this build was frozen, and `propagator/sdn-ap/test/ap-terms.e2e.mjs` now holds a fixture at 19,100 km that fails if it returns (74.8 m against the bound of 25 m).

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

## Starlink

AP.md's Part S: CONFIRM.md's satellites 401 to 800, every capture from 2026-10-30 to the 11-03 05:00 capture, 18,823 pairs. 16 h fits on each file's `.ocm` states, as-issued weather. The reference is SpaceX's next file for the same satellite: the operator's later solution, not independent truth. Lead counts from the older file's start, so 24 h is 8 h past the fit. Table: `table-s.md`; 0.4.0's report-only rows `table-s-040.md`. Medians over pairs, km, 95th in brackets.

| Arm | 24 h | 36 h | 48 h | 72 h, report only |
|---|---:|---:|---:|---:|
| AP 0.3.0 (`A-AP`) | 1.71 (11.7) | 3.53 (29.7) | 8.24 (51.4) | 17.8 (121) |
| AP 0.4.0 (`A-APn`), report only | 1.70 (11.7) | 3.50 (29.5) | 8.25 (50.6) | 17.7 (120) |
| XP, public-set recipe (`X0@16`) | 2.40 (13.6) | 5.33 (34.8) | 10.96 (62.7) | 22.4 (154) |
| FFM, NRLMSISE-00 (`F-NRLMSISE00@16`) | 1.75 (11.7) | 3.63 (29.9) | 8.52 (51.4) | 17.5 (124) |

| Statement | Result |
|---|---|
| Part S: `A-AP` less `X0@16` below zero at 24 h and 48 h | PASS: -0.455 km [-0.603, -0.324] at 24 h, -0.969 km [-1.624, -0.064] at 48 h |

The 48 h pass is thin. It rests on three start days, 2026-10-30 to 11-01. Its upper bound, -0.064 km, is smaller than the spread between resamplings: `ap4-verdict.mjs` draws the same pairs with its own seed and puts the same comparison at [-1.599, +0.087]. Read it as AP ahead of XP on Starlink at 24 h, and probably at 48 h. AP and FFM are level at every lead: what is left is SpaceX's thrust, which no arm knows. One operator, one storm stretch.

## AP fitted to FFM's forecast

`experiments/operator-theory/AP3.md`, registered at ec1b796 before any fit of this kind on these days. A node fits the cheaper FFM to the operator's 48 h and carries it to 180 h; AP is fitted to those states and the consumer flies AP. The control is AP fitted to the operator's own 72 h. Same 19,399 pairs, reference and weather as above. Table: `table-apf.md`. Medians over pairs, km.

| Group | Arm | 24 h | 72 h | 120 h | 168 h |
|---|---|---:|---:|---:|---:|
| Low, 17 satellites | AP on FFM's forecast | 0.059 | 0.072 | 0.108 | 0.189 |
| Low | AP on the operator's 72 h | 0.058 | 0.072 | 0.177 | 0.370 |
| Low | `F-M40`, the FFM it follows | 0.007 | 0.035 | 0.088 | 0.173 |
| Navigation, 28 satellites | AP on FFM's forecast | 0.047 | 0.033 | 0.058 | 0.114 |
| Navigation | AP on the operator's 72 h | 0.027 | 0.037 | 0.079 | 0.143 |
| Navigation | `F-H20`, the FFM it follows | 0.001 | 0.011 | 0.051 | 0.119 |

| Statement | Result |
|---|---|
| Low: beats AP on the operator's 72 h at 120 h and 168 h | FAIL: paired median 0.001 km [-0.044, 0.012] at 120 h, -0.015 km [-0.145, 0.009] at 168 h |
| Navigation: the same | PASS: -0.022 km [-0.031, -0.014] at 120 h, -0.032 km [-0.045, -0.022] at 168 h |

The low-orbit medians above make this look like a win, and the registered paired test says it is not one. The pool splits by satellite: at 168 h it is closer on 75 to 94 % of pairs for HY-2B, C, D, Sentinel-6B, Westpac and BeaconC, about even on Ajisai, Starlette, Larets and CryoSat-2, and worse on LARES and PAZ. That split is report only and chooses nothing. On navigation it gives up 0.020 km at 24 h for that gain: the fit spreads AP's residual over the week, so it only suits a set flown for days.

Cost per file, medians under load: FFM to 180 h 6.8 s on low orbits and 1.0 s on navigation, AP's fit to it 1.7 and 0.8 s, on top of FFM's own fit.

## Corrections

- The verdict script first counted a window with under 90 % of its arc's states as a failure. The registered rule says it leaves the cell and is counted, so I corrected the script before these tables were committed. The two tests' failures are then 0. Near 700 km this moved the first reading of the median interval at day 7 from holding 0 to below 0; the statement fails on rule 2 either way.
- `X2` here is the older pinned build, which holds AGOM at 0.01 m^2/kg.
- `cycle-ap.sh laser` exited with a syntax error at its last line, after its scoring workers had started, because the script was edited while bash was running it: bash reads a running script by byte offset. The added lines were for another part. The workers ran on and finished with empty logs, with all 19,399 pairs.
- `ap4-verdict.mjs`'s JSON changed shape after AP4.md's registration, so the site can read it as it read AP.md's: `arms` at this build, `arms030`, `siteArm`, `storm`. No arm, window, rule or statistic changed, and the statements read the same before and after.
