# XM3: XM2's windows and rule with analysis/estimation 0.7.0: does FFM with our atmosphere, fitted to 72 h of precise truth, beat public SGP4 on drag-strong LEO?

Registered 2026-10-31 (UTC), before any score, under task `experiments-ffm-atmosphere-xm3-20261031`. XM3 is XM2
(`experiments-ffm-atmosphere-vs-sgp4-20261030`: registration 7bc9314, runner 63aae98, amendment A1 c339177, results 2f75aba) with
one change: analysis/estimation 0.7.0 in place of 0.6.0. Its windows, cuts, clusters, leads, conditions, arms, fit settings,
environment, decision rule, statistics, public-set extraction and scorer are XM2's, unchanged; XM2's amendment A1 is registered
here from the start. `config.json` and `build.json` beside this file are part of the registration. Nothing here changes after this
commit; a change before the first score is a dated amendment at the end, and a change after it is labeled exploratory.

## Question

The owner, 2026-10-30, verbatim: "I want our new atmospheric model to beat SGP4, which it should with truth / owner operator data."

XM2 asked whether propagator/ffm, fitted by analysis/estimation to 72 h of precise truth under NRLMSISE-00 on the as-issued weather
(F2), and times the open-DCA nowcast (F3), beats the public set under the console's SGP4 (P). By the registered rule it does not.
The loss came from rule 3: 86 of group P's 750 F2 fits and 70 of its 740 F3 fits ended STALLED or MAXIMUM_ITERATIONS, and each was
a loss. analysis/estimation 0.7.0 changes only fit_batch's convergence test. XM3 asks XM2's question again with 0.7.0.

Primary, in XM2's order: F3 against P, then F2 against P. Secondary: F3 against F2, F2 and F3 against X2, and X2 against P (it
reproduces XM2's cell).

## Previously analyzed windows (disclosure)

- **These exact windows were scored in XM2.** Groups P and S1, cutoffs 2026-01-01 to 2026-05-31, condition O: every row and every
  cell of XM2 is published (`results/ffm-atmosphere-vs-sgp4`, 2f75aba). That includes its exploratory rows: where the fit
  converged, F2 and F3 beat P at every lead in group P. The registrants of XM3 have read them.
- **The method change was motivated by fit failures, not by accuracy.** XM2's failed fits were its best fits by chi-square. The
  module change (modules af6f94398, task `modules-estimation-fit-v3-converge-at-noise-floor-20261031`, released at 9a05d899b)
  traced them to fit_batch version 3's convergence test asking for a decrease below the noise of propagator/ffm's cost (RK78 step
  decisions). It was verified on three of XM2's failed windows by termination, rounds and B against 0.6.0's best evaluated point
  (Swarm B 2026-05-20 F2, GRACE-FO 2 2026-04-25 F3, GRACE-FO 1 2026-02-13 F2: CONVERGED in 12, 16 and 7 rounds) and on a hermetic
  synthetic arc. Its commit reports no forecast error.
- **What 0.7.0 changes.** A rejected trial whose model decrease is below the tolerance measures the cost's evaluation noise; the fit
  is also CONVERGED when the Gauss-Newton step's predicted decrease is at most that noise and at most one scaled standard
  deviation, with the edit set a fixed point. A fit with no rejected sub-tolerance trial takes the same trials as under 0.6.0. No
  schema change; no fit setting changes.
- **The rule is unchanged.** The three conditions, failures counted as losses, the windows, cuts, clusters, leads, bootstrap seeds
  and every fit setting are XM2's. Nothing was chosen after looking at XM2's errors.
- So XM3 is a re-analysis of known windows, not a fresh sample. A pass shows that XM2's loss came from the convergence test, on
  these windows; it is weaker evidence than a pass on unseen windows.

## Input availability (known before any score)

- The open DCA refused its nowcast for the cutoffs 2026-04-09 and 2026-04-10 ("stale-fleet": its last supported solve was more than
  48 hours before issue). This is a fact of the inputs, not an outcome: XM's cached `$DCL` answers, unchanged since XM.
- So F3 fails 10 of group P's 750 pairs and 4 of S1's 257 to 259 at every lead, whatever the fit does. Rule 3 allows at most 1 %
  (7.5 and 2.6 pairs). **By construction, F3 cannot meet rule 3 in either group: F3 against P, F2 or X2 cannot pass.** Its cells
  are reported in full; they measure the open DCA's effect.
