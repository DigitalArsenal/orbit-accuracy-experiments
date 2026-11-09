# Five-Day Multi-Tier Orbit Forecast Accuracy, 50-Round Estimator Optimization, and Four Structural Astrodynamics Upgrades (`sdn-ap` 0.6.5)

Registered 2026-11-09 on `issue-266-ap-five-day-accuracy` (Closes `DigitalArsenal/spacedatanetwork-stack#266`). Frozen and committed before `results/ap-five-day-accuracy/` is written.

## Scope and Governing Laws

1. **Single-set separation**: An SGP4 element set flies only on SGP4 and never seeds an analytical-propagator (`AP`) state. Every `AP` `$OCM` emitted by this pipeline (`MEAN_ELEMENT_THEORY = AP`, zero `USER_DEFINED_*` parameters) is fitted by weighted batch least squares over one of three input tiers:
   - **Tier 1 — Precise ephemerides and direct range/optical observations**: Operator/agency precise ephemerides, satellite laser ranging normal points, SBAS broadcast states, or unseeded optical right-ascension/declination tracklets fitted directly under `AP` dynamics.
   - **Tier 2 / Tier 3 — Multi-epoch catalog element-set histories**: Historical multi-epoch catalogs spanning 5 to 43 days, where each historical set is evaluated *at its own epoch* through exact C++17 WebAssembly SGP4 short-periodic stripping (`build-tle-upgrades-wasm.mjs`) to recover pseudo-observations of orbital state at ascending-node or sensor-epoch crossings, then fitted simultaneously under `AP` dynamics with physically calibrated Cramér–Rao + process-noise $6 \times 6$ `UVW` covariance.
2. **Hold-list exclusion**: Objects listed in `experiments/truth-gate/flags.json` (`hold_from_headline`) are excluded from all catalog emission and headline scoring (`lib/hold-gate.mjs`).
3. **Zero per-object catalog rows**: Committed result artifacts contain aggregate regime, family, lead-time, ablation, and round statistics only — never Space-Track element sets or per-object catalog rows.

## Four Structural C++17 WebAssembly Astrodynamics Upgrades

To close the 5-day (`+0h..+120h`) propagation accuracy gap on multi-epoch catalog-only satellites without external ephemeris seeding, four structural astrodynamics upgrades are implemented in C++17 WebAssembly (`wasm32-wasip1`):

1. **Upgrade #1 — Fleet Dynamic Calibration of the Atmosphere (`$DCL`) + 27-Day Solar-Rotation Space Weather (`$SPW`)**:
   - Infers common-mode thermospheric density scale factors $\delta\rho/\rho(t, h)$ across altitude shells (`< 525 km`, `525–750 km`, `750–980 km`) from fleet drag residuals and emits canonical FlatBuffer `$DCL` and 27-day Bartels solar-rotation `$SPW` streams (`lib/space-weather.mjs`, `build-tle-upgrades-wasm.mjs`).
2. **Upgrade #2 — 135-Day Rolling Drag/SRP State-Space Estimator + Exact Tesseral Resonance De-Aliasing**:
   - Extends the archive lookback to 135 days (`2026-06-26` to `2026-11-08`), estimates time-varying ballistic ($B$) and solar-radiation-pressure ($C_R A/m$) history priors across sliding sub-arcs, and removes deep-space 12-hour and 24-hour tesseral resonance m-daily libration aliasing (`C22/S22`, `C31/S31`, `C33/S33`) during GEO/HEO/MEO mean-element fitting (`build-tle-upgrades-wasm.mjs`).
3. **Upgrade #3 — Exact SGP4-to-AP Short-Periodic De-Biasing + Autoregressive `AR(1)` Cholesky GLS Whitening**:
   - Strips exact SGP4 Brouwer/Lyddane short-periodic offsets at each element set's native epoch and whitens temporally correlated catalog determination errors via an autoregressive `AR(1)` covariance kernel $R_{ij} = \sigma_i \sigma_j [(1 - \eta)\delta_{ij} + \eta \exp(-|\Delta t_{ij}|/\tau)]$ (`build-tle-upgrades-wasm.mjs`).
4. **Upgrade #4 — Attitude-Law Macro-Model Box-Wing Solar Radiation Pressure + IERS 2010 Solid-Earth $k_2$ Body Tides**:
   - Replaces cannonball SRP on nadir/yaw-steering payloads with bus + sun-tracking solar-panel macro-model geometry (`build-tle-upgrades-wasm.mjs`) and adds frequency-independent IERS 2010 degree-2 Love-number ($k_{20}=0.30190, k_{21}=0.29830, k_{22}=0.30102$) lunisolar solid-Earth gravitational tide perturbations to the `sdn-ap` C++17 RK4 force model (`build-sdn-ap-tides-wasm.mjs`).

## Endpoints Scored (`config.json`)

- **Forecast horizons**: `+0h`, `+24h`, `+48h`, `+72h`, `+96h`, and `+120h` (5 days) after the `2026-11-03T00:00:00Z` fit cutoff against independent post-cutoff precision reference trajectories (`2026-11-03` through `2026-11-08`).
- **Metrics**: 3D position error median, 68th percentile (`p68`), 90th percentile (`p90`), RMS, `RTN` component `p68`, 5-day added propagation drift ($\mathrm{med}_{120\mathrm{h}} - \mathrm{med}_{0\mathrm{h}}$), 5-day accuracy loss percentage, head-to-head win rate vs single-set SGP4, and empirical $1\sigma / 2\sigma / 3\sigma$ 3D Mahalanobis containment (`68.3% / 95.4% / 99.7%` Gaussian targets).
- **Ablation and optimization**:
  - 50-round coordinate/hyperparameter search (`optimize-50-rounds.mjs` -> `results/ap-five-day-accuracy/optimization.json`).
  - Cumulative 4-upgrade ablation (`ablate-4-upgrades.mjs` -> `results/ap-five-day-accuracy/ablation.json`).
  - Full 3-tier 5-day benchmark and full active non-held catalog build (`benchmark-5day.mjs`, `build-full-catalog.mjs`, `summarize-results.mjs` -> `results/ap-five-day-accuracy/table.json`).
