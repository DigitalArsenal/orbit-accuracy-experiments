# E4 — Operator ephemerides against products built from public data

Status: **frozen at the commit that sets `config.json` `"frozen": true`.**
Nothing here has compared an operator ephemeris with anything before that
commit. Only the file formats were inspected (headers of one file per
provider) to write the readers. A deviation is recorded under Amendments.

## 1. Question

Operators publish ephemerides of their own satellites, some with
covariance (SpaceX Starlink), and precise-orbit services publish
post-processed and predicted orbits (IGS, ESA). How closely does what the
Space Data Network can build from public catalog data alone match each
operator's ephemeris, and its stated uncertainty, per source? Where an
independent precise orbit exists, which of the two is closer to it?

## 2. Data

### Operator ephemerides

Captured from the operators' own public feeds by the local SDN
ephemeris-provider nodes (`~/.local/share/spacedatanetwork/ephemeris-provider-nodes/<provider>`,
2026-09-09 onward; the CSS node is still capturing). Each node stores the
raw file in its IPFS block store with an `$NCD` descriptor (source URL,
SHA-256, size). The capture time of a file is the time of the first
dataset index that lists it. Step 00 copies the exact files the study uses
out of the nodes (read only), checks every SHA-256 against its descriptor,
and writes `inputs.json` (URL, capture time, SHA-256, size, provider terms).

| Provider | Format | Frame, time | Objects | Selection |
| --- | --- | --- | --- | --- |
| `spacex-starlink` | MEME text, 60 s, 3 days, 6×6 UVW covariance | EME2000, UTC | Starlink | 300 objects drawn without replacement (SplitMix32, seed 20261009) from the sorted NORAD numbers with a captured file; per object the earliest captured file |
| `iss` | CCSDS OEM 2.0 | EME2000, UTC | ISS (25544) | every distinct captured file |
| `css-tiangong` | CCSDS OEM 2.0 in a zip | EME2000, UTC | Tianhe (48274) | every distinct captured file |
| `planet` | `planet.states`: one state per satellite; `planet_mc.tle` | J2000, TT seconds since J2000 (Planet's README) | Planet (HWID → NORAD from Planet's own TLE file captured with it) | every distinct captured states file |
| `intelsat` | ECF positions, 30 min | ITRF (Earth-fixed), UTC | Intelsat fleet; name → NORAD by the rule in `config.json` | files whose name timestamp is within 3 days before capture |
| `gps-precise` | SP3 `IGS0OPSULT` (48 h: 24 h observed, 24 h predicted) | ITRF, GPS time | GPS | every captured file |
| `glonass-precise` | SP3 `ESA0OPSULT` | ITRF, GPS time | GLONASS only (GPS is covered above) | every captured file |
| `esa-pod` | SP3: `ESA0OPSRAP` (rapid), Swarm A and CryoSat-2 POD | ITRF, GPS time | GPS, GLONASS, Swarm A (39452), CryoSat-2 (36508) | every captured file |
| `cpf` | ILRS CPF v2 predictions (ESA), 15 min | ITRF, UTC | Galileo | every captured file |

Not compared, with the reason reported: `eutelsat-oneweb` (LTEF: no module
evaluates the format), `ses` (IESS-412 eleven-parameter model: no module
evaluates it), `telesat` (box-centre longitude/latitude, not a state
ephemeris), `eumetsat` (two-line elements only, no ephemeris and no truth
on hand). `space-track`, `spire`, `cpf-edc` and `vimpel` are credentialed
sources and are excluded entirely.

Frames and times are converted only in modules: EME2000/J2000 to GCRF by
`foundation/frames` (state transform, IAU 2006 frame bias); Earth-fixed
products to GCRF by `files/orbit-products` `read_container` and
`analysis/reference-states` with IERS EOP (finals2000A through
`data-source/eop-parser`). The Intelsat ECF and CPF files carry no SP3
container; their epochs and positions are transcribed, unchanged, into SP3-c
text (`P` records, positions in km) for that reader. Planet's TT epochs go
to UTC through `foundation/time`.

