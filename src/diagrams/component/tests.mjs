/**
 * Component diagram test contract.
 * @module diagrams/component/tests
 */

import { BaseModuleTests } from "../base/tests.mjs";

/** @public */
export class ComponentDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: [
        "src/diagrams/component/tests/component_components.test.mjs",
        "tests/edge_cases.test.mjs",
      ],
      integration: ["tests/plantuml.test.mjs", "tests/functional_more.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}

/** @public */
export const componentDiagramTests = new ComponentDiagramTests();
