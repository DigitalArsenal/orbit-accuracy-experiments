#!/bin/bash
# E11 SupGP collector: CelesTrak Supplemental GP snapshots (OMM JSON and the
# per-group fit RMS file) for E11's forward test window.
#
# Binding policy (space-data-network-modules):
#   analysis/conjunction-assessment/scripts/CELESTRAK_FETCH_POLICY.md
# enforced with its shared helper lib/celestrak-fetch-policy.sh (--policy-lib):
#   - serial requests, at least 2.5 s apart; a cross-process mkdir lock next to
#     the ledger keeps them serial with any other fetcher that honours it;
#   - never the same URL more than once in any 3-hour period: the ledger of
#     successful fetches is checked before every request;
#   - 429/503: back off 60 s, at most one retry; a connection failure gets one
#     retry on a fresh Tor circuit; nothing else is retried;
#   - halt after 30 consecutive failures; halt on 403; stop the cycle after
#     10 HTTP errors in 2 h (CelesTrak blocks at 50 in 2 h).
# Tor (SOCKS 127.0.0.1:9050) is used only because CelesTrak drops direct
# connections from this machine (owner-approved 2026-10-10, firewall reasons).
# One circuit per cycle; a new circuit (stream isolation by SOCKS username) only
# after a connection failure, never in response to 429/503.
#
# Usage:
#   collect-supgp.sh --until 2026-10-15T12:00:00Z [--groups "gps glonass ..."]
#       [--archive DIR] [--ledger FILE] [--policy-lib FILE] [--cycle-sec N] [--once]
# Stop:
#   kill "$(cat /opt/data/sdn-archive/celestrak/supgp/collector.pid)"
#   or: touch /opt/data/sdn-archive/celestrak/supgp/collector.stop
set -u

ARCHIVE=/opt/data/sdn-archive/celestrak/supgp
LEDGER=/opt/data/sdn-archive/celestrak/.celestrak-fetch-ledger
POLICY_LIB=""
GROUPS_LIST="gps glonass iss css cpf intelsat ses planet oneweb kuiper iridium telesat orbcomm ast eumetsat starlink"
UNTIL=""
CYCLE_SEC=10980          # 3 h 3 min: every URL is past its 3-hour window again
ONCE=0
BASE=https://celestrak.org/NORAD/elements/supplemental
UA="sdn-e11-supgp-collector/1.0 (+https://github.com/DigitalArsenal/orbit-accuracy-experiments)"
SOCKS=127.0.0.1:9050
DISK_FLOOR_KB=$((15 * 1024 * 1024))
ERROR_BUDGET=10          # HTTP errors per rolling 2 h before the cycle stops

while [ $# -gt 0 ]; do
  case "$1" in
    --until) UNTIL="$2"; shift 2 ;;
    --groups) GROUPS_LIST="$2"; shift 2 ;;
    --archive) ARCHIVE="$2"; shift 2 ;;
    --ledger) LEDGER="$2"; shift 2 ;;
    --policy-lib) POLICY_LIB="$2"; shift 2 ;;
    --cycle-sec) CYCLE_SEC="$2"; shift 2 ;;
    --once) ONCE=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$POLICY_LIB" ] && [ -f "$POLICY_LIB" ] || { echo "--policy-lib must name celestrak-fetch-policy.sh" >&2; exit 2; }
