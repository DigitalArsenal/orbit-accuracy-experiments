# FSA: FFM with a short fit arc on unseen windows. Does the arc, not the model, explain F2's loss to the public set?

Registered 2026-11-03 (UTC), before any fresh score, under task `experiments-ffm-short-arc-fresh-20261031`, lane claude-ffmshort-d9.
`config.json` and `build.json` beside this file are part of the registration. Nothing here changes after this commit; a change before the
first fresh score is a dated amendment at the end, and a change after it is labeled exploratory. The coordinator ruled the population,
the families, the arc rule, the parity design and the pins on 2026-11-03 (GO message), on the STEP 0 report and the power simulation below.

## Question

The owner, 2026-10-30, verbatim: "I want our new atmospheric model to beat SGP4, which it should with truth / owner operator data."

XM3 (`experiments-ffm-atmosphere-xm3-20261031`, results README): FFM with NRLMSISE-00 fitted to 72 h of precise truth (F2) did not beat
the public set under SGP4 (P) by the registered rule: it won the median at every lead and failed the tail rule at days 1, 2 and 3. XM6
(`experiments-ffm-agom-prior-leo-20261031`, exploratory on XM3's spent windows; receipt
`graph/gauntlet/receipts/experiments-ffm-agom-prior-leo-20261031.json`; its results commit dbaa1deb on origin
`wip/experiments-ffm-agom-prior-leo-20261031/results`; its plan and runner on origin `wip/experiments-ffm-agom-prior-leo-20261031/runner`,
d0a6175; cited and pinned from those origin refs only) found that the same fit on 12 h of truth (A12) has p95
upper bounds against P of 0.44, 0.71, 0.84, 0.96 at days 1, 2, 3, 7 and medians -89.7, -64.4, -44.6, -26.3 % against P and -69.7, -48.2,
-35.2, -12.7 % against F2; 24 h and 36 h also hold and close at days 1-3; AGOM at a 1000 % prior changes no error; on Sentinel-1 the 12 h
arc loses to F2 at day 7 (+17.6 %) and 24 h does not. Every one of those numbers is a lead chosen on spent windows. This experiment is the
registered test of that lead on windows where no FFM forecast has been scored.

## What a pass means

- Every fitted arm reads truth-quality precise products, which are not real-time; P is the public set available at the cutoff. A pass at
  the cutoff reading answers the theory-and-fit question with zero-latency precise truth. The parity reading (arcs ending when the set was
  created) removes the data age, not the data quality.
- A pass changes no module, no console default and no public claim. It is not a catalog claim (catalog objects have public sets, not
  precise states) and not a console claim (operator ephemerides have their own latency and quality; Starlink files are blended forecasts).
  The next test needs operator data as the arc.

## Previously analyzed (disclosure)

- 2026-01-01..05-31 on Swarm A, B, C, GRACE-FO 1, 2, Sentinel-1A, 1C: spent for this question (XM2, XM3, XM5, XM6; XM7 open). Not used.
- 2026-06-01 onward on every C2 calibration object: C2's time hold-out, scored once by C2 for covariance, not released. Swarm and GRACE-FO
  truth for 2026-10-31..11-28: barred (operator-theory program). Not used.
- C2 (`experiments-c2-ffm-covariance-calibration-20261028`) fitted 24 h FFM arcs (profile P0) on these objects every second day of
  2025-10-03..2026-03-31 and on 2026-04-01..05-31 and read FFM forecast errors at 1..72 h to fit covariance constants; nothing against P,
  no 1..7 day cells. E13 and the open-DCA development split (2025-11-01..12-31) read densities, no orbit of a test split.
- XP2 (`experiments-xp2-fit-design-fresh-20261031`, 403b96a) fitted FFM arcs of 12, 24 and 72 h on exactly these group-P windows for the
  drag of SGP4-XP and scored XP forecasts, P, S17LP and S17LPc; it ran no FFM forecast. Its P, S17LP and S17LPc rows are published and are
  required equal to this run's, window by window (Reproduction). Its RFa12 and RFa24 FFM fits are the fits of A12 and A24 on these windows
  if the arc and settings are the same; the runner compares them and reports equal or differing, a check and not a rule.
