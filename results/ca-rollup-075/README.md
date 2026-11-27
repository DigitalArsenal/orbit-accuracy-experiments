# SDN-AP 0.7.5 + CA 0.19.3 Rollup & CelesTrak SOCRATES Plus Comparison

**Builds:**
- `propagator/sdn-ap` `0.7.5` (`a3337aad678ccef996238d2a23aa08eaab1f3dede4a2904078303d732318be5d`, signed public bundle)
- `flows/catalog-builder` `0.2.7`
- `analysis/conjunction-assessment` `0.19.3` (`ebab8b970166...`, signed bundle)

---

## 1. Phase 1: Cleaned Accuracy, Supplemental GP, Modeled Screening, and Uncertainty Audit

### Public Space-Track GP Only (`public-only-tests-0.7.5.json`)
- **Exclusions & floors:** 2 day-1 >300 km fault rows on `SENTINEL-6B` excluded per `docs/catalog-pass-conditions.md` §3.7; `Near 700 km` (`2 < 5` satellites) marked `not measured` and excluded from totals.
- **Totals across 7 measured groups (`52` distinct satellites):**
  - **Day 1 (`n = 1,756`):** Space-Track GP → SGP4 `897.27 m` (p95 `3,730.7 m`) | Space-Track GP → SGP4-XP `862.40 m` | Space-Track GP → SDN-AP **`410.26 m`** (p95 `2,507.67 m`), `94.53%` closer, `51/52` sats, `0` worse >=1 km.
  - **Day 5 (`n = 1,722`):** Space-Track GP → SGP4 `2,647.26 m` (p95 `23,388.5 m`) | Space-Track GP → SGP4-XP `2,495.57 m` | Space-Track GP → SDN-AP **`1,988.43 m`** (p95 `21,844.24 m`), `80.31%` closer, `48/52` sats (`SWARM B`, `BD-2-G7`, `QZS-2`, `LARES-2` worse; `23` tests worse >=1 km).

### GPS & GLONASS beside CelesTrak SupGP (`supgp-comparison-0.7.5.json`, schema `sdn-ap-supgp-comparison-2`)
- Added causal `Space-Track GP → SGP4-XP` and retrospective `ESA → SGP4-XP`; excluded 2 §3.7 day-1 faults; explicitly disclosed ESA-input arms as retrospective.
- **GPS (`32` sats, `127` clean tests, day 3):** ST GP → SGP4 `1,314 m` | ST GP → SGP4-XP `1,174 m` | ST GP → SDN-AP `687 m` | **CelesTrak SupGP → SGP4 `576 m`** (beats GP → SDN-AP) | ESA (retro) → XP `74.9 m` | ESA (retro) → SDN-AP `2.15 m`.
- **GLONASS (`20` sats, `76` clean tests, day 3):** ST GP → SGP4 `1,805 m` | ST GP → SGP4-XP `1,666 m` | ST GP → SDN-AP `1,415 m` | **CelesTrak SupGP → SGP4 `1,005 m`** | ESA (retro) → XP `78.3 m` | ESA (retro) → SDN-AP `4.33 m`.

### Modeled Screening Simulation (`amendment6-alerts-3arm.json`)
- Third-look development simulation (with paired 95% cluster CIs; Pc withheld). Cleanly separated fixed `1 km` LEO vs fixed `5 km` non-LEO:
  - **LEO fixed `1 km` (`allButStarlinkPairs`, `11,167` real passes):** GP → SDN-AP cuts missed close passes by `19.13%` (`[15.06, 23.34]%`); SpaceX+GP → SDN-AP cuts misses by `41.51%` (`[37.50, 45.72]%`). Non-Starlink subset (`7,522` real passes): GP → SDN-AP cuts misses by `31.90%` (`[22.04, 39.67]%`).
  - **Non-LEO fixed `5 km` (`228` real passes):** `4` vs `2` misses, CI `[-631.3, 100]%` (statistically indistinguishable).

### Live 5-Day Unscored 3-Arm Screen (`live-ca-screen-0.7.5.json`)
- **All pairs (`5 d, 5 km`):** SGP4 `615,718` | SGP4-XP `437,396` | SDN-AP `336,052`.
- **All pairs excluding Starlink-Starlink (`5 d, 5 km`):** SGP4 `158,840` | SGP4-XP `159,530` | SDN-AP `158,732` (confirming ~100% of overall volume drop is Starlink-Starlink pairs).
- **Single-day live CDM check (`57` events):** SGP4 `540 m`, SGP4-XP `499.3 m`, SDN-AP `293.8 m` (`70.18%` closer than SGP4).

### Uncertainty Audit (`confirmation-0.7.5.json`)
- Enforced both `minDistinctSatsPerCell = 5` and `minSamplesPerCell = 50` (every GEO cell `42–45 < 50` reads `not measured`). Only `spheres_750_2000` (`n = 53`, `6` sats) passes days 1–2; day 3 and MEO do not pass.

---

## 2. Phase 3A: Direct CelesTrak SOCRATES Plus Same-Input Screening Parity (`socrates-parity-ca0193.json`)

