# GEO force settings: FFM beside AP, report only

Task experiments-ffm-geo-168h-candidate-defect-20261106, re-scoped 2026-11-06 by the SDN-AP session. Registered and pushed before any
ratio of this record was computed. Report only: no module changes here, and no verdict on any geostationary burn comes out of it.

Why: the former premise, an FFM defect at GEO seven days out, rested on a ratio of 1.463 from a subset chosen by the parked per-rev
flag, whose GEO validation failed. On the landed FFM 2.2.0 rerun the all-window GEO cells at 72/72 and 72/168 read parity
(`results/ap-truth/compare/ffm-ap-ratio.json`, sha256 cd44fadc, rows Geostationary fit 72 lead 72 and 168: ratios 1.088 and 1.040,
object-week intervals [0.939, 1.527] and [0.998, 1.742], both holding 1). This record puts the two force models side by side at GEO,
setting by setting and by hash, and reads the all-window ratios again with the interval the brief asks for.

## Disclosed before registration

Read before this file was written: `ffm-ap-ratio.json`'s Geostationary rows above (published 2026-11-06); the inventory of the stores,
which tested each window's AP and FFM figure for presence (finite and above zero) to count the windows a cell will hold, and computed
no ratio; the module sources and manifests named below, by hash. Nothing else.

## The windows

Every geostationary window of the landed cells (`results/ap-truth/compare/cells.json`, sha256 2d5979c6, regime "Geostationary",
provider GFZ, input precise-orbit, reference truth), by id: the 45 keys of group `GE` in `/opt/data/sdn-archive/operator-theory/ap/b0411/regimes`
(`lib/regimes.mjs` GROUPS.GE; AP6.md's BeiDou-2G, BeiDou-3G and QZS-2G satellites against GFZ's multi-GNSS rapid orbits; cutoffs
2025-10-04 to 2025-10-12 every 2 days; 72 h fits). No burn selection: every window enters every cell it has figures for.

GE|C006 BDS-2G|2025-10-04, -06, -08, -10, -12; GE|C011 BDS-2G|2025-10-04, -06, -08, -10, -12; GE|C016 BDS-2G|2025-10-04, -06, -08, -10, -12;
GE|C018 BDS-2G|2025-10-04, -06, -08, -10, -12; GE|C020 BDS-2G|2025-10-04, -06, -08, -10, -12; GE|C217 BDS-3G|2025-10-04, -06, -08, -10, -12;
GE|C229 BDS-3G|2025-10-04, -06, -08, -10, -12; GE|C231 BDS-3G|2025-10-04, -06, -08, -10, -12; GE|J003 QZS-2G|2025-10-04, -06, -08, -10, -12.

A window enters a cell when both arms hold a figure at that lead; the stores hold both or neither at every window and lead (the inventory:
32, 33, 30 and 32 windows at days 1, 2, 3 and 7; the rest have no truth bin there, as `cells.json` counts them). No window is refit or
reflown here.

## The rows

- AP: `propagator/sdn-ap` 0.5.1, wasm d29acd2b5d921446f7da8dbf51f45ba53d59dc7685e677616dcd81944981efdb (modules ea824356), arm `AP72` of
  `ap/b051/regimes`, FORCES (31, 20) with NRLMSISE-00 stated (`all-regimes.mjs` sha256 b09c0d16, PCF_AP; `lib/ap.mjs` sha256 08ecf5f2).
- FFM: `propagator/ffm` 2.2.0, wasm d635a3d57a2c9ca91d111f74aad38b9d748d6c16199b22c6922af21c92fe2153 (modules f1517ef68e), fitted by
  `analysis/estimation` 0.7.0, arm `F72` of `ap/ffm220/regimes`, the high arm `ffmHigh` of `all-regimes.mjs` (every GE window is above
  8,400 km).
- Truth and scoring as the stores were scored (`experiments/ffm-atmosphere-xm3/config.json` sha256 3eea0434, scoring): lead day k is the
  bin (cutoff + (k - 1) d, cutoff + k d], `e` its 3D RMS position error in km in the truth's RTN axes, 300 s grid, a bin entering with at
  least 260 of its 288 epochs. The leads 72/48, 72/72 and 72/168 of the brief are days 2, 3 and 7 of the stores, counted from the end of the
  72 h fit.

## The settings table

The table compares the current builds at the modules commit 93cb5a0584fa728864e4426cc9ceb368936589f9 (clone
space-data-network-modules-covm): FFM 2.2.1, wasm a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4, and AP 0.6.3, wasm
aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e. The rows were flown on 2.2.0 and 0.5.1; the two identities:

- FFM 2.2.1 is 2.2.0 rebuilt on spacedatastandards.org 1.279.0: `git diff --stat f1517ef68e..93cb5a058 -- propagator/ffm/lib propagator/ffm/src`
  touches only `src/cpp/generated/sds/*_generated.h`; no file of `lib/` or `src/cpp/src/` changes (modules commits e746c4a0d, 9cb02c8e2
  "ffm 2.2.1 (wasm only)", 0dfa42a81 the profile's version).
- AP 0.6.3 equals 0.5.1 byte for byte at an eccentricity of 0.3 and below: COMPARE.md's 2026-11-06 reflight of the 56 published examples,
  53 equal (largest position difference 0 m), the 3 that move being THEMIS and Chandra above e 0.3. Every GE window is near-circular.

Each entry names the file it is read from and that file's SHA-256 at that commit; nothing is written from memory. The settings of the
harness's requests (what the stored rows actually flew) stand beside the module's own defaults where they differ. The rows:

| Row | FFM 2.2.1: read from | AP 0.6.3: read from |
| --- | --- | --- |
| Solar pressure: parameterization, what is fitted | `lib/frame.mjs` 9d2084b8 (REFLECTIVITY_COEFFICIENT = SRP_AREA_OVER_MASS on unit area and mass), `all-regimes.mjs` b09c0d16 (ffmHigh: SRP_AREA_OVER_MASS fitted, seed 0.02, a priori sigma 0.2), `src/cpp/src/prw_dynamics.cpp` fd334bbd, `FFM.md` 5de4ffbc (srp) | `SPEC.md` a098f948 §1.1 and §4 (cannonball, P AGOM; AGOM = C_R A/m), §12 (AGOM prior GAUSSIAN_SIGNED 0 +- 0.05 m^2/kg on arcs of 36 h or more), §17.1 (SRP_AREA_OVER_MASS solved), `src/xp_theory.inc` 37651fb8 |
| Solar pressure: constant and Sun distance | `lib/environment_models.cpp` 3547b3ad (SOLAR_FLUX_1AU_W), `lib/force_models.cpp` e5972241 | `src/xp_theory.inc` 37651fb8 (kSrpPressure), `SPEC.md` §4 |
| Eclipse and penumbra | `lib/shadow.h` de9b093d, `lib/force_models.cpp` e5972241 (ShadowModelType::Conical), `FFM.md` (srp shadow) | `SPEC.md` §4 Shadow (cylindrical, Escobal 1965; the GEO eclipse season; output-time SRP terms with no shadow) |
| Earth radiation (albedo and infrared) | `src/cpp/src/prw_dynamics.cpp` fd334bbd (EARTH_RADIATION), `lib/earth_radiation.h` 23f8fe5d, `lib/frame.mjs` (not selected by the harness), `FFM.md` (earthRadiation) | `SPEC.md` a098f948: the words albedo, Earth radiation, earthshine do not occur (grep count 0) |
| Sun and Moon: terms | `lib/frame.mjs` (THIRD_BODY_IDS 10, 301; point masses), `FFM.md` (thirdBodies) | `SPEC.md` §5 (point masses to the octupole, averaged), §7 (period at or above 1100 min: instantaneous point-mass geometry, 95-minute steps, no output-time lunar-solar periodics), §16.8 (degrees 4 to 10 only below 1100 min) |
| Sun and Moon: ephemeris | `experiments/ffm-atmosphere-xm3/config.json` 3eea0434 (de440s.bsp c1c7feea on the kernel port), `lib/host.mjs` 47373ddb, `lib/frame.mjs` (EPHEMERIS_SOURCE JPL_SPK) | `SPEC.md` §5 (analytic Sun; Brown's main terms for the Moon; JPL ephemerides only when loaded, not by this module) |
| Earth tides: solid, ocean, pole | `lib/frame.mjs` (SOLID_TIDES NONE when solidTides is false; OCEAN_TIDES absent), `all-regimes.mjs` (ffmHigh solidTides: false), `src/cpp/src/prw_dynamics.cpp` fd334bbd, `FFM.md` (solidTides, oceanTides, poleTide) | `SPEC.md` a098f948: the words solid tide, ocean tide do not occur (grep count 0); §16.8's "tidal acceleration" is the third bodies' potential, not an Earth tide |
| Gravity: field and degree at GEO | `all-regimes.mjs` (ffmHigh: SPHERICAL_HARMONICS 20x20), `src/cpp/src/prw_dynamics.cpp` fd334bbd (SPHERICAL_HARMONICS is the embedded EGM2008 to the stated degree and order), `lib/force_models.cpp` e5972241 | `lib/ap.mjs` 08ecf5f2 (FORCES 31, 20), `SPEC.md` §1.3 (EGM-96 zonals), §6.1 (the one-day class's 27 resonant terms), §16.2 (EGM-96 tesserals: m-daily and first-order to 12, near-resonant to 31), §16.3 (zonal tail J6 to J20), `src/tesseral.inc` f48d086f |
| Integrator and step | `all-regimes.mjs` (ffmHigh integrator: RK78, tolerance 1e-8, steps 1e-3 to 300 s), `lib/frame.mjs` | `SPEC.md` §9, §16.4 and §16.10 (the one-day class's 38-minute grid) |
| Frame and Earth orientation | `lib/frame.mjs` (GCRF in and out), `config.json` (IERS finals rows on the earth_orientation port), `FFM.md` (frames) | `SPEC.md` §10 and §16.4 (TEME of date; GCRF through `src/gcrf.inc` 22fb1c91, 12-hour nodes) |

The last two rows are beyond the brief's list and are carried because they differ between the two models; they enter the verdict rule
like the others.

## The scoring

For each cell (fit 72; lead 48, 72, 168 h) on GFZ truth: the windows above with both figures; the statistic exp(median over windows of
ln(F72.e / AP72.e)), as `ffm220-ratio.mjs` (sha256 8418fe02) defines the paired ratio. Its 95 % interval: the window is the cluster, as
the brief asks; 10,000 draws of the windows with replacement, the seed the first 8 hex digits of SHA-256 of `FFM-GEO-168H|GFZ|<fit>|<lead>`,
the 2.5th and 97.5th percentiles of the draw medians, exponentiated. Beside it, report only, the object-week interval as
`ffm220-ratio.mjs` computes it (clusters of satellite and ISO week of the cutoff, same draw count, seed `FFM-GEO-168H|GFZ|<fit>|<lead>|object-week`),
so the two can be read together. Per satellite, the same ratio and its window count, information only.

WAAS message type 9, the owner's truth for commercial GEO: no GFZ window has an MT9 counterpart (the GFZ satellites are BeiDou and QZSS;
MT9 carries Galaxy 30, SES-15 and Eutelsat 117 West B), so no cell overlaps. The MT9 column is a second population: separate satellites,
separate truth. It stands beside the GFZ column and is never read against it; agreement or disagreement between the two columns is not
validation of either and is not read as such, here or in the table (SDN-AP session, 2026-11-06). Its windows: group `WA` (`lib/regimes.mjs`;
`GEO-TRUTH.md` part W; cutoffs 2026-09-02 to 2026-10-26 every 2 days, 84 windows), the same fit (72 h) and leads, AP 0.5.1 `AP72` of
`ap/b051/regimes-wa` against FFM `F72` of `ap/b0411/regimes-wa`, which is `propagator/ffm` 2.0.4 (wasm
c36f1b14fc233e88725d57724c3bae7ad025cfdd9d8d4520c3bcccd0f8a816b2): `cycle-ffm220.sh` did not rerun `regimes-wa`; the column is labeled
FFM 2.0.4, never 2.2.x, with the identity cited: the 2.0.4 to 2.2.0 move was 0.000 on every geostationary cell of `ffm-ap-ratio.json`
(before equals after in all four). The statistic and intervals as above, seeds `FFM-GEO-168H|MT9|...`. Beside every MT9 figure: the
broadcast's revolution-to-revolution noise is about 45 m, the per-rev record's measurement (experiments-ffm-step-flag-per-rev-20261105,
as the SDN-AP session states it); it is not measured here, and no landed per-rev file at experiments 1d12fb5b prints the figure, so the
table cites it as relayed. The measured bound this store holds beside it: FFM fitted to 24 h of Galaxy 30's broadcast predicts it one
day ahead to a median of 0.060 km between burns (`results/ap-truth/geo/README.md` sha256 324443db). The registered WAAS burns
(`results/ap-truth/geo/burns-waas.json` sha256 4965572b, Galaxy 30's five north-south burns) are counted per cell in the fit arc and in
the forecast to the lead, information only; no window is selected or dropped by them.

## The verdict rule

A cell is a loss when its window-cluster 95 % interval lies wholly above 1 (FFM worse than AP on the paired windows beyond the interval).
For a loss, the settings table is read row by row for a setting where FFM's choice is the weaker at GEO: a term AP carries and FFM does
not, a coarser model of the same term, or a parameter AP fits and FFM holds. A row where FFM's choice is the richer cannot explain an
FFM loss. A setting found names an FFM record to fix, `modules-ffm-geo-<setting>-20261106`, with the row and both hashes. A loss with no
such row is reported as a loss the settings do not explain, and names no record. With no loss in any GFZ cell the verdict is "nothing
to explain at GEO today". The MT9 column decides nothing and checks nothing: a second population (separate satellites, separate truth,
other dates, FFM 2.0.4), reported for itself and never as a cross-check of the GFZ ratios. No GEO burn verdict comes out of this record: burns are counted where a registered record counts them, never judged.

## Outputs

`ffm-geo-168h.mjs` writes `results/ap-truth/ffm-geo-168h/table.json` (the settings table with every source and hash, every cell with its
ratio, both intervals, window and satellite counts, per-satellite ratios, the MT9 column with its noise statement and burn counts, the
verdict) and `README.md` (the same as prose and tables). `--check` recomputes the table from the stores, holds `table.json` to the bytes
the generator writes, re-hashes every experiments-side source named in the table, re-hashes the module sources when `SDN_MODULES_ROOT`
names a checkout holding them (else says so), and prints the verdict; PASS when all hold. Acceptance: `node
experiments/operator-theory/ffm-geo-168h.mjs --check` PASS.

Afterwards, in its own sdn-ap record: the settings table goes to the paper's methodology. What that record should say is reported with
the table; no sdn-ap or modules file changes here.
