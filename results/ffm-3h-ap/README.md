# XM7: is F2's tail the daily Ap, and how much of M's gain is F10.7a? The 3-hourly ap leaves the tail where it is, and a centered F10.7a is a small part of M's gain

**Exploratory: every window here was scored in XM2, XM3, XM5 and XM6, so every result is a lead for a registration, never a pass.** Nothing below moves a verdict.

**The 3-hourly ap does not move F2's tail on observed weather; by the plan's reading, daily Ap's timing is not the lever.** F2H (F2 on condition M's rows with GFZ's eight ap per day, so NRLMSISE-00 takes its 3-hourly ap_array at switch 9 = -1) changes F2M's median e by -6.2, -8.9, -3.7 and -0.9 % at days 1, 2, 3 and 7; only day 2's interval is wholly below 0 (-14.4 to -4.2 %). Its p95 ratio against F2M is 0.93, 0.95, 0.96 and 0.90, and every interval holds 1 (day 1: 0.82 to 1.18). Against the public set under SGP4 (P) the upper bound of the p95 ratio is 1.18, 1.10, 0.91 and 0.72, against F2M's 1.21, 1.17, 0.94 and 0.78 and F2O's 1.26, 1.31, 1.20 and 1.05; the limit is 1.10, and day 2's bound is 1.096. F2H has no failure in 750 windows at any lead (F2M has one).

**The post-storm tail stays.** Cutoffs of 2026-W04 hold 21, 16, 17 and 14 of F2H's 38 worst windows at days 1, 2, 3 and 7 (F2M: 20, 21, 21, 16), a storm day in the arc marks 27, 21, 21 and 17 (F2M: 25, 27, 24, 17), and 29, 28, 28 and 27 of F2M's 38 worst remain among F2H's. The median e at the cutoffs 2026-01-22 to 01-26 is 3.38 and 7.61 km at days 2 and 3 against P's 0.97 and 1.77 km. The plan's test for a moving tail (a W04 count of at most 10 at days 1 to 3, or that median at or below P's at days 2 and 3) is not met.

**Quiet days move too.** Where the arc and the forecast through the lead hold no storm day, F2H's median change against F2M is -6.6, -8.1, +0.1 and +1.5 % at days 1, 2, 3 and 7 (604, 574, 544 and 434 windows; no intervals); with storm contact it is -1.5, -9.7, -13.4 and -4.1 %. The branch changes the model's formula at constant ap, so a default would move quiet days as well. The plan leaves field against default to the coordinator.

**A centered F10.7a is a small part of M's gain, and it can be built at a cutoff.** Observed weather (F2M) cuts F2O's median e by 20.3, 20.0, 20.1 and 25.9 % at days 1, 2, 3 and 7 (XM5). With the true centered 81-day mean of F10.7 on as-issued rows (F2C) the cut is 1.0, 1.7, 2.7 and 4.5 %, wholly below 0 at days 2, 3 and 7 (day 1: -1.9 to +0.0 %). With a centered mean built only from what the cutoff knew (F2E) it is 1.6, 2.0, 3.0 and 4.5 %, wholly below 0 at all four leads. Neither moves the tail: the p95 ratio against F2O is 0.95 to 1.01 for F2C and 0.95 to 1.03 for F2E with every interval holding 1; the bounds against P are 1.25, 1.31, 1.19 and 1.04 (F2C) and 1.24, 1.30, 1.17 and 1.09 (F2E) against F2O's 1.26, 1.31, 1.20 and 1.05; and 37, 38, 35 and 36 (F2C) and 37, 37, 36 and 35 (F2E) of F2O's 38 worst stay.

