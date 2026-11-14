# Registered test: closest-approach misses of real conjunctions from public element sets, on SGP4 and on AP and SGP4-XP records

## Amendment: three registered looks (2026-11-14)

**The final look has wider intervals and less power than the original single run.** At 194 primary events and a true H1 share of 60 %, the chance of confirmation at the final look falls from 80.67 % to 66.60 % under the original normal-interval approximation (exact binomial sums, `power.py`). The final REFUTED rule uses the same wider intervals: at a true share of 40 % and 194 events, the chance of H1 correctly refuting also falls from 80.67 % to 66.60 % by the exact binomial sum. The same approximation in the nested simulation gives 66.600 % confirmation at the final look and 70.332 % at any of the three looks for a true share of 60 %. These figures concern H1 alone, not the joint H1/H2/H3 verdict.

An answer earlier than 2026-12-15 is needed. This amendment is dated 2026-11-14, before the window opens at 2026-11-16T00:00Z and before any message created after the development cutoff of 2026-11-12T07:28:00Z was read. No real message or element-set data were read for this amendment. The merge timestamp records its registration.

| look | run date (UTC) | final closest-approach window (UTC, end excluded) | message creation cutoff (UTC, excluded) | minimum primary events with a scored row | seed offset |
| --- | --- | --- | --- | --- | --- |
| 1 | 2026-11-24 | 2026-11-16 to 2026-11-23 | 2026-11-24T00:00:00Z | 40 | 0 |
| 2 | 2026-12-01 | 2026-11-16 to 2026-11-30 | 2026-12-01T00:00:00Z | 40 | 100000 |
| 3 (final) | 2026-12-15 | 2026-11-16 to 2026-12-14 | 2026-12-15T00:00:00Z | 100 | 200000 |

Each look is a complete, separate run from an empty store over all events in its window. No look reuses a previous look's store; final scoring reads only the two published interim result files to combine the verdicts. The file of that look's run date must exist before any message file is read. Messages are filtered by that look's creation-time cutoff; the element-set index uses the same cutoff and retains the original choice of sets available at each message's creation time. The final window and final message cutoff are unchanged.

Every registered H1 and H2 interval, in every population and cell, has the two-sided level `1 - 0.05/3` (98.33333333333333 %), with percentile endpoints 0.8333333333 and 99.1666666667. The Bonferroni split over three looks does not require independence between looks. The three looks together have approximately the false-confirmation chance of the original single run. This is approximate error control: it inherits the coverage accuracy of the registered percentile bootstrap, and neither that bootstrap nor the normal approximation guarantees the nominal finite-sample rate. At particular event counts the combined rate can exceed the original single run's own rate; the simulation below describes only its listed counts. The event bootstrap, 2,000 resamples, linear percentile method, H3 guard, comparison and cell offsets, recipes, pinned module and environment, row choices, exclusions, drops and all other statistics are unchanged. The base seed at look N is `20261215 + 100000 * (N - 1)`, followed by the original comparison, population and cell offsets. In particular the final seed is 20461215, different from the original single run's 20261215.

At looks 1 and 2 each registered comparison prints **CONFIRMED EARLY** if H1, H2 and H3 hold and at least 40 primary events have a scored row. Otherwise it prints **CONTINUE**, or **CONTINUE (too few events)** below 40; an interim look prints no negative verdict. At look 3 the original CONFIRMED, REFUTED, NOT CONFIRMED and INSUFFICIENT rules apply, with the wider intervals and the original floor of 100. Every later look is also run and published. Each comparison has one combined result: **CONFIRMED** if any interim look prints CONFIRMED EARLY or the final look prints CONFIRMED, except that an early confirmation followed by final REFUTED gives **CONFLICTING** and the claim is not made. Otherwise the combined result is the final look's verdict. A final NOT CONFIRMED or INSUFFICIENT is stated beside any early confirmation. The two registered comparisons retain separate verdicts; X against S has no verdict. Early confirmation selects an upward-biased share (at 45 events it needs an observed share of about 69 %) and a favorably biased ratio (toward smaller error ratios); these are not reported as estimates of the effect. The effect estimates are the final look's.

`config.json` holds the dates, cutoffs, levels, floors and seed offsets. Its top-level `statistics.interval`, `statistics.seed` and `statistics.minimumPrimaryEvents` retain the original single-run values and are replaced by each selected look's values. Every configuration-dependent run command takes `--look N`; `score.py` prints the look, level, seed and verdict, and writes `results-lookN.txt` and `results-lookN.json`. At look 3, `score.py` requires two `--earlier <file>` arguments, for the published `results-look1.json` and `results-look2.json`. It verifies their configuration hashes, registered identity, distinct look numbers, selected metadata and interim verdicts before scoring, and prints each combined result beside its final verdict. The final JSON records the earlier files' SHA-256 values and verdicts; their order on the command line does not matter. Counts, input manifests, check output and power output also carry the look in their published filenames, as specified below. The unamended development configuration retains its original statistics and filenames.

