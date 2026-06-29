/** @module diagrams/chronology/tests */
import { BaseModuleTests } from "../base/tests.mjs";

/** @public */
export class ChronologyDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/chronology/tests/chronology_components.test.mjs"],
      integration: ["tests/plantuml.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}
/** @public */
export const chronologyDiagramTests = new ChronologyDiagramTests();
