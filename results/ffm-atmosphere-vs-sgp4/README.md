# XM2: does FFM with our atmosphere, fitted to 72 h of precise truth, beat public SGP4 on drag-strong LEO?

**No, by the registered rule.** Our full-force propagator (propagator/ffm), fitted by analysis/estimation to 72 h of precise truth
under NRLMSISE-00 on the weather as issued (F2), and with the open-DCA nowcast (F3), does not beat the public Space-Track set under
the console's SGP4 (P) on drag-strong precise LEO (Swarm A, B and C, GRACE-FO 1 and 2). The arms fail on 11 % of the windows (F2: 86
of 750 fits do not converge; F3: 70 fits do not converge and 10 windows have no nowcast), and each failure is a registered loss.
That fails rule 3 (at most 1 % failures), and rule 2 (the p95 ratio) with it, at every lead. On the median alone (rule 1), FFM halves SGP4's error at day 1 (F2
-53 %, F3 -51 %), F2 is 17 % better at day 2, and from day 3 both are level with SGP4.

**The open DCA does not help FFM.** F3's median error is 4 % to 10 % above F2's on drag-strong LEO (day 2: +10.0 %, interval
+3.0 % to +19.5 %, wholly above 0), and within 0.1 % of it on Sentinel-1.

On Sentinel-1 (S1, near 700 km), F2 has no failures and its median error is 76 %, 54 %, 41 % and 13 % below P's at days 1, 2, 3
and 7. It still fails the rule by rule 2 alone: the upper bound of the p95-ratio interval is 1.18, 1.39 and 1.12 at days 1, 2 and 7.
F2 beats XM's AP XP (X2) on Sentinel-1 by every rule at every lead.

**EXPLORATORY (not registered, descriptive, no bootstrap): the windows whose fit converged.** Where the F fit ended CONVERGED, FFM
beats SGP4 at every lead on drag-strong LEO:

| Lead | F2 against P (664 pairs) | p95 ratio | F3 against P (670 pairs) | p95 ratio |
| --- | --: | --: | --: | --: |
| Day 1 | -59.5 % | 0.94 | -56.7 % | 0.94 |
| Day 2 | -25.8 % | 1.06 | -24.0 % | 0.92 |
| Day 3 | -13.6 % | 0.86 | -16.5 % | 0.86 |
| Day 7 | -11.4 % | 0.81 | -19.4 % | 0.74 |

- **The failed windows are not the hard ones.** P's median error in the windows where F2's fit failed is 0.739, 1.259, 2.305 and
  13.94 km at days 1, 2, 3 and 7, against 0.763, 1.309, 2.454 and 15.35 km over all windows; for F3's failures, 0.753, 1.246, 1.964
  and 13.49 km.
- **Hypothesis (not tested here): the Jacobian floor.** The fits that fail are the ones that fit best: their median reduced
  chi-square is 1.32 (F2) and 1.69 (F3), against 4.11 and 5.55 for the fits that converged. analysis/estimation's version 3 scales
  its convergence test by the misfit only above a reduced chi-square of 1; near and below it the test is the absolute one, and on
  precise data at a 10 m sigma it may ask for a step finer than the accuracy of propagator/ffm's Jacobian (the density gradient by
  finite difference), so trials are rejected (about 20 per failed fit) until the fit ends STALLED or at its 40 rounds. Sentinel-1,
  where drag is weak, has 1 failure in 536 fits.

Generated from `results/ffm-atmosphere-vs-sgp4/table.json` (`node experiments/ffm-atmosphere-vs-sgp4/table.mjs`, 1,057 stored
windows and 21 amended; rows digests primary `e3ff825c2888`, as written `b86d73517670`). Plan:
[PLAN.md](../../experiments/ffm-atmosphere-vs-sgp4/PLAN.md), registered at 2026-10-30T15:49:10-04:00 (commit 7bc9314, pushed to
origin `wip/experiments-ffm-atmosphere-vs-sgp4-20261030/registration` before any score), runner 63aae98 before any scored run,
amendment A1 c339177 (code 687b537, 6515aae). Modules fbda89450: propagator/ffm 2.0.4 c36f1b14fc233e88, analysis/estimation 0.6.0
0e7b4f6ad359f7be; XM-fast's code at 2c7b326 for P and X2.

## Which verdict is primary, and why