### Power of the looks

`python3 power.py` retains the original table and simulates 200,000 nested tests per cell: one chosen row per event, independent Bernoulli trials with true share p, normal intervals as in the original power approximation. Independent increments give nested counts. The base seed is 20261114, plus 100 times the size index (194, 150, 100), plus the share index (50, 55, 60, 62, 64, 65 %). The expected counts for looks 1 and 2 are calendar scalings, not observed event counts; the early-exclusion rule lowers the first look's count. Counts for a final 150 or 100 are scaled from 45/95/194 and rounded to the nearest integer. The registered floors apply: look 1 has 35 or 23 events in the second and third scenarios and cannot confirm. Each look column is the chance of confirmation at that look, regardless of an earlier result; each cumulative column is the chance of at least one confirmation through that look. This is an approximation to H1's event-bootstrap power, not a simulation of H2 or H3.

| events at looks 1/2/3 | true share | look 1 | look 2 | look 3 | through 1 | through 2 | through 3 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 45/95/194 | 50% | 0.816% | 1.209% | 0.893% | 0.816% | 1.762% | 2.364% |
| 45/95/194 | 55% | 4.118% | 9.886% | 16.358% | 4.118% | 11.576% | 21.363% |
| 45/95/194 | 60% | 14.297% | 38.014% | 66.600% | 14.297% | 40.343% | 70.332% |
| 45/95/194 | 62% | 21.366% | 53.602% | 84.293% | 21.366% | 55.719% | 86.330% |
| 45/95/194 | 64% | 30.428% | 68.975% | 94.331% | 30.428% | 70.593% | 95.115% |
| 45/95/194 | 65% | 35.134% | 75.923% | 96.990% | 35.134% | 77.280% | 97.426% |
| 35/73/150 | 50% | 0.000% | 0.912% | 0.872% | 0.000% | 0.912% | 1.555% |
| 35/73/150 | 55% | 0.000% | 6.617% | 12.501% | 0.000% | 6.617% | 15.123% |
| 35/73/150 | 60% | 0.000% | 26.144% | 53.656% | 0.000% | 26.144% | 56.571% |
| 35/73/150 | 62% | 0.000% | 38.415% | 72.311% | 0.000% | 38.415% | 74.386% |
| 35/73/150 | 64% | 0.000% | 52.536% | 86.481% | 0.000% | 52.536% | 87.633% |
| 35/73/150 | 65% | 0.000% | 59.730% | 91.211% | 0.000% | 59.730% | 92.014% |
| 23/49/100 | 50% | 0.000% | 1.063% | 1.075% | 0.000% | 1.063% | 1.829% |
| 23/49/100 | 55% | 0.000% | 5.469% | 9.572% | 0.000% | 5.469% | 12.005% |
| 23/49/100 | 60% | 0.000% | 18.366% | 38.224% | 0.000% | 18.366% | 41.584% |
| 23/49/100 | 62% | 0.000% | 26.735% | 54.182% | 0.000% | 26.735% | 57.163% |
| 23/49/100 | 64% | 0.000% | 37.197% | 69.889% | 0.000% | 37.197% | 72.149% |
| 23/49/100 | 65% | 0.000% | 42.873% | 76.858% | 0.000% | 42.873% | 78.733% |

At the listed counts, the p = 50 % rows give overall false-confirmation estimates of 2.364 %, 1.555 % and 1.829 %. Their Monte Carlo standard errors are 0.034, 0.028 and 0.030 percentage points (approximate 95 % margins ±0.067, ±0.054 and ±0.059 points). The original single-run normal approximation gives 2.614 %, 3.001 % and 2.844 % at the same final counts, by exact binomial sums. These figures do not establish an absolute 2.5 % bound or a universal improvement over the original rate. For any table entry q as a fraction, the Monte Carlo standard error is `sqrt(q * (1-q) / 200000)`, at most 0.112 percentage points; the normal approximation adds unquantified error. `power.py` stops above 3.5 % only as a programming-error sanity check, not a pass/fail test of the design's statistical error control. These are synthetic H1 calculations, not observed test results.


Registered by the commit that merges this folder, before the test window opens at 2026-11-16T00:00Z. The platform's recorded merge time is the registration time. `config.json` holds the same numbers for the code; `MANIFEST.sha256` lists every frozen file with its SHA-256 and `BINDINGS.sha256` the standards bindings. Amendments are dated sections with their reasons; the three-look amendment is at the top of this file.

