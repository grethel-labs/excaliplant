# Changelog

User-visible changes are listed here. Versions and release notes are created
automatically from pull request labels; see [docs/releasing.md](docs/releasing.md)
and the [GitHub releases](https://github.com/grethel-labs/excaliplant/releases).

## Unreleased

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
