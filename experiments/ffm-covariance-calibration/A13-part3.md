### A13 - 2026-10-29, part 3 (the SGP4-XP fairness constants), committed after C2-A9's freeze and before any calibrated contrast number

1. **The rule (D7, C2-A9).** SGP4-XP's own module covariance A_xp (propagator/sdn-ap `sdnap_covariance_at` of B2's SGP4-XP arm: `fit`
   with THEORY SGP4XP on each group's 24 h fit track) calibrated as P = k_e A_xp + diag(f_R^2, f_T^2, f_N^2) in the predicted state's RTN
   axes; no process-noise terms. Fitted on C2's calibration sets, chosen on validation, frozen, held-out scored once, with C2's classes,
   windows, truth, leads, screens and pass rule.
2. **Frozen constants.** `results/ffm-covariance-calibration/sgp4xp/frozen-constants.json`, SHA-256
   3f21116ca436d8edb38c47a9ab4661137b618f95e9cce9e52da7523bd9d04992. Per group:

   | Group | C2 class | Model | k_e | f_R, f_T, f_N (m) |
   | --- | --- | --- | --- | --- |
   | ISS | I | M1 | 96.49426709485638 | 2.408758736789693, 0.4992517195365452, 0.45192278835875893 |
   | Laser | L | M1 | 1.349859374981793 | 3.1280099567957196, 1.4465372592109917, 2.76418148270726 |
   | Starlink | R1 (weather M) | M1 | 18.44601147139567 | 1.4314883773240414, 0.5724131928037121, 0.7515724406612534 |

   Beside the laser group, reported only: L-P (M0, A_xp alone). Starlink takes R1-M's constants by transfer, the same rule as FFM's
   (C2-A8); its transfer validation on the B2-extended export is robustness only.
3. **Builds.** propagator/sdn-ap: B2's registered build, module.wasm 62c783262da9e69c54d6f4eb98c97af4208c1b11daec44cc9c28c0252c564d1e (the
   G1 store snapshot pinned by B2's lib/fits.mjs), modules root the B2 modules worktree at c860a072; analysis/gp-error-model and
   foundation/frames at c860a072 (module.wasm a7a0e21805d50737b6f0c84b89a9ee6e7b981668d8cbe321c36217228f1d76f7 and
   486acaa334705b97d3a975b8a3d90f4bfd2428af77c6b5086c970ed1f24e27a4); type L's tracks carried by propagator/ffm 2.0.0 (d0b04935...) as
   part2-laser.mjs carries them.
4. **Disclosures.** C2-A10: the first SGP4-XP held-out scoring read FFM's constants by a scorer defect; its I and L tables were seen and
   deleted; the held-out cells are those scored with the SGP4-XP frozen constants (no refit). P8: every SGP4-XP class is infeasible for a
   lead-independent model (shape I 0.80-0.86, L 1.21-1.62, L-P 1.23-1.43, R1 0.77-1.08).
