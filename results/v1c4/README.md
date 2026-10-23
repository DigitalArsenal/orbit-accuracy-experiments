# V1c4 — pre-registered covariance calibration: temporal cross-validation, a causal event rule, a fresh test

Selected on training weeks only: **SGP4 F-scalar-mle/UNFLAGGED: 3/24 test cells; FFM-1 coverage/UNFLAGGED: 3/24**. A candidate's cells are counted on its claimed population: every sample (arm ALL) or the samples of unflagged arcs (arm UNFLAGGED).

Training issues 2026-08-03 to 09-20 in seven weekly folds (every target precedes 2026-09-24 UTC); selection by purged rolling-origin cross-validation (SGP4 on folds F3-F7, FFM-1 on F5-F7). Test: issue days 2026-09-27 to 2026-10-08, never read before both selections were pushed; issue and truth times are disjoint from training. Rule: mean d²/3 in [0.8, 1.25], 95 % coverage in [0.93, 0.97], at least 30 samples from 3 objects; V1c2/E14 bootstrap (2,000 object-cluster resamples) and verdict code unchanged. Cells below 30 samples or 3 objects are INSUFFICIENT and count as not realistic.

[Frozen plan](../../experiments/v1c4-console-covariance-calibration/PLAN.md) · [Metrics](metrics.json) · [Manifest](manifest.json) · [MODEL application](MODEL.json) · [SGP4 selection](sgp-selection.json) · [FFM-1 selection](ffm-selection.json)

## Candidates

