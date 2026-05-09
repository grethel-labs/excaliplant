/**
 * Object diagram renderer adapters.
 * @module diagrams/object/render
 */

import { BaseModuleRenderer } from "../base/renderer.mjs";
import { GRAPH_RENDERERS } from "../shared/graph_runtime.mjs";

/** @public */
export const OBJECT_RENDERERS = GRAPH_RENDERERS;

/** @public */
export class ObjectDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: OBJECT_RENDERERS });
  }
}

/** @public */
export const objectDiagramRenderer = new ObjectDiagramRenderer();
