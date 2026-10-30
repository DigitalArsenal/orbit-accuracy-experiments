# XM2: does FFM with our atmosphere, fitted to 72 h of precise truth, beat public SGP4 on drag-strong LEO?

Registered 2026-10-30, before any score, under task `experiments-ffm-atmosphere-vs-sgp4-20261030`. It follows XM-fast
(`experiments-xp-atmosphere-merit-20261030`, commit 2c7b326) and reuses its windows, cuts, clusters, leads, conditions, decision
rule, public-set extraction and scorer unchanged. `config.json` and `build.json` beside this file are part of the registration.
Nothing here changes after this commit; a change before the first score is a dated amendment at the end, and a change after it is
labeled exploratory.

## Question

The owner, 2026-10-30, verbatim: "I want our new atmospheric model to beat SGP4, which it should with truth / owner operator data."
"how can SGP4 be more accurate than our DCA?  That part still is bothering me."

XM-fast found that our AP XP with NRLMSISE-00 (X2), fitted to 72 h of precise truth, beats native XP at every lead but loses to the
public set under SGP4 (P) at days 1 to 3. XM2 asks the same question of our full-force propagator: does propagator/ffm, fitted by
analysis/estimation to the same 72 h arcs under NRLMSISE-00 on the same as-issued weather (F2), and times the open-DCA nowcast (F3),
beat P?

Primary: F3 against P, then F2 against P. Secondary: F3 against F2 (the open DCA's own effect), and F2 and F3 against X2 (the
full-force fit against XM's AP XP on the same rows).

## What a pass means

- The F arms fit truth-quality precise products over the 72 h before the cutoff. Those products are not real-time; P is the public
  set available at the cutoff.
- So a pass answers the owner's theory-and-atmosphere question ("with truth / owner operator data"). It does not answer the console
  supply question; operator files answer that.
- The F arms use final Earth orientation over the forecast horizon (Environment); its effect at 7 days is meters against errors of
  kilometers. P and X2 use none.

## Arms

| Arm | What | Inputs |
| --- | --- | --- |
| F2 | propagator/ffm fitted by analysis/estimation `fit_batch` version 3 to the 72 h arc, NRLMSISE-00 on the condition's rows (the candidate) | kernel, Earth orientation, `$SPW` rows |
| F3 | F2 with the density multiplied by exp(s(t)) of the open-DCA `$DCL`, in the fit and the forecast (the candidate) | as F2, and `$DCL` |
| X2 | XM's X2: SGP4XP with NRLMSISE-00 on the same rows, rerun with XM's code; must equal XM's stored row | `$SPW` rows |
| P | XM's P: the newest public Space-Track set at the cutoff under the console's SGP4, rerun with XM's code; must equal XM's stored row | the set |

X2 and P are rerun in every window with XM's own code (experiments/xp-atmosphere-merit at 2c7b326, imported unchanged) and
compared with XM's stored row: the bins, the arc, the conditions' rows, the `$DCL` digest, P and X2 (days, fit, TEME digest). Any
difference is a software defect: the run stops and the defect is reported. XM's E2E replayed its pinned windows exactly on
2026-10-30 at this modules commit.

## Fit (profile P0, C2's for these objects; fixed)

- analysis/estimation 0.6.0 `fit_batch` version 3, answered by propagator/ffm 2.0.4 `invoke`, driven by `harness/ffm-fit-v3.mjs`
  fitV3: one round at the stated sigma, each parameter's domain from propagator/ffm's FIT_PARAMETER_DOMAINS, ok only when the
  termination is CONVERGED.
- Estimated: the GCRF position and velocity at the arc's first state; B (DRAG_AREA_OVER_MASS, Cd A/m) and AGOM
  (SRP_AREA_OVER_MASS, Cr A/m), both in [0, inf). First values and a priori means: the object's bSeed and agomSeed in
  `results/ffm-covariance-calibration/seeds-R1R2.json` (published area and mass; B = A/m x 2.2, AGOM = A/m x 1.3). A priori
  diagonal: position 100 km, velocity 10 m/s, each parameter 30 % of its seed. This is C2's R1 and R2 profile (B2 A12's P0).
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
- A fit that does not end CONVERGED (MAXIMUM_ITERATIONS, STALLED, a fit-failed request), a refused forecast, or a non-finite state
  fails the arm in every bin of that window: a loss (rule 3), never dropped. The CONVERGED share is reported per group, condition
  and arm.
- No tuning on scored windows: nothing in the fit is chosen after this commit.

## Environment (fixed)

- Kernel: DE440s (`/opt/data/sdn-archive/hac/naif-kernels/spk/planets/de440s.bsp`, SHA-256 in config.json).
- Earth orientation (required by the 70 x 70 field and the solid tides): B1's `earth_orientation_finals` rows
  (`/opt/data/sdn-archive/sdn-ap-baselines/environment/environment.json`, IERS finals.all.iau2000.txt retrieved 2026-10-09, parsed
  by data-source/eop-parser), the rows B1's rule gives every arc before 2026-07-15 (its saved rows begin at MJD 61236), read through
  the environment C2's FFM fits read; each arc takes the rows with MJD in [MJD(arc start - 2 d) - 1, MJD(last scored epoch + 2 d)
  + 1]. **These are final values over the
  forecast horizon, not the predictions issued at the cutoff.** The effect at 7 days is meters against errors of kilometers.
- Space weather: XM's rows of the condition (`lib/weather.mjs` rowsO and rowsM), the rows X2 reads, as SDS SPW rows (DATE,
  F107_OBS, F107_OBS_CENTER81, AP_AVG) in one PRW SPACE_WEATHER table. propagator/ffm and propagator/sdn-ap read them alike: on UTC
  day d, the observed F10.7 of day d - 1, the 81-day mean and Ap of day d; Kp feeds only the winds, which are off.
