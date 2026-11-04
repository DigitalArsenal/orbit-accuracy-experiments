# AP from ILRS normal points through the modules observation flow, second registration (flows/observation-od 0.3.0)

Registered 2026-11-04 by lane claude-aplaser2-d9 (task experiments-ap-observations-laser-2-20261104), frozen and
committed before any run of this experiment. A measurement: no pass or fail statement.

The first registration stands as recorded and is not edited: `experiments/ap-observations/PLAN.md` (SHA-256
7e763c13dc8735fad11d921165c6b02de49223ccf5bb19817e1755d352556a97, commit 4bb17c0), its `config.json` (SHA-256
3604dc2908e19dd649b6fd9471e4997b8e1d16eb7d483c9a84cec5d0d87342e0) and its results `results/ap-observations/table.json`
(SHA-256 779a9c5ac8b118792fbeb5ebfd9c1907e63e453d789b1294c8ac0aae29ecfa38, commit 68e92da) and `README.md` (SHA-256
b0e62bd6d812356a1f1baa8f890675f313229babd593f7430916a620914925d2): AP from normal points 175 of 206, median 0.021 /
0.047 / 0.097 km at days 1 / 2 / 3. Its 25 `no-convergence:20` cutoffs were traced to the fit at TARGET_EPOCH seeded with
the first guess carried 48 h (record modules-observation-od-low-sphere-convergence-20261104). flows/observation-od 0.3.0
fits first at the first guess's own epoch seeded with INITIAL as given, carries that estimate and its fitted parameters
to TARGET_EPOCH under the same dynamics, and fits the same request there; the `$OCM` is the fit at TARGET_EPOCH. This
registration repeats the first on that build. No new truth is read before this file is committed.

## Unchanged from the first registration

The first registration's sections Window and cutoffs, Inputs, Arms, Truth, Statistic, Failures and stop rule, Holds and
Execution hold here as written there: the five spheres and the 206 cutoffs 2026-07-18 to 08-28 (`config.json` `cutoffs`,
equal to the first's), the same inputs (`config.json` `inputs`, the same 26 SHA-256), the four arms (AP from normal points
through flows/observation-ap; AP fitted to the NSGF orbit with sdn-ap 0.5.1; the FFM estimate flown alone; the SGP4
public set, Data A, predictions drawn only), the 24 h FFM carry at 60 s, the truth (the NSGF rapid orbits, an anchor:
NSGF computes them from the same ILRS normal points, so they measure agreement with a precise orbit from the same data,
not independent accuracy; already read in B2), the statistic
(per cutoff and day 1 / 2 / 3 after the arc end the RMS of the 3D error, B2's thinning and 90 % coverage; across cutoffs
the median and the 95th percentile, with n), the EXCLUDE lists and the stop rule (a refusal is a failure and is never
dropped; no cutoff is rerun with changed inputs).

The first registration's conservative readings are kept:

- Earth orientation: IERS EOP 20 C04 `reference-states/products/eopc04.1962-now` (the series the NSGF states were converted
  with), T - 4 d to T + 5 d, through `eop-parser` `parse_c04`; not the hac/iers-eop finals.
- First guess: the NSGF state at T - 48 h rounded to 100 m and 0.1 m/s; never an SGP4 set.
- Stations: the newest weekly ILRS SINEX at or before T through `read_sinex`; a pass at a pad that solution does not hold
  (Arequipa 7403 among them) is left out, and the count is recorded per cutoff.
- SGP4 request encoders: `propagator/sgp4/tests/lib/payloadEncoders.mjs`, a byte-identical copy (hash checked) beside an
  install of that module's own lock in this lane's scratch; the read-only clone has no install under propagator/sgp4.

## Build (modules main 5da8d709375b, read-only clone `space-data-network-modules-obsod`)

