# The geosynchronous SGP4 baseline in one SGP4 mode, and the Space Force XP arm's gap separated by fitter and library

Registered 2026-11-04, before any fit below. A re-measurement, report only: no statement passes or fails. Task `experiments-geo-sgp4-one-mode-rerun-20261104`. `geo-sgp4-run.mjs`, `geo-sgp4-table.mjs` and `geo-sgp4-one-mode.e2e.mjs` beside this file carry it out; they are written after this file and change none of its rules.

## Why

The record, 2026-11-04: "The SGP4 arm was fitted by `analysis/gp-error-model` 0.11.0 in improved mode (the pinned 2026-10-30 build, modules fbda894501) and flown by `propagator/sgp4` in AFSPC mode (COMPARE.md). [...] The modes part on low-inclination deep-space sets whose node passes 0 [...] no GE window has been counted. The geostationary ratio therefore carries two biases of opposite sign: the SGP4 arm may be pessimistic by an unmeasured amount, and the Space Force XP arm is measured 5.6x (day 1) to 1.15x (day 7) behind whiteroom XP on the same windows. The net direction is unknown". And: "Top suspects: the Space Force fitter's numerics through the library's text-only interface [...], then the AGOM prior".

## Windows

Exactly the stored windows, by key; nothing is added for truth that arrived later.

- `GE`, `IG`: `AP6.md`, 72 h arcs, cutoffs every 2 days from 2025-10-04 to 2025-10-13, GFZ multi-GNSS rapid orbits; the keys of `ap/b0411/regimes`.
- `WA`: `GEO-TRUTH.md` part W, 24 h and 72 h arcs, the keys of `ap/b0411/regimes-wa`.
- `GF`: `GEO-TRUTH.md` part F, the Galaxy 30 and SES-15 operator files, 24 h and 48 h fits, the keys of `ap/b0411/geo-files/rows.jsonl`.
- Node count only, no refit: `HE` (TESS, 72 h and 336 h) and `HX` (THEMIS A, D, E and Chandra, 72 h and 168 h), the keys of `ap/b0411/regimes`.

The reading of each window (arc, coverage rule, grid, lead bins, scorer) is the one its registration states, unchanged.

## Builds

Every artifact by `git show <commit>:<module>/dist/isomorphic/module.wasm` and its `plugin-manifest.json`, SHA-256 checked, never a working tree.

| Role | Module | Commit | SHA-256 |
|---|---|---|---|
| SGP4 fit, one mode | `analysis/gp-error-model` 0.14.0 | modules origin/main f34c12c0e9d61981a6149c818271b34a5d6e6ff6 | d57e970b1b46f1c95d392443c4a1bf481c54f1825a50ea33aa32ddd29dd35cfc |
| SGP4 flight, as before | `propagator/sgp4` | 9a05d899b95242b358939ab1d68a776170a6b167 | 2fe246b716c78a4b947cd95e70e126b7a738cbbb9775e5196f07b1fe551f4643 |
| Whiteroom XP, the stores' build | `propagator/sdn-ap` 0.4.11 | a0f33bc545d76f47d679c7854c6963fb8efcf799 | e4edacb03daff4eaba47263010c27009a6d888259c0d8f028605cebf4d655610 |
| Space Force XP, the stores' build | `propagator/sgp4-xp` (library Sgp4Prop 9.1.1.0) | 1b905d16f68fc56e7da66c6392315970f9e7e6d0 | f61b15c4fd658817e3e43c7818da18c4d08d453ad28e9d704b0cd11b616b7deb |
| Frames, scorer | `foundation/frames`, `analysis/gp-error-model` (pair statistics) | as the stores ran them (`xp2-fit-design/build.json`) | as there |

gp-error-model 0.12.0 to 0.14.0 change `fit_elements` only by the mode (`sat_init` takes `Sgp4Mode::kAfspc`); 0.13.0 and 0.14.0 change `object_covariance`, which no arm here calls.

## Arm (a): SGP4 refit in one mode

