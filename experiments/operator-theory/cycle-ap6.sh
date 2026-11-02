#!/bin/bash
# The registered run of AP6.md. A rerun adds only what is missing.
set -u
ROOT=/opt/data/sdn-archive/operator-theory/ap/b040
W=$ROOT/module.wasm
SHA=715ef2fee512e9c91aacf1c977151dbb1eb83c6b1fa0e1a160cba3304a876ec0
[ "$(shasum -a 256 "$W" | cut -d' ' -f1)" = "$SHA" ] || { echo "$W is not the registered build" >&2; exit 2; }
cd "$(dirname "$0")/../.."
[ -n "${SDN_MODULES_ROOT:-}" ] || { echo "SDN_MODULES_ROOT is not set" >&2; exit 2; }
O=$ROOT/regimes; mkdir -p "$O/logs"
PIDS=()
for k in 0 1 2 3 4 5 6 7 8 9 10 11; do nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/all-regimes.mjs --wasm "$W" --out "$O" --shard "$k/12" >> "$O/logs/shard-$k.log" 2>&1 & PIDS+=($!); done
F=0; for p in "${PIDS[@]}"; do wait "$p" || F=$((F + 1)); done
echo "AP6 finished $(date -u +%FT%TZ): $F workers failed"
