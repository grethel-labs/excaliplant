/** @module diagrams/chronology/layout */
import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutPlanningDiagram } from "../shared/planning_runtime.mjs";

/** @public */
export const chronologyDiagramLayout = new BaseModuleLayout({
  layoutStrategy: "elk-layered",
  layout: layoutPlanningDiagram,
});
/** @public */
export const ChronologyDiagramLayout = chronologyDiagramLayout;
