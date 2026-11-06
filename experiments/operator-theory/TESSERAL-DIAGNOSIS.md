# Tesseral short-period diagnosis on the all-regimes numbers (report only)

Record experiments-sdn-ap-tesseral-diagnosis-20261106. Registered and committed before any row is read. Report only: nothing in
propagator/sdn-ap changes here; any switch change is its own registered module record and version.

## Ground
The numbers are the landed table of experiments-sdn-ap-tesseral-all-regimes-20261106 (results/ap-truth/tesseral-all-regimes/rows-*.jsonl,
table.json; registration TESSERAL-ALL-REGIMES.md with Amendments 1 to 7). Frame, reference, arcs, sampling, bounds, attribution with its
conditioning and jackknife intervals, labels and estimator are that record's, unchanged; Amendment 7 fixes the estimator: a further
estimator failure reads "withheld (estimator)" and no method changes here. Pins: modules 93cb5a0584fa728864e4426cc9ceb368936589f9;
propagator/sdn-ap 0.6.3 dist SHA-256 aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e; propagator/ffm 2.2.1 dist SHA-256
a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4. Every new flight here is by those two dists through the all-regimes
harness's own method (propagator/sdn-ap/test/lib/heo-model-truth.mjs, ocm.mjs); this record's runner moves bytes and does arithmetic.

## The cells under diagnosis (by id, regime|e, from the landed table)
- D1, the Molniya in-arc fail at e 0.001: Molniya|0.001 (in-arc tesseral share 1.47 [1.26, 1.68] m against the 1.00 m floor).
- D2, the half-day class (every flown cell): GPS|0.001, 0.01, 0.05, 0.1, 0.2; Galileo|0.001, 0.01, 0.05, 0.1, 0.2; GLONASS|0.001, 0.01,
  0.05, 0.1, 0.2; Etalon|0.001, 0.01, 0.05, 0.1, 0.2; Molniya|0.001, 0.01, 0.05, 0.1, 0.2, 0.29, 0.3, 0.31; GTO|0.001, 0.01, 0.05, 0.1,
  0.2, 0.29, 0.3, 0.31. The mixed (resonant) shares read there: GPS 7.6 m and Galileo 14.2 m forward at e 0.001; GLONASS/Etalon,
  Molniya and GTO undecided with wide intervals.
- D3, the 17 attributed fails: Ajisai|0.1; LAGEOS-1|0.1, 0.2; LAGEOS-2|0.1, 0.2; Etalon|0.1, 0.2; GLONASS|0.1, 0.2; GPS|0.05, 0.1, 0.2;
  Molniya|0.001, 0.01, 0.1, 0.2, 0.29.
- D4, undecided cells where the grid is the natural alternative (the all-regimes lane's naming): low orbit e 0.05 and 0.1 in (2,3) / (2,4):
  Starlette|0.05, 0.1; Ajisai|0.05; LARES|0.05, 0.1; Jason-3|0.05, 0.1; Etalon|0.05 and GLONASS|0.05 in (8,6); GTO|0.29, 0.3 in (2,3)
  (23 m; 5.9 m on the 0.31 grid flight). LAGEOS at e 0.1 and above is in D3.
The cell set is the union (one row per cell). THEMIS D|0.29, 0.3, 0.31 enter as the one-day class's pair for the grid reading only.

## Per cell: the families named (from the landed rows, no re-flight)
For each cell the landed forward families at or above 10 % of the forward RMS (at most eight) and, where the failing leg is in-arc, the
landed in-arc families, each with: its member labels (m, j); every member's exact frequency |j n_fit - m theta| in cycles per day
(theta 1.00273781 rev/day) and the group's largest member separation; its kind as landed (zonal, m-daily, tesseral, mixed); its amplitude
in every flown cell of the regime and the log-log slope of amplitude against e over the cells where it appears (two or more); and the
path that carries it in the module, read from the pinned source (propagator/sdn-ap/src/tesseral.inc, resonance.inc, xp_theory.inc):
- `zonal`: m = 0 only (the zonal tail / zonal short-period: not the tesseral model);
- `m-daily`: j = 0 with m > 0 (the m-daily set, SPEC 16.2; kept under the grid);
- `resonance`: the group's members are not separable on any window the record flew (largest separation below 1 / arcDays cycles per day)
  and hold more than one m: the half-day class (n about 2 theta: (m, j) and (m + 2, j + 1) coincide with the zonal (0, j - m / 2)) and
  the one-day class; carried by the resonance class's rates and the near-resonant table (resonance.inc; the grid subtracts "the class's"
  harmonics and the half-day class's tail, tesseral.inc wide_grid_build), so no e* switch reaches it;
- `window-merged`: members separable in-arc (separation at or above 1 / arcDays) but merged on the one-day forward window (below 1.5
  cycles per day): a forward-attribution resolution limit, read on the in-arc leg;
- `set`: everything else with m > 0 and j != 0: the first-order tesseral short-period table (sp_terms, q in {-1, 0, 1}), which is exactly
  what the grid replaces above the switch.
The failing family of a cell is the largest family of the failing leg's share (forward tesseral for a forward fail, in-arc tesseral for an
in-arc fail; for an undecided cell the largest family of the share whose point estimate exceeds the bound; for the resonant class the
largest mixed group), with its path. The secular share is reported beside it, never charged.

