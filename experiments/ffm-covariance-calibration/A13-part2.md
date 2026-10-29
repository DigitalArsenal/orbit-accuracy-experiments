### A13 - 2026-10-29, part 2 (the constants and builds), committed after C2 froze every class it names and before any calibrated number of part 1a, part 4 or part 5

1. **C2's frozen constants.** `results/ffm-covariance-calibration/frozen-constants.json` on the C2 branch, SHA-256
   7806980c7e3d655eaf7da31a32a4cb760293be53488a468e99b761b98726c837. The calibrated position covariance at a lead is
   P = k_e A + diag(f_R^2, f_T^2, f_N^2) (RTN of the predicted state) + q_T U_T + q_RN (U_R + U_N) + sigma_delta^2 D_tau, where A is
   A5's covariance (formal x max(1, reduced chi-square)) carried by propagator/ffm from the fit epoch, the white-noise terms come from
   FFM's PROCESS_NOISE (600 s) from the cutoff, and D_tau is gp-error-model's density term. Per group:

   | Group | C2 class | Model | k_e | f_R, f_T, f_N (m) | q_T, q_RN (m^2/s^3) | sigma_delta^2, tau |
   | --- | --- | --- | --- | --- | --- | --- |
   | ISS | I | M1 | 33815.04311442945 | 0.020041705656607373, 9.401534204448408, 0.34203999033474175 | - | - |
   | Laser | L | M2 | 1.9516758785436588 | 1.9804750224401257, 7.0185456205260435, 2.4119377776703086 | 4.139573739847988e-20, 1.1327773785338313e-15 | - |
   | Starlink | R1 (weather M) | M3 | 5.305292516976156 | 0.2843105151053393, 26.134262801933524, 0.07489481602220313 | 6.840587227450634e-11, 2.883495985334589e-15 | 0.031061192901856948, 1 day |

   Beside the laser group, reported only: L-P (M0, A5 alone, the bias-free floor) and R2 (M3, tau infinite). Type L carries the
   normal-point along-track bias (task experiments-e6-normal-point-along-track-bias-20261028).

2. **Substitution for Starlink (stated).** Part 1 names R1 under weather O (R1-O) as the Starlink transfer class. No RSGA bulletin was
   issued in the 72 h before any E' cutoff of the B2-supplied export (XM's RSGA collection ends 2026-10-09), so R1-O cannot be applied.
   The coordinator ruled (C2-A8, Q28), on input availability and before any transfer row or Starlink covariance number existed: R1 under
   weather M (frozen R1, M3 tau = 1 day) with B2's own environment table (observed through 2026-10-23, forecast after: part 1a's rule).
   The SGP4-XP fairness calibration for Starlink follows the same rule (R1 under M), the same as FFM's.

3. **Builds.** analysis/estimation 0.6.0 (modules f54b5107e, module.wasm 0e7b4f6ad359f7be07a1d1e88685d65642ba0e8cadbf18777e3aee7ee1bfceac);
   propagator/ffm 2.0.0 (modules c860a072, module.wasm d0b0493575245f29d9465aa76c861f62c384e426669da2345832ccb18d5bb42f), with the
   covariance handed back at the cutoff symmetrized, (P + P^T)/2 (C2-A5; modules-ffm-covariance-roundtrip-symmetry-20261029);
   analysis/gp-error-model at c860a072 (module.wasm a7a0e21805d50737b6f0c84b89a9ee6e7b981668d8cbe321c36217228f1d76f7); foundation/frames at
   c860a072 (module.wasm 486acaa334705b97d3a975b8a3d90f4bfd2428af77c6b5086c970ed1f24e27a4); all through A12's links directory
   (/opt/data/sdn-archive/sdn-ap-mixed-screening/a12-modules). Laser products from E6's R steps on E6's modules
   (/opt/data/sdn-archive/sdn-ap-mixed-screening/e6-modules). Integrator RK78, relative tolerance 1e-10, steps of at most 120 s.

4. **Part 5's covariance.** At each of the 21 epochs of each assessment, each object's calibrated covariance is written as CCSDS OEM
   covariance lines: the 6 x 6 position-velocity covariance of FFM's PROCESS_NOISE run from the cutoff (k_e x A5's covariance carried, q per
   the table), with the position block augmented by the floor and the density term, in COV_REF_FRAME RTN (the predicted state's axes,
   the frame the floor is defined in), velocity rows as FFM carries them; units km, km/s (OEM). An epoch whose covariance FFM refuses is
   written without covariance and counted as a failure.

5. **Disclosures.** C2's held-out results (type I and L-P run 2 final, C2-A5; R3, L, R1, R2 and their O variants each scored once) are
   in C2's results; the Starlink transfer is robustness only; R1-O and R2-O were calibrated on 2026-01 to 03 cutoffs only (C2-A8).
