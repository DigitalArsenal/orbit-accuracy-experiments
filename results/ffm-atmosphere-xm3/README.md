# XM3: with analysis/estimation 0.7.0, does FFM with our atmosphere, fitted to 72 h of precise truth, beat public SGP4 on drag-strong LEO?

**No, by the registered rule.** With the convergence fix every fit of our full-force propagator (propagator/ffm) ends CONVERGED, so
XM2's failures are gone: F2 (fitted by analysis/estimation to 72 h of precise truth under NRLMSISE-00 on the weather as issued) fails
on 0 of group P's 750 windows, where XM2 failed on 86. On drag-strong precise LEO (Swarm A, B and C, GRACE-FO 1 and 2), F2's median
error is below the public Space-Track set under the console's SGP4 (P) at every lead: -60.9 %, -29.2 %, -17.5 % and -14.2 % at days
1, 2, 3 and 7, every interval wholly below 0. Its p95 is lower too (ratios 0.94, 0.93, 0.90 and 0.80). But rule 2 asks that the upper
bound of that ratio's interval lie below 1.10, and the bound is 1.26, 1.31 and 1.20 at days 1, 2 and 3 (1.05 at day 7). F2 meets all
three rules only at day 7, so the verdict is no.

**F3 could not pass, and the open DCA still does not help FFM.** The open DCA refused its nowcast on two days, so F3 (F2 with the
open-DCA nowcast) fails 10 of 750 pairs whatever the fit does, above rule 3's 1 %; the registration said so before any score. F3
also fails rule 2 at every lead and rule 1 at day 3. F3's median error is 10.6 %, 10.4 %, 7.8 % and 4.9 % above F2's at days 1, 2, 3
and 7 (the interval wholly above 0 at days 1 to 3).

**On Sentinel-1 nothing changes.** All 270 F2 fits there are byte-identical to XM2's, so F2 is 76 %, 54 %, 41 % and 13 % below P at
days 1, 2, 3 and 7 with no failures and still fails on rule 2 alone (upper bounds 1.18, 1.39 and 1.12 at days 1, 2 and 7). F2 beats
XM's AP XP (X2) on Sentinel-1 by every rule at every lead, as in XM2.

**EXPLORATORY (not registered, descriptive, no bootstrap; it changes no cell): where the p95 tail comes from.** In group P, F2's
point p95 is below P's at every lead (1.46 against 1.56 km, 4.54 against 4.86, 10.33 against 11.43, 58.95 against 73.69), and F2 is
the lower in 86 %, 66 %, 60 % and 56 % of the pairs. Its largest errors cluster in time, and clusters are what the bootstrap resamples:

- About half of F2's top 5 % of windows at days 1, 2 and 3 (19, 23 and 22 of 38) have cutoffs in one ISO week, 2026-W04 (2026-01-19
  to 01-25), against 10, 12 and 11 of P's.
- That week holds the January storm: definitive Ap 73, 144 and 72 on 2026-01-19 to 01-21, where the RSGA in force at the 01-19 cutoff
  gave 20, 16 and 10.
- In that week F2's median is above P's at every lead (1.71 against 0.88 km, 6.58 against 2.35, 10.72 against 5.04, 58.2 against
  20.2). Over the other weeks F2's point p95 is 1.08, 3.88, 8.32 and 48.5 km, against P's 1.43, 4.51, 10.37 and 69.2.
- **Hypothesis (not tested here):** the as-issued rows miss the storm, and the arcs of the following cutoffs span it, so the fitted B
  absorbs it. Condition M (observed weather) would test that and was not run. The week is part of the registered test: no interval
  was computed without it.

Generated from `results/ffm-atmosphere-xm3/table.json` (`node experiments/ffm-atmosphere-xm3/table.mjs`, 1,057 stored windows, rows
digest `1af3adb87236`). Plan: [PLAN.md](../../experiments/ffm-atmosphere-xm3/PLAN.md), registered at 2026-10-30T21:16:10-04:00
(commit c56dbd1, pushed to origin `wip/experiments-ffm-atmosphere-xm3-20261031/registration` before any score), runner 3af42a8 before
any scored run, amendment 1 ee2a513. Modules 9a05d899b: analysis/estimation 0.7.0 7a555ca5b3ed0b02, propagator/ffm 2.0.4
c36f1b14fc233e88; XM-fast's code at 2c7b326 for P and X2. Beside XM3: XM2 (2f75aba), the same windows with estimation 0.6.0.