## Question

Public element sets exist for nearly every cataloged object, and for debris and rocket bodies they are the only orbit source. The provider also publishes conjunction messages for the events it screens; the last message of an event carries a closest-approach time and miss distance computed from the provider's own orbit determination. This test asks, on events that had not happened when the recipes were fixed:

1. **W against S.** Do public element sets converted to AP records (recipe W) give a closest-approach miss nearer the provider's final published miss than the same sets flown on SGP4 (arm S)?
2. **W against X.** Do they also beat public element sets converted to SGP4-XP records by the same module (recipe X)?

Two comparisons are registered. Each has its own verdict and each verdict stands on its own. A third comparison, X against S, is reported with the same statistics and no verdict.

## What was read before this plan

All development figures were read on events with final closest approaches from 2026-10-09 to 2026-11-15 (the development configuration reads final closest approaches from 2026-10-01 up to 2026-11-16): 3,695 messages in 33 daily files, 627 events, 1,160 objects, 577 events with a scored row. Every one of these events and every message read has been seen. The newest development message was created 2026-11-12T07:27Z. No development event has a final closest approach on or after 2026-11-16T00:00Z (0 of 627). 34 development events had a final closest approach after the newest development message, so their final values were provisional when the recipes were chosen.

Arms F, K, C and W were defined and scored on the development events in that order; W was defined after F, K and C had been scored on the same events, so the development figures favor W. Arm X was run once, with no variant. The rule that chose W is in the last section. A test event may involve an object or pair seen in development; the share of primary events whose pair, or either object, was in a development event is reported (no verdict role).

An event with any message created before 2026-11-12T07:28:00Z is excluded from the test and counted. No message created after that time was read before the registration and the three-look amendment.

## Sources

