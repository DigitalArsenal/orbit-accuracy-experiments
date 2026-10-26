# Propagator execution and CA/Pc event audit

Frozen configuration: `config.json`. This plan is committed before the new
runner reads the stored encounter rows. The work is an exploratory follow-up
to results already seen on 2026-10-26; registration does not turn those known
results into prospective evidence. No new held-out truth window is used.

## Objective and scope

Find execution speed improvements while preserving accuracy relevant to
conjunction assessment and probability of collision. Retain demonstrated
accuracy gains from weather, density correction and force fidelity regardless
of their runtime cost. The module computes the orbit; this repository only
orders requests, copies results, compares outputs and counts stored outcomes.

The scratch investigation found a strong XP query-order effect, exact output
agreement on 100 synthetic objects, and a mismatch between B2's 200 m proximity
event and the 20 m hard-body radius used by its Pc calculation. The new work
measures the whole batch operation and publishes a reproducible supplemental
audit. It does not modify B2, XA or XM plans, results, inputs or implementations.

## Inputs and methods

- Pin all three WASM artifacts and the modules source commit in `config.json`.
  Use Node v25.4.0, one calling thread and a nonsaturated host. Verify the pins
  before import. Record commands, source commits, package versions, artifact
  hashes, input hashes, host, load and timings in each run manifest.
- Generate 100 deterministic synthetic type-4 element sets: 20 each in LEO,
  SSO, MEO, GEO and HEO. Use the same rounded element strings for white-room XP
  and USSF 9.1.1.0 WASM. No third-party element set is redistributed.
- Retain the earlier raw-export timing as historical exploratory evidence.
  The new timing measures ingest, request planning, propagation, copied output
  and restoration of caller order. Module loading is measured separately.
  Neither includes fitting, frames, covariance, TCA search, Pc or transport.
- Compare caller-order execution with temporal batching for 256 shuffled
  epochs over 72 hours, forward, backward and spanning both directions.
  Batch each direction outward from epoch, then restore the input order.
  Use five alternating A/B repetitions after 40 warmup queries. Record all
  status failures, nonfinite successful states and every output difference.
  Exact equality is the acceptance criterion; no tolerance is adjusted later.
- Run FFM's existing resident A/A harness against the identical artifact on
  its eight committed regime fixtures for three days, two repetitions. Retain
  its recorded timing definition (smallest repeat) and byte-equivalence checks.
  Native WasmEdge is explicitly skipped in this diagnostic. These fixtures
  use synthetic weather. Do not rank this result against raw XP state queries.
- Read only the three B2 encounter files named and hashed in `config.json`.
  Resolve B2 configuration and table from the immutable source commit. Refuse
  changed input hashes. Keep only aggregates in tracked results; raw rows and
  intermediate states remain in ignored `runs/` or memory.

## Endpoints and decision rules

XP: median and range of thread CPU microseconds per state, complete batch wall
time, initialization and planning/copy costs where separable, resident store
size, output bytes, all propagation statuses and exact six-component equality.
Claim a measured batching improvement only when original output order is
restored and every state/status agrees. This finite corpus does not establish
catalog-tail behavior, adaptive-query performance or independent accuracy.

CA: first reproduce all six registered missedAlert values exactly. Preserve
that endpoint's denominator of all paired encounters. Then tabulate green
(Pc < 1e-7), yellow and red (Pc >= 1e-4) outcomes separately for true miss
inside 20 m, 20–200 m, 200 m–5 km and above 5 km. State each denominator.
Keep collision classification distinct from 200 m proximity recall. Report
missing or invalid Pc values explicitly; do not silently count them as zero.

The synthetic misses start at 10 m, reuse orbital errors, and cover five laser
objects and one ISS. They cannot establish operational collision frequencies
or Pc reliability. No fitted calibration or new confidence interval is claimed.
The existing covariance-realism failures remain independent evidence.

FFM: report whether the exact pinned dependency environment runs the resident
path, byte equivalence of batched versus separate objects, and its measured
cost. A failed or skipped run remains visible. A/A agreement is repeatability,
not accuracy against independent truth.

## Verification and completion

The task's E2E reruns the real pinned XP module on this query set, audits the
real archived B2 rows against immutable results, checks stored provenance and
regenerates the report exactly. The gauntlet additionally runs the repository's
required site build and headless page checks. No product UI is changed.

Publish only scripts, frozen plan/configuration, aggregate metrics, manifests
and generated report in the claimed directories. Record blocked checks and
limitations. No production deployment is part of this task.
