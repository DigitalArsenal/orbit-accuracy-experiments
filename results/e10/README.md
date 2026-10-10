# E10 results

Plan: [experiments/e10-teag-espf/PLAN.md](../../experiments/e10-teag-espf/PLAN.md)
(frozen at `281763c`; amendments 1 and 2 at its end). Every number in the
report is generated from run metrics; nothing is typed.

| What | Report | Metrics | Manifests |
| --- | --- | --- | --- |
| Test runs (Parts A–D, enclosure, hypotheses), read after the dev selection | [test/README.md](test/README.md) | [test/metrics.json](test/metrics.json) | [manifests/](manifests/) |
| Dev selection (κ for E26, λ_t for E25T, detection thresholds) | [test/README.md § Dev](test/README.md) | [selection.json](selection.json) | the dev run's manifest in [manifests/](manifests/) |
| Measurement-model check (dev seed d1) | [test/README.md § Notes](test/README.md) | [dev/model-check.json](dev/model-check.json) | — |

The implementation under test (TEAG primitives, ESPF 2025 and 2026, the
ellipsoidal set-membership filter, possibility screening) is in
space-data-network-modules, branch `task/teag-espf-20261009`
(`analysis/estimation`, `analysis/conjunction-assessment`); its spec, with
every gap and choice, is `analysis/estimation/docs/espf-spec.md`.

Element sets stay on the machine that ran the experiment: the manifests list
the GP-history files read by SHA-256, and no per-sample table derived from
them is committed.
