# AP beside XP, SGP4 and FFM against precise orbits, in the regimes AP5 did not reach

Registered 2026-11-02, before the full run, with one disclosed exception: a smoke test of 19 windows across the groups was read first, to check the readers. It changed how TESS and coarser product grids are read, and no arm, setting, window or rule; those windows stay in. `all-regimes.mjs`, `lib/regimes.mjs`, `cycle-ap6.sh` and `ap6-verdict.mjs` beside this file are part of the registration.

The owner, 2026-11-02, verbatim: "We need comparisons for all regimes, not just low satellites".

## What this adds

`AP5.md` covers strong drag, near 700 km and medium Earth orbit. This covers the rest of what has real precise orbits here, with the same arms, settings and statistics. Apart from that smoke test, no arm has been fitted to these windows at this build; other builds and arcs of earlier tests have read parts of these products, and no setting here was chosen on them.

## Groups, truth and windows

| Group | Satellites | Truth | Cutoffs at 00:00 UTC | Arcs |
|---|---|---|---|---|
| `LS` low orbit, laser spheres | Ajisai, Starlette, Stella, WESTPAC, LARES, Larets | ILRS analysis-center orbits (NSGF) | every 5 days, 2025-10-10 to 2025-12-21 | 24 h, 72 h |
| `DO` low orbit, altimetry | Jason-3, Sentinel-3A, 3B, 6A, 6B, SARAL, SWOT, CryoSat-2, HY-2C, HY-2D | CNES precise orbits from DORIS | every 5 days, 2025-10-10 to 2025-12-21 | 24 h, 72 h |
| `GD` laser geodetic, above 5,000 km | LAGEOS-1, LAGEOS-2, Etalon-1, Etalon-2, LARES-2 | ILRS combined orbits; LARES-2 NSGF | every 7 days, 2025-10-11 to 2025-12-21 | 72 h |
| `IG` inclined geosynchronous | BeiDou and QZSS | GFZ multi-GNSS rapid orbits | every 2 days, 2025-10-04 to 2025-10-13 | 72 h |
| `GE` geostationary | BeiDou and QZSS | GFZ multi-GNSS rapid orbits | every 2 days, 2025-10-04 to 2025-10-13 | 72 h |
| `HE` highly elliptical, 13.7-day orbit | TESS | the mission's definitive ephemeris (MAST) | every 7 days, 2026-07-27 to 2026-09-10 | 72 h, 336 h |

A window's arc must hold at least the fit's minimum coverage, and a lead day 90 % of its states on the product's grid, or it leaves that cell, counted. Swarm and GRACE-FO truth after 2026-10-31, C2's rows, and every operator capture are not read.

## Arms

As `AP5.md`: `AP`, `XP`, `S`, `F`, with the hours of the arc after the name. `HE` reaches no drag, so `AP` there runs without an atmosphere and no weather is read. FFM runs at `CHEAPER.md`'s settings by altitude: below 8,400 km 40x40 with tides, above it 20x20 without drag.

## Statements

`AP5.md`'s statistics.

1. `LS`: `AP72` beats `XP72`: rule 1 at days 1 and 3; rules 2 and 3 at days 1, 2, 3 and 7.
2. `DO`: the same.
3. `GD`: the same.

Report only: `IG`, `GE` and `HE`, which are few satellites over a short span; every contrast with `S` and `F`; every other arc.

## Added 2026-11-02, report only

`HX`: THEMIS A, D and E over 2013-02-08 to 2013-02-24, every 2 days from 2013-02-11 to 2013-02-17, 72 h; Chandra over 2018-03-01 to 2018-04-30, every 7 days from 2018-03-08 to 2018-04-19, 72 h and 168 h. From NAIF's public kernels, read as TESS is, the same arms, added so that highly elliptical orbits do not rest on one satellite. It joins no statement above. The owner, 2026-11-02: "ALso we don't seem to have GEO or HEO orbits, are we just missing satellites in those regimes?"

