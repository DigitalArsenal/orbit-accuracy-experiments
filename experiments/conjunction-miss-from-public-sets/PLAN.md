# Registered test: closest-approach misses of real conjunctions from public element sets, on SGP4 and on AP and SGP4-XP records

Registered by the commit that merges this folder, before the test window opens at 2026-11-16T00:00Z. The platform's recorded merge time is the registration time. `config.json` holds the same numbers for the code; `MANIFEST.sha256` lists every frozen file with its SHA-256. An amendment is a dated section at the end of this file with its reason.

## Question

Public element sets exist for nearly every cataloged object, and for debris and rocket bodies they are the only orbit source. The provider also publishes conjunction messages for the events it screens; the last message of an event carries a closest-approach time and miss distance computed from the provider's own orbit determination. This test asks, on events that had not happened when the recipes were fixed:

1. **W against S.** Do public element sets converted to AP records (recipe W) give a closest-approach miss nearer the provider's final published miss than the same sets flown on SGP4 (arm S)?
2. **W against X.** Do they also beat public element sets converted to SGP4-XP records by the same module (recipe X)?

Two comparisons are registered. Each has its own verdict and each verdict stands on its own. A third comparison, X against S, is reported with the same statistics and no verdict.

## What was read before this plan

All development figures were read on events with final closest approaches from 2026-10-09 to 2026-11-15: 3,695 messages in 33 daily files, 627 events, 1,160 objects, 577 events with a scored row. Every one of these events and every message read has been seen. The newest development message was created 2026-11-12T07:27Z. No development event has a final closest approach on or after 2026-11-16T00:00Z (0 of 627). 34 development events had a final closest approach after the newest development message, so their final values were provisional when the recipes were chosen.

Arms F, K, C and W were defined and scored on the development events in that order; W was defined after F, K and C had been scored on the same events, so the development figures favor W. Arm X was run once, with no variant. The rule that chose W is in the last section. A test event may involve an object or pair seen in development; the share of primary events whose pair, or either object, was in a development event is reported (no verdict role).

An event with any message created at or before 2026-11-12T07:27:59Z is excluded from the test and counted. No message created after 2026-11-12T07:27:59Z is read before the run date.

## Build

`propagator/sdn-ap` version 0.6.57, repository commit `6a807990a2ed004295c0cfe80f612205fc28d784`, wasm SHA-256 `652fa229c89a565d688e6cf2384a38fb9cc9aa12e5f8178900bda5bf189b797c` (the file `propagator/sdn-ap/dist/isomorphic/module.wasm` at that commit). Every script that loads the module checks the SHA-256 of its bytes before every load, including the load that replaces an instance after a refused fit, refuses any other bytes, and writes the SHA-256 into the header line of every output file. `node check.mjs` verifies the manifest, the module and the weather forecaster before a run.

Every orbit propagation and every fit is done by this build. The closest-approach search and the scoring are script code in this folder.

## Events

An event is a pair of objects and a closest approach in the provider's public conjunction messages (daily files `spacetrack/cdm_public/<year>/<day>.json.gz` of the archive).

- Only messages created before 2026-12-15T00:00Z are read, by a cutoff on creation time in `build-events.py`. Messages are de-duplicated by message identifier; the last copy read is kept and the number of identifiers seen again with different content is counted. Messages with an unparseable closest-approach time, creation time or miss are dropped and counted. Unreadable day files and days without a file in the message range are counted; an event with a message created within 3 days after a missing day is flagged and kept.
- Messages of one pair, in order of closest-approach time, belong to one event while consecutive closest-approach times differ by 60 s or less.
- The reference message of an event is its last message by (creation time, message identifier). Its closest-approach time and stated miss are the event's final values. The reference may be created after the final closest approach.
- The test window is every event whose final closest approach lies from 2026-11-16T00:00Z up to 2026-12-14T00:00Z. The run date is 2026-12-15.
- Events with any message created at or before 2026-11-12T07:27:59Z are excluded and counted.