## These windows were analyzed before

XM3 re-scores XM2's registered windows (groups P and S1, cutoffs 2026-01-01 to 2026-05-31, condition O) with one change,
analysis/estimation 0.7.0. XM2's rows and cells, including its exploratory converged-only rows, were published before XM3's
registration and were read by its registrants. The change was motivated by fit failures, not by accuracy: XM2's failed fits were its
best fits by chi-square, and the module change was verified on three of them by termination, rounds and B only. The rule, the
windows, the cuts, the clusters, the bootstrap seeds and every fit setting are XM2's. XM3 is a re-analysis of known windows, not a
fresh sample; a pass here would have been weaker evidence than a pass on unseen windows.

## What a pass means

- The F arms fit truth-quality precise products over the 72 h before the cutoff. Those products are not real-time; P is the public
  set available at the cutoff.
- So a pass answers the owner's theory-and-atmosphere question ("with truth / owner operator data"). It does not answer the console
  supply question; operator files answer that.
- The F arms read final Earth orientation over the forecast horizon (IERS finals.all retrieved 2026-10-09), not the predictions
  issued at the cutoff; the effect at 7 days is meters against errors of kilometers. P and X2 read none.

## The registered rule (XM2's)

An F arm beats P in a group only if every lead cell (days 1, 2, 3 and 7; 72 h arc; as-issued weather O) meets all three:
(1) the 95 % cluster-bootstrap interval of the median ln(e_F / e_P) lies wholly below 0; (2) the upper bound of the interval of
ln(p95 of e_F / p95 of e_P) is below ln 1.10; (3) the F arm fails on at most 1 % of the pairs; a fit that does not end CONVERGED is
a failure, and a failure's e is +Infinity. e is the 3D RMS position error of the lead day (km); clusters are orbit group x ISO week
(Swarm A and C one orbit group, GRACE-FO 1 and 2 one, Sentinel-1A and 1C one); 10,000 draws seeded by XM2's labels. When more than
5 % of an arm's pairs fail, its p95 is +Infinity and rule 2 cannot hold ("inf" below, in XM2's columns).

**Known before any score (input availability).** The open DCA refused its nowcast for the cutoffs 2026-04-09 and 2026-04-10
("stale-fleet"), so F3 fails 10 of group P's 750 pairs and 4 of S1's at every lead whatever the fit does; rule 3 allows 7.5 and 2.6.
By construction F3 cannot pass; F2 against P is the comparison that can. The registration says so (PLAN.md). Those failures also count
as +Infinity in F3's p95, which raises its point ratio and its upper bound.

## Primary: F3 and F2 against P (72 h arc, condition O), with XM2 beside

Group P, drag-strong precise LEO: 750 pairs in 66 clusters at every lead; P never failed.

| Lead | F3 median (km) | P median (km) | Median paired ratio | 95 % interval | p95 ratio | p95 ratio, upper bound | F3 failures | Rules met | XM2: ratio, upper bound, failures, rules |
| --- | --: | --: | --: | --- | --: | --: | --: | --- | --- |
| Day 1 | 0.358 | 0.763 | -57.8 % | -65.4 % to -51.3 % | 1.09 | 1.56 | 10 of 750 | 1 | -50.8 %, inf, 80, 1 |
| Day 2 | 1.208 | 1.309 | -24.7 % | -35.7 % to -9.2 % | 1.06 | 1.54 | 10 of 750 | 1 | -9.4 %, inf, 80, none |
| Day 3 | 2.458 | 2.454 | -15.7 % | -26.4 % to +1.5 % | 1.02 | 1.48 | 10 of 750 | none | +1.0 %, inf, 80, none |
| Day 7 | 12.883 | 15.348 | -18.7 % | -28.5 % to -3.3 % | 0.76 | 1.20 | 10 of 750 | 1 | -5.1 %, inf, 80, none |

