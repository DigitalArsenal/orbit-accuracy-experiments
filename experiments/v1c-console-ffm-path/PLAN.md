# V1c: the console FFM coverage path against V1 and E3

Pre-registered 2026-10-22, before reading test-window states. Frozen by the
commit adding this plan and config. V1 and its published results are untouched.

## Objective and inputs

Apply the paper's precise-orbit and one-thread CPU measurements to the console
path: plugin_init_states_ecef -> plugin_ensure_coverage -> plugin_eval_positions,
configured with the landed FFM-1 catalog request and automatic Fast integration.
Build every invoked module from a private modules worktree at origin/main.
Import V1 seeds.mjs, its config inputs (reference directory, DE440 kernel, C04
EOP), and harness/stats.mjs. Use all V1 seeds at 1, 6, 12, 24, 48, 72 hours.

For the console comparison, import E3's Products and archive reader, configuration,
object classes and test window (2026-09-07 through 2026-09-26). Issue instants
are E3's midnight GPS grid (23:59:42 UTC). Select the newest eligible OMM by
its epoch then creation time, both no later than issue, as E3's scorer does.
At that sim-start, SGP4's ECEF output seeds FFM-1 exactly as the console does.
Compare both methods at the first E3 truth epoch at/after each V1 horizon,
within E3's 900-second allowance; record actual elapsed times and missing data.
No future OMM selection. All four E3 classes and available objects enter.

## Methods and pre-stated decisions

1. E-f coverage: V1's E-f force request, seeds and environment. Compare medians
   to published SLR 4.78/13.9 m and GPS 28.5/91.1 m at 24/72 h. Tolerance is
   max(0.5 m, 5% of the published median), allowing printed precision, Julian
   date quantization and integration differences, not kilometer discrepancies.
   A miss is reported as a miss. Diagnose with same-build E-f execution and
   resident controls; never loosen the tolerance after observing results.
   Source inspection before any run found that catalog seeding unconditionally
   uses Cr*A/m=0.02, overriding the configuration's per-object coefficient.
   Measure this cause using resident E-f with V1's physical coefficient and
   with 0.02. This is an anticipated limitation, not permission to relabel a miss.
2. FFM-1 coverage beside configured FFM-1 resident, identical V1 seeds and
   catalog coefficients (Cd*A/m fallback 0.01, Cr*A/m 0.02). Descriptive accuracy
   at every horizon. Path agreement tolerance: 0.1 m, allowing Julian-date
   transport and polynomial fitting. Report any excess and investigate it.
3. Console method beside SGP4 alone on paired E3 samples at all six V1 horizons.
   Report median, p95 and n, by class and method; no promised improvement.
   Errors are Euclidean position differences in meters, with every frame/time
   transform, propagation and B*-to-drag calculation performed in WASM.
   Preserve failures and coverage counts; never silently discard failed calls.
4. Speed in the same recorded run: one sequential JS thread / sequential WASM,
   thread CPU seconds per object-day, coverage and resident with equal 300 s
   forward query cadence and horizon sampling. Exclude startup, parsing and
   truth scoring; include coverage preparation and position evaluation, or
   resident propagation and decoding. Report per group and pooled total CPU /
   total propagated object-days, plus wall time, machine/runtime/module pins,
   load at both ends of each measured arc. The old paper's 0.645 s is context,
   not an acceptance threshold. Wait while one-minute load >= 0.75 * logical
   CPUs; sample busy ticks too and reject timing if saturation is observed.

Space weather uses GFZ CC BY 4.0 archive rows, optionally NOAA public-domain
rows through the landed data-source module. Never CelesTrak/CSSI source files.
Record the exact source and input hashes. Centered observed drivers are a
retrospective accuracy experiment, not a causal weather forecast claim.

## Recording and verification

Commit only aggregate metrics, manifests, generated report and code. Raw OMM,
truth and per-sample rows stay in ignored runs/. Checkpoint each completed seed.
Record config and source hashes, all input hashes, actual module WASM hashes,
source commits, package/runtime versions, CPU and load. No Docker, unit tests,
production deployment or stack gitlink changes.

One E2E: `node experiments/v1c-console-ffm-path/run.mjs --check`. Re-derive all
four tables from the recorded local run; compare committed aggregates/report,
verify completeness and hashes, and check E-f against V1's published medians.
A tolerance miss is acceptable only with a measured paired control identifying
the cause, reported explicitly. Missing data/evidence is not a pass.

## Amendments

None at registration.
