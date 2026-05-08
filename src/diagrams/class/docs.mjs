/**
 * Class diagram documentation contract.
 * @module diagrams/class/docs
 */

import { BaseModuleDocs } from "../base/docs.mjs";

/** @public */
export class ClassDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: [
        "basic",
        "interface",
        "enum",
        "record",
        "annotation",
        "relationships",
        "namespace-generics",
        "notes-on-link",
        "association-filters",
        "styling",
        "security",
      ],
      generatedPages: [],
      knownGaps: [
        "association-class-edge-anchor-rendering",
        "advanced-hide-show-filters",
        "style-block-cascade",
        "visibility-icons",
      ],
    });
  }
}

/** @public */
export const classDiagramDocs = new ClassDiagramDocs();
