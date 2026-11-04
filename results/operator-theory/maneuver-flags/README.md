# Maneuver flags on the precise-orbit windows

Report only, from `results/ffm-losses-to-ap` (fixes F5 and F10). `experiments/operator-theory/maneuver-flags.mjs` marks every window of Sentinel-1 (AP5.md, 300 windows), the altimetry satellites (AP6.md, 138) and the three WAAS geostationary satellites (GEO-TRUTH.md, 81) with the steps of its truth's mean semimajor axis, and splits FFM against AP into flagged and step-free windows. The site reads the counts in `results/ap-truth/compare/cells.json` (`burnsInFit`, `burnsInForecast`) and the examples in `results/ap-truth/compare/examples`.

## The flag

`experiments/operator-theory/lib/steps.mjs`. Each truth state's osculating semimajor axis and orbit plane come from `foundation/orbits` (`cartesian_to_keplerian`); the rest is averaging and differencing.

- Low orbit (the study's `skeptic-drag/steps.py`): the time mean of the semimajor axis over each revolution, node to node; a revolution with a hole is left out. The change at a revolution is the median of the 12 revolutions from it less the median of the 12 before; a step is that change less the median change 1 to 3 days either side (the drift) of 8 m or more, the largest within 12 revolutions.
- Geosynchronous (`geo-burns.mjs`, the study's `burn-times.mjs`): on the hour, the mean over the sidereal day after less the day before, less the same difference 1 to 3 days either side; a burn is 4 times the satellite's median residual or more, or a turn of the orbit plane 4 times its median or more. The daily rule of GEO-TRUTH.md is unchanged beside it.
- A window is flagged at a fit and lead when a step falls in the fit arc or in the forecast span to the lead; step-free when none does and the detector covered both; unchecked otherwise (the Sentinel-1 product misses the file of each month's first day). A maneuver outranks a storm (GFZ Ap of 30 or more) wherever a class is assigned.

The study averaged the states of each revolution. The twice-per-revolution swing of the osculating semimajor axis, about 9 km, then moves a mean by one state's share whenever a revolution holds one state more: about 15 m at Sentinel-1's 10 s, about 440 m at the altimetry products' 300 s. Measured on Sentinel-1A, the revolution-to-revolution scatter is 15.3 m on state means and 3.6 m on time means; of the study's 40 Sentinel-1A steps, 10 remain. Its +12.5 m step of 2026-05-06T04:42 is +7.9 m on time means (2026-05-06T03:03), under the 8 m rule, so `S1|39634|2026-05-03` is not flagged; at its 24 h fit it is unchecked besides, the 2026-05-01 hole lying in its arc. The same burn moves FFM's orbit-mean radial distance by 8.8 m in the `best-near-700-km` example.

## Results

`table.md` and `table.json`: by group, fit and day, the windows flagged (in the fit, in the forecast), step-free and unchecked, and FFM against AP on each. `flags.json`: every window's steps (hours from the cutoff, size in m), unchecked spans and storm days, and every object's steps.

| | Fit, h | Day | Flagged | Step-free | Unchecked | FFM / AP median km, flagged | FFM / AP median km, step-free | FFM worse, flagged / step-free |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Near 700 km | 24 | 7 | 116 | 128 | 30 | 6.635 / 3.247 | 3.281 / 1.602 | 86 % / 75 % |
| Near 700 km | 72 | 7 | 122 | 108 | 27 | 3.814 / 3.975 | 2.834 / 2.426 | 61 % / 72 % |
| Low orbit, altimetry | 24 | 7 | 32 | 71 | 0 | 10.598 / 7.867 | 0.323 / 3.236 | 84 % / 0 % |
| Low orbit, altimetry | 72 | 7 | 40 | 63 | 0 | 12.013 / 11.760 | 0.314 / 0.760 | 50 % / 21 % |
| Geostationary, WAAS | 24 | 7 | 33 | 43 | 0 | 21.679 / 21.557 | 22.970 / 22.971 | 79 % / 28 % |
| Geostationary, WAAS | 72 | 7 | 33 | 40 | 1 | 23.335 / 23.405 | 28.877 / 28.892 | 39 % / 68 % |

On the altimetry satellites every step-free window at day 7 from a 24 h fit is FFM's (median FFM/AP 0.13): their losses are burns. On Sentinel-1 FFM still loses three in four step-free windows from a 24 h fit at day 7 (median 2.2); burns under 8 m and AP's drag prior are not separated here. The WAAS arms tie whatever the flag; SES-15 resolves no burn (its median residual is 451 m against 71 and 104 m for the other two).

## Holds and data

Never read: C2's held objects (TerraSAR-X, Stella, Sentinel-1D, LAGEOS-1, its six Galileo satellites), Swarm, GRACE-FO, every Starlink group and any Sentinel-1 cutoff from 2026-06-01; Sentinel-1 truth is read to 2026-06-08, as AP5's day 7 read it. Steps are sizes and epochs derived from the truth; no state is reproduced. The registration this flag serves is `experiments/operator-theory/S1-STEP-FREE.md`.
