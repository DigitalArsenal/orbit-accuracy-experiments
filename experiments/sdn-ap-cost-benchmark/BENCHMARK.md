# The registered cost benchmark on the current builds

Task experiments-sdn-ap-cost-benchmark-20261105 (parent sdn-ap-case-program-20261105). Registered and pushed before any
measurement; the SDN-AP session reviews it; an objection means a re-run under an amendment appended below. It replaces the
"Rough, not a benchmark" figures of the comparison page, which `experiments/operator-theory/compare-costs.mjs` timed on
operator files. Same arms, same settings (no second arm table); what changes is the discipline: a named machine, a named
step, a registered window set across the regimes of `results/ap-truth/compare/cells.json`, CPU time beside wall time, fit
and flight apart, per object-day, and memory.

## Machine

Mac Studio (Mac15,14), Apple M3 Ultra, 28 cores (20 performance, 8 efficiency), 256 GiB, macOS 26.3.1, Node.js v25.4.0
(arm64). One process at a time; every module is `wasi-sequential` and runs on the process's main thread, so every timed run
is single-threaded. The machine is shared with other lanes: the 1-minute load average is recorded before and after each
phase and each arm, and the figures are read with that beside them.

## The step

300 s. The fit reads the product's states thinned to every 300 s from the first state of the arc; the flight writes a state
every 300 s. No other step appears anywhere in this benchmark.

## Fit arc and flight

The fit arc is the 48 hours ending at the window's cutoff: the states of the precise-orbit product in [cutoff - 48 h,
cutoff], thinned to 300 s (at most 577 states), positions and velocities as the product gives them, GCRF, as one `$OEM`
(USEABLE_START_TIME the first state, USEABLE_STOP_TIME the cutoff). An arc with fewer than 90 % of its 577 states is not
fitted (`coverage`, counted). The flight is the 7 days after the cutoff: 2,016 epochs, cutoff + k x 300 s, k = 1..2016.
A fit holds two object-days; a flight seven: fit per object-day = fit seconds / 2, flight per object-day = flight seconds / 7.

## Window set

Drawn by `windows.mjs` from the explorer's own stores under `/opt/data/sdn-archive/operator-theory/ap/b051` (`regimes`,
`truth2`), read-only, keys only: per group the windows whose stored AP arm ran (AP72, else AP24), outside every hold, ranked
by the SHA-256 of `sdn-ap-cost-benchmark-20261105:<key>`; the first four of each group. 32 windows, 8 regimes of cells.json:

| Group | Regime | Reader | Keys |
| --- | --- | --- | --- |
| LS | Low orbit, laser spheres | `lib/regimes.mjs` STATIC files, `sources.mjs chain` | `LS\|LARETS\|2025-10-25`, `LS\|LARES\|2025-10-30`, `LS\|WESTPAC\|2025-12-04`, `LS\|STELLA\|2025-11-14` |
| DO | Low orbit, altimetry | as LS | `DO\|SENTINEL 3B\|2025-11-29`, `DO\|HAIYANG 2D\|2025-12-09`, `DO\|SENTINEL-6B\|2025-12-09`, `DO\|SWOT\|2025-10-20` |
| GD | Laser geodetic | as LS | `GD\|LARES-2\|2025-11-15`, `GD\|LARES-2\|2025-12-13`, `GD\|LARES-2\|2025-10-18`, `GD\|LAGEOS 1\|2025-11-29` |
| GE | Geostationary | `sources.mjs mgex({ klass: 'geo' })` | `GE\|C006 BDS-2G\|2025-10-10`, `GE\|C229 BDS-3G\|2025-10-04`, `GE\|C217 BDS-3G\|2025-10-12`, `GE\|J003 QZS-2G\|2025-10-10` |
| IG | Inclined geosynchronous | `sources.mjs mgex({ klass: 'igso' })` | `IG\|C005 BDS-2I\|2025-10-06`, `IG\|C220 BDS-3I\|2025-10-08`, `IG\|C009 BDS-2I\|2025-10-08`, `IG\|C005 BDS-2I\|2025-10-08` |
| P | Strong drag, 2026 | `xp-atmosphere-merit/lib/truth.mjs series` | `P\|43477\|2026-04-18`, `P\|39453\|2026-02-02`, `P\|43476\|2026-01-04`, `P\|39452\|2026-01-03` |
| S1 | Near 700 km | as P | `S1\|62261\|2026-03-08`, `S1\|39634\|2026-03-23`, `S1\|62261\|2026-04-01`, `S1\|39634\|2026-02-05` |
| GN | Medium Earth orbit | as P | `GN\|44850\|2026-03-06`, `GN\|43058\|2026-01-03`, `GN\|41019\|2026-01-27`, `GN\|43058\|2026-04-23` |