Rows. The lead of a message is the final closest-approach time minus the message's creation time. The reference message is not scored (it cannot be scored against itself). A message with a negative lead is counted and not scored. Lead bins are half-open: 0 to 0.5 d, 0.5 to 1 d, 1 to 2 d and 2 to 3.0001 d (3 d plus 8.6 s); a lead beyond the last bin is counted and not scored. **The row of an event and lead bin is the message whose lead is nearest the bin's middle (0.25, 0.75, 1.5, 2.5 d); the first of two equally near is taken. The row is chosen by lead alone, before any set is looked up and before any arm is run.** A row that then fails in an arm (no set for an object, a refused fit, a refused flight) is left out of the comparisons that use that arm and counted by reason; no other message takes its place.

Populations:

- **PRIMARY:** events whose reference message was created not more than 12 h before the final closest approach (a reference created after the final closest approach counts as within).
- **SECONDARY:** all events.

Counted and printed, per population: events with one message (no row); events with no row chosen; rows chosen by lead bin; rows dropped from each comparison by reason; rows whose set choice had messages equal in creation time; rows widened, rows with the minimum at an edge after widening, rows not converged, rows with grid points skipped for a non-zero status, and rows whose closest approach lies outside a fitted span (kept and flagged).

## Sets

For a row, each object's set is the set of the provider's element-set history (`spacetrack/gp_history/by-creation/<year>/`, raw rows, de-duplicated by set identifier) with the greatest creation time not after the message's creation time. Nothing created later is used. Sets equal in creation time go to the later epoch. Only sets of mean-element theory SGP4 are kept; sets of another theory are counted and dropped. The history is read from the day 2026-10-14 (29 days before the earliest message that can belong to a test event) to the creation cutoff; an object with no set created after the start day has no set, and its rows are dropped and counted. Unreadable day files are counted.

## Arms

For a set with epoch `t0`, both recipes use only the set's own SGP4 flight, flown by the module in GCRF, sampled every 300 s from `t0` minus 2.5 d to `t0` plus 5 d. The record's epoch is placed at the first fitted state (`sdnap_fit_epoch_diagnostic(0)`, set explicitly). Nothing else enters a fit: no earlier set, no observation, no precise orbit, no provider miss.

| Arm | What flies |
| --- | --- |
| `S` | the set, on the module's SGP4 |
| `W` | an AP record: the module's fit with the AP theory; atmosphere NRLMSISE-00 on daily weather rows; maximum zonal degree 20; maximum tesseral degree 31, 0 where the eccentricity exceeds 0.048; weather horizon 30 d |
| `X` | an SGP4-XP record: the module's fit with the SGP4-XP theory and the theory's own forces: empty ephemeris source, stated atmosphere JACCHIA70 on the theory's own flux model, no fit policy |

