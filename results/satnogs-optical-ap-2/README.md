# SatNOGS Optical angles to AP 0.5.1: registered result, second registration (the fixed angles lane)

Data credit: SatNOGS Optical contributors - https://optical.satnogs.org - CC BY-SA 4.0

Registration `experiments/satnogs-optical-ap-2/PLAN.md` (sha256 `c199333d6cd7db4f0631cdeb478a045227a347d77f0fff0d565ca0b8c2bda37d`). Build `70eb486e3358a2f47460c3af954b2da166131a156a1afd2c7117e881f5efe611` (modules 2df8f50c; artifact hashes in `registered.json`). Input class `observations/CC-BY-SA-4.0`. Results only: no captured or derived batch is published; comparator B is lettered source A (Space-Track), errors only. The first registration (`experiments/satnogs-optical-ap/PLAN.md`, sha256 `a1c9085c`, 0 of 42 AP cells) stands as recorded.

## Outcome

18 of 42 AP cells scored (6 of 14 arcs fitted through); 24 are failures under the stop rule (8 arcs: too-few-observations x1, no-converged-revolution-count x2, no-initial-orbit x3, arc-too-short:3.88 x1, arc-too-short:3.89 x1). 42 of 42 B cells scored, equal to the first registration's to the digit.

| Lead day | Cells with AP and B | AP median (km) | B median, same cells (km) | AP/B | AP 95th | B 95th | Reading |
|---|---|---|---|---|---|---|---|
| 1 | 6 | 2.40 | 0.42 | 5.67 | 16.98 | 1.03 | AP loses (H-lose) |
| 2 | 6 | 2.62 | 0.46 | 5.73 | 16.36 | 1.20 | AP loses (H-lose) |
| 3 | 6 | 2.80 | 0.52 | 5.37 | 15.72 | 1.19 | AP loses (H-lose) |

Descriptive only (at most 14 arcs on 6 objects; no significance test). Pooled samples are 60 s epochs at DORIS truth epochs, 3D km.

## Per object (pooled samples, 60 s at DORIS epochs; 3D km)

| Object | Arcs | AP cells scored | AP failures (by name) | AP day 1/2/3 median | AP day 1/2/3 95th | B day 1/2/3 median | B day 1/2/3 95th |
|---|---|---|---|---|---|---|---|
| Jason-3 (41240) | 2 | 0 | too-few-observations x1, no-converged-revolution-count x1 | - / - / - | - / - / - | 0.33 / 0.40 / 0.47 | 0.85 / 0.84 / 0.81 |
| Sentinel-3B (43437) | 1 | 0 | no-initial-orbit x1 | - / - / - | - / - / - | 2.34 / 4.56 / 6.84 | 4.18 / 6.34 / 8.62 |
| HY-2C (46469) | 1 | 3 | - | 7.87 / 6.68 / 5.54 | 14.33 / 12.87 / 11.38 | 0.54 / 0.66 / 0.87 | 1.03 / 1.36 / 1.64 |
| Sentinel-6A (46984) | 4 | 6 | no-converged-revolution-count x1, arc-too-short:3.88 x1 | 1.93 / 1.98 / 2.10 | 4.95 / 5.09 / 5.23 | 0.48 / 0.48 / 0.58 | 1.07 / 1.13 / 1.25 |
| SWOT (54754) | 2 | 3 | no-initial-orbit x1 | 15.21 / 14.77 / 14.25 | 19.61 / 19.26 / 18.88 | 0.43 / 0.48 / 0.42 | 1.29 / 1.35 / 1.20 |
| Sentinel-6B (66514) | 4 | 6 | no-initial-orbit x1, arc-too-short:3.89 x1 | 1.25 / 1.29 / 1.35 | 4.62 / 4.75 / 4.88 | 0.47 / 0.48 / 0.57 | 1.01 / 1.06 / 1.17 |
| All | 14 | 18 | 8 arcs | 2.40 / 2.62 / 2.80 | 16.98 / 16.36 / 15.72 | 0.48 / 0.51 / 0.59 | 1.97 / 4.19 / 6.44 |

The All row pools every scored cell of each arm (B over all 14 arcs); the Outcome table compares the arms on the same cells.

## Per arc

