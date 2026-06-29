/** @module diagrams/chart/docs */
import { BaseModuleDocs } from "../base/docs.mjs";
/** @public */
export class ChartDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["single-bar", "grouped"],
      generatedPages: [],
      knownGaps: ["native scaled chart primitives", "secondary axis drawing"],
    });
  }
}
/** @public */
export const chartDiagramDocs = new ChartDiagramDocs();
