/** @module diagrams/archimate/docs */
import { BaseModuleDocs } from "../base/docs.mjs";
/** @public */
export class ArchimateDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["elements", "junctions"],
      generatedPages: [],
      knownGaps: ["external stdlib sprite fidelity", "full Archimate color theme parity"],
    });
  }
}
/** @public */
export const archimateDiagramDocs = new ArchimateDiagramDocs();
