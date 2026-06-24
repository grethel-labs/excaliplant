# Changelog

All notable changes to `@grethel-labs/excaliplant` are documented in this
file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- New `src/general/style/style.mjs` module with a single source of truth for
  renderer styling. `getStyle()` / `setStyle()` / `resetStyle()` /
  `loadStyleFromFile()` are exported from the package root, the CLI
  exposes `excaliplant --style <file>`, and the `./style` subpath is
  importable directly. The loader supports JSON and a small YAML
  subset (nested maps, scalars, comments) so style overrides can live
  in either format. Example presets ship as
  [`style.example.json`](style.example.json) and
  [`style.example.yaml`](style.example.yaml).
- Auto-shrink for box titles and descriptions: long unbreakable
  identifiers now reduce their font size (down to `text.minFontSize`)
  rather than overflowing. Disable via `text.autoShrink: false`. New
  helper `measureFitted` is exported from `src/general/style/text.mjs`.
- Edge-label chips now carry `customData.role` markers
  (`edgeLabelChip` / `edgeLabelText`) so renderers, tests, and
  third-party tools can identify them reliably.
- Class-diagram styling can now colour UML class-like boxes by type
  with `classDiagram.colorByType` and `classDiagram.typeColors`
  (`class`, `abstract`, `interface`, `enum`).
- Sequence diagrams now parse, lay out, and render combined fragments
  for `opt`, `loop`, `alt` / `else`, `par`, `break`, `critical`, and
  `group` blocks. Fragment frames are included in Excalidraw JSON,
  SVG, and PNG output.
- Sequence diagrams now support PlantUML lifecycle and timeline
  constructs: `autonumber`, `create`, `activate`, `deactivate`,
  `destroy`, inline message suffixes (`++`, `--`, `**`, `!!`),
  participant `box ... end box` groups, `ref over` references,
  dividers, delays, spacers, `par` / `and`, and `critical` / `group`
  `option` operands, plus block and compact sequence colour skinparams
  for arrows, participants, and lifelines.
- Auto-generated single-page API reference at
  [`docs/API.md`](docs/API.md). It replaces the previous TypeDoc HTML
  site under `docs/api/` and is rendered from JSDoc by
  [`docs/scripts/extract-api.mjs`](docs/scripts/extract-api.mjs) +
  [`docs/API.template.md.njk`](docs/API.template.md.njk) on every
  `npm run build:docs` run, so it can never drift from the README.
  The TypeDoc devDependency was removed.
- Reusable arrow model classes (`DiagramArrow`, `ArrowEndpoint`,
  `ArrowLine`, `ArrowLabel`) are now exported from the package root
  and used by both sequence messages and component/class connections.
- Sequence diagrams now support endpoint labels, long label wrapping
  against arrowhead-safe budgets, `hide unlinked`, `header`,
  `footer`, `mainframe`, single-canvas `newpage`, solid lifelines,
  and simplified `&` parallel-message parsing.
- Sequence diagrams now support multiline participant block titles,
  message alignment / response-below-arrow skinparams, actor style
  modes, group secondary labels and colours, safe formatted
  autonumber output, Teoz pragmas / partition wrappers, and expanded
  sequence skinparams for messages, notes, groups, dividers, and
  activation bars.
- SVG marker assets for all produced arrowhead forms are stored under
  [`assets/arrowheads/`](assets/arrowheads/), and the docs build now
  emits a self-updating model class diagram in the README architecture
  section.
- Modular diagram architecture foundation: built-in sequence, class,
  and component diagrams now run as separate diagram-type modules from
  per-diagram module folders. The closed-world `DiagramModuleRegistry`
  is separated from platform services, parsed models receive weak
  module metadata, module-owned layout/render adapters are dispatched, and the
  package exports module base classes, registry helpers, platform
  introspection, `security-base`, `asset-base`, diagnostics, failure
  boundaries, capability checks, and final Excalidraw artifact
  validation.
- Diagram modules now use concrete main classes (`SequenceDiagramModule`,
  `ClassDiagramModule`, `ComponentDiagramModule`) composed from base
  parser, layout, renderer, documentation, test, security, and asset
  facets. The shared base contracts live in the `src/diagrams/base/`
  module folder.
- Source structure now foregrounds diagram modules under `src/diagrams/`,
  main orchestration under `src/main/`, shared runtime under
  `src/general/`, and low-level parser helpers under `src/util/`. Legacy
  top-level implementation folders (`src/parser`, `src/layout`,
  `src/render`, `src/model`, `src/modules`, `src/platform`, `src/style`)
  were removed; package subpath exports now point directly at the new
  primary files.
- Shared parser helpers now cover reusable title-line parsing and block-line
  accumulation for note-style block plugins.
- Built-in object diagrams now parse object declarations, aliases,
  body/colon field rows, maps with row anchors, diamonds, notes, and
  class-like relationships through a dedicated `object` diagram module.
