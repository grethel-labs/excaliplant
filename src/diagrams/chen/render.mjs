/** @module diagrams/chen/render */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { erRenderers } from "../shared/er_runtime.mjs";

/** @public */
export const CHEN_RENDERERS = erRenderers;
/** @public */
export class ChenDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: CHEN_RENDERERS });
  }
}
/** @public */
export const chenDiagramRenderer = new ChenDiagramRenderer();
