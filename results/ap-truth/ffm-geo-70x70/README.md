# GEO gravity degree: the 45 GE windows flown again with FFM at 70x70, report only

Registered in `experiments/operator-theory/FFM-GEO-70X70.md` (commit d17d6841, 2026-11-06T08:10:08-05:00; first row flown 2026-11-06T13:13:55.498Z; registration before the first row: true; Amendment 1 commit b7843a76, 2026-11-06T08:19:00-05:00, first probe row 2026-11-06T13:19:15.488Z, before it: true). report only; no module change; cells.json untouched; no GEO burn verdict. Written by `experiments/operator-theory/ffm-geo-70x70.mjs`; `--check` reproduces this file and `table.json` from the stores.

## Verdict

**still worse: FFM at 70x70 is still worse than AP at 72/168 by the registered rule: gravity is ruled out; the eclipse model, the ephemeris and the frames stay report-only candidates; no record named.**

72/168: FFM 70x70 / AP 1.04 on 32 windows (FFM worse on 22); window-cluster lower bound above 1 in all seeds (1.000276 to 1.000276, range 0); degree effect 70x70 / 20x20 1 (largest window move 1, 0 m, GE|C006 BDS-2G|2025-10-08), interval [1, 1] (upper over seeds 1 to 1); the audit's 20x20 cell under the same five seeds: lower bound 1.000276 to 1.000276 (range 0, above 1 in all seeds; the bootstrap median takes values from the paired ratios themselves, so its percentile is discrete and moves little between seeds).

## FFM 2.2.1 at 70x70 against AP 0.5.1

45 windows registered; 45 rows in `ap/ffm221-70x70/regimes`, 35 flown (GE|C006 BDS-2G|2025-10-04: coverage; GE|C006 BDS-2G|2025-10-06: coverage; GE|C011 BDS-2G|2025-10-08: coverage; GE|C011 BDS-2G|2025-10-10: coverage; GE|C016 BDS-2G|2025-10-06: coverage; GE|C016 BDS-2G|2025-10-08: coverage; GE|C018 BDS-2G|2025-10-12: coverage; GE|C229 BDS-3G|2025-10-10: coverage; GE|C231 BDS-3G|2025-10-04: coverage; GE|C231 BDS-3G|2025-10-06: coverage). FFM 2.2.1 (wasm a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4, modules 93cb5a0584fa728864e4426cc9ceb368936589f9) at 70x70, fitted by analysis/estimation 0.7.0 (XM3 pin); AP 0.5.1 (`ap/b051/regimes`, AP72). exp(median over windows of ln(numerator / denominator)); e the 3D RMS RTN position error (km) of the lead day's bin counted from the end of the 72 h fit. windowCluster: 95 % bootstrap with the window as the cluster, 10000 draws, 5 seeds (SHA-256 of FFM-GEO-70X70|<population>|72|<lead>|seed<i>), the first seed's interval printed, every seed's bounds and their spread beside it. objectWeek: the same over satellite x ISO-week clusters, report only.

| Fit / lead (h) | Windows | Satellites | FFM 70x70 worse | FFM 70x70 / AP | 95 % window-cluster, 5 seeds | 95 % object-week (report only) | Median FFM 70x70 km | Median AP km |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |
| 72/48 | 33 | 9 | 13 | 0.937 | [0.854, 1.113]; lower over 5 seeds 0.854132 to 0.854132 (range 0), at or below 1 in all seeds | [0.824, 1.146] over 15; lower 0.823708 to 0.827727 | 0.035 | 0.032 |
| 72/72 | 30 | 9 | 18 | 1.088 | [0.963, 1.398]; lower over 5 seeds 0.963236 to 0.963236 (range 0), at or below 1 in all seeds | [0.942, 1.527] over 15; lower 0.935911 to 0.942919 | 0.064 | 0.046 |
| 72/168 | 32 | 9 | 22 | 1.04 | [1, 1.522]; lower over 5 seeds 1.000276 to 1.000276 (range 0), above 1 in all seeds | [0.998, 1.798] over 15; lower 0.998239 to 0.998291 | 0.28 | 0.209 |

Per satellite (windows, FFM 70x70 / AP):

