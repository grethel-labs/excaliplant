/**
 * Regex diagram layout adapter.
 * @module diagrams/regex/layout
 */

import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutRailroadDiagram } from "../shared/railroad_runtime.mjs";

/** @public */
export class RegexDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "elkRailroad", layout: layoutRailroadDiagram });
  }
}

/** @public */
export const regexDiagramLayout = new RegexDiagramLayout();