Every artifact driven, with its SHA-256 by `git show origin/main:<path>` in that clone (origin/main is 5da8d709), is in
`config.json` `modules.build`; `run.mjs` and `check.mjs` refuse to start if a file on disk differs. One artifact differs
from the first registration: flows/observation-od `dist/isomorphic/module.wasm` (d5cc1246c597; the first's 6373b00cfacf,
0.1.1), which carries two changes since: the RA/Dec angles entry point (22213952a, the README's 0.2.0) and the two-fit
laser path (5da8d709, 0.3.0). Byte-identical to the first: flows/observation-ap 0.1.0 (`flow.mjs`), ilrs-crd-source
0.2.0, ilrs-station-coordinates 0.1.0, eop-parser 0.2.0, estimation 0.7.0, ffm 2.1.0 (threads on), sdn-ap 0.5.1, sgp4
1.4.1, reference-states 0.4.0, the DE440 2026 excerpt and the SGP4 encoders. Added, for reading only: analysis/estimation's
schema codec (`tests/wire.mjs`, generated from `schemas/Estimation.fbs`; both hashed). Hosts as the first.

## New records per cutoff

- The fits: the flow's estimation host is the analysis/estimation host behind a pass-through that reads each `fit_batch`
  answer (bytes unchanged) with that codec; for each fit that ends (status not NEEDS_PROPAGATION): its epoch (the
  request's trace, echoed in the answer), status, termination, CONVERGED, ITERATIONS and WEIGHTED_RMS. A 0.3.0 cutoff runs
  two fits (first-guess epoch, then T); a refusal names which fit ended it.
- The estimate `$OCM`: FIT_STATISTICS.ITERATIONS (the fit at T) and ORBIT_DETERMINATION.WEIGHTED_RMS, beside the first
  registration's range RMS, points used and in-track acceleration.

## Cells expected to change

The first registration's 31 AP refusals (the FFM arm's 31 follow them), named in `config.json` `expectedToChange`:

- `no-convergence` (25), expected to become AP `$OCM`s: starlette 07-18, 07-19, 07-20, 07-21, 07-22, 07-24, 07-26, 07-29;
  stella 08-08; westpac 07-19, 07-22, 07-25, 07-27, 08-01, 08-04, 08-13, 08-15; larets 07-19, 07-26, 08-01, 08-10, 08-15,
  08-19, 08-21; lares 07-26.
- `arc-too-short` (5), expected refused again (the arc rule is unchanged): westpac 07-18, 07-26, 08-07, 08-17, 08-22.
- `no NSGF state at 2026-07-19T00:00:00Z` (1), expected refused again (the first-guess input is unchanged): westpac 07-21.

The 175 cutoffs scored in the first registration are expected to move little: each is now refitted from the first-guess
epoch (the modules lane measured four converging cutoffs unchanged within 10 um). The AP-fitted-to-NSGF and SGP4 arms
drive no changed artifact. The SGP4 arm, same cutoffs and same truth, must equal the first registration's to the digit,
per cutoff and per table cell; `check.mjs` asserts it.

## Like for like

Day coverage (n) is set by the truth and is the same for every arm: the SGP4 arm's n is B2 part 2's AP n, 183 / 180 /
179 at days 1 / 2 / 3 of 206. B2 part 2 scored its AP arm on all 206; the first registration on 175 (n 158 / 157 / 152).
If the 25 converge and the six others stay refused, this registration scores 200 of 206 with n 178 / 176 / 174: like for
like with B2 on those 200, short of B2's 183 / 180 / 179 by the six refused cutoffs' covered days (5 / 4 / 5). The tables
state n beside B2's and the first's.

## Products

Store `/opt/data/sdn-archive/operator-theory/ap/ap-observations-2/` (created by this experiment; nothing else written in
the archive): per cutoff the AP `$OCM`, the estimate `$OCM`, the NSGF-fit AP `$OCM`, and one row line with each arm's day
values, the inputs and the fits. Tables: `results/ap-observations-2/table.json` and `README.md`: the per-arm table
(median and 95th, days 1 / 2 / 3, n, scored / attempted), the first registration's cells beside this one's, one sentence
per outcome that changed, the failures by name and cause, and the build note.

## Check (`check.mjs`, the record's E2E)

1. This file and `config.json` have one commit, and it precedes the commit that first carries `table.json`.
2. One row per cutoff; its AP arm is exactly one stored AP `$OCM` (theory AP, the row's SHA-256) or a named refusal
   counted as a failure.
3. Every arm's medians, 95ths and n for days 1 / 2 / 3 re-score equal from the stored products (both AP arms flown again
   by sdn-ap and scored again by compare_to_reference; the others from the rows).
4. EXCLUDE holds.
5. The SGP4 arm equals the first registration's to the digit; the first registration's cited files are unchanged.

## Execution

`run.mjs` with 8 workers under nice; a worker waits while the 1-minute load is above 45 or free disk is below 20 GiB.
No network.
