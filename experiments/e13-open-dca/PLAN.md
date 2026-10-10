# E13 — An open Dynamic Calibration of the Atmosphere from fleet drag

Plan. Status: **Part R (the Planet × Swarm / GRACE-FO retrospective, sections 3–9) is frozen** by the commit that
sets `"frozen": true` in [`config.json`](config.json); until then the code refuses the test splits
(`windows.mjs`, `assertWindowReadable`). Part S (the live Starlink collection, section 10) is a design: it is
frozen by a dated amendment before any Starlink validation datum is scored.

Lane: claude-e13. Modules: `propagator/hpop`, `analysis/estimation`, `foundation/frames`, `foundation/time`,
`data-source/eop-parser` from space-data-network-modules `d1d8ca88` (HPOP 1.2.0, wasm `1b1df5e3…`, the build E4 A6
and E11 pin); `analysis/density-calibration` **0.3.0** from branch `task/e13-orbital-energy-20261010`
(commit `efd6a9c6`: `energy`, `drag_work`; tests against HPOP in `tests/energy.test.mjs`). The E4 A6 ephemeris
fitter is vendored in `vendor/` and switches to `harness/` once E4 A5/A6 lands.

Before the freeze I read: Planet's daily states of the whole year (to count states and gaps) and its own
ballistic-coefficient column (daily medians, to see whether the data carry a signal); GFZ Ap and Kp for the whole span
(to name the storm days, section 5). I computed the drag of dev-split arcs only (the estimator choice of section 4.1
used one Dove's first eight days and a few dev arcs). **I read no Swarm or GRACE-FO density and no Swarm or GRACE-FO
orbit of any split, and computed no arc of a test split.**

## 1. Question

HASDM's Dynamic Calibration of the Atmosphere (DCA) corrects Jacchia's exospheric temperatures every 3 h from the
drag of about 75–100 radar-tracked calibration satellites, with a constrained ballistic-coefficient (B) correction
per object, and predicts the coefficients for 72 h (Storz et al. 2005; Casali and Barker 2002; Bowman and Storz 2002).
Its tracking is not public. Operators now publish orbit-determination states of whole fleets: SpaceX's Starlink
ephemerides (11,130 files, about 6.5 h apart) and Planet Labs' daily states (about 120 Doves).

Can a DCA-form correction to JB2008, solved from such public states alone, (a) reproduce the variations of
Swarm and GRACE-FO densities, (b) improve the 1–3 day orbit prediction of objects that did not calibrate it?

## 2. Prior art and the novel claim

Search of 2026-10-10 in Crossref, Semantic Scholar and arXiv (no key; publisher pages that returned bot walls were
not worked around). **Read** = full text; **abstract** = abstract and metadata only; **metadata** = identified, not read.

| Work | What it did | Status |
| --- | --- | --- |
| Storz et al. 2005, *Adv. Space Res.* 36(12), 2497, [10.1016/j.asr.2004.02.020](https://doi.org/10.1016/j.asr.2004.02.020); Casali and Barker 2002, AIAA 2002-4888, [10.2514/6.2002-4888](https://doi.org/10.2514/6.2002-4888); Bowman and Storz 2002, AIAA 2002-4890, [10.2514/6.2002-4890](https://doi.org/10.2514/6.2002-4890) | HASDM, its DCA (13 temperature-correction coefficients, 3 h cadence, 1.5-day window, per-object constrained B, predicted coefficients) and its time-series analysis | metadata (DCA's structure from secondary sources, docs/hac-sources.md §2) |
| Licata et al. 2022, *Space Weather* 20, e2021SW002915, [10.1029/2021SW002915](https://doi.org/10.1029/2021SW002915) | Machine-learned model of the HASDM database | abstract |
| Picone, Emmert and Lean 2005, [10.1029/2004JA010585](https://doi.org/10.1029/2004JA010585); Emmert 2009, [10.1029/2009JA014102](https://doi.org/10.1029/2009JA014102); Emmert et al. 2021, [10.1029/2021JA029455](https://doi.org/10.1029/2021JA029455); Doornbos et al. 2008, [10.1016/j.asr.2006.12.025](https://doi.org/10.1016/j.asr.2006.12.025) | Density from the decay of element sets; global averages; model calibration | metadata |
| Gondelach and Linares 2020, *Space Weather* 18, e2019SW002356, [10.1029/2019SW002356](https://doi.org/10.1029/2019SW002356); 2021, *Space Weather* 19, e2020SW002620, [10.1029/2020SW002620](https://doi.org/10.1029/2020SW002620) | Real-time density by Kalman assimilation of TLEs (17 objects), then of radar (20 objects) and **GPS positions of 10 commercial satellites**, in a reduced-order model; 5 % daily error against Swarm. The 2021 reference list cites Planet's OD, differential-drag and SkySat-operations papers; the abstract does not name the operator; text not read (Wiley and ESSOAr walls) | abstract |
| Gershman 2026, [10.64631/vfnq1575](https://doi.org/10.64631/vfnq1575) | Public TLEs of thousands of ballistically stable objects assimilated into a global atmosphere (shape and scale of the past 24 h), 10–20 % against reference data 2014–2026, index-driven short-term forecast | abstract |
| Parker and Linares 2024, *J. Spacecraft Rockets* 61, 1412, [10.2514/1.A36164](https://doi.org/10.2514/1.A36164); 2026, *Space Weather*, [10.1029/2025SW004729](https://doi.org/10.1029/2025SW004729) | The Gannon storm in catalog TLEs; a data-driven drag model from correlated drag responses across satellites | 2024 read in part; 2026 abstract |
| Visser et al. 2013, [10.5047/eps.2013.08.003](https://doi.org/10.5047/eps.2013.08.003); van den IJssel et al. 2020, *Adv. Space Res.* 65, 1758, [10.1016/j.asr.2020.01.004](https://doi.org/10.1016/j.asr.2020.01.004) | Swarm GPS-derived densities (the truth used here); CHAMP, GRACE and GRACE-FO accelerometer densities come from the same group | metadata |
| Chen and Sang 2016, [10.1016/j.geog.2016.05.004](https://doi.org/10.1016/j.geog.2016.05.004); Li et al. 2017, [10.1007/s11430-016-9052-1](https://doi.org/10.1007/s11430-016-9052-1); Constant et al. 2024, [arXiv:2408.16805](https://arxiv.org/abs/2408.16805); Ray et al. 2022, *Space Weather* 20, e2021SW002972, [10.1029/2021SW002972](https://doi.org/10.1029/2021SW002972) | Energy-balance and POD-accelerometry densities from precise orbits (CHAMP, GRACE-FO, Spire); EDR is surpassed by POD accelerometry over 45 storms (Constant) | abstract |
| Ray et al., AMOS 2023, [10.64861/xyil6825](https://doi.org/10.64861/xyil6825); Thayer et al., EGU24-14017, [10.5194/egusphere-egu24-14017](https://doi.org/10.5194/egusphere-egu24-14017) | EDR and POD accelerometry on Spire and limited Starlink data, aimed at model calibration "against HASDM"; GNSS-equipped LEO satellites as sensors of opportunity | abstract |
| **Ou et al. 2025**, *Remote Sensing* 17(9), 1549, [10.3390/rs17091549](https://doi.org/10.3390/rs17091549) | Near-real-time density *variations* from SpaceX's public ephemerides of all Starlinks: manoeuvre detection on mean elements (more manoeuvres in disturbed times), mechanical-energy loss by non-conservative forces, compared with Swarm-B; "SpaceX incorporates the latest space environment conditions into its orbit extrapolation models during each ephemeris update", lag at most 8 h | abstract (MDPI 403); Yamamoto's description of it read |
| **Yamamoto 2026**, *Earth Planets Space* 78, 175, [10.1186/s40623-026-02509-5](https://doi.org/10.1186/s40623-026-02509-5) | Tomography of density from the public ephemerides: 1,200 satellites in one 482 km, 53° shell, 2025-09-01..07, 19 analyses. Energy loss between two consecutive files t1 and t2 is E1−E0 (planned manoeuvre removed) minus (E1−E2) at t2, "the first data point should represent the actual observations", assuming the manoeuvre was executed as planned (E_mo ≈ E_mp; "a rigorous test … is desirable"). B per satellite from the slope of the corrected E1−E0 against GMAT runs at trial B; log-density spherical harmonics (L=1, diurnal only) at one height, one 60 km scale height; density 0.6–1.2 of Swarm, mean 0.95 | **read** |
| Yamamoto and Sori 2026, [10.1186/s40623-026-02402-1](https://doi.org/10.1186/s40623-026-02402-1) | Density from Starlink TLE decay, relative to NRLMSIS 2.1 | abstract |
| **Fitzpatrick et al. 2026**, *Space Weather* 24, e2025SW004611, [10.1029/2025SW004611](https://doi.org/10.1029/2025SW004611) | Orbit-effective densities from more than 1,500 Starlinks by energy dissipation, with ephemeris, **attitude and housekeeping data provided by SpaceX and NOAA**, and a gas-surface model | abstract |
| Liu et al. 2024, [10.1016/j.asr.2024.06.038](https://doi.org/10.1016/j.asr.2024.06.038); 2026, [10.1016/j.asr.2025.12.078](https://doi.org/10.1016/j.asr.2025.12.078); Lin et al. 2024, [10.1007/s10291-024-01771-y](https://doi.org/10.1007/s10291-024-01771-y); Oliveira et al. 2025, [10.3389/fspas.2024.1522139](https://doi.org/10.3389/fspas.2024.1522139) | Starlink manoeuvres and orbit prediction from the ephemerides; a storm-time reentry in TLEs | metadata / abstract |
| Foster, Hallam and Mason 2015, [arXiv:1509.03270](https://arxiv.org/abs/1509.03270); Foster et al. 2018, [10.2514/1.A33927](https://doi.org/10.2514/1.A33927) | Planet's OD (GPS and two-way ranging, NRLMSISE-00, ballistic coefficient fitted) and differential-drag control (two attitude modes, about 5:1 in exposed area) | 2015 read in part |
| Feb 2022 loss: Zhang et al. 2022, [10.1029/2022SW003168](https://doi.org/10.1029/2022SW003168); Billett et al. 2024, [10.1029/2023SW003748](https://doi.org/10.1029/2023SW003748) | The thermosphere in the storm; no use of ephemerides for density | abstract |

**E13 does not claim**: density from Starlink's public ephemerides (Ou 2025; Yamamoto 2026; with private data,
Fitzpatrick 2026); the next file's first state as the measurement of what happened since the previous file (Yamamoto
2026, in energy form); energy dissipation as a method (Chen and Sang 2016 … Yamamoto 2026); assimilation of TLE,
radar or GPS tracking into a density model with a forecast (Gondelach and Linares 2020, 2021; Gershman 2026); the DCA's
structure (Storz et al. 2005); and, if the ten GPS-tracked commercial satellites of Gondelach and Linares 2021 are Planet's (likely; the text is
unread), Planet-class GPS states in a density assimilation at ten-satellite scale.

**E13 claims, if the hypotheses of section 6 hold, and nothing more** (each is a measurement with a threshold, and
each is reported if it fails):

1. **A DCA-form correction from public operator states alone, scored by orbit prediction.** The correction is an
   exospheric-temperature offset a00(t) of JB2008 (E5's and E8's form) from the common mode of per-satellite drag,
   with a per-object baseline B that is constant over a block (the DCA's constrained segmented B) and a forecast of the
   correction; it is scored by the 1- and 3-day position error of objects that did not calibrate it (held-out Doves,
   Swarm A/B/C, GRACE-FO), not only by density ratios. Ou, Yamamoto and Fitzpatrick score density only.
   (H3, H4, H5)
2. **A ten-month Planet × Swarm / GRACE-FO retrospective with a held-out contiguous block that holds a Kp-8.7 storm**
   (2026-01-19..21, daily Ap 73, 144, 72): public Planet states for about 120 Doves compared with accelerometer and GPS-derived densities
   at the same altitudes, by ratio statistics (H1, H2) and against a time-shift control (H6).
3. **Two measurements on SpaceX's files (Part S):** the realised start-state mismatch between consecutive versions
   against the stated covariance (five pairs so far: +18, −65, +6, −49, −37 m along track at 6.5 h against stated 1σ of
   180–436 m), and a fleet-statistical test of the planned = executed assumption of Yamamoto 2026.

The method is not new; the evidence from a pipeline that uses public data only, with every physical quantity from a
module and its failures reported, is the contribution.

## 3. Data

- **Planet states** (CC BY-NC 4.0; used for results, never committed or published): `planet_YYYYMMDD.states`,
  2025-10-01..2026-07-31, one orbit-determination state per operational Dove per file (state age 1–7 h), the state's
  epoch in seconds past J2000 on TT, J2000 position and velocity, and Planet's own ballistic coefficient (kg/m², fitted
  with NRLMSISE-00 per Foster et al.; **comparison only**). 45,876 distinct states of 172 Doves in the year; the gaps
  between consecutive states of a Dove are 24.00 h at the median (25–75 %: 23.99–24.01 h; 98.6 % between 12 and 36 h).
- **Dove sample** (`planet-sample.json`, step 07): Doves with at least 250 states in the window whose mean WGS84
  height from `energy` lies in 430–520 km (Swarm flies at 440–520 km): 68 of 153; a salted hash draws 36
  **calibration** Doves and 12 **held-out** Doves, which never enter a solution. The arcs of the 48 are 3,840 in the dev split.
- **Density truth**: Swarm A, B, C DNSxPOD (TU Delft; GPS-derived; 30 s; 2025-10-01..2026-07-31) and GRACE-FO 1 DNS1ACC
  (accelerometer; to 2026-04-30), ESA/TU Delft products under ESA terms (cited, not redistributed). Orbits: Swarm RD SP3
  and GRACE-FO RSO from the archive.
- **Background**: JB2008 (Bowman et al. 2008) in `propagator/hpop` and in `analysis/density-calibration` (the same
  `lib/jb2008.h`), SET's SOLFSMY and DTCFILE as published (definitive; they end 2026-08-25), IERS EOP 20 C04, DE440s.
- **Not read before the freeze**: any Swarm or GRACE-FO density or orbit of any split; any arc of a test split.

## 4. Methods

### 4.1 The drag of one satellite-day, through the orbital energy

An arc is two consecutive daily states of one Dove, a and b, 20–28 h apart. State a is propagated to the epoch of b by
`propagator/hpop` (EGM2008 24×24, Sun and Moon, IERS 2010 solid tides, cannonball SRP with Cr·A/m locked at 0.0135 m²/kg,
JB2008 drag with Cd·A/m = B; RK78 at 1e-11, steps at most 75 s). The mismatch is read through the **Jacobi energy**
C = ½|v|² + U(r_ef) − ω·(r×v), U the EGM2008 geopotential energy to degree 36, from
`analysis/density-calibration` `energy` (a module; no energy is computed in JavaScript): m = C(x_b) − C(x_pred(B)),
S_E = ∂C/∂x · ∂x_pred/∂B (the module's gradient with HPOP's state-transition sensitivity), B ← B + m/S_E until
the change is below 1 %. The stated 1σ comes from both states' covariances through the energy gradient.

**Why the energy and not the full 6-D mismatch** (chosen on dev data, before any test data). The 6-D weighted least
squares over both states' covariances (`arcs.mjs sixDimensionalArc`; the covariance is that of one Planet OEM:
position R, T, N 4, 10, 2 m, velocity 10, 3, 2.5 mm/s) is ill-conditioned: an initial along-track velocity error and
drag give almost the same end state (T position and R velocity correlate at −1.000; the condition number of the
mismatch covariance is **1.7e11**). Dove 0505, eight consecutive daily arcs from 2025-10-05 (step 06):

| | range of B over eight arcs (m²/kg) |
| --- | --- |
| 6-D least squares | 0.0147–0.0478 (3.3×); median χ² 153 for 5 degrees of freedom |
| energy form (production profile) | 0.0182–0.0296 (1.6×); stated 1σ 4–5 % |
| Planet's own 1/B | 0.0143–0.0240 |

The energy form does not use the along-track phase and does not care about an initial velocity error (C of a and of its
prediction move alike). The production force profile against the full one (EGM2008 70×70, ocean tides, Earth radiation,
five bodies, relativity, RK78 at 1e-13; 31 s against 4.4 s an arc) on four arcs: B ratios 0.986, 1.006, 0.995, 1.004.
Module tests (`analysis/density-calibration/tests/energy.test.mjs`): C along a gravity-only HPOP orbit varies by
0.061 J/kg in 6 h (degrees 35 and 37 against HPOP's 36: 0.75 and 0.62 J/kg); the fall of C under JB2008 drag equals the
integral of `drag_work` to 0.13 %; the gradient equals finite differences.

### 4.2 Assumptions that are not measurements

Cr·A/m of a Dove (0.0135 m²/kg: 3U, Cr 1.3, about 0.06 m² facing the Sun, about 5.8 kg); the state covariance of each
Planet state (one OEM's, above); the Doves' two attitude modes (about 5:1 in exposed area, Foster et al. 2015) make B
step, which is why a baseline per block and a robust loss are used. The effect of ±50 % in Cr·A/m on B is measured on
20 dev arcs (step 06 extension) and reported; it is not tuned.

### 4.3 The common mode

Each valid arc j (B > 0, stated σ/B < 0.5) gives y_j = ln B_j. Model: y_j = ln b_{i,k(j)} + s̄_j + e_j with i the Dove,
k the baseline block (10, 21 or 30 days), b_{i,k} constant in the block, and s̄_j the mean over the arc's span of the
common mode s(t), piecewise linear between nodes every 12 or 24 h; the mean of s over each block is zero (a block's
level is not identifiable and belongs to b). The solver is alternating, robust: Huber (k = 1.5 robust σ) on e_j, nodes
and baselines updated in turn, until the largest change is below 1e-6 (≤ 30 sweeps). A node interval with fewer than 6
Doves is dropped. Held-out Doves enter neither the baselines nor the nodes of a solution. The node spacing, the block
length and the forecast time constant τ ∈ {12 h, 48 h, held} are chosen on the **dev split only**, by the smallest
pooled spread of the dev density residuals of H1 (the one place a density is used on dev), and recorded in
`results/e13/selection.json`, which is committed before any test-split run.

### 4.4 From s(t) to a temperature correction

s(t) is a log-density scale at the Doves' altitude. For propagation it is the exospheric-temperature offset
a00(t) = s(t)/κ, κ the mean ∂ln ρ/∂T of JB2008 over a ring of points at 490 km (latitude and local time), from
`analysis/density-calibration` `evaluate` (derivative) on the day's drivers; a00 is added to the hourly DTC rows of
HPOP's JB2008 input exactly as E5's D2 and E8's D5 do. A level never enters a propagation (B absorbs it).

### 4.5 Variants

| ID | Density |
| --- | --- |
| D0 | JB2008 with SET's indices as published |
| D13 | D0 plus a00(t) from this plan's common mode: **nowcast** from arcs ending at least 6 h before the issue time, then the forecast (τ from dev) |
| D13-def | D0 plus a00(t) from the full-window solution for every time (non-causal; an upper bound, never the primary) |

## 5. Splits

| Split | Span | Role | Storm days (GFZ Ap ≥ 50) |
| --- | --- | --- | --- |
| dev | 2025-10-01..2025-12-31 (92 d) | everything may be read and tuned | 2025-11-12 (Ap 137), 2025-11-13 (57) |
| test A | 2026-01-01..2026-03-31 (90 d) | **primary** | 2026-01-19 (73, Kp up to 8.7), **2026-01-20 (144)**, 2026-01-21 (72), 2026-03-22 (78) |
| test B | 2026-04-01..2026-07-31 (122 d) | replication, run after test A is reported | 2026-07-04 (73) |

Held-out: 12 Doves in every split; the Swarm and GRACE-FO orbits and densities of the test splits are read only
after the commit that freezes this plan and after `selection.json` is committed. The code enforces both.

## 6. Hypotheses, endpoints, decision rules

The density unit is the 12 h UTC window of one satellite: x = mean over its valid samples (at least 80 % of the 30 s
samples) of ln(ρ_observed/ρ_JB2008), the JB2008 density by `evaluate` at the sample's geodetic point with SET's rows. Each
satellite's level is its own dev-split mean of x; x′ = x − (that level). The correction under test in a window is
s̄ = the mean of s over the window, with the same dev-split mean removed. No free scale is fitted on any test split.
Statistics: two-way cluster bootstrap over satellites and UTC days (2,000 resamples, seed 20261010, 95 % percentile
intervals), as E5.

- **H1 (primary, density).** On test A, over Swarm A, B, C and GRACE-FO: R₁ = 1 − σ(x′ − s̄)/σ(x′), σ the standard
  deviation over windows. **Supported** if R₁ ≥ 0.25 and the interval's lower bound is above 0. (E5's calibration from
  other satellites' densities reached 0.64 on held-out satellites; E8's from OMM decays 0.08 against a 0.25 threshold.)
- **H2 (storm capture, descriptive).** On test A's four storm days: the share of windows in which s̄ has the sign of x′,
  and the median of s̄/x′ where |x′| > 0.1. Reported with the windows listed; "captured" if the share is at least 75 %
  and the median at least 0.5.
- **H3 (held-out Doves, hindcast).** For each held-out Dove-arc j in test A: u_j = y_j − b̂ with b̂ the median of the
  Dove's arcs of the previous block with s̄ removed (arm D13) or not (arm D0); R₃ = 1 − MAD(u − s̄)/MAD(u), MAD
  the robust spread. **Supported** if R₃ ≥ 0.20 and the lower bound is above 0.
- **H4 (Swarm and GRACE-FO prediction).** Issue time t0 = 00:00 UTC of every second day of test A. B is fitted by the
  energy form to the precise orbits at t0 − 24 h and t0 under the variant's density; the orbit at t0 is propagated by
  HPOP to t0 + 1 and + 3 days with the same B and density; the error is the 3D distance to the precise orbit. The statistic
  is the median over (satellite, issue day) of the ratio of D13's error to D0's. **Supported** at one day if the median
  ratio ≤ 0.90 and its upper bound is below 1; the 3-day ratio is reported with the same rule. (E5: 1.04 at 3 days;
  E8: 1.02.)
- **H5 (held-out Dove prediction).** Every third state of each held-out Dove in test A is an issue state; B is that of the
  previous arc under the variant's density, and the state is propagated to the Dove's next states (+24 h and +72 h); the
  error is the 3D distance to those states (accurate to about 10 m against errors of kilometres). Ratio and rule as H4.
- **H6 (control).** R₁ recomputed with s̄ shifted by seven days. **Supported (the control passes)** if R₁(shifted) < 0.05.
- **Holm** over H3, H4 (one day) and H5 (one day) at 0.05; H1 is tested alone.
- **Reported without a rule:** the ratio R₁ using Planet's own ballistic coefficient column in place of ours; the
  correlation of the two common modes; R₁ per satellite; D13-def.

If H1 fails the retrospective is negative and is reported as such; H3–H5 are then read as the effect of a correction
that does not reproduce density.

## 7. Guards

- Known answer, arc (`test/e13.test.mjs`, skipped visibly without modules and archive; passes): an arc made by HPOP
  from a 480 km, 97.4° state at Cd·A/m = 0.025, read from a starting value of 0.05, returns 0.025 to 0.2 %; the same
  arc made by the full force model is read by the production profile to within 2 %.
- Known answer, solver (written, and passing, before step 40): a synthetic fleet with a known s(t), baselines and attitude
  steps; the recovered s within 3 % of its amplitude; the held-out Doves' recovery likewise.
- No look-ahead: the nowcast refuses any arc with an end epoch later than t0 − 6 h (an assertion in the code, tested).
- The unperturbed D0 rows are byte-identical to the rows the variant starts from (hash in the manifest).
- Test splits unreadable until the freeze commit, and until `selection.json` is committed (`windows.mjs`).
- Every reported number carries the run id of the run that produced it (`manifest.json`, inputs by SHA-256).

## 8. Threats to validity

- **Doves are not passive**: differential drag changes their exposed area by about 5:1; the baseline block and the robust
  loss cope with steps, not with a fleet-wide synchronous schedule (not known to exist; checked on dev by the
  correlation of residual steps).
- **The common mode is global**: a scale of the density at 490 km; Swarm A/C (about 460 km), B (about 510 km) and GRACE-FO
  (about 490 km) fly at other altitudes and local times (the Doves' orbits are sun-synchronous). Latitude and local-time
  structure is not tested here.
- **Slow variations are not identifiable** (they are absorbed by the block baselines); only fluctuations on time scales
  of days to a few weeks can be recovered. The level is taken from dev.
- **Truth is not exact**: DNSxPOD densities depend on an assumed drag coefficient and area (a level the dev split
  absorbs, not a time dependence); POD densities are noisier than accelerometer ones.
- **JB2008 with definitive indices** is a historical-window background (SET's files lag 46 days); a real-time version
  needs NRLMSISE-00 and forecast indices (Part S).
- **Planet's state quality** (3–10 mm/s velocity, 4–10 m position, from one OEM's covariance) is assumed; the realised
  scatter of B across Doves is what sets the weights.

## 9. Order of work

1. This plan and its config are committed (`frozen: true`). 2. Dev split: the arcs (running), the solver and its known-answer
test, the Swarm and GRACE-FO dev densities, step 40 (selection) → `results/e13/selection.json` committed. 3. Test A: arcs, H1–H6, report. 4. Test B
as replication. 5. Report generated from the run manifests.

## 10. Part S — Starlink (design; frozen by amendment)

A collector (`collect.mjs`, running since 2026-10-10T19:12Z) polls SpaceX's manifest every 30 min, fetches 324 sampled
satellites' new versions serially (3.2 s apart, no CelesTrak), cuts each file's first 8 h in memory and stores only the
derived HPOP head fit (drag fitted, Cr·A/m locked at 0.11 or 0.19 by class, NRLMSISE-00 with GFZ/NOAA indices as
released at the file's issue time); raw files are never written. Facts found so far (not test results): all 11,130 files
carry the label "Operational"; versions come about every 6.5 h (a satellite's starts 03:22 and 09:52 UTC on 2026-10-10)
and the manifest lags by hours; start covariance 0.7–1.1 m and 0.7–2.4 mm/s; the first four fits had RMS 6.4, 16.1, 6.9,
5.1 m (gate 10 m). The analyses planned: (a) the realised mismatch against the stated covariance; (b) the energy
mismatch of consecutive versions, per satellite, against the planned thrust, as a test of planned = executed; (c) the
open DCA on Starlink-only and on Starlink + Planet; (d) its scoring by held-out Starlinks (chained heads as truth) and by
non-fleet objects with independent truth (SLR spheres; GRACE-FO and COSMIC-2 precise orbits, whose products arrive in 1–3
days); (e) the Swarm and GRACE-FO density comparison, which waits for the products (49–92 days). Hypotheses and
thresholds are fixed by Amendment S1 before any of this is scored.

## Amendments

### Amendment R1 — the solver (2026-10-10; before any Swarm or GRACE-FO density or orbit of a test split, and any test-split arc result, was read)

Written after the first dev arcs and synthetic fleets showed that the solver of section 4.3 cannot do its job on Planet's arcs. The
hypotheses, thresholds, splits, bootstrap and decision rules of sections 5–6 are unchanged. Changes, each with the measurement behind it:

1. **Planet's arcs all cover the same 24 h.** The states are dated 20:00–22:59 UTC (dev arcs to 2025-10-13: 389 of 474 start in hour 20, 76 in
   hour 22, 8 in hour 21, 1 in hour 18; midpoints cluster at 09:05 UTC). The node grid is anchored at the circular mean time of day of the
   arcs' midpoints (`arcCenterOffsetMs`), nodes 24 h apart. A daily arc sees the shortest wavelength of a 24 h grid with weight 1/2 when a node
   is at its centre and 0 when nodes are at its ends. **12 h nodes stay a dev candidate but daily arcs cannot resolve them** (synthetic fleet,
   2.5 h stagger: rms error 0.09–0.11 against 0.02 at 24 h).
2. **Support by weight.** A node is supported when 6 satellites overlap it **and** the arcs' squared weights on it sum to at least 1.5. With the
   satellite count alone, the first and last nodes (weight 1/8 in one arc each) were free: node errors of order 1 on a synthetic fleet, and
   through the mean-zero constraint a shift of every other node. An unsupported node is held at zero; windows that touch it are not scored.
3. **One mean-zero constraint, not one per block.** The mean of s over the supported nodes is zero. A per-block constraint is inconsistent with
   the arcs that straddle a block boundary: on a noise-free fleet whose common mode the model can represent, the per-block gauge gives rms
   errors of 8.1e-3, 4.5e-3 and 1.7e-3 (blocks of 10, 21, 30 d), the global one 5.9e-9, 4.0e-9, 3.4e-9.
4. **Baselines are robust random walks** (`stepSigma` q per √day between a satellite's consecutive arcs; Huber loss on the increments, so an
   attitude-mode step is allowed), replacing baselines constant in blocks, which stay in the dev table. Blocks tie neighbouring blocks'
   levels of the common mode only through the arcs that straddle the boundary, about 0.12 per boundary for 36 satellites at the realised
   scatter, accumulating over the boundaries. Synthetic fleet (36 satellites, 92 days, 3 % outliers, baseline steps of ln 1.5; rms error of
   the 12 h window means of the recovered common mode, storm amplitude 0.4), scatter 0.088 per arc:

   | arcs start within | blocks 10 / 21 / 30 d | random walk q = 0.005 / 0.01 / 0.02 / 0.04 |
   | --- | --- | --- |
   | 1 h | 1.58 / 0.89 / 1.38 | 0.022 / 0.021 / 0.019 / 0.018 |
   | 2.5 h | 0.045 / 0.035 / 0.055 | 0.022 / 0.021 / 0.019 / 0.018 |
   | scatter 0.04, 2.5 h | 0.020 / 0.016 / 0.027 | 0.010 / 0.009 / 0.008 / 0.012 |

   Candidates for the dev selection: q ∈ {0.005, 0.01, 0.02, 0.04} and blocks of 10, 21, 30 d, each with 24 h and 12 h nodes (14).
5. **Iteration.** The robust scale is held after 8 sweeps (so that the iteration converges on a fixed problem), at most 60 sweeps, change below
   1e-5 (1e-6 needs about 90 sweeps and moves the synthetic rms error from 0.0215 to 0.0216). The values of this amendment are in `amendments.json`,
   which the code merges over `config.json` (frozen, unedited): `analysis.solver.iterations` 60, `tolerance` 1e-5, and the new keys.
6. **Nowcast.** At an issue time t0 the arcs that ended at least 6 h before it and began at most 30 days before that cut-off, nodes at their
   centres; the correction after the last supported node relaxes with the selected τ. A test shows that no later arc enters (a later arc
   shifted by 5 in ln B leaves the solution identical).
7. **H3's baseline** is the median over the Dove's arcs of the previous 21 days (at least 8) with s̄ removed (arm D13) or not (arm D0): the
   baseline blocks of section 6 no longer exist.
8. **H4 covers Swarm A, B, C.** The archive holds no converted GRACE-FO precise orbit (the GFZ RSO SP3 files, declared coordinate system
   CTS, have not been through `analysis/reference-states`). GRACE-FO enters H1 and H2 (density) only. Cr·A/m of Swarm is E5's 0.009 m²/kg
   (an assumption of E5's).
9. **The guard of section 7** reads, as measured (`test/e13-solver.test.mjs`): noise-free, rms error below 5e-4 (random walk and blocks); at
   scatter 0.04 below 3 % of the storm amplitude (measured 2.0 %), at 0.088 below 6 % (measured 4.8 %); held-out satellites' spread reduced
   by at least 10 %. At the realised scatter the 3 % of section 7 is not reachable with 36 satellites (0.088 / √36 = 1.5 % per node before the
   deconvolution of a 24 h mean).

### Amendment S1 — Part S: what is measured on SpaceX's files, and how it is scored (2026-10-10; before any aggregate of the collector's pair records was read — one pair, STARLINK-1042, was read while the collector was tested)

The collector was restarted on 2026-10-10 with the pair mismatch. It polls the manifest every 30 min also while it fits, queues every version of a sampled satellite it sees, and for each version after a satellite's first
compares the version's first state (a fresh orbit determination at its start, t1) with the previous version's own prediction for t1, in the previous state's radial / transverse / normal axes, with both files' stated
sigmas and the Jacobi energy at t0 (the previous start) and t1 (`analysis/density-calibration` `energy`); and it reads Cd·A/m once more from the energy that separates the two start states (Method B: two trial HPOP
propagations from the previous start state to t1 with the NRT density model, a secant step, a check). Only derived numbers are stored (`pairs/`, `pairs.jsonl` in the store). A head fit (Method A, as section 10) is run for
the newest version of a satellite; a version with a later one queued is paired but not fitted.

A **pair** is two consecutive versions of one satellite whose start epochs are 5–9 h apart. The versions come about every 7.2 h (STARLINK-1042: starts 12:19:42 and 19:29:42 UTC, created 22 min after their start).

- **S1 realised against stated.** z = the mismatch / the previous version's stated sigma at t1, per axis. Statistic: the robust sigma (1.4826 × MAD) of z for the transverse position, over pairs, with the two-way cluster
  bootstrap over satellites and UTC days of section 6. **The stated sigma overstates the realised error** if the upper bound of that robust sigma is below 0.5. Reported for all six axes, with the share of pairs beyond
  3 sigma and the median realised / stated ratio of the 3D position.
- **S2 planned = executed thrust.** Pairs whose previous version predicts a net energy gain over [t0, t1] of at least 100 J/kg (the file plans a raise: drag alone cannot give a gain, and 100 J/kg is several times the drag model error over 7 h) form the planned-raise set.
  Statistic: the median of mismatch / predicted change (energy at t1 of the new state less that of the prediction, over the predicted gain; zero when the thrust is executed as planned and the drag error is small against it),
  with the bootstrap. **Executed = planned** if the median lies within ±0.05 and its 95 % interval within ±0.10, and the robust sigma of the planned-raise set's mismatch in J/kg is at most twice that of the decaying
  stratum's (no thrust: drag model error and orbit-determination error alone); **under-executed** if the median is below −0.05 and the upper bound below 0.
- **S3 cadence** (descriptive): the distribution of the hours between consecutive starts and between a version's start and its creation, per satellite and over the fleet.
- **S4 Method A against Method B** (descriptive): for pairs of the decaying stratum with no residual jump in the new version's head fit and a gate pass, the median and robust sigma of ln(B_A / B_B).

Section 10's analyses (c)–(e) (the open DCA from Starlink, held-out Starlinks, non-fleet objects, Swarm and GRACE-FO) are not frozen here; each gets its own amendment before it is scored.
