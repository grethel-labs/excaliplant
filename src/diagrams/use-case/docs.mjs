/**
 * Use-case diagram documentation manifest.
 * @module diagrams/use-case/docs
 */

import { BaseModuleDocs } from "../base/docs.mjs";

/** @public */
export class UseCaseDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: [],
      generatedPages: [],
      knownGaps: [],
    });
  }
}

/** @public */
export const useCaseDiagramDocs = new UseCaseDiagramDocs();
