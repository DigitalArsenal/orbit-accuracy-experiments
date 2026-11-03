# GP covariance realism, Part 1: label every stratum (registration)

Registered 2026-11-03 before any dev or fresh row is read. Task experiments-gp-covariance-strata-20261103. This file carries Part 1 (sections 0, 1, 3 with S1, S3, S4, S5, 4, 5, 6 and 8); section 6 records the owner-question defaults that apply. Part 2's sections (2 and S2.1 to S2.3) are registered in `experiments/covariance-every-object/PLAN.md` by lane claude-covobj-d9 (task experiments-covariance-per-object-inflate-20261103, registered at 0a3a543 on its WIP ref). Nothing has been run.

**Owner ruling, 11-03:** covariance realism is the study, and element-set accuracy is immaterial. No covariance shrinks unless independent truth shows the error shrank.

**Gate.** Owner question O5 (§6) comes first. Without it, zero strata are testable.

**Source key.** AR = /opt/data/sdn-archive. A1-A5 = the lane's pre-registration inventories (error model, truth inventory, per-object signal, prior plans, C3 method); CAD = their cadence table; VER = their skeptic review. DRAFT, COVPROD = the ccb46d52 plans as A4 quotes them; GEMR = `gp-error-model/README.md` as A1/A3 quote it. VENDORS = `experiments/operator-theory/VENDORS.md` on experiments origin/main (commit 0cc5436f, 2026-11-01). The read-only checks of §8 are recorded in `results/gp-covariance-strata/`.

## 0. Frame

**Studied:** P_strat(regime, age), a 3×3 RTN position covariance for a public GP set flown by SGP4 (AFSPC mode) as CA flies it; D_o, a per-object factor that only inflates.

**Strata:** 42 = E14 regimes LEO-L < 500 km, LEO-M 500-800, LEO-H 800-2,000, MEO, GEO (e < 0.25), HEO (e ≥ 0.25) × ages [0,0.25) [0.25,0.75) [0.75,1.5) [1.5,2.5) [2.5,4) [4,6) [6,8] d.

**Holds, never opened (row-level, §3 S4):** Swarm and GRACE-FO truth from 2026-10-31; all Galileo; every Starlink row; C2's held objects and its time hold (from 2026-06-01 for C2 calibration objects: Swarm, GRACE-FO, S1A, S1C, COSMIC-2, ESA GNSS); C3-small's scoring rows; B2 part-1a and part-5; operator captures and AR/operator-theory/vendors beyond names, sizes and dates; ISS truth from 2025-01-01; every `nsgf.orb.*` path; AR/.secrets, UDL and restricted paths.

**Replacement.** One frozen P_strat set replaces the E14 S3-KC and 2026-08 gate models (A1 §1) in one push, after scoring. No fallbacks.

## 1. Part 1: label every stratum

**1.1 Sample.** For each truth object's GP set and age bin, five ages evenly spaced from the bin's lower to upper edge (0, ¼, ½, ¾, 1 of its width; an open upper edge taken 1 min inside). Each age is snapped to the nearest truth epoch within ±10 min, else missing. e = SGP4(set → t) − truth(t), in truth RTN. The covariance at that age comes through CA's exact lookups: `object_covariance`'s interpolation between bin centers, held beyond the last center, and `empiricalPc`'s stratum lookup (A1 §3). Both are called from the module build under `SDN_MODULES_ROOT`; labels need both. [ASSUMED] lookups as A1 reads them, V11. d² = eᵀP⁻¹e and z_k = e_k/√P_kk with **P_truth = 0** for fitting and labeling. That is conservative: truth noise can only enlarge P. The P + P_truth figures, WAAS from URA, are a sensitivity row only.

**1.2 Storms and burns.** Labels are scored on all rows, storms included. Storm-excluded coverage (GFZ Ap ≥ 30 on a UTC day in [epoch − 24 h, t]) is reported. CA rule, registered: Calibrated demotes to Uncalibrated on any observed Ap ≥ 30 on a UTC day since the set epoch, at screen and at every re-screen. A day with no Ap reading counts as a storm day. No-Kp fallback: if lawful Kp does not cover the last needed day by a stratum's open date, the storm-excluded row is not computed and no wording says "outside storms". Local Kp ends at the 20261009 snapshot (VER E2). Burns stay in: CA cannot see them, and GEO errors are burns (owner 11-03).

