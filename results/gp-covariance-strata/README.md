# GP covariance realism, Part 1: label every stratum

Plan: `experiments/gp-covariance-strata/PLAN.md` (registered 2026-11-03 before any row was read). Check: `env SDN_MODULES_ROOT=<modules checkout> node experiments/gp-covariance-strata/run.mjs --check`. Stratum-level aggregates and identifiers only; no element set and no per-set value is committed.

Contains modified Copernicus Sentinel data (2025-2026).

WAAS MT9 data: NASA Crustal Dynamics Data Information System (CDDIS).

## Status at the freeze

- The dev rows are 2,287,092 samples: five ages per set and age bin (0, 1/4, 1/2, 3/4, 1 of the bin width), each snapped to the truth grid within +-10 minutes and kept inside its bin, e = SGP4(set, AFSPC) minus truth in the truth RTN axes, P_truth = 0. Truth: ESA finals (GPS, GLONASS, BeiDou, QZSS), ILRS combined (LAGEOS-2, Etalon-1/2), Swarm A/B/C, GRACE-FO 1/2, Sentinel-1A/C, and DORIS (CryoSat-2, SARAL, Sentinel-3A/B, SWOT, HY-2C/D, Jason-3, Sentinel-6A/B).
- Regime placement is the module's rule, per set: Sentinel-3A/B are LEO-M, BeiDou GEO/IGSO and QZS-3 are GEO, one GNSS object appears in HEO for 5 rows (no cell). The regime of every object is in `frozen-constants.json` (`placements`).
- Candidates R0 and R2 per regime, leave-one-cluster-out; the frozen pick, pass rates and the frozen P_strat (3x3 RTN position block, km^2, per regime and age bin) are in `frozen-constants.json`. The tie rule (R0 times the smallest c >= 1 with c R0 >= R2) fired in LEO-H (c 1.68).
- **No stratum reaches TESTABLE.** In every regime the operating characteristic fails: P(label | correct) is at most 0.31 (the half-bin gate, the 99 % point and the per-axis condition all bind), so C_min is undefined. Under the registered defaults O5 is also not granted, which makes every fresh product unavailable. `outcome` follows the recorded owner answers and `outcomeIfO5` shows the verdict with O5 granted; both are NOT TESTABLE.
- LEO-L (Swarm, GRACE-FO, ISS held) and HEO (no usable dev truth) are NO LAWFUL TRUTH.
- **S3 FAILED: owner ruling required.** At s_lo the Pc at zero miss with HBR 20 m is 1.1e-4 (LEO-L) and 5.8e-4 (LEO-M), both at 170 degrees; the limit 1e-4 is not met. The limit is withdrawn and nothing is tuned. HBR 10 m and 30 m, the core sizes and s_lo are in `frozen-constants.json` (`s3`). Wording: for payload-class error; debris holds only if debris error >= payload error (V10). `run.mjs --check` prints the registered line and exits 2 until the owner rules.
- S5: c >= 1 in all 35 strata with a frozen cell; the factors are large where the older models are wide (largest 209 in LEO-H 4-6 d, bound by the 2026-08 gate model's eccentric stratum); the audit min eig(c P_new - P_m) >= -1e-12 |P_m| holds for every replaced model. Strata without a cell (HEO) ship the replaced models unchanged.

## Readings recorded

- LAGEOS-2 and Etalon-1/2 are held from 2026-06-01 as C2 calibration objects: this is this lane's reading of C2's table (R3 lists them); PLAN.md names them only through "C2 calibration objects".
- O3 default: Sentinel-1C and COSMIC-2 are not fresh sources (their open date depends on C2's score date, which C2's table does not state). Sentinel-1C stays in the dev rows; the frozen LEO-M NORAD list excludes it. LEO-M keeps its 4 clusters (CryoSat-2, SARAL, Sentinel-1A, Sentinel-3A/B).
- k^2 (R0) and the axis scales (R2) are fitted through the interpolation lookup; coverage through the stratum (step) lookup is reported beside it (`dev.stepLookupC95`). R2 is the per-axis variant: each axis scale puts that axis' |z| <= 1.96 share at 0.95.
- GEO dev truth is the ESA finals' GEO/IGSO objects and QZS-3. WAAS dev rows are not built: no module converts the broadcast messages to reference states and no physics is written in JavaScript. The fresh GEO label therefore depends on that module and on O5.
- Fresh-truth parts are PENDING by design until O5 (existing collectors back-fill ESA finals, DORIS, S1 POEORB, ILRS, GFZ Kp, sealed on arrival) and the module converter exist. Open dates follow PLAN.md section 4 with measured or assumed latencies; the C3 R3 interlock is taken as 2027-01-20.
- DORIS for HY-2C/D, Jason-3 and Sentinel-6A/B was converted with the reference-states script extended by those satellites; their arcs have no overlapping neighbor, so the module's stated sigma is a flagged placeholder that is never read (P_truth = 0).

## Dev-rows file for Part 2

`/opt/data/sdn-archive/gp-covariance-strata/dev-rows/<NORAD>.jsonl.gz` (114 files) plus `manifest.json` (SHA-256 and row count per file; copy committed as `dev-rows-manifest.json`). One row per object-day sample, gzip JSON lines:

`{norad, setEpoch, sampleEpoch, ageDays, bin, half, regime, cluster, block, e:[R,T,N], z:[zR,zT,zN], d2}`

- `e` is SGP4 minus truth in the truth RTN axes, km, unrounded doubles; `half` is 0 for the lower half of the bin by age, 1 for the upper; `block` is floor(days since 2024-01-01 / the stratum's block length); `z` and `d2` are under the frozen P_strat through the interpolation lookup (`null` where a regime has no cell). The covariance used at the sample is `interp(pStrat[regime], ageDays)` as in `lib/stats.mjs`.
- The regime definition text is `regimeDefinition` in `frozen-constants.json`; the frozen P_strat per stratum is `pStrat`.
- The files are per-object and stay under AR; the public repository holds only the manifest.
