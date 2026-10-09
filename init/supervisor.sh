#!/bin/sh
# Tailscale root supervisor (UNJAILED, runs as root from init.d hook).
# Owns tailscaled lifecycle, applies prefs, answers jailed JS service via
# var/request.json -> var/response.json in the service dir (shared across jail).
# No netfilter on this kernel, so exit-node and advertise-routes ops are refused.
set -eu

SVC_DIR="${SVC_DIR:-/media/developer/apps/usr/palm/services/com.ljam96.tailscale.service}"
STATE_DIR="${STATE_DIR:-/var/lib/webosbrew/tailscale}"
RUN_DIR="${RUN_DIR:-/var/run/tailscale}"
BIN_DIR="$SVC_DIR/bin"
VAR_DIR="$SVC_DIR/var"
PID_FILE="$RUN_DIR/supervisor.pid"
LOCK_FILE="$RUN_DIR/lock"
CRASH_FILE="$STATE_DIR/crash-count"

TAILSCALED="$BIN_DIR/tailscaled"
TAILSCALE="$BIN_DIR/tailscale"
SOCK="$RUN_DIR/tailscaled.sock"
PORT=41641

log() { logger -t tailscale-sup "$*" 2>/dev/null || echo "[sup] $*" >> "$STATE_DIR/supervisor.log"; }

prepare_dirs() {
  mkdir -p "$STATE_DIR" "$RUN_DIR" "$VAR_DIR"
  chmod 0700 "$STATE_DIR"
  # VAR_DIR is shared with the jailed (non-root) JS service: traversable and
  # writable by all, individual files carry their own restrictive modes.
  chmod 0777 "$VAR_DIR"
}

daemon_running() {
  [ -S "$SOCK" ] && "$TAILSCALE" "--socket=$SOCK" status --json >/dev/null 2>&1
}

start_daemon() {
  prepare_dirs
  if daemon_running; then return 0; fi
  # A stale daemon may exist without a usable socket (crippled start at
  # boot, deleted socket, ...). It holds the port and would doom this
  # start while looking alive to ps, so reap it before launching.
  pkill -f "$TAILSCALED --statedir=$STATE_DIR" 2>/dev/null || true
  sleep 2
  rm -f "$SOCK"
  # Close the supervisor lock fd in the daemon: it must not inherit it,
  # or a later restart sees a held lock until the old daemon finishes
  # shutting down (race between pkill and the fresh flock).
  "$TAILSCALED" "--statedir=$STATE_DIR" "--socket=$SOCK" "--port=$PORT" 9>&- >> "$STATE_DIR/tailscaled.log" 2>&1 &
  for _ in $(seq 1 30); do
    daemon_running && return 0
    sleep 1
  done
  return 1
}

stop_daemon() {
  if [ -S "$SOCK" ]; then
    "$TAILSCALE" "--socket=$SOCK" down >/dev/null 2>&1 || true
  fi
  pkill -f "$TAILSCALED --statedir=$STATE_DIR" 2>/dev/null || true
  rm -f "$SOCK"
}

status_json() {
  if [ -S "$SOCK" ]; then
    "$TAILSCALE" "--socket=$SOCK" status --json 2>/dev/null || echo '{}'
  else
    echo '{}'
  fi
}

load_prefs() {
  # prints: acceptDNS acceptRoutes allowLAN startOnBoot enableSSH autoUpdateCheck
  # (appended; $1..$5 positions unchanged)
  python3 - "$STATE_DIR/config.json" 2>/dev/null <<'PY' || echo "false false true true false"
import json,sys
try:
  c=json.load(open(sys.argv[1]))
except Exception:
  c={}
def b(k,d):
  v=c.get(k,d)
  return v if isinstance(v,bool) else d
print("%s %s %s %s %s %s"%("true" if b("acceptDNS",False) else "false",
  "true" if b("acceptRoutes",False) else "false",
  "true" if b("allowLANAccess",True) else "false",
  "true" if b("startOnBoot",True) else "false",
  "true" if b("enableSSH",False) else "false",
  "true" if b("autoUpdateCheck",False) else "false"))
PY
}

