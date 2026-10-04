#!/bin/sh
# Root host probe (runs UNJAILED as root: via ssh for testing, via init.d hook later).
# Writes ground-truth JSON into the Luna service dir, the only read-write path
# shared with the jailed JS service. Writes service-owned files only.
set -eu

SVC_DIR="${SVC_DIR:-/media/developer/apps/usr/palm/services/com.ljam.tailscale.service}"
VAR_DIR="$SVC_DIR/var"
mkdir -p "$VAR_DIR"
chmod 0777 "$VAR_DIR"

os_val() {
  # $1 = KEY from /etc/os-release
  sed -n "s/^$1=//p" /etc/os-release 2>/dev/null | tr -d '"' | head -1
}

tun_exists=false
tun_readable=false
if [ -e /dev/net/tun ]; then
  tun_exists=true
  if [ -r /dev/net/tun ] && [ -w /dev/net/tun ]; then
    tun_readable=true
  fi
fi

netfilter=false
if zcat /proc/config.gz 2>/dev/null | grep -q '^CONFIG_NETFILTER=y'; then
  netfilter=true
fi

iptables_usable=false
if iptables -L -n >/dev/null 2>&1; then
  iptables_usable=true
fi

kernel="$(cat /proc/version 2>/dev/null | head -c 200 || true)"
default_route="$(ip route show default 2>/dev/null | head -1 || true)"
long_bit="$(getconf LONG_BIT 2>/dev/null || echo unknown)"
now="$(date +%s)"

json_escape() {
  # escape backslash, quote, newline for JSON string
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr '\n' ' '
}

cat > "$VAR_DIR/host-facts.json" <<EOF
{"tunExists":$tun_exists,"tunReadable":$tun_readable,"webosVersion":"$(os_val VERSION)","webosName":"$(json_escape "$(os_val PRETTY_NAME)")","kernel":"$(json_escape "$kernel")","archUserspace":"$long_bit","netfilter":$netfilter,"iptablesUsable":$iptables_usable,"defaultRoute":"$(json_escape "$default_route")","collectedAt":$now}
EOF

if [ ! -f "$VAR_DIR/daemon-status.json" ]; then
  printf '{"daemon":"not_installed","backendState":"NoBackendState"}' > "$VAR_DIR/daemon-status.json"
fi

chmod 0644 "$VAR_DIR"/*.json
echo "host facts written to $VAR_DIR/host-facts.json"
cat "$VAR_DIR/host-facts.json"
echo
