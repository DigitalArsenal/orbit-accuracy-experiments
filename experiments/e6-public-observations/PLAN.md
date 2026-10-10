# E6 — Public observations: SatNOGS Doppler, laser ranging and amateur optical

Status: **frozen** by the commit that sets `"frozen": true` in
`config.json` (2026-10-09), after the inventory, the dev calibrations
(SatNOGS: `results/e6/dev/calibration.json`; laser: range σ 3.7 m,
`results/e6/dev/slr-calibration.json`) and the dev runs (laser: all 80 dev
cutoffs; SatNOGS: 23 of its 28 dev cutoffs at the freeze, the rest after),
and before any read of a test window. The code refuses a test-window pass,
normal point, truth epoch or cutoff until both files are committed
unchanged.

What dev showed before the freeze (`results/e6/dev/`): F2 was worse than B
at 0, 0.25 and 1 day (ratio of medians 4.9, 7.5 and 9.5) with a covariance
far too small (mean d²/3 ≈ 180–300); the element-set-history fit P was
worse than B (1.6–8×) but its covariance realistic (mean d²/3 0.6–1.2);
the laser fit S was at 8, 9, 13, 36 and 140 m (0–7 days) against B's 0.38–
0.71 km, with a covariance too small (mean d²/3 ≈ 10–13). Nothing in this
plan was changed after those results except the two choices stated in §4.3
and §4.5 (the laser history's position-only lanes; the range σ).

## 1. Question

For an object without an operator ephemeris or a precise orbit (the
non-cooperative population), the public catalog is an OMM and SGP4. Can
observations anyone may download make a catalog more accurate than OMM +
SGP4, with an uncertainty that can be trusted, and how many observations
does that take? Three kinds are tried:

- **SatNOGS Doppler**: the network's waterfalls, reduced to range rates;
- **amateur optical**: SeeSat-L positional observations (IOD);
- **ILRS laser ranging** (normal points), as the anchor: what the same
  fit does with precise public measurements of cooperative targets.

Each fit is an **anchored fit**: the object's element-set history in the
arc (each set's state at its epoch as a pseudo-observation) plus the
sparse measurements, fitted by HPOP with the full force model. Every fit
is also written out as a product (state and covariance at its cutoff) so
that the capstone experiment can score it beside the element-set-only fit
at the same cutoffs.

## 2. Hypotheses

| ID | Statement | Role |
| --- | --- | --- |
| H1 | SatNOGS: at cutoffs with ≥ 8 segments in the arc, the fit to the element-set history and SatNOGS range rates (F2) has a smaller median 3D position error than the latest element set propagated by SGP4 (B), at 0, 0.25, 1, 3 and 7 days. | Primary |
| H2 | SatNOGS: F2's propagated covariance is realistic (mean d²/3 within [0.8, 1.25], 95 % coverage within [0.90, 0.99]) at each horizon. | Key secondary |
| H3 | SatNOGS learning curve: F2's median 3D error against the number of segments used (0 = the element-set history alone, P; then 1, 4, 16 and all); where it crosses B. | Secondary |
| H4 | Amateur optical: at least 20 IOD lines of objects with public truth fall inside the truth spans, enough to fit and score. | Feasibility |
| H5 | Laser ranging: at cutoffs with ≥ 3 passes in the arc, the fit to the element-set history and ILRS normal points (S) beats B at every horizon. | Primary (anchor) |
| H6 | Laser ranging: S's propagated covariance is realistic, as in H2. | Secondary |
| H7 | Laser-ranging learning curve: S against the number of passes (0, 1, 2, 4, 8, all). | Secondary |

Decision rules. A horizon's ratio of medians (variant / B) has a 95 %
cluster-bootstrap interval (2000 resamples, seed 20261009; clusters are
object × fit day): **supported** if it lies below 1, **not supported
(worse)** if above 1, **undecided** otherwise. H2 and H6 per horizon as
stated, with the 3×3 position block. H3 and H7 are descriptive. H4 is a
count.

## 3. Data

Inventory: `steps/05-inventory.mjs` → `results/e6/inventory.json` (counts
only, read before this plan was written; no measurement was extracted from
a test window). Every capture is under `/opt/data/sdn-archive/hac/<source>/`
with `provenance.jsonl` (URL, time, SHA-256, bytes).

| Input | Source and terms | Role |
| --- | --- | --- |
| SatNOGS observations | network.satnogs.org API (metadata: station position, transmitter, the element set the station tuned with, waterfall URL); CC BY-SA 4.0 | SatNOGS arm |
| SatNOGS waterfalls | The observation's PNG (wasabisys S3); CC BY-SA 4.0 | SatNOGS arm (§4.1) |
| SatNOGS DB transmitters | db.satnogs.org; CC BY-SA 4.0 | Nominal frequencies |
| SeeSat-L | satobs.org/seesat archives Jun–Oct 2026 (IOD lines, stated station coordinates); public list, no license stated | Optical (H4) |
| ILRS normal points | EDC (DGFI-TUM) `npt_crd_v2`, monthly CRD v2 files, Jun–Aug 2026; ILRS data policy (free use with acknowledgement) | Laser arm |
| ILRS station coordinates | EDC weekly ILRS combined solutions `ilrsa.pos+eop.*.v90.snx` (positions and eccentricities); ILRS | Laser arm |
| ISS truth | NASA ISS OEM (EME2000, 4 min): four provider-node captures (2026-09-09..14) and the HAC archive capture (2026-10-09); US Government work. Only the flown part of each file counts: from its start to its capture time | SatNOGS arm truth |
| SLR truth | NSGF rapid orbits (EDC, converted by `analysis/reference-states`; stated σ ≈ 0.2 m) | Laser arm truth |
| OMM | Space-Track `gp_history` (local; only aggregates leave the machine) | History, baseline B |
| Earth orientation | IERS finals2000A (observed rows, then its predictions for the last days) | Modules |
| Space weather | GFZ Kp/ap/Ap/F10.7 (2026-10-09; days after the last reported one repeat it) | NRLMSISE-00 |
| Ephemerides | JPL DE440 (modules fixture `de440-2026.bsp`) | Sun, Moon |

What the inventory found:

- **ISS** is the one object with public truth that SatNOGS covers (334 of
  the first 782 captured observations show a signal). **CSS (Tianhe)**:
  197 observations 09-20..10-09, none with a signal. Planet, Starlink, GPS,
  the SLR targets, Sentinel-1 and Swarm have no amateur downlink.
- **CAMRAS Dwingeloo** IQ recordings (data.camras.nl/satnogs, CC BY 4.0):
  469 recordings to 2026-08-23 of cubesats without public truth; not used.
- **SeeSat-L**: 8,007 IOD lines on 1,065 objects (Jun–Oct 2026). Objects
  with public truth: CryoSat-2 (9 lines, 07-30..08-14), Jason-3 (3, 08-20),
  Swarm B (1), two Sentinels (2), ICESat-2 (1); Starlink (199 lines) only
  before the SpaceX ephemerides were captured (09-09). H4 is expected to
  fail on data.
- **ILRS**: CRD v2 monthly normal points for Starlette, Stella, LARETS,
  WESTPAC and LARES, Jun–Aug 2026 (≈ 100–960 passes per target-month).

### Windows

| Arm | Dev | Test |
| --- | --- | --- |
| SatNOGS (ISS) | [2026-09-04 12:00, 2026-09-09 12:00) | [2026-08-29, 2026-09-04 12:00) and [2026-09-09 12:00, 2026-10-10) |
| Laser | [2026-06-28, 2026-07-16) | [2026-07-16, 2026-08-30) |

A fit, its arc and its scoring epochs lie in one window. ISS truth exists
in five flown spans (09-07 12:00–09-09 12:21, 09-09 12:00–22:12, 09-11
12:00–14:56, 09-14 12:00–15:58, 10-07 12:00–10-09 17:55). Scoring epochs
are truth epochs every `scoring.everyHours`; a cutoff is T = E − τ for
τ = 0, 0.25, 1, 3 and 7 days.

## 4. Methods

Every orbit, frame, time and measurement computation runs in modules from
`space-data-network-modules` main `095c20a6` (HPOP binary `0d1f6264…`):
`propagator/sgp4`, `analysis/association`, `analysis/epoch-state`,
`analysis/estimation` (`fit_batch`), `propagator/hpop`,
`analysis/gp-error-model`, `foundation/frames`, `data-source/eop-parser`.
This repository moves records, fits the statistical nuisance terms of §4.3
and computes statistics.

### 4.1 SatNOGS waterfall → range rate

A SatNOGS station tunes in real time with the observation's element set:
f_t(t) = f0 (1 − rr_set(t)/c), f0 the transmitter frequency with its
drift, so the waterfall shows the signal's offset from that prediction.
Per observation (`waterfall.mjs`, `passes.mjs`):

1. **Image axes.** Frame, ticks and colorbar are found in the PNG. The
   frequency span comes from the tick ratio (±24.0, ±28.7 and ±33.2 kHz
   layouts, 10 kHz ticks; others refused). Images with a UTC axis
   (whole-minute ticks) give the recording's start; images with seconds
   only are taken to end on the scheduled end.
2. **Track (after STRF's rffind).** Per image row: the noise median and
   MAD of the central columns; the peak column within ±1.5 kHz of the
   track (z ≥ 5), refined by a parabola; 5-second bins (median of ≥ 5 rows,
   uncertainty = robust spread / √n, floor 5 Hz); bins off their running
   median by 4σ dropped; a step over 300 Hz starts a new segment. A track
   centred beyond ±3 kHz or within ±100 Hz (a DC line) is refused; a
   segment needs ≥ 10 bins.
3. **Measurement.** `propagator/sgp4` propagates the station's element set
   and `analysis/association` (that prediction, the station, EOP) gives
   rr_set(t) and the station's GCRF position (velocity from ±1 s). The
   range rate is rr = rr_set(t − lag) − Δf c / f0, written as `$RFO`
   (FREQUENCY, FREQUENCY_UNC, NOMINAL_FREQUENCY, station).

### 4.2 SatNOGS calibration (dev only)

Against the flown truth (association with the truth as the prediction),
each dev segment's residual is modelled as a bias (transmitter offset and
station oscillator), a drift, and a timing lag × ṙr_set (station tuning
and clock). Pinned in `config.satnogs.calibration` from
`results/e6/dev/calibration.json`: the common lag (0.82 s), the noise
scale with per-segment lags (1.99) and with the common lag only (4.25),
and the robust spreads of the segment drift (0.38 m/s²) and lag (1.07 s).

### 4.3 Anchored fits

At a cutoff T: the element sets with epoch in [T − 2 d, T] and creation at
or before T, each as a pseudo-observation of its epoch state
(`analysis/epoch-state`) with the GP error model's at-epoch covariance
(2026-08 scaled model, the object's regime, age 0–0.5 d, clipped, rotated
from RTN to GCRF by the frames module's RTN axes): the full state (6×6) for
the ISS; the position only (3×3) for the SLR targets, because on dev the
regime's velocity variances (13–70 mm/s) made the full-state history
inconsistent with HPOP (reduced χ² ≈ 590 for Starlette; 1.2 with
positions); the measurement segments of [T − 2 d, T]; first
guess: the set at or before T − 2 d. Estimator: `analysis/estimation`
`fit_batch`, batch least squares of the GCRF state and B = Cd·A/m (a priori
±30 %), answered by `propagator/hpop`. Measurement fits start from the
element-set-history fit (P). The covariance is the formal one times
max(1, reduced χ²), propagated by HPOP over state and B, without process
noise.

Segment nuisance terms that `fit_batch` cannot hold (§7) are estimated
between fits from the residuals (weighted least squares with Gaussian
priors), the measurements corrected, and the fit repeated (over-relaxed,
ω = 1.8 SatNOGS, 1.5 laser; the first SatNOGS round weights range rates
down ×3; a segment whose whitened RMS stays above 5 is edited). A
self-check on dev geometry with range rates generated from the truth
through association recovered the truth to 49 m after eight rounds.

HPOP force model (full force, both arms): EGM2008 70×70 in Earth-fixed
axes with IERS EOP; Sun and Moon from DE440; cannonball radiation pressure
with the conical shadow (AGOM fixed); NRLMSISE-00 drag on GFZ daily space
weather (SET's JB2008 drivers end 2026-08-25), B fitted; IERS 2010 solid
tides; IERS 2010 relativity; RK78, tolerance 1e-10, steps ≤ 120 s.
Per object: ISS AGOM 0.005 m²/kg, B a priori 0.0054 m²/kg; Starlette and
Stella B 0.0021, AGOM 0.00108; LARETS 0.0043, 0.0022; WESTPAC 0.0042,
0.0021 (E5's values); LARES 0.0006, 0.00032.

| Arm | ID | Method |
| --- | --- | --- |
| both | B | Baseline: the latest set at T propagated by SGP4 (`gp-error-model accumulate` against the truth, RTN). |
| both | P | The element-set history alone (0 segments): the OMM-only HPOP product. |
| SatNOGS | **F2** | Primary: history + every segment; per segment a free bias, a drift (prior 0.38 m/s²) and a lag (prior 1.07 s), noise scale 1.99. |
| SatNOGS | F1 | History + segments; bias and drift, the common lag only, noise scale 4.25 (every 3rd cutoff). |
| SatNOGS | O2 | Segments only, as F2, without the history (≥ 6 segments; every 2nd cutoff). |
| SatNOGS | L-n | F2 with the n = 1, 4, 16 most recent segments (every 3rd cutoff). |
| Laser | **S** | Primary: history + every pass; per pass a zenith delay × 1/sin(elevation) (prior 0 ± 5 m), range σ from dev. |
| Laser | R | Passes only (≥ 3 passes). |
| Laser | L-n | S with the n = 1, 2, 4, 8 most recent passes. |

### 4.4 Scoring

Errors in the truth state's RTN axes (frames module). Per arm, variant
and horizon: median, RMS and 90th-percentile 3D error, per-axis medians,
mean d²/3 and 95 % coverage. Intervals: cluster bootstrap by object and
fit day.

### 4.5 Laser ranging

Per CRD v2 pass (two-way ranges only): the station's ITRF position from
the weekly ILRS solution nearest the pass that holds it, plus its
published XYZ eccentricity; per normal point the range c·tof/2 at the
bounce instant (transmit + tof/2), modelled by the estimator as a one-way
LASER_RANGE without light time at that instant (the two-way geometry to
first order), the station's GCRF position and the target's elevation from
`analysis/association` (the latest set as the prediction; the elevation
only maps the troposphere). Target centre-of-mass offsets (≤ 13 cm) and
station range biases are not applied. Points below 10° elevation are
dropped; a pass needs ≥ 3 points. The range σ is set on dev so that the
dev fits' median reduced χ² is 1: 3.7 m (step 16; the unmodelled troposphere
and centre-of-mass offsets are inside it). The first laser round weights the
ranges down ×100 (a robust start from P).

### 4.6 Products

Every fitted variant at every cutoff is written to the step run's
`products.jsonl`: object, variant, cutoff, GCRF state and its
(6 + p)² covariance at the cutoff, B and AGOM, the force model, the number
of element sets and the segment keys. They derive from Space-Track sets
and stay local.

## 5. Threats to validity

- SatNOGS: one object (ISS: large, bright in radio, many stations,
  frequent reboost); 11 days of truth; NASA's flown trajectory as
  published is not a precise orbit (its error is not stated).
- Waterfall PNGs quantize frequency to ~77 Hz per pixel; per-station
  tuning lags, clock errors and oscillator drift were measured on dev only
  (24 segments, 10 stations).
- The nuisance terms' uncertainty does not enter the fit covariance (§7),
  which biases H2 and H6 toward failure.
- The SLR truth (NSGF) is computed from the same ILRS normal points: the
  laser arm is an anchor, not an independent test.
- Element sets are not independent observations (E2); the history's
  covariance is the GP error model's, not fitted here.
- Maneuvers (ISS reboosts, dockings) are not edited.

## 6. Order of work

1. Capture (steps 00, 01, 02) and inventory (05).
2. Dev: SatNOGS passes (10), calibration (15), fits (30); laser passes (12)
   and fits (40); pin the calibrations in `config.json`.
3. Freeze (`"frozen": true`, committed with this plan).
4. Test: steps 10, 30, 12, 40, then the report (90) and the data (95).

## 7. Module gaps found here

- `analysis/estimation` `fit_batch` has no measurement-bias, drift or
  time-bias states (per pass), and no consider parameters: per-pass
  frequency bias, oscillator drift, tuning lag and tropospheric zenith
  delay cannot be estimated jointly with the orbit or enter its covariance.
- `fit_batch` does not apply `error_models` (troposphere and ionosphere
  selection), which `run_estimation` does: laser ranges cannot be
  troposphere-corrected inside the batch fit.
- `fit_batch`'s RTN covariance axes require every observation to be
  POSITION_VELOCITY; a request mixing measurements and full-state
  pseudo-observations must state the latter in GCRF.
- `propagator/sgp4`'s SDK method answers in Earth-fixed axes only (no TEME
  or GCRF output on the SDK surface).
- `analysis/association`'s report gives the sensor's GCRF position but not
  its velocity (needed for range rate in the estimator).

## 8. Amendments

### A1 (2026-10-10, after the test runs, before the report): the laser arm as frozen

The laser arm ran as the frozen `config.json` states it, which §4.3 does not
match in three places. There is no per-pass zenith-delay term: it was taken
out before the freeze, when the unmodelled troposphere was folded into the
dev range σ of §4.5, so the §4.3 table row for S ("per pass a zenith
delay … prior 0 ± 5 m") and the "1.5 laser" relaxation are superseded. Each
laser fit is one round after a ×100 down-weighted start. And
`everyNth: 2` for L-n never skips a cutoff on the 24-hour grid (the thinning
keys on 3-hour steps), so L-n ran at every laser cutoff. The results follow
the config.

### A2 (2026-10-10): space weather after GFZ's last day

The GFZ file ends 2026-10-08. The code meant to repeat the last reported day
for later days but centred the 81-day F10.7 mean on the unreported day; for
2026-10-10 that left 39 days, below the 40 required, and all ten
first-wave SatNOGS test runs stopped at their first cutoff whose HPOP
inputs reached 2026-10-10. The harness now repeats the last day's row
entirely (`harness/hpop-execution.mjs`, commit 613cbeb), and the stopped
runs were resumed with it. Cutoffs computed before the fix used, for
2026-10-09, an 81-day mean over the 40 days centred on that day instead of
the 41 centred on 2026-10-08 (a change below 1 sfu).

### A3 (2026-10-10): SatNOGS test in waves, under a shard limit

A limit of eight concurrent shards for the lane (machine load) split the
SatNOGS test: the first wave ran P and F2; the second ran P, O2, F1 and
L-n (P again as their first guess). The report keeps one row per cutoff
(the first wave's P). The second wave's slowest shards gave the tail of
their remaining cutoffs to helper processes (`--cutoffs`); the four
original second-wave runs whose cutoffs were all written by then were
stopped, and their manifests carry no finish time. No cutoff is missing or
counted twice.