| Mode | Candidate | Cross-validation realistic /24 by fold | Mean | Min | Test claimed /24 | Test all | Test unflagged | Test flagged (pooled /6) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| SGP4 | N-none/ALL | F3 1, F4 1, F5 0, F6 0, F7 1 | 0.60 | 0 | 0 | 0 | 0 | 0 |
| SGP4 | N-none/UNFLAGGED | F3 1, F4 1, F5 0, F6 0, F7 1 | 0.60 | 0 | 0 | 0 | 0 | 0 |
| SGP4 | N-scalar-mle/ALL | F3 5, F4 3, F5 3, F6 5, F7 2 | 3.60 | 2 | 4 | 4 | 4 | 0 |
| SGP4 | N-scalar-mle/UNFLAGGED | F3 4, F4 3, F5 3, F6 5, F7 2 | 3.40 | 2 | 3 | 3 | 3 | 0 |
| SGP4 | N-coverage/ALL | F3 4, F4 5, F5 2, F6 3, F7 2 | 3.20 | 2 | 3 | 3 | 5 | 0 |
| SGP4 | N-coverage/UNFLAGGED | F3 5, F4 3, F5 2, F6 3, F7 2 | 3.00 | 2 | 4 | 3 | 4 | 0 |
| SGP4 | N-axes-mle/ALL | F3 2, F4 5, F5 1, F6 3, F7 3 | 2.80 | 1 | 7 | 7 | 4 | 0 |
| SGP4 | N-axes-mle/UNFLAGGED | F3 3, F4 5, F5 1, F6 3, F7 3 | 3.00 | 1 | 4 | 3 | 4 | 0 |
| SGP4 | F-none/ALL | F3 4, F4 2, F5 0, F6 1, F7 2 | 1.80 | 0 | 0 | 0 | 0 | 0 |
| SGP4 | F-none/UNFLAGGED | F3 4, F4 2, F5 0, F6 1, F7 2 | 1.80 | 0 | 0 | 0 | 0 | 0 |
| SGP4 | F-scalar-mle/ALL | F3 6, F4 5, F5 1, F6 4, F7 4 | 4.00 | 1 | 4 | 4 | 3 | 0 |
| SGP4 | F-scalar-mle/UNFLAGGED (selected) | F3 7, F4 5, F5 1, F6 5, F7 4 | 4.40 | 1 | 3 | 3 | 3 | 0 |
| SGP4 | F-coverage/ALL | F3 3, F4 3, F5 3, F6 4, F7 3 | 3.20 | 3 | 4 | 4 | 5 | 0 |
| SGP4 | F-coverage/UNFLAGGED | F3 3, F4 3, F5 3, F6 4, F7 3 | 3.20 | 3 | 6 | 3 | 6 | 0 |
| SGP4 | F-axes-mle/ALL | F3 3, F4 4, F5 4, F6 2, F7 3 | 3.20 | 2 | 3 | 3 | 2 | 0 |
| SGP4 | F-axes-mle/UNFLAGGED | F3 4, F4 4, F5 4, F6 2, F7 3 | 3.40 | 2 | 2 | 2 | 2 | 0 |
| SGP4 | P-none/ALL | F3 3, F4 0, F5 0, F6 0, F7 0 | 0.60 | 0 | 1 | 1 | 1 | 0 |
| SGP4 | P-none/UNFLAGGED | F3 3, F4 0, F5 0, F6 0, F7 0 | 0.60 | 0 | 1 | 1 | 1 | 0 |
| SGP4 | P-scalar-mle/ALL | F3 4, F4 4, F5 2, F6 3, F7 4 | 3.40 | 2 | 0 | 0 | 0 | 0 |
| SGP4 | P-scalar-mle/UNFLAGGED | F3 4, F4 4, F5 2, F6 3, F7 4 | 3.40 | 2 | 0 | 0 | 0 | 0 |
| SGP4 | P-coverage/ALL | F3 2, F4 6, F5 2, F6 1, F7 1 | 2.40 | 1 | 5 | 5 | 5 | 0 |
| SGP4 | P-coverage/UNFLAGGED | F3 2, F4 6, F5 2, F6 1, F7 1 | 2.40 | 1 | 4 | 5 | 4 | 0 |
| SGP4 | P-axes-mle/ALL | F3 2, F4 3, F5 4, F6 2, F7 3 | 2.80 | 2 | 4 | 4 | 3 | 0 |
| SGP4 | P-axes-mle/UNFLAGGED | F3 3, F4 3, F5 4, F6 2, F7 3 | 3.00 | 2 | 3 | 3 | 3 | 0 |
| FFM-1 | none/ALL | F5 1, F6 1, F7 2 | 1.33 | 1 | 2 | 2 | 3 | 0 |
| FFM-1 | none/UNFLAGGED | F5 1, F6 1, F7 2 | 1.33 | 1 | 3 | 2 | 3 | 0 |
| FFM-1 | scalar-mle/ALL | F5 2, F6 2, F7 3 | 2.33 | 2 | 5 | 5 | 4 | 0 |
| FFM-1 | scalar-mle/UNFLAGGED | F5 2, F6 2, F7 3 | 2.33 | 2 | 4 | 4 | 4 | 0 |
| FFM-1 | coverage/ALL | F5 4, F6 1, F7 3 | 2.67 | 1 | 4 | 4 | 3 | 0 |
| FFM-1 | coverage/UNFLAGGED (selected) | F5 4, F6 1, F7 3 | 2.67 | 1 | 3 | 3 | 3 | 0 |
| FFM-1 | axes-mle/ALL | F5 3, F6 0, F7 2 | 1.67 | 0 | 7 | 7 | 3 | 0 |
| FFM-1 | axes-mle/UNFLAGGED | F5 3, F6 0, F7 2 | 1.67 | 0 | 4 | 3 | 4 | 0 |

Reference (never selected): V1c3's published SGP4 F-coverage model on this window: 4/24 cells over all samples, 7/24 over unflagged samples (V1c3's own test: 4/24).

## Selected SGP4: F-scalar-mle/UNFLAGGED (unflagged samples)

