# FFM forecast normal error at high |beta| on GLONASS: a correct area seed, or a wider prior?

**Yes, either one removes it, by the registered rule.** On GLONASS 54377 at |beta| >= 75 deg (23 primary windows, one satellite, one event), the median normal error at 6 h, signed by beta, falls from 0.728 m under C2's seed to 0.069 m with a published-dimension seed that includes the arrays (A1) and to 0.075 m with a 1000 % prior on C2's seed (A2). Both are REMOVED: the paired change is -0.609 m [-0.897 to -0.459] and -0.603 m [-0.770 to -0.445]. All samples and GFZ say the same. At the peak (beta -87.1) N goes from -1.11 m to -0.03 m. The sag is gone: fitted AGOM on the event over AGOM at low beta is 0.937 under A0, 1.018 under A1, 1.017 under A2. The sag was the prior, not the data.

**At low beta it helps, which was not predicted.** There is no HARM in any cell. Radial RMS falls to 0.40-0.49 of A0's at every lead on both matched sets, along-track RMS to 0.58-0.73 at 1 and 6 h and 0.83-0.86 at 12 h (24 to 72 h: 0.90-0.99, most intervals holding 1), and N stays put (0.98-1.02). AGOM itself moves only 0.37 % there, so this is not the force.

**The fit improves too (report only, no rule).** Median reduced chi-square, A1 over A0, is 0.345 [0.328 to 0.356] on 189 pairs at |beta| < 30 and 0.014 [0.008 to 0.020] on the event; the residual per axis falls from 0.518 m to 0.055 m on the event and from 0.133 m to 0.077 m at low beta. The fitted epoch state moves a median 0.284 m at low beta and 1.075 m on the event. This supports the reading that a prior several of its own sigmas from the data distorts the whole fit. At 10 m per axis the data barely resist a shift of a few tenths of a meter along their weak direction. That reading is an inference from these numbers, not a separate test.

**Galileo's seed is right, and its prior changes nothing.** Fitted AGOM over the seed is 0.92-0.96 per beta bin. G2 against G0: T NO CHANGE, RMS ratios 1.0000 at 24, 48 and 72 h. N keeps Galileo's sign in both arms (S -0.09 to -0.03 m under G0, -0.09 to -0.03 m under G2). Neither seed nor prior explains Galileo's along-track error. It stands at 61.4 m RMS at 72 h (the looks' 61 m), and it splits by block: FOC 65.0 m, IOV 6.1 m.

**A look, not a test: FOC's along-track error fits one constant force.** Chosen after the table; no rule attaches. T at 72 h on the 17 FOC satellites follows one shape, K g(beta), where g is the orbit mean of the along-track projection of the yaw-steering Y axis: K = 92.4 m, R^2 0.988, leaving 7.0 m RMS of 64.7 m. The three planes agree (K 92.9, 92.3, 91.8 m). By arithmetic that is a constant Y acceleration of about 0.69-0.75 nm/s^2, the same from the 24, 48 and 72 h leads. IOV shows -6.5 m (R^2 0.59) and GLONASS no such shape (R^2 0.15). A cannonball has no Y force. Untested next step, not run here: FFM's ECOM2_Y0 dynamic parameter or a fixed Y bias on FOC.

**Still unexplained.** A residual S of 0.056 to 0.083 m remains above 30 deg on GLONASS in A1; about half of the moderate-beta error (0.091 and 0.182 m under A0) was the same drag. Galileo's opposite sign is untouched. Both look like the cannonball's form; that is not tested here.

**Nothing here reaches C3-small**: not C2's seeds, not P_C2, not its chain, rows or results. What it would mean for C3's next round, if the coordinator carries it forward: change the GLONASS seed or prior before calibrating. The plane 2 event would go away, and R and T would shrink at every beta, so constants fitted under A0 would over-cover R and T on GLONASS and would have to be refit. Galileo would not change.

## What ran

Registered before any score (PLAN.md; wip commit 95d48012fd, runner 6d4b77b9e7). C2's R3 fit through C3-small's arc-disjoint chain: the last 24 h of the latest ESA0OPSFIN arc ending by the cutoff; leads 1, 6, 12, 24, 48, 72 h against ESA's next arcs, GFZ rapid orbits beside them. Calibration dates only (cutoffs 2025-10-03 to 2026-03-29), no truth after 2026-05-31. C3's calibration satellites only: 4 GLONASS, 19 Galileo. Modules at 9a05d899b by git show and SHA-256: estimation 0.7.0, ffm 2.0.4, gp-error-model 0.11.0, solar-system-bodies 0.5.2.

