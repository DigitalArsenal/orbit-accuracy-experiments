# E13b — prospective Starlink fleet DCA

Frozen pre-registration, 2026-10-23. The commit containing this plan and
`config.json` must be pushed before the first prospective capture. This run
implements capture and validates mechanics only; it does not test hypotheses.
Any change to this registration is a dated amendment, disclosed in results.

## Window and split

Capture begins after registration; the confirmatory window is
2026-10-24T00:00:00Z through 2026-11-28T00:00:00Z, exclusive: **35 days minimum**.
The first seven days are warm-up; the next 28 days are held out in time.
Truth collection continues through 2026-12-01T00:00:00Z for the last 72-hour
predictions. Earliest position/drag scoring: 2026-12-01, only when coverage
requirements hold. Independent density scoring waits for Swarm/GRACE-FO
products; their arrival is not assumed to coincide with that date.

For each NORAD ID, the first eight hexadecimal digits of SHA256 of
`e13b-20261023:<norad>`, interpreted as an integer, modulo five select group:
zero is held out; the others calibrate. No held-out satellite enters s(t).
Shell assignment is fixed from the first capture: floor(altitude/50 km) and
floor(inclination/5 degrees), using the WASM-derived first mean elements and
geodetic altitude. Report migration and raising/deorbiting objects separately.
Primary shells require 30 calibration and six held-out objects and valid
coast arcs on at least 21 of the 28 held-out days. A daily node needs at least
six calibration satellites. An insufficient shell/test is UNAVAILABLE, never
a pass. Do not extend the window in response to outcomes; missing coverage
requires a new registration before additional scoring data are read.

## Measurements and estimator

Every eight hours, enumerate every Starlink MEME file from SpaceX's manifest.
Use HTTP byte ranges for its first eight hours only; raw responses live only
in memory. Physics runs in pinned WASM modules: foundation/frames transforms
EME2000 to GCRF; analysis/density-calibration computes the EGM2008 36x36 Jacobi
energy and NRLMSISE-00 drag work; foundation/orbits computes first-order J2
Brouwer mean elements. Preserve energy and mean-element series every ten
minutes, with source range hashes, module hashes, acquisition times and gaps.
Use all native samples in memory for drag-work integration, then discard them.
This is operator fresh-head evidence, not independent measured truth: planned
thrust and OD-model assumptions can remain in even the first hours.

Let L_j be negative change in WASM energy and W_j be positive loss predicted
by the WASM drag-work integral at B=1, on the same arc. On coast arcs fit
log(L_j/W_j) = log(B_i) + mean_j(s_shell(t)) + error. Daily nodes are linearly
interpolated. Use Huber loss (1.5 robust sigma), up to 100 alternating sweeps,
tolerance 1e-6; a per-satellite log-B prior is log(0.03 m²/kg) with sigma
log(2), and random-walk changes have sigma 0.005 per sqrt(day). The supported
s nodes have mean zero (density's absolute scale and B are not separately
identified); second-difference smoothing sigma is 0.05 as E13. These priors
are assumptions, not measured spacecraft properties. Planet validation uses
its precomputed B arcs and its E13 satellite selection, with no new physics.

Positive energy increments above max(5 J/kg, five times 1.4826 MAD of
successive energy increments in that head) identify thrust segments. Merge
adjacent positive increments; exclude these and one neighboring interval on
each side from the coast solve. Negative/zero work and gaps over 20 minutes
are excluded. For a thrust segment, normalized energy gain is modeled as
(kappa_i - 1) times B_i exp(s) W_j. Estimate nonnegative kappa_i by robust
ridge regression with prior kappa=1, sigma=1. Thus kappa is the thrust/drag
work ratio while thrust is active, not a constant free acceleration. The
positive steps and their integrated work are retained explicitly; impulsive
steps are not silently explained by density. With no supported coasts or
thrust segments report an unidentified, prior-only parameter. Density, B and
continuous thrust are otherwise degenerate; do not claim their separation.
Non-drag work (especially SRP) is a limitation of this energy diagnostic;
prediction scoring uses the full registered force model in WASM.

