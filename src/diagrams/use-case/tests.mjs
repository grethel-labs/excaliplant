/**
 * Use-case diagram test manifest.
 * @module diagrams/use-case/tests
 */

import { BaseModuleTests } from "../base/tests.mjs";

/** @public */
export class UseCaseDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/use-case/tests/usecase_components.test.mjs"],
      integration: ["tests/usecase_components.test.mjs", "tests/plantuml.test.mjs"],
      security: [],
    });
  }
}

/** @public */
export const useCaseDiagramTests = new UseCaseDiagramTests();
