# CA-SOCRATES: does our screen find every SOCRATES event, GP on GP?

Owner, 2026-10-29: "we also need to check and make sure we are seeing the same
responses as Celestrak for GP on GP and that we're not missing any."

Task `experiments-ca-socrates-gp-parity-20261029`. Numbers for the code are in
[config.json](config.json); this plan and that file are frozen by the commit
that adds them, before the screen reads the registered window or the
comparison reads SOCRATES's events.

## Question

CelesTrak's SOCRATES Plus screens active payloads against the public GP
catalog with SGP4 in STK/CAT. Our production conjunction screen is
`screen_catalog` in `analysis/conjunction-assessment`, SGP4 on GP. Both run on
the same GP editions over the same window with the same 5 km threshold. Does
ours report the same events (pair, TCA, minimum range, relative speed) and
miss none?

This is a full-report recall and geometry test. It is not the earlier top-300
pair replay (`docs/socrates-replay-2026-10-02.md` in the module).

## The SOCRATES run

| Item | Value |
| --- | --- |
| Report | `https://celestrak.org/SOCRATES/sort-minRange.csv`, the full list: 193,952 rows, SHA-256 `054a6540…0e065` |
| Published | `Last-Modified: Thu, 29 Oct 2026 08:04:08 GMT`; fetched 2026-10-29T21:09:17Z |
| Window | 2026-10-28T17:00:00Z + 7 days |
| Methodology | `https://celestrak.org/SOCRATES/`, SHA-256 `a03abef3…6bce4` |
| Ops status | CelesTrak SATCAT `https://celestrak.org/pub/satcat.csv`, fetched 2026-10-29T21:16:38Z, SHA-256 `8abf66b2…2fd58` |

The CSV does not state the run's computation start. It is taken from the
report itself: TCAs run from 2026-10-28 17:00:08.230 to 2026-11-04 16:59:51.001
UTC, so the window is 2026-10-28T17:00:00Z plus 7 days.

CelesTrak's page states the screened population. It is all active payloads
against every object with public GP data, analyst objects 8xxxx and 27xxxx
included, over 7 days, within 5 km, SGP4 in STK 12.2 CAT. Two exclusions apply:

- Operational members of one constellation are not screened against each
  other.
- Docked objects (ISS, CSS, MEV) are grouped as one constellation.

The report agrees with that statement:

- Object 1 of every row is a payload CelesTrak lists as active: 15,442
  distinct primaries, all `PAY` with status `+PBSX`.
- No row pairs two operational (`[+]`) STARLINK, ONEWEB, KUIPER, QIANFAN,
  HULIANWANG DIGUI or IRIDIUM satellites when both are numbered below 100000.
- STARLINK `[+]`/`[+]` rows occur only when one object is numbered 100000 or
  above: 56,355 rows.

Every fetch followed `CELESTRAK_FETCH_POLICY.md` through its shared
`FetchPolicy` helper: serial, at least 2.5 s apart, ledger-checked
(`/opt/data/sdn-archive/celestrak/.celestrak-fetch-ledger`), over the local Tor
SOCKS proxy (owner 2026-10-10). Three requests in all:
[fetch-celestrak.mjs](fetch-celestrak.mjs). No `data.php` request was needed
(next section). The bytes stay in `/opt/data/sdn-archive/ca-socrates-gp-parity/raw/`;
CelesTrak grants no licence to reproduce them (`data/licenses.json`, `celestrak`).

## GP inputs: SOCRATES's editions

**Source.** The catalog is Space-Track's current `gp` snapshot in the archive,
`spacetrack/gp/2026/2026-10-28.json.gz`, retrieved 2026-10-28T17:10:09Z, ten
minutes after the window start:

- 32,815 element sets.
- SHA-256 `36730df1…8ac8` (gzip) and `4b44036e…7e5b` (JSON).

