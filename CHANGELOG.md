# Changelog

User-visible changes are listed here. Versions and release notes are created
automatically from pull request labels; see [docs/releasing.md](docs/releasing.md)
and the [GitHub releases](https://github.com/grethel-labs/excaliplant/releases).

## Unreleased

### Changed

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
