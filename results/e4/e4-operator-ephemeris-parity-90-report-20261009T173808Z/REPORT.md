# E4 report: `e4-operator-ephemeris-parity-90-report-20261009T173808Z`

Generated from 9 comparison runs by `steps/90-report.mjs`; the plan is
[PLAN.md](../../../experiments/e4-operator-ephemeris-parity/PLAN.md). Differences are ours minus the
operator, in the operator state's RTN axes, km. Primary results leave out object-files flagged as manoeuvres.

## Providers

| Provider | Object-files compared | Objects | Without element set | Flagged (limit km) | Median set age at cut-off (d) |
| --- | ---: | ---: | ---: | ---: | ---: |
| cpf | 225 | 33 | 1 | 2 (10.0) | 1.703 |
| css-tiangong | 7 | 1 | 0 | 0 (10.0) | 0.499 |
| esa-pod | 372 | 55 | 0 | 13 (10.0) | 1.010 |
| glonass-precise | 540 | 21 | 0 | 0 (10.0) | 1.147 |
| gps-precise | 859 | 32 | 0 | 36 (10.0) | 0.797 |
| intelsat | 83 | 41 | 0 | 3 (32.8) | 0.464 |
| iss | 4 | 1 | 0 | 0 (10.0) | 0.491 |
| planet | 1233 | 89 | 0 | 49 (10.0) | 0.785 |
| spacex-starlink | 298 | 298 | 2 | 31 (22.3) | 0.416 |

## cpf

3D difference from the operator, km: median / 95th percentile / max (samples).

| Horizon (h) | S (SGP4) | H (HPOP) | H/S median ratio [95 %] |
| --- | --- | --- | --- |
| 0 | 1.394 / 4.269 / 7.219 (223) | 3.896 / 14.7 / 38.9 (223) | 2.79 [2.21, 3.36] S closer |
| 1 | 1.401 / 4.061 / 10.8 (223) | 3.828 / 14.6 / 36.0 (223) | 2.73 [2.27, 3.38] S closer |
| 3 | 1.457 / 4.464 / 20.4 (223) | 4.166 / 15.2 / 33.4 (223) | 2.86 [2.36, 3.60] S closer |
| 6 | 1.452 / 4.368 / 23.6 (223) | 4.164 / 16.6 / 33.9 (223) | 2.87 [2.45, 3.68] S closer |
| 12 | 1.433 / 4.395 / 17.0 (223) | 4.958 / 16.6 / 47.2 (223) | 3.46 [2.69, 4.11] S closer |
| 24 | 1.406 / 3.944 / 25.1 (223) | 5.717 / 19.4 / 53.5 (223) | 4.07 [3.40, 4.82] S closer |
| 36 | 1.425 / 4.390 / 24.8 (223) | 6.777 / 22.2 / 55.9 (223) | 4.75 [4.03, 5.65] S closer |
| 48 | 1.393 / 4.028 / 25.1 (223) | 7.582 / 23.6 / 54.9 (223) | 5.45 [4.49, 6.74] S closer |
| 60 | 1.380 / 4.294 / 24.8 (223) | 8.533 / 24.5 / 55.9 (223) | 6.18 [5.05, 7.01] S closer |
| 72 | 1.396 / 4.435 / 16.3 (223) | 9.050 / 26.2 / 54.9 (223) | 6.48 [5.32, 7.87] S closer |

Median |R| / |T| / |N|, km (S; H):

| Horizon (h) | S | H |
| --- | --- | --- |
| 0 | 0.263 / 1.308 / 0.140 | 0.273 / 3.340 / 1.158 |
| 1 | 0.269 / 1.327 / 0.131 | 0.279 / 3.413 / 1.302 |
| 3 | 0.249 / 1.367 / 0.134 | 0.252 / 3.480 / 1.273 |
| 6 | 0.270 / 1.391 / 0.123 | 0.257 / 3.709 / 1.497 |
| 12 | 0.244 / 1.348 / 0.139 | 0.237 / 3.970 / 1.869 |
| 24 | 0.292 / 1.281 / 0.133 | 0.298 / 5.120 / 2.115 |
| 36 | 0.287 / 1.296 / 0.131 | 0.300 / 5.784 / 2.575 |
| 48 | 0.311 / 1.261 / 0.123 | 0.314 / 6.607 / 2.866 |
| 60 | 0.350 / 1.263 / 0.122 | 0.368 / 7.328 / 3.342 |
| 72 | 0.383 / 1.242 / 0.112 | 0.381 / 8.228 / 3.538 |

## css-tiangong

3D difference from the operator, km: median / 95th percentile / max (samples).