### Our inputs: public catalog data only

- **Element sets**: Space-Track `gp_history` (local archive; SGP4 theory,
  ephemeris type 0). For an operator file with information cut-off T_c
  (below), the product uses the object's set with the latest `EPOCH` among
  the sets with `EPOCH` ≤ T_c and `CREATION_DATE` ≤ T_c. Element sets and
  anything derived from them per sample stay on this machine.
- **Models**: `analysis/gp-error-model` `docs/model-2026-08-scaled.json`
  (SGP4 covariance by regime and age) and `docs/hpop-covariance-model-2026-08.json`
  (HPOP P₀ and process noise by regime), both fitted on 2026-08 data, before
  every file used here.

### Truth (independent precise orbits)

ESA final orbits `ESA0OPSFIN` (GPS and GLONASS, an IGS analysis-centre
final; BKG's IGS combination was unreachable at the freeze) and CODE's MGEX
final `COD0MGXFIN` (Galileo; ESA publishes no multi-GNSS final for these
weeks) for 2026-09-08 to 2026-09-20, downloaded by step 05 and converted by
`analysis/reference-states` with the IGS satellite metadata SINEX. If a
truth product cannot be downloaded, the comparisons that need it are
reported as not tested. Starlink,
ISS, CSS, Planet and Intelsat have no independent precise orbit on hand.

## 3. Products compared ("ours")

| ID | Product | Covariance |
| --- | --- | --- |
| S | SGP4 from the selected element set (`analysis/gp-error-model` `accumulate`: SGP4, TEME → GCRF, error in the comparison state's RTN axes) | The regime × age stratum of `model-2026-08-scaled.json` (RTN, km²) |
| H | The CA HPOP screen's product: `analysis/epoch-state` GCRF state at the set's epoch, propagated by `propagator/hpop`'s resident force model (point mass + EGM2008 20×20) | P(t) = Φ P₀ Φᵀ + Q from `hpop-covariance-model-2026-08.json` (P₀ rotated to GCRF by `gp-error-model` `hpop_arcs`), propagated by HPOP |
| P | Planet only: SGP4 from Planet's own published TLE (operator's element set), scored like S | none |

E2's batch-fit product (C2/C4: HPOP fitted to catalog history with
covariance, `analysis/estimation` `fit_batch`) is not on the modules'
default branch at the freeze; E4 uses H, the calibrated HPOP product the
modules already carry, and reports C2 as not run.

## 4. Comparison

**Cut-off and horizons.** T_c is the operator's stated creation time where
the file states one (MEME `created:`, OEM `CREATION_DATE`, CPF `H1`
production hour, Intelsat file-name timestamp), otherwise the capture time
(SP3 predictions). For definitive products (`ESA0OPSRAP`, Swarm and CryoSat
POD), whose span lies wholly before their publication, T_c is the start of
the span. Horizon h is scored at the first operator epoch at or after
T_c + h, for h in `config.json` `horizonsHours` within the file's span.
Planet's states are scored at their own epoch only (`h = at epoch`), with
element sets whose epoch is at or before it.

**Errors.** Position and velocity differences, ours minus operator, in the
operator state's RTN axes: for S by `accumulate` (narrow age bins, one
operator state each, as in E1); for H by `foundation/frames`
(GCRF → RTN rotation about the operator state), applied to the GCRF
difference and, for covariance, as R C Rᵀ. Where truth exists, ours minus
truth and operator minus truth, in the truth state's RTN axes, the same way.

**Metrics** per provider × product × horizon: samples, objects, median,
95th percentile and maximum of |R|, |T|, |N| and the 3D distance (km), and
the signed medians.

