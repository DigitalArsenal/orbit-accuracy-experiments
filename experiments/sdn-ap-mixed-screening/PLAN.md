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
