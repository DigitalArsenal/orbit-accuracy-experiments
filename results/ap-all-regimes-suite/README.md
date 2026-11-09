# Complete Zero-Exclusion Orbit Accuracy and Compute Suite (`propagator/sdn-ap` 0.6.5)

Plan: `experiments/ap-all-regimes-suite/PLAN.md`. Shipped module: `propagator/sdn-ap` `0.6.5` (`3a3661eaf9ca`, canonical WASM `ca5515048baf`, signed bundle `f0b8352a43f3`).

- **Regimes & satellite families covered**: **20 of 20** (`12` precise-orbit truth regimes + `8` operator, constellation, and analysis-center next-file regimes; **0 exclusions**, **0 dropped columns**).
- **300 s step compute median across all 20 regimes** (`288` states/object-day): `AP` direct WASM `6x6` covariance **`0.855 ms`** vs whiteroom `XP` **`5.21 ms`** (**`6.25x`** faster; range **`0.085x`–`9.33x`**); `AP` state-only **`0.196 ms`** vs `XP` **`0.296 ms`**; `$OEM` plugin round-trip `AP` **`1.35 ms`** vs `XP` **`5.98 ms`**, `XPU` **`8.25 ms`**, `FFM 20x20` **`141.5 ms`**, `FFM 40x40` **`947.7 ms`**.
- **60 s step compute median across all 20 regimes** (`1,440` states/object-day): `AP` direct WASM `6x6` covariance **`3.05 ms`** vs `XP` **`22.59 ms`** (**`7.42x`** faster); `AP` state-only **`0.689 ms`**; `$OEM` plugin `AP` **`4.83 ms`** vs `XP` **`26.67 ms`**.

## Part A — 12 Precise-Orbit Truth Regimes (Median and 95th Percentile 3D Error, km)

| ID | Regime | Fit / Lead | Cases | `AP 0.6.5` | `XP 0.6.5` | `XPU` | `SGP4` | `FFM` | `AP` Cov `300 s` (ms/d) | `XP` Cov `300 s` (ms/d) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `T` | Strong drag, 2025 | `24h / 72h` | 944 | 2.125 (8.589) | 11.211 (24.103) | 12.426 (26.309) | 12.205 (25.526) | 1.741 (8.325) | 0.954 | 6.23 |
| `P` | Strong drag, 2026 | `24h / 72h` | 750 | 1.836 (8.374) | 11.215 (22.759) | 12.434 (24.68) | 11.905 (24.541) | 1.577 (8.093) | 0.945 | 5.07 |
| `S1` | Near 700 km | `72h / 72h` | 300 | 0.9101 (4.469) | 1.383 (5.964) | 1.352 (6.031) | 1.726 (6.491) | 0.9337 (4.453) | 0.881 | 5.12 |
| `LS` | Low orbit, laser spheres | `72h / 72h` | 90 | 0.0578 (0.3176) | 0.6238 (1.852) | 0.6256 (1.88) | 0.8242 (2.18) | 0.0532 (0.2504) | 0.833 | 5 |
| `DO` | Low orbit, altimetry | `72h / 72h` | 138 | 0.2527 (7.478) | 0.9597 (7.478) | 1.009 (7.594) | 1.221 (10.436) | 0.0932 (7.423) | 0.852 | 6.1 |
| `GD` | Laser geodetic | `72h / 72h` | 55 | 0.008462 (0.0128) | 0.1078 (0.162) | 0.1087 (0.1663) | 0.4174 (0.9393) | 0.003691 (0.009534) | 0.575 | 5.24 |
| `GN` | Medium Earth orbit | `72h / 72h` | 822 | 0.0264 (0.1028) | 0.0732 (0.1547) | 0.076 (0.1549) | 0.9338 (1.847) | 0.014 (0.1022) | 1.24 | 5.02 |
| `IG` | Inclined geosynchronous | `72h / 72h` | 60 | 0.0171 (0.0943) | 0.0787 (0.1322) | 0.0883 (0.1439) | 5.764 (9.223) | 0.007488 (0.0965) | 0.851 | 5.41 |
| `GE` | Geostationary | `72h / 72h` | 45 | 0.0459 (4.687) | 0.0699 (4.697) | 0.089 (4.73) | 5.527 (10.032) | 0.0643 (4.668) | 0.738 | 5.18 |
| `WA` | Geostationary, commercial (WAAS) | `72h / 72h` | 84 | 9.592 (14.935) | 9.604 (14.897) | 9.592 (14.827) | 24.365 (46.634) | 9.588 (14.897) | 6.41 | 5.53 |
| `HX` | Highly elliptical, THEMIS and Chandra | `72h / 72h` | 19 | 0.4042 (3.566) | 2.182 (4.952) | 2.992 (4.95) | 56.381 (374.6) | 0.0426 (3.435) | 77.84 | 6.6 |
| `HE` | Highly elliptical (TESS) | `72h / 72h` | 7 | 2.426 (6.495) | 2.491 (6.597) | 7.226 (14.392) | 7706.9 (13155.8) | 1.622 (4.272) | 52.62 | 5.03 |

