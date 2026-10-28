# C2: FFM fitted-product covariance calibrated to the band

Plan. Status: **frozen** (`config.json` `"frozen": true`), committed and
pushed 2026-10-28 before any calibration fit, any v3 refit of this experiment
and any held-out score. Nothing below changes after this commit; a deviation
is an amendment at the end, dated, with its reason.

**Base.** This branch is rebased onto B2's task branch
(`origin/task/experiments-b2-ffm-iss-starlink-20261026`) at
`df0621d5690b7c45e3408f1366c019fc05410eee`, for `harness/ffm-fit-v3.mjs` and
B2's `lib/` (including `lib/prefit.mjs`), which C2 uses and never edits. C2
lands on main only after B2 lands. A later change of either file on the B2
branch is followed by a rebase and recorded in the receipt.

Lane: claude-c2cov-d9. Task: `experiments-c2-ffm-covariance-calibration-20261028`
(branch `task/experiments-c2-ffm-covariance-calibration-20261028`). Owner item
(c): make FFM's propagated covariance realistic, then re-run B2's conjunction
contrast with it (B2 amendment A13).

## 1. Question

Can one covariance model, built only from existing FFM and gp-error-model
methods and fitted per class on calibration data, make the covariance of
FFM's fitted products realistic on held-out objects and held-out time?

**Realistic** (owner's definition, the band): against independent truth, the
position Mahalanobis statistic d² has mean d²/3 in 0.8–1.25 and 95 % coverage
in 0.93–0.97, per class and lead (section 3.6).

**Why A5's covariance fails** (the planner's in-sample reading, disclosed in
section 5): it is fit_batch's formal covariance times max(1, reduced χ²),
carried by FFM from the start of the fit track with no process noise. ISS
products mix two covariance scales (249 of 514 windows are round-1 fallback
products); ISS along-track errors of 2.4–9.2 km stand against σ of 16–87 m;
the laser spheres show a radial and cross-track floor of about 2 and 3 m
against σ of 0.4 and 1.0 m and a common along-track bias of +4.0 to +5.65 m;
no single scale factor per lead meets both band criteria.

## 2. Coordinator rulings applied (final)

- D1: the A12 lane holds part 1a leads, gp and parts 4–5 until A13 is committed.
- D2: the ISS contrast arm is a v3 refit, `iss-ffm3`.
- D3: Starlink validation uses only A12's pre-F E′ windows (≤ 24 h), for
  validation only, never for fitting; V2's satellites are excluded.
- D4: ISS is calibrated as its own class by time (primary); the transfer from
  the precise drag-LEO class (R1) is reported as robustness.
- D5: the pass rule of section 3.6 with oracle power, and the ISS exception
  (at least six independent 30-day blocks).
- D6: the laser along-track bias is diagnosed first (P3). If it is a defect,
  the lane stops and reports it with evidence before fixing anything; the fix
  is a separate task. The registered laser arm is kept in any case.
- D7: SGP4-XP is calibrated by the same rule (epoch factor and floor) as the
  fairness arm.
- D8: the proper scores (Brier and log score of Pc against hits, with a
  reliability table) are the primary verdict for the calibrated contrast;
  A5's rule is reported as registered.
- D9: productizing (section 3.11) only if C2 passes in at least 2 of the 3 B2
  groups; it is a later, separate task, not this one.
- D10: the public EDC normal points (2025-10 to 2026-05) and the NSGF orbits
  after 2026-08 are fetched; each source's licence is recorded in
  `data/ffm-covariance-calibration/SOURCES.md`. The Gauss-Markov FFM state
  stays contingent (only if M3 fails validation in the drag classes): reported,
  not built.

## 3. Design

### 3.1 The model

The fit epoch t₀ is the start of the track and the handoff E is its end. For
t ≥ E:

`P_cal(t) = k_e·A(t) + R(t)·diag(f_R², f_T², f_N²)·R(t)ᵀ + q_T·U_T(t) + q_RN·(U_R(t)+U_N(t)) + D(t; σ_δ, τ_d)`

- **A(t)** is A5's covariance: the position block that FFM carries from t₀,
  including the parameter columns. k_e = 1 and every other term zero gives A5
  exactly.
