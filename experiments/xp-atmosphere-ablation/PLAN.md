# XA: an XP with a better atmosphere, on real truth; and why our XP fit is weak

Registered 2026-10-26 (task experiments-xp-atmosphere-ablation-20261026). This plan and config.json are frozen
by their first commit. That commit was made before:

- any arm of this experiment had been fitted or scored on any window;
- the module build that carries arms A1 to A3 existed.

The build is fixed in `build.json` before the first score: the modules commit and every module's SHA-256.
`build.json` is committed under amendment A1, and the steps refuse to run without it.

Owner, verbatim (2026-10-26): "create a public version of the XP propagator that's more accurate since we will be
using our version of DCA, an updated model that's better than the modified Jacchia (NRLMSISE-00), with real space WX
instead of the generic flux model they use"; then "Yes do that and tell me the results"; and, for part D, "How could
our fitting be weak for XP?"

## Questions

1. Is XP more accurate against real truth when its drag uses a better atmosphere? Three effects are tested
   separately:
   - real space weather instead of the theory's generic flux model;
   - NRLMSISE-00 instead of Jacchia 1970;
   - the open density correction (open DCA).
   Every arm is fitted the same way.
2. (Part D, diagnostic, outside the verdict.) Why does our XP fit lose to the public element set on the laser spheres
   (B2 part 2: day 1 784 m against 577 m, day 3 1,720 m against 609 m)? The candidate causes:
   - the fit span;
   - the parameter estimation;
   - the observation density;
   - the epoch placement;
   - the Jacobian;
   - the fit input.

## Arms

All arms run the SGP4XP theory of modules `propagator/sdn-ap` (the clean-room implementation). They differ only in
the drag density at the theory's drag nodes, and they are selected only by the `$PCF` FORCES table (SDS 1.271.0, `$PCF`
1.0.5). The same `$PCF` and inputs go to `fit` and to `propagate`.

| Arm | Density at the drag nodes | `$PCF` FORCES | Extra inputs |
| --- | --- | --- | --- |
| A0 | Jacchia 1970 (SPEC 3) on the generic flux model, a fixed function of date: XP as is | absent | none |
| A1 | Jacchia 1970 (SPEC 3.2, 3.3) on measured F10.7 and Ap | WEATHER_SOURCE RECORDS, WEATHER_EXTENSION HOLD_LAST | `$SPW` rows |
| A2 | NRLMSISE-00 on measured F10.7 and Ap | ENABLE_DRAG true, ATMOSPHERE_MODEL NRLMSISE00, WEATHER_SOURCE RECORDS, WEATHER_EXTENSION HOLD_LAST | `$SPW` rows |
| A3 | NRLMSISE-00 x exp(s(t)), s the open-DCA common mode | as A2, and DENSITY_CORRECTION DCA_COMMON_MODE | `$SPW` rows, one `$DCL` |

The space-weather drivers are the same for A1, A2 and A3. On the UTC day d of an evaluation:

- F10.7 is the observed flux of day d - 1;
- F10.7a is the 81-day centered mean of the observed flux on day d;
- Ap is the daily Ap of day d.

These are NRLMSISE-00's daily-Ap convention, as propagator/ffm and analysis/density-calibration drive it. In A1 they
stand in for the generic model's F, F-bar and Ap in the SPEC 3.2 temperature. Above 2,500 km every arm's density is the
theory's 1e-20 kg/m^3 (SPEC 3.3).

Contrasts:

- A1 against A0 is real space weather.
- A2 against A1 is the model swap.
- A3 against A2 is the DCA.

### Space weather: two conditions

The owner's proposal names real space weather. A measured value is known only after its day, so every arm A1 to A3
runs under two conditions:

- **M (measured).** The archive's measured rows for every day of the fit and of the three prediction days. This is
  the proposal as worded, and it gives perfect knowledge of the drivers. It is the upper bound of what better space
  weather can give.
- **O (operational).** What is known at the arc end E:
  - The rows are dated before E's UTC day.
  - Each row's F10.7a is recomputed over the days of its 81-day window that are at or before the last row's date.
  - Past the last row, the module holds it (HOLD_LAST).

Each condition carries its own verdict. A claim that the public XP variant "is more accurate" in operation needs O.