| Arc | AP | Stage reached (candidates converged/planned per stage) | WEIGHTED_RMS | Used / usable / rows | AP day 1/2/3 median (km) | B day 1/2/3 median (km) | AP day 1/2/3 95th (km) | B day 1/2/3 95th (km) |
|---|---|---|---|---|---|---|---|---|
| 41240-2026-09-12-2026-09-13 | failure:too-few-observations | 0 (initial_orbit refused) | - | - / 4 / 4 | - / - / - | 0.32 / 0.34 / 0.50 | - / - / - | 0.76 / 0.84 / 0.79 |
| 41240-2026-09-22-2026-09-23 | failure:no-converged-revolution-count | 1 (1: 1/1; converged WEIGHTED_RMS 4.041, over the limit 2) | - | - / 242 / 242 | - / - / - | 0.34 / 0.44 / 0.45 | - / - / - | 0.90 / 0.83 / 0.82 |
| 43437-2026-09-25-2026-09-26 | failure:no-initial-orbit | 0 (initial_orbit refused) | - | - / 252 / 354 | - / - / - | 2.34 / 4.56 / 6.84 | - / - / - | 4.18 / 6.34 / 8.62 |
| 46469-2026-09-23-2026-09-24 | fitted | 1 (1: 2/3) | 0.876 | 741 / 742 / 742 | 7.87 / 6.68 / 5.54 | 0.54 / 0.66 / 0.87 | 14.33 / 12.87 / 11.38 | 1.03 / 1.36 / 1.64 |
| 46984-2026-09-03-2026-09-06 | failure:no-converged-revolution-count | 1 (1: 3/3; converged WEIGHTED_RMS 4.172, 3.713, 4.741, over the limit 2) | - | - / 1055 / 1331 | - / - / - | 0.39 / 0.41 / 0.42 | - / - / - | 0.75 / 0.78 / 0.87 |
| 46984-2026-09-13-2026-09-16 | fitted | 4 (1: 1/1; 2: 1/3; 3: 1/1; 4: 1/1) | 1.228 | 1487 / 1491 / 1690 | 2.96 / 2.97 / 3.11 | 0.40 / 0.44 / 0.48 | 5.02 / 5.16 / 5.31 | 0.76 / 0.76 / 0.88 |
| 46984-2026-09-21-2026-09-26 | fitted | 6 (1: 1/1; 2: 1/3; 3: 1/1; 4: 1/1; 5: 1/1; 6: 1/1) | 1.142 | 3386 / 3392 / 3544 | 1.48 / 1.52 / 1.63 | 0.39 / 0.41 / 0.49 | 2.43 / 2.52 / 2.63 | 0.82 / 0.80 / 0.83 |
| 46984-2026-10-02-2026-10-03 | failure:arc-too-short:3.88 | 1 (1: plan refused) | - | - / 642 / 682 | - / - / - | 0.81 / 0.88 / 0.94 | - / - / - | 1.27 / 1.33 / 1.51 |
| 54754-2026-08-31-2026-09-01 | failure:no-initial-orbit | 0 (initial_orbit refused) | - | - / 793 / 793 | - / - / - | 0.42 / 0.47 / 0.43 | - / - / - | 1.24 / 1.31 / 1.22 |
| 54754-2026-09-21-2026-09-22 | fitted | 1 (1: 3/3) | 1.301 | 368 / 370 / 370 | 15.21 / 14.77 / 14.25 | 0.46 / 0.51 / 0.42 | 19.61 / 19.26 / 18.88 | 1.34 / 1.37 / 1.18 |
| 66514-2026-09-03-2026-09-06 | failure:no-initial-orbit | 0 (initial_orbit refused) | - | - / 1101 / 1623 | - / - / - | 0.39 / 0.40 / 0.42 | - / - / - | 0.75 / 0.79 / 0.88 |
| 66514-2026-09-13-2026-09-16 | fitted | 4 (1: 1/1; 2: 1/3; 3: 1/1; 4: 1/1) | 1.101 | 1586 / 1592 / 1782 | 2.59 / 2.69 / 2.77 | 0.40 / 0.44 / 0.50 | 4.70 / 4.83 / 4.96 | 0.76 / 0.81 / 0.88 |
| 66514-2026-09-21-2026-09-26 | fitted | 6 (1: 1/1; 2: 1/3; 3: 1/1; 4: 1/1; 5: 1/1; 6: 1/1) | 1.048 | 3149 / 3151 / 3360 | 0.96 / 1.01 / 1.10 | 0.39 / 0.42 / 0.49 | 1.31 / 1.38 / 1.47 | 0.81 / 0.79 / 0.84 |
| 66514-2026-10-02-2026-10-03 | failure:arc-too-short:3.89 | 1 (1: plan refused) | - | - / 655 / 781 | - / - / - | 0.73 / 0.80 / 0.86 | - / - / - | 1.21 / 1.26 / 1.43 |

WEIGHTED_RMS: the angles-only estimate's (analysis/estimation, RA/Dec residuals over their sigmas). Used: observations the estimate kept; usable: the observations satnogs-optical-source passed; rows: the arc's rows for the object.