- **U_k(t)** are the unit white-acceleration responses from E at 600 s steps,
  computed by gp-error-model `noise_responses` on one FFM run with a dense STM.
  They match what FFM's `PROCESS_NOISE` adds.
- **D(t)** is the density term from gp-error-model `dcp_covariance`, starting
  at E, with lead-day covariance C_ij = σ_δ² exp(−|i−j|/τ_d) over K = 3 days.
- **The floor is not propagated.** It covers truth error, measurement
  systematics and representation error. R(t) is the RTN rotation of the
  predicted state.
- **Where the arithmetic happens.** FFM does every propagation. The
  composition and d² use gp-error-model `pair_statistics` with
  `covarianceTerms`. JavaScript only fits the constants (statistics).

### 3.2 Parameters, per class

Fitted:
- k_e > 0;
- f_R, f_T, f_N ≥ 0 m;
- q_T, q_RN ≥ 0 m²/s³ (q_RN shared by the radial and cross-track axes);
- σ_δ ≥ 0, the error in ln(B·ρ) per lead day;
- τ_d ∈ {1 day, ∞}, chosen on validation.

Laser-only alternative M2c: per-pass range-bias consider parameters with
σ_b ∈ {1, 2, 4} m, computed by fit_batch v3 at the R estimate, replace k_e.

Optional Starlink add-on (D3): q_S ∈ {0, 1e-10, 1e-9} m²/s³.

Fixed:
- noise steps of 600 s, starting at E;
- leads of 1, 6, 12, 24, 48 and 72 h;
- d² on the 3×3 position block, with the 95 % χ²₃ threshold 7.8147.

### 3.3 Classes (fixed before any fit)

**Precise-track classes (OE-P).** The fit uses 24 h of precise ephemeris at
10-min spacing, 10 m per axis. Three regimes by mean perigee: R1 below 600 km,
R2 600–2,000 km, R3 2,000–35,000 km.

**Weather conditions.** Each class is fitted under one or both:
- M: observed weather, as the ISS and laser arms used;
- O′: part 1a's own rule beyond the last observed day, identified in pre-check
  P4 and reproduced at each C2 cutoff. Fitted for R1 and R2.

**Operator and observation classes.**
- Type I: ISS, under M.
- Type L: the laser spheres, under M.
- Type S: Starlink, which takes the R1/O′ constants by transfer (plus q_S if
  validation under D3 selects it).

**Out of scope:** GEO (at most one object, QZS-3).

**Fit configurations (P12).**

| Class | Driver and arc | Parameters |
| --- | --- | --- |
| OE-P and type I | A12's v3 driver (`harness/ffm-fit-v3.mjs`), one round at 10 m, GCRF, FFM domains | R1/R2: the profile A12 part 2 names. R3: state + AGOM. ISS: A5's seeds and priors |
| Type L | E6's R steps unchanged | As E6 R |

Common to all classes: B2's forces and integrator (RK78, relative tolerance
1e-10, steps of at most 120 s), and FFM 2.0.0 from c860a072 (P5).

### 3.4 Calibration and validation split, by satellite and time

