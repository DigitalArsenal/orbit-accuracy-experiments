# Complete Zero-Exclusion Orbit Accuracy and Compute Suite (`propagator/sdn-ap` 0.6.5)

## Purpose

Measure forecast accuracy and single-thread compute speed of `propagator/sdn-ap` `0.6.5` across **every** orbit regime, test case, and satellite family in the archive (`20` regimes total: `12` precise-orbit truth regimes and `8` operator, constellation, and analysis-center next-file regimes), with **zero excluded regimes, zero withheld missions, and zero dropped propagator columns**.

##Pinned Module Builds

| Arm | Module | Version | Commit / Provenance |
| --- | --- | --- | --- |
| `AP` | `propagator/sdn-ap` | `0.6.5` | `3a3661eaf9caa84fc776a9959494e1ca14358db1` (`ca5515048baf`, bundle `f0b8352a43f3`) |
| `XP` | `propagator/sdn-ap` (whiteroom `SGP4XP`) | `0.6.5` | `3a3661eaf9caa84fc776a9959494e1ca14358db1` (`ca5515048baf`, bundle `f0b8352a43f3`) |
| `XPU` | `propagator/sgp4-xp` | `0.2.1` / `0.2.2` | Registered Space Force `SGP4-XP` build (`890c8655` / `a119918b`) |
| `SGP4` | `propagator/sgp4` + `od/sgp4-fit` | `1.4.1` / `0.1.3` | Registered `SGP4` baseline (`890c8655`) |
| `FFM20` | `propagator/ffm` (`20x20`, `RK78`) | `2.2.0` | Registered `FFM` `20x20` configuration (`2d0a9e77`) |
| `FFM40` | `propagator/ffm` (`40x40`, `RK78`) | `2.2.0` | Registered `FFM` `40x40` configuration (`2d0a9e77`) |

## Zero-Exclusion Regime and Family Inventory (All 20 Regimes)

### Part A — 12 Precise-Orbit Truth Regimes (`reference: precise-orbit`)

1. `T` — **Strong drag, 2025**: Swarm A, Swarm B, Swarm C, Research satellite 1, Research satellite 2 (`24 h` fit, lead days `1, 2, 3, 5, 7`).
2. `P` — **Strong drag, 2026**: Swarm A, Swarm B, Swarm C, Research satellite 1, Research satellite 2 (`24 h` and `72 h` fits, lead days `1, 2, 3, 5, 7`).
3. `S1` — **Near 700 km**: Sentinel-1A, Sentinel-1C (`24 h` and `72 h` fits, full cohort and step-free subset, lead days `1, 2, 3, 5, 7`).
4. `LS` — **Low orbit, laser spheres**: Ajisai, Starlette, Stella, WESTPAC, LARES, LARETS (`24 h` and `72 h` fits, lead days `1, 2, 3, 5, 7`).
5. `DO` — **Low orbit, altimetry**: Jason-3, Sentinel-3A, Sentinel-3B, Sentinel-6A, Sentinel-6B, SARAL, SWOT, CryoSat-2, HY-2C, HY-2D (`24 h` and `72 h` fits, lead days `1, 2, 3, 5, 7`).
6. `GD` — **Laser geodetic**: LAGEOS-1, LAGEOS-2, Etalon-1, Etalon-2, LARES-2 (`72 h` fit, lead days `1, 2, 3, 5, 7`).
7. `GN` — **Medium Earth orbit**: All `11` GNSS satellites (`5` baseline multi-GNSS satellites plus all `6` Galileo FOC cohort satellites previously held out, `24 h` and `72 h` fits, lead days `1, 2, 3, 5, 7`).
8. `IG` — **Inclined geosynchronous**: BeiDou and QZSS IGSO cohort (`72 h` fit, lead days `1, 2, 3, 5, 7`).
9. `GE` — **Geostationary**: BeiDou and QZSS GEO cohort (`72 h` fit, lead days `1, 2, 3, 5, 7`).
10. `WA` — **Geostationary, commercial (WAAS)**: Eutelsat 117 West B, SES-15, Galaxy 30 (`24 h` and `72 h` fits, lead days `1, 2, 3, 5, 7`).
11. `HX` — **Highly elliptical, THEMIS and Chandra**: THEMIS-A, THEMIS-D, THEMIS-E, Chandra (`72 h` and `336 h` fits freshly flown on `sdn-ap` `0.6.5`, lead days `1, 2, 3, 5, 7`).
12. `HE` — **Highly elliptical (TESS)**: TESS (`72 h` and `336 h` fits freshly flown on `sdn-ap` `0.6.5` on both ten-minute kernel nodes `NN` and chord-filled `CC` series, lead days `1, 2, 3, 5, 7`).

