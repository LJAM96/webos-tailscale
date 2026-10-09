#!/bin/sh
# Complete removal of the webOS Tailscale package from the TV.
# Removes: IPK package (app + service + binaries), supervisor/daemon
# processes, init hook, Luna dev registrations, and -- by default -- all
# Tailscale state including the node identity.
#
# Usage: ./scripts/uninstall.sh [tv-ip] [--keep-identity] [--yes]
#   --keep-identity  preserve /var/lib/webosbrew/tailscale (reinstall keeps
#                    the same tailnet node); everything else is removed.
#   --yes            skip the confirmation prompt (required non-interactively).
#
# WARNING: without --keep-identity the TV's Tailscale identity is deleted.
# A later install registers as a NEW tailnet node and the old node lingers
# in the admin console until removed there.
# NOTE: this script stops the daemon, so an SSH session over the tailnet
# will drop. Prefer running it over LAN SSH.
set -eu
cd "$(dirname "$0")/.."
TV="${1:-192.168.31.162}"
KEEP=""
YES=""
for arg in "$@"; do
  case "$arg" in
    --keep-identity) KEEP="1" ;;
    --yes) YES="1" ;;
  esac
done

if [ -z "$YES" ]; then
  if [ -z "$KEEP" ]; then
    printf 'Delete com.ljam96.tailscale AND its Tailscale node identity on %s? [y/N] ' "$TV"
  else
    printf 'Delete com.ljam96.tailscale on %s but KEEP its Tailscale identity? [y/N] ' "$TV"
  fi
  read -r answer || exit 1
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || { echo "aborted"; exit 1; }
fi

PKG_ID="com.ljam96.tailscale"
SVC_ID="com.ljam96.tailscale.service"
OLD_APP="com.ljam.tailscale"
OLD_SVC="com.ljam.tailscale.service"

echo "--- stop supervisor and daemon (tailnet goes down) ---"
ssh -o BatchMode=yes "root@$TV" \
  "pkill -f 'services/com.ljam96.tailscale.service/supervisor.sh' 2>/dev/null || true; pkill -f 'tailscaled --statedir=/var/lib/webosbrew/tailscale' 2>/dev/null || true; sleep 2; ps aux 2>/dev/null | grep -E 'supervisor\.sh|tailscaled --statedir' | grep -v grep || echo 'no tailscale processes'" | tail -3

echo "--- remove package ---"
ssh -o BatchMode=yes "root@$TV" \
  "ApplicationInstallerUtility -c remove -p $PKG_ID -f /etc/palm/appinstalld/opkg.conf -n 2>&1 | tail -2"

echo "--- remove hook, registrations, leftovers ---"
ssh -o BatchMode=yes "root@$TV" "D=/var/luna-service2-dev
  rm -f /var/lib/webosbrew/init.d/51-tailscale
  rm -rf /media/developer/apps/usr/palm/services/$SVC_ID /media/developer/apps/usr/palm/services/$OLD_SVC
  for f in \$D/services.d/$SVC_ID.service \$D/services.d/$OLD_SVC.service \
    \$D/roles.d/$SVC_ID.service.json \$D/roles.d/$OLD_SVC.service.json \
    \$D/roles.d/$PKG_ID.app.json \$D/roles.d/$OLD_APP.app.json \
    \$D/client-permissions.d/$SVC_ID.service.json \$D/client-permissions.d/$OLD_SVC.service.json \
    \$D/client-permissions.d/$PKG_ID.app.json \$D/client-permissions.d/$OLD_APP.app.json \
    \$D/api-permissions.d/$SVC_ID.api.json \$D/api-permissions.d/$OLD_SVC.api.json \
    \$D/manifests.d/$PKG_ID.json \$D/manifests.d/$OLD_APP.json; do rm -f \"\$f\"; done
  ls-control scan-services >/dev/null 2>&1 || true
  echo cleaned"

if [ -z "$KEEP" ]; then
  echo "--- delete Tailscale state (node identity) ---"
  ssh -o BatchMode=yes "root@$TV" "rm -rf /var/lib/webosbrew/tailscale /var/run/tailscale && echo state-deleted"
else
  echo "--- keeping /var/lib/webosbrew/tailscale (node identity preserved) ---"
fi

echo "--- verify ---"
ssh -o BatchMode=yes "root@$TV" \
  "opkg -o /media/developer/apps -f /etc/palm/appinstalld/opkg.conf list-installed 2>/dev/null | grep -i ljam || echo 'no ljam packages'; ls -d /media/developer/apps/usr/palm/applications/$PKG_ID /var/lib/webosbrew/tailscale 2>&1 | head -n 4"
echo "DONE. Reboot the TV to clear launcher and hub caches."
