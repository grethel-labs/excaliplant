/** @module diagrams/math/render */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { GRAPH_RENDERERS } from "../shared/graph_runtime.mjs";
/** @public */
export const MATH_RENDERERS = GRAPH_RENDERERS;
/** @public */
export class MathDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: MATH_RENDERERS });
  }
}
/** @public */
export const mathDiagramRenderer = new MathDiagramRenderer();