refresh_daemon_status() {
  status_json | python3 -c '
import json,sys,time
try: d=json.load(sys.stdin)
except Exception: d={}
bs=d.get("BackendState","NoBackendState")
ips=d.get("TailscaleIPs") or [None,None]
self=d.get("Self") or {}
ver=d.get("Version") if isinstance(d.get("Version"),str) else ""
out={"collectedAt":int(time.time()),"daemon":"running" if bs not in ("NoState","NoBackendState","") else "stopped",
"backendState":bs if isinstance(bs,str) else "NoBackendState",
"runningVersion":ver.split("-")[0] if ver else None,
"authUrl":d.get("AuthURL") if isinstance(d.get("AuthURL"),str) else None,
"tailscaleIPv4":ips[0] if ips else None,
"tailscaleIPv6":ips[1] if len(ips)>1 else None,
"hostname":self.get("HostName") if isinstance(self.get("HostName"),str) else None,
"tailnet":(self.get("DNSName") or "").split(".",1)[-1] or None}
print(json.dumps(out))' > "$VAR_DIR/daemon-status.json.tmp"
  mv "$VAR_DIR/daemon-status.json.tmp" "$VAR_DIR/daemon-status.json"
  chmod 0644 "$VAR_DIR/daemon-status.json"
  # Peer list for the UI device list (validated again by the JS service).
  status_json | python3 -c '
import json,sys,time
try: d=json.load(sys.stdin)
except Exception: sys.exit(1)
if not isinstance(d,dict) or "Peer" not in d:
  sys.exit(1)
peers=[]
for k,v in (d.get("Peer") or {}).items():
  if not isinstance(v,dict): continue
  hn=v.get("HostName")
  tip=(v.get("TailscaleIPs") or [None])[0]
  if not isinstance(hn,str) or not isinstance(tip,str): continue
  peers.append({"name":hn[:64],"ip":tip[:64],
    "given":(v.get("DNSName") or "").split(".",1)[0][:64],
    "online":v.get("Online") is True,"active":v.get("Active") is True,
    "os":v.get("OS") if isinstance(v.get("OS"),str) else None,
    "rx":v.get("RxBytes") if isinstance(v.get("RxBytes"),int) else 0,
    "tx":v.get("TxBytes") if isinstance(v.get("TxBytes"),int) else 0})
peers.sort(key=lambda p:(not p["online"],(p["given"] or p["name"]).lower()))
print(json.dumps({"at":int(time.time()),"peers":peers[:100]}))' > "$VAR_DIR/peers.json.tmp" 2>/dev/null &&
    mv "$VAR_DIR/peers.json.tmp" "$VAR_DIR/peers.json" 2>/dev/null || true
  chmod 0644 "$VAR_DIR/peers.json" 2>/dev/null || true
}

sync_prefs_to_state() {
  # service dir (jail-shared) -> persistent state dir, validated
  python3 - "$VAR_DIR/prefs.json" "$STATE_DIR/config.json" 2>/dev/null <<'PY'
import json,sys,os
src, dst = sys.argv[1], sys.argv[2]
try:
  p = json.load(open(src))
except Exception:
  sys.exit(1)
def b(k, d):
  v = p.get(k, d)
  return v if isinstance(v, bool) else d
out = {"schemaVersion": 1, "startOnBoot": b("startOnBoot", True),
  "acceptDNS": b("acceptDNS", False), "acceptRoutes": b("acceptRoutes", False),
  "allowLANAccess": b("allowLANAccess", True),
  "enableSSH": b("enableSSH", False),
  "autoUpdateCheck": b("autoUpdateCheck", False)}
with open(dst + ".tmp", "w") as f:
  json.dump(out, f)
os.chmod(dst + ".tmp", 0o600)
os.replace(dst + ".tmp", dst)
PY
}

mirror_state_to_var() {
  # persistent state dir -> service dir so jailed service can read prefs
  python3 - "$STATE_DIR/config.json" "$VAR_DIR/prefs.json" 2>/dev/null <<'PY' || true
import json,sys,os
src, dst = sys.argv[1], sys.argv[2]
try:
  c = json.load(open(src)) if os.path.exists(src) else {}
except Exception:
  sys.exit(0)
def b(k, d):
  v = c.get(k, d)
  return v if isinstance(v, bool) else d
out = {"startOnBoot": b("startOnBoot", True),
  "acceptDNS": b("acceptDNS", False), "acceptRoutes": b("acceptRoutes", False),
  "allowLANAccess": b("allowLANAccess", True),
  "enableSSH": b("enableSSH", False),
  "autoUpdateCheck": b("autoUpdateCheck", False)}
open(dst, "w").write(json.dumps(out))
PY
  # The jailed JS service (possibly non-root) must rewrite this file.
  chmod 0666 "$VAR_DIR/prefs.json" 2>/dev/null || true
}

