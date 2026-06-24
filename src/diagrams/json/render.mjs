/** @module diagrams/json/render */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { dataRenderers } from "../shared/data_runtime.mjs";
/** @public */
export const JSON_RENDERERS = dataRenderers;
/** @public */
export class JsonDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: JSON_RENDERERS });
  }
}
/** @public */
export const jsonDiagramRenderer = new JsonDiagramRenderer();
