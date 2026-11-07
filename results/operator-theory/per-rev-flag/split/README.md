# Near 700 km: FFM against AP on Sentinel-1, burn-affected and burn-free

Report only, registered in `experiments/operator-theory/PER-REV-FLAG.md` (amendment of 2026-11-06, Sentinel-1 split) before any split was read. Burns from the covariance-model catalog (4 m truth steps, validated on Sentinel-1). Altimetry windows get no verdict.

| Fit, h | Lead, h | Windows | Burn-affected | Burn-free | Unchecked | FFM/AP all | FFM/AP burn-affected | FFM/AP burn-free | Reading |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 24 | 24 | 276 | 109 | 151 | 16 | 0.232 [0.19, 0.294] | 0.917 [0.883, 1.031] | 0.165 [0.117, 0.192] | explained by burns: 151 burn-free windows, interval upper bound 0.192 at or below 1.1 |
| 24 | 48 | 274 | 152 | 99 | 23 | 0.786 [0.447, 0.981] | 1.211 [1.168, 1.331] | 0.199 [0.15, 0.295] | explained by burns: 99 burn-free windows, interval upper bound 0.295 at or below 1.1 |
| 24 | 72 | 275 | 189 | 63 | 23 | 1.173 [0.982, 1.289] | 1.407 [1.291, 1.521] | 0.347 [0.179, 0.522] | explained by burns: 63 burn-free windows, interval upper bound 0.522 at or below 1.1 |
| 24 | 168 | 274 | 258 | 10 | 6 | 2.055 [1.763, 2.321] | 2.075 [1.814, 2.358] | 0.467 [0.162, 2.418] | undecided: 10 burn-free windows, interval [0.162, 2.418] |
| 72 | 24 | 259 | 180 | 65 | 14 | 0.977 [0.95, 0.996] | 0.996 [0.98, 1.007] | 0.726 [0.456, 0.87] | explained by burns: 65 burn-free windows, interval upper bound 0.87 at or below 1.1 |
| 72 | 48 | 258 | 198 | 45 | 15 | 1.024 [1.003, 1.045] | 1.03 [1.009, 1.048] | 0.941 [0.681, 1.074] | explained by burns: 45 burn-free windows, interval upper bound 1.074 at or below 1.1 |
| 72 | 72 | 258 | 215 | 29 | 14 | 1.04 [1.027, 1.063] | 1.043 [1.028, 1.073] | 1.057 [0.759, 1.209] | undecided: 29 burn-free windows, interval [0.759, 1.209] |
| 72 | 168 | 257 | 255 | 2 | 0 | 1.037 [1.022, 1.062] | 1.038 [1.022, 1.062] | 0.538 [0.538, 0.538] | no reading: 2 burn-free windows, under 10 |

