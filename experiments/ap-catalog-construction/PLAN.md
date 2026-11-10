# Registered confirmation: the catalog's AP construction, against the public set and against the registered construction

Registered 2026-11-10 under [stack issue 312](https://github.com/DigitalArsenal/spacedatanetwork-stack/issues/312), before any set of
part 1 or part 2, and before the provider capture of part H, was fitted or scored by this construction. `config.json` beside this
file holds the same numbers for the code and is frozen with it. `run.mjs`, `table.mjs` and `lib/*.mjs` are part of the registration:
every run's manifest records their SHA-256 and the commit that holds them, and a registered part refuses to run while this folder has
uncommitted changes.

## Question

[ap-from-public-sets](../ap-from-public-sets/PLAN.md) registered one way to make an AP record from public element sets: fly the sets
on SGP4, fit AP to the flight, serve that record (`D5`, else `B3`). Twenty development rounds then changed the construction, class by
class, and added operator-grade inputs where the archive holds them. Does the changed construction hold on sets it was not developed
on, against the set on SGP4 and against the registered construction, class by class? And how does it stand against the provider's XP
sets of a capture made after this registration?

## What was read before this plan

- The 20 development rounds (`results/ap-catalog-construction/rounds/`, exploratory) fitted and scored sets with epochs 2026-09-05 to
  10-28 (period A) and 2026-06-01 to 08-10 (period B), both also read by ap-from-public-sets. Their runner refused set epochs
  2026-03-01 to 05-31 and anything after 2026-11-10; period B's history started 2026-06-01. The rounds also scored the provider's XP
  sets of the 2026-10-23 capture locally (statistics only).
- Dry run of this runner on period B (`run.mjs --part dev-B`, 2026-11-10, before registration; rows under `runs/`, never published):
  2,297 sets of 148 satellites, that is the rounds' 2,223 sets of 142 satellites plus 74 sets of the six Galileo satellites the hold list
  had removed. On the 2,223 shared sets the served arm is the same in every set and the set's own error is identical; the served
  record's 72 h error is bit-identical in 1,437 sets, equal to 1e-6 relative in 785 and within 5.3e-6 in one (floating point in the
  module's fits). Every class figure of the rounds' final scoreboard for B is reproduced to the printed digit. With the six satellites,
  MEO reads 0.86 (0.84 to 0.89) against the set and 0.92 (0.89 to 0.95) against the earlier construction.
- Nothing of parts 1, 2 or H has been read by this construction. Part 1's sets (2026-03-01 to 05-31) are read here for the first time
  by any construction of issue 312. The capture folder of part H has not been opened.

## No exclusions

The owner ruled on 2026-11-10 ([stack issue 314](https://github.com/DigitalArsenal/spacedatanetwork-stack/issues/314)): "Drop the 5
November rule and any rule that says to exclude data." This runner includes every satellite that has truth. It never consults the
five-day pipeline's hold list (`isHeldForStudy`): no Galileo, Eutelsat, Starlink or Swarm date rule. Compared with ap-from-public-sets,
six Galileo satellites with ESA final truth now count, and Swarm counts after 2026-10-31. What stays is the truth gate, which drops
corrupted truth states (its ledger, its sanity rule and its jump screen), and the archive's path guard against credential folders.

## Build

- `propagator/sdn-ap` 0.6.5, modules commit `3a3661eaf9caa84fc776a9959494e1ca14358db1`, wasm SHA-256
  `f0b8352a43f305fbdd1ad15c9894e2d28f3179528838cae8f967bf1ea5d089b7`: every public set is flown by its own SGP4; every AP record is
  fitted and flown by it.
- Readers, from the same modules checkout, bytes as `config.json` names them: `data-source/cpf-source` 1.1.0, `files/orbit-products`
  0.2.1, `data-source/eop-parser` 0.2.0, `analysis/reference-states` 0.4.0. They read CPF and SP3 files and carry them to GCRF.
- Part H only: `propagator/sgp4-xp` 0.2.1 from modules commit `ea824356587f54149f876cd3b2b5d8134af682d3`, wasm SHA-256
  `816fd137d76197f2af93501d7d71c527383f7589ab698d5d1d3544782cd2feef`, called as a black box (`ingest_omm`, `propagate`).
- The weather table comes from the five-day pipeline's builder; its forecaster is a locally built file, SHA-256
  `68cb063ab3648ab502fc9f7e0eb7fda0978d7d5a010b941ce718164e9bea4a73`.

The runner refuses any other bytes.

## Fit

Every arm fits AP as ap-from-public-sets does: NRLMSISE-00 on the weather table as known on the day of the set's epoch (for an
operator-grade arm: the day of t0, part H: of the capture time), tesseral terms to degree 31 and off above eccentricity 0.048, zonal
terms to degree 20, the module's default priors. The states go in one GCRF block whose useable interval is the whole block. A refused
fit means the arm does not exist for that set.

## Operator-grade inputs and their issue rules

An input is read only when it was out by t0 (part H: by the capture time). The issue time comes from the product itself, so a file
added to the archive after the fact counts when its own issue time is early enough.

| Input | Archive | Issue rule |
| --- | --- | --- |
| ILRS CPF predictions | `hac/ilrs-edc/cpf_predicts_v2/<target>/`, `release-archive/main-data-e4-cpf/` | the H1 record's production date and hour at or before t0; for a file whose archive name carries its retrieval time, that too; the name's date within 3 days before t0 |
| ESA ultra-rapid GNSS (GPS, GLONASS) | `reference-states/products/ESA0OPSULT_*` | the file's start at least 26 h before t0 and at most 32 h |
| GFZ rapid multi-GNSS | `hac/gfz-gnss-rapid/cddis/gnss/products/<week>/GFZ0MGXRAP_*` | the CDDIS Last-Modified time in the file's provenance at or before t0 |

Earth orientation for every conversion: the newest IERS `finals.all.iau2000.txt` on or before the day of t0, from the dated folders of
`hac/iers-eop/2026/` and the snapshot `hac/iers-eop/20261009/finals.all.iau2000.txt` (SHA-256 `0baf00f67a39...`), which is also the
file for every day before 2026-10-09. For those days it holds values published after t0: observed rather than predicted Earth
orientation, a difference of centimetres. GNSS identities: the newest IGS satellite metadata SINEX on or before the day of t0
(`reference-states/products/igs_satellite_metadata.snx.<stamp>`), else the snapshot of 2026-10-09; its PRN validity intervals are
read at the product's middle.

## Arms

For a public set with epoch t0. The forecast of every public-set arm is the current set flown from t0 to t0 + F days at 300 s.

| Arm | Fitted to | Record epoch |
| --- | --- | --- |
| `P13` | the newest CPF file out by t0: its states from t0 - 1 d to t0 + 3 d, at least 300 s apart (at least 100) | last state |
| `U2` | the newest ultra-rapid file out by t0, all 48 h (24 h solved, 24 h predicted), plus the solved first 24 h of the files started 1 and 2 days earlier, 300 s (at least 100 states) | last state |
| `R3` | the newest 3 daily rapid files out by t0 that hold the satellite, the newest ending at most 3 days before t0, 300 s (at least 200 states) | last state |
| `B3`, `D5` | as registered in ap-from-public-sets | first state |
| `H8F3`, `H5F5`, `H5F7` | D5's history over 8, 5, 5 days, and a 3, 5, 7-day forecast | first state |
| `K12`, `K10`, `KG8c`, `KH8`, `KM5` | an interleaved history (below), and a 5, 5, 5, 3, 3-day forecast | first state |

**Interleaved history.** Every set with epoch in [t0 - (H + 3) d, t0], the current one included, each flown over [its epoch - back, its
epoch + fwd] inside [t0 - H d, t0), on a grid of step s offset by its rank (the j-th of n sets by j s / n), so no instant is flown twice
and no position is averaged. It exists with at least 3 sets and 80 % of an H-day grid at step s.

| Arm | H (days) | back (days) | fwd (days) | s | Maneuver cut |
| --- | --: | --: | --: | --: | --- |
| `K12` | 12 | 8 | 0 | 3,600 s | none |
| `K10` | 8 | 6 | 0 | 3,600 s | none |
| `KG8c` | 8 | 6 | 0 | 3,600 s | 10 km |
| `KH8` | 8 | 1 | 1 | 1,800 s | none |
| `KM5` | 5 | 0.5 | 0.5 | 900 s | none |

**Maneuver cut.** A jump is where the earlier of two consecutive sets, flown on SGP4 to the later one's epoch, is more than the cut
from the later set's own position there; the history keeps only the sets from the last jump on.

## The served record

By the orbit class of the current set, the first arm that exists is served, else the set itself on SGP4. Chosen without truth.

| Class | Served chain |
| --- | --- |
| LOW_LEO | P13, U2, R3, D5, B3 |
| MID_LEO | P13, U2, R3, KM5, D5, B3 |
| HIGH_LEO | P13, U2, R3, KH8, H8F3, D5, B3 |
| MEO | P13, U2, R3, K12, K10, D5, B3 |
| GEO | P13, U2, R3, KG8c, B3 |
| HEO | P13, U2, R3, H5F7, H5F5, D5, B3 |

The **earlier construction** is the record ap-from-public-sets serves: D5, else B3, else the set.

## Sets

| Part | Sets | Operator-grade inputs | When |
| --- | --- | --- | --- |
| 1 | epochs 2026-03-01 to 2026-05-31 | CPF where a file out by t0 is in the archive (CryoSat-2, Sentinel-6A, Starlette and Swarm A have files for this period; Swarm A has no truth family here). U2 and R3 are registered as conditional: the archive holds no ultra-rapid or rapid product for this period, so they are not served in part 1. | after this plan is merged |
| 2 | epochs 2026-11-11 to 2026-11-24 | every operator-grade arm, where a product out by t0 is in the archive when the part runs | once, when truth is published through 2026-12-01; not before 2026-12-02 |
| H | the provider's XP capture of 2026-11-10 | as part 2, out by the capture time | with part 2 |

Per satellite (parts 1 and 2): the first set in the part, then each next set at least 3 days after the last one taken. A set counts when
truth covers at least 90 % of the first day after its epoch. Sets are Space-Track's daily GP snapshots and gp_history by creation date,
read as the five-day pipeline's loader reads them (sets within 60 s are one, the higher GP_ID), with no hold list. A set's history may
reach 21 days before the part.

**Part H.** The capture time is `started_utc` in the capture folder's `run.json`; nothing else in that folder is read until part H runs.
For each satellite with truth and a type-4 XP set in the capture: the XP set flown through `propagator/sgp4-xp`; the public set current
at the capture time (the newest with epoch and creation at or before it, at most 3 days old) flown on SGP4; our served record and the
earlier construction's, built for that public set with operator-grade inputs out by the capture time; all four scored on days +1 to +10
after the capture time where truth exists. Statistics only: nothing is fitted to the provider's sets, and no element value is printed or
written.

## Truth

The families of ap-from-public-sets, every satellite with states in them: ESA final orbits (navigation satellites), Copernicus precise
orbits (Sentinel-1), IDS DORIS orbits (altimetry satellites), ILRS combined orbits (LAGEOS, Etalon), NSGF orbits (laser spheres),
ESA precise orbits (Swarm), UCAR near-real-time orbits (COSMIC-2). States are read through the truth gate; its jump screen is applied to
each series and a state inconsistent with both neighbours is dropped and counted. Truth is used at its own epochs, thinned to 300 s;
nothing is interpolated. A full day holds the truth's step times the smallest whole number reaching 300 s (amendment A1 of
ap-from-public-sets).

## Scoring

The error of a flight is the 3D position difference from truth. Per set and record: the root mean square over each day from t0 (days 1
to 7; part H: days 1 to 10 from the capture time) and over the first 72 hours, the primary measure. A day counts with at least 90 % of
the states its grid holds; the 72 h figure needs all of days 1 to 3.

## Statistic and verdict

By orbit class of the current set: `LOW_LEO` (perigee under 500 km), `MID_LEO` (500 to 750 km), `HIGH_LEO` (750 to 2,000 km), `MEO`,
`GEO` (semi-major axis 38,000 to 46,000 km), `HEO` (eccentricity 0.15 or more). The statistic is ap-from-public-sets' (`lib.mjs`,
imported): the paired ratio of 72 h errors, its median over sets, and a 95 % interval from resampling satellites with replacement
(2,000 resamples, seed 20261110).

