/**
 * Component diagram documentation contract.
 * @module diagrams/component/docs
 */

import { BaseModuleDocs } from "../base/docs.mjs";

/** @public */
export class ComponentDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["basic", "containers", "styling", "links", "security"],
      generatedPages: [],
      knownGaps: ["full-component-coverage"],
    });
  }
}

/** @public */
export const componentDiagramDocs = new ComponentDiagramDocs();
