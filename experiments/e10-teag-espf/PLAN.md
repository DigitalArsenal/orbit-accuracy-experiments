# E10 — TEAG and the Epistemic Support-Point Filter, implemented independently and tested

Plan. Status: **frozen** by the commit that sets `"frozen": true` in
[`config.json`](config.json); that commit's SHA is recorded in every later run
manifest. Until then the code refuses every test seed and test window
(`common.mjs`, `assertReadable`). Before the freeze only dev data were read:
the dev smoke scenario (the Part B orbit at the dev epoch 2026-07-01, noise
seed 1), visibility checks of the Part B orbit (dev epoch) and of the paper's
LEO and GEO cases (`steps/06-visibility.mjs`), and ESPF-2026 diagnostics on the
dev smoke scenario that led to the disclosed option in section 2 (κ). The
choices of section 5 are made by its rules on dev runs made after the freeze.

Lane: claude-espf. Branch `task/e10-teag-espf-20261009` (from main `4a741b1`).
Modules: space-data-network-modules branch `task/teag-espf-20261009` (from main
`095c20a6`; not landed; module code as of `2c6ed85c`, later commits on the
branch add only receipts): `analysis/estimation` (estimators `ESPF_2025`,
`ESPF_2026`, `ELLIPSOIDAL_SET_MEMBERSHIP`; method `evaluate_teag`; the spec
`analysis/estimation/docs/espf-spec.md`), `analysis/conjunction-assessment`
(`possibility_of_collision`); unchanged: `propagator/hpop` `0d1f6264`,
`analysis/observation-simulator`, `analysis/access`, `analysis/epoch-state`,
`foundation/frames`, `foundation/time`, `data-source/eop-parser`. The modules
commit is in every run manifest.

## 1. Question

The SDN catalog whitepaper (`whitepapers/evidence-supported-aso-catalog.md`
§5, §9, §12) proposes the Theory of Epistemic Abductive Geometry (TEAG) and the
Epistemic Support-Point Filter (ESPF) for admissible-set inference,
OMM-seeded initial-condition uncertainty and possibility/necessity screening,
and asks (§9) for the bound construction, the support resolution, the handling
of outliers and inconsistent evidence and of model mismatch, a comparison with
probabilistic and bounded-set baselines on independent cases, and a statement
whether published bounds conservatively enclose admissible trajectories or
only summarize sampled support. One of the method's authors co-authors the
whitepaper; no public implementation exists. E10 implements the methods from
their papers (spec, gaps and choices: `docs/espf-spec.md`), chooses and scores
its own cases, and asks:

1. **Accuracy.** Is the ESPF's point estimate as accurate as the EKF, UKF,
   batch least squares and an ellipsoidal set-membership filter, on synthetic
   cases with known truth (Part B) and on real orbits against precise orbits
   (Part C)?
2. **Containment.** Does the truth lie inside each method's published set,
   α-cut or covariance region at the level it declares?
3. **Enclosure.** Do the ESPF's bounds enclose the admissible trajectories, or
   only summarize the sampled support?
4. **Mismatch and outliers.** Does the ESPF's surprisal detect an unmodelled
   manoeuvre or area change sooner than the UKF's normalized innovation, at
   what false-alarm rate, and how do the filters behave under outliers?
5. **Cost.** HPOP calls and time per arc.
6. **Screening (Part D).** Possibility and necessity of collision against
   Foster's probability on synthetic encounters: missed collisions and false
   alerts.

and reproduces, descriptively, the 2025 paper's LEO and GEO cases (Part A).

## 2. Variants

| ID | Estimator (`analysis/estimation`) | Settings |
| --- | --- | --- |
| E25 | `ESPF_2025`: the 2025 operational form (arXiv 2508.20806) as stated | Smolyak level 2 (13 points), r = 3, λ_t = 0.05, the unstated gains neutral (spec G13) |
| E25T | `ESPF_2025` with spread-keeping regeneration and the temporal decay chosen on dev | ζ = √n (`regeneration_scale`, spec G16); λ_t ∈ {0.05, 0.005, 0} (section 5) |
| E26 | `ESPF_2026`: the canonical form of the 2026 papers | Smolyak level 3 (85 points), r₀ = 3, k_w = k_y = 1, σ ∈ [0.1, 1], r₊ = 1.15, r₋ = 0.97, N_min = 13, κ chosen on dev ∈ {1, 0.5} (section 5) |
| EKF | `EXTENDED_KALMAN_FILTER`, nonlinear propagation, provider STM | 3σ editing (`sigma_edit_threshold` 3) |
| UKF | `UNSCENTED_KALMAN_FILTER` | α = 1, β = 2, κ_UT = 0; 3σ editing |
| BLS | `fit_batch`, state only, the whole arc in one fit | a priori P₀, ≤ 20 iterations, correction tolerance 1e-3, 3σ editing |
| SMF | `ELLIPSOIDAL_SET_MEMBERSHIP` (Schweppe 1968; Bertsekas and Rhodes 1971) | initial, process and measurement bound scales 3; minimum-trace member |

