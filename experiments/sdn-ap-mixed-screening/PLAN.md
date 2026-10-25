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

