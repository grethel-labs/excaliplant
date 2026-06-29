/** @module diagrams/chen/module */
import { GraphModuleBase } from "../base/module.mjs";
import { chenDiagramAssets } from "./assets.mjs";
import { chenDiagramDocs } from "./docs.mjs";
import { chenDiagramLayout } from "./layout.mjs";
import { chenDiagramParser } from "./parser.mjs";
import { chenDiagramRenderer } from "./render.mjs";
import { chenDiagramSecurity } from "./security.mjs";
import { chenDiagramTests } from "./tests.mjs";

/** @public */
export class ChenDiagramModule extends GraphModuleBase {
  constructor() {
    super({
      kind: "chen",
      artifactRoot: "src/diagrams/chen",
      startDirectives: ["@startchen"],
      parser: chenDiagramParser,
      layout: chenDiagramLayout,
      renderer: chenDiagramRenderer,
      docs: chenDiagramDocs,
      tests: chenDiagramTests,
      security: chenDiagramSecurity,
      assets: chenDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/chen/parser.mjs", "src/diagrams/shared/er_runtime.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/chen/layout.mjs"],
        render: ["src/diagrams/chen/render.mjs"],
        security: ["src/diagrams/chen/security.mjs"],
        assets: ["src/diagrams/chen/assets.mjs"],
        docs: ["src/diagrams/chen/docs.mjs", "src/diagrams/chen/docs/coverage_examples.mjs"],
        tests: ["src/diagrams/chen/tests.mjs", "src/diagrams/chen/tests/chen_components.test.mjs"],
      },
    });
  }
}
/** @public */
export const chenDiagramModule = new ChenDiagramModule();