| Lead | F2 median (km) | P median (km) | Median paired ratio | 95 % interval | p95 ratio | p95 ratio, upper bound | F2 failures | Rules met | XM2: ratio, upper bound, failures, rules |
| --- | --: | --: | --: | --- | --: | --: | --: | --- | --- |
| Day 1 | 0.310 | 0.763 | -60.9 % | -66.0 % to -56.0 % | 0.94 | 1.26 | 0 of 750 | 1, 3 | -53.1 %, inf, 86, 1 |
| Day 2 | 1.025 | 1.309 | -29.2 % | -36.4 % to -20.3 % | 0.93 | 1.31 | 0 of 750 | 1, 3 | -16.8 %, inf, 86, 1 |
| Day 3 | 2.161 | 2.454 | -17.5 % | -27.4 % to -8.0 % | 0.90 | 1.20 | 0 of 750 | 1, 3 | -3.4 %, inf, 86, none |
| Day 7 | 11.955 | 15.348 | -14.2 % | -24.2 % to -3.2 % | 0.80 | 1.05 | 0 of 750 | 1, 2, 3 | +2.3 %, inf, 86, none |

Group S1, Sentinel-1A and 1C (secondary LEO): 257 to 259 pairs in 21 clusters.

| Lead | F3 median (km) | P median (km) | Median paired ratio | 95 % interval | p95 ratio | p95 ratio, upper bound | F3 failures | Rules met | XM2: ratio, upper bound, failures, rules |
| --- | --: | --: | --: | --- | --: | --: | --: | --- | --- |
| Day 1 | 0.181 | 0.734 | -74.6 % | -81.9 % to -70.1 % | 0.91 | 2.56 | 4 of 259 | 1 | -74.6 %, inf, 5, 1 |
| Day 2 | 0.507 | 1.003 | -51.2 % | -62.4 % to -40.4 % | 1.13 | 4.29 | 4 of 258 | 1 | -50.4 %, inf, 5, 1 |
| Day 3 | 0.950 | 1.333 | -32.2 % | -52.2 % to -18.4 % | 1.03 | 4.15 | 4 of 258 | 1 | -30.8 %, inf, 5, 1 |
| Day 7 | 3.349 | 4.150 | -8.1 % | -13.3 % to -1.3 % | 1.00 | 5.93 | 4 of 257 | 1 | -7.6 %, inf, 5, 1 |

| Lead | F2 median (km) | P median (km) | Median paired ratio | 95 % interval | p95 ratio | p95 ratio, upper bound | F2 failures | Rules met | XM2: ratio, upper bound, failures, rules |
| --- | --: | --: | --: | --- | --: | --: | --: | --- | --- |
| Day 1 | 0.181 | 0.734 | -76.3 % | -83.9 % to -71.4 % | 0.51 | 1.18 | 0 of 259 | 1, 3 | -76.3 %, 1.18, 0, 1, 3 |
| Day 2 | 0.501 | 1.003 | -53.6 % | -67.0 % to -40.4 % | 0.75 | 1.39 | 0 of 258 | 1, 3 | -53.6 %, 1.39, 0, 1, 3 |
| Day 3 | 0.945 | 1.333 | -40.9 % | -52.6 % to -20.1 % | 0.78 | 1.08 | 0 of 258 | 1, 2, 3 | -40.9 %, 1.08, 0, 1, 2, 3 |
| Day 7 | 3.317 | 4.150 | -12.6 % | -20.8 % to -5.0 % | 0.71 | 1.12 | 0 of 257 | 1, 3 | -12.6 %, 1.12, 0, 1, 3 |

Verdict: neither F3 nor F2 beats P in group P or in group S1, as in XM2. With satellite x ISO week clusters (a sensitivity, never the
verdict; 110 clusters in P, 42 in S1), F2 against P in group P meets every rule at days 3 and 7 and fails rule 2 at days 1 and 2
(upper bounds 1.16 and 1.25): still no. In S1 it fails rule 2 at every lead (1.19, 1.39, 1.10, 1.12): no.

## Secondary

- **F3 against F2 (the open DCA's own effect): no, in both groups.** Group P: +10.6 % (interval +2.2 % to +18.9 %), +10.4 % (+7.1 %
  to +21.3 %), +7.8 % (+1.0 % to +14.7 %) and +4.9 % (-0.1 % to +14.4 %) at days 1, 2, 3 and 7. Sentinel-1: +0.0 % to +0.1 %.
