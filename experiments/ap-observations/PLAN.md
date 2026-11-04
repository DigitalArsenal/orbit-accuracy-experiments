# AP from ILRS normal points through the modules observation flow (B2 part 2's window)

Registered 2026-11-04 by lane claude-aplaser-d9 (task experiments-ap-observations-laser-20261104, program W2), frozen and
committed before any run of this experiment. A measurement: no pass or fail statement.

B2 part 2 (`results/sdn-ap-mixed-screening/README.md`, laser section) measured SDN-AP fitted to an FFM carry of a
normal-point orbit at 0.093 / 0.229 / 0.444 km (median, days 1 / 2 / 3) over 206 cutoffs, on the withdrawn build, with the
fit and carry in experiment JavaScript. This repeats that window through the modules flow `flows/observation-ap` on the
build below. B2's rows were already read (its per-cutoff list is copied from them, `config.json` `cutoffs`); no new truth is
read before this file is committed.

## Window and cutoffs

Exactly B2 part 2's: the five laser spheres Starlette (7646), Stella (22824), LARETS (27944), WESTPAC (25398) and LARES
(38077); the 206 (object, cutoff T) pairs of B2's rows, 2026-07-18T00Z to 2026-08-28T00Z, listed in `config.json`
(42 / 42 / 41 / 39 / 42). A cutoff is attempted for every arm; none is dropped.

## Build (modules main c2f476f6193c, read from the read-only clone `space-data-network-modules-obsod`)

Every artifact driven, with its SHA-256 by `git show c2f476f6:<path>`, is in `config.json` `modules.build`; `run.mjs` and
`check.mjs` refuse to start if a file on disk differs. Versions: flows/observation-ap 0.1.0 (`flow.mjs`),
data-source/ilrs-crd-source 0.2.0, data-source/ilrs-station-coordinates 0.1.0, data-source/eop-parser 0.2.0,
flows/observation-od 0.1.1, analysis/estimation 0.7.0, propagator/ffm 2.1.0 (threads on), propagator/sdn-ap 0.5.1,
propagator/sgp4 1.4.1, analysis/reference-states 0.4.0; DE440 2026 excerpt (`files/orbit-products/tests/fixtures`). Hosts:
the SDK's in-process standalone harness (space-data-module-sdk 0.9.12, browser kind, direct surface), as the flow's E2E.

## Inputs (archive, read-only; SHA-256 in `config.json` `inputs`)

- Normal points: `hac/ilrs-edc/npt_crd_v2/<sat>/<sat>_2026{06,07,08}.np2` through `ilrs-crd-source` `read_crd`; the
  `$TDM`s (one per pass, the module's own reading rules) whose observations all lie in [T - 48 h, T] (E6 R's arc: the
  normal points of the two days before T alone, no element-set history).