**1.3 Base candidates.** Dev, lawful spans (A2 §3 minus NSGF). R0 = K0: the 5-robust-sigma clipped RTN second moment × k², with k² set so dev 95 % coverage through the lookups is 0.95, storm rows in. R2 = R0 per axis. Both refit leaving one cluster out. **Choice rule:** per regime, the candidate with the higher dev leave-one-cluster-out L1 pass rate (the share of stratum × held-out-cluster folds meeting L1). On a tie, the Loewner-larger. If neither dominates, R0 × the smallest c ≥ 1 with c·R0 ⪰ R2. No scalar fitted to the mean (C3-A10, A5 §4).

**1.4 Label rule.** Stratum (r, b) is labeled "coverage-calibrated for NORADs <list> in r at age b, storms included, issue days 11-10 to 12-06". <list> is the frozen NORAD list of r's truth families, fixed at the Part 1 freeze. The label requires all of:

- **L1.** The 95 % coverage point estimate (d² ≤ 7.815) is in [0.93, 0.97] on the whole bin and on each half-bin.
- **L2.** The 99 % coverage point estimate (d² ≤ 11.345) is ≥ 0.975.
- **L3.** Only under O1(b): each axis has its |z| ≤ 1.96 share in [0.93, 0.97] and |mean z| ≤ 0.5 (A5 §3).
- **T (testable, fixed at the freeze):**
  - n ≥ 100, ≥ C_min clusters, ≥ 6 time blocks, n_eff ≥ 60. GEO also needs ≥ 2 longitude sectors.
  - Simulated at the expected fresh n and clusters with dev error shapes, half-bin gate included ("perfect" = the scale where coverage is 0.95, C3-A10): P(label | correct) ≥ 0.80, P(label | ×0.7) ≤ 0.05, P(label | ×1.4) ≤ 0.10.
  - C_min = max(3, the smallest cluster count that passes).
  - Block length = the smallest whole number of days at which the lag autocorrelation of daily mean ln d² falls below 0.2 (A4 §1). Intervals: 95 % cluster × block bootstraps, 10,000 resamples.
- **Realized-n rule:** at scoring, a TESTABLE stratum becomes NOT TESTABLE if its realized n_eff < 0.8 × the frozen n_eff, its clusters < C_min, or (GEO) its sectors < 2.

**Outcomes:** LABELED, NOT REALISTIC (overconfident or pessimistic), NOT TESTABLE, NO LAWFUL TRUTH, or PENDING (TESTABLE, before its open date, §4). Every outcome is a result. A label covers only the listed NORADs; every other object in the stratum (debris, rocket bodies, unknowns, untested payload families) stays Uncalibrated at max_L(P_new, P_old) (S5), never P_new alone. CA always carries the covariance-free maximum and the dilution threshold (COVPROD:171).

**1.5 Truth and clusters** (clusters [ASSUMED], V4; every fresh product needs O5):
- **LEO-L:** dev Swarm A/C, GRACE-FO, Swarm B if < 500 km, ISS 2022-11-20..2024-12-31. NO LAWFUL TRUTH unless O4.
- **LEO-M:** CryoSat-2 and SARAL (DORIS) fresh. S1C and COSMIC-2 ×4 (not 44350) only under O3. 2-7 clusters; 2 under O3's default, so NOT TESTABLE. DRAFT best label chance 0.14-0.17 (A4 §2).
- **LEO-H:** DORIS only, 5 clusters: {S3A,S3B} {HY-2C} {HY-2D} {SWOT} {Jason-3,S6A,S6B}. E14 passed at 0 and 0.5 d (A1 §1).
- **MEO:** GPS 32, GLONASS 19, BeiDou MEO 24 (ESA finals), LAGEOS-2, Etalon-1/2 (ilrsa). ~14 planes. SVN 62 holds 88 % of GPS Σd² (A4 §2).
- **GEO:** WAAS 131/133/135 (one sector, 117-129° W) plus QZS-3 (ESA) and TDRS if definitive (V7). The second sector rests on QZS-3 alone.
- **HEO:** TESS 06-29..09-17, dev case study only. NO LAWFUL TRUTH.

## 3. Statements (pass conditions written now)

Intervals are 95 % cluster × block bootstraps, 10,000 resamples, stratified by regime. A statement failing its pre-freeze null or power check is frozen report-only.

