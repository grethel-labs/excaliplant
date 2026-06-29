/** @module diagrams/ditaa/layout */
import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutSpecialDiagram } from "../shared/special_runtime.mjs";
/** @public */
export const ditaaDiagramLayout = new BaseModuleLayout({
  layoutStrategy: "elk-layered",
  layout: layoutSpecialDiagram,
});
/** @public */
export const DitaaDiagramLayout = ditaaDiagramLayout;