## Failures by name

| Arc | Failure | Where | The module's message |
|---|---|---|---|
| 41240-2026-09-12-2026-09-13 | too-few-observations | initial_orbit on all the arc's tracks | too-few-observations: no crossing keeps 3 or more RA/Dec observations at distinct epochs |
| 41240-2026-09-22-2026-09-23 | no-converged-revolution-count | select at stage 1 (nights 1 of 2) | stage nights 1: no candidate kept its revolution count and converged with WEIGHTED_RMS at most 2 |
| 43437-2026-09-25-2026-09-26 | no-initial-orbit | initial_orbit on all the arc's tracks | no-initial-orbit: The far-sight iteration over 2 crossings: no bound orbit above the surface: 11 starts converged |
| 46984-2026-09-03-2026-09-06 | no-converged-revolution-count | select at stage 1 (nights 1,2 of 3) | stage nights 1,2: no candidate kept its revolution count and converged with WEIGHTED_RMS at most 2 |
| 46984-2026-10-02-2026-10-03 | arc-too-short:3.88 | plan at stage 1 | arc-too-short:3.88: the tracks span less than 24.000000 h |
| 54754-2026-08-31-2026-09-01 | no-initial-orbit | initial_orbit on all the arc's tracks | no-initial-orbit: The far-sight iteration over 2 crossings: no start converged: 0 starts converged |
| 66514-2026-09-03-2026-09-06 | no-initial-orbit | initial_orbit on all the arc's tracks | no-initial-orbit: Gooding's iteration over 2 crossings: no bound orbit above the surface: 6 starts converged |
| 66514-2026-10-02-2026-10-03 | arc-too-short:3.89 | plan at stage 1 | arc-too-short:3.89: the tracks span less than 24.000000 h |

Candidates refused inside their fit (a refused candidate sends nothing to select): 9; by code: reentry (propagator/ffm) x1, no-convergence:30 x8.

## Against the first registration

| Arc | First registration | This registration |
|---|---|---|
| 41240-2026-09-12-2026-09-13 | failure:initial-orbit-refused | failure:too-few-observations |
| 41240-2026-09-22-2026-09-23 | failure:initial-orbit-refused | failure:no-converged-revolution-count |
| 43437-2026-09-25-2026-09-26 | failure:arc-too-short:23.58 | failure:no-initial-orbit |
| 46469-2026-09-23-2026-09-24 | failure:no-converged-revolution-count | fitted |
| 46984-2026-09-03-2026-09-06 | failure:no-converged-revolution-count | failure:no-converged-revolution-count |
| 46984-2026-09-13-2026-09-16 | failure:initial-orbit-refused | fitted |
| 46984-2026-09-21-2026-09-26 | failure:no-converged-revolution-count | fitted |
| 46984-2026-10-02-2026-10-03 | failure:arc-too-short:3.88 | failure:arc-too-short:3.88 |
| 54754-2026-08-31-2026-09-01 | failure:no-converged-revolution-count | failure:no-initial-orbit |
| 54754-2026-09-21-2026-09-22 | failure:initial-orbit-refused | fitted |
| 66514-2026-09-03-2026-09-06 | failure:initial-orbit-refused | failure:no-initial-orbit |
| 66514-2026-09-13-2026-09-16 | failure:initial-orbit-refused | fitted |
| 66514-2026-09-21-2026-09-26 | failure:no-converged-revolution-count | fitted |
| 66514-2026-10-02-2026-10-03 | failure:arc-too-short:3.89 | failure:arc-too-short:3.89 |

