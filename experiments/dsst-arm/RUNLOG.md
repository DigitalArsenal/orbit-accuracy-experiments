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
