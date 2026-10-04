# Third party notices

## Tailscale

Source: https://tailscale.com / https://github.com/tailscale/tailscale
Pinned release: 1.102.4 (`daemon/versions.json`), official static ARM build.
Licence: BSD 3-Clause. See https://github.com/tailscale/tailscale/blob/main/LICENSE.

## qrcode-generator (Kazuhiko Arase)

File: `app/vendor/qrcodegen.js` (cdnjs qrcode-generator 1.4.4, `qrcode.min.js`).
Licence: MIT. See https://github.com/kazuhikoarase/qrcode-generator/blob/master/README.md.
Used only to render the Tailscale login URL as a QR code on the TV. No network use.