- **Run:** Archived `2026-10-28T17:00:00Z` CelesTrak SOCRATES Plus (`7 d`, `5 km`, `193,952` published rows, `24,391/24,391` Space-Track GP editions matched, `16,818` active primaries).
- **Module:** Signed `analysis/conjunction-assessment` `0.19.3` (`ebab8b970166...`).
- **Verdict: `PASS`** (`101.77 min`):
  - **Primary cataloged active-payload pairs:** `126,077 / 126,077` (`100%` recall, `0` misses; median miss diff `0.2501 m`, max `0.50007 m`, `0` beyond tolerance; median TCA diff `0.2414 ms`, max `2.1324 ms`, `0` beyond `10 ms`).
  - **Temporary analyst IDs (`>= 100,000`):** `67,844 / 67,844` (`100%` recall, `0` misses).
  - **Window-boundary edge rows:** `31 / 31` recovered; `1,146` unexplained extras disclosed in A3.
  - **Baseline diff vs `CA 0.12.0/0.17.0`:** **`958,800 / 958,800` exact bit-for-bit identical** (`maxDt = 0`, `maxDMiss = 0`, `maxDSpeed = 0`).

---

## 3. Phase 3B: Preregistered Multi-Arm SOCRATES Plus Comparison (`socrates-comparison-0.7.5.json`)

Preregistered prior to scoring (`experiments/ca-socrates-comparison-075/{PLAN.md,REGISTRATION.json}`, commit `e816e74637b0`).

### Part B1: 7-Day Independent Orbit Accuracy on Archived `2026-10-28` SOCRATES Plus Run
- **GNSS (`115` distinct satellites, `2` §3.7 faults excluded, ESA/ESOC final truth, Space-Track GP only):**
  - Day 1: SOCRATES GP → SGP4 `1,463 m` (p95 `3,743 m`) | GP → SGP4-XP `1,424 m` | GP → SDN-AP **`836 m`** (p95 `3,044 m`), `89/115` closer.
  - Day 7: SOCRATES GP → SGP4 `2,477 m` (p95 `8,386 m`) | GP → SGP4-XP `2,331 m` | GP → SDN-AP **`1,530 m`** (p95 `6,073 m`), `93/114` closer.
- **Sentinel-1C/1D TCA diagnostic (`2 < 5` sats, `22` SOCRATES TCAs):** SOCRATES SGP4 `1,897 m` vs GP → SDN-AP `1,733 m` (`11/22` closer).
- **`cdm_public` scope audit:** `111/112` unique events in the 7-day window had zero active payloads; `0/112` overlapped SOCRATES Plus.

### Part B2: 5-Day 7-Arm Scored Screening on Archived `2026-11-22` SOCRATES Plus Run
- **Window:** `2026-11-21T10:00:00Z .. 2026-11-26T10:00:00Z` (`120 h`, `11,204` Starlinks in both pre-T0 SpaceX `08:57:57Z` and GP `<= 08:56:21Z`, `11,204/11,204` covered by causal CelesTrak SupGP `02:20:01Z`, `34,336` published SOCRATES-included rows).
- **Control parity check:** `CA 0.19.3 SGP4 control` matched `34,258 / 34,327` (`99.80%`) published SOCRATES Plus interior rows (`0.322 m` median miss diff).
- **Truth disclosure:** Stitched post-event 8-hourly SpaceX ephemerides (`0–8 h` freshness) screened directly by `CA 0.19.3` (operator self-consistency, NOT independent laser/radar tracking).
- **SOCRATES-included Starlink pairs `< 5 km` (`24 h` / `3,144` truth passes; `120 h` / `15,324` truth passes, 500-rep primary-NORAD cluster bootstrap 95% CIs):**

| Arm (`Input → Propagator`) | 24h Hits / Miss / FP | 24h Recall / Prec | 120h Hits / Miss / FP | 120h Recall / Prec | 120h FP Cut vs SOCRATES | 120h Med Miss Err |
|---|---:|---:|---:|---:|---:|---:|
| Published SOCRATES Plus (`GP → SGP4`) | 481 / 2,663 / 3,418 | 15.3% / 12.3% | 937 / 14,387 / 33,379 | 6.1% / 2.7% | 0.0% | 494.1 m |
| Control `CA 0.19.3` (`GP → SGP4`) | 482 / 2,662 / 3,410 | 15.3% / 12.4% | 938 / 14,386 / 33,327 | 6.1% / 2.7% | +0.2% | 494.1 m |
| `CelesTrak SupGP → SGP4` | 972 / 2,172 / 2,719 | 30.9% / 26.3% | 1,202 / 14,122 / 48,342 | 7.8% / 2.4% | **-44.8%** (more FP) | 390.7 m |
| `Space-Track GP → SGP4-XP` | 473 / 2,671 / 3,496 | 15.0% / 11.9% | 934 / 14,390 / 33,364 | 6.1% / 2.7% | +0.0% | 486.0 m |
| **`Space-Track GP → SDN-AP 0.7.5`** | **925 / 2,219 / 2,805** | **29.4% / 24.8%** | **2,816 / 12,508 / 20,996** | **18.4% / 11.8%** | **+37.1% [34.7, 39.5]%** | **412.7 m** |
| `SpaceX ephemeris → SGP4-XP` | 1,730 / 1,414 / 845 | 55.0% / 67.2% | 3,050 / 12,274 / 15,502 | 19.9% / 16.4% | +53.6% | 286.5 m |
| **`SpaceX ephemeris → SDN-AP 0.7.5`** | **2,188 / 956 / 806** | **69.6% / 73.1%** | **3,903 / 11,421 / 15,388** | **25.5% / 20.2%** | **+53.9% [52.0, 55.7]%** | **185.9 m** |

- **Physical limit under `1 km`:** Over 24h (`15` truth passes) and 120h (`92` truth passes), SOCRATES Plus caught `0` and `0`, `Space-Track GP → SDN-AP` caught `0` and `1`, and `SpaceX ephemeris → SDN-AP` caught `5` and `8` (`53–58 m` median miss error).
