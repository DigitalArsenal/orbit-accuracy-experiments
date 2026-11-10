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
| `candidates.mjs` | AP builds re-flown AP-only on the same windows, per cell beside a control: medians, the paired ratio over the control with its blocked interval (flagged when worse), the goal statistics against FFMq, fitted B and S against FFMq's, refused and unconverged fits (development on windows already read) |
| `apc.mjs` | the record that carries the forecast (sdn-ap 0.6.7, SPEC 18): error against FFMq inside the span, D and the compression error, bytes, the making cost, the theory past the span, every window outside 5 % of FFMq |
| `frames/` | the frame finding (stack #386, #389): `frame-oracle.mjs`, `frame-columns.mjs`, `carrier-floor.mjs`, `published-vs-corrected.mjs`, with their outputs |
| `lib/` | `env.mjs` (package and host checks), `windows.mjs` (windows, truth, scoring bins, weather), `settings.mjs` (every numerical setting by name), `ffm.mjs` (FFM and estimation hosts), `arms.mjs` (the arms and the cache), `stats.mjs` (the per-cell statistics) |
| `diagnosis/`, `DIAGNOSIS-2026-11-10.md` | the exploratory diagnosis of AP against FFM on eccentric orbits and 24 h fits |

Each tool's `--check` is end to end (`lib/e2e.mjs`): it runs the tool itself as its own process, on a made-up store with known answers or on a tiny real slice, and asserts on what the tool writes. `refly.mjs --check` flies one real laser geodetic window (about two minutes).

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

A run refuses a checkout whose installed `spacedatastandards.org`, `space-data-module-sdk`, `flatbuffers` or `flatc-wasm` differs from its lockfile, naming `npm ci`. XM's installed-host guard is answered by one adapter in `lib/env.mjs`, which records the installed host versions in every row (proper fix stated there). A new AP build on the same windows, AP arms only:

```
node experiments/headline-loop/refly.mjs --ap-only --ap-wasm <module.wasm> --base-rows /opt/data/sdn-archive/headline-loop/<base sha12> [--shard k/n]
node experiments/headline-loop/score.mjs --rows /opt/data/sdn-archive/headline-loop/<base sha12> --compare /opt/data/sdn-archive/headline-loop/<new sha12>
```

Rows go to the new build's own folder (its SHA-256, first 12). Every numerical arm is the base row's, and D reads FFMq's and FFMc's scored states from the FFM cache (keyed by the FFM and estimation builds, kernel, Earth orientation, setting and trajectory step), which an AP-only run reads and never writes or refits. D against FFMr and the hindcast FFM is not formed there (their states are not cached). `--compare` writes `compare-<A>-<B>.json` and `.md`: per cell both builds' AP medians, ratios, intervals and verdicts, and the paired B over A ratio with its blocked interval.

Full run on sdn-ap 0.6.5: RUN_PLACEHOLDER

## Frames (DigitalArsenal/spacedatanetwork-stack#386, cause #389)

The published harness flies AP and the whiteroom XP in sdn-ap's TEME and turns them to GCRF with `foundation/frames`. The two TEMEs differ. sdn-ap's is the AIAA 2006-6753 TEME (TEME to PEF by GMST82; 3.4 mm from the paper's published example). `foundation/frames`' is pyerfa's GMST06 TEME, Rz(ee06a)·pnm06a (0.000 m from it at the 7 SGP4-VER epochs, 0.109 m from the paper's example). The difference is a rotation about the pole, GMST06 minus GMST82: the IAU-1976 against IAU-2006 precession rate, about 2.75 mas a year. It was −56.8 mas in October 2025 and −59.5 mas in September 2026: 11.6 to 12.2 m at geosynchronous radius, about 1 to 2 m in low orbit (`frames/frame-oracle.mjs`, `frames/frame-oracle.txt`).

| Column | Path to GCRF | Frame error (2 high windows, `frames/frame-columns.txt`) |
|---|---|---|
| AP | sdn-ap TEME, then `foundation/frames` | 56.8 mas; in-arc RMS 12.08 to 3.39 m (GE C006) and 9.83 to 2.52 m (IG C005) in sdn-ap's GCRF output |
| XP, whiteroom | the same | the two paths differ by 56.8 mas |
| XP, Space Force | `foundation/frames` both ways (sgp4-xp `src/frames.hpp`) | none: its own GCRF output equals its TEME path to 0.0000 m |
| SGP4 | `foundation/frames` both ways (gp-error-model) | none |
| FFM | GCRF throughout | none |

`refly.mjs` keeps the published path for the baseline (it reproduces the published cells). `--ap-only --frame GCRF` flies AP, and `--theory XP` flies the whiteroom XP, in sdn-ap's own GCRF output, into `<sha12>-gcrf` and `<sha12>-xp-gcrf` folders. APC always flies GCRF. The scoreboard on the corrected path is `score.mjs --rows <store>/f0b8352a43f3-gcrf`. `frames/carrier-floor.mjs` measures the diagnosis's representation floors again on both paths (`DIAGNOSIS-2026-11-10.md`, dated note).

## Stores read

Membership and windows: `/opt/data/sdn-archive/operator-theory/ap/b0411/{truth,truth2,regimes}`, `b065/truth-fresh` (the suite's Galileo and commercial geostationary groups). Truth: XM's Swarm and Copernicus series, the ILRS static chains, GFZ multi-GNSS, WAAS message 9 (stored days only), the NAIF kernels of TESS (nodes only), THEMIS and Chandra. Weather: as issued (XM `rowsO`); hindcasts observed (`rowsM`). Comparison rows: `ap/b051`, `ap/b063/regimes-hx`, `ap/b065/truth-fresh` (AP), `ap/ffm220` (FFM), `ap/b0411/{compare-truth,compare-truth2,regimes}` (SGP4, whiteroom XP), `ap/b051/ussf-*` (Space Force XP), `results/operator-theory/maneuver-flags/flags.json` (burns).

## Two passes

The first pass flies the 2,096 windows that touch neither 2026-03-01 to 05-31 nor anything after 2026-11-10; the second (`--period 2026-03..05`, rows flagged `period`) flies the 1,218 that touch those months (Strong drag 2026 495, Near 700 km 198, Medium Earth orbit 495, Galileo 30), into the same store. The precise-orbit windows of March to May 2026 were read by the builds that made the published cells and are read again here; the catalog studies' reservation of those months concerns public element sets, which this harness does not read. `score.mjs` and `cells.mjs` write every table twice, on all windows (the published cells' own window sets; the closing tests are judged there) and on the first pass alone, with windows and satellites per cell in both.

## Not re-flown, and why

- Anything dated after 2026-11-10 (held for other registered tests): no published window reaches it.
- The next-file regimes (each provider's older file against its newer one): not part of the 72 precise-orbit cells, and the laser centers' predictions are March to May 2026.
- SGP4 and both XP builds: their builds did not change; their stored rows are read on the same windows.
- The Starlink rows stay held.
