# V1c3 — blocked before calibration

No V1c3 numerical result or selected model exists yet. The frozen registration
was pushed at `5e1be5ef06815647e8e8a10c96a58a536b353105` before any calibration.
See [PLAN.md](../../experiments/v1c3-console-covariance-calibration/PLAN.md).

The node's `prewarm-aot` on WasmEdge 0.16.4 accepted the exact V1c2
gp-error-model artifact and rejected its exact FFM artifact with
`Not implemented instructions in AOT/JIT` (exit 1). The artifacts were copied
from the preserved V1c2 replay after verifying their published hashes, into
an isolated dependency worktree; nothing was built or run in a canonical
checkout. [Machine-readable evidence](runtime-compatibility.json) identifies
the artifacts, node binary, command and local log hash.

Current FFM source explicitly builds with Wasm exceptions. This is an
inherited artifact incompatibility, not a missing dependency or toolchain.
The task claims only the V1c3 experiment and results directories. Repairing
FFM's error paths/build is outside those claims. A replacement must preserve
the experiment's registered numerical controls; the frozen V1c2 data and
verdict code must remain unchanged.

The intended split is training issues August 3–24, all targets before August
28, versus V1c2's frozen September 7–26 issue pairs. The twelve registered
SGP4 candidates and four FFM candidates are **NOT RUN**, not zero realistic
cells. Neither a selected configuration, worst-cell result, new GPS diagnosis
nor an output MODEL record is available. V1c2's published 0/24 in both modes
remains the baseline, not a V1c3 finding.

WIP contains typed calibration orchestration, separate-term resident STM
orchestration, and bounded causal archive collection. It is incomplete and
has not passed the declared E2E or gauntlet. Numerical runs, headless parity,
landing and deployment are blocked/skipped. No unit suite or Docker ran;
the owner's Docker waiver does not waive native AOT compatibility.
