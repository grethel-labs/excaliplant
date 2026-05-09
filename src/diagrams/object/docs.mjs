/**
 * Object diagram documentation contract.
 * @module diagrams/object/docs
 */

import { BaseModuleDocs } from "../base/docs.mjs";

/** @public */
export class ObjectDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["objects", "maps", "diamonds", "relationships", "notes"],
      generatedPages: [],
      knownGaps: ["json-block-mixing", "object-title-underlining"],
    });
  }
}

/** @public */
export const objectDiagramDocs = new ObjectDiagramDocs();
