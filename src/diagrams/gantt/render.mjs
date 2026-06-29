/** @module diagrams/gantt/render */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { planningRenderers } from "../shared/planning_runtime.mjs";
/** @public */
export const GANTT_RENDERERS = planningRenderers;
/** @public */
export class GanttDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: GANTT_RENDERERS });
  }
}
/** @public */
export const ganttDiagramRenderer = new GanttDiagramRenderer();
