# GEO gravity degree: the 45 GE windows flown again with FFM at 70x70, report only

Task modules-ffm-geo-gravity-field-and-degree-at-geo-20261106 (SDN-AP session, 2026-11-06). Registered and pushed before any row of
this record was flown. Report only: no module change, no change to `results/ap-truth/compare/cells.json` (the audit's cells stay as
published), no verdict on any geostationary burn.

Why: the GEO force-settings audit (`FFM-GEO-168H.md`, `results/ap-truth/ffm-geo-168h/table.json`) read a loss at 72/168 by its
registered letter (FFM 2.2.0 / AP 0.5.1 1.040 on 32 windows, window-cluster 95 % interval [1.000276, 1.520], a loss by 0.0003; the
object-week interval holds 1) and named the gravity row by elimination: FFM flew the embedded EGM2008 at 20x20 while AP carries EGM-96
near-resonant tesserals to degree 31. This record tests that row the one way it can be tested without touching a module: the same
windows, the same fit, the same everything, with the degree and order raised to 70.

## Disclosed before registration

Read before this file was written: the audit's `table.json` and `README.md` (published 2026-11-06, commit 42115bef); the stores
`ap/ffm220/regimes` and `ap/b051/regimes` for the shape of a row (one window, `GE|C006 BDS-2G|2025-10-08`, both arms) and the audit's
window inventory; `all-regimes.mjs`, `lib/host.mjs`, `lib/frame.mjs`, `lib/fit.mjs`, `lib/ap.mjs`, `lib/xm3.mjs`, `lib/regimes.mjs`,
`cycle-ffm220.sh`, `ffm-geo-168h.mjs` and `lib/compare.mjs` for how the stored rows were flown and scored; COMPARE.md's store
paragraphs. No FFM figure at 70x70 on any GE window exists anywhere in this repository or its stores, and none was computed.

## The windows

The audit set, by id: the 45 keys of group `GE` in `ap/b0411/regimes` with no error (the 45 windows `FFM-GEO-168H.md` lists; 9
satellites, cutoffs 2025-10-04 to 2025-10-12 every 2 days, 72 h fits, GFZ multi-GNSS rapid orbits as truth). No burn selection: every
window enters every cell it has figures for. The script holds the 45 ids and refuses to fly any other.

GE|C006 BDS-2G|2025-10-04, -06, -08, -10, -12; GE|C011 BDS-2G|2025-10-04, -06, -08, -10, -12; GE|C016 BDS-2G|2025-10-04, -06, -08, -10, -12;
GE|C018 BDS-2G|2025-10-04, -06, -08, -10, -12; GE|C020 BDS-2G|2025-10-04, -06, -08, -10, -12; GE|C217 BDS-3G|2025-10-04, -06, -08, -10, -12;
GE|C229 BDS-3G|2025-10-04, -06, -08, -10, -12; GE|C231 BDS-3G|2025-10-04, -06, -08, -10, -12; GE|J003 QZS-2G|2025-10-04, -06, -08, -10, -12.

## The flight

- Build: `propagator/ffm` 2.2.1 at modules 93cb5a0584fa728864e4426cc9ceb368936589f9, wasm
  a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4, read by `lib/ap.mjs` `pinnedFile` (git show at the commit from the
  read-only clone `space-data-network-modules-covm`, SHA-256 checked) through `lib/host.mjs` `openFfmHost({ ffm })`; fitted by
  `analysis/estimation` 0.7.0 at XM3's pin (modules 9a05d899b, wasm 7a555ca5), as every stored FFM row is. The 2.2.1 to 2.2.0 identity
  is the audit's: between modules f1517ef68e and 93cb5a058 only `propagator/ffm/src/cpp/generated/sds/*_generated.h`, `package.json`
  and `plugin-manifest.json` change; no file of `lib/` or `src/cpp/src/`. Every row carries the wasm hash; `--check` holds it.
