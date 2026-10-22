# Reproducing V1c

Worktree source: modules `6b1132cb` (origin/main fetched 2026-10-22), which
contains the console coverage change `21f53b2c`. Never use stale canonical
module artifacts. No production services or Docker are needed.

In the experiments worktree, run `npm ci`. In the modules worktree provision:

- `propagator/ffm`: `npm ci`, then `node build.mjs` with
  `SDN_LOCAL_EMSDK_DIR` pointing at a repo-local emsdk that has LLVM's standard
  Wasm exception archives. The recorded build used the stack's
  `OrbPro/packages/wasm-engine/deps/emsdk`.
- `foundation/time`: `npm ci`, then `node build.mjs` (SDK pinned by its lock).
- `data-source/eop-parser`: `npm ci`; also provision the imported
  `data-source/eop-request` build helper with `npm install --package-lock=false`
  (it has no lockfile). Run the parser's `node build.mjs`, setting
  `SPACE_DATA_STANDARDS_ROOT` to ffm's installed published SDS package. The
  helper must resolve its own SDK 0.9.7, not the aggregate root's older SDK.
- `propagator/sgp4`: `npm ci`, then `bash build.sh` with the same repo-local
  emsdk and `FLATBUFFERS_ROOT` pointing to the stack FlatBuffers checkout.

Build products stay in the private modules worktree. The recorded run retains
copies of invoked WASM, the kernel and build provenance locally for verification
after clean worktree removal; none are published in the results.

Set `SDN_MODULES_ROOT` to that worktree and run:

```
node experiments/v1c-console-ffm-path/run.mjs
node experiments/v1c-console-ffm-path/run.mjs --check
```

`--stop-after N` checkpoints after a V1 seed (exit 75); `--resume RUN_ID`
continues the recorded run and enforces unchanged config, modules and input
hashes. `--report RUN_ID` regenerates aggregates from recorded outputs without
propagation. `SDN_V1C_RUN_DIR` locates an archived run for `--check`.

The only acceptance E2E is `--check`; no unit suite or additional parity suite
is needed for this orchestration-only change. The recorded program directly
calls the catalog exports used by the browser pool and the configured resident
API in the same sequential WASM artifact.