## The grid-instead-of-set arm (registered fact, read from the pinned source before any row)
The module's switch is `e.eo > tess::kWideE` with `constexpr double kWideE = 0.3;` (tesseral.inc line 42), compared at init against the
set's epoch mean eccentricity (xp_theory.inc: the table bound at line 1466, the grid at 1473, the zonal tail at 1493; fit_oem.inc 159 and
593 for the fit's wide blocks). No $OCM field, $PCF field, environment variable, import or export of 0.6.3 reads or moves it
(plugin-manifest.json, ocm.inc, pcf.inc, abi.inc carry no grid or wide switch), and a fit's eccentricity is the reference's, so a fit at
the threshold for a cell below e 0.3 describes another orbit. The closed-form grid therefore cannot be evaluated below e 0.3 in these cells
without a module change; this record states that fact and does not fly that arm. In its place, measured and read before any new row:
1. The grid's effect at the module's own threshold, from the landed 0.29 (set) and 0.31 (grid) flights of Molniya, GTO (half-day class)
   and THEMIS D (one-day class): per family group, the amplitude on the 0.29 flight and on the 0.31 flight, forward and in-arc, and the
   change of the cell's tesseral, mixed, zonal and secular shares across the pair; a change is claimed only beyond the pair's reference
   resolution (the sum of the two convergence figures, as the all-regimes step). The 0.30 flight is reported beside them.
2. The structural reading per path above: a `set` family is what a lower switch would replace; `resonance`, `m-daily`, `zonal`,
   `secular` and `window-merged` are untouched by any e* switch.

## The catalog cost measure
On the fitted 0.31 sets of Molniya, GTO and THEMIS D (each refitted here from the all-regimes fixture in this record's own cache: same
reference, arc and caps; fitted eccentricity reported, the grid exercised only when it is above 0.3), one wasm instance (one worker) of the
pinned dist on the browser runtime of the SDK's standalone harness:
- cold: a fresh instance, the wall time of the first propagate of the set to one epoch (the fit's end plus one minute), median over five
  fresh instances; against the budget's cold target, median at or below 100 ms per object;
- warm: on the same instance, the set propagated again to one epoch a day later, median over five calls; against the budget's warm target,
  5 s for 1,000 records on 8 workers = 40 ms per record per worker (this record measures one record on one worker, not a catalog);
- grids: `sdnap_wide_grid_cache` (grids held, their bytes, grids built since the instance began) before and after each flight, and
  `sdnap_wide_grid_stats` lookups; bytes per grid = bytes / grids;
- memory: the instance's wasm memory size after the flights; against 512 MB per worker.
The budget is THEMIS-RIPPLE-FIX.md's catalog budget as Amendment 16 states its targets (cold median at or below 100 ms per object; warm
refresh at or below 5 s on 8 workers; peak at or below 512 MB per worker). Cost here is of the shipped grid above e 0.3; a switch at a
lower e* would build the same grids for every object it moves onto the grid path, so the per-object figures are the cost per moved object.

## The byte-identity check for e <= 0.3 flights outside those cells
Seeded AP sets (ocm.mjs seedOcm: caps 31 / 20, BTERM 0, AGOM 0, epoch 2026-10-29T00:00:00) at every regime's elements at e 0.001,
0.1, 0.2 and 0.3 (0.3 itself is the set path: the switch is strict), flown to 65 epochs over the day after the epoch in GCRF: (A) a fresh
instance; (B) a second fresh instance; (C) the same instance after a seeded 0.31 set of the same regime was flown (a grid in the cache).
Identity is kept for a flight when the $OEM payload bytes of A, B and C are equal; any difference is reported by regime and e with the
first differing state. This measures the shipped set path's determinism and its independence from grids in the cache. For a switch change
elsewhere the statement this record can make is: a cell the switch does not move stays on the set path, whose bytes are those measured
here; a cell it moves changes by construction (SPEC 16.11's "at e 0.3 and below ... byte-identical" is then true only outside the moved
cells).

## Reading rule per cell (written before the rows)
- set fails: the landed verdict is fail (attributed), or the failing leg's share point estimate is over the bound (undecided: "set misses,
  undecided");
- grid passes: not measurable below e 0.3 in this record (the fact above); the nearest evidence is the class's 0.29 -> 0.31 pair reading of
  the failing family's path share (reduced beyond the pair's resolution: "grid reaches the path"; not reduced: "grid does not reach it");
- cost within budget: the cold, warm and memory figures above against their targets;
- identity kept: the check above for the regime.
A cell is "candidate for a registered switch change elsewhere" when its failing family is on the `set` path, the nearest pair shows the
grid reaching that path, cost is within budget and identity is kept. Otherwise it is "named as is" with its path: `resonance` (a
resonance-class record, not a switch), `m-daily`, `zonal` / `secular` (not the short-period tesseral model), `window-merged` (an
attribution limit, read in-arc). No cell is called a pass by this record.

## Outputs and check
`SDN_MODULES_ROOT=<root> node experiments/operator-theory/tesseral-diagnosis.mjs --run [--shard k/n]` (at most 4 shards; the family
reading needs no module and runs on shard 0; the pair reading, cost and identity items are split by shard) writes
results/ap-truth/tesseral-diagnosis/rows-<shard>.jsonl (one row per cell, pair, cost object and identity flight, each with the SHA-256
of both dists and of the runner and createdUtc). `--table` writes table.json and README.md from the rows; `--check` asserts that this
registration's commit precedes the first row, that every row is on the two pinned dists, that every cell under diagnosis carries its
families with paths, its failing family, its grid-arm statement, its cost reference and its identity reading, that the table reproduces
byte for byte, and exits 0 only then.
