# The fit's second solution (propagator/sdn-ap src/fit_oem.inc)

Task modules-sdn-ap-fit-second-solution-robustness-20261106. Registered before any row it governs is read; every amendment is committed
and pushed before the rows it governs are read.

## The failure as measured

THEMIS-RIPPLE-FIX.md, results/ap-truth/themis-ripple-fix/DIAGNOSIS-THEMIS-A-20130215.md (experiments WIP 1ff49df), THEMIS A, cutoff
2013-02-15, 72 h vacuum fit, forces (31, 20): the base build reaches 109.5 m fit RMS with BTERM 0.0120 (days 1 / 3 / 7: 211.7 / 314.1 /
419.9 m). On the tesseral grid builds C1, C2 and C4 the fitter converges to a second solution: 248.9 to 249.8 m fit RMS with BTERM 4.29 to
4.51 (375 times the base's), days 1 / 3 / 7 392.6 to 517.8 / 3,072 to 3,239 / 14,286 to 15,779 m. C3 reaches 104.8 m with BTERM 0.0120 on
the same arc. The grid matches the full-field quadrature there (0.119 m RMS). The fitter accepts a solution whose residual is 2.3 times
the attainable one.

## Part 1, first: the report-only scan of every published window on 0.6.2

Question: does any published AP cell on the shipped 0.6.2 build sit on a second solution?

Build. The scan build is the 0.6.2 source (modules c82160de7; propagator/sdn-ap src unchanged at cb0983a4a; built without change it
reproduces the dist 84d50dca4efdfea87eff7e3b4618d795c26a7d0a6df0e877341e69bc73161f41 byte for byte) plus one report-only probe, off by
default (`sdnap_fit_probe`; patch probe-062.patch in results/ap-truth/fit-second-solution). The probe changes nothing the fit emits: after
the policy's solution (span, fall-back and two-stage rules as shipped) it runs two more starts on that solution's arc and options, and
records their figures:
- A1: the solution's elements with BTERM back at the start the policy used (the drag prior's median), one fit on the arc.
- A2: the policy's pass on the same span with BTERM held at that start through every stage (prior sigma 1e-6), then BTERM freed for one
  fit on the solution's arc (only where the pass lands on the same arc: the same states and epoch).
Control: with the probe on, the emitted $OCM equals the shipped dist's byte for byte on every HX, HE and WA window and on every window
whose key's SHA-256 is 0 mod 10 (the shipped dist fitted beside it).

Windows (by id: the keys of the stored rows, nothing else). The published precise-orbit cells' AP rows, ap/b051 (0.5.1, relabeled 0.6.2
by aa2a0a7's reflight): truth (ap-truth.mjs, AP24 and APRa12, 944 windows), truth2 (ap-truth.mjs --xm, XP2F_CONTROL=1, AP72 and AP24, 1,812),
regimes (all-regimes.mjs, AP24, AP72, AP336, 407), regimes-hx (AP72, AP168, 19), regimes-wa (AP24, AP72, 84); each fit as its script
builds it (arc, $PCF, weather rows). The 32 truth examples and the day-leads tables read these windows. The 26 next-file examples
(operator files) are scanned by their stored segment where the scan reaches them; any not reached is named.

Statement (report only, no pass or fail): a window-arm is on a second solution when the better probe (A1 or A2, status >= 0) has a fit
RMS below 0.98 times the policy's and a BTERM outside 0.5 to 2 times the policy's. Reported: the count and the per-window table (key, arm,
policy RMS and BTERM, probe RMS and BTERM); separately, windows with a lower RMS at a BTERM within that band. The list goes to the
coordinator at once: a hit means the fitter fix ships alone as 0.6.3.

## Part 2: the fix

Candidate rules, tested in this order; the first that meets every acceptance line is taken, later ones are not run:
- A, multi-start: after the policy's solution, the two starts above (A1, A2) on its arc and options; the solution of least cost is kept.
- B, a vacuum BTERM bound: with no drag atmosphere selected (FORCES without ATMOSPHERE_MODEL NRLMSISE00 and WEATHER_SOURCE THEORY_FLUX_MODEL
  on a geocentric orbit whose perigee is above 2,500 km altitude), BTERM is bounded to 10 times the prior's median, stated in SPEC: no
  drag acts there, so a larger BTERM is the fit absorbing an unmodeled force.
- C, residual-ratio acceptance: a solution whose fit RMS exceeds 1.5 times that of the A2 start is replaced by the A2 solution.

Builds: base = the 0.6.2 dist (84d50dca); candidate = the merged tree (ripple WIP 8c66f1fcb, the tesseral grid, plus the rule), built
into scratch (SDNAP_DIST_DIR).

