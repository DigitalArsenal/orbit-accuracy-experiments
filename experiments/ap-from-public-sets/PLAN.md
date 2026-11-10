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

For a public set with epoch `t0`. Nothing published after `t0` enters any arm.

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
| 2 | 2026-11-11 to 2026-11-24 | sets published after this registration |

Per satellite: the first set in the part, then each next set at least 3 days after the last one taken. A set counts when truth covers at least 90 % of the first day after its epoch.

Part 2 is run once, when the truth sources have published through 2026-12-01. A class with no truth by then is reported as not scored.

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

## What this cannot show

- Truth exists for about 150 satellites, all well-tracked payloads. The verdict for a class speaks for objects like them. Debris and rocket bodies are not tested.
- `LOW_LEO` has two or three satellites with truth. It will read FEW.
- The weather table uses final values of the observed indices up to and including the day of `t0`, not the values as first issued, and a recurrence forecast after it. Only AP reads weather.
- The archive keeps the latest revision of a set at a given epoch.
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
