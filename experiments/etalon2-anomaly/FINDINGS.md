# The Etalon-2 truth anomaly

## Cause

The truth product is at fault, not the element sets or the pairing. The ILRS combined weekly orbit (`ilrsa.orb.etalon2.261010.v80`, the week of 2026-10-04 to 10-10) has one wrong state on each of 2026-10-05, 10-06, 10-08, 10-09: at 00:00 of those days its X coordinate is written as zero, 2,127 to 13,580 km from the orbits of every analysis center of the same week (asi, bkg, cnes, dgfi, esa, gfz, jcet, nsgf), which agree with each other within 2.0 m there. Every other state of the week agrees with them. These are the 7,552 and 13,580 km errors V1c5 reports.

The combination alone shows it: the full force model carried from the last state of the week before (2026-10-03T23:45:00.000000Z) stays within 51 m of every other 2-hourly state of the week, and is 7,552 km, 13,580 km, 2,127 km, 7,897 km from the states at 10-05T00:00, 10-06T00:00, 10-08T00:00, 10-09T00:00.

The same fault, in 210 combined weeks of LAGEOS-1, LAGEOS-2, Etalon-1 and Etalon-2 compared (251004 to 261010, every center that publishes the week; rule: the combination more than 1 km from the centers' median while the centers agree within 10 m):

| Satellite | Week | Wrong state | Coordinate written as zero | Combination from the centers (km) | Spread of the centers (m) | Centers |
| --- | --- | --- | --- | --: | --: | --: |
| etalon1 | 260411 | 2026-04-10T00:00:00Z | X | 9,998 | 1.2 | 7 |
| etalon1 | 260530 | 2026-05-25T00:00:00Z | Y | 3,058 | 1.2 | 8 |
| etalon1 | 260530 | 2026-05-29T00:00:00Z | Y | 3,119 | 1.5 | 8 |
| etalon2 | 260411 | 2026-04-10T00:00:00Z | X | 8,134 | 1.4 | 7 |
| etalon2 | 261010 | 2026-10-05T00:00:00Z | X | 7,552 | 1.8 | 8 |
| etalon2 | 261010 | 2026-10-06T00:00:00Z | X | 13,580 | 1.6 | 8 |
| etalon2 | 261010 | 2026-10-08T00:00:00Z | X | 2,127 | 1.5 | 8 |
| etalon2 | 261010 | 2026-10-09T00:00:00Z | X | 7,897 | 2.0 | 8 |

Every other week (206) agrees with the centers within 1.4 m.

## Effect on the results

- **V1c5.** Its truth is interpolated through the six nearest states, so a wrong state reaches the samples within 45 min of it; 1 test, 3 cross-validation and 3 training samples of Etalon-2 lie within 1 h of a wrong state. Without them the result is the same: the selected model P-axes-mle/risk/UNFLAGGED is still selected by the cross-validation (P-axes-mle/risk/UNFLAGGED), and it holds 0 of 24 cells realistic with the frozen model and 0 of 24 refitted without the samples (published: 0 of 24). The SLR MEO cells stay insufficient (fewer than 30 samples); over all samples their mean d²/3 at 1, 6 and 12 h moves from 0.66, 0.73, 0.74 to 0.58, 0.73, 0.74. V1c5's results are unchanged; its Etalon-2 samples near those states are wrong truth and are labeled here.
- **V1c4.** Its test window (issues 2026-09-27 to 10-08, horizons to 72 h) reaches 2026-10-05, 10-06 and 10-08 with the same product, so its SLR MEO cells carry the same wrong truth (the very large SLR MEO means of V1c4's README). Its durable run is not on this machine, so those cells are labeled here, not re-scored.
- **G1, B1 (the SDN-AP paper's baselines), B2 and the GP-history experiment.** Not affected: their Etalon windows use the weeks of 2025-09 to 2025-10 and 2026-09-06 to 2026-10-03, all of which agree with the centers (G1's copy of the 2026 weeks, from CDDIS, has no week 261010).
- **E16 and E2b.** Their windows include 2026-04-10 and 2026-05-25 to 05-29 with Etalon truth from the same combination; any Etalon sample within an hour of those states carries the same fault. They are not re-scored here.

## Reproduce

```sh
node experiments/etalon2-anomaly/compare.mjs /opt/data/sdn-archive/v1c5/truth/download-cache/products /opt/data/sdn-archive/reference-states/products > experiments/etalon2-anomaly/findings.json
node experiments/etalon2-anomaly/rescore-v1c5.mjs experiments/etalon2-anomaly/findings.json > experiments/etalon2-anomaly/rescore-v1c5.json
SDN_MODULES_ROOT=<modules checkout> node experiments/etalon2-anomaly/continuity.mjs > experiments/etalon2-anomaly/continuity.json
node experiments/etalon2-anomaly/report.mjs
```

The products are the ILRS combination and the analysis centers' SP3 orbits from the EUROLAS Data Center (https://edc.dgfi.tum.de/pub/slr/products/orbits/TRF/<satellite>/<yyyy>/<yymmdd>/), as V1c5's truth fetch and analysis/reference-states downloaded them; ILRS data are not copyrighted (citation requested).
