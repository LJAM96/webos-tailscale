#!/bin/sh
# Fetch pinned Tailscale release and verify sha256 (reproducible, no 'latest').
set -eu
cd "$(dirname "$0")/.."
VER="$(python3 -c 'import json;print(json.load(open("daemon/versions.json"))["tailscaleVersion"])')"
URL="$(python3 -c 'import json;print(json.load(open("daemon/versions.json"))["targets"]["arm"]["url"])')"
EXPECT="$(python3 -c 'import json;print(json.load(open("daemon/versions.json"))["targets"]["arm"]["sha256"])')"
mkdir -p daemon/bin
TGZ="daemon/bin/tailscale_${VER}_arm.tgz"
if [ ! -f "$TGZ" ]; then
  echo "downloading $URL"
  curl -sSL -o "$TGZ" "$URL"
fi
ACTUAL="$(python3 -c 'import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$TGZ")"
if [ "$ACTUAL" != "$EXPECT" ]; then
  echo "SHA256 MISMATCH: got $ACTUAL want $EXPECT" >&2
  exit 1
fi
rm -rf "daemon/bin/tailscale_${VER}_arm"
tar -xzf "$TGZ" -C daemon/bin
echo "verified + extracted: daemon/bin/tailscale_${VER}_arm/{tailscaled,tailscale}"
ls -la "daemon/bin/tailscale_${VER}_arm/" | grep -E 'tailscale$|tailscaled$'