- Stations: the weekly ILRS SINEX `hac/ilrs-edc/pos+eop/ilrsa.pos+eop.<yymmdd>.v90.snx.gz` with the newest date at or
  before T, decompressed in memory, through `ilrs-station-coordinates` `read_sinex`. A pass at a pad that solution does
  not hold is left out (as the flow's fixture was cut); the count is recorded.
- Earth orientation: IERS EOP 20 C04 `reference-states/products/eopc04.1962-now` (the series the NSGF reference states
  were converted with, as the flow's fixture), its header and the rows of T - 4 d to T + 5 d, through `eop-parser`
  `parse_c04`, as one `$PRW` EARTH_ORIENTATION. Conservative reading of the brief: the brief names hac/iers-eop, whose
  files are finals, not C04; `parse_c04` and the flow's E2E take C04.
- First guess: the NSGF orbit's state at T - 48 h (the arc start, a precise state before T; never an SGP4 set; owner
  2026-11-01), rounded to 100 m and 0.1 m/s as the flow's fixture rounds its guess.
- Dynamics (the flow E2E's): EGM2008 70 x 70, Sun and Moon (DE440), cannonball radiation pressure with Cr A/m the
  sphere's E6 value (Starlette and Stella 0.00108, LARETS 0.0022, WESTPAC 0.0021, LARES 0.00032 m^2/kg), IERS 2010 solid
  tides and relativity, FES2004 ocean tides 30 x 30, no drag; IN_TRACK_ACCELERATION solved for; RK78 as the E2E.
  TARGET_EPOCH T.
- sdn-ap `fit` `$PCF`: THEORY AP, Jacchia 1970 on the theory's flux model (no `$SPW` rows: none exist for July 2026 in the
  archive; flow README "Weather"), tesseral to 31, zonal to 20.

## Arms

1. `ap`: AP from normal points. `observationAp(hosts, ingress)` per cutoff: estimate at T, 24 h FFM carry at 60 s,
   sdn-ap fit, one AP `$OCM`. Flown alone: sdn-ap `propagate` with that `$OCM` and an OUTPUT `$PCF` (GCRF, the truth's
   epochs after T). The set's epoch is the carry start; leads count from T (FIT_STOP, the arc end).
2. `apNsgf`: AP fit to the NSGF orbit: sdn-ap 0.5.1 `fit` (same `$PCF`) to the NSGF states of [T - 24 h, T] at their own
   3 min step (a refit on this build; B2's `sdnapTruth`), flown the same way.
3. `ffm`: the FFM estimate flown alone: propagator/ffm `propagate_oem` from the estimate with the carry's dynamics and the
   fitted in-track acceleration (the flow's carry request), OUTPUT GCRF from T to T + 3 d at 60 s.
4. `sgp4`: the SGP4 baseline as B2 had it: the Space-Track set with the newest epoch among those created and
   epoched at or before T (B2's `setAt` over `spacetrack/gp_history/by-creation`), on propagator/sgp4 `propagate_ephemeris` (TEME, 60 s). SGP4 sets fly only on
   SGP4. No Space-Track record is reproduced; only its errors are reported.

## Truth (an anchor)

The NSGF rapid orbits of each sphere (`reference-states/reference/nsgf.orb.<sat>.26*`, GCRF, UTC, chained as B2 chains
them, through the harness truth gate). NSGF computes them from the same ILRS normal points, so the truth is not
independent of arm 1's input: it measures agreement with a precise orbit from the same data, not independent accuracy.
Already read in B2.

## Statistic

Forward error only. For each arm and cutoff, `analysis/reference-states` `compare_to_reference` (the arm's `$OEM`
against the truth's states in (T, T + 3 d], B2's thinning: every round(300 s / step)-th truth state) gives the position
error per truth epoch; day d holds the epochs in (T + (d - 1) d, T + d d]; the cutoff's day-d value is the RMS of the 3D
error (its norm, the same in the truth's RTN axes as in GCRF) over those epochs, kept when the day holds at least 90 % of
its truth epochs (B2's coverage rule). Reported per arm and day: the median and the 95th percentile (linear
interpolation between order statistics) over cutoffs, with n; B2's medians beside them.

## Failures and stop rule

A cutoff where the flow (or any module of an arm) refuses counts as a failure of that arm, named by the module's code,
and is never dropped: "scored / attempted" shows it. No cutoff is rerun with changed inputs.

## Holds (asserted in `check.mjs`)

EXCLUDE: Swarm (39451, 39452, 39453) and GRACE-FO (43476, 43477) at every date, the six held Galileo (43567, 37847, 41862,
41174, 43055, 41175), every Starlink (name), every operator capture (no input path under a capture store). None of these
are laser spheres; asserted anyway.

## Products

Store `/opt/data/sdn-archive/operator-theory/ap/ap-observations/` (created by this experiment; nothing else written in
the archive): per cutoff the AP `$OCM`, the estimate `$OCM`, the NSGF-fit AP `$OCM`, and one row line with each arm's
day values. Tables: `results/ap-observations/table.json` and `README.md`. `check.mjs` (the record's E2E) re-flies the
stored AP `$OCM`s and re-scores days 1 / 2 / 3 against `table.json`.

## Execution

`run.mjs` with 8 workers under nice; a worker waits while the 1-minute load is above 45 or free disk is below 20 GiB.
No network.
