#!/bin/bash
# The registered run of AP3.md. A rerun adds only what is missing.
set -u
ROOT=/opt/data/sdn-archive/operator-theory/ap
W=$ROOT/module.wasm
SHA=0b021c575466642cd661cd39dcb911de89b63c8430ae9ac2d94c84c7539f8c6a
[ "$(shasum -a 256 "$W" | cut -d' ' -f1)" = "$SHA" ] || { echo "$W is not the registered build" >&2; exit 2; }
cd "$(dirname "$0")/../.."
[ -n "${SDN_MODULES_ROOT:-}" ] || { echo "SDN_MODULES_ROOT is not set" >&2; exit 2; }
O=$ROOT/apf; mkdir -p "$O/logs"
PIDS=()
for k in $(seq 0 15); do nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/ap-ffmfit.mjs --registered --root /opt/data/sdn-archive/operator-theory/cheaper --ap-wasm "$W" --out "$O/rows-$k.jsonl" --shard "$k/16" --weather-from 2026-02-20 >> "$O/logs/shard-$k.log" 2>&1 & PIDS+=($!); done
F=0; for p in "${PIDS[@]}"; do wait "$p" || F=$((F + 1)); done
echo "AP3 finished $(date -u +%FT%TZ): $F workers failed"
