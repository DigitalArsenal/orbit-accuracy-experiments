# AP beside SGP4, XP and FFM, on the same low-orbit pairs

Written 2026-11-02, after every row here except SGP4's and the cost run had been read. This is a report, not a test: nothing below was registered in advance as a claim, and no claim rests on this file. The claims these arms carry are in `CHEAPER.md`, `AP.md` and `AP4.md`.

The owner, 2026-11-02, verbatim: "OK publish this with the code and versions for each at the website".

## The pairs

`CHEAPER.md`'s 54 days and centers, group `low`: 7,404 pairs of 17 satellites. A forecast is fitted to the first 48 h of a center's prediction file and flown to the first 3 h of a newer file of the same object from the same center. A next-file lead runs from the start of the older file to the start of the newer, so with a 48 h fit a 24 h lead lies inside the fit, 72 h lies one day past its end, and a lead equal to the fit starts at its end. A truth lead runs from the end of the fit. That newer file is the center's later solution, not independent truth. Weather is observed history.

## The arms

| Column | Stored arm | Build | Stored by |
|---|---|---|---|
| SGP4 | `S@48` | `analysis/gp-error-model` fits, `propagator/sgp4` flies, at modules fbda894501 | `compare-sgp4.mjs`, added for this file |
| XP | `A-XP@48` | `propagator/sdn-ap` 0.3.0 with `FORCES` and `FIT` unset, which is XP bit for bit (`AP.md`); it fits solar pressure | `cycle-ap.sh laser` |
| AP 0.4.0 | `A-APn@48` | `propagator/sdn-ap` 0.4.0, `FORCES` 31, 20, NRLMSISE-00 | `cycle-ap4.sh laser` |
| FFM 20x20 | `F-M20@48` | `analysis/estimation` 0.7.0 fits, `propagator/ffm` 2.0.4 flies: 20x20, no tides or relativity, tolerance 1e-8, steps to 120 s | `cycle-cheaper.sh` |
| FFM 40x40 | `F-M40@48` | the same: 40x40, tides, tolerance 1e-8, steps to 120 s | `cycle-cheaper.sh` |

SGP4's fit and its flight are two implementations: `analysis/gp-error-model` fits with its own SGP4 in improved mode, and `propagator/sgp4` flies in AFSPC mode, as every S arm here does. An SGP4 set flies on SGP4 and nothing else. A 24 h SGP4 fit is reported beside it.

## The cost run

`compare-costs.mjs`: 40 low-orbit files chosen by hash, one process, one call at a time, the five arms in an order that rotates by file, one more file first as a warm-up, not counted. A file on which any arm cannot run is left out and counted. SGP4's module is started afresh for each call, as every S arm here does, so its figures carry that start; the others stay loaded. Fit: the file's first 48 h. Flight: every state of the file. Figures are medians per file on one machine, under whatever else it was running, and are not a benchmark of the algorithms in general. The figures in `results/operator-theory/cheaper` and `results/ap-truth` came from runs under other loads; these replace them only in this table.

## What this does not show

- The reference is the center's next prediction. Agreement with it may partly mean sharing a force model with that center.
- AP 0.4.0 against XP is not a registered contrast. `AP.md` registered AP 0.3.0 against XP on these pairs, and `AP4.md` registered 0.4.0 against 0.3.0.
- AP and FFM read observed weather for the whole stretch they fly. SGP4 and XP read no weather at all. That favors AP and FFM, more at long leads, and no real forecast has it.
- `AP5.md` and `AP6.md` run XP beside AP against precise orbits. This file's reference is not that.
- These are 17 low satellites that do not thrust. Nothing here covers other orbits, maneuvering fleets or debris.

## Two versions of XP

The owner, 2026-11-02, verbatim: "the XP needs to be done using our whiteroom version of XP and the Space Force version of XP separately, and we need to document that we used the SPace Force version as prescribed in the instructions".

Registered before this arm was run on these windows, apart from one window of AP5's used to test the code path. Report only: AP5's and AP6's statements stay against the whiteroom XP, as they were registered.

- **XP, whiteroom:** the AP module with FORCES and FIT unset, `propagator/sdn-ap`, our clean-room implementation. It is every "XP" this work reported before this section.
- **XP, Space Force:** `propagator/sgp4-xp`, `lib/ussf-xp.mjs`. Its library is the US Space Force's Sgp4Prop 9.1.1.0 XP build, unmodified, SHA-256 `9f061110f12ac85a76ad80dc76cdb8a33ddad64e54d8dab3b6778602e16cbeb7`. Same arcs and same states, fitted with `fit` and flown with `propagate`, stores `U<arc>` and `U-XP@<arc>`.

