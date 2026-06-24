/** @module diagrams/yaml/module */
import { DataModuleBase } from "../base/module.mjs";
import { yamlDiagramAssets } from "./assets.mjs";
import { yamlDiagramDocs } from "./docs.mjs";
import { yamlDiagramLayout } from "./layout.mjs";
import { yamlDiagramParser } from "./parser.mjs";
import { yamlDiagramRenderer } from "./render.mjs";
import { yamlDiagramSecurity } from "./security.mjs";
import { yamlDiagramTests } from "./tests.mjs";
/** @public */
export class YamlDiagramModule extends DataModuleBase {
  constructor() {
    super({
      kind: "yaml",
      artifactRoot: "src/diagrams/yaml",
      startDirectives: ["@startyaml"],
      parser: yamlDiagramParser,
      layout: yamlDiagramLayout,
      renderer: yamlDiagramRenderer,
      docs: yamlDiagramDocs,
      tests: yamlDiagramTests,
      security: yamlDiagramSecurity,
      assets: yamlDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/yaml/parser.mjs", "src/diagrams/shared/data_runtime.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/yaml/layout.mjs"],
        render: ["src/diagrams/yaml/render.mjs"],
        security: ["src/diagrams/yaml/security.mjs"],
        assets: ["src/diagrams/yaml/assets.mjs"],
        docs: ["src/diagrams/yaml/docs.mjs", "src/diagrams/yaml/docs/coverage_examples.mjs"],
        tests: ["src/diagrams/yaml/tests.mjs", "src/diagrams/yaml/tests/yaml_components.test.mjs"],
      },
    });
  }
}
/** @public */
export const yamlDiagramModule = new YamlDiagramModule();
