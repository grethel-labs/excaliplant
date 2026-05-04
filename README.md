
# excaliplant

[![npm](https://img.shields.io/npm/v/@grethel-labs/excaliplant.svg?label=latest)](https://www.npmjs.com/package/@grethel-labs/excaliplant)
[![downloads](https://img.shields.io/npm/dm/@grethel-labs/excaliplant.svg)](https://www.npmjs.com/package/@grethel-labs/excaliplant)
[![ci](https://github.com/grethel-labs/excaliplant/actions/workflows/ci.yml/badge.svg)](https://github.com/grethel-labs/excaliplant/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/@grethel-labs/excaliplant.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@grethel-labs/excaliplant.svg)](./LICENSE)

> PlantUML → ELK layout → Excalidraw renderer with a plugin-based parser. &nbsp;·&nbsp; **v0.3.5** &nbsp;·&nbsp; 86 tests &nbsp;·&nbsp; MIT

`@grethel-labs/excaliplant` takes PlantUML source, runs it through a plugin-based
parser, lays it out with [ELK](https://github.com/kieler/elkjs), and
emits a `.excalidraw` JSON document — opening cleanly in any
Excalidraw front-end. Optional helpers convert the result to SVG or
PNG so the same pipeline can also produce static documentation
artefacts.

<table>
  <tr>
    <td align="center" width="50%">
      <a href="docs/ressources/generated/svg/modules.svg"><img src="docs/ressources/generated/svg/modules.svg" alt="Module structure" width="380"/></a><br/>
      <sub><b>Module structure</b> — rendered by excaliplant itself</sub>
    </td>
    <td align="center" width="50%">
      <a href="docs/ressources/generated/svg/sequence.svg"><img src="docs/ressources/generated/svg/sequence.svg" alt="renderPlantUml flow" width="380"/></a><br/>
      <sub><b>renderPlantUml flow</b> — rendered by excaliplant itself</sub>
    </td>
  </tr>
</table>

> ⚠️ This README is generated. Edit
> [`docs/README.template.md.njk`](./docs/README.template.md.njk) and
> run `npm run build:docs`.

> **AI-generated project notice:** This repository, including source code,
> documentation, comments, and generated artefacts, was created almost entirely
> with AI assistance. The maintainer does not adopt every generated sentence,
> implementation detail, or artefact as a personal statement, endorsement, or
> guarantee. Review everything carefully and use the code at your own risk; the
> MIT License warranty disclaimer applies.

---

## How to use

### Install

```sh
npm install @grethel-labs/excaliplant
```

`@resvg/resvg-js` is pulled in as a runtime dependency so the SVG and
PNG export paths work out of the box.

### Render PlantUML to an Excalidraw document

```js
import { renderPlantUml } from "@grethel-labs/excaliplant";

const excalidraw = await renderPlantUml(plantumlText, { sourceLabel: "demo" });
// → write `excalidraw` to disk as <name>.excalidraw, or hand it to an
//   Excalidraw embed.
```

### Render to SVG / PNG

The result of `renderPlantUml(...)` is a thenable — you can `await` it
to get the Excalidraw JSON, or chain `.toSvg()` / `.toPng()` on it to
get the rasterised diagram in a single line. Both outputs keep the
hand-drawn Excalidraw look (strokes are produced via `roughjs`, the
same library Excalidraw uses internally).

```js
import { renderPlantUml } from "@grethel-labs/excaliplant";

const svg = await renderPlantUml(plantumlText).toSvg();
const png = await renderPlantUml(plantumlText).toPng({ width: 4800 });
```

The lower-level helpers are still exported if you need them:

```js
import {
  renderPlantUml,
  excalidrawJsonToCanvasSvg,
  svgToPng,
} from "@grethel-labs/excaliplant";

const doc = await renderPlantUml(plantumlText);
const svg = excalidrawJsonToCanvasSvg(doc, { width: 1200 });
const png = svgToPng(svg, { width: 4800 });   // 4× SVG width
```

Lower-level entry points are also exported:

| Export                          | Purpose                                          |
| ------------------------------- | ------------------------------------------------ |
| `parsePlantUml(text)`           | PlantUML → `Diagram` model                       |
| `layoutDiagram(diagram)`        | Sizing + ELK layout + edge routing               |
| `exportDiagram(diagram)`        | Diagram → Excalidraw JSON                        |
| `excalidrawToSvg(doc)`          | Excalidraw JSON → tightly-cropped SVG            |
| `excalidrawJsonToCanvasSvg(…)`  | …same, letter-boxed onto a fixed-aspect canvas   |
| `svgToPng(svg)`                 | Rasterise SVG to PNG (`@resvg/resvg-js`)         |

### Run the tests

```sh
npm test
```

Ships with **86 tests** across functional, edge-case,
security (XSS / ReDoS / prototype-pollution), and self-introspection
suites.

---

## Self-rendered architecture diagrams

The diagrams below are produced **by excaliplant itself** at build
time from PlantUML sources that describe this very repository. The
text under each image is extracted from the source via `@diagram`
JSDoc tags.

### Module structure

![Module structure](docs/ressources/generated/svg/modules.svg)

_Sources: [PlantUML](docs/ressources/generated/puml/modules.puml) · [SVG](docs/ressources/generated/svg/modules.svg)_

The module graph reflects how the source is laid out under
[`src/`](./src/). Note in particular how the parser is split into a
single tiny `engine` plus a stack of plugins under `parser/plugins/`,
each plugin handling one PlantUML construct.

### renderPlantUml flow

![renderPlantUml flow](docs/ressources/generated/svg/sequence.svg)

_Sources: [PlantUML](docs/ressources/generated/puml/sequence.puml) · [SVG](docs/ressources/generated/svg/sequence.svg)_

The call graph for `renderPlantUml(text)` walks three subsystems:

1. **parser** turns PlantUML text into a model (`Diagram` /
   `SequenceDiagram`). The parser is plugin-driven; see the next
   diagram for the plugin breakdown.
2. **layout** decides positions. Component diagrams go through ELK
   (layered + orthogonal routing); sequence diagrams use a small
   deterministic tabular layout.
3. **renderer** walks the laid-out model and emits Excalidraw JSON.
   The same model can also be exported to SVG via
   [`src/render/svg.mjs`](./src/render/svg.mjs) — used by the
   documentation pipeline.

### Parser plugins

![Parser plugins](docs/ressources/generated/svg/plugins.svg)

_Sources: [PlantUML](docs/ressources/generated/puml/plugins.puml) · [SVG](docs/ressources/generated/svg/plugins.svg)_

Each parser plugin is a tiny self-contained file that handles ONE
PlantUML construct. The engine offers each input line to plugins
in registration order; the first plugin that returns `true` wins.

To add support for a new PlantUML keyword, drop a new file in
`src/parser/plugins/` and append it to the default array in
[`plantuml.mjs`](./src/parser/plantuml.mjs). No engine change required.

## Pipeline

```text
PlantUML text
     │ parsePlantUml()
     ▼
  Diagram (planes, subplanes, boxes, connections)
     │ layoutDiagram()  (sizing → ELK layered + orthogonal routing → chamfer)
     ▼
  Diagram with absolute positions and edge paths
     │ exportDiagram()
     ▼
  Excalidraw JSON
     │ excalidrawJsonToCanvasSvg()  (optional)
     ▼
  SVG  ── svgToPng() ──▶  PNG  (both optional, no headless browser)
```

## Repository layout

```text
excaliplant
├── assets
│   └── fonts
│       ├── Excalifont-Regular.woff2
│       └── LICENSE.txt
├── bin
│   └── excaliplant.mjs
├── docs
│   ├── ressources
│   ├── scripts
│   │   ├── build-docs.mjs
│   │   ├── check-build-manifest.mjs
│   │   ├── config.mjs
│   │   ├── extract-docs.mjs
│   │   ├── file-tree.mjs
│   │   └── self-diagrams.mjs
│   └── README.template.md.njk
├── scripts
│   ├── auto-patch-deps.mjs
│   ├── bump-release-version.mjs
│   ├── prepublish-guard.mjs
│   ├── setup-merge-drivers.mjs
│   └── smoke.mjs
├── src
│   ├── layout
│   │   ├── elk_layout.mjs
│   │   ├── sequence_layout.mjs
│   │   └── sizing.mjs
│   ├── model
│   │   └── diagram.mjs
│   ├── parser
│   │   ├── plugins
│   │   │   ├── component
│   │   │   └── sequence
│   │   ├── component_context.mjs
│   │   ├── engine.mjs
│   │   ├── plantuml.mjs
│   │   ├── sequence_context.mjs
│   │   └── utils.mjs
│   ├── render
│   │   ├── canvas_svg.mjs
│   │   ├── excalidraw.mjs
│   │   ├── png.mjs
│   │   ├── rng.mjs
│   │   ├── schema.mjs
│   │   ├── sequence_render.mjs
│   │   └── svg.mjs
│   └── style
│       ├── colors.mjs
│       ├── font.mjs
│       └── text.mjs
├── tests
│   ├── edge_cases.test.mjs
│   ├── functional_more.test.mjs
│   ├── plantuml.test.mjs
│   ├── security.test.mjs
│   └── self_introspection.test.mjs
├── AGENTS.md
├── CHANGELOG.md
├── CLAUDE.md
├── CONTRIBUTING.md
├── GEMINI.md
├── LICENSE
├── README.md
├── SECURITY.md
├── THIRD_PARTY_NOTICES.md
├── index.mjs
├── package.json
├── tsconfig.json
└── typedoc.json
```

Generated artefacts (`docs/ressources/generated/`, `docs/api/`) live
in `.gitignore` — they are rebuilt by `npm run build:docs` and
`npm run build:api`.

## Module documentation

### layout

Layout chooses positions for every shape and routes every edge.
Component / use-case / deployment diagrams flow through ELK
(`elkjs`) using the `layered` algorithm with orthogonal edge
routing. After ELK returns we chamfer 90° corners so the result
matches Excalidraw's diagonal-corner aesthetic.

Sequence diagrams skip ELK entirely — their layout is strictly
tabular (lifelines on the X axis, time on the Y axis), so a
deterministic ~90-line algorithm produces better, more compact
results than a force-directed solver could.

### model

Input-agnostic diagram model. Two top-level kinds:

- **`Diagram`** — component / deployment / use-case style
  (planes, subplanes, boxes, connections).
- **`SequenceDiagram`** — lifelines + messages + notes.

Layout and renderer dispatch on the model class. Anything that
can be expressed as one of these two shapes flows through the
pipeline; the parser is just one possible source. Callers can
also build a `Diagram` programmatically and feed it to
`renderDiagram()`.

### parser/engine

A ~50-line line-walker. The engine itself knows nothing about
PlantUML syntax; that lives entirely in plugins. Block plugins
(multi-line notes, class bodies) take exclusive ownership of
subsequent lines until they release.

### render

Emits Excalidraw JSON. Each model shape is dispatched to a
dedicated `renderXxx()` function that produces one or more
Excalidraw primitive elements (rectangle, ellipse, line, arrow,
text). The output document is a stand-alone `.excalidraw` file
that any Excalidraw front-end can open. The companion module
`src/render/svg.mjs` converts the same JSON to SVG for the
build-time documentation pipeline.

## License

MIT © grethel-labs
