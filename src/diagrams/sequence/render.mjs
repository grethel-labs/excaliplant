/**
 * Sequence diagram renderer adapters.
 * @module diagrams/sequence/render
 */

import { exportDiagram } from "../../general/render/excalidraw.mjs";
import { BaseModuleRenderer } from "../base/renderer.mjs";

/**
 * @param {object} model Sequence model.
 * @param {object} opts Render options.
 * @returns {object}
 */
export function renderSequenceExcalidraw(model, opts) {
  return exportDiagram(/** @type {any} */ (model), opts);
}

/** @public */
export const SEQUENCE_RENDERERS = Object.freeze({ excalidraw: renderSequenceExcalidraw });

/** @public */
export class SequenceDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: SEQUENCE_RENDERERS });
  }
}

/** @public */
export const sequenceDiagramRenderer = new SequenceDiagramRenderer();
