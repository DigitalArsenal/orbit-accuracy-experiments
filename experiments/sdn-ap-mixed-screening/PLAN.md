# B2: SDN-AP from operator ephemerides and from observations, in one scenario with SGP4 objects of calibrated uncertainty

Registered 2026-10-25 (task experiments-sdn-ap-mixed-scenario-screening-20261025); frozen by the
first commit of this plan and config.json. Parts 1 and 2 are registered here, before any of their
fits exist. Parts 3 and 4 need the calibrated GP covariance of V1c4
(console-covariance-calibration-v1c4-20261023); they are registered by amendment before any row of
V1c4 is read.

Owner, verbatim (2026-10-25): "The GP history experiment just shows that there's no beating SGP4
when that's the input, but we already knew that. We are trying to compete on accuracy with owner
operator ephemerides and observations, while having them in the same scenario with SGP4 and
assigning a realistic and appropriate uncertainty to SGP4 to allow for accurate screening".

## Questions

1. Fed an operator's ephemeris, how close is SDN-AP's prediction to the operator's newer estimate,
   beside SGP4-XP fitted to the same span and beside the operator's own forecast?
2. Fed observations (laser ranges), how close is SDN-AP to an independent precise orbit, beside
   SGP4-XP from the same observations, the full force model fitted to them, and the public element
   set?
3. (Amendment, with V1c4.) Is the calibrated SGP4 covariance realistic, by regime and lead time?
4. (Amendment, with V1c4.) For conjunctions between an SDN-AP object of parts 1 and 2 and an SGP4
   object with calibrated covariance, how accurate are the miss distance and Pc, and what are the
   false-alert and missed-alert rates against uncalibrated or no SGP4 covariance?

No threshold is tested; the tables are descriptive, with every row reported.

## Part 1: operator ephemerides

### 1a. Starlink (prospective)

Data: the operator-capture collector (config.part1.starlink.captureRoot), which every 8 h reads the
first 8 h of every Starlink's current SpaceX ephemeris (states every 10 min, GCRF, as it stores
them); and, for a sample, the whole current file fetched once at registration (below). SpaceX
issues a new file for each satellite about every 8 h, starting near its creation.

For each satellite, F is its file in the first capture cycle after registration
(config.part1.starlink.forecastCycle), and E is F's first epoch.

- Operator track (the fit span): the 24 h before E, every 10 min; the state at each epoch is the one
  of the newest captured file that starts at or before it and is older than F (each file's first 8
  h). A satellite is fitted when the track holds at least 90 % of its 145 epochs.
- Truth: epochs after E, every 10 min, from captured files that start after F's start, each epoch
  taken from the newest such file that starts at or before it (its first 8 h). F's own states are
  never truth.
- Horizons: hours after E in the bins (0, 24], (24, 48] and (48, 72]. A bin counts for a satellite
  when the truth holds at least 90 % of the epochs that files newer than F can cover in it (from
  the start of the first newer file).
- Arms: SDN-AP (propagator/sdn-ap `fit`, THEORY SDNAP, on the operator track as one block, the fit
  interval declared as its span, the space-weather table of config.environment); SGP4-XP (the same
  module, THEORY SGP4XP, the same block); and, for the sample, SpaceX's own forecast (F at the truth
  epochs).
- Sample for the forecast arm: config.part1.starlink.forecastSample satellites drawn in
  SHA-256(`B2|<NORAD>`) order from those in the last capture cycle before registration; each one's
  current file is fetched once, in memory, at least 3.2 s apart, and only its states at 10-min
  epochs up to 72 h after its start are kept, in the local store. A sample satellite whose fetched
  file is not F (its first epoch differs from the one the forecast cycle captures) has no forecast
  arm, and is counted.
- Maneuvers: the truth includes executed maneuvers and the forecast includes planned ones; neither
  fit can. Every row is reported over all satellites, and again over the satellites with no
  maneuver evident, which is: at every epoch where two captured files of the truth span overlap,
  their states differ by less than 1 km.

### 1b. ISS (retrospective)

Data: NASA's ISS trajectory archive (config.part1.iss.archive; one ISS.OEM_J2K_EPH.txt per date,
EME2000, 4-min states), and the planned burns their headers list (G1's iss-burns.json).

- Windows: every archive file k. The operator track is file k's first 24 h; E = its first epoch
  plus 24 h.
- Truth: for every later file j that starts in (E, E + 72 h], its first 24 h, each epoch from the
  newest such file that starts at or before it.
- Excluded: a window when a burn listed in any file's header (planned epoch) lies in [the start of
  file k, E + 72 h]. Every exclusion is counted.
- Horizons: days after E, (0, 24], (24, 48], (48, 72] h, over the truth epochs present in each
  (no coverage rule: the truth exists only where newer files start).
- Arms: SDN-AP and SGP4-XP as in 1a, SGP4 (analysis/gp-error-model `fit_elements`, six mean
  elements and B*, propagated by propagator/sdn-ap), and NASA's own forecast (file k at the truth
  epochs).

## Part 2: observations

Data: ILRS normal points (CRD v2, EDC, config.part2.normalPoints) of Starlette, Stella, LARETS,
WESTPAC and LARES, and their NSGF rapid orbits as truth (a different analysis center's orbit from
the same tracking, about 0.2 m), in E6's test window, 2026-07-16 to 2026-08-30.

- Observation fit: E6's laser variant R (experiments/e6-public-observations, PLAN.md section 4.5, run
  unchanged by its own steps 12 and 40): analysis/estimation `fit_batch` with propagator/ffm, the
  normal points of [T - 2 d, T] alone (no element-set history), ranges at the bounce instant with
  E6's calibrated 3.7 m sigma; cutoffs T every 24 h.
- SDN-AP from observations: the full force model carries R's state at T back over [T - 24 h, T]
  (60 s states, E6's force model and the target's E6 B and AGOM); propagator/sdn-ap `fit` (THEORY
  SDNAP) on those 24 h, as G1's 24 h fits. SGP4-XP: the same block, THEORY SGP4XP.