Every support point, sigma point and STM is propagated by `propagator/hpop` at
full force through the estimation module's inverted propagator port; every
sequential filter takes one observation per request and carries its posterior
(state and covariance, or the ESPF support state) to the next request
(`filters.mjs`). All sequential filters use the same state-noise compensation:
white acceleration with spectral density q = 1e-10 m²/s³ on each GCRF axis
(set-based filters take the process set k_w²Q). Settings not listed are the
module defaults recorded in `config.json`.

*Pre-freeze change, disclosed:* on the dev smoke scenario E26's information
content saturated at 1 − e⁻¹ (S̄ ≤ 1 by construction), which fixes the PCRB
floor at −3; the realised contraction (about −2.2 per step) never reached it,
so σ only contracted and the support collapsed. The papers say expansion
triggers as the contraction "approaches" the floor without a value (spec G18).
The module gained `pcrb_trigger` κ (expand when ½Δlog det ≤ κ × floor);
κ = 1 is "reaching". E10 chooses κ on dev (section 5). Reading the 2025 code
path for the enclosure test showed that its regeneration (§10.5, ζ undefined;
ζ = 1 in the module) places points whose 1/(2n) spread is σ²Π/n, so the
support shrinks n-fold every cycle before any evidence (spec G16); the module
gained `regeneration_scale` ζ, and E25T uses ζ = √n, the reading under which
the regenerated points keep the spread they were built from. The module also
gained `LINEAR` records in the ESPF and set-membership filters (the core
filters already took them), for the RTN pseudo-observations of Part C.

## 3. Cases and data

### Part B — synthetic, known truth (primary)