refresh_update_state() {
  # Daemon update availability for the UI. Check-only: never downloads or
  # installs. Two signals, either can report an update, neither can fake
  # clean: the control-advertised ClientVersion (often absent on this
  # target: the daemon's offline auto-update checker stops immediately),
  # and a throttled read of the release feed (once/day, cached, any
  # failure keeps the previous reading and ages into unknown).
  # NOTE: the script rides on -c so the status pipe stays on stdin (a
  # heredoc would steal stdin and the check would always read empty).
  check_on="$(python3 - "$STATE_DIR/config.json" 2>/dev/null <<'PY' || echo false
import json,sys
try: c=json.load(open(sys.argv[1]))
except Exception: c={}
print("true" if c.get("autoUpdateCheck") is True else "false")
PY
)"
  if [ "$check_on" = "true" ]; then
    feed_at=0
    if [ -f "$STATE_DIR/update-feed.json" ]; then
      feed_at="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("at",0))' "$STATE_DIR/update-feed.json" 2>/dev/null || echo 0)"
    fi
    now="$(date +%s 2>/dev/null || echo 0)"
    case "$now" in ''|*[!0-9]*) now=0;; esac
    case "$feed_at" in ''|*[!0-9]*) feed_at=0;; esac
    if [ "$((now - feed_at))" -gt 86400 ] 2>/dev/null; then
      # Primary signal: tailscale_latest_arm.tgz 302-redirects to the
      # versioned file, so a HEAD request reveals the latest version in
      # bytes. Fallback: scrape the index page. Anything unparseable is
      # discarded and the previous cache ages into unknown; a new release
      # can never be missed silently, only delayed to the next check.
      candidate=""
      if curl -sSI --max-time 20 -o "$STATE_DIR/update-head.tmp" "https://pkgs.tailscale.com/stable/tailscale_latest_arm.tgz" 2>/dev/null; then
        candidate="$(python3 - "$STATE_DIR/update-head.tmp" 2>/dev/null <<'PYHEAD' || true
import json,sys,re
try: head=open(sys.argv[1]).read()
except Exception: sys.exit(1)
m=re.search(r"[Ll]ocation:.*tailscale_(\d+\.\d+\.\d+)_arm\.tgz",head)
if not m: sys.exit(1)
print(m.group(1))
PYHEAD
)"
      fi
      if [ -z "$candidate" ] && curl -sSL --max-time 20 -o "$STATE_DIR/update-feed.html.tmp" "https://pkgs.tailscale.com/stable/" 2>/dev/null; then
        candidate="$(python3 - "$STATE_DIR/update-feed.html.tmp" 2>/dev/null <<'PYFEED' || true
import json,sys,re
try: page=open(sys.argv[1]).read()
except Exception: sys.exit(1)
vers=set(re.findall(r"tailscale_(\d+\.\d+\.\d+)_arm\.tgz",page))
def key(v): return tuple(int(x) for x in v.split("."))
cands=sorted(vers,key=key)
if not cands: sys.exit(1)
print(cands[-1])
PYFEED
)"
      fi
      rm -f "$STATE_DIR/update-head.tmp" "$STATE_DIR/update-feed.html.tmp" 2>/dev/null || true
      case "$candidate" in [0-9]*.[0-9]*.[0-9]*)
        if printf '%s' "$candidate" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
          python3 - "$STATE_DIR/update-feed.json" "$candidate" "$now" 2>/dev/null <<'PYCACHE' || true
import json,sys,os
with open(sys.argv[1]+".tmp","w") as f: json.dump({"at":int(sys.argv[3]),"latest":sys.argv[2]},f)
os.replace(sys.argv[1]+".tmp",sys.argv[1])
PYCACHE
        fi
        ;;
      esac
    fi
  fi
  status_json | python3 -c '
