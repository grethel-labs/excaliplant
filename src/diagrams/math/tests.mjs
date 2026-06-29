/** @module diagrams/math/tests */
import { BaseModuleTests } from "../base/tests.mjs";
/** @public */
export class MathDiagramTests extends BaseModuleTests {}
/** @public */
export const mathDiagramTests = new MathDiagramTests({
  unit: ["src/diagrams/math/tests/math_components.test.mjs"],
  integration: ["tests/plantuml.test.mjs"],
  security: ["tests/security.test.mjs"],
});
