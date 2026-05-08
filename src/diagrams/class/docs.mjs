/**
 * Class diagram documentation contract.
 * @module diagrams/class/docs
 */

import { BaseModuleDocs } from "../base/docs.mjs";

/** @public */
export class ClassDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["basic", "interface", "enum", "relationships", "styling", "security"],
      generatedPages: [],
      knownGaps: ["full-class-coverage"],
    });
  }
}

/** @public */
export const classDiagramDocs = new ClassDiagramDocs();