- **F2 against P is the comparison that can deliver a pass.** In group P it meets rule 3 only if at most 7 of its 750 fits fail. In
  S1, XM2's F2 had no failures and failed on rule 2 alone; 0.7.0 can change only the 46 S1 F2 fits that had rejected trials.
- The rule and the arms stay as registered: changing either now would be post hoc.

## What a pass means

- The F arms fit truth-quality precise products over the 72 h before the cutoff. Those products are not real-time; P is the public
  set available at the cutoff.
- So a pass answers the owner's theory-and-atmosphere question ("with truth / owner operator data"). It does not answer the console
  supply question; operator files answer that.
- The F arms use final Earth orientation over the forecast horizon (Environment); its effect at 7 days is meters against errors of
  kilometers. P and X2 use none.
- The windows were scored before (above). A pass of F2 against P in group P says: FFM with NRLMSISE-00 on the as-issued weather,
  fitted to 72 h of precise truth with a fit that converges at the cost's resolution, beats public SGP4 on drag-strong precise LEO
  at days 1, 2, 3 and 7 by XM2's registered rule, on XM2's windows.
- A failure is reported rule by rule (rule 1 the median, rule 2 the p95 tail, rule 3 the failures), with the fits that still do not
  converge.

## Arms

| Arm | What | Inputs |
| --- | --- | --- |
| F2 | propagator/ffm fitted by analysis/estimation 0.7.0 `fit_batch` version 3 to the 72 h arc, NRLMSISE-00 on the condition's rows (the candidate) | kernel, Earth orientation, `$SPW` rows |
| F3 | F2 with the density multiplied by exp(s(t)) of the open-DCA `$DCL`, in the fit and the forecast (the candidate) | as F2, and `$DCL` |
| X2 | XM's X2: SGP4XP with NRLMSISE-00 on the same rows, rerun with XM's code; must equal XM2's stored row | `$SPW` rows |
| P | XM's P: the newest public Space-Track set at the cutoff under the console's SGP4, rerun with XM's code; must equal XM2's stored row | the set |

F2 and F3 run in every window: the estimation wasm changed, and XM2's rows do not show which of its fits met a rejected
sub-tolerance trial, so no XM2 F row is reused. X2 and P are rerun in every window with XM's own code
(experiments/xp-atmosphere-merit at 2c7b326, imported unchanged) on wasm byte-identical to XM2's, and compared with XM2's stored
row (primary, A1), whose P and X2 equal XM's: the bins, the arc, the condition's rows, the held and filled days, the `$DCL`
digest, P and X2 (days, fit, TEME digest). Any difference is a software defect: the run stops and the defect is reported.

## Fit (profile P0, C2's for these objects; fixed; XM2's)

- analysis/estimation **0.7.0** `fit_batch` version 3, answered by propagator/ffm 2.0.4 `invoke`, driven by
  `harness/ffm-fit-v3.mjs` fitV3: one round at the stated sigma, each parameter's domain from propagator/ffm's
  FIT_PARAMETER_DOMAINS, ok only when the termination is CONVERGED.
- Estimated: the GCRF position and velocity at the arc's first state; B (DRAG_AREA_OVER_MASS, Cd A/m) and AGOM
  (SRP_AREA_OVER_MASS, Cr A/m), both in [0, inf). First values and a priori means: the object's bSeed and agomSeed in
  `results/ffm-covariance-calibration/seeds-R1R2.json` (published area and mass; B = A/m x 2.2, AGOM = A/m x 1.3). A priori
  diagonal: position 100 km, velocity 10 m/s, each parameter 30 % of its seed (C2's R1 and R2 profile, B2 A12's P0).
- Observations: XM's arc states as POSITION_VECTOR in GCRF, 10 m per axis; correction tolerance 0.01; sigma edit threshold 5; at
  most 40 iterations (propagation rounds, every trial counted).
- Forces: EGM2008 70 x 70 in Earth-fixed axes, the Sun and the Moon from DE440s, cannonball radiation pressure with the conical
  shadow, NRLMSISE-00 drag, IERS 2010 solid tides and relativity; no ocean tides, Earth radiation or winds.
