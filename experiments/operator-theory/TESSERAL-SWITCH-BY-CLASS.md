# The tesseral switch by orbit class (propagator/sdn-ap 0.6.4): registration

Record modules-sdn-ap-tesseral-switch-by-class-20261106 (SDN-AP 2026-11-06). Registered and committed before any new flight and before
the module source changes. Inputs: the landed tesseral diagnosis (experiments-sdn-ap-tesseral-diagnosis-20261106; TESSERAL-DIAGNOSIS.md
with Amendments 1 and 2; results/ap-truth/tesseral-diagnosis/table.json and README.md) on the all-regimes frame (TESSERAL-ALL-REGIMES.md,
Amendments 1 to 7). Pins: propagator/sdn-ap 0.6.3 dist SHA-256 aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e (modules
03ee8623437f8c85900cabc0cc2a35b9288f4e36, the base); propagator/ffm 2.2.1 dist SHA-256
a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4 (the independent reference: EGM96 31x31 embedded, Sun and Moon from
DE440, in vacuum, as the all-regimes record). The 0.6.4 dist is the one build of the source change below; its SHA-256 is recorded in every
row this record writes and stated in its table, and no row flown on any other build enters the table.

## What the diagnosis measured (read, not re-flown)
On the kWideE 0.01 probe (byte-identical to 0.6.3 on 12 of 12 sets above the switch) the closed-form grid passes where the first-order
set fails in the non-resonant regimes: Ajisai|0.05, 0.1; LAGEOS-1|0.05, 0.1, 0.2; LAGEOS-2|0.05, 0.1 (LAGEOS-2|0.2 undecided, share 0.66
[0.00, 2.33] m against 2.25 m), and it is cheaper there by 88 to 408 ms per one-epoch flight. In the half-day class (GPS, GLONASS, Etalon,
Molniya at e 0.05 to 0.29) the grid leaves the mixed (resonant) share untouched (every cell undecided, no fail) and costs 70 to 167 ms
more; one half-day cell (Molniya|0.01) reads pass. The failing families of the 47 `set`-path cells are the first-order tesseral table,
exactly what the grid replaces. The diagnosis's cost rows are per-invoke instantiation figures (Amendment 1.1) and catalog.mjs was not
run there: no cost number of this record rests on them.

## The class rule (numbers)
The module's resonance class of a set is `res::band_of(n0)` of the epoch (fitted) Brouwer mean motion n0 in rad/min (resonance.inc; SPEC 6
bands; the six limits are 0.8, 1.2, 1.6, 2.4, 3.6 and 1.8 times 2 pi / 1436 rad/min to eight digits), in the bands' order:
- class 1, the one-day class: 0.0035003818 < n0 < 0.0052505727 (0.8017 to 1.2033 rev/day);
- class 2, the half-day 2:1 class: 0.0070007636 <= n0 <= 0.0105011454 (1.6045 to 2.4067 rev/day);
- class 3, the eight-hour class: 0.0105011454 < n0 <= 0.015751718 (2.4067 to 3.6100 rev/day);
- class 4, the sixteen-hour class: 0.0052505727 <= n0 <= 0.007875859 (1.2033 to 1.8050 rev/day);
- class 0, non-resonant: every other n0 (low orbit at n above 3.61 rev/day, the LAGEOS and laser-geodetic band at 6.4 to 6.5 rev/day,
  and orbits below 0.80 rev/day such as Chandra's).
The band edges are the module's own (the class also decides the resonance terms the rates carry and the half-day tail), so a set's
tesseral path and its resonance class agree by construction; the rule adds no new band.
Thresholds (the set flies the grid when its epoch eccentricity is strictly above the threshold; the comparison stays strict, as kWideE
was): class 0: 0.05; classes 1 and 2: 0.3 (measured by the diagnosis: the grid does not reach the resonant share and costs more there);
classes 3 and 4: 0.3 (unmeasured by the diagnosis; the shipped behavior is kept, stated as unmeasured). Hence 0.6.4 changes a flight only
for a class 0 set with 0.05 < e <= 0.3 ("the band"). Every other set (any class above e 0.3, every resonant class at or below 0.3, class
0 at or below 0.05) is byte-identical to 0.6.3, PRODUCER's version aside.
Scope of the change in the source: the single kWideE test at the term-set build (tesseral.inc `sp_terms`, the table bound `sp_bound`
and the grid acquisition at init, xp_theory.inc) becomes the class rule, the class being the init's `res` (the epoch class of the fitted
mean motion); the zonal tail's wide set (xp_theory.inc, SPEC 16.11's zonal clause), the perigee drag passage (SPEC 16.12) and the fit's
wide blocks (fit_oem.inc, SPEC 12.8) keep kWideE 0.3 unchanged (they are not the tesseral short-period model and not in the task). The
probe build moved every kWideE use to 0.01, so 0.6.4 differs from the probe in those respects, and every number below is measured on
the 0.6.4 dist itself, never carried over from the probe. A set whose class changes in flight (the class-crossing temporary, SPEC 6)
re-initializes under the new class's threshold, as it re-initializes its resonance terms today.

