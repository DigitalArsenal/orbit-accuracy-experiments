#!/bin/bash
# The registered runs of AP8.md. A rerun adds only what is missing.
#   cycle-ap8.sh truth | truth2 | laser | regimes | starlink
set -u
ROOT=/opt/data/sdn-archive/operator-theory/ap/b0417
W=$ROOT/module.wasm
SHA=7d4920ee23f4aecd9f29ef933f4abe98d6cc463b561b3dd7c5f12bbff6ff4c6c
[ "$(shasum -a 256 "$W" | cut -d' ' -f1)" = "$SHA" ] || { echo "$W is not the registered build" >&2; exit 2; }
cd "$(dirname "$0")/../.."
[ -n "${SDN_MODULES_ROOT:-}" ] || { echo "SDN_MODULES_ROOT is not set" >&2; exit 2; }
PIDS=()
case "${1:-}" in
  truth)
    O=$ROOT/truth; mkdir -p "$O/logs"
    for k in 0 1 2 3 4 5 6 7; do nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/ap-truth.mjs --wasm "$W" --arms registered --out "$O" --from 2025-04-01 --to 2025-12-21 --shard "$k/8" >> "$O/logs/shard-$k.log" 2>&1 & PIDS+=($!); done
    ;;
  truth2)
    O=$ROOT/truth2; mkdir -p "$O/logs"
    for k in 0 1 2 3 4 5 6 7; do XP2F_CONTROL=1 nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/ap-truth.mjs --wasm "$W" --xm --out "$O" --from 2026-01-01 --to 2026-05-31 --shard "$k/8" >> "$O/logs/shard-$k.log" 2>&1 & PIDS+=($!); done
    ;;
  laser)
    C0=/opt/data/sdn-archive/operator-theory/cheaper; O=$ROOT/laser; mkdir -p "$O/forward"
    ARMS='[{"name":"APo","tesseral":31,"zonal":20,"fit":"module"}]'
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
    ARMS='[{"name":"APo","tesseral":31,"zonal":20,"fit":"module"}]'
    for k in 0 1 2 3 4 5 6 7; do nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/explore.mjs --confirm --ap-wasm "$W" --ap-arms "$ARMS" --out "$O" --shard "$k/8" >> "$O/logs/shard-$k.log" 2>&1 & PIDS+=($!); done
    ;;
  regimes)
    RF=0
    # Part R: AP and XP on AP6.md's windows, as cycle-ap7-site.sh flew them for 0.4.11.
    for g in default HX WA; do
      case $g in default) O=$ROOT/regimes-apxp; G=();; HX) O=$ROOT/regimes-hx-apxp; G=(--groups HX);; WA) O=$ROOT/regimes-wa-apxp; G=(--groups WA);; esac
      mkdir -p "$O/logs"; P=()
      for k in 0 1 2 3 4 5 6 7; do nice -n 10 node --max-old-space-size=3072 experiments/operator-theory/all-regimes.mjs --arms AP,XP ${G[@]+"${G[@]}"} --wasm "$W" --out "$O" --shard "$k/8" >> "$O/logs/shard-$k.log" 2>&1 & P+=($!); done
      for p in "${P[@]}"; do wait "$p" || RF=$((RF + 1)); done
    done
    ;;
  *) echo "truth, truth2, laser, regimes or starlink" >&2; exit 2 ;;
esac
F=${RF:-0}; for p in ${PIDS[@]+"${PIDS[@]}"}; do wait "$p" || F=$((F + 1)); done
echo "AP8 $1 finished $(date -u +%FT%TZ): $F workers failed"