| Group | h | n / objects | Mean d²/3 [95% CI] | Median d²/3 | 95% coverage [CI] | Non-PD / unavailable | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| GPS | 1 | 308 / 30 | 3.1682 [0.043713, 8.5331] | 0.026639 | 0.98052 [0.94966, 1.0000] | 0 | NOT REALISTIC (overconfident) |
| GPS | 6 | 308 / 30 | 1.1533 [0.012497, 3.1931] | 0.0089666 | 0.98052 [0.94966, 1.0000] | 0 | NOT REALISTIC (coverage) |
| GPS | 12 | 308 / 30 | 4.0641 [0.033666, 11.039] | 0.021129 | 0.98052 [0.94966, 1.0000] | 0 | NOT REALISTIC (overconfident) |
| GPS | 24 | 309 / 30 | 4.1097 [0.024779, 11.282] | 0.016830 | 0.97735 [0.94186, 1.0000] | 0 | NOT REALISTIC (overconfident) |
| GPS | 48 | 309 / 30 | 4.4152 [0.021952, 12.185] | 0.011740 | 0.97087 [0.92999, 1.0000] | 0 | NOT REALISTIC (overconfident) |
| GPS | 72 | 308 / 30 | 4.8720 [0.014751, 13.102] | 0.0085618 | 0.96429 [0.91475, 1.0000] | 1 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 1 | 80 / 8 | 1.1728 [0.81667, 1.6429] | 0.92156 | 0.92500 [0.81078, 1.0000] | 0 | NOT REALISTIC (coverage) |
| LEO 400-800 km | 6 | 72 / 8 | 0.90049 [0.64523, 1.1405] | 0.77524 | 0.98611 [0.95890, 1.0000] | 0 | NOT REALISTIC (coverage) |
| LEO 400-800 km | 12 | 73 / 8 | 0.83019 [0.53986, 1.1117] | 0.66020 | 0.98630 [0.95775, 1.0000] | 0 | NOT REALISTIC (coverage) |
| LEO 400-800 km | 24 | 69 / 8 | 0.93797 [0.69492, 1.1515] | 0.93062 | 0.98551 [0.95000, 1.0000] | 0 | NOT REALISTIC (coverage) |
| LEO 400-800 km | 48 | 62 / 8 | 0.88196 [0.61219, 1.0922] | 0.80777 | 0.98387 [0.94337, 1.0000] | 0 | NOT REALISTIC (coverage) |
| LEO 400-800 km | 72 | 56 / 8 | 0.85781 [0.57614, 1.1214] | 0.77074 | 0.98214 [0.93478, 1.0000] | 0 | NOT REALISTIC (coverage) |
| SLR LEO 800-1500 km | 1 | 56 / 5 | 0.76392 [0.38891, 1.1301] | 0.56594 | 0.96429 [0.90000, 1.0000] | 0 | NOT REALISTIC (pessimistic) |
| SLR LEO 800-1500 km | 6 | 56 / 5 | 1.1140 [0.79055, 1.5276] | 0.88235 | 0.94643 [0.91667, 0.98214] | 0 | REALISTIC |
| SLR LEO 800-1500 km | 12 | 55 / 5 | 0.99815 [0.67020, 1.3382] | 0.75715 | 0.94545 [0.88136, 1.0000] | 0 | REALISTIC |
| SLR LEO 800-1500 km | 24 | 56 / 5 | 0.80911 [0.44023, 1.2244] | 0.55119 | 0.94643 [0.88333, 1.0000] | 0 | REALISTIC |
| SLR LEO 800-1500 km | 48 | 56 / 5 | 0.74780 [0.43716, 1.1258] | 0.44422 | 0.94643 [0.88333, 1.0000] | 0 | NOT REALISTIC (pessimistic) |
| SLR LEO 800-1500 km | 72 | 56 / 5 | 0.86895 [0.46669, 1.4270] | 0.54418 | 0.91071 [0.78333, 1.0000] | 0 | NOT REALISTIC (coverage) |
| SLR MEO | 1 | 34 / 5 | 1.7305 [0.25166, 2.3791] | 1.6486 | 0.73529 [0.58140, 1.0000] | 0 | NOT REALISTIC (overconfident) |
| SLR MEO | 6 | 34 / 5 | 1.2335 [0.42928, 1.5495] | 0.93833 | 0.85294 [0.76667, 0.94444] | 0 | NOT REALISTIC (coverage) |
| SLR MEO | 12 | 34 / 5 | 1.5314 [0.34576, 2.0353] | 1.1567 | 0.76471 [0.58140, 1.0000] | 0 | NOT REALISTIC (overconfident) |
| SLR MEO | 24 | 34 / 5 | 3.0400e+8 [0.89407, 7.2112e+8] | 1.4502 | 0.70588 [0.48387, 0.94444] | 0 | NOT REALISTIC (overconfident) |
| SLR MEO | 48 | 33 / 5 | 3.2300e+8 [0.89198, 7.4364e+8] | 1.4355 | 0.66667 [0.46667, 0.93750] | 1 | NOT REALISTIC (overconfident) |
| SLR MEO | 72 | 28 / 5 | 3.5632e+8 [0.56630, 7.9815e+8] | 1.3970 | 0.67857 [0.44000, 1.0000] | 2 | INSUFFICIENT |