| arm | satellites | seed, m2/kg | prior sigma |
| --- | --- | ---: | ---: |
| A0, control | GLONASS | 0.00759375 (3.05 x 2.71 m body face / 1415 kg x 1.3) | 100 % |
| A1 | GLONASS | 0.0325046 (Duan et al. 2020, J. Geod. 94:72, Table 5: arrays 30.85 + largest body surface 4.53 = 35.38 m2 / 1415 kg x 1.3) | 100 % |
| A2 | GLONASS | 0.00759375 | 1000 % |
| G0, control | Galileo | 0.0253-0.0258 per object (GSC section 6: 2 x 5.41 + Z; IGS mass; x 1.3) | 100 % |
| G2 | Galileo | the same | 1000 % |

3525 fits, each with one forecast: 3525 CONVERGED, 0 refused. Full tables: [table.md](table.md), [table.json](table.json), [looks.json](looks.json), [consumers.json](consumers.json).

## Removal on the event, N at 6 h

Control: S(A0, H, 6 h) = 0.728 m (band 0.4 to 1); A0's AGOM/seed at |beta| >= 80 = 3.79 (below 4): PASS.

| arm | windows | S, m | S, GFZ, m | paired change, m | interval, m | verdict | AGOM over 0.00759375, event | at low beta | sag ratio |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: |
| A1 | 23 | 0.069 | 0.069 | -0.609 | -0.897 to -0.459 | REMOVED | 4.29 | 4.22 | 1.018 |
| A2 | 23 | 0.075 | 0.074 | -0.603 | -0.770 to -0.445 | REMOVED | 4.29 | 4.22 | 1.017 |
| A0 | 23 | 0.728 | 0.719 | | | | 3.94 | 4.20 | 0.937 |

N per beta bin, 3-day grid, S at 6 h in m:

| arm | 0-15 | 15-30 | 30-60 | 60-75 | 75-90 |
| --- | ---: | ---: | ---: | ---: | ---: |
| A0 | 0.008 | -0.002 | 0.091 | 0.182 | 0.747 |
| A1 | 0.007 | -0.012 | 0.056 | 0.083 | 0.078 |
| A2 | 0.007 | -0.012 | 0.056 | 0.084 | 0.085 |
| G0 | -0.026 | -0.052 | -0.085 | -0.068 | - |
| G2 | -0.026 | -0.052 | -0.085 | -0.068 | - |

## The fit itself, report only

| arm | set | pairs | chi-square ratio | interval | residual per axis, control to arm, m | state move, m | interval, m |
| --- | --- | ---: | ---: | --- | --- | ---: | --- |
| A1 | H | 28 | 0.014 | 0.008 to 0.020 | 0.518 to 0.055 | 1.075 | 1.022 to 1.211 |
| A1 | M1 | 84 | 0.310 | 0.285 to 0.330 | 0.128 to 0.071 | 0.282 | 0.249 to 0.307 |
| A1 | M2 | 63 | 0.360 | 0.343 to 0.375 | 0.137 to 0.082 | 0.287 | 0.255 to 0.322 |
| A1 | |beta| < 30, every GLONASS window | 189 | 0.345 | 0.328 to 0.356 | 0.133 to 0.077 | 0.284 | 0.265 to 0.298 |
| A1 | 30 <= |beta| < 75, every GLONASS window | 198 | 0.154 | 0.135 to 0.171 | 0.171 to 0.065 | 0.415 | 0.395 to 0.439 |
| A2 | H | 28 | 0.014 | 0.008 to 0.020 | 0.518 to 0.055 | 1.063 | 1.010 to 1.197 |
| A2 | M1 | 84 | 0.310 | 0.286 to 0.330 | 0.128 to 0.071 | 0.279 | 0.246 to 0.303 |
| A2 | M2 | 63 | 0.360 | 0.343 to 0.375 | 0.137 to 0.082 | 0.283 | 0.251 to 0.318 |
| A2 | |beta| < 30, every GLONASS window | 189 | 0.345 | 0.328 to 0.355 | 0.133 to 0.078 | 0.281 | 0.263 to 0.295 |
| A2 | 30 <= |beta| < 75, every GLONASS window | 198 | 0.154 | 0.134 to 0.171 | 0.171 to 0.065 | 0.411 | 0.391 to 0.433 |
| G2 | every Galileo window | 1140 | 1.000 | 1.000 to 1.000 | 0.190 to 0.190 | 0.001 | 0.001 to 0.001 |