| Set | Objects | Cutoff dates E | Use |
| --- | --- | --- | --- |
| Calibration | R1: Swarm A+C (one cluster), Swarm B, GRACE-FO 1+2 (one cluster), COSMIC-2 ×4. R2: S1A, S1C, Ajisai, LARES, LARETS, Starlette, WESTPAC. R3: LAGEOS-2, LARES-2, Etalon-1/2, 8 GPS, 4 GLONASS | 2025-10-03 to 2026-03-31, every second day | Fit the constants |
| Validation | Same objects | 2026-04-01 to 2026-05-31 | Choose the model form and τ_d |
| Held out by object | R1: TSX, COSMIC-2 ×2. R2: Stella, S1D. R3: LAGEOS-1, Galileo ×6 | All dates | Scored once |
| Held out by time | Calibration objects | 2026-06-01 to the end of each product | Scored once |
| Type I | ISS | Calibrate 2020-09 to 2023-12; validate 2024; hold out 2025-01 to 2026-10 | In-sample-seen, labeled |
| Type L | The 5 spheres | Calibrate 06-03 to 06-27; validate 06-28 to 07-15 (E6 dev); hold out 07-16 to 08-30 (B2 part 2's 206 cutoffs) | Held-out set was seen under A5's covariance, labeled |
| Type S | Part 1a satellites | Validation (D3): A12's pre-F E′ windows, 24 h, V2 excluded. Held out: part 1a truth via A13 part 3 | Prospective |

The COSMIC-2 satellites, the 8 GPS, 4 GLONASS and 6 Galileo satellites are
fixed in pre-check P9, before any fit, by the lowest SHA-256 of
`C2|P9|<class>|<norad>` among the satellites with coverage: 8 GPS, 4 GLONASS
and 4 COSMIC-2 in calibration; 6 Galileo and 2 COSMIC-2 held out. Nothing
about their FFM error is read to choose them. Validation cutoffs are every
second day, as calibration.

**R1/R2 hold.** Their fits use "the profile A12 part 2 names", by reference;
the A12 part 2 commit SHA is recorded in a receipt the moment it lands, and
no R1/R2 fit runs before it. Type I, type L and R3 run first.

**D10 data.** The normal points 2025-10 to 2026-05 are archived with their
licence line and used only for P2 and P3; section 3.4 is unchanged (any
extension of type L is a later, separate amendment). The NSGF orbits after
2026-08 extend held-out by time.

Data on disk (counts confirmed in P9): Swarm A/B/C 2025-10-01 to 2026-08-19;
Sentinel-1A/C/D to 2026-08-31; NSGF orbits for 7 spheres and ILRS combined
orbits for LAGEOS and Etalon 2025-10 to 2026-08-29
(`/opt/data/sdn-archive/reference-states/reference`); GRACE-FO to 2026-10-06
and TSX to 2026-07-13 (`/opt/data/sdn-archive/hac/gfz-isdc-rso/RSO`);
COSMIC-2 in `reference-leo-pod-2`; normal points 2026-06 to 08
(`hac/ilrs-edc/npt_crd_v2`), extended under D10.

### 3.5 Fitting, choice, freeze, held-out scoring

1. **Fit.** Per class, a Gaussian likelihood start, then minimize the band
   loss Σ_L[(ln mean d²/3)² + ((coverage − 0.95)/0.02)²] over the six lead
   cells.
2. **Candidates.** M0 = A5. M1 = k_e + floor. M2 = M1 + white noise.
   M3 = M2 + density term. Type L only: M2c.
3. **Choice on validation.** Most cells in band, then the smaller band loss,
   then fewer parameters.
4. **Freeze.** The constants are committed with a receipt. No change after
   any held-out score; any later variant is labeled exploratory.
5. **Held-out scoring, once.** End to end through FFM's `PROCESS_NOISE`, not
   the basis shortcut. P13 proves the two agree.

### 3.6 Pass/fail criteria, per class and lead

- **A cell passes** when mean d²/3 is in 0.8–1.25 and coverage is in
  0.93–0.97, with at least 100 windows from at least 3 independent clusters.
  Clusters are independent orbits (Swarm A+C count as one; GRACE-FO 1+2 count
  as one). ISS has one object, so it needs at least six 30-day blocks instead.
- **Every cell reports** median d²/3, 95 % cluster-bootstrap intervals
  (10,000 resamples over clusters, seed SHA-256 of `C2|boot|<class>|<lead>`), mean
  z² per axis, and its oracle pass probability.
- **Oracle pass probability.** A perfectly calibrated covariance with
  independent samples passes with probability 0.56 at n = 30, 0.75 at
  n = 100, 0.87 at n = 200, 0.92 at n = 300 and 0.97 at n = 500; with 5
  objects each carrying a 15 % scale error, 0.74 at n = 200 (computed per
  cell in P11).
- **A class is realistic** when every cell's intervals overlap the band and
  its pass count is at least the 5th percentile of the oracle pass count.

### 3.7 Exclusions (registered in advance; they do not depend on FFM's error)

- **Maneuvers.**
  - ISS: a header-listed burn, or a radial difference above 0.5 km between
    overlapping NASA files in [start of file k, E + 72 h]. The threshold was
    informed by the planner's in-sample reading, so it is checked against
    header-listed burns.
  - Precise objects: maneuver detection on the truth itself, with Δv above
    1 mm/s in [E − 24 h, E + 72 h].
  - Starlink: part 1a's registered flag, reported apart.
- **Truth anomalies:** the existing ledger, including the Etalon zero-X states.
- **Coverage:** a 90 % coverage rule on the truth.
- **Reporting:** every exclusion is counted, and the all-sample cells are
  reported as well.

### 3.8 Assumptions and pre-checks (each with a committed receipt)

- **P1. Fallback contamination.** ISS has 249 round-1 products (measured).
  ISS is refit with v3 first: zero refusals and at least 99.9 % CONVERGED.
- **P2. Truth quality.** ISS truth age has been checked (planner, row 7).
  NSGF consecutive-arc overlaps must agree within 0.3 m RMS. The anomaly
  ledger is applied.
- **P3. The laser along-track bias** (+4–5.6 m, about 0.66 ms). Trace one
  cutoff's time scales: the UTC/TT/TDB labels of the FFM samples, the NSGF SP3
  time system, and the normal-point epochs. A defect stops the lane (D6).
- **P4. Weather rule for part 1a.** Read B1's `environment.json` rows after
  2026-10-23 to find the rule used beyond the last observed day, and reproduce
  it as O′ at each C2 cutoff. XM's RSGA condition O is the documented
  alternative.
- **P5. FFM build parity.** States from 2.0.0 and 2.0.1 identical on 5
  windows, and zero covariances refused under scaled inputs plus
  `PROCESS_NOISE`.
- **P6. Estimator parity for M2c.** v3 started at the R solution reproduces R
  within 1e-3 σ.
- **P7. Cost probe.** CPU-s per object-day for: state only; STM + B;
  STM + B + noise (each with integrator, steps, output step and tolerance).
- **P8. Shape check on validation.** After the chosen terms, the shape
  statistic lies in 0.8–1.25; otherwise the class is reported infeasible.
- **P9. Data availability.** Windows per object, COSMIC-2 coverage, the GNSS
  sample.
- **P10. Integrity receipt.** A log of every path opened. Never part 1a truth,
  score rows, capture-cycle content or census results.
- **P11. Oracle power** per cell.
- **P12. Fit configuration** identical per class (section 3.3).
- **P13. Basis shortcut.** The composed noise responses equal FFM's own
  `PROCESS_NOISE` result on one window (relative 1e-6).

### 3.9 E2E

- **C2:** `node experiments/ffm-covariance-calibration/run.mjs --check`
  replays one stored window per class through FFM and gp-error-model with the
  frozen constants, compares d² bit for bit, and regenerates and compares
  `table.json`.
- **B2:** `run.mjs --check` is extended per A13.
- **Modules:** none until productization (section 3.11).

### 3.10 Compute

At most 12 worker processes (the B2 fits are running). Every speed or cost
figure names its integrator, steps, output step and tolerance.
- C2: about 6,000–7,000 windows (P9); per window a v3 fit (4–40 evaluations
  at about 2.6 s per 24 h), a carry to E, and one 72-h dense-STM run per
  weather condition: about 20–120 s; total about 100–150 CPU-h at RK78 1e-10
  with steps ≤ 120 s.
- A13: Starlink about 11,000 windows at about 13 s (about 40 CPU-h); ISS v3
  refit about 6 CPU-h; laser under 1 CPU-h.

### 3.11 Consumers to rebuild

Now (C2 and A13): none; the modules are used as pinned. Productization only
under D9, as one push with no old path kept (SDS PRW realism record,
propagator/ffm P_cal on both paths with a 7×7 resident covariance, CA module
SDS rebuild, od labeling, OrbPro pin bump, python-astro re-lock, sdn-ap
rebundle): a separate task.

## 4. Outputs

`results/ffm-covariance-calibration/`: one receipt per pre-check
(`precheck-P<n>.json`), the fit receipt, the frozen-constants receipt, the
held-out `table.json` and `README.md` (per class and lead: mean and median
d²/3, coverage, 95 % cluster-bootstrap intervals, mean z² per axis, oracle
pass probability, exclusions counted, all-sample cells).

## 5. Disclosures: in-sample reads by the planner

Before this registration the planner read, at modules f54b5107e and B2 branch
df0621d:
- from B2's store, only the ISS and laser files: `iss-ffm.s*`, `iss-leads.s*`
  and `laser-leads.s*`. Every ISS and type L number in section 1 and the
  design's feasibility probes is in-sample. The type I calibration,
  validation and held-out sets and the type L held-out set (07-16 to 08-30)
  were therefore seen under A5's covariance, and are labeled
  **in-sample-seen** in every output;
- E6's R products, the gp-error-model docs, and the E14, C1 and V1c4 results.

Not opened: any `starlink-*` row; capture-cycle content (the 20 cycle
directory names only were listed); any census result. The ISS maneuver
threshold (0.5 km) was informed by the in-sample reading and is checked
against header-listed burns.

## Amendments

### C2-A1 - 2026-10-28, before any fit (coordinator rulings Q7-Q10 on the failed pre-checks P9 and P2)

Reason: `results/ffm-covariance-calibration/precheck-P9.json` (COSMIC-2: 5 satellites in the archive, 44349, 44350, 44351, 44353 and
44358, with truth on 77-86 % of days, none at 90 %; TerraSAR-X: no converted truth) and `precheck-P2.json` (NSGF overlaps above
0.3 m per axis on 106 of 108 LARETS arcs, 95 of 109 WESTPAC, 85 of 108 Stella, 39 of 109 Starlette, 9 of 110 Ajisai and 8 of 107
LARES arcs). The numbers are in `amendments.json`.

1. **COSMIC-2 (Q7).** 4 satellites in calibration and 1 held out by object, the lowest SHA-256 of `C2|P9|cosmic2|<norad>`. For
   COSMIC-2 only, a satellite has coverage when its truth holds at least 75 % of the days (other objects: 90 %); the 90 % per-window
   epoch rule still applies to every window. Disclosed: lowered because no COSMIC-2 satellite reaches 90 %.
2. **TerraSAR-X (Q8).** The GFZ RSO L13 files (`/opt/data/sdn-archive/hac/gfz-isdc-rso/RSO/L13`, 2025-09-30 to 2026-07-13) are
   converted by analysis/reference-states into C2's store exactly as GRACE-FO's GFZOP files were made; the licence line is recorded
   in `data/ffm-covariance-calibration/SOURCES.md`. TerraSAR-X is R1's held-out-by-object object beside the held-out COSMIC-2.
3. **NSGF truth error (Q9).** Primary: every arc is kept, and each NSGF-truth window (R2 and type L) adds a truth covariance, a
   diagonal RTN term with per-axis sigma = the arc's stated overlap RMS / sqrt(2), to the predicted covariance in pair_statistics; d2
   is scored against the combined covariance, so the fitted floor stands for model error only. Registered sensitivity: the same
   cells with the arcs above 0.3 m excluded (no truth term). P3's empirical step uses only arcs at or under 0.3 m.
4. **Definitions (Q10).** GNSS truth is ESA0OPSFIN only (one product per object); a satellite has coverage at 90 % of the days from
   the first calibration window (E - 24 h) to the last validation window (E + 72 h), except COSMIC-2 (point 1); held-out-by-time
   cutoffs are every second day.

### C2-A2 - 2026-10-28, before any fit (coordinator ruling Q12): the coverage rule applies to the fit track

Reason: section 3.7's "90 % coverage rule on the truth" did not name its span. Over [E - 24 h, E + 72 h] it left COSMIC-2 0-4 windows
per satellite (`precheck-P9.json` at 20c7263); B2 applies the 90 % rule to the 24 h track.

1. A window enters when its truth holds at least 90 % of the 24 h fit track [E - 24 h, E] (145 epochs at 10 min); each lead L is
   scored where the truth holds E + L (the epoch nearest E + L within the class tolerance).
2. Yield (span level, `precheck-P9.json` after this amendment), windows per set: R1 482 calibration, 164 validation, 276 held out by
   time, 14 held out by object; R2 514, 188, 261, 238; R3 1,425, 487, 755, 1,176. Per lead (1/6/12/24/48/72 h), R1 calibration
   481/480/476/475/478/475; COSMIC-2 per satellite 3-10 calibration windows per lead, 44350 (held out) 9-13. Every per-lead count
   is in the receipt.
3. COSMIC-2's truth is arcs of about 2 h with gaps, so it adds few windows: R1's cluster rule (at least 3 independent clusters)
   rests chiefly on Swarm A+C, Swarm B and GRACE-FO 1+2.
