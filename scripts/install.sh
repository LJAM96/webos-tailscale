#!/bin/sh
# Build, install and register the IPK on the TV.
# Usage: ./scripts/install.sh [tv-ip]  (default 192.168.31.162)
set -eu
cd "$(dirname "$0")/.."
TV="${1:-192.168.31.162}"
PKG_ID="com.ljam.tailscale"

./scripts/build-ipk.sh
IPK="$(ls -t dist/*.ipk | head -1)"
echo "--- copy + install ---"
scp -O "$IPK" "root@$TV:/tmp/tailscale-test.ipk"
ssh -o BatchMode=yes root@"$TV" \
  "ApplicationInstallerUtility -c install -p /tmp/tailscale-test.ipk -t developer -l internal -f /etc/palm/appinstalld/opkg.conf -n 2>&1 | tail -3"
echo "--- register service with hub ---"
scp -O scripts/register-service.sh "root@$TV:/tmp/register-service.sh"
ssh -o BatchMode=yes root@"$TV" "sh /tmp/register-service.sh 2>&1 | tail -2"
echo "--- verify files ---"
ssh -o BatchMode=yes root@"$TV" \
  "ls /media/developer/apps/usr/palm/applications/$PKG_ID/ /media/developer/apps/usr/palm/services/$PKG_ID.service/ 2>&1"
echo "NOTE: reboot the TV once so ls-hubd picks up the new service, then open the Tailscale app."
