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
