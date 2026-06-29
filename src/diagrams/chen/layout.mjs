/** @module diagrams/chen/layout */
import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutErDiagram } from "../shared/er_runtime.mjs";

/** @public */
export const chenDiagramLayout = new BaseModuleLayout({
  layoutStrategy: "elk-layered",
  layout: layoutErDiagram,
});
/** @public */
export const ChenDiagramLayout = chenDiagramLayout;
