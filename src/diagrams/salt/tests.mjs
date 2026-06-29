/** @module diagrams/salt/tests */
import { BaseModuleTests } from "../base/tests.mjs";
/** @public */
export class SaltDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/salt/tests/salt_components.test.mjs"],
      integration: ["tests/plantuml.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}
/** @public */
export const saltDiagramTests = new SaltDiagramTests();
