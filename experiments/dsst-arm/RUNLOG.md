# DSST arm: run log

Registration `DSST.md`, amended 2026-11-05 (review 2); rows under `/opt/data/sdn-archive/operator-theory/dsst-arm`.

- 2026-11-05 05:15Z: first launch on driver 4ca191f76fb6; 529 rows kept apart in `defect-20261105T0516/` (amendment 2, 1).
- 2026-11-05 11:38Z: rerun on the corrected driver. Accuracy: precise-orbit stores in 5 JVMs (nice 10), paused by a load governor whenever the 1-minute load passed 45; operator-file stores queued behind them. Cost: one JVM, one window at a time, single thread.
- 2026-11-05 13:39Z: cost phase complete: 326 rows over the registered subsample (precise-orbit 186, operator-file 140) and 8 process summaries (`cost-*.json`).
- 2026-11-05 13:43Z: suspended at the coordinator's order (website first; machine saturated). Every DSST process stopped with SIGSTOP; no new fit starts until the coordinator resumes the lane.

Rows written at the suspension (scored, failed, unscored):

| Store | Rows | Scored | Failed | Unscored |
|---|---:|---:|---:|---:|
| ap/b051/regimes | 176 | 97 | 49 | 30 |
| ap/b051/truth | 64 | 42 | 22 | 0 |
| ap/b051/truth2 | 150 | 129 | 19 | 2 |
| ap/b051/regimes-hx, regimes-wa | 0 | | | |
| ap/b0411/laser/forward, providers | 0 | | | |
| cost, all stores | 326 | 181 | 87 | 58 |

