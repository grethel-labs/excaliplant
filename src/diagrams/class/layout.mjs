/**
 * Class diagram layout adapter.
 * @module diagrams/class/layout
 */

import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutGraphModel } from "../shared/graph_runtime.mjs";

/** @public */
export const layoutClassDiagram = layoutGraphModel;

/** @public */
export class ClassDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "elkGraph", layout: layoutClassDiagram });
  }
}

/** @public */
export const classDiagramLayout = new ClassDiagramLayout();
