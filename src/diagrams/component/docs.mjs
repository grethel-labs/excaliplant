/**
 * Component diagram documentation contract.
 * @module diagrams/component/docs
 */

import { BaseModuleDocs } from "../base/docs.mjs";

/** @public */
export class ComponentDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: [
        "basic",
        "containers",
        "lollipop-interface",
        "queue",
        "artifact",
        "ports",
        "notes-on-link",
        "styling",
        "links",
        "security",
      ],
      generatedPages: [],
      knownGaps: [
        "component-body-port-blocks",
        "style-block-cascade",
        "hidden-edges",
        "legend-header-footer-rendering",
      ],
    });
  }
}

/** @public */
export const componentDiagramDocs = new ComponentDiagramDocs();