What the package prescribes, and how this arm meets it:

- It reads two-line element text: every set reaches the library at two-line digits, and the fit searches that lattice, so the set scored is the set published.
- It is optimized for times continuing away from the epoch (its release notes): each flight asks for increasing times from a fresh satellite.
- Its XP sets are ephemeris type 4, BTERM in BSTAR and AGOM in MEAN_MOTION_DDOT.
- The module's tests require every position and velocity to be the same double as the library through its own runtime, on 640 element sets (`tests/ussf_parity.test.mjs`).

Where it departs from what the package states:

- The Agreement states the propagator's intended purpose as propagating 18 SDS element sets, "solely". No public XP set exists, so these sets are fitted here by the module's own fitter, each evaluation running the library. The owner ruled that the Agreement's section 1.L governs (`third_party/ussf-sgp4/NOTICE.md`).
- The library has no fitter, so nothing about the fit comes from the Space Force, and it neither wrote, reviewed nor approved this work.
- Its release notes say certain XP results of this C build do not match the Fortran baseline, which they attribute to SHADOW calculations. This arm is the C build.

`compare-examples-publish.mjs` writes what the site's globe reads, in one form for every example: the reference's positions and, at each time, each forecast's radial, in-track and cross-track distance from it. Every reference here is public data, and every source's credit and license line goes with it (below).

The same step finds where the reference's orbit steps: the forecast's orbit-mean radial distance from the reference, the orbit after less the orbit before, at least 8 times its typical size for that example and at least 5 m. `analysis/maneuver-detection` is not used here: its floors were set on the ISS, and they miss these orbit-keeping burns of about 0.01 m/s on one precise orbit. On a passive satellite the same step is called a step in the reference, since it cannot maneuver. A forecast knows none of these, and they are not removed from any table.

Showcase examples, added 2026-11-03 at the owner's word ("we want examples where SGP4 is way off, and XP is ~5-10x off"): `compare-examples.mjs --pick showcase` adds one example per precise-orbit regime, ids `best-*`, chosen to show AP's lead, not to be typical. On stored day-3 errors, it takes the windows whose XP error is 5 to 10 times AP's. Those where FFM is no more than twice as close as AP come first, then the rest, each by SGP4's error over AP's, largest first. A regime with no window in that band takes the window where XP is furthest behind AP. The ratios go out with the example, and the site says so on each. They change no table: `compare-cells.mjs` never links a row to one.

Burn-free fits, since 2026-11-04 (`experiments-ffm-maneuver-flags-20261104`): every pick, typical or showcase, finds its example's steps as the publisher does (`lib/steps.mjs`) and takes the next window when one falls inside the fit, or when the reference has a hole there of more than two grid steps (a burn the product leaves out); the showcase stays the most AP-leading of the burn-free fits, and a regime whose every window tried holds one keeps no example, which the index says. Each example carries `burnsInFit` and `burnsInForecast`, its maneuver steps before and after the end of its fit. The published examples are `results/ap-truth/compare/examples`; the Starlink example is held, not parsed, and the index names it.

`providers-run.mjs` adds AP, XP and SGP4 to every other provider this work stores forecasts of, and `compare-cells.mjs` and `compare-sigma.mjs` write the site's tables and ellipsoids. All report only.

Since AP7.md passed, every AP and whiteroom XP figure is AP 0.4.11's: `cycle-ap7-site.sh` reruns those arms on the same windows, pairs and files, `ap7-merge.mjs` joins the arms that do not depend on the AP build from 0.4.0's store by key, and `lib/build.mjs` names the build the tools read.

To rebuild: `compare-sgp4.mjs` with 8 shards into `<store>/ap/b040/laser-sgp4`, `cycle-ap7-site.sh costs` into `<store>/ap/b0411/compare-costs`, then `compare-table.mjs --out results/ap-truth/compare`.

## Re-flown 2026-11-04 on one $OCM in, report only

