# THEMIS track roughness

Registration: experiments/operator-theory/THEMIS-ROUGHNESS.md. 12 windows (THEMIS A, D, E; cutoffs 2013-02-11 to 17; 72 h fits, vacuum), each arm
fitted and flown on the propagator/sdn-ap build named, 7 days at 300 s. Roughness: the median of |e(t+h) - 2 e(t) + e(t-h)|, e the RIC error
(forecast minus reference, m), h = 300 s; per arm the median over windows. Errors: 3D RMS per lead day, median over windows. Report only.

Control: 48 of 48 rows on 0.4.11 and 0.5.1 equal the stored HX rows (days 1, 2, 3, 7) within 1 mm.
Published figure: THEMIS D 2013-02-13 on 0.5.1, 3.095 m over the forecast (3.06 m published, fit and forecast spans).

## Builds
propagator/sdn-ap dist SHA-256 (first 12): 0.4.11 e4edacb03daf, 0.4.12 fef0e72eff4a, 0.4.13 314ac788e71b, 0.4.14 525d57599048, 0.4.15 2cdec7f54d7b, 0.4.16 544cb58c5eb0, 0.4.17 7d4920ee23f4, 0.4.18 225bf936f2ad, 0.5.0 fa1e4466a00d, 0.5.1 d29acd2b5d92, 0.6.0 0b5280f05176.

| Arm | Windows | Roughness (m) | R / I / C (m) | inside / outside median radius (m) | Day 1 error (m) | Day 3 error (m) | Day 7 error (m) | Day 3 roughness per km of error (m) |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| AP(31,20)@0.4.11 | 12 | 0.121 | 0.055 / 0.097 / 0.027 | 0.358 / 0.079 | 199.5 | 545.0 | 978.1 | 0.203 |
| XP@0.4.11 | 12 | 0.511 | 0.309 / 0.362 / 0.022 | 2.647 / 0.185 | 638.5 | 2965.6 | 9355.1 | 0.115 |
| AP(31,20)@0.5.1 | 12 | 2.820 | 2.642 / 0.563 / 0.086 | 3.704 / 2.308 | 195.1 | 405.1 | 1004.7 | 7.328 |
| XP@0.5.1 | 12 | 0.511 | 0.309 / 0.362 / 0.022 | 2.647 / 0.185 | 638.5 | 2965.6 | 9355.1 | 0.115 |
| AP(31,20)@0.6.0 | 12 | 2.820 | 2.642 / 0.563 / 0.086 | 3.704 / 2.308 | 195.1 | 405.1 | 1004.7 | 7.328 |
| XP@0.6.0 | 12 | 0.511 | 0.309 / 0.362 / 0.022 | 2.647 / 0.185 | 638.5 | 2965.6 | 9355.1 | 0.115 |

## Release bisection (AP (31, 20))
| Arm | Windows | Roughness (m) | R / I / C (m) | inside / outside median radius (m) | Day 1 error (m) | Day 3 error (m) | Day 7 error (m) | Day 3 roughness per km of error (m) |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| AP(31,20)@0.4.12 | 12 | 0.121 | 0.055 / 0.097 / 0.027 | 0.358 / 0.079 | 199.5 | 545.0 | 978.1 | 0.203 |
| AP(31,20)@0.4.13 | 12 | 0.121 | 0.055 / 0.097 / 0.027 | 0.358 / 0.079 | 199.5 | 545.0 | 978.1 | 0.203 |
| AP(31,20)@0.4.14 | 12 | 0.121 | 0.055 / 0.097 / 0.027 | 0.358 / 0.079 | 199.5 | 545.0 | 978.1 | 0.203 |
| AP(31,20)@0.4.15 | 12 | 2.820 | 2.642 / 0.563 / 0.086 | 3.704 / 2.308 | 195.1 | 405.1 | 1005.0 | 7.328 |
| AP(31,20)@0.4.16 | 12 | 2.820 | 2.642 / 0.563 / 0.086 | 3.704 / 2.308 | 195.1 | 405.1 | 1004.7 | 7.328 |
| AP(31,20)@0.4.17 | 12 | 2.820 | 2.642 / 0.563 / 0.086 | 3.704 / 2.308 | 195.1 | 405.1 | 1004.7 | 7.328 |
| AP(31,20)@0.4.18 | 12 | 2.820 | 2.642 / 0.563 / 0.086 | 3.704 / 2.308 | 195.1 | 405.1 | 1004.7 | 7.328 |
| AP(31,20)@0.5.0 | 12 | 2.820 | 2.642 / 0.563 / 0.086 | 3.704 / 2.308 | 195.1 | 405.1 | 1004.7 | 7.328 |