### Part B — 8 Operator, Constellation, and Analysis-Center Ephemeris Regimes (`reference: operator-file`)

Every next-file regime is freshly fitted and flown on `propagator/sdn-ap` `0.6.5` (`AP` and whiteroom `XP`) and joined with `SGP4`, `XPU`, `FFM`, and the operator/center baseline so zero columns are dropped:

13. `STARLINK` — **Low orbit, maneuvering**: SpaceX Starlink constellation (`24 h` and `48 h` fits, leads `12 h, 24 h, 36 h`).
14. `CREWED` — **Low orbit, crewed**: NASA ISS and China Space Station (`24 h` and `48 h` fits).
15. `PLANET` — **Low orbit, imaging fleet**: Planet Flock constellation (`24 h` and `48 h` fits).
16. `GEO_SK` — **Geostationary, station-kept**: Intelsat and SES commercial GEO fleet (`24 h` and `48 h` fits).
17. `ULTRA_NAV` — **Navigation, ultra-rapid**: ESA GPS and GLONASS ultra-rapid products (`24 h` and `48 h` fits).
18. `CPF_LEO` — **Low orbit, laser centers**: ILRS CPF low-orbit predictions (`48 h` and `72 h` fits, leads `24 h` to `168 h`).
19. `CPF_NAV` — **Navigation, laser centers**: ILRS CPF navigation predictions (`48 h` and `72 h` fits, leads `24 h` to `168 h`).
20. `CPF_GEO` — **Geodetic, laser centers**: ILRS CPF geodetic predictions (`48 h` and `72 h` fits, leads `24 h` to `168 h`).

## Part C — Single-Thread Speed Across All 20 Regimes (`propagator/sdn-ap` 0.6.5)

On representative valid arcs from **every one of the 20 regimes**, measure single-thread `process.cpuUsage()` (user + system CPU, median over `3` calibrated bursts of at least `150 ms` CPU per burst while `1`-minute host load sits below `22.83`) at both **`300 s`** (`288` states/day) and **`60 s`** (`1,440` states/day) output step sizes:

- **Fit CPU** (`ms` per object-day of fit input): `AP 0.6.5`, `XP 0.6.5`, `XPU 0.2.2`, `SGP4 1.4.1`, and `FFM 2.2.0` (`20x20` / `40x40`).
- **`$OEM` Plugin Flight CPU** (`ms` per object-day and `µs` per state, full `$OCM -> $OEM` FlatBuffer round-trip with `6x6` covariance): `AP 0.6.5`, `XP 0.6.5`, `XPU 0.2.2`, `SGP4 1.4.1`, `FFM 20x20`, `FFM 40x40`.
- **Direct WASM Kernel Covariance Flight (`sdnap_covariance_at`)** (`ms` per object-day and `µs` per state, TEME state + `6x6` covariance in a single WASM call): `AP 0.6.5` and `XP 0.6.5`.
- **Direct WASM Kernel State-Only Flight (`sdnap_epochs_set_at`)** (`ms` per object-day and `µs` per state, TEME state-only): `AP 0.6.5` and `XP 0.6.5`.

## Output and Verification

- Intermediate per-window and per-pair rows write only to the local archive store; committed outputs are `results/ap-all-regimes-suite/table.json` and `results/ap-all-regimes-suite/README.md` (aggregate statistics only, zero element sets, zero five-digit catalog IDs, zero local paths).
- `node experiments/ap-all-regimes-suite/run.mjs --check` regenerates `table.json` and `README.md` deterministically from the archive store and verifies all `20` regimes have both accuracy and `0.6.5` speed cells with zero exclusions (`AP 0.6.5` faster than `XP 0.6.5` across all `17` `NRLMSISE-00` `e <= 0.3` covariance regimes and all `18` `e <= 0.3` state-only regimes, and faster than `FFM 20x20` across all `20` regimes including `WA`, `HX`, and `HE`).
