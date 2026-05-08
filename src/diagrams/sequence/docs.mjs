/**
 * Sequence diagram documentation contract.
 * @module diagrams/sequence/docs
 */

import { BaseModuleDocs } from "../base/docs.mjs";

/** @public */
export class SequenceDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["basic", "fragments", "lifecycle", "styling", "security"],
      generatedPages: ["docs/sequence-components.md"],
      knownGaps: [],
    });
  }
}

/** @public */
export const sequenceDiagramDocs = new SequenceDiagramDocs();
