#!/bin/zsh
# #316 dense (1-minute) carrier series only: worker2.sh's dense jobs for shard k of n. Usage: worker3.sh <k> <n> <out dir>
K=$1; N=$2; OUT=$3
cd "$(dirname "$0")/../../.." || exit 1
export SDN_MODULES_ROOT=${SDN_MODULES_ROOT:-$PWD/../../main-packages/space-data-network-modules}
run() { node experiments/headline-loop/diagnosis/rep.mjs --shard $K/$N --out $OUT "$@" >> $OUT/logs/d$K.log 2>&1; }
run --tag dense --group DO --set pub --arc 24 --every 14 --names "SARAL,CryoSat-2" --arms "R7-o1-z"
run --tag dense --group S1 --set pub --arc 24 --every 12 --names "Sentinel-1A" --arms "R7-o1-z"
run --tag dense --group GN --set pub --arc 24 --every 12 --names "G053 GPS-IIR-M,E218 GAL-2" --arms "R7-o1-z"
run --tag dense --group HX --set pub --arc 72 --names "THEMIS D,CHANDRA" --every 3 --arms "R7-v-o1-z"
run --tag dense --group GD --set pub --arc 72 --every 11 --names "lageos1" --arms "R7-o1-z"
echo "dense worker $K done" >> $OUT/logs/d$K.log
