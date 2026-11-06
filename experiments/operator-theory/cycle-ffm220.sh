#!/bin/bash
# Every FFM fit and flight behind results/ap-truth/compare/cells.json, again on propagator/ffm 2.2.0 (lib/build.mjs FFM_220, lib/host.mjs's FFM build)
# at each arm's registered settings, on the same windows, files and pairs, into <archive>/operator-theory/ap/ffm220 beside the stores they replace in the
# cells (COMPARE.md, 2026-11-05). FFM arms only: no AP, XP or SGP4 arm is run. A rerun adds only what is missing.
#   cycle-ffm220.sh truth | providers | laser | laser-score | examples | all     (laser-score: the laser pairs' scoring alone, once every file is refitted)
# Workers: at most 4 while the 1-minute load average is 40 or more, 8 below it (the coordinator, 2026-11-05: the machine is shared); a running worker is never stopped.
set -u
OT=/opt/data/sdn-archive/operator-theory
O=$OT/ap/ffm220
cd "$(dirname "$0")/../.."
[ -n "${SDN_MODULES_ROOT:-}" ] || { echo "SDN_MODULES_ROOT is not set" >&2; exit 2; }
CODE=experiments/operator-theory
NODE=(nice -n 10 node --max-old-space-size=3072)
LOW=4 HIGH=8 LOAD=40
CPF="cpf-cod cpf-esa cpf-gal cpf-sha cpf-dgf cpf-gfz cpf-sgf cpf-hts cpf-qss cpf-isr cpf-cne cpf-eum cpf-gsf cpf-gmv cpf-tub cpf-hds"
TIGHT='"tolerance":1e-10,"maxStep":120,"minStep":1e-4'
# CHEAPER.md's ladder less "old", which no cell reads.
LADDER='[{"name":"full","degree":70,"tides":true,"rel":true,'"$TIGHT"'},{"name":"M40","degree":40,"tides":true,"tolerance":1e-8,"maxStep":120},{"name":"M20","degree":20,"tolerance":1e-8,"maxStep":120},{"name":"Hfull","regime":"high","degree":70,"tides":true,"rel":true,'"$TIGHT"'},{"name":"H20","regime":"high","degree":20,"tolerance":1e-8,"maxStep":300}]'
# The forward and vendor cycles' FFM arms as arms.mjs runs them without a ladder: NRLMSISE-00 on low orbits, no drag above (70x70, tides, relativity, 1e-10, 120 s).
DEFAULT='[{"name":"NRLMSISE00","atmosphere":"NRLMSISE00","degree":70,"tides":true,"rel":true,'"$TIGHT"'},{"name":"NO-DRAG","regime":"high","degree":70,"tides":true,"rel":true,'"$TIGHT"'}]'
# The published examples' stored flights, in the order compare-examples-publish.mjs reads them (a later folder's example replacing an earlier one's).
PUBLISHED="$OT/ap/b0411/compare-examples-full,$OT/ap/b051/compare-examples-burn-free,$OT/ap/b051/compare-examples-regen,$OT/ap/b062/compare-examples-reflight,$OT/ap/b063/compare-examples-reflight"
mkdir -p "$O"
load() { sysctl -n vm.loadavg | awk '{print $2}'; }
cap() { awk -v l="$(load)" -v m="$LOAD" -v lo="$LOW" -v hi="$HIGH" 'BEGIN { print (l < m ? hi : lo) }'; }
slot() { while :; do [ "$(jobs -rp | wc -l)" -lt "$(cap)" ] && return; sleep 10; done; }
PIDS=()
run() { local log=$1; shift; mkdir -p "$(dirname "$log")"; slot; "$@" >> "$log" 2>&1 & PIDS+=($!); sleep 2; }
drain() { local p; for p in "${PIDS[@]}"; do wait "$p"; done; PIDS=(); }
note() { echo "ffm220 $* $(date -u +%FT%TZ)" | tee -a "$O/run.log"; }
score() { # root, then the score.mjs arguments after the shard
  local R=$1; shift; mkdir -p "$R/forward"
  # 48 short shards, so a pause at a shard boundary comes soon; a shard's pairs are fixed by the count, so it stays 48.
  PIDS=(); for k in $(seq 0 47); do run "$R/forward/score-$k.log" "${NODE[@]}" $CODE/score.mjs --root "$R" --out "$R/forward/rows-$k.jsonl" --shard "$k/48" "$@"; done
  drain; note "scored $(basename "$R"): $(cat "$R"/forward/rows-*.jsonl 2>/dev/null | wc -l) pairs"
}
# Each phase queues its workers; truth's are waited for at the end, the fits of a store before its scoring.
truth() {
  PIDS=()
  for k in $(seq 0 11); do run "$O/compare-truth/logs/shard-$k.log" "${NODE[@]}" $CODE/truth-compare.mjs --arms F --out "$O/compare-truth" --from 2025-04-01 --to 2025-12-21 --shard "$k/12"; done
  for k in $(seq 0 11); do run "$O/compare-truth2/logs/shard-$k.log" env XP2F_CONTROL=1 "${NODE[@]}" $CODE/truth-compare.mjs --arms F --xm --out "$O/compare-truth2" --from 2026-01-01 --to 2026-05-31 --shard "$k/12"; done
  for k in $(seq 0 11); do run "$O/regimes/logs/shard-$k.log" "${NODE[@]}" $CODE/all-regimes.mjs --arms F --groups LS,DO,GD,IG,GE,HE,HX --out "$O/regimes" --shard "$k/12"; done
  run "$O/providers/logs/iss.log" env XP2F_CONTROL=1 "${NODE[@]}" $CODE/providers-run.mjs --arms F --out "$O/providers" --iss --shard 0/1
  TRUTH=("${PIDS[@]}"); PIDS=()
}
truth_done() {
  local p; for p in "${TRUTH[@]}"; do wait "$p"; done
  note "truth: compare-truth $(cat "$O"/compare-truth/rows-*.jsonl | wc -l), compare-truth2 $(cat "$O"/compare-truth2/rows-*.jsonl | wc -l), regimes $(cat "$O"/regimes/rows-*.jsonl | wc -l), iss $(cat "$O"/providers/rows-iss-*.jsonl | wc -l)"
}
providers() {
  # The vendor cycles that hold every file of the provider pairs (gps, glonass, intelsat, ses, planet), and the forward test's cycles that hold Planet's.
  local c s; PIDS=()
  for c in $(ls "$OT/vendors" | grep -E '^c[0-9]{8}T[0-9]{4}$' | awk '$0 >= "c20261024T0000" && $0 <= "c20261104T1938"'); do
    for s in gps glonass intelsat ses; do run "$O/vendors/$c/logs/$s.log" "${NODE[@]}" $CODE/arms.mjs --stored "$OT/vendors/$c" --fit-only --ffm-ladder "$DEFAULT" --source "$s" --arcs 24,48 --out "$O/vendors/$c"; done
    # Planet's cycles hold up to 334 files: four workers each.
    for k in 0 1 2 3; do run "$O/vendors/$c/logs/planet-$k.log" "${NODE[@]}" $CODE/arms.mjs --stored "$OT/vendors/$c" --fit-only --ffm-ladder "$DEFAULT" --source planet --shard "$k/4" --arcs 24,48 --out "$O/vendors/$c"; done
  done
  for c in c20261101T0326 c20261101T1526 c20261102T0326 c20261102T1527; do run "$O/operator/$c/logs/planet.log" "${NODE[@]}" $CODE/arms.mjs --stored "$OT/$c" --fit-only --ffm-ladder "$DEFAULT" --source planet --arcs 24,48 --out "$O/operator/$c"; done
  drain; note "providers fitted"
  score "$O/vendors"
  score "$O/operator"
}
laser() {
  local c s; PIDS=()
  for c in $(ls "$OT/cheaper" | grep -E '^c[0-9]{8}T0000$'); do
    for s in $CPF; do run "$O/cheaper/$c/logs/$s.log" "${NODE[@]}" $CODE/arms.mjs --stored "$OT/cheaper/$c" --fit-only --ffm-ladder "$LADDER" --source "$s" --arcs 48 --out "$O/cheaper/$c" --weather 2026-10-10 --weather-from 2026-02-20; done
  done
  drain; note "laser fitted"
  score "$O/cheaper" --weather-from 2026-02-20
}
# The worked examples: each published example's FFM track flown again on its own window (compare-examples.mjs --ffm-only), every other track, field and $OCM
# as stored; the next-file ones after the laser products. EXAMPLES_IN names the stored flights (default PUBLISHED). compare-examples-publish.mjs then writes
# the site's files with ap/ffm220/compare-examples last.
examples() {
  local E=$O/compare-examples IN=${EXAMPLES_IN:-$PUBLISHED} m; PIDS=()
  mkdir -p "$E/logs"
  for m in "truth" "truth --pick showcase" "regimes" "regimes --pick showcase" "providers" "next"; do
    run "$E/logs/${m// /_}.log" "${NODE[@]}" $CODE/compare-examples.mjs --mode $m --ffm-only "$IN" --out "$E"
  done
  # truth2 and the ISS read XM's own weather store (XP2F_CONTROL=1), as COMPARE.md's runs do.
  for m in "truth2" "truth2 --pick showcase" "providers --only iss"; do run "$E/logs/${m// /_}.log" env XP2F_CONTROL=1 "${NODE[@]}" $CODE/compare-examples.mjs --mode $m --ffm-only "$IN" --out "$E"; done
  drain; note "examples: $(ls "$E"/*.json 2>/dev/null | wc -l) flown again"
}
case "${1:-}" in
  truth) truth; truth_done ;;
  providers) providers ;;
  laser) laser ;;
  laser-score) score "$O/cheaper" --weather-from 2026-02-20 ;;
  examples) examples ;;
  all) note start; truth; providers; laser; truth_done; examples; note finished ;;
  *) echo "truth, providers, laser, laser-score, examples or all" >&2; exit 2 ;;
esac