Amendment A1 (PLAN.md) is primary, as the coordinator ruled on 2026-10-30 before any cell was computed. The GFZ file reports no
F10.7 for 2026-05-09; sdn-ap reads the last row at or before a day (SPEC 15.2), so X2 read the 05-08 row for it, while propagator/ffm
needs a row for every day and refused 21 windows (cutoffs 2026-05-11 to 05-13). A1 gives each missing day the last row at or before
it, so the F arms read exactly the drivers X2 read: the registered intent, which the text did not spell out for a day inside the
rows. 2026-05-09 is the only missing day in any cutoff's span. Only those 21 windows' F arms were rerun; the refusal rows are kept.
The verdict as written (the refusals as losses) is reported beside it, and it is the same: no.

## What a pass means

- The F arms fit truth-quality precise products over the 72 h before the cutoff. Those products are not real-time; P is the public
  set available at the cutoff.
- So a pass answers the owner's theory-and-atmosphere question ("with truth / owner operator data"). It does not answer the console
  supply question; operator files answer that.
- The F arms read final Earth orientation over the forecast horizon (IERS finals.all retrieved 2026-10-09), not the predictions
  issued at the cutoff; the effect at 7 days is meters against errors of kilometers. P and X2 read none.

## The registered rule

An F arm beats P in a group only if every lead cell (days 1, 2, 3 and 7; 72 h arc; as-issued weather O) meets all three:
(1) the 95 % cluster-bootstrap interval of the median ln(e_F / e_P) lies wholly below 0; (2) the upper bound of the interval of
ln(p95 of e_F / p95 of e_P) is below ln 1.10; (3) the F arm fails on at most 1 % of the pairs; a fit that does not end CONVERGED is
a failure, and a failure's e is +Infinity. e is the 3D RMS position error of the lead day (km); clusters are orbit group x ISO week
(Swarm A and C one orbit group, GRACE-FO 1 and 2 one, Sentinel-1A and 1C one); 10,000 draws. When more than 5 % of an arm's pairs
fail, its p95 is +Infinity and rule 2 cannot hold ("inf" below).

## Primary: F3 and F2 against P (72 h arc, condition O, A1)

Group P, drag-strong precise LEO: 750 pairs in 66 clusters at every lead; P never failed.

| Lead | F3 median (km) | P median (km) | Median paired ratio | 95 % interval | p95 ratio, upper bound | F3 failures | Rules met |
| --- | --: | --: | --: | --- | --: | --: | --- |
| Day 1 | 0.380 | 0.763 | -50.8 % | -57.9 % to -42.0 % | inf | 80 of 750 | 1 |
| Day 2 | 1.247 | 1.309 | -9.4 % | -24.7 % to +13.9 % | inf | 80 of 750 | none |
| Day 3 | 2.528 | 2.454 | +1.0 % | -17.0 % to +29.4 % | inf | 80 of 750 | none |
| Day 7 | 13.172 | 15.348 | -5.1 % | -19.4 % to +15.6 % | inf | 80 of 750 | none |

| Lead | F2 median (km) | P median (km) | Median paired ratio | 95 % interval | p95 ratio, upper bound | F2 failures | Rules met |
| --- | --: | --: | --: | --- | --: | --: | --- |
| Day 1 | 0.331 | 0.763 | -53.1 % | -59.6 % to -43.8 % | inf | 86 of 750 | 1 |
| Day 2 | 1.152 | 1.309 | -16.8 % | -23.8 % to -6.3 % | inf | 86 of 750 | 1 |
| Day 3 | 2.356 | 2.454 | -3.4 % | -11.7 % to +14.6 % | inf | 86 of 750 | none |
| Day 7 | 12.233 | 15.348 | +2.3 % | -9.0 % to +19.8 % | inf | 86 of 750 | none |

Group S1, Sentinel-1A and 1C (secondary LEO): 257 to 259 pairs in 21 clusters.

| Lead | F3 median (km) | P median (km) | Median paired ratio | 95 % interval | p95 ratio, upper bound | F3 failures | Rules met |
| --- | --: | --: | --: | --- | --: | --: | --- |
| Day 1 | 0.180 | 0.734 | -74.6 % | -81.9 % to -70.1 % | inf | 5 of 259 | 1 |
| Day 2 | 0.509 | 1.003 | -50.4 % | -62.4 % to -40.4 % | inf | 5 of 258 | 1 |
| Day 3 | 0.951 | 1.333 | -30.8 % | -50.8 % to -18.1 % | inf | 5 of 258 | 1 |
| Day 7 | 3.361 | 4.150 | -7.6 % | -13.0 % to -0.6 % | inf | 5 of 257 | 1 |

