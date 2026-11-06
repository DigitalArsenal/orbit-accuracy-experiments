# Catalog budget (THEMIS-RIPPLE-FIX.md Amendment 14)

Records: 1,000 distinct fitted $OCM above e 0.3 (the THEMIS D 2013-02-12 and E 2013-02-16 sets, eccentricity offset k x 1e-6 and mean
anomaly k x 0.1 deg), each flown to its epoch (one epoch), with its covariance (two parameters: the module flies 1 + 2 x 8 perturbed
sets). catalog.mjs: pass 1 (load), pass 2 (the same records again: a refresh), then ten records each flown twice in a row (the second
with its grid held). C7 = modules 6f3b82ef3 (wasm c3f32102); C6 = per-set exact grids (rejected).

| Build | Workers | Load, s per worker | Refresh, s per worker | ms per record (load / refresh / grid held) | Peak wasm memory per worker |
| --- | --: | --: | --: | --: | --: |
| C6 | 8 | 397 (wall) | - | 3,151 | 332,791,808 |
| C7 | 8 | 77.6 | 77.7 | 618 / 617 / 666 | 107,675,648 |

Where the time goes (initsplit.mjs, one record, median of 5; profile.mjs, the grid build alone in wasm):
| Build | One-epoch propagate with covariance (ms) | Without covariance (ms) |
| --- | --: | --: |
| C7 | 614 | 31 |
| sdn-ap 0.6.1 (base) | 4,133 | 230 |
The grid build in wasm: 87.4 ms (four family sets of 20.8 ms; allocation under 0.1 ms); native 53 ms, so the wasm/native gap is 1.6x,
not 15x. A record's grid is built once and shared by its covariance's perturbed sets; the 614 ms is the covariance's 17 sets' own
inits and flights (31 ms without them), the same path that costs the base 4,133 ms. A refresh with the grid held costs the same as a
load (666 against 618 ms), so retention across refreshes saves at most the 87 ms build. Schedule nodes are lazy already: a one-epoch
propagate builds node 0 only (the epoch grid).

## Amendment 15: records without covariance (STRIP_COV=1; inclination offset k x 0.01 deg so no two records share a grid)
| Run | Load median, ms per record | Load, s per worker | Refresh, s per worker | Grid held, ms per record | Peak wasm memory per worker |
| --- | --: | --: | --: | --: | --: |
| 1 worker, 1,000 records | 183.1 | 187.0 | 176.9 | 35.1 | 129,826,816 |
| 8 workers, 1,000 records | 238.3 | 31.9 | 26.1 | 32.6 | 129,826,816 |
| 8 workers, records sharing neighbors' grids (inclination not offset) | 46.1 | 6.7 | 6.0 | 43.5 | 107,675,648 |

Against Amendment 15: (a) cold median at or below 100 ms per object: 183.1 ms, missed; warm refresh of 1,000 records on 8 workers at or
below 5 s: 26.1 s, missed (with every grid held a refresh would cost 32.6 to 35.1 ms per record, 4.1 to 4.4 s per worker, but holding
125 grids per worker is 885 MB, over (c)); (b) records with covariance not worse than shipped: 618 against 4,133 ms, held;
(c) memory at or below 512 MB per worker: 130 MB, held. The gap: a cold grid costs about 150 ms in wasm under one worker (183 - 35 ms),
against 100 ms for the whole object; a refresh within 5 s needs either a build under about 30 ms or held grids under 4 MB each.

## Box 3: the levers build (modules 6b60710fe, wasm a7771b14; Amendments 16 to 18)
| Run | Load median, ms per record | Load, s per worker | Refresh, s per worker | Grid held, ms per record | Peak wasm memory per worker |
| --- | --: | --: | --: | --: | --: |
| no covariance, 1 worker, 1,000 records | 45.5 | 46.9 | 58.4 (1,000 records > 128 held) | 8.6 | 487,522,304 |
| no covariance, 8 workers, 1,000 records | 57.0 | 7.6 | 1.4 | 9.2 | 477,888,512 |
| with covariance, 8 workers, 1,000 records | 222.4 | 30.1 | 23.6 | 171.4 | 477,954,048 |

Against Amendment 15: (a) cold median 45.5 ms (at or below 100) and warm refresh 1.4 s on 8 workers (at or below 5 s): held; (b) with
covariance 222 ms per record against the shipped 4,133 ms: held; (c) 478 to 488 MB per worker (at or below 512 MB; eviction: at most
128 idle grids, oldest first, 256 slots): held, with a 24 MB margin.
Init, native (initbench.cpp): xp_init of a THEMIS-like AP (31, 20) set 31.9 ms, of which the grid 26.0 ms and the wide zonal tail 2.6 ms.

Zonal change (correctness/zonalcheck.cpp): G and dG/de of the 210 wide zonal terms by the 256-node trapezoid against the previous
512-point quadrature, the largest difference relative to the degree's largest term: G 3.1e-15 / 2.3e-15 / 2.0e-13 / 2.0e-15, dG/de
7.6e-10 / 7.5e-10 / 1.2e-10 / 2.8e-12 at e 0.8222 (THEMIS D), 0.8215 (THEMIS E), 0.72 and 0.31. The same THEMIS D and E sets flown on
C7 (c3f32102) and on the final build (correctness/flightdiff.mjs): 0.091 / 0.038 m RMS, 0.45 / 0.26 m at most over 7 days at 300 s.

Against the budget as first registered: (1) cold, median at or below 100 ms per object: 618 ms (8 workers; the one-worker run follows), missed;
(2) warm, one refresh of 1,000 records on 8 workers at or below 5 s: 77.7 s, missed; (3) memory at or below 512 MB per worker:
108 MB, held (eviction: the four most recently dropped grids kept, the oldest freed first). The misses are the covariance's
per-set init, present on the base at 6.7 times C7's cost; without covariance C7 flies a record in 31 ms.