[ -n "$UNTIL" ] || { echo "--until is required (UTC, e.g. 2026-10-15T12:00:00Z)" >&2; exit 2; }
UNTIL_S=$(date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$UNTIL" +%s 2>/dev/null) || { echo "bad --until: $UNTIL" >&2; exit 2; }
[ "$CYCLE_SEC" -ge 10860 ] || { echo "--cycle-sec must be >= 10860 (3 h + 1 min)" >&2; exit 2; }

# shellcheck source=/dev/null
. "$POLICY_LIB"
policy_init "$LEDGER"

mkdir -p "$ARCHIVE"
PIDFILE="$ARCHIVE/collector.pid"
STOPFILE="$ARCHIVE/collector.stop"
LOG="$ARCHIVE/collector.log"
LOCKDIR="$(dirname "$LEDGER")/.celestrak-fetch.lock"
SELF_SHA=$(shasum -a 256 "$0" | cut -d' ' -f1)
POLICY_SHA=$(shasum -a 256 "$POLICY_LIB" | cut -d' ' -f1)
HAVE_LOCK=0
STOP=0
HALT=0
CIRCUIT=""
ERR_TIMES=""

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG"; }

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "collector already running as PID $(cat "$PIDFILE")" >&2; exit 1
fi
echo $$ > "$PIDFILE"
rm -f "$STOPFILE"

release_lock() {
  if [ "$HAVE_LOCK" = 1 ]; then rm -rf "$LOCKDIR"; HAVE_LOCK=0; fi
}
on_exit() {
  release_lock
  [ "$(cat "$PIDFILE" 2>/dev/null)" = "$$" ] && rm -f "$PIDFILE"
  log "collector exit (pid $$)"
}
trap on_exit EXIT
trap 'STOP=1; log "stop signal received"' TERM INT HUP

acquire_lock() {
  local waited=0 holder
  while ! mkdir "$LOCKDIR" 2>/dev/null; do
    holder=$(cat "$LOCKDIR/pid" 2>/dev/null)
    if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
      log "removing stale fetch lock held by dead pid $holder"; rm -rf "$LOCKDIR"; continue
    fi
    sleep 1; waited=$((waited + 1))
    if [ "$waited" -ge 1800 ]; then log "fetch lock busy for 30 min; skipping request"; return 1; fi
  done
  echo $$ > "$LOCKDIR/pid"; HAVE_LOCK=1
}

new_circuit() { CIRCUIT="e11c$1r$RANDOM"; }

stop_requested() { [ "$STOP" = 1 ] || [ "$HALT" = 1 ] || [ -f "$STOPFILE" ]; }

pause() {  # interruptible sleep
  sleep "$1" & wait $! 2>/dev/null
}

note_http_error() {
  local now keep="" t n=0
  now=$(date -u +%s)
  for t in $ERR_TIMES "$now"; do
    if [ $((now - t)) -lt 7200 ]; then keep="$keep $t"; n=$((n + 1)); fi
  done
  ERR_TIMES="$keep"
  [ "$n" -lt "$ERROR_BUDGET" ]
}

ledger_last() { grep -F "$1	" "$LEDGER" 2>/dev/null | tail -1 | cut -f2; }

hdr() { grep -i "^$2:" "$1" 2>/dev/null | tail -1 | cut -d' ' -f2- | tr -d '\r"'; }

# fetch URL OUT -> 0 on HTTP 200 with a body. Sets F_CODE F_ATTEMPTS F_T0 F_T1.
fetch() {
  local url="$1" out="$2" attempt=1 rc
  F_CODE=000; F_ATTEMPTS=0
  while :; do
    acquire_lock || return 1
    F_T0=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    F_CODE=$(curl -sS --proto '=https' --socks5-hostname "${CIRCUIT}:x@${SOCKS}" \
      --connect-timeout 60 --max-time 900 -A "$UA" -D "$out.hdr" -o "$out" \
      -w '%{http_code}' "$url" 2>"$out.err")
    rc=$?
    F_T1=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    F_ATTEMPTS=$attempt
    policy_sleep
    release_lock
    if [ "$rc" = 0 ] && [ "$F_CODE" = 200 ] && [ -s "$out" ]; then
      policy_record "$url"; policy_note_success; return 0
    fi
    log "fail $url attempt=$attempt rc=$rc http=$F_CODE circuit=$CIRCUIT err=$(tr '\n' ' ' < "$out.err" | cut -c1-200)"
    policy_note_failure "$url" || { HALT=1; log "POLICY HALT: 30 consecutive failures"; return 1; }
    case "$F_CODE" in
      429|503)
        note_http_error || { log "HTTP error budget spent; stopping this cycle"; return 2; }
        [ "$attempt" = 1 ] || return 1
        log "backoff 60 s before the single retry"; pause 60; attempt=2 ;;
      000)
        [ "$attempt" = 1 ] || return 1
        new_circuit "$CYCLE"; log "connection failure; one retry on a fresh circuit $CIRCUIT"; pause 10; attempt=2 ;;
      403)
        note_http_error; HALT=1; log "HTTP 403: halting the collector (investigate before restarting)"; return 1 ;;
      *)
        note_http_error || { log "HTTP error budget spent; stopping this cycle"; return 2; }
        return 1 ;;
    esac
    stop_requested && return 1
  done
}

valid_body() {  # kind file
  if [ "$1" = json ]; then
    python3 -I -c 'import json,sys; d=json.load(open(sys.argv[1])); assert isinstance(d,list) and len(d)>0; print(len(d))' "$2" 2>/dev/null
  else
    if head -c 2048 "$2" | grep -qi '<html'; then return 1; fi
    wc -l < "$2" | tr -d ' '
  fi
}

