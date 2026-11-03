#!/bin/bash
# The registered run of PLAN.md. A rerun adds only what is missing.
set -u
cd "$(dirname "$0")/../.."
[ -n "${SDN_MODULES_ROOT:-}" ] || { echo "SDN_MODULES_ROOT is not set" >&2; exit 2; }
FREE=$(vm_stat | awk '/Pages free/ {f=$3} /Pages inactive/ {i=$3} END {printf "%d", (f+i)*16384/1073741824}')
[ "$FREE" -ge 16 ] || { echo "only $FREE GiB free; 16 GiB are needed" >&2; exit 2; }
O=/opt/data/sdn-archive/operator-theory/ap/confirm/experiments-ap-short-arc-priors-confirm-20261103; mkdir -p "$O/logs"
PIDS=()
for k in 0 1 2 3 4 5 6 7; do nice -n 10 node --max-old-space-size=3072 experiments/ap-short-arc-priors-confirm/run.mjs --out "$O" --shard "$k/8" >> "$O/logs/shard-$k.log" 2>&1 & PIDS+=($!); done
F=0; for p in "${PIDS[@]}"; do wait "$p" || F=$((F + 1)); done
echo "finished $(date -u +%FT%TZ): $F workers failed"
