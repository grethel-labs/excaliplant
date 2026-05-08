/**
 * Class diagram test contract.
 * @module diagrams/class/tests
 */

import { BaseModuleTests } from "../base/tests.mjs";

/** @public */
export class ClassDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["tests/edge_cases.test.mjs"],
      integration: ["tests/plantuml.test.mjs", "tests/functional_more.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}

/** @public */
export const classDiagramTests = new ClassDiagramTests();
