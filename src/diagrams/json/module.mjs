/** @module diagrams/json/module */
import { DataModuleBase } from "../base/module.mjs";
import { jsonDiagramAssets } from "./assets.mjs";
import { jsonDiagramDocs } from "./docs.mjs";
import { jsonDiagramLayout } from "./layout.mjs";
import { jsonDiagramParser } from "./parser.mjs";
import { jsonDiagramRenderer } from "./render.mjs";
import { jsonDiagramSecurity } from "./security.mjs";
import { jsonDiagramTests } from "./tests.mjs";
/** @public */
export class JsonDiagramModule extends DataModuleBase {
  constructor() {
    super({
      kind: "json",
      artifactRoot: "src/diagrams/json",
      startDirectives: ["@startjson"],
      parser: jsonDiagramParser,
      layout: jsonDiagramLayout,
      renderer: jsonDiagramRenderer,
      docs: jsonDiagramDocs,
      tests: jsonDiagramTests,
      security: jsonDiagramSecurity,
      assets: jsonDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/json/parser.mjs", "src/diagrams/shared/data_runtime.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/json/layout.mjs"],
        render: ["src/diagrams/json/render.mjs"],
        security: ["src/diagrams/json/security.mjs"],
        assets: ["src/diagrams/json/assets.mjs"],
        docs: ["src/diagrams/json/docs.mjs", "src/diagrams/json/docs/coverage_examples.mjs"],
        tests: ["src/diagrams/json/tests.mjs", "src/diagrams/json/tests/json_components.test.mjs"],
      },
    });
  }
}
/** @public */
export const jsonDiagramModule = new JsonDiagramModule();
