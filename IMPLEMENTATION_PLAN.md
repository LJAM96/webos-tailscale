# LG webOS Tailscale Client Implementation Plan

## Project summary

Build a Tailscale client for a rooted LG B4 television running webOS.

The application should make the television behave as closely as possible to a normal Tailscale node. The preferred implementation is a system wide Tailscale interface backed by the official `tailscaled` daemon. If the television cannot expose a working TUN device, the project must fall back to Tailscale userspace networking rather than modifying webOS system partitions.

The visible webOS application should act as a controller and status interface. Network functionality should live in a privileged background component that can start at boot, remain active when the UI closes, and preserve Tailscale state across reboots.

The implementation must favour official Tailscale components, standard webOS and Homebrew mechanisms, and existing open source libraries over custom networking code.

## Primary goals

* Run Tailscale reliably on a rooted LG B4.

* Give the television its own Tailscale identity and tailnet IP address.

* Permit the television to access devices and services on the tailnet.

* Permit other Tailscale devices to access services exposed by the television where webOS permits this.

* Keep the Tailscale connection active independently of the visible application.

* Restore the connection automatically after a full television boot.

* Support standard Tailscale authentication.

* Display connection state, assigned addresses, tailnet identity, and relevant networking information in a television friendly interface.

* Support exit node selection when the underlying networking mode allows it.

* Support Tailscale subnet routes when practical.

* Support MagicDNS where practical.

* Allow local LAN access when using an exit node.

* Provide clean installation, upgrade, diagnostics, and removal paths.

* Avoid changes to protected webOS system partitions.

## Non goals for the first release

The first release should not attempt to replace the webOS network manager.

The first release should not modify the kernel.

The first release should not implement the Tailscale protocol independently.

The first release should not patch individual streaming applications.

The first release should not modify immutable or protected webOS system files.

The first release should not depend on a permanently open television UI.

Advanced features such as accepting incoming subnet routes, advertising subnet routes from the television, acting as an exit node, and complex split routing should be treated as later capabilities unless they work naturally with the standard Tailscale daemon.

## Guiding implementation principles

Use official Tailscale binaries where compatible.

Compile Tailscale from the official source only when required by webOS architecture, libc compatibility, or missing runtime dependencies.

Use Homebrew Channel supported persistence mechanisms.

Use the standard Tailscale local API and CLI rather than reimplementing daemon control.

Keep privileged functionality isolated from the UI.

Treat all networking operations as reversible.

Store state only in known writable persistent locations.

Do not overwrite system binaries.

Do not alter protected partitions.

Do not introduce custom cryptographic code.

Prefer Apache 2.0, MIT, BSD, or similarly permissive dependencies where an additional dependency is required.

If a required dependency uses GPL, AGPL, LGPL, MPL, or another reciprocal licence, record the licence obligations before integration.

Every feature change should include testing, validation, CI checks, and a health check where applicable.

## Initial hardware and operating system discovery

Before implementation begins, collect the following from the target television:

```sh
uname -a
uname -m
cat /etc/os-release 2>/dev/null
getconf LONG_BIT 2>/dev/null
ldd --version 2>/dev/null
ls -l /dev/net/tun
ls -ld /dev /dev/net
zcat /proc/config.gz 2>/dev/null | grep -i tun
cat /proc/modules
modinfo tun 2>/dev/null
capsh --print 2>/dev/null
id
ip addr
ip route
ip rule
iptables -L -n 2>/dev/null
iptables -S 2>/dev/null
nft list ruleset 2>/dev/null
mount
df -h
connmanctl services 2>/dev/null
luna-send -n 1 luna://com.webos.service.connectionmanager/getStatus '{}' 2>/dev/null
ls -l /var/lib/webosbrew/init.d/ 2>/dev/null
node --version 2>/dev/null
```

Also determine:

* Exact LG B4 model.

* Installed webOS version.

* Root method.

* Homebrew Channel version.

* CPU architecture.

* libc implementation and version.

* Whether `/dev/net/tun` exists.

* Whether the kernel contains TUN support even if the device node is absent (`/proc/config.gz`, `modinfo tun`).

* Whether the device node can be created with `mknod /dev/net/tun c 10 200` on the TV devtmpfs, and whether `CAP_MKNOD` is available. A TUN node in an arbitrary writable data directory is not sufficient because `tailscaled` requires `/dev/net/tun`.

* Whether the process running `tailscaled` can open `/dev/net/tun`.

* Linux capabilities available to a root Homebrew process (`CAP_NET_ADMIN`, `CAP_NET_RAW`, `CAP_MKNOD`, `CAP_SYS_MODULE`), seccomp or LSM restrictions, and output of `capsh --print`.

* Whether `iptables` exists.

* Whether `nft` exists.

* Whether required routing operations are permitted.

