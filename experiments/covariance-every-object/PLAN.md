# GP covariance realism, Part 2: per-object inflation, inflate only (registration)

Registered 2026-11-03 before any pair, denominator or truth row of this experiment is computed. Task experiments-covariance-per-object-inflate-20261103 (supersedes experiments-gpcv-register-20261030). Nothing has been run.

**Owner ruling, 11-03:** a covariance may grow when an object's own history is erratic; it never shrinks because that history is tidy.

## Pointer to Part 1

Part 1 is `experiments/gp-covariance-strata/PLAN.md`, registered on origin at `wip/experiments-gp-covariance-strata-20261103/claude-gpstrata-d9`, commit d5141bb (lane claude-gpstrata-d9; the file is 15,002 bytes). It carries the frame (§0: 42 strata, regimes, ages, holds), P_strat and its label rules (§1), S1, S3, S4, S5 (§3), dates (§4), compute (§5), owner-question defaults (§6) and assumptions V1-V12 (§8). All of those bind Part 2 unchanged, including the age bins, the regime edges, the cluster definitions, the owner-question defaults (O1-O5) and the storm rule. That file has no §2 and no S2.1-S2.3: they are this file's text below, copied verbatim from the plan (PLAN-v2.md §2, §3). Part 2 needs Part 1's frozen `results/gp-covariance-strata/frozen-constants.json` for P_strat; its SHA-256 is pinned in Part 2's frozen-constants.json.

## 2. Part 2: per-object inflation, inflate only (verbatim)

**2.1 Residual.** At issue time E for object o: each set k created ≤ E with epoch in [E − 30 d, E), paired per age bin b with j = the first set created ≤ E with t_j − t_k in b. ρ = SGP4(k → t_j) − SGP4(j at t_j), in j's RTN, AFSPC mode. One pair per set per bin, no clipping.

**2.2 Denominator a_{s,b,k}.** The pooled unclipped second moment of ρ over stratum s's dev truth objects on lawful spans, frozen. Recomputed without cluster c when a truth object of c is scored. Rows: 0 from catalog objects, 0 fresh, 0 dated ≥ 2026-06-01 for C2 calibration objects, 0 from C2's held objects, 0 NSGF; spans exactly as A2 §3.

**2.3 Admission** per (regime, bin, axis): SD over clusters of ln(pair moment / truth moment) ≤ 0.35 and S2.1 null false positives ≤ 0.05; other bins drop out of û.

**2.4 Scale.** C3's `axes-mle-ref` (A5 §1), g = 1, C = 0, pooled over admitted bins: û_k = argmin_u ½ Σ [ρ_k²/(e^u a_{s,b,k}) + u] + (n0/4)u². D = diag(exp(max(0, û_k)/2)) on position and matching velocity rows. **Loewner floor:** P_o = P_strat + [D P_strat D − P_strat]₊, where [·]₊ is the PSD part. Then P_o ⪰ P_strat and P_o ⪰ D P_strat D; D P_strat D alone shrinks correlated directions (VER H1). No cap. BASE (P_o = P_strat) with < 12 older sets or no admitted bin.

