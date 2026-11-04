# AP beside SGP4, XP and FFM

Every AP and whiteroom XP figure here is from AP 0.4.11 (modules a0f33bc545), rerun on the same windows, pairs and files after `experiments/operator-theory/AP7.md` passed: `cycle-ap7-site.sh`, then `ap7-merge.mjs`, which takes SGP4, FFM, the Space Force's XP and the operators' files from 0.4.0's store by key. The statements of AP5.md and AP6.md were registered on 0.4.0: their registered results are `truth-040.md` and `regimes-040.md`; `truth.md` and `regimes.md` are the same statistics on 0.4.11, report only. Every statement gives the same verdict on both builds.

`cells.json`, since 2026-11-04 (`experiments/operator-theory/XP-ARM-0-2-1.md`): each row names its input, `operator-file` or `precise-orbit`, and each column's builds by SHA-256 (`builds`). Against precise orbits AP is `propagator/sdn-ap` 0.5.1 (`ap/b051`, byte for byte 0.4.18's); against the next file it is still 0.4.11's, the build of those rows. The Space Force XP is `propagator/sgp4-xp` 0.2.1 on AP5's and AP6's windows (`ap/b051`) and on every next-file pair (`ap/xp-arm-0-2-1`), except SpaceX: every Starlink group is held, so those rows keep 0.1.1's figures and name that build. Every other cell is as before. `xp-versions` and `sigma.json` still show the Space Force XP on 0.1.1; `results/operator-theory/xp-arm-0-2-1` sets 0.1.1 beside 0.2.1.

`cells.json` rows also count their windows with a burn in the fit and in the forecast to the lead (`burnsInFit`, `burnsInForecast`, from `results/operator-theory/maneuver-flags`): Sentinel-1 and the altimetry satellites; null where no detector ran. `examples/` holds the worked examples the site's globe reads (`experiments/operator-theory/compare-examples-publish.mjs`); none is built on a fit holding a burn, and each carries its own `burnsInFit` and `burnsInForecast`.

## Against precise orbits

`experiments/operator-theory/AP5.md`, registered before XP with solar pressure free was run on these windows: strong drag, near 700 km and medium Earth orbit. AP beats XP in all four statements. Figures and every interval: `truth.md`, the same as data in `truth.json`. The windows had been read for AP, and for an XP arm with solar pressure held.

## In every other regime with truth

`experiments/operator-theory/AP6.md`, registered at 48b01e3 before the full run. Figures and every interval: `regimes.md`, the same as data in `regimes.json`.

What it means: on the laser spheres and the laser geodetic satellites AP beats XP as registered, about 90 % closer one day ahead. On the altimetry satellites AP's medians are far closer, 85.5 % one day ahead, but the statement fails: the upper bound of its 95th percentile at day 2 is +10.7 % against a limit of +10 %. Every arm has about the same tail there.

Report only: in inclined geosynchronous orbit AP is a little closer than XP at every lead; in geostationary orbit it is closer through day 3 and level at day 7. On TESS AP 0.4.11 is a little closer than XP from a 72 h fit through day 2 and level after, and from a 336 h fit XP is a little closer. On THEMIS and Chandra, from a 72 h fit, AP is about a third of XP's error at day 1 and a sixth at day 7. So the gain above the laser-ranged satellites is not established. FFM at `CHEAPER.md`'s settings is closest in nearly every cell. SGP4 from a short arc is far off in these high orbits, and thousands of kilometers off on TESS.

What it does not mean: the windows run from 2025-10 to 2025-12, and for TESS 2026-07 to 2026-09. The geosynchronous groups span 20 days and TESS is one satellite. The geostationary tails, about 112 km at day 7, are the same for every arm; they look like station-keeping maneuvers, which was not checked. A smoke test of 19 windows was read before registration, to check the readers, and is disclosed in the plan.

## Against each center's next prediction

On 7,404 pairs of 17 low satellites that do not thrust, every arm fitted to the same 48 h of the same file and flown to the same later times, AP 0.4.11's median difference from the center's next prediction at 24, 72, 120 and 168 h is 0.018, 0.059, 0.216 and 0.482 km. SGP4's is 0.428, 0.621, 1.57 and 3.50 km, XP's 0.410, 0.619, 0.865 and 1.25 km, and 40x40 FFM's 0.006, 0.035, 0.088 and 0.173 km. On one machine, in one process, AP takes about 1 s to fit and 0.22 s to fly a file, 40x40 FFM about 4.3 s and 4.5 s, and SGP4 and XP about 0.1 s and 0.04 s.

A next-file lead runs from the start of the older file to the start of the newer, so with a 48 h fit a 24 h lead lies inside the fit, 72 h lies one day past its end, and a lead equal to the fit starts at its end. A truth lead runs from the end of the fit.