## Validation cells (none among the 23 the diagnosis used to choose)
All in the all-regimes frame and code (tesseral-all-regimes.mjs's exported bounds, attribute, verdictOf, rtnOf, gridSeconds, arcDays; the
same fixture, reference, arc, sampling, A and bounds; the three-way reading of Amendments 5 to 7), the regimes' elements as the all-regimes
record lists them, perigee floor 200 km. Each cell is flown twice, once on 0.6.3 (the set path) and once on 0.6.4 (the grid when the fitted
e is above 0.05), the reference shared; the fitted eccentricity of each fit and whether the grid was exercised are reported.
- Fresh eccentricities 0.07: Starlette, Ajisai, LARES, Jason-3, Sentinel-3, CryoSat-2, LAGEOS-1, LAGEOS-2 (8 cells).
- Fresh eccentricity 0.15: Ajisai, LARES, LAGEOS-1, LAGEOS-2 (4 cells; Starlette, Jason-3, Sentinel-3 and CryoSat-2 at 0.15 are below
  the perigee floor and are stated, not flown).
- The regimes the diagnosis named but did not fly: Starlette|0.05, 0.1; LARES|0.05, 0.1; Jason-3|0.05, 0.1; Sentinel-3|0.05;
  CryoSat-2|0.05 (8 cells; Sentinel-3|0.1 and CryoSat-2|0.1 are below the floor).
20 cells. A cell at e 0.05 flies the grid only when its fitted eccentricity lands above 0.05; both outcomes are reported as measured.
Resonant classes are not re-flown: their flights are byte-identical to 0.6.3 by the identity proof below.

