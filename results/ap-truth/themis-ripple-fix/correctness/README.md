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