- 41240-2026-09-12-2026-09-13: initial-orbit-refused (initial_orbit on the first track alone answered no-initial-orbit) in the first registration; now too-few-observations at initial_orbit on all the arc's tracks (too-few-observations: no crossing keeps 3 or more RA/Dec observations at distinct epochs).
- 41240-2026-09-22-2026-09-23: initial-orbit-refused (initial_orbit on the first track alone answered no-initial-orbit) in the first registration; now no-converged-revolution-count at select at stage 1 (nights 1 of 2) (stage nights 1: no candidate kept its revolution count and converged with WEIGHTED_RMS at most 2).
- 43437-2026-09-25-2026-09-26: arc-too-short:23.58 in the first registration; now no-initial-orbit at initial_orbit on all the arc's tracks (no-initial-orbit: The far-sight iteration over 2 crossings: no bound orbit above the surface: 11 starts converged).
- 46469-2026-09-23-2026-09-24: no-converged-revolution-count in the first registration; now fitted through 1 stage (WEIGHTED_RMS 0.876, 741 of 742 observations), AP day 1/2/3 median 7.87 / 6.68 / 5.54 km beside B's 0.54 / 0.66 / 0.87 km.
- 46984-2026-09-13-2026-09-16: initial-orbit-refused (initial_orbit on the first track alone answered no-initial-orbit) in the first registration; now fitted through 4 stages (WEIGHTED_RMS 1.228, 1487 of 1491 observations), AP day 1/2/3 median 2.96 / 2.97 / 3.11 km beside B's 0.40 / 0.44 / 0.48 km.
- 46984-2026-09-21-2026-09-26: no-converged-revolution-count in the first registration; now fitted through 6 stages (WEIGHTED_RMS 1.142, 3386 of 3392 observations), AP day 1/2/3 median 1.48 / 1.52 / 1.63 km beside B's 0.39 / 0.41 / 0.49 km.
- 54754-2026-08-31-2026-09-01: no-converged-revolution-count in the first registration; now no-initial-orbit at initial_orbit on all the arc's tracks (no-initial-orbit: The far-sight iteration over 2 crossings: no start converged: 0 starts converged).
- 54754-2026-09-21-2026-09-22: initial-orbit-refused (initial_orbit on the first track alone answered no-initial-orbit) in the first registration; now fitted through 1 stage (WEIGHTED_RMS 1.301, 368 of 370 observations), AP day 1/2/3 median 15.21 / 14.77 / 14.25 km beside B's 0.46 / 0.51 / 0.42 km.
- 66514-2026-09-03-2026-09-06: initial-orbit-refused (initial_orbit on the first track alone answered no-initial-orbit) in the first registration; now no-initial-orbit at initial_orbit on all the arc's tracks (no-initial-orbit: Gooding's iteration over 2 crossings: no bound orbit above the surface: 6 starts converged).
- 66514-2026-09-13-2026-09-16: initial-orbit-refused (initial_orbit on the first track alone answered no-initial-orbit) in the first registration; now fitted through 4 stages (WEIGHTED_RMS 1.101, 1586 of 1592 observations), AP day 1/2/3 median 2.59 / 2.69 / 2.77 km beside B's 0.40 / 0.44 / 0.50 km.
- 66514-2026-09-21-2026-09-26: no-converged-revolution-count in the first registration; now fitted through 6 stages (WEIGHTED_RMS 1.048, 3149 of 3151 observations), AP day 1/2/3 median 0.96 / 1.01 / 1.10 km beside B's 0.39 / 0.42 / 0.49 km.
- Unchanged by name: 46984-2026-09-03-2026-09-06 (no-converged-revolution-count, now at select at stage 1 (nights 1,2 of 3)); 46984-2026-10-02-2026-10-03 (arc-too-short:3.88, now at plan at stage 1); 66514-2026-10-02-2026-10-03 (arc-too-short:3.89, now at plan at stage 1).

## Station-nights

49 station-nights over the 14 arcs, 17298 rows; 9 unusable (every row refused by satnogs-optical-source), 1816 rows:

| Arc | Session | Station | Rows | Epoch convention | Why |
|---|---|---|---|---|---|
| 43437-2026-09-25-2026-09-26 | 2026-09-26 | 7 | 102 | exposure-start | exposure-start with no exposure time declared |
| 46984-2026-09-03-2026-09-06 | 2026-09-03 | 12 | 276 | frame-arrival | frame-arrival: no declared offset to mid-exposure |
| 46984-2026-09-13-2026-09-16 | 2026-09-13 | 7 | 199 | exposure-start | exposure-start with no exposure time declared |
| 46984-2026-09-21-2026-09-26 | 2026-09-23 | 7 | 152 | exposure-start | exposure-start with no exposure time declared |
| 46984-2026-10-02-2026-10-03 | 2026-10-03 | 7 | 40 | exposure-start | exposure-start with no exposure time declared |
| 66514-2026-09-03-2026-09-06 | 2026-09-03 | 12 | 522 | frame-arrival | frame-arrival: no declared offset to mid-exposure |
| 66514-2026-09-13-2026-09-16 | 2026-09-13 | 7 | 190 | exposure-start | exposure-start with no exposure time declared |
| 66514-2026-09-21-2026-09-26 | 2026-09-23 | 7 | 209 | exposure-start | exposure-start with no exposure time declared |
| 66514-2026-10-02-2026-10-03 | 2026-10-03 | 7 | 126 | exposure-start | exposure-start with no exposure time declared |

Every usable row is station 11 except station 4 (41240-2026-09-12-2026-09-13, 2026-09-12, 1 observation). No row was quarantined.

