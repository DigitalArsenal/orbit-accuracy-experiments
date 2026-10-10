# E8 — A zero-latency stand-in for the Dynamic Calibration of the Atmosphere from catalogued objects' orbital decay

Plan. Status: **frozen** by the commit that sets `"frozen": true` in
[`config.json`](config.json); that commit's SHA is recorded in every later
run manifest. Until then the code refuses the test windows (`common.mjs`,
`assertWindowReadable`). Before the freeze only the validation window and
the periods before it were read, to exercise the code: the validation
calibration set (step 08); one analysis fit with K = 4, global structure,
on an earlier build of the module (σ of ln(observed/D5a) 0.107 over the
validation orbit means, against 0.137 for D0 and 0.052 for D2a, the last two
equal to E5's); one forecast fit for 2026-04-05; and two propagation arcs of
D0. They led to three changes to the module (points above 2500 km add no
drag; convergence tolerances; scales and edits held after four iterations),
to the 180 s integration step (from 60 s, on cost; its accuracy is stated
below), to E5's integrator for HPOP and to choosing τ on the density
forecast (both on cost), none to a candidate set. The choices of section 5
are made by its rules on runs made after the freeze.

Lane: claude-e8. Modules: `analysis/density-calibration` 0.2.0 (`decay`,
`calibrate_decay`, node corrections) and `analysis/maneuver-detection` 0.2.0
(element-set input), and `analysis/reference-states`' DORIS, GFZ and
COSMIC-2 products, at space-data-network-modules `f258e625` (branch
`task/e8-omm-density-20261009`, from main `095c20a6`); `propagator/hpop`
unchanged from main.

## 1. Question

HASDM's Dynamic Calibration of the Atmosphere (DCA) corrects Jacchia's
exospheric temperatures every few hours from the drag of about 75
calibration satellites, whose tracking is not public (Storz et al. 2005,
*Adv. Space Res.* 36(12), 2497–2505). E5 replaced that tracking with
accelerometer and precise-orbit densities (Swarm, GRACE-FO): on held-out
satellites the spread of ln(observed/model) fell by 64 %, but the inputs are
published one to three months late, the forecast kept 9 % for a day, 3-day
propagation did not improve, and a correction fitted near 450 km made
Sentinel-1 at 700 km slightly worse.

The decay of catalogued objects' orbits is public as soon as Space-Track
publishes their element sets, and spans every altitude where drag matters.
It has been used to measure thermospheric density (Picone, Emmert and Lean
2005, *J. Geophys. Res.* 110, A03301; Emmert 2009, *J. Geophys. Res.* 114,
A06315), to calibrate density models (Doornbos et al. 2008, *Adv. Space
Res.* 41, 1115–1122), and, with ballistic coefficients estimated jointly, to
estimate density in real time (Gondelach and Linares 2020, *Space Weather*
18, e2019SW002356, "Real-time thermospheric density estimation via two-line
element data assimilation", arXiv:1910.00695).

Can a correction to JB2008 estimated from the OMM histories of many LEO
objects, available with no latency, (a) match or beat E5's accelerometer
calibration on density against held-out satellites, and (b) improve 1-, 3-
and 7-day full-force HPOP propagation of held-out precise-orbit satellites
across altitudes; and (c) what latency does it have?

## 2. Variants

| ID | Density | Correction from | Where |
| --- | --- | --- | --- |
| D0 | JB2008 (Bowman et al. 2008) as published | — | `propagator/hpop` (propagation); `analysis/density-calibration` `evaluate` (densities), the same `lib/jb2008.h` |
| D2 | E5's stand-in: JB2008 + E5's selected correction (degree 0, forecast τ = 12 h), E5's published calibration bins | Swarm and GRACE-FO densities (E5) | `results/e5/calibration/*.json.gz`; evaluated as E5 does |
| D3 | HASDM (historical windows; Licata et al. 2021's interpolation) | — | Zenodo 10.5281/zenodo.4602380 |
| D5 | JB2008 + dT(t[, h]) estimated from orbital decay | the OMM histories of the calibration set (below) | `analysis/density-calibration` `calibrate_decay` (new) |

**The D5 model** (module README). Each element set is propagated by Vallado's
SGP4 to the next set's epoch; drag changes the mean semi-major axis at da/dt
= −(a²/μ) B ρ |v_r| (v · v_r), integrated along the set's trajectory with
JB2008 + dT at the trajectory's geodetic point. `calibrate_decay` fits every
set's SGP4 (Brouwer) mean semi-major axis, a_k = a0 + B Σ D(dT), for dT at
time nodes every 6 h (linear between them; *global*, or *linear in altitude*
between nodes at 400 and 800 km), every object's ln B and an offset per
chain of sets, by Gauss–Newton: each object weighted by its robust residual
scale (2 m floor; sets beyond 4 robust sigmas left out; scales and edits
re-estimated in the first 4 iterations, then held), a random walk of
40 K √day⁻¹ between nodes (E5's validation-window correction changes by
34 K, s.d., in a day), a 150 K prior on each altitude node's mean level (E5's
degree-0 prior), a 100 K prior tying the two altitude nodes, and each
object's prior on ln B (below); converged when every step is below 0.5 K,
0.001 in ln B and 0.1 m, at most 12 iterations. Integration step 180 s (within 0.004 % of a
30 s step on the validation calibration set, e up to 0.075); sets more than
3 days apart start a new chain; an object needs 10 sets.

**Identifiability.** Density and B enter only as their product: scaling
every B is the same as shifting dT's level. The time variation of dT is set
by every object; the level only by objects with known area to mass (the
priors) and the level prior. Each fit reports the level's formal sigma and
its correlation with the mean ln B; section 4 adds the fit without physical
priors.

**D5a** (analysis mode, as the HASDM database is): one fit per window, nodes
from 30 days before the first issue day to 8 days after the last, every set
whose epoch lies there (any creation time).

**D5f** (forecast mode) from an issue time t0: one fit per issue day over the
30 days before t0, from the sets whose `CREATION_DATE` precedes t0 (each set
as it stood then: of republished sets, the latest version created before
t0). The nowcast c_now is the fit at t0 (per altitude node); the level c̄ its
mean over the 27 days before t0; for t ≥ t0, c̄ + (c_now − c̄) exp(−(t − t0)/τ),
τ ∈ {12 h, 48 h, ∞} (E5's form; ∞ holds the nowcast). Before t0 (an arc's fit
span) D5 is the forecast fit itself.

**D5 in `propagator/hpop`:** JB2008 with every hourly DTC raised by dT(t,
h_s), h_s the target's mean geodetic altitude over the day after its latest
element set before t0 (`decay`, one day). Exact for the global structure; for
the linear structure dT varies by under 2 K over a near-circular target's
altitude range. D2 enters as in E5 (a00(t) added to every DTC).

### Drivers and information

- **Definitive** (E5's protocol): SET `SOLFSMY.TXT` and `DTCFILE.TXT` as
  published (2026-10-09 copies), over the whole span.
- **Operational** (forecast mode: information released before t0):
  - SET's indices released by t0: every value for days before t0's day D
    (SET's operational users receive them daily; its free copy lags 45 days,
    section 8). The definitive values stand in for those released then.
  - F10 for days D, D+1, D+2: the SWPC Report of Solar-Geophysical Activity
    (RSGA) issued at 22:00 UTC on D−1, as SET's F10 on D−1 times the RSGA's
    predicted over observed Penticton flux; held after D+2.
  - S10, M10, Y10: the value of D−1 held (no public forecast).
  - The 81-day centred values: recomputed for every day from the daily
    values as known at t0 (released, then forecast or held).
  - DTC: the released hourly values before t0; for D, D+1, D+2 the daily
    value −3.92 + 21.78 √Ap from the RSGA's predicted Ap (least squares of
    SET's daily-mean DTC on GFZ's daily Ap over 2025, a year before every
    window: residual 14.3 K), held after D+2.
- **D2 with its real latency** is JB2008 unchanged: E5's inputs appear one to
  three months late (section 4c), beyond its 27-day level window. D2f
  below is E5's forecast as published, which assumed zero latency.

## 3. Data

All inputs are local copies with their SHA-256 in the run manifests; nothing
is fetched during a run.

| Input | Source | Terms |
| --- | --- | --- |
| OMMs 2025-10..2026-07 | Space-Track `gp_history` by creation day (`/opt/data/sdn-archive/spacetrack/gp_history/by-creation`) | Space-Track user agreement; never leaves this machine |
| OMMs 2003, 2007–2008 | Space-Track GP history 1959–2022 (`historical/space-track-gp-history-1959-2022-11-22/Archives2.zip`, one CSV per object) | as above |
| Object type, launch date | Space-Track SATCAT snapshot of 2026-10-09 | as above |
| Mass, dimensions, shape | GCAT (McDowell), `satcat.tsv` updated 2026-10-08 | CC BY 4.0 |
| Densities: Swarm A/B/C DNSxPOD, GRACE-FO 1 DNS1ACC (2026; scored on GRACE-FO 1, Swarm B and Swarm C as in E5); CHAMP, GRACE-A with HASDM and JB2008 (2003, 2008) | as E5 | as E5 |
| Truth orbits, E5's: Swarm A/B/C, Sentinel-1A/1C/1D, NSGF arcs of Starlette, Stella, LARETS, WESTPAC | as E5 (`/opt/data/sdn-archive/reference-states/reference`) | ESA, Copernicus, ILRS |
| Truth orbits, added: CryoSat-2, SARAL, Sentinel-3A, SWOT (IDS/CNES SSALTO DORIS orbits); GRACE-FO 1 (GFZ ISDC rapid science orbit); COSMIC-2 FM5 and FM6 (UCAR CDAAC near-real-time orbits) | local copies (`hac/ids-doris`, `hac/gfz-isdc-rso`, `hac/ucar-cosmic2`), converted by `analysis/reference-states` (`--products doris,gfz-rso,cosmic2`, section 9) | IDS/CNES, GFZ, UCAR (public, attribution) |
| JB2008 indices | SET `SOLFSMY.TXT`, `DTCFILE.TXT` (2026-10-09) | SET; cite Bowman et al. 2008 |
| Kp, ap, Ap, F10.7 | GFZ (Matzka et al. 2021) | CC BY 4.0 |
| SWPC forecasts | NOAA SWPC warehouse RSGA, 2025 (yearly archive) and 2026 (daily files) | US public domain |
| EOP; planetary ephemeris | IERS EOP 20 C04; JPL DE440s (`de440s.bsp`) | IERS; JPL |

### Windows (issue days t0 = 00:00 UTC) — E5's

| Window | Issue days | Contains |
| --- | --- | --- |
| Validation | 2026-04-01..04-21 | Kp 6.3 on 04-03 |
| Test A (locked) | 2026-01-12..01-26 | the 2026-01-19..21 storm (Kp 8.7) |
| Test B (locked) | 2026-03-15..03-28 | Kp 7 on 03-21..22 |
| Test C (locked) | 2026-06-26..07-08 | Kp 7 on 07-04; GRACE-FO densities end 04-30 |
| Historical (locked) | 2003-10-01..12-31, 2008-01-01..03-31 | the 2003 Halloween storms; solar minimum (density only, analysis mode) |

E5's outcomes for D0 and D2 on these windows were known when this plan was
written; D5's were not.

### The calibration set (per window, from data before it)

From the 60 days before the window's first fit day S (S = first issue day −
30 d), objects whose element sets there (SGP4 theory, deduplicated by epoch):

1. are rocket bodies or debris in the SATCAT, or passive spheres (GCAT shape
   `Sphere` with a mass and a diameter);
2. are none of the held-out satellites (2026: every density and propagation
   target, Swarm A/B/C, GRACE-FO 1/2, Sentinel-1A/B/C/D, Sentinel-3A/B,
   CryoSat-2, SARAL, SWOT, COSMIC-2 FM1–FM6, Starlette, Stella, LARETS,
   WESTPAC; historical: CHAMP, GRACE-A, GRACE-B);
3. were launched more than a year before S;
4. have their perigee height (of the latest set: SGP4's mean semi-major
   axis × (1 − e) − 6378.135 km, from `decay`) in [300, 900) km, with
   e < 0.02 (spheres e < 0.15);
5. have at least 45 sets in the 60 days and no gap longer than 4 days in the
   last 30;
6. show no manoeuvre: `analysis/maneuver-detection` (default options) on
   those sets finds no event other than `ORBIT_LOWERING` (passive objects
   cannot lower themselves; storm decay steps register as small lowerings).

Tiers: **A** spheres; **B** objects with a GCAT mass (dry mass if given) and
length and diameter; **C** the rest. Bins of 50 km of perigee from 300 to
900 km; in each, tier A, then B, then C, each by the number of sets
(descending), then NORAD number; the first K per bin (K chosen, section 5).

Priors on ln B: tier A, ln(2.2 π D²/4 / m) ± 0.10; tier B, ln(2.2 S/4 / m) ±
0.35, S the surface of a cylinder of the GCAT length and diameter (Cauchy:
the mean projected area of a convex body tumbling at random is a quarter of
its surface); tier C, none (the module's weak start prior).

## 4. Endpoints

**(a) Density** (E5's protocol): for each held-out satellite, orbit means of
the observed and model densities over one orbital period centred on each
scoring time (every 600 s; the same valid samples, at least 90 %), r =
ln(observed / model); per variant the bias (exp of the mean of r, − 1) and
the spread σ(r), pooled, per satellite and per regime. Analysis mode: D0, D2a,
D5a (historical: also E5's J and D3). Forecast mode, from each issue day, at
leads 0–1, 1–3, 3–7 d: with operational drivers D0, D2f, D5f; with
definitive drivers (E5's protocol) the same three.

**(b) Propagation** (E5's protocol, full force): for each issue day and
target, batch least squares (`analysis/estimation` `fit_batch`, answered by
`propagator/hpop`) of the state and B = Cd·A/m to the precise orbit every
180 s over the 24 h before t0 (σ 0.1 m and 0.1 mm/s; Cr·A/m fixed per target,
`config.json`), propagated with the same model to t0 + 1, 3 and 7 d; the 3D
distance to the precise orbit there. The precise-orbit state nearest each
time within 15 s (E5's targets) or 30 s (the added ones, whose products sit
18–23 s off whole minutes); COSMIC-2 products stating more than 0.5 m are
not used. HPOP with every force it carries in LEO: EGM2008 70 × 70, Sun,
Moon, Venus, Mars and Jupiter (DE440s), cannonball radiation pressure with
conical shadow, drag by the variant, IERS 2010 solid tides and relativity,
IERS EOP 20 C04; RK78, relative tolerance 1e-12, steps of at most 120 s
(E5's integrator; its error is millimetres against drag errors of hundreds
of metres or more).
Two driver arms: **definitive** (D0, D2, D5: E5's protocol) and
**operational** (D0, D5), on every second issue day of each test span (the
first, third, …: consecutive days' 7-day arcs overlap, and the intervals
cluster by day). On each arc every variant's fit starts from the first
fitted variant's state and B and fits its own (the same solution, fewer
iterations). The validation arcs run the two D5 structures of section 5. Regime by the largest 3-hour Kp from t0 to the
horizon (E5's bins); altitude bands by the target's mean altitude.

**(c) Latency**: for D5 the delay from each set's EPOCH to its
CREATION_DATE, the age at t0 of each object's newest usable set, and the
estimate's compute time; for D2 the delay from the end of each density day to
its file's appearance on ESA's server (`server_mtime_utc`); the drivers'
release cadence.

**Identifiability, descriptive:** per fit, the level's sigma and its
correlation with the mean ln B; D5a refitted with no physical prior; the
spheres' and rocket bodies' fitted B against their nominal values.

**Cross-check, descriptive:** DESTOPy (Gondelach and Linares's code,
github.com/pengmun/DESTOPy, MIT) run locally, outside the product path, on
the validation window with at most 17 objects of the D5 calibration set;
its densities against Swarm and GRACE-FO as in (a).

## 5. Hypotheses and decision rules

Choices on the validation window, after the freeze, by these rules, recorded
in `results/e8/selection.json` before any test window is run:

1. K ∈ {4, 16}: the smallest σ of D5a (global structure) pooled over the
   held-out GRACE-FO 1, Swarm B and Swarm C.
2. With that K and the global structure, τ ∈ {12 h, 48 h, ∞}: the smallest
   pooled σ of D5f at leads 0–3 d (definitive drivers) from the validation
   issue days 04-01, 04-03, …, 04-21.
3. With that K and τ, the structure ∈ {global, linear}: the smallest median
   3-day error of D5 (definitive arm) over the validation arcs of those
   issue days, every target, both structures on the arcs where both have a
   3-day error.

Ties go to the global structure, the smaller K, the shorter τ.

| ID | Hypothesis | Statistic | Supported if |
| --- | --- | --- | --- |
| H1 | The OMM calibration removes density error: D5a has a smaller σ than D0 on held-out satellites (2026 test, pooled). | R1 = 1 − σ(D5a)/σ(D0) | R1 ≥ 0.25 and its lower bound > 0 |
| H2 | At zero latency it forecasts: D5f has a smaller σ than D0 at lead 0–1 d (operational drivers). | R2 = 1 − σ(D5f)/σ(D0) | lower bound > 0 |
| H3 | It improves propagation: D5's 3-day error is smaller than D0's (definitive arm). | median over arcs of e(D5)/e(D0) at 3 d | upper bound < 1 |
| H4 | At zero latency it matches E5's calibration as E5 published it (assumed zero latency) at lead 0–1 d (operational drivers). | σ(D5f)/σ(D2f) | upper bound < 1.03 |
| H5 | It does not repeat E5's altitude failure: above 600 km D5 is no worse than D0 at 3 d (definitive arm). | median of e(D5)/e(D0), targets ≥ 600 km | upper bound < 1.02 |

H1–H5 are one family, Holm's procedure at α = 0.05 (one-sided intervals
read from the two-sided 90 % ones; for H4 and H5 the bootstrap share of
resamples at or beyond the margin). Everything else is descriptive:
analysis-mode D5a against D2a, the operational propagation arm, 1 and 7
days, the 95th percentiles, per satellite, altitude band and regime, the
historical windows (σ of D5a against D3 HASDM, D2a and D0 on CHAMP and
GRACE-A), latency, identifiability and DESTOPy.

**Intervals.** Two-way cluster bootstrap over satellites and UTC days (Owen
2007), 2,000 resamples, seed 20261009, percentile intervals; every
statistic paired (variants on the same samples or arcs). Statistics are
untrimmed; failed fits and missing truth are counted and listed.

## 6. Acceptance of the module changes (before any window is read)

`analysis/density-calibration` 0.2.0 and `analysis/maneuver-detection` 0.2.0
pass their end-to-end tests (module READMEs): Vallado's SGP4 verification
states at epoch (2e-8 km); the Spacetrack Report No. 3 mean semi-major axis
(1e-6 km); the drag decay against `propagator/hpop`'s numerical integration
(circular 400 km within 0.4 %, e = 0.05 within 1.6 %, the response to a
60 K correction within 0.03 %); recovery of a known correction and B from
synthetic histories with the level degeneracy shown; node corrections against
their closed form and the DTC offset; and the detector's element-set input
(no event without a burn; a 1 m/s burn at 1.0002 m/s). Every earlier test of
both modules passes unchanged.

## 7. Threats to validity

- **SGP4 trajectories.** Each segment follows one element set's SGP4
  trajectory, which does not follow its own decay (1–2 % on a day for an
  eccentric orbit, absorbed by B).
- **Element-set errors.** Consecutive sets share observations, so their
  errors correlate; the formal sigmas are optimistic. Each object's scale
  is estimated, and outliers are edited.
- **Forces other than drag.** Radiation pressure, unmodelled in the decay,
  changes the mean semi-major axis of high area-to-mass objects above
  ~700 km; their residual scales grow and their weight falls.
- **Constant B.** Each object's B is constant over a fit; attitude and
  drag-coefficient changes become residuals.
- **The level.** The absolute level rests on Cd = 2.2 and GCAT dimensions;
  Swarm and GRACE-FO densities carry their own drag-coefficient models.
  The density endpoint reports bias apart from σ; the propagation endpoint
  fits B and is insensitive to a constant scale.
- **Operational drivers.** Definitive values stand in for those released
  at t0 (later revisions); only F10.7 and Ap have public forecasts; the DTC
  mapping is a statistical stand-in for Dst forecasts.
- **Truth.** Centimetre (Swarm, Sentinel-1, DORIS) to decimetre (NSGF,
  GFZ rapid, COSMIC-2 near-real-time) precise orbits, far below the 1–7-day
  drag errors. DORIS and GFZ sigmas are the overlap of consecutive arcs
  (precision).
- **Altitude coverage of density truth.** Density truth spans 440–510 km
  (2026) and 300–490 km (historical); higher altitudes are scored only by
  propagation, where forces other than drag dominate the error above
  ~700 km.
- **Windows.** E5's windows; E5's D0 and D2 results on them were known.

## 8. Not done here, and why

- **D5+D2** (decay and densities in one fit): not run; the module accepts
  either, and the experiment compares them.
- **A reduced-order density model** (Gondelach and Linares use a POD model
  of a physical model's density field): D5 corrects JB2008's temperature
  instead; DESTOPy is run as the external reference.
- **Latitude and local-time structure** in D5: orbit-averaged decay does
  not resolve it.
- **Login-only data that would improve D5:** ESA DISCOS masses, areas and
  shapes (better ln B priors and more anchors); SET's operational
  real-time JB2008 indices (needed at zero latency; the free copy lags 45
  days); Space-Track's SATCAT operational status; the SET HASDM database
  for 2026; LeoLabs or other commercial tracking at higher cadence.

## 9. Outputs and provenance

Each run writes `runs/<run-id>/` (ignored by git): rows and `manifest.json`.
Committed under `results/e8/`: the selection, the run manifests and
metrics, the calibration sets as NORAD lists with their tiers, bins and
GCAT priors, the D5 corrections (node values and sigmas), and `REPORT.md`
generated from them by `steps/90-report.mjs`. Element sets and per-object
quantities derived from them (fitted B, residual scales, perigee heights) stay
in `runs/`; only aggregates over objects are committed. The extra truth orbits are converted by
`analysis/reference-states/scripts/fetch-reference-products.mjs --products
doris,gfz-rso,cosmic2` into `runs/cache/e8-reference` (manifests record
every file's SHA-256).

## Amendment 1 (2026-10-10, after the freeze, before any test-window run)

The module build changes from `f258e625` to `1d700368`
(`analysis/density-calibration`). In the validation calibration set, a
rocket body at 892 km (NORAD 28522) has element sets whose mean
semi-major axis rose 2.8 m over the fit, as radiation pressure can make it
and drag cannot; its B ran towards zero and its ln B step alternated at the
step limit, so the 186-object fits ran their 12 iterations without being
declared converged although the correction had (last steps 0.04 K). Each
object's ln B step is now damped when it reverses sign, and the level's
correlation with ln B uses the precision-weighted mean ln B (the degenerate
object no longer dominates it). The objective is unchanged. The validation
fits made before (K = 4 and K = 16 analysis; the K = 4 forecasts; the K = 16
forecasts, which were already running) stay as made on `f258e625`, so that
each selection stage compares fits from one build; every test and
historical fit uses `1d700368`.

Two code corrections, no change to this plan: step 08 held out the 2026
propagation targets in the historical windows as well, against section 3
(historical: CHAMP, GRACE-A, GRACE-B); it was corrected and the historical
calibration set recomputed before any use. Step 10 now writes each fit as
it completes, so long runs can resume.

## Amendment 2 (2026-10-10, order of runs)

Section 5 says the selection is recorded before any test window is run.
Steps 05 and 08 (the element sets of each window and the calibration set
chosen from the 60 days before it) ran for the test and historical windows
before the selection was recorded. They read no density, no precise orbit
and no outcome, and nothing they produce depends on section 5's choices
(the calibration set of every K is the head of each bin's one ranked list).
Stage 1 chose K = 4; the K = 16 forecast fits, then running, were stopped
and are not used.

## Amendment 3 (2026-10-10, DESTOPy's objects, before any DESTOPy density is read)

Section 4 runs DESTOPy "with at most 17 objects of the D5 calibration set".
DESTOPy takes each object's ballistic coefficient from its own table
(`Data/BCdata.txt`, 54 objects estimated by its authors) and does not run an
object outside it. Giving it GCAT priors for calibration-set objects would
change DESTOPy, so it runs as published: the 17 objects of its table in
orbit in March–April 2026 and not held out (NORAD 22, 932, 1807, 2389, 4221,
4382, 7337, 8744, 12138, 12388, 14483, 20774, 23278, 41771, 41773, 42989,
43797), with its default model and filter settings, hourly from 2026-03-27
(five days of spin-up) to 2026-04-29. Seven of them, the Cosmos 2-m spheres,
are in E8's validation calibration set (four in its K = 4 set); the other
ten are nine payloads the calibration-set rule does not admit and one
rocket body it did not choose. The comparison is therefore DESTOPy as
published against D5, not two estimators given the same objects. It stays
descriptive.

## Amendment 4 (2026-10-10, module build `d0a7bec4`, before any test-window density or orbit is read)

The first test-window fits on `1d700368` stopped at the 12-iteration
limit in four of the first five forecasts (2026-01-12 to 01-15): the
temperature steps had fallen below 0.1 K and the offsets below 0.03 m,
but the largest ln B step shrank only by a factor of about 0.77 per
iteration (0.005 at the limit). Amendment 1's damping halved an object's
ln B step on every sign reversal and never restored it, also in the first
four iterations, where the robust scales and edits are re-estimated and
the objective changes. The damping now starts afresh on the first
iteration with held scales and edits (`analysis/density-calibration`
0.2.1, `d0a7bec4`), so it slows only an object that alternates on the
fixed problem; the objective, priors, tolerances and iteration limit are
unchanged. On 2026-01-12 the fit now converges in 7 iterations and its
correction differs from the stopped one by at most 0.23 K at any node
(median formal sigma 16 K). The stopped fits are discarded; every test and
historical fit uses `d0a7bec4`. The validation fits behind section 5's
choices stay as made on `f258e625`.

One code correction, no change to this plan: step 30 listed a D5 variant
once per step 10 run, so a forecast configuration fitted in shards would
have run once per shard; it now lists each configuration once and refuses
two fits of one configuration for the same day.
