#!/bin/sh
# Tailscale root supervisor (UNJAILED, runs as root from init.d hook).
# Owns tailscaled lifecycle, applies prefs, answers jailed JS service via
# var/request.json -> var/response.json in the service dir (shared across jail).
# No netfilter on this kernel, so exit-node and advertise-routes ops are refused.
set -eu

SVC_DIR="${SVC_DIR:-/media/developer/apps/usr/palm/services/com.ljam.tailscale.service}"
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
  rm -f "$SOCK"
  "$TAILSCALED" "--statedir=$STATE_DIR" "--socket=$SOCK" "--port=$PORT" >> "$STATE_DIR/tailscaled.log" 2>&1 &
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
  # prints: acceptDNS acceptRoutes allowLAN startOnBoot (validated, safe defaults)
  python3 - "$STATE_DIR/config.json" 2>/dev/null <<'PY' || echo "false false true true false"
import json,sys
try:
  c=json.load(open(sys.argv[1]))
except Exception:
  c={}
def b(k,d):
  v=c.get(k,d)
  return v if isinstance(v,bool) else d
print("%s %s %s %s %s"%("true" if b("acceptDNS",False) else "false",
  "true" if b("acceptRoutes",False) else "false",
  "true" if b("allowLANAccess",True) else "false",
  "true" if b("startOnBoot",True) else "false",
  "true" if b("enableSSH",False) else "false"))
PY
}

refresh_daemon_status() {
  status_json | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: d={}
bs=d.get("BackendState","NoBackendState")
ips=d.get("TailscaleIPs") or [None,None]
self=d.get("Self") or {}
out={"daemon":"running" if bs not in ("NoState","") else "stopped",
 "backendState":bs if isinstance(bs,str) else "NoBackendState",
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
except Exception: d={}
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
print(json.dumps({"at":int(time.time()),"peers":peers[:100]}))' > "$VAR_DIR/peers.json.tmp" 2>/dev/null
  mv "$VAR_DIR/peers.json.tmp" "$VAR_DIR/peers.json" 2>/dev/null
  chmod 0644 "$VAR_DIR/peers.json" 2>/dev/null || true
}

sync_prefs_to_state() {
  # service dir (jail-shared) -> persistent state dir, validated
  python3 - "$VAR_DIR/prefs.json" "$STATE_DIR/config.json" 2>/dev/null <<'PY' || true
import json,sys
src, dst = sys.argv[1], sys.argv[2]
try:
  p = json.load(open(src))
except Exception:
  sys.exit(0)
def b(k, d):
  v = p.get(k, d)
  return v if isinstance(v, bool) else d
out = {"schemaVersion": 1, "startOnBoot": b("startOnBoot", True),
  "acceptDNS": b("acceptDNS", False), "acceptRoutes": b("acceptRoutes", False),
  "allowLANAccess": b("allowLANAccess", True),
  "enableSSH": b("enableSSH", False)}
json.dump(out, open(dst, "w"))
PY
}

mirror_state_to_var() {
  # persistent state dir -> service dir so jailed service can read prefs
  python3 - "$STATE_DIR/config.json" "$VAR_DIR/prefs.json" 2>/dev/null <<'PY' || true
import json,sys,os
src, dst = sys.argv[1], sys.argv[2]
if not os.path.exists(src):
  sys.exit(0)
try:
  c = json.load(open(src))
except Exception:
  sys.exit(0)
def b(k, d):
  v = c.get(k, d)
  return v if isinstance(v, bool) else d
out = {"startOnBoot": b("startOnBoot", True),
  "acceptDNS": b("acceptDNS", False), "acceptRoutes": b("acceptRoutes", False),
  "allowLANAccess": b("allowLANAccess", True),
  "enableSSH": b("enableSSH", False)}
open(dst, "w").write(json.dumps(out))
PY
  chmod 0644 "$VAR_DIR/prefs.json" 2>/dev/null || true
}

handle_request() {
  [ -f "$VAR_DIR/request.json" ] || return 0
  req_id="$(python3 -c 'import json;print(json.load(open("'"$VAR_DIR"'/request.json")).get("id",""))' 2>/dev/null || true)"
  [ -n "$req_id" ] || { rm -f "$VAR_DIR/request.json"; return 0; }
  # already answered?
  done_id="$(python3 -c 'import json;print(json.load(open("'"$VAR_DIR"'/response.json")).get("id",""))' 2>/dev/null || true)"
  [ "$done_id" = "$req_id" ] && return 0
  op="$(python3 -c 'import json;print(json.load(open("'"$VAR_DIR"'/request.json")).get("op",""))' 2>/dev/null || true)"
  result='{"ok":false,"error":"unknown-op"}'
  case "$op" in
    connect)
      set -- $(load_prefs)
      if start_daemon && "$TAILSCALE" "--socket=$SOCK" up "--accept-dns=$1" "--accept-routes=$2" "--ssh=$5" >/dev/null 2>&1; then
        result='{"ok":true}'
      else
        result='{"ok":false,"error":"daemon-start-failed"}'
      fi
      ;;
    disconnect)
      if [ -S "$SOCK" ]; then "$TAILSCALE" "--socket=$SOCK" down >/dev/null 2>&1 || true; fi
      result='{"ok":true}'
      ;;
    logout)
      # Full sign-out: deletes node identity. Next connect needs fresh login.
      if [ -S "$SOCK" ]; then "$TAILSCALE" "--socket=$SOCK" logout >/dev/null 2>&1 || true; fi
      result='{"ok":true}'
      ;;
    apply-prefs)
      sync_prefs_to_state
      set -- $(load_prefs)
      acc_dns="$1"; acc_routes="$2"; allow_lan="$3"; en_ssh="$5"
      if start_daemon && "$TAILSCALE" "--socket=$SOCK" up "--accept-dns=$acc_dns" "--accept-routes=$acc_routes" "--ssh=$en_ssh" >/dev/null 2>&1; then
        result='{"ok":true}'
      else
        result='{"ok":false,"error":"apply-failed"}'
      fi
      ;;
  esac
  python3 -c 'import json,sys;print(json.dumps({"id":sys.argv[1],"result":json.loads(sys.argv[2])}))' "$req_id" "$result" > "$VAR_DIR/response.json.tmp" 2>/dev/null || \
    printf '{"id":"%s","result":{"ok":false,"error":"internal"}}' "$req_id" > "$VAR_DIR/response.json.tmp"
  mv "$VAR_DIR/response.json.tmp" "$VAR_DIR/response.json"
  chmod 0644 "$VAR_DIR/response.json"
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
      # Explicit connect/apply-prefs requests always bring it up regardless.
      if [ "$4" = "true" ]; then
        "$TAILSCALE" "--socket=$SOCK" up "--accept-dns=$1" "--accept-routes=$2" "--ssh=$5" >/dev/null 2>&1 || true
      fi
    fi
    handle_request
    refresh_daemon_status
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
  probe) SVC_DIR="$SVC_DIR" sh "$(dirname "$0")/host-probe.sh" ;;
esac