## Station-site finding (data, not a scored arm)

The capture's station-11 record changes its published site between sessions while the station's rows do not move. Every captured session's station-11 record:

| Record name | Site | Sessions in the 14 arcs | Other sessions |
|---|---|---|---|
| dwingeloo | 52.83 N 6.38 E | 09-13, 09-14, 09-15, 09-16, 09-21, 09-22, 09-23, 09-25, 09-26, 10-02 | 26 sessions |
| optical-bench1 | 36.97 N 22.15 E | 08-31 | 08-30, 09-11 |
| Drachten | 53.11 N 6.11 E | 09-01, 09-06, 09-24 | 10-17 |
| optical-bench2 | 36.97 N 22.15 E | 09-03, 09-04, 09-05 | 10-10, 10-12 |
| Satnogs-optical | 52.00 N 4.20 E | - | 11-03, 11-04 |

The registered run uses each session's record in its `$TDM` site and one record per station per arc in observation-od (the first usable night's); the arcs whose station-11 record for the fit is not Dwingeloo's: 46984-2026-09-03-2026-09-06 (optical-bench2, 2026-09-04); 54754-2026-08-31-2026-09-01 (optical-bench1, 2026-08-31); 66514-2026-09-03-2026-09-06 (optical-bench2, 2026-09-04).

In the scored run: 46984-2026-09-03-2026-09-06 failure:no-converged-revolution-count; 54754-2026-08-31-2026-09-01 failure:no-initial-orbit; 66514-2026-09-03-2026-09-06 failure:no-initial-orbit.

Part 2's diagnostic with Dwingeloo's site (52.83 N 6.38 E) for every station-11 session (modules-angles-only-od-real-tracks-2-20261104; diagnostic only, never a scored arm): 66514-2026-09-03-2026-09-06 fits through 3 stages to 0.510 km from DORIS at the arc's end (no-initial-orbit on the published sites), while 46984-2026-09-03-2026-09-06 and 54754-2026-08-31-2026-09-01 still answer no-initial-orbit at initial_orbit; at SWOT's DORIS state, the 2026-08-31 track's WEIGHTED_RMS is 9950.83 on the published site (optical-bench1, Greece) and 1.59 on Dwingeloo's, the 2026-09-01 track's 13071.07 (Drachten) and 1.41. No row is moved to another site in the scored run.

## Build note

Modules main 2df8f50c, read-only dists, hashed by `git show origin/main:<path>`: data-source/satnogs-optical-source 0.1.0, flows/angles-only-od 0.3.0, flows/observation-od 0.4.0, analysis/optical-astrometry 0.3.0, analysis/estimation 0.8.0, propagator/ffm 2.1.0, propagator/sdn-ap 0.5.1, propagator/sgp4 1.4.1, data-source/eop-parser 0.2.0, foundation/frames 0.2.0, analysis/gp-error-model 0.14.0. Changed since the first registration (82f83d9f): analysis/optical-astrometry 0.1.0 to 0.3.0 (`initial_orbit` on all the arc's tracks, crossings fitted by a cubic with 5-sigma rejection, the far-sight first guess for one-crossing nights, refusals by name), flows/angles-only-od 0.1.0 to 0.3.0 (no seeds; select reads executions; near-ties to the least eccentric), flows/observation-od 0.2.0 to 0.4.0 (sample rounds in parts under ffm's 10,000 cap), analysis/estimation 0.7.0 to 0.8.0 (no whole-pass edit before the first convergence; two-body energy on damped trials; unbound or sub-surface trials rejected). Unchanged: satnogs-optical-source 0.1.0, ffm 2.1.0, sdn-ap 0.5.1, sgp4 1.4.1, eop-parser 0.2.0, frames 0.2.0, gp-error-model 0.14.0. Every fit.json records the sha256 of each artifact it loaded; all equal the registered build.

Cited from the record, not results of this registration: part 1's local measurement (3 of 11 arcs through, ends 0.29 to 1.39 km from DORIS) and part 2's (6 of 11 through). The estimate's epoch is the initial orbit's (plan sets TARGET_EPOCH); the carry flies it to the fit's end. Comparator B, its inputs and its code are the first registration's; its 42 cells equal the first registration's to the digit.

## Caveats

- Identity: object labels are the network's SGP4 correlation, an association key; counts are a floor. Sentinel-6A and 6B fly in tandem.
- 14 arcs on 6 objects; descriptive only.
- Forward cycle (stated, not run): DORIS lags 3 to 4 weeks; a later cycle adds the 2026-10-10 to 11-03 nights (Sentinel-6A and 6B) under a new registration.
