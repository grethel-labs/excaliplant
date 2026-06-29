/** @module diagrams/yaml/layout */
import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutDataDiagram } from "../shared/data_runtime.mjs";
/** @public */
export class YamlDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "elkDataTree", layout: layoutDataDiagram });
  }
}
/** @public */
export const yamlDiagramLayout = new YamlDiagramLayout();