* How webOS ConnMan manages the default route, DNS, and `/etc/resolv.conf`, and whether Tailscale routes survive ConnMan updates.

* Node.js version available for Luna JS services.

* Whether network configuration survives suspend and resume.

* Which filesystem paths survive firmware updates and application upgrades.

* Whether the Homebrew startup hook executes before or after network availability.

This discovery phase is mandatory because it determines whether the application can use normal Tailscale networking or must use userspace networking.

## Networking mode decision

### Preferred mode

Use normal Tailscale kernel networking when all of the following are true:

* The kernel supports TUN.

* `/dev/net/tun` exists, or it can be created at the canonical `/dev/net/tun` path with `mknod` and the module can be loaded with `modprobe tun`.

* `tailscaled` can open the device.

* Required routing operations are permitted (`CAP_NET_ADMIN`, `CAP_NET_RAW` intact).

* webOS ConnMan does not immediately remove or override the resulting routes.

The expected runtime model is:

```text
webOS
  |
  + tailscaled
       |
       + /dev/net/tun
       |
       + tailscale0
```

This mode should provide the closest behaviour to a normal Linux Tailscale client.

### Fallback mode

If normal TUN networking cannot be used, launch `tailscaled` using userspace networking.

Example concept:

```sh
tailscaled \
  --tun=userspace-networking \
  --statedir=/var/lib/webosbrew/tailscale \
  --socket=/var/run/tailscale/tailscaled.sock \
  --port=41641
```

Use `--statedir` rather than the legacy `--state` flag where supported by the pinned Tailscale version. `/var/run` is tmpfs and must be recreated on every boot. The persistent state directory under `/var/lib/webosbrew/` is provisional and must be confirmed persistent across reboot and application upgrade during discovery; do not assume vanilla `/var/lib/tailscale` survives on webOS TV.

A local SOCKS5 or HTTP proxy may be exposed where useful. Userspace mode does not provide system wide routing: only proxy aware clients can use it, and most built in webOS streaming applications ignore proxy configuration. It therefore does not make the television behave as a full Tailscale node.

The fallback must be clearly identified in the UI because userspace mode may not transparently route arbitrary webOS applications. Hide or disable exit node, subnet route acceptance, and other system wide routing controls when in this mode.

### Prohibited fallback

Do not patch webOS kernel files or replace networking components simply to make TUN work.

A limitation is preferable to an unsafe modification.

## Proposed architecture

```text
+---------------------------------------------------+
| LG webOS television                              |
|                                                   |
|  +---------------------------------------------+  |
|  | Tailscale webOS application                |  |
|  |                                             |  |
|  | Status                                      |  |
|  | Authentication                              |  |
|  | Exit node selection                         |  |
|  | Route settings                              |  |
|  | Diagnostics                                 |  |
|  +---------------------+-----------------------+  |
|                        |                          |
|                        | Luna service API         |
|                        v                          |
|  +---------------------------------------------+  |
|  | Privileged Tailscale service               |  |
|  |                                             |  |
|  | Process management                          |  |
|  | Configuration                               |  |
|  | Local API access                            |  |
|  | Health checks                               |  |
|  | Logging                                     |  |
|  +---------------------+-----------------------+  |
|                        |                          |
|                        v                          |
|  +---------------------------------------------+  |
|  | tailscaled                                  |  |
|  +---------------------+-----------------------+  |
|                        |                          |
|         +--------------+--------------+           |
|         |                             |           |
|         v                             v           |
|      TUN mode                  userspace mode     |
|                                                   |
+---------------------------------------------------+
```

## Components

### webOS user interface

The UI should be a normal television oriented webOS application.

Responsibilities:

* Display connection status.

* Display device name.

* Display tailnet name when available.

* Display IPv4 Tailscale address.

* Display IPv6 Tailscale address when available.

* Display current networking mode.

* Display selected exit node.

* Display whether routes are accepted.

* Display whether LAN access is permitted while using an exit node.

* Initiate authentication.

* Display authentication URL.

* Render a QR code for the authentication URL.

* Connect.

* Disconnect.

* Select an exit node.

* Toggle supported settings.

* Open diagnostics.

* Restart the Tailscale service.

* Provide log export or log viewing.

The UI must not require root.

### Privileged service

Create a dedicated background service responsible for privileged operations.

Confirmed on target TV (OLED65B4, webOS 10.2.2): Luna JS services run in an individual jail (`/var/palm/jail/<service-id>/`) with only `console`, `null`, `urandom`, `shm` in `/dev` (no `/dev/net/tun`), a minimal `/etc` (no `os-release`), and only the service's own install dir bind-mounted read-write from the host. The JS service therefore cannot directly inspect TUN, system network state, or manage `tailscaled`. All privileged inspection and daemon lifecycle must live in an unjailed root component (init.d startup hook + supervisor scripts). The jailed JS service acts as a Luna-facing broker that reads schema-validated JSON files (`var/host-facts.json`, `var/daemon-status.json`) written by the root side into the service's own directory, the only read-write path shared across the jail boundary. Never store irreplaceable state (node identity) in the service dir because IPK reinstall/upgrade replaces it; keep identity in the persistent state dir (`/var/lib/webosbrew/tailscale/`).

