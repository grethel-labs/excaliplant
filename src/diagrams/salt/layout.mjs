/** @module diagrams/salt/layout */
import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutGraphModel } from "../shared/graph_runtime.mjs";
/** @public */
export class SaltDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "elkWireframeGrid", layout: layoutGraphModel });
  }
}
/** @public */
export const saltDiagramLayout = new SaltDiagramLayout();