- The open-DCA registered test (`experiments-open-dca-fix-test-20261031`, registration on a wip ref, not running on 2026-11-03, results
  unlanded) registered F2 (72 h fit and forecast) on Swarm A or B, one per file day of 2025-01-01..09-30, at cutoffs set by Planet file
  publication times. Those are different windows from this experiment's 00:00 UTC cutoffs; the dates and the truth overlap. Its rows were
  not opened. Disclosed by the coordinator's ruling.
- The arc lengths and the a-priori arc rule below were chosen from XM6's cells (spent windows). The power and false-positive simulation
  below was computed from XM6's and XM3's stored rows before this registration and shaped the families' order and the Sentinel-1 forms.
- STEP 0 read, for these dates and before this registration: file names and spans of the truth, the public sets' EPOCH and CREATION_DATE
  (P's age), the GFZ storm days, the normalized RSGA bulletins' existence; never truth states after a cutoff.

## Dates, groups, windows

Cutoffs at 00:00 UTC. Group P is the verdict's group; Sentinel-1 is secondary. No pooling across groups.

| Group | Objects (orbit-group cluster) | Truth | Cutoffs | Windows, ISO weeks |
| --- | --- | --- | --- | --- |
| P, primary span | Swarm A and C (one cluster), Swarm B, GRACE-FO 1 and 2 (one cluster) | ESA SP3 COM 10 s (archive reference states); GFZ RSO 30 s (XP2's converted copies, read only) | 2025-10-04..12-21 (79) | 395, 12 |
| P, extension | Swarm A, B, C | ESA SP3 COM 10 s | 2025-01-01..09-30 (273) | 819, 40 (W40 shared) |
| S1 | Sentinel-1A and 1C (one cluster) | Copernicus POEORB 10 s | 2025-10-05..12-21 (78) | 156, 12 |

The verdict for group P is on the pool (1,214 windows, 51 ISO weeks, XP2's exact pool); each span and each orbit group is printed beside
it, and no span or group is claimed unless its own cells meet the rule. GRACE-FO has no local truth before 2025-09-30, so the pool is 87 %
Swarm. Sentinel-1's truth lacks the file of the last day of each month: the 12 h and 24 h arcs of the 2025-11-01 and 12-01 cutoffs are not
run (counted), one bin leaves at 8 cutoffs per lead. The first cutoff of each span is the first with a full 72 h arc after the truth begins.

Bars: XM's and XM3's windows; C2's hold-out from cutoff 2026-06-01; Swarm and GRACE-FO truth for 2026-10-31..11-28; C2's held-out
objects (TerraSAR-X, Sentinel-1D, Stella, the six Galileo, LAGEOS-1, two COSMIC-2) and the ISS are out. Never read: C2's held-out row
files, B2 part 1a and part 5 files, census results, operator-capture content, C3-small's rows, the open-DCA test's rows and results, XM7's
results. No fetch: every input is in the archive.

## Arms

All through XM's code at 2c7b326 (truth, public set, weather, scorer), XM3's lib/ffm.mjs at ee2a513 (fit and forecast, settings), XM6's
lib/ffm.mjs (the `arm` takes its arc and prior; pinned by SHA-256 from origin `wip/experiments-ffm-agom-prior-leo-20261031/runner`) and
XP2's lib/sgp4fit.mjs at 403b96a (the SGP4 fits), unchanged; every wasm by `git show` at modules 9a05d899b, SHA-256 checked (build.json).

| Arm | Arc ends at | Arc | B prior | AGOM prior | Flown by | Role |
| --- | --- | --- | --- | --- | --- | --- |
| P | the cutoff | the newest public set with EPOCH and CREATION_DATE at or before the cutoff, its B* | | | propagator/sgp4 AFSPC | reference |
| A12 | the cutoff | 12 h of truth states | 30 % of seed | 30 % of seed | propagator/ffm | the lead; group P's primary arm |
| A24 | the cutoff | 24 h | 30 % | 30 % | propagator/ffm | Sentinel-1's primary arm |
| F2 | the cutoff | 72 h: XM3's F2, unchanged | 30 % | 30 % | propagator/ffm | the reference the lead is about |
| A12c | Tc = min(cutoff, the set's CREATION_DATE) | 12 h ending at Tc | 30 % | 30 % | propagator/ffm | parity |
| A24c | Tc | 24 h ending at Tc | 30 % | 30 % | propagator/ffm | parity |
| W12 | the cutoff | 12 h | 30 % | 1000 % of seed | propagator/ffm | report only: does the prior hold AGOM at 12 h |
| S17LP | the cutoff | SGP4 `fit_elements` to the last 17 h, P's B* | | | propagator/sgp4 AFSPC | data age (XP2's) |
| S17LPc | Tc | SGP4 `fit_elements` to the 17 h ending at Tc, P's B* | | | propagator/sgp4 AFSPC | the parity clock (XP2's calibrator) |

- Fit: analysis/estimation 0.7.0 `fit_batch` version 3 answered by propagator/ffm 2.0.4, XM3's profile P0 (C2's published-dimension
  seeds, B = A/m x 2.2 and AGOM = A/m x 1.3 as first values and a priori means; a priori diagonal position 100 km, velocity 10 m/s, each
  parameter the stated fraction of its seed; position observations 10 m per axis in GCRF; correction tolerance 0.01; sigma edit 5; at most
  40 iterations), EGM2008 70 x 70, Sun and Moon from DE440s, cannonball SRP with the conical shadow, NRLMSISE-00 drag, IERS 2010 solid tides
  and relativity; RK78 relative tolerance 1e-10, absolute 1e-7 m and m/s, initial step 60 s, minimum 1e-4 s, maximum 120 s; analytic STM.
  The arc is the truth's states in [end - L, end] thinned to 300 s (144, 288, 864 states); the reference epoch is the arc's first state.
- Forecast: propagator/ffm from the fitted state and parameters at the arc's first state to the scored epochs, the fit's forces,
  integrator and inputs, no STM, GCRF. Parity arms forecast from their arc's first state through cutoff + 7 d and are scored in the
  cutoff's bins.
- Stored per fit, new field: the a posteriori sigma of B and AGOM from fit_batch's covariance (fitV3 returns it); it feeds a report-only
  diagnostic and no rule. The fitted states are not stored; rows hold statistics and fit records only.
- Weather: XM's condition O, as issued, the rows of the cutoff for every arm, parity arms too: the newest RSGA issued at or before the
  cutoff, at most 72 h old; GFZ observed before it; trailing 81-day mean; the last predicted row held through D0 + 8 (XM3's driver rule,
  A1's fill); the 2025 bulletins normalized by XP2's registered data-preparation step (`experiments/xp2-fit-design/lib/rsga.mjs`, SHA-256
  in build.json, read by `git show`), the normalized text in XP2's store, SHA-256 checked. Earth orientation: B1's finals (XM3's), final
  values over the horizon, meters at 7 days. Condition M is not run.
- Coverage: an arc holding under 90 % of its states is not fitted; the window leaves that arm's cells, counted. S17LP and S17LPc are
  thinned to 300 s as XP2.
- Failures: a fit not ending CONVERGED, a refused forecast, a module refusal (weather rows out of range) or a non-finite state fails the
  arm in every bin of the window: d = +Infinity, a loss under rule 3, never dropped. B at the bound 0 is a converged fit, counted and printed.
  An SGP4 fit with B* at or below 0 or no convergence fails its arm, as XP2.

## The arc rule, fixed before any fresh score

12 h for drag-strong objects (group P), 24 h for drag-moderate (Sentinel-1). From XM6's spent cells: in group P, B over seed moves at most
4 % between 12 h and 72 h (1.15/1.18, 1.20/1.23, 1.40/1.44) and no fit sits at the bound; on Sentinel-1 the 12 h B sits at 0.94 of seed
against 0.61 at 72 h with 12 of 269 fits at the bound, and A12 loses to F2 at day 7 (+17.6 %, +7.1 to +26.2) while A24 does not (-0.7 %,
-2.7 to +5.4). The rule is tested as each group's primary arm; every arc runs on every group and is printed, so the rule's cost is visible;
the posterior sigma of B against its prior sigma is printed per object and arc with no rule attached. No threshold is chosen on these windows.

## Scoring and statistics

- As XM: truth grid at 300 s, leads 1, 2, 3, 7, bins with at least 260 of 288 epochs, e the 3D RMS position error in the truth's RTN
  axes (analysis/gp-error-model 0.11.0 pair_statistics), d = ln(e_arm / e_ref). P and the SGP4 arms go TEME to GCRF by foundation/frames.
- Rule 1: the interval of the median d wholly below 0. Rule 2: the upper bound of the interval of ln(p95_arm / p95_ref) below ln 1.10.
  Rule 3: failures at most 1 % of pairs. XM's rule is all three at every lead (1, 2, 3, 7).
- Interval: the 97.5 % percentile interval (1.25 %, 98.75 %) of a cluster bootstrap, 10,000 draws, xorshift128+ seeded by SHA-256 of
  `FSA|<group>|<span>|<arm>/<ref>|<lead>|<clusters>`; clusters: ISO week of the cutoff (primary); orbit group x ISO week and the 95 %
  interval printed beside every cell. A NaN statistic counts as +Infinity.
- False-positive rates printed beside every statement (below). Overall statement, report only: per window the mean d over the four leads.

### Families, written before any fresh score

Two families, each a fixed sequence; a statement is tested only if every earlier statement of its family passed; cells after a stop are
printed and labeled "not tested". Power at 97.5 % on ISO-week clusters from the simulation below (pool; Sentinel-1).

- Family P (group P, the pool): P1 A12 against P, XM's rule (power 97 %). P2 A12 against F2, rule 1 at days 1, 2, 3 (100 %). P3 A12c
  against P, XM's rule (parity; power not computable from spent rows). P4 A24 against P, XM's rule (71 %). P5 A12 against F2, rule 1 at
  day 7 (52-58 %; if it fails, the interval and the smallest effect it excludes are printed). P6 A24c against P, XM's rule.
- Family S (Sentinel-1): S1 A24 against P, rule 1 at days 1, 2, 3 (100 %); rule 2 is printed and not tested (not testable at 12 clusters).
  S2 A24 against F2, rule 1 at days 1, 2, 3 (100 %); day 7 printed with a no-loss reading (upper bound of the median interval below
  ln 1.10), not a rule. S3, a registered prediction of a loss, not a pass: A12 against F2 at day 7, the interval wholly above 0 (83 %).
- Report only, printed with the same cells: W12 against A12 and against P (median, p95 ratio, AGOM over seed, count at the bound); A12
  against A24; S17LP against P (data age) and its share of each arm's lead; S17LPc against P (the clock: holds 0 means creation time is P's
  information time); every arm by span, by orbit group, by tercile of P's age at the cutoff, by storm class; the post-storm cutoffs; the
  posterior sigma of B against the prior; every arm's B and AGOM over seed; the overall statement; the A12/RFa12 and A24/RFa24 fit comparison.

### Storms

Storm days in the spans, GFZ definitive Ap at least 40: 2025-01-01 (81), 03-26 (40), 04-05 (40), 04-16 (75), 05-29 (62), 06-01 (98),
06-02 (69), 06-03 (60), 06-13 (69), 08-09 (43), 09-15 (48), 09-30 (74), 10-01 (47), 10-02 (45), 11-06 (43), 11-12 (137), 11-13 (57).
The verdict cells include every window. Beside each cell: windows with a storm day in the 72 h before the cutoff (one class for every
arm), windows with a storm day in the forecast through that lead, and the rest; XM's screening class (Ap at least 50 or any Kp at least 6)
printed too; the median e of each arm at the five cutoffs after each storm day beside P's. A pass without the storm windows is not a pass.
If the tail rule fails only through storm windows, the verdict is no and the report says the tail is the storm response, not the arc.

### False-positive rate and power

- Before any fresh score (committed beside this plan): `power.mjs` resamples XM6's A12 and A24 rows and XM3's P and F2 rows (spent,
  2026-01-02..05-31) by ISO week with replacement into spans of this design (12 weeks of five objects plus 39 Swarm-only weeks; 11 weeks of
  two Sentinel-1 satellites), 400 spans, 1,000 draws, and prints the percent of spans passing each statement at the measured effect and at
  half the effect, and the whole-rule false-positive rate under the least favorable one-lead null (rule 1: the arm's errors scaled so the
  span's median d is 0; rule 2: scaled so the p95 ratio is 1.10; the others as scored; the largest over leads and nulls) on 100 spans.
  A 120-span, 400-draw run before this registration gave: pool A12/P 96.7 % (half effect 96.7), A12/F2 at days 1-3 100 %, at day 7 52-58 %,
  A24/P 70.8 %; primary span alone A12/P 30.8 %; Sentinel-1 XM's rule 0 %, A24/P rule 1 at days 1-3 100 %, A12/F2 day 7 above 0 83 %;
  whole-rule false positives 0 of 80 under every null. `power.json` holds the registered run.
- After the run, from the scored rows, with the table: XP2's computation (ISO weeks drawn with replacement to the span's own weeks, the
  same bootstrap inside each simulated span; the nulls above; whole rule at the least favorable null), per statement and per lead, at
  97.5 % and 95 %, both clusterings. A rate above nominal is reported; it changes no verdict.

## What each outcome means

| Outcome | Meaning |
| --- | --- |
| P1 passes | FFM with NRLMSISE-00 fitted to 12 h of precise states beats the public set at days 1, 2, 3 and 7 by XM's rule, on dates never scored, with zero-latency truth-quality input. |
| P1 fails rule 2 only | The median wins and the tail is not shown; no pass. Say which lead and whether the storm windows carry the tail. |
| P2 passes | The arc was F2's fault at days 1-3: the same model and fit on 12 h beats itself on 72 h. |
| P3 passes | The lead survives equal data age (on better data). |
| P3 ties (interval holds 0 inside -9.1 to +10 %) or is not determined (wider) | On equal data age there is no shown lead at that lead; the cutoff-reading lead there belongs to fresher data. |
| P5 passes | The short arc also wins the long lead against the 72 h fit on drag-strong objects. P5 fails: the 72 h arc's B still pays at day 7; print the interval. |
| S1 and S2 pass | On Sentinel-1 the 24 h arc beats P and the 72 h fit at days 1-3. Nothing is claimed at day 7 there. |
| S3 confirmed | The 12 h arc loses the long lead where drag is weak: the a-priori arc rule's reason replicates. S3 not confirmed: the rule's reason is not shown on unseen windows; the rule stands as registered and is reported as such. |
| Everything fails | No claim on these dates; the owner gets the cells, their widths and the false-positive rates. |

## Reproduction

- Pins: build.json (modules 9a05d899b: propagator/ffm 2.0.4, analysis/estimation 0.7.0, propagator/sgp4 1.4.1, analysis/gp-error-model
  0.11.0, foundation/frames 0.2.0; every wasm by `git show`, SHA-256 checked). analysis/gp-error-model stays at 0.11.0 although modules
  main moved it to 0.12.0 (16f1ef678, one SGP4 mode) because the scorer must equal XM3's, XM6's and XP2's for the equality proof; the ffm,
  estimation, sgp4 and frames wasm and both host files are byte-identical at 9a05d899b, 039246731 and origin/main dd4dccac6.
- Proof before any fresh window (the spent-window control; a miss stops the run): F2 through this code at 72 h equals XM3's stored rows
  on P|39452|2026-03-10, S1|39634|2026-03-10 and P|43476|2026-02-13; A12 and A24 through this code equal XM6's stored rows on
  P|39452|2026-01-22 and A24 on P|43476|2026-02-13 (XM6's store, rows digest 28a69158e229); for every fresh window as it runs, P and
  S17LPc equal XP2's stored rows (rows digest e4cff2a36484) in every number, else the worker writes DEFECT.json and every worker stops.
- The table is built only after every window is stored; no cell is read while the run goes, only counts of windows and failures.
- All fitting and propagation are WASM module calls; JavaScript moves FlatBuffers, reads truth by XM's code and does statistics.
  Space-Track sets and truth states stay in the local store; results are aggregates.
- E2E: `node experiments/ffm-short-arc/run.mjs --check`: the pinned windows of config.json `check` re-run and every stored number
  compared exactly; the table rebuilt from the stored rows equal to the committed table.json byte for byte.
- Cost (8 workers under nice): fits A12 2.6 s, A24 6.1 s, F2 24.5 s median; forecasts about 17 s each; SGP4 fits under 0.3 s. About 150 s
  per group-P window, about 7 h for 1,370 windows.

## Amendment 1, 2026-11-03, before any fresh score: the posterior sigma of B is not stored

XM6's `lib/ffm.mjs` returns the fit record without fit_batch's covariance, and the proof compares whole fit records with XM3's and XM6's
stored rows byte for byte. Storing the a posteriori sigma would mean changing the pinned file or the record, and either breaks that
equality. The report-only diagnostic of the arc rule (the posterior sigma of B against its prior) is therefore not computed in this run;
it attached to no rule and no statement. The arc rule stands on its registered reasons and on every arc being run and printed on every
group. `lib/sgp4fit.mjs` is XP2's with one import line resolved to this experiment's `common.mjs` (XP2's own redirects XM's store and
weather), nothing else. `common.mjs` sets `XM_STORE` to this store and points XM's public-set days and RSGA directory at this
experiment's (XP2's pattern); in proof mode it redirects nothing, so F2, A12 and A24 run in the environment XM3 and XM6 ran in. No cell,
rule, arm or statistic changes.

## Amendment 2, 2026-11-03, after the run and before any verdict was read: the null construction of the false-positive rates

Found when `fpr.mjs` first ran on the stored rows: every rate came out exactly 0, including the single-lead rule-1 rates that should sit
near the nominal 1.25 % at 97.5 %. The cause was the construction, not the data: the first `fpr.mjs` and the null rows of `power.mjs`
scaled each simulated span so that its own median d was exactly 0, and a bootstrap centered on that span's point estimate can then never
put its upper bound below 0, so a pass was impossible by construction. The registered description ("the arm's errors at the lead scaled so
the span's median d is 0") means XP2's construction, which `fpr.mjs` and `power.mjs` now follow: the scale is fixed once from the full set
of windows the spans are drawn from (every scored window of the statement; every spent window of the design), and the simulated spans are
drawn from that scaled set, so their medians vary around the null as real spans would. `power.json` is regenerated with the same spans and
draws: its power rows (the percent passing at the measured and half effect) are unchanged in definition; only its false-positive rows change.
No verdict was read before this correction; no cell, rule, tolerance, arm or statement changes.

The defect, by line: `fpr.mjs` (942fe49) computed `factor = exp(-base[L].med)` (rule 1) or `exp(ln 1.10 - base[L].lr)` (rule 2) from
`base = evaluate(span, ...)`, the simulated span's own point statistics, inside the spans loop; `power.mjs` (6381ffb) did the same from
`ev.A12P[L].med` and `ev.A12P[L].lr`. Corrected: `factors[L]` is computed once from every window of the statement (or of the design's
source rows) before the spans loop, and each simulated span is evaluated with that fixed scale. The rule the rate serves (rule 1 at 0, rule 2
at ln 1.10, the levels, the clusters) is unchanged.

`table.mjs` also changed after the rows were read (ea70019 to the landed version): it reads `false-positive.json` and prints the rates beside
every statement; it reads `verdicts-registered.json`, the verdicts of the table code exactly as registered at ea70019 run unchanged on the
same rows, and prints both verdict sets side by side, where the registered code's verdict is the one on record and a differing corrected
verdict is labeled exploratory; it opens the README with a plain-words reading generated from the verdicts; the cluster-split cells take a
subset of rows through the same `pairsOf`. `cellStats`, `pairsOf`, the seeds, the rules, the levels, the family logic and the statement
definitions are unchanged. Reason: the first version had no rows to run on; the date is 2026-11-03.
