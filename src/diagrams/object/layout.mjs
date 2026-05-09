/**
 * Object diagram layout adapter.
 * @module diagrams/object/layout
 */

import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutGraphModel } from "../shared/graph_runtime.mjs";

/** @public */
export const layoutObjectDiagram = layoutGraphModel;

/** @public */
export class ObjectDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "elkGraph", layout: layoutObjectDiagram });
  }
}

/** @public */
export const objectDiagramLayout = new ObjectDiagramLayout();
