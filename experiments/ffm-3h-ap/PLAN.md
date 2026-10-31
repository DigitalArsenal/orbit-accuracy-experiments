# XM7: is F2's tail FFM's daily Ap, and how much of M's gain is F10.7a? An exploratory look on spent windows

Written 2026-10-31 (UTC) before any cell, under task `experiments-ffm-3h-ap-centered-f107-20261031`. **Exploratory: every window here was scored in XM2, XM3, XM5 and XM6, so every result is a lead for a registration, never a pass.** It moves no verdict and is never written as "beats SGP4". This file and `config.json` are fixed before any cell; a change after that is labeled.

## Why

The owner, 2026-10-30, verbatim: "I want our new atmospheric model to beat SGP4, which it should with truth / owner operator data." And, on this step: "Pass 3-Hourly ap_array (switches[9] = -1) to NRLMSISE-00 & Center F10.7a".

XM5 (experiments-ffm-tail-cause-20261031): on observed daily weather (F2M) the upper bound of the p95 ratio against the public set (P) in group P is 1.21, 1.17, 0.94 and 0.78 at days 1, 2, 3 and 7, against 1.26, 1.31, 1.20 and 1.05 as issued (F2O). M cuts the median by about 20 % at every lead and does not say which of F10.7, Ap and F10.7a does it. The tail left at days 1 and 2 sits in arcs that span a storm, where M barely changes the rows. On 2026-01-19 the daily Ap of 73 stands for a day whose 3-hourly ap is at most 18 until 18:00 UTC, then 236 and 300.

## Disclosure

These windows, F2O's, F2M's and P's rows, XM5's table and its exploratory section were read. XM6's plan was written, and its cells may be read before XM7's: XM7 changes no arm for them. Input rows were read for this plan. The test wasm ran only on Orekit's synthetic LEO400 orbit before this plan, never on a scored window.

## Arms

