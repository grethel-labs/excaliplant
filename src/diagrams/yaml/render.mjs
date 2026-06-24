/** @module diagrams/yaml/render */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { dataRenderers } from "../shared/data_runtime.mjs";
/** @public */
export const YAML_RENDERERS = dataRenderers;
/** @public */
export class YamlDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: YAML_RENDERERS });
  }
}
/** @public */
export const yamlDiagramRenderer = new YamlDiagramRenderer();