Split for F-scalar-mle/UNFLAGGED: 3/24 cells over all samples, 3/24 over unflagged samples, 0/6 horizons over flagged samples (pooled over classes).

| Flagged samples, pooled | n / objects | Mean d²/3 | 95% coverage | Verdict |
| --- | ---: | ---: | ---: | --- |
| h 1 | 76 / 17 | 134.92 | 0.82895 | NOT REALISTIC (overconfident) |
| h 6 | 76 / 17 | 43.894 | 0.86842 | NOT REALISTIC (overconfident) |
| h 12 | 75 / 17 | 128.75 | 0.85333 | NOT REALISTIC (overconfident) |
| h 24 | 75 / 17 | 106.54 | 0.89333 | NOT REALISTIC (overconfident) |
| h 48 | 74 / 17 | 75.982 | 0.89189 | NOT REALISTIC (overconfident) |
| h 72 | 71 / 16 | 65.875 | 0.90141 | NOT REALISTIC (overconfident) |

## Selected FFM-1: coverage/UNFLAGGED (unflagged samples)

| Group | h | n / objects | Mean d²/3 [95% CI] | Median d²/3 | 95% coverage [CI] | Non-PD / unavailable | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| GPS | 1 | 308 / 30 | 52.886 [0.68193, 142.16] | 0.42171 | 0.91883 [0.85521, 0.97188] | 0 | NOT REALISTIC (overconfident) |
| GPS | 6 | 308 / 30 | 47.820 [0.67324, 129.23] | 0.47991 | 0.92532 [0.85663, 0.98021] | 0 | NOT REALISTIC (overconfident) |
| GPS | 12 | 308 / 30 | 68.121 [0.66251, 183.53] | 0.42910 | 0.92208 [0.85127, 0.97813] | 0 | NOT REALISTIC (overconfident) |
| GPS | 24 | 309 / 30 | 53.841 [0.71701, 144.64] | 0.48966 | 0.91262 [0.84105, 0.97170] | 0 | NOT REALISTIC (overconfident) |
| GPS | 48 | 309 / 30 | 34.227 [1.5590, 90.614] | 0.51038 | 0.90939 [0.83774, 0.96711] | 0 | NOT REALISTIC (overconfident) |
| GPS | 72 | 309 / 30 | 28.511 [1.5959, 73.306] | 0.51670 | 0.90615 [0.83175, 0.96610] | 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 1 | 80 / 8 | 1.1590 [0.90067, 1.4060] | 0.94227 | 0.95000 [0.89609, 1.0000] | 0 | REALISTIC |
| LEO 400-800 km | 6 | 72 / 8 | 1.1670 [0.71842, 1.7326] | 0.93354 | 0.88889 [0.69697, 1.0000] | 0 | NOT REALISTIC (coverage) |
| LEO 400-800 km | 12 | 73 / 8 | 1.3028 [1.0732, 1.5347] | 1.2429 | 0.90411 [0.78943, 0.98765] | 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 24 | 69 / 8 | 1.2202 [1.0545, 1.3808] | 1.1059 | 0.97101 [0.93590, 1.0000] | 0 | NOT REALISTIC (coverage) |
| LEO 400-800 km | 48 | 62 / 8 | 1.2552 [1.0412, 1.4406] | 1.2874 | 0.93548 [0.84846, 1.0000] | 0 | NOT REALISTIC (overconfident) |
| LEO 400-800 km | 72 | 56 / 8 | 1.1911 [0.89084, 1.4306] | 1.0743 | 0.96429 [0.90625, 1.0000] | 0 | REALISTIC |
| SLR LEO 800-1500 km | 1 | 56 / 5 | 0.90332 [0.42370, 1.4244] | 0.76104 | 0.96429 [0.89286, 1.0000] | 0 | REALISTIC |
| SLR LEO 800-1500 km | 6 | 56 / 5 | 0.69190 [0.31426, 1.0560] | 0.42062 | 0.98214 [0.95000, 1.0000] | 0 | NOT REALISTIC (pessimistic) |
| SLR LEO 800-1500 km | 12 | 55 / 5 | 0.69916 [0.36788, 0.99694] | 0.53709 | 1.0000 [1.0000, 1.0000] | 0 | NOT REALISTIC (pessimistic) |
| SLR LEO 800-1500 km | 24 | 56 / 5 | 0.85818 [0.37817, 1.3712] | 0.50126 | 0.92857 [0.83333, 1.0000] | 0 | NOT REALISTIC (coverage) |
| SLR LEO 800-1500 km | 48 | 56 / 5 | 0.67959 [0.25375, 1.1000] | 0.54632 | 0.98214 [0.94643, 1.0000] | 0 | NOT REALISTIC (pessimistic) |
| SLR LEO 800-1500 km | 72 | 56 / 5 | 0.75814 [0.29511, 1.1732] | 0.45489 | 0.96429 [0.92857, 1.0000] | 0 | NOT REALISTIC (pessimistic) |
| SLR MEO | 1 | 34 / 5 | 1.5706 [1.1724, 2.4330] | 1.3990 | 0.85294 [0.62500, 0.96429] | 0 | NOT REALISTIC (overconfident) |
| SLR MEO | 6 | 34 / 5 | 1.2800 [0.26745, 1.8561] | 0.82300 | 0.82353 [0.67742, 0.96429] | 0 | NOT REALISTIC (overconfident) |
| SLR MEO | 12 | 34 / 5 | 1.2331 [0.51644, 1.5805] | 0.84541 | 0.85294 [0.76667, 0.94444] | 0 | NOT REALISTIC (coverage) |
| SLR MEO | 24 | 34 / 5 | 3.4761e+8 [0.35416, 8.2455e+8] | 1.3954 | 0.76471 [0.64706, 1.0000] | 0 | NOT REALISTIC (overconfident) |
| SLR MEO | 48 | 34 / 5 | 2.7947e+8 [0.72227, 6.6293e+8] | 1.0567 | 0.76471 [0.68000, 1.0000] | 0 | NOT REALISTIC (overconfident) |
| SLR MEO | 72 | 30 / 5 | 2.5921e+8 [0.37990, 6.1392e+8] | 1.5091 | 0.76667 [0.68000, 1.0000] | 0 | NOT REALISTIC (overconfident) |

