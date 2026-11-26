# Amendment 6 — Unified SDN-AP 0.7.5 / Catalog-Builder 0.2.7 / GP-Error-Model 0.19.3 Evaluation Plan

- **Issues:** `DigitalArsenal/spacedatanetwork-stack#1146`, `#864`, `#860`, `#866`, `#804`, `#880`, `#960`, `#910`, `#865`, `#853`, `#895`, `#961`
- **Status:** **FROZEN BEFORE EVALUATION** (`2026-11-26T02:16:00Z`)
- **Pinned `space-data-network-modules` commit:** `76139668410aae17caaf06bab0fd0a3cfca5cede`
  - `propagator/sdn-ap 0.7.5` signed WASM SHA-256: `1367e44c518cadae33753728288efe0f30aa3775f58f568e9dd762f09d92c3b5` (canonical `0a8c20bb298d2e1bca2dc1ec8c671165a154c45a2f9dcbf28c8adffb5e5661b6`)
  - `flows/catalog-builder 0.2.7` chain WASM SHA-256: `92203eab4274ace68cc38b35b8f10ae8585f28731cc1bac2cb2f6406dcfed12f`
  - `flows/catalog-builder 0.2.7` control WASM SHA-256: `33110d5269a5d9ce98a21917eb99205644cdb285c17fd45ed7611a01a55258b1`
  - `analysis/gp-error-model 0.19.3` WASM SHA-256: `5b2bdc61910c94dfcc0f3eb2d162e4e612f81483404987163cb5390fee30fbb0`
  - `analysis/conjunction-assessment 0.19.2` WASM SHA-256: `7f4ff2469f7f88ff040562d6031b94084965bdfc69860465a8174ad5adbde906`

## Changes Relative to Amendment 5 (All Frozen Before Eval Split)

1. **Bounded Thread-Safe `SlotLru` on Epoch Store (`propagator/sdn-ap 0.7.5`, `#1146`):**
   - Adds bounded `SlotLru` eviction (`evict_cov` 192 MiB / `evict_ap` 1,024 MiB), `SlotLease`, and `sdnap_epochs_cov_budget` / `sdnap_epochs_slot_budget`, eliminating full-catalog covariance OOM while preserving bit-exact propagation and covariance.
2. **Commercial GEO Minimum Arc & Maneuver-Burn-In Filter (`propagator/sdn-ap 0.7.5` + `measure-table-and-replay-075.mjs`):**
   - Applies a longer minimum arc for radiation-pressure term estimation on commercial GEO arcs so short post-maneuver intervals do not absorb maneuver impulses, and flags post-maneuver burn-in arcs consistently across arms.
3. **6-Regime Physical Covariance Calibration (`propagator/sdn-ap 0.7.5`):**
   - Updates physical covariance process-noise modeling in `sdn-ap` across all 6 regimes for balanced uncertainty scaling.
4. **Causal Strong-Drag Space-Weather Routing (`flows/catalog-builder 0.2.7`):**
   - Fixes space-weather contrast routing and stale-arc handling in the catalog builder, reducing strong-drag Day 5 tails with zero SGP4 fallbacks.
5. **Covariance Flight Parity, Tesseral Numerical Stability & Wide-Orbit Streaming (`propagator/sdn-ap 0.7.5`, `#864`, `#804`, `#860`, `#866`):**
   - Eliminates nominal-vs-covariance flight divergence (`0.000000 mm / 0.000000 um/s`), replaces `sqrt(1 - x^2)` drift with `hypot` + `fm::sincos` in `tesseral.inc`, and streams `wide_families` (`fillGrowthB = 0 B` at 100k public objects; `kWideBuildSlots = 8`, 3.4x wide-pool speedup).
6. **Matched Collision-Risk & Screening-Box ROC Diagnostics (`amendment6-alerts-eval.mjs`):**
   - Retains all Amendment 5 `< 1 km` miss-distance and `Pc` ROC outputs for continuity and reports matched collision-risk (`< 100 m` / `< 250 m`) `Pc` ROC alongside `< 1 km` screening-box probability so `Pc` is scored on its own target geometry without target-radius mismatch.
7. **Single Latest Version Only (`sdn-ap 0.7.5`):**
   - Supersedes `ca-rollup-073` across all tables, replay proofs, physical covariance confirmation, runtime/memory benchmarks, 11k Starlink 7-arm suite, fresh unseen forward week notification reduction, live 5-day 3-arm whole-catalog screen, and 10-day causal Space-Track CDM evaluation.

## Pre-Registered Evaluation Splits & Non-Leakage Rules

- **Starlink eval cycle (`2026-11-24T17:00:00Z`, unseen truth `2026-11-25T00-57Z + 08-57Z`):** evaluated once after this freeze commit on pinned `76139668410a`.
- **Public-history 8-group temporal split (`temporal_pre_t0_50_50`):** strictly chronological first half per regime = `train`, second half = `eval`. All covariance shapes, heteroscedastic bins, and Student-$t$ $\nu$ parameters are estimated strictly inside `train`.
- **Fresh unseen forward encounter week (`2026-11-17T00:00:00Z` to `2026-11-24T00:00:00Z`):** `32,923` objects seeded from `2026-11-16.json.gz` (`CREATION_DATE <= 2026-11-17T00:00:00Z`), screened through compiled `analysis/conjunction-assessment 0.19.2` across tiers `t0..t3` (`0..1,000 km`).
- **Paired cluster bootstrap:** `200` miss-distance replicates, `40` Student-$t$ `Pc` replicates, jointly resampling `(regime_norad, encounter_day, encounter_pair)`.
- **Aggregates only:** no per-object rows, element sets, NORAD-with-epoch tables, or private fit-policy names are committed under `results/ca-rollup-075/` (except `public-only-tests-0.7.5.jsonl` which matches the established rank-lookup schema used by the site).
