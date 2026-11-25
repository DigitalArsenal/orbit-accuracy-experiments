# Amendment 4: Fresh Forward Week Conjunction Notification Reduction, Pre-T0 Signed-RTN Covariance, 90%/95% Operator Recall & Pc ROC, and Unified 0.7.2/0.2.4 Starlink Suite

Stack issue: `DigitalArsenal/spacedatanetwork-stack#1126` (extending `#1059` and `#1110`, Amendments 1–3).

**Pre-registration rule:** This amendment and `amendment4-config.json` are committed and frozen on branch `issue-1126-amendment-4` **before** any new encounter screen, Starlink 11k multi-arm build, signed-RTN vector evaluation, or alert/Pc count is computed. Every pre-registered metric, operating point, view, and sensitivity is published honestly regardless of outcome, including any metric that moves unfavorably.

---

## 1. Motivation & Root Causes Diagnosed Prior to Amendment 4

Direct inspection of `results/ca-rollup-072/phase7-alerts-3arm.json` and `experiments/ca-rollup-072/alerts-3arm.mjs` identified four methodological issues in the prior rollup:

1. **Stale pre-fix Starlink error pool (`SL`):** `alerts-3arm.mjs` read `kinds-rows-20261121T170238Z.jsonl` (from `0.6.74` / pre-PR#146 weather-horizon truncation), filtered to `n = 99` rows at 18–24 h (`p95 = 87.5 km`, `rmsKm = 52.4 km`), rather than the fixed `catalog-builder 0.2.4` + `sdn-ap 0.7.2` Starlink constellation (`n ~ 11,195`).
2. **Unrobust second-moment covariance + split leakage on `DO` (`750–2000 km`):** Two post-launch orbit-raising burns of `SENTINEL-6B` (`2025-12-09`, `346.5 km`; `2025-12-14`, `317.7 km`) landed in the 64-row `half === 0` fit split and blew the unrobust sample second moment `O DO` `sigma_T` to `48.09 km`, contaminating passive non-maneuvering debris and rocket bodies (`68.8%` of objects in `750–2000 km`) and diluting high-`Pc` alerts. Furthermore, the prior split mixed `half === 0` and `half === 1` rows in the same evaluation encounter draws rather than enforcing a strict temporal pre-`T0` training/evaluation split.
3. **Missing signed RTN vectors for `SD` and `SL`:** `VECTOR_REGIMES` covered only 6 of 8 regimes (`S1, DO, GD, GN, GE, IG`), forcing `SD` (`<600 km`) and `SL` (`Starlink`) onto borrowed band directions.
4. **Low-recall operating point only (~45% recall) & missing `Pc` ranking / baseline comparisons:** SGP4 at 1 km misses ~55% of real `<1 km` close approaches (`5,130 / 9,433`). No operational spacecraft operator screens at 45% recall. Furthermore, fixed-`Pc` counts conflate accuracy with covariance scaling unless accompanied by matched-recall `Pc` ROC ranking and tier precision, and Starlink accuracy lacked CelesTrak SupGP, same-11k public-history SDN-AP/SGP4-XP, and SpaceX's own `T0` forecast reference.

---

## 2. Gate 0: Strict Causality & Unified Build Contract

All computation runs inside compiled WASM modules from `DigitalArsenal/space-data-network-modules` commit `2ad8433591bdd0fc0017fe769ecc8d60a0541605` (zero JS orbit propagation, frame conversion, screening, or `Pc`):

- `propagator/sdn-ap 0.7.2` (`sha256: 50e79794...`)
- `flows/catalog-builder 0.2.4` (`chain sha256: 077d5b86...`, `control sha256: 97c669cf...`)
- `analysis/gp-error-model 0.19.0` (`sha256: f1228f66...`)
- `analysis/conjunction-assessment 0.19.1` (`sha256: 7f4ff246...`)

Causality rules enforced programmatically:
1. **GP publication filter:** Every Space-Track GP record is filtered strictly by `CREATION_DATE <= T0` and `EPOCH < T0`.
2. **Forecast-only space weather:** Built strictly from GFZ/NOAA observed daily indices `date <= cutoffDate` plus NOAA SWPC `sgarf.txt` 3-day forecast issued `<= cutoffDate` and causal 27-day Bartels/AR(1) persistence beyond `cutoffDate`. Zero future observed or definitive indices.
3. **Operator ephemerides:** Input SpaceX OCMs strictly `CREATION_DATE < T0`. Evaluation truth strictly from subsequent unseen SpaceX OCM cycles published after `T0` (`START_TIME > T0` or scored strictly at epochs `> T0`), labeled explicitly as **"SpaceX's next ephemeris cycle"** (not independent laser/GNSS tracking).
4. **Strict temporal pre-`T0` covariance training:** No covariance matrix or mixture parameter is ever estimated on any row used in the evaluation draws or realism audit:
   - For the 8 precise-orbit regimes (`P/SD, LS, DO, S1, GD, GN, IG, GE`, all ending `<= 2026-05-31`, ~6 months before the encounter week): rows within each regime are sorted chronologically by `startUtc` and split at the median timestamp into strictly earlier **`train`** (covariance & mixture estimation only) and disjoint later **`eval`** (held-out Mahalanobis/mixture realism check AND encounter simulation draws).
   - For Starlink (`SL`): **`train`** is the strictly earlier cycle `2026-11-22T16:57:57Z` (`T0_train = 2026-11-22T17:00:00Z`) scored against unseen `2026-11-23T00:57:57Z` & `08:57:57Z`; **`eval`** is the disjoint evaluation cycle `2026-11-24T16:57:57Z` (`T0_eval = 2026-11-24T17:00:00Z`) scored against unseen `2026-11-25T00:57:57Z` & `08:57:57Z`.

---

## 3. Option 1: Unified 0.7.2 / 0.2.4 Full-Constellation Starlink 7-Arm Suite

- **Population:** Common intersection of all active Starlink satellites present in the `2026-11-24` Space-Track GP snapshot (`CREATION_DATE <= 2026-11-24T17:00:00Z`), CelesTrak SupGP `2026-11-24/starlink/125002Z.json.gz` (published `12:50:02Z < T0`), SpaceX cycle `2026-11-24T16-57-57-960Z`, and unseen truth cycles `2026-11-25T00-57-57-962Z` & `2026-11-25T08-57-57-963Z` (`~11,195` satellites). Identical procedure on the training cycle `2026-11-22 -> 2026-11-23` (`~11,195` satellites).
- **Seven arms evaluated on identical satellites, epochs, and truth:**
  1. `S`: Space-Track GP (`CREATION_DATE <= T0`) on SGP4
  2. `SupGP`: CelesTrak SupGP (`125002Z.json.gz`, `< T0`) on SGP4
  3. `Xp`: SGP4-XP built by `catalog-builder 0.2.4` from 21-day Space-Track GP history (`CREATION_DATE <= T0`)
  4. `Op`: SDN-AP `0.7.2` built by `catalog-builder 0.2.4` from 21-day Space-Track GP history (`CREATION_DATE <= T0`)
  5. `X`: SGP4-XP built by `catalog-builder 0.2.4` from SpaceX `T0` ephemeris
  6. `O`: SDN-AP `0.7.2` built by `catalog-builder 0.2.4` from SpaceX `T0` ephemeris
  7. `SpaceX_T0`: SpaceX's own `T0` OCM forecast where defined (`0–6 h` and `6–10.5 h` up to OCM stop time)
- **Truth stitching (`T0` to `T0 + 24 h`):** Unseen `00-57Z` cycle (`T0 + 1.1 h` to `T0 + 17.1 h`) and unseen `08-57Z` cycle (`T0 + 17.1 h` to `T0 + 24.0 h`), sampled every 15 minutes in GCRF and transformed to exact signed RTN `[dR, dT, dN]` in the truth satellite's orbital frame.
- **Metrics per bin (`0–6`, `6–12`, `12–18`, `18–24 h`):** median, p90, p95, over-1 km, over-5 km, over-10 km, pairwise closer shares, plus signed RTN error vector at each bin midpoint (and 18–24 h midpoint for 1-day CA draws).

---

## 4. Option 2: Fresh Unseen Forward Encounter Week, All-Regime Signed RTN Vectors, & Class-Conditioned Robust/Mixture Covariance

### 4.1 Fresh Unseen Forward Encounter Week (`2026-11-17` to `2026-11-24`)
- Completely disjoint from `#1059`'s `2026-11-06..13` week.
- Seeded from Space-Track GP snapshot `2026-11-16.json.gz` (`32,923` objects, `max CREATION_DATE = 2026-11-16T16:36:45Z < 2026-11-17T00:00:00Z`).
- Space-weather regime of the week (GFZ observed): `F10.7 = 88.3–121.1 sfu`, `Ap = 2–12`, `Kp_max = 1.33–4.67` (low-to-moderate solar activity).
- Screened all-vs-all in TEME with `analysis/conjunction-assessment 0.19.1` (`28 × 6 h` windows, `coarseStepSec = 60`):
  - `t0`: full catalog (`1/1`), miss `0..5 km`
  - `t1-s1..s3`: `1/8` deterministic SHA-256 sample (`3` seeds), miss `5..50 km`
  - `t2-s1..s3`: `1/64` deterministic sample (`3` seeds), miss `50..300 km` (prevents upper-radius truncation at 90%/95% recall)
  - `t3-s1..s3`: `1/256` deterministic sample (`3` seeds), miss `300..1000 km`

### 4.2 Genuine Signed RTN Error Vectors Across All Regimes (Unified `0.7.2` / `0.2.4`)
- All `2,188` public-history tests (`P/SD, LS, DO, S1, GD, GN, IG, GE`) run on `catalog-builder 0.2.4` + `sdn-ap 0.7.2` with strictly causal forecast-only space weather, keeping signed RTN vectors `[dR, dT, dN]` at the middle scored epoch of Day 1 and Day 3 (plus full-day RMS) for `S`, `O/Op`, and `X/Xp`.
- Combined with Starlink (`SL`) signed RTN vectors from Section 3 (`18–24 h` midpoint for Day 1), **100% of regimes (`SD, S1, DO, GD, GN, GE, IG, SL`) use genuine signed RTN error vectors `[dR, dT, dN]`** — zero borrowed isotropic or band-direction proxies.

### 4.3 Class-Conditioned Robust Core + Maneuver/Heavy-Tail Mixture Covariance (Identical Across Every Arm)
For every arm `K ∈ {S, O, X, Op, Xp, SupGP}` (with `SupGP` equal to `S` outside `SL` and CelesTrak SupGP on `SL`), every regime `g`, and every lead `L ∈ {1, 3}`, fitted **strictly on `train`**:
1. **Robust Core `C_core`:**
   - Coordinatewise MAD scale `s_c = max(1.4826 * median(|v_c|), 1e-4 km)` for `c ∈ {R, T, N}`.
   - Standardized radius `u_i = sqrt((v_R/s_R)^2 + (v_T/s_T)^2 + (v_N/s_N)^2)`.
   - Inlier core `I`: inner `90%` of `train` rows by `u_i` (all rows if `|train| < 20`).
   - Core shape `M_core = (1/|I|) sum_{i in I} v_i v_i^T + 1e-12 * tr * I_3`; median-matched 3-D Gaussian scale `s2_core = median(v_i^T M_core^-1 v_i : i in I) / 2.365973884` (`chi2_3(0.5)`). `C_core = s2_core * M_core`.
2. **Tail / Maneuver Mixture Component `(w_m, C_tail)`:**
   - Tail set `T_out = { i in train : v_i^T C_core^-1 v_i > 17.730 }` (`3.5-sigma` 3-D ellipsoid).
   - Empirical tail weight `w_m = |T_out| / |train|`.
   - If `|T_out| >= 2`, `C_tail = (1/|T_out|) sum_{i in T_out} v_i v_i^T` with floor `C_tail = C_tail + 0.05 * C_core` (guarantees SPD); if `|T_out| === 1`, `C_tail = C_core + v_0 v_0^T`; if `|T_out| === 0`, `w_m = 0` and `C_tail = C_core`.
3. **Pre-`T0` Object Class Conditioning:**
   - From Space-Track GP `OBJECT_TYPE` and ESA DISCOS `objectClass` (known strictly before `T0`): objects are classified as `maneuverable_payload` (`OBJECT_TYPE === 'PAYLOAD'` and not passive/inactive in DISCOS) vs `passive_non_maneuvering` (`DEBRIS`, `ROCKET BODY`, `UNKNOWN`, or DISCOS passive).
   - In `DO` (`750–2000 km`), `passive_non_maneuvering` objects (`68.8%` of the shell) cannot execute commissioning thruster burns, so they receive `w_m_eff = 0` (using `C_core`), while `maneuverable_payload` objects receive the full 2-component mixture `(1 - w_m) N(0, C_core) + w_m N(0, C_tail)`. In all other regimes, both classes receive `(1 - w_m) N(0, C_core) + w_m N(0, C_tail)` because drag/SRP heavy tails affect passive objects too.
   - **Pre-registered sensitivities also reported:** (a) single-Gaussian robust `C_core` everywhere without mixture; (b) `DO` passive objects drawing errors and covariance from `LS` (`Low orbit, laser spheres`, 750–2000 km passive objects).
4. **Exact Foster 2-D Mixture `Pc`:** Computed via compiled `analysis/conjunction-assessment 0.19.1` `compute_pc` as `Pc_mix = sum_{a,b in {core,tail}} w_{A,a} w_{B,b} Pc_Foster(P_A C_{A,a} P_A^T + P_B C_{B,b} P_B^T, HBR, miss)` using ESA DISCOS / SATCAT hard-body radii.
5. **Held-out Realism Audit:** Both Gaussian core Mahalanobis χ² coverage (`1σ/2σ/3σ` against `0.683/0.954/0.997`) and 2-component mixture predictive containment are computed strictly on **`eval`** rows and reported transparently for every stratum.

---

## 5. Option 3: Pre-Registered Operating Points, `Pc` ROC, Tier Precision & Attribution Waterfall

1. **Primary views:** `allButStarlinkPairs` (headline, per Amendment 2), `noStarlink` (100% public catalog), `starlinkWithOthers`, `all`, `starlinkPairs`.
2. **Miss-distance safety-vs-workload curve & pre-registered operating points (1 d and 3 d, `allButStarlinkPairs` & `noStarlink`):**
   - **SGP4 `1 km` matched safety** (~45% recall)
   - **90% operator recall** (10% missed real `<1 km` passes)
   - **95% operator recall** (5% missed real `<1 km` passes)
   - **Fixed `1 km` radius** (both weekly notifications and missed real `<1 km` close approaches)
   - Full curve at target recalls `[0.45, 0.50, 0.60, 0.70, 0.80, 0.85, 0.90, 0.95, 0.98]`
3. **Foster 2-D `Pc` tiers, tier precision, and matched-recall `Pc` ROC (1 d and 3 d):**
   - Published tiers: `>= 1e-4` (red), `1e-5..1e-4` (yellow), `>= 3e-7` (low), with **tier precision** (count and fraction of truly `<1 km` close approaches in each tier).
   - **Matched-recall `Pc` ROC** (immune to covariance inflation or deflation): weekly notifications when each arm's `Pc` threshold is swept to match (a) SGP4's recall at `Pc >= 1e-5`, (b) SGP4's recall at `Pc >= 3e-7`, (c) **90% recall**, and (d) **95% recall** of real `<1 km` close approaches, plus PR-AUC.
4. **Attribution waterfall:** `S -> Xp (propagator) -> Op (SDN-AP public method) -> O (+ SpaceX operator orbits)`, plus `SupGP` reference where applicable.
5. **Paired cluster bootstrap CIs (`200` miss replicates, `40` `Pc` replicates):** Resamples BOTH error rows by satellite (`NORAD`) within each regime AND encounter days (7 daily blocks of `2026-11-17..24`) and object-pair clusters, with fixed SHA-256 seeds committed in `amendment4-config.json`.

---

## 6. Pre-Registered Quantitative Predictions (Using the `r²` Scaling Law)

Recorded strictly prior to running any evaluation:

| Metric | Pre-Registered Prediction | Basis / Notes |
| --- | --- | --- |
| Starlink `12–18 h` (`~11,195` sats): `O` vs `X` vs `S` | `O ~0.37 km`, `X ~1.04 km`, `S ~23.4 km`, `Op ~9–11 km`, `SupGP ~1–3 km` | `catalog-builder 0.2.4` + `sdn-ap 0.7.2` fix |
| 1 d `allButStarlinkPairs`, SGP4-1km matched (~45% recall) | `O`: `-30%` to `-40%`; `Op`: `-20%` to `-25%`; `X`: `-2%` to `-8%` | `r²` scaling with fixed `SL` (`0.55 km` vs `52 km`) |
| 1 d `allButStarlinkPairs`, **90% recall** | `O`: `-45%` to `-70%`; `Op`: `-25%` to `-45%` | Tail `q90` drives `r²` screening area |
| 1 d `allButStarlinkPairs`, **95% recall** | `O`: `-50%` to `-80%`; `Op`: `-30%` to `-50%` | Tail `q95` drives `r²` screening area |
| 1 d `noStarlink`, **90% / 95% recall** | `O/Op`: `-25%` to `-45%` | Public-history tail advantage across `SD/S1/DO/GN` |
| 1 d `Pc >= 1e-4` (red tier) | Counts rise across ALL arms once `DO` `48 km` dilution is fixed; high tier precision | Removing `48 km` dilution exposes genuine close passes |
| 1 d `Pc >= 1e-5` (fixed threshold) | Direction uncertain (`-10%` to `-35%` or flat/up on `SL` as dilution lifts) | Fixed-threshold `Pc` mixes tightening & dilution |
| 1 d **Matched-recall `Pc` ROC** (`90%`, `95%`, SGP4-matched) | `O < Op < X/S` weekly alerts at equal recall | Ranking power depends only on true orbit accuracy |

Every measured result will be published in full alongside these pre-registered predictions.
