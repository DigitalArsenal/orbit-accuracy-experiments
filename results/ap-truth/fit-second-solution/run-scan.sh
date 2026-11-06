#!/bin/bash
# FIT-SECOND-SOLUTION.md part 1: one shard of the scan, every store in turn (truth2 with XP2F_CONTROL=1).
#   SDN_MODULES_ROOT=<modules at xp-atmosphere-merit's build> run-scan.sh <probe wasm> <control wasm> <k> <n>
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
for mode in hx wa regimes truth; do
  nice -n 10 node --max-old-space-size=3072 "$HERE/scan.mjs" --mode "$mode" --probe "$1" --control "$2" --shard "$3/$4"
done
XP2F_CONTROL=1 nice -n 10 node --max-old-space-size=3072 "$HERE/scan.mjs" --mode truth2 --probe "$1" --control "$2" --shard "$3/$4"
echo "shard $3/$4 finished $(date -u +%FT%TZ)"