What it means: by pair, AP is closer than SGP4 and XP at every lead. Against FFM it is behind at 24 h, by about 0.01 km; past that the intervals against both FFM settings include zero, though 40x40 FFM's pooled medians are lower. AP 0.4.11 costs about 2.5 to 4 times less than these FFM settings to fit and about 4 to 7 times less to fly, and about 10 to 15 times more than SGP4 and XP. Its flight costs 2.8 times what 0.4.0's did on the same files; which of 0.4.1 to 0.4.11's changes costs that was not measured. SGP4 fitted to 48 h is level with XP through 72 h; XP pulls ahead at 120 and 168 h. Fitted to 24 h, SGP4 is 7.75 km off at 72 h and 48.7 km at 168 h.

What it does not mean: this is a report, not a test, and no claim rests on it. The reference is each center's next prediction, not independent truth, and agreeing with it may partly mean sharing a force model with that center. AP and FFM read observed weather for the whole stretch they fly, which no real forecast has and which SGP4 and XP do not read at all, so the gap at long leads is wider here than it would be in a real forecast. AP 0.4.0 against XP was not registered on this reference; it is registered against precise orbits, in `AP5.md` and `AP6.md`, above.

## Every other provider that publishes states

## Two versions of XP

`xp-versions.md` and `xp-versions.json`, report only, registered in `experiments/operator-theory/COMPARE.md`. Every "XP" in this work before this section is our whiteroom version. The Space Force version is its unmodified Sgp4Prop 9.1.1.0 XP build through `propagator/sgp4-xp`, fitted by that module's own fitter and flown on the same arcs and times. They share a theory, not a fitter.

By window, the Space Force version's error over the whiteroom version's, one day ahead: 1.06 in strong drag in 2025 and 1.07 in 2026 from a 24 h fit, 1.00 in 2026 from a 72 h fit, 1.10 near 700 km from a 24 h fit and 1.01 from a 72 h fit, 1.01 in medium Earth orbit (0.74 against whiteroom XP 0.4.0, whose 24 h fit 0.4.7's prior has since improved), 5.6 in geostationary orbit and 4.5 in inclined geosynchronous orbit. At day 7 those last two are 1.15 and 1.27. The library reads two-line text, whose angles carry 1e-4 degree, about 74 m at geostationary radius, which may be part of that; this was not tested. On TESS from a 72 h fit the ratio is 2.9 at day 1 and 5.1 at day 7, and from a 336 h fit it is 1.08 and 0.99. On 40 low-orbit files, one process, one call at a time, a fit took 0.121 s on the whiteroom version and 0.328 s on the Space Force version, and a flight 0.041 s and 0.008 s.

## The providers

`experiments/operator-theory/providers-run.mjs`, report only: SpaceX, NASA's ISS, the China Space Station, Planet's Flock, ESA's ultra-rapid GPS and GLONASS orbits, Intelsat and SES. Each arm is fitted to the start of an older file and flown to the first 3 hours of the same provider's newer file, so the reference is the provider's own later solution, not truth, and the provider's own forecast is a column beside them. The spans are short: the forward test began 2026-10-24, the China Space Station has one pair, and the ISS archive is read over 2026-01 to 2026-05. FFM on these is the forward and vendor tests' stored 70x70 arm, except the ISS, which flies 40x40 here. Pairs of Planet objects with no catalog number are left out and counted in `cells.json`: their successive files disagree by thousands of km for every arm, Planet's own forecast included. Providers that publish no states cannot be tested: OneWeb, Telesat, EUMETSAT, Kuiper, Iridium, Orbcomm and AST (`experiments/operator-theory/VENDORS.md`).

## The ellipsoids on the site's globe

`sigma.json`, from `compare-sigma.mjs`: for each arm and lead, the root mean square of its radial, in-track and cross-track errors over every forecast of that example's satellite, or provider and regime. It is what the forecasts did, not a filter's formal covariance.

## The table

`table.md`, and the same as JSON with every build's module, version, commit and SHA-256 in `table.json`. How it was made: `experiments/operator-theory/COMPARE.md`, `compare-sgp4.mjs`, `compare-costs.mjs`, `compare-table.mjs`.

## What was registered, and where

- `experiments/operator-theory/CHEAPER.md`: the FFM settings, passed. `results/operator-theory/cheaper`.
- `experiments/operator-theory/AP.md`: AP 0.3.0 beats XP on these low-orbit pairs at 72 h and 168 h, passed. `results/ap-truth`.
- `experiments/operator-theory/AP4.md`: AP 0.4.0 beats AP 0.3.0 at 24 h and 72 h, passed. `results/ap-truth`.
- The SGP4 column and the timing were added on 2026-11-02, after the others had been read.

## The timing

40 files chosen by hash, plus one warm-up not counted. 3 of the 40 are left out, all one satellite whose file starts before the weather table does, so 37 count. A fit reads the file's first 48 h, median 481 states; a flight writes every state of the file, median 1,440 states over 5 days. Medians per file. The machine was also running other work, and the order of the five rotated by file so that it fell on all of them alike. SGP4's module is started afresh for each call, as every S arm here does; the others stay loaded. The figures in `results/operator-theory/cheaper` and `../README.md` came from runs under other loads and differ.
