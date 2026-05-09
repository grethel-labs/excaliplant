/**
 * Use-case diagram layout contract.
 * @module diagrams/use-case/layout
 */

import { BaseModuleLayout } from "../base/layout.mjs";

/** @public */
export class UseCaseDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({
      layoutStrategy: "elk",
    });
  }
}

/** @public */
export const useCaseDiagramLayout = new UseCaseDiagramLayout();
