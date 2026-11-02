# AP beside SGP4, XP and FFM

## Reading

On 7,404 pairs of 17 low satellites that do not thrust, every arm fitted to the same 48 h of the same file and flown to the same later times, AP 0.4.0's median difference from the center's next prediction at 24, 72, 120 and 168 h is 0.018, 0.060, 0.213 and 0.484 km. SGP4's is 0.428, 0.621, 1.57 and 3.50 km, XP's 0.410, 0.619, 0.865 and 1.25 km, and 40x40 FFM's 0.006, 0.035, 0.088 and 0.173 km. On one machine, in one process, AP takes about 1 s to fit and 0.22 s to fly a file, 40x40 FFM about 4.3 s and 4.5 s, and SGP4 and XP about 0.1 s and 0.04 s.

What it means: by pair, AP is closer than SGP4 and XP at every lead. Against FFM it is behind at 24 h, by about 0.01 km; past that the intervals against both FFM settings include zero, though 40x40 FFM's pooled medians are lower. AP costs about 3 to 4 times less than these FFM settings to fit and about 10 to 20 times less to fly, and about 6 to 12 times more than SGP4 and XP. SGP4 fitted to 48 h is level with XP through 72 h; XP pulls ahead at 120 and 168 h. Fitted to 24 h, SGP4 is 7.75 km off at 72 h and 48.7 km at 168 h.

What it does not mean: this is a report, not a test, and no claim rests on it. The reference is each center's next prediction, not independent truth, and agreeing with it may partly mean sharing a force model with that center. AP and FFM read observed weather for the whole stretch they fly, which no real forecast has and which SGP4 and XP do not read at all, so the gap at long leads is wider here than it would be in a real forecast. AP 0.4.0 against XP was not registered, and XP has not been run beside AP against independent precise orbits. For AP against truth, on forecast weather, see `../README.md`.

## The table

`table.md`, and the same as JSON with every build's module, version, commit and SHA-256 in `table.json`. How it was made: `experiments/operator-theory/COMPARE.md`, `compare-sgp4.mjs`, `compare-costs.mjs`, `compare-table.mjs`.

## What was registered, and where

- `experiments/operator-theory/CHEAPER.md`: the FFM settings, passed. `results/operator-theory/cheaper`.
- `experiments/operator-theory/AP.md`: AP 0.3.0 beats XP on these low-orbit pairs at 72 h and 168 h, passed. `results/ap-truth`.
- `experiments/operator-theory/AP4.md`: AP 0.4.0 beats AP 0.3.0 at 24 h and 72 h, passed. `results/ap-truth`.
- The SGP4 column and the timing were added on 2026-11-02, after the others had been read.

## The timing

40 files chosen by hash, plus one warm-up not counted. 3 of the 40 are left out, all one satellite whose file starts before the weather table does, so 37 count. A fit reads the file's first 48 h, median 481 states; a flight writes every state of the file, median 1,440 states over 5 days. Medians per file. The machine was also running other work, and the order of the five rotated by file so that it fell on all of them alike. SGP4's module is started afresh for each call, as every S arm here does; the others stay loaded. The figures in `results/operator-theory/cheaper` and `../README.md` came from runs under other loads and differ.