- Shared PlantUML preamble support now strips inline and block comments
  before diagram detection, accepts typed `@start...` / `@end...`
  directives, common layout controls, and `<style>...</style>` blocks
  in strict mode, renders graph
  `title` / `caption` / `header` / `footer` / `legend` / `mainframe`
  presentation metadata, and preserves safe PlantUML links/tooltips on
  graph box labels, `url of` directives, graph edge labels, graph notes,
  sequence message labels, and sequence notes as Excalidraw metadata.
- PlantUML Creole and legacy HTML-like text markup now degrades to readable
  plain text across graph, use-case, object, and sequence labels/notes,
  including emphasis, headings, lists, table rows, Unicode notation,
  Emoji/OpenIconic placeholders, code tags, and unsafe tag stripping.
- Sequence diagrams now sanitize supported `skinparam sequence ...` colours
  and map a safe subset of CSS-like `<style>` selectors for participants,
  arrows, notes, groups, lifelines, dividers, and activation bars.
- Graph diagrams now sanitize supported colour skinparams and a safe subset
  of CSS-like `<style>` selectors for diagram backgrounds, component-style
  boxes, arrows, edge labels, notes, and containers while preserving existing
  class-diagram type/source-colour behaviour.
- Sequence diagrams now preserve reverse quoted alias declarations such as
  `participant L as "Long Name"` and message-created aliases such as
  `"Long Name" as L`, and `autonumber resume <step> "<format>"` resumes from
  the next pending number instead of resetting the counter.
- Use-case diagrams now recognize the official shorthand-heavy syntax:
  parenthesized usecases with parenthesized aliases, reverse
  `usecase Alias as "Description"` declarations, quoted actor/usecase aliases,
  business actor/usecase `/` notation, nested `package` / `rectangle`
  boundaries, notes attached to usecases, direction hints, and inline
  relationship style blocks such as `#line:red;line.bold;text:red`.
- Class diagrams now cover more of the official PlantUML class syntax:
  class-family declarations (`annotation`, `entity`, `protocol`, `struct`,
  `dataclass`, and related aliases), visibility-prefixed class declarations,
  reverse quoted aliases, implicit relationship endpoints, colon member rows,
  member-qualified arrows, qualified associations, JSON/object display blocks,
  stereotype/wildcard/remove filters, and safe gradient colour fallbacks.
- Object diagrams now cover the official PlantUML object syntax more fully:
  object aliases, implicit object relationship endpoints, association-object
  diamonds, field/body rows, map and associative-array tables, map row ports,
  PERT-style maps, JSON display blocks, and underlined object titles in the
  generated Excalidraw output.
- Activity diagrams now parse and render a practical PlantUML activity core:
  beta `:action;` flows, multiline actions, start/stop/end/kill/detach,
  if/else/switch/while/repeat/fork/split controls, swimlanes, partitions,
  notes, connectors, goto/label, simple list actions, SDL-style stereotypes,
  and legacy `(*) --> "Activity"` arrows with labels.
- Component diagrams now cover more official PlantUML syntax: bracketed
  `component [Label] as Alias` declarations, relation-only optional interface
  endpoints, JSON display blocks, bare `port` / `portin` / `portout` nodes, and
  implicit component endpoints for official basic relationship examples.
- Deployment diagrams now cover official element declarations, long
  bracketed descriptions for deployment nodes, JSON display blocks, additional
  deployment shapes such as `process` and `action`, and implicit node endpoints
  for deployment relationship examples.
- State diagrams now cover official state syntax more fully: simple and
  composite states, aliases, start/end and history pseudostates, choice/fork/join
  stereotypes, state descriptions, nested transitions, concurrent region
  separators, inline colours, notes, JSON display blocks, and strict-tolerant
  scale/layout/hide-empty-description controls.
- Timing diagrams now have a dedicated timeline module with deterministic
  layout/rendering for `robust`, `concise`, `binary`, `clock`, `analog`, and
  `rectangle` participants, aliases, state lists, absolute/relative/anchored
  times, state changes, binary/clock waveforms, analog values, messages,
  duration constraints, highlights, notes, scale/axis controls, hidden
  footbox/resource directives, separators, and safe text/colour handling.

### Changed

- Edge labels render as a compact tag in the connection's stroke
  colour with white text by default (`edgeLabel.useLineColor`,
  `edgeLabel.textColor`, `edgeLabel.maxWidth`, …). The chip itself is
  emitted with `roughness: 0` and no rounded corners so it reads as a
  clean badge sitting on the line; default font size dropped to 10 px.
- UML class boxes now draw a thin compartment separator between
  attribute-like members and operation/function members when both are
  present.
- Sequence-diagram rendering now gives combined fragments typed
  background/stroke colours with solid header labels, reserves vertical
  margins around fragment frames, expands nested parent fragments
  recursively, prevents adjacent fragment overlap, and colours
  participant heads with deterministic hash-based pastel fills.
- Sequence-diagram message labels now wrap to their available arrow
  length and reserve enough vertical space so long labels do not
  overlap neighbouring timeline entries.
- The `svg.mjs` renderer now honours the per-element `roughness`
  field, so connection arrows / lines and edge-label chips appear
  perfectly straight in the exported SVG / PNG (matching the existing
  `roughness: 0` Excalidraw JSON output).
