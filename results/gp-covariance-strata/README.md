# GP covariance realism, Part 1: label every stratum

Plan: `experiments/gp-covariance-strata/PLAN.md` (registered 2026-11-03 before any row was read). Check: `env SDN_MODULES_ROOT=<modules checkout> node experiments/gp-covariance-strata/run.mjs --check`. Stratum-level aggregates and identifiers only; no element set and no per-set value is committed.

Contains modified Copernicus Sentinel data (2025-2026).

WAAS MT9 data: NASA Crustal Dynamics Data Information System (CDDIS).

## Status at the freeze

- The dev rows are 2,287,057 samples (35 further samples were dropped because the module's age fell outside the bin edge by under 9 s): five ages per set and age bin (0, 1/4, 1/2, 3/4, 1 of the bin width), each snapped to the truth grid within +-10 minutes and kept inside its bin, e = SGP4(set, AFSPC) minus truth in the truth RTN axes, P_truth = 0. Truth: ESA finals (GPS, GLONASS, BeiDou, QZSS), ILRS combined (LAGEOS-2, Etalon-1/2), Swarm A/B/C, GRACE-FO 1/2, Sentinel-1A/C, and DORIS (CryoSat-2, SARAL, Sentinel-3A/B, SWOT, HY-2C/D, Jason-3, Sentinel-6A/B).
- Regime placement is the module's rule, per set: Sentinel-3A/B are LEO-M, BeiDou GEO/IGSO and QZS-3 are GEO, one GNSS object appears in HEO for 5 rows (no cell). The regime of every object is in `frozen-constants.json` (`placements`).
- Candidates R0 and R2 per regime, leave-one-cluster-out; the frozen pick, pass rates and the frozen P_strat (3x3 RTN position block, km^2, per regime and age bin) are in `frozen-constants.json`. The tie rule (R0 times the smallest c >= 1 with c R0 >= R2) fired in LEO-H (c 1.66).
- **Two label rules are frozen side by side (amendment 1 of PLAN.md).** S1 is the registered rule: 95 % coverage in [0.93, 0.97] on the whole bin and on each half, 99 % coverage at least 0.975, and every axis in [0.93, 0.97] with |mean z| <= 0.5 under O1(b). S1p is the powered rule: 95 % coverage within 0.95 +- 2 SE (SE from the cluster-block bootstrap at the frozen n_eff), 99 % coverage at least 0.975, each half-bin at least 0.90, and the pooled per-axis share within 0.95 +- 2 SE (O1(a); the per-axis condition (b) is reported as `l3bRate`). S1p exists because S1 has no power at these cluster counts: when the covariance is correct S1 labels it at most 31 % of the time, so a failure to label says nothing about the covariance. A label under S1p reads "coverage-calibrated under the powered rule". Nothing under S1 is replaced.
- **TESTABLE counts.** S1: 0 at the registered defaults and 0 with O5 granted (P(label | correct) is at most 0.31 in every stratum, so C_min is undefined). S1p: 0 at the registered defaults (O5 not granted) and 2 with O5 granted: LEO-M at ages [0,0.25) and [0.25,0.75) d (P(label | correct) 0.86 and 0.85, P(label | x0.7) 0 for both, C_min 3, 4 clusters). Every other stratum fails S1p's operating characteristics. The per-stratum operating characteristics under both rules are in `frozen-constants.json` (`oc`, `s1p.oc`).
- LEO-L (Swarm, GRACE-FO, ISS held) and HEO (no usable dev truth) are NO LAWFUL TRUTH.
- **S3: the honest limit as stated is withdrawn: at the smallest covariance the truth does not reject, a zero-miss pair at 5 days in drag LEO can exceed Pc 1e-4.** At s_lo the Pc at zero miss with HBR 20 m is 1.12e-4 (LEO-L) and 5.7e-4 (LEO-M), both at 170 degrees; the limit 1e-4 is not met. The limit is withdrawn and nothing is tuned. HBR 10 m and 30 m, the core sizes and s_lo are in `frozen-constants.json` (`s3`). Wording: for payload-class error; debris holds only if debris error >= payload error (V10). `run.mjs --check` prints `S3 FAILED: owner ruling required` and exits 2 until `s3.ruling` (the owner's words and date) is in `frozen-constants.json`; then it reports S3 as FAILED-WITHDRAWN and exits 0.
- S5: c >= 1 in all 35 strata with a frozen cell; the factors are large where the older models are wide (largest 201, bound by the 2026-08 gate model's eccentric stratum); the audit min eig(c P_new - P_m) >= -1e-12 |P_m| holds for every replaced model. Strata without a cell (HEO) ship the replaced models unchanged.

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
