/** @module diagrams/files/layout */
import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutTreeDiagram } from "../shared/tree_runtime.mjs";
/** @public */
export class FilesDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "elkFileTree", layout: layoutTreeDiagram });
  }
}
/** @public */
export const filesDiagramLayout = new FilesDiagramLayout();
