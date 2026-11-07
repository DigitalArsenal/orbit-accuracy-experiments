# CryoSat-2's secular rate mismatch and the fitted forward drift under a better model

Registration: experiments/operator-theory/CRYOSAT2-SECULAR.md. Frame: the all-regimes record (fixture, reference propagator/ffm 2.2.1 a91331207752, fit, forward day, attribution); estimator: the secular/zonal record's items 1 and 2 (R0, T1 with the delete-one-revolution jackknife, +-2 SE; T_a = -(3/2) n R0, T_r = T1 - T_a). Dists: propagator/sdn-ap 0.6.3 aa3ed22aa61a and 0.6.4 e245de29ea05 (pre-sign); modules 93cb5a058. Rows 42, flown 42, registered flights 42. Shares are forward-day RMS (m): secular / zonal / tesseral.

## Question 1: why CryoSat-2 alone (20x20 both sides, e 0.001)
Answer: carried by inclination (carries it (one cell): i 86: D 23.13 m/day [3.83, 42.42]).
Base reproduction against the landed secondary re-flight: T1 -14.22 against -14.22 m/day (difference 0.0000), R0 9.50 against 9.50 m (difference 0.0000): reproduces.

- inclination: carries it (one cell): i 86: D 23.13 m/day [3.83, 42.42]
- commensurability: does not carry it
- fit absorption: does not carry it

| Cell | Candidate | Change | Fitted n (rev/day) / BTERM | Forward RMS (m) | Shares sec / zon / tess (m) | R0 (m) | T1 (m/day) | T_a | T_r | Absorption reading | T1 against the base | R0 against the base |
| --- | --- | --- | --- | --: | --- | --: | --: | --: | --: | --- | --- | --- |
| q1:base | base | the registered fixture | 14.5485033 / 3.26e-60 | 18.61 | 11.51 / 5.95 / 7.42 | 9.50 [6.81, 12.20] | -14.22 [-27.64, -0.80] | -1302.97 | 1288.75 [919.03, 1658.48] | secular rate mismatch of 1288.75 m/day; radial bias at fixed mean motion | - | - |
| q1:inclination:86 | inclination | i 86 | 14.5483942 / 3.74e-54 | 19.39 | 10.86 / 6.20 / 6.53 | 8.77 [7.41, 10.12] | 8.91 [-4.96, 22.77] | -1201.87 | 1210.78 [1024.38, 1397.18] | secular rate mismatch of 1210.78 m/day; radial bias at fixed mean motion | moved (23.13 m/day [3.83, 42.42]) | not moved (-0.74 m [-3.75, 2.28]) |
| q1:inclination:98 | inclination | i 98 | 14.5479923 / 4.76e-55 | 20.43 | 10.61 / 5.91 / 7.91 | 9.30 [6.04, 12.57] | -7.01 [-26.11, 12.09] | -1275.55 | 1268.55 [820.56, 1716.53] | secular rate mismatch of 1268.55 m/day; radial bias at fixed mean motion | removed within the spread (-7.01 m/day [-26.11, 12.09]) | not moved (-0.20 m [-4.43, 4.03]) |
| q1:commensurability:n14.49 | commensurability | n 14.49 (-0.03 rev/day) | 14.5183662 / 4.78e-78 | 18.55 | 11.52 / 2.15 / 5.61 | 9.61 [6.96, 12.26] | -12.62 [-24.27, -0.96] | -1315.02 | 1302.41 [939.94, 1664.87] | secular rate mismatch of 1302.41 m/day; radial bias at fixed mean motion | not moved (1.60 m/day [-16.17, 19.38]) | not moved (0.11 m [-3.67, 3.89]) |
| q1:commensurability:n14.55 | commensurability | n 14.55 (+0.03 rev/day) | 14.5786409 / 3.32e-66 | 18.21 | 11.45 / 6.08 / 7.00 | 9.42 [6.34, 12.50] | -14.84 [-28.13, -1.55] | -1294.55 | 1279.71 [856.12, 1703.29] | secular rate mismatch of 1279.71 m/day; radial bias at fixed mean motion | not moved (-0.62 m/day [-19.51, 18.26]) | not moved (-0.08 m [-4.17, 4.01]) |
| q1:commensurability:n14.27 | commensurability | n 14.27 (-0.25 rev/day) | 14.2973704 / 2.55e-50 | 16.51 | 10.16 / 2.23 / 4.98 | 7.55 [5.31, 9.79] | -10.63 [-19.99, -1.26] | -1017.53 | 1006.90 [704.50, 1309.31] | secular rate mismatch of 1006.90 m/day; radial bias at fixed mean motion | not moved (3.59 m/day [-12.77, 19.96]) | not moved (-1.95 m [-5.46, 1.55]) |
| q1:commensurability:n14.77 | commensurability | n 14.77 (+0.25 rev/day) | 14.7996604 / 1.37e-66 | 21.63 | 14.30 / 6.22 / 8.77 | 8.71 [5.01, 12.41] | -7.58 [-19.41, 4.24] | -1215.14 | 1207.55 [691.41, 1723.70] | secular rate mismatch of 1207.55 m/day; radial bias at fixed mean motion | not moved (6.64 m/day [-11.25, 24.52]) | not moved (-0.79 m [-5.37, 3.79]) |
| q1:arc:2d | fit absorption | arc 2 days | 14.5485034 / 2.26e-74 | 17.73 | 12.20 / 6.24 / 6.86 | 8.17 [5.62, 10.73] | -12.89 [-18.70, -7.08] | -1120.89 | 1108.00 [757.20, 1458.80] | secular rate mismatch of 1108.00 m/day; radial bias at fixed mean motion | not moved (1.33 m/day [-13.30, 15.95]) | not moved (-1.33 m [-5.04, 2.39]) |
| q1:arc:6d | fit absorption | arc 6 days | 14.5485033 / 2.12e-77 | 16.55 | 10.31 / 6.24 / 6.71 | 8.30 [5.44, 11.15] | -16.97 [-23.70, -10.24] | -1137.71 | 1120.74 [728.87, 1512.62] | secular rate mismatch of 1120.74 m/day; radial bias at fixed mean motion | not moved (-2.75 m/day [-17.76, 12.27]) | not moved (-1.21 m [-5.13, 2.72]) |
| q1:rate:bfree | fit absorption | DRAG_PRIOR (0, 0.1, GAUSSIAN_SIGNED) | 14.5485033 / -2.47e-26 | 18.61 | 11.51 / 5.95 / 7.42 | 9.50 [6.81, 12.20] | -14.22 [-27.64, -0.80] | -1302.97 | 1288.75 [919.03, 1658.48] | secular rate mismatch of 1288.75 m/day; radial bias at fixed mean motion | not moved (-0.00 m/day [-18.98, 18.98]) | not moved (0.00 m [-3.81, 3.81]) |

