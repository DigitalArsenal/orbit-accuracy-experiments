# Per-object inflation (GP covariance realism, Part 2)

Registration: `experiments/covariance-every-object/PLAN.md`. Part 1 (strata labels) is `experiments/gp-covariance-strata/PLAN.md`.

Files here are stratum-level aggregates only: no element set, no per-set value and no per-object value. Per-object files are under `/opt/data/sdn-archive/covariance-every-object/`, each hashed in this directory (`manifest.json` for issue days, `frozen-constants.json` for dev values).

- `denominators.json`: a_{s,b,k}, the pooled unclipped second moment of the set-to-set residual per regime and age bin, from the dev truth objects on lawful spans. Unclipped as registered. Per stratum and axis, `top10` gives the share of the moment carried by the ten largest pairs and the clusters they come from. Where that share is near 1 (all of MEO, LEO-H from 2.5 d, LEO-M from 0.25 d, LEO-L from 2.5 d), a few pairs set the denominator; the admission rule decides whether such a bin is used.
- `provenance-audit.json`: counts for acceptance (d).
- `n0-rows.json`: the n0 simulation, provisional until Part 1 states its block length and admitted bins.
- `frozen-constants.json`: constants and hashes; items needing Part 1 read PENDING.

One early name scan of a single day's creation file used a loose pattern and printed object names, some of them Starlink names (names only, no element or state values); nothing from it entered any computation, and the script was deleted.

Contains modified Copernicus Sentinel data (2025-2026).

WAAS MT9 data: NASA Crustal Dynamics Data Information System (CDDIS).

`daily/2026-10-20.json` and its `manifest.json` entry are a smoke test of the daily job on an archived day (first 150 objects of each of 8 workers), not an issue day.

The daily catalog applies the same row predicate as the dev rows, so the ISS, Swarm, GRACE-FO and the other C2 calibration objects are absent from it.

## Part 1's lists, placements and regimes

The dev truth objects are Part 1's 113 placements. Against this file's earlier table, 8 NORADs dropped out (ISS, four COSMIC-2, three WAAS) and 12 entered on the ESA span. A pair's regime follows Part 1's definition (un-Kozai'd mean altitude, WGS-72). Four objects have a few pairs outside their Part 1 regime, all as HEO (a set with eccentricity at or above 0.25): 44709 (1 of 2,847 pairs), 62876 (3 of 6,418), 64202 (10 of 1,080) and 67588 (1 of 297); no object changes stratum otherwise.

## Admission, n0 and S2 on Part 1's dev rows

- `admission.json`: cell-level SD of ln(pair moment / truth moment) over clusters, per regime, age bin and axis.
- `n0-rows.json`: the n0 simulation with Part 1's block length (median over strata with an admitted bin) and the admitted bins.
- `dev-s2.json`: S2.1 null and power, and the S2.1 to S2.3 evaluators on Part 1's dev rows. These are dev numbers for the freeze record; the states for the test read PENDING until each stratum's open date.
