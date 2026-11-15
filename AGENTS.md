# Repository Instructions for Editing Agents

This file is the canonical guide for Copilot, Claude Code, Gemini, Cursor,
Windsurf, Cline, Roo and other editing agents. Tool-specific files
(`CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`,
`.cursor/rules/…`, `.windsurf/rules/…`, `.clinerules`, `.roo/rules/…`) only
point here. Put substantive guidance in this file.

## Project shape

```text
PlantUML text
  → core/source        @start…@end blocks, comments, newpage
  → core/preprocess    !define, $vars, !if/!while/!foreach, !procedure/!function, !include (resolver)
  → registry.resolve   picks the diagram module (detect scores for @startuml)
  → module.parse       lines → model (shared commons: title, skinparam, <style>, …)
  → module.layout      model → geometry (ELK, sequence engine, tree, railroad, …)
  → module.draw        geometry → Canvas (Excalidraw elements)
  → render/            excalidraw | svg (roughjs) | png (resvg)
```

Directory map:

- `src/index.mjs`, `src/api.mjs` — public API (`render`, `renderAll`, `parse`, `detectKind`, `renderPlantUml`, …).
- `src/core/` — source handling, preprocessor (+ bundled stdlib shims), registry, pipeline, limits, errors, diagnostics, hashing.
- `src/syntax/` — shared PlantUML language: line reader, text helpers, colours, creole, link/arrow grammar, common commands, skin application.
- `src/model/graph.mjs` — graph model shared by node/edge diagrams.
- `src/layout/` — text measurement (`font_metrics.mjs` is generated) and geometry helpers.
- `src/draw/` — `Canvas` (the only producer of Excalidraw elements), shape library, themes, diagram chrome (title/legend/…).
- `src/render/` — Excalidraw document assembly/validation, SVG, PNG, fonts.
- `src/diagrams/<kind>/` — one folder per diagram family. `src/diagrams/graph/` is the shared toolkit for graph diagrams; `src/diagrams/index.mjs` lists the built-in modules in detection-priority order.
- `examples/<kind>/*.puml` — examples = test fixtures = gallery entries.
- `scripts/` — docs generator, font metrics generator, test runner, release helpers.

## Layer rules

- A diagram module is a plain object created with `defineDiagram({ kind, title, starts, detect?, raw?, fallback?, parse, layout, draw })`.
- Parsers produce models; they never measure text or create drawing elements.
- Layout computes geometry; it may measure text (`layoutText`, `textWidth`) but never draws.
- Draw code only uses the `Canvas` API and theme roles (`roleStyle(theme, "class")`). Never write Excalidraw fields, SVG or colours directly into elements.
- Renderers (`src/render/`) know nothing about PlantUML.
- The CLI (`bin/excaliplant.mjs`) does I/O and option parsing only.
- Models expose `meta` from `createMeta()` so shared chrome works everywhere.

## Adding or extending a diagram type

1. Put parser rules in the owning module. Prefer `runRules` with small rule functions; shared syntax belongs in `src/syntax/`.
2. Reuse the graph toolkit (`graphModule`, `parseDeclaration`, `parseLink`, `layoutGraph`, `drawGraph`) for node/edge diagrams.
3. For `@startuml` types add weighted `detect` patterns via `score()`; keep regexes anchored and cheap.
4. Add an example to `examples/<kind>/` — it is automatically tested (kind detection, no warnings, Excalidraw/SVG/PNG) and shown in the gallery.
5. Add focused unit tests for tricky syntax in `test/`.
6. Look at the rendered PNG/SVG before you finish; layout bugs are not caught by structural tests.

## Language and style

- Node `>=20`, ESM-only `.mjs`, explicit `.mjs` import extensions, no CommonJS in `src/`.
- JSDoc types checked by `tsc --checkJs` (`npm run typecheck`). Public API needs JSDoc.
- Prettier formats everything (`npm run format`). Comments explain contracts and non-obvious decisions, in English.
- `camelCase` functions/variables, `PascalCase` classes, `UPPER_SNAKE_CASE` constants, `snake_case.mjs` or `index.mjs` file names.
- Output must be deterministic: no `Math.random`, no wall-clock time. Seeds come from `stableHash32`.

## Security expectations

The library renders untrusted input.

- Respect `DEFAULT_LIMITS`; new expensive paths need a budget in `src/core/limits.mjs` or a clamp.
- No file-system or network access in `src/` rendering paths. `!include` goes through the caller's resolver only.
- Escape all text/attributes in SVG; colours must pass `parseColor`; links only `http(s)`/`mailto`.
- Use `Map` / `Object.create(null)` for attacker-controlled keys.
- Avoid regexes with nested or overlapping quantifiers on unbounded input; prefer scanners. Detection only sees the first 500 characters of a line.
- Add a case to `test/security.test.mjs` for security-relevant changes.

## Generated files

- `README.md` is generated from `docs/README.template.md`; `docs/gallery.md`, `docs/gallery/` and `docs/assets/` from `examples/` and `docs/diagrams/`. Run `npm run docs` after changing examples, the template or rendering, and commit the results. CI fails on stale docs (`npm run docs:check`).
- `src/layout/font_metrics.mjs` is generated by `node scripts/gen-font-metrics.mjs`.

## Validation

Run before opening a PR (CI runs the same):

```sh
npm run format:check
npm run typecheck
npm test
npm run docs:check
npm audit --omit=dev --audit-level=high
```

`npm run check` runs the first four.

## Pull requests and releases

- Branch from `main`; open a PR into `main`.
- Every PR needs exactly one label: `release:major`, `release:minor`, `release:patch` or `release:none`. The label workflow derives it from a `MAJOR`/`MINOR`/`PATCH`/`NONE` token in the branch name and defaults to `release:patch`.
- Do not edit the version in `package.json`; it stays `0.0.0-development`. Versions come from git tags.
- Merging into `main` runs `.github/workflows/release.yml`: it computes the next version from the latest `v*` tag and the PR label, runs the full gate, publishes to npm with provenance and creates the tag and GitHub release. No commits are pushed back to `main`.
- After merging, check the Release workflow run and report the outcome (published version, or the concrete reason nothing was published).
- User-visible changes get a line in `CHANGELOG.md` under "Unreleased".