- **F2 against X2 (FFM against XM's AP XP on the same rows).** Group P: -63.2 %, -31.8 %, -20.6 %, -6.5 %, every interval wholly below
  0 and no failures; day 1 meets every rule, and rule 2 fails at days 2, 3 and 7 (upper bounds 1.15, 1.11, 1.11), so no. XM2: -55.5 %,
  -19.5 %, -10.8 %, -1.5 %. **Sentinel-1: passes** every rule at every lead (-72.2 %, -46.9 %, -34.3 %, -24.9 %; p95 upper bounds 0.97
  to 1.01; no failures), as in XM2.
- **F3 against X2: no.** Group P: rule 1 at days 1 to 3 (-59.2 %, -30.3 %, -18.2 %), day 7 -6.7 % (-14.8 % to +1.8 %). Sentinel-1: rule
  1 at every lead (-71.6 % to -24.7 %), 4 failures.
- **X2 against P reproduces XM2:** all 16 cells (both cluster forms) equal XM2's in every number: the same rows and the same seeds
  (+10.1 %, +16.6 %, +9.3 %, -7.8 % in group P).

## Fits, against XM2

| Group | Arm | Fits | CONVERGED | STALLED | MAXIMUM_ITERATIONS | No `$DCL` | XM2 CONVERGED |
| --- | --- | --: | --: | --: | --: | --: | --: |
| P | F2 | 750 | 750 (100 %) | 0 | 0 | - | 664 (88.5 %) |
| P | F3 | 740 | 740 (100 %) | 0 | 0 | 10 | 670 (90.5 %) |
| S1 | F2 | 270 | 270 (100 %) | 0 | 0 | - | 270 (100 %) |
| S1 | F3 | 266 | 266 (100 %) | 0 | 0 | 4 | 265 (99.6 %) |

- **The fits XM2 lost.** All 157 (in P 86 F2 and 70 F3; in S1 1 F3) now end CONVERGED: a median 11 rounds (95th percentile 15, at most
  21) and 8 rejected trials. Against XM2's best evaluated point, B moved by a median |ln ratio| of 8.7e-6 (at most 1.2e-3) and AGOM by
  1.4e-4. Those windows' errors enter the cells for the first time.
- **The fits XM2 converged with rejected trials.** 233 of the 246 are byte-identical to XM2's, every S1 fit among them. In group P, 13
  changed (8 F2, 5 F3): median rounds 12.5 to 10 (F2) and 13 to 11 (F3), B by a median |ln ratio| of 2.4e-6.
- **Invariance (report-only).** All 1,623 F arms whose XM2 fit converged with zero rejected trials equal XM2's byte for byte (fit record,
  GCRF digest, errors), as the module states of a fit with no rejected sub-tolerance trial.

## Amendment 1 (during the run, before any cell was computed)

