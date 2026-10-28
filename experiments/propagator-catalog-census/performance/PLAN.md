# Collision-risk kernel profiling and paired optimization

Numerical baseline: modules 5746b0f53504d4d8a83c4ec7921f4a34b85901a6,
containing the landed covariance, Nc cascade and Lebedev corrections. The
published CARA/Hall cases and independent disk/sphere identities passed the
native and runtime E2Es before this performance stage. Those checks validate
the numerical kernels, not catalog-wide calibrated collision probabilities.

Profile the actual full-state public functions on all eight CARA usage cases
and all twelve Hall/Alfano cases, retaining the native default tolerances,
quadrature checks, duration bounds and escalation flags. Each input contains
its own epoch/frame/unit/source labels in the pinned CSV and NOTICE. Call
usage assessment, 2D-Nc and 3D-Nc separately to distinguish their costs. No
case is selected by observed performance. Failed numerical convergence remains
reported and cannot become a faster accepted result.

Use an optimized native build with symbols for stack sampling. This identifies
CPU hotspots; it does not establish browser or WasmEdge speed. After choosing
an optimization from that profile, test A/B/A in the same build/compiler/runtime
on this machine. Record hardware, load, process CPU and wall time. Do not make
a speed claim if the host is CPU-saturated. Use at least seven paired measured
repetitions after warmup, equal inputs and complete case coverage. Report the
paired median total CPU ratio and a deterministic 2,000-resample 95% interval;
claim an improvement only if its upper bound is below 0.95. Retain smaller or
uncertain changes as inconclusive performance evidence.

Before accepting a candidate, rerun all existing authoritative kernel E2Es
at their unchanged tolerances. Compare baseline/candidate outputs, method,
convergence, applicability and repair flags. Preserve Monte Carlo sample count,
seed and confidence intervals. For deterministic numerical values, require
relative difference at most 1e-10 plus 1e-15 absolute, in addition to the
independent published tolerances. No looser accuracy, reduced sample count,
removed angular confirmation or changed temporal convergence is admissible.
Validate the resulting isomorphic artifact through browser and WasmEdge.

Catalog propagation, physical normalization, formal covariance calibration and
collision-risk arithmetic remain separate result classes. This benchmark does
not convert incomplete catalog evidence into a pass.
