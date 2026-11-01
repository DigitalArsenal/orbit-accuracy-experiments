#!/bin/bash
# The vendors of VENDORS.md, one pass per cycle, derived products only, under /opt/data/sdn-archive/operator-theory/vendors/<cycle>.
#   cycle-vendors.sh once <cycle name> [as-of ISO] [weather day] [sources]     one pass, then exit
#   cycle-vendors.sh loop <until, epoch seconds>                               every 12 h until then; stop with touch vendors/stop or the exact PID in vendors/cycle.pid
set -u
ROOT=/opt/data/sdn-archive/operator-theory/vendors
ALL="gps glonass galileo cpf-hts cpf-sgf cpf-dgf cpf-esa cpf-gfz cpf-cod cpf-gal cpf-sha cpf-nsg cpf-jax cpf-aiu intelsat ses planet"
cd "$(dirname "$0")/../.."
mkdir -p "$ROOT"
pass() {
  local C="$ROOT/$1" ASOF="${2:-}" WX="${3:-}" SOURCES="${4:-$ALL}"
  mkdir -p "$C/logs"
  local EXTRA=() PIDS=()
  [ -n "$ASOF" ] && EXTRA+=(--as-of "$ASOF")
  [ -n "$WX" ] && EXTRA+=(--weather "$WX")
  for s in $SOURCES; do
    local N=1 COUNT=()
    case "$s" in gps|glonass|galileo) N=3 ;; cpf-*) N=4 ;; intelsat) N=4 ;; ses) N=3 ;; planet) N=4; COUNT=(--count 999) ;; esac
    for k in $(seq 0 $((N - 1))); do
      if [ "$s" = planet ]; then
        nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/arms.mjs --source planet "${COUNT[@]}" --shard "$k/$N" --arcs 24,48 --atmospheres NRLMSISE00,EXPONENTIAL --out "$C" "${EXTRA[@]}" >> "$C/logs/$s-$k.log" 2>&1 &
      else
        nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/arms.mjs --source "$s" --shard "$k/$N" --arcs 24,48 --atmospheres NRLMSISE00,EXPONENTIAL --out "$C" --cache-dir "$ROOT" "${EXTRA[@]}" >> "$C/logs/$s-$k.log" 2>&1 &
      fi
      PIDS+=($!)
    done
  done
  for p in "${PIDS[@]}"; do wait "$p"; done
}
case "${1:?once or loop}" in
  once) pass "${2:?cycle}" "${3:-}" "${4:-}" "${5:-}" ;;
  loop)
    UNTIL=${2:?until, epoch seconds}
    echo $$ > "$ROOT/cycle.pid"
    while [ "$(date +%s)" -lt "$UNTIL" ] && [ ! -e "$ROOT/stop" ]; do
      NEXT=$(( $(date +%s) + 43200 ))
      bash /Users/tj/software/private/coordinator-d9/spacedatanetwork-stack/deployment/supgp-collector/pull.sh >/dev/null 2>&1
      pass "c$(date -u +%Y%m%dT%H%M)"
      while [ "$(date +%s)" -lt "$NEXT" ] && [ ! -e "$ROOT/stop" ]; do sleep 60; done
    done
    rm -f "$ROOT/cycle.pid" ;;
esac