**Check.** Each object's edition is checked through SOCRATES's
days-since-epoch columns. An edition matches when, for every row naming the
object, TCA minus the catalog epoch equals the row's DSE within 0.0005 d.
That is the rounding of three decimals, plus 2e-8 d for the TCA's millisecond
text.

**The raw snapshot matches 24,389 of the 24,391 objects in the report.** The
2 that differ are editions created after CelesTrak's cut:

| NORAD | Name | Snapshot edition (created 2026-10-28T16:46:20Z) | Edition SOCRATES used (TCA − DSE), found in gp_history |
| --- | --- | --- | --- |
| 60182 | ALOS-4 | epoch 2026-10-28T14:21:17.733, GP_ID 354994251 | epoch 2026-10-27T20:29:59.214, GP_ID 354950601, created 2026-10-28T02:17:28 |
| 64393 | ZHANGHENG 1-02 | epoch 2026-10-28T14:26:26.633, GP_ID 354994249 | epoch 2026-10-27T21:04:24.270, GP_ID 354953411, created 2026-10-28T02:17:28 |

**The cut is bracketed by the report.**

- 2026-10-28T16:06:35Z is the latest creation time of an edition SOCRATES
  verifiably used.
- 16:46:20Z is the earliest it verifiably did not use.

The catalog takes, for every object, the latest edition created at or before
**2026-10-28T16:06:35Z**. Four snapshot records were created after that time.
Each is replaced by its previous edition from
`spacetrack/gp_history/by-creation/2026/2026-10-28T014700Z--2026-10-28T030200Z.json.gz`
(SHA-256 `99b51ba8…a7b6`), selected by GP_ID:

- 60182 → 354950601.
- 64393 → 354953411.
- 41882 FENGYUN 4A (created 16:16:29) → 354940158.
- 64062 CHINASAT 3B (created 16:26:40) → 354953253.

The last two are not in the report, so their editions are unverifiable either
way; the cut rule decides them.

**The resulting catalog matches all 24,391 report objects** (0 mismatched, 0
absent):

- 32,815 objects.
- `$OMM` stream (uint32 LE length-prefixed, as the screen receives it)
  SHA-256 `2842351b…0d4d`.

The edition-mismatch class is therefore empty, and none of the 300 `data.php`
adjudications is used. The comparison still checks each matched event's
module-reported days since epoch against SOCRATES's.

## Population and window

- **Window.** 2026-10-28T17:00:00Z (JD 2461342.2083333335), 604,800 s.
- **Threshold.** 5 km.
- **Our pairs.** Every pair with at least one active primary, each screened
  exactly once, over two registered parts (next section). The comparison then
  applies SOCRATES's population to explain our extra events.
- **Primaries.** Active payloads (`PAY` with status `+`, `P`, `B`, `S` or `X`)
  present in the catalog, 16,818 in all. Status comes from the report's
  bracket for an object it lists, otherwise from the SATCAT, which was fetched
  a day after the run. Four objects the report marks `[-]` are now `+` in the
  SATCAT; the report's marker wins.
- **Classes.**
  - Primary class: both objects numbered below 100000 and both editions
    matched (GP on GP).
  - Edition-mismatch class: empty (previous section).
  - An object numbered 100000 or above: reported separately.
- **Bands.** SOCRATES range below 1 km, and 1–5 km.

## The screen

**Module, pinned by commit, not by the working tree:**

- `space-data-network-modules` `44ce9d27a1214c8a4740b5f30d831b0e6a7248f0`,
  `analysis/conjunction-assessment` 0.9.0.
- `dist/isomorphic/module.wasm` is read with `git show` at that commit and
  must have SHA-256 `15e7e8df0225ebf0fa5d6cbe22fdebe612b022bfcae1631594924e3239b090bd`.
- The host helpers it loads from `tests/lib` (`cqr.mjs`,
  `conjunctionCommandHarness.mjs`, `wasmedgeWasiThreadsRunner.mjs`) must equal
  their content at that commit.
