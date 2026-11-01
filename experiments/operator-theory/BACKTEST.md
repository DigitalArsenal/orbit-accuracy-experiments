# Back-test on the local capture: which of our fits stays closest to what SpaceX later reports?

Registered 2026-11-01, before any capture state was read or scored. `backtest.mjs` beside this file is part of the registration. It sits beside the forward test in `PLAN.md` and changes nothing in it.

The owner, 2026-11-01, verbatim: "We can't wait until 11/15 don't we have data that we've been collecting here locally for the past two weeks?"

## What it answers

The forward test (`PLAN.md`) holds 60 Starlink satellites from 2026-11-01. The capture holds every Starlink file every 8 h, so the same question can be read on far more satellites and from earlier start dates:

1. At each lead, which of our fits stays closest to what SpaceX later reports?
2. Does XP2, XP, our SGP4 recipe or FFM hold up better past the end of its fit arc?

It does not answer whether a fit beats SpaceX's own forecast past about 13 h. The capture keeps only the first 16 h of each file, so SpaceX's forecast is not stored further out. The forward test answers that. It does not score CelesTrak's published SupGP sets: the archive of those ends on 2026-10-11, before the first capture state. `S12` is our recipe for fitting one.

## Data

- Stored by `experiments/operator-capture`: the ten-minute GCRF states of the first 16 h of each SpaceX file, in the `$OCM` sidecars, from cycle `2026-10-30T05-01-35-297Z`. Earlier cycles hold mean elements and energy, not states, and are not used. Two cycles (`2026-10-30T21`, `2026-10-31T05`) hold about 6,000 files instead of 11,000; they are used as they are.
- A cycle enters only once its `summary.json` exists. New cycles add pairs as they finish, so leads grow by 24 h a day. Today's longest lead is about 56 h.
- Only the state vectors are used. The covariance values in the same files are not read, and the `json.gz` records are not opened.
- Each file counts once, from the first cycle holding it. Weather: `lib/weather.mjs`, NOAA and GFZ as published on the day 12 h before the cycle started. Nothing later enters a fit or a flight.

## Satellites

Starlink objects in cycle `2026-10-30T05-01-35-297Z`, in order of SHA-256 of `operator-theory-backtest-20261101:<norad>`, the first 400 after removing:

- E13b's held-out group (`experiments/e13b-starlink-dca/PLAN.md`: the first eight hex digits of SHA-256 of `e13b-20261023:<norad>`, modulo five, equal zero);
- V2's 500 satellites (`experiments/operator-capture/SUBSETS.md`);
- the forward test's 60 satellites, whose first interim table has been read (taken from cycle `c20261101T0326`).

So E13b's and V2's held-out satellites stay unread, and the sample is separate from the forward test's. E13b holds out time as well as satellites: from 2026-10-31 this reads calibration satellites inside its held-out window. E13b's estimator is frozen and takes nothing from here, and no result here may change it. E13b's results must disclose this read. Capture content was barred to every lane until this owner request. That bar still holds for every other reader.

## Arms

Every fit reads only the older file. No fit sees an observation, and an SGP4 set flies only on SGP4. Settings are `PLAN.md`'s, on the capture's ten-minute states.

| Name | Fit | Flown by |
|---|---|---|
| `operator` | none: the older file's own states, interpolated (Hermite on eight states), only where the older head covers the reference | none |
| `S12` | our SupGP recipe: SGP4 elements and B* by `analysis/gp-error-model`, first 12 h | `propagator/sgp4` |
| `X0@a` | SGP4-XP built-in atmosphere, first `a` hours | `propagator/sdn-ap` |
| `X2@a` | XP2: SGP4-XP with NRLMSISE-00, first `a` hours | `propagator/sdn-ap` |
| `F-NRLMSISE00@a` | FFM 70x70 by `analysis/estimation` `fit_batch` from operator states, first `a` hours | `propagator/ffm` |
| `F-EXPONENTIAL@16` | the same with the static exponential atmosphere, first 16 h | `propagator/ffm` |
| `RFa12@16` | XP2's recipe on what the capture holds: drag from FFM on the last 12 h of the 16, elements from all 16 h with that drag held; refused if the drag is not positive. The front-page recipe uses 17 h. | `propagator/sdn-ap` |

Arcs `a` are 12 and 16 h. The 24 and 48 h arcs of the forward test cannot be built from a 16 h head, so these arcs are shorter than the forward test's.

## Scoring and rules

As `PLAN.md`: a pair is an older and a newer file of one object, starts more than 6 h and at most 180 h apart. The error is the 3-D RMS over the first 3 h of the newer file, here at 600 s, with radial, in-track and cross-track RMS beside it. The lead bins, the two-way bootstrap, the minimum of 30 pairs, 8 objects and 3 start days for a verdict, the 10 % failure limit, "closest" and "not separated" are `table.mjs`'s, unchanged. A cell with fewer start days is report only.

A lead counts as prediction only past the arc: leads under 12 h are inside both arcs, and in the 12 h bin the 16 h arcs are at most 3 h past their end.

Interim tables are labeled by date. They may be read and reported, and no arm, fit, bin, sample or rule changes because of them. A change is a dated amendment, labeled exploratory if it follows a read table.

## Limits

The reference is SpaceX's own later solution, not independent truth, and the older file is mostly its forecast. A fit that does not know a planned maneuver misses by it, and nothing is excluded for that. These are late 2026 days of whatever solar activity they had, not storm evidence. The sample is a fixed draw from the fleet, not stratified. No result here changes a module, the console default or a public claim by itself.