Generated from `results/ffm-3h-ap/table.json` (`node experiments/ffm-3h-ap/table.mjs`, 750 stored windows per pass, rows digest `ee41fb671ba9`, XM3's rows digest `1af3adb87236`, XM5's `8134ce0a14d3`). Plan: [PLAN.md](../../experiments/ffm-3h-ap/PLAN.md), committed at c26f2e1 (2026-10-31T15:27:40Z) and the runner at 9db51c7 (15:30:37Z), before the first receipt (15:38Z) and the first arm (19:50Z); no amendment. XM3 at 22313bf and XM5 at 732dd1e imported unchanged. Modules 9a05d899b: propagator/ffm 2.0.4 (`c36f1b14`) and analysis/estimation 0.7.0 (`7a555ca5`); F2H runs on the test wasm `f470c861` (modules wip ref `wip/experiments-ffm-3h-ap-centered-f107-20261031/build`, commit `d7fdba626d36`, never on modules main). All SHA-256 checked.

## These windows were analyzed before

XM7 runs F2 on the 750 group-P windows XM3 scored as issued (cutoffs 2026-01-02 to 2026-05-31). Every window was scored in XM2, XM3, XM5 and XM6; F2O's, F2M's and P's rows, XM5's table and its exploratory section were read before the plan was written, XM6's plan was written (XM7 changes no arm for it), and the test wasm had run only on Orekit's synthetic LEO400 orbit. XM7 is a look for cause on known windows, not a fresh sample. Sentinel-1 is not run (XM5: it does not respond to weather). As XM3, the cuts are unchanged and the runner reads none of C2's held-out rows, B2's part 1a and part 5 files, the census results, operator-capture content or C3-small's rows. The truth of every window lies in 2025-12-30 to 2026-06-07, inside GPCV P0's span (2025-12-28 to 2026-06-08) and before the hold on Swarm and GRACE-FO truth after 2026-10-31; no window was excluded for it.

## What this is not

