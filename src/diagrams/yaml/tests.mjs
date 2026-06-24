/** @module diagrams/yaml/tests */
import { BaseModuleTests } from "../base/tests.mjs";
/** @public */
export class YamlDiagramTests extends BaseModuleTests {}
/** @public */
export const yamlDiagramTests = new YamlDiagramTests({
  unit: ["src/diagrams/yaml/tests/yaml_components.test.mjs"],
  integration: ["tests/plantuml.test.mjs"],
  security: ["tests/security.test.mjs"],
});