- Arms at T, scored on the days after T against the truth: SDN-AP from observations, SGP4-XP from
  observations, FFM from observations (R's state carried forward by FFM), the public element set
  (the newest Space-Track set before T, SGP4: E6's baseline B), and, as the precise-input bound,
  SDN-AP fitted to the truth's own 24 h before T.
- SDN-AP is not fitted to the ranges directly: propagator/sdn-ap `fit` takes an ephemeris, not
  measurements, so the observations enter through the force-model fit. This is stated with every
  table.

## Scoring and statistics

G1's scorer for every arm (experiments/sdn-gp-starlink-ffm-match lib/baselines.mjs): predicted
states paired with truth states in the truth's axes, the error vector in the truth's radial,
in-track and cross-track axes by gp-error-model `pair_statistics`, a bin's 3D RMS the root sum of
squares of the component RMS. Part 2 thins the truth to one state per 300 s, as G1.

Per row, arm and bin: windows attempted, fitted and scored; median over windows, 10th and 90th
percentiles; a 95 % percentile-bootstrap interval of the median over windows, and over objects
where a row has five or more (10,000 resamples, xorshift128+ seeded by SHA-256 of
`B2|<row>|<arm>|<bin>|<kind>`). Paired with SDN-AP on the windows both scored: the share of windows
where SDN-AP is closer, and the median of the per-window ratio (other / SDN-AP) with its bootstrap
interval over windows.

## Outputs

Committed: aggregates only, results/sdn-ap-mixed-screening/table.json (generated, read by the
SDN-AP paper's build) and README.md. SpaceX, NASA and ILRS states, Space-Track sets and the
per-window rows stay in the local store (config.store).

One E2E: `node experiments/sdn-ap-mixed-screening/run.mjs --check` rescores the first window of
every row of parts 1 and 2 from the local records, compares it with the stored row, and
regenerates the table to compare with the committed table.json.

## Boundaries

Physics runs in the modules at config.modules.commit (propagator/sdn-ap build
config.modules.sdnapWasmSha256, propagator/ffm, analysis/estimation, analysis/gp-error-model,
foundation/frames); JavaScript selects records, calls modules and computes statistics.

## Amendments

None at registration.

### A1 - 2026-10-25, before any score of part 1a or part 2 was computed (part 1b had run): E6's modules, and the forecast sample's second fetch

1. E6's steps run on its registered modules (space-data-network-modules 095c20a6): the current
   eop-parser refuses E6's input frames. At that commit propagator/ffm's built module is not in the
   repository (E6 ran a local build, `0d1f6264...`), so the run takes propagator/ffm from
   config.modules.commit and every other module from 095c20a6, through a directory of links
   (<store>/e6-modules). One R fit was tried this way before this amendment (Starlette, cutoff
   2026-07-18); it is part of the run.
2. The forecast sample was fetched at 18:11Z, 2 h 50 min before the forecast cycle; a satellite whose
   SpaceX file was reissued in between has a fetched file that is not F. Such satellites are fetched
   once more right after the forecast cycle ends, under the same rules; a satellite whose file is
   still not F after that has no forecast arm and is counted.

### A2 - 2026-10-25, before any covariance of parts 3 or 4 is computed: parts 3 and 4

V1c4 (console-covariance-calibration-v1c4-20261023) and V1c5 (its successor) have landed, both with
negative results (V1c4: 3 of 24 test cells realistic for its selected SGP4 model; V1c5: 0 of 24);
SDN-AP's own covariance is also too tight in V1c5's measurement. Parts 3 and 4 therefore report every
covariance below under its own label, and none of them is called calibrated unless it passes the rule
in this part.

**Covariances.** For the SGP4 objects (the newest public Space-Track set before the prediction start,
propagated by SGP4, on the objects of parts 1 and 2 that have truth: ISS, the five laser spheres and
the Starlinks of part 1a), each constructed and applied as its record says, through analysis/gp-error-model
(`object_covariance`, `calibrate_covariance`) and the causal event rule with analysis/maneuver-detection:
1. V1c4's selected SGP4 model (results/v1c4/MODEL.json: F-scalar-mle/UNFLAGGED), labeled "V1c4 best".
2. V1c5's frozen model (results/v1c5/MODEL.json: P-axes-mle/risk/UNFLAGGED), labeled "V1c5 frozen".
3. The uncalibrated population covariance N (`object_covariance` alone), labeled "uncalibrated".
4. None (screening by miss distance only), labeled "no covariance".
For the SDN-AP objects: the module's own propagated covariance (`fit`'s epoch COVARIANCE carried by
`sdnap_covariance_at`, build config.modules.sdnapWasmSha256), labeled "SDN-AP current covariance".

**Part 3: realism.** For each covariance and each group (ISS; laser spheres; Starlink) at the lead
times 1, 6, 12, 24, 48 and 72 h: d²/3 of the error vector in the covariance (mean with its 95 %
object-cluster bootstrap interval, median), and the 95 % coverage; a cell is realistic under V1c5's
rule (mean d²/3 in [0.8, 1.25], coverage in [0.93, 0.97], at least 30 samples from 3 objects), and
every cell is reported.

**Part 4: screening by error injection.** Encounters are synthetic and their errors are real. For
each SDN-AP window of parts 1 and 2 and each SGP4 window of the same lead time (both scored against
their own truth), a true encounter is built at the lead time: the relative velocity of a LEO crossing
(10 km/s at a crossing angle drawn uniformly in [10, 170] degrees), the true miss vector in the
encounter plane with a length drawn log-uniformly in [10 m, 10 km] and a direction drawn uniformly;
the predicted relative position is the true one plus the difference of the two objects' actual
prediction errors at that lead time, each taken in its own radial / in-track / cross-track axes and
placed in the encounter with the in-track axis along each object's velocity. Draws use xorshift128+
seeded by SHA-256 of `B2|part4|<pair>`; 20,000 encounters per covariance. Pc is the 2D probability
of analysis/conjunction-assessment with a 20 m combined hard-body radius and the sum of the two
covariances (SDN-AP current plus each SGP4 variant). Reported per SGP4 variant: the miss-distance
error (predicted minus true; median, 10th and 90th percentiles), the share of encounters with true
miss under 1 km among those with Pc at or above 1e-4 (precision), the share of encounters with true
miss under 200 m whose Pc is at or above 1e-4 (recall), the false-alert rate (Pc at or above 1e-4
with true miss above 5 km) and the missed-alert rate (Pc below 1e-7 with true miss under 200 m),
each with its bootstrap interval over encounters.

When V1c5's successor (a re-score with a screening-oriented criterion) or a calibrated SDN-AP
covariance (modules-sdn-ap-covariance-calibration-to-band-20261025) lands, it is added as a further
labeled covariance by amendment, beside these.

### A3 - 2026-10-25, committed at 20:32 UTC, before any score of part 1a exists (no truth epoch of part 1a has been read): an FFM arm for part 1a, and the truth gate

Part 1a gains a fourth arm, the full force model fitted to the same operator track, so that every
satellite's track is carried by SDN-AP, SGP4-XP and FFM and each is scored against the newer SpaceX
files (config.part1.starlink.ffm).
1. **Fit.** analysis/estimation `fit_batch` (batch weighted least squares), answered by propagator/ffm
   with its state transition matrix and parameter sensitivities, as E6's laser variant R fits
   (experiments/e6-public-observations fit.mjs `fitOrbit`, no element-set history): the GCRF state at
   the track's first epoch, the drag parameter B = Cd A/m and the radiation-pressure parameter
   AGOM = Cr A/m. The measurements are the operator track's positions (the same 24 h track and the
   same 145-epoch rule, at least 90 % of them) as POSITION_VECTOR observations, 10 m per axis in GCRF.
   First guess: the track's first state. Seeds: B 0.03 m2/kg; AGOM 0.11 m2/kg below NORAD 56000 and
   0.19 m2/kg from it (G1's FFM settings). A priori: 1e5 m in position, 10 m/s in velocity and 30 % of
   each seed (E6's bPriorFraction). Two rounds, the first with every sigma times 100; at most 10
   iterations, correction tolerance 0.01, edit threshold 5. Forces: E6's (gravity 70 x 70, Sun and
   Moon, radiation pressure, drag with NRLMSISE-00, solid tides, relativity), integrator tolerance
   1e-10 and steps of at most 120 s; Earth orientation and space weather from config.environment, the
   same tables as the SDN-AP arms.
2. **Prediction and score.** The fitted state and parameters carried forward by propagator/ffm with
   the same forces to the truth epochs, scored with the same scorer, bins and coverage rule as every
   arm. A satellite whose fit fails, or ends not converged, has no FFM score and is counted.
3. **Reporting.** Each arm is reported against the truth, the newer SpaceX files. Arm-to-arm figures
   (the paired comparison with SDN-AP of Scoring) are reported as registered there.
4. **Truth gate.** Part 1a reads the captured states through harness/truth-gate.mjs (task
   experiments-truth-ingest-gate-20261025): a state its ledger lists, or one failing its sanity rule,
   is used neither in a track nor as truth, and the count is reported. Its scan of the capture cycles
   to 2026-10-25 13:01Z flags none; before the score phase the scan's capture part is run again over
   the cycles the truth uses, and any state it flags joins the ledger first.

### A4 - 2026-10-25, committed at 20:49 UTC, before any truth epoch of part 1a is read and before any covariance of parts 3 to 5 is computed: the contrast for conjunction assessment, and real Starlink close approaches

*Committed 2026-10-25 20:49:16 UTC as 716496c0 on branch task/experiments-sdn-ap-mixed-scenario-screening-20261025, before any part 1a truth epoch was read and before any covariance of parts 3 to 5 existed; brought onto main unchanged with A5, which amends it.*

The owner's question: "The most important question here is do our changes make a difference for doing
accurate conjunction assessment". Part 4 as registered tests SDN-AP objects against SGP4 objects; it
never contrasts SDN-AP with SGP4-XP or FFM on the same encounters. A4 adds that contrast (config.a4).

1. **Arms and their covariances.** The primary of an encounter is predicted by each fitted arm in turn,
   each with its own covariance:
   - SDN-AP: its current covariance (A2);
   - SGP4-XP: the same module's fit covariance under THEORY SGP4XP (`fit`'s COVARIANCE of the set,
     carried by the module as for SDN-AP);
   - FFM: fit_batch's formal covariance of the state and parameters, scaled by max(1, reduced
     chi-square) and carried by propagator/ffm with the fitted state, as E6 carries its products
     (part 1a: A3's fit; part 2: E6's R product; part 1b: the FFM arm added below);
   - the operator forecast, with the operator's covariance where the stored file carries one. The
     stored SpaceX forecasts keep states only (as registered) and NASA's ISS files carry none, so the
     operator arm is reported on miss distance alone and has no probability or alert row.
   Part 1b gains A3's FFM arm on its own 24 h track (the same settings; seeds the module's a priori
   values B 0.01 and AGOM 0.02 m2/kg with a priori sigma equal to the seed), scored like its other
   arms. Part 3's realism cells are reported for the SGP4-XP and FFM covariances as well, descriptive.
