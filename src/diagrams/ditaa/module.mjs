/** @module diagrams/ditaa/module */
import { GraphModuleBase } from "../base/module.mjs";
import { ditaaDiagramAssets } from "./assets.mjs";
import { ditaaDiagramDocs } from "./docs.mjs";
import { ditaaDiagramLayout } from "./layout.mjs";
import { ditaaDiagramParser } from "./parser.mjs";
import { ditaaDiagramRenderer } from "./render.mjs";
import { ditaaDiagramSecurity } from "./security.mjs";
import { ditaaDiagramTests } from "./tests.mjs";
/** @public */
export class DitaaDiagramModule extends GraphModuleBase {
  constructor() {
    super({
      kind: "ditaa",
      artifactRoot: "src/diagrams/ditaa",
      startDirectives: ["@startditaa"],
      parser: ditaaDiagramParser,
      layout: ditaaDiagramLayout,
      renderer: ditaaDiagramRenderer,
      docs: ditaaDiagramDocs,
      tests: ditaaDiagramTests,
      security: ditaaDiagramSecurity,
      assets: ditaaDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/ditaa/parser.mjs", "src/diagrams/shared/special_runtime.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/ditaa/layout.mjs"],
        render: ["src/diagrams/ditaa/render.mjs"],
        security: ["src/diagrams/ditaa/security.mjs"],
        assets: ["src/diagrams/ditaa/assets.mjs"],
        docs: ["src/diagrams/ditaa/docs.mjs", "src/diagrams/ditaa/docs/coverage_examples.mjs"],
        tests: [
          "src/diagrams/ditaa/tests.mjs",
          "src/diagrams/ditaa/tests/ditaa_components.test.mjs",
        ],
      },
    });
  }
}
/** @public */
export const ditaaDiagramModule = new DitaaDiagramModule();
