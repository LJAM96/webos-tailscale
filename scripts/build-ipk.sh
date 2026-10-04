#!/bin/sh
# Build data-only IPK (no postinst; init hook deployed separately for now).
set -eu
cd "$(dirname "$0")/.."

PKG_ID="com.ljam.tailscale"
APP_ID="com.ljam.tailscale"
SVC_ID="com.ljam.tailscale.service"
VERSION="$(python3 -c 'import json;print(json.load(open("app/appinfo.json"))["version"])')"
TS_VER="$(python3 -c 'import json;print(json.load(open("daemon/versions.json"))["tailscaleVersion"])')"

STAGE="$(pwd)/.ipk-stage"
OUT="dist/${PKG_ID}_${VERSION}_all.ipk"
rm -rf "$STAGE" dist
mkdir -p "$STAGE/data/usr/palm/applications/$APP_ID"
mkdir -p "$STAGE/data/usr/palm/services/$SVC_ID/bin"
mkdir -p "$STAGE/data/usr/palm/packages/$PKG_ID"
mkdir -p "$STAGE/control" dist

cp app/appinfo.json app/index.html "$STAGE/data/usr/palm/applications/$APP_ID/"
cp -R app/assets app/vendor "$STAGE/data/usr/palm/applications/$APP_ID/"
cp service/services.json service/package.json service/service.js \
  "$STAGE/data/usr/palm/services/$SVC_ID/"
cp "daemon/bin/tailscale_${TS_VER}_arm/tailscaled" "daemon/bin/tailscale_${TS_VER}_arm/tailscale" \
  "$STAGE/data/usr/palm/services/$SVC_ID/bin/"
chmod 0755 "$STAGE/data/usr/palm/services/$SVC_ID/bin/"*
cp init/supervisor.sh init/host-probe.sh "$STAGE/data/usr/palm/services/$SVC_ID/"
chmod 0755 "$STAGE/data/usr/palm/services/$SVC_ID/supervisor.sh" "$STAGE/data/usr/palm/services/$SVC_ID/host-probe.sh"

cat > "$STAGE/data/usr/palm/packages/$PKG_ID/packageinfo.json" <<EOF
{
	"id": "$PKG_ID",
	"version": "$VERSION",
	"app": "$APP_ID",
	"services": [
		"$SVC_ID"
	]
}
EOF

cat > "$STAGE/control/control" <<EOF
Package: $PKG_ID
Version: $VERSION
Architecture: all
Maintainer: ljam
Description: Tailscale client controller (early preview v$VERSION, bundled tailscaled $TS_VER)
Section: misc
Priority: optional
webOS-Package-Format-Version: 2
EOF

printf '2.0\n' > "$STAGE/debian-binary"
(cd "$STAGE/data" && tar -czf "$STAGE/data.tar.gz" usr)
(cd "$STAGE/control" && tar -czf "$STAGE/control.tar.gz" control)
ABS_OUT="$(pwd)/$OUT"
python3 scripts/mk_ipk.py "$STAGE" "$ABS_OUT"

echo "Built $OUT"
python3 -c "import sys; d=open('$ABS_OUT','rb').read(); print(len(d),'bytes, magic:', d[:8])"
echo "--- data contents ---"
tar -tzf "$STAGE/data.tar.gz"