Remaining accuracy fits: about 5,060 precise-orbit and 5,900 operator-file (2,015 laser pairs, 1,856 provider pairs, 37 ISS pairs, at the cells' fits; `pair-fits.mjs --dry` counts them).

- 2026-11-05 13:47Z: the stopped run's processes ended (SIGKILL on the lane's own process groups); its 390 accuracy and 326 cost rows moved to `superseded-20261105T1343/` (DSST.md, amendment 2026-11-05 (review 2), 5). The store holds no row; the run resumes from the first window on the coordinator's word.
- 2026-11-05 21:00Z: run on the grid-check driver (`91a383a`): one accuracy chain and the cost JVM, the governor at 35/30.
- 2026-11-05 22:18Z to 00:44Z: 4, then up to 7 accuracy chains (one JVM per store); the governor at 48/40 from 22:45Z, with disk (25 GiB) and memory (16 GiB) guards from 22:46Z.
- 2026-11-06 00:55Z: re-laid so the large stores run on several JVMs: laser pairs 3, truth2 2, regimes then regimes-hx then regimes-wa 1, ISS pairs then provider pairs then truth 1. Chains A to C stopped right after a row; chains D to F, in the autoscaler's process group, stopped mid-window (their windows in flight lost; every rows file parses).
- 2026-11-06 01:10Z: the cost JVM stopped by exact PID (above the 5-JVM bound since 00:57Z); its 72 rows superseded (DSST.md, amendment 2026-11-06 (memory), 1).
- Heap bounds (amendment 2026-11-06 (memory), 3): accuracy runners started after its commit run `-Xmx16g`; the laser-pair and truth2 runs started 00:56Z keep the default bound.
- 2026-11-06 07:05:58Z: the coordinator set `governor.conf` to "0 0", so the governor paused (SIGSTOP) every accuracy JVM (PIDs 50493 50509 50526 35815 50436 50371 50387; governor.log "load 19.21 disk 66 GiB: paused …") for the cost-benchmark lane's quiet window (SDN-AP ruling: the benchmark's machine rule must hold in fact; experiments-cost-benchmark-remeasure-shipped-build-20261105).
- 2026-11-06 07:19:17Z: the governor resumed all seven accuracy JVMs (`governor.conf` back to "48 40" at 07:19:15Z; governor.log "load 11.79: resumed"): a pause of 13 min 19 s (07:05:58Z to 07:19:17Z), the cost-benchmark lane measuring from 07:12:32Z to about 07:19Z. The accuracy chains lose about 13 minutes of wall time against the record's roughly 4 h margin. Revised finish from the chains' progress at 07:19Z (rows since the 00:56Z re-lay, 6.4 h): laser pairs 419 of 4,030 rows (59 rows/h on 3 JVMs, about 61 h left, about 2026-11-08 20:30Z); truth2 267 of 3,624 (31 rows/h on 2 JVMs, slower than the 46/h first measured, its 72 h fits included; about 108 h left, about 2026-11-10 19:00Z); regimes 120 of 654 then regimes-hx and regimes-wa (about 56 h); ISS pairs complete (74), provider pairs 151 of 3,712 then truth (about 86 h, about 2026-11-09 21:00Z). Truth2 is now the longest chain: as laid out, the run finishes about 2026-11-11 01:00Z with the nightly backups' pauses, past the 2026-11-10 12:00Z date; with truth2 re-laid onto the laser pairs' 3 JVMs when they finish (about 2026-11-08 20:30Z, at a row boundary; 5 JVMs on its remaining about 1,470 rows, about 19 h), about 2026-11-10 03:00Z, inside it. That re-lay is open for the coordinator.
- Rebased registration pushes. Four pushes rebased their commits onto origin/main; every original still exists and is tagged at its chain head (`registered/experiments-dsst-arm-registration-20261105-<yyyymmdd>-<original>`, the original's short SHA added because two pushes fall on each date). Main commit (committer date) from original (committer date):
  - `0c53270a56060dd381594ee2c26b2fb6c5cffab1` (2026-11-05T00:14:57-05:00) from `ba61151b5ef72e090dd9674ecd8183a1b9dbb7cb` (2026-11-05T00:14:57-05:00), Amendment 2026-11-05 (review); tag `-20261105-ba61151`.
  - `26d5d330a9e7b24c4c84bb876c22822746c33fd7` (2026-11-05T15:31:48-05:00) from `5c97cb9f82e00b3d2f46a23ab5f7dd5b20f07ab2` (2026-11-05T08:43:12-05:00), run log at the suspension, and `d99a3fd96ea3f2af3ca8c4680cc4085d43247d2d` (2026-11-05T15:31:49-05:00) from `133363a0ceac129c54f546d57892f4c1985433d7` (2026-11-05T08:51:47-05:00), Amendment 2026-11-05 (review 2); one push, tag `-20261105-133363a` on its head.
  - `d02ae131e9a65b4ed8da09c70e78c350ca3b79a6` (2026-11-05T20:31:05-05:00) from `8673dcc4463e21e6af93fda05a50f12cf06f0ead` (2026-11-05T20:31:01-05:00), Amendment 2026-11-06 (memory); tag `-20261106-8673dcc`.
  - `39094e4923c6f241dd1dc3c92ee066d279fe1467` (2026-11-05T22:54:39-05:00) from `398fd77c2338e72df28001661905249fd53452c5` (2026-11-05T22:54:37-05:00), Amendment 2026-11-06 (heap calibration result); tag `-20261106-398fd77`.
  Every other registration commit reached main unrebased, with its own committer date.
- 2026-11-06 07:45Z, the plan to the whole DSST figure set (approved by the coordinator; the earliest of three that keeps the registered conditions). From the chains' rates at 07:19Z: laser pairs 61 h on 3 JVMs; truth2 108 h on 2, or, moved onto the laser pairs' 3 JVMs when they finish, the two together 400 JVM-hours on 5 JVMs, 80 h; regimes then regimes-hx and regimes-wa 56 h on 1; provider pairs then truth 86 h on 1, the longest chain; about 6 h for the nightly backups' disk-guard pauses; the cost phase about 14 h on one JVM beside at most 5 accuracy JVMs; the tables, E2E and gauntlet about 2 h.
  - (a) Cost now: two accuracy JVMs off the critical path are held paused for the cost phase (the regimes JVM, whose chain has about 30 h of slack, and one of the 3 laser-pair JVMs), leaving 5. Regimes then ends about 2026-11-09 05:00Z; the laser and truth2 pool loses 14 JVM-hours (about 3 h); the provider-pair and truth chain is untouched. Accuracy rows about 2026-11-10 03:00Z, cost about 2026-11-06 22:00Z, figures about 2026-11-10 05:00Z.
  - (b) Cost after the laser pairs end, truth2 on 4 JVMs during it (truth2 4, provider pairs 1; regimes done by then): cost 2026-11-08 20:30Z to 2026-11-09 10:30Z; truth2 ends about 2026-11-09 20:00Z; accuracy rows about 2026-11-10 03:00Z, figures about 2026-11-10 05:00Z, with the cost rows in the last day.
  - (c) Cost after every accuracy row: about 2026-11-10 03:00Z to 17:00Z; figures about 2026-11-10 19:00Z.
  - Chosen: (a), the earliest date with the cost rows measured first. Armed unattended: the governor with a hold list (`governor3.sh`), `cost-window.py` (holds the two JVMs by exact PID, runs `costall.sh` once both are stopped, releases them when it exits), and `move-truth2.py` (truth2 onto 5 JVMs right after a truth2 row once the laser-pair chain has finished). The DSST figure set: about 2026-11-10 05:00Z.
