/**
 * Component diagram layout adapter.
 * @module diagrams/component/layout
 */

import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutGraphModel } from "../shared/graph_runtime.mjs";

/** @public */
export const layoutComponentDiagram = layoutGraphModel;

/** @public */
export class ComponentDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "elkGraph", layout: layoutComponentDiagram });
  }
}

/** @public */
export const componentDiagramLayout = new ComponentDiagramLayout();
