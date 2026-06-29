/** @module diagrams/wbs/module */
import { TreeModuleBase } from "../base/module.mjs";
import { wbsDiagramAssets } from "./assets.mjs";
import { wbsDiagramDocs } from "./docs.mjs";
import { wbsDiagramLayout } from "./layout.mjs";
import { wbsDiagramParser } from "./parser.mjs";
import { wbsDiagramRenderer } from "./render.mjs";
import { wbsDiagramSecurity } from "./security.mjs";
import { wbsDiagramTests } from "./tests.mjs";
/** @public */
export class WbsDiagramModule extends TreeModuleBase {
  constructor() {
    super({
      kind: "wbs",
      artifactRoot: "src/diagrams/wbs",
      startDirectives: ["@startwbs"],
      parser: wbsDiagramParser,
      layout: wbsDiagramLayout,
      renderer: wbsDiagramRenderer,
      docs: wbsDiagramDocs,
      tests: wbsDiagramTests,
      security: wbsDiagramSecurity,
      assets: wbsDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/wbs/parser.mjs", "src/diagrams/shared/tree_runtime.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/wbs/layout.mjs"],
        render: ["src/diagrams/wbs/render.mjs"],
        security: ["src/diagrams/wbs/security.mjs"],
        assets: ["src/diagrams/wbs/assets.mjs"],
        docs: ["src/diagrams/wbs/docs.mjs", "src/diagrams/wbs/docs/coverage_examples.mjs"],
        tests: ["src/diagrams/wbs/tests.mjs", "src/diagrams/wbs/tests/wbs_components.test.mjs"],
      },
    });
  }
}
/** @public */
export const wbsDiagramModule = new WbsDiagramModule();