2. **Encounters.** The synthetic encounters of part 4 (A2's geometry, hard-body radius, thresholds and
   draws), made per group (ISS; laser spheres; Starlink) and per secondary class: 20,000 per group and
   class, drawn with xorshift128+ seeded by SHA-256 of `B2|part4|<group>|<class>|<k>`. Each draws a
   lead time uniformly from 1, 6, 12, 24, 48 and 72 h, a primary window of the group that every one
   of SDN-AP, SGP4-XP and FFM scored at that lead time, the secondary below, and the geometry. The
   arms then differ only in the primary's prediction error and covariance at that lead time; the
   true geometry, the draws and the secondary are the same for every arm. A2's part 4 (the SGP4
   covariance variants of the secondary) is computed on the GP-class encounters, with SDN-AP as the
   primary's arm.
   - **GP secondary** (the common case, debris): a window of the same group at the same lead time,
     predicted by the newest public set and SGP4 with V1c5's frozen covariance (A2), the same for
     every arm of the encounter.
   - **Precise secondary** (the operator-operator case): a window of another object of the same group
     at the same lead time, predicted by the same arm as the primary with that arm's covariance. The
     ISS group has one object and has no precise class.
3. **Metrics, per group, class and arm.** The miss-distance error (predicted minus true: median,
   10th and 90th percentiles); the missed-alert rate (Pc below 1e-7 with true miss under 200 m), the
   false-alert rate (Pc at or above 1e-4 with true miss above 5 km), recall and precision as A2
   defines them, each with its 95 % interval; and the Pc calibration: per Pc bin (below 1e-7, then
   each decade from 1e-7 to 1), the encounters and the share of them with true miss under 200 m. The
   paired differences SDN-AP minus SGP4-XP and SDN-AP minus FFM of each rate, on the same encounters,
   with 95 % percentile-bootstrap intervals over encounters and over object clusters (encounters
   resampled by primary object), 10,000 resamples, xorshift128+ seeded by SHA-256 of
   `B2|A4|<group>|<class>|<metric>|<kind>`.
4. **Verdict rule, fixed here.** In a group and class, SDN-AP "makes a difference for CA" only if its
   missed-alert rate is no worse than SGP4-XP's (no part of either interval of the paired difference
   SDN-AP minus SGP4-XP lies above zero) and its false-alert rate is lower (both intervals of that
   paired difference lie wholly below zero). Otherwise the cell reads "no demonstrated CA difference".
   The same test against FFM is reported beside it. Groups and classes are never pooled.