## FORCES on 0.5.1 and 0.6.0 (tesseral cap, zonal cap)
| Arm | Windows | Roughness (m) | R / I / C (m) | inside / outside median radius (m) | Day 1 error (m) | Day 3 error (m) | Day 7 error (m) | Day 3 roughness per km of error (m) |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| AP(0,20)@0.5.1 | 12 | 0.127 | 0.061 / 0.114 / 0.022 | 0.537 / 0.075 | 270.3 | 734.1 | 1091.1 | 0.159 |
| AP(4,20)@0.5.1 | 12 | 2.763 | 2.550 / 0.510 / 0.084 | 3.653 / 2.167 | 272.4 | 804.2 | 1544.1 | 3.537 |
| AP(8,20)@0.5.1 | 12 | 2.859 | 2.647 / 0.573 / 0.084 | 3.737 / 2.318 | 182.4 | 453.5 | 888.3 | 7.041 |
| AP(12,20)@0.5.1 | 12 | 2.820 | 2.642 / 0.563 / 0.086 | 3.704 / 2.308 | 195.1 | 405.1 | 1004.7 | 7.328 |
| AP(31,0)@0.5.1 | 12 | 2.831 | 2.642 / 0.565 / 0.084 | 3.719 / 2.312 | 189.5 | 439.6 | 978.9 | 7.207 |
| AP(0,20)@0.6.0 | 12 | 0.127 | 0.061 / 0.114 / 0.022 | 0.537 / 0.075 | 270.3 | 734.1 | 1091.1 | 0.159 |
| AP(4,20)@0.6.0 | 12 | 2.763 | 2.550 / 0.510 / 0.084 | 3.653 / 2.167 | 272.4 | 804.2 | 1544.1 | 3.537 |
| AP(8,20)@0.6.0 | 12 | 2.859 | 2.647 / 0.573 / 0.084 | 3.737 / 2.318 | 182.4 | 453.5 | 888.3 | 7.041 |
| AP(12,20)@0.6.0 | 12 | 2.820 | 2.642 / 0.563 / 0.086 | 3.704 / 2.308 | 195.1 | 405.1 | 1004.7 | 7.328 |
| AP(31,0)@0.6.0 | 12 | 2.831 | 2.642 / 0.565 / 0.084 | 3.719 / 2.312 | 189.5 | 439.6 | 978.9 | 7.207 |

## Fit against flight (fit@build>flight build)
| Arm | Windows | Roughness (m) | R / I / C (m) | inside / outside median radius (m) | Day 1 error (m) | Day 3 error (m) | Day 7 error (m) | Day 3 roughness per km of error (m) |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| AP(31,20)@0.4.14>0.4.15 | 12 | 2.875 | 2.641 / 0.560 / 0.086 | 3.803 / 2.307 | 241.3 | 543.8 | 977.7 | 5.933 |
| AP(31,20)@0.4.15>0.4.14 | 12 | 0.097 | 0.041 / 0.075 / 0.028 | 0.302 / 0.058 | 165.4 | 421.8 | 1004.0 | 0.201 |