Split for coverage/UNFLAGGED: 3/24 cells over all samples, 3/24 over unflagged samples, 0/6 horizons over flagged samples (pooled over classes).

| Flagged samples, pooled | n / objects | Mean d²/3 | 95% coverage | Verdict |
| --- | ---: | ---: | ---: | --- |
| h 1 | 76 / 17 | 2370.3 | 0.73684 | NOT REALISTIC (overconfident) |
| h 6 | 76 / 17 | 2166.6 | 0.84211 | NOT REALISTIC (overconfident) |
| h 12 | 76 / 17 | 2298.3 | 0.76316 | NOT REALISTIC (overconfident) |
| h 24 | 76 / 17 | 1532.0 | 0.78947 | NOT REALISTIC (overconfident) |
| h 48 | 76 / 17 | 705.68 | 0.77632 | NOT REALISTIC (overconfident) |
| h 72 | 76 / 17 | 441.30 | 0.75000 | NOT REALISTIC (overconfident) |

## Event rule

Custody gap (longest recent gap or age >= max(3 days, 3 x median cadence)) or a maneuver-detection event within 7 days; computed from each object's own element sets before the issue time. Test: 101 of 600 pairs flagged. Training flag share: SGP4 0.11552, FFM-1 0.13100 (cap 0.2).