| Satellite | 72/48 | 72/72 | 72/168 |
| --- | --- | --- | --- |
| C006 BDS-2G | 3, 1.237 | 3, 1.381 | 3, 1.452 |
| C011 BDS-2G | 2, 0.906 | 1, 1.297 | 3, 1.592 |
| C016 BDS-2G | 2, 0.862 | 3, 1.017 | 3, 1.117 |
| C018 BDS-2G | 4, 0.614 | 3, 0.64 | 3, 1.001 |
| C020 BDS-2G | 5, 1.312 | 5, 1.758 | 5, 2.44 |
| C217 BDS-3G | 5, 1.349 | 5, 2.288 | 5, 1.463 |
| C229 BDS-3G | 4, 0.679 | 3, 0.998 | 4, 0.993 |
| C231 BDS-3G | 3, 0.873 | 2, 0.995 | 2, 0.997 |
| J003 QZS-2G | 5, 0.812 | 5, 0.892 | 4, 0.986 |

## The degree effect: FFM 70x70 against FFM 20x20 (information)

FFM 70x70 against FFM 20x20 on the same windows (information): what the field does to FFM's own GEO error; the 20x20 rows are `ap/ffm220/regimes` (FFM 2.2.0, wasm d635a3d57a2c9ca91d111f74aad38b9d748d6c16199b22c6922af21c92fe2153).

| Fit / lead (h) | Windows | Satellites | FFM 70x70 worse | FFM 70x70 / FFM 20x20 | 95 % window-cluster, 5 seeds | 95 % object-week (report only) | Median FFM 70x70 km | Median FFM 20x20 km |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |
| 72/48 | 33 | 9 | 0 | 1 | [1, 1]; lower over 5 seeds 1 to 1 (range 0), at or below 1 in all seeds | [1, 1] over 15; lower 1 to 1 | 0.035 | 0.035 |
| 72/72 | 30 | 9 | 0 | 1 | [1, 1]; lower over 5 seeds 1 to 1 (range 0), at or below 1 in all seeds | [1, 1] over 15; lower 1 to 1 | 0.064 | 0.064 |
| 72/168 | 32 | 9 | 0 | 1 | [1, 1]; lower over 5 seeds 1 to 1 (range 0), at or below 1 in all seeds | [1, 1] over 15; lower 1 to 1 | 0.28 | 0.28 |

Exact ratio and the largest single-window move (70x70 minus 20x20, meters):

- 72/48: 1; largest 1 (0 m) at GE|C006 BDS-2G|2025-10-08.
- 72/72: 1; largest 1 (0 m) at GE|C006 BDS-2G|2025-10-08.
- 72/168: 1; largest 1 (0 m) at GE|C006 BDS-2G|2025-10-08.

## Instrument check (Amendment 1, information)

Amendment 1: the same windows and settings at a degree below 20, each against the stored 20x20 rows (information): the degree is in force where the figures move.

### 8x8 against 20x20

`ffm221-70x70/probe-8x8`: 45 rows, 35 flown.

| Fit / lead (h) | Windows | Satellites | FFM 8x8 worse | FFM 8x8 / FFM 20x20 | 95 % window-cluster, 5 seeds | 95 % object-week (report only) | Median FFM 8x8 km | Median FFM 20x20 km |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |
| 72/48 | 33 | 9 | 17 | 1 | [1, 1]; lower over 5 seeds 0.999966 to 0.999967 (range 0.000001), at or below 1 in all seeds | [1, 1] over 15; lower 0.999964 to 0.999964 | 0.035 | 0.035 |
| 72/72 | 30 | 9 | 16 | 1 | [1, 1]; lower over 5 seeds 0.999963 to 0.999963 (range 0), at or below 1 in all seeds | [1, 1] over 15; lower 0.999959 to 0.999959 | 0.064 | 0.064 |
| 72/168 | 32 | 9 | 14 | 1 | [1, 1]; lower over 5 seeds 0.999961 to 0.999961 (range 0), at or below 1 in all seeds | [1, 1] over 15; lower 0.999955 to 0.999956 | 0.28 | 0.28 |

Exact ratio and the largest single-window move (probe minus 20x20, meters):

