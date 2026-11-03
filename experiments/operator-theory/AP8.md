# AP 0.4.17 against AP 0.4.11

Registered 2026-11-03, before any fit of this build on these windows. `cycle-ap8.sh` and `ap8-verdict.mjs` (parts truth, truth2, laser, regimes, starlink) beside this file are part of the registration, with the files AP7.md and AP6.md name.

The owner, 2026-11-03, on registering a test of 0.4.17 against 0.4.11 on AP7's windows and AP6's regimes, the site moving only on a pass: "Yes".

## The build

`propagator/sdn-ap` 0.4.17 at modules 3ae1eb289d0575c8c6b40259c1d41c0303ca7753, wasm SHA-256 7d4920ee23f4aecd9f29ef933f4abe98d6cc463b561b3dd7c5f12bbff6ff4c6c, the committed `dist/isomorphic/module.wasm`. Same forces, weather and priors as AP7.md. Over 0.4.11, from its changelog:

- the drag-coefficient fit no longer sticks at the prior median above 800 km (0.4.12);
- per-object priors in multi-object fits (0.4.13; single fits unchanged);
- the half-day class steps at most 1/32 of its resonant period (0.4.14);
- above e 0.3, the full long-period zonal set and a wider tesseral short-period set (0.4.15);
- above e 0.3 with drag, drag at the perigee passages (0.4.16), and fits up to 7 days where the ephemeris allows (0.4.17).

XP, the module with its forces off, reproduces the same conformance digest (72dcf6005046) at 0.4.11 and 0.4.17, by the module's README.

## What was already read

Everything here was read for 0.4.11 and 0.4.0. Before this was written, the module's lanes replayed, exploratory: AP6's altimetry windows for 0.4.12's drag prior (its commits 0fb671753 and 20bbff92c name "the read altimetry windows"), and AP6's Etalon, LAGEOS, LARES-2, IG and GE windows for 0.4.14 (README: Etalon-1 and -2 "move from 6.64 and 7.58 to 6.72 and 7.74 m and LAGEOS-1/2, LARES-2, IG and GE not at all"). So `DO`'s direction and `GD`'s small change are known, against the numerical reference, not against precise orbits by this registration's rules. No fit of 0.4.17 has touched any window below.

## Part A: AP7.md's windows

AP7.md's Parts T, N and L, its statistics and its rule 1n (the upper bound of the interval of the median d below ln 1.02; 0.005 km on Part L), 0.4.17 against 0.4.11 by pair:

1. `APRa12` and `AP24` in Part T do not lose at days 1, 2, 3 and 7.
2. `AP72` in `S1` and in `GN` does not lose at days 1, 2, 3 and 7.
3. Part L, `low` and `navigation`, do not lose at 24 h and 72 h, and at 72 h and 168 h.

## Part R: AP6.md's regimes

AP6.md's windows and statistics, `AP72` at 0.4.17 against `AP72` at 0.4.11 by window:

4. `DO`: beats 0.4.11: rule 1 at days 1 and 3; rules 2 and 3 at days 1, 2, 3 and 7.
5. `LS` and `GD`: do not lose (rule 1n, 2 and 3) at days 1, 2, 3 and 7.
6. `DO`: `AP72` beats `XP72` at 0.4.17, AP6.md's statement 2 as written, which 0.4.0 and 0.4.11 failed.

Report only: `IG`, `GE`, `HE`, `HX`, WAAS, every 24 h arc, Part S, and every contrast with SGP4 and FFM.

## What moves on a pass

The site moves to 0.4.17 as a whole, only if statements 1 to 5 pass. Statement 6 is reported either way. Then AP's and XP's arms are rerun at this build wherever the site shows them, as for 0.4.11. If any of 1 to 5 fails, the site stays at 0.4.11 and says why.

## Limits

- The same windows were read for the build each statement compares against.
- `DO` is ten satellites over ten weeks.
- No eccentric orbit with drag has precise-orbit truth here, so 0.4.15 to 0.4.17's main changes are not tested by any statement.

No arm, window, margin or rule changes after this registration.