Suggested identity:

```text
com.ljam96.tailscale.service
```

The UI application id (for example `com.ljam96.tailscale.app`) must share the same id prefix as the service. Distribution is via Homebrew Channel sideload / `.ipk`, not the LG Content Store. `appinfo.json` ids, `services.json`, and LS2 role files must be kept consistent.

Packaging must include, in addition to `services.json`:

* LS2 role and manifest files (for example `roles/*.json`, `apiPermission`, `services.d/` configuration) granting only the UI id permission to call the service methods below.
* Whether the service is a JS service (`node` + luna-service2) or a native service, and the pinned Node.js version it was tested against on TV.
* Fixed executable paths and fixed configuration paths so the service cannot be asked to run arbitrary binaries.
* Socket and state file permissions (`0700` / `0600`), and no externally accessible management ports. Keep the Tailscale local API socket local.

Responsibilities:

* Start `tailscaled`.

* Stop `tailscaled`.

* Restart `tailscaled`.

* Query daemon status.

* Execute approved Tailscale CLI operations.

* Read the Tailscale local API.

* Validate daemon health.

* Report logs.

* Manage configuration.

* Manage authentication state.

* Return a limited structured API to the UI.

The UI must never be allowed to execute arbitrary shell commands through this service.

### Tailscale daemon

Use the upstream `tailscaled` implementation.

Preferred deployment order:

* Official static binary matching the television architecture.

* Official binary with required compatibility handling.

* Locally cross compiled upstream Tailscale binary.

* Custom patch only if an unavoidable webOS incompatibility is identified.

Any patch to upstream Tailscale should be minimal and documented.

## Repository layout

Suggested repository:

```text
lg-webos-tailscale/
|
+ README.md
+ IMPLEMENTATION_PLAN.md
+ LICENSE
+ THIRD_PARTY_NOTICES.md
|
+ app/
|  + appinfo.json
|  + package.json
|  + src/
|  + assets/
|
+ service/
|  + services.json
|  + roles/
|  + package.json
|  + src/
|
+ daemon/
|  + README.md
|  + versions.json
|  + scripts/
|
+ packaging/
|  + ipk/
|  + install/
|  + uninstall/
|
+ init/
|  + tailscale
|
+ scripts/
|  + build.sh
|  + package.sh
|  + deploy.sh
|  + diagnose.sh
|
+ tests/
|  + unit/
|  + integration/
|  + device/
|
+ docs/
   + ARCHITECTURE.md
   + SECURITY.md
   + TROUBLESHOOTING.md
   + DEVELOPMENT.md
```

Exact package structure can change to fit the current webOS SDK and Homebrew packaging requirements.

## Persistent filesystem layout

Do not assume vanilla Linux paths such as `/var/lib/tailscale` survive reboot, application upgrade, or firmware update on webOS TV. `/var` is often tmpfs or overlay backed. During discovery, verify with `mount`, `df -h`, and a reboot test which paths under `/var/lib/webosbrew/`, `/media/developer/`, or `/home/root/` are actually persistent.

Provisional runtime paths, subject to discovery confirmation:

```text
/var/lib/webosbrew/tailscale/
STATE_DIR/tailscaled.state or STATE_DIR/
STATE_DIR/config.json
/var/run/tailscale/
STATE_DIR/logs/ or RAM backed logs/
```

Concrete proposal to validate first:

```text
/var/lib/webosbrew/tailscale/
STATE_DIR/tailscaled.state
/var/lib/webosbrew/tailscale/config.json
/var/run/tailscale/tailscaled.sock
```

`/var/run/tailscale/` is tmpfs and must be recreated on every boot with secure ownership and permissions.

Application files should remain within the normal homebrew application package path.

The Tailscale state directory and state file must have restrictive permissions (`0700` directory, `0600` files).

Authentication state should never be exposed directly to the UI.

## Startup integration

Use the Homebrew Channel supported startup mechanism.

Provisional hook, to be confirmed during discovery:

```text
/var/lib/webosbrew/init.d/50-tailscale
```

Confirm during discovery that this path is executed as root on boot, and whether it runs before or after network availability (ConnMan online). If network is not yet available, the script must exit cleanly after starting the daemon in offline mode and let the health mechanism apply preferences once connectivity returns; it must not block boot waiting for network.

The startup script should:

* Confirm required files exist.

* Confirm the network stack is sufficiently initialised, but tolerate offline boot.

* Create runtime directories when required (`/var/run/tailscale`, state dir).

* Apply secure ownership and permissions.

