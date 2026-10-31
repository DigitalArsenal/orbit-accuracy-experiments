# XM6: does a shorter FFM arc, or a free AGOM, move F2's tail? An exploratory look on spent windows

Written 2026-10-31 (UTC) before any cell, under task `experiments-ffm-agom-prior-leo-20261031`. **Exploratory: every window here was scored in XM2, XM3 and XM5, so every result is a lead for a registration, never a pass.** XM6 changes F2's fit in one way per arm, on XM3's windows, weather as issued, against XM3's stored F2 and P. It moves no verdict and is never written as "beats SGP4". This file and `config.json` are fixed before any cell; a change after that is labeled.

## Why

The owner, 2026-10-30, verbatim: "I want our new atmospheric model to beat SGP4, which it should with truth / owner operator data."

- XM5 (experiments-ffm-tail-cause-20261031): observed daily weather closes F2's tail only at day 3. The tail left at days 1 and 2 sits in arcs that span a storm, and M barely changes those arcs' inputs.
- The critic of XP2 (a lead, n 30, 27 clusters): a 24 h FFM fit against F2 reads -60.8, -45.5, -40.2, -10.9 % at days 1, 2, 3, 7, and a 36 h fit -54.1, -48.8, -45.2, -33.3 %. Its RFa12 takes drag from a 12 h FFM fit, so FFM's own 12 h forecast is measured here too.
- SRP (experiments-ffm-srp-seed-high-beta-20261031): on XM3's 72 h arcs, F2's AGOM sits 2.46-3.13 times its seed on Swarm, 1.85-1.86 on GRACE-FO and 1.73-1.83 on Sentinel-1, with a 30 % prior. C2's 24 h fits of the same objects sit at 1.02-1.08.

## Disclosure

These windows, F2's and P's rows and the worst-window list are published and were read. So were the critic's cells and SRP's fitted AGOM. XM5's table and its exploratory section were read before this plan. The arc lengths and the prior are chosen from those leads. A cell here cannot confirm them: it can only say which one deserves a registration on unseen windows.

## Arms

Each arm is F2 with the one change named. Weather: XM3's condition O rows and driver rule, unchanged for every arm, in the fit and the forecast.

| Arm | Arc | B prior | AGOM prior |
| --- | --- | --- | --- |
| A12 | 12 h | 30 % of seed | 30 % of seed |
| A24 | 24 h | 30 % | 30 % |
| A36 | 36 h | 30 % | 30 % |
| W72 | 72 h | 30 % | 1000 % of seed (SRP's wide form) |
| F2O | 72 h | 30 % | 30 %: XM3's stored F2, read only |
| P | the public set under SGP4: XM3's stored P, read only | | |

The arc is the truth's states in [cutoff - L, cutoff], thinned to 300 s as XM3 thins them (144, 288, 432 and 864 states). An arc holding less than 90 % of its states is not fitted: that arm leaves that window, counted, and it is not a failure. A fit not ending CONVERGED is a failure, as in XM3. Seeds, forces, integrator, tolerances, measurement sigma, Earth orientation, kernel, grid, bins, e and scorer are XM3's.

**The proof before any arm.** F2 rerun through this experiment's code at 72 h and 30 % on three windows (XM3's check windows) must equal XM3's stored rows byte for byte. `--launch` refuses without that receipt.

## Windows

XM3's: every window with an F2 attempt under O. Group P, 750, run first; group S1, 270, included while the run stays under about 5.5 h on 8 workers. Cutoffs 2026-01-02..05-31.

## What is read and reported

Per group, arm and lead (1, 2, 3, 7), XM3's cluster bootstrap (orbit group x ISO week, 10,000 draws, percentile 95 % intervals, code copied unchanged, seeds labeled `XM6|<group>|<arm>/<ref>|<lead>|orbit` and with `|noW04`):

