/**
 * Deployment diagram test contract.
 * @module diagrams/deployment/tests
 */

import { BaseModuleTests } from "../base/tests.mjs";

/** @public */
export class DeploymentDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/deployment/tests/deployment_components.test.mjs"],
      integration: [],
      security: [],
    });
  }
}

/** @public */
export const deploymentDiagramTests = new DeploymentDiagramTests();
