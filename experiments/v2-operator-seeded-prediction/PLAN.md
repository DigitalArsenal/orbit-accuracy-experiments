# V2: operator-seeded prediction and force trimming

Registered 2026-10-23; frozen by the first commit of this plan and config,
before prospective truth is read. No headline accuracy scoring in this run.

## Population, epochs and minimum window

Exactly 500 Starlinks from the 11,142 objects shared by the public SpaceX
manifest and the 2026-10-22 local GP catalog. Stratify by published PERIAPSIS
in 50 km bins and INCLINATION groups <48, <60, <85, >=85 degrees. Allocate
500 seats across 26 nonempty strata by square-root population weight divided
by (seats+1), capped at population, lexical ties. Select within each stratum
by SHA-256(`v2-operator-seeded-20261023:<NORAD>`). Identities, quotas, source
hashes and epochs are fixed in config.json and ../operator-capture/SUBSETS.md.
No substitutions for missing, maneuvering or decayed objects. No GP records
or orbital metadata are committed. Pooled results describe this stratified
sample, not an unweighted estimate of the whole constellation; report shells.

Issue at 00/08/16 UTC, starting **2026-10-24 08:00Z**, ending exclusively
**2026-11-07 08:00Z**: 42 issues over at least 14 days. Horizons are 6, 24,
48, 72, 120 and 168 hours from issue (102 distinct target instants). Capture
continues through **2026-11-14 08:00Z**, at least 21 days. Scoring may start
then only if the actual eligible issue span reaches 14 days. Delayed startup
or inadequate coverage requires a dated amendment and a longer window;
never shorten the minimum or silently move the registered epochs. Every arm
and horizon reports attempted, fitted, predicted and truth-paired counts.

For each issue use only a file retrieved and created no later than issue,
selecting newest creation then start then lexical name. Fetch the subset's
files in memory. Fit [start,start+48 h), strictly excluding the join at 48 h,
on a 600 s grid; require the full pre-join span and record available span.
Fitting future states from the issued file is legitimate operator information,
not truth. Never use files retrieved after issue to backfill a prediction.
Before the prospective window, collector commissioning cycles are explicitly
mechanics-only and cannot enter the score.

Truth is the first 3 hours of a NEWER file, created after issue, captured by
E13b. Use its first state at/after each target, within 900 s. If several
qualify, earliest retrieval, then earliest creation, then name wins. Predictions
must be evaluated at that exact selected epoch; record predictions every 60 s
from target through target+900 s to permit the join without retaining raw arcs.
Missing truth is missing. Later portions of the fitted file never count as
truth. SpaceX's own forecast is compared against the same newer-file truth.

## Arms and causal inputs

1. Ballistic FFM-1, NRLMSISE-00, fitted initial state and Cd*A/m.
2. Arm 1 with Dove-calibrated open DCA.
3. Arm 1 with a fitted constant along-track acceleration.
4. FFM-1 plus DCA and kappa times drag, using the landed analysis/od
   operator-fit method from modules-od-ffm-operator-fit-20261023. Do not
   approximate its dynamics in JavaScript; until available, emit conditional
   unavailable status. B_eff and kappa are never called separately identified
   when the method reports a degeneracy.
5. Arm 4 with E13b's Starlink DCA, conditional on its delivery and causal
   publication metadata; never estimate the DCA from V2's scored truth.
6. SpaceX forecast within the published span only (no extrapolation).

Also report SGP4 from our OD-fitted OMM and the causal CelesTrak GP baseline;
missing products remain explicit, never substituted with Space-Track GP.
All arms fit the same input segment. Lock Cr*A/m to E13's stated class
assumption: 0.11 before NORAD 56000, 0.19 thereafter; no SRP solve on these
arcs. Initial Cd*A/m 0.03, nonnegative bound; 25 iterations, correction
tolerance 0.001, position sigma 1 m. Check fit identity, repropagate the exact
fit samples, and compare RMS to the fitter with documented component/3D
normalization. Equal arm outputs are investigated, not silently relabeled.

FFM-1 is the pinned module profile: EGM2008 70x70; Sun/Moon/Venus/Mars/Jupiter;
SRP, drag, IERS solid tides and relativity, FES2004 30x30 ocean tides, Knocke
15-degree Earth radiation. Use RK78 tolerance 1e-13 and max step 120 s for
the fitted execution path. Record the path separately from console Fast
coverage; do not imply equal speed. All dynamics, time/frame conversions,
covariance propagation and RTN/Mahalanobis calculations run in FFM/OD and
foundation/analysis WASM. JavaScript selects records and computes statistics.

