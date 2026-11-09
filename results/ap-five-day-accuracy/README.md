# Five-Day Multi-Tier Orbit Forecast Accuracy (`ap-five-day-accuracy`)

Aggregate benchmark results for `experiments/ap-five-day-accuracy` (`sdn-ap` 0.6.5, `MEAN_ELEMENT_THEORY = AP`).

## Summary Across Input Tiers (`+0h` to `+120h`, Cutoff `2026-11-03T00:00:00Z`)

### Tier 1 — Precise Ephemeris and Direct Range/Optical `AP` `$OCM`s vs Single-Set `SGP4`

| Family | Satellites (`n`) | `AP` `+0h` (m) | `AP` `+72h` (m) | `AP` `+120h` (m) | `SGP4` `+120h` (m) | `+120h` Gain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Geodetic laser-ranged MEO (`ILRS_SLR_MEO`) | 4 | 3.58 | 7.19 | 5.59 | 732.33 | 131.1x |
| Navigation MEO (`ESA_GNSS`) | 112 | 12.08 | 51.83 | 85.84 | 1,879.52 | 21.9x |
| Sun-synchronous meteorological POD (`SUN_SYNC_POD_LEO`) | 1 | 28.19 | 206.46 | 393.34 | 1,379.88 | 3.51x |
| Geostationary SBAS broadcast (`WAAS_SBAS_GEO`) | 2 | 4,710.59 | 7,059.64 | 10,284.90 | 21,694.81 | 2.11x |
| Low-orbit altimetry research POD (`LOW_ORBIT_ALTIMETRY`) | 6 | 26.21 | 422.55 | 1,020.08 | 1,369.36 | 1.34x |
| Sun-synchronous radar POD (`COPERNICUS_S1_POD`) | 2 | 173.46 | 2,736.40 | 4,084.09 | 5,072.82 | 1.24x |

### Tier 2 — Blind Multi-Epoch Catalog `AP` Fits (All 4 Upgrades) vs Single-Set `SGP4` (`n = 118`)

- **Round 01 baseline (`n = 115`)**: `1,064.81 m` at `+0h` to `1,894.17 m` at `+120h` (`+829.36 m` 5-day drift, `43.5%` win rate).
- **Round 50 tuned estimator (`n = 115`)**: `732.34 m` at `+0h` to `1,296.54 m` at `+120h` (`+564.20 m` 5-day drift, `53.0%` win rate).
- **All 4 structural upgrades (`n = 118`)**: `684.23 m` at `+0h` to `1,119.89 m` at `+120h` vs `1,349.26 m` on single-set `SGP4` (**`1.20x` closer**, **`+435.66 m`** / **`+63.67%`** 5-day drift vs `SGP4` **`+654.91 m`** / **`+94.32%`**, **`59.3%`** win rate, and **`85.6% / 94.1% / 98.3%`** empirical `1σ / 2σ / 3σ` 3D Mahalanobis containment).
- **Regime highlights at `+120h`**: GEO `1,102.49 m` vs `3,946.39 m` (`3.58x` closer); HEO `352.59 m` vs `532.72 m` (`1.51x` closer); MEO `1,142.99 m` vs `1,349.26 m` (`1.18x` closer); Mid LEO `2,984.74 m` vs `3,195.11 m` (`1.07x` closer).
- **Catalog-wide Low LEO (`< 525 km`, `n = 140` held-out 5-day check)**: `9,595.1 m` median vs `27,000.4 m` on single-set `SGP4` (**`2.81x` closer** median, **`3.03x` closer** 68th percentile, **`77.9%`** win rate).

## Files

- `table.json`: Three-tier `+0h..+120h` accuracy, covariance containment, and full `21,580`-object catalog verification summary.
- `ablation.json`: Cumulative step-by-step ablation of the four C++17 WebAssembly astrodynamics upgrades.
- `optimization.json`: Complete 50-round estimator progression against paired precision reference trajectories.
