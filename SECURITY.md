# Security policy

`@grethel-labs/excaliplant` parses untrusted PlantUML text and emits
Excalidraw JSON / SVG / PNG. We treat the parser surface as a trust
boundary and ship a dedicated security test suite
([`tests/security.test.mjs`](tests/security.test.mjs)) covering XSS,
ReDoS, prototype pollution, deeply nested input, oversized input, null
bytes, RTL override / zero-width characters, surrogate pairs, and
filesystem isolation.

## Supported versions

We support **the latest published minor** on npm. Older lines do not
receive backports.

| Version | Supported          |
| ------- | ------------------ |
| `0.1.x` | :white_check_mark: |

## Reporting a vulnerability

Please **do not** open a public issue.

1. Use GitHub's [private vulnerability reporting](https://github.com/grethel-labs/excaliplant/security/advisories/new).
2. Include a minimal PlantUML reproducer if possible.

We aim to acknowledge reports within 5 working days and to ship a
patched release within 30 days for confirmed high/critical issues.

## Disclosure policy

- Confirmed vulnerabilities are tracked as GitHub Security Advisories.
- A CVE is requested for any issue with a CVSS ≥ 7.0.
- Fixes ship as a patch release on npm; the advisory is published
  simultaneously.

## Hardening recommendations for consumers

- Treat `renderPlantUml(input)` like any other untrusted-input parser.
  Run it inside a worker / isolated process if your input source is
  hostile.
- The SVG output **inlines the Excalifont woff2** as a `data:` URL.
  Some sandboxing environments restrict data URLs in fonts; if that
  applies, post-process the SVG to drop the `<style>` block.
- The PNG path uses `@resvg/resvg-js` which executes as native code
  (Rust → N-API). Keep that dependency on `npm audit` watch.

## Built-in hardening

These limits are enforced automatically and don't need to be enabled:

- **CLI stdin / file input cap**: `bin/excaliplant.mjs` rejects input
  larger than `--max-input-bytes` (default 10 MiB, ceiling 200 MiB).
- **Render-width bounds**: PNG and canvas-SVG widths are clamped to
  `[16, 16000]` px to bound `@resvg/resvg-js` memory.
- **Stack-trace gating**: the CLI prints a one-line error by default.
  Set `DEBUG=1` to opt back into full stack traces.
- **No install scripts**: the npm package declares no
  `pre/install/postinstall` hooks; nothing executes at `npm install`
  time beyond the bundled JS being placed on disk.
- **Provenance**: releases are published with `npm publish
--provenance`. Consumers can verify the package origin via
  `npm audit signatures`.
- **Pinned third-party Actions**: `softprops/action-gh-release` and
  `peaceiris/actions-gh-pages` are pinned by commit SHA in
  `.github/workflows/release.yml`.
- **Auto-patch dependency PRs require human review**: the
  `auto-patch-deps` workflow opens a PR but no longer auto-merges, so
  a malicious patch release that passes audit/tests still cannot land
  on `main` without an approving review.