- **S1.(r,b) The frozen P_strat is coverage-calibrated for the listed NORADs in testable stratum (r,b) on fresh issue days, storms included.** L1 (whole and halves), L2, plus L3 under O1(b), through both lookups. The list is frozen with Part 1.
- **S3 Honest limit, for each of LEO-L and LEO-M separately.** Pc at zero miss, combined HBR 20 m, both objects at P_strat × s_lo at ages [4,6), maximized over crossing angles 10°-170°, is < 1e-4. s_lo is the regime's scale at which dev leave-one-cluster-out 95 % coverage falls to 0.93: the smallest covariance truth does not reject. Reported: the core size (clipped, k = 1), HBR 10 m and 30 m. Wording: "for payload-class error; debris holds only if debris error ≥ payload error (V10)". Computed before the freeze. If either regime fails, the limit is withdrawn, reported and put to the owner, and nothing is tuned.
- **S4 No held data entered: a row audit plus a path audit.** The registered decode-time row predicate drops OBJECT_NAME Starlink, Galileo or GSAT; SP3 'E' PRNs; NORAD 44350 and C2's held objects (TerraSAR-X, Stella, S1D, LAGEOS-1); ISS states dated ≥ 2025-01-01; Swarm and GRACE-FO dated ≥ 2026-10-31; C2 calibration objects dated ≥ 2026-06-01 in dev and denominator rows; and every object VENDORS lists as held, the list read at the Part 1 freeze. The audit records rows dropped per predicate, held rows retained (must be 0), and input paths matching §0's holds, including any `nsgf.orb.*` (must be 0).
- **S5 Nothing shrank without evidence (Loewner order).** For each stratum, c = max(1, max_m λ_max(P_new^(−1/2) P_m P_new^(−1/2))), over m = the E14 S3-KC cell (r,b) and every 2026-08 gate-model stratum overlapping (r,b) in altitude, eccentricity and age. max_L(P_new, P_old) := c·P_new. Unlabeled strata ship max_L; labeled strata ship P_new for listed NORADs only. Audit: c·P_new − P_m ⪰ 0 for every m (minimum eigenvalue ≥ −1e−12‖P_m‖) on every block the shipped cell carries.

**Report only:** E14 under the same rule; mean d²/3; storm-excluded coverage; tail share d² > 16.27; per-axis z; 2-D encounter-plane coverage (χ²₂ ≤ 5.991) at the S3 crossing angles; P_truth-added coverage; burn share of Σd²; GP P-REF; SD(ln b); share flagged or BASE.

**Prediction:** 0-3 labels, most likely LEO-H at short ages and MEO, only if O5 and C3's R3 record both land. E14 passed 2 of 35 cells (A1 §1); the half-bin gate lowers the odds. Part 2 may well be NOT TESTABLE: tidy payloads flag rarely.

## 4. Dates

**Before the freezes:**
- **11-03:** O5 asked. Wanted by 11-05.
- **11-04:** V1-V12. After the O5 backfill, V3 measures each product's latency.
- **11-05 to 11-07:** Part 1 dev rows, candidate choice, block lengths; Part 2 dev pairs, denominators, admission.
- **11-08:** pass/fail check per stratum, S3, S5 audit, NORAD lists. **Part 1 frozen by 2026-11-08 23:59 UTC:** push PLAN.md and results/gp-covariance-strata/frozen-constants.json with the SHA-256 of the code, of `gp-error-model` and CA, of the VENDORS blob and of every input file list.
- **11-09:** n0, S2 null and power on the frozen P_strat. **Part 2 frozen by 2026-11-09 23:59 UTC**, pinning Part 1's SHA-256. C3's Q6 record falls the same day.

**After the freezes:**
- **11-10 to 12-06:** test issue days: the set in force at 00:00 UTC plus every set created that day. Daily û for the non-Starlink, non-Galileo catalog, kept under AR. Test truth arrives sealed.
- **Open date per stratum (r,b)** = the latest of: 12-21; for each product of r, 12-06 + b's upper edge + its measured latency; and the interlocks (ESA and ilrsa: C3's R3 record, 12-21 or 2027-01-20; S1C and COSMIC-2: per O3).
- **Latencies:** ESA finals 14 d and ilrsa 11 d (A5 §6); DORIS ≥ 17 d and S1 POEORB ~20 d [ASSUMED from VER E3, V3]; WAAS ~1 d; COSMIC-2 and GFZ Kp [ASSUMED], V3. For [6,8]: ESA ~12-28, DORIS ~12-31, S1 POEORB ~2027-01-03. At 12-21 truth reaches only ~12-04 (DORIS) and ~12-01 (S1), so those strata stay PENDING and score on their own open date.
- **Scoring:** once per stratum, on its open date; files absent then make it NOT TESTABLE, and the realized-n rule applies. No "drop at the freeze" rule: these are archival products.
- **After scoring:** no refit. Outcomes go to `results/gp-covariance-strata/` and `results/covariance-every-object/`; the §2.6 module tasks are filed only after a pass.

