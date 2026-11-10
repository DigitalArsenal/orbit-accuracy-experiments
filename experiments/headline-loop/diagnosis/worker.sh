#!/bin/zsh
# One worker of the #316 queue: every job's shard k of n, one after another. Usage: worker.sh <k> <n> <out dir>
K=$1; N=$2; OUT=$3
cd "$(dirname "$0")/../../.." || exit 1
export SDN_MODULES_ROOT=${SDN_MODULES_ROOT:-$PWD/../../main-packages/space-data-network-modules}
run() { node experiments/headline-loop/diagnosis/rep.mjs --shard $K/$N --out $OUT "$@" >> $OUT/logs/w$K.log 2>&1; }
mkdir -p $OUT/logs
BASE="AP,K,AP-w,R7-z"
VAC="AP,K-v,AP-v,R7-v-z"
run --group HX --set pub --arc 72 --arms "$VAC,R3-v,R7-c4.20-v,R7-c31.0-v,Q-t4,Q-t12"
run --group GN --set pub --arc 24 --every 3 --arms "$BASE"
run --group DO --set pub --arc 24 --every 5 --names "Jason-3,Sentinel-3A,Sentinel-6A,SARAL,CryoSat-2" --arms "$BASE"
run --group S1 --set pub --arc 24 --every 2 --arms "$BASE"
run --group GN --set pub --arc 72 --every 3 --arms "$BASE"
run --group IG --set pub --arc 72 --every 2 --arms "$BASE"
run --group GD --set pub --arc 72 --every 4 --arms "$BASE"
run --group DO --set pub --arc 72 --every 5 --names "Jason-3,Sentinel-3A,Sentinel-6A,SARAL,CryoSat-2" --arms "$BASE"
run --group HE --set pub --arc 336 --every 2 --arms "$VAC"
run --group P --set pub --arc 24 --every 3 --names "Swarm A,Swarm B,GRACE-FO 1" --arms "$BASE"
echo "worker $K done" >> $OUT/logs/w$K.log
