/** @module diagrams/wbs/docs */
import { BaseModuleDocs } from "../base/docs.mjs";
/** @public */
export class WbsDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["orgmode", "arithmetic"],
      generatedPages: [],
      knownGaps: ["extra cross-tree arrows", "boxless exact PlantUML styling"],
    });
  }
}
/** @public */
export const wbsDiagramDocs = new WbsDiagramDocs();
