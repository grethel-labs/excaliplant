/**
 * Activity diagram layout engine.
 * @module diagrams/activity/layout
 */

import { layoutDiagram } from "../../general/layout/elk_layout.mjs";
import { BaseModuleLayout } from "../base/layout.mjs";

/**
 * Activity diagram layout contract.
 * @public
 */
export class ActivityDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({
      layoutStrategy: "flow",
      layout: (diagram) =>
        layoutDiagram(/** @type {import("../../general/model/diagram.mjs").Diagram} */ (diagram)),
    });
  }
}
