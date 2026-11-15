# Security policy

`@grethel-labs/excaliplant` parses untrusted PlantUML text and emits
Excalidraw JSON / SVG / PNG. We treat the parser surface as a trust
boundary and ship a dedicated security test suite
([`test/security.test.mjs`](test/security.test.mjs)) covering SVG
injection, unsafe links, ReDoS-style pathological lines, prototype
pollution, preprocessor explosions, resource limits and file-system
isolation of `!include`.

## Supported versions

The **current release on npm — including the latest patch — is fully
supported**. Older versions may still work, but can show reduced
functionality, missing fixes, or unaddressed advisories. Please upgrade
to the latest version before reporting a vulnerability.

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

- Treat `render(input)` like any other untrusted-input parser.
  Run it inside a worker / isolated process if your input source is
  hostile.
- The SVG output **inlines the Excalifont woff2** as a `data:` URL;
  PNG rasterisation loads the bundled TrueType copy through `resvg`.
  Some sandboxing environments restrict data URLs in fonts; if that
  applies, post-process the SVG to drop the `<style>` block.
- The PNG path uses `@resvg/resvg-js` which executes as native code
  (Rust → N-API). Keep that dependency on `npm audit` watch.

## Built-in hardening

These protections are always on:

- **Resource limits** (`DEFAULT_LIMITS`, overridable per call): input size
  (2 MiB in the API, `--max-input-bytes` up to 200 MiB in the CLI), lines,
  line length, preprocessor steps/recursion/loop iterations, nodes, edges,
  drawing elements and PNG width (`[16, 16000]` px).
- **No ambient I/O**: rendering never reads files or the network. `!include`
  works only through a resolver you pass in; the CLI's `--include-dir`
  confines includes to one directory tree. `!includeurl`/`!import` are refused.
- **Escaped output**: all SVG text and attributes are escaped, colours are
  validated, and links are limited to `http(s)` and `mailto`.
- **No install scripts**: the package declares no install hooks.
- **Provenance**: releases are published with `npm publish --provenance`
  from GitHub Actions; verify with `npm audit signatures`.
- **Reviewed dependency updates**: Dependabot PRs go through the same CI and
  review as any other change.
