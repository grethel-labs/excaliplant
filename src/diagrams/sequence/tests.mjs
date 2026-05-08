/**
 * Sequence diagram test contract.
 * @module diagrams/sequence/tests
 */

import { BaseModuleTests } from "../base/tests.mjs";

/** @public */
export class SequenceDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/sequence/tests/sequence_components.test.mjs"],
      integration: ["tests/plantuml.test.mjs", "tests/functional_more.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}

/** @public */
export const sequenceDiagramTests = new SequenceDiagramTests();
