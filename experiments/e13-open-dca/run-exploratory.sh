#!/bin/bash
# E13: the Part S and exploratory analyses (PLAN.md Amendments S1 to S5) on whatever the collectors hold, in order. Safe to run at any time: each step says "too few" and stops
# when its data are not there yet. The intended run is after the collectors end (Starlink 2026-10-20T00:00Z; Planet's final file of 2026-10-19 is published about 22:50 UTC).
#
#   experiments/e13-open-dca/run-exploratory.sh [--through 2026-10-20T00:00:00Z]
#
# Results: results/e13/part-s (S1 to S4 and S2's Starlink latency), results/e13/s3 (the combined solve, the report). Nothing here reads a density of a test split.
set -euo pipefail
cd "$(dirname "$0")/../.."
THROUGH_ARGS=()
[ "${1:-}" = "--through" ] && THROUGH_ARGS=(--through "$2")
STEPS=experiments/e13-open-dca/steps
say() { echo "$(date -u +%H:%M:%S) $*"; }

say "Planet live arcs (NRLMSISE-00, indices as released)"
node $STEPS/74-planet-live-arcs.mjs
say "S1 to S4 on the Starlink pairs"
node $STEPS/60-pairs.mjs ${THROUGH_ARGS[@]+"${THROUGH_ARGS[@]}"}
say "S2: the Starlink common mode, S5 primary pairs and precisions (6 h nodes), then S2 as written"
node $STEPS/70-starlink-common-mode.mjs ${THROUGH_ARGS[@]+"${THROUGH_ARGS[@]}"}
node $STEPS/70-starlink-common-mode.mjs ${THROUGH_ARGS[@]+"${THROUGH_ARGS[@]}"} --legacy --out results/e13/part-s/legacy
say "S3/S4/S5: the combined solve, 12 h nodes (primary), 6 h nodes, and S3 as written (unit precision)"
node $STEPS/72-combined-solve.mjs ${THROUGH_ARGS[@]+"${THROUGH_ARGS[@]}"}
node $STEPS/72-combined-solve.mjs ${THROUGH_ARGS[@]+"${THROUGH_ARGS[@]}"} --node-hours 6
node $STEPS/72-combined-solve.mjs ${THROUGH_ARGS[@]+"${THROUGH_ARGS[@]}"} --legacy
say "the report"
node $STEPS/91-exploratory-report.mjs
say "done"
