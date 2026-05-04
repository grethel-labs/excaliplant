# Repository Instructions for Editing Agents

This file is the canonical project guide for Copilot and other editing
agents. Keep it focused on rules that affect most code changes. Do not
duplicate these instructions into tool-specific files. System-specific adapter
files may exist only as short pointers back to this file.

Current adapter files:

- `.github/copilot-instructions.md` for GitHub Copilot.
- `CLAUDE.md` for Claude Code.
- `GEMINI.md` for Gemini CLI.
- `.cursor/rules/repository-instructions.mdc` for Cursor.
- `.windsurf/rules/repository-instructions.md` for Windsurf.
- `.clinerules` for Cline.
- `.roo/rules/repository-instructions.md` for Roo Code.

## Project Shape

The library is a small deterministic pipeline:

```text
PlantUML text -> parsePlantUml -> Diagram/SequenceDiagram model -> layoutDiagram -> exportDiagram -> Excalidraw JSON -> optional SVG/PNG
```

Respect the layer boundaries:

- Parser code recognizes PlantUML syntax, but does not render or layout.
- Model classes describe input-agnostic structure, not Excalidraw/SVG details.
- Layout mutates geometry onto the model and returns the same model.
- Renderers translate already laid-out models into Excalidraw/SVG/PNG output.
- CLI code handles I/O and options only; keep business logic in `src/`.

Important files:

- `src/parser/plantuml.mjs`: parser dispatch, default plugin lists, parse limits.
- `src/parser/engine.mjs`: generic line engine and plugin contract.
- `src/model/diagram.mjs`: public model classes.
- `src/layout/elk_layout.mjs`, `src/layout/sequence_layout.mjs`: layout passes.
- `src/render/excalidraw.mjs`, `src/render/svg.mjs`,
  `src/render/canvas_svg.mjs`, `src/render/png.mjs`: renderers.
- `index.mjs`: public top-level API.

## Language and Style

- Runtime is Node `>=18`; source is ESM-only `.mjs`.
- Use ESM imports with explicit `.mjs` extensions.
- Do not introduce CommonJS (`require`, `module.exports`) in `src/`.
- This repo uses JSDoc plus TypeScript `checkJs`; there is no TypeScript source.
- Public API needs clear JSDoc with `@param`, `@returns`, and usually `@public`.
- Code comments and JSDoc are English. Explain contracts, edge cases, or security
  reasoning; avoid comments that narrate obvious assignments.
- Formatting is Prettier-controlled. Do not hand-format around it.
- Prefer small concrete modules over broad abstractions.

Naming conventions:

- Classes: `PascalCase` (`Diagram`, `SequenceDiagram`, `Box`).
- Functions and variables: `camelCase` (`parsePlantUml`, `layoutDiagram`).
- Constants: `UPPER_SNAKE_CASE` (`DEFAULT_PARSE_LIMITS`).
- Source files under `src/` generally use `snake_case.mjs`.
- Parser plugin exports usually end in `Plugin` (`connectionPlugin`).
- Plugin `name` values are stable dotted strings (`component.connection`).

## Parser Work

New PlantUML syntax should usually be implemented as a parser plugin:

1. Add a focused plugin under `src/parser/plugins/component/` or
   `src/parser/plugins/sequence/`.
2. Implement `{ name, tryLine?, tryStart? }` according to `src/parser/engine.mjs`.
3. Register it in `DEFAULT_COMPONENT_PLUGINS` or `DEFAULT_SEQUENCE_PLUGINS` in
   `src/parser/plantuml.mjs`.
4. Add a regression test under `tests/`.

Parser rules:

- Keep `src/parser/engine.mjs` generic. New PlantUML constructs should not need
  engine changes.
- Plugin order matters. Block plugins must run before generic regex plugins;
  greedy connection parsing belongs last.
- A plugin should return `true` only when it is responsible for the line.
- Block plugins return an object with `onLine` and `tryEnd`.
- Use context helpers from `component_context.mjs` and `sequence_context.mjs`
  instead of mutating unrelated model internals.
- Unknown lines are intentionally tolerant by default. Diagnostics use
  `unknownLines: "warn" | "strict"`.
- Do not hand-roll quote/comment parsing when helpers exist. Prefer utilities
  such as `stripComment`, `stripQuotes`, `explodeBraces`, `unescapeLabel`,
  `slug`, and `classifyArrow` from `src/parser/utils.mjs`.

## Model Work

- Component-style diagrams use `Diagram -> Plane/Subplane -> Box` plus
  `Connection`.
- Sequence diagrams use `SequenceDiagram -> Participant/Message/SequenceNote`.
- Model classes must not know about parser regexes, PlantUML source lines,
  Excalidraw element fields, or SVG strings.
