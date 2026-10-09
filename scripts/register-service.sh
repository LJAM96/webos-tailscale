#!/bin/sh
# Generate ls-hubd dev registration for com.ljam96.tailscale (mirrors appinstalld output).
# Volatile only (/var), regenerated on boot. Safe to re-run.
set -eu
D=/var/luna-service2-dev
APP=com.ljam96.tailscale
SVC=com.ljam96.tailscale.service
VER=0.4.8

printf '[D-BUS Service]\nName=%s\nExec=/usr/bin/run-js-service -n /media/developer/apps/usr/palm/services/%s\nType=dynamic\n' \
  "$SVC" "$SVC" > "$D/services.d/$SVC.service"

cat > "$D/roles.d/$SVC.service.json" <<EOF
{
	"appId": "$SVC",
	"type": "regular",
	"allowedNames": ["$SVC"],
	"trustLevel": "",
	"permissions": [
		{
			"service":"$SVC",
			"outbound":["*"]
		}
	]
}
EOF

cat > "$D/roles.d/$APP.app.json" <<EOF
{
	"appId": "$APP",
	"type": "regular",
	"allowedNames": ["$APP-*"],
	"trustLevel": "",
	"permissions": [
		{
			"service":"$APP-*",
			"outbound":["*"]
		}
	]
}
EOF

printf '{"%s*":["public"]}' "$SVC" > "$D/client-permissions.d/$SVC.service.json"
printf '{"%s-*":["public","%s.group"]}' "$APP" "$SVC" > "$D/client-permissions.d/$APP.app.json"
printf '{"%s.group":["%s/*"],"ares.webos.cli":["%s/*"]}' "$SVC" "$SVC" "$SVC" > "$D/api-permissions.d/$SVC.api.json"

cat > "$D/manifests.d/$APP.json" <<EOF
{"version":"$VER","serviceFiles":["$D/services.d/$SVC.service"],"apiPermissionFiles":["$D/api-permissions.d/$SVC.api.json"],"id":"$APP","roleFiles":["$D/roles.d/$SVC.service.json","$D/roles.d/$APP.app.json"],"clientPermissionFiles":["$D/client-permissions.d/$SVC.service.json","$D/client-permissions.d/$APP.app.json"]}
EOF

ls-control scan-services
sleep 3
echo REGISTERED
