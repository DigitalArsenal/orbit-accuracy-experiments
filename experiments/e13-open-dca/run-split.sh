#!/bin/bash
# E13: the whole chain of one split, in the order of PLAN.md sections 7 and 9, two compute processes at a time (the collector is the third).
#
#   experiments/e13-open-dca/run-split.sh dev|testA|testB [stage ...]
#
# Stages (default: all): arcs provenance density score swarm doves propagation report. For a test split every step refuses to start unless the freeze
# and results/e13/selection.json are committed and unchanged (windows.mjs); nothing here weakens that. Resumable: each step skips what it has done.
set -euo pipefail
cd "$(dirname "$0")/../.."
SPLIT=${1:?split}
shift || true
STAGES=${*:-arcs provenance density score swarm doves propagation report}
STEPS=experiments/e13-open-dca/steps
STORE=/opt/data/sdn-archive/e13-open-dca
STARTED_FROM=$(git rev-parse --short HEAD)
want() { for s in $STAGES; do [ "$s" = "$1" ] && return 0; done; return 1; }
say() { echo "$(date -u +%H:%M:%S) [$SPLIT] $*"; }
two() { for k in 0 1; do "$@" --shard $k/2 & done; wait; }
rows() { ls $STORE/propagation/$SPLIT-$1-*of2.jsonl | paste -sd, -; }

want arcs && { say "arcs"; two node $STEPS/10-planet-arcs.mjs --split $SPLIT >> $STORE/planet-arcs/$SPLIT-g24lean.log 2>&1; }
want provenance && { say "arcs provenance"; node $STEPS/11-arcs-provenance.mjs --split $SPLIT --started-from "$STARTED_FROM"; }
want density && { say "density windows"; node $STEPS/20-density-windows.mjs --split $SPLIT; }
want score && { say "density score (H1, H2, H3, H6)"; node $STEPS/30-density-score.mjs --split $SPLIT; }
want swarm && { say "H4: Swarm propagation"; two node $STEPS/35-propagation.mjs --split $SPLIT --target swarm; }
want doves && { say "H5: held-out Dove propagation"; two node $STEPS/35-propagation.mjs --split $SPLIT --target doves --variants D0,D13; }
want propagation && { say "propagation scores"; node $STEPS/50-propagation-score.mjs --split $SPLIT --rows "$(rows swarm),$(rows doves)"; }
want report && { say "report"; node $STEPS/90-report.mjs --split $SPLIT; }
say "done"
