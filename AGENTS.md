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

- `src/diagrams/base/`: base diagram module and facet contracts.
- `src/diagrams/{sequence,class,component}/`: concrete diagram modules.
- `src/diagrams/shared/`: shared diagram-family code such as graph parsing.
- `src/main/parser.mjs`: parser dispatch, default plugin lists, parse limits.
- `src/main/pipeline.mjs`, `src/main/registry.mjs`: orchestration and registry.
- `src/util/parser_engine.mjs`, `src/util/plantuml_utils.mjs`: generic parser engine and helpers.
- `src/general/model/diagram.mjs`: public model classes.
- `src/general/layout/elk_layout.mjs`, `src/diagrams/sequence/layout_engine.mjs`: layout passes.
- `src/general/render/excalidraw.mjs`, `src/general/render/svg.mjs`,
  `src/general/render/canvas_svg.mjs`, `src/general/render/png.mjs`: renderers.
- `src/general/style/`, `src/general/platform/`: style and platform services.
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

1. Add a focused plugin under the owning diagram module, for example
   `src/diagrams/sequence/plugins/` or a new `src/diagrams/<kind>/plugins/`.
2. Implement `{ name, tryLine?, tryStart? }` according to `src/util/parser_engine.mjs`.
3. Register it in the owning module parser contract such as
   `src/diagrams/sequence/parser.mjs`, `src/diagrams/class/parser.mjs`, or
   `src/diagrams/component/parser.mjs`.
4. Add a regression test under `tests/`.

Parser rules:

- Keep `src/util/parser_engine.mjs` generic. New PlantUML constructs should not need
  engine changes.
- Plugin order matters. Block plugins must run before generic regex plugins;
  greedy connection parsing belongs last.
- A plugin should return `true` only when it is responsible for the line.
- Block plugins return an object with `onLine` and `tryEnd`.
- Use context helpers from `src/diagrams/shared/graph_context.mjs` and
  `src/diagrams/sequence/context.mjs`
  instead of mutating unrelated model internals.
- Unknown lines are intentionally tolerant by default. Diagnostics use
  `unknownLines: "warn" | "strict"`.
- Do not hand-roll quote/comment parsing when helpers exist. Prefer utilities
  such as `stripComment`, `stripQuotes`, `explodeBraces`, `unescapeLabel`,
  `slug`, and `classifyArrow` from `src/util/plantuml_utils.mjs`.

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

- Component/class layout runs through ELK in `src/general/layout/elk_layout.mjs`; sizing lives
  in `src/general/layout/sizing.mjs`.
- Sequence layout is deterministic and table-like in
  `src/diagrams/sequence/layout_engine.mjs`.
- Renderers should not infer PlantUML syntax or perform late layout.
- Text measurement/wrapping should use existing helpers from `src/general/style/text.mjs`.
- Excalidraw output must stay deterministic by default. Do not scatter
  `Math.random`; default IDs/seeds derive from `stableHash32` over
  `sourceLabel|diagram.title` and the seeded RNG helpers in
  `src/general/render/rng.mjs`.
- For new Excalidraw primitives, follow existing helpers such as `baseElement`,
  `rect`, `text`, `arrow`, `line`, and `ellipse`.
- SVG output is an injection surface. Escape text and attributes with the
  existing SVG escape helpers.
- Canvas SVG export in `src/general/render/canvas_svg.mjs` wraps plain SVG output in a
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
- `tests/module_coverage.test.mjs`: shared coverage inventory that renders every
  diagram-module example through SVG.

New parser, renderer, security, or public API behavior needs a regression test.
Avoid tests that only assert "renders something" when a more specific contract is
available.

Diagram-module coverage examples should follow the sequence-diagram coverage
model. Each module owns examples in
`src/diagrams/<kind>/docs/coverage_examples.mjs`; keep several small, focused
examples for individual syntax/renderer decisions and at least one large
combination example that intentionally mixes supported features. The large
example should exercise edge cases, overlap-prone layouts, long labels,
wrapping/multiline text, functional choices, and deliberate design decisions so
the final SVG validates the diagram type beyond a smoke render. When a diagram
type naturally represents repository structure or dependencies, prefer an
additional repo-derived dynamic example. Wire examples into the generated docs
through `docs/scripts/build-module-coverage.mjs` and keep tests using the same
coverage inventory so documentation and validation cannot drift apart.

## Docs, Generated Files, and Releases

- `README.md` is generated. Edit `docs/README.template.md.njk` instead, then run
  `npm run build:docs`.
- Do not manually patch generated docs or `docs/ressources/generated/` output.
- `docs/module-coverage.md` and `docs/ressources/module-coverage/` are generated
  from module coverage examples; edit the owning example source or template,
  then run `npm run build:docs`.
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
- For PRs targeting `main`, branch names should include exactly one release
  token (`MAJOR`, `MINOR`, or `PATCH`, case-insensitive). CI maps that token to
  the matching release label when none is set, and falls back to
  `release:patch` if no token is present.
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

## PR Completion Process

After completing a feature or patch, finish it through the repository release
path instead of leaving it only as local changes:

1. Create a PR branch whose name contains exactly one release token
   (`PATCH`, `MINOR`, or `MAJOR`) matching the intended release impact.
2. Commit the implementation, tests, docs, and generated artefacts that belong
   to the change.
3. Open a pull request into `main` and ensure it has exactly one matching
   release label. The automation may derive the label from the branch name.
4. Wait for all required PR pipelines to finish. If workflow automation amends
   the branch, wait for the new head commit checks too.
5. Merge the PR only after the required checks pass.
6. After merge, inspect the `main` workflows that decide publication:
   `auto-release.yml` creates a `v*` tag only when `package.json` changes on
   `main`, and `release.yml` publishes to npm only for that tag push.
7. Report the exact publication outcome. If npm was not updated, identify the
   concrete reason, such as no version change, an existing tag, a failed tag
   push, a skipped release workflow, a failing release job, or an npm publish
   error.