Build: modules ea824356, `propagator/sdn-ap` 0.5.1 (wasm d29acd2b5d92) and `propagator/sgp4-xp` 0.2.1 (816fd137d761), replacing AP 0.4.11 (e4edacb03daf) and sgp4-xp 0.1.1 of the examples. Every example of `ap/b0411/compare-examples-full` was flown again by `compare-examples.mjs` at a3c40ab, each AP, XP and Space Force XP set fitted as one `$OCM` on the stored window and flown from it alone (`results/reflown-0-5-1.txt`). Of 59 examples: the reference, whiteroom XP, SGP4 and FFM tracks are byte-identical in all 59; AP in 41, and in 18 it moves (at most 2.6 km, the THEMIS and Chandra orbits; 241.8 m and 65.4 m on two low-orbit next-file examples; under 15 m elsewhere), the windows where AP 0.4.18, which 0.5.1 equals byte for byte, departs from 0.4.11 (AP9.md); the Space Force XP moves in all 59 (sgp4-xp 0.2.1 flies whole integrator steps): by up to 5.2 km in highly elliptical orbit, 881 m in geostationary and inclined geosynchronous orbit, 740 m in navigation orbits and 1.2 km on one strong-drag window (Swarm C, 2026), each example's figure in the file. `compare-examples-publish.mjs --check` writes the published files again from the stored examples and finds all 119 equal byte for byte. The site's examples and tables stay on the stored tracks until the site's AP build and the Space Force XP rerun of every next-file pair move them.

## Amendment, 2026-11-05: every example in the full form

The owner, 2026-11-05, verbatim: "all data for these is distributable, it's all public data". This replaces the licensed form of the same day, which published 19 examples (Swarm strong drag 2025 and 2026, ESA navigation finals, ESA ultra-rapid, Intelsat, SES, the China Space Station and Planet) as AP's track and each forecast's distance alone. `compare-examples-publish.mjs` now writes every example, from the stored flights of `ap/b0411/compare-examples-full` and `ap/b051/compare-examples-regen` (no new flights), as the reference's track, every arm's offset vector from it and the reference's axes; the AP-only form, its provider list and its proof are gone. The 39 examples already in this form keep their positions byte for byte. `compare-examples.mjs --check` holds every published example to this form. On a next-file example it no longer counts a change that uses a sample within one grid step of the reference's change of files: that edge is the reference's own and enters every arm alike.

The highly elliptical (TESS) examples are unchanged here; the site withholds that regime for its truth, not for its license.

Each source's credit and license line, as the site's sources page states it:

| Provider in the examples | Source | License | Credit |
|---|---|---|---|
| ESA | ESA Swarm precise orbits | ESA Earth Observation data terms: free, with the required statement and © ESA on analyzed information | Data provided by the European Space Agency (ESA). Results derived from these data © ESA 2026. |
| ESA navigation, ESA ultra-rapid | ESA/ESOC Navigation Support Office orbits (IGS analysis center) | Navigation Support Office data terms (ownership and © marking); also IGS analysis-center products under the IGS terms of use | © Navigation Support Office at ESA/ESOC 2026. |
| Intelsat, SES | Intelsat and SES satellite orbital data | Published with no stated license | Intelsat; SES. |
| China Space Station | China Space Station ephemerides (China Manned Space Agency) | Published with no stated license | China Manned Space Agency. |
| Planet (Flock) | Planet Flock public ephemerides | CC BY-NC 4.0 | Copyright Planet Labs PBC (ephemerides.planet-labs.com). |

## FFM on 2.2.0, amendment of 2026-11-05

Written and committed before any row of the rerun was read. Build change: every FFM column moves from `propagator/ffm` 2.0.4 (modules 9a05d899b9, wasm c36f1b14fc23) to 2.2.0 (modules f1517ef68e, wasm d635a3d57a2c), RK78 carrying Fehlberg's 8th-order solution where 2.0.4 to 2.1.0 carried the 7th. `analysis/estimation` stays XM3's 0.7.0 (7a555ca5b3ed); `lib/host.mjs` opens FFM on 2.2.0 (`lib/build.mjs` `FFM_220`), and every row it writes names the build by SHA-256.

`cycle-ffm220.sh` refits and reflies every FFM arm behind `cells.json` at its registered settings, unchanged (forces, degree, tides, relativity, tolerance, steps, the 24 h, 48 h and 72 h fits, priors and seeds), on the same windows, files and pairs, into `ap/ffm220` beside the stores it replaces in the cells: `truth-compare.mjs` and `all-regimes.mjs` with `--arms F` on AP5's and AP6's windows; `providers-run.mjs --iss --arms F`; and, for the next-file pairs, `arms.mjs --stored`, which refits each file from the compact `$OEM` its cycle stored (the GCRF states on the grid the arm was fitted to, so nothing is fetched), then `score.mjs` flies each product to the newer files as before. CHEAPER.md's ladder runs less `old`, which no cell reads. No AP, XP or SGP4 arm is run. `compare-cells.mjs` reads every FFM figure from `ap/ffm220` and names 2.2.0 in every FFM cell; the held SpaceX cells, flown on 2.0.4, drop their FFM columns until a rerun. `ffm220-ratio.mjs` reports the paired FFM/AP ratio on precise orbits, exp(median ln(FFM / AP)) on the windows where AP 0.5.1 and both FFM builds scored, before and after.

