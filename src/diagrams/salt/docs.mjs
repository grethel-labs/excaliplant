/** @module diagrams/salt/docs */
import { BaseModuleDocs } from "../base/docs.mjs";
/** @public */
export class SaltDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["basic-controls", "textarea"],
      generatedPages: [],
      knownGaps: ["pixel-perfect PlantUML Salt table spanning", "included salt snippets"],
    });
  }
}
/** @public */
export const saltDiagramDocs = new SaltDiagramDocs();