- `FONT` from `src/general/style/text.mjs` is now a live view of the active
  style document. Existing reads (`FONT.sizeTitle`, `FONT.family`,
  …) keep working; calls to `setStyle()` / `loadStyleFromFile()`
  immediately propagate to sizing and rendering.
- Sequence-diagram timeline spacing is centralized in one spacing
  contract so messages, notes, refs, markers, fragments, and wrapped
  endpoint labels reserve symmetric top/bottom gaps consistently.

### Fixed

- Connection arrows now always inherit the **outline colour of their
  source box** (not the owning plane's colour), and arrowheads
  (`arrow`, `triangle`, `triangle_outline`, `diamond`,
  `diamond_outline`) are rendered in the matching colour in both the
  Excalidraw JSON output and the SVG / PNG export. The SVG renderer
  emits one `<marker>` definition per (arrowhead-type, colour)
  combination actually in use and references it via a
  colour-suffixed marker id, so renderers without
  `context-stroke` support (resvg-js, some Markdown sanitisers) still
  produce coloured arrowheads. Box-stroke resolution is shared with
  the box renderer through the new `boxStrokeColor()` helper, so
  arrows always agree with the box outline including the
  per-id colours used for `__floating__`-plane children.
- Class-diagram visual regressions on large tplant-style sources:
  - Composition (`*--`) and aggregation (`o--`) arrows now keep
    their intentional `endArrowhead: null`. The renderer used to
    coerce `null` to `"arrow"`, which produced a spurious target
    arrow alongside the source diamond.
  - The synthetic `__floating__` collector plane (used for
    declarations that live outside any explicit
    `package` / `namespace`) is no longer drawn as a visible
    bounding rectangle or labelled tab. Its child boxes each
    receive their own deterministic per-id colour
    (`planeColor(box.id)`) so individual top-level types stay
    visually distinguishable, and outgoing arrows pick up the
    matching source-box stroke colour rather than the (invisible)
    floating-plane colour.
  - Long class / interface / enum member signatures now wrap at
    semantically meaningful break points (after `,` `(` `:`,
    before `|` `&` `)`) via the new `wrapMemberSignature` helper
    in `src/general/style/text.mjs`, with continuation indent. Sizing
    grows the box height accordingly so members no longer bleed
    past the right edge.
- SVG start markers are now anchored at the visual tip, so backward
  and start-side arrowheads point at their endpoint instead of starting
  there. Additional rendered heads include circles, dots, bars, and
  partial top/bottom heads.

## [0.3.7] - 2026-05-04

### Added

- Class-diagram support for tplant-style PlantUML sources. The parser now
  understands `class | abstract class | interface | enum` blocks with
  generic type parameters (`Container<T extends Base>`), `extends`, and
  `implements` clauses, so headers like
  `class Child extends Parent` or `abstract class Foo implements Bar`
  produce inheritance / realisation edges automatically.
- Connection multiplicity labels: `A "1" o-- "0..*" B : contains` is now
  parsed and exposed as `Connection.fromMul` / `Connection.toMul`.
- New `enum` shape rendered as a UML class compartment with the
  `«enumeration»` stereotype; `interface` boxes carrying members render
  as compartment boxes with the `«interface»` stereotype.
- Member modifier tags (`{abstract}`, `{static}`, `{field}`, `{method}`)
  survive `explodeBraces` and stay attached to the surrounding member
  line.
- Class-diagram inheritance / realisation edges (`extends`,
  `implements`) auto-vivify undeclared parents as stub class boxes,
  matching PlantUML's implicit-declaration behaviour. Generic
  component-style connections (`A --> B`) and bracket / paren / quoted
  shorthand references (`[A]`, `(B)`, `"C"`) continue to drop silently
  when undeclared, preserving existing component-diagram semantics.
- New `prefer-higher-version` git merge driver auto-resolves conflicts
  on `package.json` / `package-lock.json` whose only disagreement is a
  `"version": "x.y.z"` line by keeping the higher semver. Real
  (non-version) conflicts are still surfaced for human review. Driver
  is registered by `npm install` (via the `prepare` lifecycle hook) and
  applied through `.gitattributes`. The auto-rebase workflow now runs
  `npm ci` before rebasing so the driver is configured on the runner,
  and regenerates docs after a successful rebase.

## [0.3.1] - 2026-05-04

### Fixed

- Dependabot PRs now automatically receive `release:patch` labels to ensure the
  release version workflow can process them correctly.
- Auto-patch dependencies workflow now adds `release:patch` label to created/updated PRs.
- PR release version workflow detects Dependabot PRs and automatically adds
  `release:patch` label if missing.
- Type-checking now narrows the component-context container stack via a proper
  discriminated union, fixing strict null/undefined errors surfaced by
  TypeScript 6.x.
- `declareParticipant` resolves the cached lookup once so its return type is a
  non-nullable `Participant`, satisfying stricter type checking.
- Docs file-tree script imports `tree-node-cli` namespace-style and picks the
  named export (v3+) or default (v1.x) at runtime, so the docs build works
  across both major versions.

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
  `src/general/render/svg.mjs` (`escapeAttr`, now exported) and now also
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
