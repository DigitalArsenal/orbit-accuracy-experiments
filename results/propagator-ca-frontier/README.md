# Propagator execution and CA/Pc audit

Generated from the committed aggregate outputs and their manifests. Plan: [PLAN.md](../../experiments/propagator-ca-frontier/PLAN.md). The follow-up is exploratory: the original timing and B2 results were already known.

**Decision:** preserve demonstrated accuracy gains, including weather and density correction. Optimize execution and trajectory reuse around that accuracy. Temporal batching is promising; covariance prediction and the evaluation event still need attention.

## XP: complete batch cost

White-room XP, 100 synthetic objects across five regimes, 256 shuffled epochs per object and 5 alternating repetitions. CPU microseconds per returned state include ingest, sorting, propagation, output copying and restoration of caller order. Module loading is separate. Fits, frames, covariance, TCA, Pc and transport are excluded.

| Query span | Caller order, median (range) | Temporal batching, median (range) | Speedup |
| --- | ---: | ---: | ---: |
| forward | 18.59 (18.25–18.87) | 2.10 (2.00–2.13) | 8.86× |
| backward | 19.00 (18.94–19.05) | 2.11 (2.09–2.31) | 8.99× |
| both | 17.46 (17.23–17.49) | 2.14 (2.07–2.32) | 8.17× |

Forward spans epoch to +72 h; backward spans epoch to −72 h; both spans −36 to +36 h. Every white-XP comparison passed: 384,000 state comparisons across 15 repetitions/directions, zero changed position or velocity components, zero status errors and no nonfinite states. There are 76800 object/query evaluations per repetition; repeated checks are not independent accuracy samples.

Each returned batch occupies 1,331,200 bytes. White XP's reported resident store is 417,300 bytes for this population. WASM memory figures in xp.json are high-water marks and must not be used as a cross-engine resident-memory comparison. Host saturation check: passed.

The source retains 12 sparse checkpoints per direction and the latest interval. Reordered queries can repeat integration between checkpoints. The implemented experiment helper groups queries outward from epoch and restores caller order; it changes no forces, integrator or interpolation. The next production candidate is the same scheduling where queries are known, or retained fixed nodes for adaptive TCA searches. This result does not establish adaptive-query or full-catalog speed.

## USSF reference: a failed unordered-query comparison

The pinned reference is **USSF 9.1.1.0 WASM**, distinct from the native 9.9 conformance reference. All comparison failures remain in the aggregates; exact-equality criteria were not relaxed.

| Direction | Shuffled nonfinite states / states | Temporal nonfinite states | Largest finite position difference between orders, m |
| --- | ---: | ---: | ---: |
| forward | 4000 / 25600 | 0 | 20448.243 |
| backward | 3900 / 25600 | 0 | 13950.290 |
| both | 7960 / 25600 | 0 | 9540.666 |

The nonfinite states carried status zero. The distributed API documentation confirms the eight-double result layout. An independent check through the repository's existing single-object reference wrapper reproduces the issue; precomputing to +72 h also fails to remove it:

| Regime | Shuffled nonfinite / queries | Prepared then shuffled nonfinite / queries | Sorted nonfinite |
| --- | ---: | ---: | ---: |
| LEO | 12 / 256 | 12 / 256 | 0 |
| SSO | 12 / 256 | 12 / 256 | 0 |
| MEO | 85 / 256 | 85 / 256 | 0 |
| GEO | 6 / 256 | 6 / 256 | 0 |
| HEO | 85 / 256 | 85 / 256 | 0 |

Consequently, the earlier scratch claim that USSF is faster for shuffled queries is not an admissible comparison of successful propagation. Its elapsed CPU is recorded, but invalid output disqualifies that workload from the ranking. This does not establish a defect in native 9.9 or any later release. No USSF implementation was modified or reverse engineered.

## FFM: restored resident-path measurement

The first scratch attempt resolved old parent-directory schema bindings because propagator/ffm lacked local dependencies. An isolated checkout with its exact lockfile dependencies resolves the issue. The existing resident A/A runner now succeeds on the identical pinned artifact:

| Fixture | CPU seconds per object-day | Byte-identical repeat |
| --- | ---: | --- |
| ISS | 0.06998 | yes |
| STARLINK | 0.07894 | yes |
| SSO800 | 0.04999 | yes |
| LOW250 | 0.10579 | yes |
| GPS | 0.02217 | yes |
| GEO | 0.01302 | yes |
| MOLNIYA | 0.06363 | yes |
| GTO | 0.07452 | yes |

