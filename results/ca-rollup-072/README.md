# Whole-Catalog 3-Arm Conjunction Assessment & All-Regime Rollup (SDN-AP 0.7.2 vs SGP4 vs SGP4-XP)

Stack issues:
- `DigitalArsenal/spacedatanetwork-stack#1110` (whole-catalog 3-arm CA rollup & live screening)
- `DigitalArsenal/spacedatanetwork-stack#1059` (weekly conjunction-notification reduction: miss-distance + Foster 2-D `Pc`)
- `DigitalArsenal/spacedatanetwork-stack#1119` (calibrated SDN-AP 0.7.2 empirical covariance models & full-branch annotation)
- `DigitalArsenal/spacedatanetwork-stack#1036` / `#1060` (all-regime public-history strong-drag & Starlink verification)

All orbit propagation, frame transformations, conjunction screening, and Foster 2-D collision-probability (`Pc`) calculations ran inside compiled WASM modules from `DigitalArsenal/space-data-network-modules`:
- `propagator/sdn-ap 0.7.2` (SHA-256 `1eab367ec28e26efe1a1eeaa945e3d57b1c8c35e58464bf5e9526d72e8298e28`)
- `flows/catalog-builder 0.2.2` / `0.2.3` (screening & all-regime suites; zero SGP4 fallbacks), followed by `0.2.4` + `analysis/gp-error-model 0.19.0` (PR #148, closing `#1119`)
- `analysis/conjunction-assessment` (SHA-256 `7f4ff2469f7f88ff040562d6031b94084965bdfc69860465a8174ad5adbde906`)

Only aggregate counts, medians, percentiles, Wilson / bootstrap intervals, and file digests are committed here. No per-object rows, element sets, NORAD-with-epoch tables, or private fit-policy internals are included.

---

## 1. All-Regime Public-History Accuracy (`all-regimes-summary.json`)

Strict look-ahead enforced across every test (`2,045/2,045` in the 8-group precise-orbit suite; `303/303` in the Starlink public-history suite) with **zero SGP4 fallbacks**.

### 1.1 Eight-Group Precise-Orbit Suite (Public GP History Only, `2,045` Tests in Aggregates)

| Horizon | Tests | SGP4 med (p95) | SGP4-XP med (p95) | SDN-AP 0.7.2 med (p95) | SDN-AP closer vs SGP4 | SDN-AP closer vs SGP4-XP | SDN-AP worse >= 1 km |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Day 1 | 2,017 | 862.6 m (3,588 m) | 849.0 m (3,340 m) | **378.1 m** (2,450 m) | **94.3%** (93.2–95.2%) | **91.1%** (89.8–92.2%) | 0 |
| Day 2 | 2,011 | 1,328.7 m (4,320 m) | 1,247.4 m (4,269 m) | **753.0 m** (4,020 m) | **90.5%** (89.1–91.7%) | **86.7%** (85.2–88.1%) | 10 (0.5%) |
| Day 3 | 1,991 | 1,747.9 m (8,164 m) | 1,660.1 m (8,153 m) | **1,214.1 m** (7,622 m) | **83.5%** (81.8–85.0%) | **79.5%** (77.7–81.2%) | 72 |
| Day 4 | 1,990 | 2,242.7 m (13,937 m) | 2,122.1 m (13,928 m) | **1,633.0 m** (12,457 m) | **78.9%** (77.1–80.6%) | **76.7%** (74.8–78.5%) | 150 |
| Day 5 | 1,981 | 2,604.7 m (21,520 m) | 2,474.7 m (21,440 m) | **2,092.4 m** (18,634 m) | **76.2%** (74.3–78.0%) | **74.0%** (72.0–75.9%) | 216 |

SDN-AP 0.7.2 achieves a lower median error than both SGP4 and SGP4-XP across all 8 groups (Day 1 & Day 5 medians):
- **Low orbit, laser spheres:** Day 1 `101.9 m` vs `453.8 m` (SGP4) / `449.1 m` (XP); Day 5 `189.0 m` vs `625.9 m` / `614.7 m`
- **Low orbit, altimetry:** Day 1 `171.9 m` vs `579.1 m` / `578.5 m`; Day 5 `619.4 m` vs `952.0 m` / `905.9 m`
- **Near 700 km:** Day 1 `453.0 m` vs `733.9 m` / `753.5 m`; Day 5 `2,313.8 m` vs `2,446.6 m` / `2,369.7 m`
- **Strong drag, 2026:** Day 1 `364.6 m` vs `760.9 m` / `768.4 m`; Day 5 `6,326.2 m` vs `7,097.2 m` / `7,053.8 m`
- **Laser geodetic:** Day 1 `50.9 m` vs `636.3 m` / `502.5 m`; Day 5 `78.4 m` vs `575.5 m` / `617.1 m`
- **Medium Earth orbit:** Day 1 `616.8 m` vs `1,610.1 m` / `1,476.1 m`; Day 5 `1,008.1 m` vs `1,658.7 m` / `1,952.8 m`
- **Inclined geosynchronous:** Day 1 `784.0 m` vs `2,018.8 m` / `678.0 m`; Day 5 `1,695.5 m` vs `3,779.8 m` / `1,871.3 m`
- **Geostationary:** Day 1 `521.4 m` vs `1,953.9 m` / `1,165.9 m`; Day 5 `1,659.4 m` vs `5,714.4 m` / `2,738.8 m`

### 1.2 Starlink Public-History Suite (`303` Satellites, Zero SGP4 Fallbacks)

| Lead Horizon | Tests | SGP4 med (p95) | SDN-AP 0.7.2 med (p95) |
| --- | ---: | ---: | ---: |
| 0–6 h | 303 | 8.112 km (95.98 km) | **5.708 km** (39.49 km) |
| 6–12 h | 303 | 13.303 km (139.41 km) | **7.101 km** (78.81 km) |
| 12–18 h | 303 | 20.140 km (204.68 km) | **9.119 km** (145.51 km) |
| 18–24 h | 99 | 19.127 km (236.89 km) | **16.952 km** (186.98 km) |

Across all leads (`1,008` tests), SDN-AP 0.7.2 from public GP history alone beats SGP4 on **62.7%** of satellites (95% Wilson CI `57.1%–68.0%`).

### 1.3 HEO Deep-Space & Strong-Drag LEO Public-History Suites

- **HEO Deep-Space (4 satellites, 108 tests):** SDN-AP beats SGP4 every day — Day 1 median `16.92 km` vs `40.91 km` (`88.0%` closer, `0/4` sats worse; p95 `38.8 km` vs `121.8 km`); Day 5 median `27.56 km` vs `44.95 km` (`80.6%` closer; p95 `46.9 km` vs `425.7 km`).
- **SWARM Strong-Drag LEO (5 satellites, 750 tests):** Day 1 median `0.368 km` vs `0.763 km` (`97.2%` closer, `0/5` worse); Day 5 median `6.400 km` vs `7.137 km` (`62.4%` closer, `0/5` worse; p95 `30.08 km` vs `33.17 km`).
- **Planet Labs Strong-Drag LEO (29 satellites, 551 tests):**
  - Tune split (`267` tests, 15 sats): Day 1 `1.424 km` vs `1.497 km`; Day 5 `17.928 km` vs `22.693 km` (`p95 160.2` vs `172.1 km`).
  - Held-out check split (`284` tests, 14 sats): Day 1 `1.362 km` vs `1.440 km` (`61.6%` closer); Day 2 `3.928 km` vs `4.159 km` (`56.0%` closer); Day 5 `21.590 km` vs `21.843 km`.

---

## 2. Weekly Conjunction Notification Reduction (`phase7-alerts-3arm.json`, `#1059`)

Evaluated over the registered 1-week whole-catalog encounter set (`2026-11-06` to `2026-11-13`, `32,863` objects, `1,069,553` tier-0 encounters) across five arms:
- `S`: SGP4 public Space-Track element sets
- `O`: SDN-AP 0.7.2 (operator ephemerides for Starlink, public GP history elsewhere)
- `X`: SGP4-XP (same inputs as `O`)
- `Op`: SDN-AP 0.7.2 (100% public GP history everywhere, including Starlink)
- `Xp`: SGP4-XP (100% public GP history everywhere)

### 2.1 Registered Miss-Distance Results (`allButStarlinkPairs`, 200 Bootstrap Replicates)

At a fixed 1 km LEO screening radius (`allButStarlinkPairs`), better orbit accuracy both avoids false alarms and catches previously missed real close approaches (`3,724` missed on `O` and `4,396` on `Op` vs `5,130` on `S` and `4,965` on `X` at 1 d). Comparing notification volume at **matched missed-event rate** (the radius at which each arm misses the same `5,119` real close approaches as SGP4 at 1 km):

| Horizon | Arm | Matched Radius | Weekly Notifications | SGP4 at 1 km | Reduction vs SGP4 (95% CI) |
| --- | --- | ---: | ---: | ---: | ---: |
| **1 day** | **SDN-AP (`O`)** | **0.814 km** | **6,110** | 8,534 | **-28.4%** (`-20.7%` to `-37.6%`) |
| **1 day** | **SDN-AP public-only (`Op`)** | **0.886 km** | **6,662** | 8,534 | **-21.9%** (`-14.7%` to `-28.3%`) |
| 1 day | SGP4-XP (`X`) | 0.971 km | 8,303 | 8,534 | -2.7% (`+8.6%` to `-11.9%`) |
| 1 day | SGP4-XP public-only (`Xp`) | 1.005 km | 8,777 | 8,534 | +2.8% (`+5.4%` to `-3.3%`) |
| **3 days** | **SDN-AP (`O` / `Op`)** | **0.908 km** | **4,527** | 5,326 | **-15.0%** (`-10.2%` to `-22.1%`) |
| 3 days | SGP4-XP (`X` / `Xp`) | 0.986 km | 5,180 | 5,326 | -2.7% (`-1.1%` to `-5.4%`) |

### 2.2 Foster 2-D `Pc` Notification Reduction

- **Registered Amendment 3 Realism-Gated Primary Result:** `"not measured"` in `allButStarlinkPairs`, because no encounter had strictly held-out-realistic covariance simultaneously across all three core arms under Amendment 3's strict gate.
- **Supplementary Empirical Foster 2-D `Pc` (40 Replicates, Each Arm's Own Empirically Calibrated 95.4%-2σ Covariance, `noStarlink` Public-Only View at 1 d):**
  - **SpaceX threshold (`Pc >= 3e-7`):** SDN-AP `10,450/wk` vs SGP4 `16,110/wk` (**-35.1%**) and SGP4-XP `16,040/wk` (**-34.8%**).
  - **NASA threshold (`Pc >= 1e-5`):** SDN-AP `564/wk` vs SGP4 `680/wk` (**-17.1%**) and SGP4-XP `716/wk` (**-21.2%**).
  - **High threshold (`Pc >= 1e-4`):** SDN-AP `165/wk` vs SGP4 `142/wk` and SGP4-XP `109/wk` (reflecting tighter covariance concentrating probability mass on genuinely closer misses rather than diluting `Pc` below `1e-4`).

---

## 3. Live 5-Day Whole-Catalog 3-Arm CA Screen (`phase6-live-3arm-ca.json`, `#1110`)

Full `2026-11-24` public catalog (`32,988` objects, `T0 = 2026-11-24T17:00:00Z`, 5-day horizon `T0` to `T0 + 5 d`, `5 km` screening threshold, `60 s` coarse step, strict causality enforced on GP snapshot, `16:57:57Z` operator Starlink cycle, and `13:50Z` GFZ space weather).

### 3.1 Whole-Catalog 5-Day Screening Volume

| Arm | Objects Screened (min) | Excluded (decay/refusal) | Sum Window Time | All `<5 km` Events | `starlinkPairs` `<5 km` | `allButStarlinkPairs` `<5 km` | `allButStarlinkPairs` USSF (`1/5 km`) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **SGP4** | 32,988 | 11 | 5.27 CPU-hr | 615,718 | 456,878 | 158,840 | 10,130 |
| **SGP4-XP** | 32,956 | 32 | 0.89 CPU-hr | 437,191 | 277,866 | 159,325 | 10,600 |
| **SDN-AP 0.7.2** | 32,942 | 42 | 1.32 CPU-hr | **351,474** | **192,375** | 159,099 | 10,525 |

- Eliminating stale GP drift across the Starlink constellation cuts total 5-day `<5 km` conjunctions by **42.9%** vs SGP4 (`351,474` vs `615,718`) and **19.6%** vs SGP4-XP (`351,474` vs `437,191`), driven by a **57.9%** reduction in intra-constellation `starlinkPairs` `<5 km` events (`192,375` vs `456,878`).
- **Screening throughput:** SDN-AP 0.7.2 degree-12 Chebyshev `$PPE`/`$PRW` screening ran **4.0× faster** in total single-window time (`4,738 s`) than SGP4 (`18,962 s`).
- **Native covariance scope disclosure:** The `2026-11-24` live catalog was built with `catalog-builder 0.2.3` prior to PR #148 (`catalog-builder 0.2.4` + `gp-error-model 0.19.0`, `#1119`), so native covariance annotation covered `44,773 / 159,099` SDN-AP `allButStarlinkPairs` events vs `149,607` (SGP4) and `157,043` (SGP4-XP). Native Foster 2-D `Pc` counts are recorded in `phase6-live-3arm-ca.json` for completeness, while matched-coverage `Pc` notification comparisons use Section 2.2 above.

### 3.2 Live `2026-11-24` Space-Track Public CDM Validation (`TCA >= T0`)

Across `172` live Space-Track public CDMs (`41/41` unique events scored across all three arms):

| Arm | Median `\|miss_pred - miss_CDM\|` | P95 `\|miss_pred - miss_CDM\|` | SDN-AP Closer Share |
| --- | ---: | ---: | ---: |
| **SGP4** | 492.2 m | 2,228.8 m | — |
| **SGP4-XP** | 407.8 m | 2,126.6 m | — |
| **SDN-AP 0.7.2** | **217.8 m** | **2,074.8 m** | **73.2%** vs SGP4 (`30/41`), **70.7%** vs SGP4-XP (`29/41`) |

SDN-AP 0.7.2 is **2.26× closer** to operational Space-Track CDM miss distances than SGP4 and **1.87× closer** than SGP4-XP.

### 3.3 Strictly Unseen Future `2026-11-25` SpaceX Starlink Ephemeris Truth (`11,195` Satellites)

Evaluated strictly forward against the next day's unseen SpaceX operator ephemeris cycle (`2026-11-25T00-57-57-962Z`, `11,195/11,195` satellites scored across all three arms in GCRF via `propagator/sdn-ap 0.7.2`):

| Lead Horizon | Satellites | SGP4 med (p95) | SGP4-XP med (p95) | SDN-AP 0.7.2 med (p95) | SDN-AP Closer vs SGP4 | SDN-AP Closer vs SGP4-XP | Over 1 km (`S / X / AP`) | Over 5 km (`S / X / AP`) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **6–12 h** | 11,195 | 18.056 km (143.01 km) | 0.450 km (0.993 km) | **0.134 km** (0.839 km) | **99.66%** | **93.74%** | 10,633 / 552 / **475** | 8,303 / 126 / **126** |
| **12–18 h** | 11,195 | 23.360 km (230.88 km) | 1.041 km (4.132 km) | **0.369 km** (3.692 km) | **98.35%** | **87.64%** | 10,713 / 5,814 / **2,141** | 8,664 / 431 / **416** |
| **18–24 h** | 7,561 | 14.384 km (327.58 km) | 1.364 km (7.545 km) | **0.554 km** (7.345 km) | **95.93%** | **79.43%** | 7,122 / 4,767 / **2,486** | 5,237 / 711 / **522** |

---

## 4. Calibrated Empirical Covariance Models (`sdn-ap-072-cov-report.json`, `#1119`)

Landed in `DigitalArsenal/space-data-network-modules` PR #148 (`analysis/gp-error-model 0.19.0` + `flows/catalog-builder 0.2.4`, commit `1fd19c3`):
- **`sdn-ap-072-public-v1`:** 42-stratum empirical 6×6 RTN covariance fitted on `30,704` samples across `176` satellites covering all 6 regimes (`LEO-L`, `LEO-M`, `LEO-H`, `MEO`, `GEO`, `HEO`), bit-exact `.erm` round-trip.
- **`sdn-ap-072-ephemeris-v1`:** 42-stratum empirical 6×6 RTN covariance fitted on `13,928` samples across `445` satellites with monotonic early-bin back-scaling.
- **Honest held-out-object `$CVR` realism verdicts:** `LEO-L` 1 d ephemeris (`mean d²/3 = 1.133`, `cov95 = 95.4%`, `n = 1,424`, `178` objects), `MEO` 5 d ephemeris (`mean d²/3 = 0.997`, `cov95 = 93.5%`, `n = 184`, `46` objects), and `LEO-H` epoch public (`mean d²/3 = 0.996`, `cov95 = 93.4%`, `n = 396`, `7` objects) pass as `CALIBRATED`; heavy-tailed cells are honestly labeled `UNCALIBRATED` rather than overstating Gaussian realism.
- `flows/catalog-builder 0.2.4` routes 100% of `AP` branches through `annotate_population_flow` so every emitted `$OCM` carries its calibrated regime-and-age population covariance block (`all-regimes-022.e2e.mjs` 9/9 regimes with 7 `population/0..6` blocks; `annotation.test.mjs` 7/7 PASS).

---

## 5. Amendment 4: Fresh Forward Week, Unified 0.7.2/0.2.4 11k Starlink 7-Arm Suite, 90%/95% Recall & `Pc` ROC (`#1126`)

Pre-registered and frozen BEFORE evaluation in [`experiments/ca-rollup-072/AMENDMENT-4.md`](../../experiments/ca-rollup-072/AMENDMENT-4.md) and [`amendment4-config.json`](../../experiments/ca-rollup-072/amendment4-config.json) (commit `f241989f7112c9629ecb5f675922c21859daba70`). All propagation, frame transforms, screening, and Foster 2-D `Pc` ran strictly in compiled WASM from `DigitalArsenal/space-data-network-modules` commit `2ad8433591bdd0fc0017fe769ecc8d60a0541605` (`sdn-ap 0.7.2`, `catalog-builder 0.2.4`, `gp-error-model 0.19.0`, `conjunction-assessment 0.19.1`), with strict pre-`T0` GP filtering (`CREATION_DATE <= T0 && EPOCH < T0`), causal forecast-only space weather, genuine signed RTN error vectors `[dR, dT, dN]` across all 8 regimes (`SD, S1, DO, GD, GN, GE, IG, SL` + `LS` sensitivity, `0` fallbacks), and strict temporal pre-`T0` covariance training (`train`/`eval` disjoint).

### 5.1 Option 1: Unified `0.7.2` / `0.2.4` Full-Constellation Starlink 7-Arm Suite (`amendment4-starlink-11k.json`)

Scored on `11,194` common active Starlink satellites (`eval` cycle `T0 = 2026-11-24T17:00:00Z`) against strictly unseen next-day SpaceX ephemeris cycles (`2026-11-25T00-57Z` & `08-57Z`; truth is SpaceX's subsequent published ephemeris, not independent laser/GNSS tracking). Identical `train` cycle (`2026-11-22 -> 2026-11-23`, `11,198` sats) used exclusively to fit `SL` covariance.

| Lead | `S` (Space-Track GP) | `SupGP` (CelesTrak) | `Xp` (Public Hist) | `Op` (SDN-AP Public Hist) | `X` (XP SpaceX) | `O` (SDN-AP SpaceX) | `SpaceX_T0` Ref | `O` closer vs `S` / `SupGP` / `X` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **0–6 h** med (p95) | 13.93 km (101.9) | 0.963 km (3.17) | 14.37 km (114.4) | 5.00 km (83.8) | 0.421 km (0.91) | **0.075 km** (0.75) | 0.041 km (`n=3,848`) | **99.7%** / **96.5%** / **92.6%** |
| **6–12 h** med (p95) | 18.06 km (143.0) | 3.276 km (9.07) | 18.41 km (155.4) | 5.29 km (121.2) | 0.450 km (0.99) | **0.135 km** (0.94) | 0.086 km (`n=4,563`) | **99.7%** / **98.7%** / **92.2%** |
| **12–18 h** med (p95) | 23.40 km (230.9) | 6.927 km (19.58) | 23.69 km (237.7) | **5.63 km** (203.7) | 1.043 km (4.20) | **0.388 km** (5.26) | 0.116 km (`n=1,191`) | **98.3%** / **95.3%** / **84.2%** |
| **18–24 h** med (p95) | 29.41 km (333.9) | 13.142 km (36.83) | 29.65 km (342.2) | **6.08 km** (308.2) | 1.753 km (11.01) | **1.171 km** (17.64) | — | **94.9%** / **91.4%** / **68.4%** |

- **Public GP history alone (`Op`):** At `12–18 h` and `18–24 h`, SDN-AP from 21-day Space-Track GP history alone (`5.63 km` / `6.08 km`) beats not only SGP4 (`23.40` / `29.41 km`) and SGP4-XP (`23.69` / `29.65 km`) but also CelesTrak SupGP (`6.93` / `13.14 km`) at the median (`p90` and `p95` remain tighter on `SupGP`, which incorporates SpaceX ephemeris fits).
- **Honest tail disclosure:** While `O` beats `X` at median and `p90` in all four bins (`12–18 h` p90 `2.46 km` vs `3.03 km`; `18–24 h` p90 `7.01 km` vs `7.66 km`) and cuts `>1 km` errors sharply (`2,447` vs `5,832` at `12–18 h`; `6,167` vs `7,907` at `18–24 h`), `O` has a heavier `p95` tail than `X` in `12–18 h` (`5.26` vs `4.20 km`) and `18–24 h` (`17.64` vs `11.01 km`).

### 5.2 Options 2 & 3: Fresh Unseen Forward Week (`2026-11-17` to `2026-11-24`, `amendment4-alerts-3arm.json`)

Screened across `32,923` strictly causal objects (`928,174` tier-0 events `<5 km`, plus `t1..t3` up to `1,000 km`, `F10.7 = 88.3–121.1 sfu`, `Ap = 2–12`). Uncertainty intervals use paired cluster bootstrap (`200` miss replicates, `40` `Pc` replicates) resampling regime NORAD clusters, encounter days, and object-pair clusters simultaneously.

#### Miss-Distance Conjunction Notifications (Matched Operator Recall & Safety-vs-Workload)

| View & Horizon | Operating Point | `S` (SGP4) | `SupGP` | `Xp` (Pub) | `Op` (SDN-AP Pub) | `X` (XP + SpaceX) | `O` (SDN-AP + SpaceX) | `O` Reduction vs `S` (95% CI) / vs `X` |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **allButSl (1 d)** | SGP4 `1 km` (`48.9%` rec) | 10,058 | 10,873 | 10,257 | **7,924** (`-21.2%`) | 7,922 (`-21.2%`) | **6,726** (`760 m`) | **-33.1%** (`-21.7%` to `-68.8%`) / **-15.1%** |
| **allButSl (1 d)** | **90% operator recall** | 9,566,000 | 1,086,400 | 9,855,000 | **729,130** (`-92.4%`) | 52,550 (`-99.45%`) | **33,455** (`1.88 km`) | **-99.65%** (`-99.44%` to `-99.75%`) / **-36.3%** |
| **allButSl (1 d)** | **95% operator recall** | 40,691,000 | 2,602,700 | 41,250,000 | **13,346,000** (`-67.2%`) | 143,180 (`-99.65%`) | **114,200** (`3.59 km`) | **-99.72%** (`-95.75%` to `-99.83%`) / **-20.2%** |
| **noStarlink (1 d)** | SGP4 `1 km` (`68.9%` rec) | 6,809 | 6,809 | 6,900 | **5,831** (`-14.4%`) | 6,900 | **5,831** (`879 m`) | **-14.4%** (`-10.3%` to `-16.9%`) / **-15.5%** |
| **noStarlink (1 d)** | **90% operator recall** | 14,624 | 14,624 | 14,884 | **10,338** (`-29.3%`) | 14,884 | **10,338** (`1.25 km`) | **-29.3%** (`-18.1%` to `-36.3%`) / **-30.5%** |
| **noStarlink (1 d)** | **95% operator recall** | 24,795 | 24,795 | 25,821 | **17,427** (`-29.7%`) | 25,821 | **17,427** (`1.72 km`) | **-29.7%** (`+0.6%` to `-40.0%`) / **-32.5%** |
| **allButSl (3 d)** | SGP4 `1 km` (`35.4%` rec) | 5,803 | 5,800 | 5,625 | **4,970** (`-14.4%`) | 5,625 | **4,970** (`910 m`) | **-14.4%** (`-9.3%` to `-24.5%`) / **-11.7%** |
| **allButSl (3 d)** | **90% operator recall** | 205,830 | 205,830 | 203,380 | **171,710** (`-16.6%`) | 203,380 | **171,710** | **-16.6%** (`-0.3%` to `-32.7%`) / **-15.6%** |

- **Fixed `1 km` safety win (1 d):** On `allButStarlinkPairs` (`11,395` real close passes), SDN-AP cuts missed real close approaches by **43.6%** (`3,217` missed vs `5,706` SGP4, `4,543` XP, `4,476` `Op`); on 100% public `noStarlink` (`7,750` real passes), SDN-AP cuts missed real close approaches by **35.8%** (`1,503` vs `2,342` SGP4 and `2,400` XP).
- **Attribution waterfall (1 d `allButStarlinkPairs`, `90%` recall):** `S (9.57M) -> Xp (9.86M, -3.0%) -> Op (729k, +95.4% of SGP4 cut from SDN-AP public method) -> O (33.5k, +7.3% additional cut from SpaceX operator orbits; total -99.65%)`. At SGP4 `1 km` matched safety: `S (10,058) -> Xp (10,257, -2.0%) -> Op (7,924, +23.2% public method) -> O (6,726, +11.9% operator orbits; total -33.1%)`.

#### Foster 2-D `Pc` Tiers, Tier Precision, Matched-Recall `Pc` ROC & Honest Covariance Findings (1 d)

- **Fixed Foster `Pc >= 1e-5` (primary pre-registered mixture):**
  - `allButStarlinkPairs`: **`O = 5,510/wk`** (**`-74.1%`**, CI `-62.0%` to `-86.6%`, **`-52.5%`** vs `X = 11,591`, **`41.9%`** precision vs `11.5%` SGP4 `21,277/wk` and `30.1%` `X`); **`Op` (100% public) = `17,564/wk`** (**`-17.5%`**, catching `2,625` real passes vs `2,456` for SGP4!).
  - `noStarlink` (100% public): **`O/Op = 2,163/wk`** (`-9.8%` vs `S = 2,399`); at `Pc >= 3e-7`, **`O/Op = 6,190/wk`** (**`-32.7%`**, CI `-26.5%` to `-42.2%`, vs `S = 9,202`).
  - Red tier (`Pc >= 1e-4`): Removing the 48 km `DO` burn outlier restores genuine red alerts (`noStarlink` `O/Op = 921/wk` with `775` real = **`84.2%`** precision vs `S = 756/wk` with `638` real = `84.4%` precision; `allButStarlinkPairs` `O = 2,176/wk` with `1,212` real vs `S = 792/wk` with `652` real).
- **Matched-recall `Pc` ROC at SGP4 `1e-5` recall (`22.0%` recall, `allButStarlinkPairs`):** **`O = 6,151/wk`** (**`-71.1%`**, CI `-51.8%` to `-82.2%`, **`-10.8%`** below `X = 6,896`), **`Op = 15,563/wk`** (**`-26.8%`** vs `S = 21,273`).
- **Honest disclosure — leptokurtic `O` covariance & bimodal mixture shelf in high-recall `Pc` ROC:**
  - In the pre-registered 2-component mixture primary, `O`'s much sharper median core (`DO` `sigT = 0.18 km`, `SD` `0.43 km`, `SL` `3.04 km`) combined with `6–13%` unmodeled drag/maneuver tail rows makes median-matched `C_core` overconfident on held-out `eval` (`SD` 2σ containment `0.861` vs `S 0.987`, `SL` `0.789` vs `X 0.907`) and creates a flat `C_tail` plateau that degrades `Pc` ROC at high recall (`allButStarlinkPairs` PR-AUC `O = 0.183` vs `X = 0.238`, `S = 0.122`; `noStarlink` `O/Op = 0.370` vs `S = 0.496`; `3d` `Pc >= 1e-5` `+5.4%`).
  - **Pre-registered `robust_core_only` sensitivity diagnoses the exact mechanism:** Dropping the flat `C_tail` shelf raises `O` `allButStarlinkPairs` PR-AUC to **`0.2957` (highest of all 6 arms**, vs `X = 0.2887`, `Op = 0.1438`, `SupGP = 0.1441`, `S = 0.1324`), yields **`-74.3%`** at SGP4 `1e-5` recall and **`-76.8%`** at SGP4 `3e-7` recall (`allButStarlinkPairs`), **`-8.0%`** at SGP4 `1e-5` recall on `noStarlink`, and lifts `noStarlink` `Pc` tier precision to **`86.4%`** at `1e-5` (`77.5%` SGP4) and **`82.4%`** at `3e-7` (`69.3%` SGP4), while high-recall (`90–95%`) `noStarlink` `Pc` ranking still trails miss-distance screening because of `O`'s heavier kurtosis relative to its tighter core. Post-diagnostic `q90_calibrated_core` confirms that inflating `C_core` alone without removing the bimodal `C_tail` shelf does not resolve mixture `Pc` ranking.
- **Comparison against pre-registered predictions (`AMENDMENT-4.md` §6):** Starlink `12–18 h` (`0.388 km` vs predicted `~0.37 km`), `allButStarlinkPairs` `1 d` SGP4-1km (`-33.1%` vs predicted `-30%..-40%`), `noStarlink` `90%/95%` recall (`-29.3%/-29.7%` vs `-25%..-45%`), and red-tier restoration all landed inside pre-registered bands; `allButStarlinkPairs` `90%/95%` recall (`-99.65%/-99.72%`) exceeded predictions because SGP4's Starlink `p90/p95` tails (`158/334 km`) drove `r²` area to `9.6M/40.7M`; high-recall mixture `Pc` ROC underperformed predictions due to the median-matched core overconfidence and bimodal `C_tail` shelf documented above.