## What the tesseral terms add on 0.5.1 (AP(31,20) minus AP(0,20))
| Window | Roughness of the difference (m) | Power share at or below 34 n | Largest peaks of its second difference |
| --- | --: | --: | --- |
| HX THEMIS A 2013-02-13 | 2.279 | 0.786 | 18.88/d (17.99 n), 22.02/d (20.99 n), 15.73/d (14.99 n), 21.02/d (20.03 n), 25.17/d (23.98 n) |
| HX THEMIS A 2013-02-15 | 2.748 | 0.802 | 10.58/d (10.08 n), 9.58/d (9.13 n), 20.88/d (19.90 n), 24.02/d (22.89 n), 17.73/d (16.90 n) |
| HX THEMIS D 2013-02-17 | 1.998 | 0.836 | 11.58/d (11.03 n), 10.58/d (10.08 n), 14.73/d (14.03 n), 12.58/d (11.99 n), 17.87/d (17.03 n) |
| HX THEMIS A 2013-02-11 | 1.597 | 0.790 | 11.58/d (11.04 n), 21.02/d (20.03 n), 17.87/d (17.03 n), 18.88/d (17.99 n), 24.17/d (23.03 n) |
| HX THEMIS A 2013-02-17 | 3.039 | 0.786 | 18.88/d (17.99 n), 22.02/d (20.99 n), 25.17/d (23.98 n), 15.73/d (14.99 n), 21.02/d (20.03 n) |
| HX THEMIS D 2013-02-11 | 3.133 | 0.801 | 11.58/d (11.03 n), 17.87/d (17.03 n), 21.02/d (20.02 n), 14.73/d (14.03 n), 24.17/d (23.02 n) |
| HX THEMIS D 2013-02-13 | 3.127 | 0.798 | 21.02/d (20.02 n), 17.87/d (17.03 n), 18.88/d (17.98 n), 24.17/d (23.02 n), 15.73/d (14.98 n) |
| HX THEMIS D 2013-02-15 | 2.759 | 0.799 | 18.88/d (17.98 n), 22.02/d (20.98 n), 15.73/d (14.98 n), 21.02/d (20.02 n), 24.17/d (23.02 n) |
| HX THEMIS E 2013-02-11 | 2.842 | 0.840 | 10.58/d (10.08 n), 11.58/d (11.03 n), 13.73/d (13.08 n), 12.73/d (12.12 n), 9.58/d (9.13 n) |
| HX THEMIS E 2013-02-13 | 3.108 | 0.803 | 11.58/d (11.03 n), 16.87/d (16.07 n), 20.02/d (19.07 n), 13.73/d (13.08 n), 23.17/d (22.07 n) |
| HX THEMIS E 2013-02-15 | 3.129 | 0.797 | 18.88/d (17.98 n), 21.02/d (20.03 n), 17.87/d (17.03 n), 22.02/d (20.98 n), 15.73/d (14.99 n) |
| HX THEMIS E 2013-02-17 | 2.880 | 0.797 | 18.88/d (17.98 n), 22.02/d (20.98 n), 15.73/d (14.99 n), 21.02/d (20.03 n), 25.17/d (23.98 n) |

## Verdict
Reproduced: AP roughness 3.095 m on THEMIS D 2013-02-13 on 0.5.1 (3.06 m published over fit and forecast), 0.071 m on 0.4.11. Over the 12
windows the median is 0.121 m on 0.4.11, 2.820 m on 0.5.1 and 2.820 m on 0.6.0 (0.6.0 flies these sets as 0.5.1 does); whiteroom XP 0.511 m on all three.

Term: the wide first-order tesseral set that 0.4.15 adds above an epoch eccentricity of 0.3 (SPEC 16.11 and 16.2: every q to |q| <= 10 and
|j| <= 33, evaluated at output time as a series in harmonics of the mean anomaly; src/tesseral.inc sp_terms, kWideE and kWideQ). Evidence:
the rise is at 0.4.15 exactly (0.4.12 to 0.4.14 equal 0.4.11; 0.4.15 to 0.6.0 equal 0.5.1); removing the tesserals (0, 20) returns 0.127 m
while the zonal tail, the Sun and Moon terms and the one-day class grid stay; a cap of 4 keeps 2.763 m (the low-degree terms carry it);
removing the zonal tail (31, 0) keeps 2.831 m; the roughness follows the flight, not the fit (0.4.14's set flown on 0.4.15 2.875 m,
0.4.15's set flown on 0.4.14 0.097 m); about 80 % of the second-difference power the tesseral terms add lies at or below 34 times the mean
motion, the series' own harmonics. The roughness is spread over the whole orbit: outside the median radius 0.08 m on 0.4.11 against
2.31 m on 0.5.1, where the field's own effect on THEMIS is smooth, so a ripple of the truncated series, not a perigee signal.
Not the resonance integrator's step (38 min for AP in this class in every build here), not the Sun and Moon cadence (kept in the smooth
(0, 20) arm), not space weather (no $SPW on this path).

Scale: about 2.9 m on every lead day, flat from day 1 to 7, against AP's 3D error of 195 m (day 1), 405 m (day 3) and 1,005 m (day 7) on
0.5.1: 7.3 m of roughness per km of error at day 3. The published THEMIS figures stand.

Error: the 0.4.15 release moves the error itself, mainly through the fit: day 3 545.0 to 405.1 m (-26 %), day 1 199.5 to 195.1 m, day 7
978.1 to 1,005.0 m (+3 %). In flight alone (0.4.15's set flown with and without the terms) the terms move day 1 from 165.4 to 195.1 m
(+18 %), day 3 from 421.8 to 405.1 m (-4 %) and day 7 from 1,004.0 to 1,004.7 m. A flight artifact of bounded amplitude, not an error
regression on the median; whether to smooth the output-time series is the module's decision.
Rule: roughness on 0.4.11 0.121 m; first release above twice that: 0.4.15 (2.820 m). FORCES arms on 0.5.1 back within twice
0.4.11's: AP(0,20)@0.5.1 0.127 m (day 3 error +81.2 %, day 7 +8.6 % against AP(31,20)).
Term named: yes; moves the error by more than 10 %: yes.