- **Hold-last (data preparation only):** condition O's rows end on D0 + 2, the RSGA's last predicted day, and sdn-ap's HOLD_LAST
  holds that row for X2 beyond it. propagator/ffm reads only the rows it is given and needs every day of the arc and the day
  before (prw_dynamics.cpp:1188-1191), so the D0 + 2 row is repeated, every value, on each day D0 + 3 to D0 + 8: exactly the
  values HOLD_LAST holds for X2.
- `$DCL` (F3): XM's cached answers, the bytes XM's X3 read: the nowcast issued at the cutoff (O) and the hindcast issued at
  cutoff + 174 h (M). A refused `$DCL` fails F3 in that window (a loss), as it failed X3.

## Conditions

- O (primary, as issued): XM's rowsO, held as above; the `$DCL` nowcast issued at the cutoff. A cutoff with no RSGA in force
  (2026-01-01) is excluded from O and counted.
- M (sensitivity): XM's rowsM (observed F10.7 and definitive Ap through the horizon); the hindcast issued at cutoff + 174 h. M runs
  only after every O window is stored and only if time remains; its absence changes no verdict.

## Groups, clusters, windows

Cutoffs at 00:00 UTC of every day 2026-01-01 to 2026-05-31 (151). Group P is run before group S1.

| Group | Objects (orbit-group cluster) | Truth | Windows |
| --- | --- | --- | --- |
| P, primary | Swarm A and C (one cluster), Swarm B, GRACE-FO 1 and 2 (one cluster) | ESA SP3 COM 10 s; GFZ ISDC RSO 30 s | 755 (750 in O) |
| S1, secondary | Sentinel-1A and 1C (one cluster) | Copernicus POEORB 10 s | 302 (30 below the 72 h arc coverage) |

Not run: XM's GN control (it tested SGP4XP's atmosphere switch above the drag-free altitude), the 24 h arc (XM: it does not
determine the drag term), X0 and X3.

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

## Decision rule (XM's form)

Pairs: per group, condition, contrast and lead, the windows whose bin entered and whose reference arm was attempted.
d = ln(e_arm / e_ref); arm failed: d = +Infinity; else reference failed: d = -Infinity.

**An F arm beats P in a group only if every lead cell (1, 2, 3, 7; condition O) meets all three:**
1. the 95 % cluster-bootstrap interval of the median d lies wholly below 0;
2. the upper bound of the 95 % interval of ln(p95 of e_arm / p95 of e_P) is below ln 1.10;
3. the arm fails on at most 1 % of the pairs.

Verdicts: F3 against P and F2 against P, per group (P primary, S1 secondary). The same form gives F3 against F2, F2 against X2 and
F3 against X2 (secondary), and X2 against P (it reproduces XM's registered cell). Condition M and satellite x ISO week clusters
are sensitivities, never the verdict. No pooling across groups.

## Statistics (XM's)

Cluster bootstrap: the unit is orbit group x ISO week of the cutoff; 10,000 draws of the cell's clusters with replacement; the
median d and ln(p95 ratio) of each draw's pooled pairs; percentile intervals (2.5 %, 97.5 %). xorshift128+ seeded by SHA-256 of
`XM2|<group>|72|<condition>|<arm>/<ref>|<lead>|<clusters>`. A NaN statistic counts as +Infinity (against the arm). Reported beside
each cell: pairs, clusters, failures of each arm, the median e and along-track RMS of each arm, the median ratio as a percentage,
and the CONVERGED share of the F fits.

## Reproduction

- All fitting and propagation are WASM module calls; JavaScript moves FlatBuffers and does the statistics.
- The modules are those of `build.json`: every wasm read with `git show` at the registered modules commit and SHA-256 checked;
  the harness files and host files SHA-256 checked. Space-Track, Planet and truth states stay in the local store; results are
  aggregates.
- E2E (`node experiments/ffm-atmosphere-vs-sgp4/run.mjs --check`): the pinned windows of config.json `check` re-run under O and
  every stored number compared exactly; the table rebuilt from the stored rows equal to the committed table.json.

## Smoke test (before this commit; no score)

Swarm A, cutoff 2025-12-31 (outside the period): the 72 h arc read from its own four product files only, fitted under condition
M's rows (O has no RSGA in force that day) and again with the `$DCL` XM cached for issue 2026-01-01T00:00Z, each forecast to a
synthetic grid of the four lead bins. No truth after the cutoff was read and nothing was scored. It checked that propagator/ffm
2.0.4 (built on SDS 1.271.0) takes the PRW the experiments encode with SDS 1.243.0, and measured the cost on the owner Mac Studio,
one worker, two runs (the second gave the same fitted parameters to the last digit):

- the fit: CONVERGED in 3 iterations, 3 propagator/ffm runs of 72 h with the 8 x 8 STM at 864 epochs, 0 rejected trials: 18.4 s
  to 19.1 s per fit at RK78 1e-10 (absolute 1e-7) with steps up to 120 s;
- the forecast: 10 days (the 3-day arc and the 7-day horizon), no STM, output at the 1,152 epochs of the four bins on the 300 s
  grid: 16.7 s to 17.6 s at the same settings;
- so one window under one condition (F2 and F3) costs about 72 s, and condition O over groups P and S1 about 20 worker-hours
  (2.5 h on 8 workers).

The first forecast check compared each sample's label with its UTC request and failed: propagator/ffm labels samples in TDB
(prw_execution.cpp:87). The check now requires the TDB label one constant offset from its request.
