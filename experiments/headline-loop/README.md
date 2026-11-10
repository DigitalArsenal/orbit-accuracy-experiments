# Headline loop (stack #316)

Re-fly every published precise-orbit window on an AP build, with numerical references beside it, and score each of the 72 published cells by the round-0 referee's definition (`goal.md` of review round 0) beside the published statistic. Development windows, read before: nothing here is registered.

## Tools

| File | Does |
|---|---|
| `refly.mjs` | flies the windows, shard by shard, resumable; rows to `<store>/<AP wasm sha12>/rows-truth-<k>of<n>.jsonl`, FFM cache to `<store>/ffm-cache/<arm>-<key12>/` (store: `/opt/data/sdn-archive/headline-loop`, or `HEADLINE_LOOP_STORE`) |
| `score.mjs` | the scoreboard: `results/headline-loop/<version>-<sha12>/scoreboard.json` and `README.md`; statistic, interval and reference are options |
| `cells.mjs` | the same cells in the published `cells.json` schema: `results/headline-loop/<version>-<sha12>/cells.json` |
| `verify.mjs` | the re-flight against what it must reproduce: the reduced arm against the stored FFM rows, AP against the stored AP rows, the configured arms against the referee's rows |
| `closing.mjs` | each closing test of review round 0 the rows can decide, with its numbers and verdict |
| `lib/` | `env.mjs` (package and host checks), `windows.mjs` (windows, truth, scoring bins, weather), `settings.mjs` (every numerical setting by name), `ffm.mjs` (FFM and estimation hosts), `arms.mjs` (the arms and the cache), `stats.mjs` (the per-cell statistics) |
| `diagnosis/`, `DIAGNOSIS-2026-11-10.md` | the exploratory diagnosis of AP against FFM on eccentric orbits and 24 h fits |

Each script takes `--check` (made-up inputs with known answers; no module, no truth).

Arms per window and fit arc: AP (the published $PCF, on the build given); FFMq, the qualified reference (registered full settings with the radiation model fitted: L70S below 8,400 km, E5F navigation and geosynchronous, Ffull geodetic and eccentric); FFMc, the configured arm the referee flew (L40S, E5, Ffull); FFMr, the reduced setting the published cells flew (L40, F20). Sampled extras: FFMq at half its tolerance, observed-weather hindcasts, AP on a conservative-force model orbit, Fbest on geodetic, the 2 by 2 prior test on Near 700 km. SGP4, both XP builds and the centers' predictions are not re-flown: `cells.mjs` reads their stored per-window rows on the windows re-flown here.

## Run

```
npm ci                                                        # or, in the stack: node tools/deps-bundle/deps-bundle.mjs attach <this checkout>
for k in $(seq 0 19); do node experiments/headline-loop/refly.mjs --shard $k/20 & done; wait
for k in $(seq 0 19); do node experiments/headline-loop/refly.mjs --period 2026-03..05 --shard $k/20 & done; wait
node experiments/headline-loop/verify.mjs --rows /opt/data/sdn-archive/headline-loop/<sha12>
node experiments/headline-loop/score.mjs  --rows /opt/data/sdn-archive/headline-loop/<sha12>
node experiments/headline-loop/cells.mjs  --rows /opt/data/sdn-archive/headline-loop/<sha12>
node experiments/headline-loop/closing.mjs --rows /opt/data/sdn-archive/headline-loop/<sha12> --referee <round-0 folder>
```

A run refuses a checkout whose installed `spacedatastandards.org`, `space-data-module-sdk`, `flatbuffers` or `flatc-wasm` differs from its lockfile, naming `npm ci`. XM's installed-host guard is answered by one adapter in `lib/env.mjs`, which records the installed host versions in every row (proper fix stated there). A new AP build: `--ap-wasm <file>`; the FFM arms come from the cache (keyed by the FFM and estimation builds, kernel, Earth orientation, setting and trajectory step), so only AP flies again.

Full run on sdn-ap 0.6.5: RUN_PLACEHOLDER

## Stores read

Membership and windows: `/opt/data/sdn-archive/operator-theory/ap/b0411/{truth,truth2,regimes}`, `b065/truth-fresh` (the suite's Galileo and commercial geostationary groups). Truth: XM's Swarm and Copernicus series, the ILRS static chains, GFZ multi-GNSS, WAAS message 9 (stored days only), the NAIF kernels of TESS (nodes only), THEMIS and Chandra. Weather: as issued (XM `rowsO`); hindcasts observed (`rowsM`). Comparison rows: `ap/b051`, `ap/b063/regimes-hx`, `ap/b065/truth-fresh` (AP), `ap/ffm220` (FFM), `ap/b0411/{compare-truth,compare-truth2,regimes}` (SGP4, whiteroom XP), `ap/b051/ussf-*` (Space Force XP), `results/operator-theory/maneuver-flags/flags.json` (burns).

## Two passes

The first pass flies the 2,096 windows that touch neither 2026-03-01 to 05-31 nor anything after 2026-11-10; the second (`--period 2026-03..05`, rows flagged `period`) flies the 1,218 that touch those months (Strong drag 2026 495, Near 700 km 198, Medium Earth orbit 495, Galileo 30), into the same store. The precise-orbit windows of March to May 2026 were read by the builds that made the published cells and are read again here; the catalog studies' reservation of those months concerns public element sets, which this harness does not read. `score.mjs` and `cells.mjs` write every table twice, on all windows (the published cells' own window sets; the closing tests are judged there) and on the first pass alone, with windows and satellites per cell in both.

## Not re-flown, and why

- Anything dated after 2026-11-10 (held for other registered tests): no published window reaches it.
- The next-file regimes (each provider's older file against its newer one): not part of the 72 precise-orbit cells, and the laser centers' predictions are March to May 2026.
- SGP4 and both XP builds: their builds did not change; their stored rows are read on the same windows.
- The Starlink rows stay held.
