/** @module diagrams/mindmap/docs */
import { BaseModuleDocs } from "../base/docs.mjs";
/** @public */
export class MindmapDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["orgmode", "markdown"],
      generatedPages: [],
      knownGaps: ["radial side balancing", "boxless exact PlantUML styling"],
    });
  }
}
/** @public */
export const mindmapDiagramDocs = new MindmapDiagramDocs();
