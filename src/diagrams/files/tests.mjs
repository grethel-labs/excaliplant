/** @module diagrams/files/tests */
import { BaseModuleTests } from "../base/tests.mjs";
/** @public */
export class FilesDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/files/tests/files_components.test.mjs"],
      integration: ["tests/plantuml.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}
/** @public */
export const filesDiagramTests = new FilesDiagramTests();
