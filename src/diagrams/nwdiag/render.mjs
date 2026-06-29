/** @module diagrams/nwdiag/render */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { GRAPH_RENDERERS } from "../shared/graph_runtime.mjs";
/** @public */
export const NWDIAG_RENDERERS = GRAPH_RENDERERS;
/** @public */
export class NwdiagDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: NWDIAG_RENDERERS });
  }
}
/** @public */
export const nwdiagDiagramRenderer = new NwdiagDiagramRenderer();
