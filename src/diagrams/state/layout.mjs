/**
 * State diagram layout contract.
 * @module diagrams/state/layout
 */

import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutDiagram } from "../../general/layout/elk_layout.mjs";

/**
 * @param {object} model
 * @param {object} _context
 * @returns {Promise<void>}
 * @public
 */
export async function layoutStateDiagram(model, _context) {
  await layoutDiagram(/** @type {import("../../general/model/diagram.mjs").Diagram} */ (model));
}

/** @public */
export class StateDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({
      layoutStrategy: "elkGraph",
      layout: layoutStateDiagram,
    });
  }
}

/** @public */
export const stateDiagramLayout = new StateDiagramLayout();
