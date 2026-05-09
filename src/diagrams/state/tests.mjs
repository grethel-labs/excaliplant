/**
 * State diagram test manifest.
 * @module diagrams/state/tests
 */

import { BaseModuleTests } from "../base/tests.mjs";

/** @public */
export class StateDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/state/tests/state_components.test.mjs"],
      integration: ["tests/state_components.test.mjs", "tests/plantuml.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}

/** @public */
export const stateDiagramTests = new StateDiagramTests();
