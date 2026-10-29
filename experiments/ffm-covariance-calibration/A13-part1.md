### A13 - 2026-10-29, part 1 (the rule), committed after A12 part 2 (ac8971902) and before any part 1a lead, gp, part 4 or part 5 record: the conjunction contrast re-run with C2's calibrated FFM covariance

No part 1a lead, gp, encounter, part 4 or part 5 record exists. Disclosed: A13 is written after A12's part 1a accuracy score pass was
committed (B2 7c19de4, and the exploratory row 7d054d1) and after the coordinator read its results. Those scores are 3D RMS only, with no
covariance, d2, coverage or Pc figure; nothing in A13's calibrated covariance was tuned on them (C2's constants were frozen from C2's own
calibration and validation data). Part 2 of A13 commits C2's frozen constants and receipts before any calibrated number.

1. **Order.** A12's accuracy score pass (A3, ffm3, SGP4-XP, XP-LN and the forecast in one pass, A5 point 6) is unchanged. Part 1a's
   leads, gp, part 4 and part 5 phases run once, after A13 part 2, scoring A5's covariance and the calibrated covariance side by side on
   the same draws (`B2|part4|<group>|<class>|<k>`).
2. **Arms.**
   - ISS: a new arm `iss-ffm3`: part 1b refitted with A12's driver (harness/ffm-fit-v3.mjs), A5's seeds and priors, one round at 10 m
     (C2's P1 fits: 508 of 517 CONVERGED; 9 failures and 2 weather-gap exclusions, C2-A3). Its accuracy is reported, labeled
     in-sample.
   - Laser: E6 R as registered (labeled "NP along-track bias present", task experiments-e6-normal-point-along-track-bias-20261028).
   - Starlink: ffm3 (A12 part 2: P0, gate failed).
   - Fairness arm (D7): SGP4-XP calibrated by C2's rule (an epoch factor k_e and an RTN floor f_R, f_T, f_N), fitted per group on the same
     calibration rule and data class as C2, frozen before any calibrated contrast number. For Starlink, SGP4-XP's calibration is the
     transfer from R1-O on the same rule, the same as FFM's.
3. **The calibrated covariance.** FFM's carried covariance with C2's frozen constants (`results/ffm-covariance-calibration/frozen-constants.json`,
   SHA-256 7806980c7e3d655e...) per group, end to end through FFM's PROCESS_NOISE from E with the hand-off at E symmetrized (C2-A5):
   - ISS: C2 class I, M1 (k_e 3.38e4, floor 0.02 / 9.4 / 0.34 m); infeasible for a lead-independent model (P8), held-out cells not
     eligible (n < 100).
   - Laser: C2 class L, M2 (k_e 1.95, floor 1.98 / 7.02 / 2.41 m; bias-contaminated); L-P (M0) and R2 (M3) reported beside it as the
     bias-free floor.
   - Starlink: by transfer from C2 class R1 under weather O (R1-O, M3 tau infinite: k_e 5.10, floor 0.34 / 23.3 / 0.34 m,
     q_T 1.07e-10, q_RN 1.05e-14 m^2/s^3, sigma_delta^2 0.0116), robustness only (R1 held out by time: 0 of 6 eligible cells pass; by
     object not eligible, clusters < 3). Validated, robustness only, on the B2-supplied export of A12's E' pre-F window products for the
     non-V2 satellites (`/opt/data/sdn-archive/sdn-ap-mixed-screening/a12-eprime-export/`, exported by B2's fit-only reader with its
     opened-path receipt and manifest SHA-256; D3); C2 opens no capture content.
4. **Metrics.** A5's rates, calls, confusion matrices and verdict, unchanged, for both covariances. Part 3 cells for the calibrated
   covariance under C2's pass rule (cells below 100 windows or 3 clusters labeled not eligible, C2-A4 point 8). Brier and log scores of
   Pc against the hit indicator (true miss under 20 m), with paired differences against SGP4-XP and against FFM-A5 and A4's intervals,
   are the primary verdict for the calibrated contrast (D8); a Pc reliability table by decade.
5. **Why proper scores.** A5's missed-alert rate counts true misses of 20-200 m with tiny Pc as failures and so rewards an inflated
   covariance; in the laser precise class FFM shows 25 % missed alerts with miss-distance errors of only -11.8 to 20.7 m (p10 to p90).
6. **Disclosures.** C2's planner read B2's ISS and laser rows (iss-ffm, iss-leads, laser-leads) before C2's registration; C2's receipts
   (precheck-P10 opened-path logs) show no part 1a truth, score row, capture content or census result opened. C2 class I and L are
   in-sample-seen. C2 found the normal-point along-track defect (C2-A3) and an FFM covariance round-trip defect
   (modules-ffm-covariance-roundtrip-symmetry-20261029); the latter is handled by symmetrizing at the hand-off.
7. **E2E.** run.mjs --check replays one window per group with the calibrated covariance.

Part 2 (after C2 freezes every class used above, before any calibrated number): C2's frozen-constants receipt SHA-256 and constants; the
builds used; for part 5 the covariance at the 21 epochs of each assessment as OEM covariance lines.
