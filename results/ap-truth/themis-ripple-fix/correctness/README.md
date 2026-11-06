# Correctness test (THEMIS-RIPPLE-FIX.md (a))

Elements: elements.json, the AP (31, 20) vacuum fits of THEMIS D cutoff 2013-02-12 and THEMIS E cutoff 2013-02-16 (fit-elements.mjs,
propagator/sdn-ap dist of modules 34b1b2c58). Harness: correctness.cpp, one native translation unit over the module's src (sp_terms,
sp_six) and the pinned field; build:
`clang++ -std=c++20 -O2 -I <gravity_egm.h and nrlmsise00.h as build.mjs generates them> -I propagator/sdn-ap/src -I foundation/sgp4-str3/src correctness.cpp`.
Quadrature: 4,096 mean anomalies by 32 arguments of perigee, two node phases, l 2 to 12. Output: themis-d.json, themis-e.json.

| Window | Table terms | Worst relative error of a held term | Defects | Omitted terms at or above 0.5 m (largest) | sp_six vs quadrature on the table's terms (RMS) | Table vs every harmonic (\|psi-dot\| >= 0.045 n): RMS / max / roughness |
| --- | --: | --: | --: | --: | --: | --: |
| THEMIS D 2013-02-12 | 1,001 | 9.0e-6 | 0 | 1,286 (23.9 m) | 0.8 mm (1.7e-6) | 64.6 / 249.1 / 2.962 m |
| THEMIS E 2013-02-16 | 986 | 4.6e-6 | 0 | 1,257 (23.6 m) | 0.2 mm (3.4e-7) | 68.0 / 250.7 / 3.152 m |

Roughness of the short-period displacement itself: the table 2.983 and 3.184 m; every harmonic 0.072 and 0.077 m.
Verdict: every held term passes (amplitude, phase, sign, e and i derivatives; no defect). The ripple and a mean-track displacement of
about 65 m RMS (250 m at most) are the truncation |q| <= 10, |j| <= 33: the series of a perigee pass at e 0.82 converges slowly in j
(the (2, 2, w = 2) family alone keeps terms of 12 to 18 m out to j = 40).

## Sizing (Amendments 1 and 2): the extended set against the full-field quadrature
Bounds (Amendment 2): RMS <= 1 m, maximum <= 5 m, roughness of the difference <= 0.1 m. Output: sizing-themis-d.json, sizing-themis-e.json
(the harness above; `rule` rows). Difference of each set's displacement from every admissible harmonic, 7 days at 300 s, D / E:

| Set | Terms | Max \|j\| | RMS (m) | Maximum (m) | Roughness of the difference (m) | Roughness of the set's own displacement (m) |
| --- | --: | --: | --: | --: | --: | --: |
| 0.6.x table (\|q\| <= 10, \|j\| <= 33) | 1,001 / 986 | 33 | 64.6 / 68.0 | 249.1 / 250.7 | 2.962 / 3.152 | 2.983 / 3.184 |
| Rule, keep 0.5 m | 2,211 / 2,169 | 131 / 130 | 8.50 / 8.55 | 67.8 / 69.7 | 9.145 / 9.173 | 9.394 / 9.282 |
| Rule, keep 0.2 m | 4,376 / 4,277 | 154 / 153 | 4.92 / 4.82 | 42.3 / 38.5 | 6.707 / 6.484 | 6.887 / 6.777 |
| Rule, keep 0.1 m | 6,950 / 6,818 | 184 / 181 | 2.83 / 2.79 | 27.5 / 21.5 | 4.115 / 4.331 | 4.290 / 4.562 |
| Rule, keep 0.05 m | 10,538 / 10,347 | 217 / 214 | 1.80 / 1.73 | 13.3 / 10.3 | 2.758 / 2.679 | 2.913 / 2.785 |
| 0.4.11 to 0.4.14 (q in {-1, 0, 1}, \|j\| <= l + 1, 0.5 m) | 210 / 208 | 6 | 136.8 / 137.7 | 563.7 / 610.9 | 0.100 / 0.087 | 0.141 / 0.132 |

No registered step meets the bounds: candidate 2 as a screened series fails. The terms under any per-term screen are the tail of a
perigee pulse; they add in phase, and at h = 300 s their high harmonics (|j| 100 to 200) dominate the second difference, so a wider
screened set is rougher, not smoother. 0.4.11's smoothness is the absence of every harmonic above |j| = 6, at 137 m RMS from the field.

## A1 sizing (Amendment 3): Fourier in the eccentric anomaly, N points, against the full-field quadrature
Output: resum-themis-d.json, resum-themis-e.json (`resum`). 246 (m, w) families. D / E:

| N | Grid bytes (families x 6 x N complex doubles) | RMS (m) | Maximum (m) | Roughness of the difference (m) | Roughness of the output (m) | Harness wall per step (us) |
| --: | --: | --: | --: | --: | --: | --: |
| 64 | 1,511,424 | 4.398 / 4.514 | 19.05 / 19.69 | 0.812 / 0.828 | 0.860 / 0.901 | 82 / 84 |
| 128 | 3,022,848 | 0.0067 / 0.0062 | 0.020 / 0.019 | 0.0054 / 0.0050 | 0.073 / 0.078 | 162 / 162 |
| 256 | 6,045,696 | < 0.0001 | < 0.0001 | < 0.0001 | 0.072 / 0.077 | 314 / 320 |
| 512 | 12,091,392 | < 0.0001 | < 0.0001 | < 0.0001 | 0.072 / 0.077 | 621 / 627 |

N = 128 meets every bound on both windows. Today's table through sp_six in the same harness: 5.1 / 5.4 us per step. The global Fourier
evaluation (6 x N complex terms per family per step) is the cost; a local interpolant on the same grid is the next sizing step.

## Amendments 4 and 5: local cubic, re-grid thresholds, element-linear grid
resum.cpp (runs/), resum2.cpp (runs2/). Four-point periodic Lagrange cubic on the uniform E grid, D / E:

| N | Grid bytes | RMS (m) | Maximum (m) | Roughness of the difference (m) | Output roughness (m) | Harness wall per step (us) |
| --: | --: | --: | --: | --: | --: | --: |
| 128 | 3,022,848 | 0.119 / 0.130 | 2.33 / 2.57 | 0.0032 / 0.0034 | 0.073 / 0.077 | 7.5 / 6.8 |
| 256 | 6,045,696 | 0.0095 / 0.0077 | 0.196 / 0.150 | 0.0002 / 0.0003 | 0.073 / 0.077 | 12.5 / 10.4 |
| 512 | 12,091,392 | 0.0006 / 0.0006 | 0.014 / 0.011 | < 0.0001 | 0.072 / 0.077 | 7.4 / 9.2 |

The cubic at N = 128 meets the bounds (Amendment 4: taken). Today's table through sp_six: 5.1 / 5.4 us per step.
Harmonics left out of every family (both windows): m-daily 42, one-day class 27 (the class's 27 terms, carried once, in the rates),
slow band 36; kept 519,206 / 512,352 (|j| <= 2047).

Drift (cubic, N = 128; RMS / maximum in m against the quadrature at the shifted elements; registered test: RMS <= 0.25 m), D / E:

| Step | Fixed grid | Element-linear grid |
| --- | --- | --- |
| de 1e-5 | 0.187 / 0.201 | 0.119 / 0.130 |
| de 3e-5 | 0.454 / 0.492 | 0.119 / 0.130 |
| de 1e-4 | 1.470 / 1.604 | 0.119 / 0.130 |
| de 3e-4 | 4.420 / 4.829 | 0.122 / 0.132 |
| de 1e-3 | 14.94 / 16.31 | 0.323 / 0.319 |
| di 1e-5 rad | 0.128 / 0.139 | 0.119 / 0.130 |
| di 3e-5 rad | 0.177 / 0.183 | 0.119 / 0.130 |
| di 1e-4 rad | 0.447 / 0.429 | 0.119 / 0.130 |
| da / a 3e-6 | 0.135 / 0.150 | 0.118 / 0.129 |
| da / a 1e-5 | 0.250 / 0.301 | 0.116 / 0.128 |
| da / a 1e-4 | 2.264 / 2.828 | 0.133 / 0.105 |

Thresholds: fixed grid de* = 1e-5, di* = 3e-5 rad, da/a* = 3e-6; element-linear grid de* = 3e-4, di* >= 1e-4 rad, da/a* >= 1e-4 (the
largest steps tested). Drift a flight sees (elements-drift.json: THEMIS D fits at cutoffs 2013-02-12, 14, 16, epochs two days apart):
e 0.822174, 0.821712, 0.821167 (about -2.5e-4 per day), i +9.5e-5 rad then -2e-6 rad, n -4.8e-5 then -4.2e-5 rev/day (da/a about
+3e-5 per two days). Over 7 days: about 1.8e-3 in e. Re-grids per 7-day flight: fixed grid about 180 (e-limited), element-linear about 6.
Memory: fixed 3.0 MB, element-linear 12.1 MB (grid and three derivative grids) per object above e 0.3.

## Cost before (cost.mjs, cost-before.json; median of 5; fit and 7-day flight at 300 s, 2,016 steps; owner Mac under lane load)
| Window | 0.4.11 fit (ms) | 0.4.11 per step (us) | base fit (ms) | base per step (us) |
| --- | --: | --: | --: | --: |
| THEMIS D 2013-02-12 | 2,080 | 275.7 | 33,770 | 2,544.8 |
| THEMIS E 2013-02-16 | 3,674 | 279.9 | 20,281 | 2,732.6 |
| TESS 2026-07-27 | 211 | 51.1 | 1,880 | 324.3 |
Base: the modules 34b1b2c58 dist (sdn-ap 0.6.1, SHA-256 05dd4a6600fb4c65...); 0.6.2 was not yet on origin/main.