Every key is a window of cells.json's precise-orbit rows (the same stores). An orbit at or above 8,400 km at the cutoff is
"high" (the harness's rule): FFM flies it without drag, and only FFM20 (below).

Left out, and why: the highly elliptical regimes (TESS, THEMIS, Chandra: their truth comes through the SPK reader and the
kernels module; outside this lane's box), the next-file regimes (centers' and operators' files: a next-file pair is a
reference, not a fit on a precise orbit, and the operator captures are held), and every held set.

## Holds

Never read: Swarm and GRACE-FO truth after 2026-10-31 (every window here ends by 2026-05-01), the six held Galileo
satellites (NORAD 43567, 37847, 41862, 41174, 43055, 41175; none is drawn), every Starlink group, C2's rows, every
operator capture. No score is computed: this benchmark measures cost, never error.

## Builds, by dist hash

Each wasm and its manifest by `git show <commit>:<module>/dist/isomorphic/module.wasm` from the modules clone
(SDN_MODULES_ROOT, main 890c8655f2d268067ab3148813b5eab2aabc6849), SHA-256 checked before it is loaded, never a working
tree (the harness's `lib/ap.mjs pinnedFile` and `common.mjs pinned`).

| Module | Version | SHA-256 of dist/isomorphic/module.wasm | Bytes | Commit |
| --- | --- | --- | --- | --- |
| propagator/sdn-ap (AP and whiteroom XP) | 0.5.2 | `74388314396a8f8c4bc962b63566b01ee8a99e1d8a295e8233fac36d5683500d` | 936,984 | 890c8655f2 |
| propagator/sgp4-xp (Space Force XP, black box) | 0.2.2 | `1f8aa4c7e3c01a9eb6c499a6730be827afee2b969f535410af32c74237f17877` | 1,030,209 | 890c8655f2 |
| propagator/sgp4 | 1.4.1 | `2fe246b716c78a4b947cd95e70e126b7a738cbbb9775e5196f07b1fe551f4643` | 1,295,483 | 890c8655f2 |
| propagator/ffm | 2.2.0 | `d635a3d57a2c9ca91d111f74aad38b9d748d6c16199b22c6922af21c92fe2153` | 2,752,551 | 890c8655f2 |
| analysis/estimation (FFM's fitter) | 0.7.0 | `7a555ca5b3ed0b021dd5b7986bd73dd8f8dc5125a2aa7943e3b3e983320d6bcd` | from the pin | 9a05d899b9 (XM3's pin, the build the explorer's FFM columns name) |
| analysis/gp-error-model (SGP4's fitter) | 0.11.0 | `8e13eddbd5ccc3e0ee121f3b851e8314e426715cf5517823aa8d925566ef0e19` | from the pin | fbda894501 (XP2F's pin, the build the explorer's SGP4 column names) |

The Space Force XP library is timed through the harness's black-box path only (`lib/ussf-xp.mjs`: the module's `fit`,
then `propagate` on a grid). Nothing of it is opened, read or inspected; its module is named by the hash of the dist the
module publishes, as every other.

Reading the brief's "sgp4-xp 0.2.2 whiteroom": the harness defines whiteroom XP as propagator/sdn-ap with the theory's own
forces (`lib/ap.mjs`, `lib/build.mjs`), and propagator/sgp4-xp as the Space Force library's module. This registration keeps
the harness's definitions: XP (whiteroom) = sdn-ap 0.5.2 at stock forces; XPU (Space Force) = sgp4-xp 0.2.2 as a black box.

## Arms

The explorer's columns, with `compare-costs.mjs`'s definitions (its lines 38-44 and 47-81); the high-orbit FFM setting is
`all-regimes.mjs ffmHigh` (the setting behind cells.json's FFM20 column above 8,400 km). Nothing is added.

| Arm | Fit | Flight |
| --- | --- | --- |
| SGP4 | analysis/gp-error-model `fit_elements` on the arc's `$OEM`, { epoch: first, fitBstar: true } (`lib/xp2.mjs openSgp4Fit`; a fresh instance per fit, as the harness times it) | propagator/sgp4 `propagate_ephemeris` of the `$OMM`, 300 s, TEME |
| XP | propagator/sdn-ap `fit`, `$PCF` theory SGP4XP, the theory's own forces (`fitPcf({ forces: apForces({ atmosphere: false, noTerms: true }), fit: null })`) | propagator/sdn-ap `propagate` of the `$OCM` at the 2,016 epochs |
| XPU | propagator/sgp4-xp `fit` on the arc's `$OEM` | propagator/sgp4-xp `propagate` of the `$OCM` on the 2,016-epoch grid |
| AP | propagator/sdn-ap `fit`, theory AP, `apForces({ tesseral: 31, zonal: 20 })` (NRLMSISE-00 on `$SPW` rows), rows to the horizon (`fitWeather`, `horizonOf(cutoff)`) | propagator/sdn-ap `propagate` of the `$OCM` at the 2,016 epochs |
| FFM20 | analysis/estimation `fit_batch` through `lib/host.mjs openFfmHost`: below 8,400 km `compare-costs.mjs ffm(20, false)` (20x20, NRLMSISE-00 drag, SRP, Sun and Moon, no tides, RK78 1e-8, steps 1e-3 to 120 s, DRAG_AREA_OVER_MASS 0.01 fitted, AGOM 0.02); at or above, `all-regimes.mjs ffmHigh` (20x20, no drag, SRP_AREA_OVER_MASS 0.02 fitted, steps to 300 s) | propagator/ffm `invoke` of the fitted state to the 2,016 epochs, the same settings |
| FFM40 | `compare-costs.mjs ffm(40, true)` (40x40, drag, SRP, Sun and Moon, solid tides, RK78 1e-8); below 8,400 km only (the harness has no high-orbit FFM40) | as FFM20 |

Weather rows for AP and FFM: GFZ's observed daily F10.7 and Ap (`lib/weather.mjs gfzDays`), the centered 81-day mean
computed from them, from 90 days before the earliest arc to the latest horizon; the same rows for every window. Cost does
not depend on the values, and no arm is scored.

## Measures

Per window and arm, fit and flight apart, one call each:

- CPU seconds: `process.cpuUsage()` (user plus system) across the call. Wall seconds: `performance.now()` across the call.
  Both per object-day as above.
- Peak wasm linear memory, pages of 64 KiB: every `WebAssembly.Memory` of every instance the arm's process creates
  (`WebAssembly.instantiate` and `WebAssembly.Instance` wrapped in the host), `buffer.byteLength / 65536` read after each
  call; the arm's figure is the maximum over its fits and flights.
- Process RSS: `process.resourceUsage().maxRSS` (bytes) at the end of the arm's process: one process per arm per phase,
  so the figure is that arm's.
- Module size: bytes of dist/isomorphic/module.wasm of each module the arm loads.
- Bytes per object held: the bytes of the fitted product the arm emits and a store holds per object: the `$OCM` (AP, XP,
  XPU), the `$OMM` (SGP4); FFM has no FlatBuffer product here, so its fit's epoch, state and parameters as UTF-8 JSON, as
  the harness carries them (stated as such). The sdn-ap epoch store (SPEC 14, `load_epochs`) is not exercised: its
  snapshot codec is not in the harness, and the measure is reported as not taken.

## Statistics

Per arm, over the windows that completed: median, 10th and 90th percentile (nearest-rank) of each measure, pooled across
regimes; and the median per regime. A window an arm refuses is counted and named with its error; a measure never stands in
for another.

## Procedure

`run.mjs fits`, then `flights`, then `memory`, then `tables`; `--check` reproduces the table from the stored rows byte for
byte. One child process per arm per phase, arms in the order SGP4, XP, XPU, AP, FFM20, FFM40, windows in the registered
order; the 1-minute load before and after each child is in the rows. Rows: `/opt/data/sdn-archive/operator-theory/sdn-ap-cost-benchmark/`
(`fits-<arm>.jsonl`, `flights-<arm>.jsonl`, `memory-<arm>.json`, `phases.jsonl`). Results: `results/sdn-ap-cost-benchmark/table.json`
and `README.md`. Every state comes from a module; the host moves bytes, thins the arc, and times.

## Amendments before the registered run (2026-11-05, after a two-window trial in a scratch directory; no record row read)

1. Thinning and coverage follow the harness's rule exactly (xp-atmosphere-merit/lib/truth.mjs `thinned`, all-regimes.mjs
   `arc`): coverage is the arc's states over 48 h / the product's own step (at least 0.9), and the arc is every
   round(300 s / step)-th state from the first. The laser products (NSGF 180 s, ILRS 120 s) thin to 360 s, 481 states;
   every other product here is on a 300 s or finer grid and gives 577 states at 300 s. The first text read "thinned to 300 s,
   at most 577 states, 90 % of 577", which no 120 s or 180 s product can meet while the harness fits them. The output step
   stays 300 s everywhere.
2. One warm-up call per arm and phase, on the first window, is not counted: the harness's rule (compare-costs.mjs counts its
   first file as a warm-up; speed.mjs times after one warm-up call). In the trial the first call of a fresh process carried
   the engine's wasm tier-up on other threads (CPU above wall).
3. The parent process reads the products once and writes the thinned arcs under the row directory (`arcs.json`, never the
   repository); each arm's process reads them, so its RSS is its own and the readers' memory is not in it.
4. The memory probe also wraps the `WebAssembly.Memory` constructor: propagator/sdn-ap is an emscripten-pthreads artifact
   whose memory the host constructs and imports; the first probe (instances only) saw none of it.
5. Every module runs one instance for the arm's whole phase, SGP4's fitter and propagator included. The harness makes a
   fresh instance per call for those two (`openSgp4Fit`, `modules.mjs propagateSgp4`), which in the trial put the module's
   compilation inside the timed call (flight CPU 0.069 s against 0.016 s wall): a cost of the host, not of the theory. The
   call is the harness's unchanged (`fit_elements` with { epoch: first, fitBstar: true }, the same decoding; `propagate_ephemeris`
   of the set in TEME at the step), on the same builds; SGP4's bytes per object is the size-prefixed `$OMM` the fitter emits.
6. The thread bound: propagator/sdn-ap is opened with `maxThreads: 1` and `wasiThreadPoolSize: 1` (the SDK caps live guest
   threads on Node through the second); after the warm-up the trial read AP's fit at 0.126 s CPU against 0.125 s wall, the
   sequential path. Every other module here is a sequential artifact.

## Amendment 2026-11-06: the shipped builds, two sdn-ap columns by hash (registered before any measurement)

Task experiments-cost-benchmark-remeasure-shipped-build-20261105 (SDN-AP session ruling of 2026-11-06: both builds in one
lane, one amendment, two columns named by hash, a quiet box in fact). The same 32 windows (the arcs the registered run
prepared, `arcs.json` under the row directory, read as they are), the same measures, the same arm definitions, the same
step, the same statistics and the same machine rule as the registered run above (a13cb468). What changes is the build of
the arms whose module shipped since, each a run of its own:

| Run | Module | Version | SHA-256 of dist/isomorphic/module.wasm | Bytes | Commit | Arms rerun | Rows |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sdn-ap-0.6.2 | propagator/sdn-ap | 0.6.2 | `84d50dca4efdfea87eff7e3b4618d795c26a7d0a6df0e877341e69bc73161f41` | 951,183 | e1e4fad87ae810dd71e9acb568e9f083df1cc9b8 | XP, AP | `builds/sdn-ap-0.6.2-84d50dca` |
| sdn-ap-0.6.3 | propagator/sdn-ap | 0.6.3 | `aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e` | 966,222 | 93cb5a0584fa728864e4426cc9ceb368936589f9 | XP, AP | `builds/sdn-ap-0.6.3-aa3ed22a` |
| ffm-2.2.1 | propagator/ffm | 2.2.1 | `a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4` | 2,754,046 | 9cb02c8e22f5a738a9984992e8af2246cd11e090 | FFM20, FFM40 | `builds/ffm-2.2.1-a9133120` |

Every other module stays at its registered build (sgp4-xp 0.2.2, sgp4 1.4.1, estimation 0.7.0, gp-error-model 0.11.0).
SGP4 and XPU are not rerun: their builds did not change, and their rows above stand. Each wasm by `git show` at its
commit from a read-only modules clone that holds it (`SDN_MODULES_GIT`), SHA-256 checked before it is loaded, as above.

Columns. Every rerun is a column of its own, named by arm and dist hash. The table's `arms` (the six columns the
comparison page and the paper read) carry the shipped build of each arm: SGP4 and Space Force XP from the registered run,
XP and AP from sdn-ap 0.6.3, FFM 20x20 and FFM 40x40 from FFM 2.2.1; `builds` names those six modules, one build each.
The other columns (XP and AP on sdn-ap 0.5.2 and on 0.6.2; FFM 20x20 and FFM 40x40 on FFM 2.2.0) stand beside them under
`comparison`, by hash, with the same statistics and the same per-regime medians. Nothing is dropped.

