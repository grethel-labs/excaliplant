/**
 * Object diagram test contract.
 * @module diagrams/object/tests
 */

import { BaseModuleTests } from "../base/tests.mjs";

/** @public */
export class ObjectDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/object/tests/object_components.test.mjs"],
      integration: ["tests/object_components.test.mjs", "tests/plantuml.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}

/** @public */
export const objectDiagramTests = new ObjectDiagramTests();