- New model fields need JSDoc, constructor defaults, and tests.
- Geometry/layout fields should initialize to `0`, `null`, or empty arrays.
- Maintain explicit backlinks such as `box.parent`, `connection.from/to`, and
  participant/box lookup behavior.
- Preserve stable IDs, declaration order, and public getters unless intentionally
  making a breaking change.

## Layout and Rendering

- Component layout runs through ELK in `src/layout/elk_layout.mjs`; sizing lives
  in `src/layout/sizing.mjs`.
- Sequence layout is deterministic and table-like in
  `src/layout/sequence_layout.mjs`.
- Renderers should not infer PlantUML syntax or perform late layout.
- Text measurement/wrapping should use existing helpers from `src/style/text.mjs`.
- Excalidraw output must stay deterministic by default. Do not scatter
  `Math.random`; default IDs/seeds derive from `stableHash32` over
  `sourceLabel|diagram.title` and the seeded RNG helpers in
  `src/render/rng.mjs`.
- For new Excalidraw primitives, follow existing helpers such as `baseElement`,
  `rect`, `text`, `arrow`, `line`, and `ellipse`.
- SVG output is an injection surface. Escape text and attributes with the
  existing SVG escape helpers.
- Canvas SVG export in `src/render/canvas_svg.mjs` wraps plain SVG output in a
  fixed-aspect canvas; keep its background escaping and width clamps intact.
- Validate or clamp canvas/PNG sizes and other expensive rendering options.

## Security Expectations

This package parses untrusted PlantUML and emits JSON/SVG/PNG. Treat parser and
renderer inputs as hostile.

- Do not bypass `DEFAULT_PARSE_LIMITS` or CLI resource caps.
- CLI input defaults to a 10 MiB cap with a 200 MiB `--max-input-bytes` ceiling;
  CLI, canvas-SVG, and PNG widths are bounded to `[16, 16000]` px.
- Do not add file-system access to parser or renderer paths that process
  PlantUML input.
- Avoid prototype-pollution hazards. Prefer `Map` or carefully controlled class
  instances for attacker-controlled keys.
- Review regex changes for ReDoS risk. Prefer scanner-style helpers for
  quote-aware or brace-aware parsing.
- Never interpolate untrusted strings directly into SVG or HTML-like output.
- Add or update `tests/security.test.mjs` for security-relevant changes.
- Keep dependency and native-rendering changes compatible with
  `npm audit --omit=dev --audit-level=high`.

## Tests and Validation

Before a PR, run the relevant subset locally. For broad or user-visible changes,
run the full gate:

```sh
npm test
npm run typecheck
npm run format:check
npm audit --omit=dev --audit-level=high
npm run build
node docs/scripts/check-build-manifest.mjs
```

For public API or JSDoc changes, `npm run build:api` is the minimum API-docs
check; `npm run build` runs both docs and API generation.

Test placement:

- `tests/edge_cases.test.mjs`: focused edge cases.
- `tests/functional_more.test.mjs`: broad feature and renderer coverage.
- `tests/plantuml.test.mjs`: core parser/render behavior.
- `tests/security.test.mjs`: XSS, ReDoS, prototype pollution, limits, CLI hardening.
- `tests/self_introspection.test.mjs`: repo-generated architecture diagrams.

New parser, renderer, security, or public API behavior needs a regression test.
Avoid tests that only assert "renders something" when a more specific contract is
available.

## Docs, Generated Files, and Releases

- `README.md` is generated. Edit `docs/README.template.md.njk` instead, then run
  `npm run build:docs`.
- Do not manually patch generated docs or `docs/ressources/generated/` output.
- Generated artifact merge conflicts use the `keep-generated` merge driver;
  resolve source/template changes, then regenerate with `npm run build:docs`.
- Preserve `@diagram` JSDoc blocks unless deliberately changing generated
  architecture diagrams.
- User-visible behavior changes should update `CHANGELOG.md` in the next
  appropriate section.
- New public exports belong in `index.mjs` and, when package-importable, in
  `package.json` `exports`.
- Check `package.json` `files` when adding package-relevant assets.
- PRs into `main` need exactly one release label: `release:major`,
  `release:minor`, or `release:patch`.
- CI runs tests on Node 18/20/22 across Ubuntu, macOS, and Windows.

## Feature Checklist

Use this checklist before finishing substantial changes:

1. Is the change in the correct layer: parser, model, layout, renderer, CLI, or docs?
2. Can parser support be a plugin instead of an engine change?
3. Is output deterministic and stable for review?
4. Are untrusted strings escaped, validated, or clamped at every output boundary?
5. Are expensive paths bounded by existing or new limits?
6. Are JSDoc types complete enough for `tsc --checkJs`?
7. Are functional and, when relevant, security tests included?
8. Were generated docs rebuilt through the template pipeline when user-facing docs changed?
9. Was `CHANGELOG.md` updated for user-visible behavior?
10. Has the relevant local gate been run?