1. Against P: the median change and interval, the p95 ratio and upper bound, failures.
2. Against F2O: the same.
3. Both with the cutoffs of 2026-W04 out.
4. **Whether the post-storm tail moves:** W04's count in each arm's worst 5 % (F2O's: 19, 23, 22, 16 of 38 at days 1, 2, 3, 7) and storm-arc count, using XM5's class on the 72 h span (24, 25, 21, 16); how many of F2O's worst stay; and the median e at the post-storm cutoffs 2026-01-22..01-26 (25 windows in P) beside F2O's and P's.
5. **AGOM and B against seed:** median fitted value over seed and the count at the bound 0, per arm and per orbit group, with F2O's beside.

## What each outcome means (written before any cell)

"Holds" means the interval against F2O lies wholly below 0. "Closes" means the p95 upper bound against P is below 1.10. All in group P.

| Outcome for an arc arm (A12, A24, A36) | Reading | Where it points |
| --- | --- | --- |
| Holds and closes at all of days 1-3 | The 72 h arc is a fault in F2's design, at the median and the tail | The lead to register on unseen windows, this arc first |
| Holds at days 1-3, does not close | A shorter arc helps typical windows and the tail needs something else | F2H next, as ruled |
| Closes, does not hold | A trade: the tail for typical skill | Not a design by itself; report the trade |
| Wins days 1-3, and its interval against F2O at day 7 lies wholly above 0 | The short arc does not determine B for the long lead. Expected at 12 h, where the 30 % prior may set B | Separate the two jobs: state from a short arc, B from a longer one |
| Neither at any length | Arc length is not the lever, whatever the n 30 lead suggested | F2H, then the model's response to the storm and to F10.7 |

**The post-storm tail moves** if an arm's W04 count at days 1, 2 and 3 is at most half of F2O's (9, 11, 11), or its median e at the cutoffs 01-22..01-26 is at or below P's at days 2 and 3. If it moves, the arc's span over the storm caused it, which is what XM5 could not test. If it stays at every length, the arc's span is cleared and the 3-hourly ap and the model's storm response are what is left.

| Outcome for W72 and the fitted AGOM | Reading |
| --- | --- |
| W72 holds against F2O at days 1-3 | The 30 % prior was binding harmfully, so SRP's seed-and-prior defect reaches LEO forecasts. Lead: register a wider prior or a corrected seed |
| W72 does not hold, and AGOM moves further from its seed | The prior is not the lever. AGOM is taking up something else on long arcs |
| W72 is wholly above 0 against F2O at days 1-3 | The 30 % prior was protecting the fit. Freeing AGOM makes the forecast worse |
| Short arcs' AGOM sits within 30 % of seed while 72 h sits at 2-3 times | The inflation comes with the span, not the area: a long-arc absorber, so correcting the seed alone would not address it |

Sentinel-1 is reported the same way and decides nothing here.

## Integrity

XM3's cuts, unchanged: C2's time cut and held-out objects, ISS out, no laser spheres, GPCV P0's truth span. Never read: C2's held-out row files, B2 part 1a and part 5 files, census results, operator-capture content, C3-small's rows. Tuning: none on these windows beyond the arms above, and the arms are not refined after a cell is read.

## Reproduction and cost

- All fitting and propagation are WASM module calls. Modules 9a05d899b: propagator/ffm 2.0.4 c36f1b14, analysis/estimation 0.7.0 7a555ca5, SHA-256 checked. XM3's rows digest 1af3adb87236.
- `node experiments/ffm-agom-prior-leo/run.mjs --check`: pinned windows rerun exactly, the table rebuilt equal to the committed table.json.
- Expected, scaled by arc-hours from XM5's means at load up to 47 (fit 41.3 s at 72 h, forecast 27.3 s over 10 days; rounds may rise on short arcs and with a wide prior): 36.9 worker-hours for group P and 6.4 for S1, about 5.4 h on 8 workers, less on a quieter machine. Each fit round is one propagator/ffm run of the arc at RK78 (relative tolerance 1e-10, absolute 1e-7 m and m/s, initial step 60 s, steps up to 120 s) with the 8 x 8 STM, output at the arc states (300 s); each forecast covers the arc and 7 days at the same settings, no STM, output at the scored epochs (300 s). About 5 MB on disk.