* Use a PIDfile and `flock` to check whether `tailscaled` is already running, including after standby/wake where the process may survive but lose connectivity.

* Start `tailscaled` with fixed paths, for example with `--statedir` and `--socket`.

* Wait for the local API socket with a bounded timeout.

* Apply persisted preferences only after the daemon becomes responsive.

* Record startup errors.

* Exit without blocking the webOS boot process indefinitely.

It should not create an infinite restart loop.

A separate lightweight health mechanism can perform controlled restarts.

## Daemon supervision

Do not assume `tailscaled` will remain alive indefinitely.

The service should distinguish between:

* Daemon not installed.

* Daemon stopped intentionally.

* Daemon crashed.

* Daemon running but local API unavailable.

* Daemon healthy but disconnected.

* Daemon connected.

* Authentication required.

* Network unavailable.

* Control plane unreachable.

A restart policy should use bounded retry behaviour.

Repeated failures should result in a degraded state rather than constant process respawning.

## Authentication flow

Use standard Tailscale device authentication.

`tailscale up` blocks while login is required. The privileged service must run it asynchronously, then poll `tailscale status --json` or the local API for the `AuthURL` field and expose only that URL to the UI. The UI polls the service; it never runs `tailscale up` directly and never sees node keys.

Initial flow:

```text
Application opened
      |
      v
Check daemon state
      |
      v
Start daemon if required
      |
      v
Service runs `tailscale up` async
      |
      v
Service polls status / local API for AuthURL
      |
      v
Authentication URL returned to UI
      |
      v
Display URL and QR code
      |
      v
User authenticates using phone or computer
      |
      v
Daemon becomes connected
      |
      v
Application displays assigned address and status
```

Do not ask the user to type Tailscale credentials into the television.

Do not store account passwords.

Do not pass auth keys on command lines where they appear in process listings. Development only auth keys must be supplied via file or environment to the privileged service, never via Luna parameters or UI logs, and must be redacted from diagnostics.

For development and automated testing, reusable or ephemeral authentication keys may be supported through a development only configuration path.

Production UI should prefer interactive Tailscale authentication.

## Local service API

The Luna service should expose a small allowlisted API.

Suggested methods:

```text
status
connect
disconnect
restart
getPreferences
setPreferences
getExitNodes
setExitNode
clearExitNode
getDiagnostics
getLogs
```

Every method should validate parameters.

There must not be a method equivalent to:

```text
exec(command)
```

or arbitrary command execution.

### Example status response

```json
{
  "returnValue": true,
  "daemon": "running",
  "backendState": "Running",
  "networkMode": "tun",
  "hostname": "lg-b4",
  "tailscaleIPv4": "100.x.x.x",
  "tailscaleIPv6": "fd7a:115c:a1e0::x",
  "exitNode": null,
  "acceptRoutes": true,
  "allowLANAccess": true,
  "needsLogin": false
}
```

## Tailscale command strategy

Use the newest stable Tailscale command interface supported by the packaged version, and pin that version in source control. CLI syntax drifts between releases.

Prefer:

```sh
tailscale status --json
tailscale up --exit-node=<node> --accept-routes=<true|false> --allow-lan-access=<true|false> --accept-dns=<true|false>
tailscale down
tailscale ip
tailscale logout
```

Avoid `tailscale set` for new code unless the pinned version requires it; prefer `tailscale up` with explicit flags so intent is reproducible. Avoid parsing human readable command output when JSON or the local API is available.

The service should treat `tailscale status --json` or the local API as the authoritative state source.

## Local API strategy

Investigate using the Tailscale local API directly from the privileged service.

Advantages:

* Structured state.

* Less subprocess overhead.

* Better long term integration.

* More reliable status updates.

* Potential access to peer and exit node information.

CLI execution should remain available for operations that do not have an appropriate local API path.

## ConnMan coexistence

webOS uses ConnMan for network management. Tailscale must coexist with it, not replace it.

* Do not disable, replace, or reconfigure ConnMan as part of the first release.
* Treat ConnMan as the owner of the physical interface, DHCP, default route, and `/etc/resolv.conf`.
* Test whether Tailscale routes and DNS settings survive `connmanctl` reconnects, DHCP renewals, and Ethernet/WiFi flaps.
* If ConnMan removes or overrides Tailscale routes or resolver state, disable the offending Tailscale feature rather than fighting ConnMan.
* Safe initial defaults: `--accept-dns=false`, `--accept-routes=false`, no exit node. Enable each only after device testing proves local streaming and LAN access still work.

## Exit node support

Removed from the product. The target kernel has `CONFIG_NETFILTER` unset and no usable iptables, and IPv6 policy routing is unsupported. Advertising the TV as an exit node requires NAT and is therefore impossible. Using an exit node requires netfilter-driven LAN-bypass and default-route handling that cannot be provided, so shipping the toggle would only produce broken routing. The service API exposes no exit node methods and the UI shows no exit node controls. Revisit only if a future kernel provides netfilter.