**The rows.** `$SPW` rows are made in data preparation (dates, values and means only) from the GFZ file
Kp_ap_Ap_SN_F107 (CC BY 4.0, Matzka et al. 2021) in the local archive:

- the file since 1932 (hac/gfz-kp/20261009) up to its last day;
- after that day, the latest nowcast file (hac/gfz-kp/2026/<date>).

For each day the rows carry:

- Ap: the file's daily Ap;
- F10.7: the file's observed F10.7, the DRAO Penticton flux;
- F10.7a: the mean of the observed flux over the 40 days either side of the day and the day itself, using the days
  that have a value.

The NOAA SWPC daily solar data in the archive cover only 2024 to 2026. The ISS windows reach back to 2021, so one
source serves every window. The run compares the GFZ F10.7 with SWPC's DSD F10.7 on every day both hold, and it reports
the largest difference. No SET or JB2008 index, CelesTrak space-weather file or sunspot number is read.

### The open DCA (A3)

The `$DCL` is analysis/density-calibration `calibrate_log_density`, using E13's frozen method:

- 24 h nodes;
- random-walk sigma 0.005;
- smoothing sigma 0.05;
- Huber threshold 1.5;
- 6 h latency;
- causal 30-day history;
- 48 hourly forecast nodes decaying with 48 h.

Its inputs are the archived NRLMSISE-00 energy arcs of E13's calibration Doves (planet-arcs dev, testA and testB
.msis.jsonl, 2025-10-01 to 2026-07-31). They are selected and mapped exactly as that module's open-dca E2E does
(analysis/density-calibration/tests/open-dca.e2e.mjs):

- NRLMSISE-00 arcs only;
- the planet-sample.json calibration Doves only;
- B > 0;
- sigma(B)/B <= 0.5;
- 20 to 28 h long;
- ending at or before issue - 6 h, and starting at or after issue - 6 h - 30 d.

The issue time differs by condition:

- O: issue = E.
- M: issue = E + 78 h, so the nodes reach the end of day 3.

The module refuses an issue with too little fleet, with a fleet that is stale more than 48 h, or that does not
converge. Then A3 is "not run" for that window and condition, with the module's reason. The archived arcs cover
2025-10-01 to 2026-07-31, so A3 runs only on the windows inside that span. Its contrasts are paired on the windows it
ran.

## Windows and truth

Only real truth is used. FFM-1 model truth never enters. The windows are the source experiments' own, rebuilt by their
code. Each registered count is checked before any arm runs, and a difference stops the run.

Every truth state passes through harness/truth-gate.mjs, the current rule for every truth reader. Its drops are
counted.

| Group | Windows | Source | Fit input (the same for every arm) | Truth |
| --- | --: | --- | --- | --- |
| L1 laser spheres from normal points | 206 cutoffs T | B2 part 2: Starlette, Stella, LARETS, WESTPAC, LARES, 2026-07-16 to 08-30 | the 24 h before T at 60 s spacing, FFM carried from E6's variant R state at T (B2's track) | NSGF orbit, thinned to one state per 300 s |
| L2 laser-ranged LEO from precise orbits | 98 + 51 | B1 leo-slr (2025-10) and leo-slr-current (2026-10) | the truth's own 24 h, at its spacing (B1's block) | the same precise orbit after E, thinned to 300 s |
| I ISS | 519 | B2 part 1b: NASA trajectory files 2021 to 2026, planned burns excluded | file k's first 24 h, at 240 s spacing | the first 24 h of each newer file starting in (E, E + 72 h] |
| N GNSS MEO (negative control) | 60 + 48 | B1 meo-gnss (2024-09/10) and meo-gnss-rapid (2026-10) | the truth's own 24 h | the same precise orbit after E |

**In L1, XP is not fitted to the ranges.** It is fitted to 24 h of full-force states carried from the normal-point
fit, as in B2 part 2, and every L1 table says so. B2's E6 R products are copied into the store with their SHA-256. FFM
carries them back with E6's forces and the target's E6 B and AGOM.

**The fit.** Each arm uses `fit`:

- THEORY SGP4XP;
- the FIT table at its defaults;
- the fit interval declared on the block (USEABLE_START_TIME the first state, USEABLE_STOP_TIME = E).

So BTERM and AGOM are estimated identically in every arm:

1. elements;
2. then BTERM, with a prior of 0 +- 0.05 m^2/kg;
3. then AGOM, with a prior of 0 +- 0.05 m^2/kg;
4. finally the two-line lattice.