The equality check stopped the run at P|39452|2026-05-14: its `filled` listed 2026-05-09, and XM2's row listed none. 152 rows were stored
once the other workers had finished their windows (PLAN.md's 147 is the count when the amendment was drafted). For the cutoff 2026-05-14 the rows begin on 05-08, so the registered drivers rule fills 05-09; propagator/ffm reads only from
05-10, so the row is inert, and XM2 reran under A1 only the windows propagator/ffm refused. The coordinator ruled that the check
compares `filled` only on the days propagator/ffm reads (D0 - 4 through D0 + 8), the span XM2's A1 defined. Exactly 7 windows were
affected, all of the cutoff 2026-05-14: group P 39452, 39451, 39453, 43476 and 43477, and S1 39634 and 62261. The flagged row's P, X2,
F2 and F3 equaled XM2's byte for byte. It stays in the store as evidence (`table.json` `amendment1`), its window was rerun, and
`DEFECT.json` is kept as `DEFECT.amendment-1.json`. The guard stayed armed for every other field; nothing else stopped the run.

## Windows

| Group | Registered and run | 72 h arc below 90 % coverage | Out of O (no RSGA in force) | Windows with 2026-05-09 filled | Pairs, O |
| --- | --: | --: | --: | --: | --: |
| P | 755 | 0 | 5 (2026-01-01) | 20 | 750 |
| S1 | 302 | 30 | 2 | 8 | 257 to 259 |

Every window ran; no row errored; in every window P and X2 equaled XM2's stored rows (bins, arc, rows, held days, `$DCL`, P and X2).
Condition M (a sensitivity) was not run; its absence changes no verdict (PLAN.md). XM's GN group and the 24 h arc are not part of XM3.

## Cost

Owner Mac Studio, 16 workers beside other lanes' load (load average up to 29), the experiments' SDK browser host. A 72 h fit took a
median 18.9 s in group P and 16.7 s on Sentinel-1: analysis/estimation rounds (a median 3), each one propagator/ffm run of 72 h at RK78
(relative tolerance 1e-10, absolute 1e-7 m and m/s, steps up to 120 s) with the 8 x 8 STM, output at the 864 arc states (300 s). A fit
XM2 lost took a median 70 s and 11 rounds, at most 146 s and 21 rounds. A forecast took a median 16.9 s (P) and 13.6 s (S1): 10 days (the
3-day arc and the 7-day horizon) at the same integrator settings, no STM, output at the 1,152 scored epochs on the 300 s grid. A whole
window (P and X2 rerun, F2, F3 and the scorer) took a median 73.6 s; the 1,057 windows took 24.0 worker-hours (XM2: 30.0), 1.6 h on 16
workers (01:23 to 03:02 UTC, with about 4 minutes stopped for amendment 1).

## Disclosures

- XM3's registration was pushed before any score and its runner committed before any scored run (above). Rows carry their sources' SHA-256:
  152 rows under the runner, 906 under amendment 1; the code that computes a row did not change between them.
- Before the first scored window, XM2's smoke window (Swarm A, cutoff 2025-12-31, outside the period) ran under 0.7.0: F2 and F3 CONVERGED
  in 3 rounds with no rejected trial, as in XM2's smoke test; no truth after its cutoff was read and nothing was scored.
- During the run the progress, the fits' terminations and the invariance count were watched; nothing was changed for them. Nothing in the
  plan, the rule or the code changed after the first cell was computed.
- The exploratory paragraph above was written after the verdict was known. It conditions on the result, has no interval, and decides nothing.
- XM2's README hypothesized a Jacobian floor. The module change found the cause in the noise of the cost's evaluation, from RK78 step
  decisions (modules af6f94398).
- **Erratum (XM2's README, not edited here).** XM2's README gives its as-written rows digest as `b86d73517670`; the digest is `b86d7351767b`,
  as XM2's table.json records (`b86d7351767bee91...`). Its primary digest `e3ff825c2888` is right.

## Reproduction

```
node experiments/ffm-atmosphere-xm3/run.mjs --smoke                    # XM2's smoke window under 0.7.0, before the first scored window
node experiments/ffm-atmosphere-xm3/run.mjs --launch 16 --condition O  # every window, 16 detached workers, PIDs in logs/
node experiments/ffm-atmosphere-xm3/table.mjs                          # this table
node experiments/ffm-atmosphere-xm3/run.mjs --check                    # E2E: pinned windows replayed exactly, table rebuilt
```

Every wasm is read with `git show` at modules 9a05d899b and SHA-256 checked (`build.json`); all fitting and propagation are module calls.
XM-fast's code (experiments/xp-atmosphere-merit at 2c7b326) is imported unchanged and checked by `git diff --quiet`; XM2's rows and table
are read only, their digests checked.

## Data and terms

Results use every dataset the run read; only aggregates are published. Space-Track.org GP element sets (USSPACECOM, 18 SDS) stay in the
local store. ESA Swarm precise orbits (SP3 COM); GFZ ISDC GRACE-FO rapid science orbits; contains modified Copernicus Sentinel data 2026
(Sentinel-1 POEORB). GFZ Kp, ap, Ap and F10.7: CC BY 4.0, Matzka et al. (2021), doi:10.5880/Kp.0001. NOAA SWPC RSGA: US Government work.
IERS EOP (finals.all): IERS Earth Orientation Center. JPL DE440s: NASA JPL. The open-DCA `$DCL`: a derived aggregate of Planet Labs PBC
ephemerides, https://ephemerides.planet-labs.com/, CC BY-NC 4.0 (Planet states and arcs stay local).