Windows: THEMIS A 2013-02-15 and the other 11 THEMIS windows, the 7 Chandra and 7 TESS windows of THEMIS-RIPPLE-FIX.md (run.mjs's
pattern: 72 h vacuum fits, forces (31, 20), 7 days at 300 s); no-harm: the LEO fixture (test/fit.e2e.mjs, 550 km) and the GEO windows
of regimes-wa (WAAS, vacuum).

Acceptance:
1. THEMIS A 2013-02-15: fit RMS at most 1.1 times the base's (base 109.5 m: at most 120.5 m) and BTERM within 2 times the base's 0.0120
   (0.0060 to 0.0240).
2. Paired ratio candidate / base of the 3D RMS per window at days 1, 3 and 7 on all 12 THEMIS windows: median with a 95 % window-cluster
   bootstrap interval (10,000 draws, seed 20261106); the upper bound at most 1.05 at each day.
3. Where the rule does not fire, the fit emits the same bytes as without it: test/fit.e2e.mjs PASS, the GEO no-harm windows byte-identical.
4. node propagator/sdn-ap/test/fit-second-solution.e2e.mjs PASS (THEMIS A fit RMS and BTERM within lines 1's bounds against committed
   fixture numbers; byte-identical fixtures where the rule does not fire).

Report only: Chandra and TESS paired ratios; the fit cost of the rule.

## Amendment 1 (2026-11-06, before any part 2 row but THEMIS A 2013-02-15's was read)

