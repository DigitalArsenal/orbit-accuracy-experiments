#!/bin/bash
# AP7.md passed: AP's arm, and XP's (the same module with its forces off), rerun at 0.4.11 wherever the site shows them, report only, on the same
# windows, pairs and files as 0.4.0's stores. Each writes its own store under b0411; ap7-merge.mjs then joins the arms that do not depend on the
# AP build (SGP4, FFM, the Space Force's XP, the operator) from b040 by key. A rerun adds only what is missing.
#   cycle-ap7-site.sh compare | regimes | providers | geo | laser | costs
set -u
ROOT=/opt/data/sdn-archive/operator-theory/ap/b0411
W=$ROOT/module.wasm
SHA=e4edacb03daff4eaba47263010c27009a6d888259c0d8f028605cebf4d655610
[ "$(shasum -a 256 "$W" | cut -d' ' -f1)" = "$SHA" ] || { echo "$W is not the registered build" >&2; exit 2; }
cd "$(dirname "$0")/../.."
[ -n "${SDN_MODULES_ROOT:-}" ] || { echo "SDN_MODULES_ROOT is not set" >&2; exit 2; }
CODE=experiments/operator-theory
pool() { # store, workers, then the command; each worker gets --shard k/n
  local O=$1 N=$2; shift 2; mkdir -p "$O/logs"; local P=() F=0
  for k in $(seq 0 $((N - 1))); do "$@" --shard "$k/$N" >> "$O/logs/shard-$k.log" 2>&1 & P+=($!); done
  for p in "${P[@]}"; do wait "$p" || F=$((F + 1)); done
  echo "AP7 site $(basename "$O") finished $(date -u +%FT%TZ): $F workers failed; rows $(cat "$O"/rows*.jsonl 2>/dev/null | wc -l)"
}
NODE="nice -n 10 node --max-old-space-size=3072"
case "${1:-}" in
  compare)
    pool "$ROOT/compare-truth-xp" 8 $NODE $CODE/truth-compare.mjs --arms XP --wasm "$W" --out "$ROOT/compare-truth-xp" --from 2025-04-01 --to 2025-12-21
    export XP2F_CONTROL=1; pool "$ROOT/compare-truth2-xp" 12 $NODE $CODE/truth-compare.mjs --arms XP --wasm "$W" --xm --out "$ROOT/compare-truth2-xp" --from 2026-01-01 --to 2026-05-31; unset XP2F_CONTROL
    ;;
  regimes)
    pool "$ROOT/regimes-apxp" 12 $NODE $CODE/all-regimes.mjs --arms AP,XP --wasm "$W" --out "$ROOT/regimes-apxp"
    pool "$ROOT/regimes-hx-apxp" 4 $NODE $CODE/all-regimes.mjs --arms AP,XP --groups HX --wasm "$W" --out "$ROOT/regimes-hx-apxp"
    pool "$ROOT/regimes-wa-apxp" 8 $NODE $CODE/all-regimes.mjs --arms AP,XP --groups WA --wasm "$W" --out "$ROOT/regimes-wa-apxp"
    ;;
  providers)
    O=$ROOT/providers-apxp; mkdir -p "$O/logs"
    XP2F_CONTROL=1 $NODE $CODE/providers-run.mjs --arms AP,XP --ap-name APm --wasm "$W" --out "$O" --iss --shard 0/1 >> "$O/logs/iss.log" 2>&1 & I=$!
    pool "$O" 12 $NODE $CODE/providers-run.mjs --arms AP,XP --ap-name APm --wasm "$W" --out "$O"
    wait "$I"; echo "AP7 site providers iss finished $(date -u +%FT%TZ): rows $(cat "$O"/rows-iss-*.jsonl 2>/dev/null | wc -l)"
    ;;
  geo)
    O=$ROOT/geo-files-apxp; mkdir -p "$O/logs"
    $NODE $CODE/geo-truth-files.mjs --arms AP,XP --wasm "$W" --out "$O" >> "$O/logs/run.log" 2>&1
    echo "AP7 site geo finished $(date -u +%FT%TZ): rows $(wc -l < "$O/rows.jsonl")"
    ;;
  laser)
    # AP.md's XP arm (the module with its atmosphere and added terms off) on CHEAPER.md's 54 days, as cycle-ap7.sh flies AP's.
    C0=/opt/data/sdn-archive/operator-theory/cheaper; O=$ROOT/laser-xp; mkdir -p "$O/forward"
    ARMS='[{"name":"XP","atmosphere":false,"noTerms":true,"fit":"module"}]'
    CPF="cpf-cod cpf-esa cpf-gal cpf-sha cpf-dgf cpf-gfz cpf-sgf cpf-hts cpf-qss cpf-isr cpf-cne cpf-eum cpf-gsf cpf-gmv cpf-tub cpf-hds"
    day() {
      local d="$1" C="$O/c${1//-/}T0000" s P=()
      mkdir -p "$C/logs"
      for s in $CPF; do
        $NODE $CODE/arms.mjs --ffm-ladder '[]' --ap-wasm "$W" --ap-arms "$ARMS" --source "$s" --shard 0/1 --arcs 48,72 --out "$C" --cpf-listing "$C0/cpf-listing.json" --as-of "${d}T00:00:00Z" --weather 2026-10-10 --weather-from 2026-02-20 >> "$C/logs/$s.log" 2>&1 &
        P+=($!)
      done
      for p in "${P[@]}"; do wait "$p"; done
    }
    for start in 2026-03-01 2026-03-12 2026-03-23 2026-04-03 2026-04-14 2026-04-25; do
      for d in $(python3 -c "import datetime as t,sys;d=t.date.fromisoformat(sys.argv[1]);print(' '.join(str(d+t.timedelta(days=k)) for k in range(9)))" "$start"); do
        day "$d"
      done
    done
    P=(); for k in 0 1 2 3 4 5 6 7; do $NODE $CODE/score.mjs --root "$O" --out "$O/forward/rows-$k.jsonl" --shard "$k/8" --ap-wasm "$W" --weather-from 2026-02-20 >> "$O/forward/score-$k.log" 2>&1 & P+=($!); done
    F=0; for p in "${P[@]}"; do wait "$p" || F=$((F + 1)); done
    echo "AP7 site laser-xp finished $(date -u +%FT%TZ): $F workers failed; rows $(cat "$O"/forward/rows-*.jsonl | wc -l)"
    ;;
  costs)
    # Every arm, so that all share one load; the two versions of XP head to head, as before.
    mkdir -p "$ROOT/compare-costs"
    node --max-old-space-size=4096 $CODE/compare-costs.mjs --root /opt/data/sdn-archive/operator-theory/ap/b040/laser --wasm "$W" --out "$ROOT/compare-costs/rows.jsonl" >> "$ROOT/compare-costs/run.log" 2>&1
    node --max-old-space-size=4096 $CODE/compare-costs.mjs --root /opt/data/sdn-archive/operator-theory/ap/b040/laser --wasm "$W" --only XP,XPU --out "$ROOT/compare-costs/xp-rows.jsonl" >> "$ROOT/compare-costs/run.log" 2>&1
    echo "AP7 site costs finished $(date -u +%FT%TZ): rows $(cat "$ROOT"/compare-costs/rows.jsonl | wc -l), $(cat "$ROOT"/compare-costs/xp-rows.jsonl | wc -l)"
    ;;
  *) echo "compare, regimes, providers, geo, laser or costs" >&2; exit 2 ;;
esac
