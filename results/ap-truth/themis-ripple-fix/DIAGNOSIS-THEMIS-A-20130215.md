# THEMIS A 2013-02-15 (Amendments 9 and 10)

Rows: fit-investigation store (run.mjs). Builds as INVESTIGATION.md; C4fit-baseflight = C4's fit flown on the base build.

| Arm | Fit residual RMS (m) | Iterations | BTERM | AGOM | Day 1 / 3 / 7 (m) |
| --- | --: | --: | --: | --: | --: |
| base | 109.5 | 28 | 0.0120 | 0.0197 | 211.7 / 314.1 / 419.9 |
| C1 | 248.9 | 30 | 4.289 | 0.0195 | 392.6 / 3,072.3 / 14,285.5 |
| C2 | 248.9 | 45 | 4.290 | 0.0195 | 392.8 / 3,073.2 / 14,289.1 |
| C3 | 104.8 | 26 | 0.0120 | 0.0195 | 201.0 / 294.3 / 421.8 |
| C4 | 249.8 | 18 | 4.506 | 0.0196 | 517.8 / 3,238.9 / 15,778.6 |
| C4 fit, base flight | 249.8 | 18 | 4.506 | 0.0196 | 454.1 / 3,292.5 / 15,091.1 |
| base fit, C3 flight (flight3) | 109.5 | 28 | 0.0120 | 0.0197 | 126.1 / 440.6 / 857.1 |

The other fitted elements differ by 1e-6 in e, 1.3e-4 deg in i, 3e-4 deg in Omega, 2e-4 deg in omega, 5e-4 deg in M.
Earlier builds on this window (roughness study, published rows): 0.4.11 to 0.4.14 173.8 / 260.7 / 910.1 m; 0.4.15 to 0.6.0 211.7 / 314.1 /
419.9 m.

Small divisors and the cut (verify.cpp at the base-fitted elements; verify-themis-a-20130215.json): the module's grid against the
full-field quadrature 0.119 m RMS, 2.59 m maximum, 4 mm roughness of the difference (the bounds hold); the smallest family divisor is
family (m, w) = (1, -12), |k - nu| 0.0356 (psi-dot 0.0356 n, below the 0.045 n cut, so its near harmonic is left out of the forcing); the
largest family amplitude 391 m in lambda x a, family (2, 1). The grid agrees with the quadrature: the cut is not the cause.

Diagnosis: the fit. C1, C2 and C4 converge to a second solution with BTERM 4.3 to 4.5 (375 times the base's) and 250 m residual RMS,
2.3 times the 105 to 110 m that C3 and the base reach on the same arc; the set is bad on either flight (C4's fit on the base flight:
3,292 m on day 3), so the day-3 regression is that solution's drag growth (quadratic in time), not the tesseral grid. The fitter accepts a
solution whose residual is 2.3 times the attainable one. No defect in the grid or its cut was found; the fit's convergence lies outside
this record's paths.
