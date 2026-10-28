# Space Force XP extension to the catalog census

**Available-input extension complete; full catalog coverage remains unfinished.**

57,413 of 57,413 source/object identities accounted for; 0 pending. Original XP, AP and FFM results are retained.

Reference: USSF 9.9; modules cb22348f2c674e8920716af09f7ca2a6a87f5f28; extension f3ec1a2cfad5cda51f464814f7cd9028b944073ff36b6ae76028ae539b0f00de.

| Lineage | Evidence | Lead | Quantized XP / USSF / FFM successes | Median RMS m: quantized XP / USSF / FFM | FFM/USSF median ratio |
|---|---|---:|---|---|---:|
| cnes-doris-poe | precise-reconstruction | 1 d | 10 / 10 / 6 | 643.3622 / 643.3622 / 1.0204 | 0.0016 |
| cnes-doris-poe | precise-reconstruction | 3 d | 10 / 10 / 6 | 1864.9900 / 1864.9900 / 9.5844 | 0.0066 |
| cnes-doris-poe | precise-reconstruction | 7 d | 10 / 10 / 6 | 4353.3153 / 4353.3153 / 125.1716 | 0.0630 |
| esa-gnss-final | precise-reconstruction | 1 d | 124 / 124 / 0 | 88.9317 / 88.9317 / unavailable | unavailable |
| esa-gnss-final | precise-reconstruction | 3 d | 125 / 125 / 0 | 246.9066 / 246.9066 / unavailable | unavailable |
| esa-gnss-final | precise-reconstruction | 7 d | 125 / 125 / 0 | 593.0189 / 593.0189 / unavailable | unavailable |
| gfz-grace-fo-rso | precise-reconstruction | 1 d | 2 / 2 / 2 | 2573.7037 / 2573.7041 / 326.2846 | 0.1268 |
| gfz-grace-fo-rso | precise-reconstruction | 3 d | 2 / 2 / 2 | 18937.4930 / 18937.4945 / 3262.0064 | 0.1722 |
| gfz-grace-fo-rso | precise-reconstruction | 7 d | 2 / 2 / 2 | 83365.5762 / 83365.5805 / 5050.6380 | 0.0606 |
| gfz-mgex-rapid | precise-reconstruction | 1 d | 105 / 105 / 0 | 99.5895 / 99.5895 / unavailable | unavailable |
| gfz-mgex-rapid | precise-reconstruction | 3 d | 106 / 106 / 0 | 271.0534 / 271.0534 / unavailable | unavailable |
| gfz-mgex-rapid | precise-reconstruction | 7 d | 106 / 106 / 0 | 651.9958 / 651.9958 / unavailable | unavailable |
| ilrs-combination | precise-reconstruction | 1 d | 2 / 2 / 0 | 126.8794 / 126.8794 / unavailable | unavailable |
| ilrs-combination | precise-reconstruction | 3 d | 2 / 2 / 0 | 162.5424 / 162.5424 / unavailable | unavailable |
| ilrs-combination | precise-reconstruction | 7 d | 2 / 2 / 0 | 276.5399 / 276.5399 / unavailable | unavailable |
| nsgf-orbit | precise-reconstruction | 1 d | 1 / 1 / 0 | 188.8854 / 188.8854 / unavailable | unavailable |
| nsgf-orbit | precise-reconstruction | 3 d | 1 / 1 / 0 | 449.9335 / 449.9335 / unavailable | unavailable |
| nsgf-orbit | precise-reconstruction | 7 d | 1 / 1 / 0 | 1007.4171 / 1007.4171 / unavailable | unavailable |
| sentinel-1-poeorb | precise-reconstruction | 1 d | 3 / 3 / 3 | 884.7225 / 884.7225 / 0.7360 | 0.0008 |
| sentinel-1-poeorb | precise-reconstruction | 3 d | 3 / 3 / 3 | 2018.5658 / 2018.5658 / 25.7122 | 0.0127 |
| sentinel-1-poeorb | precise-reconstruction | 7 d | 3 / 3 / 3 | 6964.4456 / 6964.4456 / 1206.6504 | 0.2594 |
| starlink-capture-heads | operator-reconstruction | 1 d | 11162 / 11162 / 6081 | 2246.9282 / 2246.9364 / 2860.8597 | 0.8323 |
| starlink-capture-heads | operator-reconstruction | 3 d | 0 / 0 / 0 | unavailable / unavailable / unavailable | unavailable |
| starlink-capture-heads | operator-reconstruction | 7 d | 0 / 0 / 0 | unavailable / unavailable / unavailable | unavailable |
| swarm-reduced-dynamic | precise-reconstruction | 1 d | 3 / 3 / 2 | 1138.8392 / 1138.8392 / 25.5483 | 0.0199 |
| swarm-reduced-dynamic | precise-reconstruction | 3 d | 3 / 3 / 2 | 3673.2788 / 3673.2788 / 531.0497 | 0.1198 |
| swarm-reduced-dynamic | precise-reconstruction | 7 d | 3 / 3 / 2 | 10466.0861 / 10466.0863 / 11805.3542 | 4.1413 |

The JSON retains every source and failure denominator, text-quantization comparison, strict discrepancy, and paired object-cluster 95% interval (2,000 resamples after batch completion). USSF covariance is unavailable. Original covariance calibration remains in [the census report](../README.md).

| Lineage | Paired samples | Maximum difference m | Samples above 1 m | Diagnostic classifications |
|---|---:|---:|---:|---|
| cnes-doris-poe | 1440 | 0.4042 | 0 | {} |
| esa-gnss-final | 17952 | 44.9594 | 288 | {"published-rounding-limited-shadow-class":288} |
| gfz-grace-fo-rso | 288 | 0.0069 | 0 | {} |
| gfz-mgex-rapid | 15216 | 9.1033 | 178 | {"published-rounding-limited-shadow-class":178} |
| ilrs-combination | 288 | 0.0000 | 0 | {} |
| nsgf-orbit | 144 | 0.0002 | 0 | {} |
| sentinel-1-poeorb | 431 | 3.2109 | 47 | {"unexplained-strict-exceedance":47} |
| starlink-capture-heads | 535403 | 1.9604 | 14 | {"published-heavy-drag-class":14} |
| swarm-reduced-dynamic | 432 | 0.0003 | 0 | {} |

Reproduction and fixed criteria: [registered extension plan](../../../experiments/propagator-catalog-census/oracle/PLAN.md). Raw inputs, complete fitted elements and official provider binaries remain local.

- The complete direct-feed population is not yet normalized; this extension preserves the frozen local census denominator.
- Type-4 text quantization is explicit and shared; original returned-OMM outcomes remain separate. Fit comments may already specify two-line digits; OMM payload precision is not an assertion of estimator precision.
- Strict reference discrepancies remain reported even when a published numerical branch condition explains them.
- A lower position-error ratio is not calibrated uncertainty or an operational collision-risk validation.
- Native USSF and browser-hosted WASM timings are not a controlled speed comparison.