The low-orbit ratio. AP's flight CPU seconds per object-day over FFM 40x40's, on the windows below 8,400 km both arms
completed: per window (median, 10th and 90th percentile, nearest rank, n) and per regime (the median over the low-orbit
regimes of each regime's median ratio: the site's rule; its rounded reciprocal is the front page's fraction). Stated for
the shipped pair (AP on 0.6.3, FFM 2.2.1), and for comparison the 0.6.2 pair and the registered pair.

Machine rule, held in fact. The registered rule stands (one process at a time; sdn-ap's thread pool bounded to one; the
1-minute load recorded before and after each arm process and in `phases.jsonl`). For this rerun the coordinator pauses the
DSST run's JVMs (SIGSTOP by exact PID, logged with start and end times) for the benchmark's duration only, and nothing of
this lane's runs on the box beside the benchmark. Each row records the 1-minute load before and after its call
(`loadBefore`, `loadAfter`). A ceiling for the rerun's rows: 22.83, the registered run's highest recorded load. Before
each row the child waits in 15 s cycles (at most 10 minutes) until the load is at or under it; a row whose load after
its call is above it is refused (`refused`), left out of the statistics and named in the table. The rerun's wall time,
start to end, is in the table (`runs`).

Procedure. `run.mjs fits --run <run>`, `flights --run <run>` and `memory --run <run>` for sdn-ap-0.6.2, sdn-ap-0.6.3 and
ffm-2.2.1 in that order, one child process per arm, arms and windows in the registered order; then `tables` reads every
run's rows; `--check` reproduces both files byte for byte. Rows under the registered row directory, `builds/<run>`.
One warm-up call per arm and phase as amendment 2.

The box as it was (recorded after the run, 2026-11-06): the DSST run's seven accuracy JVMs were SIGSTOPped through the DSST
governor from 2026-11-06T07:05:58Z to 07:19:17Z, around the benchmark (07:12:32Z to 07:18:58Z, 386 s of wall time for the
three runs). The FFM rerun lane's eight single-thread scoring workers (`score.mjs`) ran throughout; the coordinator
disclosed them at 07:12Z and did not stop another lane's processes. The 1-minute load was 11.7 to 12.7 at every phase
boundary and under the 22.83 ceiling before and after every row (`loadBefore`, `loadAfter` in the rows; `load` per column
in the table); no row was refused. The dist bytes came by `git show` from the read-only clones the brief names
(sdn-ap 0.6.2 from `space-data-network-modules-pin`, 0.6.3 and FFM 2.2.1 from `space-data-network-modules-covm`,
`SDN_MODULES_GIT`); the SDK, the Space Data Standards bindings (1.276.0, the harness's registered versions) and the host
files came from this lane's own clone at the registered run's commit 890c8655f2.
