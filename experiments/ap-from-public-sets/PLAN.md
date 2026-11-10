# Registered confirmation: an AP record made from public element sets against the set itself

Registered 2026-11-10 under [stack issue 230](https://github.com/DigitalArsenal/spacedatanetwork-stack/issues/230), before any set of either part below was fitted or scored by any arm of this construction. `config.json` beside this file holds the same numbers for the code and is frozen with it. `run.mjs`, `lib.mjs` and `table.mjs` are part of the registration: they are committed with this file, and every run's manifest records their SHA-256 and the commit that holds them.

## Question

Most cataloged objects have nothing but public SGP4 element sets. Can an AP record be made from those sets alone that predicts better than the current set flown on SGP4, and in which orbit classes?

The public sets are fitted to a numerical forecast, mostly its future part (Hejduk et al., AAS 13-240). A set therefore carries that forecast for some days after its epoch. The construction tested here keeps the forecast and changes the theory that flies it: fly the sets on SGP4, fit AP to the flown trajectory, fly the AP record.

## What was read before this plan

Exploratory runs on 2026-11-10 (posted on the issue) fitted and scored these arms on sets with epochs from 2026-09-05 to 2026-10-28, on navigation satellites, altimetry satellites, Sentinel-1, LAGEOS and Etalon. The spans of five days of history and three days of forecast were chosen there. A dry run of this runner used sets of 2026-10-10 to 10-15, inside that period.

No set of part 1 or part 2 has been fitted or scored by any arm here. An earlier registered test (`sdn-ap-gp-history-od`, sdn-ap 0.1.0) scored a history-only construction on windows of the comparison's own list; some may fall in part 1. None of its code, settings or rows is used.

AP itself was developed on precise orbits of many of these satellites, in months that overlap part 1. This construction never reads a precise orbit before scoring.

## Build

`propagator/sdn-ap` 0.6.5, modules commit `3a3661eaf9caa84fc776a9959494e1ca14358db1`, wasm SHA-256 `f0b8352a43f305fbdd1ad15c9894e2d28f3179528838cae8f967bf1ea5d089b7`. The runner refuses any other bytes. Every set is flown by this module's own SGP4, and every AP record is fitted and flown by it.

The weather table comes from the five-day pipeline's builder (`experiments/ap-five-day-accuracy/lib/space-weather.mjs`). Its forecaster is a locally built file, not in git: SHA-256 `68cb063ab3648ab502fc9f7e0eb7fda0978d7d5a010b941ce718164e9bea4a73`. The runner refuses any other bytes.

## Arms

For a public set with epoch `t0`. Nothing published after `t0` enters any arm. (Not true as written for part 1; amendment A3 states what each arm read and what part 2 reads.)

| Arm | What flies | Made from |
| --- | --- | --- |
| `A` | the set, on SGP4 | the set |
| `B3` | an AP record | AP fitted to the set's own SGP4 flight from `t0` to `t0` + 3 days |
| `C5` | an AP record | AP fitted to the earlier sets' SGP4 flights over the 5 days before `t0`, each set flown from its epoch to the next set's epoch |
| `D5` | an AP record | AP fitted to both: the 5 days of `C5` and the 3 days of `B3`, in one fit |
| `S` | the served record | `D5` when it exists, else `B3`, else the set itself |

- Flights are sampled every 300 s.
- `C5` and `D5` need at least 3 sets with epochs in the 8 days up to `t0`, the current one included, and at least 80 % of the 5-day grid filled. Otherwise they do not exist for that set.
- AP fit settings: NRLMSISE-00 on the weather table as known on the day of `t0`; tesseral terms to degree 31, off above eccentricity 0.048; zonal terms to degree 20. The record's epoch is the first fitted state for `B3` and `D5`, the last for `C5`.
- A refused fit means the arm does not exist for that set; `S` falls back. The module instance is replaced after a refused fit.
- `S` is chosen without truth.

## Sets

| Part | Set epochs | Kind |
| --- | --- | --- |
| 1 | 2026-06-01 to 2026-08-10 | an earlier period, never fitted or scored by this construction |
| 2 | 2026-11-11 to 2026-12-22 (42 days by amendment A3; first registered as 14 days, to 2026-11-24) | sets published after this registration |

Per satellite: the first set in the part, then each next set at least 3 days after the last one taken. A set counts when truth covers at least 90 % of the first day after its epoch.

Part 2 is run once, when the truth sources have published through 2026-12-29 and not before 2027-01-12 (amendment A3; first registered as 2026-12-01). A class with no truth by then is reported as not scored.

## Truth

Every satellite with states in these sources during the part, behind the repository's hold gate (the held Galileo satellites, Starlink, Swarm after 2026-10-31):

- Navigation satellites: ESA final orbits
- Sentinel-1: Copernicus precise orbits
- Altimetry satellites: IDS DORIS orbits
- LAGEOS and Etalon: ILRS combined orbits
- Laser spheres: NSGF orbits
- Swarm: ESA precise orbits
- COSMIC-2: UCAR near-real-time orbits

States are read through the truth gate (its ledger and its sanity rule). The gate's jump screen is then applied to each series, and a state inconsistent with both neighbors is dropped and counted. Truth is used at its own epochs, thinned to 300 s; nothing is interpolated.

## Scoring

The error of a flight is the 3D position difference from truth. Per set and arm: the root mean square over each day from `t0` (days 1 to 7), and over the first 72 hours, which is the primary measure. A day counts with at least 90 % of the states its grid would hold; the 72 h figure needs all of days 1 to 3.

## Statistic and verdict

By orbit class of the current set: `LOW_LEO` (perigee under 500 km), `MID_LEO` (500 to 750 km), `HIGH_LEO` (750 to 2,000 km), `MEO`, `GEO` (semi-major axis 38,000 to 46,000 km), `HEO` (eccentricity 0.15 or more).

For each class and arm: the ratio of the arm's 72 h error to the set's, paired by set; its median over sets; and a 95 % interval from resampling satellites with replacement, each drawn satellite bringing all its sets (2,000 resamples, seed 20261110).

- **BEATS**: the whole interval is below 1.
- **LOSES**: the whole interval is above 1.
- **TIE**: the interval spans 1.
- **FEW**: under 5 satellites or under 30 sets. No verdict.

The table also gives each class by day, each arm, and each truth source. Every class and every source is printed, whatever it shows.

## Decision rule for the catalog

After part 1, a class is served on AP when `S` has the verdict BEATS. Every other class stays on the set, flown on SGP4.

Part 2 tests that rule. It holds when no class served on AP has the verdict LOSES in part 2. It fails for a class that does, and that class goes back to the set.

**Both paragraphs are replaced by amendment A3:** no class is served on AP from part 1, and part 2 has a rule that can fail.

## What this cannot show

- Truth exists for about 150 satellites, all well-tracked payloads. The verdict for a class speaks for objects like them. Debris and rocket bodies are not tested.
- `LOW_LEO` has two or three satellites with truth. It will read FEW.
- The weather table uses final values of the observed indices up to and including the day of `t0`, not the values as first issued, and a recurrence forecast after it. Only AP reads weather.
- The archive keeps the latest revision of a set at a given epoch. (Wrong: it keeps every revision and the loader takes the newest; see amendment A3.)
- COSMIC-2's orbits are near-real-time products, good to decimeters; the errors scored here are tens of meters and up.

## What is published

`results/ap-from-public-sets/part<N>/table.json` and `README.md`, generated by `table.mjs`: aggregates only. Per-set rows and manifests stay in the store (`/opt/data/sdn-archive/ap-from-public-sets`). No element set and no per-set or per-satellite row is committed.

## Checks

- `node experiments/ap-from-public-sets/run.mjs --check`: a made-up set through the real module, end to end (flown on SGP4, fitted as `B3`, flown on AP, scored against its own flight), and the statistic and verdict rule on fixed numbers. It needs the module at the registered bytes and the weather archive; without them it says SKIPPED and fails.
- `node experiments/ap-from-public-sets/table.mjs --part <N> --check`: the committed table equals the table rebuilt from the store.

## Amendments

### A1, 2026-11-10: the count of states a full day holds

Part 1 ran as registered and scored 2,063 sets. No laser sphere was among them, and two of the four LAGEOS and Etalon satellites were missing.

**Cause.** The runner took a full day to hold 86,400 s divided by the larger of 300 s and the truth's own step. Truth stepped at 120, 180 or 240 s thins to 360, 360 or 480 s, so a full day holds 240 or 180 states. That is under 90 % of the 288 the runner expected, and every set of those satellites failed the first-day test before any arm ran.

**Change.** The rule of this plan is unchanged: a day counts with at least 90 % of the states its grid would hold. The count now uses the spacing the thinning yields: the truth's step times the smallest whole number that reaches 300 s. One line of `run.mjs` changes. `table.mjs` gains a `--label` option so both tables can be built.

**What was known when this was written.** The fault was seen in the list of truth sources of the part 1 table and confirmed by reading epochs only. No error of any arm on the missing satellites had been computed. Sets already scored are not affected: their truth steps (10, 300 and 900 s) give the same count under both forms.

**Reporting.** Part 1 is run again in full with the corrected count. The results carry both tables: `part1-as-registered` and `part1`.


### A2, 2026-11-10: no satellite is excluded

The owner ruled on 2026-11-10: "Drop the 5 November rule and any rule that says to exclude data" (stack issue 314). The repository's hold gate, which this plan applied to truth and to sets, excluded six Galileo satellites, one Eutelsat satellite, names containing STARLINK, and Swarm and GRACE-FO data after 2026-10-31. From this amendment on it excludes nothing: `isHeldForStudy` returns false.

**Effect.** Part 1 as published stays as it is. It is run once more with every satellite, as `part1-all-satellites`, and both tables are published. Part 2 runs with every satellite. `run.mjs` gains a `--label` option so the second run keeps the first run's rows.

**What was known when this was written.** The published part 1 tables. No error of any arm on the newly included satellites had been computed.


### A3, 2026-11-10: part 2 is made able to fail, reads the tail, and reads only what existed

An adversarial review of part 1 ([stack issue 316](https://github.com/DigitalArsenal/spacedatanetwork-stack/issues/316), review 0, findings C3-1 to C3-7) recomputed every figure from the part 1 rows and found four things: part 2 as registered could not fail in two of the four classes; the median hides a tail that is worse than the set's; three sentences of this plan were not true as written; and part 1 does not support a rule for a catalog. This amendment is merged before the first set epoch of part 2 (2026-11-11 00:00 UTC) and before any part 2 set is fitted.

**What was known when this was written.** The three published part 1 tables, and the review's figures from the part 1 rows, all quoted below. The guard of item 2 was chosen on part 1. No part 2 set existed.

Notation: for a set, `a` is the 72 h error of the set on SGP4 and `b` that of an AP record, both against truth.

**1. Part 2 is 42 days.** Set epochs 2026-11-11 to 2026-12-22. It is run once, when the truth sources have published through 2026-12-29, and not before 2027-01-12. Reason: in every 14-day window of part 1, `MID_LEO` and `GEO` hold under 30 sets and read FEW, so 14 days could refute nothing there; in every 42-day window of part 1 no class reads FEW.

**2. The served record gets a guard.** In part 2, `S` is `D5` when it exists and its fit residual (`fit.D5.rmsM`, the root mean square of the fit as the module reports it) is at most 3 times `B3`'s (`fit.B3.rmsM`) for the same set; else `B3`; else the set. It is chosen without truth. The unguarded record of part 1 (`D5`, else `B3`, else the set) is scored and printed beside it as `S0`. Reason: in part 1 all 25 sets where `S` was more than twice as far as the set were `D5` records whose fit did not close (residual 1.4 to 73 km, more than 3 times `B3`'s in every one), where the orbit had changed inside the fitted history.

**3. The tail is printed.** For each class and each record, beside the registered median ratio and its interval: `T95`, the 95th percentile of `b` over the 95th percentile of `a`; `Trms`, the square root of the sum of `b` squared over the sum of `a` squared; `Tmean`, the sum of `b` over the sum of `a`; the share of sets with `b` more than twice `a`; and the largest `b / a`. Intervals as the plan's (satellites resampled with replacement, seed 20261110). On part 1 as published, for `MID_LEO`, `HIGH_LEO`, `MEO`, `GEO`: `T95` 1.01, 1.13, 1.04, 1.26; `Trms` 0.88, 0.81, 0.92, 1.30; share beyond twice the set 1.1 %, 1.4 %, 0.8 %, 7.0 %. With the guard, post hoc on part 1: medians 0.45, 0.27, 0.98, 0.83; `T95` 0.90, 0.91, 1.00, 1.00; `Trms` 0.77, 0.99, 1.00, 0.98; no set beyond twice the set.

**4. The rule that part 2 tests.** For each class, the guarded record `S` passes when, in part 2, it reads BEATS on the registered statistic AND meets three thresholds on point estimates: `T95` at most 1.00, `Trms` at most 1.00, and at most 1.0 % of sets with `b` more than twice `a`. A class that passes may be served on AP for satellites of the kinds tested (item 7); nothing here decides for debris, rocket bodies or constellations that maneuver continually. A class that reads BEATS and misses a threshold is reported as "closer at the median, not at the tail" and stays on the set. A class that reads TIE, LOSES or FEW stays on the set. Nothing else counts as holding.

**5. What each arm may read in part 2.** Each set is taken as first published: of the revisions at an epoch, the one created first. The history of `C5` and `D5` holds only sets created no later than that. The weather table holds observed values through the last full UTC day before `t0` and the recurrence forecast after it. Lead is still counted from the set's epoch.

**6. Sentences of this plan that were not true as written, corrected.**
- "Nothing published after `t0` enters any arm." In part 1 each arm read the newest revision of the current set and of the earlier sets; 41 % of scored sets used a revision whose elements differ from the first one published, created a median 5.2 h later. Sets were created a median 12.3 h after their epochs, 17 % of them more than 24 h after. The weather table held observed indices through the UTC day of `t0`, so up to 24 h of observed geomagnetic activity after `t0` reached the AP fit. Measured effect on part 1 (both arms rebuilt from what existed when the set first appeared, every second set): no class ratio moves in the third digit. Weather cut one day earlier: `HIGH_LEO` unchanged, `MID_LEO` 0.459 to 0.470, the one strong-drag satellite 0.873 to 0.915.
- "The archive keeps the latest revision of a set at a given epoch." The archive keeps every revision with its creation time; the loader takes the highest `GP_ID`.
- "Registered ... before any set of either part was fitted or scored by any arm of this construction" is true of this construction's arms. The period of part 1 was in the past, its sets and truth had been on disk for months, and the plan was merged ten seconds before the first run started (13:36:08 and about 13:36:18 UTC).
- Amendment A1, "What was known": add that a comment on stack issue 230 at 13:15 UTC, twenty minutes before the registration, already recorded that on the low laser spheres a set of this kind sits near 0.48 km and AP near 0.02 to 0.06 km. A1 admitted those spheres (7 satellites, 117 sets, ratio 0.20).
- Part 1 as registered read `MID_LEO` 0.63 (0.38 to 0.76) and `HIGH_LEO` 0.32 (0.25 to 0.56). The 0.50 and 0.28 of the published table are after A1. Wherever the later pair is quoted, the first is quoted with it.
- Part 1 used sets with epochs from 2026-05-24 as fit history (129 of the 137 rows with `t0` before 4 June). For these satellites, 2026-05-24 to 05-31 counts as read.

**7. What part 1 shows, restated.**
- `B3` and `D5` are fitted to the set's own SGP4 flight over the 72 hours they are scored on. The record is closer to precise orbits there because AP does not reproduce SGP4's periodic error: `a` squared less `b` squared is a median 0.62 km (as a length) in `MID_LEO`, 0.55 km in `HIGH_LEO`, 0.28 km in `MEO`, 1.28 km in `GEO`, and AP's fit residual against the SGP4 flight is of the same size. That is not forecast skill. Fitted to the history alone (`C5`), AP reads 0.62 TIE, 0.49 BEATS, 1.13 LOSES and 1.00 TIE in the four classes, and past the fitted 72 hours `MEO` and `GEO` read TIE on each of days 4 to 7.
- At the 95th percentile the served record of part 1 is not closer than the set in any class, and in `GEO` it is farther in root mean square (1.30).
- The classes are 139 payloads with precise orbits. `HIGH_LEO` is 14 satellites, all of them in AP's development lists (five low laser spheres, nine altimetry satellites). `MID_LEO` is 10 satellites, 4 in those lists (0.29 on those, 0.72 on the 6 outside). `GEO` is 8 navigation satellites, 6 of them inclined more than 10 degrees: it is not the geostationary belt. No debris and no rocket body is tested. The errors of one satellite's sets are correlated (0.52 in `MID_LEO`, 0.44 in `HIGH_LEO`), so the satellites are the sample, not the sets.
- The rule "a class is served on AP when `S` has the verdict BEATS" is withdrawn. No class is served on AP from part 1. Part 2 decides class by class under item 4, and its verdict speaks for satellites like those tested.

**8. Code.** `run.mjs`, `lib.mjs`, `table.mjs` and `config.json` are changed to do items 1 to 5 before any part 2 row is written, in one commit that the part 2 manifest names. Part 1's rows and tables are not changed; `table.mjs` gains the tail columns of item 3 for every part.

**Also found, and stated here:** the module does not return bit-identical numbers for the same set in two runs that differ in the order of calls on one instance (405 of 2,223 sets differ in an AP arm, largest difference 1.9e-7 in the logarithm of the ratio; the SGP4 arm is identical). No printed figure moves.


### A4, 2026-11-10: part 2 on the satellite as the unit, with a smallest effect, a fixed run day and a stated scope

The review's check of A3 ([stack issue 316](https://github.com/DigitalArsenal/spacedatanetwork-stack/issues/316), review 0) listed
seven attacks that A3 leaves open, and the closing review of the catalog test (experiments `ap-catalog-construction`, review 0, C6-9)
found one more in this runner. This amendment answers them as rules, so that this study's part 2 and the catalog test's part 2 share
one design. It is merged before the first set epoch of part 2 (2026-11-11 00:00 UTC) and before any part 2 set is fitted. As in A3,
item 8, the code follows in one commit, named by the part 2 manifest, before any part 2 row is written.

**What was known when this was written.** The three published part 1 tables (`part1-as-registered`, `part1`,
`part1-all-satellites`); review 0's figures from the part 1 rows (C3-1 to C3-7) and its check of A3; the catalog test's plan and its
dry runs (dev-B is this study's part 1 period, 2026-06-01 to 08-10, flown with A3's reading rules; dev-A is 2026-09-05 to 10-28),
whose figures for this study's guarded record are quoted in item 3; the review's simulations of both rules on the development rows;
the cost measurements of stack issue 317. The threshold of item 3 was chosen knowing those figures. No part 2 set existed.

**1. The run day is fixed.** Part 2 runs on 2027-01-12 and no other day, on the truth then in the archive. The runner refuses any
other day and a second run. This replaces "not before 2027-01-12" in A3, item 1.

**2. The registered statistic becomes the satellite's.** For each satellite, the median of ln(`b` / `a`) over its part 2 sets; the
class figure is the median of those satellite medians; its interval is the narrowest order-statistic interval [x(k), x(n+1-k)] whose
coverage 1 - 2 P(Bin(n, 1/2) <= k - 1) is at least 95 % (it exists from 6 satellites on; with 8 satellites it is the smallest and the
largest). BEATS, LOSES and TIE as before; FEW under 6 satellites or under 30 sets, with no ratio. The bootstrap of this plan (median
over sets, satellites resampled) is printed beside every figure and decides nothing. The table also prints, per class, the verdict of A3's item 4 on the bootstrap, as first registered; it decides nothing. This changes the registered statistic, and the
parameter with it (the median satellite, not the median set), before any part 2 set exists. Why: the sets of one satellite are
correlated (0.52 in `MID_LEO`, 0.44 in `HIGH_LEO`, A3 item 7), so the satellites are the sample; and on the development rows the
bootstrap missed a true ratio of 1.00 in 13 %, 8 % and 14 % of simulated parts for classes of 10, 14 and 8 satellites at a nominal 5 %
(review 0, C6-5), where the order-statistic interval missed in 1 % to 6 % (review 0's closing run and the catalog test's simulation,
on the same rows).

**3. A smallest effect worth serving: the interval's upper end below 0.95.** A3's item 4 is kept with BEATS replaced: a class passes
when the upper end of its interval is below 0.95 (a median satellite at least 5 % closer to precise orbits than the set, at 95 %
confidence), AND it meets A3's three tail thresholds, AND item 5's figure from the creation time reads BEATS. Reason, from what serving
costs: an AP record costs every user 1.4 to 2.6 times SGP4's computation per state on the bare kernel (measured 2026-11-10 at a 300 s
step: 2.6 and 2.3 in low orbit, 1.4 at MEO, 2.1 at GEO; stack issue 317) and the catalog one fit per set, and its tail is bounded only
at A3's point estimates. A gain that cannot be told from 5 % is about 0.06 km on a set error of 1.3 km at MEO, and does not repay that
cost. On part 1's period, post hoc (the catalog test's dry run dev-B: this record, A3's reading rules, the satellite unit): `MID_LEO`
0.55 (0.30 to 0.78), `HIGH_LEO` 0.27 (0.18 to 0.54), `MEO` 0.99 (0.98 to 0.99), `GEO` 0.79 (0.63 to 1.00), all within the tail
thresholds (`GEO` at T95 1.00); on these epoch-based figures (the creation-time figure was not computed) `MID_LEO` and `HIGH_LEO` would
pass this item and `MEO` and `GEO` would not, where with "below 1" all four would. Read on the catalog test's public record at MEO the same threshold passes its upper end post hoc (0.89 on dev-B, 0.92 on dev-A); those figures were known too. Simulated in that world (42 days, 600 parts), a
true 0.95 at `MEO` passes under "below 1" in 0.99 of parts and under this item in 0.16; a true 0.90 passes in 1.00 under both. In the same world the review's run (`c3-a4-power.mjs`, the first two conditions only) reads: MID_LEO passes in 0.86 of parts at its part 1 size (0.55), 0.47 at a true 0.60 and 0.01 at 0.70; HIGH_LEO in 0.94 at its part 1 size (0.27) and in none at a true 0.50, because its Trms is 0.99; GEO in 0.03 at its part 1 size (0.79) and 0.99 at a true 0.70. The figure from the creation time is in none of these.

**4. "Satellites of the kinds tested" made operational.** The tested kinds are those of the truth families: ESA final orbits
(navigation satellites), Copernicus precise orbits (Sentinel-1), IDS DORIS orbits (altimetry satellites), ILRS combined orbits (LAGEOS,
Etalon), NSGF orbits (laser spheres), ESA precise orbits (Swarm), UCAR near-real-time orbits (COSMIC-2): payloads whose orbits are
held steady or not maneuvered at all. A catalog object of a passing class is of a tested kind, and may be served AP, only when, from
what the catalog holds at the set's creation: (a) its catalog object type is PAYLOAD; (b) its current set's perigee height, apogee
height and inclination lie inside the ranges spanned by part 2's scored satellites of that class (printed by `table.mjs`); (c) no two
consecutive sets in the 8 days before `t0` differ by a jump: the earlier set, flown on SGP4 to the later one's epoch, more than 10 km
from the later set's own position there (the catalog test's maneuver cut). Every other object stays on the set: debris, rocket bodies,
objects outside the ranges, and objects that maneuvered in the look-back, which is the catalog's measurable stand-in for a
constellation that maneuvers continually. `table.mjs` prints, per class, the share of part 2's sets whose object meets (a) to (c) and
the class figure on those sets alone (decides nothing).

