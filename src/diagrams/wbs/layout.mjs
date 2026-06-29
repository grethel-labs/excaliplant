/** @module diagrams/wbs/layout */
import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutTreeDiagram } from "../shared/tree_runtime.mjs";
/** @public */
export class WbsDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "elkWbsTree", layout: layoutTreeDiagram });
  }
}
/** @public */
export const wbsDiagramLayout = new WbsDiagramLayout();
