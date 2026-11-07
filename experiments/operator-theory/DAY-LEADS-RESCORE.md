# DAY-LEADS-RESCORE: every lead day 1 to 7 on the front page's windows

Report only, under `experiments-front-page-day5-rescore-20261105`, written and pushed before any row of this re-score exists. The owner, 2026-11-05, verbatim: "on the front page we need the 5 day median prediction". The stored rows score days 1, 2, 3 and 7 only (xp-atmosphere-merit `config.json` `scoring.leadDays`). These windows were already read; nothing here passes or fails except the control. Report: `results/ap-truth/day-leads`.

## Window sets

The three window sets of `ap/b051` (the 2026-11-04 re-measure, `lib/remeasure.mjs`), the same keys, truth, thinning, coverage rule, grid and as-issued weather:

| Set | Producer, as `ap/b051` ran it | Groups | Arms |
|---|---|---|---|
| `truth` | `ap-truth.mjs --arms registered --from 2025-04-01 --to 2025-12-21` | T: Swarm A, B, C and GRACE-FO 1, 2, strong drag 2025 (944 windows) | AP24, APRa12 |
| `truth2` | `XP2F_CONTROL=1 ap-truth.mjs --xm --from 2026-01-01 --to 2026-05-31` | P strong drag 2026, S1 Sentinel-1A and 1C near 700 km, GN medium Earth orbit GNSS (1812 windows) | AP24, AP72 |
| `regimes` | `all-regimes.mjs --arms AP,XP` (groups LS, DO, GD, IG, GE, HE) | AP6's other regimes (407 windows) | AP24, XP24, AP72, XP72, AP336, XP336 |

Whiteroom XP on the first two sets is stored beside them, by the same keys, so it is flown again too:

| Set | Producer | Arms |
|---|---|---|
| `compare-truth` | `truth-compare.mjs --arms XP --from 2025-04-01 --to 2025-12-21` | XP24 |
| `compare-truth2` | `XP2F_CONTROL=1 truth-compare.mjs --xm --arms XP --from 2026-01-01 --to 2026-05-31` | XP24, XP72 |

Reading taken (the record names "MEO (AP72 and XP72, GNSS; regimes)"): the GNSS medium-Earth-orbit windows are `truth2`'s group GN, and their XP72 is `compare-truth2`'s; `regimes` holds AP6's groups, none of them GNSS in medium Earth orbit. All five sets are flown and tabulated; the front page reads strong drag 2025 (AP24, APRa12, XP24), near 700 km (AP72, AP24, XP72, XP24) and medium Earth orbit (AP72, XP72).

Not flown: SGP4, FFM and the Space Force XP (`sgp4-xp`): none flies `propagator/sdn-ap`, and the record names none.

## Fits and build

Each arm is fitted and flown again exactly as the stored row was, by the committed producer above (`experiments/operator-theory` at this registration's commit), in its own process, 12 shards by the producer's own key hash. `day-leads-rescore.mjs --worker` sets `XM.config.scoring.leadDays` to `[1, 2, 3, 4, 5, 6, 7]` and runs the producer unchanged; nothing else moves.

Build: `propagator/sdn-ap` 0.5.1, wasm SHA-256 `d29acd2b5d921446f7da8dbf51f45ba53d59dc7685e677616dcd81944981efdb` at modules `ea824356587f54149f876cd3b2b5d8134af682d3` (`lib/build.mjs` PIN, read by `git show` and hash-checked by `lib/ap.mjs`), from the modules root `space-data-network-modules-r2`. This is the build of the stored rows. The record names 0.5.2 (wasm `74388314396a…` at modules `42b343833`), whose flights equal 0.5.1's on these stores; 0.5.2 is not flown here, because the committed producers pin 0.5.1 and the control needs the stored rows' build.

## Scoring

Each producer's own: forward error only, from the fit's end (the cutoff). Truth after the cutoff on the producer's grid (300 s, coarser products on their own multiple); lead day k is the grid epochs in (cutoff + (k - 1) d, cutoff + k d], scored when it holds at least the producer's minimum (260 at 300 s, scaled for coarser grids); per day the RSS of the radial, in-track and cross-track RMS errors (km) and each component. Every lead day 1 to 7 is scored.

## Table

`results/ap-truth/day-leads/table.json` and `README.md`: per group (regime) and arm, for each day 1 to 7, the median of the day's error over the windows where the arm is ok and the day is scored (the mean of the two middle values when the count is even), with that count. Each arm names its build by wasm hash. The tables are written by `day-leads-rescore.mjs --table` from the rows alone.

## Control

Days 1, 2, 3 and 7 must equal the stored rows of `ap/b051/<set>` byte for byte. Per set, by key and arm: the row's `group`, `norad`, `name`, `cutoff` and `error`, each arm's `ok`, `error`, `bterm`, `agom`, `rms`, `bHeld`, and for days 1, 2, 3 and 7 whether the day is scored and its `e`, `r`, `t` and `n`, compared as JSON numbers (`fitMs`, a wall-clock time, is not compared). A key in one store and not the other counts as a difference. Pass: 0 differing scalars in every set. A window whose stored row had no scored day among 1, 2, 3 and 7 (`no lead bin`) and now has days 4 to 6 only is counted apart and named; its days 1, 2, 3 and 7 still compare (absent in both). Any difference is reported as found, never removed.

## Rows and run

Rows: `/opt/data/sdn-archive/operator-theory/day-leads/<set>/rows-<k>.jsonl`, the producer's row format with days 1 to 7; `manifest.json` names the start time, this repository's commit, the producers' and runner's SHA-256 and the build. About 11 MB. Run: `day-leads-rescore.mjs --run` under `lane-run --lock oae-day5`, at most 4 workers under `nice -n 10` (the coordinator's cap of 2026-11-05: the machine is shared), a shard starting only while the 1-minute load is under 42, except that one shard always runs; never stopped mid-shard; a rerun adds only missing keys.

## Holds

No Starlink group, operator capture, C2 row or held Galileo satellite (pairs.mjs: 43567, 37847, 41862, 41174, 43055, 41175) is in these sets; Swarm and GRACE-FO truth is read only to 2026-06-07 (the last 2026 cutoff plus 7 days), never after 2026-10-31. `--check` refuses a row that breaks either.

## End to end

`node experiments/operator-theory/day-leads-rescore.mjs --check`: this registration precedes the manifest's start; the table and README reproduce from the rows; the control shows 0 differing scalars on days 1, 2, 3 and 7 in every set; every arm names its build; a day-5 median is present for every group and arm in the table.

## Amendment, 2026-11-05: the 95th percentile

Report only, under `sdn-ap-site-front-page-followups-20261105`. The front page's 95th-percentile rows need day 5. No window is flown again and nothing in the store moves: the 95th percentile is computed from the landed rows under `/opt/data/sdn-archive/operator-theory/day-leads`, the same windows, arms, scored days and counts as the median.

Statistic: per group, arm and day 1 to 7, over the windows where the arm is ok and the day is scored, the 95th percentile of the day's error, linear between the order statistics at (n - 1) × 0.95 (`lib/compare.mjs` `pct`, the statistic of the stored tables' `p95`); none when the day has no window. `table.json` gains `p95Km` beside `medianKm` on every day; `README.md` gains it on the day-5 table and as a row under each arm. `--check` adds: a 95th percentile on every scored day 1 to 7, day 5 included, for every group and arm, never below its median.