F2H reads GFZ's observed weather (condition M) with GFZ's 3-hourly ap; the RSGA has no 3-hourly forecast, so a 3-hourly ap as issued is not tested. F2C reads the true centered 81-day mean of F10.7 of each day, which no cutoff knows. F2E builds that mean at the cutoff from what the cutoff knew: O's rows, GFZ's observed F10.7 before them, and the last predicted value held after them. No row here is a claim about FFM against SGP4 on inputs available at a cutoff. The test wasm is a build on a modules wip ref, not a release; the build's commit states that its unpatched snapshot rebuilds the pinned wasm byte for byte, which was not rebuilt here, and the proof below holds the test wasm to the pinned wasm's outputs on 6 windows (and the pinned wasm to XM3's on a seventh).

## How the passes ran

**Proof, before any arm.** `run.mjs --proof`: the test wasm on rows without AP1 to AP8 equals XM3's F2 under O (3 windows) and XM5's F2M under M (3) byte for byte, this code on the pinned wasm equals XM3's F2 (1), and F2H differs from F2M on Swarm A 2026-01-20 (the branch window). 8 of 8, on 2026-10-31 at 15:38Z (`proof-20261031.json`) and again on 2026-11-03 at 12:16Z (`proof.json`), with the same rounds in every check and the same four source SHA-256.

**Pass H ran in two launches.** The first, on 2026-10-31 at 19:50Z under the first receipt, stored 523 of the 750 windows (Swarm A, B and C, and 73 of GRACE-FO 1's) and ended at about 20:45Z, when the session that launched it hit its limit. On 2026-11-03 the stored rows were checked before they were reused: 32 of them, 8 each on Swarm A, B, C and GRACE-FO 1 (2026-01-20 to 01-26 on each, which holds the five storm-arc cutoffs 01-22 to 01-26, and one March or April window each), were replayed into a scratch store under the committed sources, and every field except timing, sources and build equals the stored row; the windows and their SHA-256 digests are in `proof.json` under `replay`. One difference would have discarded the store. The other 227 windows ran on 2026-11-03 from 12:31Z to 13:08Z. All 750 rows carry the same four source SHA-256 and modules commit.

**Pass C** (F2C and F2E, 750 windows) ran on 2026-11-03 from 13:12Z to 16:24Z. Both passes used 8 workers under nice.

## Group P, F2H: observed weather with the 3-hourly ap

**F2H against F2M and against P** (group P; 750 pairs in 66 clusters at every lead). Medians of e in km; the rule's limit is 1.10. F2M is XM5's stored row and P is XM3's; F2H is run here.

| Lead | F2H median | F2M median | P median | F2H vs F2M | 95 % interval | F2H / F2M p95 ratio | 95 % interval | F2H vs P | 95 % interval | F2H p95 ratio | F2H bound | F2M bound | F2H failures |
| --- | --: | --: | --: | --: | --- | --: | --- | --: | --- | --: | --: | --: | --: |
| Day 1 | 0.202 | 0.218 | 0.763 | -6.2 % | -10.0 % to 1.2 % | 0.93 | 0.82 to 1.18 | -74.0 % | -77.4 % to -70.7 % | 0.75 | **1.18** | 1.21 | 0 of 750 |
| Day 2 | 0.642 | 0.719 | 1.309 | -8.9 % | -14.4 % to -4.2 % | 0.95 | 0.72 to 1.12 | -55.4 % | -62.2 % to -51.2 % | 0.73 | **1.10** | 1.17 | 0 of 750 |
| Day 3 | 1.469 | 1.618 | 2.454 | -3.7 % | -9.5 % to 1.6 % | 0.96 | 0.85 to 1.14 | -48.4 % | -52.7 % to -42.5 % | 0.67 | **0.91** | 0.94 | 0 of 750 |
| Day 7 | 9.930 | 10.332 | 15.348 | -0.9 % | -3.6 % to 5.4 % | 0.90 | 0.80 to 1.06 | -40.3 % | -44.7 % to -31.3 % | 0.54 | **0.72** | 0.78 | 0 of 750 |

**Cutoffs of 2026-W04 out** (35 of 750 windows; report only).

| Lead | Pairs | F2H vs F2M | 95 % interval | F2H / F2M p95 ratio | 95 % interval | F2H vs P | 95 % interval | F2H p95 ratio | F2H bound |
| --- | --: | --: | --- | --: | --- | --: | --- | --: | --: |
| Day 1 | 715 | -6.0 % | -10.2 % to 1.4 % | 0.95 | 0.78 to 1.11 | -75.4 % | -78.8 % to -72.0 % | 0.65 | **0.80** |
| Day 2 | 715 | -9.7 % | -14.7 % to -2.6 % | 1.03 | 0.86 to 1.19 | -56.7 % | -62.9 % to -51.9 % | 0.69 | **0.82** |
| Day 3 | 715 | -3.5 % | -10.1 % to 2.1 % | 1.02 | 0.88 to 1.14 | -48.7 % | -52.9 % to -42.5 % | 0.62 | **0.74** |
| Day 7 | 715 | -0.7 % | -4.0 % to 5.8 % | 0.95 | 0.83 to 1.09 | -40.7 % | -45.5 % to -32.2 % | 0.52 | **0.64** |

**The worst 5 % (38 of 750) and the post-storm cutoffs.** Counts are windows among the 38 largest e at the lead (a failure is largest); "stay" is how many of F2M's 38 are also F2H's.

| Lead | W04: F2O | F2M | P | F2H | Storm arc: F2O | F2M | P | F2H | Stay from F2M | Median e at cutoffs 01-22..01-26 (25 windows): F2O | F2M | P | F2H |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| Day 1 | 19 | 20 | 10 | 21 | 24 | 25 | 12 | 27 | 29 | 1.058 | 1.167 | 0.695 | 1.156 |
| Day 2 | 23 | 21 | 12 | 16 | 25 | 27 | 12 | 21 | 28 | 3.878 | 3.727 | 0.969 | 3.383 |
| Day 3 | 22 | 21 | 11 | 17 | 21 | 24 | 12 | 21 | 28 | 7.556 | 8.211 | 1.770 | 7.607 |
| Day 7 | 16 | 16 | 6 | 14 | 16 | 17 | 10 | 17 | 27 | 34.417 | 33.205 | 8.225 | 33.729 |

**F2H's change against F2M by storm contact** (median of the per-window change, no intervals): no storm day in the arc or the forecast through the lead, and the rest.

| Lead | No storm contact: windows | Median change | Storm contact: windows | Median change |
| --- | --: | --: | --: | --: |
| Day 1 | 604 | -6.6 % | 145 | -1.5 % |
| Day 2 | 574 | -8.1 % | 175 | -9.7 % |
| Day 3 | 544 | 0.1 % | 205 | -13.4 % |
| Day 7 | 434 | 1.5 % | 315 | -4.1 % |

**B and AGOM over their seeds** (median over windows of the fitted parameter divided by the object's seed).

| Cluster | Arm | Windows | Converged | Median rounds | Max rounds | B / seed | AGOM / seed |
| --- | --- | --: | --: | --: | --: | --: | --: |
| Swarm B | F2O | 150 | 150 | 3 | 15 | 1.182 | 2.461 |
| Swarm B | F2M | 150 | 149 | 3 | 40 | 1.290 | 2.516 |
| Swarm B | F2H | 150 | 150 | 3 | 16 | 1.277 | 2.495 |
| Swarm A+C | F2O | 300 | 300 | 3 | 15 | 1.228 | 3.122 |
| Swarm A+C | F2M | 300 | 300 | 3 | 13 | 1.342 | 3.106 |
| Swarm A+C | F2H | 300 | 300 | 3 | 17 | 1.325 | 3.068 |
| GRACE-FO | F2O | 300 | 300 | 3 | 21 | 1.445 | 1.859 |
| GRACE-FO | F2M | 300 | 300 | 3 | 16 | 1.577 | 1.846 |
| GRACE-FO | F2H | 300 | 300 | 3 | 17 | 1.559 | 1.841 |

Plan's words, read at its days 1 to 3: holds against F2M at days 2; wholly above F2M at no lead; closes against P (bound below 1.10) at days 2, 3; p95 interval against F2M wholly below 1 at no lead and wholly above 1 at no lead.

## Group P, F2C and F2E: a centered F10.7a on as-issued rows

**F2C against F2O and against P** (group P; 750 pairs in 66 clusters at every lead). Medians of e in km; the rule's limit is 1.10. F2O and P are XM3's stored rows; F2C is run here.

| Lead | F2C median | F2O median | P median | F2C vs F2O | 95 % interval | F2C / F2O p95 ratio | 95 % interval | F2C vs P | 95 % interval | F2C p95 ratio | F2C bound | F2O bound | F2C failures |
| --- | --: | --: | --: | --: | --- | --: | --- | --: | --- | --: | --: | --: | --: |
| Day 1 | 0.304 | 0.310 | 0.763 | -1.0 % | -1.9 % to 0.0 % | 0.95 | 0.93 to 1.03 | -62.1 % | -67.9 % to -55.7 % | 0.89 | **1.25** | 1.26 | 0 of 750 |
| Day 2 | 1.037 | 1.025 | 1.309 | -1.7 % | -2.6 % to -0.6 % | 1.01 | 0.93 to 1.02 | -30.2 % | -36.8 % to -23.0 % | 0.94 | **1.31** | 1.31 | 0 of 750 |
| Day 3 | 2.059 | 2.161 | 2.454 | -2.7 % | -3.8 % to -1.6 % | 0.96 | 0.92 to 1.02 | -18.2 % | -29.2 % to -9.9 % | 0.87 | **1.19** | 1.20 | 0 of 750 |
| Day 7 | 11.622 | 11.955 | 15.348 | -4.5 % | -7.0 % to -2.8 % | 0.97 | 0.89 to 1.03 | -17.3 % | -27.2 % to -6.3 % | 0.78 | **1.04** | 1.05 | 0 of 750 |

**Cutoffs of 2026-W04 out** (35 of 750 windows; report only).

| Lead | Pairs | F2C vs F2O | 95 % interval | F2C / F2O p95 ratio | 95 % interval | F2C vs P | 95 % interval | F2C p95 ratio | F2C bound |
| --- | --: | --: | --- | --: | --- | --: | --- | --: | --: |
| Day 1 | 715 | -1.2 % | -2.2 % to 0.1 % | 1.00 | 0.95 to 1.05 | -63.6 % | -69.2 % to -58.3 % | 0.75 | **0.95** |
| Day 2 | 715 | -1.9 % | -2.9 % to -0.5 % | 0.99 | 0.95 to 1.05 | -33.0 % | -39.9 % to -25.2 % | 0.85 | **1.02** |
| Day 3 | 715 | -3.0 % | -4.2 % to -1.8 % | 0.98 | 0.93 to 1.05 | -21.6 % | -31.1 % to -13.1 % | 0.79 | **0.99** |
| Day 7 | 715 | -5.4 % | -7.2 % to -3.4 % | 1.00 | 0.88 to 1.04 | -21.5 % | -29.7 % to -9.8 % | 0.71 | **0.86** |

**The worst 5 % (38 of 750) and the post-storm cutoffs.** Counts are windows among the 38 largest e at the lead (a failure is largest); "stay" is how many of F2O's 38 are also F2C's.

| Lead | W04: F2O | F2M | P | F2C | Storm arc: F2O | F2M | P | F2C | Stay from F2O | Median e at cutoffs 01-22..01-26 (25 windows): F2O | F2M | P | F2C |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| Day 1 | 19 | 20 | 10 | 19 | 24 | 25 | 12 | 25 | 37 | 1.058 | 1.167 | 0.695 | 1.039 |
| Day 2 | 23 | 21 | 12 | 23 | 25 | 27 | 12 | 25 | 38 | 3.878 | 3.727 | 0.969 | 3.823 |
| Day 3 | 22 | 21 | 11 | 24 | 21 | 24 | 12 | 23 | 35 | 7.556 | 8.211 | 1.770 | 7.489 |
| Day 7 | 16 | 16 | 6 | 18 | 16 | 17 | 10 | 16 | 36 | 34.417 | 33.205 | 8.225 | 33.717 |

**F2C's change against F2O by storm contact** (median of the per-window change, no intervals): no storm day in the arc or the forecast through the lead, and the rest.

| Lead | No storm contact: windows | Median change | Storm contact: windows | Median change |
| --- | --: | --: | --: | --: |
| Day 1 | 605 | -1.0 % | 145 | -1.0 % |
| Day 2 | 575 | -2.1 % | 175 | -0.9 % |
| Day 3 | 545 | -3.2 % | 205 | -1.6 % |
| Day 7 | 435 | -5.6 % | 315 | -3.0 % |

**B and AGOM over their seeds** (median over windows of the fitted parameter divided by the object's seed).

| Cluster | Arm | Windows | Converged | Median rounds | Max rounds | B / seed | AGOM / seed |
| --- | --- | --: | --: | --: | --: | --: | --: |
| Swarm B | F2O | 150 | 150 | 3 | 15 | 1.182 | 2.461 |
| Swarm B | F2M | 150 | 149 | 3 | 40 | 1.290 | 2.516 |
| Swarm B | F2C | 150 | 150 | 3 | 15 | 1.281 | 2.495 |
| Swarm A+C | F2O | 300 | 300 | 3 | 15 | 1.228 | 3.122 |
| Swarm A+C | F2M | 300 | 300 | 3 | 13 | 1.342 | 3.106 |
| Swarm A+C | F2C | 300 | 300 | 3 | 17 | 1.328 | 3.090 |
| GRACE-FO | F2O | 300 | 300 | 3 | 21 | 1.445 | 1.859 |
| GRACE-FO | F2M | 300 | 300 | 3 | 16 | 1.577 | 1.846 |
| GRACE-FO | F2C | 300 | 300 | 3 | 15 | 1.566 | 1.837 |

Plan's words, read at its days 1 to 3: holds against F2O at days 2, 3; wholly above F2O at no lead; closes against P (bound below 1.10) at no lead; p95 interval against F2O wholly below 1 at no lead and wholly above 1 at no lead.

**F2E against F2O and against P** (group P; 750 pairs in 66 clusters at every lead). Medians of e in km; the rule's limit is 1.10. F2O and P are XM3's stored rows; F2E is run here.

| Lead | F2E median | F2O median | P median | F2E vs F2O | 95 % interval | F2E / F2O p95 ratio | 95 % interval | F2E vs P | 95 % interval | F2E p95 ratio | F2E bound | F2O bound | F2E failures |
| --- | --: | --: | --: | --: | --- | --: | --- | --: | --- | --: | --: | --: | --: |
| Day 1 | 0.304 | 0.310 | 0.763 | -1.6 % | -2.8 % to -0.1 % | 0.97 | 0.94 to 1.04 | -62.8 % | -67.3 % to -56.5 % | 0.91 | **1.24** | 1.26 | 0 of 750 |
| Day 2 | 1.041 | 1.025 | 1.309 | -2.0 % | -3.1 % to -1.2 % | 1.03 | 0.94 to 1.06 | -30.7 % | -36.9 % to -21.9 % | 0.96 | **1.30** | 1.31 | 0 of 750 |
| Day 3 | 2.174 | 2.161 | 2.454 | -3.0 % | -3.8 % to -1.8 % | 0.98 | 0.93 to 1.05 | -19.7 % | -27.8 % to -10.4 % | 0.88 | **1.17** | 1.20 | 0 of 750 |
| Day 7 | 11.635 | 11.955 | 15.348 | -4.5 % | -6.1 % to -0.9 % | 0.95 | 0.91 to 1.08 | -14.8 % | -23.8 % to -7.0 % | 0.76 | **1.09** | 1.05 | 0 of 750 |

**Cutoffs of 2026-W04 out** (35 of 750 windows; report only).

| Lead | Pairs | F2E vs F2O | 95 % interval | F2E / F2O p95 ratio | 95 % interval | F2E vs P | 95 % interval | F2E p95 ratio | F2E bound |
| --- | --: | --: | --- | --: | --- | --: | --- | --: | --: |
| Day 1 | 715 | -1.8 % | -2.8 % to -0.5 % | 1.03 | 0.95 to 1.04 | -64.1 % | -68.1 % to -59.2 % | 0.77 | **0.96** |
| Day 2 | 715 | -2.1 % | -3.4 % to -1.4 % | 0.97 | 0.93 to 1.04 | -32.6 % | -39.3 % to -25.0 % | 0.84 | **1.01** |
| Day 3 | 715 | -3.2 % | -4.3 % to -2.1 % | 0.99 | 0.93 to 1.05 | -22.2 % | -30.8 % to -13.3 % | 0.79 | **0.97** |
| Day 7 | 715 | -4.5 % | -6.8 % to -0.9 % | 1.02 | 0.91 to 1.08 | -16.3 % | -25.1 % to -8.1 % | 0.72 | **0.85** |

**The worst 5 % (38 of 750) and the post-storm cutoffs.** Counts are windows among the 38 largest e at the lead (a failure is largest); "stay" is how many of F2O's 38 are also F2E's.

| Lead | W04: F2O | F2M | P | F2E | Storm arc: F2O | F2M | P | F2E | Stay from F2O | Median e at cutoffs 01-22..01-26 (25 windows): F2O | F2M | P | F2E |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| Day 1 | 19 | 20 | 10 | 19 | 24 | 25 | 12 | 25 | 37 | 1.058 | 1.167 | 0.695 | 1.046 |
| Day 2 | 23 | 21 | 12 | 23 | 25 | 27 | 12 | 25 | 37 | 3.878 | 3.727 | 0.969 | 3.763 |
| Day 3 | 22 | 21 | 11 | 23 | 21 | 24 | 12 | 22 | 36 | 7.556 | 8.211 | 1.770 | 7.461 |
| Day 7 | 16 | 16 | 6 | 18 | 16 | 17 | 10 | 16 | 35 | 34.417 | 33.205 | 8.225 | 32.822 |

**F2E's change against F2O by storm contact** (median of the per-window change, no intervals): no storm day in the arc or the forecast through the lead, and the rest.

| Lead | No storm contact: windows | Median change | Storm contact: windows | Median change |
| --- | --: | --: | --: | --: |
| Day 1 | 605 | -2.1 % | 145 | -0.5 % |
| Day 2 | 575 | -3.3 % | 175 | -0.7 % |
| Day 3 | 545 | -3.7 % | 205 | -1.0 % |
| Day 7 | 435 | -3.7 % | 315 | -4.9 % |

**B and AGOM over their seeds** (median over windows of the fitted parameter divided by the object's seed).

| Cluster | Arm | Windows | Converged | Median rounds | Max rounds | B / seed | AGOM / seed |
| --- | --- | --: | --: | --: | --: | --: | --: |
| Swarm B | F2O | 150 | 150 | 3 | 15 | 1.182 | 2.461 |
| Swarm B | F2M | 150 | 149 | 3 | 40 | 1.290 | 2.516 |
| Swarm B | F2E | 150 | 150 | 3 | 16 | 1.292 | 2.482 |
| Swarm A+C | F2O | 300 | 300 | 3 | 15 | 1.228 | 3.122 |
| Swarm A+C | F2M | 300 | 300 | 3 | 13 | 1.342 | 3.106 |
| Swarm A+C | F2E | 300 | 300 | 3 | 18 | 1.311 | 3.072 |
| GRACE-FO | F2O | 300 | 300 | 3 | 21 | 1.445 | 1.859 |
| GRACE-FO | F2M | 300 | 300 | 3 | 16 | 1.577 | 1.846 |
| GRACE-FO | F2E | 300 | 300 | 3 | 17 | 1.552 | 1.845 |

Plan's words, read at its days 1 to 3: holds against F2O at days 1, 2, 3; wholly above F2O at no lead; closes against P (bound below 1.10) at no lead; p95 interval against F2O wholly below 1 at no lead and wholly above 1 at no lead.

## The plan's outcome tables, read

"Holds" means the interval against the arm's base lies wholly below 0; "closes" means the p95 upper bound against P is below 1.10. The columns "Reading" and "Where it points" are the plan's words, unchanged. Field against default is the coordinator's ruling.

**F2H, the 3-hourly ap**

| Outcome | Met | Numbers | Reading | Where it points |
| --- | --- | --- | --- | --- |
| Closes at all of days 1-3 | No | Bounds 1.18, 1.10, 0.91: it closes at days 2 and 3 | With the weather known, the daily mean's timing was the tail | The 3-hourly path is worth landing, field or default by the coordinator's ruling. As-issued 3-hourly becomes the next question: the RSGA has no 3-hourly forecast |
| Its p95 ratio against F2M is wholly below 1 at days 1 or 2, and it does not close | No | Intervals 0.82 to 1.18 and 0.72 to 1.12 hold 1 | The timing is part of the tail | Worth keeping beside whatever XM6 finds; the rest is the arc or the model's storm response |
| Its p95 interval against F2M holds 1 at all of days 1-3, and the post-storm tail stays | **Yes** | Intervals 0.82 to 1.18, 0.72 to 1.12 and 0.85 to 1.14; W04 count 21, 16, 17 (a moving tail needs at most 10); median e at 01-22..01-26 3.38 and 7.61 km at days 2 and 3 against P's 0.97 and 1.77 | Daily Ap's timing is not the lever, however large the branch looks on a test orbit | No module change on this evidence. The arc (XM6) or NRLMSISE-00's response to the storm and to F10.7 |
| Its p95 interval against F2M is wholly above 1 at any of days 1-3 | No | Lower ends 0.82, 0.72, 0.85 | The 3-hourly branch makes the tail worse on these objects | Do not land it; the model over-responds to storm ap, or the fit takes it up |
| Holds on windows with no storm contact too, or hurts them | **Quiet days move, and are not hurt at the median** | -6.6, -8.1, +0.1, +1.5 % on 604, 574, 544, 434 windows; the split has no intervals, so "holds" is not read | Says whether it can be a default: the branch changes the model's formula even at constant ap, so quiet days move as well | The coordinator's field against default |

The post-storm tail moves if F2H's W04 count at days 1, 2 and 3 is at most half of F2M's (20, 21, 21, so at most 10, 10, 10), or its median e at the cutoffs 01-22..01-26 is at or below P's at days 2 and 3. Neither holds.

**F2C and F2E, F10.7a**

| Outcome | Met | Numbers | Reading | Where it points |
| --- | --- | --- | --- | --- |
| F2C holds near M's -20 % | No | -1.0, -1.7, -2.7, -4.5 % against M's -20.3, -20.0, -20.1, -25.9 % | F10.7a is most of M's gain, and XM's trailing mean is the cost | Center F10.7a. F2E says whether that can be done at a cutoff |
| F2C holds, well short of M's -20 % | **Yes, at days 2, 3 and 7** | -1.7 % (-2.6 to -0.6), -2.7 % (-3.8 to -1.6), -4.5 % (-7.0 to -2.8); day 1: -1.0 % (-1.9 to +0.0) | F10.7a is part of it; the rest is daily F10.7 and Ap | Both |
| F2C does not hold | At day 1 only | Upper end +0.02 % | The fit's B absorbs F10.7a's level, so centering it changes little | M's gain is the forecast of daily F10.7 and Ap |
| F2E holds against F2O | **Yes, at all four leads** | -1.6 % (-2.8 to -0.1), -2.0 % (-3.1 to -1.2), -3.0 % (-3.8 to -1.8), -4.5 % (-6.1 to -0.9); against P the bounds are 1.24, 1.30, 1.17, 1.09 | A centered mean built only from what a cutoff knew improves F2 on real inputs | The first lead here on inputs available at a cutoff: register it. Also read F2E against P |
| F2C holds, F2E does not | No | F2E holds wherever F2C does, and at day 1 as well | The future half of the window is what helps, and holding it is not enough | A better F10.7 forecast, or NOAA's 45-day forecast, archived only from 2026-10-08 |
| F2E is wholly above 0 against F2O | No | Upper ends -0.1, -1.2, -1.8, -0.9 % | Hold-last for 37 days is worse than the trailing mean | Do not use it |

Read against P, F2E closes only at day 7 (1.09); at days 1 to 3 its bounds, 1.24, 1.30 and 1.17, are F2O's within 0.03.

## Reproduce

```
node experiments/ffm-3h-ap/run.mjs --proof                  # the proof receipt in the store
node experiments/ffm-3h-ap/run.mjs --launch 8 --pass H      # then --pass C; resumable by window
node experiments/ffm-3h-ap/table.mjs                        # results/ffm-3h-ap/table.json from the stored rows
node experiments/ffm-3h-ap/run.mjs --check                  # the E2E: F2H on 2026-01-20 Swarm A, F2C and F2E on 2026-02-13 GRACE-FO 1 rerun exactly; the table rebuilt equal
```

Cost, 8 workers under nice with the machine's 1-minute load between 20 and 75 from other lanes: a fit takes a median 23.2 s (F2H), 24.6 s (F2C) and 24.3 s (F2E) and a forecast a median 20.4 s (F2C: 20.5 s); a window takes a median 44.7 s in pass H (one arm) and 94.4 s in pass C (two arms), 11.6 and 23.3 worker-hours in all, 34.8 against the plan's 43. Less than 10 MB on disk.

