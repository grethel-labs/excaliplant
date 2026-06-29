/** @module diagrams/ie/docs */
import { BaseModuleDocs } from "../base/docs.mjs";
/** @public */
export class IeDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["crow-foot-relationships", "entity-attributes"],
      generatedPages: [],
      knownGaps: ["custom crow-foot glyph rendering beyond endpoint labels"],
    });
  }
}
/** @public */
export const ieDiagramDocs = new IeDiagramDocs();