## Part B — 8 Operator, Constellation, and Center Next-File Regimes (Median and 95th Percentile 3D Error, km)

| ID | Regime | Fit / Lead | Pairs | `AP 0.6.5` | `XP 0.6.5` | `XPU` | `SGP4` | `FFM` | `Operator / Center` | `AP` Cov `300 s` (ms/d) | `XP` Cov `300 s` (ms/d) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `STARLINK` | Low orbit, maneuvering | `24h / 24h` | 1,673 | 0.8672 (8.584) | 1.115 (8.212) | 1.116 (8.225) | 1.398 (5.969) | 1.223 (11.811) | 0.6215 (5.829) | 0.86 | 5.97 |
| `CREWED` | Low orbit, crewed | `24h / 48h` | 40 | 1.246 (6.523) | 4.617 (8.277) | 4.027 (8.188) | 4.051 (8.301) | 0.7487 (6.764) | 1.172 (6.837) | 0.858 | 4.83 |
| `PLANET` | Low orbit, imaging fleet | `24h / 24h` | 2,260 | 0.7303 (10.837) | 1.02 (9.681) | 0.8909 (6.926) | 0.8452 (3.556) | 0.7128 (11.441) | 0.7086 (11.858) | 0.88 | 6.19 |
| `GEO_SK` | Geostationary, station-kept | `48h / 72h` | 903 | 4.966 (73.621) | 4.96 (73.614) | 4.793 (72.824) | 6.475 (72.114) | 4.835 (72.784) | 5.977 (52.758) | 0.702 | 3.07 |
| `ULTRA_NAV` | Navigation, ultra-rapid | `24h / 48h` | 4,236 | 0.0332 (0.0624) | 0.0676 (0.1433) | 0.0883 (0.2196) | 0.7236 (1.579) | 0.003481 (0.0191) | — | 0.596 | 5.56 |
| `CPF_LEO` | Low orbit, laser centers | `48h / 72h` | 7,404 | 0.052 (1.973) | 0.6191 (2.522) | 0.6541 (3.072) | 0.6211 (3.628) | 0.035 (2.495) | 0.0276 (2.08) | 0.839 | 5.97 |
| `CPF_NAV` | Navigation, laser centers | `48h / 72h` | 8,871 | 0.0351 (0.0972) | 0.0603 (0.1335) | 0.0529 (0.1227) | 0.4372 (2.687) | 0.011 (0.0485) | 0.001181 (0.0535) | 0.777 | 4.79 |
| `CPF_GEO` | Geodetic, laser centers | `48h / 72h` | 3,124 | 0.008062 (0.0429) | 0.0601 (0.2089) | 0.0666 (0.2087) | 0.2929 (0.7884) | 0.0009095 (0.0434) | 0.0009753 (0.0374) | 0.774 | 4.9 |

## Part C — `0.6.5` Equivalence Check Against Stored `0.5.1` Precise-Orbit Flights

| Group | Fit (h) | Lead Day | Stored `AP` (km) | `AP 0.6.5` (km) | `|Δ|` (m) |
| --- | ---: | ---: | ---: | ---: | ---: |
| `DO` | 72 | 3 | 0.2503 | 0.2503 | 0.0392 |
| `GD` | 72 | 3 | 0.008354 | 0.008352 | 0.0021 |
| `IG` | 72 | 3 | 0.0125 | 0.0125 | 0 |
