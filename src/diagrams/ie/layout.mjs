/** @module diagrams/ie/layout */
import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutErDiagram } from "../shared/er_runtime.mjs";

/** @public */
export const ieDiagramLayout = new BaseModuleLayout({
  layoutStrategy: "elk-layered",
  layout: layoutErDiagram,
});
/** @public */
export const IeDiagramLayout = ieDiagramLayout;