Done 2026-11-06: every store rerun in full on 2.2.0, the same windows, files and pairs as the stores it replaces (compare-truth 944, compare-truth2 1,812, regimes 426, the ISS 37; 2,661 vendor and 48 forward-test files refitted, 7,398 and 55 pairs scored; 4,317 laser files refitted, 19,399 pairs scored), and every FFM cell of `cells.json` carries the same count of forecasts as before. `compare-examples.mjs --ffm-only` flew each of the 58 published examples' FFM track again on its own window into `ap/ffm220/compare-examples`, every other track, field and `$OCM` byte for byte the stored one's, and `compare-examples-publish.mjs` reads that folder last. `results/ap-truth/compare/ffm-ap-ratio.json` gives the paired ratio per regime, fit and lead on both builds, marks each cell that moved by more than 0.01, and gives each cell where FFM 2.2.0 is worse than AP its 95 % interval over object-week clusters and whether a registered burn explains it.

## Amendment, 2026-11-05: AP and whiteroom XP flown again on sdn-ap 0.6.2, with each example's $OCM

`compare-examples.mjs --reflight` finds each published example's window again (its start or cutoff and satellite, then its reference track byte for byte) and fits and flies AP and whiteroom XP alone again on `propagator/sdn-ap` 0.6.2 (modules c82160de7, dist 84d50dca4efd), which changes only the covariance's noise table and the record's producer string. It writes each example with those two tracks replaced, and `<id>.ocm`, the `$OCM` AP flew, to `ap/b062/compare-examples-reflight`:

    node experiments/operator-theory/compare-examples.mjs --mode <next|providers|regimes|truth|truth2> [--pick showcase] \
      --reflight <store>/ap/b0411/compare-examples-full,<store>/ap/b051/compare-examples-regen --out <store>/ap/b062/compare-examples-reflight

with XP2F_CONTROL=1 for `truth2` and for `providers --only iss` (XM's own weather store), SDN_MODULES_GIT naming a modules clone that holds c82160de7 and SDN_MODULES_ROOT one with the registered installs. Every published example but the two highly elliptical (TESS) examples was flown again: in all 56, the AP and whiteroom XP tracks equal the 0.5.1 flights byte for byte, a largest position difference of 0 m (`compare-examples-publish.mjs --reflown`, which compares with the folder the publisher reads). `compare-examples-publish.mjs` takes `ap/b062/compare-examples-reflight` last and copies each `<id>.ocm` beside its example. Each published example names AP and whiteroom XP on 0.6.2; every other arm, the TESS examples and every cell keep the build they were measured on, and `compare-examples.mjs --check` holds both and finds one `$OCM` beside each of the 56.

## Amendment, 2026-11-06: AP and whiteroom XP flown again on sdn-ap 0.6.3, with each example's $OCM

`compare-examples.mjs --reflight` finds each published example's window again and fits and flies AP and whiteroom XP alone again on `propagator/sdn-ap` 0.6.3 (modules 93cb5a058, dist aa3ed22aa61a: the closed-form tesseral grid above an eccentricity of 0.3 with exact-key sharing, the half-day double-count fix and the fitter guard; at e 0.3 and below the theory is 0.6.2's). It writes each example with those two tracks replaced, and `<id>.ocm`, the `$OCM` AP flew (producer sdn-ap-propagator 0.6.3), to `ap/b063/compare-examples-reflight`:

    node experiments/operator-theory/compare-examples.mjs --mode <next|providers|regimes|truth|truth2> [--pick showcase] \
      --reflight <store>/ap/b0411/compare-examples-full,<store>/ap/b051/compare-examples-regen,<store>/ap/b062/compare-examples-reflight --out <store>/ap/b063/compare-examples-reflight

