/** @module diagrams/math/layout */
import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutGraphModel } from "../shared/graph_runtime.mjs";
/** @public */
export class MathDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "elkMathFallback", layout: layoutGraphModel });
  }
}
/** @public */
export const mathDiagramLayout = new MathDiagramLayout();
