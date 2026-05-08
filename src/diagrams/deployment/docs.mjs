/**
 * Deployment diagram documentation contract.
 * @module diagrams/deployment/docs
 */

import { BaseModuleDocs } from "../base/docs.mjs";

/** @public */
export class DeploymentDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: [
        "basic-node",
        "nested-containers",
        "all-shapes",
        "ports",
        "arrow-styles",
        "json-mixing",
      ],
      generatedPages: ["docs/deployment-components.md"],
      knownGaps: [
        "json-mixing-full-support",
        "advanced-styling-cascade",
        "deployment-specific-skinparams",
      ],
    });
  }
}

/** @public */
export const deploymentDiagramDocs = new DeploymentDiagramDocs();