**2.5 n0 ∈ {5, 10, 20, 40}:** the smallest with, on dev truth histories block-resampled at the measured length, P(flag | u = 0) ≤ 0.05 (flag = any D_k > 1.25) and median e^û/e^u in [0.8, 1.25] at u = ln 4. If none passes, Part 2 is frozen report-only (as C3's P8 failed, A5 §5).

**2.6 Ship.** P_o reaches CA only for listed NORADs in a labeled stratum where S2.1-S2.3 pass. Everything else gets D = I, because inflation is not conservative for Pc under dilution. Path (A1 §3, A3 §4): an inflate-only `object_covariance` rule; `$OCM` COV_CALIBRATION Calibrated only for listed NORADs; CA's FOSTER-2D on supplied OCMs with the §1.2 demotion. The console's ALFANO_MAXIMUM (`cqrCodec.ts` l.210) and missing label are separate tasks.

**2.7 Data rights.** The public repo carries stratum-level aggregates only, for both parts. Per-object û and D go under AR/covariance-every-object/, and each file's SHA-256 is recorded (frozen-constants.json for dev, a committed manifest for issue days). No element set and no per-set value is printed. READMEs carry "Contains modified Copernicus Sentinel data (2025-2026)." for S1 POEORB and "WAAS MT9 data: NASA Crustal Dynamics Data Information System (CDDIS)." No Space-Track record, lettered source or capture content is used.


## 3. Statements S2.1-S2.3 and S4 (verbatim)

Intervals are 95 % cluster × block bootstraps, 10,000 resamples, stratified by regime. A statement failing its pre-freeze null or power check is frozen report-only.

- **S2.1 Flagged object-days carry larger true error.** The stratified difference in P_strat 95 % coverage, unflagged minus flagged, has its interval wholly above 0. Pre-freeze: cluster-permutation false-positive rate ≤ 0.05, power ≥ 0.80, ≥ 3 flagged clusters.
- **S2.2 Inflation moves flagged object-days toward 0.95 without overshooting.** On flagged days the interval of |cov_o − 0.95| − |cov_base − 0.95| is wholly below 0, and cov_o ≤ 0.97.
- **S2.3 Labeled strata stay calibrated under P_o.** Every S1 pass still meets L1-L3; not evaluable if none label.

- **S4 No held data entered: a row audit plus a path audit.** The registered decode-time row predicate drops OBJECT_NAME Starlink, Galileo or GSAT; SP3 'E' PRNs; NORAD 44350 and C2's held objects (TerraSAR-X, Stella, S1D, LAGEOS-1); ISS states dated ≥ 2025-01-01; Swarm and GRACE-FO dated ≥ 2026-10-31; C2 calibration objects dated ≥ 2026-06-01 in dev and denominator rows; and every object VENDORS lists as held, the list read at the Part 1 freeze. The audit records rows dropped per predicate, held rows retained (must be 0), and input paths matching §0's holds, including any `nsgf.orb.*` (must be 0).

## Task record text carried into this registration (verbatim where quoted)

- Admission: "SD over clusters of ln(pair moment / truth moment) ≤ 0.35, and S2.1 null false positives ≤ 0.05."
- n0: "Take the smallest of {5, 10, 20, 40} that meets both of these, else freeze as report-only: P(flag | u = 0) ≤ 0.05, where flag means any D_k > 1.25; median e^û/e^u in [0.8, 1.25] at u = ln 4."
- S2.1 checks: 1,000 cluster permutations for the null and 2,000 bootstraps for power; power ≥ 0.80 and at least 3 flagged clusters, else report-only.
- Freeze by 2026-11-09 23:59 UTC: `results/covariance-every-object/frozen-constants.json` with denominators, admitted bins, n0, null and power rows; the SHA-256 of the code, of the inputs and of Part 1's frozen-constants.json; the SHA-256 of the per-object dev values held under AR.
- Issue days 2026-11-10 to 12-06: daily û and P_o for the non-Starlink, non-Galileo catalog (about 21,057 objects). Per-object files go to `/opt/data/sdn-archive/covariance-every-object/`, each file's SHA-256 in a committed manifest. The public repo gets stratum-level aggregates only.
- Each stratum is scored once, on Part 1's open date. Each of S2.1-S2.3 records PASS, FAIL, REPORT-ONLY or NOT EVALUABLE; before that date, PENDING.
- Acceptance (a)-(g) are the task record's, run by `run.mjs --check`: (a) Loewner floor on 1,000 synthetic objects with planted u in {−ln 4, 0, ln 2, ln 4}, correlation up to 0.95, minimum eigenvalue of P_strat^-1/2 P_o P_strat^-1/2 ≥ 1 − 1e−12, also on 2-D encounter-plane projections at crossing angles 10°-170° in 10° steps, every planted u ≤ 0 giving P_o = P_strat; (b) n0 recovery within 0.005; (c) admitted bins; (d) denominator provenance; (e) pinned Part 1; (f) public output; (g) S2.1-S2.3 states.

## Implementation readings (fixed here, before any row is read)

Where the plan's sentence leaves a procedure open, this is the single reading used. Each is a reading of the quoted text, not a change to it.

1. **Pair enumeration.** Bins b are Part 1's seven age bins [0,0.25) [0.25,0.75) [0.75,1.5) [1.5,2.5) [2.5,4) [4,6) [6,8] d. For object o and issue time E, the older sets are the sets created ≤ E with epoch in [E − 30 d, E). For each (k, b), j is the earliest-created set (creation time ≤ E) with t_j − t_k in b and t_j > t_k. A (k, b) with no such j makes no pair. For dev denominators, E is j's creation time: each (k, b) pair appears once, with j the earliest-created qualifying set, and the 30-day window is applied to k relative to j's creation time.
2. **ρ.** Both sets flown with the module `propagator/sgp4` in AFSPC mode. ρ = SGP4(k at t_j) − SGP4(j at t_j) in j's RTN, position components (R, T, N) in meters, and the velocity components kept for the 6×6 rows. No clipping. The second moment is about zero, per axis.
3. **Stratum of a pair** is Part 1's stratum of (regime of o from j's mean motion and eccentricity, b). The regime of a dev truth object is fixed by Part 1.
4. **Denominator** a_{s,b,k} is the mean of ρ_k² over all pairs of the dev truth objects of stratum s on lawful spans, where the lawful spans are A2 §3's spans minus every NSGF object (LARETS, Starlette, WESTPAC, Stella, LARES, LARES-2, Ajisai), minus Galileo, minus 44350, TerraSAR-X, Sentinel-1D and LAGEOS-1, with ISS ending 2024-12-31, with C2 calibration objects (Swarm, GRACE-FO, Sentinel-1A, Sentinel-1C, COSMIC-2 ×4, ESA GNSS GPS/GLONASS/BeiDou/QZS-3) ending 2026-05-31, and with Swarm and GRACE-FO never dated ≥ 2026-10-31. A pair is dated by t_j. The leave-one-cluster-out recompute is the same sum without cluster c.
5. **û** is the minimizer over u of the stated objective, per axis k in {R, T, N}, sum over the object's pairs in the admitted bins; solved by Newton with bisection fallback on the strictly convex objective (n0 > 0). D acts on the 6×6: the position row of axis k and the velocity row of axis k take the same factor.
6. **Truth moment** for admission, S2.1 coverage and S2.2: Part 1's dev error rows (e = SGP4(set → t) − truth(t) in truth RTN, unclipped second moment per cluster, stratum and axis). Part 2 reads no truth file itself; until Part 1's dev rows are frozen, admission and S2.1-S2.3 read PENDING.
7. **Flag** on an object-day: any D_k > 1.25, i.e. û_k > 2 ln 1.25 for some axis.
8. **n0 simulation.** The dev truth objects' ρ series are block-resampled at the block length Part 1 measures (§1.4 rule) to build 30-day histories at each object's cadence. The "u = 0" world scales each series so that its stratum, bin and axis second moment equals a_{s,b,k} (keeping shape and serial correlation); the "u = ln 4" world multiplies the variance by 4 on all axes. P(flag | u = 0) is the flag share over 2,000 histories per stratum, pooled over strata with an admitted bin; the median e^û/e^u is taken over the same histories at u = ln 4. (b) recovers the frozen seed's rows within 0.005.
9. **S2.1 null.** On the dev object-days, the flag labels are permuted across clusters (1,000 permutations, label counts held per stratum), and the S2.1 statistic is computed; the false-positive rate is the share with the interval wholly above 0. **Power:** 2,000 bootstrap replicates of the dev clusters; in each, a random 20 % of object-days are made erratic (truth error and ρ both scaled ×2, i.e. u = ln 4); power is the share with the interval wholly above 0. Both need Part 1's coverage rows; they read PENDING until those exist, and the acceptance run records them so.
10. **Loewner floor** is computed in double precision by symmetric eigendecomposition of D P D − P, keeping the non-negative eigenpairs. Acceptance (a) reads "every planted u ≤ 0 gives P_o = P_strat" on the D built from the planted u (D_k = exp(max(0, u_k)/2)); the estimator's own rate of P_o = P_strat at planted u ≤ 0 is reported beside it, not gated, since û is a noisy estimate and exceeds 0 for about half of tidy histories by chance.
11. **Hold predicate (S4)** is applied at decode, before any value is used: OBJECT_NAME matching Starlink, Galileo, GALILEO or GSAT; NORAD in Part 1's frozen hold list (VENDORS.md at origin/main of the experiments repo, held list read at the freeze); no path containing `nsgf.orb.`; no `.secrets`, UDL or restricted path. The audit counts rows dropped per predicate and held rows retained.
12. **Daily job** is one command, `run.mjs --day YYYY-MM-DD`, reading the archive under the same predicate, writing per-object files and a manifest line to `/opt/data/sdn-archive/covariance-every-object/` and a stratum-level aggregate to `results/covariance-every-object/`.
13. **Data rights.** The README carries "Contains modified Copernicus Sentinel data (2025-2026)." and "WAAS MT9 data: NASA Crustal Dynamics Data Information System (CDDIS)." where Part 1's truth is cited. No element set, no per-set value and no per-object value is printed in the repository.