## Limits

- Every fit reads precise products, published after the fact.
- `LS` and `DO` are not strong-drag orbits. They say nothing about storms.
- No figure here covers maneuvering fleets, debris or a whole catalog.

No arm, window, margin or rule changes after this registration.

## Re-measured 2026-11-04 on one $OCM in, report only

Build: modules ea824356, `propagator/sdn-ap` 0.5.1 (wasm d29acd2b5d92) and `propagator/sgp4-xp` 0.2.1 (816fd137d761), replacing this registration's AP 0.4.0 (715ef2fee512) and the Space Force XP's sgp4-xp 0.1.1. `all-regimes.mjs` fitted `AP`, `XP` and the Space Force XP as one `$OCM` each and flew it alone, on these windows, truth, grid and as-issued weather, into `ap/b051` (`lib/remeasure.mjs`, `results/remeasure-0-5-1.md`); `HX` and the WAAS geostationary group with them.

- `AP`: every row stored at AP 0.4.18 (`ap/b0418`, AP9.md) is equal byte for byte (548 arm rows); against AP7.md's 0.4.11 rows 255 of 824 arm rows differ, the windows where 0.4.18 departs from 0.4.11. This registration's 0.4.0 rows stand as registered.
- `XP`: every row equals AP7.md's 0.4.11 rerun (`ap/b0411`) byte for byte (824 arm rows).
- `S` and `F` are not rerun: neither flies `sdn-ap` or `sgp4-xp`.
- The Space Force XP moved with sgp4-xp 0.2.1, which flies whole integrator steps. Median km, 0.1.1 / 0.2.1:

| Group | Fit | Windows | Day 1 | Day 2 | Day 3 | Day 7 |
|---|---|---:|---:|---:|---:|---:|
| LS | 24 h | 90 | 0.832 / 0.834 | 1.57 / 1.55 | 2.50 / 2.50 | 8.98 / 10.8 |
| LS | 72 h | 90 | 0.483 / 0.483 | 0.566 / 0.566 | 0.619 / 0.626 | 1.24 / 1.25 |
| DO | 24 h | 138 | 0.923 / 0.923 | 1.87 / 1.88 | 3.15 / 3.07 | 14.9 / 15.0 |
| DO | 72 h | 138 | 0.590 / 0.591 | 0.712 / 0.714 | 1.00 / 1.01 | 3.87 / 3.83 |
| GD | 72 h | 55 | 0.104 / 0.104 | 0.109 / 0.109 | 0.109 / 0.109 | 0.153 / 0.147 |
| IG | 72 h | 60 | 0.166 / 0.045 | 0.183 / 0.064 | 0.180 / 0.088 | 0.232 / 0.186 |
| GE | 72 h | 45 | 0.213 / 0.039 | 0.210 / 0.061 | 0.188 / 0.089 | 0.293 / 0.269 |
| HE | 72 h | 7 | 1.81 / 1.73 | 3.96 / 3.97 | 7.12 / 7.14 | 42.4 / 42.9 |
| HE | 336 h | 7 | 2.35 / 1.97 | 4.95 / 4.58 | 7.35 / 7.74 | 25.9 / 25.7 |
| HX | 72 h | 19 | 0.639 / 0.619 | 1.46 / 1.90 | 2.63 / 2.99 | 9.17 / 9.62 |
| HX | 168 h | 7 | 2.28 / 2.13 | 6.64 / 6.81 | 3.63 / 3.63 | 17.8 / 17.9 |
| WA | 24 h | 84 | 2.17 / 2.10 | 6.57 / 6.50 | 9.36 / 9.38 | 22.4 / 22.2 |
| WA | 72 h | 84 | 5.26 / 5.23 | 4.91 / 4.96 | 9.59 / 9.59 | 27.0 / 27.1 |

The statements (`LS`, `DO`, `GD`) read AP and XP only; the Space Force XP is report only here.
