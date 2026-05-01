// diagram-renderer — public API.
//
// PlantUML in, Excalidraw JSON out. Internally:
//
//   PlantUML text
//      │
//      ▼
//   parsePlantUml()  →  Diagram model
//      │
//      ▼
//   layoutDiagram()  →  Diagram with absolute positions + edge paths
//      │              (sizing, ELK layered routing, corner chamfering)
//      ▼
//   exportDiagram()  →  Excalidraw JSON
//
// External dependencies:
//   * elkjs        — Eclipse Layout Kernel (layout & orthogonal routing)
//   * Excalidraw   — consumed via its file-format API (we emit the JSON
//                    that Excalidraw's import expects). We never bundle
//                    the React component; this lib produces files that
//                    *any* Excalidraw front-end can open.

/**
 * @diagram sequence
 *
 * The call graph for `renderPlantUml(text)` walks three subsystems:
 *
 * 1. **parser** turns PlantUML text into a model (`Diagram` /
 *    `SequenceDiagram`). The parser is plugin-driven; see the next
 *    diagram for the plugin breakdown.
 * 2. **layout** decides positions. Component diagrams go through ELK
 *    (layered + orthogonal routing); sequence diagrams use a small
 *    deterministic tabular layout.
 * 3. **renderer** walks the laid-out model and emits Excalidraw JSON.
 *    The same model can also be exported to SVG via
 *    [`src/render/svg.mjs`](./src/render/svg.mjs) — used by the
 *    documentation pipeline.
 */

/**
 * @diagram modules
 *
 * The module graph reflects how the source is laid out under
 * [`src/`](./src/). Note in particular how the parser is split into a
 * single tiny `engine` plus a stack of plugins under `parser/plugins/`,
 * each plugin handling one PlantUML construct.
 */

import { parsePlantUml } from "./src/parser/plantuml.mjs";
import { layoutDiagram } from "./src/layout/elk_layout.mjs";
import { exportDiagram } from "./src/render/excalidraw.mjs";

export { parsePlantUml } from "./src/parser/plantuml.mjs";
export { layoutDiagram } from "./src/layout/elk_layout.mjs";
export { exportDiagram } from "./src/render/excalidraw.mjs";
export {
  Box, Connection, Diagram, Plane, Subplane,
  Participant, Message, SequenceDiagram, SequenceNote,
  SHAPES,
} from "./src/model/diagram.mjs";

/**
 * Render a PlantUML source string to an Excalidraw JSON document.
 *
 * @param {string} plantuml  PlantUML text (see src/parser/plantuml.mjs
 *                           for the supported subset).
 * @param {object} [opts]
 * @param {string} [opts.sourceLabel]  Forwarded to the renderer's
 *                                     appState.name.
 * @returns {Promise<object>}          Excalidraw JSON.
 */
export async function renderPlantUml(plantuml, opts = {}) {
  const diagram = parsePlantUml(plantuml);
  await layoutDiagram(diagram);
  return exportDiagram(diagram, {
    sourceLabel: opts.sourceLabel ?? diagram.title ?? "",
  });
}

/**
 * Render an already-built Diagram model. Useful for callers that want
 * to bypass the PlantUML parser and feed shapes programmatically.
 */
export async function renderDiagram(diagram, opts = {}) {
  await layoutDiagram(diagram);
  return exportDiagram(diagram, {
    sourceLabel: opts.sourceLabel ?? diagram.title ?? "",
  });
}