Reported for each class in parts 1 and 2:
- the served record against the set on SGP4, with the plan's verdict: **BEATS** (the whole interval below 1), **LOSES** (above 1),
  **TIE** (it spans 1), **FEW** (under 5 satellites or 30 sets);
- the earlier construction against the set, with its verdict;
- the served record against the earlier construction, paired, with the same interval.

Every class and every truth source is printed, whatever it shows, with the days 1 to 7 and the arms that were served.

Part H, by class: the served record, the earlier construction's and the public set, each against the XP set (paired by satellite, same
interval), and the medians by day.

## Decision rule for the catalog

For each class, from part 1: the class is served by the new construction when its served record BEATS the set and its interval against
the earlier construction is not wholly above 1; otherwise by the earlier construction where that BEATS the set; otherwise by the set on
SGP4. Part 2 tests the rule: it holds when no class served by the new construction has a served record that LOSES against the set, or
an interval against the earlier construction wholly above 1, in part 2.

## What this cannot show

- The operator-grade arms reach few satellites in part 1: the archive holds CPF files for four low satellites in that period and no GNSS
  ultra-rapid or rapid product, so part 1 tests mostly the public-set arms. Part 2 tests the operator-grade arms only as far as their
  products are collected by then (stack issue 312's needs-collection list).
- The rounds chose twelve changes on periods A and B; this confirmation exists to see how much of that holds on unseen sets.
- Truth exists for about 150 satellites, all well-tracked payloads; debris and rocket bodies are not tested. GEO here is QZSS and
  BeiDou IGSO; there is no open truth for commercial GEO. LOW_LEO and HEO have one or two satellites and read FEW.
- For days before 2026-10-09, Earth orientation comes from a file published after t0 (centimetres; see above).
- Part H: the provider's sets were fitted to data the provider had at capture time and may carry information from after their epochs;
  our record uses only what was out at the capture time, and the comparison is scored from the capture time for all.
- The weather table uses final values of the observed indices up to the day of t0 and a recurrence forecast after it. The archive
  keeps the latest revision of a public set at a given epoch.

## What is published

`results/ap-catalog-construction/part<N>/table.json` and `README.md` for parts 1 and 2, generated by `table.mjs`: aggregates only.
Per-set rows and manifests stay in the store (`/opt/data/sdn-archive/ap-catalog-construction`). No element set and no per-set or
per-satellite row is committed. Part H's tables stay in the local store (`partH/`) and are published only on the owner's word
([stack issue 288](https://github.com/DigitalArsenal/spacedatanetwork-stack/issues/288)). The development rounds' log, scoreboard and
construction are published as exploratory results in `results/ap-catalog-construction/rounds/`, at class and family level, without the
head-to-head tables against the provider's sets.

## Checks

- `node experiments/ap-catalog-construction/run.mjs --check`: made-up sets through the real module end to end, for three classes
  (each served record is fitted to the made-up set's own SGP4 flight and must follow it within 2 km over 72 h; the history arms see
  copies of the set at its own epoch, since a made-up history needs orbit mathematics this repository does not do); the maneuver cut on
  a made-up jump; the statistic and verdict on fixed numbers; the catalog rule on fixed verdicts. It needs the module at the registered
  bytes and the weather archive; without them it says SKIPPED and fails.
- `node experiments/ap-catalog-construction/table.mjs --part <N> --check`: the written table equals the table rebuilt from the rows.
