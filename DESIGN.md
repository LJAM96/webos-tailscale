---
name: "Tailscale for LG webOS"
description: "A dark neutral television controller for background Tailscale networking."
colors:
  background: "#16191d"
  surface: "#23272d"
  surface-hover: "#30363e"
  text: "#f5f6f7"
  secondary: "#bbc3ce"
  border: "#505a67"
  focus: "#fff"
  selected: "#cae2fa"
  success: "#91d7ad"
  warning: "#f0ce8a"
  error: "#ffb5b5"
typography:
  title:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "2.5rem"
    fontWeight: 650
    lineHeight: 1.2
  state:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "3rem"
    fontWeight: 650
    lineHeight: 1.2
  body:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "1.75rem"
    fontWeight: 400
    lineHeight: 1.4
  support:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.45
  data:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "1.75rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.4
  section:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "1.75rem"
    fontWeight: 650
    lineHeight: 1.25
  control:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  control: "12px"
spacing:
  half: "4px"
  step-1: "8px"
  step-2: "16px"
  step-3: "24px"
  step-4: "32px"
  step-6: "48px"
  step-8: "64px"
components:
  button-primary:
    backgroundColor: "{colors.text}"
    textColor: "{colors.background}"
    rounded: "{rounded.control}"
    padding: "16px 24px"
    height: "72px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "16px 24px"
    height: "72px"
  navigation-selected:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.background}"
    rounded: "{rounded.control}"
    padding: "16px 24px"
    height: "72px"
  connection-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "32px"
  checkbox:
    size: "32px"
  destination:
    textColor: "{colors.text}"
    padding: "24px 16px"
    height: "112px"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "48px"
    width: "min(900px, 85vw)"
  button-primary-compact:
    backgroundColor: "{colors.text}"
    textColor: "{colors.background}"
    rounded: "{rounded.control}"
    padding: "8px 24px"
    height: "60px"
  button-secondary-compact:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "8px 24px"
    height: "60px"
  navigation-selected-compact:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.background}"
    rounded: "{rounded.control}"
    padding: "8px 24px"
    height: "60px"
---

# Design System: Tailscale for LG webOS

## Overview

**Creative North Star: "The TV Controller"**

A dark neutral utility for the rooted LG television. Connection health and the next action lead; technical information lives in dedicated task panels. Standard HTML controls, quiet borders and an explicit white focus outline make the interface usable with the directional remote.

This record describes the shipped plain HTML, CSS and JavaScript, not a television certification. Source authority is app/styles.css, app/index.html and app/app.js. The approved direction is recorded in .impeccable/surfaces/app-index-html.md. Review images, including layout and typeset passes under .impeccable/review, use synthetic fixture data; actual LG device behavior remains unverified.

**Key Characteristics:**
- Dark neutral surfaces with semantic status colors.
- System sans text and monospace network addresses.
- Spatial remote focus, Back navigation and restored return focus.
- Native labeled checkboxes and confirmation dialogs.

## Colors

### Primary

Selected pale blue marks the current root destination and native checkbox selection. Primary action buttons use light text color as their fill, with background-colored text.

### Neutral

Background, surface and surface-hover establish the dark neutral hierarchy. Text is the strongest foreground; secondary text carries supporting information. Border separates rows and panels. Focus is a white outline. Exact values are normative in frontmatter and originate in the stylesheet custom properties.

### Semantic status

Success identifies connected and online states; warning identifies sign-in-required and unsupported configurations; error identifies unavailable state and operation failures. Every meaning also has visible words. Disconnected/checking markers use secondary text color.

**The State Is Evidence Rule.** Unavailable or stale status is not disconnected. Keep last known identity information explicitly dated and provide Retry status or Troubleshooting.

## Typography

UI retains the approved system sans stack; real addresses, login URLs and raw diagnostics use the data monospace stack. No external font asset is loaded. The UI roles use root-relative sizes, preserving browser font preferences and zoom without fixing the root font size. At a 16px root, the original visual scale is retained.

Base roles are body 1.75rem, support 1.5rem, title 2.5rem, state 3rem and metadata 1.25rem. At width ≤1400px or height ≤800px, body is 1.625rem, support 1.375rem, title 2.125rem and state 2.5rem; metadata remains 1.25rem. Section headings share the body size but use heading weight and a distinct line height. Data addresses inherit body size, while device metadata, auth URLs and raw diagnostics use support size.

