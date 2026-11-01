# Operator theories: which fit stays closest to what the operator later reports?

Registered 2026-11-01, before any pair of files was scored, under task `experiments-operator-theory-20261101`. `arms.mjs`, `score.mjs`, `table.mjs` and
`cycle.sh` beside this file are part of the registration. A change before the first score is a dated amendment at the end. A change after it is labeled
exploratory and reported apart.

## Question

The owner, 2026-11-01, verbatim: "The only thing we are doing is taking the public datasets from https://github.com/DigitalArsenal/starlink_downloader and then
creating SupGP from them, and also doing XP and XP2 fits, and comparing them to FFM propagated states vs. truth / owner operator predictions, trying to figure out
what theories are used by those owner operators, and if we do not know, figure out which propagator and settings gets us the closest."

1. For each operator and lead time, which of our fits stays closest to what the operator later reports?
2. Against the same later report, is each fit closer or farther than the operator's own forecast?
3. Does one theory reproduce an operator's files stably from issue to issue?

## What a result means

- The reference is the first 3 h of the operator's newer file: the operator's own later solution, not independent truth. A result says "closest to the operator".
  It does not say "closer to the true orbit". Independent truth is a separate test.
- Every fit reads only the older file, which is mostly the operator's forecast. No fit sees an observation. Inside its arc a fit reproduces the file, so a fit can
  only beat the operator's forecast by extrapolating past its arc better than the file does.
- SpaceX blends its files to a reference trajectory after 48 h and plans maneuvers to 48 h. A fit that does not know a maneuver misses by it. Nothing is excluded for that.
- No result here changes a module, the console default or a public claim by itself.

## Previously analyzed

- In-file reproduction on `c20261101a` (120 Starlink files, 12 Planet, 1 ISS, 1 China Space Station), the ISS atmosphere, gravity and held-weather ladders on one NASA file, and
  the cost table. These chose the arcs and the candidate atmospheres, and they showed that fitted drag is zero on 48 h Starlink fits.
- `c20261101a` is out of this test: it stored no forecast, and its Starlink sample is larger than the fixed draw.
- Literature review of 2026-11-01: atmosphere swaps do not improve real tracking prediction when drag is fitted (NRLMSIS 2.0 about equal to NRLMSISE-00, JB2008 worse).
- At registration no pair of files has been scored. Cycles `c20261101T0326` and `c20261101T1526` are stored, and only their completion counts were read for the second.
- Bars: Swarm and GRACE-FO truth for 2026-10-31 to 11-28 until E13b scores; C2's hold-out; B2 part 1a and part 5 files; census results; operator-capture content; C3-small's rows.

## Data

- `cycle.sh`, every 12 h from `c20261101T0326` through the last cycle before 2026-11-15 00:00 UTC.
- Starlink: 60 objects, a fixed draw by SHA-256 of `operator-theory-20261101:<object>`. Planet: 12 objects, the same rule. ISS: NASA's public file. China Space Station: CMSE's public file, from 2026-11-02 03:26 UTC.
- Each file is fetched live. Raw text is never written. Stored: fitted products and a compact 300 s GCRF `$OEM` of the forecast, outside the repo. Planet's raw states are never committed.
- Weather: NOAA and GFZ as published on the day in the product (`weatherDay`), 12 h before the fetch, with NOAA's 45-day forecast ahead of it. A fit and its forecast use the same issue. No later weather enters.

## Arms

| Name | Fit | Flown by |
|---|---|---|
| `operator` | none: the older file's own forecast, interpolated (degree 7) to the reference epochs | none |
| `S12`, `S6`, `S24` | SGP4 elements and B* by `analysis/gp-error-model`, on CelesTrak's window from the file's start (Starlink 12 h; ISS, China station 6 h; Planet 24 h) | `propagator/sgp4` |
| `X0@a` | SGP4-XP built-in atmosphere, first `a` hours | `propagator/sdn-ap` |
| `X2@a` | XP2: SGP4-XP with NRLMSISE-00, first `a` hours | `propagator/sdn-ap` |
| `F-<variant>@a` | FFM by `analysis/estimation` `fit_batch` from operator states, 70x70 unless named, first `a` hours | `propagator/ffm` |
| `RFa12@a` | XP2's front-page recipe, from 2026-11-02 03:26 UTC: drag from FFM on the last 12 h of the arc, elements from its last 17 h with that drag held. Refused if the drag is not positive. | `propagator/sdn-ap` |

Arcs `a` are 24 and 48 h. On Starlink the 48 h arc ends at 47.9 h, before the join. An SGP4 set flies only on SGP4, and no FFM fit starts from an SGP4 set or a state SGP4 made.

Variants: Starlink NRLMSISE-00, exponential. ISS: NRLMSISE-00, exponential, and from 2026-11-02 Jacchia-Roberts and Harris-Priester. Planet: NRLMSISE-00, EGM96 10x10 with NRLMSISE-00, and from 2026-11-02 Jacchia-Roberts and exponential. China station: NRLMSISE-00, exponential. Arms that start later have fewer pairs; they are compared only on the pairs they share.

`RFa12` here is the recipe, not the registered front-page result: it reads operator forecasts, and the FFM fit uses this file's settings, not XM3's.

## Scoring

- A pair is an older and a newer file of one object with starts more than 6 h and at most 180 h apart. Each distinct file (object and first epoch) counts once, from the first cycle holding it.
- Lead is the newer file's start less the older file's start. The older file's contents are all any arm may read, so arms at equal lead hold equal information.
- The error of an arm on a pair is the 3-D RMS over the first 3 h of the newer file at 300 s, with radial, in-track and cross-track RMS beside it.
- Lead bins: 12, 24, 36, 48, 60, 72 h (each plus or minus 6 h), and 96, 120, 144, 168 h (each plus or minus 12 h). Primary: 24, 48, 72, 168 h. The rest are report only.

## Rules

Each is computed per operator and lead bin by `table.mjs`:

- Printed: pairs, failures, median and 95th percentile for every arm.
- Interval: the 95 % two-sided interval on the median paired difference, by a two-way percentile bootstrap (objects and start days of the older file drawn independently, a pair weighted by the product of the counts, 2,000 draws, fixed seed).
- A cell has a verdict only with at least 30 pairs, 8 objects and 3 start days. Otherwise it is report only, so ISS and China station cells are report only.
- An arm with more than 10 % failed pairs in a cell cannot be named closest. Its failures are printed.
- Closest: the arm with the lowest median, listed with every eligible arm whose difference from it has an interval reaching zero. Those arms are not separated.
- Against the operator: "closer" if the interval's upper bound is below zero, "farther" if its lower bound is above zero, else "not separated".
- Multiple cells are not corrected, so a single cell is not a claim. A claim about an operator needs the same reading at every primary lead it names, in the final table.
- Report only: the same medians on pairs where the operator's own forecast stayed within 5 km, a stand-in for no unplanned maneuver.

Interim tables may be read and reported. They are labeled interim, and no arm, fit, bin or rule changes because of them. The final table is the one built after the last cycle.

## Identification

An operator's theory is called "identified" only if one candidate's in-file median error past its arc is at most one third of every other candidate's, in every cycle, with its fitted drag ratio stable across cycles. Even then it is an inference from the files, stated as such. Otherwise the answer is the closest arm from the rules above. Candidates are the variants above. Input from the operator's own documents is cited beside the result.

## Limits

Two weeks of late 2026. A quiet fortnight says nothing about storms. Starlink's objects are a fixed draw, Planet's sample is small, and ISS and the China station are one object each. The reference is not independent of the forecast it scores.