| Class | Pairs | Flagged | By custody gap | By detector | Detector refusals |
| --- | ---: | ---: | ---: | ---: | ---: |
| GPS | 384 | 75 | 66 | 13 | 0 |
| LEO 400-800 km | 96 | 0 | 0 | 0 | 0 |
| SLR LEO 800-1500 km | 60 | 0 | 0 | 0 | 0 |
| SLR MEO | 60 | 26 | 26 | 0 | 0 |

### Effect on GPS

Selected candidate, GPS, all samples against unflagged samples (mean and median of d²/3; 95 % coverage):

| Mode | h | n all / unflagged | Mean d²/3 all | Mean d²/3 unflagged | Median d²/3 all | Median d²/3 unflagged | Coverage all | Coverage unflagged |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SGP4 | 1 | 362 / 308 | 30.925 | 3.1682 | 0.029755 | 0.026639 | 0.95856 | 0.98052 |
| SGP4 | 6 | 362 / 308 | 10.155 | 1.1533 | 0.0099116 | 0.0089666 | 0.96133 | 0.98052 |
| SGP4 | 12 | 361 / 308 | 30.133 | 4.0641 | 0.024452 | 0.021129 | 0.96399 | 0.98052 |
| SGP4 | 24 | 362 / 309 | 25.539 | 4.1097 | 0.018673 | 0.016830 | 0.96133 | 0.97735 |
| SGP4 | 48 | 361 / 309 | 19.302 | 4.4152 | 0.012739 | 0.011740 | 0.95845 | 0.97087 |
| SGP4 | 72 | 359 / 308 | 17.147 | 4.8720 | 0.0092042 | 0.0085618 | 0.95543 | 0.96429 |
| FFM-1 | 1 | 362 / 308 | 542.29 | 52.886 | 0.46256 | 0.42171 | 0.89227 | 0.91883 |
| FFM-1 | 6 | 362 / 308 | 495.53 | 47.820 | 0.52728 | 0.47991 | 0.90331 | 0.92532 |
| FFM-1 | 12 | 362 / 308 | 540.20 | 68.121 | 0.44237 | 0.42910 | 0.89503 | 0.92208 |
| FFM-1 | 24 | 363 / 309 | 366.52 | 53.841 | 0.51717 | 0.48966 | 0.88705 | 0.91262 |
| FFM-1 | 48 | 363 / 309 | 176.82 | 34.227 | 0.52848 | 0.51038 | 0.88430 | 0.90939 |
| FFM-1 | 72 | 363 / 309 | 116.59 | 28.511 | 0.55666 | 0.51670 | 0.87879 | 0.90615 |

