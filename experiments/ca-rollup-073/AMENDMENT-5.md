# Amendment 5 — Unified SDN-AP 0.7.3 / Catalog-Builder 0.2.5 / GP-Error-Model 0.19.1 Evaluation Plan

- **Issue:** `DigitalArsenal/spacedatanetwork-stack#1128`
- **Status:** **FROZEN BEFORE EVALUATION** (`2026-11-25T19:43:00Z`)
- **Pinned `space-data-network-modules` commit:** `1d2cb6da1ad820a8a619771833c10d238673622f`
  - `propagator/sdn-ap 0.7.3` signed WASM SHA-256: `79d493e08e1c80611c30a464e4b71a9ac54605a5a81f9d29115972b8c19768f9` (canonical `9ddf12dd7f074dc3c616b83939e4c3d76c2a47e4fac486ef870c544624c1e258`)
  - `flows/catalog-builder 0.2.5` chain WASM SHA-256: `33b9afa23c7e27c1ac70d965c3bda7bc06806e992ba1e5bd6da671b20cccae94`
  - `flows/catalog-builder 0.2.5` control WASM SHA-256: `55b9c783ad72ff14291813d826a1d291332840e633ac424697d6499cb374aee1`
  - `analysis/gp-error-model 0.19.1` WASM SHA-256: `9bc15aa6dd0d726154e03220aeecef79cf51c69f59994098010c339a764db8a6`
  - `analysis/conjunction-assessment 0.19.1` WASM SHA-256: `7f4ff2469f7f88ff040562d6031b94084965bdfc69860465a8174ad5adbde906`

## Changes Relative to Amendment 4 (All Frozen Before Eval Split)

1. **Starlink Disturbed Short-Arc Ephemeris Protection (`flows/catalog-builder 0.2.5`):**
   - For short disturbed AP operator ephemerides (`0 < span <= 36 h`, `FIT_RMS_KM > 0.15 km`), refit the trailing half-arc keeping strictly positive `LOG_NORMAL` `BTERM`, accepting if `tr_rms < 0.65 * rms` and `tr_bterm <= max(0.25, bterm * 1.5)`.
   - For active retrograde lowering / deorbit thrust (`BTERM > 0.15 m^2/kg`), refit under constant-flux `JACCHIA70` (`THEORY_FLUX_MODEL`) so forecast geomagnetic jumps do not spuriously modulate ion thrust (accept if `jf_rms <= rms * 1.25`).
2. **Smooth Multivariate Student-$t_\nu$ `Pc` & Pre-`T0` Heteroscedastic Covariance Conditioning (`analysis/gp-error-model 0.19.1` + `amendment5-alerts-eval.mjs`):**
   - Replaces Amendment 4's bimodal `C_core + C_tail` mixture (whose flat tail plateau degraded high-recall non-Starlink `Pc` ranking) with a smooth multivariate Student-$t_\nu$ scale mixture (`Sigma_t`, $\nu$ selected by 5-fold cross-validation strictly inside the `train` split over $\nu \in \{2, 2.5, 3, 4, 6, 10, 30\}$, zero `eval` leakage).
   - Evaluates exact Student-$t_\nu$ collision probability via 8-point shifted generalized Gauss-Laguerre quadrature calling compiled `analysis/conjunction-assessment 0.19.1` `FOSTER-2D` WASM (`< 1e-6` relative error across `d = 0..50 sigma`), requiring zero SDS schema changes.
   - Applies strictly causal, monotonic pre-`T0` observable heteroscedastic conditioning (`FIT_RMS_KM`, active-thrust `BTERM`, and LEO-L forecast `AP_AVG >= 30`), reporting homoscedastic Student-$t$, Gaussian core-only, and passive-DO sensitivities beside the primary result.
3. **Causal Weather-Contrast Guard for Strong-Drag Public History (`flows/catalog-builder 0.2.5`):**
   - Replaces the `[-84 h, +36 h]` storm refit with a strictly causal space-weather contrast check across Day 2 (`[-3 d, +1.5 d]` vs `(+1.5 d, +5 d]`): when `|dF107| > 12`, `|dAp| > 8`, or `apJump > 20`, fits `[-36 h, +120 h]` directly.
4. **Unified Single-Version Rollup (`sdn-ap 0.7.3`):**
   - All measurements (8-group public-history accuracy, 12-class precise-orbit accuracy table & zero-diff public replay proof, physical covariance confirmation, runtime speed/memory, 11k Starlink 7-arm suite, fresh unseen forward week conjunction notification reduction, live 5-day 3-arm whole-catalog screen with ~100% native `$OCM` covariance, and 10-day causal Space-Track public CDM scoring) run on the exact same pinned `sdn-ap 0.7.3` / `catalog-builder 0.2.5` / `gp-error-model 0.19.1` builds.

## Pre-Registered Evaluation Splits & Non-Leakage Rules

- **Starlink eval cycle (`2026-11-24T17:00:00Z`, unseen truth `2026-11-25T00-57Z + 08-57Z`):** untouched prior to this freeze commit; evaluated once after freeze.
- **Public-history 8-group temporal split (`temporal_pre_t0_50_50`):** strictly chronological first half per regime = `train`, second half = `eval`. All covariance shapes, heteroscedastic bins, and Student-$t$ $\nu$ parameters are estimated strictly inside `train`.
- **Fresh unseen forward encounter week (`2026-11-17T00:00:00Z` to `2026-11-24T00:00:00Z`):** `32,923` objects seeded from `2026-11-16.json.gz` (`CREATION_DATE <= 2026-11-17T00:00:00Z`), screened through compiled `analysis/conjunction-assessment 0.19.1` across tiers `t0..t3` (`0..1,000 km`).
- **Paired cluster bootstrap:** `200` miss-distance replicates, `40` Student-$t$ `Pc` replicates, jointly resampling `(regime_norad, encounter_day, encounter_pair)`.
- **Aggregates only:** no per-object rows, element sets, NORAD-with-epoch tables, or private fit-policy names are committed under `results/ca-rollup-073/`.