import json,sys,os,time,re
check_on = sys.argv[1] == "true"
dst = sys.argv[2]
state_dir = sys.argv[3]
try: d=json.load(sys.stdin)
except Exception: d={}
running = d.get("Version") if isinstance(d.get("Version"),str) else ""
running = running.split("-")[0] or None
def key(v): return tuple(int(x) for x in v.split("."))
higher = []
cv = d.get("ClientVersion")
if isinstance(cv,dict):
  for v in set(re.findall(r"\d+\.\d+(?:\.\d+)?", json.dumps(cv))):
    try:
      if running and key(v) > key(running): higher.append(v)
    except Exception: pass
feed_latest = None
feed_at = 0
try:
  fc = json.load(open(os.path.join(state_dir,"update-feed.json")))
  if isinstance(fc.get("latest"),str) and re.match(r"^\d+\.\d+\.\d+$",fc["latest"]): feed_latest = fc["latest"]
  if isinstance(fc.get("at"),int): feed_at = fc["at"]
except Exception: pass
if feed_latest and running:
  try:
    if key(feed_latest) > key(running): higher.append(feed_latest)
  except Exception: pass
latest = None
if higher: latest = sorted(set(higher),key=key)[-1]
feed_ok = feed_at > 0 and int(time.time()) - feed_at < 172800
if latest: available = True
elif running and feed_ok: available = False
else: available = None
out = {"at":int(time.time()),"enabled":check_on,"running":running,
"latest":latest if latest else (running if available is False else None),"available":available}
with open(dst + ".tmp","w") as f: json.dump(out,f)
os.replace(dst + ".tmp", dst)' "$check_on" "$VAR_DIR/update.json" "$STATE_DIR" 2>/dev/null || true
  chmod 0644 "$VAR_DIR/update.json" 2>/dev/null || true
}

