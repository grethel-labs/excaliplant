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
