# AP beside XP, SGP4 and FFM in every other regime with truth

## Reading

`experiments/operator-theory/AP6.md`, registered at 48b01e3 before the full run. Figures and every interval: `regimes.md`, the same as data in `regimes.json`.

What it means: on the laser spheres and the laser geodetic satellites AP beats XP as registered, about 90 % closer one day ahead. On the altimetry satellites AP's medians are far closer, 85.5 % one day ahead, but the statement fails: the upper bound of its 95th percentile at day 2 is +10.7 % against a limit of +10 %. Every arm has about the same tail there.

Report only: in inclined geosynchronous orbit AP is a little closer than XP at every lead; in geostationary orbit it is closer through day 3 and level at day 7. On TESS, from a 72 h fit XP is closer than AP at days 1, 2, 3 and 7, and from a 336 h fit AP is closer. So the gain above the laser-ranged satellites is not established. FFM at `CHEAPER.md`'s settings is closest in nearly every cell. SGP4 from a short arc is far off in these high orbits, and thousands of kilometers off on TESS.

What it does not mean: the windows run from 2025-10 to 2025-12, and for TESS 2026-07 to 2026-09. The geosynchronous groups span 20 days and TESS is one satellite. The geostationary tails, about 112 km at day 7, are the same for every arm; they look like station-keeping maneuvers, which was not checked. A smoke test of 19 windows was read before registration, to check the readers, and is disclosed in the plan.
