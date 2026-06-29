/** @module diagrams/chronology/render */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { planningRenderers } from "../shared/planning_runtime.mjs";

/** @public */
export const CHRONOLOGY_RENDERERS = planningRenderers;
/** @public */
export const chronologyDiagramRenderer = new BaseModuleRenderer({
  renderers: CHRONOLOGY_RENDERERS,
});
/** @public */
export const ChronologyDiagramRenderer = chronologyDiagramRenderer;
