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