## The pass lines
P1, accuracy (the three-way rule, forward error only, a lead from the fit's end): on 0.6.4 no validation cell reads "fail (attributed)";
every validation cell that reads pass (raw or attributed) on 0.6.3 reads pass on 0.6.4; and in every cell where 0.6.4 exercised the grid
its forward RMS is at or below 0.6.3's forward RMS in the same cell, or it reads pass. Cells reading undecided on 0.6.4 are reported as
undecided, never counted as pass; the count of pass / undecided / fail is stated both ways.
P2, the amendment-16 catalog budget, measured as THEMIS-RIPPLE-FIX.md Amendments 14 to 16 define it, on persistent instances (the SDK's
direct surface, one wasm instance per worker, never one instance per invoke), on 1,000 distinct seeded AP records (caps 31 / 20, BTERM 0,
AGOM 0, epoch 2026-10-29T00:00:00, elements drawn by a fixed-seed generator in the runner so that no two records share n, e or i; perigee
at or above 200 km): 500 in the band (class 0, n in [6.4, 14.5] rev/day, e in (0.05, min(0.3, e_max)]), 250 above e 0.3 (n in [1.05, 2.5]
rev/day, e in [0.31, min(0.8, e_max)]: the grid path 0.6.3 already flies) and 250 outside (125 class 0 at e in (0.0005, 0.05), 125 in the
one-day or half-day class at e in (0.05, 0.3]: the set path). Cold: one worker, the 1,000 records flown once each to the epoch plus one
minute, the median of the per-record wall times at or below 100 ms (the in-band and above-0.3 records build their grid in that flight).
Warm: 8 workers (worker_threads, one harness each, 125 records each) load their records (pass 1), then refresh every record to the epoch
plus one day (pass 2); the slowest worker's pass-2 wall at or below 5 s (40 ms per record per worker). Memory: the largest wasm memory of
any worker after pass 2 at or below 512 MB. The cold and warm figures are also stated per record class (band, above, outside).
P3, identity: seeded AP sets (ocm.mjs seedOcm, caps 31 / 20, epoch 2026-10-29T00:00:00) at every all-regimes regime's and THEMIS D's
elements at e 0.001, 0.01, 0.05, 0.1, 0.2, 0.3, 0.31 and 0.5 (above the perigee floor), each flown to 65 epochs over the day after the
epoch in GCRF on 0.6.3 and on 0.6.4 (fresh instances): every set outside the band gives equal $OEM payload bytes once PRODUCER's version
string is read as 0.6.3; every set inside the band is listed with the first differing byte and the largest position difference over the
day (its change is by construction). Every published example (results/ap-truth/compare/examples, 56 sets: 53 at e below 0.05 or in a
resonant class, 3 above e 0.3; none in the band, as the element sets show) flies byte-identical over its whole window in TEME on both
builds, PRODUCER's version aside; the module's own fit.e2e.mjs proves the same for its fixtures and fits. Published cells inside the band:
no published example; the all-regimes table's class 0 cells with 0.05 < e <= 0.3 (Starlette|0.1, Ajisai|0.1, LARES|0.1, Jason-3|0.1,
LAGEOS-1|0.1, LAGEOS-1|0.2, LAGEOS-2|0.1, LAGEOS-2|0.2) are the published cells the switch moves: each is re-measured on 0.6.4 in the
same frame and stated beside its landed 0.6.3 row (three of them are validation cells above; the other five were diagnosis probe cells and
are re-measured here on 0.6.4, not on the probe).
The version step is requested only when P1, P2 and P3 all hold; any miss is reported with its numbers and the dist is not pushed.

## Operating characteristics of the pass lines
P1 inherits the all-regimes line: a model equal to the field fails a cell only through the reference's own error (bounded by the
convergence check at a tenth of b_rms) and the fit's forward-day drift on a noise-free arc; the attributed legs read a jackknife interval
over blocks, so a true pass can read undecided when the interval is wide (the diagnosis's LAGEOS-2|0.2: 0.66 [0.00, 2.33] m against 2.25
m), and a false pass needs the interval's upper bound under the bound while the true share is over it. The paired clause (0.6.4's RMS at or
below 0.6.3's) is read on the same reference and arc, so the reference's error cancels to first order; a difference below the all-regimes
pair resolution (the sum of the two convergence figures) is not claimed as a change and the raw numbers are stated. P2's per-record medians
on one worker have no sampling error worth stating at 1,000 records; the 8-worker wall varies with the host's load and is taken once,
stated with the host (owner Mac, 28 cores) and the run's start time. P3 is a byte comparison with no error.

## Reading rule
A validation cell reads "grid passes" when 0.6.4's verdict is pass (raw or attributed), "grid fails" on fail (attributed), else "grid
undecided"; beside it "paired: better / equal / worse" on the forward RMS against 0.6.3 in the same cell (equal within the pair
resolution). The record's verdict is P1 and P2 and P3 as stated, with every measured number in the table. No cell is read, no row
written, before this file's commit; the runner's --check asserts that order, that every row carries both dists' SHA-256 and the runner's,
and that the table reproduces byte for byte.

## Outputs
`SDN_MODULES_ROOT=<the -pin clone with the 0.6.4 dist> SDNAP_BASE_WASM=<a copy of the 0.6.3 dist> node
experiments/operator-theory/tesseral-switch-by-class.mjs --run [--shard k/n]` (at most 4 shards; the catalog measurement runs on shard 0
alone, after its cells) writes results/ap-truth/tesseral-switch-by-class/rows-<shard>.jsonl; `--table` writes table.json and README.md;
`--check` exits 0 only when the order, pins and reproduction above hold.
