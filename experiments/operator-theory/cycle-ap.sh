#!/bin/bash
# The registered runs of AP.md. A rerun adds only what is missing.
#   cycle-ap.sh truth | laser | starlink
set -u
ROOT=/opt/data/sdn-archive/operator-theory/ap
W=$ROOT/module.wasm
SHA=0b021c575466642cd661cd39dcb911de89b63c8430ae9ac2d94c84c7539f8c6a
[ "$(shasum -a 256 "$W" | cut -d' ' -f1)" = "$SHA" ] || { echo "$W is not the registered build" >&2; exit 2; }
cd "$(dirname "$0")/../.."
[ -n "${SDN_MODULES_ROOT:-}" ] || { echo "SDN_MODULES_ROOT is not set" >&2; exit 2; }
PIDS=()
case "${1:-}" in
  truth)
    O=$ROOT/truth; mkdir -p "$O/logs"
    for k in 0 1 2 3 4 5 6 7; do nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/ap-truth.mjs --wasm "$W" --arms registered --out "$O" --from 2025-04-01 --to 2025-12-21 --shard "$k/8" >> "$O/logs/shard-$k.log" 2>&1 & PIDS+=($!); done
    ;;
  laser)
    C0=/opt/data/sdn-archive/operator-theory/cheaper; O=$ROOT/laser; mkdir -p "$O/forward"
    ARMS='[{"name":"AP","tesseral":31,"zonal":20,"fit":"module"},{"name":"XP","atmosphere":false,"noTerms":true,"fit":"module"}]'
    CPF="cpf-cod cpf-esa cpf-gal cpf-sha cpf-dgf cpf-gfz cpf-sgf cpf-hts cpf-qss cpf-isr cpf-cne cpf-eum cpf-gsf cpf-gmv cpf-tub cpf-hds"
    day() {
      local d="$1" C="$O/c${1//-/}T0000" s P=()
      mkdir -p "$C/logs"
      for s in $CPF; do
        nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/arms.mjs --ffm-ladder '[]' --ap-wasm "$W" --ap-arms "$ARMS" --source "$s" --shard 0/1 --arcs 48,72 --out "$C" --cpf-listing "$C0/cpf-listing.json" --as-of "${d}T00:00:00Z" --weather 2026-10-10 --weather-from 2026-02-20 >> "$C/logs/$s.log" 2>&1 &
        P+=($!)
      done
      for p in "${P[@]}"; do wait "$p"; done
    }
    for start in 2026-03-01 2026-03-12 2026-03-23 2026-04-03 2026-04-14 2026-04-25; do
      for d in $(python3 -c "import datetime as t,sys;d=t.date.fromisoformat(sys.argv[1]);print(' '.join(str(d+t.timedelta(days=k)) for k in range(9)))" "$start"); do
        day "$d"
      done
    done
    for k in 0 1 2 3 4 5 6 7; do nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/score.mjs --root "$O" --out "$O/forward/rows-$k.jsonl" --shard "$k/8" --ap-wasm "$W" --weather-from 2026-02-20 >> "$O/forward/score-$k.log" 2>&1 & PIDS+=($!); done
    ;;
  starlink)
    O=$ROOT/starlink; mkdir -p "$O/logs"
    ARMS='[{"name":"AP","tesseral":31,"zonal":20,"fit":"module"}]'
    for k in 0 1 2 3 4 5 6 7; do nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/explore.mjs --confirm --ap-wasm "$W" --ap-arms "$ARMS" --out "$O" --shard "$k/8" >> "$O/logs/shard-$k.log" 2>&1 & PIDS+=($!); done
    ;;
  *) echo "truth, laser or starlink" >&2; exit 2 ;;
esac
F=0; for p in "${PIDS[@]}"; do wait "$p" || F=$((F + 1)); done
echo "AP $1 finished $(date -u +%FT%TZ): $F workers failed"