with XP2F_CONTROL=1 for `truth2` and for `providers --only iss`, SDN_MODULES_GIT naming a modules clone that holds 93cb5a058 and SDN_MODULES_ROOT one with the registered installs. Every published example but the two highly elliptical (TESS) examples was flown again, 56 of 56 (`compare-examples-publish.mjs --reflown` against the published 0.6.2 examples): whiteroom XP equals the 0.6.2 flight byte for byte in all 56; AP equals it byte for byte in the 53 examples at an eccentricity of 0.3 and below (largest position difference 0 m) and moves in the 3 THEMIS and Chandra examples above it, the grid's change: THEMIS D (`best-highly-elliptical-themis-and-chandra`) by up to 314.5 m, THEMIS A by up to 314.2 m, Chandra by up to 22.7 m. On their stored windows (72 h fit, 7 days of forecast, 300 s grid; days counted from the fit's end; |AP offset| at the sample nearest the day; the roughness the median |second difference| of the offset at the grid step; arithmetic on the stored positions; 0.6.2 then 0.6.3): THEMIS D day 1 170.3 then 181.3 m, day 3 387.9 then 407.9 m, day 7 615.0 then 638.3 m, RMS over the span 598.2 then 570.1 m, largest 3,151.3 then 2,782.1 m, roughness 3.059 then 0.039 m; THEMIS A day 1 120.8 then 105.0 m, day 3 249.5 then 248.6 m, day 7 520.5 then 540.0 m, RMS 298.5 then 287.9 m, largest 1,164.4 then 915.4 m, roughness 2.180 then 0.056 m; Chandra day 1 207.6 then 209.2 m, day 3 454.2 then 456.1 m, day 7 12,413.9 then 12,411.2 m, RMS 14,630.5 then 14,630.0 m, roughness 0.063 then 0.040 m. The ripple is gone from both THEMIS tracks (the roughness falls by a factor of about 40 to 80) and Chandra's roughness falls from 0.063 to 0.040 m; the single-epoch errors at days 1, 3 and 7 move both ways by under 25 m, within each orbit's own swing between perigee and apogee passages; the RMS over the span and the largest error fall on both THEMIS windows. `compare-examples-publish.mjs` takes `ap/b063/compare-examples-reflight` last and copies each `<id>.ocm` beside its example. Each published example names AP and whiteroom XP on 0.6.3; every other arm, the TESS examples and every cell keep the build they were measured on, and `compare-examples.mjs --check` holds both and finds one `$OCM` beside each of the 56.

## Amendment, 2026-11-06: every AP and whiteroom XP cell on precise orbits names sdn-ap 0.6.3

Report only (`sdn-ap-site-accuracy-tables-0-6-3-20261106`). The site ships `propagator/sdn-ap` 0.6.3 (modules 93cb5a058, dist aa3ed22aa61a), and its accuracy tables name the build each figure runs. 0.6.3 changes the theory above an eccentricity of 0.3 alone, so the cells divide in two.

**The Highly elliptical THEMIS and Chandra rows, flown again.** `all-regimes.mjs --arms AP --groups HX --ap-build 0.6.3@93cb5a0584fa728864e4426cc9ceb368936589f9@aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e` (the flag opens `propagator/sdn-ap` at the named build through `lib/ap.mjs` `standalone()`, git show at the commit, SHA-256 checked; without it the tool is unchanged) on the same 19 windows, truth, grid, settings and measures as the 0.5.1 rows of `ap/b051/regimes-hx`: THEMIS A, D and E at 4 cutoffs each with a 72 h fit, Chandra at 7 cutoffs with 72 h and 168 h fits, 26 fits, every one flown, into `ap/b063/regimes-hx` (4 shards; rows-0 to rows-3 SHA-256 7724d06d7590b7cb, 3fc3307bfb4947b8, d46e925b3e3fed00, 6d5bb92568545f84). The first flight of the same windows ran before the flag existed, the same `all-regimes.mjs` with `lib/build.mjs` `PIN` pointed at 0.6.3 by a `node --import` preload (`ap/b063/regimes-hx-preload`); the flag's run equals it byte for byte in all four shards. `compare-cells.mjs` reads the HX regime's AP windows from `ap/b063/regimes-hx` and writes `results/ap-truth/compare/hx-0-6-3.json`, the change window by window; `--check` holds both files to the stores. 3D forward error in meters at days 1, 2, 3 and 7 past the fit's end, and the fit's RMS, 0.5.1 then 0.6.3:

