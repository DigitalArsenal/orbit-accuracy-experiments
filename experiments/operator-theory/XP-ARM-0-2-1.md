# The Space Force XP on sgp4-xp 0.2.1: the next-file pairs

Written 2026-11-04, before any fit of this arm on these pairs. Report only, as `COMPARE.md`'s two versions of XP: no claim rests on it. Record `experiments-xp-arm-rerun-0-2-1-20261104`.

## Why

`propagator/sgp4-xp` 0.1.1, which flew every Space Force XP figure the site shows, returned partial integrator steps for requests less than one step apart; 0.2.1 flies whole steps. On AP5's and AP6's windows the flights on 0.2.1 are stored (`ap/b051`, `results/remeasure-0-5-1.md`) and are taken as they stand, not refitted. This file registers the rest: every next-file pair the Space Force XP was flown on.

## The arm

`U-XP@<arc>`, as on 0.1.1: `fit` of the arc's `$OEM` (one `$OCM`), then `propagate` of that `$OCM` alone at the reference's times; TEME to GCRF by `foundation/frames`; the radial, in-track and cross-track errors by `analysis/gp-error-model` `pair_statistics`; the figure is the root sum square of their RMS over the reference's first 3 h (`lib/ussf-xp.mjs`, `compare-sgp4.mjs`, `providers-run.mjs`).

Builds, each wasm by `git show` at its commit, SHA-256 checked:

- `propagator/sgp4-xp` 0.2.1, modules ea824356587f54149f876cd3b2b5d8134af682d3, wasm 816fd137d76197f2af93501d7d71c527383f7589ab698d5d1d3544782cd2feef (`lib/build.mjs` `PIN`).
- Scoring, at `experiments/xp-atmosphere-merit/build.json` (modules 33ae3750769b8b27de440e4d2305c7803a4e7dcb): `foundation/frames` 486acaa334705b97d3a975b8a3d90f4bfd2428af77c6b5086c970ed1f24e27a4, `analysis/gp-error-model` d57e970b1b46f1c95d392443c4a1bf481c54f1825a50ea33aa32ddd29dd35cfc.
- Beside it, 0.1.1's rows as stored: `ap/b0411/ussf-laser` and `ap/b0411/ussf-providers`.

## The pairs

Exactly the keys of the 0.1.1 rows (`--pairs`), so each pair is flown by both builds; a pair that does not run is counted, not replaced.

- Laser: `compare-sgp4.mjs --arms U --arcs 48,72 --regime all --root ap/b0411/laser --pairs ap/b0411/ussf-laser`. `CHEAPER.md`'s 54 days of ILRS prediction files, 19,399 pairs: low orbit 7,404 (27 center and satellite pairs), higher orbits 11,995 (53), older files from 2026-02-27 to 2026-05-02. Fits of 48 h and 72 h from each file's first state.
- Providers: `providers-run.mjs --arms U --pairs ap/b0411/ussf-providers`, and with `--iss`. 2,499 pairs: GPS 1,202 and GLONASS 756 (ESA ultra-rapid), Planet 278, Intelsat 126, SES 99, the China Space Station 1, and the ISS 37 from NASA's archive, 2026-01 to 2026-05. Fits of 24 h and 48 h.
- The reference and the pair rule are those of the 0.1.1 rows: a lead runs from the start of the older file to the start of the newer, over 6 h and at most 180 h. The Space Force XP reads no weather.

## Held

Not read: every Starlink group (its stored pairs are not flown; the SpaceX cells keep their 0.1.1 figures and name that build), Swarm and GRACE-FO truth after 2026-10-31, C2's six Galileo satellites (NORAD 43567, 37847, 41862, 41174, 43055, 41175) and its other held objects (`lib/vendors.mjs` `EXCLUDE_NORADS`), and every operator capture. None is in these pairs. No SGP4 set enters this arm.

## Statistics, as before

Per cell of `results/ap-truth/compare/cells.json` (reference, regime, provider, satellite, fit, lead bin): the median and 95th percentile km and the count. Per provider, regime, fit and lead: the 0.1.1 median beside the 0.2.1 median on the same pairs. Rows: `/opt/data/sdn-archive/operator-theory/ap/xp-arm-0-2-1/ussf-laser` and `ussf-providers`. Tables: `results/operator-theory/xp-arm-0-2-1`.

## Amendment 1, 2026-11-04, before any of its fits: the two cells that moved the wrong way

The record's second amendment: two Space Force XP cells of `results/remeasure-0-5-1.md` are worse on 0.2.1, HX `U72` day 2 (1.46 to 1.90 km, 19 windows) and LS `U24` day 7 (8.98 to 10.78 km, 90 windows). Each window's change is split into a flight part and a fit part, by three flights beside the stored figures, a (0.1.1) and b (0.2.1):

- `U11`: sgp4-xp 0.1.1's set (modules 1b905d16f68fc56e7da66c6392315970f9e7e6d0, wasm f61b15c4fd658817e3e43c7818da18c4d08d453ad28e9d704b0cd11b616b7deb, by `git show`, SHA-256 checked), taken into 0.2.1 by `ingest_omm` and flown on 0.2.1.
- `U11F`: the same set flown on 0.1.1; it must give a. `U`, the 0.2.1 refit flown on 0.2.1, must give b.
- `UW`: 0.2.1's set flown on the whiteroom propagator, `propagator/sdn-ap` 0.5.1 `propagate`.

The flight part is `U11` less a, the fit part b less `U11`; a window is flight side when the flight part is the larger in size, fit side otherwise. `all-regimes.mjs --arms U,U11,U11F,UW`, HX with `--arcs 72` and LS with `--arcs 24`, into `ap/xp-arm-0-2-1/attribution`; every window reported in `results/operator-theory/xp-arm-0-2-1`. TESS (HE `U72`) is stated as measured. The geosynchronous ratio against SGP4 is the median of each window's ratio, on stored rows.

## Amendment 2, 2026-11-04, before U11 flew

0.2.1's `ingest_omm` refuses 0.1.1's `$OMM` for its free-form `USER_DEFINED_PARAMETERS`, the fit's own notes (FIT_START, FIT_STOP and the like), so no `U11` figure was made and the first attribution rows were removed. `U11` now takes 0.1.1's set with that list dropped and every typed field as fitted (`lib/ussf-xp.mjs` `typedOmm`). On one ISS file the two builds fly that set to the same position, within a millimeter, at four times a day apart.
