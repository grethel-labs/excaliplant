/** @module diagrams/nwdiag/layout */
import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutGraphModel } from "../shared/graph_runtime.mjs";
/** @public */
export class NwdiagDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "elkNetworkLanes", layout: layoutGraphModel });
  }
}
/** @public */
export const nwdiagDiagramLayout = new NwdiagDiagramLayout();