handle_request() {
  [ -f "$VAR_DIR/request.json" ] || return 0
  req_id="$(python3 -c 'import json;print(json.load(open("'"$VAR_DIR"'/request.json")).get("id",""))' 2>/dev/null || true)"
  [ -n "$req_id" ] || { rm -f "$VAR_DIR/request.json"; return 0; }
  # already answered?
  done_id="$(python3 -c 'import json;print(json.load(open("'"$VAR_DIR"'/response.json")).get("id",""))' 2>/dev/null || true)"
  [ "$done_id" = "$req_id" ] && { rm -f "$VAR_DIR/request.json"; return 0; }
  op="$(python3 -c 'import json;print(json.load(open("'"$VAR_DIR"'/request.json")).get("op",""))' 2>/dev/null || true)"
  result='{"ok":false,"error":"unknown-op"}'
  case "$op" in
    connect)
      set -- $(load_prefs)
      if start_daemon && "$TAILSCALE" "--socket=$SOCK" up --timeout=10s "--accept-dns=$1" "--accept-routes=$2" "--ssh=$5" >/dev/null 2>&1; then
        result='{"ok":true}'
      else
        backend="$(status_json | python3 -c 'import json,sys;print(json.load(sys.stdin).get("BackendState", ""))' 2>/dev/null || true)"
        if [ "$backend" = "NeedsLogin" ]; then
          result='{"ok":true,"needsLogin":true}'
        else
          result='{"ok":false,"error":"daemon-start-failed"}'
        fi
      fi
      ;;
    disconnect)
      if [ ! -S "$SOCK" ] || "$TAILSCALE" "--socket=$SOCK" down >/dev/null 2>&1; then
        result='{"ok":true}'
      else
        result='{"ok":false,"error":"disconnect-failed"}'
      fi
      ;;
    logout)
      # Full sign-out: deletes node identity. Next connect needs fresh login.
      if [ -S "$SOCK" ] && "$TAILSCALE" "--socket=$SOCK" logout >/dev/null 2>&1; then
        result='{"ok":true}'
      else
        result='{"ok":false,"error":"logout-failed"}'
      fi
      ;;
    update-daemon)
      # Explicit user-initiated daemon update. Never automatic: the UI owns
      # the disclaimer and the button. The bundled updater exit code is
      # unreliable here (its systemctl restart always fails on webOS), so
      # success is verified by on-disk version change, then we restart the
      # daemon ourselves and confirm the running version matches.
      if [ ! -S "$SOCK" ]; then
        result='{"ok":false,"error":"daemon-unavailable"}'
      else
        before="$("$TAILSCALE" "--socket=$SOCK" version 2>/dev/null | head -n 1 | cut -d'-' -f1 || true)"
        "$TAILSCALE" "--socket=$SOCK" update --yes >/dev/null 2>&1 || true
        afterdisk="$("$TAILSCALE" version 2>/dev/null | head -n 1 | cut -d'-' -f1 || true)"
        if [ -z "$afterdisk" ] || [ "$afterdisk" = "$before" ]; then
          result="$(python3 -c 'import json,sys;print(json.dumps({"ok":True,"updated":False,"previous":sys.argv[1] or None,"current":sys.argv[2] or None}))' "$before" "$afterdisk")"
        elif stop_daemon && start_daemon; then
          set -- $(load_prefs)
          "$TAILSCALE" "--socket=$SOCK" up --timeout=30s "--accept-dns=$1" "--accept-routes=$2" "--ssh=$5" >/dev/null 2>&1 || true
          after="$("$TAILSCALE" "--socket=$SOCK" version 2>/dev/null | head -n 1 | cut -d'-' -f1 || true)"
          if [ "$after" = "$afterdisk" ]; then
            result="$(python3 -c 'import json,sys;print(json.dumps({"ok":True,"updated":True,"previous":sys.argv[1] or None,"current":sys.argv[2] or None}))' "$before" "$after")"
          else
            result="$(python3 -c 'import json,sys;print(json.dumps({"ok":False,"error":"restart-mismatch","previous":sys.argv[1] or None,"current":sys.argv[2] or None}))' "$before" "$after")"
          fi
        else
          result="$(python3 -c 'import json,sys;print(json.dumps({"ok":False,"error":"restart-failed","previous":sys.argv[1] or None,"current":sys.argv[2] or None}))' "$before" "$afterdisk")"
        fi
      fi
      ;;
    apply-prefs)
      if sync_prefs_to_state; then
        set -- $(load_prefs)
        acc_dns="$1"; acc_routes="$2"; en_ssh="$5"
        connected="$(status_json | python3 -c 'import json,sys;print(json.load(sys.stdin).get("BackendState", ""))' 2>/dev/null || true)"
        if [ "$connected" != "Running" ]; then
          result='{"ok":true,"saved":true,"applied":false}'
        elif "$TAILSCALE" "--socket=$SOCK" up --timeout=10s "--accept-dns=$acc_dns" "--accept-routes=$acc_routes" "--ssh=$en_ssh" >/dev/null 2>&1; then
          result='{"ok":true,"saved":true,"applied":true}'
        else
          result='{"ok":false,"saved":true,"applied":false,"error":"apply-failed"}'
        fi
      else
        result='{"ok":false,"saved":false,"applied":false,"error":"persistence-failed"}'
      fi
      ;;
  esac
  python3 -c 'import json,sys;print(json.dumps({"id":sys.argv[1],"result":json.loads(sys.argv[2])}))' "$req_id" "$result" > "$VAR_DIR/response.json.tmp" 2>/dev/null || \
    printf '{"id":"%s","result":{"ok":false,"error":"internal"}}' "$req_id" > "$VAR_DIR/response.json.tmp"
  mv "$VAR_DIR/response.json.tmp" "$VAR_DIR/response.json"
  # The jailed JS service reads (and replaces, via its own writes) this file.
  chmod 0666 "$VAR_DIR/response.json" 2>/dev/null || true
  rm -f "$VAR_DIR/request.json"
}

run_loop() {
  prepare_dirs
  echo $$ > "$PID_FILE"
  crash=0
  [ -f "$CRASH_FILE" ] && crash="$(cat "$CRASH_FILE" 2>/dev/null || echo 0)"
  while true; do
    if ! daemon_running; then
      if [ "$crash" -ge 5 ]; then
        log "too many crashes, degraded; will keep retrying slowly"
        printf '{"daemon":"degraded","backendState":"NoBackendState"}' > "$VAR_DIR/daemon-status.json"
        sleep 60
        if start_daemon; then
          crash=0; echo 0 > "$CRASH_FILE"
          set -- $(load_prefs)
          if [ "$4" = "true" ]; then
            "$TAILSCALE" "--socket=$SOCK" up "--accept-dns=$1" "--accept-routes=$2" "--ssh=$5" >/dev/null 2>&1 || true
          fi
        fi
        continue
      fi
      start_daemon || { crash=$((crash+1)); echo "$crash" > "$CRASH_FILE"; sleep 10; continue; }
      crash=0; echo 0 > "$CRASH_FILE"
      set -- $(load_prefs)
      # $4 is startOnBoot: only bring the tailnet up automatically when on.
      # Explicit connect brings it up; saving settings preserves connection intent.
      if [ "$4" = "true" ]; then
        "$TAILSCALE" "--socket=$SOCK" up "--accept-dns=$1" "--accept-routes=$2" "--ssh=$5" >/dev/null 2>&1 || true
      fi
    fi
    handle_request
    refresh_daemon_status || log "daemon-status refresh failed"
    refresh_update_state || log "update-state refresh failed"
    mirror_state_to_var
    sleep 5
  done
}

