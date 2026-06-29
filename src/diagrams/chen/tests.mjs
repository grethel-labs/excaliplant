/** @module diagrams/chen/tests */
import { BaseModuleTests } from "../base/tests.mjs";
/** @public */
export class ChenDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/chen/tests/chen_components.test.mjs"],
      integration: ["tests/plantuml.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}
/** @public */
export const chenDiagramTests = new ChenDiagramTests();