| Lead | F2 median (km) | P median (km) | Median paired ratio | 95 % interval | p95 ratio, upper bound | F2 failures | Rules met |
| --- | --: | --: | --: | --- | --: | --: | --- |
| Day 1 | 0.181 | 0.734 | -76.3 % | -83.9 % to -71.4 % | 1.18 | 0 of 259 | 1, 3 |
| Day 2 | 0.501 | 1.003 | -53.6 % | -67.0 % to -40.4 % | 1.39 | 0 of 258 | 1, 3 |
| Day 3 | 0.945 | 1.333 | -40.9 % | -52.6 % to -20.1 % | 1.08 | 0 of 258 | 1, 2, 3 |
| Day 7 | 3.317 | 4.150 | -12.6 % | -20.8 % to -5.0 % | 1.12 | 0 of 257 | 1, 3 |

Verdict: neither F3 nor F2 beats P in group P or in group S1. With satellite x ISO week clusters (110 in P), the same.

## Secondary

- **F3 against F2 (the open DCA's own effect): no, in both groups.** Group P: +10.4 % (interval -1.1 % to +19.0 %), +10.0 % (+3.0 %
  to +19.5 %), +6.8 % (-3.0 % to +13.0 %) and +4.1 % (-3.0 % to +14.0 %) at days 1, 2, 3 and 7. Sentinel-1: +0.0 % to +0.1 %.
  Where both fits converged (exploratory, 609 pairs in P), F3 is 8.1 %, 8.7 %, 5.3 % and 2.0 % above F2.