| Window | Fit | Day 1, m | Day 2, m | Day 3, m | Day 7, m | Fit RMS, m |
| --- | --: | --: | --: | --: | --: | --: |
| CHANDRA 2018-03-08 | 168 h | 2,285.2 then 2,286.7 | 11,116.9 then 11,122.7 | 10,462.4 then 10,466.9 | 19,649.5 then 19,665.0 | 4,221.0 then 4,219.8 |
| CHANDRA 2018-03-08 | 72 h | 70.1 then 69.0 | 186.4 then 185.5 | 168.7 then 168.4 | 2,114.7 then 2,113.8 | 40.4 then 39.5 |
| CHANDRA 2018-03-15 | 168 h | 1,222.3 then 1,217.9 | 749.1 then 746.8 | 1,302.9 then 1,293.3 | 11,198.7 then 11,200.3 | 637.9 then 637.9 |
| CHANDRA 2018-03-15 | 72 h | 169.9 then 167.9 | 203.2 then 201.7 | 275.7 then 269.0 | 13,192.6 then 13,190.1 | 18.8 then 14.6 |
| CHANDRA 2018-03-22 | 168 h | 13,797.9 then 13,789.1 | 18,329.5 then 18,319.4 | 13,530.6 then 13,516.8 | 53,554.9 then 53,521.0 | 7,295.8 then 7,294.6 |
| CHANDRA 2018-03-22 | 72 h | 154.4 then 159.2 | 317.8 then 321.5 | 141.7 then 138.3 | 20,936.8 then 20,968.3 | 41.3 then 40.6 |
| CHANDRA 2018-03-29 | 168 h | 3,123.6 then 3,125.3 | 12,889.3 then 12,894.9 | 13,687.8 then 13,694.9 | 17,340.4 then 17,344.5 | 4,848.5 then 4,848.5 |
| CHANDRA 2018-03-29 | 72 h | 78.3 then 80.4 | 309.0 then 312.3 | 292.7 then 296.6 | 3,629.1 then 3,624.3 | 21.1 then 18.5 |
| CHANDRA 2018-04-05 | 168 h | 2,325.4 then 2,322.8 | 1,660.7 then 1,658.6 | 3,408.6 then 3,411.7 | 9,403.2 then 9,406.9 | 1,055.0 then 1,056.8 |
| CHANDRA 2018-04-05 | 72 h | 2,808.3 then 2,811.2 | 3,374.2 then 3,376.4 | 5,135.9 then 5,149.9 | 12,498.4 then 12,513.0 | 1,180.8 then 1,183.1 |
| CHANDRA 2018-04-12 | 168 h | 2,964.1 then 2,969.1 | 5,927.7 then 5,930.7 | 2,400.2 then 2,403.8 | 23,558.8 then 23,568.7 | 2,053.7 then 2,054.3 |
| CHANDRA 2018-04-12 | 72 h | 3,210.0 then 3,212.3 | 7,035.0 then 7,033.8 | 2,179.5 then 2,181.1 | 22,792.1 then 22,786.9 | 848.6 then 848.5 |
| CHANDRA 2018-04-19 | 168 h | 1,689.7 then 1,690.1 | 1,715.8 then 1,717.5 | 1,842.8 then 1,844.4 | 4,177.2 then 4,178.3 | 1,139.4 then 1,139.4 |
| CHANDRA 2018-04-19 | 72 h | 1,614.8 then 1,615.9 | 2,996.2 then 2,998.5 | 3,387.5 then 3,389.9 | 6,550.0 then 6,552.0 | 713.9 then 714.2 |
| THEMIS A 2013-02-11 | 72 h | 377.0 then 379.6 | 854.6 then 855.8 | 1,217.7 then 1,231.9 | 2,661.9 then 2,658.7 | 96.1 then 92.4 |
| THEMIS A 2013-02-13 | 72 h | 123.5 then 113.7 | 178.7 then 168.2 | 311.2 then 298.0 | 990.2 then 961.8 | 62.1 then 56.9 |
| THEMIS A 2013-02-15 | 72 h | 211.7 then 201.3 | 271.6 then 255.9 | 314.1 then 294.9 | 419.9 then 422.5 | 109.5 then 104.8 |
| THEMIS A 2013-02-17 | 72 h | 148.7 then 138.2 | 208.0 then 200.4 | 276.7 then 273.9 | 914.2 then 910.8 | 90.6 then 76.0 |
| THEMIS D 2013-02-11 | 72 h | 282.6 then 273.1 | 540.5 then 533.0 | 713.9 then 707.0 | 864.1 then 886.0 | 84.8 then 66.8 |
| THEMIS D 2013-02-13 | 72 h | 234.4 then 224.4 | 434.1 then 425.1 | 605.1 then 587.5 | 1,019.1 then 962.3 | 94.3 then 68.8 |
| THEMIS D 2013-02-15 | 72 h | 178.5 then 168.8 | 316.7 then 318.0 | 411.6 then 419.6 | 696.6 then 721.5 | 88.7 then 61.3 |
| THEMIS D 2013-02-17 | 72 h | 164.0 then 149.1 | 271.1 then 267.0 | 363.8 then 366.3 | 1,154.0 then 1,203.9 | 88.7 then 56.7 |
| THEMIS E 2013-02-11 | 72 h | 230.2 then 220.5 | 525.1 then 515.0 | 788.6 then 772.5 | 1,184.7 then 1,155.4 | 65.9 then 58.0 |
| THEMIS E 2013-02-13 | 72 h | 236.2 then 232.2 | 479.9 then 484.6 | 709.7 then 720.3 | 1,385.3 then 1,377.2 | 81.9 then 62.4 |
| THEMIS E 2013-02-15 | 72 h | 148.6 then 135.1 | 282.9 then 279.5 | 398.6 then 404.2 | 767.3 then 813.4 | 87.1 then 58.8 |
| THEMIS E 2013-02-17 | 72 h | 155.4 then 131.6 | 259.2 then 233.8 | 342.6 then 312.3 | 1,052.6 then 1,004.1 | 84.2 then 55.7 |