For every forecast, admit only arcs acquired by issue time and ending at
least six hours before it. Fit on at most 30 previous days. Relax the final
supported s node to zero with E13's **48-hour** time constant. D0, Starlink
DCA and Dove DCA use identical NRLMSISE-00 GFZ/NOAA drivers and full-force
settings; never fetch SET/CSSI indices. The Dove comparator uses E13's frozen
24-hour nodes, random walk 0.005 and smoothing 0.05, fitted to contemporaneous
Planet data with the same information cutoff and 48-hour decay. Historical
Dove corrections may validate mechanics but cannot substitute for missing
contemporaneous corrections. E13's JB2008 results are historical context,
not interchangeable with this prospective NRLMSISE-00 baseline.

## Endpoints, fixed before capture

Use E13's two-way satellite/day cluster bootstrap, 2,000 resamples, seed
20261023, 95% percentile intervals; no test-time scale fitting. The density
unit is a 12-hour UTC window with at least 80% valid samples. Center each
truth satellite on its warm-up mean. Match every comparison on identical
satellite/epoch pairs; report missingness and all failed endpoints.

* **H1:** Swarm A/B/C and GRACE-FO density spread reduction
  R1=1-sd(x-s)/sd(x), x=log(observed/model density), at least 0.25 with lower
  CI above zero. Report each satellite and supported shell separately;
  assign truth by nearest supported shell altitude, ties to lower altitude.
* **H3:** held-out Starlink coast-drag spread reduction
  R3=1-MAD(u-s)/MAD(u), at least 0.20 with lower CI above zero. Satellite
  baselines use warm-up/previous available arcs only, never the scored arc.
* **H4:** independent Swarm/GRACE-FO position-error ratio, corrected/D0,
  median at most 0.90 and upper CI below one at 24 and 72 hours. Issue at
  00:00 UTC every other held-out day; fit B on the preceding 24-hour orbit.
* **H5:** same ratio/rule for held-out Starlinks against later fresh-head
  states, at 24 and 72 hours, daily 00:00 UTC issues. Use the same B/kappa
  estimate and thrust schedule policy in D0 and corrected arms, so the DCA
  comparison does not also change the thrust model. No future burn schedule.
* **H6:** shift the correction seven days; R1 must be below 0.05. Compare
  only common eligible windows. Report the control even when H1 fails.
* **Dove head-to-head:** on shared truth windows, Starlink minus Dove R1
  must be at least 0.03 with lower CI above zero; on shared prediction pairs,
  Starlink/Dove median error must be at most 0.90 with upper CI below one at
  24 and 72 hours. Missing contemporaneous Dove inputs means UNAVAILABLE.

H1 is primary. Holm at alpha 0.05 covers H3, H4(24h), H5(24h), as E13;
72-hour results and the additional head-to-head family (Holm across its
three endpoints) are reported separately. Minimum scoring support: 100
density windows and three independent truth satellites for H1; 100 coast
arcs and six held-out objects for H3; 30 paired issues and three objects
per prediction endpoint. No positive finding on less support.

## Shared capture and verification

All derived rows stay under `/opt/data/sdn-archive/operator-capture/`.
V2 owns `experiments/operator-capture/SUBSETS.md`: read its fenced JSON union
of NORAD IDs and epochs and never write it. Capture normalized truth states
at those epochs (within its registered tolerance, no interpolation in JS).
When absent, preserve all satellites' first eight hours at ten-minute spacing.
Energy and mean elements remain fleet-wide after the registration arrives.
Raw ephemerides are never persisted, including temporary files and logs.
One serial worker, bounded CPU duty, eight-hour cycles, PID/stop file, logs
and measured request bytes/CPU/storage per cycle; free-disk floor 25 GiB.

The declared E2E is `node experiments/e13b-starlink-dca/run.mjs --check`:
real WASM derived products, a complete first capture cycle, and mechanical
estimator validation on E13 Planet development arcs and first-cycle coasts.
No hypothesis scoring until the window, support and availability gates pass.
Record exact code/artifact/input hashes and skipped checks. Docker is waived
by owner 2026-10-22; this experiment runs its recorded SDK WASM harness.

Starlink-only corrections are publishable without Planet's NonCommercial
tag under the owner's 2026-10-10 licence ruling. Planet-derived per-sample
rows stay local; only aggregate mechanics evidence is committed. Publication
of a DCL product requires the later scoring run and a separate modules task.
