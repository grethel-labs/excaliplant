/** @module diagrams/wbs/tests */
import { BaseModuleTests } from "../base/tests.mjs";
/** @public */
export class WbsDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/wbs/tests/wbs_components.test.mjs"],
      integration: ["tests/plantuml.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}
/** @public */
export const wbsDiagramTests = new WbsDiagramTests();