| Arm | What changes | Against | Wasm |
| --- | --- | --- | --- |
| F2H | F2M with AP1 to AP8 in the rows, so NRLMSISE-00 takes the 3-hourly ap_array (switch 9 = -1) | F2M (XM5's rows) | test build |
| F2C | F2O with F10.7a the true centered 81-day mean of each day: a sensitivity, not known at a cutoff | F2O (XM3's rows) | pinned |
| F2E | F2O with F10.7a a centered mean buildable at the cutoff: for each day, the mean over 40 days either side of what the cutoff knew (O's rows' observed and predicted F10.7, GFZ before them, the last predicted value held after them, a day with no F10.7 skipped) | F2O | pinned |

Every arm also reads against P. Everything else is F2's: 72 h arc, 30 % priors, seeds, forces, integrator, tolerances, Earth orientation, kernel, grid, bins, e and scorer. O and M are XM's rows through XM3's driver rule; F2H's rows are M's with GFZ's ap1 to ap8 (GFZ's file, SHA-256 in config.json), and the 2026-05-09 row M copies from 05-08 copies those too.

**The test build.** `wip/experiments-ffm-3h-ap-centered-f107-20261031/build` in the modules repo, commit d7fdba626d36, built on 9a05d899b, wasm f470c861. An instant uses the 3-hourly branch when the rows of its day and the three days before all carry AP1 to AP8 that are non-negative, not all zero, and whose mean agrees with AP_AVG to 1. In this period every day's eight ap qualify. Evidence before this plan:
- The unpatched snapshot rebuilds the pinned wasm c36f1b14 byte for byte, so the patch is the only difference.
- Against Orekit 13.1 at switch 9 = -1, LEO400 with the field, Sun, Moon, SRP and NRLMSISE-00 across the January storm, on the same rows and Earth orientation: largest position difference over 24 h 0.041, 0.009 and 0.019 m at the epochs 01-19, 01-20 12:00 and 01-25. The suite's drag tolerance is 0.1 m.

**The proof before any arm.** The test wasm on rows without AP1 to AP8 must equal XM3's F2 under O and XM5's F2M under M byte for byte (three windows each), this code on the pinned wasm must equal XM3's F2 (one window), and F2H must differ from F2M on a storm window. `--launch` refuses without that receipt.

## Windows

XM3's group P: the 750 windows with an F2 attempt under O. Sentinel-1 is not run: XM5 showed it does not respond to weather. Pass H (F2H) runs first, then pass C (F2C and F2E).

## What is read and reported

Group P, per arm and lead (1, 2, 3, 7), XM3's cluster bootstrap (orbit group x ISO week, 10,000 draws, percentile 95 % intervals, code copied unchanged, seeds labeled `XM7|<arm>/<ref>|<lead>|orbit` and with `|noW04`):
1. Against its base and against P: the median change and interval, the p95 ratio and upper bound, failures.
2. Both with the cutoffs of 2026-W04 out.
3. Reproduction: F2O against P equals XM3's cell and F2M against P equals XM5's C1 in every number.
4. Whether the post-storm tail moves: W04's and the storm arc's count in each arm's worst 5 %, how many of the base's worst stay, and the median e at the cutoffs 2026-01-22..01-26.
5. For F2H, the median change against F2M split by storm contact, because a 3-hourly default must not hurt quiet days: windows with no storm day in the arc or the forecast through that lead, and the rest. No intervals.
6. B and AGOM over seed per arm.

## What each outcome means (written before any cell)

"Holds" means the interval against the arm's base lies wholly below 0. "Closes" means the p95 upper bound against P is below 1.10. Both in group P.

**F2H, the 3-hourly ap**

| Outcome | Reading | Where it points |
| --- | --- | --- |
| Closes at all of days 1-3 | With the weather known, the daily mean's timing was the tail | The 3-hourly path is worth landing, field or default by the coordinator's ruling. As-issued 3-hourly becomes the next question: the RSGA has no 3-hourly forecast |
| Its p95 ratio against F2M is wholly below 1 at days 1 or 2, and it does not close | The timing is part of the tail | Worth keeping beside whatever XM6 finds; the rest is the arc or the model's storm response |
| Its p95 interval against F2M holds 1 at all of days 1-3, and the post-storm tail stays | Daily Ap's timing is not the lever, however large the branch looks on a test orbit | No module change on this evidence. The arc (XM6) or NRLMSISE-00's response to the storm and to F10.7 |
| Its p95 interval against F2M is wholly above 1 at any of days 1-3 | The 3-hourly branch makes the tail worse on these objects | Do not land it; the model over-responds to storm ap, or the fit takes it up |
| Holds on windows with no storm contact too, or hurts them | Says whether it can be a default: the branch changes the model's formula even at constant ap, so quiet days move as well | The coordinator's field against default |

**The post-storm tail moves** if F2H's W04 count at days 1, 2 and 3 is at most half of F2M's (20, 21, 21, so at most 10, 10, 10), or its median e at the cutoffs 01-22..01-26 is at or below P's at days 2 and 3.

**F2C and F2E, F10.7a**

| Outcome | Reading | Where it points |
| --- | --- | --- |
| F2C holds near M's -20 % | F10.7a is most of M's gain, and XM's trailing mean is the cost | Center F10.7a. F2E says whether that can be done at a cutoff |
| F2C holds, well short of M's -20 % | F10.7a is part of it; the rest is daily F10.7 and Ap | Both |
| F2C does not hold | The fit's B absorbs F10.7a's level, so centering it changes little | M's gain is the forecast of daily F10.7 and Ap |
| F2E holds against F2O | A centered mean built only from what a cutoff knew improves F2 on real inputs | The first lead here on inputs available at a cutoff: register it. Also read F2E against P |
| F2C holds, F2E does not | The future half of the window is what helps, and holding it is not enough | A better F10.7 forecast, or NOAA's 45-day forecast, archived only from 2026-10-08 |
| F2E is wholly above 0 against F2O | Hold-last for 37 days is worse than the trailing mean | Do not use it |

## Integrity

XM3's cuts, unchanged: C2's time cut and held-out objects, ISS out, no laser spheres, GPCV P0's truth span. Never read: C2's held-out row files, B2 part 1a and part 5 files, census results, operator-capture content, C3-small's rows. No arm is refined after a cell is read.

## Reproduction and cost

- All fitting and propagation are WASM module calls. Modules 9a05d899b (propagator/ffm 2.0.4 c36f1b14, analysis/estimation 0.7.0 7a555ca5); test wasm f470c861 from the wip ref; all SHA-256 checked. XM3's rows digest 1af3adb87236, XM5's 8134ce0a14d3.
- `node experiments/ffm-3h-ap/run.mjs --check`: pinned windows rerun exactly, the table rebuilt equal to the committed table.json.
- Expected from XM5's means at load up to 47: 14.4 worker-hours per arm in group P, 43 in all, about 1.8 h per arm on 8 workers. A fit is a median 3 rounds, each one propagator/ffm run of 72 h at RK78 (relative tolerance 1e-10, absolute 1e-7 m and m/s, initial step 60 s, steps up to 120 s) with the 8 x 8 STM, output at the 864 arc states (300 s); a forecast is 10 days at the same settings, no STM, output at the scored epochs (300 s). Less than 10 MB on disk.
