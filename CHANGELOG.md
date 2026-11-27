# Changelog

User-visible changes are listed here. Versions and release notes are created
automatically from pull request labels; see [docs/releasing.md](docs/releasing.md)
and the [GitHub releases](https://github.com/grethel-labs/excaliplant/releases).

## Unreleased

### Added

- Set a target width-to-height ratio for graph layouts with the `aspectRatio` API option or the `--aspect-ratio` CLI flag.
- Configure a hook with `click-mode:button` to run an action on every activation with a momentary pressed style.
- Add plain-text `@tooltip` bindings for diagram elements, connections and labels, with native tooltips in the Playground.
- Support nested hook hit targets and opt-in click forwarding from child hooks to their parent hooks.
- Choose Architect, Artist, or Cartoonist strokes in the playground and fine-tune shape and connector roughness independently.
- Preview PlantUML hooks interactively in the Playground, with a live event readout and an interactive services example.
- Add PlantUML `@hook` bindings with IDs and classes, themed hover and click styles, and JavaScript events for inline SVG viewers.
- Add Grethel Labs Light and use coordinated teal outlines, fills, and connectors in both Grethel Labs themes.
- The playground opens local PlantUML files and folders, resolves their includes in the browser, and exports diagrams together or individually from a carousel.
- VS Code can switch PlantUML files between the source and a live preview in the same editor group.
- Document the shared SVG asset workflow and CI checks for Markdown on GitHub, GitLab, and Forgejo.
- The CLI discovers entry diagrams in PlantUML projects and resolves nested local includes. Markdown can render a linked PlantUML file and its dependencies.
- Theme definitions support inheritance and individual colour and alpha overrides. Added Grethel Labs Dark, light and dark pastel palettes, and transparent palettes for light and dark backdrops.

### Changed

- Inherit explicit text colour and size from graph containers and sequence boxes, with child styles taking precedence.
- Use the Diagram Sprout logo and Grethel Labs colours across the README, website, and editor and plugin icons.
- The Codex plugin carries the listing the OpenAI plugin portal asks for (display name, descriptions, category, starter prompts, support and privacy URLs, logo and composer icon), and `PRIVACY.md` answers the five points the OpenAI guidelines require. A test applies the portal's validation rules to the release archive.
- State diagram text geometry is populated during layout. `parse()` returns the state model before text measurement.

### Fixed

- Document element tooltips in the README and a dedicated specification, with a standalone Playground example.
- Gantt dependency arrows and other diagram connectors follow the selected sketch style while keeping their routes and endpoints.
- The live playground on the GitHub Pages site rendered nothing since v1.4.0: loading the layout engine lazily let it replace the message handler of the page's worker, which then never answered. The handler is restored after the engine is created.

### Changed

- Plugin READMEs and the skill now document what the directory policy asks for: example prompts, troubleshooting, support and security contacts, everything the plugin runs, sends and fetches, and that the CLI runs only to fulfil a diagram request. New `PRIVACY.md`.

- The layout engine (ELK) is loaded on first use instead of on import: importing the library and rendering non-graph diagrams (sequence, Gantt, mind map, JSON, …) is several hundred milliseconds faster. Layouts are cached by their exact input, so re-rendering an unchanged diagram (or one that only changes colours, theme or seed) skips the layout step. Output is byte-identical.

- The Claude Code plugin no longer bundles an unpinned MCP launcher (the Claude directory blocks those); the release archive carries one pinned to the release, and the plugin has a README, a LICENSE and an icon.

- Connectors are drawn with much less hand-drawn wobble (`edgeRoughness` per theme), so lines stay straight with crisp corners; mind map and JSON/YAML connectors are orthogonal instead of curved.
- Graph diagrams with many unconnected elements are packed into a grid instead of one long row.
- Floating notes may contain colons (`note "a: b" as N`).
- Edge labels, multiplicities and container/package titles are placed collision-aware: they avoid arrowheads, crossing lines and other labels, and titles get a backdrop where a line must pass behind them.
- State diagrams keep their main flow top-down: cycles are broken along a depth-first walk from the start state, so forks, joins and branches no longer flip upwards.
- Sequence fragment tags and guards stay readable above activation bars; message labels get a backdrop only where a lifeline crosses them.
- Ditaa arrowheads are drawn as real arrows that touch the box border.
- Choice diamonds and fork/join bars have fixed connector sides: flow enters at the top, the first branch leaves at the bottom and further branches sideways (state and legacy activity diagrams).
- Connectors of actors, interfaces and other icon shapes attach to the icon instead of the label below it.
- Label and title backdrops are opaque and take the colour of the container below them instead of a translucent white patch.
- Gantt dependency arrows route around task bars; the today marker is drawn behind the bars.
- nwdiag: nodes that are only linked to a peer (e.g. an internet cloud) sit in their partner's column so the link stays vertical.
- Sequence fragment tags and guards are drawn above lifelines; timing highlight captions sit below the signals and message labels get a backdrop; chronology tick dates stay readable above spans and connectors.
- Arrowheads keep their full size: connectors end in a straight segment of at least 30 px (graph and activity diagrams), and container spacing applies inside nested containers too.
- Connectors avoid container titles and package tabs; tab width follows the title; multiplicities sit at the line end; needless jogs in routes are straightened. JSON/YAML child tables line up with the row that points to them.
- Activity diagrams: edge labels are placed collision-aware (never on the line or arrowhead) and branches of a `switch` are straight.
- Sequence: message labels crossing a lifeline or activation bar get an opaque backdrop; the arrow of a `!!` message stops at the destroy cross.
- LaTeX/math: `\binom`, `\dbinom`, `\tbinom`, `\choose` and `\over`; integral limits sit beside the sign; subscripts hug their base.
- Salt group frames are at least as wide as their title, creole tables are separated from surrounding text, chart legends show line series with a line marker, and Gantt arrows take shorter routes.

### Added

- The skill uses the MCP tools (`render_plantuml`, `validate_plantuml`, `list_diagram_types`, `get_example`) first when they are available, with the CLI and the editor link as fallbacks. The plugin archive contains a `.mcp.json` pinned to the release; the plugin directory build does not (the directory accepts local MCP servers only from verified organizations).

- The playground opens plain-text links (`#src=` followed by percent-encoded PlantUML), and the agent skill tells a model that cannot run commands to give such a link to the live editor instead of failing. The plugin READMEs describe it.

- The website is now a live playground: write PlantUML in the browser and see it rendered with the current version in a web worker (all render options, editable examples, share links, SVG/PNG/Excalidraw export). The example gallery moved to a second view with an "Open in playground" button; see `docs/site.md`.
- Each release adds a commit with the versioned plugin files to the generated branch `plugin-release` (tag `plugin-release-vX.Y.Z`), which the Claude plugin directory can track; `main` stays untouched.
- `warmup()` (exported from the package) loads the layout engine ahead of time. The MCP server (`--no-warmup` to disable), the VS Code extension (`excaliplant.warmup`) and the Obsidian plugin (setting "Prepare in the background") call it in the background, so the first class, component or state diagram no longer waits about a second.
- `scripts/bench.mjs` measures cold-start and warm render times and can check outputs against recorded hashes; see `docs/performance.md`.
- `excaliplant markdown` renders ` ```plantuml ` blocks in Markdown files (inline SVG or asset files, idempotent, `--check` for CI); `@grethel-labs/excaliplant/markdown`, `/markdown-it` and `/remark` plugins; a GitHub Action (`action.yml`).
- MCP server: `excaliplant mcp` / `excaliplant-mcp` (stdio, optional local HTTP) with `render_plantuml`, `validate_plantuml`, `list_diagram_types` and `get_example`; published to the MCP registry with each release.
- Agent skill for Claude Code, Claude, Codex, Gemini CLI, opencode, Cursor, Copilot, Antigravity and rule files for Windsurf, Cline and Roo: `excaliplant skills install`, a Claude Code plugin marketplace, a Gemini CLI extension and release archives. The skill ships a snapshot of Excalidraw's element typings that a weekly workflow keeps current.
- Codex plugin and marketplace (`codex plugin marketplace add grethel-labs/excaliplant`), a skills-only plugin ZIP for the OpenAI plugin portal, and a publishing guide for the Claude and Codex directories, the Gemini CLI gallery, skills.sh and Markdown ecosystems (`docs/publishing.md`).
- VS Code extension: live Markdown preview of `plantuml` blocks, commands to export `.puml` files and a side preview; attached to each release as `.vsix` and published to the Marketplace and Open VSX.
- Obsidian plugin: renders `plantuml` code blocks in notes (desktop and mobile), exports `.excalidraw`/SVG/PNG; mirrored to `grethel-labs/excaliplant-obsidian` with each release.

- `autoactivate on` for sequence diagrams.
- Interactive gallery on GitHub Pages with type tabs, arrows, keyboard and swipe navigation, PlantUML source and SVG/`.excalidraw` downloads.
- Animated README carousel with one slide per diagram type, plus more examples for sequence, class, state, use case, deployment and timing diagrams.

## 1.0.0

### Changed — complete rewrite (breaking)

- New architecture: one small module per diagram type (`detect`, `parse`, `layout`, `draw`) on a shared core. The 0.x class hierarchy (`BaseDiagramModule`, `*Assets`, `*Docs`, …) and its exports are gone.
- New API: `render()` returns a `RenderResult` with `excalidraw`, `diagnostics`, `toSvg()` and `toPng()`; `renderAll()`, `parse()`, `detectKind()`, `listDiagramTypes()`. `renderPlantUml()` keeps working.
- `toSvg()` / `toPng()` are async; the SVG/PNG helpers moved to the `./svg` and `./png` subpath exports.
- Node.js 20 or newer is required.

### Added

- 30 diagram types: sequence, activity (new and legacy syntax, swimlanes), class/IE, object, use case, component, deployment, state, timing, Gantt, chronology, mind map, WBS, files, JSON, YAML, nwdiag, salt, ArchiMate, Chen ER, DOT, EBNF, regex, AsciiMath, LaTeX, ditaa, chart and creole.
- Full PlantUML preprocessor with bundled offline C4 and ArchiMate libraries.
- Creole rich text, `skinparam`, `<style>`, inline colour specs and six themes (`sketch`, `plain`, `hachure`, `mono`, `dark`, `blueprint`), plus `--clean` strokes.
- Text layout with real Excalifont metrics; arrows bound to shapes in Excalidraw.
- CLI options `--theme`, `--clean`, `--all`, `--page`, `--include-dir`, `--define`, `--strict`, `--list-types`, stdin/stdout support.
- Generated gallery with every example, README screenshots and a docs drift check.

### Release process

- Releases publish directly from the merge commit using PR labels and git tags; no version commits, bot SSH keys, force pushes or auto-rebases anymore.
