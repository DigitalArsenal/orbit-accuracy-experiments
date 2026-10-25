# E13b mechanics handoff

[PLAN.md](PLAN.md) and [config.json](config.json) hold the frozen scientific
registration. Transport-only amendments are appended to the plan. The shared
[collector](../operator-capture/README.md) runs independently of this checkout.

The registered archive-to-estimator E2E is:

```sh
npm ci --prefix experiments/operator-capture/collector
node experiments/e13b-starlink-dca/run.mjs --check
```

It requires a finished full-manifest capture cycle and E13's archived Planet
development arcs; missing inputs fail visibly, not as a pass. `--record`
additionally generates aggregate `results/e13b/mechanics.json` and its report.
Per-satellite fits remain in `/opt/data/sdn-archive/operator-capture/estimator/`.
This runner contains no hypothesis-scoring implementation.

`estimator.mjs` exposes these statistical operations on WASM-derived products:

* `arcsOf(record, shell)`: screened coast observations and merged positive
  energy segments, with the registered neighboring-interval exclusions.
* `fitShell(coast, thrust)`: robust daily common mode, per-satellite B random
  walk with its absolute prior, and conditional thrust-work kappa estimates.
* `fitFleet(records, {issueMs})`: freezes each satellite's shell at its first
  acquisition, deduplicates repeated file versions, separates shells, and
  applies the publication/observation cutoff and 30-day history when issuing
  a forecast. Supply chronological history including first acquisitions;
  trimming it beforehand would lose the fixed shell assignment.
* `forecast(solution, epochMs)`: the registered 48-hour relaxation, only for
  converged solutions. Unsupported times return null; prior-only kappa is
  explicitly identified rather than represented as measured thrust.

The comparator in the E2E uses E13's existing random-walk solver on the same
Planet development arcs. Different node alignment, absolute prior and
second-difference smoothing mean bitwise equality is not expected; centered
log-scale RMS difference below 0.05 is the mechanics tolerance. This check
is separate from the registered H1/H3 and position endpoints.

For the later scoring run, keep source creation/retrieval times and input
hashes, enforce support and causal cutoffs, and use identical information and
force settings across prediction arms. H5 can use only held-out satellites
and epochs with retained truth: the V2 registration does not promise truth
for every E13b held-out satellite or every day. Report that missingness and
leave an endpoint unavailable when support is insufficient. Do not replace
missing contemporaneous Dove corrections with historical ones. Independent
density products can lag the December 1 earliest position/drag scoring date.

Operator first hours still contain OD/forecast assumptions; the energy
diagnostic does not subtract SRP work. Absolute density versus B and continuous
thrust without coasts remain non-identifiable. These are limitations to carry
into the report, not hypotheses resolved by a mechanics pass.