| Candidate | Share of GPS d² in flagged arcs | GPS cells realistic, all samples | GPS cells realistic, unflagged samples |
| --- | ---: | ---: | ---: |
| SGP4 uncalibrated N-none (N-none/ALL) | 0.83143 | 0/6 | 0/6 |
| SGP4 selected (F-scalar-mle/UNFLAGGED) | 0.86040 | 0/6 | 0/6 |
| FFM-1 selected (coverage/UNFLAGGED) | 0.89144 | 0/6 | 0/6 |

GPS d² concentration (all finite samples; object aggregates only):

### SGP4 uncalibrated N-none, all arcs

| Object | n | Fraction of total d² | Mean d²/3 | Median d²/3 | Maximum d²/3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 36585 | 69 | 0.87095 | 27923 | 10096 | 83210 |
| 68791 | 11 | 0.067424 | 13560 | 13861 | 14733 |
| 32260 | 72 | 0.053090 | 1631.2 | 1.2534 | 8694.7 |
| 29601 | 72 | 0.0074022 | 227.43 | 2.0169 | 10727 |
| 55268 | 72 | 0.00029114 | 8.9455 | 2.6039 | 33.373 |

### SGP4 uncalibrated N-none, unflagged arcs

| Object | n | Fraction of total d² | Mean d²/3 | Median d²/3 | Maximum d²/3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 36585 | 39 | 0.74495 | 7123.2 | 2909.6 | 31083 |
| 32260 | 48 | 0.20529 | 1594.9 | 0.74644 | 8430.8 |
| 29601 | 72 | 0.043911 | 227.43 | 2.0169 | 10727 |
| 55268 | 60 | 0.0016806 | 10.445 | 3.2548 | 33.373 |
| 28874 | 72 | 0.00038632 | 2.0009 | 1.2309 | 5.5874 |

### SGP4 selected, all arcs

| Object | n | Fraction of total d² | Mean d²/3 | Median d²/3 | Maximum d²/3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 36585 | 69 | 0.83530 | 582.51 | 181.76 | 2744.3 |
| 68791 | 11 | 0.10932 | 478.22 | 506.80 | 746.26 |
| 32260 | 72 | 0.050049 | 33.448 | 0.032440 | 209.29 |
| 29601 | 72 | 0.0039077 | 2.6116 | 0.035001 | 115.13 |
| 55268 | 72 | 0.00048987 | 0.32739 | 0.088919 | 2.1655 |

### SGP4 selected, unflagged arcs

| Object | n | Fraction of total d² | Mean d²/3 | Median d²/3 | Maximum d²/3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 36585 | 39 | 0.74190 | 127.79 | 50.454 | 534.31 |
| 32260 | 48 | 0.22123 | 30.961 | 0.024051 | 156.72 |
| 29601 | 72 | 0.027991 | 2.6116 | 0.035001 | 115.13 |
| 55268 | 60 | 0.0034385 | 0.38497 | 0.17621 | 2.1655 |
| 39166 | 72 | 0.00046446 | 0.043334 | 0.022725 | 0.21731 |

### FFM-1 selected, all arcs

| Object | n | Fraction of total d² | Mean d²/3 | Median d²/3 | Maximum d²/3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 36585 | 69 | 0.73123 | 8592.5 | 2215.9 | 46592 |
| 68791 | 18 | 0.21705 | 9777.1 | 10210 | 19304 |
| 32260 | 72 | 0.047152 | 530.99 | 1.3320 | 3971.0 |
| 29601 | 72 | 0.0014960 | 16.847 | 0.62092 | 629.74 |
| 55268 | 72 | 0.0013022 | 14.664 | 6.5010 | 63.343 |

### FFM-1 selected, unflagged arcs

| Object | n | Fraction of total d² | Mean d²/3 | Median d²/3 | Maximum d²/3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 36585 | 39 | 0.70057 | 1581.2 | 537.50 | 8644.7 |
| 32260 | 48 | 0.26056 | 477.81 | 1.0070 | 2995.7 |
| 29601 | 72 | 0.013780 | 16.847 | 0.62092 | 629.74 |
| 55268 | 60 | 0.011921 | 17.488 | 7.6818 | 63.343 |
| 39166 | 72 | 0.0013763 | 1.6826 | 0.66228 | 6.1890 |