## Question 2: why the fitted forward drift moved when the model improved (31x31 against caps 31 / 20; the four 0.6.4 validation cells)
Summary: the rate absorbs in none; the model carries it in none; arc length reduces the drift in none; the fitted-rate freedom reduces it in none; not separable: Jason-3|0.07, Jason-3|0.1, Ajisai|0.1, Ajisai|0.15; unmeasured: none.

### Jason-3|0.07: not separable
T1 0.6.3 fit 5.70 [-8.45, 19.85] -> 0.6.4 fit 12.54 [0.04, 25.05] m/day: change 6.84 [-12.04, 25.73] within, grew in magnitude; the fitted mean motion's element reading a dn 4.79 m/day; secular share 19.11 -> 28.15 m; forward RMS 28.33 -> 29.28 m.
Decomposition on 0.6.4: set effect (B on 0.6.4 minus A on 0.6.4) 4.84 [-12.83, 22.50] within; model effect (A on 0.6.4 minus A on 0.6.3) 2.01 [-16.86, 20.88] within: neither (within the spread). On 0.6.3: set effect (B on 0.6.3 minus A on 0.6.3) 4.84 [-15.18, 24.86] within; model effect on B (B on 0.6.4 minus B on 0.6.3) 2.01 [-16.89, 20.90] within.
Arc 6 days: |T1| change on 0.6.4 13.99 [-1.31, 29.29] within (does not reduce); on 0.6.3 18.94 [-3.85, 41.73] within. BTERM free: |T1| change on 0.6.4 0.00 [-17.68, 17.68] within (does not reduce; fitted BTERM -7.342e-43 m^2/kg); on 0.6.3 0.00 [-20.01, 20.01] within (fitted BTERM -4.973e-34).

