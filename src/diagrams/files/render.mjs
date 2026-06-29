/** @module diagrams/files/render */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { treeRenderers } from "../shared/tree_runtime.mjs";
/** @public */
export const FILES_RENDERERS = treeRenderers;
/** @public */
export class FilesDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: FILES_RENDERERS });
  }
}
/** @public */
export const filesDiagramRenderer = new FilesDiagramRenderer();