| Horizon (h) | S (SGP4) | H (HPOP) | H/S median ratio [95 %] |
| --- | --- | --- | --- |
| 0 | 0.667 / 4.122 / 4.736 (7) | 3.589 / 6.793 / 7.341 (7) | 5.38 [5.38, 5.38] descriptive (fewer than 3 objects) |
| 1 | 0.923 / 6.894 / 7.489 (7) | 3.747 / 7.213 / 7.705 (7) | 4.06 [4.06, 4.06] descriptive (fewer than 3 objects) |
| 3 | 1.246 / 12.1 / 14.7 (7) | 4.419 / 7.910 / 8.521 (7) | 3.55 [3.55, 3.55] descriptive (fewer than 3 objects) |
| 6 | 0.974 / 20.0 / 25.6 (7) | 5.030 / 13.8 / 15.7 (7) | 5.16 [5.16, 5.16] descriptive (fewer than 3 objects) |
| 12 | 1.386 / 38.3 / 50.5 (7) | 5.530 / 28.5 / 36.2 (7) | 3.99 [3.99, 3.99] descriptive (fewer than 3 objects) |
| 24 | 2.553 / 76.0 / 101.1 (7) | 6.503 / 55.8 / 75.8 (7) | 2.55 [2.55, 2.55] descriptive (fewer than 3 objects) |
| 36 | 5.050 / 111.7 / 149.6 (7) | 6.219 / 83.5 / 111.7 (7) | 1.23 [1.23, 1.23] descriptive (fewer than 3 objects) |
| 48 | 9.199 / 147.3 / 197.4 (7) | 18.4 / 109.8 / 142.5 (7) | 2.00 [2.00, 2.00] descriptive (fewer than 3 objects) |
| 60 | 14.0 / 180.9 / 242.8 (7) | 34.8 / 134.9 / 169.7 (7) | 2.48 [2.48, 2.48] descriptive (fewer than 3 objects) |
| 72 | 20.0 / 214.1 / 288.4 (7) | 54.8 / 160.1 / 195.2 (7) | 2.74 [2.74, 2.74] descriptive (fewer than 3 objects) |

Median |R| / |T| / |N|, km (S; H):

| Horizon (h) | S | H |
| --- | --- | --- |
| 0 | 0.075 / 0.635 / 0.256 | 0.068 / 3.584 / 0.103 |
| 1 | 0.057 / 0.921 / 0.134 | 0.079 / 3.743 / 0.050 |
| 3 | 0.061 / 1.223 / 0.144 | 0.035 / 4.414 / 0.128 |
| 6 | 0.070 / 0.965 / 0.125 | 0.047 / 5.027 / 0.158 |
| 12 | 0.192 / 1.370 / 0.127 | 0.081 / 5.528 / 0.146 |
| 24 | 0.128 / 2.549 / 0.143 | 0.080 / 6.503 / 0.069 |
| 36 | 0.282 / 5.048 / 0.199 | 0.107 / 6.219 / 0.155 |
| 48 | 0.102 / 9.191 / 0.342 | 0.188 / 18.4 / 0.114 |
| 60 | 0.380 / 14.0 / 0.496 | 0.197 / 34.8 / 0.087 |
| 72 | 0.285 / 20.0 / 0.636 | 0.111 / 54.8 / 0.150 |

## esa-pod

3D difference from the operator, km: median / 95th percentile / max (samples).

| Horizon (h) | S (SGP4) | H (HPOP) | H/S median ratio [95 %] |
| --- | --- | --- | --- |
| 0 | 1.158 / 4.164 / 6.551 (359) | 2.002 / 6.401 / 16.8 (359) | 1.73 [1.45, 2.29] S closer |
| 1 | 1.210 / 4.283 / 6.885 (359) | 2.185 / 6.744 / 16.9 (359) | 1.81 [1.50, 2.21] S closer |
| 3 | 1.198 / 4.517 / 7.037 (359) | 2.290 / 6.617 / 16.8 (359) | 1.91 [1.56, 2.37] S closer |
| 6 | 1.270 / 4.046 / 6.643 (359) | 2.298 / 6.794 / 13.7 (359) | 1.81 [1.54, 2.36] S closer |
| 12 | 1.216 / 4.214 / 6.770 (359) | 2.723 / 7.790 / 18.4 (359) | 2.24 [1.86, 2.73] S closer |
| 24 | 1.275 / 4.274 / 7.009 (359) | 3.371 / 8.955 / 19.8 (359) | 2.64 [2.26, 3.33] S closer |

Median |R| / |T| / |N|, km (S; H):

| Horizon (h) | S | H |
| --- | --- | --- |
| 0 | 0.168 / 1.121 / 0.110 | 0.177 / 1.768 / 0.604 |
| 1 | 0.164 / 1.157 / 0.114 | 0.160 / 1.825 / 0.638 |
| 3 | 0.169 / 1.160 / 0.108 | 0.178 / 1.931 / 0.711 |
| 6 | 0.153 / 1.206 / 0.103 | 0.156 / 2.001 / 0.810 |
| 12 | 0.175 / 1.132 / 0.107 | 0.182 / 2.304 / 0.960 |
| 24 | 0.201 / 1.192 / 0.106 | 0.185 / 2.854 / 1.394 |

Against truth (ESA final orbits), 3D median / 95th percentile, km, and the operator/ours median ratio [95 %]:

| Horizon (h) | Operator | S | H | Operator/S | Operator/H |
| --- | --- | --- | --- | --- | --- |
| 0 | 0.0000 / 0.0000 | 1.183 / 4.169 | 2.063 / 6.450 | 1.1e-5 [8.2e-6, 1.4e-5] | 6.1e-6 [4.7e-6, 7.9e-6] |
| 1 | 0.0000 / 0.0000 | 1.225 / 4.294 | 2.195 / 6.847 | 9.0e-6 [7.1e-6, 1.1e-5] | 5.0e-6 [3.7e-6, 6.5e-6] |
| 3 | 0.0000 / 0.0000 | 1.248 / 4.522 | 2.301 / 6.696 | 7.6e-6 [6.2e-6, 9.6e-6] | 4.1e-6 [3.2e-6, 5.1e-6] |
| 6 | 0.0000 / 0.0000 | 1.289 / 4.047 | 2.298 / 6.806 | 7.2e-6 [5.7e-6, 9.8e-6] | 4.0e-6 [3.0e-6, 5.2e-6] |
| 12 | 0.0000 / 0.0000 | 1.229 / 4.237 | 2.701 / 7.720 | 7.8e-6 [6.3e-6, 9.9e-6] | 3.6e-6 [2.9e-6, 4.4e-6] |
| 24 | 0.0000 / 0.0001 | 1.289 / 4.283 | 3.351 / 8.777 | 2.4e-5 [2.0e-5, 3.1e-5] | 9.3e-6 [7.5e-6, 1.1e-5] |

## glonass-precise

3D difference from the operator, km: median / 95th percentile / max (samples).

| Horizon (h) | S (SGP4) | H (HPOP) | H/S median ratio [95 %] |
| --- | --- | --- | --- |
| 0 | 1.115 / 2.406 / 4.313 (540) | 1.894 / 8.632 / 15.2 (540) | 1.70 [1.33, 2.19] S closer |
| 1 | 1.070 / 2.442 / 4.879 (540) | 1.925 / 8.403 / 15.3 (540) | 1.80 [1.42, 2.31] S closer |
| 3 | 1.092 / 2.460 / 4.831 (540) | 2.073 / 8.436 / 15.7 (540) | 1.90 [1.37, 2.64] S closer |
| 6 | 1.108 / 2.475 / 4.313 (540) | 2.254 / 8.842 / 16.9 (540) | 2.04 [1.54, 2.65] S closer |
| 12 | 1.144 / 2.501 / 4.854 (540) | 2.472 / 9.579 / 16.9 (540) | 2.16 [1.70, 2.89] S closer |

Median |R| / |T| / |N|, km (S; H):

| Horizon (h) | S | H |
| --- | --- | --- |
| 0 | 0.255 / 1.039 / 0.131 | 0.283 / 1.507 / 0.704 |
| 1 | 0.264 / 0.998 / 0.130 | 0.298 / 1.571 / 0.738 |
| 3 | 0.289 / 0.971 / 0.124 | 0.311 / 1.640 / 0.796 |
| 6 | 0.271 / 1.034 / 0.131 | 0.294 / 1.859 / 0.859 |
| 12 | 0.285 / 1.042 / 0.130 | 0.310 / 2.042 / 1.058 |

Against truth (ESA final orbits), 3D median / 95th percentile, km, and the operator/ours median ratio [95 %]:

| Horizon (h) | Operator | S | H | Operator/S | Operator/H |
| --- | --- | --- | --- | --- | --- |
| 0 | 0.0001 / 0.0002 | 1.115 / 2.407 | 1.898 / 8.637 | 6.6e-5 [5.3e-5, 7.8e-5] | 3.9e-5 [3.1e-5, 4.7e-5] |
| 1 | 0.0001 / 0.0002 | 1.072 / 2.442 | 1.928 / 8.406 | 7.2e-5 [5.8e-5, 8.3e-5] | 4.0e-5 [3.1e-5, 4.7e-5] |
| 3 | 0.0001 / 0.0002 | 1.091 / 2.461 | 2.062 / 8.440 | 7.6e-5 [6.2e-5, 9.2e-5] | 4.0e-5 [3.0e-5, 5.3e-5] |
| 6 | 0.0001 / 0.0003 | 1.103 / 2.465 | 2.252 / 8.852 | 9.7e-5 [7.8e-5, 1.1e-4] | 4.7e-5 [3.6e-5, 5.9e-5] |
| 12 | 0.0001 / 0.0003 | 1.144 / 2.503 | 2.475 / 9.588 | 1.1e-4 [9.4e-5, 1.4e-4] | 5.3e-5 [4.0e-5, 6.3e-5] |

## gps-precise

3D difference from the operator, km: median / 95th percentile / max (samples).

| Horizon (h) | S (SGP4) | H (HPOP) | H/S median ratio [95 %] |
| --- | --- | --- | --- |
| 0 | 1.230 / 4.288 / 9.849 (823) | 1.875 / 5.663 / 9.300 (823) | 1.52 [1.23, 2.00] S closer |
| 1 | 1.246 / 4.430 / 11.1 (823) | 2.000 / 5.624 / 10.6 (823) | 1.60 [1.27, 2.12] S closer |
| 3 | 1.179 / 4.447 / 15.9 (823) | 2.024 / 5.840 / 15.4 (823) | 1.72 [1.31, 2.35] S closer |
| 6 | 1.251 / 4.344 / 18.5 (823) | 2.104 / 5.839 / 18.0 (823) | 1.68 [1.35, 2.24] S closer |
| 12 | 1.262 / 4.213 / 15.2 (823) | 2.299 / 6.214 / 14.2 (823) | 1.82 [1.44, 2.46] S closer |

Median |R| / |T| / |N|, km (S; H):

