/** @module diagrams/mindmap/layout */
import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutTreeDiagram } from "../shared/tree_runtime.mjs";
/** @public */
export class MindmapDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "elkMindmapTree", layout: layoutTreeDiagram });
  }
}
/** @public */
export const mindmapDiagramLayout = new MindmapDiagramLayout();
