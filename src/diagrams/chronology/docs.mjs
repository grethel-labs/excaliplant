/** @module diagrams/chronology/docs */
import { BaseModuleDocs } from "../base/docs.mjs";

/** @public */
export class ChronologyDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["milestones", "ranges"],
      generatedPages: [],
      knownGaps: ["calendar-scale rendering", "locale-specific timeline formatting"],
    });
  }
}
/** @public */
export const chronologyDiagramDocs = new ChronologyDiagramDocs();
