# E2b results

Plan: [experiments/e2b-correlated-covariance/PLAN.md](../../experiments/e2b-correlated-covariance/PLAN.md) (changes to the draft and amendments at its end). Every number below the window links is generated from run metrics.

| Window | Report | Metrics | Manifest |
| --- | --- | --- | --- |
| validation | [README](validation/README.md) | [metrics.json](validation/metrics.json) | [manifest.json](validation/manifest.json) |
| train | [README](train/README.md) | [metrics.json](train/metrics.json) | [manifest.json](train/manifest.json) |

Harness checks (A0, dev window): [dev/checks.json](dev/checks.json).

Reusable train products: [train/correlation-model.json](train/correlation-model.json) (P(a), C₁₂(g, τ), correlation matrices; schema inside) and [train/products.json](train/products.json).

Every step's run manifest (command, commits, module WASM SHA-256, and the SHA-256 of every input file; no element sets) is in [manifests/](manifests/).