Batched versus separate objects: byte-identical. The runner measures ingest + three-day trajectory preparation + description, reporting the smaller of two repeats. These are eight fixture orbits with synthetic weather, not a real-weather catalog benchmark. Native WasmEdge: skipped (wasmedge-hours 0). A/A agreement tests repeatability, not independent accuracy. This workload must not be divided by XP state-query timings to claim a speed ratio.

## B2: proximity is distinct from the Pc collision event

The audit read 50,036 stored encounter rows and reproduced all 6 registered missedAlert values. B2 uses Pc for a 20 m combined hard-body radius, but its hit and pcCalibration.hitShare predicates use true miss below 200 m. The registered missedAlert denominator is all paired encounters, not only collisions or close approaches.

Laser/precise-secondary population: 19,997 paired encounters; 3 excluded for missing/invalid paired Pc. Green is Pc < 1e-7; red is Pc >= 0.0001; remaining cases are yellow.

| True miss | Denominator | FFM green | FFM red | XP green | XP red |
| --- | ---: | ---: | ---: | ---: | ---: |
| inside-HBR | 1951 | 14 | 1915 | 2 | 1560 |
| HBR-to-200m | 6697 | 4987 | 1380 | 5 | 5234 |
| 200m-through-5km | 9345 | 9296 | 20 | 4935 | 2071 |
| above-5km | 2004 | 2004 | 0 | 1994 | 1 |

Of FFM's 5001 registered green outcomes below 200 m, 4987 (99.72%) lie outside the collision radius. The headline 25.01% is a proximity statistic, not a missed-collision rate. Within the sampled collision stratum, FFM has 14/1951 green outcomes and XP 2/1951; both threshold bands and false-alert outcomes matter.

- Post-hoc diagnostic of already-seen B2 outputs, not confirmatory evidence.
- Misses were log-uniform from 10 m to 10 km, with constructed geometry and reused orbital errors.
- No draws below 10 m: the collision stratum is only 10–20 m, not the full collision disk.
- One ISS and five laser objects; encounter counts are not independent-object counts.
- Conditional rates describe the selected synthetic population, not operational collision frequencies.
- Changing the event radius alone does not establish Pc calibration; population selection also matters.
- Covariance-realism failures remain independently of the event-definition mismatch.

A 200 m screening-recall requirement can be useful, but must be scored separately from the collision event. NASA defines the hard-body radius as the collision boundary; its handbook also requires realistic uncertainty for probability-based assessment. [NASA handbook, Appendices I and N](https://www.nasa.gov/wp-content/uploads/2024/01/oce-51-nasa-spacecraft-conjunction-assessment.pdf).

The registered verdict also requires strictly improved false alerts above 5 km. Two zero-false-alert arms cannot satisfy that condition. “No demonstrated CA difference” therefore must not be interpreted as proof of equal utility.

## Accuracy remains valuable; covariance remains unresolved

Existing B2 median window 3D RMS, km; these historical results use a different pinned module revision from the new timing:

| Population | Arm | Day 1 | Day 2 | Day 3 |
| --- | --- | ---: | ---: | ---: |
| iss | ffm | 2.435 | 4.646 | 7.972 |
| iss | sgp4xp | 5.850 | 12.001 | 23.222 |
| laser | ffm | 0.008 | 0.011 | 0.015 |
| laser | sgp4xp | 0.784 | 1.218 | 1.718 |

Laser FFM nominal 95% covariance coverage ranges from 13.7% to 18.5%. Those failures survive the event correction. Preserve the position-accuracy gains and improve forecast-error modeling and calibration on independent holdouts. These limited populations do not establish broad operational superiority.

## Reproduction and verification

Check out the modules commit in config.json and attach each module's exact dependency bundle. No binaries or third-party element sets are copied into this experiment. Commands, package versions, source/artifact/input hashes and the committed frozen plan are in the four `*.manifest.json` files.

```sh
node experiments/propagator-ca-frontier/run-xp.mjs --modules /path/to/pinned-modules
node experiments/propagator-ca-frontier/probe-reference.mjs --modules /path/to/pinned-modules
node experiments/propagator-ca-frontier/run-ffm.mjs --modules /path/to/pinned-modules
node experiments/propagator-ca-frontier/audit-ca.mjs --rows /path/to/B2/rows
node experiments/propagator-ca-frontier/verify.mjs --modules /path/to/pinned-modules
```

The first two commands return a failing research outcome when reference-order equality fails; results and manifests are still saved. The E2E verifies faithful reproduction of that failure, white-XP equivalence, the real archive audit and exact report regeneration. It does not convert a failed scientific comparison into a pass. Original scratch raw timings and the first failed full batch run remain in local scratch and ignored runs; the published aggregates are the pinned reruns. No future truth windows or production deployment are part of this work.