- Settings: `all-regimes.mjs` `ffmHigh()` with the degree and order at 70 and nothing else changed. Gravity `SPHERICAL_HARMONICS`
  (the embedded EGM2008, every coefficient to the stated degree and order) at 70x70; Sun and Moon point masses (THIRD_BODY_IDS 10,
  301) from the DE440s kernel (sha256 c1c7feea...) on the kernel port; SRP on, SRP_AREA_OVER_MASS fitted (seed 0.02 m^2/kg, a priori
  sigma 0.2); conical shadow (the module's cannonball path, `lib/shadow.h`); drag off; no solid, ocean or pole tide; no Earth
  radiation; relativity NONE; RK78 at relative tolerance 1e-8 (absolute 1e-5 per component), steps 1e-3 to 300 s, initial 60 s;
  IERS finals rows from `environment.json` (sha256 520b825d...) on the earth_orientation port; sigmaM 10 m, maximumIterations 40,
  correctionTolerance 0.01, sigmaEditThreshold 0, the diagonal a priori of `lib/host.mjs` `apriori([0.2])`. No space weather enters: with
  drag off `lib/host.mjs` passes none to the fit or the flight (the stored rows flew the same way).
- How the degree is passed: there is no `$OCM`/`$PCF` file in this harness. `lib/frame.mjs` `executionFrame` writes the forces into the
  `$PRW` execution request's `PCFForceModel` as `MAXIMUM_DEGREE` 70 with `HAS_MAXIMUM_DEGREE` and `MAXIMUM_ORDER` 70 with
  `HAS_MAXIMUM_ORDER` (the module reads them in `src/cpp/src/prw_dynamics.cpp`, SPHERICAL_HARMONICS to the stated degree and order);
  the same frame is answered to `analysis/estimation` `fit_batch` for every propagation of the fit (`lib/fit.mjs` `fitV3`), so the fit and
  the flight are both at 70x70.
- Fit arc, truth, grid and scoring exactly as `all-regimes.mjs` flew the stored rows: the 72 h arc before the cutoff thinned by XM's
  `truth.mjs` `thinned().chosen` (coverage at least `fit.minimumCoverage`), the seed state the arc's first state; the forecast on the
  truth's 300 s grid in (cutoff, cutoff + 7 d]; lead day k the bin (cutoff + (k - 1) d, cutoff + k d] entering with at least 260 of its
  288 epochs; `e` the 3D RMS of the RTN position error in km (XM's `modules.mjs` `rtn`). Days 2, 3 and 7 are the cells 72/48, 72/72 and
  72/168, counted from the end of the 72 h fit.
- Store: `/opt/data/sdn-archive/operator-theory/ap/ffm221-70x70/regimes/rows-<k>.jsonl`, arm `F72`, at most 4 shards (a window's shard
  the first 8 hex of SHA-256 of its key modulo the shard count, as `all-regimes.mjs`), each row stamped `flownAt`; `run.log` records the
  start of every run with the commit of this file. A rerun adds only what is missing. The script refuses to fly while this file is
  uncommitted or differs from HEAD.

## The AP rows

As stored: `propagator/sdn-ap` 0.5.1, wasm d29acd2b5d921446f7da8dbf51f45ba53d59dc7685e677616dcd81944981efdb, arm `AP72` of
`ap/b051/regimes`, FORCES (31, 20) with NRLMSISE-00 stated. No AP flight here. The identity to the current build is the audit's: AP 0.6.3
equals 0.5.1 byte for byte at an eccentricity of 0.3 and below (COMPARE.md's 2026-11-06 reflight of the 56 published examples, 53 equal with
a largest position difference of 0 m, the 3 that move being THEMIS and Chandra above e 0.3); every GE window is near-circular.

## The statistic

The audit's, unchanged: for each cell (fit 72; lead 48, 72, 168 h) the windows with both figures (the new F72 at 70x70 and the stored
AP72); exp(median over windows of ln(F72.e / AP72.e)); its 95 % interval with the window as the cluster, 10,000 draws of the windows with
replacement, the 2.5th and 97.5th percentiles of the draw medians, exponentiated. Five seeds per bound: seed i (i = 1 to 5) is the first 8
hex digits of SHA-256 of `FFM-GEO-70X70|GFZ|72|<lead>|seed<i>`; the ratio is the same under every seed, the bounds move, and the table
prints every bound with the spread (the lowest and highest lower bound and their range) beside it. Beside it, report only, the object-week
interval (satellite x ISO week of the cutoff, the same five seeds, tag suffix `|object-week`).

Two more figures, information only, each on the same windows with the same five seeds:

- the audit's 20x20 cells read again from `ap/ffm220/regimes` under the five seeds (tag `FFM-GEO-70X70|GFZ-20x20|...`), so the Monte Carlo
  spread of the bound the audit's loss rests on is shown beside the new one;
- the degree effect: exp(median ln(F72 at 70x70 / F72 at 20x20)) with its window-cluster interval, what raising the field does to FFM's own
  GEO error, independent of AP.

## The reading rule

A cell is a loss when its window-cluster 95 % interval lies wholly above 1 (the unrounded lower bound above 1). The verdict reads 72/168;
72/48 and 72/72 are reported by the same rule and decide nothing.

- **No longer worse:** the 70x70 lower bound at 72/168 is at or below 1 under all five seeds, and the degree effect at 72/168 is below 1
  with its interval wholly below 1 (70x70 measurably lowers FFM's own error). Reading: the 20x20 choice at GEO leaves out terms that
  matter there; an FFM configuration record follows (CHEAPER.md, the GEO degree), named in the table with what it should set.
- **Still worse:** the 70x70 lower bound at 72/168 is above 1 under all five seeds. Reading: gravity is ruled out; the eclipse model,
  the ephemeris and the frames stay report-only candidates; no record named.
- **Within the Monte Carlo spread:** the five seeds disagree on the bound's side of 1, or the bound passes below 1 while the degree effect's
  interval holds 1 (the forecast did not move; the bound moved by draw noise). Reading: the record resolves nothing about the gravity row;
  gravity is neither ruled out nor confirmed, no record named, and the next step is more windows, not more draws.

Operating characteristics of the reading, stated so the result is read for what it can show: the audit's bound sits 0.0003 above 1 on 32
windows, so its side of 1 is at the mercy of the draw and of any change in a single window's error; the five-seed spread measures the first,
the degree effect measures the second. A degree effect of 1.000 with a narrow interval (every window's 70x70 error equal to its 20x20 error
to the figure's precision) means the gravity terms above degree 20 do not reach a GEO forecast at this truth's noise, which clears the
row whatever the AP bound does. The window-cluster interval's width at n of about 32 (the audit's [1.000, 1.520]) bounds what one such
record can resolve: a true FFM/AP ratio within a few percent of 1 is not decidable on these windows, and the rule says so through the third
reading rather than forcing one of the first two.

## Outputs

`ffm-geo-70x70.mjs --fly --shard k/n` (n at most 4) flies the windows of shard k into the store. `ffm-geo-70x70.mjs` (no flag) writes
`results/ap-truth/ffm-geo-70x70/table.json` (the builds and hashes, the 45 ids, every cell with its ratio, its five bounds and their spread,
the object-week intervals, the 20x20 re-read, the degree effect, per-satellite ratios, the verdict with the rule's three readings and which
one holds) and `README.md` (the same as prose and tables). `--check` recomputes both from the stores, holds them to the bytes on disk,
holds every row's wasm hash to 2.2.1's, re-hashes every experiments-side source named, re-hashes the module files when `SDN_MODULES_ROOT`
holds them, verifies that this file's registering commit predates the store's first `flownAt`, states the five-seed spread and the verdict,
and prints PASS or FAIL. Acceptance: `node experiments/operator-theory/ffm-geo-70x70.mjs --check` PASS.

What follows is named by the verdict and done in its own record, never here: no module, catalog or `cells.json` change.