The source names text/control/heading weights as 400/600/650. Navigation, action labels, setting labels and device names use the control weight; titles and section headings use heading weight. Text/support/title/section leading is 1.4/1.45/1.2/1.25. Informational feedback uses supporting size and leading; actionable error feedback uses body size and text leading. Exact role values are normative in frontmatter; named CSS primitives and compact overrides are recorded in the sidecar.

Reading copy shares a 65ch measure across instructions, connection explanations, advanced-screen introduction, feedback paragraphs, dialog paragraphs, settings label/description groups and toolbar descriptions. The background reassurance keeps its shorter 34ch measure. Headings use balanced wrapping when supported. Ordinary prose, headings and controls use break-word as a safety fallback; data identifiers use anywhere wrapping and raw diagnostics preserve whitespace with pre-wrap. Placeholder address wording stays in the UI face; monospace is applied only when an actual address is present.

Addresses use tabular numerals; metadata, freshness and device status request tabular numerals as well. Addresses and raw diagnostics disable font ligatures. The actual LG font and weight realization remains unverified: unsupported weights may resolve to the platform's nearest available face. Unsupported heading balancing falls back to ordinary wrapping.

The typeset browser review under .impeccable/review/typeset covers sixteen standard views at 720/1080 heights and large-text states at 200% root font size. Standard fixtures fit their tested heights; large text grows vertically without horizontal overflow in the exercised states. These are synthetic browser checks, not a physical LG TV font or accessibility certification.

## Layout

The app shell centers within 1800px with 48px top, 64px horizontal and 24px bottom padding. It is a minimum-viewport-height flex column; the wrapping footer follows task content with automatic top margin and 16px top padding. Ordinary long content may grow the page naturally. Header and root navigation precede task content. Within Status, state and explanation lead directly to the current action, followed by TV identity and freshness.

The spacing scale includes the shipped 4px half step and 8/16/24/32/48/64px rhythm. Semantic layout roles are column gap (64px base, 32px compact), section gap (32px base, 24px compact) and task reserve (380px base, 300px compact). Status uses minmax(0,1.45fr)/minmax(320px,1fr); Settings uses minmax(0,1.2fr)/minmax(0,1fr); phone sign-in uses minmax(300px,.8fr)/minmax(0,1.2fr). Connection details split Identity and addresses from Connection service; successful diagnostic checks split Service checks from Versions. These grouped lists use two equal shrinkable columns and narrower internal label/value rows.

At width ≤1400px **or** height ≤800px, shell padding is 24px 32px, header and child-header bottom spacing is 16px, control minimum height is 60px, and buttons/navigation use 8px vertical with their existing 24px horizontal padding. The connection panel uses 24px padding, identity rows tighten to 8px intervals and the action/freshness gaps become 16px. Destination rows retain 16px padding and 88px minimum height. QR width becomes 300px. Footer top padding becomes 8px; dialog padding becomes 32px. Colors and typography retain the existing compact overrides.

At width ≤1100px, grouped details and sign-in stack into one column; toolbars and the Save bar may wrap. At width ≤850px, Status and Settings also stack, root navigation spans the header, detail labels/values become one column, toolbar and Save bar become vertical, device metadata moves below its row, and child-header aligns to the top. Shared grid/flex children have min-width:0; headings, supporting text, buttons, account summary, feedback and Save status use ordinary word wrapping with break-word safety. Identifiers retain anywhere wrapping. Back and toolbar action buttons resist shrinking.

Devices and raw diagnostics use a task height of max(280px, calc(100vh - task reserve)). Fixed introductory content remains outside the inner scroll region; its flex child fills remaining height with a 120px minimum and no maximum-height cap. At width ≤850px the task height becomes automatic and the inner region uses max-height:60vh. A focused scroll region handles Up/Down internally in 160px steps before returning to spatial navigation at its boundaries. Dialogs scroll within max-height:calc(100vh - 64px).

Layout review fixtures cover all eight views at 720 and 1080 heights plus long-content/error extremes. Those captures validate browser composition with synthetic data; they do not establish LG TV runtime behavior. Standard fixture content fits the tested viewport heights; unusually long data may extend the page while remaining horizontally contained.

## Elevation & Depth

