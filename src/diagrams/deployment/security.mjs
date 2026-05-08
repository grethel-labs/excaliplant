/**
 * Deployment diagram security contract.
 * @module diagrams/deployment/security
 */

import { BaseModuleSecurity } from "../base/security.mjs";

/** @public */
export class DeploymentDiagramSecurity extends BaseModuleSecurity {
  constructor() {
    super({
      capabilities: ["sanitize", "limits", "inline-text", "diagram-arrow"],
      securityTestCases: ["deployment-xss", "deployment-limits", "deployment-prototype-pollution"],
    });
  }
}

/** @public */
export const deploymentDiagramSecurity = new DeploymentDiagramSecurity();
