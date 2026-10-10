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

<!-- credits:begin (harness/credit-lines.mjs) -->

## Credits

- © Navigation Support Office at ESA/ESOC 2026; IGS analysis-centre products, courtesy of the International GNSS Service (Johnston et al. 2017, doi:10.1007/978-3-319-42928-1).
- Source: USSPACECOM / 18th Space Defense Squadron, via Space-Track.org (https://www.space-track.org).

Every source and its terms: [docs/data-licenses.md](../../docs/data-licenses.md#credits-by-experiment).

<!-- credits:end -->
