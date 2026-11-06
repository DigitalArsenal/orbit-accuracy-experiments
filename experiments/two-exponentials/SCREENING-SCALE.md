# Screening scale: how screening work grows with the number of objects (registration)

Task experiments-screening-scale-20261106. Report-only. Registered before any row is computed; the runner `screening-scale.mjs` refuses to fly on a dirty or uncommitted registration. Outputs are under `results/two-exponentials/screening-scale/`.

## Question

If the screen is run all-vs-all at one threshold over one horizon, how do its CPU time and its event count grow with the number of objects N (log-log slope p), how much of that CPU is propagation, and what does one eighth of the compute buy in years of catalog growth?

## The screen (one screen, no tuning)

- Module: `analysis/conjunction-assessment` 0.17.0, `dist/isomorphic/module.wasm`, SHA-256 `a077c6929cd1eb979eb3c39dbe158198f6c94f90a5ad7494345e51596699148f` (the same bytes in the -bench2 and -r2 modules roots; read from `/Users/tj/software/private/coordinator-d9/space-data-network-modules-r2`, commit `2df8f50ce`, read-only: nothing is installed or written there). The runner refuses any other hash.
- Host files imported from that root, pinned by SHA-256 (the runner refuses a difference): `gpu/catalogScreen.mjs` `259ec467...`, `gpu/continuousScreen.mjs` `e191d9f3...`, `gpu/allVsAll.mjs` `fd7fc206...`, `gpu/scrFrames.mjs` `6181c730...`, `tests/lib/conjunctionCommandHarness.mjs` `c96a13d4...`, `tests/lib/cqr.mjs` `df0e9683...`, `scripts/lib/ommCatalog.mjs` `2a11f493...`, `plugin-manifest.json` `2833c53f...` (full digests are in the runner).
- Path: CPU, no GPU (no WebGPU is available without a new install; the GPU path is not used). The module runs in Node v25.4.0 through the SDK browser harness (`runtimeKind: 'browser'`, module threads on), as `scripts/incremental-screen.mjs` runs it.
- Controls: threshold 5 km; horizon 7 days from 00:00 UTC of the window start S, as 28 consecutive 6-hour windows; coarse step 60 s; the module's default refinement and combined hard-body radius; `ALFANO_MAXIMUM`; evaluation frame TEME; 8 module threads. The step is 60 s.
- Sources: every object is an SGP4 source from its GP element set (`sgp4Sources`).
- Phased path (the one that is timed): per window, `coarse_grid` (propagation of every object on the coarse grid), then `search_grid` (candidate search), then `refine_candidates` on an index of the objects the candidates name (the path of `gpu/continuousScreen.mjs`). Events are merged across window edges with `mergeWindowEvents`, as `scripts/incremental-screen.mjs` does.
- Parity guard: the smallest thinned case (fraction 1/8, seed 1) is also run through the fused path (`screenCatalog`, `search_candidates`); its event set must equal the phased path's (same count and same event-set digest), or every row of the phased path is reported as unconfirmed.

## Phases timed and how

Per invocation of the module, the process CPU counter (`process.cpuUsage()`, user plus system, which includes every module thread of the process) is read before and after, and wall time beside it. Phases by method: propagation = `coarse_grid`; candidate search = `search_grid`; refine = `refine_candidates`; index = `prepare_screening_index` and `destroy_screening_index` (the full index once, a refine index per window). Host glue is the screen's total process CPU (from the moment the sources are built to the end of the last window) minus the four. The fitted quantity is the screen total (phases + index + host glue); catalog load, source decoding and module start are reported beside and are outside the total. Propagation share = propagation CPU divided by the screen total, per case. The grid bytes `coarse_grid` returns are part of its CPU (stated: propagation here includes producing the grid). Wall time is stored beside every CPU figure and is never fitted: the box carries other load.

## Populations (archive only; no network)

N is stored in `counts.jsonl`, which the site never reads. `rows.jsonl` and `chart.json` carry N only as an index, the current catalog = 1.

(a) Real catalogs at past dates. Seven dates 2022-12-21, 2023-06-21, 2023-12-21, 2024-06-21, 2024-12-21, 2025-06-21, 2025-12-21, plus the current catalog. For a date D the window start is S = D 00:00 UTC; the catalog is every object's newest element set among the sets created on the 30 days before S (`/opt/data/sdn-archive/spacetrack/gp_history/by-creation/<year>/<day>.json.gz`, creation days S-30 to S-1) whose EPOCH is in [S-30 d, S), whose DECAY_DATE is empty, whose MEAN_ELEMENT_THEORY is SGP4 and which encodes to an `$OMM`. The current catalog is the snapshot `/opt/data/sdn-archive/spacetrack/gp/2026/2026-11-05.json.gz` (SHA-256 `b63176497acc503080a5243980319e577f3387de6b318426a1766ff6359aa1c1`) with the same filters and S = 2026-11-06 00:00 UTC. The elements are never back-dated.

(b) The current catalog randomly thinned. Seeded rank by SHA-256 of `screening-scale-20261106:<seed>:<NORAD_CAT_ID>`; the first round(f N) objects. Fractions 1/8, 1/4, 1/2 with seeds 1, 2, 3 (nine runs) and fraction 1 (the current catalog). The full catalog is run three times (repeats r1, r2, r3); its CPU for the fits is the median of the three, and the spread of the three is reported as the run-to-run noise.