| Flight | Fit dist | Flown on | Fitted n / e / BTERM / fit RMS (m) | Forward RMS (m) | Shares sec / zon / tess (m) | R0 (m) | T1 (m/day) | T_r | Absorption reading | Verdict |
| --- | --- | --- | --- | --: | --- | --: | --: | --: | --- | --- |
| fit063 | 0.6.3 | 0.6.3 | 12.831211680 / 0.06938 / -8.67e-54 / 23.7 | 28.33 | 19.11 / 5.31 / 11.54 | 2.76 [1.37, 4.14] | 5.70 [-8.45, 19.85] | 338.90 [171.03, 506.78] | secular rate mismatch of 338.90 m/day | undecided (attributed) |
| fit064 | 0.6.4 | 0.6.4 | 12.831211779 / 0.06938 / -9.45e-57 / 13.6 | 29.28 | 28.15 / 5.25 / 2.23 | 2.24 [1.69, 2.79] | 12.54 [0.04, 25.05] | 283.39 [215.69, 351.09] | secular rate mismatch of 283.39 m/day | pass (attributed) |
| set063on064 | 0.6.3 | 0.6.4 | 12.831211680 / 0.06938 / -8.67e-54 / - | 21.27 | 19.62 / 5.40 / 2.23 | 2.28 [1.73, 2.83] | 7.71 [-4.78, 20.19] | 282.98 [215.33, 350.63] | secular rate mismatch of 282.98 m/day | pass (attributed) |
| set064on063 | 0.6.4 | 0.6.3 | 12.831211779 / 0.06938 / -9.45e-57 / - | 34.66 | 27.60 / 5.15 / 11.54 | 2.72 [1.33, 4.10] | 10.54 [-3.63, 24.70] | 339.31 [171.24, 507.38] | secular rate mismatch of 339.31 m/day | undecided (attributed) |
| fit063arc6d | 0.6.3 | 0.6.3 | 12.831211629 / 0.06938 / -2.74e-61 / 24.5 | 27.94 | 15.52 / 8.87 / 11.97 | 2.73 [-0.34, 5.81] | 24.64 [6.77, 42.50] | 355.30 [-16.81, 727.41] | fit absorption (semi-major axis) | undecided (attributed) |
| fit064arc6d | 0.6.4 | 0.6.4 | 12.831211642 / 0.06938 / -1.43e-58 / 15.6 | 20.40 | 16.67 / 8.99 / 3.39 | 2.13 [1.66, 2.60] | 26.54 [17.72, 35.36] | 284.34 [227.16, 341.53] | secular rate mismatch of 284.34 m/day | pass (attributed) |
| fit063bfree | 0.6.3 | 0.6.3 | 12.831211680 / 0.06938 / -4.97e-34 / 23.7 | 28.33 | 19.11 / 5.31 / 11.54 | 2.76 [1.37, 4.14] | 5.70 [-8.45, 19.85] | 338.90 [171.03, 506.78] | secular rate mismatch of 338.90 m/day | undecided (attributed) |
| fit064bfree | 0.6.4 | 0.6.4 | 12.831211779 / 0.06938 / -7.34e-43 / 13.6 | 29.28 | 28.15 / 5.25 / 2.23 | 2.24 [1.69, 2.79] | 12.54 [0.04, 25.05] | 283.39 [215.69, 351.09] | secular rate mismatch of 283.39 m/day | pass (attributed) |

### Jason-3|0.1: not separable
T1 0.6.3 fit 17.82 [4.89, 30.76] -> 0.6.4 fit 24.91 [10.33, 39.49] m/day: change 7.09 [-12.41, 26.58] within, grew in magnitude; the fitted mean motion's element reading a dn 6.78 m/day; secular share 43.09 -> 56.57 m; forward RMS 51.96 -> 57.62 m.
Decomposition on 0.6.4: set effect (B on 0.6.4 minus A on 0.6.4) 6.85 [-13.76, 27.46] within; model effect (A on 0.6.4 minus A on 0.6.3) 0.24 [-19.24, 19.72] within: neither (within the spread). On 0.6.3: set effect (B on 0.6.3 minus A on 0.6.3) 6.85 [-11.46, 25.17] within; model effect on B (B on 0.6.4 minus B on 0.6.3) 0.24 [-19.28, 19.75] within.
Arc 6 days: |T1| change on 0.6.4 27.59 [10.29, 44.88] beyond (does not reduce); on 0.6.3 34.72 [12.75, 56.69] beyond. BTERM free: |T1| change on 0.6.4 0.00 [-20.62, 20.62] within (does not reduce; fitted BTERM -9.056e-39 m^2/kg); on 0.6.3 -0.00 [-18.29, 18.29] within (fitted BTERM -1.823e-34).