## Extreme samples

Selected candidates, samples with d²/3 above 10000 (all arcs, no exclusions, object aggregates only). A truth epoch reached from several issue times with one error (truth epochs fewer than samples) points at the truth product or the element-set association rather than at prediction error; this experiment does not investigate it.

| Mode | Class | Object | Samples | In flagged arcs | Truth epochs | Max d²/3 | Max position error (km) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| SGP4 | SLR MEO | 20026 | 12 | 0 | 4 | 6.9391e+9 | 13581 |
| FFM-1 | SLR MEO | 20026 | 12 | 0 | 4 | 8.3147e+9 | 13581 |
| FFM-1 | GPS | 36585 | 18 | 18 | 17 | 46592 | 989.87 |
| FFM-1 | GPS | 68791 | 9 | 9 | 9 | 19304 | 657.36 |

## What the console may label realistic

Cells REALISTIC on the test for the selected candidate on its claimed population; nothing else.

**SGP4 F-scalar-mle/UNFLAGGED**

| Class | 1 h | 6 h | 12 h | 24 h | 48 h | 72 h |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| GPS | — | — | — | — | — | — |
| LEO 400-800 km | — | — | — | — | — | — |
| SLR LEO 800-1500 km | — | yes | yes | yes | — | — |
| SLR MEO | — | — | — | — | — | — |

**FFM-1 coverage/UNFLAGGED**

| Class | 1 h | 6 h | 12 h | 24 h | 48 h | 72 h |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| GPS | — | — | — | — | — | — |
| LEO 400-800 km | yes | — | — | — | — | yes |
| SLR LEO 800-1500 km | yes | — | — | — | — | — |
| SLR MEO | — | — | — | — | — | — |

## Integrity and limits

Run v1c4-console-covariance-calibration-20261023; 6 bounded single-threaded workers; peak dispatch load 19.98388671875. Test arcs 600 (16 skipped, 3404 samples, 196 absent horizons); FFM-1 arcs 600 (16 skipped, 3404 samples). No truth exclusions.

Cell success does not certify an object. The selected configurations are aggregate MODELs. The event rule flags lapsed custody and detected burns, not the first sample after an unobserved burn. LEO 400-800 km includes the five COSMIC-2 satellites with archived orbits (UCAR near-real-time orbits), added because the archive held no other LEO truth after 2026-09-26 than LARETS and Sentinel-1 (to 2026-10-03). FFM uses the selected SGP4 candidate as seed and no process noise; as registered, the seed factors (four class factors at the 1-hour stratum) are fitted on all SGP4 training weeks, so FFM-1 cross-validation folds F5-F7 share them; the test is unaffected. The E14 population prior has an older fit and a broader published validation window; it is not independent of this test. FFM-1 environment uses observed drivers of the arc days, as V1c3 did. Native WasmEdge 0.16.4 accepted gp-error-model and rejects the frozen FFM artifact (ffm-memory-measured-sizing-20261022); Docker waived by owner ruling 2026-10-22. No unit suites, speed rerun, production SSH or deployment.

Sources: Space-Track / USSPACECOM / 18th Space Defense Squadron; ILRS; IGS (Johnston et al. 2017); © ESA/ESOC 2026; modified Copernicus Sentinel data 2026; UCAR COSMIC Program, 2019: COSMIC-2 Data Products, doi:10.5065/T353-C093 (CC BY 4.0). GFZ weather CC BY 4.0 (Matzka et al. 2021; F10.7 DRAO/Natural Resources Canada); NOAA SWPC public-domain forecast fills. [Data terms](../../docs/data-licenses.md). No raw OMM or truth is redistributed.

E2E: `node experiments/v1c4-console-covariance-calibration/run.mjs --check`.