Every case is one run, started once, in a fresh child process. Cases are ordered by the SHA-256 of their identifier. Up to 2 children run at once when the guards allow; the number running at each start is stored in its row.

## Which theory flies which set

- SGP4 flies the whole catalog of every case above (the module's own SGP4 on the GP sets). It is the only theory the screen flies in this study.
- SGP4-XP (the XP sets), AP and FFM: the study computes each theory's covered share of the current catalog (XP: distinct objects in the archive's supplemental-GP collections at the snapshot's date; AP and FFM: distinct objects with fitted states in the mixed-screening store, `/opt/data/sdn-archive/sdn-ap-mixed-screening/rows`) and reports it. A theory whose covered share is below one half of the catalog is reported as not flown, with its covered share; nothing is extrapolated from it. No integration of those states into this screen is built in this study; the propagation share is therefore a figure for SGP4. The share is stated plainly, with the bound it implies: if propagation takes a share s of the screen CPU, a propagator of zero cost cuts the screen CPU at most to 1 - s, a speedup of at most 1 / (1 - s).

## Fits

For each of two series, ordinary least squares of ln(CPU total) on ln(N index) and of ln(events) on ln(N index): (i) the thinning ladder (ten points: three seeds at each of three fractions, and the full catalog); (ii) the real dates (eight points: seven past dates and the current catalog). The ladder fit is the primary one and the conversion is computed from it; the dates fit is stated separately, and where the two 95 percent intervals do not overlap that is said. Interval: slope plus or minus t(0.975, n - 2) times its standard error. Per-phase slopes (propagation, search, refine) are reported for the ladder.

Pass chance, sized per fit by simulation (2000 trials, fixed seed, the fit's own N index values, residual standard deviation of the fit): y = a + p0 x + e for a true p0 = 1 and a true p0 = 2. Each trial makes the same three-way call as below. The table reports, per fit and quantity: P(call "p = 1" | true 1), P(call "p = 2" | true 1), P(call "p = 2" | true 2), P(call "p = 1" | true 2); the remaining probability is "undecided".

## Three-way rule (per fit and quantity)

- p = 1 (linear in N): the interval contains 1 and excludes 2, and P(call "p = 1" | true 1) >= 0.80 and P(call "p = 1" | true 2) <= 0.10.
- p = 2 (quadratic in N): the interval contains 2 and excludes 1, and P(call "p = 2" | true 2) >= 0.80 and P(call "p = 2" | true 1) <= 0.10.
- undecided: anything else, including an estimate between 1 and 2 or outside both. The estimate and its interval are stated in every case. No verdict is stated for an undecided cell.

## The conversion (computed only after p)

If screening work grows as N^p, one eighth of the compute lets N grow by 8^(1/p): log2(8) / p = 3 / p doublings of the object count (3 at p = 1, 1.5 at p = 2). Years = (3 / p) times a doubling time of the object count, from the landed catalog-growth study (`CATALOG-GROWTH.md`, `results/two-exponentials/catalog-growth/table.json`): the payload doubling time 3.8 years (2018-2026, verdict exponential, growth), and the all-objects fit 9.6 years (2018-2026, verdict undecided; the sentence labels it so). The sentence uses the ladder p, and p at both ends of its interval; the dates p is stated beside it. The conversion is reported whatever the verdict on p, labeled with that verdict.

## Load, memory and disk guards

Before each run (and before each start when two run at once): the 1-minute load average below the core count (28), free memory above 16 GiB (free plus inactive plus speculative pages from `vm_stat`), and at least 25 GiB free on the volume holding the scratch directory. When a guard fails the runner polls every 60 s and does not start. At most 4 screen processes at once (the registered default is 2). A start is also withheld while any process of the DSST study or the archive importer is above its share: the load guard is the registered proxy for that, and a run is not started if the 1-minute load average exceeds the core count. The load average at start and end of each run is stored in its row.

## Disclosures

- Pre-registration smoke test (not a row, not read for any figure): the runner's phased path was run once on a fixed 200-object subset of the current snapshot with 2 module threads to prove the plumbing; no timing from it is kept.
- B1's catalog-growth rows and table were read before this registration (the doubling times used by the conversion); no screening row was read.
- The hardware and the other load are not controlled. CPU time depends on the machine; the study reports the exponent and the shares, which do not.

## Outputs

- `rows.jsonl`: one row per case, N as an index only; phases in CPU seconds and wall seconds; events and candidates per case; load at start and end; the build hash.
- `counts.jsonl`: the raw object counts, events, candidates and excluded objects per case, and the theory coverage; the site never reads this file.
- `table.json`, `README.md`: the tables, both fits with intervals and pass chances, propagation share per theory, the conversion sentence, the verdict.
- `chart.json`: for Phase C, the N index, CPU per phase normalized to the current catalog = 1, events normalized, p and its intervals; no raw count.
- `--check`: registration before the first row; the table reproducing byte for byte; p with intervals for both fits; events per N; propagation share per theory; the conversion sentence; the verdict; the parity guard.

## Amendment 1 (2026-11-06, before any row; coordinator request)

SGP4 flies the whole population because the GP element sets exist for every object of every case; no other theory has states for the whole catalog. The propagation share measured here is therefore SGP4 propagation inside this module. The sentence about what a cheaper propagator buys is about replacing SGP4-class propagation cost only. It says nothing about AP unless AP flies a covered share of the population, and the study reports AP only by its covered share.