| Horizon (h) | S | H |
| --- | --- | --- |
| 0 | 0.126 / 1.206 / 0.092 | 0.130 / 1.678 / 0.505 |
| 1 | 0.146 / 1.216 / 0.097 | 0.142 / 1.711 / 0.549 |
| 3 | 0.142 / 1.132 / 0.084 | 0.144 / 1.769 / 0.601 |
| 6 | 0.133 / 1.214 / 0.084 | 0.135 / 1.901 / 0.663 |
| 12 | 0.148 / 1.238 / 0.082 | 0.143 / 1.990 / 0.819 |

Against truth (ESA final orbits), 3D median / 95th percentile, km, and the operator/ours median ratio [95 %]:

| Horizon (h) | Operator | S | H | Operator/S | Operator/H |
| --- | --- | --- | --- | --- | --- |
| 0 | 0.0001 / 0.0001 | 1.229 / 4.284 | 1.875 / 5.646 | 4.2e-5 [2.9e-5, 5.9e-5] | 2.7e-5 [1.9e-5, 3.7e-5] |
| 1 | 0.0001 / 0.0001 | 1.248 / 4.433 | 2.004 / 5.634 | 4.3e-5 [3.1e-5, 6.2e-5] | 2.7e-5 [2.0e-5, 3.5e-5] |
| 3 | 0.0001 / 0.0001 | 1.173 / 4.450 | 2.025 / 5.848 | 5.1e-5 [3.5e-5, 7.0e-5] | 2.9e-5 [2.2e-5, 3.7e-5] |
| 6 | 0.0001 / 0.0002 | 1.246 / 4.337 | 2.104 / 5.831 | 5.9e-5 [4.2e-5, 8.3e-5] | 3.5e-5 [2.6e-5, 4.5e-5] |
| 12 | 0.0001 / 0.0002 | 1.262 / 4.214 | 2.315 / 6.244 | 7.4e-5 [5.3e-5, 1.0e-4] | 4.0e-5 [3.0e-5, 5.2e-5] |

## intelsat

3D difference from the operator, km: median / 95th percentile / max (samples).

| Horizon (h) | S (SGP4) | H (HPOP) | H/S median ratio [95 %] |
| --- | --- | --- | --- |
| 0 | 4.789 / 19.6 / 24.6 (80) | 5.954 / 18.8 / 24.0 (80) | 1.24 [1.03, 1.37] S closer |
| 1 | 5.078 / 20.3 / 22.5 (80) | 6.358 / 18.7 / 21.7 (80) | 1.25 [1.07, 1.40] S closer |
| 3 | 6.677 / 17.5 / 31.6 (80) | 7.269 / 17.7 / 32.2 (80) | 1.09 [0.97, 1.46] undecided |
| 6 | 5.081 / 19.0 / 91.7 (80) | 6.658 / 18.8 / 90.0 (80) | 1.31 [1.00, 1.85] S closer |
| 12 | 6.789 / 21.4 / 333.1 (80) | 8.618 / 20.3 / 329.3 (80) | 1.27 [0.93, 1.76] undecided |
| 24 | 7.890 / 23.3 / 827.5 (80) | 10.1 / 23.9 / 821.3 (80) | 1.28 [0.94, 1.86] undecided |
| 36 | 10.6 / 28.4 / 1676 (80) | 13.8 / 24.5 / 1667 (80) | 1.31 [1.06, 1.88] S closer |
| 48 | 11.2 / 31.4 / 2666 (80) | 14.8 / 33.2 / 2655 (80) | 1.32 [0.94, 1.59] undecided |
| 60 | 15.0 / 40.0 / 4014 (80) | 17.2 / 36.7 / 4000 (80) | 1.15 [0.91, 1.54] undecided |
| 72 | 17.0 / 42.3 / 5493 (80) | 18.0 / 42.5 / 5476 (80) | 1.06 [0.87, 1.34] undecided |

Median |R| / |T| / |N|, km (S; H):

| Horizon (h) | S | H |
| --- | --- | --- |
| 0 | 0.760 / 1.700 / 1.858 | 0.773 / 3.374 / 1.851 |
| 1 | 0.923 / 1.988 / 2.504 | 0.908 / 3.852 / 2.123 |
| 3 | 0.843 / 2.680 / 2.035 | 0.856 / 4.087 / 1.969 |
| 6 | 0.728 / 2.204 / 1.508 | 0.774 / 3.469 / 1.833 |
| 12 | 0.913 / 2.907 / 2.099 | 0.917 / 5.220 / 1.927 |
| 24 | 1.114 / 4.377 / 2.555 | 1.061 / 7.459 / 2.970 |
| 36 | 0.740 / 6.454 / 3.321 | 0.735 / 10.3 / 3.646 |
| 48 | 1.096 / 8.131 / 3.754 | 1.112 / 11.5 / 4.126 |
| 60 | 0.619 / 10.9 / 4.001 | 0.610 / 15.0 / 4.512 |
| 72 | 0.983 / 13.3 / 4.746 | 0.890 / 15.0 / 5.045 |

## iss

3D difference from the operator, km: median / 95th percentile / max (samples).

