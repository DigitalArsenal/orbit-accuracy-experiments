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

## Limits

- Every fit reads precise products, published after the fact.
- `LS` and `DO` are not strong-drag orbits. They say nothing about storms.
- No figure here covers maneuvering fleets, debris or a whole catalog.

No arm, window, margin or rule changes after this registration.
