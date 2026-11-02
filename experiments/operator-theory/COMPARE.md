# AP beside SGP4, XP and FFM, on the same low-orbit pairs

Written 2026-11-02, after every row here except SGP4's and the cost run had been read. This is a report, not a test: nothing below was registered in advance as a claim, and no claim rests on this file. The claims these arms carry are in `CHEAPER.md`, `AP.md` and `AP4.md`.

The owner, 2026-11-02, verbatim: "OK publish this with the code and versions for each at the website".

## The pairs

`CHEAPER.md`'s 54 days and centers, group `low`: 7,404 pairs of 17 satellites. A forecast is fitted to the first 48 h of a center's prediction file and flown to the first 3 h of a newer file of the same object from the same center. That newer file is the center's later solution, not independent truth. Weather is observed history.

## The arms

| Column | Stored arm | Build | Stored by |
|---|---|---|---|
| SGP4 | `S@48` | `analysis/gp-error-model` fits, `propagator/sgp4` flies, at modules fbda894501 | `compare-sgp4.mjs`, added for this file |
| XP | `A-XP@48` | `propagator/sdn-ap` 0.3.0 with `FORCES` and `FIT` unset, which is XP bit for bit (`AP.md`); it fits solar pressure | `cycle-ap.sh laser` |
| AP 0.4.0 | `A-APn@48` | `propagator/sdn-ap` 0.4.0, `FORCES` 31, 20, NRLMSISE-00 | `cycle-ap4.sh laser` |
| FFM 20x20 | `F-M20@48` | `analysis/estimation` 0.7.0 fits, `propagator/ffm` 2.0.4 flies: 20x20, no tides or relativity, tolerance 1e-8, steps to 120 s | `cycle-cheaper.sh` |
| FFM 40x40 | `F-M40@48` | the same: 40x40, tides, tolerance 1e-8, steps to 120 s | `cycle-cheaper.sh` |

SGP4's fit and its flight are two implementations: `analysis/gp-error-model` fits with its own SGP4 in improved mode, and `propagator/sgp4` flies in AFSPC mode, as every S arm here does. An SGP4 set flies on SGP4 and nothing else. A 24 h SGP4 fit is reported beside it.

## The cost run

`compare-costs.mjs`: 40 low-orbit files chosen by hash, one process, one call at a time, the five arms in an order that rotates by file, one more file first as a warm-up, not counted. A file on which any arm cannot run is left out and counted. SGP4's module is started afresh for each call, as every S arm here does, so its figures carry that start; the others stay loaded. Fit: the file's first 48 h. Flight: every state of the file. Figures are medians per file on one machine, under whatever else it was running, and are not a benchmark of the algorithms in general. The figures in `results/operator-theory/cheaper` and `results/ap-truth` came from runs under other loads; these replace them only in this table.

## What this does not show

- The reference is the center's next prediction. Agreement with it may partly mean sharing a force model with that center.
- AP 0.4.0 against XP is not a registered contrast. `AP.md` registered AP 0.3.0 against XP on these pairs, and `AP4.md` registered 0.4.0 against 0.3.0.
- AP and FFM read observed weather for the whole stretch they fly. SGP4 and XP read no weather at all. That favors AP and FFM, more at long leads, and no real forecast has it.
- `AP5.md` and `AP6.md` run XP beside AP against precise orbits. This file's reference is not that.
- These are 17 low satellites that do not thrust. Nothing here covers other orbits, maneuvering fleets or debris.

`providers-run.mjs` adds AP, XP and SGP4 to every other provider this work stores forecasts of, and `compare-cells.mjs` and `compare-sigma.mjs` write the site's tables and ellipsoids. All report only.

To rebuild: `compare-sgp4.mjs` with 8 shards into `<store>/ap/b040/laser-sgp4`, `compare-costs.mjs` into `<store>/ap/b040/compare-costs/rows.jsonl`, then `compare-table.mjs --out results/ap-truth/compare`.
