/** @module diagrams/json/layout */
import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutDataDiagram } from "../shared/data_runtime.mjs";
/** @public */
export class JsonDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "elkDataTree", layout: layoutDataDiagram });
  }
}
/** @public */
export const jsonDiagramLayout = new JsonDiagramLayout();
