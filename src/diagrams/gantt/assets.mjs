/** @module diagrams/gantt/assets */
import { BaseModuleAssets } from "../base/assets.mjs";
/** @public */
export class GanttDiagramAssets extends BaseModuleAssets {
  constructor() {
    super({ fixtures: [] });
  }
}
/** @public */
export const ganttDiagramAssets = new GanttDiagramAssets();