- Integrator: RK78, relative tolerance 1e-10, absolute 1e-7 (m, m/s), initial step 60 s, minimum 1e-4 s, maximum 120 s; analytic
  STM with the density gradient by finite difference.
- Arc: XM's 72 h arc, the truth's states in [cutoff - 72 h, cutoff] thinned to every round(300 / step)-th state (864 states at
  300 s). An arc holding less than 90 % of its states is not fitted; the window leaves the F and X2 cells, counted.
- Forecast: propagator/ffm from the fitted state and parameters at the arc's first state to the scored epochs, with the fit's
  forces, integrator and inputs, no STM (the request of `harness/ffm-fit-v3.mjs` propagateV3), GCRF. propagator/ffm labels its
  samples in TDB; each sample must lie one constant offset from its requested UTC instant (to 2 ms), else the arm fails.
- A fit that does not end CONVERGED (MAXIMUM_ITERATIONS, STALLED, a fit-failed request), a refused forecast, a missing `$DCL` (F3)
  or a non-finite state fails the arm in every bin of that window: a loss (rule 3), never dropped. The CONVERGED share is reported
  per group, condition and arm.
- No tuning on scored windows: every setting is XM2's; nothing in the fit is chosen after this commit.

## Environment (fixed; XM2's, with A1)

- Kernel: DE440s (`/opt/data/sdn-archive/hac/naif-kernels/spk/planets/de440s.bsp`, SHA-256 in config.json).
- Earth orientation (required by the 70 x 70 field and the solid tides): B1's `earth_orientation_finals` rows
  (`/opt/data/sdn-archive/sdn-ap-baselines/environment/environment.json`, IERS finals.all.iau2000.txt retrieved 2026-10-09, parsed
  by data-source/eop-parser), read through the environment C2's FFM fits read; each arc takes the rows with MJD in
  [MJD(arc start - 2 d) - 1, MJD(last scored epoch + 2 d) + 1]. **These are final values over the forecast horizon, not the
  predictions issued at the cutoff.** The effect at 7 days is meters against errors of kilometers.
- Space weather: XM's rows of the condition (`lib/weather.mjs` rowsO and rowsM), the rows X2 reads, as SDS SPW rows (DATE,
  F107_OBS, F107_OBS_CENTER81, AP_AVG) in one PRW SPACE_WEATHER table. propagator/ffm and propagator/sdn-ap read them alike: on UTC
  day d, the observed F10.7 of day d - 1, the 81-day mean and Ap of day d; Kp feeds only the winds, which are off.
- **Drivers for every day (XM2's hold-last and amendment A1, registered here).** propagator/ffm reads only the rows it is given and
  needs every day of the arc and the day before. Every day from the rows' first day through D0 + 8 that has no row takes the last
  row at or before it, every value: sdn-ap's rule for X2 (SPEC 15.2). Past the last row (D0 + 2 under O, the RSGA's last predicted
  day) this is XM2's hold-last; inside the rows it fills 2026-05-09 (the GFZ file reports no F10.7 for it), in the spans of the O
  cutoffs 2026-05-11 to 2026-05-13. Input preparation only.
- `$DCL` (F3): XM's cached answers, the bytes XM's X3 read: the nowcast issued at the cutoff (O) and the hindcast issued at
  cutoff + 174 h (M). A refused `$DCL` fails F3 in that window (a loss).

## Conditions

- O (primary, as issued): XM's rowsO with the drivers above; the `$DCL` nowcast issued at the cutoff. A cutoff with no RSGA in
  force (2026-01-01) is excluded from O and counted.
- M (sensitivity): XM's rowsM; the hindcast issued at cutoff + 174 h. M runs only after every O window is stored and only if time
  remains; its absence changes no verdict.

## Groups, clusters, windows (XM2's)

Cutoffs at 00:00 UTC of every day 2026-01-01 to 2026-05-31 (151). Group P is run before group S1.

| Group | Objects (orbit-group cluster) | Truth | Windows |
| --- | --- | --- | --- |
| P, primary | Swarm A and C (one cluster), Swarm B, GRACE-FO 1 and 2 (one cluster) | ESA SP3 COM 10 s; GFZ ISDC RSO 30 s | 755 (750 in O) |
| S1, secondary | Sentinel-1A and 1C (one cluster) | Copernicus POEORB 10 s | 302 (30 below the 72 h arc coverage, 2 out of O) |