case "${1:-run}" in
  run) exec 9>"$LOCK_FILE" 2>/dev/null || exec 9>/tmp/tailscale-sup.lock
    flock -n 9 || { echo "supervisor already running"; exit 0; }
    run_loop ;;
  start) "$TAILSCALED" --version >/dev/null || exit 1; start_daemon ;;
  stop) stop_daemon ;;
  status) status_json ;;
  restart)
    # Session-proof restart: safe to call from inside a Tailscale SSH
    # session. Stopping tailscaled drops that very session (and its child
    # shells), so the work runs detached in a new session with stdio on a
    # file. The caller only gets an acknowledgement before the old daemon
    # goes down; the tailnet flaps for ~30s while the daemon reconnects.
    _sup="$0"
    case "$_sup" in /*) : ;; *) _sup="$(pwd)/$_sup" ;; esac
    RLOG="$STATE_DIR/restart.log"
    mkdir -p "$STATE_DIR" 2>/dev/null || true
    if command -v setsid >/dev/null 2>&1; then
      setsid nohup sh "$_sup" _do_restart >>"$RLOG" 2>&1 < /dev/null &
    else
      nohup sh "$_sup" _do_restart >>"$RLOG" 2>&1 < /dev/null &
    fi
    echo "restart detached; following $RLOG" ;;
  _do_restart)
    # Detached worker for 'restart'. Never call directly.
    RLOG="$STATE_DIR/restart.log"
    {
    echo "restart begin pid=$$ date=$(date +%s 2>/dev/null || echo unknown)"
    sleep 2
    if [ -f "$PID_FILE" ]; then
      old="$(cat "$PID_FILE" 2>/dev/null || true)"
      echo "pidfile pid=$old self=$$"
      if [ -n "$old" ] && [ "$old" != "$$" ] && kill -0 "$old" 2>/dev/null; then
        kill "$old" 2>/dev/null || true
        sleep 2
        if kill -0 "$old" 2>/dev/null; then
          echo "pid $old survived TERM, KILLing"
          kill -9 "$old" 2>/dev/null || true
          sleep 2
        fi
        if kill -0 "$old" 2>/dev/null; then
          echo "pid $old unkillable, aborting restart to avoid duplicate supervisor"
          exit 1
        fi
        echo "old supervisor $old stopped"
      else
        echo "no live supervisor in pidfile"
      fi
    else
      echo "no pidfile"
    fi
    stop_daemon
    echo "daemon stop requested, waiting for exit"
    # The old daemon may briefly hold the supervisor lock (inherited fd)
    # while shutting down gracefully. Wait for the process to go away
    # before handing over to the fresh run, or its flock fails.
    for _ in $(seq 1 15); do
      if ps aux 2>/dev/null | grep -F "$TAILSCALED --statedir=$STATE_DIR" | grep -v grep >/dev/null 2>&1; then
        sleep 1
      else
        break
      fi
    done
    echo "daemon stopped"
    echo "self=$0 lock=$LOCK_FILE run=$RUN_DIR"
    echo "holders: $(ls -l /proc/[0-9]*/fd/* 2>/dev/null | grep -c -F "$LOCK_FILE")"
    flock -n "$LOCK_FILE" -c true 2>/dev/null && echo "path-flock: free" || echo "path-flock: held"
    sleep 1
    echo "starting fresh supervisor"
    } >>"$RLOG" 2>&1
    exec sh "$0" run ;;
  probe) SVC_DIR="$SVC_DIR" sh "$(dirname "$0")/host-probe.sh" ;;
esac
