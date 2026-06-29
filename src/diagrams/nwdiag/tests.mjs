/** @module diagrams/nwdiag/tests */
import { BaseModuleTests } from "../base/tests.mjs";
/** @public */
export class NwdiagDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/nwdiag/tests/nwdiag_components.test.mjs"],
      integration: ["tests/plantuml.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}
/** @public */
export const nwdiagDiagramTests = new NwdiagDiagramTests();
