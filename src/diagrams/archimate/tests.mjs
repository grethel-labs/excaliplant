/** @module diagrams/archimate/tests */
import { BaseModuleTests } from "../base/tests.mjs";
/** @public */
export class ArchimateDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/archimate/tests/archimate_components.test.mjs"],
      integration: ["tests/plantuml.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}
/** @public */
export const archimateDiagramTests = new ArchimateDiagramTests();
