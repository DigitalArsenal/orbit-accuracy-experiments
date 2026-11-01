#!/bin/bash
# Forward capture: every 12 h until <until>, the same satellites through the arms, derived products only, under /opt/data/sdn-archive/operator-theory/<cycle>.
#   cycle.sh <until, epoch seconds> [first cycle, epoch seconds]
# Stop: touch /opt/data/sdn-archive/operator-theory/stop, or kill the exact PID in cycle.pid.
set -u
ROOT=/opt/data/sdn-archive/operator-theory
UNTIL=${1:?until, epoch seconds}
FIRST=${2:-0}
cd "$(dirname "$0")/../.."
echo $$ > "$ROOT/cycle.pid"
while [ "$(date +%s)" -lt "$FIRST" ] && [ ! -e "$ROOT/stop" ]; do sleep 30; done
while [ "$(date +%s)" -lt "$UNTIL" ] && [ ! -e "$ROOT/stop" ]; do
  NEXT=$(( $(date +%s) + 43200 ))
  C="$ROOT/c$(date -u +%Y%m%dT%H%M)"
  mkdir -p "$C/logs"
  PIDS=()
  for k in 0 1 2 3 4 5; do
    nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/arms.mjs --source starlink --count 60 --arcs 24,48 --atmospheres NRLMSISE00,EXPONENTIAL --shard "$k/6" --out "$C" > "$C/logs/s$k.log" 2>&1 &
    PIDS+=($!)
  done
  nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/arms.mjs --source iss --arcs 24,48 --atmospheres NRLMSISE00,JACCHIA_ROBERTS,HARRIS_PRIESTER,EXPONENTIAL --out "$C" > "$C/logs/iss.log" 2>&1 &
  PIDS+=($!)
  nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/arms.mjs --source planet --count 12 --arcs 24,48 --atmospheres NRLMSISE00,JACCHIA_ROBERTS,EXPONENTIAL --variants '[{"name":"stated-2015-EGM96-10x10-MSIS","gravity":"EGM96","degree":10,"order":10,"atmosphere":"NRLMSISE00","srp":false}]' --out "$C" > "$C/logs/planet.log" 2>&1 &
  PIDS+=($!)
  nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/arms.mjs --source css --arcs 24,48 --atmospheres NRLMSISE00,EXPONENTIAL --out "$C" > "$C/logs/css.log" 2>&1 &
  PIDS+=($!)
  for p in "${PIDS[@]}"; do wait "$p"; done
  while [ "$(date +%s)" -lt "$NEXT" ] && [ ! -e "$ROOT/stop" ]; do sleep 60; done
done
rm -f "$ROOT/cycle.pid"