| Flight | Fit dist | Flown on | Fitted n / e / BTERM / fit RMS (m) | Forward RMS (m) | Shares sec / zon / tess (m) | R0 (m) | T1 (m/day) | T_r | Absorption reading | Verdict |
| --- | --- | --- | --- | --: | --- | --: | --: | --: | --- | --- |
| fit063 | 0.6.3 | 0.6.3 | 12.833063778 / 0.09933 / -3.42e-48 / 34.6 | 51.96 | 43.09 / 7.43 / 16.27 | 3.25 [0.97, 5.53] | 17.82 [4.89, 30.76] | 411.21 [135.33, 687.09] | secular rate mismatch of 411.21 m/day | undecided (attributed) |
| fit064 | 0.6.4 | 0.6.4 | 12.833063918 / 0.09933 / -8.57e-50 / 19.8 | 57.62 | 56.57 / 7.34 / 3.30 | 2.18 [1.34, 3.01] | 24.91 [10.33, 39.49] | 288.18 [185.94, 390.42] | secular rate mismatch of 288.18 m/day | pass (attributed) |
| set063on064 | 0.6.3 | 0.6.4 | 12.833063778 / 0.09933 / -3.42e-48 / - | 45.19 | 43.83 / 7.24 / 3.30 | 2.25 [1.43, 3.06] | 18.06 [3.50, 32.62] | 289.68 [189.58, 389.79] | secular rate mismatch of 289.68 m/day | pass (attributed) |
| set064on063 | 0.6.4 | 0.6.3 | 12.833063918 / 0.09933 / -8.57e-50 / - | 62.98 | 55.81 / 7.53 / 16.27 | 3.18 [0.89, 5.47] | 24.67 [11.71, 37.64] | 409.71 [132.36, 687.05] | secular rate mismatch of 409.71 m/day | undecided (attributed) |
| fit063arc6d | 0.6.3 | 0.6.3 | 12.833063622 / 0.09933 / -6.39e-57 / 36.6 | 43.51 | 28.19 / 13.96 / 17.12 | 3.53 [-1.08, 8.13] | 52.54 [34.79, 70.30] | 479.14 [-78.37, 1036.65] | fit absorption (semi-major axis) | undecided (attributed) |
| fit064arc6d | 0.6.4 | 0.6.4 | 12.833063644 / 0.09933 / -1.49e-63 / 25.2 | 34.74 | 30.25 / 14.04 / 5.19 | 2.56 [2.07, 3.04] | 52.50 [43.20, 61.80] | 361.76 [302.59, 420.93] | secular rate mismatch of 361.76 m/day | pass (attributed) |
| fit063bfree | 0.6.3 | 0.6.3 | 12.833063778 / 0.09933 / -1.82e-34 / 34.6 | 51.96 | 43.09 / 7.43 / 16.27 | 3.25 [0.97, 5.53] | 17.82 [4.89, 30.76] | 411.21 [135.33, 687.09] | secular rate mismatch of 411.21 m/day | undecided (attributed) |
| fit064bfree | 0.6.4 | 0.6.4 | 12.833063918 / 0.09933 / -9.06e-39 / 19.8 | 57.62 | 56.57 / 7.34 / 3.30 | 2.18 [1.34, 3.01] | 24.91 [10.33, 39.49] | 288.18 [185.94, 390.42] | secular rate mismatch of 288.18 m/day | pass (attributed) |

### Ajisai|0.1: not separable
T1 0.6.3 fit 1.92 [-4.87, 8.71] -> 0.6.4 fit 10.24 [0.89, 19.59] m/day: change 8.31 [-3.24, 19.87] within, grew in magnitude; the fitted mean motion's element reading a dn 7.23 m/day; secular share 6.28 -> 24.70 m; forward RMS 44.67 -> 46.09 m.
Decomposition on 0.6.4: set effect (B on 0.6.4 minus A on 0.6.4) 7.33 [-6.52, 21.19] within; model effect (A on 0.6.4 minus A on 0.6.3) 0.98 [-11.29, 13.26] within: neither (within the spread). On 0.6.3: set effect (B on 0.6.3 minus A on 0.6.3) 7.33 [-2.29, 16.95] within; model effect on B (B on 0.6.4 minus B on 0.6.3) 0.98 [-10.59, 12.55] within.
Arc 6 days: |T1| change on 0.6.4 -0.47 [-26.54, 25.60] within (does not reduce); on 0.6.3 7.29 [-13.81, 28.39] within. BTERM free: |T1| change on 0.6.4 6.06 [-7.11, 19.24] within (does not reduce; fitted BTERM 5.413e-4 m^2/kg); on 0.6.3 8.23 [-1.23, 17.69] within (fitted BTERM 7.355e-4).

