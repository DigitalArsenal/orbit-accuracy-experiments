# Shared prospective operator capture

E13b owns `collector/`; V2 owns `SUBSETS.md`. The collector only reads the
registration. Its first-3-hour truth limit, first-state-at/after target rule
and tolerance are applied before retaining normalized GCRF states. Missing
registrations trigger the all-satellite 8-hour/10-minute fallback. Energy,
drag work and Brouwer mean elements always cover the fleet at 10 minutes.

Install dependencies with `npm ci --prefix experiments/operator-capture/collector`.
After pushing the frozen plan and exact collector candidate, run:

```sh
OPERATOR_MODULES_ROOT=/path/to/fresh/modules-worktree \
OPERATOR_SUBSETS=/path/to/experiments/operator-capture/SUBSETS.md \
node experiments/operator-capture/collector/install.mjs
```

This installs code, dependencies and hashed WASM artifacts under
`/opt/data/sdn-archive/operator-capture/_collector/releases/<commit>/` and
starts a detached local process. It runs independently of the task worktree.
`_collector/active.json` records the release, PID and provenance. Nothing is
deployed to a node or production host. The source module manifest and WASM
hashes are frozen per installed release; upgrades require another install.

Control and evidence under `/opt/data/sdn-archive/operator-capture/`:

* `collector.pid`: exclusive process ownership; never overwrite a live PID.
* `collector.log`: JSON event log; `collector.stdout.log`: fatal diagnostics.
* `collector.stop`: create to stop after the current satellite. To restart,
  verify the old PID has exited and explicitly remove this stop file.
* `cycles/<UTC>/summary.json` and `cycles.jsonl`: manifest count, successful
  files, failures, samples/truth, bytes transferred (including weather), CPU
  seconds, wall time, compressed product bytes, hashes and registration.
* `cycles/<UTC>/<norad>.json.gz`: derived products only. Energy and elements
  have explicit units, theory and E13's zero-EOP diagnostic convention;
  source metadata reports exact ranges, hashes and discarded tail bytes.

One physics worker consumes at most four prefetched heads; HTTP request starts
are globally at least 100 ms apart, with at most four requests in flight. No automatic full
file fallback: range requests must answer 206 and the requested Content-Range.
Variable-width files use one 256 KiB prefix (about nine hours in the observed
format); only the first eight hours enter physics, and the tail is discarded.
No raw ephemeris is ever written, even temporarily.
Network/HTTP failure gets one retry after 30 seconds, then halts; 403/429
halts immediately. Superseded 404 files are counted as missing. A cycle
enumerates every listed Starlink file and reports every failure. Cycles start
eight hours apart, with no overlap or catch-up burst. Capture ends December 2.

CPU accounting enforces a 50% one-core duty target through sleeps after each
satellite; WebAssembly invocations are serial. The collector pauses at cycle
start below 25 GiB free and interrupts a cycle if free space falls below that
floor. Disk/PID/log conventions follow
the local SupGP collector; no CelesTrak source or proxy is used.

Weather is obtained only through `data-source/space-weather` plan/parse:
GFZ CC BY 4.0 (Matzka et al. 2021; DRAO/NRCan F10.7), NOAA SWPC public domain.
Only source hashes and normalized work products survive in this archive.
An eight-hour operator head contains forecast/model assumptions; it is not
independent GPS telemetry. Coverage gaps and prior-only fits remain explicit.

Before restart, inspect `collector.pid` with `ps -p <PID> -o pid,command`.
Stop only this verified exact PID or use the stop file. The installed command
is `OPERATOR_MODULES_ROOT=<release>/modules OPERATOR_SUBSETS=<registration>
node <release>/collect.mjs`; run it detached with output appended to the
existing stdout log. `--once` is available for a complete diagnostic cycle.
