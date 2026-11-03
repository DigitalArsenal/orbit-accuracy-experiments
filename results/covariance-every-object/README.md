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