- 72/48: 1; largest 1.000341 (0.001 m) at GE|C229 BDS-3G|2025-10-12.
- 72/72: 1.000001; largest 1.000417 (0.002 m) at GE|C229 BDS-3G|2025-10-12.
- 72/168: 1; largest 1.00068 (0.008 m) at GE|C229 BDS-3G|2025-10-12.

### 12x12 against 20x20

`ffm221-70x70/probe-12x12`: 45 rows, 35 flown.

| Fit / lead (h) | Windows | Satellites | FFM 12x12 worse | FFM 12x12 / FFM 20x20 | 95 % window-cluster, 5 seeds | 95 % object-week (report only) | Median FFM 12x12 km | Median FFM 20x20 km |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |
| 72/48 | 33 | 9 | 16 | 1 | [1, 1]; lower over 5 seeds 1 to 1 (range 0), at or below 1 in all seeds | [1, 1] over 15; lower 1 to 1 | 0.035 | 0.035 |
| 72/72 | 30 | 9 | 16 | 1 | [1, 1]; lower over 5 seeds 1 to 1 (range 0), at or below 1 in all seeds | [1, 1] over 15; lower 1 to 1 | 0.064 | 0.064 |
| 72/168 | 32 | 9 | 19 | 1 | [1, 1]; lower over 5 seeds 1 to 1 (range 0), at or below 1 in all seeds | [1, 1] over 15; lower 1 to 1 | 0.28 | 0.28 |

Exact ratio and the largest single-window move (probe minus 20x20, meters):

- 72/48: 1; largest 1.000003 (0 m) at GE|C229 BDS-3G|2025-10-12.
- 72/72: 1; largest 1.000002 (0 m) at GE|C229 BDS-3G|2025-10-12.
- 72/168: 1; largest 1 (0 m) at GE|C217 BDS-3G|2025-10-08.

## The audit cells under the five seeds (information)

the audit cells, FFM 2.2.0 at 20x20 against AP 0.5.1, read again under the five seeds (information).

| Fit / lead (h) | Windows | Satellites | FFM 20x20 worse | FFM 20x20 / AP | 95 % window-cluster, 5 seeds | 95 % object-week (report only) | Median FFM 20x20 km | Median AP km |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |
| 72/48 | 33 | 9 | 13 | 0.937 | [0.854, 1.113]; lower over 5 seeds 0.835963 to 0.854132 (range 0.018169), at or below 1 in all seeds | [0.828, 1.162] over 15; lower 0.827727 to 0.835963 | 0.035 | 0.032 |
| 72/72 | 30 | 9 | 18 | 1.088 | [0.963, 1.398]; lower over 5 seeds 0.963236 to 0.963236 (range 0), at or below 1 in all seeds | [0.943, 1.527] over 15; lower 0.935911 to 0.942919 | 0.064 | 0.046 |
| 72/168 | 32 | 9 | 22 | 1.04 | [1, 1.522]; lower over 5 seeds 1.000276 to 1.000276 (range 0), above 1 in all seeds | [0.998, 1.692] over 15; lower 0.998239 to 0.998291 | 0.28 | 0.209 |

## Settings

all-regimes.mjs ffmHigh() with degree and order 70: SPHERICAL_HARMONICS (embedded EGM2008) 70x70 through PCFForceModel MAXIMUM_DEGREE/MAXIMUM_ORDER of the $PRW execution request (lib/frame.mjs executionFrame), Sun and Moon point masses from DE440s, SRP_AREA_OVER_MASS fitted (seed 0.02, a priori 0.2), conical shadow, no drag, no tides, no Earth radiation, relativity NONE, RK78 1e-8 / 1e-3 to 300 s, IERS finals rows; no space weather (drag off). FFM 2.2.1 is 2.2.0 rebuilt on spacedatastandards.org 1.279.0: between modules f1517ef68e and 93cb5a058 only propagator/ffm/src/cpp/generated/sds/*_generated.h, package.json and plugin-manifest.json change. AP 0.6.3 equals 0.5.1 byte for byte at e 0.3 and below (COMPARE.md 2026-11-06, 53 of 56 examples equal, the 3 that move above e 0.3); every GE window is near-circular.