UI example:

```text
Exit node

None
NAS
oi-1
oi-2
```

When an exit node is selected, expose a separate setting for local network access when supported.

The service must confirm the selected node still exists before applying the setting.

If an exit node disappears, the UI should report this rather than silently selecting another one.

## Route support

Initial setting:

```text
Accept subnet routes
```

Default to off until device testing proves safety. The implementation should determine whether webOS routing permits Tailscale accepted routes without interfering with local network functionality.

If route acceptance causes webOS instability or unexpected route replacement, the feature should be disabled until a safe implementation is known.

Advertising routes from the television is outside the first release.

## MagicDNS

Determine whether Tailscale DNS configuration can coexist with webOS DNS management. Default to `--accept-dns=false` for the first release and use tailnet IP addresses while leaving system DNS untouched, unless testing proves ConnMan accepts Tailscale DNS without breaking streaming or captive portal behaviour.

Possible approaches include:

* Leave system DNS untouched and use tailnet IP addresses (safest initial option).

* Allow normal Tailscale DNS configuration only if webOS and ConnMan accept it.

* Provide application specific name resolution through the local API if global DNS integration is unsafe.

Do not overwrite persistent webOS resolver configuration without understanding the network manager behaviour.

## Power state and standby testing

LG televisions frequently enter standby rather than performing a complete Linux shutdown.

This requires dedicated testing.

Test:

* Full cold boot.

* Normal standby.

* Wake from standby.

* Network reconnect after wake.

* Ethernet disconnect and reconnect.

* WiFi disconnect and reconnect.

* Router reboot.

* DHCP address change.

* Television network setting changes.

* Application launch after long standby.

The application should detect whether `tailscaled` survives standby.

If the daemon survives but loses connectivity, the service should restore connectivity without creating a duplicate process. Use a PIDfile with `flock` in both the startup hook and the service so wake, health checks, and manual restarts cannot start a second `tailscaled`.

## Firmware update resilience

Firmware updates may alter writable paths, remove root, change service restrictions, alter network stack behaviour, or change application signing requirements. Assume root may need to be reapplied after an update and that Homebrew persistence is not guaranteed.

Before claiming update resilience, test:

* Homebrew startup hook persistence.

* Tailscale state persistence.

* Binary execution.

* TUN access.

* Luna service permissions.

* Application launch.

The app should detect incompatible daemon execution and provide diagnostics rather than repeatedly retrying.

## Logging

Maintain separate logs for:

* Application UI.

* Privileged service.

* Tailscale daemon startup.

* Health checks.

Avoid unlimited log growth and TV flash wear. Prefer RAM backed logs with small size based rotation and keep persistent logs minimal.

Do not log:

* Authentication secrets.

* Node keys.

* Reusable auth keys.

* Sensitive local API responses unnecessarily.

Diagnostics should redact secret material.

## Diagnostics screen

Include:

* webOS version.

* Application version.

* Service version.

* Tailscale version.

* Architecture.

* Daemon status.

* Backend state.

* Networking mode.

* TUN availability.

* Tailscale IPv4 address.

* Tailscale IPv6 address.

* Current exit node.

* Route acceptance state.

* LAN access state.

* Local API socket state.

* Last daemon start result.

* Last health check.

* Recent sanitised errors.

Include a copyable or exportable diagnostics bundle where webOS permits it.

## Security model

The root service is the highest risk portion of the project.

Rules:

* Expose only explicit service methods.

* Validate all Luna service parameters.

* Do not provide arbitrary shell execution.

* Do not accept arbitrary filesystem paths from the UI.

* Use fixed executable paths.

* Use fixed configuration paths.

* Set restrictive permissions on state.

* Avoid passing secrets on command lines where they may appear in process listings.

* Redact secrets from logs.

* Reject malformed exit node identifiers.

* Reject unrecognised settings.

* Treat all UI supplied strings as untrusted.

* Avoid listening on externally accessible management ports.

* Keep the Tailscale local API socket local.

* Do not expose a debug shell in production packages.

## Dependency strategy

Primary dependency:

```text
Tailscale
```

Use upstream Tailscale release binaries where possible.

Any additional dependency should be evaluated for:

* Licence.

* Maintenance state.

* Architecture support.

* webOS compatibility.

* Binary size.

* Security history.

* Whether stock webOS functionality already provides the same capability.

Likely additional requirements should be kept minimal.

A QR rendering dependency may be used if the UI environment lacks an adequate built in method.

## Build strategy

Create reproducible builds.

The build pipeline should produce:

* webOS application package.

* Privileged service package.

* Compatible Tailscale binaries.

* Startup script.

* Installation manifest.

* Checksums.

* Third party licence notice.

