# E2b results

Plan: [experiments/e2b-correlated-covariance/PLAN.md](../../experiments/e2b-correlated-covariance/PLAN.md) (changes to the draft and amendments at its end). Every number below the window links is generated from run metrics.

| Window | Report | Metrics | Manifest |
| --- | --- | --- | --- |
| test | [README](test/README.md) | [metrics.json](test/metrics.json) | [manifest.json](test/manifest.json) |
| validation | [README](validation/README.md) | [metrics.json](validation/metrics.json) | [manifest.json](validation/manifest.json) |
| train | [README](train/README.md) | [metrics.json](train/metrics.json) | [manifest.json](train/manifest.json) |

Harness checks (A0, dev window): [dev/checks.json](dev/checks.json).

Reusable train products: [train/correlation-model.json](train/correlation-model.json) (P(a), C₁₂(g, τ), correlation matrices; schema inside) and [train/products.json](train/products.json).

Every step's run manifest (command, commits, module WASM SHA-256, and the SHA-256 of every input file; no element sets) is in [manifests/](manifests/).

<!-- credits:begin (harness/credit-lines.mjs) -->

## Credits

- © Navigation Support Office at ESA/ESOC 2026; IGS analysis-centre products, courtesy of the International GNSS Service (Johnston et al. 2017, doi:10.1007/978-3-319-42928-1).
- Source: USSPACECOM / 18th Space Defense Squadron, via Space-Track.org (https://www.space-track.org).

Every source and its terms: [docs/data-licenses.md](../../docs/data-licenses.md#credits-by-experiment).

<!-- credits:end -->
