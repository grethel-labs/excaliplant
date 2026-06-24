/** @module diagrams/ebnf/render */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { railroadRenderers } from "../shared/railroad_runtime.mjs";
/** @public */
export const EBNF_RENDERERS = railroadRenderers;
/** @public */
export class EbnfDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: EBNF_RENDERERS });
  }
}
/** @public */
export const ebnfDiagramRenderer = new EbnfDiagramRenderer();