- Packages: space-data-module-sdk 0.9.12, spacedatastandards.org 1.271.0,
  flatbuffers 25.9.23, flatc-wasm 26.1.38.

The module's lane is committing 0.10.0, a fix for sampled sources. Its lane
must show the catalog screener byte-identical (coordinator, 2026-10-29), so
this result carries over to 0.10.0.

**Production settings** (the console's): 60 s coarse step, 1 ms refinement
tolerance, `ALFANO_MAXIMUM`, 10 m combined radius, k-d tree, dynamic window
and perigee filter on, TEME evaluation frame. SOCRATES's 5 km threshold
applies.

**Order.** Each call carries the whole catalog as `catalog` frames. The
ordered catalog indices list every eligible primary in rank order (below),
then every other object. Block b's primaries are order positions [p0, p1),
and its secondaries are positions [p0, N). Across both parts, each pair with
an active primary is therefore screened exactly once.

**Budget.** Full-catalog probes were run on this machine on 2026-10-29, in
the week after the registered window. SGP4 is analytic (no integrator step),
with a 60 s coarse step and 1 ms refinement tolerance:

| Run | Load (1 min) | Result |
| --- | --- | --- |
| All pairs, 32,815 objects (538 M pairs), one 900 s call, 8 threads | about 38 | 34.3 s: 4.18 M candidates refined, 1,754 events |
| 300 primaries × catalog, one 6 h call, 8 threads | | 18.1 s |
| Six such block calls on 6 processes × 4 threads | about 35 | about 36 s each |

From those probes:

- The whole catalog over 7 days needs about 37 thread-hours all-pairs.
- All 16,818 active primaries in 300-primary blocks would take about 157
  minutes.

Both exceed the 90-minute budget, so the population is screened in two
registered parts. The owner asked that we miss none, so the verdict covers
both parts together.

The 16,818 eligible active payloads are ranked by ascending SHA-256 hex of
`ca-socrates-gp-parity-20261029:<NORAD_CAT_ID>`. The ranked list's SHA-256 is
`b5d7c9e9…a096`.

- **Part 1.** Ranks 0–5,999: 6,000 primaries, list SHA-256 `597ae128…f2b6`.
  - 20 blocks of 300 × 28 slices of 6 h = 560 calls, on 7 processes × 4
    module threads, about 55 minutes.
  - Reference: the SOCRATES rows with a Part 1 member, 103,040 in all.
    Primary class 65,138 (3,035 below 1 km, 62,103 from 1 to 5 km); an object
    numbered 100000 or above, 37,902.
  - Reported first. Alone, it is a subset.
- **Part 2.** Ranks 6,000–16,817: the remaining 10,818 primaries, list SHA-256
  `d3d2c866…1323`.
  - Same rules, settings and schedule shape: 37 blocks × 28 slices = 1,036
    calls, run straight after Part 1.
  - Its blocks screen fewer secondaries (order positions from p0 on), so
    calls are cheaper: about 60–70 minutes.

**Parts 1 and 2 together are the whole SOCRATES population: all 16,818 active
primaries.** The SOCRATES rows they cover are all 193,952. Thirty-one of
those lie within 60 s of a window end and are counted apart (next section),
which leaves:

- the primary class: 126,077 (5,395 below 1 km, 120,682 from 1 to 5 km);
- an object numbered 100000 or above: 67,844.

If Part 2 cannot finish (for example, a machine failure), Part 1 is reported
alone and labeled as a subset.

**Calls and merging.**

- Consecutive 6 h calls abut on the 60 s grid. Each minimum belongs to the
  call that holds its TCA.
- Screen events of one pair within 1 s of each other are one encounter.
- A call that fails, for example a WebAssembly trap (which loses the
  instance), is recorded as a finding. A new instance then screens the same
  span as two consecutive calls of half its length, down to 900 s.

The run writes `runs/ca-socrates-gp-parity/<run-id>/`: the subset, every
call's answer, the events and a manifest. Element sets and per-event tables
stay there and are not committed.

## Matching and the report

**Matching.** A SOCRATES row and a screen event match when they have the same
unordered NORAD pair and TCAs within 60 s. Matching is one to one, nearest
first. Distinct encounters of a fast pair are about half an orbit apart.

**Edge rule, applied to both sides.** A SOCRATES row whose TCA lies within
60 s of either end of the window is counted apart. It never enters a recall
denominator, and the report says how many of these rows the screen found.
The window start is read from the report's TCA span, so this guards against
a difference in start time. Our events get the same rule (rule 1 below).

**Recall.** SOCRATES events found divided by SOCRATES events, per class and
band, over the rows not at a window edge.

**Every miss** is listed with its pair, names, statuses, TCA, range and speed.
The listing also gives:

- the nearest screen event of the pair;
- whether an object was excluded (SGP4 could not propagate it) in that slice;
- the module's own `assess_conjunction` minimum around SOCRATES's TCA
  (±600 s, 5 s coarse step, 1 ms tolerance, 100 km threshold), for at most
  500 misses.

A first diagnosis follows from these:

- an object absent from the catalog or excluded;
- the module puts the minimum beyond 5 km (threshold edge or geometry
  difference);
- the module finds it within 5 km, so the screen missed it (a screen defect).

**Our events SOCRATES lacks** are explained in this order:

1. Window edge: TCA within 60 s of either end.
2. Threshold edge: our miss above 4,995 m.
3. Population, no active payload at run time.
4. Population, intra-fleet: both `[+]`, both numbered below 100000, same name
   prefix. The prefix must be a fleet: at least 30 operational payloads below
   100000 in the SATCAT, and no report row between two of them. The fleets
   are STARLINK, ONEWEB, KUIPER, USA, QIANFAN, HULIANWANG DIGUI, IRIDIUM,
   GEESAT, BEIDOU, GSAT, SHIYAN, NAVSTAR and OBJECT C.
5. Population, docked complex: ISS (…), CSS (…), MEV-1 with INTELSAT 901, or
   MEV-2 with INTELSAT 10-02. A visiting vehicle counts when its speed
   relative to a complex member is below 1 m/s.
6. Edition: SOCRATES used another element set.
7. Unverified: an object never appears in the report.
8. Unexplained: SOCRATES lists the pair at other times, or not at all.

The unexplained and unverified events are listed.

**Geometry.** Matched events give the distributions of |ΔTCA| by stratum
(NLRV at least 50 m/s, LRV 10–50 m/s, VLRV below 10 m/s), |Δmiss| and
|Δspeed|. They are judged against the registered tolerances,
`tests/lib/caParityTolerances.mjs` at the pinned commit (SHA-256 `a87ca94f…5bc9ae`):

| Quantity | Tolerance |
| --- | --- |
| NLRV TCA | ≤ 10 ms |
| LRV and VLRV TCA | recorded, not gated |
| Miss distance | ≤ 5 m (SOCRATES reports range to 1 m) |
| Relative speed | ≤ 5 m/s |

**The tail is reported, not only the verdict.** For each class and stratum
the report gives:

- the median, p99 and maximum of |ΔTCA|, |Δmiss| and |Δspeed|;
- the count beyond each tolerance. TCA beyond 10 ms is counted in every
  stratum and gated in NLRV only.

The worst rows beyond each tolerance are also listed. The 2026-10-02 top-300
replay saw miss differences up to 6.6 m on cataloged pairs, so a tail of a
few meters is expected and must be visible.

The module's days since epoch is compared with SOCRATES's. Maximum
probability is reported beside SOCRATES's as information only, because
SOCRATES's radii are unpublished.

## Pass rule

The verdict covers Parts 1 and 2 together. It requires both conditions:

- Recall = 1.0 over the primary class, both bands, rows at a window edge
  apart.
- Every matched primary-class event within the gated tolerances.

Any miss in any class is a defect, listed with its pair. The class with an
object numbered 100000 or above is reported, not gated.

## Scope

- The console screens with `screen_window` on a resident index, not
  `screen_catalog`. `tests/lib` at the pinned commit has no committed
  `screen_window` driver; the module's own tests call it inline. So this run
  has no `screen_window` arm. The module's README states that the resident
  path gives `screen_catalog`'s events for SGP4 mean elements with
  `ALFANO_MAXIMUM`; that claim is not tested here.
- Pc is not a pass/fail axis.
- Part 1 alone is a 36 % subset of the active primaries. Once Part 2
  completes, the run covers every active primary SOCRATES screens, so the
  result is the whole population and no longer an estimate. Only a Part 1
  reported alone, if Part 2 fails, is labeled as a subset.

## Steps

1. `node experiments/ca-socrates-gp-parity/screen.mjs --part 1`. It refuses
   to start unless this plan and the run sources are committed and on
   origin/main.
2. `node experiments/ca-socrates-gp-parity/compare.mjs --run runs/ca-socrates-gp-parity/<run-id> --parts 1`.
   This is Part 1, reported first, as a subset.
3. `node experiments/ca-socrates-gp-parity/screen.mjs --part 2 --run <run-id>`.
4. `node experiments/ca-socrates-gp-parity/compare.mjs --run … --parts 1,2`.
   This is the whole population and gives the verdict.
5. `node experiments/ca-socrates-gp-parity/report.mjs --run … --tag full`.
   It writes `results/ca-socrates-gp-parity/` (README, metrics, manifest,
   `replay.json`) from the run's metrics. It uses `--tag part1` only if
   Part 2 cannot finish.
6. `node experiments/ca-socrates-gp-parity/verify.mjs` (the E2E). It
   re-derives every registered input hash, rebuilds the catalog stream and
   the ranking, and re-screens Part 1's unit 0 with the pinned module against
   `replay.json`.

`--probe` and `--dev` are development modes. They screen the week after the
window and compare it with a synthetic reference built from the probe's own
events. They are never written to `runs/` or `results/`.

## Amendment A0, 2026-10-29: calls answered `incomplete-screening`

**Reason.** The registered run stopped at Part 1 unit 21 (block 0, the 6 h
slice from 2026-11-02T23:00:00Z). `screen_catalog` answered with status 422,
`incomplete-screening`: "One or more pair evaluations failed; FAILED_PAIRS
reports the incomplete result."

That answer is not a trap. Its final chunk carries the complete result: every
event, the excluded objects, and `STATISTICS.FAILED_PAIRS` (3 in the
2,700 s span from 2026-11-03T04:15:00Z). The module's README describes
exactly this.

The registered failure rule treated every non-zero status as a failed call
and split it. The split recursed down to 2,700 s, could not go further, and
stopped the worker. The 141 units finished before this had no failure and
no failed pair.

**Rule.**

- **Accepted calls.** A call answered with `incomplete-screening` whose
  final chunk is present is a completed call, and its events are kept.
- **Findings.** Its failed pair evaluations (`FAILED_PAIRS`) are recorded
  per unit, summed for each part, and reported. The pairs they name were
  not screened in that call.
- **Misses.** A SOCRATES row the screen misses, in a slice with failed
  pairs, is flagged with that count in its diagnosis.
- **Splitting.** The split rule applies only to calls with no final result.

**Code and data.** The code change is in `worker.mjs` (accept the final 422
result), `screen.mjs` (sum the failed pairs) and `compare.mjs` (flag misses);
nothing else changes. Units completed before this amendment ran `worker.mjs`
at `de66600`, which behaves identically on every call answered with status 0.
Their files are kept, and the run resumes from them.

## Amendment A1, 2026-10-29: Part 3, the console's own screening path

**Reason.** The console does not screen with `screen_catalog`. It screens
with `screen_window` on a resident index of states the engine sampled, and
the owner's question is about our screen. This amendment is registered after
the freeze (`de66600`) and before Part 3 runs. Parts 1 and 2 and their rules
are unchanged.

### How the console screens

spaceaware-ui `88a29fc5`, read-only:

| Step | What the console does | Where |
| --- | --- | --- |
| Settings | 24 h window (0.25–168 h), 15 km threshold, 10 m combined radius | `src/orbital-console/modes/cnj/surface.ts:104-106`, `:500` |
| Controls | 60 s coarse step for a catalog screen (10 s for a pair), 1 ms refinement tolerance | `surface.ts:300-301` |
| Batches | Primaries are the selected objects. Secondaries are the catalog in batches of 512. One index per batch holds every primary and the batch. Events are merged by id (`primary:secondary:tcaIso`). | `surface.ts:349-378`, `:416`; `cqrCodec.ts:312` |
| Sampling | 60 s grid over the window ± 300 s, starting on a whole UTC second | `residentSamples.ts:9`, `:78-79`, `:22-31` |
| Propagator | The states come from `propagatePathStateVectors` of `ctx.propagatorPlugin`, which in SGP4 mode is `"sgp4"` | `residentSamples.ts:45`, `:71`; `engine/propagatorPort.ts:2`; `modeSurfaceHost.svelte.ts:305` |
| Same platform | Association-key pre-filter, then a coincident-state filter on a sample at the window start (1e-6 km, 1e-9 km/s), then a same-platform event filter | `residentSamples.ts:81`, `:88`, `:104`; `samePlatform.ts:6-7`, `:64-112` |
| Index | `prepare_sample_screening_index` with INDEX_CONTENT `SAMPLED_STATES`, REFINEMENT_MODE `EXACT_ONLY` and `PRIMARY_SOURCE_HANDLES`. Each source is one OEM block: TEME, UTC, `HERMITE` degree 3, `STEP_SIZE` 60 s, [x y z vx vy vz] in km and km/s. | `cqrCodec.ts:127-151`, `:153-165`; `analysisWorker.ts:87` |
| Windows | `screen_window` per 30-minute window, each followed by one coarse step of overlap except the last, drained to `FINAL_CHUNK`. Events are merged by id, then `destroy_screening_index`. | `analysisWorker.ts:94-136`, `:152` |

OrbPro's `"sgp4"` plugin is the modules' `propagator/sgp4` artifact
(`browser-shared` build). The references are OrbPro `219aa12c`,
`packages/orbpro-integration/propagator.sgp4/index.js:146-148`.

### Main arm, "console"

- **States.** The states are made with `propagator/sgp4` at the pinned
  modules commit `44ce9d27a`: its `isomorphic` artifact (the same source as
  the console's `browser-shared` build, for a Node host), method
  `propagate_ephemeris` in TEME. Each object is sampled on the console's grid
  over 2026-10-28T17:00:00Z + 7 days ± 300 s at 60 s, 10,092 samples. JS
  only arranges the module's lines into the console's OEM blocks.
- **Index and windows.** Exactly as the console:
  - one sampled index per batch of 512 secondaries plus the block's
    primaries;
  - 30-minute `screen_window` windows with 60 s of overlap;
  - events merged by id, then by the 1 s rule.
- **Same platform.** The coincident-state filter and the same-platform event
  filter are applied. The association-key pre-filter needs the engine's
  catalog records (StandardsLoader association and parent keys), which a GP
  record does not carry, so it is not applied. This is stated in the report.
- **Settings.** Parts 1 and 2's settings: 5 km, 60 s, 1 ms, `ALFANO_MAXIMUM`,
  10 m. The console's default threshold is 15 km; 5 km is SOCRATES's.
- **CA module.** If CA 0.10.0 (the sampled-source fix) is on modules
  origin/main when Part 3 starts, its commit and artifact SHA-256 are pinned
  and registered here before the run. Otherwise 0.9.0 at `44ce9d27a` is used,
  and the result is labeled as the pre-fix console path.
- **Population and span.**
  - Part 1's block 0 (K = 1, its 300 primaries) against order positions
    [300, N) in 64 batches of 512 (Part 1's pair set for block 0), over the
    console's default window of 24 h.
  - The span is the first day of the registered window,
    2026-10-28T17:00:00Z to 2026-10-29T17:00:00Z, sampled over that day
    ± 300 s.
  - The timing probe (the week after the window, block 0, one batch, 2 h,
    load about 50) measured:
    - sampling: 0.3 s;
    - index: 0.2 s;
    - each 30-minute `screen_window`: about 3.2 s on 4 threads. The
      sampled-state screen costs pairs × time.
  - So one block over 7 days would take about 165 minutes on 7 processes,
    beyond the 45-minute budget. Over 24 h it takes about 25 minutes.
- **Sampling details.** `propagate_ephemeris` refuses a whole call when one
  object fails ("SGP4 fails for NORAD n"). The named object is left out and
  the call asked again, as the console skips an object it cannot sample.
  The window-start identity state is the first of two lines, because the
  module needs its stop after its start.

### Spot arm, "descriptions"

- **Method.** `prepare_screening_index` with SOURCE_DESCRIPTIONS and
  EXACT_ONLY: SGP4 mean elements, so the module evaluates SGP4 itself, with
  `PRIMARY_SOURCE_HANDLES`. Then `screen_window` per window and
  `destroy_screening_index`.
- **Origin.** The pattern is `residentWindow` in the module's
  `analysis/conjunction-assessment/tests/screeningWindowUnion.test.mjs:102-110`
  at `44ce9d27a`, read with `git show`.
- **Scope.** Part 1's blocks 0 and 1, each index over order positions [p0, N),
  seven 24 h windows from 17:00Z on the 60 s grid. Same settings and the same
  pinned artifact.

### Both arms

A failed call is recorded as a finding. The index is prepared again on a new
instance, and the span is screened in two halves, down to 900 s. Outputs use
Part 1's run layout, so `compare.mjs --parts 1` reads them.

### Comparisons

1. **Against SOCRATES.** The SOCRATES rows with a member among the arm's
   primaries whose TCA lies inside the arm's span, under exactly Part 1's
   rules (matching, the 60 s edge rule at the span's ends, recall by class
   and band, geometry and its tail). Labeled as a subset.
   `compare.mjs` gains one filter, the reference rows inside the screen's
   window. Every SOCRATES row already lies inside Parts 1 and 2's window, so
   for them the filter changes nothing.
2. **Against Part 1's `screen_catalog` events.** The arm is compared with
   Part 1's events for the same blocks inside the arm's span, so the pair
   sets are equal.
   Encounters are paired by NORAD pair and TCA within 1 s, one to one.
   - **Descriptions** must be identical to Part 1: the same encounters, with
     |ΔTCA| ≤ 1 ms, |Δmiss| ≤ 1 mm and |Δspeed| ≤ 1 mm/s. The module's
     README claims this for SGP4 with `ALFANO_MAXIMUM`; any difference is a
     defect.
   - **Console** is gated on encounter-set equality only. Its states come from
     a different SGP4 implementation than Part 1's built-in, which is under
     arbitration elsewhere (up to about 107 m at high BSTAR). Geometry
     differences are reported by BSTAR band of the pair's larger |BSTAR|:
     below 1e-4, from 1e-4 to 1e-3, and 1e-3 or above. An encounter found by
     one arm only counts as explained in three cases:
     - its miss lies within its band's largest matched |Δmiss| of 5 km, so
       it crosses the threshold by less than the propagators differ;
     - it involves an object the console path could not sample over the
       span (the console skips such an object);
     - it lies within 60 s of the span's ends.

     Each explained encounter is listed. Any other encounter in one arm
     only is a defect.

### Schedule and fallback

Part 3 runs straight after Part 2. If the 01:40Z target slips, Parts 1 and 2
land first and Part 3 lands after them.