`S1`: `fit_elements` of the 0.14.0 build, with the options the stored `S` arm used (epoch at the arc's first state, B* fitted, closure off), flown by `propagator/sgp4` exactly as the stored `S`. Stored `S` stays as it is; `S1` stands beside it.

Per group and lead (days 1, 2, 3, 7): windows and satellites, failures per arm, median and 95th percentile of `S` and of `S1` over the windows where both scored, and the per-window shift `S1 - S`.

Node condition. For each window, the truth states of its fit arc and its seven scored days, one per hour, are turned from GCRF to TEME by `foundation/frames`; from each TEME state the osculating inclination and right ascension of the ascending node are read (orbit normal r x v; a classification statistic, no state enters any score). The window **crosses** when two successive hourly nodes lie one in [0, 90) degrees and the other in (270, 360); **near** when it does not cross and its smallest angular distance from 0 is under 5 degrees. The condition holds when it crosses or is near. Reported per group: windows that cross (downward and upward apart), near, neither; the median inclination; and how many lie below 0.2 rad (11.46 degrees), the only inclinations at which the modes' Lyddane branches can part (`foundation/sgp4-str3/src/sgp4_core.inc`). The modes also differ in Greenwich at epoch (AFSPC's 1970 series against IAU 1982), which acts on every deep-space set; it is not separated here.

A window **moves** when `|S1 - S|` exceeds 0.001 km at any scored day. Reported per group: windows that move with and without the condition.

## Arm (b): the 2x2 on GE and IG

{whiteroom fitter, Space Force fitter} x {whiteroom propagator, Space Force library}, 72 h arcs, every set on the two-line lattice (sdn-ap's SGP4XP sets are rounded to two-line digits and searched on that lattice; sgp4-xp's are lattice points by construction).

- `WW`: whiteroom fit, whiteroom flight: the stored `XP72` of `ap/b0411/regimes`.
- `SS`: Space Force fit, Space Force flight: the stored `U72` of `ap/b040/ussf-regimes`.
- `WS`: the whiteroom set flown on the Space Force library.
- `SW`: the Space Force set flown on the whiteroom propagator.

The stores hold no element sets, so both fitters are rerun on GE and IG to obtain them; each refit is also flown on its own propagator and reported beside its stored cell (a reproduction check), and the stored cells stay the `WW` and `SS` figures. A cross cell that would need a module change (a set one module will not take) is left empty with its reason.

Decision rule, day 1, paired windows of each group: the library is cleared if the median of `WS / WW` by window lies in [0.8, 1.25] and that of `WS / SS` below 0.5; the fit is confirmed if `SW / SS` lies in [0.8, 1.25] and `SW / WW` above 2. Otherwise neither is stated.

## Unchanged arms

AP, whiteroom XP, Space Force XP and FFM are read from the stores and never rerun (the refits of arm (b) are new arms beside them).

## Statistics

Paired windows only: a contrast uses the windows where every arm it names scored that day. For each, the count of windows and satellites, the failures per arm, the median and 95th percentile per lead, and the paired ratio: the exponential of the median by window of ln(x / y), with a 95 % interval from 10,000 draws of satellites with replacement (all windows of a drawn satellite enter; seed from SHA-256 of the contrast's name), the 2.5th and 97.5th percentiles. Ratios of SGP4 (`S` and `S1`) against both XP builds (whiteroom `XP` and Space Force `U`).

## Tables

`results/operator-theory/geo-sgp4-one-mode/README.md` and `results.json`, previous values beside the new. `results/ap-truth/compare/regimes.json` and `regimes.md`: the GE and IG cells' SGP4 figures become `S1`'s, every other row byte-identical. `table.json` holds no GE, IG, WA or geostationary-provider row and stays byte-identical. The WA and part F tables (`results/ap-truth/geo`) and the site's `cells.json` are outside this task's paths: their new SGP4 figures are given in `results.json` for the site task to move.

## Limits

- The node condition reads osculating nodes; the modes part on the mean node inside the theory.
- GE and IG are about 9 and 12 satellites over 5 cutoffs; WA 3 satellites.
- Whiteroom's fitter had exploratory exposure to the GE and IG windows (`propagator/sdn-ap/README.md`).

No arm, window, rule or margin changes after this registration.
