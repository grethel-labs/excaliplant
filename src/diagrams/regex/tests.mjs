/** @module diagrams/regex/tests */
import { BaseModuleTests } from "../base/tests.mjs";
/** @public */
export class RegexDiagramTests extends BaseModuleTests {}
/** @public */
export const regexDiagramTests = new RegexDiagramTests({
  unit: ["src/diagrams/regex/tests/regex_components.test.mjs"],
  integration: ["tests/plantuml.test.mjs"],
  security: ["tests/security.test.mjs"],
});
