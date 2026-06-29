/** @module diagrams/ie/tests */
import { BaseModuleTests } from "../base/tests.mjs";
/** @public */
export class IeDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/ie/tests/ie_components.test.mjs"],
      integration: ["tests/plantuml.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}
/** @public */
export const ieDiagramTests = new IeDiagramTests();