## Galileo, per satellite: a look

A look, not a test: chosen after the table, no rule attaches; every converged window of G0 (and of A0, A1 on the 3-day grid), no sample filter.

| NORAD | SVN | block | plane | TX power, W | T median at 24, 48, 72 h, m | T RMS at 72 h, m | AGOM/seed | residual, m | K, m | R^2 |
| ---: | --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 37846 | E101 | IOV | 2 | 135 | 0.2, 0.7, 1.3 | 3.0 | 0.970 | 0.098 | 0.9 | -0.024 |
| 38857 | E103 | IOV | 3 | 95 | 1.2, 3.9, 6.0 | 8.7 | 0.954 | 0.096 | -10.7 | 0.862 |
| 43058 | E218 | FOC | 1 | 265 | -11.5, -35.9, -66.3 | 63.9 | 0.944 | 0.202 | 83.5 | 0.992 |
| 61183 | E226 | FOC | 1 | 265 | -12.9, -41.2, -73.5 | 72.1 | 0.939 | 0.225 | 94.4 | 0.995 |
| 43057 | E217 | FOC | 1 | 265 | -12.8, -40.3, -75.6 | 70.6 | 0.944 | 0.221 | 92.4 | 0.994 |
| 40890 | E206 | FOC | 1 | 265 | -12.4, -38.6, -72.3 | 68.4 | 0.955 | 0.213 | 89.5 | 0.994 |
| 41549 | E211 | FOC | 1 | 265 | -14.4, -43.6, -81.1 | 80.6 | 0.954 | 0.244 | 105.4 | 0.992 |
| 43056 | E216 | FOC | 1 | 265 | -12.8, -40.4, -72.3 | 70.6 | 0.943 | 0.205 | 92.0 | 0.975 |
| 43564 | E221 | FOC | 2 | 265 | 9.2, 28.9, 53.2 | 51.1 | 0.950 | 0.168 | 90.0 | 0.992 |
| 49809 | E223 | FOC | 2 | 265 | 9.7, 30.6, 54.4 | 53.7 | 0.947 | 0.180 | 94.5 | 0.992 |
| 43566 | E219 | FOC | 2 | 265 | 9.4, 30.6, 54.9 | 54.7 | 0.949 | 0.183 | 95.5 | 0.969 |
| 43565 | E222 | FOC | 2 | 265 | 10.2, 31.6, 57.2 | 55.9 | 0.950 | 0.187 | 98.4 | 0.990 |
| 40544 | E203 | FOC | 2 | 265 | 7.9, 25.4, 46.2 | 44.4 | 0.963 | 0.158 | 78.3 | 0.976 |
| 49810 | E224 | FOC | 2 | 265 | 9.6, 31.0, 58.1 | 55.0 | 0.946 | 0.181 | 96.7 | 0.994 |
| 41861 | E213 | FOC | 3 | 265 | -6.5, -20.4, -40.9 | 59.0 | 0.956 | 0.188 | 78.3 | 0.995 |
| 59598 | E225 | FOC | 3 | 265 | -8.7, -25.7, -43.6 | 75.8 | 0.942 | 0.238 | 100.8 | 0.996 |
| 41859 | E207 | FOC | 3 | 265 | -7.5, -24.1, -40.8 | 67.4 | 0.957 | 0.219 | 89.5 | 0.996 |
| 41860 | E212 | FOC | 3 | 265 | -7.9, -24.6, -40.8 | 70.6 | 0.960 | 0.223 | 94.1 | 0.996 |
| 59600 | E227 | FOC | 3 | 265 | -8.4, -29.4, -51.3 | 73.0 | 0.940 | 0.222 | 96.5 | 0.982 |

FOC by plane and month, median T at 72 h, m (median beta, deg):