The regime-level cells of `cells.json`, median and 95th percentile of the 3D error in km, 0.5.1 then 0.6.3:

| Fit | Lead | Windows | Median, km | 95th percentile, km |
| --: | --: | --: | --: | --: |
| 72 h | 24 h | 19 | 0.1785 then 0.1688 | 2.848 then 2.851 |
| 72 h | 48 h | 19 | 0.3167 then 0.318 | 3.74 then 3.742 |
| 72 h | 72 h | 19 | 0.3986 then 0.4042 | 3.562 then 3.566 |
| 72 h | 168 h | 19 | 1.185 then 1.204 | 21.122 then 21.15 |
| 168 h | 24 h | 7 | 2.325 then 2.323 | 10.596 then 10.59 |
| 168 h | 48 h | 7 | 5.928 then 5.931 | 16.697 then 16.692 |
| 168 h | 72 h | 7 | 3.409 then 3.412 | 13.641 then 13.641 |
| 168 h | 168 h | 7 | 17.34 then 17.344 | 44.556 then 44.535 |

On the twelve THEMIS windows the fit RMS falls on every window (by 4 to 29 m) and the day-1 error falls on eleven of twelve; days 2, 3 and 7 move both ways, by under 60 m. On Chandra the fits and the day figures move by under 0.1 % of their size either way; Chandra's errors are dominated by its orbit, not by the build. No cell moves by more than 6 % of its value; the 72 h fit's day-1 median falls from 178.5 to 168.8 m and its day-7 median rises from 1.185 to 1.204 km. These per-row figures belong here and in the record alone: the site states the 0.6.3 figures.

**Every other precise-orbit AP cell, and every whiteroom XP cell, relabeled on an identity.** No flight. At an eccentricity of 0.3 and below 0.6.3 is 0.6.2's theory: the 0.6.3 version step (`results/ap-truth/themis-ripple-fix/version-step.json` at 9de1a40ff) finds the versioned dist equal to the candidate it was cut from on 56 of 56 published example sets, 6 of 6 fits and 8 of 8 accuracy fixtures, and the candidate's acceptance list (`final-build.json`, the same commit) finds 53 of 53 example sets at e 0.3 and below identical to 0.6.2, the 3 THEMIS and Chandra sets above it changed by design; 0.6.2 equals 0.5.1 on all 56 published examples (amendment of 2026-11-05, aa2a0a7b), and whiteroom XP equals through 0.6.3 on all 56 (amendment above, 58dcdd66). Every precise-orbit AP cell outside the HX regime was flown on 0.5.1 (`ap/b051`) and names 0.6.3 (`propagator/sdn-ap@aa3ed22aa61a`); every whiteroom XP cell on precise orbits, flown on 0.4.11 and re-measured on 0.5.1 (the proof at 71b27aa5), names 0.6.3 the same way. `cells.json` carries the chain in its `provenance` block (`XP`: measured on, re-measured on, proof and identity; `AP`: measured on, identity, and the re-measured regime with its store, tool and `hx-0-6-3.json`), and its `builds` keep the measured builds' records beside the named one. `compare-cells.mjs --check` reads the identity at 9de1a40ff and holds: 56 of 56 and 53 of 53; every precise-orbit AP and whiteroom XP cell on 0.6.3 and none off precise orbits; no cell on 0.4.11, 0.5.1 or sgp4-xp 0.1.1; the 19 HX windows, 26 fits, all flown. The FFM cells stay on 2.2.0 by hash: no identity to 2.2.1 has been flown.

## Amendment, 2026-11-06: AP and whiteroom XP flown again on sdn-ap 0.6.4; every precise-orbit cell names it on the identity

Report only (`sdn-ap-site-module-0-6-4-20261106`). The site ships `propagator/sdn-ap` 0.6.4 (modules cfd750eb8), named by its canonical module fd1ef4682edc68836d27fdb1f606a45b22bb3605354c55312287f87771a804b5 (the sds.* sections stripped, what the signature covers), its signed bundle e98b63558d84cfd3b8509f4c4c640502e38f81cc05a0e0277fcffa7da97cf51d (signer module-owner-2026-10-15) beside it. 0.6.4 moves one thing: a set in no resonance band flies the closed-form tesseral grid above an eccentricity of 0.05, and a set in a resonance band keeps 0.3 (`TESSERAL-SWITCH-BY-CLASS.md`).