Tonal surfaces, row separators and the native modal backdrop supply depth. There are no box shadows or decorative gradients in the shipped stylesheet. The modal backdrop is rgba(0, 0, 0, .75).

**The Tonal Depth Rule.** Use surface contrast and quiet borders for hierarchy; the shipped system uses no shadows or decorative gradients.

## Shapes

Controls, panels, feedback and dialogs share the control radius. Destination rows deliberately have square edges, transparent fill and a bottom separator. The semantic state marker is a 20px circle. Native checkboxes remain native, with a 32px square footprint and selected accent color. QR has a plain white surface and the shared control radius.

## Components

### Buttons and focus

Primary buttons use text fill with background text; secondary buttons use surface fill with text foreground. Both share a 1px border, base 16px 24px padding, minimum control height and weight 600. Compact layouts reduce vertical padding to 8px while preserving 24px horizontally and a 60px minimum height. Danger adds error-colored text. Hover changes ordinary enabled buttons to surface-hover with text foreground. The selected root navigation button retains its pale-blue fill and background-colored text on hover. Danger controls retain error-colored text on hover and press. The general active rule follows the general hover rule and uses border-color fill with text foreground; the more specific selected-navigation hover retains its selected treatment. Disabled controls use opacity .55. Focus uses the named 3px width and 5px offset primitives for a solid white outline, without glow. Only background color transitions, at 160ms ease-out, and only when reduced motion is not requested.

### Navigation and destinations

Two root destinations, Status and Settings, use aria-current="page" for the selected pale-blue state. Child screens show a Back button, parent title and task title. Destination rows combine an action title and supporting description, with a full-width target and separator. A trailing chevron (CSS-generated, aria-hidden by default) signals tappability without rounding to button pills. They have a 112px base minimum height, 88px in compact layouts.

### Connection panel and semantic details

A tonal panel puts named status and explanation before the current primary action, then TV identity, tailnet, address and freshness. Connection details group Identity and addresses beside Connection service; successful troubleshooting groups Service checks beside Versions. Failed checks retain their smaller Service checks group with unavailable/not-confirmed values. Semantic definition lists are reused for identity, connection details and diagnostic checks. Status is live-announced; unavailable values are written as words, not decorative dashes. Last successful status can remain visible with “Last known information” and its service timestamp; current data uses “Status checked · ” rather than implying network activity. Absence of timestamps is explicitly stated. A service response does not prove tailnet reachability.

### Settings draft and native checkbox

Native labeled checkboxes link their visible label and description with aria-labelledby/aria-describedby. The UI keys are exactly startOnBoot, acceptDNS, acceptRoutes, enableSSH and autoUpdateCheck. startOnBoot and autoUpdateCheck appear in Settings, the other three in Advanced network settings. Both panels share one draft and Save/Discard bar, which sticks to the viewport bottom within the editing flow. Leaving that editing flow with changes presents a native dialog with Keep editing, Discard changes and Save settings. Successful saving requires preference readback matching the requested draft. Failed confirmation keeps edits; saving does not invoke Connect.

### Native confirmation dialog

A native dialog uses showModal(), text title/description and ordinary buttons. It has a bounded viewport-relative maximum height with internal scrolling; compact layouts use 32px padding. Focus stays within available dialog controls; Back or cancel closes it and returns focus to its opener. Sign-out uses a separate Cancel/Sign out confirmation explaining loss of sign-in. Root Back calls the official webOS platformBack path when available; the browser preview explains its exit limitation.

### Phone sign-in

Sign-in is a task screen, not an overlay. It pairs phone steps, HTTPS login URL, QR, progress, Refresh sign-in code and Back to status. Instructions are hidden until a current usable URL is returned. QR drawing failure retains the URL with explicit phone fallback. A connected status returns to Status. Back to status leaves background networking connected; it is a navigation action.

### Devices, troubleshooting and recovery

Device rows contain name, optional host, Online/Offline wording, address and OS. Devices and raw diagnostics allocate a bounded task region whose inner scroller fills the remaining height after fixed headings and feedback. Devices, raw diagnostics and detail lists have dedicated screens. Informational feedback uses supporting typography; operation errors use body typography and retain the recovery actions. Showing an operation error scrolls it into view and moves focus to Retry when present, otherwise Troubleshooting, preserving role=alert. Troubleshooting provides human-readable checks and links to raw JSON; receiving checks is explicitly weaker than confirming reachability. Operation feedback supplies applicable Retry, Troubleshooting and Dismiss controls.

