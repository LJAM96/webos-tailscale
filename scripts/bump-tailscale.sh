#!/bin/sh
# Bump the pinned Tailscale release across the repo (used by CI and humans).
# Usage: ./scripts/bump-tailscale.sh <version> <sha256>
# Validates the version format, then rewrites daemon/versions.json,
# the service diagnostics fallback, test fixtures and licence notices.
set -eu
cd "$(dirname "$0")/.."
VER="${1:?usage: bump-tailscale.sh <version> <sha256>}"
SHA="${2:?usage: bump-tailscale.sh <version> <sha256>}"
case "$VER" in
  *[!0-9.]* | *.*.*.* | [!0-9]* | *[!0-9])
    echo "bad version: $VER" >&2; exit 1 ;;
esac
if ! printf '%s' "$VER" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "bad version: $VER" >&2; exit 1
fi
case "$SHA" in
  *[!0-9a-f]* | ????????????????????????????????????????????????????????????????)
    : ;;
  *) echo "bad sha256" >&2; exit 1 ;;
esac
if [ "${#SHA}" -ne 64 ]; then echo "bad sha256 length" >&2; exit 1; fi

python3 - "$VER" "$SHA" <<'PY'
import json,sys,re
ver, sha = sys.argv[1], sys.argv[2]
staged = {}
text, n = re.subn(r"(tailscaleVersion: d\.runningVersion \|\| ')[0-9]+\.[0-9]+\.[0-9]+(')",
                  lambda m: m.group(1) + ver + m.group(2),
                  open('service/service.js').read(), count=1)
assert n == 1, 'service.js pattern'
staged['service/service.js'] = text
for path, marker in (('tests/fixture.js', "tailscaleVersion: '"),
                     ('THIRD_PARTY_NOTICES.md', 'Pinned release: ')):
    text = open(path).read()
    text, n = re.subn(r"(" + re.escape(marker) + r")[0-9]+\.[0-9]+\.[0-9]+",
                      lambda m: m.group(1) + ver, text, count=1)
    assert n == 1, path
    staged[path] = text
doc = json.load(open('daemon/versions.json'))
doc['tailscaleVersion'] = ver
t = doc['targets']['arm']
t['url'] = f'https://pkgs.tailscale.com/stable/tailscale_{ver}_arm.tgz'
t['sha256'] = sha
staged['daemon/versions.json'] = json.dumps(doc, indent=2) + '\n'
for path, text in staged.items():
    open(path, 'w').write(text)
print(f'pinned {ver}')
PY
