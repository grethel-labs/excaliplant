/** @module diagrams/archimate/render */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { GRAPH_RENDERERS } from "../shared/graph_runtime.mjs";
/** @public */
export const ARCHIMATE_RENDERERS = GRAPH_RENDERERS;
/** @public */
export class ArchimateDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: ARCHIMATE_RENDERERS });
  }
}
/** @public */
export const archimateDiagramRenderer = new ArchimateDiagramRenderer();
