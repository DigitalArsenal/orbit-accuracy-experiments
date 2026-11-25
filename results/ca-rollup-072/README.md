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