Not run (as XM2): XM's GN control, the 24 h arc, X0 and X3.

## Integrity cuts (XM's, unchanged; config.json `integrity`)

1. C2's held-out objects are out entirely: groups P and S1 hold none.
2. C2's calibration objects have no cutoff on or after 2026-06-01: every cutoff is in 2026-01-01..2026-05-31.
3. The ISS is out. 4. No laser-sphere group.
5. GPCV P0: Swarm and GRACE-FO truth is read only in 2025-12-28..2026-06-08.
6. Never read: C2's held-out row files, B2 part 1a and part 5 files, propagator-catalog-census results, operator-capture cycle
   content. C2's `seeds-R1R2.json` is its calibration-time seed file from published area and mass.

## Scoring (XM's)

- Grid: the truth's epochs in (cutoff, cutoff + 7 d] whose offset from the first of them is a whole multiple of 300 s. Lead day k is
  (cutoff + (k - 1) d, cutoff + k d], k = 1, 2, 3, 7. A bin enters when the truth holds at least 260 of its 288 grid epochs,
  decided by the truth alone.
- e: the 3D RMS position error of the bin (km) in the truth's RTN axes (analysis/gp-error-model pair_statistics, XM's scorer); the
  along-track RMS beside it. F states are GCRF as propagator/ffm returns them; P and X2 go TEME to GCRF by foundation/frames as in
  XM. Every arm is scored against the same GCRF truth at the same epochs.

## Decision rule (XM2's)

Pairs: per group, condition, contrast and lead, the windows whose bin entered and whose reference arm was attempted.
d = ln(e_arm / e_ref); arm failed: d = +Infinity; else reference failed: d = -Infinity.

**An F arm beats P in a group only if every lead cell (1, 2, 3, 7; condition O) meets all three:**
1. the 95 % cluster-bootstrap interval of the median d lies wholly below 0;
2. the upper bound of the 95 % interval of ln(p95 of e_arm / p95 of e_P) is below ln 1.10;
3. the arm fails on at most 1 % of the pairs.

Verdicts: F3 against P and F2 against P, per group (P primary, S1 secondary). The same form gives F3 against F2, F2 against X2 and
F3 against X2 (secondary), and X2 against P. Condition M and satellite x ISO week clusters are sensitivities, never the verdict.
No pooling across groups.

## Statistics (XM2's)

Cluster bootstrap: the unit is orbit group x ISO week of the cutoff; 10,000 draws of the cell's clusters with replacement; the
median d and ln(p95 ratio) of each draw's pooled pairs; percentile intervals (2.5 %, 97.5 %). xorshift128+ seeded by SHA-256 of
XM2's label `XM2|<group>|72|<condition>|<arm>/<ref>|<lead>|<clusters>`, unchanged: a cell whose pairs are unchanged gives XM2's
cell exactly, and every difference in an F cell comes from the F rows. A NaN statistic counts as +Infinity (against the arm).
Reported beside each cell: pairs, clusters, failures of each arm, the median e and along-track RMS of each arm, the median ratio
as a percentage, and the CONVERGED share of the F fits.

## Comparison with XM2 (reported; decides nothing)

- Beside every cell: XM2's primary (A1) cell, from its committed `table.json` read by `git show 2f75aba` and SHA-256 checked.
- Every X2-against-P cell equals XM2's exactly (the same rows and seeds): a check of the reproduction.
- The fits: XM2's termination against XM3's, per group and arm; the rounds, rejected trials and B of the fits XM2 lost.
- Invariance: the 1,623 XM2 fits that ended CONVERGED with zero rejected trials take the same trials under 0.7.0 (the module's
  statement); each such F arm (fit record, GCRF digest, days) is compared with XM2's, and the equal and differing ones are
  counted. Report-only.

## Reproduction

- All fitting and propagation are WASM module calls; JavaScript moves FlatBuffers and does the statistics.
- `build.json`: modules 9a05d899b. Every wasm read with `git show` at that commit and SHA-256 checked: propagator/ffm 2.0.4
  c36f1b14, analysis/estimation 0.7.0 7a555ca5 (0.6.0 was 0e7b4f6a), and XM's modules, byte-identical to XM2's build. The host
  files (FIT_PARAMETER_DOMAINS, Estimation.fbs) and the harness files at XM2's SHA-256.
