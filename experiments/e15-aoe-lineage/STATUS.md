# E15 status (for whoever resumes the lane)

Parked 2026-10-11 13:15 UTC. PLAN.md is frozen: amendments A1 to A7 are at its end. This file holds the operating state only.

## Where things are

| What | Where |
| --- | --- |
| Checkout | worktree `orbit-accuracy-experiments--e15-aoe-lineage-20261011`, branch `task/e15-aoe-lineage-20261011` (pushed). Keep it until the test read. |
| Residual rows (never committed) | `/opt/data/sdn-archive/e15-aoe-lineage/rows/<window>/<issue>/<target>.<truth>.jsonl`; counts per target and truth in `rows/coverage/` |
| Runner logs | `/opt/data/sdn-archive/e15-aoe-lineage/logs/daily-<day>.log` (cron output: `logs/daily.nohup.out`) |
| Starlink names registry, Spire download ledger, converted LEO-POD/SLR products | `/opt/data/sdn-archive/e15-aoe-lineage/{registry, spire-ledger.jsonl, reference, products}` |
| Run manifests | `runs/` of the worktree; committed copies under `results/e15/` |

## What each daily run does

Cron (owner's crontab, tag `e15-aoe-lineage-daily`) runs `node experiments/e15-aoe-lineage/daily.mjs` from the worktree at 00:01 local: 04:01 UTC until 11-01, 05:01 UTC after. A date guard limits it to 10-12 through 11-04. The KY pull runs at 01:07 UTC.

1. Polls SpaceX's manifest every 30 min (names only).
2. Reads, in memory, the operator files that are replaced in place: Planet, CMSE, Intelsat/SES IESS-412, NASA ISS.
3. Waits, until 18:00 UTC at the latest, for three things:
   - that day's KY `run.json`;
   - Space-Track creations through 04:00;
   - a manifest listing a Starlink version that starts after 04:00.
4. Fetches the Starlink versions that start in the hour before 04:00 and were published by then.
5. Scores the target day for h = 0, 1, 3, 7 where the issue lies in a window. Methods are AOE-latest, ST-latest and SupGP-latest (descriptive).
6. Converts newly published LEO-POD and SLR products, using the modules' `fetch-reference-products.mjs`.
7. Backfills earlier target days from published products:
   - GNSS from ESA rapid (about +1 d) and GFZ MGEX (about +2 d);
   - Spire and PlanetiQ from EUMETSAT (same day, about +3 h, at most 300 MB a day);
   - LEO-POD and SLR, rescored as more products appear.
8. Test-window rows are written only while `config.json` and PLAN.md are committed and unchanged. Never leave them modified in this worktree.

## After the 10-12 04:01 UTC run, check

- `logs/daily-2026-10-12.log`:
  - an `AOE snapshots 2026-10-11, 2026-10-12` line;
  - per-source `… rows` lines (starlink, planet, css, geo, iss = 0);
  - `gnss-esa 2026-10-11` backfilled (ESA's rapid file appears about 01:45 UTC);
  - no `stopped waiting` line: that would mean a missing AOE day, so tell the coordinator.
- `hac/spacemapper-aoe/2026/2026-10-12/orbits-KY/run.json`: finished before 04:00? The issue-day table should show 0 AOE sets not retrieved by T.
- Starlink truth depends on SpaceX's 7-hour sweep phase. A day with few versions in 03:00–04:00 is expected. Read the `noVersionInHour` and `publishedAfterTarget` counts in `rows/coverage/<day>.starlink.json`.
- Refresh the TRAIN interim:
  1. `node experiments/e15-aoe-lineage/evaluate.mjs --window train`, which writes `results/e15/<run>/` and the README;
  2. delete the superseded `results/e15/e15-aoe-lineage-evaluate-train-*` directory;
  3. commit with `GRAPH_GUARD_OVERRIDE=… GRAPH_PROTOCOL_GENERATION=main:65bfe5c174aebde03cb6c0dab819ce4c4011ec9f`, then push.

## Dates

| When | What |
| --- | --- |
| 10-13 | L2 first measurable (three train days per object, A2) |
| 10-21 | last train target (issue 10-14, h = 7) for operator truth |
| about 10-23 | train GNSS complete (GFZ lag) |
| weeks later | train LEO-POD and SLR (Sentinel-1 about 20 d; DORIS about 4 weeks) |
| 11-04 04:00 UTC | last test target (issue 10-28, h = 7); `config.testRead.notBeforeUtc` |

## Selection and the test read

1. After train GNSS is complete (about 10-23), run `node experiments/e15-aoe-lineage/evaluate.mjs --window train --select`.
   - It writes `results/e15/selection.json`: the SEL ranking, the FUS weights and the L2 verdicts.
   - Commit it.
   - Rerun `--select` and commit again if late LEO-POD/SLR train cells arrive. This must happen before the test read.
2. The test read: once only, not before 11-04 04:00 UTC, and after the test truth the read will use is in.
   - GNSS for 11-04 lands about 11-06. Decide a cutoff for LEO-POD/SLR and state it.
   - Check that `config.json`, PLAN.md and `selection.json` are committed and clean.
   - Run `node experiments/e15-aoe-lineage/evaluate.mjs --window test --planned-read`.
   - Commit `results/e15/<run>/` and the README.
   - The guard in `lib/windows.mjs` refuses anything earlier or anything not committed.
3. Lineage check: `node experiments/e15-aoe-lineage/lineage.mjs` (train snapshots only).

## State at parking (TRAIN interim, issue 10-11, h = 0)

**AOE-latest / ST-latest, paired:**
- LEO-SL: 18.9 [16.7, 21.6] (2755 Starlink).
- GEO: 2.84 [1.77, 4.07] (76).
- LEO-PL, LEO-SP and CSS: AOE errors of thousands of km. The AOE sets are 36 to 83 days old (median).

**A7, matched set age, LEO-SL:**
- 1.07 [0.70, 1.55] under 0.5 d.
- 1.03 [0.80, 1.26] at 0.5–1 d.

**Lineage check:** AOE sets sit a median 1.70 km from Space-Track's newest set at AOE's write time; 1.5 % are within 100 m.

**Coverage problems:**
- ISS: left out (A6).
- GNSS, LEO-POD and SLR: not yet published.
- SES S3: a 403 on one file disables the host for the run (the SupGP pass's politeness rule).