**5. Lead from when a user could hold the set.** Every part 2 figure names its start. The primary measure stays the 72 h from the
set's epoch, on which A3's thresholds were set. Beside it, on the same statistic: the span from the set's creation time (the
`CREATION_DATE` of its first-published revision) to its epoch + 72 h, the part of the scored window in which a user held it; a set
created 72 h or more after its epoch has no such span and is counted. Item 3 requires this figure to read BEATS as well.

**6. Satellites outside AP's development lists.** Per class, a second line on the satellites that are not named in
`experiments/operator-theory/lib/regimes.mjs` (six low laser spheres, ten altimetry satellites, five laser geodetic targets,
Sentinel-1A and 1C), with its own interval; FEW under 6 satellites. It decides nothing; it is printed wherever the class figure is.

**7. The run is pinned.** As the catalog test's runner does: every file the run loads (this experiment's, `lib.mjs`, the five-day
pipeline's libraries, the truth reader, the truth gate, the readers, the standards' bindings, the SDK) is hashed into the manifest as it
loads and must match the commit that the part 2 manifest names; a part with a start record, rows or a manifest already in its store
refuses to start; the start record is written before anything is read. Its `--check` is end to end, as the project requires: the
statistic, the verdicts and the rule are checked on made-up rows run through the real `table.mjs`, asserting on the table it writes;
each refusal is tripped by starting the real `run.mjs` on a made-up part that exists only for the check (its own store, archive root,
registration and run day), and the check proves that none of that part's freedoms is open to part 2.

**8. The truth screen, per step.** `run.mjs` (line 275) drops every candidate of the truth gate's jump screen. The screen compares
each state with the trapezoid rule over its step, whose own error grows as the step cubed (about 0.14 km at 60 s and 18 km at 300 s in
low orbit), against 10 times the series' median residual with a 10 km floor; when a satellite has both 60 s and 300 s files, every 300
s state is marked. In period A it removed 8,011 sound altimetry states, within 21 m of their neighbors' interpolation, from five
satellites (review 0, C6-9). Rule: the median, and so the threshold, is taken per step. Code with the runner change, with a check case
(a made-up clean orbit, 60 s for a day then 300 s for a day, gives no candidate). Part 1 is not affected: in its period every
altimetry file is at 300 s and the screen dropped no altimetry state.

