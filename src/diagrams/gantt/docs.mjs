/** @module diagrams/gantt/docs */
import { BaseModuleDocs } from "../base/docs.mjs";
/** @public */
export class GanttDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["durations", "dated-starts"],
      generatedPages: [],
      knownGaps: ["working-day calendar arithmetic", "resource swimlane rendering"],
    });
  }
}
/** @public */
export const ganttDiagramDocs = new GanttDiagramDocs();