| Horizon (h) | S (SGP4) | H (HPOP) | H/S median ratio [95 %] |
| --- | --- | --- | --- |
| 0 | 0.816 / 0.997 / 0.998 (4) | 1.477 / 1.763 / 1.795 (4) | 1.81 [1.81, 1.81] descriptive (fewer than 3 objects) |
| 1 | 1.225 / 1.341 / 1.349 (4) | 1.144 / 1.423 / 1.466 (4) | 0.93 [0.93, 0.93] descriptive (fewer than 3 objects) |
| 3 | 0.838 / 1.196 / 1.229 (4) | 1.586 / 1.754 / 1.778 (4) | 1.89 [1.89, 1.89] descriptive (fewer than 3 objects) |
| 6 | 0.361 / 0.480 / 0.497 (4) | 1.550 / 1.670 / 1.688 (4) | 4.29 [4.29, 4.29] descriptive (fewer than 3 objects) |
| 12 | 0.732 / 2.012 / 2.209 (4) | 1.341 / 1.864 / 1.947 (4) | 1.83 [1.83, 1.83] descriptive (fewer than 3 objects) |
| 24 | 1.017 / 3.263 / 3.578 (4) | 2.094 / 4.809 / 5.235 (4) | 2.06 [2.06, 2.06] descriptive (fewer than 3 objects) |
| 36 | 0.961 / 4.473 / 5.064 (4) | 3.603 / 10.1 / 10.8 (4) | 3.75 [3.75, 3.75] descriptive (fewer than 3 objects) |
| 48 | 1.865 / 6.295 / 7.061 (4) | 8.058 / 16.6 / 17.6 (4) | 4.32 [4.32, 4.32] descriptive (fewer than 3 objects) |
| 60 | 3.200 / 8.374 / 9.130 (4) | 14.8 / 24.8 / 25.9 (4) | 4.61 [4.61, 4.61] descriptive (fewer than 3 objects) |
| 72 | 4.824 / 11.0 / 11.8 (4) | 22.7 / 34.9 / 35.9 (4) | 4.70 [4.70, 4.70] descriptive (fewer than 3 objects) |

Median |R| / |T| / |N|, km (S; H):

| Horizon (h) | S | H |
| --- | --- | --- |
| 0 | 0.099 / 0.765 / 0.251 | 0.095 / 1.462 / 0.162 |
| 1 | 0.066 / 1.216 / 0.119 | 0.075 / 1.120 / 0.175 |
| 3 | 0.115 / 0.789 / 0.294 | 0.092 / 1.573 / 0.170 |
| 6 | 0.133 / 0.184 / 0.220 | 0.116 / 1.519 / 0.122 |
| 12 | 0.137 / 0.715 / 0.083 | 0.085 / 1.338 / 0.126 |
| 24 | 0.098 / 0.934 / 0.298 | 0.084 / 2.089 / 0.134 |
| 36 | 0.147 / 0.937 / 0.061 | 0.091 / 3.590 / 0.151 |
| 48 | 0.156 / 1.744 / 0.467 | 0.118 / 8.052 / 0.132 |
| 60 | 0.128 / 3.186 / 0.261 | 0.138 / 14.8 / 0.181 |
| 72 | 0.123 / 4.760 / 0.554 | 0.163 / 22.7 / 0.128 |

## planet

3D difference from the operator, km: median / 95th percentile / max (samples).

| Horizon (h) | S (SGP4) | H (HPOP) | H/S median ratio [95 %] | P (operator TLE) |
| --- | --- | --- | --- | --- |
| at-epoch | 0.589 / 2.085 / 9.637 (1184) | 1.179 / 14.1 / 37.3 (1184) | 2.00 [1.80, 2.41] S closer | 0.590 / 2.726 / 13.3 (1057) |

Median |R| / |T| / |N|, km (S; H):

| Horizon (h) | S | H |
| --- | --- | --- |
| at-epoch | 0.101 / 0.544 / 0.136 | 0.107 / 1.156 / 0.138 |

## spacex-starlink

3D difference from the operator, km: median / 95th percentile / max (samples).

| Horizon (h) | S (SGP4) | H (HPOP) | H/S median ratio [95 %] |
| --- | --- | --- | --- |
| 0 | 2.867 / 15.0 / 21.8 (267) | 4.744 / 18.2 / 32.8 (267) | 1.65 [1.37, 1.97] S closer |
| 1 | 3.640 / 16.4 / 29.5 (267) | 5.236 / 20.3 / 35.9 (267) | 1.44 [1.18, 1.72] S closer |
| 3 | 4.260 / 19.8 / 35.0 (267) | 6.648 / 23.2 / 52.4 (267) | 1.56 [1.21, 1.89] S closer |
| 6 | 5.768 / 22.9 / 52.4 (267) | 8.282 / 28.3 / 85.0 (267) | 1.44 [1.13, 1.75] S closer |
| 12 | 8.705 / 31.8 / 97.3 (267) | 12.0 / 37.2 / 173.8 (267) | 1.38 [1.06, 1.79] S closer |
| 24 | 13.8 / 56.8 / 209.5 (267) | 18.6 / 58.0 / 447.6 (267) | 1.34 [0.98, 1.70] undecided |
| 36 | 18.8 / 82.1 / 402.3 (267) | 24.2 / 79.7 / 853.6 (267) | 1.29 [0.88, 1.62] undecided |
| 48 | 25.8 / 118.7 / 787.5 (260) | 28.1 / 83.0 / 997.0 (260) | 1.09 [0.85, 1.51] undecided |
| 60 | 32.0 / 164.8 / 1295 (260) | 32.8 / 100.0 / 1608 (260) | 1.02 [0.72, 1.43] undecided |

