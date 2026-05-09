/**
 * Shared runtime adapters for graph-like diagram modules.
 * @module diagrams/shared/graph_runtime
 */

import { layoutDiagram } from "../../general/layout/elk_layout.mjs";
import { exportDiagram } from "../../general/render/excalidraw.mjs";

/**
 * @param {object} model Diagram model.
 * @returns {Promise<object>}
 */
export async function layoutGraphModel(model) {
  await layoutDiagram(/** @type {any} */ (model));
  return model;
}

/**
 * @param {object} model Diagram model.
 * @param {object} opts Render options.
 * @returns {object}
 */
export function renderGraphExcalidraw(model, opts) {
  return exportDiagram(/** @type {any} */ (model), opts);
}

/** @public */
export const GRAPH_RENDERERS = Object.freeze({ excalidraw: renderGraphExcalidraw });
