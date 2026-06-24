/** @module diagrams/json/tests */
import { BaseModuleTests } from "../base/tests.mjs";
/** @public */
export class JsonDiagramTests extends BaseModuleTests {}
/** @public */
export const jsonDiagramTests = new JsonDiagramTests({
  unit: ["src/diagrams/json/tests/json_components.test.mjs"],
  integration: ["tests/plantuml.test.mjs"],
  security: ["tests/security.test.mjs"],
});
