#!/bin/bash
# The registered runs of AP5.md. A rerun adds only what is missing.
#   cycle-ap5.sh truth | truth2
set -u
ROOT=/opt/data/sdn-archive/operator-theory/ap/b040
W=$ROOT/module.wasm
SHA=715ef2fee512e9c91aacf1c977151dbb1eb83c6b1fa0e1a160cba3304a876ec0
[ "$(shasum -a 256 "$W" | cut -d' ' -f1)" = "$SHA" ] || { echo "$W is not the registered build" >&2; exit 2; }
cd "$(dirname "$0")/../.."
[ -n "${SDN_MODULES_ROOT:-}" ] || { echo "SDN_MODULES_ROOT is not set" >&2; exit 2; }
PIDS=()
case "${1:-}" in
  truth)
    O=$ROOT/compare-truth; mkdir -p "$O/logs"
    for k in 0 1 2 3 4 5 6 7; do nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/truth-compare.mjs --wasm "$W" --out "$O" --from 2025-04-01 --to 2025-12-21 --shard "$k/8" >> "$O/logs/shard-$k.log" 2>&1 & PIDS+=($!); done
    ;;
  truth2)
    O=$ROOT/compare-truth2; mkdir -p "$O/logs"
    for k in 0 1 2 3 4 5 6 7 8 9 10 11; do XP2F_CONTROL=1 nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/truth-compare.mjs --wasm "$W" --xm --out "$O" --from 2026-01-01 --to 2026-05-31 --shard "$k/12" >> "$O/logs/shard-$k.log" 2>&1 & PIDS+=($!); done
    ;;
  *) echo "truth or truth2" >&2; exit 2 ;;
esac
F=0; for p in "${PIDS[@]}"; do wait "$p" || F=$((F + 1)); done
echo "AP5 $1 finished $(date -u +%FT%TZ): $F workers failed"
