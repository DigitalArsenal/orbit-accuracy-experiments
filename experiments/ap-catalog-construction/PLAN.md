# Registered confirmation: the catalog's AP construction, against the public set and against the registered construction

Registration under [stack issue 312](https://github.com/DigitalArsenal/spacedatanetwork-stack/issues/312), second version, written on
2026-11-10 after adversarial review 0 (findings C6-1 to C6-7 on the first version, C4-1 to C4-5 on the development rounds, and C6-8
and C6-9 of its closing review) and aligned
with amendment A3 of [ap-from-public-sets](../ap-from-public-sets/PLAN.md). The first version was never run on a registered part. `config.json` holds the same
numbers for the code. `run.mjs`, `table.mjs`, `lib/*.mjs` and every file they load are registered by SHA-256 in `registration.json`; a
registered part refuses to run if any of them, `config.json`, this plan, the truth gate's ledger or its archive manifest differs.

## Question

ap-from-public-sets registered one way to make an AP record from public element sets: fly the sets on SGP4, fit AP to the flight, serve
that record. Twenty development rounds changed the construction class by class (how each class's public-set history is flown) and added
inputs that are not public sets where the archive holds them (ILRS CPF predictions, GNSS ultra-rapid and rapid orbits). Does the changed
construction beat the registered one, class by class, on sets it was not developed on, and is it closer to precise orbits than the set
on SGP4? And, from one later capture, how does it stand against the provider's XP sets?

The catalog decision rests on the public-set changes alone: part 1 names the classes where they beat the registered construction, and
part 2 confirms them on sets that did not exist at registration. The orbit-product inputs (CPF in part 1 for a handful of low
satellites; the GNSS products too in parts 2 and H) are scored and reported, and decide nothing.

## What was read before this plan

- **The rounds.** The 20 development rounds (`results/ap-catalog-construction/rounds/`, exploratory) fitted and scored sets with epochs
  2026-09-05 to 10-28 (period A) and 2026-06-01 to 08-10 (period B), both also read by ap-from-public-sets, and scored the provider's XP
  sets of the 2026-10-23 capture locally (statistics only).
- **The earlier study read part of May.** ap-from-public-sets' part 1 used sets with epochs from 2026-05-24 as fit history (its
  amendment A3, item 6). Part 1 here therefore ends with set epochs on 2026-05-23; no set it fits or scores was fitted by any run of ap-from-public-sets or of this construction.
- **The propagator has seen these months.** Part 1's set epochs and its truth were never fitted or scored by this construction or by
  any arm of issue 312. They were not unseen by the propagator: AP's own development scored it against precise orbits of the same kinds
  of satellites inside these months (`experiments/operator-theory/AP5.md`, line 31: "Part N ... 2026-01-01 to 2026-05-31", strong-drag
  satellites, Sentinel-1A and 1C near 700 km, navigation satellites; `experiments/operator-theory/lib/regimes.mjs` `ALT9` and `AP9.md`:
  three builds scored on ten altimetry satellites at fit epochs 2026-02-02 to 04-13). The comparison against the earlier construction
  is AP on both sides and is not touched by this; the comparison against the set on SGP4 is, by an amount no one can bound without a
  module build that never saw these months. Part 2 is the only part unseen by both the construction and the module.
- **Dry runs of this runner on development data, before registration** (rows under `runs/`, never published; disclosed here; the
  tables of dev-A and dev-B in `results/ap-catalog-construction/dry-runs/`). The
  first version of this runner was dry-run on period B, and drafts of this version on the same three dry runs; none was registered
  and their results are not used. The figures below are from the registered code (every file they executed is in `registration.json` with the same SHA-256).
  - `dev-B`, period B (inputs as part 2's; only CPF files exist there): 2,297 sets of 148 satellites. A3's reading rules
    (first-published set, history created no later, weather cut a day earlier) move the scored set: 426 of the rounds' 2,223 scored
    (satellite, epoch) pairs have no set at the same epoch in dev-B's rows (the first-published revision carries its own epoch, and
    the every-3-days selection moves with it); the class figures against the set, on the earlier plan's bootstrap as the rounds
    printed them: served MID_LEO 0.40 (rounds 0.39), HIGH_LEO 0.24 (0.24), MEO 0.86 (0.86; six more navigation satellites here), GEO
    0.72 (0.72), HEO 0.78 (0.78); public sets only MID_LEO 0.48 (0.19 to 0.74), HIGH_LEO 0.26 (0.20 to 0.41). Under the rule below
    (the public record; here it equals the served one except for the CPF sets of two low satellites): MEO would be the new construction's
    candidate (0.92, 0.88 to 0.98 against the earlier one; tail 0.97 / 0.92 / 0.9 %); MID_LEO and GEO read TIE against the earlier
    construction (0.98, 0.91 to 1.00; 0.86, 0.69 to 1.00); HIGH_LEO beats it (0.92, 0.85 to 0.99) but misses A3's tail thresholds
    against the set (T95 1.44; 4.2 % of sets beyond twice the set's error), so it is not a candidate; LOW_LEO and HEO read FEW.
  - `dev-A`, period A (CPF, ultra-rapid and rapid files exist there): 1,650 sets of 138 satellites; the served record came from the
    ultra-rapid orbit on 415 sets, the rapid orbit on 376 and CPF files on 71. Class figures against the set, on the earlier plan's
    bootstrap as the rounds printed them: served MID_LEO 0.56 (rounds 0.55), HIGH_LEO 0.18 (0.18), MEO 0.07 (0.07), GEO 0.56 (0.56),
    HEO 0.11 (0.11); public sets only 0.61 (0.60), 0.20 (0.20), 0.89 (0.89), 0.63 (0.63), 0.81 (0.81). Under the rule below, on the
    public record: no class is a candidate. MEO's public record beats the earlier construction (0.91, 0.88 to 0.97) but 1.2 % of its
    sets exceed twice the set's error (threshold 1.0 %); MID_LEO reads TIE against the earlier construction; HIGH_LEO beats it (0.89,
    0.86 to 0.93) but 1.7 % of its sets exceed twice the set's error; GEO reads TIE. The served record, with the orbit products,
    would read MEO new construction (0.10, 0.07 to 0.20 against the earlier one); it is printed beside and decides nothing. This
    period's truth lost sound altimetry states to the jump screen (C6-9 below).
  - `dev-H`, part H's protocol on the provider's capture of 2026-10-23: 111 satellites scored from the capture time, of which 103 at
    MEO (98 served from the rapid orbit, 5 from public sets), 5 GEO, 2 HEO, 1 HIGH_LEO: under the rule below only MEO would get a
    statement. Its figures stay local with part H's (stack issue 288); its `table.json` has SHA-256
    `938a9325dd83f3d163fb006eb6618aa21bf49e62d1b1cf23aa250fb3e8e97fac`.
- Nothing of part 1, part 2 or part H has been read by this construction. The capture folder of part H has not been opened. Part 1's
  archive manifest was made from directory listings and the truth indexes (paths and byte counts); no file of its window was opened
  for its contents.

## No exclusions

The owner ruled on 2026-11-10 ([stack issue 314](https://github.com/DigitalArsenal/spacedatanetwork-stack/issues/314)): "Drop the 5
November rule and any rule that says to exclude data." This runner includes every satellite that has truth and never consults the
five-day pipeline's hold list. What stays is the truth gate, which drops corrupted truth states (its ledger, pinned by SHA-256 in
`config.json`; its sanity rule; its jump screen), and the archive's path guard against credential folders.

**The jump screen drops sound truth when a satellite's files have different steps** (review 0, C6-9). Its residual is the trapezoid
rule's error over the step, which grows as the step cubed (about 0.14 km at 60 s and 18 km at 300 s in low orbit), and its threshold is
10 times the series' median residual with a 10 km floor; in a series that mixes 60 s and 300 s files every 300 s state is marked. In
period A it removed 8,011 sound altimetry states (within 21 m of their neighbors' interpolation) from five satellites. Part 1 is not
affected: its manifest holds only 300 s altimetry files. **Parts 2 and H do not run until a dated amendment fixes the screen** (a
threshold per step, with a check case), merged before their run day. That amendment also brings to this runner the two lines that
amendment A4 of ap-from-public-sets adds to its part 2: the figure from the set's creation time (A4 item 5; this plan counts lead from
the set's epoch) and the line on satellites outside AP's development lists (A4 item 6). It also closes C6-11: `table.mjs` accepts
`--store`, `--out` and `--part1` for every part, so `--part 2 --part1 <any file>` could write the official part 2 table from a part 1
table of the caller's choosing; the amendment refuses those options for parts 1, 2 and H outside the check, or writes the store path
and the part 1 table's SHA-256 into the table. And it blanks the secondary bootstrap that `table.mjs` still prints for FEW classes (the
dry-run tables show it, for example dev-B's HEO 0.78 (0.77 to 0.82) on 2 satellites and LOW_LEO 0.87 on 1) before any registered
table is written.

## Build

- `propagator/sdn-ap` 0.6.5, modules commit `3a3661eaf9caa84fc776a9959494e1ca14358db1`, wasm SHA-256
  `f0b8352a43f305fbdd1ad15c9894e2d28f3179528838cae8f967bf1ea5d089b7`: every public set is flown by its own SGP4; every AP record is
  fitted and flown by it.
- Readers, bytes as `config.json` names them: `data-source/cpf-source` 1.1.0, `files/orbit-products` 0.2.1, `data-source/eop-parser`
  0.2.0, `analysis/reference-states` 0.4.0.
- Parts H and dev-H: `propagator/sgp4-xp` 0.2.1 from modules commit `ea824356587f54149f876cd3b2b5d8134af682d3`, wasm SHA-256
  `816fd137d76197f2af93501d7d71c527383f7589ab698d5d1d3544782cd2feef`, called as a black box (`ingest_omm`, `propagate`, `fit`).
- The weather table comes from the five-day pipeline's builder; its forecaster is a locally built file, SHA-256
  `68cb063ab3648ab502fc9f7e0eb7fda0978d7d5a010b941ce718164e9bea4a73`.

## Fit

Every arm fits AP as ap-from-public-sets does: NRLMSISE-00, tesseral terms to degree 31 and off above eccentricity 0.048, zonal terms to
degree 20, the module's default priors, the states in one GCRF block whose useable interval is the whole block. The weather table holds
observed values through the last full UTC day before the set's epoch (for an operator input: before t0; part H: before the capture
time) and the builder's recurrence forecast after it (A3, item 5). A refused fit means the arm does not exist for that set.

## What each part may read

Each public set is taken as first published: of the revisions at an epoch, the one created first, and every set read must have been
created by the part's cutoff (A3, item 5). An arm's history holds only sets created no later than the current set. Lead is counted from
the set's epoch.

Operator inputs, each read only when its part lists it and only when it was out by t0 (part H: by the capture time). A file whose name
dates it outside the part's window is never opened.

| Input | Archive | Issue rule | Parts |
| --- | --- | --- | --- |
| ILRS CPF predictions | `hac/ilrs-edc/cpf_predicts_v2/<target>/`, `release-archive/main-data-e4-cpf/` | the H1 record's production date and hour at or before t0; for a file whose archive name carries its retrieval time, that too; the name's date within 3 days before t0 | 1, 2, H |
| ESA ultra-rapid GNSS (GPS, GLONASS) | `reference-states/products/ESA0OPSULT_*` | the file's start at least 27 h before t0 (the IGS ultra-rapid schedule, 3 h after the solved day ends; the archive keeps no publication time for these files) and at most 33 h | 2, H |
| GFZ rapid multi-GNSS | `hac/gfz-gnss-rapid/cddis/gnss/products/<week>/GFZ0MGXRAP_*` | the CDDIS Last-Modified time in the file's provenance at or before t0 | 2, H |

A back-filled product counts in part 2 and H when its own issue time is early enough; nothing a part does not list is read.

Earth orientation for every conversion: the newest IERS `finals.all.iau2000.txt` on or before the day of t0, from the dated folders of
`hac/iers-eop/2026/` and the snapshot `hac/iers-eop/20261009/finals.all.iau2000.txt` (SHA-256 `0baf00f67a39...`), which is also the file
for every earlier day. For those days it holds values published after t0. Measured from the archive's own snapshots (predicted against
later observed, 0 to 3 days): UT1 0.12 to 0.19 ms RMS, polar motion 1.0 to 1.4 mas; as position 0.07 to 0.11 m at 7,000 km, 0.26 to
0.42 m at MEO, 0.42 to 0.66 m at geosynchronous radius: decimetres, against arm errors of 10 m and more. GNSS identities: the newest IGS
satellite metadata SINEX on or before the day of t0, else the snapshot of 2026-10-09.

## Arms

For a public set with epoch t0. The forecast of every public-set arm is the current set flown from t0 to t0 + F days at 300 s.

| Arm | Fitted to | Record epoch |
| --- | --- | --- |
| `P13` | the newest CPF file out by t0: its states from t0 - 1 d to t0 + 3 d, at least 300 s apart (at least 100). The whole 72 h scoring window lies inside the fitted span: the record carries the prediction centre's own forecast, not AP's | last state |
| `U2` | the newest ultra-rapid file out by t0, all 48 h (24 h solved, 24 h predicted), plus the solved first 24 h of the files started 1 and 2 days earlier, 300 s (at least 100 states); about a quarter of the scoring window lies inside the fitted span | last state |
| `R3` | the newest 3 daily rapid files out by t0 that hold the satellite, the newest ending at most 3 days before t0, 300 s (at least 200 states); the fit ends before t0: a forecast | last state |
| `B3`, `D5` | as registered in ap-from-public-sets | first state |
| `H8F3`, `H5F5`, `H5F7` | D5's history over 8, 5, 5 days, and a 3, 5, 7-day forecast | first state |
| `K12`, `K10`, `KG8c`, `KH8`, `KM5` | an interleaved history (below), and a 5, 5, 5, 3, 3-day forecast | first state |

**Interleaved history.** Every set with epoch in [t0 - (H + 3) d, t0] created no later than the current set, the current one included,
each flown over [its epoch - back, its epoch + fwd] inside [t0 - H d, t0), on a grid of step s offset by its rank (the j-th of n sets by
j s / n), so no instant is flown twice and no position is averaged. It exists with at least 3 sets and 80 % of an H-day grid at step s.

| Arm | H (days) | back (days) | fwd (days) | s | Maneuver cut |
| --- | --: | --: | --: | --: | --- |
| `K12` | 12 | 8 | 0 | 3,600 s | none |
| `K10` | 8 | 6 | 0 | 3,600 s | none |
| `KG8c` | 8 | 6 | 0 | 3,600 s | 10 km |
| `KH8` | 8 | 1 | 1 | 1,800 s | none |
| `KM5` | 5 | 0.5 | 0.5 | 900 s | none |

**Maneuver cut.** A jump is where the earlier of two consecutive sets, flown on SGP4 to the later one's epoch, is more than the cut from
the later set's own position there; the history keeps only the sets from the last jump on.

## The records of each set

By the orbit class of the current set (classes below), chosen without truth; an arm that does not exist passes to the next.

| Class | Served chain |
| --- | --- |
| LOW_LEO | P13, U2, R3, D5, B3 |
| MID_LEO | P13, U2, R3, KM5, D5, B3 |
| HIGH_LEO | P13, U2, R3, KH8, H8F3, D5, B3 |
| MEO | P13, U2, R3, K12, K10, D5, B3 |
| GEO | P13, U2, R3, KG8c, B3 |
| HEO | P13, U2, R3, H5F7, H5F5, D5, B3 |

Every row holds four records, all scored:
- **served**: the class's chain;
- **public**: the same chain without P13, U2 and R3 (what an object with nothing but public sets gets; the catalog decision is taken
  on this record);
- **earlier**: the record the earlier construction serves, as amendment A3 guards it: `D5` when its fit residual is at most 3 times
  `B3`'s for the same set, else `B3`, else the set;
- **earlier, unguarded**: `D5`, else `B3`, else the set (printed beside).

## Sets

| Part | Sets | Inputs | When |
| --- | --- | --- | --- |
| 1 | epochs 2026-03-01 to 2026-05-23 | CPF only (the archive holds CPF files for CryoSat-2, Sentinel-6A, Starlette and Swarm A in this period; Swarm A has no truth family here) | once, after this plan and the amendment named under Checks are merged |
| 2 | epochs 2026-11-11 to 2026-12-22 (the sets of A3's part 2) | CPF, ultra-rapid, rapid, where a product out by t0 is in the archive on the run day | once, on 2027-01-12 |
| H | the provider's XP capture of 2026-11-10 | as part 2, out by the capture time | once, on 2027-01-12 |

Per satellite (parts 1 and 2): the first set in the part, then each next set at least 3 days after the last one taken. A set counts when
truth covers at least 90 % of the first day after its epoch. A set's history may reach 21 days before the part.

**Part H.** The capture time is `started_utc` in the capture folder's `run.json`; nothing else in that folder is read until part H runs.
For each satellite with truth and a type-4 XP set in the capture: the XP set flown through `propagator/sgp4-xp`; the public set current at
the capture time (the newest first-published set created at or before it, at most 3 days old) flown on SGP4; the four records above,
built for that public set with inputs out by the capture time; and `XPsame`, the XP theory fitted by the XP module's own `fit` to the
same input states the served record was fitted to (where it used an input). All are scored on days +1 to +10 after the capture time,
where truth exists. Statistics only: nothing is fitted to the provider's sets, and no element value is printed or written.

## Truth

The families of ap-from-public-sets, every satellite with states in them: ESA final orbits (navigation satellites), Copernicus precise
orbits (Sentinel-1), IDS DORIS orbits (altimetry satellites), ILRS combined orbits (LAGEOS, Etalon), NSGF orbits (laser spheres),
ESA precise orbits (Swarm), UCAR near-real-time orbits (COSMIC-2). States are read through the truth gate; its jump screen is applied to
each series and a state inconsistent with both neighbours is dropped and counted. Truth is used at its own epochs, thinned to 300 s;
nothing is interpolated. A full day holds the truth's step times the smallest whole number reaching 300 s (A1 of ap-from-public-sets).

## Scoring

The error of a flight is the 3D position difference from truth. Per set and record: the root mean square over each day from t0 (days 1
to 7; part H: days 1 to 10 from the capture time) and over the first 72 hours, the primary measure. A day counts with at least 90 % of
the states its grid holds; the 72 h figure needs all of days 1 to 3.

## Statistic and verdict

Classes by the current set: `LOW_LEO` (perigee under 500 km), `MID_LEO` (500 to 750 km), `HIGH_LEO` (750 to 2,000 km), `MEO`, `GEO`
(semi-major axis 38,000 to 46,000 km), `HEO` (eccentricity 0.15 or more). In the development data `GEO` is navigation satellites in
inclined geosynchronous orbits (QZSS, BeiDou IGSO), not the geostationary belt, and `HEO` is Galileo 5 and 6.

**The unit is the satellite.** For a comparison (a record against another, paired by set): each satellite's median of ln(ratio) over its
sets; the class's figure is the median of those satellite medians; its interval is the order-statistic interval for that median, the
narrowest [x(k), x(n+1-k)] whose coverage 1 - 2 P(Bin(n, 1/2) <= k - 1) is at least 95 % (it exists from 6 satellites on).
- **BEATS**: the whole interval below 1. **LOSES**: above 1. **TIE**: it spans 1.
- **FEW**: under 6 satellites or under 30 sets (part H: under 6 satellites). No verdict, no statement.
- Secondary, printed beside and deciding nothing: the bootstrap of ap-from-public-sets (pooled median of sets, satellites resampled,
  2,000 resamples, seed 20261110).
- The tail, against the set (A3, item 3): `T95` (95th percentile of the record's errors over the 95th percentile of the set's), `Trms`
  (square root of the sum of squares over the set's), `Tmean`, the share of sets with the record's error more than twice the set's, the
  largest ratio, with intervals from resampling satellites.

Reported for each class and part: served, public, earlier and earlier unguarded against the set (verdict and tail); served and public
against the earlier construction; the days 1 to 7; the arms served; every truth source.

## Decision rule for the catalog

Nothing is served from part 1 alone. Between the earlier construction and the set, ap-from-public-sets' part 2 decides (A3 and any
later amendment of it, merged before 2026-11-11); this plan decides only whether a class moves from there to the new construction. A
class that holds speaks for satellites of the kinds tested. Both parts decide on the **public record** (the chain without P13, U2 and
R3), the record an object with nothing but public sets gets.

**Part 1 names the candidate, per class:**
- the **new construction** where the public record BEATS the set, its interval against the earlier construction lies **wholly below
  1**, and it meets A3's three tail thresholds against the set (`T95` at most 1.00, `Trms` at most 1.00, at most 1.0 % of sets beyond
  twice the set's error);
- otherwise, printed for reference, the **earlier construction** where its record BEATS the set and meets the same thresholds, else
  the **set** on SGP4.

A class whose interval against the earlier construction spans 1, or has none, is not a candidate ("not shown better").

**Part 2** (computed by `table.mjs`, which reads part 1's table): for each class part 1 named for the new construction, the rule
**holds** when, in part 2, the public record's interval against the earlier construction ends below **1.05**, its interval against
the set ends below **0.95** (the smallest effect worth serving, shared with amendment A4 of ap-from-public-sets, which gives the
reason: an AP record costs every user 1.4 to 2.6 times SGP4's computation), and it **meets the three tail thresholds**, on at least 6
satellites and 30 sets; it **fails** otherwise; with fewer satellites or sets the class is **untested**, not holding. Classes part 1
did not name are "not applicable". A class that holds is served the new construction, for objects of the kinds tested as A4 (item 4)
defines them; any other class stays with what ap-from-public-sets' part 2 decides. Part 2 holds only if, in addition, the public
record's figure from the set's creation time (A4 item 5) reads BEATS against the set (review 0, C6-10), so the new record is never
served on weaker terms than the record it replaces; the code for it (that figure, the condition in `part2Holds`, and a check case that
returns "fails" when that figure reads TIE) comes with the dated screen amendment, before any registered part starts.

**Orbit-product records** (P13, U2, R3: the served record): reported in every part against the set and the earlier construction, with
the same rule's reading printed beside; this registration decides nothing about serving them.

**Part H**, per class with at least 6 satellites: the hypothesis is served / XP below 1; BEATS, LOSES or TIE by the order-statistic
interval over satellites; under 6 satellites FEW and no statement. Primary: the served record, 72 h from the capture time. Registered
secondaries: the public record against XP, the set against XP, and the served record against `XPsame` (what AP adds over the provider's
own theory on the same input).

**Operating characteristics of the rule**, simulated on the public record from period B's satellites and sets (the world of the
review's power simulation: satellites drawn with replacement, sets resampled to the part's length, the public record's error scaled so
the population's satellite-median ratio to the earlier construction, A3's guarded record, is rho; the committed code applied; 600
parts per line):

| Class (period B: satellites) | Part 1, P(candidate) at rho 1.00 | at 0.95 | at 0.90 | at 0.80 | P(interval of public / earlier wholly below 1) at 0.90 | misses of 1 at rho 1.00 | Part 2, P(holds) at rho 0.90 | at 1.00 | at 1.05 |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| MID_LEO (10) | 0.00 | 0.20 | 0.25 | 0.24 | 0.95 | 0.02 | 0.30 | 0.25 | 0.00 |
| HIGH_LEO (14) | 0.00 | 0.01 | 0.03 | 0.05 | 0.97 | 0.03 | 0.03 | 0.00 | 0.00 |
| MEO (107) | 0.01 | 0.11 | 0.53 | 0.81 | 1.00 | 0.05 | 0.54 | 0.01 | 0.00 |
| GEO (8) | 0.00 | 0.00 | 0.01 | 0.75 | 0.02 | 0.03 | 0.04 | 0.00 | 0.00 |

LOW_LEO (1 satellite) and HEO (2) receive no verdict. The interval against the earlier construction separates 0.9 from 1.0 in MID_LEO,
HIGH_LEO and MEO; the candidate and part 2 are rarer than that because the public record must also beat the set and pass A3's tail
thresholds, which in HIGH_LEO it rarely does in period B. **What A3's standard costs, said plainly:** a real 10 % gain at MEO is
confirmed by part 2 in about half of simulated parts in period B's world (0.54) and a third in period A's (0.32; the review's run of
period A, with the unguarded earlier record and A3's BEATS, 0.11), because the public record's tail sits on the threshold; with the
margin alone it would be confirmed in every part (1.00). A part 2 class that holds at a true 1.00 (MID_LEO 0.25) is the margin's
intent: no worse than the earlier construction by 5 %, at least 5 % better than the set, and within A3's tail. (The review's
`c6-power.mjs` world, with the committed `table.mjs` and `lib/stats.mjs` imported, not re-implemented.)

## What is fixed before the run

A registered part (1, 2, H) refuses to start unless all of these hold, and each refusal is tripped on purpose by `run.mjs --check`:
1. **Run once.** The part's store folder holds no start record, rows or manifest; the start record is written before anything is read,
   and rows and manifests are written only if absent.
2. **The code.** No tracked file of the repository differs from its commit, and every file the run executes (this experiment's, the
   earlier study's `lib.mjs`, the five-day pipeline's libraries, the truth reader, the truth gate, the readers' framing, the standards'
   bindings, the SDK) has the SHA-256 that `registration.json` names, checked as each file loads; `config.json` and this plan too.
3. **The truth gate's ledger** (`experiments/truth-gate/flags.json`) has the SHA-256 in `config.json`.
4. **The archive.** Every archive file the part reads (truth, public sets, inputs, Earth orientation, identities, the weather builder's
   sources) is listed in its archive manifest (`archive-manifest-part<N>.json`) with its byte count, or the read is refused before the
   file is opened. Part 1's manifest is committed with this plan; part 2's and part H's are committed on their run day, before the run.
5. **The run day.** Parts 2 and H run on 2027-01-12 and no other day; truth is what the archive holds then.
6. **Part 2's verdict** is computed by `table.mjs`, from part 1's committed table.
7. **What existed.** Every public set read must have been created by the part's cutoff, snapshots included.

## What this cannot show

- The decision is on the public record. The orbit-product inputs, the source of the rounds' largest gains, are reported in parts 2 and
  H as far as their products are collected by the run day; this registration does not decide whether to serve them.
- The CPF arm's record is fitted over the 72 h it is scored on: it measures the prediction centre's forecast as AP carries it, not a
  forecast by AP. In period B one satellite's CPF files move `MID_LEO` from 0.48 (public sets) to 0.40 (served) on the earlier plan's bootstrap; on the
  registered statistic both read 0.57, since the unit is the satellite.
- Part 1's months were in AP's own development data (see above); only part 2 is unseen by the propagator.
- The rounds chose twelve changes on periods A and B; this confirmation exists to see how much of that holds on sets unseen by the construction. On the
  rounds whose rows survived, the development gains replayed out of sample were 0.3 to 3.2 % smaller than in sample (review 0, C4-5);
  the six rounds whose rows were deleted are rerun from their variant files after this plan is merged, and that rerun changes nothing
  registered here.
- Truth exists for about 150 satellites, all well-tracked payloads; debris and rocket bodies are not tested. GEO here is navigation
  satellites in inclined geosynchronous orbits; there is no open truth for commercial GEO. LOW_LEO and HEO have one or two satellites and
  receive no verdict.
- Part H has one set per satellite from one capture; only classes with 6 satellites or more get a statement, and satellites of one capture
  day are not independent draws. The provider's sets were fitted to data the provider had at the capture time and may carry information
  from after their epochs; all records are scored from the capture time.
- The weather table's look-ahead was removed (A3); measured on period B before removal, it moved no class ratio by more than 0.004.

## What is published

`results/ap-catalog-construction/part<N>/table.json` and `README.md` for parts 1 and 2, generated by `table.mjs`: aggregates only.
Per-set rows, start records and manifests stay in the store (`/opt/data/sdn-archive/ap-catalog-construction`). No element set and no
per-set or per-satellite row is committed. Part H's tables, and the dry run dev-H's, stay in the local store and are published only on
the owner's word ([stack issue 288](https://github.com/DigitalArsenal/spacedatanetwork-stack/issues/288)). The development rounds' log,
scoreboard and construction are published as exploratory results in `results/ap-catalog-construction/rounds/`, at class and family
level, without head-to-head tables.

## Checks

- `node experiments/ap-catalog-construction/run.mjs --check`: made-up sets through the real module end to end, for three classes (each
  served and public record follows the made-up set's own SGP4 flight within 2 km over 72 h; the history arms see copies of the set at its
  own epoch, since a made-up history needs orbit mathematics this repository does not do); the maneuver cut on a made-up jump; a part
  that lists only CPF leaves a made-up ultra-rapid file closed, which a part that lists it opens; a made-up CPF file named outside the
  window is never opened; a made-up snapshot row created after the cutoff is not read, and of two revisions of a set the first created
  is the set; the guards of "What is fixed before the run" tripped one by one; and, end to end, made-up rows in a scratch store run
  through the real `table.mjs`, with the assertions made on the `table.json` it writes: the statistic and its order-statistic
  interval on 8 and on 6 satellites, FEW with no ratio on 5, part 1's candidate in five cases (new construction; a tail over T95; an
  interval against the earlier construction that spans 1; TIE against the set; FEW), and part 2's rule in six (holds; an upper end
  against the earlier construction of 1.07; a tail over T95; an interval against the set ending at 0.97; a TIE against the set with
  the margin and the tail within; 4 satellites, untested). It needs the module at the registered bytes and the weather archive; without
  them it says SKIPPED and fails.
- **A known exception to the project's end-to-end-only rule.** Eight of the nine guard cases call the runner's own guard functions
  with made-up inputs instead of starting the runner, because starting a registered part to watch a guard refuse could start the part.
  The ninth (an edited file) goes through the real load hook. The dated amendment that fixes the truth screen (C6-9) replaces them
  with end-to-end cases on a made-up part that exists only for the check, and proves that none of that part's freedoms is open to
  parts 1, 2 or H; no registered part, part 1 included, starts before that amendment is merged.
- `node experiments/ap-catalog-construction/table.mjs --part <N> --check`: the written table equals the table rebuilt from the rows.