**Part 5: real Starlink-Starlink close approaches in part 1a.** Both objects of a pair have SpaceX
truth (part 1a's truth files).
1. Population: the part 1a satellites that SDN-AP, SGP4-XP and FFM fitted. A pair's span is the
   common part of the two satellites' (E, E + 72 h], where both have truth.
2. Trajectories: each satellite's truth states (the 10-min epochs of part 1a), and each arm's
   prediction at the same epochs with its covariance, as ephemerides; times of closest approach and
   miss distances are found by analysis/conjunction-assessment's screening on those ephemerides,
   never in JavaScript.
3. Selection: a pair enters if its true miss is under 5 km in its span, or if any arm's predicted
   miss is under 5 km in it, so missed events and false alerts both enter. Pairs whose true closest
   approach falls where a truth has no state are counted and set aside.
4. Per pair and arm, at the arm's predicted time of closest approach: the predicted miss against the
   true miss (the truth's closest approach of that encounter), and Pc with both objects' covariances
   of that arm (20 m combined hard-body radius); and the metrics and paired differences of point 3,
   with the verdict rule of point 4.
5. Maneuvered pairs (either satellite with a maneuver evident by part 1a's flag) are reported apart
   from unmaneuvered pairs, and both are counted. Where a class has too few encounters for an
   interval, the table says so; classes are not pooled to reach a count.

### A5 - 2026-10-26, committed at 11:06 UTC, before any FFM fit of part 1b, any fit or score of part 1a, and any covariance or conjunction number of parts 3 to 5: FFM in part 1b, part 1a without SDN-AP and run late, and the conjunction contrast of FFM against SGP4-XP with Pc calls

Owner, verbatim (2026-10-26): "Do the FFM row for ISS and the full Starlink test"; asked whether to add the
conjunction-assessment test as FFM against SGP4-XP: "Yes with probability of collision calls as well".

The store when this is committed (config.store/rows): part 1b's rows (748 files) and part 2's (206 cutoffs)
only. No part 1a row of any phase exists: the lane that was to fit part 1a after the forecast cycle was
stopped on 2026-10-25 before it ran. No FFM fit of part 1b and no covariance of parts 3 to 5 exists. Part
1b's other arms (SDN-AP, SGP4-XP, SGP4, NASA's forecast) were scored and landed on 2026-10-25 (be50582) and
have been seen; none of them is re-run or changed (config.a5).

1. **Part 1b: the FFM arm**, as A4 registered it (commit 716496c0 on branch
   task/experiments-sdn-ap-mixed-scenario-screening-20261025, committed 2026-10-25 20:49:16 UTC, before
   any FFM fit of part 1b existed; brought onto main here). A3's fit and prediction (config.part1.starlink.ffm:
   the estimator, 10 m POSITION_VECTOR measurements, the state's a priori, two rounds with the first at 100
   times the sigmas, iterations, tolerance and edit threshold, the forces, the integrator and the
   environment) on file k's first 24 h, the same track as the window's other arms (NASA's 4-min states),
   with the seeds propagator/ffm's catalog defaults, B 0.01 and AGOM 0.02 m2/kg, each with an a priori
   sigma equal to the seed (A3's seeds are G1's Starlink values). The track's EME2000 states go to GCRF by
   foundation/frames for the fit (A3 measures in GCRF); the predictions come back to EME2000 by
   foundation/frames and are scored by the same scorer against the same truth, windows, exclusions and
   bins as the other arms. A window whose fit fails or ends not converged has no FFM score and is counted.
2. **Part 1a without SDN-AP.** The owner withdrew the SDN-AP theory on 2026-10-25, before any part 1a
   fit or score existed, and it is removed from the modules. Part 1a's arms are SGP4-XP (propagator/sdn-ap
   `fit`, THEORY SGP4XP, the registered build 62c783262da9 from G1's store snapshot, modules c860a072),
   FFM (A3) and, for the sample, SpaceX's forecast, as registered.
3. **Paired figures.** Scoring's paired form with FFM in SDN-AP's place: on the windows both arms scored
   in a bin, the share where FFM is closer and the median per-window ratio other / FFM with its 95 %
   bootstrap interval over windows (seeds SHA-256 of `B2|<row>|<other>/ffm|<bin>|windows`); against
   SGP4-XP and the operator forecast in parts 1a and 1b, and SGP4 in 1b. Part 1b's registered pairs with
   SDN-AP stay, FFM among them.
4. **Part 1a runs late; its inputs do not change.** The fits run from 2026-10-26, not right after the
   forecast cycle (2026-10-25 21:01Z). Every input was fixed before: F is the file in that cycle; the
   track comes only from captured files that start before F, stored by cycles before the forecast cycle;
   the SGP4-XP build by SHA-256 (62c783262da9), the other modules at c860a072; the environment by SHA-256
   (520b825d, made 2026-10-25 16:02 UTC: space weather observed to 2026-10-23 and forecast after, Earth
   orientation from the 2026-10-09 finals). To show it, each fit row records the SHA-256 of its track built
   from the cycles before the forecast cycle only and from every cycle present at the run; the fit uses
   the first, and the number of satellites whose two differ is reported.
5. **Part 1a's reader follows the registered rule.** Each SpaceX file's states lie on its own 10-min grid
   from its first epoch, and successive files' grids differ. The reader at 2c2c4d4 kept an older file's
   states that fall after a newer file's start when their epochs differ (a track built while timing a fit,
   on the registration cycle's window of one satellite, held 149 states for 145 epochs). The plan takes each
   epoch from the newest file that starts at or before it, so the reader keeps a file's state at t only
   when no newer file of the same set (older than F for the track, newer than F for the truth) starts in
   (its start, t]; every row reports how many states this drops. The score phase at 2c2c4d4 did not
   apply 1a's bin coverage rule; it now does, counting a bin's 10-min epochs from the later of its start
   and the first newer file's start to its end.
6. **Part 1a is scored bin by bin.** Every E lies between 2026-10-25 16:21Z and 19:58Z, so bin k's
   truth is complete once the capture cycle of 21:01Z k days after the forecast cycle has run (bin 1 on
   2026-10-26, bin 2 on 10-27, bin 3 on 10-28). A score pass scores the complete bins from the stored fits;
   a later pass must reproduce every bin an earlier one scored (any difference is reported); the table
   holds the last pass, and earlier reports are labeled interim.
7. **No second forecast fetch.** A1's second fetch was not made: the lane stopped before the forecast
   cycle ended. The sample keeps the first fetch (2026-10-25 18:11 to 18:23 UTC); a sample satellite whose
   fetched file is not F has no forecast arm and is counted, as A1 rules. A fetch now would return files
   issued after F, so none is made.
8. **The conjunction contrast: A4 with FFM against SGP4-XP, and Pc calls** (config.a5.ca). A4's design
   (716496c0) holds, with these changes:
   - Arms: SDN-AP is withdrawn. The primary is predicted by FFM, with fit_batch's formal covariance of
     the state and parameters times max(1, reduced chi-square), carried by propagator/ffm with the fitted
     state (no process noise), and by SGP4-XP, with the module's fit COVARIANCE of the SGP4XP set carried
     by the module (`sdnap_covariance_at`, build 62c783262da9). The operator forecast has miss distance
     only: the stored SpaceX forecasts hold epoch, position and velocity and no covariance, and NASA's
     files carry none. A2's part 4 (the SGP4 covariance variants with SDN-AP as the primary) is withdrawn
     with SDN-AP; A2's part 3 cells of its SGP4 covariances stay as registered.
   - Encounters: A4's, every SDN-AP condition removed: a primary window must hold FFM and SGP4-XP at the
     lead time. A lead time L's epoch is the truth epoch nearest E + L (part 2: T + L), within half the
     truth's spacing (1a 5 min, 1b 2 min, part 2 150 s); a window without one does not serve at L, and
     the count is reported. Errors (pair_statistics, the truth's RTN axes) and position covariances (the
     same call's) are placed in the encounter as A2 places them.
   - Contrast: the paired differences FFM - SGP4-XP of each rate on the same encounters, with 95 %
     intervals over encounters and over object clusters, A4's resamples and seeds.
   - Verdict, fixed here: in a group and class FFM "makes a CA difference" only if no part of either
     interval of the paired missed-alert difference (FFM - SGP4-XP) lies above zero and both intervals of
     the paired false-alert difference lie wholly below zero; otherwise the cell reads "no demonstrated CA
     difference". Groups and classes are never pooled.
   - Rates: over all encounters of a cell, the false-alert rate is the share with Pc at or above 1e-4 and
     true miss above 5 km, the missed-alert rate the share with Pc below 1e-7 and true miss under 200 m;
     recall and precision as A2 defines them.
   - Pc calls (the owner's addition): for every encounter and arm, the Pc (2D, analysis/conjunction-
     assessment, 20 m combined hard-body radius, the sum of the two objects' covariances as A4 pairs them)
     and its call: red at Pc >= 1e-4, yellow at 1e-7 <= Pc < 1e-4, green at Pc < 1e-7 (A2's thresholds).
     Per group, class and lead time: the confusion matrix of calls against the true miss (under 200 m;
     200 m to 5 km; above 5 km), the share of red calls whose true miss is above 5 km and the share of true
     misses under 200 m called green, each share with its 95 % bootstrap interval over encounters (seed
     SHA-256 of `B2|A5|<group>|<class>|<lead>|<arm>|<metric>`).
   - Part 5: A4's, with FFM and SGP4-XP: the population is the part 1a satellites both fitted; per pair
     and arm, at the arm's predicted time of closest approach, the Pc and call with both objects'
     covariances of that arm, against the truth's closest approach of the encounter; maneuvered and
     unmaneuvered pairs apart; a class too small for an interval is stated as small and never pooled. It
     runs once bin 3's truth is complete.
   - Covariance realism: part 3's cells (A2: d²/3 by pair_statistics, mean with its 95 % object-cluster
     interval, median, 95 % coverage, V1c5's rule) for the FFM and SGP4-XP covariances per group at 1, 6,
     12, 24, 48 and 72 h, reported beside the calls.
   - Order: part 1b's FFM row and part 1a's accuracy rows first; the contrast follows on the same fits.

### A6 - 2026-10-26, committed at 11:24 UTC, before any GP-secondary covariance, encounter, Pc or call exists: how the contrast's records are formed

The lead records of SGP4-XP and FFM of one ISS window (2021-02-25) were computed while testing the code; no
other covariance or conjunction number of parts 3 to 5 exists. These are the rules A5 point 8 left to the code.

1. **Lead records.** For a window, arm and lead time L: the arm's state and covariance at the lead epoch and
   pair_statistics' error and predicted position covariance in the truth's RTN axes, with d² against the
   predicted covariance (lib/leads.mjs). SGP4-XP in TEME (the module's covariance axes; the truth to TEME by
   foundation/frames), FFM in GCRF (the state block of the carried covariance), the operator forecast's
   error only. Part 2's SGP4-XP is fitted again to the same FFM-carried 24 h, as part 2 fits it; part 2's
   FFM covariance is E6's R product's at T (formal times max(1, reduced chi-square), propagated to T by
   E6), carried by propagator/ffm with E6's forces and the fixed AGOM.
2. **GP secondary and the SGP4 covariances of part 3 (A2)** run in V1c5's pinned runtime
   (/opt/data/sdn-archive/v1c5/runtime, modules f1c7b894; its PROVENANCE.json hashes are checked at start)
   with V1c5's rules at the issue time, which is the window's prediction start (E; T in part 2): the newest
   Space-Track set created and dated at or before it and its 31-day history (gp_history by-creation), the
   causal event rule over the 45 days before it (custody, and analysis/maneuver-detection on at least 8
   sets), SGP4 by V1c5's propagator/sgp4 (GCRF; the truth to GCRF by foundation/frames). Covariances:
   "V1c5 frozen" (base P at the actual age, the group from the event rule and the risk tier, V1c5's
   selected model from results/v1c5/selection.json, calibrate_covariance), "uncalibrated" (base N,
   object_covariance alone) and "V1c4 best" (base F, results/v1c4/sgp-F-scalar-mle_UNFLAGGED.erm, the class
   factors; V1c4's own runtime is not on this machine). The GP secondary uses "V1c5 frozen".
3. **Classes for V1c5's model.** E3's registry where it lists the object (LARETS "LEO 400-800 km";
   Starlette, Stella, WESTPAC and LARES "SLR LEO 800-1500 km"); the ISS and every Starlink "LEO 400-800 km",
   V1c5's only class below 800 km (Starlinks below 400 km lie outside its range: an extrapolation, stated
   with every GP row).
4. **Counted, not drawn.** The archive starts 2022-11-20, so a window whose prediction start is before
   2023-01-04 (45 days later, the event rule's lookback) has no GP record; nor has a window without an
   anchor, or a lead without a lead epoch. Each is counted.
5. **Encounter frame.** The radial axis is common (z); the primary's velocity is along (cos θ/2, -sin θ/2, 0),
   the secondary's along (cos θ/2, sin θ/2, 0), so the relative velocity lies along y and the encounter plane
   is x-z; each object's RTN axes are (z, its velocity, z x its velocity). The true miss is |m| (cos φ, 0,
   sin φ); the predicted relative position is m + e_s - e_p with each error rotated from its RTN axes; the
   predicted miss is its x-z part, the combined covariance the x-z block of C_p + C_s (each rotated the
   same way); Pc by compute_pc (FOSTER) in meters. Draws per encounter in this order: L, the primary window,
   the secondary window, θ, |m|, φ (the generator of table.mjs). The operator-forecast arm has miss
   distance only, on the encounters whose primary (and, in the precise class, secondary) has its record.
6. **Object clusters.** The ISS group has one object, so it has no object-cluster interval; the verdict needs
   both intervals and reads "no demonstrated CA difference" there, with the reason.

### A7 - 2026-10-26, committed at 11:50 UTC, before any rate, call, Pc calibration or verdict of part 4 is read: a Pc the module cannot evaluate

Testing part 4 on the ISS group (GP class; 10,036 of its 20,000 draws formed an encounter), compute_pc's
Foster quadrature did not converge for 3 arm-encounters (1 FFM, 2 SGP4-XP; predicted misses of 6 to 12 km
with sigmas of about 1 to 5 km by 200 m); only those failing inputs were printed. Rule: an encounter with
an arm whose Pc compute_pc cannot evaluate is counted, per arm and error, and left out of every rate,
call, Pc calibration and paired figure of its group and class for both arms, so that the arms stay paired
on the same encounters. Lead-time epochs of part 2 come from the NSGF truth itself; the 300 s thinning is
the accuracy scorer's (its grid can miss T + L by more than 150 s).

### A8 - 2026-10-26, committed at 12:30 UTC, before any part 5 number exists: how part 5 screens and assesses

Prototyped only on a capture cycle before the registration (2026-10-24 21:01Z, none of part 1a's truth):
analysis/conjunction-assessment screens sampled (OEM) sources only by its generic path, which refines every
pair (its KD search and refine_candidates take PPE sources only, and its perigee filter does not act on
sampled sources), so part 5 is cut into windows and units as below; assess_conjunction gives a pair's TCA,
miss and Pc from OEM sources with covariance lines.
1. **Windows.** Abutting 1 h windows from the earliest E to the latest E + 72 h. A satellite enters a
   window's screens only when its truth (part 1a's reader) covers the window and 10 min either side with no
   gap over 11 min; otherwise it is counted as uncovered there.
2. **Sets.** The truth, and FFM and SGP4-XP predicted at the same epochs (A4 part 5 point 2), as OEM explicit
   samples in GCRF, screened all-vs-all by screen_catalog: 5 km threshold, coarse step 60 s, combined radius
   20 m. The population is the part 1a satellites both SGP4-XP and FFM fitted.
3. **Units, losslessly.** A window's screen runs in units of satellites grouped by their distance from
   Earth's center over the window; units whose ranges of that distance stay more than 5 km apart are not
   screened against each other (two such satellites cannot come within 5 km).
4. **Encounters.** A pair's events of the three sets whose TCAs lie within 10 min of each other are one
   encounter, timed at the earliest; it enters when any set's miss is under 5 km.
5. **Assessment.** For every entering encounter, assess_conjunction within 10 min either side of its time:
   on the two truth ephemerides for the true closest approach (a truth gap there sets the encounter aside,
   counted), and on each arm's ephemerides at 60 s steps with its covariance at each epoch (FFM: fit_batch's
   formal covariance times max(1, reduced chi-square) carried by propagator/ffm; SGP4-XP: the module's,
   sdnap_covariance_at, in TEME), Foster, 10 m per object (20 m combined), for the arm's TCA, predicted miss,
   Pc and call.
6. **Classes.** Unmaneuvered pairs (neither satellite maneuver-evident in part 1a's final score pass) and
   maneuvered pairs, apart; A4's metrics and verdict and A5's calls and confusion matrix per class; a class
   too small for an interval is stated as small, never pooled.
7. **Order.** Part 5 runs after part 1a's final score pass, once bin 3 is complete.

### A9 - 2026-10-26, committed at 12:56 UTC, before any part 5 number exists: part 5's assessment by the module's screen of each pair

Testing A8 on the pre-registration window, assess_conjunction's TCA search returned the window's first coarse
step on these sampled sources (its fast solver assumed one minimum), while screen_catalog of the same two
sources over the same window reproduced the screens' event exactly and gave Foster's Pc from the sources'
covariance lines (a synthetic crossing, 50 m at 1 km/s with 100 m sigmas: 0.00935 against 0.0094 by hand).
1. Each assessment of A8 point 5 is screen_catalog of the two objects (the generic path, threshold 1,000 km),
   the encounter's value being the least-miss event: the truth over 30 min either side of the encounter (its
   states there); each arm over its 21 epochs, 60 s apart, from 10 min before to 10 min after.
2. An encounter is a pair's events within 10 min of its earliest event.
3. A truth with no minimum in its 60 min sets the encounter aside, counted. An arm with no minimum in its 20
   min predicts no close approach there: its call is green (Pc 0) and it has no predicted miss; counted.

### A10 - 2026-10-26, committed at 13:39 UTC, before any number of the forecast arm exists: A1's second fetch, made late by name; part 1a's reporting

1. **The second fetch.** None of the 200 sample files fetched at 18:11-18:23 UTC is F: SpaceX reissued every one
   before the forecast cycle (the fetched files start 09:00-11:20 UTC on 2026-10-25, the F files 16:21-19:58
   UTC), and A1's second fetch was not made when registered (the lane stopped). SpaceX keeps superseded
   versions downloadable by name, and the capture records each F's name, its ETag and the SHA-256 of its first
   262,144 bytes. The second fetch is made now by F's name under A1's rules otherwise (in memory, requests at
   least 3.2 s apart, the states at 10-min epochs up to 72 h after its start kept in the local store, the
   first fetch kept as <NORAD>.first.json). A fetched file is F only when its ETag equals the capture's and the
   SHA-256 of its first 262,144 bytes equals the capture's; any other is counted and has no forecast arm.
   The same bytes fetched late are the same input (A5 point 4).
2. **Reporting, no rule changed.** Part 1a's primary FFM-against-SGP4-XP figures are on the satellites both
   arms fitted (Scoring's pairs). SGP4-XP is also reported, as descriptive, on the satellites FFM fitted and on
   those it refused. FFM's refusal rate is a headline result. Exploratory and labeled so: the refusals by the
   track's mean distance from Earth's center (shells of 10 km), by the maneuver flag and by SGP4-XP's fit RMS
   on the same track; and how much of FFM's reduced chi-square tail the maneuver flag accounts for.
3. **Defects, filed and not fixed here.** modules-ffm-fit-batch-round1-out-of-range-20261026 (A3's round-1
   refusals by propagator/ffm); modules-ca-assess-conjunction-tca-window-edge-20261026 (the reason for A9).

### A11 - 2026-10-26, committed at 14:04 UTC, before any score of part 1a: A10's second fetch could not depend on truth

The second fetch of A10 could not depend on truth: F is fixed by identity (its name, its ETag and the SHA-256
of its first 262,144 bytes, as the capture recorded them at the forecast cycle), so the fetch can return F or
nothing, and SpaceX's file F is an immutable record issued before E. No truth epoch was read in deciding to
fetch or in selecting the files: the decision used only the first fetch's first epochs against F's (both
forecast files, not truth), and the files are the registered sample. Disclosed for completeness: before A5,
while studying the capture's layout, the start times and state counts of one satellite's newer files (NORAD
44714) were printed; no truth state was read. Satellite 44968's F is a 48 h file, so its forecast arm covers
bins 1 and 2 only, counted as such.

### A12 - 2026-10-28, part 1 (the rule), committed before any selection fit, any part 1a fit of the new arms and any score of any part 1a arm: an FFM arm on fit_batch version 3, the fairness arm XP-LN, and the rule that selects the new arm's profile

No part 1a score exists: the store's rows directory holds, by file name, starlink-fit.s0-s1 (SGP4-XP fits) and starlink-ffm.s0-s11 (A3's
fits), and no starlink-score, starlink-leads or starlink-gp file. This part fixes the arms, the selection rule, its data, the gate, the
contingency and the reporting before the selection runs; part 2 commits the selection receipt and the chosen profile before any fit of
the new arms on the part 1a tracks and before any score (config.a12).

1. **Why.** A3's fit (E6's fitOrbit on analysis/estimation 0.5.0, fit_batch version 1: full Gauss-Newton steps, no bounds) stepped B
   (round 1) or AGOM (round 2) below zero on 6,033 of 11,163 tracks (54.0 %); propagator/ffm refused the negative coefficient and the
   harness had no refused answer. 2,985 satellites were dropped in round 1; 3,048 kept the round-1 product weighted at 100 times the
   sigmas (stoppedBy set, reported ok by lib/ffm-fit.mjs); 5 ended not converged; 5,125 are full-weight fits. NORAD 65202 is a
   full-weight fit with B = -1.86e-6 m^2/kg, which FFM refuses at prediction.
2. **A3 stays registered**, its rows and code path unchanged (E6 fit.mjs, lib/ffm-fit.mjs, modules c860a072: estimation d3aa2c8a,
   FFM d0b04935), and is scored and reported as registered beside the new arm. Its 3,048 round-2-refused rows count as FAILED; the
   headline is 6,033/11,163 = 54.0 % refused in any round, shown beside 26.7 % (2,985) for round 1; those rows' round-1 products appear
   only as a labeled descriptive row, never pooled with full fits; NORAD 65202 is noted.
3. **The new FFM arm (ffm3)**: analysis/estimation 0.6.0 (fit_batch version 3) at modules f54b5107e (module.wasm SHA-256 0e7b4f6a...),
   answered by propagator/ffm 2.0.0 of B2's c860a072 build (module.wasm d0b04935...) through a directory of links (<store>/a12-modules:
   every module from c860a072, analysis/estimation from f54b5107e), as A1 did, so that the estimator and the fit configuration are the
   only differences from A3. Driver harness/ffm-fit-v3.mjs: one round at 10 m per axis in GCRF (POSITION_VECTOR), no prior
   re-centering, each parameter's domain from propagator/ffm's FIT_PARAMETER_DOMAINS (catalog-configuration.mjs at f54b5107e: B and
   AGOM in [0, inf), the in-track acceleration T signed), every FFM error answered as a refused answer, correction tolerance 0.01, edit
   threshold 5, the evaluation cap of the selected profile; ok only when termination is CONVERGED. NOT_CONVERGED (MAXIMUM_ITERATIONS,
   STALLED) and fit-failed are failures, never replaced by another result. harness/ffm-execution.mjs sets HAS_IN_TRACK_ACCELERATION_M_S2
   and its value whenever T is fitted or fixed. Forces, integrator (RK78, relative tolerance 1e-10, steps of at most 120 s), Earth
   orientation and space weather are A3's. Prediction: the fitted state and parameters (T included when estimated) carried by the same
   propagator/ffm with the same forces; the same scorer, bins and coverage rule as every arm; A5's covariance for the contrast (formal
   times max(1, reduced chi-square)). Every row records the modules commits, the estimation and FFM wasm SHA-256 and the experiments SHA.
4. **The fairness arm XP-LN**: SGP4-XP fitted by propagator/sdn-ap `fit` (THEORY SGP4XP) on the identical operator track and fit
   interval as the registered SGP4-XP arm, with FIT.DRAG_PRIOR_FORM LOG_NORMAL, median 0.01 m^2/kg and sigma of the log ln 10 (2.302585),
   the radiation-pressure prior at its default; build 49fa4b0f... (modules f54b5107e, $PCF encoded with SDS 1.272.0, the build's own
   release), the same build propagating its sets for scoring. With the default prior and no FORCES this build returns the registered
   arm's sets byte for byte (checked on 2 pre-F tracks, NORAD 44714 and 44927), so the prior is the only difference; the build takes no
   space-weather frame on this path. The registered SGP4-XP arm stays as registered.
5. **The fit-only reader** (lib/prefit.mjs) for the ffm3 and XP-LN fit phases and for the selection: never calls windowOf; reads only
   capture cycles strictly before 2026-10-25T21-01-35-269Z; aborts on any file starting at or after F (F and E from A3's stored row, so
   the forecast cycle is not opened); every state through harness/truth-gate.mjs; each rebuilt track's SHA-256 must equal A3's stored
   track.sha, else the run aborts; every opened path is logged in the phase's receipt. Rows: rows/starlink-ffm3.s<k>.jsonl and
   rows/starlink-xpln.s<k>.jsonl. Only the score phase opens truth, for all arms in one pass.
6. **Candidates** (seeds and a priori of A3: B 0.03 m^2/kg; AGOM 0.11 below NORAD 56000 and 0.19 from it; 1e5 m, 10 m/s, 30 % of each
   seed; one round at 10 m; at most 40 evaluations):
   - P0: state, B and AGOM, B and AGOM bounded to [0, inf).
   - P1: P0 with AGOM held at G1's 0.11/0.19 (state and B estimated).
   - P2(c), c = 0.1, 0.3 and 1.0 m^2/kg, three candidates: P0, and where P0's fit on the same window ends with B > c, the fit with P0's
     parameters plus a signed T instead (T seed 0, a priori sigma 1e-5 m/s^2), which is P3's fit on that window.
   - P3: P0 plus a signed T always (T seed 0, a priori sigma 1e-5 m/s^2), a control.
   Free parameters: P1 7, P0 8, P2 9 (it may estimate T), P3 9.
7. **Selection data, pre-F only, V2 excluded.** A fixed sample of 2,000 satellites: those with the lowest SHA-256 of
   `B2|A12|select|<norad>` among part 1a's 11,163 fit tracks, the 500 satellites of V2 (experiments/operator-capture/SUBSETS.md)
   excluded. Three datasets per satellite:
   - split 12/12: the A3 operator track's first 12 h fitted, the rest held out (the 90 % rule on the 24 h track, as registered);
   - split 18/6: the first 18 h fitted, the rest held out (the same rule);
   - E' = E - 24 h: the fit track over [E - 48 h, E - 24 h] by the registered track rule from captured files that start before E',
     stored by the cycles before the forecast cycle; it needs at least 60 % of its 145 epochs, no gap longer than 8 h, and states in both
     its first and its last 2 h. The truth over (E', E] uses only files that start after E' and before F, from cycles 2026-10-24T21:01Z,
     2026-10-25T05:01Z and 2026-10-25T13:01Z, only their first 8 h, each epoch from the newest such file that starts at or before it,
     through the truth gate; every truth epoch present is scored.
   Disclosed: the 90 % rule is relaxed for E' only, because the capture holds a gap of about 7 h in [E - 48 h, E - 24 h] for every
   satellite sampled (cycles 2026-10-23T21:01Z and 2026-10-24T05:01Z read files about 8 h apart, each kept for its first 8 h; NORAD
   44725: the file of cycle 10-23T21 covers 2026-10-23 12:09-20:09Z and the next captured file starts 2026-10-24 03:00Z), so the E' fit
   tracks hold 97-101 of 145 epochs and none of 60 sampled passed 90 %. The within-track splits keep the 90 % rule.
8. **Metric.** Per window and candidate, the 3D RMS position error over the held-out span (the fitted product carried by propagator/ffm
   to the held-out epochs, GCRF, against the held-out states). The longest lead is E' (24 h).
9. **Rule.** Eligible candidates: zero refusals (no refused trial), zero fit-failed and at least 99.9 % CONVERGED, pooled over all of a
   candidate's selection fits on the three datasets, and every parameter in its domain. Among them, the lowest median of the E' metric
   over the common converged satellites (those on which every eligible candidate converged in E', V2 excluded). A tie: a candidate whose
   paired median ratio to the lowest (candidate / lowest, per satellite, on the common set) has a 95 % bootstrap interval containing 1
   (10,000 resamples over satellites, xorshift128+ seeded by SHA-256 of `B2|A12|tie|<candidate>/<lowest>|eprime`). On a tie the
   candidate with fewer free parameters wins, then P0 < P1 < P2(lower ceiling) < P3.
10. **No-degradation gate.** On the sample's satellites among A3's 5,125 full-weight tracks: A3's registered configuration (E6's
    fitOrbit, two rounds, estimation 0.5.0 and FFM 2.0.0 at c860a072, lib/ffm-fit.mjs, ok as it reports) refitted on the same selection
    windows; per satellite the ratio candidate / A3 of the metric, on the satellites both fitted; the gate passes when the paired median
    ratio is at most 1.00, its 95 % bootstrap upper bound at most 1.03 (10,000 resamples over satellites, seed SHA-256 of
    `B2|A12|gate|<candidate>|<dataset>`) and the 90th percentile of the ratio at most 1.05, on each of the three datasets. If the rule's
    choice fails the gate, the next eligible candidate in rank order (by the E' median) that passes is taken. If none passes, the
    primary is P0 (the smallest change from A3), labeled "gate failed", with the gate numbers in the headline. Every candidate's
    selection numbers are reported either way.
11. **Fit-only gate and contingency.** After the ffm3 fit phase over all 11,163 tracks, its gate (at least 99.9 % CONVERGED, 0
    refusals, every parameter in its domain) is committed before any score. If it fails, the fit phase runs once more at 60 evaluations,
    then the result is reported as is. No re-tuning after any score; any later variant is a separate arm, labeled post-score and
    exploratory.
12. **Reporting.** The FFM arm of record for A5's conjunction contrast and part 5 is ffm3; A3 is reported as registered beside it. ffm3
    is paired with SGP4-XP on the satellites both fitted (A10's primary form), with A3 on A3's 5,125 full-weight satellites, and its own
    failure rate is a headline beside A3's. XP-LN is paired with SGP4-XP and with ffm3. A10's exploratory breakdowns apply to the new
    arms in the score phase only. One score pass, after the 2026-10-28T21:01Z capture cycle has completed (bin 3), scores A3, ffm3,
    SGP4-XP, XP-LN and the forecast together per A5 point 6; then the registered leads, gp, part 4 and part 5 phases. The E2E (run.mjs
    --check) replays one window of each new arm.
13. **Disclosures.** The design used only: the fit fields of A3's fit rows (ok, rounds, stoppedBy, error, parameters, seconds) and of the
    SGP4-XP fit rows (fit RMS, decoded BTERM); fit tracks rebuilt from capture cycles strictly before 2026-10-25T21-01-35-269Z and from
    files starting before F, each ending at E, hashed equal to the stored track.sha (11,163/11,163 in the evidence probe, 27/27 in Design
    2's mirror); module and harness source; the propagator-catalog-census bounded arm's fit-level fields; and offline probes under the
    coordinator's scratchpad (ffmfit/: all-tracks.jsonl, probe-tracks*.jsonl, repro-*.jsonl, solver/proto/tracks27.jsonl and runs,
    judge3/j3.mjs and runs/summary.txt, staging-angle/out). Probe tracks: Design 2's 27 (NORAD 47356, 48444, 49767, 52275, 52608, 55274,
    57249, 58168, 58881, 59264, 59406, 61219, 61886, 62531, 63561, 64244, 64802, 64815, 64917, 65399, 65541, 65660, 66030, 66090, 67201,
    67827, 100407); the evidence reproductions' 7 (49767, 55274, 58881, 59406, 64244, 65660, 66090); Design 3's 11 (44714, 45064, 45535,
    45696, 49767, 55274, 58881, 59406, 64244, 65660, 66090); this lane's smoke tests (version 3 fits on 44714, 44927, 45064 and 45187; XP-LN
    and its control on 44714 and 44927; E' state counts on the first 60 satellites of shard 3 and file spans of 44725, 44949 and 45074). The
    judges' notes on these inputs are in the coordinator's plan (PLAN-all-judges.json, b2_integrity_notes). Census overlap: the census
    scores Starlink on SpaceX files created after its own E, which are B2's part 1a truth; its Starlink accuracy (the days fields, the
    README accuracy tables, summary.json leads) is derived from part 1a truth, and nobody in this amendment's chain read it. V2 overlap:
    probes scored 6 h holdouts of V2 satellites 65660 and 67201 at V2 targets 2026-10-25T14:00Z and 16:00Z. A3's registered ffm phase
    called windowOf (part1-starlink.mjs), which loads the newer files into memory, though it wrote only fit identity and fit fields. No
    part 1a truth epoch, score row, truth-derived maneuver flag (worstOverlapKm) or census Starlink accuracy aggregate was read.
