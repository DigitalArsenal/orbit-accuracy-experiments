# Execution amendment — 2026-10-26: isolate each source/object process

The original four long-lived workers completed 53,664 source/object outcomes.
Workers 0 and 3 then stopped advancing on Starlink catalog IDs 57374 and 57369,
respectively, while consuming a CPU each. A live debugger located worker 0 in
`flatc-wasm`, called by `estimationCodec.encode`, before its first estimator
invocation for that object. The exact 125,157-byte JSON request encoded in a
fresh instance in approximately 25 milliseconds. Diagnostic input, native stack
and fresh encoded bytes remain in the ignored run directory. This identifies
long-lived encoder state as the suspected cause; it does not prove the internal
flatc defect or imply a physical-model failure.

Register this execution-only amendment before resuming numerical work. Stop
only the two verified task-owned stalled worker PIDs after preserving their
checkpoints. Their coordinator exits with a recorded failure. Resume every
nonterminal object in a fresh child process, four at a time, using the existing
`processObject`, engines, native modules, input census, weather and selection.
Keep completed outcomes and completed per-arm checkpoints. No object is removed,
no time budget truncates a fit, and no force, tolerance, estimator, input state,
covariance rule or numerical score changes. Fresh processes cost additional
startup time; accuracy is the priority.

The original numerical execution identity remains valid because all its
behavior-hashed inputs are unchanged. Record this runner's committed source
hashes separately in `isolation-execution.json`. The acquisition extension is
unchanged. Successful resumption requires terminal outcomes for every original
source/object, native replay on each available lineage, and the existing full
input hash audit. The task E2E additionally verifies the direct-feed archive.
Report failures as failures and keep unresolved source/normalization gaps visible.