- XM's code (experiments/xp-atmosphere-merit at 2c7b326) imported unchanged and checked by `git diff --quiet`; XM's and XM2's
  stored rows read only, their digests checked (XM 5ebcddc4f423; XM2 primary e3ff825c2888).
- Smoke (before the first scored window; no score): XM2's smoke window (Swarm A, cutoff 2025-12-31, outside the period), its 72 h
  arc fitted under condition M's rows and again with the `$DCL` XM cached for issue 2026-01-01T00:00Z, each forecast to a
  synthetic grid of the four lead bins, under 0.7.0: it checks the module in the experiments' host and measures its cost. No truth
  after its cutoff is read.
- E2E (`node experiments/ffm-atmosphere-xm3/run.mjs --check`): the pinned windows of config.json `check` re-run under O and every
  stored number compared exactly; the table rebuilt from the stored rows equal to the committed table.json. The windows are
  XM2's two and P|43476|2026-02-13 (GRACE-FO 1, whose F2 fit XM2 lost STALLED after 37 rounds), which replays 0.7.0's new branch.

## Expected cost (owner Mac Studio)

From XM2's measured cost at the same settings: a fit round is one propagator/ffm run of 72 h at RK78 (relative 1e-10, absolute
1e-7 m and m/s, steps up to 120 s) with the 8 x 8 STM, output at the 864 arc states (300 s), about 6.5 s; a converged fit took a
median 3 rounds (19.5 s, group P); a forecast of 10 days at the same settings, no STM, output at the 1,152 scored epochs (300 s),
took 17.4 s (P) and 12.0 s (S1). XM2's 156 failed group-P fits took 9.8 worker-hours with no forecast; under 0.7.0 the three
examples took 7 to 16 rounds. Expected: about 24 worker-hours, about 1.7 h on 16 workers.

## Amendment 1 (2026-10-31, during the run; ruled by the coordinator before any cell was computed)

- **Found during the run.** The equality check stopped the run at P|39452|2026-05-14 (01:35:30Z; 147 windows stored, no cell
  computed): the row's `filled` lists 2026-05-09 and XM2's lists none. Every other compared field is equal (the bins, P, the
  condition's rows, the held days, the `$DCL` digest, the arc and X2), and its F2 and F3 equal XM2's arms byte for byte (fit, GCRF
  digest and errors; both XM2 fits CONVERGED with no rejected trial).
- **Why.** The condition's rows begin at the cutoff - 72 h - 3 d. For the cutoff 2026-05-14 they begin on 2026-05-08, so the
  registered drivers rule (every day from the rows' first day through D0 + 8 that has no row takes the last row at or before it)
  fills 2026-05-09. propagator/ffm reads only from the day before the arc's first day (2026-05-10), so that row is inert. XM2 reran
  under A1 only the windows propagator/ffm refused; the windows of the cutoff 2026-05-14 were not refused, so XM2's rows predate A1
  and list no filled day. The registration's equality list named "the held and filled days", and `filled` describes the F arms'
  input preparation, which XM3 computes itself.
- **Scope.** Every cutoff was checked: exactly the 7 windows of the cutoff 2026-05-14 (group P: 39452, 39451, 39453, 43476, 43477;
  S1: 39634, 62261). The 21 windows XM2 reran under A1 agree.
- **The rule.** The equality check compares `filled` on the days propagator/ffm reads, the span XM2's A1 defined: from the day
  before the arc's first day (D0 - 4) through D0 + 8. Data preparation, every other compared field, the decision rule and the arms
  are unchanged.
- **The rerun.** The flagged row stays in the store as evidence; a flagged row is not a stored window for the runner, so that
  window is rerun under the amended check, and the table takes the rerun row for its key and lists the flagged rows.
  `DEFECT.json` is kept as `DEFECT.amendment-1.json`.
- **Ruling.** The coordinator approved this scoped version on 2026-10-31, before any cell was computed: it corrects a bookkeeping
  field the registration listed by mistake, it is outcome-blind (no cell computed; P, X2 and the F results equal XM2's byte for
  byte), and the guard stays armed for every other field.