What does not apply to X and is not passed: the NRLMSISE-00 atmosphere and the daily weather rows (so no weather cut), the zonal and tesseral degrees, the weather horizon and the provenance input. Arm X0 (the provider's own SGP4-XP sets flown as they are) is not possible: all 140,929 sets of the development objects in the archived history carry ephemeris type 0 and mean-element theory SGP4. If the test archive holds sets of ephemeris type 4 for both objects of a row, the count is printed and no arm is run.

A refused fit means the record does not exist for that set; the row is dropped from the comparisons that use that arm and counted by the refusing status. The module instance is replaced after a refused fit.

Weather (arm W). The fit reads daily weather rows built by `experiments/ap-five-day-accuracy/lib/space-weather.mjs` for the set's epoch day D, from rows dated D minus 45 d to D plus 50 d. The builder reads: the baseline table of the geomagnetic archive dated 2026-10-09 (daily values up to that date); the newest daily directory of the geomagnetic nowcast dated on or before D; the newest daily directory of the space-weather service dated on or before D (daily solar and geomagnetic indices; the 3-day forecast when it was issued within 2 days of D). Rows after D are produced from those data by a solar-rotation recurrence (27 days) with first-order relaxation, in a locally built WASM forecaster named by SHA-256 `68cb063ab3648ab502fc9f7e0eb7fda0978d7d5a010b941ce718164e9bea4a73` and built by `experiments/ap-five-day-accuracy/build-tle-upgrades-wasm.mjs` (the file is not in git). The run writes the files read per epoch day, with their SHA-256, to `inputs-weather-W.json`. Development epochs before the first dated directory of the archive used the baseline table alone.

Limit of the weather cut: the record of the epoch day D is used whole, so when a message is created on D, part of that day's record is later than the message (weather only, at most one day).

Earth orientation. The module's fit and flights use UT1 = UTC, the pole at its mean position, and TT from the leap-second table of the pinned ERFA (module source `src/gcrf.inc`: "UT1 = UTC and the pole at its mean position, as without $EOP"). No `$EOP` input is passed. The pinned ERFA's leap-second table holds no entry after 2017 and ERFA flags a date as dubious only beyond 2028; no table inside the build ends before the window.

## Closest approach

For a row, both objects' states are taken in one inertial frame every second over the closest-approach time of the row's message plus and minus 300 s. If the minimum range lies at an edge the window is widened once to plus and minus 1,500 s; if it still lies at an edge the row is kept and flagged. The minimum is refined by Newton steps on the range rate, with states flown by the module at each step, and stops when the step is under 0.6 ms or after six steps (not converged: kept and flagged). A grid point with a non-zero SGP4 status is skipped and counted; a row with no usable grid point is a refused flight. Records are flown by the module's propagate method at the same instants. The miss of a row is the minimum range in meters; the error of an arm on a row is the absolute difference between its miss and the event's final stated miss.

## Statistics

Every statistic is computed by `score.py`, which also prints the verdicts. The three statistics are computed on the rows of one population, pooled over lead bins, for one comparison (an arm against a base).

- **H1.** The share of rows in which the arm's error is smaller than the base's, above 50 % with the lower end of its 95 % interval above 50 %. A row with equal errors counts as not smaller. The share is over all paired rows (row-weighted); the event-averaged share is printed beside it.
- **H2.** The ratio of the median error of the arm to the median error of the base, below 1 with the upper end of its 95 % interval below 1. If the base's median error is 0 the ratio is undefined and H2 is not held.
- **H3 (guard).** Let `nA` be the number of events with a chosen row in which the arm's miss is more than twice the base's miss and above 1 km, and `nB` the number with such a row the other way round. The guard holds if `nA` is not more than `nB`.

Intervals: 2,000 resamples of events with replacement (all rows of a drawn event kept together), percentile method linear (`numpy.percentile`, `numpy` version printed in every output), generator `numpy.random.default_rng` with the seed 20261215 plus 1,000 times the comparison's position (W against S 0, W against X 1, X against S 2) plus 100 times the population's position (PRIMARY 0, SECONDARY 1) plus the cell's position in the fixed list printed by the script.

Verdicts, one per registered comparison, on the PRIMARY population:

- **INSUFFICIENT:** fewer than 100 primary events with a scored row, counted after the drop. This overrides every other outcome and states no other verdict. The floor guards against a change in the provider's publication; it is not a power floor.
- **CONFIRMED:** H1, H2 and the guard all hold.
- **REFUTED:** the top of the H1 interval is at or below 50 %, or the bottom of the H2 interval is at or above 1, or the guard fails and an exact one-sided binomial test (probability 0.5) on the `nA + nB` discordant events gives a probability below 0.05.
- **NOT CONFIRMED:** every other outcome. A NOT CONFIRMED on fewer than about 190 primary events is reported as under the planned size, with the width of the H1 interval.

The SECONDARY population carries the same statistics and the same words, reported as secondary. The X against S comparison carries the statistics and no verdict.

Tables. For each comparison and population: the three statistics for the pooled rows; by lead bin; by perigee band of the lower object (under 600, 600 to 1,000, 1,000 to 2,000 km, higher; perigee from each set's mean motion and eccentricity with radius 6,378.137 km); by set age (the older of the two sets' message creation time minus epoch; under 1 d, 1 to 2 d, over 2 d); by pair type (debris with debris, debris with payload, debris with rocket body, the rest); and the lead by perigee cross cells. **Every published cell with fewer than 20 events prints FEW and its event count, and no figure.** Also printed, for each arm, pooled and by lead bin: median, 68th, 90th and 95th percentile of the miss and of the error; the share of rows with a miss under 1, 2, 5, 10, 20 and 50 km; the median and 90th percentile of the difference of closest-approach times against the final message. Report-only figures with no verdict role: the share of rows where the arm's miss is under the base's miss; the median of (miss minus final miss) per arm; the H1 share by band of the final miss (under 100 m, 100 to 300 m, 300 to 1,000 m, over 1,000 m); the share of primary events whose pair or either object was in a development event (from `development-objects.json` in the store, a list of the development events' object and pair identifiers kept outside the repository; the script prints the shares only).

## Power

For H1 alone. Method (`power.py`): one chosen row per event, each an independent trial that is "smaller" with probability `p` (the true share); H1 holds when the lower end of the normal 95 % interval of the observed share is above 50 %; the chance is the exact binomial sum over the outcomes that satisfy this. Rows of one event are not independent and the registered interval is an event bootstrap, so the figures are approximate. In development, 236 events with a strong reference in about 34 days of messages (6.9 a day) gave about 194 primary events for the 28-day window and about 480 events in all.

| primary events | true share 55 % | 60 % | 62 % | 64 % |
| --- | --- | --- | --- | --- |
| 100 | 0.18 | 0.54 | 0.70 | 0.83 |
| 150 | 0.26 | 0.72 | 0.86 | 0.95 |
| 194 | 0.29 | 0.81 | 0.93 | 0.98 |
| 250 | 0.35 | 0.89 | 0.97 | 0.99 |

At about 194 primary events and a true share of 60 % the chance that H1 holds is about 0.8. The development share of arm W on the primary population is 65 %, a figure read on the events that also chose the recipe.

## What this cannot show

- The provider's final published miss is taken as the truth. It is a miss computed from the provider's own orbit determination, not an independent measurement.
- Only events the provider published are scored. Nothing is shown about conjunctions the provider did not publish, or about alerts raised on events outside its publication criteria.
- The primary population is selected on the provider's messages: its last message lies within 12 h of the closest approach, and so does its final miss. An event whose messages stopped earlier may have left the provider's criteria; the reason is not known. The secondary population includes those events.
- The error measures the miss, the distance across the relative velocity. An along-track error moves the time of the closest approach and barely the miss; the difference of times is reported separately.
- Development figures were read on events up to 2026-11-15, and recipe W was defined after F, K and C were scored on them. They are not a test.
- The weather cut is the set's epoch day, used whole (a message created on that day precedes part of that day's weather record), and development epochs before the first dated archive directory used the baseline table alone.
- Covariance, probability of collision and false alarms are not part of this registration.

## Frozen files, inputs and run

Frozen: every file listed in `MANIFEST.sha256` (this folder's scripts and configurations, `lib/`, and the libraries of this repository that they import: `experiments/ap-five-day-accuracy/lib/space-weather.mjs`, `hold-gate.mjs`, `tle-upgrades-host.mjs`, `wasm-hosts.mjs`, `crlb-covariance.mjs`, and `experiments/ap-five-day-accuracy/build-tle-upgrades-wasm.mjs`, and `package-lock.json`). The Space Data Standards bindings are those of the stack checkout (`SDS_ROOT` overrides); packages are as in `package-lock.json` (space-data-module-sdk 0.9.7, flatbuffers 25.9.23). The covariance work of the development study is not part of the frozen set. The weather forecaster file is named by SHA-256 in `config.json` and checked by `check.mjs`.

Run, on 2026-12-15, in this order, each with the same `--config config.json` and the module's bytes at `SDN_AP_WASM` (extracted with `git show 6a807990a2ed004295c0cfe80f612205fc28d784:propagator/sdn-ap/dist/isomorphic/module.wasm`):

```
node check.mjs
python3 build-events.py
python3 build-set-index.py
node fly-sgp4.mjs
node fit-records.mjs --arm W      node fly-records.mjs --arm W
node fit-records.mjs --arm X      node fly-records.mjs --arm X
python3 score.py
python3 power.py
```

The run writes an input manifest per input kind (messages and sets: per day file the name, record count and SHA-256, and one aggregate SHA-256; weather: the files read per epoch day with their SHA-256) to the store, published with the results. The 33 message files archived through 2026-11-12 have the aggregate SHA-256 `6b2d6e1e5138e3dd35fb1191481e43072880295bc66f9a321bcdc87df8799938` (name and SHA-256 per file, in order of name). Messages created before this registration's merge may belong to test inputs; that is allowed because the recipes are fixed. Results published are aggregates only: counts, percentiles, shares, ratios and intervals; no row, no object identifier and no name of an object.

Nothing in this folder changes between the merge and the run. A change after 2026-11-16T00:00Z is an amendment with its date and reason.

## Development figures and how W was chosen

W is the recipe if its pooled ratio of median errors against SGP4 is below F's and its count of events with a miss over twice SGP4's and above 1 km is at most twice F's; otherwise F. K and C are shown for reference. The rule was written down before arm W was run; arm W itself was defined after F, K and C had been scored on the same events.

Table printed by `python3 score.py --config config-development.json --rule-table` from the development rows (arms F epoch to epoch plus 5 d; K epoch minus 3 d to epoch; C epoch minus 2.5 d to plus 2.5 d; W epoch minus 2.5 d to plus 5 d; X as W with the SGP4-XP theory). Ratio: median error of the arm over the median error of S, pooled over lead bins, with its 95 % event-bootstrap interval; closer: share of rows with a smaller error; events: events in which the arm's miss is over twice S's and above 1 km / the reverse, on the chosen rows and on every flown non-reference message row with a lead of 0 to 3 d (the definition the rule was evaluated on). The development rows predate the row-file headers. W has 3,026 flown rows (one flight refused) against 3,027 for the others.

| arm | all events: ratio | closer | events, chosen rows | events, all flown rows | primary events: ratio | closer | events, chosen rows | events, all flown rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F | 0.73 [0.66..0.81] | 64 % | 7 / 32 | 7 / 35 | 0.72 [0.63..0.89] | 62 % | 3 / 16 | 3 / 17 |
| K | 1.09 [0.94..1.26] | 49 % | 130 / 78 | 148 / 82 | 0.96 [0.74..1.20] | 52 % | 45 / 31 | 52 / 32 |
| C | 0.64 [0.57..0.76] | 66 % | 32 / 46 | 35 / 49 | 0.63 [0.52..0.82] | 67 % | 14 / 18 | 14 / 21 |
| W | 0.63 [0.54..0.71] | 67 % | 12 / 35 | 12 / 40 | 0.66 [0.52..0.82] | 65 % | 5 / 16 | 5 / 18 |
| X | 0.94 [0.89..0.98] | 54 % | 1 / 8 | 1 / 8 | 0.94 [0.88..1.02] | 51 % | 1 / 4 | 1 / 4 |

W's ratio 0.63 is below F's 0.73 and its 12 events are at most twice F's 7, on both definitions: the recipe is W. X against S: a 6 % lower median error and no clear gain in the primary population (ratio 0.94 [0.88..1.02]). The registered scoring script on the development rows gives, for W against X, a ratio of 0.70 [0.55..0.86] with W closer in 63.0 % [56.9..68.5] of the rows on the primary population (236 events), and 0.67 [0.58..0.76] with 64.5 % [60.8..68.3] on all events (577 events); the events in which W's miss is over twice X's and above 1 km / the reverse are 6 / 15 and 13 / 29. The registered verdict logic applied to the development rows returns CONFIRMED for both W against S and W against X; that is not a test result.
