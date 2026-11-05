# S1-24H-DAY7: why FFM from 24 h fits loses to AP at day 7 on step-free Sentinel-1 windows

Exploratory, under `experiments-ffm-s1-24h-day7-loss-20261105`, written before any figure below is computed. Every window here was already read (S1-STEP-FREE.md amendment 1, AP5.md), so nothing here passes or fails. Report: `results/operator-theory/s1-24h-day7`.

## Windows

- 2025: the 26 windows of `results/operator-theory/s1-step-free` step-free at day 7 from a 24 h fit with both arms scored (its `table.json` flags, `lib/steps.mjs` windowState at 24 h and 168 h).
- 2026: 26 of the 128 windows of `results/operator-theory/maneuver-flags` step-free at day 7 from a 24 h fit with both arms scored (AP5's Sentinel-1 rows; FFM 2.0.4 in `ap/b0411/compare-truth2`, AP 0.5.1 in `ap/b051/truth2`): the first 26 by SHA-256 of `s1-24h-day7|<key>`.

## Builds

FFM: `propagator/ffm` 2.2.0 (`lib/build.mjs` FFM_220) fitted by `analysis/estimation` 0.7.0 at CHEAPER.md's settings, as `s1-step-free.mjs` flies F24. AP: `propagator/sdn-ap` 0.5.1 (`lib/build.mjs` PIN) as AP24. Mean semimajor axis: `foundation/orbits` 0.1.0 (ORBITS_010) through `lib/steps.mjs`. The 2026 windows are flown again on 2.2.0; their stored 2.0.4 figures stand beside. Truth, thinning, coverage, as-issued weather, grid and scoring are S1-STEP-FREE.md's.

## Per window

- FFM24: its fitted B (DRAG_AREA_OVER_MASS, m²/kg) and formal sigma; solar pressure held at 0.02 m²/kg (not fitted); its day errors.
- AP24: its BTERM and the prior it fits under (the band median 0.002 m²/kg at 600 to 800 km, sigma of the log ln 10: the `propagator/sdn-ap` README), its day errors.
- Mean semimajor axis: revolution time means (`lib/steps.mjs` revolutions) of the truth and of each arm's flight at the truth's epochs thinned to 30 s. Slopes (m/day, least squares) over the forecast (cutoff to day 7) and, for the truth, over the fit arc; each arm's offset from the truth over the first 12 revolutions after the cutoff. Sub-threshold steps: `lib/steps.mjs` lowSteps on the truth with the threshold at 4 m (half the flag's 8 m) in [cutoff - 24 h, cutoff + 168 h].
- Along-track growth: each arm's along-track error at each hour of the forecast, least squares t(h) = c1 h + c2 h²; quadratic when |c2| h² > |c1| h at 168 h.
- Weather: the as-issued rows the arms flew and the definitive rows (XM `lib/weather.mjs` rowsM: GFZ observed F10.7, definitive Ap, centered 81-day mean) over the forecast's days: mean F10.7 and Ap of each, and their difference.

## Hypotheses, on the same windows, fitted again with the pinned modules

- (a) FFM48: FFM fitted to the 48 h before the cutoff, otherwise as FFM24. A step of the flag in [cutoff - 48 h, cutoff - 24 h] is reported.
- (b) FFMhist: FFM with B held (not fitted) at the object's own long-run value: the median of its FFM24 fitted B at every cutoff from 30 days to 1 day before the window's (each such arc ends a day or more before the cutoff), at least 5 fits, else no figure. Never a value from the window's arc, forecast or truth.
- (c) FFMdef and APdef: both arms fitted and flown on the definitive weather.

Each against AP24 at day 7 beside the baseline on the same windows: n, FFM worse, median FFM/AP, medians; (c) also against APdef.

## Each loss (FFM24 above AP24 at day 7), the first class that applies

With dT, dF and dFdef the slopes of the truth, FFM24 and FFMdef over the forecast:

1. Maneuver under the flag: a sub-threshold step (4 to 8 m) in [cutoff - 24 h, cutoff + 168 h].
2. Density: the definitive weather removes at least half of FFM's decay error, |dF - dFdef| >= |dFdef - dT|.
3. Fitted B: the rest whose FFM24 along-track growth is quadratic. Sign by dFdef - dT (below 0: FFM decays faster than the truth, B too high); size (dFdef - dT) / dFdef, the share of B in error with drag the only secular term.
4. Something else: the rest.

Holds: no held object, no Sentinel-1 cutoff from 2026-06-01, no truth after 2026-06-08 (`maneuver-flags.mjs` EXCLUDE).

## Amendment 1, 2026-11-05, after one window

Written after the runner's trial on one window, S1|62261|2025-12-13, and nothing else. Its FFM24 flight matches the truth's revolution means to 0.1 m through the fit arc, then sits 6.2 m below them from the first revolution after the cutoff, an along-track drift of about 36 m an hour; the truth's own revolution means scatter by meters from revolution to revolution, which differencing against a flight cancels. So:

- The 30 s flights and the truth's 30 s revolution means run from the arc's start (cutoff - 24 h) to day 7, and each arm's mean semimajor axis is read as its difference from the truth's, revolution by revolution (nearest crossing within 10 min): its slope over the forecast (the arm's decay error, m/day), its mean over the first 3 revolutions after the cutoff (the offset), and the largest change between consecutive revolutions (at most 2 periods apart).
- Class 1, maneuver under the flag, is FFM24 less the truth changing by 1 m or more between consecutive revolutions in [cutoff - 24 h, cutoff + 168 h] (a step of the truth that FFM's flight does not make; 1 m of semimajor axis drifts about 1 km along-track in 7 days), or the 4 m truth step of the rule above. Both are reported for every window.
- dF - dT and dFdef - dT in classes 2 and 3 are those difference slopes; dT is the truth's own slope.
