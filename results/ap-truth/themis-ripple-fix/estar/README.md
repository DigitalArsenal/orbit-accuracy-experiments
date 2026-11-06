# e*(n, i) sweep (THEMIS-RIPPLE-FIX.md Amendments 7 and 12)

SUSPECT (Amendment 20): the reference shares the narrow set's admission rules by construction and was not checked against an
independent integration; the narrow set may be charged here for terms it rightly leaves to the rates. These figures are not used and
not published; the sweep is re-run with an independent reference in the all-regimes record.

estar.cpp: the module's narrow set (sp_terms at e <= 0.3, degree 2 to 12) through sp_six against the full-field quadrature under the
table's own admission rules, 7 days at 300 s; rows.jsonl (187 cases: 17 regimes x 11 eccentricities). Check: the THEMIS-like case at
e 0.30 reproduces 21.42 m RMS, 44.05 m maximum.

RMS / maximum / roughness of the difference (m) at selected eccentricities; e* by the registered rule (the smallest e failing 1 m RMS,
5 m maximum or 0.1 m roughness):

| Regime (n rev/day, i deg) | e 0.001 | e 0.01 | e 0.05 | e 0.1 | e 0.3 | e* |
| --- | --: | --: | --: | --: | --: | --: |
| Starlette (13.82, 49.8) | 7.41 / 25.1 / 8.43 | 7.06 / 24.9 / 8.89 | 17.11 / 53.7 / 19.12 | 34.43 / 108.9 / 35.71 | 205.08 / 662.6 / 74.15 | 0.001 |
| Ajisai (12.44, 50.0) | 5.79 / 17.7 / 5.21 | 5.82 / 18.5 / 5.64 | 13.95 / 42.6 / 13.20 | 27.09 / 80.4 / 23.23 | 123.81 / 347.2 / 48.58 | 0.001 |
| LARES (12.55, 69.5) | 5.57 / 17.1 / 5.60 | 5.29 / 19.3 / 5.80 | 13.40 / 42.5 / 13.77 | 26.28 / 76.6 / 25.51 | 113.52 / 434.1 / 52.55 | 0.001 |
| Jason-3 (12.81, 66.0) | 5.74 / 17.6 / 6.23 | 5.58 / 18.3 / 6.03 | 14.14 / 42.7 / 15.48 | 27.58 / 83.6 / 27.66 | 131.11 / 422.0 / 56.10 | 0.001 |
| Sentinel-3 (14.27, 98.6) | 7.41 / 20.4 / 10.38 | 6.93 / 20.1 / 9.36 | 16.91 / 50.3 / 23.67 | 33.20 / 101.8 / 42.04 | 275.20 / 773.9 / 88.61 | 0.001 |
| CryoSat-2 (14.52, 92.0) | 7.62 / 21.6 / 12.02 | 7.18 / 20.8 / 11.24 | 17.00 / 53.9 / 24.78 | 33.59 / 104.8 / 45.00 | 229.36 / 714.0 / 93.73 | 0.001 |
| LAGEOS-1 (6.39, 109.8) | 3.18 / 9.8 / 0.57 | 3.16 / 10.1 / 0.60 | 5.24 / 13.6 / 1.39 | 10.12 / 30.0 / 2.71 | 34.64 / 114.5 / 5.66 | 0.001 |
| LAGEOS-2 (6.47, 52.6) | 3.03 / 8.8 / 0.64 | 2.76 / 6.9 / 0.53 | 6.20 / 16.8 / 1.46 | 11.83 / 31.2 / 2.76 | 32.39 / 89.5 / 6.21 | 0.001 |
| Etalon (2.13, 64.9) | 2.00 / 4.9 / 0.029 | 1.69 / 4.1 / 0.030 | 2.69 / 6.6 / 0.046 | 5.11 / 12.7 / 0.086 | 14.79 / 39.5 / 0.186 | 0.001 |
| GPS (2.005, 55.0) | 1.29 / 2.8 / 0.022 | 1.20 / 2.5 / 0.017 | 2.14 / 4.6 / 0.030 | 5.20 / 11.3 / 0.082 | 14.72 / 37.8 / 0.169 | 0.001 |
| Galileo (1.70, 56.0) | 1.26 / 2.7 / 0.014 | 1.10 / 2.8 / 0.013 | 2.78 / 6.8 / 0.025 | 5.39 / 12.2 / 0.048 | 20.93 / 53.1 / 0.111 | 0.001 |
| GLONASS (2.13, 64.8) | 1.99 / 4.9 / 0.029 | 1.68 / 4.0 / 0.030 | 2.69 / 6.6 / 0.046 | 5.12 / 12.7 / 0.086 | 14.79 / 39.5 / 0.186 | 0.001 |
| Inclined geosynchronous (1.0027, 55.0) | 1.42 / 2.7 / 0.004 | 1.45 / 3.0 / 0.004 | 2.34 / 3.8 / 0.005 | 4.11 / 7.2 / 0.008 | 12.40 / 25.7 / 0.018 | 0.001 |
| Quasi-zenith (1.0027, 40.0) | 1.44 / 2.3 / 0.002 | 1.50 / 2.5 / 0.003 | 2.56 / 4.2 / 0.005 | 4.91 / 8.4 / 0.009 | 14.58 / 29.5 / 0.020 | 0.001 |
| Geostationary (1.0027, 0.1) | 0.26 / 0.3 / 0.000 | 0.61 / 0.9 / 0.001 | 2.84 / 3.8 / 0.005 | 5.65 / 8.4 / 0.010 | 16.07 / 30.5 / 0.023 | 0.03 |
| Molniya (2.006, 63.4) | 1.85 / 3.9 / 0.023 | 1.47 / 3.1 / 0.018 | 2.03 / 4.1 / 0.036 | 4.65 / 10.0 / 0.078 | 13.57 / 34.4 / 0.149 | 0.001 |
| GTO (2.40, 27.0) | 1.33 / 3.4 / 0.016 | 1.40 / 3.3 / 0.026 | 3.90 / 7.5 / 0.098 | 7.43 / 14.8 / 0.183 | 19.64 / 50.1 / 0.428 | 0.001 |

Reading: the narrow set (q in {-1, 0, 1} with the 0.5 m per-term keep) is 1 to 8 m RMS from the degree-12 field at near-circular
eccentricities in every regime but the geostationary one, and its departure grows with e. By the registered rule e* is the grid's
smallest eccentricity in 16 of 17 regimes (0.03 for the geostationary). Applied as registered, the rule moves almost every object to
the grid: a change of the model for every regime, not a threshold near 0.3. In low orbits the 0.1 m roughness bound at 300 s is not a
smoothness test: 300 s is a twentieth of the orbit, and the omitted terms at 2 to 10 times the mean motion show in the second
difference at their full size. The grid was checked against the quadrature only at e 0.82 (THEMIS); its validity at low e and in low
orbits is not established here. Not applied; for the SDN-AP session.
