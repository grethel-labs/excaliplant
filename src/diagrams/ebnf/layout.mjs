/** @module diagrams/ebnf/layout */
import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutRailroadDiagram } from "../shared/railroad_runtime.mjs";
/** @public */
export class EbnfDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "elkRailroad", layout: layoutRailroadDiagram });
  }
}
/** @public */
export const ebnfDiagramLayout = new EbnfDiagramLayout();