save() {  # group kind url tmp stamp -> provenance line
  local g="$1" kind="$2" url="$3" tmp="$4" stamp="$5" ext sha bytes n lastf lastsha dest dup="" saved="" status=ok
  [ "$kind" = json ] && ext=json || ext=rms.txt
  sha=$(shasum -a 256 "$tmp" | cut -d' ' -f1)
  bytes=$(wc -c < "$tmp" | tr -d ' ')
  if n=$(valid_body "$kind" "$tmp"); then
    lastf="$ARCHIVE/$g/.last-$kind"
    lastsha=$(cut -d' ' -f1 "$lastf" 2>/dev/null)
    if [ "$lastsha" = "$sha" ]; then
      dup=$(cut -d' ' -f2 "$lastf"); rm -f "$tmp"
    else
      dest="$ARCHIVE/$g/$stamp.$ext"
      mv "$tmp" "$dest"; chmod 444 "$dest"; saved="$dest"
      printf '%s %s\n' "$sha" "$dest" > "$lastf"
    fi
  else
    status=rejected; n=0
    mkdir -p "$ARCHIVE/_rejected"; dest="$ARCHIVE/_rejected/$g-$stamp.$ext"
    mv "$tmp" "$dest"; saved="$dest"
  fi
  printf '{"group":"%s","kind":"%s","url":"%s","request_utc":"%s","response_utc":"%s","http_status":%s,"attempts":%s,"bytes":%s,"sha256":"%s","records":%s,"status":"%s","saved_as":"%s","duplicate_of":"%s","last_modified":"%s","etag":"%s","content_type":"%s","tor_circuit":"%s","cycle":%s,"collector_sha256":"%s","policy_lib_sha256":"%s"}\n' \
    "$g" "$kind" "$url" "$F_T0" "$F_T1" "$F_CODE" "$F_ATTEMPTS" "$bytes" "$sha" "$n" "$status" "$saved" "$dup" \
    "$(hdr "$tmp.hdr" last-modified)" "$(hdr "$tmp.hdr" etag)" "$(hdr "$tmp.hdr" content-type)" "$CIRCUIT" "$CYCLE" "$SELF_SHA" "$POLICY_SHA" \
    >> "$ARCHIVE/$g/provenance.jsonl"
  rm -f "$tmp.hdr" "$tmp.err"
}

run_cycle() {
  local g kind url tmp stamp last now wait rc avail
  avail=$(df -k "$ARCHIVE" | awk 'NR==2{print $4}')
  if [ "$avail" -lt "$DISK_FLOOR_KB" ]; then log "disk below 15 GiB floor ($avail KB); halting"; HALT=1; return; fi
  new_circuit "$CYCLE"
  log "cycle $CYCLE start circuit=$CIRCUIT groups=[$GROUPS_LIST]"
  for g in $GROUPS_LIST; do
    mkdir -p "$ARCHIVE/$g"
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    for kind in json rms; do
      stop_requested && return
      if [ "$kind" = json ]; then url="$BASE/sup-gp.php?FILE=$g&FORMAT=json"; else url="$BASE/$g.rms.txt"; fi
      if ! policy_allowed "$url"; then
        last=$(ledger_last "$url"); now=$(date -u +%s); wait=$((last + 10800 - now + 5))
        if [ "$wait" -le 1200 ]; then log "ledger: $url allowed in ${wait}s; waiting"; pause "$wait"; stop_requested && return
        else log "ledger: $url fetched within 3 h; skipped this cycle"; continue; fi
        policy_allowed "$url" || { log "ledger still blocks $url; skipped"; continue; }
      fi
      tmp="$ARCHIVE/$g/.incoming.$kind.$$"
      fetch "$url" "$tmp"; rc=$?
      if [ "$rc" = 0 ]; then save "$g" "$kind" "$url" "$tmp" "$stamp"
      else rm -f "$tmp" "$tmp.hdr" "$tmp.err"; [ "$rc" = 2 ] && return; fi
    done
  done
  log "cycle $CYCLE end"
}

log "collector start pid=$$ until=$UNTIL cycle_sec=$CYCLE_SEC groups=[$GROUPS_LIST] collector_sha256=$SELF_SHA policy_lib=$POLICY_LIB policy_sha256=$POLICY_SHA"
CYCLE=0
NEXT=$(date -u +%s)
while :; do
  stop_requested && break
  NOW=$(date -u +%s)
  [ "$NOW" -ge "$UNTIL_S" ] && { log "test window end reached ($UNTIL)"; break; }
  if [ "$NOW" -ge "$NEXT" ]; then
    CYCLE=$((CYCLE + 1)); START=$NOW
    run_cycle
    NEXT=$((START + CYCLE_SEC))
    [ "$ONCE" = 1 ] && break
  fi
  pause 30
done
