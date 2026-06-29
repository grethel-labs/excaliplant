/** @module diagrams/gantt/layout */
import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutPlanningDiagram } from "../shared/planning_runtime.mjs";
/** @public */
export class GanttDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "elkGanttTimeline", layout: layoutPlanningDiagram });
  }
}
/** @public */
export const ganttDiagramLayout = new GanttDiagramLayout();