| month | plane 1 | plane 2 | plane 3 |
| --- | ---: | ---: | ---: |
| 2025-10 | 43.3 (15.8) | 53.6 (21.7) | -87.6 (-63.8) |
| 2025-11 | -40.5 (-13.4) | 65.9 (32.5) | -83.0 (-55.8) |
| 2025-12 | -75.6 (-42.5) | 66.4 (33.4) | -61.9 (-31.3) |
| 2026-01 | -87.5 (-69.0) | 52.9 (22.9) | -3.5 (-2.1) |
| 2026-02 | -86.5 (-64.6) | 28.4 (6.5) | 58.0 (25.7) |
| 2026-03 | -71.3 (-39.6) | -32.8 (-10.4) | 80.7 (49.4) |

## Every fit that carries a seed and a prior

Read from the code. Fitted over seed comes from this test or from stored rows on the coordinator's approved list (consumers.json): file names checked first, a row's date read first, rows after 2026-05-31 skipped (45 rows; 229 carried no date and were skipped), only the satellite's number, fit.parameters and fit.termination used, 61 files in the integrity log. "Not read" means not opened under the integrity rules.

| consumer | fit | seed, m2/kg | prior | does the seed omit arrays? | fitted over seed | where |
| --- | --- | --- | --- | --- | --- | --- |
| R3 GLONASS: C2, C3-small | state + AGOM, 24 h | AGOM 0.00759375 | 100 % | **Yes.** Body face only; 30.85 m2 of arrays left out | this test, A0: 4.20-4.23, 3.91 at |beta| >= 75; C2 and C3 rows not read | C2 seeds.mjs:21, run.mjs:344-349; C3 lib/seeds.mjs:27, lib/open.mjs:37-43 |
| R3 Galileo: C2, C3-small | state + AGOM, 24 h | AGOM 0.0253-0.0258 | 100 % | No. Arrays + largest box face | this test, G0: 0.92-0.96; C2 and C3 rows not read | C2 seeds.mjs:25; C3 lib/seeds.mjs:28-29 |
| R3 spheres: LAGEOS-1, -2, LARES-2, Etalon-1, -2 | state + AGOM, 24 h | AGOM 0.000617-0.00121 | 100 % | None to omit | not read (C2 R3 rows, C3 rows) | C2 seeds.mjs:16-20 |
| R1 Swarm A, B, C | state + B + AGOM, 24 h | AGOM 0.00350423, B 0.00593023 | 30 % each | No arrays deployed; flight-direction face only, 1.275 m2 on a 9.1 m body | AGOM 1.08, B 1.30-1.34; 356 of 363 converged | C2 seeds.mjs:35, run.mjs:344-349 |
| R1 GRACE-FO 1, 2 | state + B + AGOM, 24 h | AGOM 0.00206533, B 0.00349517 | 30 % each | Front panel only, 0.955 m2 of the macro model | AGOM 1.02, B 1.54-1.56; 237 of 242 converged | C2 seeds.mjs:49-50 |
| R1 COSMIC-2 FM1, 2, 5, 6 | state + B + AGOM, 24 h | AGOM 0.00731192, B 0.012374 | 30 % each | **Yes.** Stowed bus face; deployed arrays left out | AGOM 1.15-1.16, B 1.69-1.79; 201 of 484 converged | C2 seeds.mjs:51 |
| R2 Sentinel-1A, -1C | state + B + AGOM, 24 h | AGOM 0.00594966, B 0.0100686 | 30 % each | **Yes.** Body 2.5 x 4 m; 2 x 10 m arrays and the 12 m antenna left out | AGOM 1.03-1.04, B 0.83-0.88 (5 at 0); 225 of 242 converged | C2 seeds.mjs:36 |
| R2 spheres: Ajisai, LARES, LARETS, Starlette, WESTPAC | state + B + AGOM, 24 h | AGOM 0.00035-0.00689 | 30 % each | None to omit | AGOM 0.95-1.00, B 0.86-1.00; 465 of 605 converged | C2 seeds.mjs:38-43 |
| No row in the allowed files: TerraSAR-X, Sentinel-1D, COSMIC-2 FM4, Stella | state + B + AGOM, 24 h | as above; TerraSAR-X AGOM 0.00478135, B 0.00809152 | 30 % each | TerraSAR-X end face; Sentinel-1D and FM4 **yes**; Stella none | not read | C2 seeds.mjs:36-37,51 |
| C3-small R2-M, R2-O | state + B + AGOM, 24 h | the R2 spheres' seeds | 30 % each | None to omit | not read (C3 rows) | C3 lib/open.mjs:37-43 |
| XM2, XM3: F2, F3 on Swarm | state + B + AGOM, 72 h | seeds-R1R2.json | 30 % each | as R1 | XM3 F2: AGOM 2.46-3.13 (2 at 0), B 1.18-1.23; 450 of 450 converged | ffm-atmosphere-xm3/lib/ffm.mjs:102, ffm-atmosphere-vs-sgp4/lib/ffm.mjs:102 |
| XM2, XM3: F2, F3 on GRACE-FO | state + B + AGOM, 72 h | seeds-R1R2.json | 30 % each | as R1 | XM3 F2: AGOM 1.85-1.86 (1 at 0), B 1.44-1.45; 300 of 300 converged | same |
| XM2, XM3: F2, F3 on Sentinel-1A, -1C | state + B + AGOM, 72 h | seeds-R1R2.json | 30 % each | **Yes**, as R2 | XM3 F2: AGOM 1.73-1.83 (14 at 0), B 0.60-0.62 (113 at 0); 270 of 270 converged | same |
| ISS: C2 type I, B2 A5 | state + B + AGOM | B 0.01, AGOM 0.02 (generic, no area behind them) | 100 % each | Not area-based | C2 iss-fit: AGOM 0.02 (230 at 0), B 0.66; 463 of 474 converged; iss-fit60: AGOM none, B none; 0 of 9 converged; B2 rows not read | C2 run.mjs:26-32; sdn-ap-mixed-screening/config.json:81,91 |
| Starlink: A3, A12 P0, P3 (B2) | state + B + AGOM (P3 + in-track, sigma 1e-5 m/s2) | B 0.03; AGOM 0.11 below NORAD 56000, 0.19 from it (G1's settings) | 30 % each | No area arithmetic stated | not read (B2 rows) | sdn-ap-mixed-screening/lib/a12.mjs:20-29 |
| Starlink: A12 P1 (B2) | state + B | the same; AGOM held at the seed | B 30 %; AGOM zero width | No area arithmetic stated | not read (B2 rows) | sdn-ap-mixed-screening/config.json:162-166 |
| E13 head fit (Starlink forecast) | state + B | B 0.03; AGOM locked at 0.11/0.19 | AGOM zero width | No area arithmetic stated | not read (not on the approved list) | e13-open-dca/head-fit.mjs:25-26,62 |
| analysis/od fit_ffm (V2, operator arcs) | state + B_eff | B 0.003; AGOM 0.02 fixed | B none by default (e2e script 0.02); AGOM zero width | Generic number | not read (not on the approved list) | modules analysis/od/src/cpp/src/plugin_entrypoints.cpp:114-116, operator_records.cpp:25; v2-operator-seeded-prediction/wasm.mjs:119 |
| flows/supplemental-omm nodes/od, propagator/sdn-ap and sgp4-xp fits | SGP4-XP: elements + BTERM + AGOM | 0 (default) | FIT.DRAG_PRIOR, FIT.SRP_PRIOR default 0 +- 0.05 | No area | not read (not on the approved list) | modules flows/supplemental-omm/nodes/od/README.md:22-30; propagator/sdn-ap/README.md:89 |
| XP-merit, XP-ablation | SGP4-XP | BTERM log-normal median 0.01; AGOM 0.01 | BTERM sigma ln 10; AGOM held, sigma 1e-9 | Generic number | not read (not on the approved list) | xp-atmosphere-merit/config.json:19-20; xp-atmosphere-ablation/config.json:115-117 |
| flows/open-dca, analysis/density-calibration energy arcs | B | AGOM 0.0135 fixed | AGOM zero width | Generic number | not read (not on the approved list) | modules analysis/density-calibration/src/open_dca_energy_arcs.hpp:24 |
| Modules scripts and catalog requests (no AGOM fit): catalog default, gp-error-model calibration worker, CA farm and PPE fixture, maneuver-detection study, od operator environment; OrbPro specs | none of AGOM | AGOM 0.02 (DEFAULT_SRP_AREA_OVER_MASS) | AGOM zero width | Generic number | no fit to show | modules propagator/ffm/catalog-configuration.mjs:28; gp-error-model/scripts/ffm-calibration-worker.mjs:83; conjunction-assessment/scripts/generate-ffm-ppe-fixture.mjs:57, scripts/lib/ffmFarmWorker.mjs:48; maneuver-detection/study/lib/ffm-provider.mjs:26; od/scripts/operator-environment.mjs:56 |
| propagator-published-truth | state + B + AGOM | B 0.01, AGOM 0.02 | 100 % each, measurement 1 m | Generic number | not read (not on the approved list) | propagator-published-truth/config.json:181 |
| E2 GPS | state + AGOM | AGOM 0.02 | sigma 0.01 (50 %) | Generic number | not read (not on the approved list) | e2-catalog-covariance/config.json:53-56 |
| E7 | B, or ECOM2 terms on GPS | B from BSTAR; ECOM2 0 | B sigma 0.02, 0.002; ECOM2 sigma 2e-9 | AGOM held | not read (not on the approved list) | e7-full-force-handoff/products.mjs:148-156 |
| E6 SLR, E5, E8, E14, E16 | B; AGOM held | B per target or from BSTAR | E6 B 30 %; E16 sigma max(0.02, B) | Spheres in E6; generic elsewhere | not read (not on the approved list) | e6-public-observations/steps/40-slr-fit.mjs:78; e16-cross-regime-epoch/q2lib.mjs:101-109; e14-covariance-realism/s2.mjs:21 |

**What the list says.** The same defect is likeliest on the LEO fits, and that is not tested here. At 24 h and a 30 % prior, AGOM stays near its seed: 1.08 on Swarm, 1.02 on GRACE-FO, 1.03-1.04 on Sentinel-1. On 72 h arcs with the same prior it reaches 2.46-3.13, 1.85-1.86 and 1.73-1.83 times the seed, which is 4.9-7.1, 2.8-2.9 and 2.4-2.8 prior sigmas from it, against about 3.2 on GLONASS here. The 72 h fits are still under that prior, so the data's own values may lie further out. ISS's AGOM sits at its zero bound on 230 of its 463 converged fits.

## Disclosures

1. Known before registering: the looks' numbers, including 4.17-4.28 and the sag. A1's 4.28 falls at the top of that range; it is C2's rule applied to Table 5, not a fit. At sigma 100 % of the seed the other readings (3.73, 4.14, 4.73) move the pull by under 2 %.
2. Table 5 is "adjusted metadata": areas fixed, optical parameters adjusted; its +/-x surface carries a shape factor of 0.728 that a cross-section ignores. GLO-M+ satellites (3 of 4) are given GLO-M's surfaces. Cr 1.3 is C2's rule. Springer refuses an anonymous client; the table was read from the Wayback copy of its PDF, SHA-256 07ee245babb814a2....
3. The event is one satellite and one event. Daily windows share a slowly varying beta; the intervals speak about windows, not about a population of events. Galileo in this population reaches |beta| 72.9 at most.
4. M1 lies largely in the eclipse season (41 of 84 windows); M2 does not.
5. GNSS truth at 1, 6 and 12 h is the next daily file, which may share tracking data with the fit's. GFZ is reported beside it.
6. The low-beta help, the chi-square and state-move table, the Galileo per-satellite look and the Y-axis shape were not registered as tests. The first is a registered cell with an unpredicted direction; the others are report only.
7. No maneuver screen. One known unlisted event: R855 (40001), 2026-02-16, public in C3's P2; it stays in the grid's primary samples, outside H, M1 and M2, and table.md names it among the largest errors.
8. C3-small's chain was imported read-only with SHA-256 pins; no C3 row or result was opened. The Sun for beta comes from propagator/solar-system-bodies with DE440s, not the looks' low-precision formula.

## Cost and reproduction

Per arm and window, median on one core under load near 100: fit 4.2 s (2 FFM rounds with STM over the 24 h arc, 145 points at 600 s), forecast and statistics 6.8 s (96 h from the fit epoch, covariance carried, outputs at the six leads); RK78, relative tolerance 1e-10, steps up to 120 s, 70 x 70, NRLMSISE-00 with B fixed at 0, Sun and Moon, cannonball SRP. 10.7 CPU-h in all; about 85 min on 8 workers. Store /opt/data/sdn-archive/ffm-srp-seed-high-beta, 25 MB.

```
node experiments/ffm-srp-seed-high-beta/run.mjs --launch --workers 8
node experiments/ffm-srp-seed-high-beta/score.mjs
python3 experiments/ffm-srp-seed-high-beta/looks.py
node experiments/ffm-srp-seed-high-beta/consumers.mjs
node experiments/ffm-srp-seed-high-beta/report.mjs
node experiments/ffm-srp-seed-high-beta/run.mjs --check
```
