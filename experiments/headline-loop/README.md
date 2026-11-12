# The SDN-AP table (stack #316)

One table per released sdn-ap version (schema `sdn-ap-scoreboard/2`): AP, the theory alone, against a properly configured numerical
propagator, against SGP4-XP (our clean-room build in the same module, and the Space Force's through propagator/sgp4-xp) and against SGP4,
with the owner's pass line (AP within 100 m of the numerical propagator at 120 h) and AP's margin over each XP as counts, per regime and fit
length, on every precise-orbit window whose numerical rows are in the store, in GCRF, errors in meters against the truth. Each theory is
fitted to the same arc by its own fitter. The site's release tool reads it (`--scoreboard-result <file>`).

From `CARRY24_SINCE` (lib/arms.mjs; stack #496) AP's 24 h fit carries terms from the same window's 72 h fit, which ends at the same
cutoff, so only data before the cutoff is used. Above the drag it carries the radiation terms: AGOM with its uncertainty, and ECOM2's Y0
where that fit solved it. Under the drag it carries the drag term with its uncertainty, and only where the 24 h arc alone leaves it
undetermined (a stated sigma of ln BTERM of 1 or more). The 72 h fit is of the full 72 h arc, for an object that maneuvers (below) too,
not its 72 h record (the arc after its burn). Each such row names its fit process (`fitProcess`) with the count of windows each way,
and each stored row records its own (`fitProcess` in rows.jsonl).

The record's gravity degrees in the low table (lib/arms.mjs): from `ZONAL70_SINCE` the rows of strong drag, near 700 km, the laser spheres
and altimetry state zonal degree 70 and tesseral degree 31. From `TESSERAL70_SINCE` (the first build after sdn-ap 0.6.45) the two
strong-drag rows state tesseral degree 70 as well (`AP_T70_Z70_TIDES`); the other three keep tesseral 31. A table file's configuration
sentence for the row says which degrees it used, so a file of 0.6.42 to 0.6.45 and one of a later build read differently.

From `MANEUVER72_SINCE` (lib/arms.mjs; stack #489), with `--burns` naming the burn detector's lists (stack #462), AP's 72 h fit of a
maneuvering object takes the arc after its last burn. That is an object with its perigee at 600 km or above whose precise orbit holds a
burn known at the cutoff, and the burn ended within 7 days before it. In a list made as of its burns (`experiments/burn-detector`, stack
#506) a burn is known from its report time, the time it could first be known from data before it; in an older list, once every
detector piece that found it had ended. The burn ends at the end of its extent, carried across the rejected candidates that begin within
60 min after it (the tail of a longer burn). The arc after that burn runs 24 to 70 h, so the module fits it under its short-arc rule. Every other window keeps the full 72 h. Each such row
names its fit process (`fitProcess`), and each stored row records its own. On such an object a 72 h arc fitted at the data's own sigma
takes the maintenance thrust into its drag term, as the numerical propagator's does, and lands on the numerical propagator's forecast
instead of the orbit.

The numerical arm's fit of such an object follows the same rule with the same lists (`refly.mjs --after-burns`, lib/arms.mjs
`numericalArc`), with the same 600 km perigee floor. Its 72 h fit takes the same arc as AP's. Its 24 h fit, where the last burn known at the cutoff ends inside the 24 h,
takes the arc after it when that arc is at least 6 h long, and otherwise the full 24 h. The refits are stored apart from the full-arc fits
(`<store>/f0b8352a43f3-after-burn/`, one row per window and fit arc, with the decision where no refit was needed), so the two can be
compared. With `--burns`, a regime that has such rows takes the refit where the rule moved the arc and the stored fit everywhere else, and
names its numerical fit process (`ffmFitProcess`). The commercial geostationary row gets a numerical arm this way on the windows whose
arc the rule frees of known burns; a window whose every allowed arc still holds one has none. Neither has an object whose burn list states
that its orbit is not ballistic between impulses (`notBallistic`): flown from the truth's positions alone, the numerical setting closes
above the 100 m bar over the detector's pieces, as under continuous low thrust, so no arc of it is burn-free.

A forecast across a later maneuver is not scored as accuracy: no fit sees a burn after its cutoff, so the error there measures the
maneuver as much as the propagator. With `--burns`, on a row whose satellites all have burn lists, each lead's AP, numerical and SGP4-XP
figures are also given over the windows with no burn in the truth from the cutoff to that lead (`cleanToLead: { windows, medianM, p95M }`
under `ap`, `ffm` and `xp`), beside the figures over all windows. Nothing is removed. `laterBurns` says in words how many windows on the pass
line hold a burn between the cutoff and day 5, whether it raises the orbit, lowers it or is mainly out of its plane, and how AP and the
numerical propagator compare on each kind. On the strong-drag rows `burnFreeScatter` says how many of the windows where AP is more than
100 m closer a burn explains, and how the two compare on the burn-free windows.

## Tools

| File | Does |
|---|---|
| `table.mjs` | fits and flies AP and SGP4-XP of a modules commit (its `propagator/sdn-ap/dist/isomorphic/module.wasm` by `git show`), the Space Force's XP (propagator/sgp4-xp, called as a black box) and SGP4 (analysis/gp-error-model, propagator/sgp4) on every window, scores them, reads the numerical propagator's errors on the same windows from the store, and writes the one JSON (`sdn-ap-scoreboard/2`). AP's and our XP's rows go to `<store>/table/<wasm sha12>/rows.jsonl`; the Space Force XP's and SGP4's, which do not depend on AP's build, to `<store>/outside/<their builds>/rows.jsonl`, flown once and read by every later run, so a release's run flies AP and our XP only; `--theories` limits the ones flown, `--retry-errors` flies again a window whose row recorded an error |
| `refly.mjs` | the numerical propagator's rows, flown once (`--second-pass`: the windows touching March to May 2026): FFM 2.2.0 (fitted by analysis/estimation 0.7.0) in the reduced, configured and full settings (and Fbest on the laser geodetic spheres), to `<store>/f0b8352a43f3/`; `--after-burns <lists>` refits the full setting of a maneuvering object on the arc after its last burn, to `<store>/f0b8352a43f3-after-burn/` or the folder `--after-burn-store` names (one per set of lists); `--tight` fits and flies the full drag setting again at tolerance 1e-13 (stack #520), rows to `<store>/f0b8352a43f3-L70S13/`, trajectories to `<store>/numerical-trajectories/L70S13/` with staged manifest lines, and `--tight-switch` appends a whole row's lines to the manifest |
| `bar.mjs` | the bar's table for a released build: AP's record fitted to each window's numerical forecast and its largest distance from it over 0 to 120 h, from the stored numerical trajectories, each row at one numerical tolerance; per group, the front page's four and strong drag with the heights its forecasts span |
| `lib/` | `env.mjs` (package and host checks), `windows.mjs` (windows, truth, scoring bins, weather), `settings.mjs` (the FFM settings), `ffm.mjs` (FFM and estimation hosts), `arms.mjs` (AP and FFM flights), `e2e.mjs` (check helpers) |

Windows come in two passes: the first is every window whose fit arc and 7-day forecast stay clear of March to May 2026; the second is the
windows that touch those months, flown after the first. A regime's second-pass windows enter the table once all their numerical rows are in
the store. Nothing dated after 2026-11-10 is read.

XM's truth and weather readers refuse a modules checkout whose installed host packages differ from XM's registered ones; the tools answer that
guard with the registered versions and record the installed ones in every row (`HEADLINE_LOOP_HOSTS=registered` keeps the refusal).

The store is `/opt/data/sdn-archive/headline-loop` (`HEADLINE_LOOP_STORE`). Each tool's `--check` runs the tool itself as its own process on a
small real slice and asserts on what it writes.

The numerical column of a row is its fullest stored setting with a fit, fixed by name and never chosen on its accuracy (table.mjs
`PREFER`). It is null ("being measured") while the store lacks a numerical row for any window of the row. For commercial geostationary,
whose truth holds station-keeping burns that every stored fit runs through, it is null unless the after-burn rows are read (`--burns`).

The numerical trajectories (`<store>/numerical-trajectories/manifest.jsonl`, one line per trajectory, Float64 x, y, z km and vx, vy, vz km/s
per state at the line's `stepS` from its `from`) are selected by key, fit arc (`arcH`) and the identity of the fit the line flies:
setting, process (the full arc, or the arc after a burn), the arc's start and the fit's first state. A line names it (`fit`), or for an
older line it is derived from the line where nothing leaves doubt. A line whose trajectory file a later line wrote again (a refit made
at the same path) has none. bar.mjs flies, for each window, the line of the fit whose figures the row reads, and never the last line of
a key or of a key and arc, which on a window with two fit arcs, two tolerances or a refit after a burn is another fit.

## Run

```
npm ci                                                        # or, in the stack: node tools/deps-bundle/deps-bundle.mjs attach <this checkout>
node experiments/headline-loop/table.mjs --modules-commit <sha> --modules-root <modules checkout> --out <file> --jobs 14
for k in $(seq 0 7); do nice -n 19 node experiments/headline-loop/refly.mjs --shard $k/8 & done; wait                 # numerical rows, first pass
for k in $(seq 0 7); do nice -n 19 node experiments/headline-loop/refly.mjs --second-pass --shard $k/8 & done; wait   # and the second
for k in $(seq 0 7); do nice -n 19 node experiments/headline-loop/refly.mjs --retry-errors --shard $k/8 & done; wait  # windows whose truth was found later
for k in $(seq 0 3); do nice -n 19 node experiments/headline-loop/refly.mjs --after-burns <lists> --shard $k/4 & done; wait  # maneuvering objects
node experiments/headline-loop/table.mjs --check
node experiments/headline-loop/refly.mjs --check
```
