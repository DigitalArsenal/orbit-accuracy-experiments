# PER-REV-FLAG: the maneuver flag read revolution by revolution from FFM24's flight

Amendment of 2026-11-06 under `experiments-ffm-step-flag-per-rev-20261105`, committed and pushed before any re-flag row is read. It amends the flag of `S1-STEP-FREE.md` ("The flag, fixed here"), of `maneuver-flags.mjs` and of every FFM-vs-AP table and comparison cell that splits windows on it (`results/operator-theory`, `results/ap-truth/compare`, `cells.json`). It is written in its own file because `S1-STEP-FREE.md`'s registration holds every one of its commits before its first row. Report: `results/operator-theory/per-rev-flag`.

## Post hoc

The rule was chosen after the Sentinel-1 analysis `S1-24H-DAY7.md` (`results/operator-theory/s1-24h-day7`), which read 52 Sentinel-1 windows and found every one of the 35 FFM losses at day 7 on a burn of 3.16 to 10.58 m that the 8 m truth step does not flag. Nothing here is a test: every window it runs over was read before. The counts before (the 8 m flag) and after (this rule) are reported per regime.

## The rule

`lib/steps.mjs`, replacing the 8 m truth step (not beside it). For a window with cutoff C:

1. FFM24: `propagator/ffm` 2.2.0 (`lib/build.mjs` FFM_220) by `analysis/estimation` 0.7.0 fitted to the 24 h arc before C at CHEAPER.md's settings (the 40x40 low-orbit settings, or the 20x20 high-orbit settings at 8400 km and above, as `all-regimes.mjs`), as-issued weather, no weather in vacuum. It is flown over [C - the window's longest fit arc, C + 168 h] at the truth's epochs (30 s where the product is finer).
2. Mean semimajor axis per revolution, of the flight and of the truth alike: the time mean of `foundation/orbits` 0.1.0's osculating semimajor axis, ascending node to ascending node (`revolutions`).
3. The difference: each flight revolution less the truth revolution starting within 10 minutes of it.
4. Consecutive differences d(i) - d(i-1) where the two revolutions are k = 1 to 7 periods apart (holes of up to 7 orbits bridged; a longer hole is not bridged); the drift, the median over k = 1 of those changes in the span, is removed as d(i) - d(i-1) - k × drift.
5. A window is flagged at a fit arc F and lead L when a drift-free change of 1 m or more (either sign) falls in [C - F, C + L]; burn-free when none does and the compared revolutions cover the span (none of its holes longer than 7 periods, the first and last within 2 periods of its ends); unchecked otherwise, and wherever FFM24 has no fit.

The 8 m low-orbit step and the geosynchronous hourly rule are replaced by this rule in every table this record writes; their old figures are quoted only as the "before" counts. TESS's perigee steps stay the record of `TESS-RESCORE.md`.

## Validation

- S1-24H-DAY7 reproduced from its stored rows (`/opt/data/sdn-archive/operator-theory/s1-24h-day7`): at F = 24 h and L = 168 h, 35 of its 35 day-7 FFM losses are flagged and its 5 burn-free windows are not. The flag E2E asserts both numbers.
- False alarms, named before any re-flag row: the passive objects carry no thruster, so every flag on them is a false alarm: Ajisai, Starlette, WESTPAC, LARES and LARETS (laser spheres), LAGEOS-2, Etalon-1, Etalon-2 and LARES-2 (laser geodetic). Their flagged share is reported per fit and lead; the 1 m threshold is not changed after it is read.

## Regimes

Every stored window of the comparison: near 700 km (Sentinel-1A and 1C, AP5's 2026 windows), strong drag (AP5's 2025 and 2026 windows), laser spheres and laser geodetic, geostationary (WAAS from the broadcast message type 9, GEO-TRUTH.md; the GFZ geostationary satellites), medium Earth orbit, inclined geosynchronous; the altimetry satellites and the highly elliptical windows beside them.

## Reported

Per regime, fit and lead: windows flagged, burn-free and unchecked under the 8 m flag (where a record covered them) and under this rule; and on the burn-free windows the paired FFM/AP ratio, exp(median by window of ln(FFM / AP)), with its 95 % interval over object-week clusters (10,000 draws, the seed from SHA-256 of the cell), the statistic of `ffm220-ratio.mjs`. FFM is the 2.2.0 store (`ap/ffm220`) where it exists, else the store the cell reads (named per row); AP is sdn-ap 0.5.1 (`ap/b051`).

## Decision rule

A near-700 km or geostationary cell whose burn-free ratio interval holds 1 or lies below 1 is explained by maneuvers. A cell whose burn-free interval lies above 1 names an FFM defect for the coordinator; no fix is made here. No propagator or estimation change.

## Holds

Never read: C2's held objects (TerraSAR-X, Stella, Sentinel-1D, LAGEOS-1, its six Galileo satellites), Swarm and GRACE-FO, every Starlink group, any Sentinel-1 cutoff from 2026-06-01 (Sentinel-1 truth to 2026-06-08), any operator capture.
