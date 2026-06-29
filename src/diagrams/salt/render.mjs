/** @module diagrams/salt/render */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { GRAPH_RENDERERS } from "../shared/graph_runtime.mjs";
/** @public */
export const SALT_RENDERERS = GRAPH_RENDERERS;
/** @public */
export class SaltDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: SALT_RENDERERS });
  }
}
/** @public */
export const saltDiagramRenderer = new SaltDiagramRenderer();