Pin the Tailscale version in source control.

Do not download an unpinned latest release during production builds.

## Architecture specific daemon packaging

Maintain a manifest such as:

```json
{
  "tailscaleVersion": "x.y.z",
  "targets": {
    "arm": {
      "goarm": "7",
      "sha256": "..."
    },
    "arm64": {
      "sha256": "..."
    },
    "x86_64": {
      "sha256": "..."
    }
  }
}
```

Include `x86_64` for emulator testing even though the TV target is ARM. The LG B4 userspace may be 32 bit ARM even on a 64 bit kernel, so record both `uname -m` and `getconf LONG_BIT` during discovery and record the required `GOARM` level. `THIRD_PARTY_NOTICES.md` must cover Tailscale BSD-3 plus any transitive notices.

At build time, package only supported architectures.

At install time, refuse installation if the current architecture is unsupported.

Never silently execute a binary built for an unknown architecture.

## Cross compilation fallback

If official Tailscale binaries do not run on webOS:

* Record the exact runtime error.

* Determine whether the issue is architecture, dynamic loader, libc, kernel capability, seccomp, or another dependency.

* Attempt a standard upstream Go cross compilation.

* Minimise optional features where Tailscale supports embedded builds.

* Keep changes reproducible.

* Document every upstream patch.

* Submit generally useful fixes upstream where appropriate.

Do not fork Tailscale unnecessarily.

## User interface design

The main screen should prioritise television viewing distance.

Suggested layout:

```text
Tailscale

Connected

LG B4
100.x.x.x

Tailnet
example.ts.net

Network mode
Kernel TUN

Exit node
None

Accept routes
On

LAN access
On

Diagnostics

Disconnect
```

States should be visually distinct:

* Connected.

* Connecting.

* Login required.

* Disconnected.

* Network unavailable.

* Daemon unavailable.

* Unsupported configuration.

* Error.

Avoid showing raw terminal output on the primary screen.

## Settings persistence

Persist application preferences separately from Tailscale identity state.

Example configuration:

```json
{
  "schemaVersion": 1,
  "startOnBoot": true,
  "acceptRoutes": false,
  "acceptDNS": false,
  "allowLANAccess": true,
  "preferredExitNode": null
}
```

Safe defaults are `acceptRoutes=false` and `acceptDNS=false` until ConnMan coexistence is proven on device.

Migrate settings when the schema changes.

Do not delete the Tailscale identity state during a normal application upgrade.

## Versioning

Use semantic versioning for the application.

Track independently:

* Application version.

* Service version.

* Packaged Tailscale version.

An application update should not automatically replace the Tailscale binary without an explicit tested dependency update.

## Installation

The install process should:

* Verify architecture.

* Verify root or required privileges.

* Verify Homebrew environment.

* Install application.

* Install service.

* Install Tailscale binaries.

* Create persistent directories.

* Set permissions.

* Install startup hook.

* Start daemon.

* Verify local API.

* Report success or a specific failure.

Installation must be idempotent where possible.

## Upgrade behaviour

Upgrade should preserve the Tailscale identity state in the validated persistent state directory (provisional path `/var/lib/webosbrew/tailscale/tailscaled.state`, subject to discovery confirmation; do not hardcode `/var/lib/tailscale`).

Upgrade sequence:

```text
Validate package
Stop service
Back up small configuration metadata
Replace application and service files
Replace Tailscale binary if required
Restore permissions
Start service
Run health check
Confirm previous node identity remains valid
```

If the new daemon fails health checks, support restoring the previous binary.

## Uninstallation

Provide two removal modes.

### Remove application but preserve Tailscale identity

This removes:

* UI.

* Service.

* Startup hook.

* Daemon binaries.

It preserves the Tailscale identity state in the validated persistent state directory (provisional path `/var/lib/webosbrew/tailscale/tailscaled.state`).

This allows later reinstallation without creating a new tailnet node where Tailscale state remains valid.

### Complete removal

This additionally removes all application state and Tailscale identity data.

Before deleting identity state, clearly indicate that a future installation may register as a new Tailscale node.

## Health check

Implement a lightweight health check.

Success requires:

* `tailscaled` process present.

* Local API socket reachable.

* Backend state readable.

Health check should distinguish internet connectivity from daemon health.

A disconnected daemon can still be healthy.

Example internal states:

```text
HEALTHY_CONNECTED
HEALTHY_DISCONNECTED
AUTH_REQUIRED
NETWORK_UNAVAILABLE
DAEMON_UNRESPONSIVE
DAEMON_NOT_RUNNING
UNSUPPORTED
```

## Testing strategy

### Unit tests

Test:

* Configuration validation.

* State parsing.

* Luna service request validation.

* Exit node identifier validation.

* Status conversion.

* Error mapping.

* Settings migration.

* Log redaction.

### Integration tests

Test against a Linux environment where practical:

* Start daemon.

* Stop daemon.

* Authentication state handling.

* Status JSON parsing.

* Exit node enumeration.

* Route setting logic.

* Local API communication.

The Linux environment will not replace real webOS testing.

### Device tests

Mandatory on the LG B4:

* Fresh installation.

* Initial authentication.

* Reopen application.

* Application close while Tailscale remains connected.

* Cold reboot.

* Standby and wake.

* Ethernet reconnect.

* WiFi reconnect if applicable.

* Router reboot.

* Loss of internet.

* Tailscale control plane temporarily unavailable.

* Exit node selection.

* Exit node removal.

* Accept routes.

* Local LAN access.

* Daemon crash.

* Corrupted application configuration.

* Uninstall.

* Reinstall preserving identity.

* Complete uninstall.

## Network validation

When kernel TUN mode is available, verify:

```sh
ip addr show
ip route
ip rule
```

Confirm:

* Tailscale interface appears.

* Assigned address matches the control plane.

* Tailnet peers are reachable.

* Local LAN remains reachable.

* Internet routing remains correct.

* Exit node routing behaves correctly.

* Disabling the exit node restores normal routing.

* Disconnecting Tailscale removes or disables Tailscale routes cleanly.

## Performance validation

Measure:

* Daemon memory usage.

* CPU usage while idle.

* CPU usage during sustained traffic.

* Connection establishment time.

* Standby behaviour.

* Wake recovery time.

* UI response time.

* Log growth.

Tailscale must not materially affect normal television playback while idle.

Perform streaming tests while Tailscale is connected even when the stream itself does not use Tailscale.

## Failure scenarios

Explicitly handle:

### Unsupported architecture

Refuse daemon startup and display a clear diagnostic.

### TUN unavailable

Fall back to userspace mode.

### TUN exists but cannot be opened

Report the permission or capability issue and fall back only when safe.

### Daemon binary incompatible

Record stderr and report the binary execution failure.

### Authentication expired

Return to the authentication flow without deleting state automatically.

### Tailnet connectivity unavailable

Keep daemon running and indicate disconnected state.

### Exit node unavailable

Disable the selected exit node and notify the UI.

### Corrupted application preferences

Restore safe defaults without deleting Tailscale node identity.

### Corrupted Tailscale state

Do not delete automatically.

Report the problem and provide an explicit reset option.

## CI

CI should perform:

* Formatting checks.

* Linting.

* Unit tests.

* Service API tests.

* Dependency licence checks.

* Dependency vulnerability checks where practical.

* Application build.

* Service build.

* Package build.

* Checksum generation.

* Static validation of `appinfo.json`.

* Static validation of service manifests.

* Validation that production packages contain no development secrets.

* Validation that packaged Tailscale binary hash matches the pinned manifest.

## Release process

A release should produce:

```text
application package
checksums
release notes
Tailscale version information
third party notices
supported architecture list
known limitations
```

Release notes should state whether the update modifies:

* Application only.

* Service.

* Tailscale version.

* Startup logic.

* Networking behaviour.

## Development phases

## Discovery and proof of concept

Deliverables:

* Hardware and OS discovery report.

* Confirmed CPU architecture, including `uname -m` versus `getconf LONG_BIT` and required `GOARM` level.

* TUN capability result, including kernel config, `mknod` feasibility at `/dev/net/tun`, open permission, and capabilities.

* ConnMan behaviour report covering route, DNS, and `/etc/resolv.conf` ownership.

* Validated persistent state path surviving reboot and upgrade.

* Confirmed official Tailscale binary compatibility result.

* Successful manual SSH only `tailscaled` start with explicit `--statedir` and `--socket`.

* Successful Tailscale authentication via `AuthURL` polling.

* Successful tailnet peer connectivity.

* Reboot survival check via the provisional init hook.

Exit criteria:

The television can establish at least one working Tailscale connection over SSH without any UI, Luna service, or packaging, receives a Tailscale IP, reaches a peer, and the state path and TUN result are recorded.

Confirmed 2026-10-04 on OLED65B42LA (webOS 10.2.2): official `tailscale_1.102.4_arm.tgz` runs unmodified (`--version` ok, ELF 32-bit static ARM, no cross compile needed). Kernel TUN mode works (`TUN:true`, `tailscale0` up, no userspace fallback). Auth via `tailscale up` AuthURL, node `lgwebostv` reached `Running` with `100.123.179.100`, direct peer ping to NAS succeeded over LAN (13ms, no DERP). Safe flags used: `--accept-dns=false --accept-routes=false`. Kernel has no netfilter (`CONFIG_NETFILTER` unset, iptables unusable) and no IPv6 policy routing, so exit node and subnet NAT remain out of scope until proven otherwise.

## Daemon integration

Deliverables:

* Stable daemon paths.

* Persistent state.

* Startup and stop scripts.