The fitted set's epoch is the first state of the fit interval, which is the arc start: this is how the module places
it. The set is propagated by `propagate` with the same `$PCF` and inputs, to the truth epochs in TEME. foundation/frames
converts each state to the truth's axes, as in B1 and B2.

**The epochs.** XP is analytic: it is evaluated at the truth epochs and nowhere else.

## The public element set (P, outside the verdict)

P is the newest Space-Track set before E, as E6's baseline B picks it (experiments/e4 products.mjs setAt) from the local
gp_history archive (2022 on). P is propagated by SGP4 in the same module and scored the same way. A window with no set
has no P.

P is reported beside A0 for the confound question: is our fit procedure, rather than the atmosphere, what loses to the
public set?

## Scoring

The scorer is G1's (experiments/sdn-gp-starlink-ffm-match lib/baselines.mjs):

- the predicted state is paired with the truth state in the truth's axes;
- gp-error-model `pair_statistics` gives the error in the truth's radial, in-track and cross-track axes;
- a day's 3D RMS is the root sum of the squares of the three component RMS.

The held-out days:

- L1, L2 and N: day k is (E + (k - 1) d, E + k d], for k = 1, 2, 3.
- I: the hour bins (0, 24], (24, 48] and (48, 72] after E.

Truth thinning: one state per 300 s by G1's rule, every = max(1, round(300 s / spacing)). The ISS's 240 s states are
all kept.

Coverage, as each source experiment counts it:

- L1, L2 and N: a day counts when its truth holds at least 90 % of the day's states.
- I: every truth epoch present counts.

The fit RMS, both the module's and the scorer's over the fit interval, is recorded with every fit.

## Statistics

For each group, arm, condition and day, over the windows scored:

- the windows attempted, fitted and scored;
- the median;
- the 10th and 90th percentiles (linear interpolation between order statistics, G1's `quantile`);
- 95 % percentile-bootstrap intervals of the median, 10,000 resamples:
  - over windows;
  - over clusters, each cluster drawn with all its windows. The clusters are the objects for L1, L2 and N, and the
    calendar month of E for I (ISS windows of one month share their space weather and overlap in time).

**Paired ratios.** On the windows both scored, the per-window ratio of each arm to A0 is taken at each day. The
statistics are its median, with the same two intervals, and the share of windows where the arm is closer.

The resampling generator is xorshift128+, seeded per cell by SHA-256 of `XA|<group>|<arm>|<condition>|<day>|<kind>`.

## The verdict (fixed here, applied to every arm, condition and group L1, L2 and I)

An arm **improves accuracy** in a group under a condition only if both of the following hold:

1. the 95 % cluster-bootstrap interval of its day-3 median paired ratio against A0 lies wholly below 1;
2. it is no worse at day 1: the same interval at day 1 does not lie wholly above 1.

Otherwise the verdict is **no demonstrated improvement**.

The cluster interval is the one the verdict reads. The window interval is reported beside it. For A3 the paired
windows are those where A3 ran.

**The negative control (N).** Drag is negligible in MEO; every arm's density there is the theory's 1e-20 kg/m^3, so
the arms must agree:

- for every window and day, the 3D RMS of A1, A2 and A3 must equal A0's within 1e-9 relative;
- the fitted elements must equal A0's.

Any difference is a defect. It is reported, and the verdicts above are void until it is explained.

## Part D: the fit-design diagnostic (A0 only, outside the verdict)

This part never changes A0 in the verdict test. It runs on groups L1 and I, the laser spheres and the ISS.

Every variant changes one factor from D0 = A0:

- 24 h span;
- both parameters estimated;
- dense input;
- epoch at the arc start;
- the module's analytic Jacobian;
- full-force or NASA input.

| Variant | Change |
| --- | --- |
| D-span72, D-span168 | fit span 72 h and 7 days ending at E. L1: FFM carried from R's state at T over the span. I: each epoch of the span from the newest NASA file that starts at or before it. A variant window is run when the track holds at least 90 % of its epochs, and (I) when no planned burn lies in [E - span, E + 72 h]. |
| D-agomP | AGOM fixed at the public set's value, BTERM estimated: FIT.SRP_PRIOR mean 0, sigma 1e-9 m^2/kg (a type-0 set carries no radiation-pressure term) |
| D-bothP | both fixed at the public set's values: FIT.DRAG_PRIOR mean 2 B* / rho0 (rho0 = 0.15696615 kg m^-2 per Earth radius, SGP4's reference density), sigma 1e-9; SRP as D-agomP. Windows without P are not run. |
| D-bothPhys (L1 only) | both fixed at the spheres' physical values: BTERM = 2.2 A/m, AGOM = Cr A/m. The mass, diameter and Cr are B1's config.ffm.spheres. |
| D-sparse | the input thinned to an SSN-like cadence: 4 passes of 8 min each in every 24 h of the span, every input state inside a pass. The pass starts are drawn uniformly, at least 60 min apart, by xorshift128+ seeded by SHA-256 of `XA|sparse|<window>`. |
| D-epochMid, D-epochEnd | the fitted set's epoch at the input state nearest the arc middle, or at the arc's last state (module diagnostic export `sdnap_fit_epoch_diagnostic`) |
| D-fdJac | the element and drag Jacobian columns by finite differences of the theory, the module's eccentric-orbit fallback taken for every fit (module diagnostic export) |
| D-np | XP fitted directly to the laser normal points: not run. propagator/sdn-ap `fit` takes ephemerides. analysis/estimation `fit_batch` needs a provider that answers with a state and its transition matrix, and no XP provider of that kind exists. The cell says so. |

