/** @module diagrams/wbs/render */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { treeRenderers } from "../shared/tree_runtime.mjs";
/** @public */
export const WBS_RENDERERS = treeRenderers;
/** @public */
export class WbsDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: WBS_RENDERERS });
  }
}
/** @public */
export const wbsDiagramRenderer = new WbsDiagramRenderer();