Element sets: Source: USSPACECOM / 18th Space Defense Squadron, via Space-Track.org (https://www.space-track.org). Public conjunction messages: the same provider's public conjunction-message class, read from the archive's daily collection made with a registered account and used as input for aggregate statistics only; none is published. Weather: the archive's daily copies of the GFZ Potsdam geomagnetic indices and of the NOAA Space Weather Prediction Center indices and 3-day forecast (the credit lines of `docs/data-licenses.md`). No row, set or message is published; results are aggregates.

## Build

`propagator/sdn-ap` version 0.6.57, repository commit `6a807990a2ed004295c0cfe80f612205fc28d784`, wasm SHA-256 `652fa229c89a565d688e6cf2384a38fb9cc9aa12e5f8178900bda5bf189b797c` (the file `propagator/sdn-ap/dist/isomorphic/module.wasm` at that commit). Every script that loads the module hashes the file at the path immediately before each load, including the load that replaces an instance after a refused fit, refuses any other bytes, and writes the SHA-256 into the header line of every `rows-*.jsonl` and `fits-*.jsonl` file. `node check.mjs` verifies the manifest, the bindings, the module, the weather forecaster, the installed packages and the Node and numpy versions before a run.

Every orbit propagation and every fit is done by this build. The closest-approach search and the scoring are script code in this folder.

## What makes a run invalid

With the registered configuration (this folder's `config.json`, whose SHA-256 must equal its line in `MANIFEST.sha256`), `build-events.py` refuses to start unless the store is empty and unless the day file of the selected look's run date exists, and `score.py` prints `INVALID: <reason>` and exits 1, before any verdict, if: a row file or fit file of the store has no header, or a header names another module SHA-256, another configuration, another manifest of frozen files, another Node version, another file or shard than its file name says, or (arm W fits) another weather forecaster SHA-256; the headers name more than one archive root, or a root other than the one `score.py` runs with; an arm has both sharded and unsharded files, or an incomplete set of shards; a chosen row of any registered arm was never run, or an arm's rows are not exactly the chosen rows, once each (a missing, extra or repeated row, or an S row that disagrees with the event table about its message); the fits were run with a limit, or a fit row records an exception; `events-counts.json`, `sets-counts.json`, `inputs-messages.json` or `inputs-sets.json` is missing or names another configuration or look; a row or fit header or a weather input manifest names another look; an event contains a message at or after the selected look's cutoff; `events.json` or `sets_index.json` is not the file whose SHA-256 the counts files and every header carry (a stale store, or one built under another configuration, or a set index built from another event table); an event has a final closest approach outside the registered window, a primary flag that is not the registered rule, or a chosen row outside its lead bin. `--limit` and a non-default modules root are refused by the scripts with the registered configuration, `--rule-table` is refused by `score.py`, and `--shard` is allowed (the fits run in shards). An invalid run removes the selected look's `results-lookN.json` an earlier run left, and is repeated into an empty store; no amendment is needed, because nothing was scored. With any other configuration every verdict line ends with "(not the registered run)" and `results-lookN.json` records whether the run is the registered one. A fit refused by the module is a counted result, not an invalid run; every other error inside a fit stops the run with a non-zero exit (see Arms).

## Events

An event is a pair of objects and a closest approach in the provider's public conjunction messages (daily files `spacetrack/cdm_public/<year>/<day>.json.gz` of the archive's daily collection, which reads the provider's public conjunction-message class with a registered account; a day file is the snapshot taken after 17:00 UTC on its date, holding the messages of the last two days, and messages are chosen by their own creation time, not by the file's date; files from 2026-10-11 through the selected look's run date are read. A message created before the look's midnight cutoff is reachable in the day file before the run date or the day file of the run date; the latter must exist before the run starts, and `build-events.py` refuses to start without it. A day without a file counts as a missing day).

- Only messages created before the selected look's cutoff are used, by a cutoff on creation time in `build-events.py`. Messages are de-duplicated by message identifier; the last copy read is kept and the number of identifiers seen again with different content is counted; messages without an identifier share one key and are counted (the development read counts none). Messages with an unparseable closest-approach time, creation time or miss are dropped and counted. Unreadable day files and days without a file in the message range are counted; an event with a message created within 3 days after a missing day is flagged and kept.
- Messages of one pair, in order of closest-approach time, belong to one event while consecutive closest-approach times differ by 60 s or less. A conjunction whose predicted closest-approach time moves by more than 60 s between messages is two events, and an old message does not exclude an event it is not grouped with.
- The reference message of an event is its last message by (creation time, message identifier); identifiers compare as text. Its closest-approach time and stated miss are the event's final values. The reference may be created after the final closest approach.
- Each test window starts at 2026-11-16T00:00Z and excludes its end: 2026-11-23T00:00Z for look 1, 2026-11-30T00:00Z for look 2, and 2026-12-14T00:00Z for look 3. The run dates are 2026-11-24, 2026-12-01 and 2026-12-15, respectively.
- Events with any message created before 2026-11-12T07:28:00Z are excluded and counted.

Rows. The lead of a message is the final closest-approach time minus the message's creation time. The reference message is not scored (it cannot be scored against itself). A message with a negative lead is counted and not scored. Lead bins are half-open: 0 to 0.5 d, 0.5 to 1 d, 1 to 2 d and 2 to 3.0001 d (3 d plus 8.6 s, so a lead in [3, 3.0001) is scored in the last bin); a lead of 3.0001 d or more is counted and not scored. **The row of an event and lead bin is the message whose lead is nearest the bin's middle (0.25, 0.75, 1.5, 2.5 d), compared as floating-point numbers; on equal distance the earlier-created message is taken. The row is chosen by lead alone, before any set is looked up and before any arm is run.** A row that then fails in an arm (no set for an object, a refused fit, a refused flight) is left out of the comparisons that use that arm and counted by reason; no other message takes its place. A row without a set for an object is left out of every comparison. A refused S flight leaves a row out only of the comparisons whose arm or base is S; the sets' facts (epochs, set identifiers) are read from the S row whether or not its flight succeeded.

Populations:

- **PRIMARY:** events whose reference message was created not more than 12 h before the final closest approach (a reference created after the final closest approach counts as within).
- **SECONDARY:** all events.

Counted and printed: rows chosen by lead bin and drops by reason, per population; and over all events or all rows of the run: events with one message (no row), events with no row chosen, rows whose set choice had equal creation times, rows widened, rows with the minimum at an edge after widening, rows not converged, rows with grid points skipped for a non-zero status, and rows whose closest approach lies outside a fitted span (kept and flagged).

## Sets

For a row, each object's set is the set of the provider's element-set history (`spacetrack/gp_history/by-creation/<year>/`, raw rows) with the greatest creation time not after the message's creation time. Nothing created later is used. Sets are de-duplicated by set identifier and ordered by creation time, then epoch, then set identifier as text: equal creation time goes to the later epoch, then to the greater set identifier. Only sets of mean-element theory SGP4 and ephemeris type 0 are considered, so a later set of another theory or type is ignored. Sets of another theory or ephemeris type, and sets with an unusable field or an unparseable epoch, are counted and dropped; a set whose creation time is unparseable is counted with the sets created at or after the cutoff. Day files are chosen by the range their names cover (`<day>` or `<from>--<to>`) overlapping the read range; days in the range without a file, and day files outside it, are counted. The history is read from the day 2026-10-14 (29 days before the earliest message that can belong to a test event) to the creation cutoff; an object with no set created after the start day has no set, and its rows are left out and counted. A file that straddles the start day is read, and its sets created before the start day are not kept and are counted.

## Arms

For a set with epoch `t0`, both recipes use only the set's own SGP4 flight, flown by the module in GCRF, sampled every 300 s from `t0` minus 2.5 d to `t0` plus 5 d. The record's epoch is placed at the first fitted state (`sdnap_fit_epoch_diagnostic(0)`, set explicitly). Nothing else enters a fit: no earlier set, no observation, no precise orbit, no provider miss.

| Arm | What flies |
| --- | --- |
| `S` | the set, on the module's SGP4 |
| `W` | an AP record: the module's fit with the AP theory; atmosphere NRLMSISE-00 on daily weather rows; maximum zonal degree 20; maximum tesseral degree 31, 0 where the eccentricity exceeds 0.048; weather horizon 30 d |
| `X` | an SGP4-XP record: the module's fit with the SGP4-XP theory and the theory's own forces: empty ephemeris source, stated atmosphere JACCHIA70 on the theory's own flux model, no fit policy |

What does not apply to X and is not passed: the NRLMSISE-00 atmosphere and the daily weather rows (so no weather cut), the zonal and tesseral degrees, the weather horizon and the provenance input. Arm X0 (the provider's own SGP4-XP sets flown as they are) is not run: the set index counts and drops every set whose ephemeris type is not 0 (all 140,929 archived sets of the development objects have ephemeris type 0 and mean-element theory SGP4).

A refused fit means the record does not exist for that set; the row is left out of the comparisons that use that arm, and the refusals are counted by the module's status name (printed by `score.py` as the fits of each arm by status). The module instance is replaced after a refused fit. Only the module's own answers are counted results: its refusal of a fit and an SGP4 status on the set's flight. Every other error inside the fit loop (a missing weather input, a failed read or write, a missing export) is not caught: it stops the run with a non-zero exit, and a fit row that records an exception makes the run invalid. With the registered configuration arm W requires its weather inputs for the epoch day (the baseline table, a nowcast directory and a space-weather directory dated on or before the day, each with the files named below) and stops when one is missing; the development configuration does not stop (its early epochs read the baseline alone). The check is in this folder's `fit-records.mjs`, not in the shared library.

Weather (arm W). The fit reads daily weather rows built by `experiments/ap-five-day-accuracy/lib/space-weather.mjs` for the set's epoch day D, from rows dated D minus 45 d to D plus 50 d. The builder reads: the baseline table of the geomagnetic archive dated 2026-10-09 (daily values up to that date); the newest daily directory of the geomagnetic nowcast dated on or before D; the newest daily directory of the space-weather service dated on or before D (daily solar and geomagnetic indices; the 3-day forecast when the directory is dated at most 2 days before D). A directory's date is the UTC day the archive requested its files. Rows after D are produced from those data by a solar-rotation recurrence (27 days) with first-order relaxation, in a locally built WASM forecaster. The run writes the files read per epoch day, with their SHA-256, to `inputs-weather-W.json` (a sharded run writes `inputs-weather-W-<i>of<n>.json` per shard, each listing its own days); the list follows the builder's own choice rule, so it names the files the builder reads. With the registered configuration the files are: the baseline table, the nowcast file of the newest nowcast directory, and the daily solar and geomagnetic indices of the newest space-weather directory (and its 3-day forecast when read).

The forecaster is not in git. Its sources are in public repositories: `experiments/ap-five-day-accuracy/build-tle-upgrades-wasm.mjs` of this repository (in the manifest) builds it from `third_party/nrlmsise00/*` (pinned by SHA-256 in that script) and `common/sds_cid.hpp` of `https://github.com/DigitalArsenal/space-data-network-modules` at commit `6a807990a2ed004295c0cfe80f612205fc28d784`, with the compiler of `space-data-module-sdk` 0.9.7 and `sdn-emception` 1.0.0. Its registered bytes have SHA-256 `68cb063ab3648ab502fc9f7e0eb7fda0978d7d5a010b941ce718164e9bea4a73` (195,255 bytes). A build from clean checkouts of this repository (commit `a22a374a2602a0372248b0da0c1dfa1352864efe`) and of the modules repository at that commit, with those package versions, gives the same bytes. The registrant keeps the registered file. `fit-records.mjs` hashes the file's bytes before importing it and writes the measured hash into its header. If the file is absent or its SHA-256 differs from `config.json`, the run stops and an amendment is published.

Limits of the weather cut: the record of the epoch day D is used whole, so when a message is created on D, part of that day's record is later than the message (weather only, at most one day). Development epochs before 2026-10-10 (the first dated geomagnetic directory) had no nowcast directory, and before 2026-10-08 (the first dated directory of the space-weather service) the baseline table alone.

Earth orientation. The module's fit and flights use UT1 = UTC, the pole at its mean position, and TT from the leap-second table of the pinned ERFA (module source `src/gcrf.inc`: "UT1 = UTC and the pole at its mean position, as without $EOP"). No `$EOP` input is passed. The pinned ERFA's leap-second table holds no entry after 2017 and ERFA flags a date as dubious only beyond 2028; no table inside the build ends before the window.

## Closest approach

For a row, both objects' states are taken in one inertial frame every second over the closest-approach time of the row's message plus and minus 300 s. On equal range the earliest grid point wins. If the minimum range lies at an edge the window is widened once to plus and minus 1,500 s; if it still lies at an edge the row is kept and flagged. The minimum is refined by Newton steps on the range rate, with states flown by the module at each step, and stops when the step is under 0.6 ms or after six steps (not converged: kept and flagged; its closest-approach time and miss are then at different instants). Newton steps do not check the flight status; the skipped count is that of the last pass. A grid point with a non-zero SGP4 status is skipped and counted; a row with no usable grid point is a refused flight. Records are flown by the module's propagate method at the same instants. The miss of a row is the minimum range in meters; the error of an arm on a row is the absolute difference between its miss and the event's final stated miss.

## Statistics

Every statistic is computed by `score.py`, which also prints the verdicts. The three statistics are computed on the rows of one population, pooled over lead bins, for one comparison (an arm against a base).

- **H1.** The share of rows in which the arm's error is smaller than the base's, above 50 % with the lower end of its 98.33333333333333 % interval above 50 %. A row with equal errors counts as not smaller. The share is over all paired rows (row-weighted); the event-averaged share is printed beside it.
- **H2.** The ratio of the median error of the arm to the median error of the base, below 1 with the upper end of its 98.33333333333333 % interval below 1. If the base's median error is 0 the ratio is undefined and H2 is not held; resamples whose base median error is 0 are left out of the interval and counted.
- **H3 (guard).** Let `nA` be the number of events with a chosen row in which the arm's miss is more than twice the base's miss and the arm's miss (the larger of the two) is above 1 km, and `nB` the number with such a row the other way round. An event counts once in `nA` and once in `nB` even if different rows qualify, so such an event is counted twice in `nA + nB`. The guard holds if `nA` is not more than `nB`.

Intervals: 2,000 resamples of events with replacement (all rows of a drawn event kept together), percentile method linear (`numpy.percentile`; the `numpy` version is printed in every output and registered as 2.5.2), generator `numpy.random.default_rng` with the seed 20261215 plus 100,000 times (look number minus 1), plus 1,000 times the comparison's position (W against S 0, W against X 1, X against S 2) plus 100 times the population's position (PRIMARY 0, SECONDARY 1) plus the cell's index in the fixed list `CELLS` of `score.py` (printed with its indexes at the top of the comparisons).

`results-lookN.json` can contain the bare token NaN where a base median error is 0; it is not strict JSON.

Final-look verdicts, one per registered comparison, on the PRIMARY population (interim verdicts follow the amendment above):

- **INSUFFICIENT:** fewer than 100 primary events with a scored row, counted after the drop. This overrides every other outcome; the H1, H2 and guard values are printed as information only. The floor guards against a change in the provider's publication; it is not a power floor.
- **CONFIRMED:** H1, H2 and the guard all hold.
- **REFUTED:** the top of the H1 interval is at or below 50 % (an all-tie result reads REFUTED), or the bottom of the H2 interval is at or above 1, or the guard fails and an exact one-sided binomial test (probability 0.5) on the `nA + nB` discordant events gives a probability below 0.05.
- **NOT CONFIRMED:** every other outcome, including a guard that fails without that significance. A NOT CONFIRMED on fewer than about 190 primary events is reported as under the expected size, with the width of the H1 interval.

The SECONDARY population carries the same statistics and the H1, H2 and guard flags (`results-lookN.json`); it carries no verdict word. The X against S comparison carries the statistics and no verdict.

Tables. For each comparison and population: the three statistics for the pooled rows; by lead bin; by perigee band of the lower object (under 600, 600 to 1,000, 1,000 to 2,000 km, higher; perigee from each set's mean motion and eccentricity with radius 6,378.137 km); by set age (the older of the two sets' message creation time minus epoch; under 1 d, 1 to 2 d, over 2 d); by pair type (debris with debris, debris with payload, debris with rocket body, the rest); and the lead by perigee cross cells. **Everything printed for publication that is an analysis cell, a distribution, a report-only figure or an overlap share with fewer than 20 events prints FEW and its event count, and no figure.** Counts of rows, drops and flags are printed as counts. Also printed, for each arm, pooled and by lead bin: median, 68th, 90th and 95th percentile of the miss and of the error; the share of rows with a miss under 1, 2, 5, 10, 20 and 50 km; the median and 90th percentile of the difference of closest-approach times against the final message. Report-only figures with no verdict role: the share of rows where the arm's miss is under the base's miss; the median of (miss minus final miss) per arm; the H1 share by band of the final miss (under 100 m, 100 to 300 m, 300 to 1,000 m, over 1,000 m); the share of primary events whose pair or either object was in a development event. The last needs `development-objects.json` in the store, `{"objects": [object identifiers], "pairs": [[smaller identifier, larger identifier], ...]}`, kept outside the repository and copied into the store after `build-events.py` and before `score.py` (the store is otherwise empty when the run starts); with no file the script prints "development overlap: file absent".

## Original single-run power (95 % intervals; superseded by the amendment)

For H1 alone. Method (`power.py`): one chosen row per event, each an independent trial that is "smaller" with probability `p` (the true share); H1 holds when the lower end of the normal 95 % interval of the observed share is above 50 %; the chance is the exact binomial sum over the outcomes that satisfy this. Rows of one event are not independent and the registered interval is an event bootstrap, so the figures are approximate. In development, 236 events with a strong reference in about 34 days of messages (6.9 a day) gave about 194 primary events for the 28-day window and about 480 events in all. The early-exclusion rule removes events with a message created before 2026-11-12T07:28:00Z, which are events whose closest approach falls in roughly the first days of the window, so the expected primary count is somewhat below 194; the power rows for 150 and 100 events apply.

| primary events | true share 55 % | 60 % | 62 % | 64 % |
| --- | --- | --- | --- | --- |
| 100 | 0.18 | 0.54 | 0.70 | 0.83 |
| 150 | 0.26 | 0.72 | 0.86 | 0.95 |
| 194 | 0.29 | 0.81 | 0.93 | 0.98 |
| 250 | 0.35 | 0.89 | 0.97 | 0.99 |

For the original single run, at about 194 primary events and a true share of 60 % the chance that H1 holds was about 0.8; the amended figures are above. The development share of arm W on the primary population is 65 %, a figure read on the events that also chose the recipe.

## What this cannot show

- The provider's final published miss is taken as the truth. It is a miss computed from the provider's own orbit determination, not an independent measurement.
- Only events the provider published are scored. Nothing is shown about conjunctions the provider did not publish, or about alerts raised on events outside its publication criteria.
- The primary population is selected on the provider's messages: its last message lies within 12 h of the closest approach, and so does its final miss. An event whose messages stopped earlier may have left the provider's criteria; the reason is not known. The secondary population includes those events.
- The error measures the miss, the distance across the relative velocity. An along-track error moves the time of the closest approach and barely the miss; the difference of times is reported separately.
- Development figures were read on events up to 2026-11-15, and recipe W was defined after F, K and C were scored on them. They are not a test.
- The weather cut is the set's epoch day, used whole (a message created on that day precedes part of that day's weather record), and development epochs before 2026-10-10 lacked the nowcast directory (before 2026-10-08 they used the baseline table alone).
- Covariance, probability of collision and false alarms are not part of this registration.

## Frozen files, inputs and run

Frozen: every file listed in `MANIFEST.sha256` (this folder's scripts, configurations, `BINDINGS.sha256`, `lib/` and the test; the libraries of this repository that the scripts import: `experiments/ap-five-day-accuracy/lib/space-weather.mjs`, `hold-gate.mjs`, `tle-upgrades-host.mjs`, `wasm-hosts.mjs` and `crlb-covariance.mjs` (the only covariance code in the set: `tle-upgrades-host.mjs` imports it), and `experiments/ap-five-day-accuracy/build-tle-upgrades-wasm.mjs`; `package.json` and `package-lock.json`). The libraries are not edited. The Space Data Standards bindings are the files of the public repository `https://github.com/DigitalArsenal/spacedatastandards.org` at commit `cb95255756b5d8947fa988ce1c879e886dd7d704`, in a checkout at `repos/main-packages/spacedatastandards.org`, where this repository sits at `repos/ancillary-packages/orbit-accuracy-experiments` (the relative path the libraries import them from); `BINDINGS.sha256` lists the entry files with their SHA-256 and the SHA-256 of the closure of every file they import, and `check.mjs` verifies them. The development rows were made with exactly these bytes (the checkout was clean at that commit). There is no override of the bindings' location. Packages are as in `package-lock.json` (space-data-module-sdk 0.9.7, flatbuffers 25.9.23), installed by `npm ci`; the development table was printed with Node 25.4.0, Python 3.14.7 and numpy 2.5.2, registered in `config.json`, and `check.mjs` also confirms that the bindings' closure holds no dynamic import and that the `flatbuffers` package the bindings import, resolved from the standards checkout, is the locked version (25.9.23); it fails on another Node, Python or numpy version (a run on another version is a second run stated as such, not the registered one).

The archive root and the run's store must not contain the substrings in `hold-gate.mjs` (including "udl"); otherwise arm W stops with HOLD_GATE_VIOLATION.

Run look 1 on 2026-11-24, look 2 on 2026-12-01, and look 3 on 2026-12-15. Set `LOOK` to the look number and `CONJ_STORE` to a separate empty store for each look. Run each command from this folder with the module's bytes at `SDN_AP_WASM` (extracted with `git show 6a807990a2ed004295c0cfe80f612205fc28d784:propagator/sdn-ap/dist/isomorphic/module.wasm`), the forecaster in place, and the store `CONJ_STORE` empty:

```
npm ci
node check.mjs --look "$LOOK"
python3 build-events.py --look "$LOOK"
python3 build-set-index.py --look "$LOOK"
node fly-sgp4.mjs --look "$LOOK"
node fit-records.mjs --arm W --look "$LOOK"
node fly-records.mjs --arm W --look "$LOOK"
node fit-records.mjs --arm X --look "$LOOK"
node fly-records.mjs --arm X --look "$LOOK"
if [ "$LOOK" = 3 ]; then
  python3 score.py --look 3 --earlier "$LOOK1_RESULT" --earlier "$LOOK2_RESULT"
else
  python3 score.py --look "$LOOK"
fi
python3 power.py
```

For look 3, `LOOK1_RESULT` and `LOOK2_RESULT` name the published `results-look1.json` and `results-look2.json`. These two aggregate files are required even when neither interim look confirmed; no earlier event, row, fit or index is reused.

(`fit-records.mjs` may be run in shards, `--shard i/n`, one process each, before its `fly-records.mjs`. `SDN_ARCHIVE_ROOT` points every command at another archive path and must be the same for all commands of the run; the root is written into every header, and `score.py` stops on headers that disagree.) The run writes an input manifest per input kind (messages and sets: per day file the name, record count and SHA-256, and one aggregate SHA-256 of the text of one line `<file name> <SHA-256 of the file>` per day file in name order; weather: the look number and files read per epoch day with their SHA-256). The 33 message files archived through 2026-11-12 have the aggregate SHA-256 `6b2d6e1e5138e3dd35fb1191481e43072880295bc66f9a321bcdc87df8799938`; the run's aggregate covers every day file in its range, so the registered value is checked against its own files with `python3 -c "import hashlib,json; j=json.load(open('inputs-messages.json')); print(hashlib.sha256(''.join('%s %s\n' % (f['file'], f['sha256']) for f in j['files'] if f['file'] <= '2026-11-12.json.gz').encode()).hexdigest())"`. Messages created before this registration's merge may belong to test inputs; that is allowed because the recipes are fixed.

Published per look N: `results-lookN.txt`, `results-lookN.json`, `events-counts-lookN.json`, `sets-counts-lookN.json`, `inputs-messages-lookN.json`, `inputs-sets-lookN.json`, every weather input manifest with `-lookN` inserted before `.json` (for example `inputs-weather-W-0of4-look1.json`), `check-lookN.txt` and `power-lookN.txt`. Counts and input manifests retain their original filenames inside each separate store; publication copies add the look suffix. All published outputs are aggregates only (counts, percentiles, shares, ratios, intervals; no row, no object identifier, no name of an object). Not published: every other file in the store.

The amended files are frozen by the amendment merge before the window opens and remain identical through all three looks. A change after 2026-11-16T00:00Z is an amendment with its date and reason.

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

Identity of the development inputs. The development `events.json` has SHA-256 `0522eedd8f4ebe2cfdab7de5e6de3574e9afcf7cb1603a213e09749147232c65` and the development `sets_index.json` `c0ef67eb5f2629ad186d920bf8d7c531d6a8893b071ec336bb5a7fe9190c88d1`; they are byte for byte the files the final build scripts rebuild from the development configuration. Development counts of the checks added by the final scripts: chosen rows 1,105; chosen rows whose set choice had equal creation times 0; sets of another ephemeris type 0; sets with an unusable field or epoch 0; sets created before the start day 0; day files outside the read range 266; days in the read range with no file 0 (message days 0); messages without an identifier 0. None of them changed the development index.