For each variant and each day, Part D reports:

- the median against P and the paired ratio variant/P, with its cluster interval;
- the paired ratio variant/D0;
- the median post-fit RMS, the module's and the scorer's.

It also reports, from the fit's covariance (the `$OMM`'s USER_DEFINED_SDNAP_COV_DRAG and SDNAP_COV_AGOM rows and its
COVARIANCE):

- the median formal sigma of BTERM and of AGOM;
- their correlation;
- the multiple correlation of each with the epoch state.

A conclusion in plain words follows. It names which factor accounts for the gap:

- the short arc and parameter correlation;
- aliasing of unmodeled short-period terms into the mean elements (seen as a span effect with a fit RMS that does not
  fall);
- the observation density;
- or something else, named.

## Figures and tables

Every figure and table names:

- its fit span;
- its observation spacing: L1 60 s full-force states, L2 and N the truth's own spacing, I 240 s;
- its truth epochs: thinned to 300 s, the ISS at 240 s.

## Outputs

Committed results are aggregates only:

- results/xp-atmosphere-ablation/table.json, generated;
- README.md, generated from it.

These stay in the store (config.store), uncommitted:

- per-window rows;
- element sets;
- `$SPW` and `$DCL` records;
- operator and laser states.

SpaceX, NASA and other operator data are not published. The results name only aggregates.

One E2E, `node experiments/xp-atmosphere-ablation/run.mjs --check`:

- rescores the first window of every group through every arm and every Part D variant;
- compares each with its stored row;
- regenerates the table to compare with the committed table.json.

Without the local records it says so and does not pass.

## Boundaries

Physics runs in the modules, at build.json's commit:

- propagator/sdn-ap: the arms, P's SGP4 and the fits;
- propagator/ffm: L1's tracks;
- analysis/density-calibration: the `$DCL`;
- analysis/gp-error-model: the scorer's axes;
- foundation/frames.

JavaScript selects records, builds the `$SPW` rows (dates, values, means) and computes the statistics. No arm is tuned
to the truth after this registration.

## Amendments

None at registration.

### A1 - 2026-10-26, before any score: the build

build.json fixes the build. It is modules main 348636447dc900e7e2feb264083ec82ec3344df5, the commit that lands
task modules-sgp4xp-atmosphere-variant-20261026, with the SHA-256 of every module the steps load. In it,
propagator/sdn-ap is 8522b88bcbac (SPEC 15, the selectable drag atmosphere). At the default it reproduces the
conformance run bit for bit: XP 72dcf6005046, control 9ecfafcd9027.

The arms read the module's own documented interface, `$PCF` FORCES on `fit` and `propagate`:

- `$SPW` rows on `space_weather`;
- one `$DCL` on `density_correction`.

Part D's epoch placements and finite-difference columns are the module's diagnostic exports
`sdnap_fit_epoch_diagnostic` and `sdnap_fit_jacobian_diagnostic`.

Nothing else changes.
