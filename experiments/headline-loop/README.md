# The SDN-AP table (stack #316)

One table per released sdn-ap version (schema `sdn-ap-scoreboard/2`): AP, the theory alone, against a properly configured numerical
propagator, against SGP4-XP (our clean-room build in the same module, and the Space Force's through propagator/sgp4-xp) and against SGP4,
with the owner's pass line (AP within 100 m of the numerical propagator at 120 h) and AP's margin over each XP as counts, per regime and fit
length, on every precise-orbit window whose numerical rows are in the store, in GCRF, errors in meters against the truth. Each theory is
fitted to the same arc by its own fitter. The site's release tool reads it (`--scoreboard-result <file>`).

From `MANEUVER72_SINCE` (lib/arms.mjs; stack #489), with `--burns` naming the burn detector's lists (stack #462), AP's 72 h fit of a
maneuvering object takes the arc after its last burn. That is an object with its perigee at 600 km or above whose precise orbit holds a
burn known at the cutoff: every detector piece that found the burn ended by then, and the burn ended within 7 days before it. The arc
after that burn runs 24 to 70 h, so the module fits it under its short-arc rule. Every other window keeps the full 72 h. Each such row
names its fit process (`fitProcess`), and each stored row records its own. On such an object a 72 h arc fitted at the data's own sigma
takes the maintenance thrust into its drag term, as the numerical propagator's does, and lands on the numerical propagator's forecast
instead of the orbit.

The numerical arm's fit of such an object follows the same rule with the same lists (`refly.mjs --after-burns`, lib/arms.mjs
`numericalArc`). Its 72 h fit takes the same arc as AP's. Its 24 h fit, where the last burn known at the cutoff ends inside the 24 h,
takes the arc after it when that arc is at least 6 h long, and otherwise the full 24 h. The refits are stored apart from the full-arc fits
(`<store>/f0b8352a43f3-after-burn/`, one row per window and fit arc, with the decision where no refit was needed), so the two can be
compared. With `--burns`, a regime that has such rows takes the refit where the rule moved the arc and the stored fit everywhere else, and
names its numerical fit process (`ffmFitProcess`). The commercial geostationary row gets a numerical arm this way on the windows whose
arc the rule frees of known burns; a window whose every allowed arc still holds one has none.

## Tools

| File | Does |
|---|---|
| `table.mjs` | fits and flies AP and SGP4-XP of a modules commit (its `propagator/sdn-ap/dist/isomorphic/module.wasm` by `git show`), the Space Force's XP (propagator/sgp4-xp, called as a black box) and SGP4 (analysis/gp-error-model, propagator/sgp4) on every window, scores them, reads the numerical propagator's errors on the same windows from the store, and writes the one JSON (`sdn-ap-scoreboard/2`). AP's and our XP's rows go to `<store>/table/<wasm sha12>/rows.jsonl`; the Space Force XP's and SGP4's, which do not depend on AP's build, to `<store>/outside/<their builds>/rows.jsonl`, flown once and read by every later run, so a release's run flies AP and our XP only; `--theories` limits the ones flown, `--retry-errors` flies again a window whose row recorded an error |
| `refly.mjs` | the numerical propagator's rows, flown once (`--second-pass`: the windows touching March to May 2026): FFM 2.2.0 (fitted by analysis/estimation 0.7.0) in the reduced, configured and full settings (and Fbest on the laser geodetic spheres), to `<store>/f0b8352a43f3/`; `--after-burns <lists>` refits the full setting of a maneuvering object on the arc after its last burn, to `<store>/f0b8352a43f3-after-burn/` |
| `lib/` | `env.mjs` (package and host checks), `windows.mjs` (windows, truth, scoring bins, weather), `settings.mjs` (the FFM settings), `ffm.mjs` (FFM and estimation hosts), `arms.mjs` (AP and FFM flights), `e2e.mjs` (check helpers) |

Windows come in two passes: the first is every window whose fit arc and 7-day forecast stay clear of March to May 2026; the second is the
windows that touch those months, flown after the first. A regime's second-pass windows enter the table once all their numerical rows are in
the store. Nothing dated after 2026-11-10 is read.

XM's truth and weather readers refuse a modules checkout whose installed host packages differ from XM's registered ones; the tools answer that
guard with the registered versions and record the installed ones in every row (`HEADLINE_LOOP_HOSTS=registered` keeps the refusal).

The store is `/opt/data/sdn-archive/headline-loop` (`HEADLINE_LOOP_STORE`). Each tool's `--check` runs the tool itself as its own process on a
small real slice and asserts on what it writes.

The numerical column of a row is the stored setting with the lowest median 3D error at 168 h over that row's windows; among settings within
1 % of it, the fuller one. It is null ("being measured") until the store holds every window of the row. For commercial
geostationary, whose truth holds station-keeping burns that every stored fit runs through, it is null unless the after-burn rows exist
(above).

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