**The examples, flown again.** `compare-examples.mjs --reflight` fits and flies AP and whiteroom XP alone again on that build, from the signed dist, into `ap/b064/compare-examples-reflight`:

    node experiments/operator-theory/compare-examples.mjs --mode <next|providers|regimes|truth|truth2> [--pick showcase] \
      --reflight <store>/ap/b0411/compare-examples-full,<store>/ap/b051/compare-examples-regen,<store>/ap/b062/compare-examples-reflight,<store>/ap/b063/compare-examples-reflight,<store>/ap/ffm220/compare-examples --out <store>/ap/b064/compare-examples-reflight

with XP2F_CONTROL=1 for `truth2` and for `providers --only iss`. Every published example but the two highly elliptical (TESS) examples was flown again, 56 of 56 (`compare-examples-publish.mjs --reflown`): every track of every example equals the published one byte for byte, a largest position difference of 0 m, the 3 THEMIS and Chandra examples above an eccentricity of 0.3 included. None of the 56 is in the switched band. Each example names AP and whiteroom XP on 0.6.4, with `<id>.ocm` (producer sdn-ap-propagator 0.6.4) beside it.

**The cells.** No flight. Outside the band 0.6.4 equals 0.6.3 byte for byte, PRODUCER's version string aside: 106 of 106 seeded sets and 56 of 56 published examples in the switch record (`results/ap-truth/tesseral-switch-by-class/table.json` at 2d6974aae), and the reflight above. The cells' satellites lie outside the band: the 23 with a published example by their element sets in the switch record (`examples`: none in the band, the largest class 0 eccentricity 0.021), the other 37 by their orbits, near-circular laser and altimetry satellites and resonant navigation and geosynchronous satellites, read from no element set here. So every AP and whiteroom XP cell of `cells.json` names 0.6.4 on that identity; its provenance block keeps the builds the cells were flown on (0.5.1, 0.4.11, and 0.6.3 for the THEMIS and Chandra rows), and `hx-0-6-3.json` stays on 0.6.3.

**What the switch moves.** No published example and no cell of `cells.json`. The published cells inside the band are eight class 0 cells of the all-regimes table, which the site does not print; each was flown on both builds, in the same frame, in the switch record. Forward error over the day, in m, 0.6.3 then 0.6.4:

| Cell | RMS | Largest | Roughness | Verdict |
| --- | --- | --- | --- | --- |
| Starlette|0.1 | 136.28 then 130.24 | 319.37 then 247.42 | 3.61 then 0.70 | undecided (attributed) then undecided (attributed) |
| LARES|0.1 | 36.34 then 20.65 | 80.06 then 41.21 | 2.93 then 0.33 | undecided (attributed) then pass (attributed) |
| Jason-3|0.1 | 51.96 then 57.62 | 125.23 then 76.55 | 3.02 then 0.23 | undecided (attributed) then pass (attributed) |
| Ajisai|0.1 | 44.67 then 46.09 | 116.01 then 81.24 | 2.60 then 0.39 | fail (attributed) then undecided (attributed) |
| LAGEOS-1|0.1 | 10.63 then 3.44 | 26.07 then 5.37 | 0.90 then 0.22 | fail (attributed) then pass (attributed) |
| LAGEOS-1|0.2 | 22.44 then 6.61 | 62.70 then 10.26 | 1.61 then 0.21 | fail (attributed) then pass (attributed) |
| LAGEOS-2|0.1 | 12.42 then 3.54 | 32.72 then 6.94 | 0.80 then 0.08 | fail (attributed) then undecided (attributed) |
| LAGEOS-2|0.2 | 24.15 then 6.70 | 72.96 then 14.85 | 1.40 then 0.11 | fail (attributed) then undecided (attributed) |

Largest position difference of the seeded in-band sets over the day, 0.6.3 against 0.6.4: Starlette|0.1 89.2 m, Ajisai|0.1 63.1 m, LARES|0.1 51.8 m, Jason-3|0.1 61.8 m, LAGEOS-1|0.1 22.7 m, LAGEOS-1|0.2 51.2 m, LAGEOS-2|0.1 25.4 m, LAGEOS-2|0.2 52.5 m. The two clause misses in that record stand as measured (Amendment 2 of `TESSERAL-SWITCH-BY-CLASS.md`).
