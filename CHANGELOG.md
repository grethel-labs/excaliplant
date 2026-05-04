# Changelog

All notable changes to `@grethel-labs/excaliplant` are documented in this
file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-05-04

### Fixed

- Dependabot PRs now automatically receive `release:patch` labels to ensure the
  release version workflow can process them correctly.
- Auto-patch dependencies workflow now adds `release:patch` label to created/updated PRs.
- PR release version workflow detects Dependabot PRs and automatically adds
  `release:patch` label if missing.

### Added

- New `auto-rebase-prs.yml` workflow that automatically rebases open PRs
  when main is updated, and adjusts version numbers if there are conflicts
  from parallel PRs being merged.

## [0.3.0] - 2026-05-04

### Added

- Repository-wide editing-agent instructions via `AGENTS.md`, with thin adapter
  files for GitHub Copilot, Claude Code, Gemini CLI, Cursor, Windsurf, Cline,
  and Roo Code. The adapters all point back to `AGENTS.md` so project rules stay
  centralized for future automated editing workflows.
- A README notice clarifying that the repository was created almost entirely
  with AI assistance and that use remains at the user's own risk under the MIT
  License warranty disclaimer.

## [0.2.1] - 2026-05-03

### Security

- `excalidrawJsonToCanvasSvg`: HTML-escape the user-supplied `background`
  option before interpolating it into the canvas `<rect>` `fill`
  attribute. Previously a string like `'" onload="alert(1)'` could
  break out of the attribute and inject arbitrary markup into the
  emitted SVG. The escape uses the same routine as the rest of
  `src/render/svg.mjs` (`escapeAttr`, now exported) and now also
  escapes `>` for defence in depth.
- `parsePlantUml` gains opt-in resource limits
  (`maxInputBytes`, `maxLines`, `maxNodes`, `maxEdges`) with sensible
  defaults so the library API enforces the same safety bounds as the
  CLI. `renderPlantUml({ limits })` forwards the option.
- CI permissions are now `contents: read` by default; only the
  PR-docs auto-amend job re-asserts `contents: write`. The release
  workflow additionally runs `typecheck`, `format:check`, an
  `npm audit --omit=dev --audit-level=high`, and a pack + smoke
  install before publishing.

### Fixed

- `slug()` keeps Unicode letters and digits instead of replacing
  every non-ASCII character with `_`. Diagrams with German umlauts,
  Japanese identifiers, etc. now resolve their connections correctly.
- `stripComment()` is now string-aware: an apostrophe inside a
  `"..."` literal no longer truncates the line, so labels like
  `"Bob 's service"` parse intact.
- Component connections that use bracket / paren / quoted shorthand
  (`[Foo] --> [Bar]`, `(Use case A) --> (Use case B)`) now resolve
  to the matching declared boxes regardless of capitalisation or
  Unicode content.
- Sequence diagrams interleave notes between messages by declaration
  order. Previously every note was placed below the last message,
  losing temporal context.

### Added

- `parsePlantUml(text, { unknownLines: "warn" | "strict" })` for
  diagnostics on lines that no plugin consumed (default behaviour
  remains silent for backwards compatibility).
- `runEngine({ onUnknownLine })` callback so custom pipelines can
  observe unrecognised input.
- `DEFAULT_PARSE_LIMITS` is exported from the top-level module and
  from `./parser/plantuml`.
- `CHANGELOG.md` (this file) and a tightened `pre-commit` hook that
  also runs `npm run typecheck`.

### Changed

- `prepublishOnly` now runs `npm test`, `npm run typecheck`,
  `npm run format:check`, and `npm run build` (in addition to the
  existing prepublish guard) before publishing.

## [0.2.0] - 2026-04

Initial public release on npm.