Median |R| / |T| / |N|, km (S; H):

| Horizon (h) | S | H |
| --- | --- | --- |
| 0 | 0.169 / 2.815 / 0.158 | 0.191 / 4.700 / 0.147 |
| 1 | 0.165 / 3.580 / 0.162 | 0.168 / 5.231 / 0.139 |
| 3 | 0.164 / 4.257 / 0.155 | 0.172 / 6.646 / 0.143 |
| 6 | 0.153 / 5.736 / 0.173 | 0.180 / 8.275 / 0.137 |
| 12 | 0.174 / 8.668 / 0.201 | 0.187 / 11.9 / 0.136 |
| 24 | 0.216 / 13.8 / 0.212 | 0.176 / 18.6 / 0.148 |
| 36 | 0.254 / 18.8 / 0.260 | 0.214 / 24.2 / 0.150 |
| 48 | 0.305 / 25.8 / 0.325 | 0.251 / 28.1 / 0.438 |
| 60 | 0.325 / 32.0 / 0.296 | 0.298 / 32.8 / 0.394 |

Covariance against SpaceX's (UVW = RTN). Median σ, km, R / T / N; σ ratio ours/SpaceX in-track [95 %];
d² of the difference under both covariances: mean d²/3 and the fraction inside the 95 % ellipsoid (nominal 1 and 0.95).

| Horizon (h) | SpaceX σ | S σ | S/SpaceX T ratio | S+SpaceX d²/3, cover | H σ | H/SpaceX T ratio | H+SpaceX d²/3, cover |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0.0012 / 0.0026 / 0.0022 | 0.132 / 0.795 / 0.165 | 306.9 [298.5, 321.9] | 25.93, 0.277 | 0.183 / 4.440 / 0.197 | 1663 [1537, 1824] | 3.64, 0.689 |
| 1 | 0.0020 / 0.0074 / 0.0019 | 0.132 / 0.795 / 0.165 | 110.8 [108.9, 113.1] | 31.87, 0.262 | 0.184 / 5.232 / 0.194 | 649.1 [598.0, 758.8] | 3.30, 0.655 |
| 3 | 0.0043 / 0.031 / 0.0025 | 0.133 / 0.795 / 0.165 | 26.8 [26.1, 27.6] | 41.02, 0.232 | 0.195 / 6.559 / 0.209 | 199.9 [184.2, 222.1] | 3.16, 0.730 |
| 6 | 0.0099 / 0.149 / 0.0025 | 0.154 / 0.872 / 0.167 | 5.908 [5.740, 6.040] | 64.76, 0.199 | 0.210 / 8.529 / 0.203 | 58.6 [54.4, 62.3] | 2.91, 0.779 |
| 12 | 0.026 / 0.781 / 0.0034 | 0.154 / 0.872 / 0.167 | 1.151 [1.128, 1.166] | 62.74, 0.135 | 0.235 / 13.0 / 0.197 | 17.4 [16.2, 18.6] | 2.45, 0.768 |
| 24 | 0.084 / 3.300 / 0.0059 | 0.204 / 0.969 / 0.166 | 0.308 [0.292, 0.354] | 48.67, 0.273 | 0.300 / 23.3 / 0.214 | 8.106 [7.752, 8.476] | 2.80, 0.850 |
| 36 | 0.100 / 2.500 / 0.015 | 0.204 / 0.969 / 0.166 | 0.388 [0.388, 0.388] | 271.93, 0.206 | 0.382 / 35.3 / 0.215 | 13.2 [12.8, 13.6] | 14.86, 0.839 |
| 48 | 0.110 / 2.541 / 0.096 | 0.275 / 1.294 / 0.167 | 0.510 [0.509, 0.511] | 1221.87, 0.112 | 0.472 / 48.5 / 0.206 | 20.1 [19.5, 22.0] | 116.84, 0.569 |
| 60 | 0.300 / 3.800 / 0.500 | 0.275 / 1.294 / 0.167 | 0.340 [0.340, 0.431] | 1344.19, 0.212 | 0.589 / 63.4 / 0.225 | 17.3 [16.8, 18.1] | 234.02, 0.919 |

## Hypotheses

