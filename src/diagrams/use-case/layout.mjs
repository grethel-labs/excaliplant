/**
 * Use-case diagram layout contract.
 * @module diagrams/use-case/layout
 */

import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutGraphModel } from "../shared/graph_runtime.mjs";

/** @public */
export class UseCaseDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({
      layoutStrategy: "elkGraph",
      layout: layoutGraphModel,
    });
  }
}

/** @public */
export const useCaseDiagramLayout = new UseCaseDiagramLayout();