### Daemon updates: check notifies, install is explicit

Settings support ends with a daemon-updates block (it is maintenance, not a network setting). The autoUpdateCheck toggle only enables periodic availability checks against the control-advertised release; checking never downloads or installs, and the toggle copy states this. Availability has three honest states: available with version, up to date, or unknown when the tailnet has not advertised a release yet. The Install update button is enabled only when an update is available and opens a confirmation stating the restart duration and untested-version risk before running. Installation verifies the on-disk version change, restarts the daemon through the supervisor, and confirms the running version matches; any mismatch is reported, not hidden. Updates initiated from the Tailscale admin portal are not supported: the control-driven updater cannot locate its binaries in this service layout, so the on-TV Install action is the supported path.

### Service evidence and asynchronous recovery
The service boundary accepts a non-array object only when returnValue is an actual boolean. Status additionally accepts only recognized Running, Stopped, Starting, NeedsLogin or NeedsMachineAuth backend states with boolean needsLogin. Malformed, unknown, stale or explicitly unavailable status becomes unavailable; only confirmed Stopped falls through to disconnected. Retained identity data stays last-known. Status timestamps must be finite positive numeric epoch seconds that form a valid date; otherwise the UI says the service did not report an update time.

Leaving phone sign-in invalidates its outstanding request, clears the QR and URL, and releases its loading state. An old response cannot paint the abandoned screen or unlock a later request. Displayed sign-in URLs must parse as HTTPS with a hostname and no embedded username/password, and the input string is limited to 8192 characters. QR rendering still falls back to the validated URL.

Device results follow the existing maximum-100 peer contract. Each peer needs string name/address and boolean online state before rendering. Connection mutations clear cached peers; responses from an earlier mutation epoch are discarded. Unavailable peer results hide stale rows, clear the failed count and retain a named recovery action. Rendering restores focus if its old target is no longer available. Diagnostic host discovery reports received TV information only for hostProbed === true. TUN presence requires an actual boolean: missing or malformed values remain Not confirmed. These rules govern controller evidence; they do not prove backend reachability or add UI settings.

### Mixed-direction data

Service-supplied TV/tailnet names, definition values and device name/host text use unicode-bidi:plaintext so mixed-direction values do not reorder surrounding copy. Technical addresses and raw responses use explicit LTR direction with unicode-bidi:isolate. Device cells have min-width:0. Navigation and the narrow preview label use margin-inline-start; numbered phone instructions use padding-inline-start. Destination labels align to start; device metadata aligns to end, changing to start when stacked. Physical duplicate declarations were removed. These logical properties preserve the current LTR composition. These are the shipped containment rules, not a claim of complete RTL layout or translated product support.

The final hardening review contains twenty-four accepted synthetic renders from twenty-five captures: sixteen standard view captures fit 720/1080 heights, plus eight final edge states including unknown-backend recovery. The historical peer-recovery.png captured before the count correction is excluded from final visual evidence. The supplied regression result is twenty-two passing checks: nine UI, seven service and six supervisor; this supersedes the earlier nineteen-check result. None is a physical LG device certification.

The final polish review under .impeccable/review/polish contains twenty-three synthetic captures: sixteen standard views fit 720/1080 heights plus seven edge states covering hover, errors, empty content, long sign-in URL, 200% text dialog and 640px details. Selected-navigation and danger hover/press styles were checked from computed CSS; Save/Retry and Keep editing remained operable, with no recorded console errors. This CSS-only pass did not rerun the earlier twenty-two automated checks; those remain historical hardening evidence. The existing native dialog backdrop advisory is a documented material choice, not hidden by detector configuration.

### Terminology and copy

Use the established technical terms with a plain-language explanation where users choose an action. The first Status identity label is “Tailnet (Tailscale network)”; technical details can retain Tailnet. MagicDNS explains using device names instead of IP addresses, subnet routes explain reaching networks shared by devices, and Tailscale SSH explains remote shell access. Keep protocol names, raw JSON, service field names, brand naming and hardware qualifications factual.

