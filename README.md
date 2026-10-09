# Tailscale for LG webOS

Unofficial Tailscale client controller for a rooted LG webOS television
(target: LG B4, webOS 10.2.2). The TV gets its own tailnet identity and IP;
a TV interface controls and reports on a background `tailscaled` daemon that
survives app closure and cold boot.

App ID: `com.ljam96.tailscale` · Service: `com.ljam96.tailscale.service`

## Status

Working: install, authentication via phone QR, connect/disconnect, status and
peer list, preferences (boot connect, MagicDNS, subnet routes, Tailscale SSH),
diagnostics, daemon update check + explicit install, cold-boot recovery,
detached supervisor restart.

Out of scope on this kernel: exit-node use/advertising (no netfilter) and
anything requiring kernel changes or protected-partition edits.

## Requirements

- Rooted LG webOS TV with Homebrew Channel (SSH access, `root@<tv-ip>`).
- Tailscale account; phone or computer for sign-in approval.

## Install

```sh
./scripts/install.sh <tv-ip>
```

Builds the IPK, installs it, registers the service with the system bus.
Reboot once after first install so the bus picks up the service, then open
the Tailscale app and sign in with the QR code. Closing the app does not
disconnect Tailscale.

## Updating

- App updates: rebuild and reinstall the same way; node identity is preserved.- Daemon updates: Settings → Support → check for updates (notify only),
  then Install update. Releases are untested on this TV until confirmed.
  Updates initiated from the Tailscale admin portal are not supported on
  this layout; use the on-TV Install action.
- Pinned daemon: `daemon/versions.json` (currently 1.104.1).

## Releases (CI)

- **Release IPK** workflow (manual): builds the IPK against the latest
  stable daemon (or a given version), commits the pins back to main, and
  publishes the IPK under GitHub Releases. Release/tag versions derive
  from the Tailscale version, e.g. `tailscale-1.104.1`.
- **Check upstream** workflow (daily): compares latest stable against the
  pin and triggers a release build when a newer daemon appears.

## Uninstall

```sh
./scripts/uninstall.sh <tv-ip>            # complete removal incl. identity
./scripts/uninstall.sh <tv-ip> --keep-identity  # keep tailnet node for reinstall
```

Without `--keep-identity` a later install registers as a new tailnet node.
Reboot after removal to clear launcher and bus caches.

## Architecture

- `app/` — TV interface (remote navigation, status/settings/devices/diagnostics).
- `service/` — jailed Luna service; schema-validated broker, no shell, no
  arbitrary paths.
- `init/` — root supervisor (daemon lifecycle, prefs, health, restart) and
  boot hook (`51-tailscale`); state in `/var/lib/webosbrew/tailscale`.
- `daemon/` — pinned official static ARM binaries (verified hash, no fork).
- `scripts/` — reproducible build/packaging/install/test tooling.

## AI declaration

This project was built with AI assistance. Code, scripts, packaging, and
documentation were produced iteratively by an AI coding agent (OpenCode,
powered by Muse Spark) under the direction, testing, and device validation
of the human maintainer. Architecture choices, device verification results,
and release decisions are the maintainer's. Dependency licences are listed
in `THIRD_PARTY_NOTICES.md`; no AI model is a rights holder in this project.
