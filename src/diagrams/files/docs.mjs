/** @module diagrams/files/docs */
import { BaseModuleDocs } from "../base/docs.mjs";
/** @public */
export class FilesDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["project-tree", "merged-paths"],
      generatedPages: [],
      knownGaps: ["note attachment fidelity"],
    });
  }
}
/** @public */
export const filesDiagramDocs = new FilesDiagramDocs();
