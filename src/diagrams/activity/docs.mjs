/**
 * Activity diagram documentation manifest.
 * @module diagrams/activity/docs
 */

import { BaseModuleDocs } from "../base/docs.mjs";

/**
 * Activity diagram documentation manifest.
 * @public
 */
export class ActivityDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["basic", "conditions", "loops", "parallel", "swimlanes", "legacy"],
      generatedPages: [],
      knownGaps: [],
    });
  }
}
