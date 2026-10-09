# E7 — Full-force HPOP from an OMM's epoch state, against SGP4

Pre-registration. Status: **draft, not frozen**. The plan is frozen by the
commit that sets `"frozen": true` in [`config.json`](config.json), after the
train and validation windows have fixed the choices of section 5; that
commit's SHA is recorded in every later run manifest. The code refuses the
test window until `config.json` and this file are committed with
`"frozen": true` and unchanged in the checkout.

Graph task: `e7-full-force-handoff-20261009`.

## 1. Question

The Evidence-Supported ASO Catalog whitepaper, section 5 ("Initializing
numerical propagation from an OMM"), hands an element set to numerical
propagation: SGP4 at zero elapsed time gives a TEME state, the state is
rotated to GCRF, and HPOP propagates it. Does that handoff, with **every
force HPOP carries** (the owner's definition of HPOP; no reduced or resident
model is called HPOP here), predict an object's position better than the
same OMM propagated by SGP4 over the next 0 to 7 days? And if not from one
state, does fitting HPOP to an arc of OMMs, or starting from E1's corrected
GPS state, change the answer?

## 2. Variants

| ID | What propagates | Where |
| --- | --- | --- |
| S | The OMM, by SGP4 (baseline) | `analysis/gp-error-model` `accumulate` |
| H-epoch | Full-force HPOP from the OMM's epoch state (the handoff), with B by the rule chosen on validation (section 5) | `analysis/epoch-state` `derive`, `propagator/hpop` `invoke` |
| H-epoch-E1 | H-epoch from the epoch state of the E1-corrected OMM (GPS only; E1's frozen model `results/e1/fit/e1-gps-epoch-20-fit-20261009T172522Z/model.json`, M3* = M3c-K2-ridge1000) | as H-epoch; correction as E1 step 30 applies it |
| H-arc | Full-force HPOP fitted by weighted batch least squares to the epoch states of the object's OMMs over the arc span chosen on validation ending at the OMM's epoch (state, plus Cd·A/m in the drag regimes or ECOM2 for GPS; state only for SLR-MEO), then propagated | `analysis/estimation` `fit_batch` answered by `propagator/hpop` |
| H-arc-E1 | H-arc on E1-corrected OMMs (GPS only) | as H-arc |
| S-E1 | SGP4 from the E1-corrected OMM (GPS only; descriptive) | as S |
| H-truth | Full-force HPOP from the precise orbit's own state at the first target (descriptive: the dynamics alone, no initial-state error) | as H-epoch |
| H-epoch-NRLMSISE | H-epoch with NRLMSISE-00 and observed daily drivers instead of JB2008 (drag regimes; sensitivity) | as H-epoch |
| H-epoch-persist | H-epoch with the JB2008 drivers known at the OMM's epoch held constant over the prediction (drag regimes; sensitivity: what an operator without forecasts would have) | as H-epoch |
| H-epoch:<rule> | H-epoch with the B rule not chosen (drag regimes; descriptive) | as H-epoch |

Every orbit computation runs in a module through the
`space-data-module-sdk` harness; this repository frames records, applies the
module's RTN rotation to a difference vector and computes statistics.

## 3. Force model (HPOP, full force)

One configuration per regime, the largest the module carries
(`propagator/hpop` PRW execution path, `space-data-network-modules` main at
`095c20a6`, HPOP WASM SHA-256 `0d1f6264…`, SDS 1.241.0; every run manifest
records the full hashes):

| Force | GPS | LEO-POD | SLR-LEO | SLR-MEO |
| --- | --- | --- | --- | --- |
| Earth gravity, EGM2008 in Earth-fixed axes with IERS EOP 20 C04 | 20 × 20 | 70 × 70 | 70 × 70 | 30 × 30 |
| Sun, Moon, Venus, Mars, Jupiter (JPL DE440s) | yes | yes | yes | yes |
| Solar radiation pressure, conical shadow | GNSS box-wing a priori (IIR, IIR-M, IIF) at the IGS SINEX mass; cannonball for GPS III | cannonball, nominal Cr·A/m | cannonball, nominal Cr·A/m | cannonball, nominal Cr·A/m |
| ECOM2 (CODE; D0, B0, B1 cos/sin), fitted | H-arc only | — | — | — |
| Drag, JB2008 with SET SOLFSMY/DTCFILE drivers (NRLMSISE-00 as a sensitivity) | — | yes | yes | — |
| IERS 2010 solid Earth tides (steps 1 and 2) | yes | yes | yes | yes |
| IERS 2010 relativity (Schwarzschild, Lense–Thirring, de Sitter) | yes | yes | yes | yes |

Integrator: RK78, relative tolerance 1e-13, steps of at most 300 s.

**Degrees.** A degree-n term falls off as (R/r)ⁿ: at GPS (r ≈ 26,560 km)
that ratio is 0.24 and the terms above degree 12 are below 1e-10 m/s²; 20 × 20
leaves margin. LAGEOS and LARES-2 (r ≈ 12,270 km, ratio 0.52) and ETALON
need little more; 30 × 30 leaves margin. Below 2,000 km the field matters to
high degree: 70 × 70 is the largest field the module carries
(`unsupported-gravity` above it); LEO orbit determination commonly uses 70 to
120, so the terms above 70 are a stated omission (section 9).

**Not carried by the module, so not modelled**: ocean tides, pole tides,
Earth albedo and infrared radiation pressure (in the library, not on the
PRW request), atmospheric drag above 2,000 km, a box-wing for GPS III (no
published surface set; GPS III uses the cannonball, 1500 kg, 20 m², Cr 1.3,
as V1 and E3), and the eclipse-season yaw manoeuvres of the box-wing
attitude.

**GPS radiation pressure.** H-epoch and H-truth use the box-wing a priori
(Rodriguez-Solano et al. 2012) of the satellite's block, from the IGS
satellite metadata SINEX (block by NORAD number, in-orbit mass at the epoch).
ECOM2 needs fitted coefficients, so it enters only H-arc and H-arc-E1: the
state and four ECOM2 coefficients (D0, B0, B1 cos, B1 sin) fitted together,
each starting at 0 with an a priori σ of 2e-9 m/s². Four, because
`analysis/estimation` `fit_batch` solves for at most four dynamic parameters
(HPOP carries all eleven); of the five-term reduced ECOM (D0, Y0, B0, B1
cos/sin) Y0, the smallest, is dropped.

**Physical coefficients** (nominal, not fitted, in `config.json`
`physical`): Cr·A/m from mass, cross-section and Cr per object (spheres from
the ILRS mission pages; Swarm and Sentinel-1 from published dimensions,
rounded); Cd 2.2.

**B from an OMM.** B* is not a ballistic coefficient: it is SGP4's fitted
drag term and absorbs other along-track error. Two rules are defined and
the validation window chooses between them for H-epoch, per drag regime:

- `bstar`: Cd·A/m = 2 B* / (ρ₀ R_E) = 12.741621 B* m²/kg (B* in 1/R_E,
  ρ₀ = 2.461e-8 kg/m³ SGP4's reference density, R_E = 6378.135 km); a
  negative B* is taken as 0.
- `nominal`: Cd·A/m = 2.2 A/m from the object's nominal mass and
  cross-section.

H-arc starts B from `bstar` and fits it (a priori σ 0.02 m²/kg for LEO-POD,
0.002 m²/kg for the SLR-LEO spheres, whose nominal Cd·A/m is 6e-4 to 1.2e-2).
`propagator/hpop` refuses a negative Cd·A/m or Cr·A/m: a fit iteration that
asks for one fails, and the sample counts as an H-arc failure.

## 4. Data

| Input | Source | Role |
| --- | --- | --- |
| OMMs | Space-Track `gp_history` by creation day (`/opt/data/sdn-archive/spacetrack/gp_history/by-creation`); SGP4 theory, ephemeris type 0; republished duplicates (epochs within 1 s) keep the later creation | What is propagated. Never leaves this machine. |
| GPS truth | ESA final orbits `ESA0OPSFIN` (5 min), through `analysis/reference-states` (IGS20 → GCRF with EOP 20 C04) | Scoring |
| LEO-POD truth | Sentinel-1A/1C/1D `AUX_POEORB` (10 s), Swarm A/B/C `SP3*COM` reduced-dynamic (10 s) | Scoring, 450–700 km |
| SLR-LEO truth | NSGF SLR orbits (2–3 min arcs of 2.5–4 days): Starlette, Stella, LARETS, WESTPAC, Ajisai, LARES | Scoring, 690–1,490 km spheres |
| SLR-MEO truth | ILRS combination weekly arcs: LAGEOS-1/2, ETALON-1/2; NSGF: LARES-2 | Scoring, 5,900–19,100 km spheres |
| Earth orientation | IERS EOP 20 C04 (`eopc04.1962-now`) through `data-source/eop-parser` | Every propagation |
| JB2008 drivers | SET `SOLFSMY.TXT`, `DTCFILE.TXT` (retrieved 2026-10-09) | Drag |
| NRLMSISE-00 drivers | GFZ `Kp_ap_Ap_SN_F107_since_1932.txt` (retrieved 2026-10-09), as E5 frames it | Drag sensitivity |
| Planetary ephemeris | JPL `de440s.bsp` | Third bodies |

GRACE-FO, COSMIC-2 and TerraSAR-X/TanDEM-X precise orbits are not converted
by `analysis/reference-states` on this machine and are not used.

**Drivers are observed values.** The propagation reads JB2008 and NRLMSISE
drivers observed over the prediction span, which no operator has at the
OMM's epoch: H-epoch and H-arc in LEO are therefore an upper bound on what
the handoff achieves operationally. H-epoch-persist measures the other end.

### Windows (by the OMM's epoch, UTC)

| Window | From | To | Use |
| --- | --- | --- | --- |
| Dev | 2025-10-01 | 2025-10-12 | Plumbing only; nothing chosen |
| Train | 2025-10-15 | 2025-12-31 | Pseudo-observation weights for H-arc (section 5) |
| Validation | 2026-01-15 | 2026-03-31 | The B rule and the arc span (section 5) |
| Test (locked) | 2026-05-01 | 2026-08-10 | Read once, after the freeze |

The test window lies inside E1's test window (2026-04-01..09-15), so E1's
model never saw it, and ends where the truth (Swarm 08-19, SLR 08-29) and
SET's published drivers (08-25) still cover 7 days.

**Samples.** For each object and each product time (the window's start at
00:00 UTC plus multiples of the stride: GPS 3 days, LEO-POD 2, SLR-LEO 3,
SLR-MEO 2; validation 5 days throughout), the object's latest OMM with its
epoch at or before that time and at most 1 day older. **Targets**: for each
horizon h in {0, 6, 12, 24, 48, 72, 168} hours, the first truth state at or
after the OMM's epoch + h, at most 15 min later; a horizon without one is
missing for every variant alike.

## 5. Fitted choices (train and validation)

- **Weights (train).** For each regime, the second moment about zero of the
  SGP4 epoch-state error 6-vector (R, T, N and their rates), at the first
  truth state after every OMM epoch in the window, each component clipped at
  5 robust sigma; for GPS also of E1-corrected OMMs (used by H-arc-E1). It
  is each pseudo-observation's 6 × 6 RTN covariance in the fit. Written to
  `results/e7/train/weights.json`, whose SHA-256 the freeze pins.
- **B rule (validation)**, per drag regime: the rule with the lower median 3D
  error of H-epoch at 72 h. Equal medians go to `bstar`.
- **Arc span (validation)**, per regime: among the spans in {2, 4, 7} days
  that produce a prediction for at least 90 % of the validation samples with
  an S error at 72 h (an arc needs at least 3 OMMs, and a fit that does not
  converge produces none), the span with the lowest median 3D error of H-arc
  at 72 h, on the samples where every eligible span has one. Equal medians go
  to the shorter. H-arc-E1 uses GPS's span.

The choices are written into `config.json` (`chosen`) before the freeze.

## 6. Endpoints, statistics and decision rules

**Error.** Prediction minus truth at the target, in the truth state's RTN
axes (R radial, N orbit normal, T = N × R): for S from `accumulate`, for the
HPOP variants from the GCRF difference rotated by `foundation/frames`. The
3D error is its norm.

**Statistics** per regime × variant × horizon: samples, objects; median and
95th percentile of the 3D error; median |R|, |T|, |N|; the share of the
squared error in each axis after a 5 robust-sigma clip on the 3D error.

**Paired ratio.** For a variant V and its comparator C (S unless stated),
on the samples where both exist: ρ = median 3D(V) / median 3D(C). Every
interval is a two-way (object × UTC day of the OMM epoch) pigeonhole
bootstrap (Owen 2007), 2,000 resamples, seed 20261009, 95 % percentile.

**Classes.** At each horizon: *meaningfully better* when the upper bound of ρ
is below 0.8; *better* when it is below 1; *worse* when the lower bound is
above 1; otherwise *undecided*.

**The owner's question, per regime.** For H-epoch (primary), and H-arc and
H-epoch-E1 (key secondary): **yes** if the variant is meaningfully better
than S at 24 h, 48 h, 72 h and 7 days; **partly** if it is meaningfully
better at some of them and worse at none; **no** otherwise. These are
classifications over many comparisons, not one test; the 0.8 margin is the
guard, and every interval is reported.

**Also reported.** H-arc and H-epoch-E1 against H-epoch; H-arc-E1 against
H-arc; the 95th-percentile ratio; H-truth (the error the dynamics alone
leave) beside H-epoch (initial-state error plus dynamics): where H-truth is
far below H-epoch the initial state dominates. The fits' convergence,
iterations and fitted coefficients. Failures (a module error, a fit that does
not converge, too few OMMs) per variant: a failed sample is missing from
its variant's statistics and is counted.

## 7. Acceptance of the harness (on dev, before the freeze)

- A0.1 The RTN rotation from `foundation/frames` and the R = r/|r|,
  N = r × v / |r × v|, T = N × R convention of `accumulate` agree on every
  dev target to 1e-12.
- A0.2 Every S target falls in a bin holding exactly one truth state.
- A0.3 H-truth at 0 h is zero, and the at-epoch H-epoch error equals S's
  at-epoch error when the target is the OMM's epoch to the second (both are
  SGP4 at zero elapsed time); reported, not required, when no target
  coincides.

## 8. Order of work

1. Dev: steps 10 and 20 end to end; A0.
2. Train: step 10 → `results/e7/train/weights.json`.
3. Validation: step 20, then step 30 writes the choices into `config.json`.
4. Freeze: set `"frozen": true`, commit.
5. Test: step 20 once; step 40 writes `results/e7/test/` (metrics, report).
6. Step 95: publish the non-Space-Track inputs under `data/e7/`.

## 9. Threats to validity

- **Observed drivers** favour HPOP in LEO (section 4).
- **Manoeuvres** (Sentinel-1 orbit control, Swarm, GPS station keeping) are
  not removed; medians are robust to them, 95th percentiles are not.
- **Truth gaps.** NSGF arcs leave gaps between arcs; Sentinel-1A truth ends
  2026-07-01. Missing horizons are counted, nothing is imputed.
- **Field truncation** at 70 in LEO, and the forces the module lacks
  (section 3).
- **Nominal coefficients** for Swarm and Sentinel-1 are rough; H-arc fits B
  but not Cr·A/m in LEO.
- **Few objects** outside GPS (6, 6 and 5): their intervals are wide.

## Amendments

Dated changes, with their reasons; amendments after the freeze are reported
with the results.
