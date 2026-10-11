# E14 — Realistic covariance by data source

Plan. Status: **draft** (not frozen). Committed before any test-window
result exists or is read. `config.json` holds the same numbers for the code.
The test windows stay locked (section 7) until this plan, `config.json`,
`amendments.json` (if any) and the dev selection
`results/e14/selection.json` are committed and unchanged, with
`"frozen": true`. Changes before the freeze are listed at the end, dated,
with their reasons.

Lane: claude-e14 (branch `task/covariance-realism-20261010`). Modules:
`space-data-network-modules` branch `task/covariance-models-20261010`
(section 10); `propagator/hpop` 1.2.0 through its execution path until
1.3.0 (resident full force) lands.

Owner, 2026-10-10: "Let's do covariance first since we need that to do PoC"
(probability of collision).

## 1. Question

Every catalog product should carry a covariance that is realistic, so that
a probability of collision means something. For each data source the
catalog uses, and for each orbit regime and prediction horizon, can a
covariance model fitted on development data be realistic on later, held-out
data, against independent truth?

**Realistic** (owner's definition): against independent truth, the position
Mahalanobis statistic d² has mean d²/3 ≈ 1 and 95 % coverage ≈ 0.95, in
every cell of

- regimes: LEO below 500 km, LEO 500–800 km, LEO above 800 km, MEO, GEO,
  HEO (section 3);
- horizons: 0, 0.5, 1, 2, 3, 5 and 7 days.

**Sources.**

| ID | Products | Covariance |
| --- | --- | --- |
| S1 | Operator ephemerides that carry covariance: SpaceX Starlink MEME files (UVW covariance per state), Planet `<hwid>_oem.txt` (CCSDS OEM with covariance) | The operator's, scaled by factors fitted per horizon |
| S2 | Our HPOP products: full-force HPOP from an element set's epoch state, the CA screen's HPOP product | Epoch covariance P₀ through HPOP's STM, consider terms (Cd·A/m, density forecast), white-acceleration process noise Q per regime |
| S3 | Objects with element sets only (most debris) | E2b's measured-error model (T0) per regime and age, with calibration factors by regime and age |
| S4 | The density-forecast consider term (an open Dynamic Consider Parameter, DCP) in LEO | NOAA SWPC issued forecasts against GFZ observed drivers → density error by lead (NRLMSISE-00) → B·ρ consider variance → along-track growth; enters S2 |

## 2. Prior art and the novel claim

Searched 2026-10-10: Crossref (53 requests: 40 title and 7 topic queries
from 2005, 6 DOI look-ups), NASA NTRS (8 searches), arXiv (7), and full
texts from NTRS (15), AMOS (2) and arXiv (1), serially, at least 3.5 s
apart. Not reachable: DTIC (Poore et
al. 2016, connection refused), Wiley and ESSOAr (Parker et al., HTTP 403).
CelesTrak was not fetched (so Vallado and Seago 2009, hosted there, was not
read). Marks: **R** read in full, **A** abstract only, **M** metadata only.

| Work | What it does | Mark |
| --- | --- | --- |
| Zaidi & Hejduk 2016, *Earth Observing System covariance realism* (AIAA 2016-5628; NTRS 20160010501) | Aqua/Aura (NASA operator) predicted covariance against definitive OD: d² per propagation point, Cramér–von Mises against χ²₃, Rosner outlier test; state-noise compensation (RIC acceleration variances, Cd variance as a seventh term) added until the tests pass; outliers in high solar activity removed; 80–90 % of the span passes (60 % threshold). Tuned and assessed on the same ephemerides | R (abstract, sections I–III) |
| Ojeda Romero & Miguel 2017, *EOS covariance realism updates* (NTRS 20170005601) | Follow-up of the EOS process | M |
| Halpin, Auman & Toumey 2026, *Effects of covariance realism on probability of collision for operational missions* (AAS ASC 2026; NTRS 20260005829) | Three CARA-supported missions' O/O covariance: 3 sets of ≤ 30 ephemerides (maneuvers and Rosner outliers removed), hourly to 3.5 d against the ASW definitive orbit, combined covariance; overall and per-axis CvM pass rates; MLE-corrected covariance and bias per time step (C = D C_SE D); Pc recomputed. Corrections are fitted and applied on the same data | R |
| NASA CARA, *Conjunction Assessment and Collision Avoidance Best Practices Handbook*, Vol. 2 (2026), App. I and N.8 | Realism procedure: one comparison point per propagation bin per ephemeris, < 50 % shared data between ephemerides, truth covariance added, RIC axes, mean d² as a scale factor, CvM preferred to Anderson–Darling because of outliers. N.8: CDMs (ASW 19.2+) carry the DCP density-forecast uncertainty and drag sensitivity vectors for decorrelation | R (App. I.1–I.5, N.8.3–N.8.4) |
| Hejduk 2019, *Three CA-related covariance issues and their solutions* (CNES CA workshop; NTRS 20190026790) | The DoD's DCP: debiased density model (DCA), predicted-minus-definitive density errors by perigee height and Ap/Dst class, combined over days 1–3 with weights 5/9, 3/9, 1/9, added to the B variance; a frontal-area DCP from B histories; density DCP only from the present time forward. The figure's y-axis is withheld for releasability. Also Casali et al.'s decorrelation and Hall et al.'s non-PD repair | R |
| Casali, Hall, Snow, Hejduk et al. 2018, *Effect of cross-correlation of orbital error on Pc* (AAS 18-272; NTRS 20220004548) | The ASW DCP (operational mid-2015): a step function in prediction from the end of the OD; density forecast uncertainty as fourth-order polynomials in perigee height for four solar-activity classes, plus frontal area from B histories, variances summed; run three times a day. The global part correlates two objects' errors: P_m = P_p + P_s − σ_g²(G_p G_sᵀ + G_s G_pᵀ); 250 higher-drag events: Pc changes by more than 1.5× in about 40 % | R (introduction); results via Hejduk 2019 |
| Hejduk & Snow 2018, *Effect of neutral density estimation errors on conjunction serious event rates* (Space Weather 16, doi:10.1029/2017SW001720) | Reprocessed real events with injected density error; including the expected density error in the covariance cuts missed detections | A |
| Highsmith 2025, *Conjunction sensitivity to atmospheric density modeling* (NASA CARA, COSPAR ISWAT; NTRS 20250000813) | Density errors are "in general not characterized well and not separately included in covariance"; DCP gives some improvement | A (first seven slides) |
| Bussy-Virat, Ridley & Getchius 2018 (Space Weather, doi:10.1029/2017SW001705) | Driver uncertainty propagated to Pc by ensembles; a storm example | A |
| Parker, Freeman, Chisham & Kavanagh 2024 (Space Weather, doi:10.1029/2023SW003818) | Persistence-based probabilistic F10.7 and Kp forecasts (heteroscedastic, non-Gaussian); simulated conjunctions; Pc and maneuver decisions | A |
| Gondelach, Linares & Siew 2022 (JGCD, doi:10.2514/1.G006481); Gondelach & Linares 2020 (AIAA 2020-0232) | Density uncertainty quantification for conjunction assessment with reduced-order density models | M |
| Licata, Tobiska & Mehta 2020 (Space Weather, doi:10.1029/2020SW002496) | Benchmarks SET's operational HASDM driver forecasts over six years | A |
| Warren, Emmert & Crump 2017 (Space Weather, doi:10.1002/2017SW001637) | Linear F10.7 forecasts; effect on model density | A |
| Emmert et al. 2017 (ASR 59, doi:10.1016/j.asr.2016.07.036) | Propagation of density errors to orbits | M |
| Cano, Fernández, Pastor & Escobar 2021 (AMOS); Cano et al. 2022 (JAS, doi:10.1007/s40295-022-00343-x) | Consider-parameter variances (SRP, sensor time bias) inferred from the d² distribution of predicted minus estimated orbits; simulated GEO; recovered within 11 % | R (2021) / A (2022) |
| Cano et al. 2023 (ASR, doi:10.1016/j.asr.2022.08.001); Lopez-Jimenez, Pastor & Escobar 2021 (Acta Astronaut., doi:10.1016/j.actaastro.2020.09.026); Cano et al. 2025, stochastic consider parameters for drag (ASR, doi:10.1016/j.asr.2025.04.018) | The same covariance-determination programme, extended | M |
| Park, Stevenson, Nicolls, Lu et al. 2019, *Statistical covariance realism assessment of LeoLabs' OD system* (AMOS) | Overlap analysis: d² between overlapping propagated states of one object (self-consistency, not independent truth), 7 days; scaling factors from 11 reference satellites; 95.2 % of d ≤ 4 | R (sections 1–3) |
| Hesar, Duncan & Pawloski 2018, *Realistic covariance generation for the GPM spacecraft* (NTRS 20180003438) | Linear propagation plus process noise, inflation factor tuned to predictive-minus-definitive errors, GOF tests (GPM, 407 km) | A (+ intro) |
| Lilly-Salkowski 2017, *Filter tuning using the chi-squared statistic* (NTRS 20170003685) | EKF tuning for Aqua/Aura by the d² distribution at 47 h | A (+ intro) |
| Carpenter 2019, *Covariance realism is not enough* (AAS 19-605; NTRS 20190032049) | "Realistic" has usually meant "larger"; oversized covariances cause false alarms; fusion of sources and interval estimates of miss distance | A (+ introduction) |
| Hejduk 2016, *Covariance manipulation for conjunction assessment* (NTRS 20160010497) | Scaling, PcMax, covariance forecasting judged against risk-management principles | A |
| Horwood, Aristoff, Singh, Poore & Hejduk 2014, *Beyond covariance realism* (SPIE 9092, doi:10.1117/12.2054268); Poore et al. 2016, *Covariance and uncertainty realism in SST* (working-group report, DTIC AD1020892) | Realism metrics (d², its χ² tests, uncertainty realism beyond Gaussian) | M |
| Vallado & Seago 2009, *Covariance realism* (AAS 09-304) | Survey of covariance realism practice | M |
| Osweiler 2006 (AFIT thesis); Flohrer, Krag & Klinkrad 2008 (AMOS); Geul, Mooij & Noomen 2017 (ASR, doi:10.1016/j.asr.2017.02.038); Thompson et al. 2019 (AMOS) | Element-set covariance from differences of element sets (scored in E2/E2b: overconfident) | as in E2b: Thompson R, others M |
| Canal, Cano, Martínez & Hernández 2026 (Acta Astronaut., doi:10.1016/j.actaastro.2026.01.063) | Covariance estimation and fusion for ephemeris-only catalogues, applied to the SP catalogue | M |
| Palmer 2024, stochastic drag model for uncertainty realism of LEO predictions (JAS, doi:10.1007/s40295-024-00441-y) | Drag noise model for realism | M |
| Dyreby, Caldas & Soares 2025 (arXiv:2510.11242) | Quality of SpaceX's published Starlink ephemerides against numerical propagation | A |
| E2, E2b, E6 (this repository) | E2: OMM-difference covariance 100–300× overconfident on GPS; E2b: measured-error T0 consistent only in SLR-LEO at some horizons, heavy tails; E6: laser-range fits' formal covariance 16–21× overconfident, OMM-history HPOP fits realistic (0.68–0.83) | R |
| E13 (branch `task/e13-open-dca-20261010`) | SpaceX stated vs realised start mismatch: first sample 5–10× pessimistic at 6.5 h | R |

**What is known.** Realism testing by d² against χ²₃ per propagation bin,
CvM, outlier removal, and tuning by process noise, consider parameters or
scale factors are standard practice (Zaidi & Hejduk; CARA handbook; Hesar;
Cano). The DoD's DCP exists and its CDM fields are public, but its numbers
are not ("y-axis omitted to allow full releasability"). Driver-forecast
uncertainty has been propagated to Pc in simulations (Bussy-Virat; Parker;
Gondelach). LeoLabs' realism was checked against itself.

**What this experiment would add (claims hold only if the results do).**

1. *A held-out test.* In every work above that tunes covariance on real
   data, the correction is fitted and assessed on the same ephemerides, or
   checked only for self-consistency. Here every factor, noise density and
   consider variance is fitted on a development window and scored once on a
   later window.
2. *Every public source, one footing.* Operator ephemerides (two operators,
   fleet scale), element sets, HPOP products and the DCP, all scored against
   independent precise orbits (or fresh operator orbit determinations for
   operator files), in one regime × horizon table with one rule.
3. *An open DCP.* The density-forecast consider term derived only from
   public issued forecasts (NOAA SWPC RSGA) and observed drivers (GFZ),
   mapped through NRLMSISE-00, with the 5/9-3/9-1/9 weighting generalised to
   any horizon, published as numbers, and validated against independent
   densities (Swarm, GRACE-FO) and LEO orbits on held-out data. No published
   DCP values or open validation of one were found.
4. *Public operator covariance factors by horizon.* Calibration factors for
   SpaceX's and Planet's stated covariance, published per horizon (novelty
   audit item 3: E13 measures one horizon).

## 3. Definitions

**Error and d².** For a product's prediction x̂ at target time t and truth
x: e = r̂ − r (position, m) in the RTN axes of the prediction (R radial,
N orbit normal, T = N × R). d² = eᵀ(P + P_truth)⁻¹e with P the product's
3 × 3 position covariance in the same axes and P_truth the truth's stated
covariance (the CARA handbook's combined form). Zero mean is assumed, as
conjunction assessment assumes it.

**Cell statistics.** n, objects, mean d²/3 with a 95 % cluster-bootstrap
interval (objects resampled; 2000 resamples; seed 20261010), the 95 %
coverage (share of d² ≤ 7.8147, the χ²₃ 0.95 quantile) with its interval,
the CvM W² of F_χ²₃(d²) with the design effect (E2's statistics), per-axis
mean and RMS of z = e/σ (the bias Halpin et al. test per axis), the energy
score in metres (Gneiting & Raftery 2007; 200 draws; sharpness, Carpenter's
point), the log score, the median predicted σ per axis, and the share of
samples removed by the manoeuvre screen (section 8).

**Cell decision.** A cell is *testable* when it has at least 30 samples from
at least 3 objects; otherwise INSUFFICIENT. A testable cell is REALISTIC when
mean d²/3 ∈ [0.8, 1.25] and 95 % coverage ∈ [0.93, 0.97] (point estimates,
E2's bounds for these two quantities); otherwise NOT REALISTIC, stated as
overconfident (mean d²/3 > 1.25) or pessimistic (< 0.8).

**Regimes** (from the product's elements at its reference time: for element
sets the un-Kozai'd mean motion, for states the osculating elements):
HEO if e ≥ 0.25; otherwise by mean altitude a − R_E (WGS-72 for element
sets, WGS-84 for states): LEO-L below 500 km, LEO-M 500–800 km, LEO-H
800–2000 km, MEO 2000–30000 km, GEO 30000–40000 km. Objects above 40000 km
with e < 0.25 are counted and not scored.

**Horizons.** τ ∈ {0, 0.5, 1, 2, 3, 5, 7} days from the product's reference
time: the element set's epoch (S3), the element set's epoch for the HPOP
product's epoch state (S2), the older file's first state (S1). For S2 and S3
the target is the first truth epoch at or after reference + τ, within the
truth's sampling interval (E2b's rule). For S1 the target is the newer
version's first state, and pairs are binned by their separation: 0.25
[0.17, 0.375), 0.5 [0.375, 0.75), 1 [0.75, 1.5), 2 [1.5, 1.95] (Starlink, to
stay before its 48-h join), 3 [2.5, 3.5), 5 [4.5, 5.0] (Planet).

## 4. Covariance models by source

Every model and every factor is fitted on dev-fit, chosen on dev-select
(section 7), frozen in `results/e14/selection.json` as fitted on dev-fit
(changes before the freeze), and scored once on test.
Each frozen model carries a calibration version (`e14-<source>-<sha256 of
its selection entry, 12 hex>`).

### S1 — operator ephemerides with covariance

- **SpaceX Starlink.** Truth: the newer version's first state (a fresh
  orbit determination), its stated covariance added. Pairs come from
  (a) E13's collector (`/opt/data/sdn-archive/e13-open-dca`, read only):
  consecutive versions, 6–15 h apart, stated σ per axis only (d² from the
  diagonal covariance, stated as such); and (b) this experiment's collector
  for horizons beyond E13's, on satellites outside E13's and E11's samples
  (section 6), keeping the full 3 × 3 UVW position covariance.
- **Planet.** `<hwid>_oem.txt`: EME2000 states at 60 s for five days with a
  covariance block, replaced in place about every 12 h. Truth: the newer
  version's first state. Collected by this experiment (section 6).
- **Candidates.** S1-0: the stated covariance. S1-K: a scalar factor k(h)
  per operator and horizon bin by maximum likelihood (k² = mean d²/3 on
  dev-fit). S1-A: per-axis factors (s_R, s_T, s_N)(h) by maximum likelihood
  on the RTN-standardised errors (Halpin et al.'s diagonal of C_SE). A
  horizon bin without dev samples takes the factors of the nearest shorter
  bin that has them.
- No sample is removed for manoeuvres: planned manoeuvres are part of the
  operator's product. Pairs whose older file does not cover the newer start
  are not pairs.

### S2 — HPOP products

The catalog's HPOP screen product: the GCRF state at an element set's epoch
(`analysis/epoch-state`, as the CA paper's screen), propagated by
`propagator/hpop` 1.2.0's execution path with the full force model (EGM2008
70 × 70, Sun and Moon from DE440, SRP cannonball with conical shadow,
NRLMSISE-00 drag on the space weather public at the element set's creation,
IERS 2010 solid tides, relativity; `harness/cutoff-environment.mjs` for the
drivers as issued). B (Cd·A/m) from the element set's B*, Cr·A/m from the
object class, as E7.

- P(t) = Φ P₀ Φᵀ + Φ_c P_c Φ_cᵀ + Q(q) (+ P_DCP(t) in LEO, S4).
- P₀: per regime, the second moment about zero of the HPOP state's error
  against truth at its first truth epoch after the set's epoch, dev-fit,
  clipped at 5 robust σ (`gp-error-model hpop_coverage` mode `epoch`).
- Consider: B with σ_B/B from dev-fit (the spread of the object's B* over the
  30 days before the set, Hejduk's frontal-area DCP in spirit; LEO only),
  through HPOP's B sensitivity columns.
- Q: white-acceleration spectral densities (q_R, q_T, q_N) per regime by
  maximum likelihood on dev-fit (`hpop_coverage` mode `fit`, discretization
  600 s), with P₀, consider and DCP in place.
- **Candidates.** S2-P0 (P₀ only), S2-Q (P₀ + Q), S2-QC (P₀ + consider B +
  Q), S2-QCD (S2-QC + DCP, LEO; elsewhere S2-QC).

### S3 — element-set objects

SGP4 from the element set (as the CA screen uses it), with a synthesized
covariance.

- **T(regime, age)**: E2b's T0 product re-measured on E14's regimes: per
  regime and age bin (bins centred on the horizons: [0, 0.25), [0.25,
  0.75), [0.75, 1.5), [1.5, 2.5), [2.5, 4), [4, 6), [6, 8) days), the 6 × 6
  RTN second moment about zero of SGP4 errors against truth on dev-fit
  (manoeuvre-screened), clipped at 5 robust σ per component (the
  `gp-error-model` rule), interpolated linearly in age between bin centres.
- **Candidates.** S3-T: T. S3-TU: the unclipped second moment. S3-KC:
  k²(regime, age)·T with k² such that the dev-fit 95 % coverage is 0.95.
  S3-KO: κ_obj²·S3-KC, κ_obj² the object's own mean of dᵀS(g)⁻¹d/3 over its
  consecutive-set differences d created in the 30 days before the set
  (S(g) the regime's dev-fit difference second moment in gap bin g),
  shrunk toward 1 with weight n/(n + 8) (E2b's K1o with shrinkage).
- **Baseline** (descriptive): E2b's frozen train T0 for E2b's own objects
  (`results/e2b/train/products.json`).

### S4 — the open DCP

1. **Forecast errors.** For each RSGA issue (22:00 UTC, day d): predicted
   F10.7 and Ap for days d+1..d+3; for days d+4..d+7 the day-3 values held
   (what a chain without a longer forecast does). Observed: GFZ's F10.7 and
   ap/Ap. The 81-day centred F10.7 mean is held at the issue's last observed
   value.
2. **Density error by lead.** δ_k = ln ρ(forecast drivers) − ln ρ(observed
   drivers), NRLMSISE-00 (`propagator/atmosphere`), averaged over a fixed
   grid (latitude −80..80° by 20°, longitude by 45°, eight 3-hour times of
   day) at the regime's altitudes (LEO-L 420 and 480 km, LEO-M 550, 650,
   750 km, LEO-H 850, 1000, 1300 km), per lead day k = 1..7: Hejduk's
   global density error.
3. **Lead covariance.** C_δ (7 × 7) per altitude and forecast class (the
   issue's maximum predicted Ap over days 1–3: < 15, 15–29, ≥ 30), from
   issues 2024-01-01 to 2026-02-15 (history plus dev-fit), shrunk toward its
   diagonal by a factor chosen on dev-select (0, 0.5 or 1).
4. **Mapping (WASM).** For a prediction starting at issue time t_i, the
   effective constant density error over [t_i, t] has variance
   σ_eff²(t) = wᵀ C_δ w with w_k(t) = 2 ∫_{day k ∩ [t_i, t]} (t − s) ds / (t − t_i)²
   (at three days: 5/9, 3/9, 1/9, Hejduk's weights). The consider covariance
   is P_DCP(t) = σ_eff²(t) g(t) g(t)ᵀ, g(t) = B ∂x(t)/∂B from HPOP's
   sensitivity columns, from the issue time (the DCP applies only forward
   of the present, Hejduk 2019).
5. **Published fields.** σ_eff at each output epoch and g (the CDM's DCP
   density forecast uncertainty and sensitivity vectors), so a screen can
   decorrelate two LEO objects (Casali et al. 2018).
6. **E13's open-DCA residuals**, when they exist, enter as the nowcast
   density error of the epoch part, by amendment.

## 5. Independent truth

Converted by `analysis/reference-states` (GCRF, UTC, stated σ) unless
noted.

| Regime | Objects (truth) |
| --- | --- |
| LEO-L | Swarm A, B, C (ESA SP3xCOM, 10 s); GRACE-FO 1, 2 (GFZ RSO, 30 s) |
| LEO-M | Sentinel-1A, 1C, 1D (POEORB, 10 s); COSMIC-2 (the five FM satellites the archive identifies; UCAR leoOrb, 60 s); CryoSat-2, SARAL (DORIS SSA, 60 s); LARETS, Stella (NSGF, 2–3 min) |
| LEO-H | Starlette, WESTPAC, Ajisai, LARES (NSGF); Sentinel-3A, 3B, Sentinel-6A, 6B, Jason-3, SWOT, HY-2C, HY-2D (DORIS SSA) |
| MEO | GPS (ESA0OPSFIN, IGS0OPSFIN fallback); LAGEOS-1, -2, ETALON-1, -2 (ILRS combined); LARES-2 (NSGF) |
| GEO | BeiDou GEO and QZS-3 from an IGS MGEX final orbit product, if converted before the selection commit; otherwise INSUFFICIENT |
| HEO | MMS 1–4 definitive ephemerides (NASA), if a converter lands before the selection commit; otherwise INSUFFICIENT |

S1 truth is the operator's own fresh orbit determination (section 4). A
truth epoch whose radius departs from its neighbours' mean by more than
10 km is dropped (E2b's screen).

## 6. Collection for S1

One process, RAM only. Raw operator files are never written to disk (owner
law, 2026-07-16 and 2026-10-10). Each version is fetched, parsed, decimated
in memory to its states and covariances at whole multiples of 10 minutes
from its start, and dropped; the decimated copy is kept in memory for 2.5
days (Starlink) or 5.5 days (Planet), then dropped. When a newer version of
a satellite arrives, each retained older version that covers the newer
start gives one pair; the pair statistics (separation, RTN mismatch, both
covariances in RTN, d² combined and older-only, per-axis z, regime, the two
versions' names and SHA-256) are appended to
`/opt/data/sdn-archive/e14-covariance-realism/pairs.jsonl` (derived
statistics only; never committed).

- Starlink: 100 satellites drawn with seed 20261014 from the manifest,
  excluding E13's 324 and E11's 150 (no file E13 or E11 fetches is fetched
  here); every new version, one request at least 6 s apart; manifest
  hourly with a conditional GET.
- Planet: every satellite in `planet_mc.tle`; each `<hwid>_oem.txt` polled
  every 3 h with a conditional GET, one request at least 6 s apart.
- A provider is disabled for the run at its first 403 or 429; one retry
  after 60 s on 5xx; the run pauses while /opt/data has less than 30 GiB
  free; it stops at 2026-10-24T00:00Z.

## 7. Windows and the guard

| Window | Span | Use |
| --- | --- | --- |
| history | issues 2024-01-01 – 2025-09-30 | S4 forecast errors only (no truth read) |
| dev-fit | 2025-10-01 – 2026-02-15 | every fitted number |
| dev-select | 2026-02-16 – 2026-04-30 | the choice among candidates |
| test (locked) | 2026-05-01 – 2026-09-30 | read once, after the freeze |
| S1 dev-fit | newer start before 2026-10-13T12:00Z | S1 factors |
| S1 dev-select | newer start 2026-10-13T12:00Z – 2026-10-15T00:00Z | S1 choice |
| S1 test (locked) | older start from 2026-10-15T00:00Z, newer start before 2026-10-24T00:00Z | read once |

A sample belongs to a window only if both its reference time and its target
time lie in it (a dev sample never reads test-window truth). Each regime's
test window ends where its truth ends; the counts say where.

**The guard** (`windows.mjs`, E13's pattern, Deviation D1 closed): every
step that reads truth, collected pairs or samples for a test window calls
`assertWindowReadable`. It refuses unless `config.json` has
`"frozen": true`, and `config.json`, `PLAN.md`, `amendments.json` (if
present) and `results/e14/selection.json` are committed and unchanged in the
checkout. The dev windows are always readable. `test/e14-windows.test.mjs`
proves each refusal on a scratch git repository. The truth readers check
the span they load: a span reaching into a test window needs the guard.

## 8. Analysis plan

**Samples.**
- S3: every element set (Space-Track `gp_history`, SGP4 theory, epochs
  within 1 s merged, E2b's rules) of every truth object, each horizon once;
  error by `gp-error-model common_epoch` (origin the truth state).
- S2: one element set per object every 3 days (the first set created on or
  after 00:00 UTC of every third day, seed-free), up to a compute cap of 12
  CPU-hours per window (when the cap binds, every second anchor is dropped,
  then every third, until it fits; the counts say so).
- S1: every pair (section 6; E13's for Starlink at 0.25 and 0.5 d).

**Manoeuvre screen (S2, S3).** `analysis/maneuver-detection
detect_maneuvers` (default thresholds, E7/E8's rule) on each object's
element-set history; a sample is removed when a detection lies in
[reference − 1 d, target]. The screen uses element sets only, never the
truth errors. Every cell is also reported with all samples (descriptive).

**Statistics.** Section 3, per source, candidate, regime and horizon, on
dev-fit, dev-select and test. Probability of collision effect (descriptive):
E2b's `screening_cases` on 500 pairs of samples of different objects per
cell (hard body 20 m, alert 1e-4, misses 0–5000 m, head-on and crossing).

**Choice on dev-select** (per source): the candidate with the most REALISTIC
testable cells; ties go to the lower mean energy score over those cells;
then to the simpler (the order listed in section 4). For S4 the shrinkage
factor is chosen by the same rule on S2-QCD's LEO cells.

**Test, once**: the chosen candidates, every cell; also every other
candidate (descriptive).

## 9. Hypotheses

Each is decided by its own rule; no family-wise correction. "Testable cells"
are those testable on test.

| ID | Statement | Supported if |
| --- | --- | --- |
| H1 | S3's chosen model is realistic | every testable S3 cell REALISTIC; *partly* if at least 75 % are |
| H2 | S2's chosen model is realistic | the same rule on S2's cells |
| H3 | S1's chosen factors make operator covariance realistic | the same rule per operator |
| H4 | Calibration fitted on dev transfers to later data | per source, the chosen candidate has more REALISTIC test cells than its uncalibrated base (S1-0, S2-P0, S3-T), and lower median \|ln(mean d²/3)\| over the testable cells |
| H5 | The open DCP improves LEO realism under forecast storms | LEO S2 test samples whose issue predicted Ap ≥ 30 on any of days 1–3, or whose span had an observed Ap ≥ 30: \|ln(mean d²/3)\| of S2-QCD below S2-QC's, the cluster-bootstrap 95 % interval of the difference excluding 0 (at least 30 samples, 3 objects; otherwise INSUFFICIENT) |
| H6 | The DCP's density error is calibrated against independent densities | test days, Swarm A/B/C and GRACE-FO densities (ESA DNS): z = (ln ρ_obs − ln ρ_NRLMSISE(forecast drivers)) / sqrt(σ_m² + σ_δ,k²) by lead day k = 1..3, σ_m the model's dev σ with observed drivers: share with \|z\| ≤ 1.96 in [0.93, 0.97] at every lead |
| H7 | Starlink's stated covariance is pessimistic in-track up to a day | dev and test, S1-0: mean z_T² < 0.8 at 0.25, 0.5 and 1 d (E13's first sample: 5–10× pessimistic) |
| H8 | Known answer (section 9a) | every recovery within its tolerance |

Descriptive, not hypotheses: GEO and HEO (if their truth lands), the S3
baseline, the all-samples cells, the Pc effect.

### 9a. Known-answer test

Before any real sample is scored, `test/e14-known-answer.test.mjs` runs the
modules on synthetic data with known answers:
1. Errors drawn from a known 3 × 3 covariance C (correlated, anisotropic):
   the realism statistics of C itself give mean d²/3 within 2 % of 1 and
   95 % coverage within 0.01 of 0.95 (n = 20000); of 4C, mean d²/3 within
   2 % of 0.25.
2. `fit_calibration` recovers a known scalar factor and known per-axis
   factors within 2 %, and the coverage-matched factor within 3 %.
3. `calibrate_covariance` returns k²T rotated to GCRF; rotating back gives
   k²T to 1e-12 relative, and a cell's version and status are carried.
4. The process-noise MLE (`hpop_coverage fit`) recovers a known q from
   errors simulated as A + qU (A and U known) within 10 %.
5. `dcp_covariance`: w at 3 days is (5/9, 3/9, 1/9) to 1e-12; for errors
   simulated with a known lead covariance, the realised along-track
   variance matches σ_eff² g gᵀ within 3 %.

## 10. Modules (WASM)

Added to `analysis/gp-error-model` (branch `task/covariance-models-20261010`,
new source file `covariance_realism.cpp`), with tests and tri-runtime parity
(browser, WasmEdge, Docker WasmEdge):

| Method | Inputs → output | Use |
| --- | --- | --- |
| `pair_statistics` | predicted and truth states (inertial) with covariances (inertial, RTN or UVW) → RTN error, both covariances in RTN, d² (combined, predicted only), per-axis z | S1 pairs; S2 and S3 samples |
| `fit_calibration` | samples (stratum, RTN error, RTN covariance) and a method (`scalar-mle`, `axes-mle`, `coverage`) → factors per stratum with counts | S1, S3 factors |
| `calibrate_covariance` | a frozen model (S1 factors, S3 T and k², or S2 terms), objects (state, epoch, reference time, native covariance if any) → calibrated 6 × 6 covariance in RTN and inertial axes, its cell, version and status | catalog products, the CA screen |
| `dcp_covariance` | lead covariance C_δ, issue time, output epochs, sensitivities g → σ_eff, weights, P_DCP | S4 |
| `noise_responses` | one propagation's STM at every step end of HPOP's process-noise discretization → the unit white-acceleration responses U_R, U_T, U_N at the targets | S2 (one HPOP run per anchor instead of four) |

Existing methods used: `common_epoch`, `map_covariance`, `hpop_arcs`,
`hpop_coverage` (P₀ and Q), `screening_cases`; `propagator/atmosphere`
NRLMSISE-00; `propagator/hpop` 1.2.0; `analysis/epoch-state`;
`analysis/maneuver-detection`; `foundation/frames`. JavaScript here only
moves records, converts units at the boundaries, dispatches, and computes
statistics on module outputs.

## 11. Outputs for the catalog and the CA screen

- `results/e14/models/`: one frozen model per source with its calibration
  version: S3 as a `gp-error-model` model (regimes, age bins, per-stratum
  RTN covariance), which the CA screen already reads (`uncertainty_model`
  frame, CAU1); S1 and S2 as factor and term tables.
- `results/e14/<window>/realism.json` and `README.md`: the regime × horizon
  tables per source and candidate (generated from metrics, never typed).
- OCM covariance blocks: `calibrate_covariance` writes COVARIANCE_DATA in
  RTN (`RSW`) at the OCM's state epochs, `COV_CALIBRATION Calibrated` with
  `COV_CALIBRATION_REFERENCE` naming the E14 test table row only when every
  regime × horizon cell the OCM spans passed on test (otherwise
  `Uncalibrated`), and, in LEO, the DCP's σ_eff and sensitivity vectors as
  user-defined parameters.

## 12. Compute, data and licences

At most three processes of this experiment at once (the S1 collector is one;
it is network-bound). Before each heavy step the load average is read; above
40 the step waits. Element sets, per-sample tables and operator data are
never committed (`runs/`, `/opt/data/sdn-archive/e14-covariance-realism`).
Results use every dataset read; `data/licenses.json` records each source and
step 95 lists E14's. Planet (CC BY-NC 4.0), GFZ Kp (non-commercial) and
SpaceX files are used for results only. `/opt/data/sdn-archive/.secrets` is
never read; the AstroStds notes are not used.

## 13. Threats to validity

- **The test window is quieter.** Dev holds the storms of 2025-11-12 (Kp
  8.7), 2026-01-19/20 (Kp 8.7) and 2026-03-21/22 (Kp 7); test holds
  2026-07-04 (Kp 7) and minor ones; F10.7 falls from about 140 to 106.
  H5 may be INSUFFICIENT.
- **E2b's test window (2026-07-01 – 09-15) was read** when this plan was
  written; its products (T0, K1, K1o) were scored there. E14's products,
  regimes and factors are new and were not scored on any test sample.
- **Truth objects are not debris.** S3's realism is measured on active,
  well-tracked satellites and passive spheres; debris may differ. S3-KO is
  the attempt to transfer by each object's own consistency.
- **Few independent objects** in LEO-L (Swarm A and C fly together, as do
  GRACE-FO 1 and 2) and in MEO outside GPS; intervals are wide.
- **Operator truth is the operator's own orbit determination.** The newer
  file's start shares the operator's force model and tracking; S1 measures
  consistency with the operator's next solution, which is the best public
  truth for these satellites.
- **E13's pairs carry only the diagonal of the stated covariance.**
- **Heavy tails.** A Gaussian covariance meets both criteria only if the
  normalized errors are near-Gaussian; mixtures of objects of different
  accuracy (E2b) can satisfy one criterion and not the other.
- **S1's windows are days long** and start with this plan; S1 test results
  arrive after 2026-10-24.

## 13a. Order of work

1. This plan; the guard and its test; the known-answer test.
2. Modules (section 10) with their tests and parity.
3. The S1 collector started.
4. Dev: S3, S4, S2, S1 (dev-fit, dev-select); the choice.
5. Freeze: `config.json` `"frozen": true` and `results/e14/selection.json`
   committed. Then each test window, once.

## Changes to the draft before the freeze

Dated, with their reasons. None follows from a test-window result (none has
been read). Development results that informed a change are named.

- **2026-10-10, the manoeuvre screen.** `detect_maneuvers` reports drag steps
  as `ORBIT_LOWERING` (its README: the 2024-05-10/11 storm registers so).
  Screening them would remove the storm samples the DCP is meant for, so
  `ORBIT_LOWERING` events are not screened; every other characterization is.
- **2026-10-10, S4 altitudes.** `propagator/atmosphere` evaluates NRLMSISE-00
  up to 1000 km, so the LEO-H altitudes are 850 and 1000 km (objects above
  1000 km use 1000 km; drag there is negligible).
- **2026-10-10, S2 in practice.** One 7-day full-force run took about 31 s at
  70 × 70 with ocean tides, 10 s at 36 × 36 without them (Swarm A). S2 uses
  EGM2008 36 × 36, Sun and Moon, cannonball SRP, NRLMSISE-00 drag on released
  drivers (LEO only; above LEO no drag), IERS 2010 solid tides and relativity;
  no ocean tides or Earth radiation, which the catalog's 1.3.0 profile has.
  B from B* and Cr·A/m 0.02 m²/kg are the catalog run's own assumptions (B
  0.01 m²/kg where B* ≤ 0). Anchors are one per object every 6 days (was 3).
  P₀ is S3-T's age-0 stratum: the same quantity `hpop_coverage` mode `epoch`
  measures (the epoch state's error at the first truth epoch), from the S3
  samples. Each anchor is one run with P₀, one dynamic parameter (Cd·A/m in
  LEO, Cr·A/m above, σ(ln) 0.2) and its STM at every step end of HPOP's
  noise discretization; `noise_responses` (new) gives the three unit noise
  responses from that STM. Against HPOP's own `PROCESS_NOISE` on a Swarm A arc
  at 1.3 days they agree within 2.1e-3 (R), 2.3e-5 (T), 4.1e-4 (N).
- **2026-10-10, S1 regimes from E13.** E13's pair records hold no state; their
  regime is from the newer start's geodetic altitude.
- **2026-10-10, H6's σ_m** is the per-satellite root mean square about zero of
  the daily ln(ρ_obs/ρ_NRLMSISE(observed drivers)) over dev-fit (the model's
  bias included: a zero-mean consider term carries it). Density truth for
  dev-fit is E13's converted copy of the ESA products; in the test window
  Swarm's densities on disk end 2026-07-31 and GRACE-FO's 2026-04-30.
- **2026-10-10, S1's selection is committed on its own.** S1's development
  window ends 2026-10-15, after the others'. The guard opens `test` only
  when `selection.json` names S2, S3 and S4, and `s1:test` only when it also
  names S1 (`windows.mjs`, `test/e14-windows.test.mjs`).
- **2026-10-10, no refit on the whole development window.** Section 4 said
  the chosen candidate is refitted on dev-fit and dev-select together. S2's
  samples carry dev-fit's P₀ (S3-T) and lead covariance (S4), so a refit
  would need them recomputed; for one footing every source's frozen model is
  its dev-fit fit, and dev-select only chooses.
- **2026-10-10, module additions.** `pair_statistics` takes ephemeris samples
  (Lagrange at an epoch) and a covariance as weighted terms; `noise_responses`
  is new (section 10).
- **2026-10-11, GRACE-FO truth and S2's P₀ file.** GRACE-FO 1 and 2 (GFZ RSO)
  were converted for the development windows after S3's first fit and S2's
  first dev-fit runs. S3 is refitted and rescored with them. S2's P₀ stays
  the S3-T age-0 stratum of the first fit, kept as
  `results/e14/dev/s3-models-s2p0.json` (the file those runs read, SHA-256
  731495b6…), so every S2 window uses one P₀; LEO-L's age-0 stratum differs
  from the refit's only by the two GRACE-FO objects. Daily space weather is
  passed only with drag (commit 5e304f7), so dev-fit's MEO anchors, which
  the first runs lost to that refusal, are rerun.
- **2026-10-11, the truth's covariance in S2's d².** S2's scoring adds the
  truth product's stated σ (isotropic) to the combined covariance, as
  section 3 defines d² and as S3's scoring does.

## References

- Bussy-Virat, C. D., Ridley, A. J., Getchius, J. W. (2018). Space Weather
  16, 519–537. doi:10.1029/2017SW001705.
- Cano, A., Fernández, S., Pastor, A., Escobar, D. (2021). Improving
  orbital uncertainty realism through covariance determination in GEO. AMOS.
- Carpenter, J. R. (2019). Covariance realism is not enough. AAS 19-605
  (NTRS 20190032049).
- Casali, S., Hall, D., Snow, D., Hejduk, M., et al. (2018). Effect of
  cross-correlation of orbital error on probability of collision
  determination. AAS 18-272 (NTRS 20220004548).
- Gneiting, T., Raftery, A. E. (2007). JASA 102, 359–378.
- Halpin, J. F., Auman, K. M., Toumey, E. W. (2026). Effects of covariance
  realism on probability of collision for operational missions. AAS/AIAA
  ASC (NTRS 20260005829).
- Hejduk, M. D. (2019). Three CA-related covariance issues and their
  solutions. CNES CA workshop (NTRS 20190026790).
- Hejduk, M. D., Snow, D. E. (2018). Space Weather 16.
  doi:10.1029/2017SW001720.
- NASA (2026). Spacecraft Conjunction Assessment and Collision Avoidance
  Best Practices Handbook, Vol. 2, NASA/SP-20205011318/REV2-VOL2 (NTRS
  20260000457).
- Park, I., Stevenson, M., Nicolls, M., Lu, E., et al. (2019). Statistical
  covariance realism assessment of LeoLabs' orbit determination system.
  AMOS.
- Parker, W. E., Freeman, M. P., Chisham, G., Kavanagh, A. J. (2024).
  Space Weather. doi:10.1029/2023SW003818.
- Zaidi, W. H., Hejduk, M. D. (2016). Earth Observing System covariance
  realism. AIAA 2016-5628 (NTRS 20160010501).
- The other works of section 2 as cited there; E2, E2b, E6 and E13 of this
  repository.
