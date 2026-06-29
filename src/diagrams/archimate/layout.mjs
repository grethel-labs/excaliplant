/** @module diagrams/archimate/layout */
import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutGraphModel } from "../shared/graph_runtime.mjs";
/** @public */
export class ArchimateDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "elkArchimateGraph", layout: layoutGraphModel });
  }
}
/** @public */
export const archimateDiagramLayout = new ArchimateDiagramLayout();
