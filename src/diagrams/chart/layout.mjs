/** @module diagrams/chart/layout */
import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutSpecialDiagram } from "../shared/special_runtime.mjs";
/** @public */
export const chartDiagramLayout = new BaseModuleLayout({
  layoutStrategy: "elk-layered",
  layout: layoutSpecialDiagram,
});
/** @public */
export const ChartDiagramLayout = chartDiagramLayout;