**Covariance** (Starlink MEME; SpaceX's UVW = RTN, km²):
- σ ratio per axis, ours over SpaceX's, median over samples;
- d² = eᵀ (P_ours + P_operator)⁻¹ e for the 3D position difference e (the
  difference of two independent estimates of one position), against χ²(3):
  mean d²/3 and the fraction inside the 95 % ellipsoid;
- d² of e under P_operator alone and under P_ours alone, reported beside it.

**Manoeuvres.** An object-file is flagged when S's 3D difference at h = 0
exceeds max(10 km, median + 5 × 1.4826 × MAD) of its provider's h = 0
differences (a manoeuvre between the element set and T_c, or a cross-tag).
Primary results exclude flagged object-files; results with them are
reported beside. The flagged count is reported per provider.

**Statistics.** Intervals are object-cluster bootstrap percentiles (2000
resamples, seed 20261009, 95 %).

## 5. Hypotheses and decision rules

| ID | Statement | Rule |
| --- | --- | --- |
| H1 | Starlink: S is within 2 km (median 3D) of SpaceX's ephemeris at h = 0 and within 30 km at 72 h. | Pass if both medians, flagged files excluded, are below the bounds. |
| H2 | Starlink: our covariance (S, and separately H) is consistent with our difference from SpaceX's ephemeris given both covariances. | Pass per product and horizon if mean d²/3 ∈ [0.8, 1.25] and 95 % coverage ∈ [0.93, 0.97]; reported for h ≤ 72 h. |
| H3 | Starlink: our σ exceeds SpaceX's by at least 10× in-track at every horizon. | Descriptive: median ratio and its 95 % interval per axis and horizon. |
| H4 | GNSS (GPS, GLONASS, Galileo): the operator's predicted orbit (IGS/ESA ultra-rapid, ESA CPF) is closer to truth than S and H at every horizon. | Pass per provider if the median 3D error ratio operator/ours, at each horizon, has its 95 % upper bound below 0.1. |
| H5 | H against S, per provider and horizon (two-sided). | "H closer" if the 95 % upper bound of median3D(H)/median3D(S) is below 1; "S closer" if the lower bound is above 1; otherwise undecided. |

Failures are results, reported with the same care.

## 6. Publication of the inputs

Everything E4 reads from an operator is published for others to check,
under its provider's terms, which step 00 records per file:
- small files (≤ 1 MB compressed) under `data/e4/<provider>/`, gzip, with
  `data/e4/SOURCES.md` (URL, capture time, SHA-256, terms);
- larger sets as GitHub release assets (one `.tar.gz` per provider),
  listed with every member's SHA-256 in `data/e4/MANIFEST.json`;
- a provider whose terms do not grant redistribution: files are prepared,
  but listed under `needsPermission` in the manifest and not committed;
- truth products are listed by URL and SHA-256 (public archives).
Element sets (Space-Track) and per-sample tables derived from them are
never published; only the aggregates in `results/e4/` are.

## 7. What E4 does not show

- Accuracy against truth for Starlink, ISS, CSS, Planet or Intelsat: only
  agreement with the operator, whose own error is unknown here.
- A fitted product (E2's C2); E4 scores the calibrated HPOP product the
  modules carry today.
- OneWeb, SES and Telesat: their formats have no module reader.

## Amendments

**A1 (2026-10-09, after the first comparison run, before any aggregate was
computed). Starlink has no 72 h horizon.** A MEME file spans 72 h from its
`ephemeris_start`, which precedes its `created` time (the cut-off) by about
a quarter of an hour, and some files span 48 h. The 72 h horizon therefore
never falls inside a Starlink file, and H1's 72 h bound cannot be tested as
written. H1 is reported as not decided at 72 h; the median at the last
horizon reached (60 h) is reported beside it, with no decision attached.

**A2 (2026-10-09, same point). H where the HPOP model has no P₀.** The
2026-08 HPOP covariance model has no geostationary regime. For Intelsat, H
is the same propagated state without a covariance; its accuracy is
reported and it enters no covariance metric.

**A3 (2026-10-09, same point). Galileo truth unavailable.** CODE's server
(`ftp.aiub.unibe.ch`) did not answer over HTTP or FTP from this machine
during the run, and ESA publishes no multi-GNSS final for these weeks, so
H4 is not tested for `cpf` (section 2 anticipated this). GPS and GLONASS
truth (`ESA0OPSFIN`) were downloaded for every day of the window.

**A4 (2026-10-09, after the first report, before any A4 product was
computed). Full force, SES, Galileo truth, product names.** The owner's rule
of 2026-10-09: "HPOP" names the full force model only. Section 3's H, and the
first report's, is propagator/hpop's resident model (point mass and EGM2008
20×20), so it is renamed and full-force products are added. Sections 1–7
stand except as stated here; `config.json` `a4` holds the numbers.

- **Products.** H is renamed **R** (the resident product), unchanged. Added:
  - **H-epoch**: propagator/hpop with every force below, from the latest
    element set's epoch state (`analysis/epoch-state`), Cd·A/m from B* in LEO
    (`a4.bstar`), a nominal Cr·A/m per provider (`a4.physical`), and R's P₀
    and Q (`hpop_arcs`) propagated with the full force model (none at GEO, as
    in A2).
  - **H-arc**: the same force model fitted (`analysis/estimation`
    `fit_batch`, answered by propagator/hpop) to the epoch states of every
    element set of the 3-day arc ending at the latest set (at least three),
    each weighted by its regime's 6×6 RTN second moment in the [0, 0.5] d
    stratum of `model-2026-08-scaled.json`. It solves for the state and
    Cd·A/m in LEO (a priori from B*, σ 0.02 m²/kg) or Cr·A/m at MEO and GEO
    (a priori nominal, σ half of it), with a priori state σ 100 km and
    10 m/s. Its covariance is the formal one times max(1, reduced χ²),
    propagated with the fitted parameters. A fit that does not converge gives
    no H-arc sample; the count is reported.
- **Issue time.** H-epoch and H-arc are made when their element set is
  published (its `CREATION_DATE`, at or before T_c). The arc holds the sets
  created by then. Earth orientation (IERS finals2000A to the day before,
  the last row held) and NRLMSISE-00 space weather (GFZ Potsdam's observed
  Kp, ap and F10.7 before the day of the newest NOAA SWPC RSGA issued by
  then, that report's values and 3-day predictions, then held) are those
  released by then, E7's operational rule. Like S and R, they depend only on
  the object and its set.
- **Forces.** E7's table: EGM2008 70×70 in LEO and 20×20 at MEO and GEO;
  the Sun, Moon, Venus, Mars and Jupiter (DE440s); cannonball solar
  radiation pressure; NRLMSISE-00 drag in LEO; IERS 2010 solid tides and
  relativity. Added to it: Knocke Earth radiation pressure (15° elements, on
  the same Cr·A/m) and FES2004 ocean tides to degree and order 30, carried by
  SDS 1.243.0 PRW. The row is the object's gp-error-model regime. RK78,
  tolerance 1e-11, step at most 300 s.
- **Hypotheses.** H2 and H3 apply to each product with a covariance (S, R,
  H-epoch, H-arc), and H4 to each of S, R, H-epoch and H-arc. H5 compares
  each of R, H-epoch and H-arc with S.
- **SES** is compared (provider `ses`). `files/orbit-products`
  `normalize_ses_i11` evaluates each IESS-412 file every 300 s, Earth-fixed
  on UTC. The positions are transcribed into SP3-c and converted like
  Intelsat's. The cut-off is the capture time, and the satellite name maps
  to a catalog number by `providers.ses.names`.
- **Galileo truth** for `cpf` is GFZ's operational final orbit `GFZ0OPSFIN`
  (GFZ ISDC), replacing CODE's (A3).
- **Inputs.** Each provider of the first run reads exactly the files that
  `data/e4/MANIFEST.json` lists. SES reads its 38 captured files.
- **Wording.** Where this plan says TLE, read element set (OMM). The file
  `planet_mc.tle` keeps the name Planet gives it.

**A5 (2026-10-10, after the A4 report, before any A5 product was
computed). Full-force HPOP fitted to the operators' ephemerides.** The
owner's requirement of 2026-10-10: "starlink should be fitted to the
ephemeris and same with all operator data that has ephemeris." A5 adds two
products and keeps every A4 product and result. `config.json` `a5` holds
the numbers.

- **Pairs and cutoffs.** A5 uses E4's object-files and cutoffs T_c, with
  some restrictions to keep compute in bounds:
  - Planet: the first states file captured on 2026-09-12 and on 2026-09-13
    (three days of history before, later states after).
  - GPS and GLONASS: the first file captured each UTC day.
  - esa-pod is left out. Its files are definitive, issued after their
    spans, so no file of the same object is issued before its cutoff.
    GNSS is covered by `gps-precise` and `glonass-precise`.
  - Every other provider: all of E4's object-files.
  The pairs, cutoffs, validation split and scoring references are written
  to `results/e4/a5/pairs.json`. E11's OMM fit and E9 use the same pairs.
- **Information (the rule shared with E11).** The fit uses only the paired
  file. T_c is the file's stated creation (MEME `created`, OEM
  `CREATION_DATE`, CPF H1, the Intelsat file-name timestamp), else its
  capture time. The Space-Track baseline S is the latest element set with
  `EPOCH` ≤ T_c and `CREATION_DATE` ≤ T_c (section 2). Files issued after
  T_c serve only as references. Extra inputs from the provider nodes:
  - each Starlink object's second captured file, where the node holds one;
  - every captured Intelsat file of the paired satellites.
  They are listed in `data/e4/MANIFEST.json` like the rest and held under
  each provider's terms. The provider nodes stopped capturing in mid
  September, so these pairs predate E11's CelesTrak SupGP archive. A rerun
  on E11's shared capture (from 2026-10-10), paired with SupGP by E11's
  rules, needs seven days of data past each pair and is a later
  amendment.
- **EPH-direct.** The newest operator ephemeris issued by T_c, interpolated
  within its span, scored as the operator's own product.
- **EPH-fit.** propagator/hpop 1.2.0 with A4's full force model, fitted by
  `analysis/estimation` `fit_batch` to the paired file's states in a window
  around T_c. The force-table row follows the provider: LEO for Starlink, ISS, Tianhe and
  Planet; MEO for GPS, GLONASS and Galileo (the two eccentric Galileo
  satellites included); GEO for Intelsat and SES.
  - Window: three candidates within the paired file, past/future hours
    about T_c `near` 6/6, `day` 24/24 and `span` 24/72. Planet's file
    holds one state per satellite, so its EPH-fit is that state propagated
    with the full force model (Cd·A/m from B*), with no fit. Its covariance
    is the stated σ on each axis (10 m and 0.01 m/s).
  - Window choice: per provider, on the validation objects (NORAD number
    divisible by 4), the candidate with the smallest median 3D error
    beyond the paired file's span. Where nothing is scored beyond the
    span, the comparison uses within-span epochs against later references
    or truth. Ties go to the shorter window. A provider with fewer than
    10 validation object-files takes the choice of its regime's largest
    provider (LEO Starlink, MEO GPS, GEO Intelsat). Test results are the
    remaining objects with the chosen window.
  - Observations: every 600 s in LEO and every 1800 s at MEO and GEO.
    - Starlink: position and velocity, weighted by SpaceX's 6×6 UVW (=
      RTN) covariance at each epoch.
    - Other providers: positions, with a stated sigma per provider
      (`a5.observations.sigmaM`).
  - Parameters:
    - LEO: Cd·A/m, with its a priori from B* of E4's set at T_c and
      σ 0.02 m²/kg, and a constant in-track acceleration (a priori 0,
      σ 1e-6 m/s²).
    - GNSS: ECOM2 D0, B0, B1 cos and B1 sin (a priori 0, σ 2e-9 m/s²) on
      the nominal cannonball.
    - GEO: Cr·A/m (nominal, σ half of it) and the in-track acceleration.
  - Manoeuvres: not segmented. The in-track acceleration absorbs planned
    burns and continuous thrust (the in-track fallback); the estimation
    v2 lane (bounded coefficients, empirical accelerations) had not
    landed. If an iteration proposes a negative Cd·A/m or Cr·A/m, which
    propagator/hpop refuses, the arc is refitted once with that
    coefficient fixed at its a priori, and the product records the
    refit.
  - Product: the state at the first observation at or after T_c (for
    Planet's past-only windows, at the last observation), the formal
    covariance times max(1, reduced χ²), and the parameters. These are
    propagated with the fitted parameters.
- **Scoring.** Differences are in the reference state's RTN axes.
  - (a) Within the span: EPH-fit against EPH-direct at E4's horizons.
  - (b) Beyond the span: EPH-fit at 6 h, 1 d, 3 d and 7 d after the end
    of the paired file's span. These are the fit span of the `span`
    window and E11's horizons, and the same epochs serve every window.
    For Planet, the targets are those times after T_c.
  - (c) Against truth: ESA0OPSFIN and GFZ0OPSFIN for GNSS, at E4's
    horizons and beyond the span. Otherwise against later operator files
    (the newest issued after T_c that covers the epoch, labelled "later
    operator ephemeris"), or later Planet states within ±6 h of the
    target.
  - (d) S (SGP4 from E4's set at T_c) at every scored epoch, and A4's
    H-arc and H-epoch at E4's horizons, from the A4 runs and paired by
    file, object and epoch. A4's products beyond the span are not
    recomputed.
  - (e) EPH-fit covariance realism against truth or the reference: mean
    d²/3 and the fraction inside the 95 % ellipsoid.
- **Products for E9.** `runs/<id>/products.jsonl`, kept local. Per pair:
  - the GCRF state and its (6 + p)² covariance at the reference epoch;
  - the parameters and their kinds;
  - the forces;
  - the window and the operator files used;
  - the refit flag.
- **Data.** Results use every operator's data. Files whose terms do not
  grant redistribution stay held, and only aggregates are committed.
  `data/e4/SOURCES.md` gives a license line for every source, truth
  included.

**A6 (2026-10-10, before any A5 product was computed). One ephemeris
fitter, its closure gate, and derived records only.** The owner's rules:
"The ephemeris should be in memory only, and only as long as it takes to do
the OD" (2026-07-16); "we should NOT be storing the ephemeris raw, ONLY the
HPOP OCM and OMM derived once we curve fit"; "We need to make sure that the
RMS for the OMM and the result for the HPOP are curve fit exactly"; "The
fitter (OD) should be able to start with the first half of any data and
reproduce the second half within 1 cm", "Using all the different
perturbations", "If no maneuvers" (2026-10-10). A6 replaces A5's EPH-fit
(windows, observations, weights, parameters, manoeuvre handling, refit and
product) and drops EPH-direct. A5's pairs, cutoffs, information rule,
validation split and scoring horizons stand. `config.json` `a6` holds the
numbers.

- **Fitter.** `harness/ephemeris-fit.mjs` `fitEphemeris`, one function for
  E4, E11's capture loop and the `analysis/od` hpop mode, which implements
  the same rules and thresholds. It takes states in memory and returns
  derived records only.
  - Every state goes to GCRF on UTC (`foundation/frames`, `foundation/time`).
  - **Segments.** The file is split into maneuver-free segments. A gap of
    more than three median steps ends a segment, and so does an
    operator-listed event (with 1800 s after it left out).
  - **Residual jumps.** A segment is also split at a residual jump: a run
    where the second difference of an RTN residual component of the
    segment's fit exceeds 10 × 1.4826 MAD and 1e-6 m/s². Both sides are
    refitted.
  - **Fit.** The initial state and epoch are the segment's first point. At
    most 720 evenly spaced points enter. Observations are positions with
    1 m on each axis and no a priori. `analysis/estimation` 0.3.0
    `fit_batch` runs with Levenberg–Marquardt, correction tolerance 1e-3 and
    at most 25 iterations.
  - **Parameters.** In the drag regime (osculating perigee altitude below
    2500 km, where `propagator/hpop` applies drag): Cd·A/m ≥ 0, a signed
    in-track acceleration and Cr·A/m ≥ 0. Above it: Cr·A/m ≥ 0 and ECOM2
    Y0 and B0, plus D2, D4, B1 and B3 (cos, sin) when the fitted span is at
    least a day. D0 is not solved for: it is collinear with the
    cannonball's Cr·A/m.
  - **Forces.** Every force in every regime: EGM2008 70×70; the Sun, Moon,
    Venus, Mars and Jupiter (DE440s); cannonball SRP; Knocke Earth
    radiation; NRLMSISE-00 drag in the drag regime; IERS 2010 solid tides;
    FES2004 ocean tides 30×30; IERS 2010 relativity. Drivers are A4's,
    released at the file's issue.
  - **Integrator.** RK78 at relative tolerance 1e-13. The step is at most
    three per shortest wavelength of the field at perigee,
    2π(r_p/v_p)/(3·70), and at most 300 s. `propagator/hpop` (wasm
    1b1df5e3) restarts the integration at every 3 h UTC boundary, where
    NRLMSISE-00's inputs change, and reads them inside each span.
  - **Statistics.** The fitted orbit is evaluated at every point of the
    segment: model minus ephemeris in each point's RTN axes. Reported: 3D,
    R, T and N RMS and maximum, the per-coordinate RMS (3D/√3), N and span.
  - **Half-split closure.** The same fit on the points at or before the
    segment's mid-time, propagated to every later point, with the same
    statistics there and the split epoch.
  - **Output.** An OCM per segment: the GCRF state, the covariance (formal
    × max(1, reduced χ²)), the parameters, the forces, the statistics, the
    closure and SHA-256 provenance.
- **Closure gate (step 30).** The gate uses 48 randomized arcs (seed in
  `a6.gate`).
  - **Generation.** `propagator/hpop` generates each arc with every
    perturbation on and no maneuver, from Keplerian elements. It uses a
    tighter tolerance and half the fitter's step, with the same restarts.
  - **Draws.** Six orbit classes (LEO-low, LEO, LEO above 1000 km, HEO,
    MEO, GEO); spans log-uniform from one orbit to seven days; sample
    steps of 10–600 s; GCRF or EME2000 tags, exact or rounded to 1 mm and
    1 µm/s; and the parameters the fitter solves for over the span before
    the split.
  - **Pass rule.** The fitter must keep the arc as one segment, and the
    largest 3D closure difference must be at most 1 cm. A failing case is
    reported with its cause; the gate is not loosened.
- **Closure on operator files (step 35).** Every object of every operator
  file read here goes through the fitter. Per maneuver-free segment, the
  report gives the exact statistics and the half-split closure. A closure
  above 1 cm is attributed to its physical source: the operator's force
  model (drag, solar radiation, attitude), maneuvers, the file's
  representation (digits, time tags) or the frame. Any term that would
  shrink the closure without a physical basis is not added.
- **Scoring (replaces A5's products).** EPH-fit is the OCM of the paired
  file's segment that covers T_c. Truth at 6 h, 1 d, 3 d and 7 d past the
  paired span is the OCM fitted to the newest later file version covering
  the epoch; that OCM's own exact RMS is reported as the reference's
  representation error. GNSS truth stays ESA0OPSFIN and GFZ0OPSFIN. The
  operator's own prediction enters through the OCM fitted to its full
  predicted span.
