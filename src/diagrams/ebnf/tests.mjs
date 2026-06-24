/** @module diagrams/ebnf/tests */
import { BaseModuleTests } from "../base/tests.mjs";
/** @public */
export class EbnfDiagramTests extends BaseModuleTests {}
/** @public */
export const ebnfDiagramTests = new EbnfDiagramTests({
  unit: ["src/diagrams/ebnf/tests/ebnf_components.test.mjs"],
  integration: ["tests/plantuml.test.mjs"],
  security: ["tests/security.test.mjs"],
});
