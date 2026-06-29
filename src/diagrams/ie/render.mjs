/** @module diagrams/ie/render */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { erRenderers } from "../shared/er_runtime.mjs";

/** @public */
export const IE_RENDERERS = erRenderers;
/** @public */
export class IeDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: IE_RENDERERS });
  }
}
/** @public */
export const ieDiagramRenderer = new IeDiagramRenderer();
