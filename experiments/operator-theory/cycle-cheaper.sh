#!/bin/bash
# The registered run of CHEAPER.md: every center, the 54 fixed days, two days at a time, then scoring. Rerun adds only what is missing from scoring.
#   cycle-cheaper.sh     stop with touch <store>/stop
set -u
ROOT=/opt/data/sdn-archive/operator-theory/cheaper
CPF="cpf-cod cpf-esa cpf-gal cpf-sha cpf-dgf cpf-gfz cpf-sgf cpf-hts cpf-qss cpf-isr cpf-cne cpf-eum cpf-gsf cpf-gmv cpf-tub cpf-hds"
WEATHER_ARCHIVE=2026-10-10
WEATHER_FROM=2026-02-20
TIGHT='"tolerance":1e-10,"maxStep":120,"minStep":1e-4'
SPEC='[{"name":"full","degree":70,"tides":true,"rel":true,'"$TIGHT"'},{"name":"M40","degree":40,"tides":true,"tolerance":1e-8,"maxStep":120},{"name":"M20","degree":20,"tolerance":1e-8,"maxStep":120},{"name":"old","degree":20,"tolerance":1e-8,"maxStep":300},{"name":"Hfull","regime":"high","degree":70,"tides":true,"rel":true,'"$TIGHT"'},{"name":"H20","regime":"high","degree":20,"tolerance":1e-8,"maxStep":300}]'
cd "$(dirname "$0")/../.."
[ -n "${SDN_MODULES_ROOT:-}" ] || { echo "SDN_MODULES_ROOT is not set" >&2; exit 2; }
[ -f "$ROOT/cpf-listing.json" ] || { echo "no stored listing at $ROOT/cpf-listing.json" >&2; exit 2; }
mkdir -p "$ROOT/forward"
day() {
  local d="$1" C="$ROOT/c${1//-/}T0000" s k N PIDS=()
  mkdir -p "$C/logs"
  for s in $CPF; do
    N=1; case "$s" in cpf-cod|cpf-esa|cpf-gal|cpf-sha|cpf-sgf) N=2 ;; esac
    for k in $(seq 0 $((N - 1))); do
      nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/arms.mjs --ffm-ladder "$SPEC" --with-xp true --source "$s" --shard "$k/$N" --arcs 48 --out "$C" --cpf-listing "$ROOT/cpf-listing.json" --as-of "${d}T00:00:00Z" --weather "$WEATHER_ARCHIVE" --weather-from "$WEATHER_FROM" >> "$C/logs/$s-$k.log" 2>&1 &
      PIDS+=($!)
    done
  done
  for p in "${PIDS[@]}"; do wait "$p"; done
}
DAYS=$(python3 - <<'EOF'
import datetime as t
for start in ('2026-03-01', '2026-03-12', '2026-03-23', '2026-04-03', '2026-04-14', '2026-04-25'):
    d = t.date.fromisoformat(start)
    for k in range(9):
        print(d + t.timedelta(days=k))
EOF
)
set -- $DAYS
while [ $# -gt 0 ] && [ ! -e "$ROOT/stop" ]; do
  A=$1; shift
  B=${1:-}; [ -n "$B" ] && shift
  day "$A" & P1=$!
  P2=
  if [ -n "$B" ]; then day "$B" & P2=$!; fi
  wait "$P1"; [ -n "$P2" ] && wait "$P2"
done
PIDS=()
for k in $(seq 0 15); do nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/score.mjs --root "$ROOT" --out "$ROOT/forward/rows-$k.jsonl" --shard "$k/16" --weather-from "$WEATHER_FROM" >> "$ROOT/forward/score-$k.log" 2>&1 & PIDS+=($!); done
for p in "${PIDS[@]}"; do wait "$p"; done
echo "cheaper finished $(date -u +%FT%TZ): $(cat "$ROOT"/forward/rows-*.jsonl | wc -l) pairs"
