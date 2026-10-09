# E2 results

Plan: [experiments/e2-catalog-covariance/PLAN.md](../../experiments/e2-catalog-covariance/PLAN.md)
(frozen; amendments at its end). Every number below is in a report
generated from run metrics; nothing here is typed.

| Window | Report | Metrics | Manifest |
| --- | --- | --- | --- |
| Test (read once, after the freeze) | [README](test/README.md) | [metrics.json](test/metrics.json) | [manifest.json](test/manifest.json) |
| Validation (method choice) | [README](validation/README.md) | [metrics.json](validation/metrics.json) | [manifest.json](validation/manifest.json) |
| Train (fitted numbers, pinned in config.json) | [README](train/README.md) | [metrics.json](train/metrics.json) | [manifest.json](train/manifest.json) |

Train products used by later windows: [c1.json](train/c1.json),
[tle-models.json](train/tle-models.json), [fit.json](train/fit.json).
Inputs other than Space-Track element sets: [data/](data/SOURCES.md).
