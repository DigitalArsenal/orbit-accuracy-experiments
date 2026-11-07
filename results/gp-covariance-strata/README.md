# GP covariance realism, Part 1: label every stratum

Plan: `experiments/gp-covariance-strata/PLAN.md` (registered 2026-11-03 before any row was read). Check: `env SDN_MODULES_ROOT=<modules checkout> node experiments/gp-covariance-strata/run.mjs --check`. Stratum-level aggregates and identifiers only; no element set and no per-set value is committed.

Contains modified Copernicus Sentinel data (2025-2026).

WAAS MT9 data: NASA Crustal Dynamics Data Information System (CDDIS).

## Status at the freeze

- The dev rows are 2,347,425 samples (35 further samples were dropped because the module's age fell outside the bin edge by under 9 s): five ages per set and age bin (0, 1/4, 1/2, 3/4, 1 of the bin width), each snapped to the truth grid within +-10 minutes and kept inside its bin, e = SGP4(set, AFSPC) minus truth in the truth RTN axes, P_truth = 0. Truth: ESA finals (GPS, GLONASS, BeiDou, QZSS), ILRS combined (LAGEOS-2, Etalon-1/2), Swarm A/B/C, GRACE-FO 1/2, Sentinel-1A/C, COSMIC-2 (44349, 44351, 44353, 44358) and DORIS (CryoSat-2, SARAL, Sentinel-3A/B, SWOT, HY-2C/D, Jason-3, Sentinel-6A/B).
- Regime placement is the module's rule, per set: Sentinel-3A/B are LEO-M, BeiDou GEO/IGSO and QZS-3 are GEO, one GNSS object appears in HEO for 5 rows (no cell). The regime of every object is in `frozen-constants.json` (`placements`).
- Candidates R0 and R2 per regime, leave-one-cluster-out; the frozen pick, pass rates and the frozen P_strat (3x3 RTN position block, km^2, per regime and age bin) are in `frozen-constants.json`. The tie rule (R0 times the smallest c >= 1 with c R0 >= R2) fired in LEO-H (c 1.66).
- **Two label rules are frozen side by side (amendment 1 of PLAN.md).** S1 is the registered rule: 95 % coverage in [0.93, 0.97] on the whole bin and on each half, 99 % coverage at least 0.975, and every axis in [0.93, 0.97] with |mean z| <= 0.5 under O1(b). S1p is the powered rule: 95 % coverage within 0.95 +- 2 SE (SE from the cluster-block bootstrap at the frozen n_eff), 99 % coverage at least 0.975, each half-bin at least 0.90, and the pooled per-axis share within 0.95 +- 2 SE (O1(a); the per-axis condition (b) is reported as `l3bRate`). S1p exists because S1 has no power at these cluster counts: when the covariance is correct S1 labels it at most 31 % of the time, so a failure to label says nothing about the covariance. A label under S1p reads "coverage-calibrated under the powered rule". Nothing under S1 is replaced.
- **TESTABLE counts: 0 under S1 and 0 under S1p** at the recorded owner answers (below), with the gate at P(label | correct) >= 0.8 and C_min at max(3, ...). COSMIC-2 adds 4 clusters (one per orbit plane: ascending nodes 41, 156, 273 and 338 degrees) to LEO-M with 60,368 dev rows; LEO-M's dev fit (R0, leave-one-cluster-out pass rate 0.16 against R2 0.13) and P_strat are refit on its 8 clusters, and its fresh pool is CryoSat-2, SARAL, Sentinel-3A/B, Sentinel-1C and the four COSMIC-2 planes. The best operating characteristics are S1p's in LEO-M at ages [0, 0.25) and [0.25, 0.75) d: P(label | correct) 0.78 and 0.80 against the 0.80 gate (0.798 in the second), with P(label | x0.7) 0.00 in both. Under S1 the best is 0.20 (MEO). The per-stratum operating characteristics under both rules are in `frozen-constants.json` (`oc`, `s1p.oc`).
- **Owner answers (recorded through the coordinator; the owner delegated the choices, 2026-11-04).** O5 yes (2026-11-03). O3 yes: fresh Sentinel-1C and COSMIC-2 truth are admitted on their open dates under the R6 reading (same public files, no C2 row, no FFM, nothing fed back); the COSMIC-2 back-fill is authorized on O5's terms and a collector is added if the numbers show it matters. O1 (b), O2 coverage-calibrated, O4 no (the sensitivity table shows releasing Swarm and GRACE-FO buys nothing), S3 on the default wording at 2026-11-07 12:00 UTC. The gate stays at 0.8 and C_min at 3: no gate moves to buy a label. With no TESTABLE stratum the study freezes as registered, labels nothing and measures everything: issue days 2026-11-10 to 2026-12-06 run and each stratum is scored on its open date. A power registration (part 1b) is filed separately by the coordinator.
- LEO-L (Swarm, GRACE-FO, ISS held) and HEO (no usable dev truth) are NO LAWFUL TRUTH.
- **S3: the honest limit as stated is withdrawn: at the smallest covariance the truth does not reject, a zero-miss pair at 5 days in drag LEO can exceed Pc 1e-4.** At s_lo the Pc at zero miss with HBR 20 m is 1.12e-4 (LEO-L) and 4.48e-4 (LEO-M, s_lo 0.92 after the amendment 3 refit; the 5.7e-4 of amendment 1 predates it), both at 170 degrees; the limit 1e-4 is not met. The limit is withdrawn and nothing is tuned. HBR 10 m and 30 m, the core sizes and s_lo are in `frozen-constants.json` (`s3`). Wording: for payload-class error; debris holds only if debris error >= payload error (V10). `s3.ruling` in `frozen-constants.json` records the default applied on 2026-11-07 under the owner's delegation; `run.mjs --check` reports S3 as FAILED-WITHDRAWN and exits 0.
- S5: c >= 1 in all 35 strata with a frozen cell; the factors are large where the older models are wide (largest 201, bound by the 2026-08 gate model's eccentric stratum); the audit min eig(c P_new - P_m) >= -1e-12 |P_m| holds for every replaced model. Strata without a cell (HEO) ship the replaced models unchanged.

## Readings recorded

- LAGEOS-2 and Etalon-1/2 are held from 2026-06-01 as C2 calibration objects: this is this lane's reading of C2's table (R3 lists them); PLAN.md names them only through "C2 calibration objects".
- O3 yes (PLAN.md section 12): Sentinel-1C and COSMIC-2 are fresh sources. Sentinel-1A truth ended 2026-07, so it stays in the dev fit and leaves the fresh pool. COSMIC-2's latency is not measurable (its feed ended before the seal); the open date assumes 3 d, which does not bind because DORIS's 29.2 d is larger.
- k^2 (R0) and the axis scales (R2) are fitted through the interpolation lookup; coverage through the stratum (step) lookup is reported beside it (`dev.stepLookupC95`). R2 is the per-axis variant: each axis scale puts that axis' |z| <= 1.96 share at 0.95.
- GEO dev truth is the ESA finals' GEO/IGSO objects and QZS-3. WAAS dev rows are not built: no module converts the broadcast messages to reference states and no physics is written in JavaScript. The fresh GEO label therefore depends on that module and on O5.
- Fresh truth: O5 is answered (owner, 2026-11-03). ESA finals, ILRS, Sentinel-1 POEORB, DORIS and GFZ Kp are back-filled by a daily job and sealed on arrival; the freeze pins the first seal (`frozen-constants.json` `seal`, SHA-256 e92767243264...). Truth is read through the seal (names, dates and SHA-256) until a stratum's open date, and each stratum is scored once on its open date. Open dates use the latencies measured from the seal (`v-checks.json` V3; PLAN.md section 11): ESA 4.2 d, ILRS 17.2 d, Sentinel-1 19.3 d, DORIS 29.2 d (LEO-M) and 32.2 d (LEO-H), with the C3 R3 interlock taken as 2027-01-20. The fresh GEO label also depends on a module that converts WAAS broadcast messages, which does not exist yet; GEO's ESA-based strata do not depend on it.
- DORIS for HY-2C/D, Jason-3 and Sentinel-6A/B was converted with the reference-states script extended by those satellites; their arcs have no overlapping neighbor, so the module's stated sigma is a flagged placeholder that is never read (P_truth = 0).

## Dev-rows file for Part 2

`/opt/data/sdn-archive/gp-covariance-strata/dev-rows/<NORAD>.jsonl.gz` (114 files) plus `manifest.json` (SHA-256 and row count per file; copy committed as `dev-rows-manifest.json`). One row per object-day sample, gzip JSON lines:

`{norad, setEpoch, sampleEpoch, ageDays, bin, half, regime, cluster, block, e:[R,T,N], z:[zR,zT,zN], d2}`

- `e` is SGP4 minus truth in the truth RTN axes, km, unrounded doubles; `half` is 0 for the lower half of the bin by age, 1 for the upper; `block` is floor(days since 2024-01-01 / the stratum's block length); `z` and `d2` are under the frozen P_strat through the interpolation lookup (`null` where a regime has no cell). The covariance used at the sample is `interp(pStrat[regime], ageDays)` as in `lib/stats.mjs`.
- The regime definition text is `regimeDefinition` in `frozen-constants.json`; the frozen P_strat per stratum is `pStrat`.
- The files are per-object and stay under AR; the public repository holds only the manifest.

## Sensitivity of the TESTABLE count to the levers (numbers only)

Each row changes one lever of the frozen record and keeps the fresh pools and lawful spans; no new truth is read. File: `sensitivity.json`. The O3 lever is now in the baseline (it was computed before as a lever: 0 and 0 without COSMIC-2).

| Change | S1 TESTABLE | S1p TESTABLE |
|---|---|---|
| As frozen (O5 yes, O3 yes, O4 no; P(label \| correct) >= 0.8; C_min floor 3) | 0 | 0 |
| O4 yes, Swarm and GRACE-FO (LEO-L strata on their 3 clusters) | 0 | 0 |
| C_min floor 2 | 0 | 0 |
| P(label \| correct) >= 0.5 | 0 | 3 (LEO-M ages [0, 0.25) and [0.25, 0.75) d; MEO [0, 0.25) d) |

Largest P(label | correct) by regime: S1 LEO-L 0.08, LEO-M 0.14, LEO-H 0.17, MEO 0.20, GEO 0.00; S1p LEO-L 0.78, LEO-M 0.80, LEO-H 0.82, MEO 0.52, GEO 0.37 (LEO-H and LEO-L miss on the too-small side: P(label | x0.7) above 0.05).