- **Connect / Disconnect:** Connect requests a TV connection. Disconnect keeps this TV’s sign-in for next time; it does not mean Sign out.
- **Sign out:** Removes the TV’s Tailscale sign-in and requires signing in again to reconnect. The confirmation points users to Cancel and Disconnect on Status when they want to retain sign-in.
- **Save settings / applied:** Persisting settings and applying them are distinct outcomes. “Settings saved and applied.” means both were confirmed. “Settings saved. They will apply when you connect this TV.” explicitly postpones application. Unconfirmed save/application keeps edits and names the next recovery action.
- **Unavailable:** A failed read cannot confirm connection or device state. Use Retry status, Refresh devices, Retry loading settings or Troubleshooting as the applicable visible action; never infer disconnected from an unavailable read.
- **Status checked / last known:** “Status checked · ” identifies the time of the status evidence. “Last known information · ” labels retained evidence when current status cannot be confirmed. Neither proves traffic or reachability.
- **Service checks:** “The background service responded. This does not confirm access to other tailnet devices.” separates successful communication from actual network reachability.
- **Phone sign-in:** Name the phone as the place to scan/open the address and sign in. “Waiting for sign-in and TV connection…” covers both pending steps. “Back to status” describes where navigation goes; it does not disconnect the TV.
- **Unsaved draft:** “No unsaved changes.” is a comparison with saved settings, not proof of a network operation. Keep editing, Discard changes and Save settings state what each dialog action does.

Clarification review under .impeccable/review/clarify contains twenty-five synthetic browser captures: sixteen standard views fit 720/1080 heights, with nine extreme states including 200% text dialogs. This is browser layout/copy evidence; hardware behavior remains unverified.

### Spatial remote interaction

Arrows select candidates by visible geometry, favoring the same row or column over diagonals; there is no linear wraparound focus list. Enter activates native checkbox controls. Remote Back codes 461/10009 plus browser Backspace/Escape navigate history or close a dialog. Route entry restores the stored available control or chooses a safe fallback, scrolls to top, and scrolls focused targets into view. Pointer hover focuses available controls; a 250ms post-navigation suppression prevents immediate hover from replacing restored focus.

## Do's and Don'ts

### Do:
- Do preserve the high-contrast focus outline and visible labels for status and native controls.
- Do keep Settings and Advanced network settings in one draft with a shared Save and Discard bar.
- Do pair phone sign-in QR with its HTTPS address and a URL fallback when QR drawing fails.
- Do retain last known data with freshness wording when the service cannot confirm current status.

### Don't:
- Don’t use semantic status color without its text label.
- Don’t infer disconnected state from a failed service read.
- Don’t describe LAN access as an existing UI control: the shipped preference UI exposes only startOnBoot, acceptDNS, acceptRoutes and enableSSH; a backend default does not imply a checkbox.
- Don’t treat browser fixtures or source presence as successful LG TV validation.


**Resolved product drift:** PRODUCT.md now describes the four exposed settings accurately; no LAN-access UI checkbox exists. Its backend default is outside this UI system and is preserved. No application defect or unverified device behavior is promoted into a design rule; browser fixture review does not establish TV compatibility. Existing product naming and system sans utility typography are preserved by the approved native TV direction.


### Audit remediation — 4 October 2026

NeedsMachineAuth is an explicit Approval required state, with administrator instructions and a read-only Check approval action. It is not an unavailable read or a confirmed connection. Sign-out remains available when current status is confirmed and no mutation is pending. Phone sign-in reports administrator approval separately from signing in. Unknown states still fail safely.

A connection attempt opens phone sign-in at most once automatically. Explicit navigation away is respected through polling and operation completion; the user can reopen Sign in from Status. A new connection attempt resets this rule. Background operations continue independently of navigation.

Device polling and the existing maximum-100 contract remain intact. Hidden device screens do not construct rows. Visible unchanged rows retain their DOM identity and scroll position; changing displayed values, errors and recovery invalidate the render key. The Status summary continues to update.

At widths up to 600 CSS pixels, Back occupies a separate row above the full-width parent/title block. Television headers retain the existing horizontal composition. Native confirmation dialogs explicitly wrap Tab/Shift+Tab among available controls so focus remains visible, and Escape returns focus to the opener. The connection heading retains heading semantics inside its live-status region; child screen titles announce changes politely.

Launcher metadata describes the existing unofficial controller for rooted LG webOS. This does not claim successful operation on the target TV.