Read before this amendment: THEMIS A 2013-02-15 on the three part-2 builds (run.mjs): the 0.6.2 base 109.52 m, BTERM 0.012046; the grid
alone (ripple 6f3b82ef3, the shipping candidate: grids shared within a set's perturbed copies) 104.78 m, BTERM 0.012027148315, days 1 / 3 /
7 201.1 / 294.3 / 421.8 m: the shipping grid does not reach the second solution there (C1, C2 and C4 did); rule A as registered 104.78 m,
BTERM 0.012027148426, 53 iterations against 27, the same days. And the E2E's synthetic GEO arc: rule A as registered moved the fit RMS by
8e-14 km, so the set's bytes changed for nothing.

Change: rule A keeps a restart only when its cost is below 0.96 times the policy's (the scan's 0.98 on the fit RMS, squared), so that
it acts on a second minimum and leaves a converged solution's bytes alone. Added, report only: a diagnostic build of the merged tree with
the grid sharing tolerances at zero (kShareE, kShareI, kShareA 0: each perturbed set its own grid, C4's arrangement), with and without
rule A, on THEMIS A 2013-02-15: whether the rule returns C4's second solution to the first.

## Amendment 2 (2026-11-06): what the diagnostics showed; the rule order

THEMIS A 2013-02-15, 72 h vacuum fit (run.mjs; rows /opt/data/sdn-archive/operator-theory/fit-second-solution/measure and diag-c4):

| Build | Fit RMS (m) | BTERM | Iterations | Days 1 / 3 / 7 (m) |
| --- | --: | --: | --: | --: |
| 0.6.2 base (84d50dca) | 109.52 | 0.012046 | 28 | 211.7 / 314.1 / 419.9 |
| grid 6f3b82ef3, no rule | 104.78 | 0.012027 | 27 | 201.1 / 294.3 / 421.8 |
| grid 6f3b82ef3 with sharing tolerances 0, with and without rule A (Amendment 1's) | 104.78 | 0.012164 | 52 | 201.3 / 294.9 / 422.5 |
| C4 (ripple 8c66f1fcb rebuilt), no rule | 249.75 | 4.506 | 18 | 517.8 / 3,238.9 / 15,778.6 |
| C4 with rule A (Amendment 1's) | 249.75 | 4.506 | 18 | 517.8 / 3,238.9 / 15,778.6 |

The probe on C4 (scan build's probe on 8c66f1fcb): A1 249.71 m, BTERM 4.485; A2's held pass (BTERM 0.01 through every stage)
stalls at 359.2 m, and freed it returns to 249.71 m, BTERM 4.485. In C4's arrangement no fit with BTERM near its prior reaches below
359 m: the fit stalls on partials that jump when each perturbed set builds its own grid, not on a start. The shipping grid (sharing
within a set's perturbed copies) converges to 104.78 m without any rule. Rule A costs a second staged pass on every fit (THEMIS A
21.1 s against 10.7 s).

SDN-AP ruling (2026-11-06): rule B before rule A; rule A only where B does not suffice; the fix's fit-cost rise on the cost benchmark's
32 windows (experiments/sdn-ap-cost-benchmark) at most 10 %.

Reading: the second solution was the grid's inconsistent finite-difference partials under C4's per-set grids, removed by the
shipping grid's sharing (6f3b82ef3). Rule A leaves C4 at 249.75 m and doubles every fit; rule B could only hold BTERM near its prior,
the 359 m stall, above line 1's 120.5 m (not built); rule C does not fire (A2 lands at the same 249.7 m). No rule is taken (coordinator,
2026-11-06): no fitter change in 0.6.3. test/fit-second-solution.e2e.mjs stays as the THEMIS A regression guard on the grid (line 1's
bounds; the LEO AP, LEO SGP4XP and synthetic GEO fits byte-identical to 0.6.2) and lands with the 0.6.3 binary. Lines 2 and 3 are not
measured for a rule, since none is taken.

## Amendment 3 (2026-11-06, SDN-AP ruling: fix (i) for the Molniya fitted-drag regression), registered before any row it governs

What: the tesseral grid shares one grid among sets within its tolerances (SPEC 16.11), so a fit's finite-difference partials, taken on
copies a few 1e-7 away from the nominal, read the nominal's grid and miss the grid's own change with the elements; on Molniya the BTERM
partial is biased by that. The ripple lane adds a per-set exact-grid flag to the propagation context (its name and semantics in SPEC
16.11 on its WIP ref): a set initialised with it builds and keeps its own grid at its own elements. Named (ripple cbcbecf7f, merged):
the scoped switch `xpt::tess::ExactGridScope` (src/tesseral.inc; a process-wide depth counter, `tess::exact_grids_now()` true while
any scope lives), read by xp_init as `exact_grid || tess::exact_grids_now()`; fit_oem.inc declares one in run_pass after the Jacobian
fall-back's scope, alive to the end of the pass.

Amendment 3.1 (coordinator ruling, 2026-11-06): with the scope over run_pass alone the THEMIS A fit made 40 shared grid lookups after
the solve (the fit's covariance partials, held-out and residual-record evaluations: sdnap_wide_grid_stats, ripple 747232b83) against
262 exact; they carry the same bias, so the scope covers each fit block in fit_blocks instead: every set the fit initializes takes exact
grids. The guard E2E asserts 0 shared and more than 0 exact lookups over the fit call. Measured (modules 20a09144b, scratch build
8994cbb4, fitcost.mjs, load 53-54): 0 shared, 302 exact; FIT_RMS 104.78 m, BTERM 0.012145; fit 14.55 / 14.57 s; wasm memory after the
fit 571.9 MB against 0.6.2's 68.2 MB (39.5 to 40.2 s). The memory is the ripple lane's next item (exact grids released at scope exit);
the Molniya cost and paired lines are the ripple lane's (it holds the set).

Amendment 3.2 (2026-11-06): exact grids freed by their last holder (ripple 66926aee2, merged at modules 2a6dcee99; scratch build
5043e898), the scope as in 3.1. THEMIS A (fitcost.mjs, two runs each, alternating, load 55-62): fit 16.44 / 16.60 s against 0.6.2's
40.78 / 40.56 s; wasm high-water after the fit 165,150,720 bytes (165.2 MB; 157.5 MiB) against 0.6.2's 68,222,976 (68.2 MB), over a
160 MB budget by 5.2 MB read in decimal megabytes, under it read in MiB. FIT_RMS 104.78 m, BTERM 0.012145; grid lookups 0 shared, 302
exact; the guard E2E and fit.e2e.mjs PASS.

## Amendment 4 (2026-11-06, SDN-AP amendment 25), registered before any row it governs

The fit without ExactGridScope, on the ripple lane's exact-key grids (ripple e815a0109: a grid is keyed by its set's exact n, e, i,
class and degree; `xpt::GridShareScope(nominal)`, thread-local RAII: a copy initialized inside it reads the nominal's epoch and
schedule-node grids linearly within 3e-4 in e, 1e-4 rad in i, 1e-4 in a / a; outside a scope nothing is shared). The record's paths
now include src/fit.inc. Change: src/fit_oem.inc loses its ExactGridScope; in src/fit.inc, where an iteration's copies are made (the
drag-rate probe's drag-free set, the AGOM column's copy, the finite-difference fall-back columns), a GridShareScope opens on that
iteration's nominal set (the probe's own set; for the AGOM and fall-back columns a set initialized from the iteration's elements and
held while its copies are built). Expected: the copies read the nominal's own exact-key grid, linearly, so the partials carry no other
set's grid. Measured and reported: THEMIS A fit RMS, BTERM, fit time and wasm high-water (fitcost.mjs) against 0.6.2 and Amendment 3.2;
the guard E2E (its lookup assertion recast: no exact lookup inside the fit, and at least one keyed lookup, every lookup being by the
set's own exact key or through its nominal's scope) and fit.e2e.mjs PASS. The Molniya lines stay the ripple lane's.

Measured (modules 7a0459bad, scratch build 8ddc78d3, fitcost.mjs two runs each, load 60-61): THEMIS A FIT_RMS 104.78 m, BTERM
0.012145 (Amendment 3.2: 104.78 m, 0.012145); grid lookups 268 by own key, 0 exact; fit 14.47 / 14.36 s against 0.6.2's 39.99 / 40.18
s; wasm high-water 571,867,136 bytes (571.9 MB) against 0.6.2's 68.2 MB and Amendment 3.2's 165.2 MB: over the 160 MB budget (not
diagnosed; the likely cause, not measured: the keyed grids of the fit's distinct element sets are kept idle, up to kGridIdle). Guard E2E and fit.e2e.mjs PASS.

## Amendment 5 (2026-11-06), registered before any row it governs

The ripple lane replaces ExactGridScope with `tess::FitGridScope` (exact keys everywhere; a grid built by a set initialized while a
FitGridScope lives on its thread is freed when its last holder drops it, never kept idle; xp_init's exact_grid parameter removed;
sdnap_wide_grid_stats counts [0] lookups by sets outside a fit and [1] by a fit's sets; sdnap_wide_grid_cache reports the held grids
and their bytes). Change: src/fit_oem.inc declares `xpt::tess::FitGridScope fit_grids;` right after `++block_index;` in fit_blocks
(where ExactGridScope was); Amendment 4's GridShareScope in src/fit.inc stays. The guard E2E asserts every grid lookup of the THEMIS A
fit is a fit set's ([0] 0, [1] > 0) and that sdnap_wide_grid_cache shows no fit grid held after the fit; its fixtures are kept.
Measured and reported: THEMIS A fit time and wasm high-water in MiB (expected about 80.6 MiB, 14.7 s) against 0.6.2 (65.1 MiB);
the guard E2E and fit.e2e.mjs PASS.

Measured (ripple 3e6a88a44 merged; modules abd04b701, scratch build 226a7a8c; fitcost.mjs two runs each, load 27-30): THEMIS A fit
15.29 / 14.94 s against 0.6.2's 40.34 / 38.72 s; wasm high-water 84,475,904 bytes (80.56 MiB) against 0.6.2's 68,222,976 (65.06 MiB);
FIT_RMS 104.78 m, BTERM 0.012145; grid lookups 0 outside a fit, 236 by the fit's sets; grid cache 0 grids, 0 bytes before and after
the fit. Guard E2E and fit.e2e.mjs PASS.

## Amendment 6 (2026-11-06), registered before any row it governs

Finding (the ripple lane, on modules abd04b70's fit path, Molniya): Amendment 4's GridShareScope in fit.inc's finite-difference
fall-back brings the Molniya drag bias back: start 0 BTERM 0.045714 against the exact-grid variant's 0.044616 (threshold 0.00045), day
7 521 / 395 m against 238 / 174 m. With only that scope removed: BTERM 0.04461633761935712, days 15.5 / 54.9 / 238.0, bit-equal to the
exact-grid variant. Cause: the fall-back columns' copies, reading the nominal's grid linearly, miss the grid's own derivative in the
elements, so the solve converges elsewhere. The drag-rate probe's and the AGOM column's scopes are harmless (their copies have the
nominal's n, e and i, the same key). Fix: the fall-back's `xpt::GridShareScope share(nominal.s);` line is deleted; the other two scopes
and fit_oem.inc's FitGridScope stay. Cost bound: the fall-back runs at most twice per fit (fd_used < 2), so its copies' own exact-key
grid builds are bounded, and under FitGridScope they are freed when dropped. Measured and reported: THEMIS A fit time and wasm
high-water in MiB against 0.6.2 and Amendment 5; the guard E2E (0 lookups outside a fit, the cache identical before and after) and
fit.e2e.mjs PASS.

Where (src/fit_oem.inc only): fit.inc builds every set the solve evaluates (the nominal, each trial step, each perturbed copy) through
fit::residuals, outside this record's paths, so the flag is set by a scope in fit_oem.inc around the fit's solve (each run_pass, as the
fit's Jacobian fall-back is scoped today): every set initialised inside it takes an exact grid, the nominal and the perturbed copies
alike; it is never set on a flight or on covariance propagation outside the fit. No other change.

Expected effect: the BTERM partial no longer biased by shared grids; below e 0.3 no grid is built, so those fits are byte-identical.

Acceptance (the ripple lane's 6-window Molniya set, its paired rule: ratio candidate / 0.6.2 of the 3D RMS per window at days 1, 3 and
7, median with the 95 % window-cluster bootstrap, upper bound at most 1.05 at each day); fit time per window against 0.6.2's 25.3 s
median and fit peak wasm memory, reported beside; the guard E2E (test/fit-second-solution.e2e.mjs) and the fit E2Es PASS, byte-identical
where no grid is used.