```json
{
 "H1": {
  "epochMedianKm": 2.867,
  "horizon72MedianKm": null,
  "lastHorizon": "60",
  "lastHorizonMedianKm": 32.02,
  "pass": null,
  "note": "no 72 h horizon in the MEME spans (amendment A1)"
 },
 "H2": {
  "S": {
   "0": {
    "meanD2Over3": 25.93,
    "coverage95": 0.2772,
    "pass": false
   },
   "1": {
    "meanD2Over3": 31.87,
    "coverage95": 0.2622,
    "pass": false
   },
   "3": {
    "meanD2Over3": 41.02,
    "coverage95": 0.2322,
    "pass": false
   },
   "6": {
    "meanD2Over3": 64.76,
    "coverage95": 0.1985,
    "pass": false
   },
   "12": {
    "meanD2Over3": 62.74,
    "coverage95": 0.1348,
    "pass": false
   },
   "24": {
    "meanD2Over3": 48.67,
    "coverage95": 0.2734,
    "pass": false
   },
   "36": {
    "meanD2Over3": 271.9,
    "coverage95": 0.206,
    "pass": false
   },
   "48": {
    "meanD2Over3": 1222,
    "coverage95": 0.1115,
    "pass": false
   },
   "60": {
    "meanD2Over3": 1344,
    "coverage95": 0.2115,
    "pass": false
   }
  },
  "H": {
   "0": {
    "meanD2Over3": 3.641,
    "coverage95": 0.6891,
    "pass": false
   },
   "1": {
    "meanD2Over3": 3.304,
    "coverage95": 0.6554,
    "pass": false
   },
   "3": {
    "meanD2Over3": 3.157,
    "coverage95": 0.7303,
    "pass": false
   },
   "6": {
    "meanD2Over3": 2.915,
    "coverage95": 0.779,
    "pass": false
   },
   "12": {
    "meanD2Over3": 2.452,
    "coverage95": 0.7678,
    "pass": false
   },
   "24": {
    "meanD2Over3": 2.801,
    "coverage95": 0.8502,
    "pass": false
   },
   "36": {
    "meanD2Over3": 14.86,
    "coverage95": 0.839,
    "pass": false
   },
   "48": {
    "meanD2Over3": 116.8,
    "coverage95": 0.5692,
    "pass": false
   },
   "60": {
    "meanD2Over3": 234,
    "coverage95": 0.9192,
    "pass": false
   }
  }
 },
 "H3": {
  "S": {
   "0": {
    "estimate": 306.9,
    "lower": 298.5,
    "upper": 321.9,
    "atLeast10": true
   },
   "1": {
    "estimate": 110.8,
    "lower": 108.9,
    "upper": 113.1,
    "atLeast10": true
   },
   "3": {
    "estimate": 26.8,
    "lower": 26.08,
    "upper": 27.6,
    "atLeast10": true
   },
   "6": {
    "estimate": 5.908,
    "lower": 5.74,
    "upper": 6.04,
    "atLeast10": false
   },
   "12": {
    "estimate": 1.151,
    "lower": 1.128,
    "upper": 1.166,
    "atLeast10": false
   },
   "24": {
    "estimate": 0.3083,
    "lower": 0.2924,
    "upper": 0.3543,
    "atLeast10": false
   },
   "36": {
    "estimate": 0.3877,
    "lower": 0.3877,
    "upper": 0.3877,
    "atLeast10": false
   },
   "48": {
    "estimate": 0.5097,
    "lower": 0.5089,
    "upper": 0.5111,
    "atLeast10": false
   },
   "60": {
    "estimate": 0.3404,
    "lower": 0.3404,
    "upper": 0.4312,
    "atLeast10": false
   }
  },
  "H": {
   "0": {
    "estimate": 1663,
    "lower": 1537,
    "upper": 1824,
    "atLeast10": true
   },
   "1": {
    "estimate": 649.1,
    "lower": 598,
    "upper": 758.8,
    "atLeast10": true
   },
   "3": {
    "estimate": 199.9,
    "lower": 184.2,
    "upper": 222.1,
    "atLeast10": true
   },
   "6": {
    "estimate": 58.62,
    "lower": 54.44,
    "upper": 62.33,
    "atLeast10": true
   },
   "12": {
    "estimate": 17.42,
    "lower": 16.16,
    "upper": 18.56,
    "atLeast10": true
   },
   "24": {
    "estimate": 8.106,
    "lower": 7.752,
    "upper": 8.476,
    "atLeast10": false
   },
   "36": {
    "estimate": 13.18,
    "lower": 12.83,
    "upper": 13.62,
    "atLeast10": true
   },
   "48": {
    "estimate": 20.09,
    "lower": 19.53,
    "upper": 22.03,
    "atLeast10": true
   },
   "60": {
    "estimate": 17.25,
    "lower": 16.83,
    "upper": 18.12,
    "atLeast10": true
   }
  }
 },
 "H4": {
  "gps-precise": {
   "pass": true,
   "horizons": {
    "0": {
     "S": {
      "estimate": 0.00004184,
      "lower": 0.00002938,
      "upper": 0.00005949,
      "n": 816
     },
     "H": {
      "estimate": 0.00002743,
      "lower": 0.00001925,
      "upper": 0.00003669,
      "n": 816
     }
    },
    "1": {
     "S": {
      "estimate": 0.00004318,
      "lower": 0.00003122,
      "upper": 0.00006158,
      "n": 816
     },
     "H": {
      "estimate": 0.00002688,
      "lower": 0.0000199,
      "upper": 0.0000352,
      "n": 816
     }
    },
    "3": {
     "S": {
      "estimate": 0.00005082,
      "lower": 0.00003464,
      "upper": 0.00007034,
      "n": 816
     },
     "H": {
      "estimate": 0.00002944,
      "lower": 0.00002227,
      "upper": 0.00003707,
      "n": 816
     }
    },
    "6": {
     "S": {
      "estimate": 0.00005871,
      "lower": 0.00004154,
      "upper": 0.00008345,
      "n": 815
     },
     "H": {
      "estimate": 0.00003478,
      "lower": 0.00002569,
      "upper": 0.0000446,
      "n": 815
     }
    },
    "12": {
     "S": {
      "estimate": 0.00007358,
      "lower": 0.00005253,
      "upper": 0.0001008,
      "n": 815
     },
     "H": {
      "estimate": 0.0000401,
      "lower": 0.00003028,
      "upper": 0.00005208,
      "n": 815
     }
    }
   }
  },
  "glonass-precise": {
   "pass": true,
   "horizons": {
    "0": {
     "S": {
      "estimate": 0.00006568,
      "lower": 0.00005339,
      "upper": 0.00007788,
      "n": 539
     },
     "H": {
      "estimate": 0.00003859,
      "lower": 0.00003068,
      "upper": 0.00004681,
      "n": 539
     }
    },
    "1": {
     "S": {
      "estimate": 0.00007244,
      "lower": 0.00005759,
      "upper": 0.00008296,
      "n": 539
     },
     "H": {
      "estimate": 0.00004027,
      "lower": 0.00003111,
      "upper": 0.00004742,
      "n": 539
     }
    },
    "3": {
     "S": {
      "estimate": 0.00007639,
      "lower": 0.00006246,
      "upper": 0.00009153,
      "n": 539
     },
     "H": {
      "estimate": 0.00004043,
      "lower": 0.00003034,
      "upper": 0.00005287,
      "n": 539
     }
    },
    "6": {
     "S": {
      "estimate": 0.00009663,
      "lower": 0.00007782,
      "upper": 0.0001139,
      "n": 539
     },
     "H": {
      "estimate": 0.00004733,
      "lower": 0.00003622,
      "upper": 0.00005876,
      "n": 539
     }
    },
    "12": {
     "S": {
      "estimate": 0.0001141,
      "lower": 0.0000937,
      "upper": 0.0001355,
      "n": 539
     },
     "H": {
      "estimate": 0.00005275,
      "lower": 0.00003983,
      "upper": 0.00006335,
      "n": 539
     }
    }
   }
  },
  "cpf": {
   "pass": null,
   "note": "no truth for this provider's objects (not tested)"
  }
 },
 "H5": {
  "cpf": {
   "0": "S closer",
   "1": "S closer",
   "3": "S closer",
   "6": "S closer",
   "12": "S closer",
   "24": "S closer",
   "36": "S closer",
   "48": "S closer",
   "60": "S closer",
   "72": "S closer"
  },
  "css-tiangong": {
   "0": "descriptive (fewer than 3 objects)",
   "1": "descriptive (fewer than 3 objects)",
   "3": "descriptive (fewer than 3 objects)",
   "6": "descriptive (fewer than 3 objects)",
   "12": "descriptive (fewer than 3 objects)",
   "24": "descriptive (fewer than 3 objects)",
   "36": "descriptive (fewer than 3 objects)",
   "48": "descriptive (fewer than 3 objects)",
   "60": "descriptive (fewer than 3 objects)",
   "72": "descriptive (fewer than 3 objects)"
  },
  "esa-pod": {
   "0": "S closer",
   "1": "S closer",
   "3": "S closer",
   "6": "S closer",
   "12": "S closer",
   "24": "S closer"
  },
  "glonass-precise": {
   "0": "S closer",
   "1": "S closer",
   "3": "S closer",
   "6": "S closer",
   "12": "S closer"
  },
  "gps-precise": {
   "0": "S closer",
   "1": "S closer",
   "3": "S closer",
   "6": "S closer",
   "12": "S closer"
  },
  "intelsat": {
   "0": "S closer",
   "1": "S closer",
   "3": "undecided",
   "6": "S closer",
   "12": "undecided",
   "24": "undecided",
   "36": "S closer",
   "48": "undecided",
   "60": "undecided",
   "72": "undecided"
  },
  "iss": {
   "0": "descriptive (fewer than 3 objects)",
   "1": "descriptive (fewer than 3 objects)",
   "3": "descriptive (fewer than 3 objects)",
   "6": "descriptive (fewer than 3 objects)",
   "12": "descriptive (fewer than 3 objects)",
   "24": "descriptive (fewer than 3 objects)",
   "36": "descriptive (fewer than 3 objects)",
   "48": "descriptive (fewer than 3 objects)",
   "60": "descriptive (fewer than 3 objects)",
   "72": "descriptive (fewer than 3 objects)"
  },
  "planet": {
   "at-epoch": "S closer"
  },
  "spacex-starlink": {
   "0": "S closer",
   "1": "S closer",
   "3": "S closer",
   "6": "S closer",
   "12": "S closer",
   "24": "undecided",
   "36": "undecided",
   "48": "undecided",
   "60": "undecided"
  }
 }
}
```

<!-- credits:begin (harness/credit-lines.mjs) -->

## Credits

- © Navigation Support Office at ESA/ESOC 2026; IGS analysis-centre products, courtesy of the International GNSS Service (Johnston et al. 2017, doi:10.1007/978-3-319-42928-1).
- © Navigation Support Office at ESA/ESOC 2026.
- Source: USSPACECOM / 18th Space Defense Squadron, via Space-Track.org (https://www.space-track.org).

Every source and its terms: [docs/data-licenses.md](../../../docs/data-licenses.md#credits-by-experiment).

<!-- credits:end -->