## 5. Compute

Part 1 dev samples: ~49k sets (up to ~2× at CAD's rates) × 7 bins × 5 ages ≈ 1.7-3.4 M. Part 2: ~1.1 M dev pairs, ~1.9e7 fresh pairs (21,057 objects × 57 days × 2.2 × 7, CAD). SGP4 at 5 µs per pair and the 12 GB scan at 10 MB/s per worker [ASSUMED, V8]: under 0.1 core-h and 0.7 worker-h. Pass/fail check (42 × 3 scales × 2,000 trials, no inner bootstrap): under 3 core-h; S2 null and power ~0.5. Total ~5 core-h, 8 workers under `nice`, wall under 1 h [ASSUMED, V8], disk under 3 GB.

## 6. Owner decisions (defaults applied until the task record carries an answer)

- **O5 (first; the gate).** Authorize the existing collectors to backfill ESA finals (ESA0OPSFIN), DORIS (ids-doris ssa), S1 POEORB, ILRS (ilrsa) and GFZ Kp through the test window, sealed on arrival (names, dates and SHA-256 only). Default: none. Deadline 11-05 23:59 UTC. Without it zero strata are testable. [ASSUMED] the 10-09 fetch jobs exist and can rerun, V12.
- **O1.** Per-axis condition L3, (a) or (b). Default (b). Deadline 11-08 23:59 UTC.
- **O2.** Label meaning. Default coverage-calibrated; the mean d²/3 is reported, never gated. Deadline 11-08 23:59 UTC.
- **O3.** Fresh S1C and COSMIC-2 truth, R6 reading. Default: open them only after C2 scores the overlapping days; if C2 has not by their open date they drop, and LEO-M (2 clusters) is NOT TESTABLE. Deadline 11-08 23:59 UTC.
- **O4.** Release of LEO-L truth (Swarm and GRACE-FO from 10-31, or ISS from 2025). Default no: LEO-L gets no label and S3 rests on dev truth. Deadline 11-08 23:59 UTC.

**Not the owner's (registered):** burns in; no shrink (ruled); NSGF barred.

## 8. Assumptions (verify before the freezes)

- **V1** [ASSUMED] GP sets per truth object-day (A2 runs 1.2-4× below CAD). Verify: count editions per truth NORAD in `gp_history/by-creation`.
- **V2** [ASSUMED] Regime placement: Swarm B vs 500 km; COSMIC-2, CryoSat-2, SARAL in LEO-M; Jason-3 and S6 in LEO-H. Verify: GP mean motion and eccentricity.
- **V3** [ASSUMED] Per-product latency (DORIS ≥ 17 d, S1 ~20 d from VER E3; COSMIC-2, Kp unknown) and that backfilled files cover 2024-09 to 12-14. Verify: product end versus publication date, on 11-04 and after the backfill; open dates move only later.
- **V4** [ASSUMED] Clusters: COSMIC-2 planes, GNSS planes, HY-2C vs HY-2D, Etalon-1/2. Verify: RAAN and inclination from GP.
- **V5** [ASSUMED] WAAS URA meaning (sensitivity only) and the PRN-to-name mapping (owner ruling, A2 §1). Verify: MT9 field definition in the records.
- **V6** [ASSUMED] The local GFZ snapshot 20261009 covers dev storm marking 2024-09 to 2026-09-22. Verify: last full day in the file. Fresh days need O5.
- **V7** [ASSUMED] TDRSS.bsp is definitive. Verify: kernel comments; else TDRS drops.
- **V8** [ASSUMED] 5 µs per pair, 10 MB/s per worker, 8 free workers. Verify: time 10⁴ pairs and one file.
- **V9** [ASSUMED] C2's scoring date for S1C and COSMIC-2 days. Verify: dates section of `experiments/ffm-covariance-calibration/PLAN.md` only.
- **V10** [ASSUMED] Debris error ≥ payload error. Unverifiable; a stated limit.
- **V11** [ASSUMED] CA's lookups are as A1 §3 reads them (bin-center interpolation held beyond the last center; `empiricalPc` stratum by mean altitude, eccentricity and TCA − epoch). Verify: `object_covariance.cpp` and the bridge (~l.1289) at the pinned build.
- **V12** [ASSUMED] The jobs behind AR/hac/.fetch-stamps (10-09 batch) can rerun as the "existing collectors". Verify: locate each fetch script; report, do not run.