* Health check.

* Structured status retrieval.

* Safe restart logic.

Exit criteria:

Tailscale survives application closure and a television cold boot.

Confirmed 2026-10-04: after cold reboot, init hook started supervisor and daemon automatically with no app open and no login; node rejoined as `100.123.179.100` from persistent state in `/var/lib/webosbrew/tailscale/`. All boot artifacts fresh, live socket query `Running`.

## Privileged service

Deliverables:

* Luna service.

* LS2 roles, manifests, and bus ACL allowing only the UI id to call the service.

* Daemon management.

* Status retrieval.

* Preference management.

* Input validation.

* Logging and redaction.

Exit criteria:

The UI can control Tailscale without direct shell access.

## Basic television UI

Deliverables:

* Connection screen.

* Status screen.

* Authentication URL.

* QR code.

* Connect control.

* Disconnect control.

* Diagnostics screen.

Exit criteria:

A user can install, authenticate, connect, inspect status, disconnect, and reconnect using the remote.

## Advanced routing controls

Deliverables:

* Exit node enumeration.

* Exit node selection.

* LAN access option.

* Route acceptance option.

* Capability detection.

Exit criteria:

Supported routing controls can be changed safely without breaking local television networking.

## Resilience

Deliverables:

* Standby recovery.

* Network reconnect handling.

* Crash handling.

* Bounded daemon restart behaviour.

* Firmware compatibility checks.

Exit criteria:

Normal power and connectivity events do not require SSH intervention.

## Packaging and release

Deliverables:

* Reproducible package.

* Installer.

* Uninstaller.

* Upgrade path.

* Documentation.

* Licence notices.

* Release artefacts.

Exit criteria:

A clean rooted B4 can install the application using documented steps without manual modification of webOS system files.

## Acceptance criteria

The project is considered successful when all core criteria below are met.

* The application installs on the target rooted LG B4.

* The television authenticates as a Tailscale node.

* The assigned Tailscale IPv4 address is visible in the UI.

* Tailnet peers can be reached from the television in the selected supported networking mode.

* Tailscale remains functional when the visible application closes.

* Tailscale starts automatically following a cold boot.

* Tailscale either recovers following standby or clearly reconnects after wake.

* The application does not modify protected webOS partitions.

* Uninstall restores the television to its previous network behaviour.

* No Tailscale account password is stored by the application.

* No arbitrary root command execution is exposed through the UI service.

* Logs do not contain authentication secrets.

* Failure of Tailscale does not prevent normal webOS networking.

## Enhanced acceptance criteria for kernel TUN mode

If kernel TUN mode is available, also require:

* A functional Tailscale interface is created.

* Normal webOS applications can reach tailnet IP addresses without application specific proxy configuration.

* Exit node operation works correctly if enabled.

* Disabling Tailscale restores the original routing state.

* Local LAN access remains available when configured.

## Userspace fallback acceptance criteria

If TUN mode is unavailable:

* `tailscaled` runs in userspace networking mode.

* Authentication works.

* The application clearly labels userspace mode.

* Supported proxy endpoints operate correctly.

* Unsupported system wide functionality is hidden or marked unavailable.

* No unsafe kernel or system modification is attempted.

## Future enhancements

Possible later work:

* Advertise the television as an exit node if technically useful and safe.

* Advertise local subnet routes.

* Taildrop integration.

* Tailscale SSH where meaningful on webOS.

* DNS integration improvements.

* Peer browser.

* Tailnet service browser.

* Homebrew Channel update repository.

* Automatic daemon version checks with explicit user controlled upgrades.

* Multiple profile handling if Tailscale and webOS capabilities permit it.

* Remote diagnostics through a tightly controlled local API.

## Recommended first engineering task

Start with a manual SSH proof of concept before writing the UI or Luna service.

Collect:

```sh
uname -a
uname -m
getconf LONG_BIT
ls -l /dev/net/tun
ls -ld /dev /dev/net
zcat /proc/config.gz 2>/dev/null | grep -i tun
capsh --print 2>/dev/null
ip addr
ip route
ip rule
mount
df -h
```

Then copy the correct official Tailscale binaries to a writable location and test:

```sh
tailscaled --version
tailscale version
```

If compatible, start the daemon using an explicit state directory and socket, for example with `--statedir` and `--socket`.

Verify the daemon responds via `tailscale status --json`. Authenticate by polling for `AuthURL`, not by reading blocking CLI stdout.

Confirm that the television receives a Tailscale IP address.

Confirm peer connectivity.

Confirm the chosen state path survives reboot, and confirm whether the init hook runs before or after ConnMan is online.

Only after this succeeds should work begin on the Luna service and graphical interface.

This keeps the highest risk question, whether Tailscale networking works correctly on the B4 kernel and webOS environment, at the beginning of the project rather than discovering it after the application has already been built.