DCA priority: host-02 live $DCL, available from about 2026-10-24 02:44Z,
through a local recorded export; otherwise E13's recorded Dove series with
creation/publication metadata. Index contract: dca/index.jsonl under the V2
store, one {source,publishedUtc,path,sha256} per immutable $DCL payload.
Select the latest solution published by issue, never later revisions. The
FFM module linearly interpolates its log-density nodes and holds the last node
outside the span. No added decay or future density/weather observation. Record
source and age per prediction; report sources separately if fallback occurs.
Missing DCA makes arm 2/4 unavailable, not equal to arm 1.

Weather is the data-source/space-weather module's GFZ CC BY 4.0 and NOAA SWPC
public-domain rows, available by issue. Local IERS finals/C04 only. Preserve
input hashes, availability cutoffs, module WASM SHA-256 and source revision.
No IERS fetch from this Mac; no CSSI/CelesTrak weather or SET JB2008 indices.

## Statistics and trimming decision

Per arm, shell and horizon: n, distinct objects, signed along-track median,
absolute along-track median/p95 and total-position-error median/p95, with
95% percentile intervals from 2,000 object-cluster bootstrap draws (seed
20261023). Resample whole objects, preserving repeated issues and paired
arms. Report paired differences on common eligible rows as well as marginal
coverage. Require >=30 objects and >=100 paired samples for an inferential
claim; otherwise descriptive/insufficient. No maneuver screening or tuning.

Select the best available FFM arm on the first seven issue days by pooled
72-hour median total error (ties: arm number). Assess trimming on the second
seven issue days only. Hold the fitted product fixed. For each horizon,
ablate gravity above degree/order 20, ocean tides, solid tides, relativity,
Earth radiation separately; then test the combined proposed removals.
Drop a term only when the maximum paired |reduced-full| is strictly less
than **0.1 x median(|full-truth|)** on identical rows. A combination must pass
the same rule itself. Zero denominator never passes. Recompute errors through
WASM and report the schedule for every horizon, with 72 h and longer primary.

Report mean d²/3 and 95% ellipsoid coverage using V1c2's unchanged rule:
mean in [0.8,1.25], coverage in [0.93,0.97], chi-square threshold
7.814727903251179. For “unchanged covariance realism,” require the paired
object-bootstrap interval for reduced/full mean d²/3 inside [0.95,1.05]
and the same realism classification. Missing covariance means that claim is
unavailable. No covariance rescaling or process-noise tuning to truth.

Measure full/reduced/full sequential one-thread WASM CPU per object-day,
excluding loading, parsing, fitting and scoring. Require one-minute load <21
throughout each timing block; retain rejected timings as rejected. Speed-up
uses paired total CPU/total object-days. A mechanics ablation before truth
arrives proves only execution and distinct force configurations, not accuracy.

## Storage, operation and completion for this run

Derived fits, predictions, aggregate diagnostics and provenance only under
/opt/data/sdn-archive/v2-operator-seeded/. Never raw operator files, raw GP
records, or transient fit observations. One worker, serial requests >=3.2 s
apart, 8-hour cadence, PID/log/status, stop file, load <21, free disk >=25 GiB
before compute. Stop a cycle after 7.5 h and report unfinished objects.
Per cycle record transferred bytes, CPU, wall time, disk bytes and counts.
Freeze/push first; implement and start collector; verify one complete cycle;
then leave scoring to the coordinator after the window fills.

One E2E: `node experiments/v2-operator-seeded-prediction/run.mjs --check`.
Re-derive committed mechanics aggregates from the recorded local run, verify
config/source/module hashes, the no-raw-store boundary and first-cycle counts.
After scoring, the same check re-derives every score table from recorded
module outputs. Missing evidence is not a pass. No unit suite, Docker,
production SSH or deployment. Docker parity waived by owner 2026-10-22;
experiment artifacts are not node-flow publications and require no AOT gate.

## Amendments

None at initial registration.

### A1 — 2026-10-23, before any completed commissioning fit or truth score

The first fetched file starts at 2026-10-23T04:14:42Z and its 60 s cadence
keeps a :42 second offset. Whole-minute predictions cannot join those states.
Predict at target+42 s, +102 s, ..., +882 s (15 candidates per horizon),
inside the unchanged 900 s allowance; require the fetched source grid to
match :42, otherwise refuse and report a new required amendment. Capture
target epochs, subset, horizons and eligibility rules do not change. The
initial commissioning attempt was stopped before producing a fit record.
