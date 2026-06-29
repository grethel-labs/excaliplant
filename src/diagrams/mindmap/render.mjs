/** @module diagrams/mindmap/render */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { treeRenderers } from "../shared/tree_runtime.mjs";
/** @public */
export const MINDMAP_RENDERERS = treeRenderers;
/** @public */
export class MindmapDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: MINDMAP_RENDERERS });
  }
}
/** @public */
export const mindmapDiagramRenderer = new MindmapDiagramRenderer();