| Flight | Fit dist | Flown on | Fitted n / e / BTERM / fit RMS (m) | Forward RMS (m) | Shares sec / zon / tess (m) | R0 (m) | T1 (m/day) | T_r | Absorption reading | Verdict |
| --- | --- | --- | --- | --: | --- | --: | --: | --: | --- | --- |
| fit063 | 0.6.3 | 0.6.3 | 12.456519397 / 0.09917 / 4.38e-58 / 29.3 | 44.67 | 6.28 / 4.05 / 18.43 | 0.10 [-2.92, 3.13] | 1.92 [-4.87, 8.71] | 13.77 [-341.46, 368.99] | fit absorption (semi-major axis) | fail (attributed) |
| fit064 | 0.6.4 | 0.6.4 | 12.456519543 / 0.09917 / 1.13e-50 / 21.7 | 46.09 | 24.70 / 4.21 / 5.16 | -0.50 [-1.94, 0.94] | 10.24 [0.89, 19.59] | -48.88 [-218.08, 120.31] | fit absorption (semi-major axis) | undecided (attributed) |
| set063on064 | 0.6.3 | 0.6.4 | 12.456519397 / 0.09917 / 4.38e-58 / - | 35.66 | 8.07 / 4.05 / 4.72 | -1.03 [-2.04, -0.01] | 2.90 [-7.32, 13.13] | -117.62 [-237.24, 2.00] | fit absorption (semi-major axis) | undecided (attributed) |
| set064on063 | 0.6.4 | 0.6.3 | 12.456519543 / 0.09917 / 1.13e-50 / - | 52.82 | 22.86 / 4.16 / 18.74 | 0.62 [-2.47, 3.72] | 9.25 [2.44, 16.07] | 82.51 [-280.56, 445.57] | fit absorption (semi-major axis) | undecided (attributed) |
| fit063arc6d | 0.6.3 | 0.6.3 | 12.456519433 / 0.09917 / 1.69e-86 / 41.9 | 74.85 | 12.66 / 7.38 / 20.34 | 1.56 [-1.48, 4.60] | 9.21 [-10.77, 29.18] | 192.41 [-164.54, 549.36] | fit absorption (semi-major axis) | undecided (attributed) |
| fit064arc6d | 0.6.4 | 0.6.4 | 12.456519415 / 0.09917 / 4.23e-62 / 37.5 | 69.50 | 10.25 / 7.50 / 9.40 | 0.16 [-1.56, 1.88] | 9.77 [-14.57, 34.11] | 28.40 [-175.11, 231.90] | fit absorption (semi-major axis) | undecided (attributed) |
| fit063bfree | 0.6.3 | 0.6.3 | 12.456519274 / 0.09917 / 7.35e-4 / 29.2 | 45.74 | 13.26 / 4.03 / 18.42 | 0.05 [-2.98, 3.08] | 10.15 [3.57, 16.73] | 15.74 [-339.77, 371.24] | fit absorption (semi-major axis) | fail (attributed) |
| fit064bfree | 0.6.4 | 0.6.4 | 12.456519453 / 0.09917 / 5.41e-4 / 21.6 | 48.77 | 29.91 / 4.20 / 5.11 | -0.54 [-1.92, 0.84] | 16.30 [7.02, 25.58] | -47.44 [-209.76, 114.88] | fit absorption (semi-major axis) | undecided (attributed) |

