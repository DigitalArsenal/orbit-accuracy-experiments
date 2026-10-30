# Shared prospective operator capture

E13b owns `collector/`; V2 owns `SUBSETS.md`. The collector only reads the
registration. Its first-3-hour truth limit, first-state-at/after target rule
and tolerance are applied before retaining normalized GCRF states. Missing
registrations trigger the all-satellite 8-hour/10-minute fallback. Energy,
drag work and Brouwer mean elements always cover the fleet at 10 minutes.

Install dependencies with `npm ci --prefix experiments/operator-capture/collector`.
After pushing the frozen plan and exact collector candidate to `origin/main`, run:

```sh
OPERATOR_MODULES_ROOT=/path/to/modules-checkout-or-installed-release/modules \
OPERATOR_SUBSETS=/path/to/experiments/operator-capture/SUBSETS.md \
node experiments/operator-capture/collector/install.mjs
```

This installs code, dependencies and hashed WASM artifacts under
`/opt/data/sdn-archive/operator-capture/_collector/releases/<commit>/` and
starts a detached local process. It runs independently of the checkout it was
installed from. `OPERATOR_MODULES_ROOT` is a modules checkout, or the `modules/`
directory of an installed release: that release's bytes and modules commit carry
forward, checked against its `registration.json`, so the derived products keep
the same WASM across an upgrade. `registration.json` records `installedUtc`.
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
* `cycles/<UTC>/<norad>.ocm`: the operator-covariance sidecar (E13b amendment
  A4), a size-prefixed `$OCM` FlatBuffer: derived ten-minute GCRF states
  (`STATE_DATA`, km and km/s) for the first 16 hours of the file, and the
  operator's own 21 UVW covariance values at each state (`COVARIANCE_DATA`,
  lower triangle by rows, `COV_ORDERING` LTM, `COV_REF_FRAME` UVW = RTN, km,
  km/s units as the source gives them, never rotated). A file that holds less
  than 16 hours gives all it holds. `PROVENANCE` names the source and its terms;
  `USER_DEFINED_PARAMETERS` carry the fetched range, its SHA-256 and the hash
  that pairs the sidecar with its `json.gz` record. The `json.gz` record is the
  registered E13b product and is unchanged by the sidecar.

One physics worker consumes at most four prefetched heads; HTTP request starts
are globally at least 100 ms apart, with at most four requests in flight. No automatic full
file fallback: range requests must answer 206 and the requested Content-Range.
Variable-width files use one 512 KiB range (the first 16 hours of a 60 s file
take about 454 KB with covariance). The registered record uses only the first
262,144 bytes and the first eight hours of them (amendments A2, A4), so it is
byte-identical to the one a 256 KiB range gives; the sidecar keeps the first 16
hours at ten minutes, and the tail is discarded. No raw ephemeris is ever
written, even temporarily.
Network/HTTP failure gets one retry after 30 seconds, then halts; 403/429
halts immediately. Superseded 404 files are counted as missing. A cycle
enumerates every listed Starlink file and reports every failure. A sidecar that
cannot be built is counted (`sidecarFailures`) and logged, and never removes the
file's registered record. Cycles start eight hours apart, with no overlap or
catch-up burst; a restarted process waits for the next slot (the last recorded
start plus eight hours) and starts at once only when that slot has passed.
Capture ends December 2.

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
existing stdout log. `--once` is available for a complete diagnostic cycle, and
`--limit <n>` limits it to the first n listed files (a commissioning subset: the
cycle reads `partial`, never `complete`).

Checks, from the repository checkout (`npm ci --prefix experiments/operator-capture/collector` first):

```sh
node experiments/operator-capture/collector/check.mjs          # the A4 E2E: live files, pinned WASM, nothing skipped
node experiments/operator-capture/collector/count-cycle.mjs <cycle-id>
```

`count-cycle.mjs` reads one NEW cycle (it started after the installed release's
`installedUtc`; an older cycle is refused) and prints counts only: files with a
record and a sidecar, states per sidecar, covariance values per state (21), hours
retained, the frame and ordering labels, and the cycle's counters. It never
prints a state or a covariance value.

A full cycle with the sidecar shows: `files.json`, `files.sidecars` and `files.paired`
equal (every record has its sidecar); `recordsPerFile.sidecarStates` 97 for every
source file of 16 hours or more (fewer only for a shorter source file, which
`hoursRetained.filesBelow16` counts); `covariancePerState` 21 for every file;
`hoursRetained.max` 16; the labels UVW, LTM, GCRF and `$OCM`;
`recordsPerFile.registeredSamples` 49; and `ledger.sidecarFailures` 0.
