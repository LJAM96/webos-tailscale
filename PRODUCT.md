# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The target is LG webOS, confirmed by the user. The television application uses webOS's web application runtime (HTML, CSS, and JavaScript); this platform value describes the interface technology, not a desktop browser deployment.

## Product Purpose

Provide a Tailscale client controller for a rooted LG television. The implementation plan targets an LG B4 and aims to give the TV its own tailnet identity, access to tailnet services, and a connection that persists independently of the visible interface and returns after a full boot.

## Users

The documented use case is an owner or operator of a rooted LG B4 who needs to connect the television to a Tailscale tailnet and inspect or troubleshoot its connection using the TV interface. This audience is derived from the implementation plan; broader audiences and supported TV models remain undecided.

## Operating Context

- The interface runs on the television and supports directional remote navigation, Enter, and Back.
- Authentication presents a login URL and QR code for completion on another device.
- The visible application controls and reports on background networking; closing it must not stop the connection.
- Homebrew Channel mechanisms provide installation and boot integration on the rooted device.

## Capabilities and Constraints

The current source includes Status and Settings screens, connection controls, login QR display, sign out, device information, and advanced diagnostics. Settings include starting on boot, accepting DNS, accepting subnet routes, LAN access, and Tailscale SSH. Source presence does not establish successful operation on the target TV.

The packaged application describes itself as an early preview, diagnostics only. The implementation plan is the record of intended capabilities, not evidence that all goals have shipped or passed device validation.

- Use the official Tailscale daemon and standard control interfaces rather than implementing the networking protocol.
- Keep privileged operations outside the UI. The current Luna service brokers schema-validated requests to the root supervisor.
- Prefer kernel TUN networking when the target supports it; otherwise use userspace networking and disclose its limitations.
- Preserve connection state across reboots in known writable persistent locations.
- Avoid kernel changes, protected system partition edits, system binary replacement, and custom cryptography.
- Keep network operations reversible and preserve local LAN access where supported.
- DNS, routing, exit node support, suspend/resume behavior, firmware resilience, and broader hardware compatibility require target-specific validation. Do not promise them merely because they appear in the plan.

## Brand Commitments

The existing application title is Tailscale and its application ID is `com.ljam.tailscale`. Preserve factual product naming and existing assets; no additional brand or voice commitment was established during initialization.

## Evidence on Hand

- `IMPLEMENTATION_PLAN.md`: documented purpose, rooted LG B4 target, architecture, constraints, planned features, and acceptance criteria.
- `app/appinfo.json`: web application runtime, application identity, and early-preview description.
- `app/index.html`: implemented TV interface, remote navigation, status/settings flows, authentication display, and diagnostics.
- `app/assets/`: existing application icons and splash asset.
- `service/service.js`, `init/`, and `scripts/`: service broker, background supervision/startup code, and packaging/install tooling.
- `THIRD_PARTY_NOTICES.md`: existing dependency notices.

No device validation results, customer proof, performance claims, or confirmed compatibility beyond the documented target were established during initialization.

## Product Principles

Derived from the existing implementation plan:

1. Keep networking alive independently of the visible application.
2. Prefer official Tailscale components and established webOS/Homebrew mechanisms.
3. Preserve the television's system integrity and make networking changes reversible.
4. Make connection state, authentication, and troubleshooting understandable from the television.
5. Distinguish intended capabilities from capabilities validated on the target device.

## Accessibility & Inclusion

The existing interface supports directional remote navigation, visible keyboard focus, Enter activation, and Back navigation. Future interface work must preserve remote operation and television readability. No additional accessibility standard or user-specific need was established.