### Ajisai|0.15: not separable
T1 0.6.3 fit 4.60 [-26.39, 35.59] -> 0.6.4 fit 10.23 [-7.06, 27.51] m/day: change 5.63 [-29.86, 41.11] within, grew in magnitude; the fitted mean motion's element reading a dn 11.62 m/day; secular share 42.67 -> 70.61 m; forward RMS 86.92 -> 98.70 m.
Decomposition on 0.6.4: set effect (B on 0.6.4 minus A on 0.6.4) 11.66 [-13.23, 36.55] within; model effect (A on 0.6.4 minus A on 0.6.3) -6.03 [-41.83, 29.76] within: neither (within the spread). On 0.6.3: set effect (B on 0.6.3 minus A on 0.6.3) 11.66 [-32.65, 55.97] within; model effect on B (B on 0.6.4 minus B on 0.6.3) -6.03 [-42.11, 30.05] within.
Arc 6 days: |T1| change on 0.6.4 7.23 [-33.11, 47.58] within (does not reduce); on 0.6.3 13.78 [-34.07, 61.63] within. BTERM free: |T1| change on 0.6.4 0.00 [-24.45, 24.45] within (does not reduce; fitted BTERM -5.416e-22 m^2/kg); on 0.6.3 0.00 [-43.83, 43.83] within (fitted BTERM -3.458e-18).

| Flight | Fit dist | Flown on | Fitted n / e / BTERM / fit RMS (m) | Forward RMS (m) | Shares sec / zon / tess (m) | R0 (m) | T1 (m/day) | T_r | Absorption reading | Verdict |
| --- | --- | --- | --- | --: | --- | --: | --: | --: | --- | --- |
| fit063 | 0.6.3 | 0.6.3 | 12.459887369 / 0.14906 / -2.33e-30 / 51.1 | 86.92 | 42.67 / 6.75 / 27.51 | 1.13 [-3.35, 5.61] | 4.60 [-26.39, 35.59] | 137.27 [-390.12, 664.66] | fit absorption (semi-major axis) | undecided (attributed) |
| fit064 | 0.6.4 | 0.6.4 | 12.459887604 / 0.14906 / 2.98e-48 / 42.3 | 98.70 | 70.61 / 7.46 / 9.69 | 0.81 [-1.26, 2.87] | 10.23 [-7.06, 27.51] | 105.07 [-137.78, 347.91] | fit absorption (semi-major axis) | undecided (attributed) |
| set063on064 | 0.6.3 | 0.6.4 | 12.459887369 / 0.14906 / -2.33e-30 / - | 78.06 | 46.25 / 6.92 / 9.08 | -0.23 [-1.78, 1.33] | -1.43 [-19.34, 16.48] | -28.23 [-211.73, 155.26] | fit absorption (semi-major axis) | undecided (attributed) |
| set064on063 | 0.6.4 | 0.6.3 | 12.459887604 / 0.14906 / 2.98e-48 / - | 105.10 | 67.12 / 7.22 / 27.99 | 2.17 [-2.34, 6.68] | 16.26 [-15.41, 47.93] | 270.58 [-260.02, 801.18] | fit absorption (semi-major axis) | undecided (attributed) |
| fit063arc6d | 0.6.3 | 0.6.3 | 12.459887261 / 0.14906 / -6.18e-29 / 76.0 | 135.32 | 27.21 / 17.01 / 31.82 | 4.59 [-0.83, 10.00] | 18.39 [-18.07, 54.84] | 556.82 [-80.10, 1193.74] | fit absorption (semi-major axis) | undecided (attributed) |
| fit064arc6d | 0.6.4 | 0.6.4 | 12.459887269 / 0.14906 / 1.83e-68 / 72.2 | 128.31 | 30.05 / 17.02 / 17.44 | 2.75 [-1.20, 6.70] | 17.46 [-18.99, 53.92] | 340.26 [-124.60, 805.12] | fit absorption (semi-major axis) | undecided (attributed) |
| fit063bfree | 0.6.3 | 0.6.3 | 12.459887369 / 0.14906 / -3.46e-18 / 51.1 | 86.92 | 42.67 / 6.75 / 27.51 | 1.13 [-3.35, 5.61] | 4.60 [-26.39, 35.59] | 137.27 [-390.12, 664.66] | fit absorption (semi-major axis) | undecided (attributed) |
| fit064bfree | 0.6.4 | 0.6.4 | 12.459887604 / 0.14906 / -5.42e-22 / 42.3 | 98.70 | 70.61 / 7.46 / 9.69 | 0.81 [-1.26, 2.87] | 10.23 [-7.06, 27.51] | 105.07 [-137.78, 347.91] | fit absorption (semi-major axis) | undecided (attributed) |
