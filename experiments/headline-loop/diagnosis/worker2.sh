#!/bin/zsh
# #316 attribution queue: AP fitted to the trajectories of FFM variants (a force removed from both sides, or both truncated alike) on a few
# windows per group, then 1-minute carrier series on fewer windows (tag dense). Usage: worker2.sh <k> <n> <out dir>
K=$1; N=$2; OUT=$3
cd "$(dirname "$0")/../../.." || exit 1
export SDN_MODULES_ROOT=${SDN_MODULES_ROOT:-$PWD/../../main-packages/space-data-network-modules}
run() { node experiments/headline-loop/diagnosis/rep.mjs --shard $K/$N --out $OUT "$@" >> $OUT/logs/a$K.log 2>&1; }
mkdir -p $OUT/logs
LOWA="R7-k-z,R7-k-gnt-z,R7-k-gt12-z,R7-k-gs0-z,R7-k-gnt.t12-z"
HIGHA="R7-k-z,R7-k-gs0-z"
run --tag attr --group HX --set pub --arc 72 --names "THEMIS D,THEMIS E,CHANDRA" --every 2 --arms "R7-k-v-z,R7-k-v-gs0-z,R7-c4.20-k-v-gt4-z,R7-c12.20-k-v-gt12-z,R7-c31.0-k-v-z"
run --tag attr --group DO --set pub --arc 24 --every 7 --names "Jason-3,SARAL,CryoSat-2" --arms "$LOWA"
run --tag attr --group GN --set pub --arc 24 --every 6 --names "G053 GPS-IIR-M,E218 GAL-2,R743 GLO-M" --arms "$HIGHA"
run --tag attr --group S1 --set pub --arc 24 --every 6 --arms "$LOWA"
run --tag attr --group GD --set pub --arc 72 --every 6 --names "lageos1,etalon1" --arms "$HIGHA"
run --tag attr --group IG --set pub --arc 72 --every 3 --arms "$HIGHA"
run --tag attr --group HE --set pub --arc 336 --every 3 --arms "R7-k-v-z,R7-k-v-gs0-z"
run --tag dense --group DO --set pub --arc 24 --every 14 --names "SARAL,CryoSat-2" --arms "R7-o1-z"
run --tag dense --group S1 --set pub --arc 24 --every 12 --names "Sentinel-1A" --arms "R7-o1-z"
run --tag dense --group GN --set pub --arc 24 --every 12 --names "G053 GPS-IIR-M,E218 GAL-2" --arms "R7-o1-z"
run --tag dense --group HX --set pub --arc 72 --names "THEMIS D,CHANDRA" --every 3 --arms "R7-v-o1-z"
run --tag dense --group GD --set pub --arc 72 --every 11 --names "lageos1" --arms "R7-o1-z"
echo "attr worker $K done" >> $OUT/logs/a$K.log
