/** @module diagrams/chen/docs */
import { BaseModuleDocs } from "../base/docs.mjs";
/** @public */
export class ChenDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["basic-relationship", "direction"],
      generatedPages: [],
      knownGaps: ["native double-oval and weak-entity line styling"],
    });
  }
}
/** @public */
export const chenDiagramDocs = new ChenDiagramDocs();