Orbit: 600 km circular, 28.5° (GCRF [6978137, 0, 0] m, [0, 6641.981,
3606.302] m/s at each seed's epoch); B = Cd·A/m = 0.022 m²/kg, Cr·A/m =
0.013 m²/kg. Truth: HPOP `leo-jb2008` (EGM2008 70×70, Sun, Moon and planets
from DE440, cannonball radiation pressure with conical shadow, JB2008 with
SET's drivers, IERS 2010 solid tides and relativity; RK78, tolerance 1e-12,
maximum step 120 s). Stations Arecibo, Kwajalein, Diego Garcia (the paper's).
Sensor: topocentric GCRF RA/Dec (`analysis/observation-simulator`, the
estimator's own measurement model), white Gaussian 2″ per axis, one
observation per 60 s while above 10° elevation and sunlit, downleg light
time. Arc: 24 h. Initial estimate: truth + δ, δ ~ N(0, P₀), P₀ =
diag(1 km² ×3, (1 m/s)² ×3); one δ per seed, shared by the cases.

| Case | Change from nominal |
| --- | --- |
| B1 nominal | — |
| B2 initial-state error | δ ~ N(0, 25 P₀); the filters are told P₀ |
| B3 station bias | Arecibo RA +10″ (5σ), unmodelled (added to the simulated RA; the simulator's bias would apply to both axes) |
| B4 manoeuvre | truth: along-track Δv = +0.5 m/s at epoch + 12 h, unmodelled |
| B5 area change | truth: B and Cr·A/m doubled from epoch + 12 h, unmodelled |
| B6 outliers | each observation, with probability 0.1, carries 60″ noise (30σ) in place of 2″; filters told 2″ |
| B7 sparse | one observation per 600 s while visible |
| B8 dynamics mismatch | filters: NRLMSISE-00 with GFZ's drivers and B = 0.0176 (−20 %); truth JB2008 |

Seeds: dev d1, d2 (epochs 2026-07-01, 2026-07-06; generator seeds 101, 102);
test t1–t6 (epochs 2026-06-02, 06-07, 06-12, 06-17, 06-22, 06-27; seeds 1–6).
The seed sets the epoch, δ (the generator), the simulator's noise (its
`RANDOM_SEED`) and B6's draws (a second simulator run at 60″ with seed + 1000;
the per-observation choice from the generator seeded + 2000). Every variant
runs on the same observations.

### Part A — the 2025 paper's cases (descriptive)

As arXiv 2508.20806 §13 states them, with full-force HPOP for truth and
filters (the paper used J2, J3, drag and third bodies), by these rules where
it is silent: the state is GCRF; Cr = 1.3; the Part B sensor (2″, 10° mask,
sunlit); P₀ = diag(1 km² ×3, (30 m/s)² ×3), the smallest round values that
put every component of the paper's stated initial error within 1σ; Arecibo's
RA bias is 10″ (§14.2; §13.2 says 0.00016″, spec G29); the GEO area change at
measurement 92 is kept to the end of the 180-minute arc (the stated reversion
at measurement 5492 is beyond the arc's 720); GEO is tracked from the same
three stations (only Arecibo sees it). Cases: A1 LEO nominal (6 days, filters
start at the true state); A2 LEO with the paper's perturbed initial state and
the Arecibo bias; A3 GEO, area 4 → 6 m² (B and Cr·A/m × 1.5). One noise seed
(generator seed 1). Compared with the paper's table (final RMS: UKF 1.05 / 1.44 / 4.30 km,
ESPF 0.97 / 0.73 / 1.09 km) only descriptively: the paper's sensor noise,
filter settings and definition of "final RMS" are not stated.

### Part C — OMM-seeded admissible sets against precise orbits

GPS, the one regime with an at-epoch error statistic from E2
(`results/e2/train/c1.json`, regime GPS, `epoch`: SGP4 at each set's epoch
minus precise orbits, in the precise state's RTN axes; E2's train window
2025-10-01..2026-03-31, disjoint from E10's). Precise orbits: ESA final
(`ESA0OPSFIN`) as converted by `analysis/reference-states`
(`/opt/data/sdn-archive/reference-states/reference`); element sets: Space-Track
GP history (`gp_history/by-creation`, SGP4 element sets, duplicates within 1 s
merged), evaluated at their epochs by `analysis/epoch-state` (GCRF).

Windows: dev 2024-10-01..2024-10-31 (start days 10-01, 10-15); test
2026-07-01..2026-09-15 (start days 07-01, 07-15, 07-29, 08-12, 08-26, 09-09).
For each start day and every GPS satellite with precise orbits over the arc:
the seed is the first element set with epoch at or after 00:00 UTC; the
updates are the later element sets with epochs within 3 days of the seed's
(at least two). Initial estimate: the seed's GCRF state; P₀: E2's at-epoch
second moment about zero (6×6, RTN of the seed state, rotated to GCRF; the
initial set of a set-based filter is its r₀ = 3 bound). Each update is a
`LINEAR` record y = M r (M the GCRF→RTN rotation of that element set's own
state, `foundation/frames`), value M r_set, sigmas the square roots of the
diagonal of E2's position second moment about zero (σ_R 313 m, σ_T 2788 m,
σ_N 286 m). BLS fits the same information with the seed as a priori:
`POSITION_VECTOR` records with the 3×3 covariance Mᵀ diag(σ²) M (`fit_batch`
takes no `LINEAR` records). Force model
(E2's GPS degree and step, with Part B's other forces): EGM2008 12×12, Sun,
Moon and planets (DE440), cannonball radiation pressure with Cr·A/m =
0.02 m²/kg (E2's a priori), IERS 2010 solid tides and relativity, no drag;
RK78, tolerance 1e-12, maximum step 300 s.
Truth at each element-set epoch: the precise state at the last reference epoch
at or before it, propagated by HPOP (at most 5 minutes). Baseline: the
element set itself (SGP4 at its epoch) against the same truth.

ILRS normal points are not in the local archive and are not fetched; SatNOGS
and optical observations wait for E6.

### Enclosure test

On B1, test seeds t1–t3, for E26, E25T and SMF, at six steps per run: the
first observation of passes 2, 4 and 6 (across a gap) and the third
observation of the same passes (within a pass); a pass is a run of at least
three observations from one station less than 5 minutes apart, numbered in
time order. From the variant's carried
region at t_k (centre and shape it carries to the next step), 1,000 points
uniform inside and 1,000 uniform on its boundary (seeded), plus the variant's
own support points, are taken through step k + 1. The carried region is the
ellipsoid d ≤ 1 of the carried shape (E26: σ²·MVEE of the survivors, the
MVEE of its regenerated points; E25T: (ζσ)²Π, the MVEE of its points; SMF:
its set). The published bounds are those of section 4 (E26, SMF: d ≤ 1 in
the predicted and posterior shapes; E25T: d ≤ r = 3 in its predicted and
posterior spreads, where its regenerated points sit at d = √n):

- **E1 (prediction).** Each point is propagated by HPOP to t_{k+1}; the
  fraction outside the variant's published predicted bound (centre and shape)
  and the largest normalized radius d = √((x − c)ᵀ S⁻¹ (x − c)).
- **E2 (update, dense support; E26 only).** E26 runs step k + 1 with the
  dense cloud as its support (`initial_support`, possibility 1,
  `record_support`): the fraction of the dense survivors outside the
  reference run's posterior bound (the MVEE of its survivors), and the
  log-volume ratio of the two survivors' MVEEs. (E25's spread is defined for
  its 2n + 1 points, so a dense cloud has no E25 update.)

**Verdict rule.** A variant's bounds *enclose* admissible trajectories if
every E1 (and, for E26, E2) fraction is 0 (every point's normalized radius
within its bound times 1 + 1e-9) at every tested step; otherwise they
*summarize the sampled support*. The fractions and radii are reported
either way.

### Part D — screening (descriptive, run if time allows)

10,000 synthetic short-term encounters (seed 20261009): combined hard-body
radius 10 m; relative speed 10 km/s; per encounter, combined RTN position
sigmas log-uniform in [10, 500] × [50, 5000] × [10, 500] m; half the true
misses uniform in the hard-body disk (collisions), half area-uniform in the
annulus 10 m–2 km. The estimated miss is the true miss plus an error drawn
from the declared covariance, or from 9 × it in a random 20 % (understated
covariance). Each encounter is screened by `analysis/conjunction-assessment`:
Foster's Pc (`compute_pc`) and `possibility_of_collision` (Gaussian-shaped
kernels from the same covariances). Reported: missed collisions and false
alerts at Pc ≥ 1e-5, 1e-4, 1e-3 and Π ≥ 0.01, 0.05, 0.5 and N > 0; time per
evaluation.

## 4. Endpoints

Per run and variant, untrimmed, over the scored epochs (every observation
epoch after the first 2 hours; Part C: every update epoch; Part A: every
observation epoch):

- **Point error:** 3D position and velocity error of the estimate (E26 the
  medoid, E25 the mode, SMF the centre, the others the mean) against truth:
  RMS, median, 95th percentile, maximum; failures (a run that stops or whose
  final position error exceeds 10 km in Part B, 50 km in Part C).
- **Containment:** the fraction of scored epochs whose truth lies in the
  declared region. EKF, UKF, BLS: d² ≤ χ²₆(p), p = 0.95 and 0.997. E26: the
  posterior set, the MVEE of the survivors (d ≤ 1, declared to hold the
  state), and its α-cuts, the MVEEs of the recorded survivors with π ≥ α,
  α = 0.05 and 0.5 (declared coverage ≥ 1 − α, the possibility–probability
  consistency N(A) ≤ P(A)); an α-cut with fewer than 2n + 1 = 13 points
  counts as not holding the truth (and is reported). E25 and E25T: d ≤ r = 3
  in the posterior spread about the mode (the paper's ±3σ bands), and the
  α-cuts of their recorded survivors as for E26. SMF: d ≤ 1.
- **Size:** log det of the region's shape, and its RTN extents (half-widths
  along R, T, N of the region's projection), at each scored epoch.
- **Mismatch detection (B4, B5; false alarms on B1 and pre-event epochs):**
  statistics E26 q_min (the smallest whitened innovation over the support),
  E26 S̄ (Choquet surprisal), E25's inconsistency flag, EKF/UKF NIS. Each
  threshold is the 99th percentile of its statistic over B1 dev epochs after
  the first 2 hours. Delay: from the event to the first epoch over threshold;
  false-alarm rate: the fraction of B1 test epochs over threshold.
- **Outliers (B6):** point error and failures as above.
- **Cost:** HPOP calls, estimation-module calls and wall time per run.
- **Part C** adds the error ratio to the baseline element set at the same
  epoch.

## 5. Hypotheses and decision rules

Choices on dev (Part B, seeds d1 and d2, all eight cases), after the freeze:

- **κ** for E26 from {1, 0.5}; **λ_t** for E25T from {0.05, 0.005, 0}: the
  candidate with the fewest failures, then the smallest median over the dev
  runs of the per-run RMS 3D position error; a candidate within 10 % of the
  best median is preferred in the order listed (the papers' value first).
- **Detection thresholds:** the 99th percentiles of section 4 from B1 dev.

Both are recorded in `results/e10/selection.json` and committed before any
test run of E26 or E25T. Test runs of the variants that do not depend on the
selection (E25, EKF, UKF, BLS, SMF) and Part D may run earlier; none of their
output is read before `selection.json` is committed.

| ID | Hypothesis | Statistic | Supported if |
| --- | --- | --- | --- |
| H1 | E26 is at least as accurate as the UKF on the nominal case. | median over B1 test runs of RMS(E26)/RMS(UKF), per-run 3D position | 95 % upper bound < 1 |
| H2 | E26 is more accurate than the UKF under mismatch and bad data. | the same ratio over the B2–B8 test runs | 95 % upper bound < 1 |
| H3 | E26's posterior set holds the truth (B1). | fraction of B1 test epochs inside the set | 95 % lower bound ≥ 0.95 |
| H4 | The OMM-seeded E26 improves on the latest element set (Part C, test). | median over arcs of e(E26)/e(element set) at the final update | 95 % upper bound < 1 |
| H5 | The OMM-seeded E26 set holds the truth (Part C, test). | fraction of update epochs inside the set | 95 % lower bound ≥ 0.95 |

H1–H5 are one family, Holm's procedure at α = 0.05 (one-sided bounds read
from two-sided 90 % intervals). Everything else is descriptive: the other
variants' ratios, containment at every declared level, sizes, detection
delays and false alarms, outliers, cost, the enclosure verdict, Parts A and D.

**Intervals.** Part B: cluster bootstrap over seeds (each seed's runs of all
cases and variants resampled together), 2,000 resamples, seed 20261009,
percentile intervals. Part C: two-way cluster ("pigeonhole") bootstrap over
satellites and start days (Owen 2007; `harness/stats.mjs`), 2,000 resamples,
seed 20261009. Statistics are paired: every variant runs on the same
observations.

## 6. Acceptance of the modules (before any test seed is read)

`analysis/estimation` passes its end-to-end tests (`docs/espf-spec.md` §9):
the ESPF-HJ §4 scalar closed forms exactly; the 2025 appendix's Gaussian limit
reproduces the module's UKF (itself validated against Orekit 13.1) with
full-force HPOP answers; idempotence, Popperian monotonicity, the α-cut
intersection and N(A) = 1 − Π(Aᶜ) exactly; the MVEE against analytic sets and
an independent numpy implementation (1e-12); `LINEAR` with H = [I 0]
reproducing `POSITION_VECTOR` byte for byte; SDK compliance; byte-identical
results in Chrome, native WasmEdge and Docker WasmEdge (`tests/parity.mjs`).
`analysis/conjunction-assessment` passes `tests/possibilityScreening.test.mjs`
(definitions, the encounter-plane closed forms, brute force) and its
three-runtime parity script.

## 7. Threats to validity

- **One implementation of underspecified papers.** Thirty gaps are resolved
  by stated choices (`docs/espf-spec.md` §7). A result about E25 or E26 is a
  result about these readings; κ and λ_t are tuned on dev, the other ESPF
  parameters are not.
- **Same dynamics in truth and filter** (except B4, B5, B8): Part B measures
  estimation, not force-model error. Part C carries real model error.
- **Few clusters.** Six test seeds per case give wide intervals; Part B's
  conclusions rest on the pooled ratios.
- **Part C's measurements are element sets** whose errors are correlated in
  time and with each other; the E2 statistic is a second moment, not a
  bound, and its correlations between R, T and N (|ρ| ≤ 0.17) are dropped
  from the update records (kept in P₀).
- **The enclosure test is a sample**: points that stay inside do not prove
  enclosure; one that leaves disproves it.
- **Part A** cannot reproduce the paper's numbers: its noise, filter settings
  and scoring are not stated.

## 8. Not done here, and why

- **The authors' implementation.** Not public (github.com/gaiaverseltd/espf
  holds a README and a licence). The v3 papers' full texts are not readable
  without the publisher's page; their abstracts are used where they settle a
  gap (spec §0).
- **ILRS normal points and SatNOGS/optical observations** for Part C (not
  archived; E6 not landed).
- **LEO and SLR regimes in Part C**: E2 has no at-epoch statistic for them.

## 9. Outputs and provenance

Each run writes `runs/<run-id>/` (ignored by git): per-epoch rows and
`manifest.json` (`harness/provenance.mjs`). Committed under `results/e10/`:
`selection.json`, the run manifests and metrics (aggregates only), and
`REPORT.md`, generated from them by `steps/90-report.mjs`. No element set and
no per-sample table derived from one is committed; the element-set files read
are listed by SHA-256 in the manifests. Inputs: `data/e10/` (the DE440 2018
excerpt and its extraction script).