- **F2 against X2 (FFM against XM's AP XP on the same rows).** Group P: rule 1 holds at days 1 to 3 (-55.5 %, -19.5 %, -10.8 %),
  day 7 -1.5 % (-5.0 % to +2.2 %); rules 2 and 3 fail, so no. **Sentinel-1: passes** every rule at every lead (-72.2 %, -46.9 %,
  -34.3 %, -24.9 %; p95 upper bounds 0.97 to 1.01; no failures).
- **F3 against X2.** Group P: rule 1 at days 1 to 3 (-52.2 %, -19.1 %, -8.8 %); no. Sentinel-1: rule 1 at every lead (-71.6 % to
  -24.3 %), 5 failures; no.
- **X2 against P reproduces XM-fast:** the same pairs, median ratios and p95 ratios at every lead (+10.1 %, +16.6 %, +9.3 %, -7.8 % in
  group P); the intervals differ only by the bootstrap seed.

## As written (the 21 refused windows as F losses)

The same verdict, no, in every contrast and group. Group P: F3 -48.8 %, -7.1 %, +7.0 %, -3.3 % with 93 failures; F2 -49.9 %,
-14.3 %, -0.6 %, +6.4 % with 101 failures. Sentinel-1: F2 -74.6 %, -52.3 %, -38.8 %, -12.6 % with 6 failures (the refusals), so F2
against X2 on Sentinel-1 fails rule 3 as written. Every cell of both versions is in `table.json` (`primary`, `asWritten`).

## Fits (primary)

| Group | Arm | Fits | CONVERGED | STALLED | MAXIMUM_ITERATIONS | No `$DCL` |
| --- | --- | --: | --: | --: | --: | --: |
| P | F2 | 750 | 664 (88.5 %) | 60 (8.0 %) | 26 (3.5 %) | - |
| P | F3 | 740 | 670 (90.5 %) | 53 (7.2 %) | 17 (2.3 %) | 10 |
| S1 | F2 | 270 | 270 (100 %) | 0 | 0 | - |
| S1 | F3 | 266 | 265 (99.6 %) | 1 (0.4 %) | 0 | 4 |

Fits that did not converge, by satellite in group P (F2 of 150 fits, F3 of 148): GRACE-FO 1 28 and 23; Swarm B 24 and 18; GRACE-FO 2
19 and 19; Swarm A 11 and 6; Swarm C 4 and 4. The missing `$DCL` windows are those of XM-fast: analysis/density-calibration refused
the nowcast on 2026-04-09 and 2026-04-10 ("stale-fleet"); a missing nowcast is an F3 loss, as it was X3's. A converged fit took a
median 3 rounds.

## Windows

| Group | Registered and run | 72 h arc below 90 % coverage | Out of O (no RSGA in force) | Rerun under A1 | Pairs, O |
| --- | --: | --: | --: | --: | --: |
| P | 755 | 0 | 5 (2026-01-01) | 15 | 750 |
| S1 | 302 | 30 | 2 | 6 | 257 to 259 |

Every window ran; no row errored; in every window P and X2 equaled XM-fast's stored rows (bins, arc, rows, `$DCL`, P and X2), so no
defect stopped the run. Condition M (a sensitivity) was not run: it would take about 4 more hours, and its absence changes no
verdict (PLAN.md). XM's GN group and the 24 h arc are not part of XM2.

## Cost

Owner Mac Studio, 8 workers beside other lanes' load (load average 14 to 27), the experiments' SDK browser host. A 72 h fit took a
median 20.0 s in group P and 14.1 s on Sentinel-1: analysis/estimation rounds (a median 3), each one propagator/ffm run of 72 h at
RK78 (relative tolerance 1e-10, absolute 1e-7 m and m/s, steps up to 120 s) with the 8 x 8 STM, output at the 864 arc states (300 s).
A forecast took a median 17.4 s (P) and 12.0 s (S1): 10 days (the 3-day arc and the 7-day horizon) at the same integrator settings,
no STM, output at the 1,152 scored epochs on the 300 s grid. A failed fit ran up to 40 rounds, 160 s to 330 s. A whole window (P and
X2 rerun, F2, F3 and the scorer) took a median 76 s; the 1,057 windows took 30.0 worker-hours, 4.1 h on 8 workers (19:51 to
23:55 UTC); the 21 A1 windows 0.5 worker-hours.

## Disclosures

- Before the registration commit, a smoke test fitted and forecast one window outside the period (Swarm A, cutoff 2025-12-31) from
  its own four product files, without reading any truth after the cutoff and without a score. It measured the cost and checked that
  propagator/ffm 2.0.4 (built on SDS 1.271.0) takes the PRW the experiments encode with SDS 1.243.0. Its first forecast check
  compared each sample's label with its UTC request and failed: propagator/ffm labels samples in TDB (prw_execution.cpp:87); the
  check now requires the TDB system and one constant offset from the requests (to 2 ms).
- During the run the fit diagnostics (the STALLED counts) were watched and reported; nothing was changed for them. One structural
  test of the table code on 131 partial rows printed one cell's three rule flags; nothing was changed for it.
- Amendment A1 was found during the run (above). Its validation window (P|39452|2026-05-13) and group P's 14 other A1 windows ran
  as one process beside the 8 workers, with the coordinator's leave; S1's 6 ran after the 8 workers ended.
- propagator/ffm reads only the weather rows it is given: condition O's last row (D0 + 2) is held through D0 + 8, and under A1 the
  missing 2026-05-09 takes the 2026-05-08 row, the values sdn-ap reads for X2.
- The exploratory rows above condition on the fit's outcome and have no interval; they describe, they decide nothing.

## Reproduction

```
node experiments/ffm-atmosphere-vs-sgp4/run.mjs --launch 8 --condition O            # every window, 8 detached workers, PIDs in logs/
node experiments/ffm-atmosphere-vs-sgp4/run.mjs --launch 1 --amend A1 --condition O  # amendment A1: the refused windows' F arms
node experiments/ffm-atmosphere-vs-sgp4/table.mjs                                    # this table (primary and as written)
node experiments/ffm-atmosphere-vs-sgp4/run.mjs --check                              # E2E: pinned windows replayed exactly, table rebuilt
```

Every wasm is read with `git show` at modules fbda89450 and SHA-256 checked (`build.json`); all fitting and propagation are module
calls. XM-fast's code (experiments/xp-atmosphere-merit at 2c7b326) is imported unchanged and checked by `git diff --quiet`.

## Data and terms

Results use every dataset the run read; only aggregates are published. Space-Track.org GP element sets (USSPACECOM, 18 SDS) stay in
the local store. ESA Swarm precise orbits (SP3 COM); GFZ ISDC GRACE-FO rapid science orbits; contains modified Copernicus Sentinel
data 2026 (Sentinel-1 POEORB). GFZ Kp, ap, Ap and F10.7: CC BY 4.0, Matzka et al. (2021), doi:10.5880/Kp.0001. NOAA SWPC RSGA: US
Government work. IERS EOP (finals.all): IERS Earth Orientation Center. JPL DE440s: NASA JPL. The open-DCA `$DCL`: a derived
aggregate of Planet Labs PBC ephemerides, https://ephemerides.planet-labs.com/, CC BY-NC 4.0 (Planet states and arcs stay local).
