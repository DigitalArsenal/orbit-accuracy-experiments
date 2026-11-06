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

Against the registered budget: (1) cold, median at or below 100 ms per object: 618 ms (8 workers; the one-worker run follows), missed;
(2) warm, one refresh of 1,000 records on 8 workers at or below 5 s: 77.7 s, missed; (3) memory at or below 512 MB per worker:
108 MB, held (eviction: the four most recently dropped grids kept, the oldest freed first). The misses are the covariance's
per-set init, present on the base at 6.7 times C7's cost; without covariance C7 flies a record in 31 ms.
