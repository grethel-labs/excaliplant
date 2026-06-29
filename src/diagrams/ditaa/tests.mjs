/** @module diagrams/ditaa/tests */
import { BaseModuleTests } from "../base/tests.mjs";
/** @public */
export class DitaaDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/ditaa/tests/ditaa_components.test.mjs"],
      integration: ["tests/plantuml.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}
/** @public */
export const ditaaDiagramTests = new DitaaDiagramTests();
