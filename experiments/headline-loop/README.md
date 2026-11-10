# The SDN-AP table (stack #316)

One table per released sdn-ap version: AP against a properly configured numerical propagator, per regime and fit length, on every first-pass
precise-orbit window, in the module's own GCRF output, errors in meters against the truth. The site's release tool reads it
(`--scoreboard-result <file>`).

## Tools

| File | Does |
|---|---|
| `table.mjs` | fits and flies AP of a modules commit (its `propagator/sdn-ap/dist/isomorphic/module.wasm` by `git show`) on every window, scores it, reads the numerical propagator's errors on the same windows from the store, and writes the one JSON (`sdn-ap-scoreboard/1`). AP's rows go to `<store>/table/<wasm sha12>/rows.jsonl` |
| `refly.mjs` | the numerical propagator's rows, flown once: FFM 2.2.0 (fitted by analysis/estimation 0.7.0) in the reduced, configured and full settings (and Fbest on the laser geodetic spheres), to `<store>/f0b8352a43f3/` |
| `lib/` | `env.mjs` (package and host checks), `windows.mjs` (windows, truth, scoring bins, weather), `settings.mjs` (the FFM settings), `ffm.mjs` (FFM and estimation hosts), `arms.mjs` (AP and FFM flights), `e2e.mjs` (check helpers) |

The store is `/opt/data/sdn-archive/headline-loop` (`HEADLINE_LOOP_STORE`). Each tool's `--check` runs the tool itself as its own process on a
small real slice and asserts on what it writes.

The numerical column of a row is the stored setting with the lowest median 3D error at 168 h over that row's windows; among settings within
1 % of it, the fuller one. It is null ("being measured") until the store holds every window of the row, and null for commercial
geostationary, whose truth holds station-keeping burns that every stored fit runs through.

## Run

```
npm ci                                                        # or, in the stack: node tools/deps-bundle/deps-bundle.mjs attach <this checkout>
node experiments/headline-loop/table.mjs --modules-commit <sha> --modules-root <modules checkout> --out <file> --jobs 14
for k in $(seq 0 7); do nice -n 19 node experiments/headline-loop/refly.mjs --groups S1,P,T --shard $k/8 & done; wait   # numerical rows still missing
node experiments/headline-loop/table.mjs --check
node experiments/headline-loop/refly.mjs --check
```
