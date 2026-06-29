/** @module diagrams/math/module */
import { GraphModuleBase } from "../base/module.mjs";
import { mathDiagramAssets } from "./assets.mjs";
import { mathDiagramDocs } from "./docs.mjs";
import { mathDiagramLayout } from "./layout.mjs";
import { mathDiagramParser } from "./parser.mjs";
import { mathDiagramRenderer } from "./render.mjs";
import { mathDiagramSecurity } from "./security.mjs";
import { mathDiagramTests } from "./tests.mjs";
/** @public */
export class MathDiagramModule extends GraphModuleBase {
  constructor() {
    super({
      kind: "math",
      artifactRoot: "src/diagrams/math",
      startDirectives: ["@startmath", "@startlatex"],
      parser: mathDiagramParser,
      layout: mathDiagramLayout,
      renderer: mathDiagramRenderer,
      docs: mathDiagramDocs,
      tests: mathDiagramTests,
      security: mathDiagramSecurity,
      assets: mathDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/math/parser.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/math/layout.mjs"],
        render: ["src/diagrams/math/render.mjs"],
        security: ["src/diagrams/math/security.mjs"],
        assets: ["src/diagrams/math/assets.mjs"],
        docs: ["src/diagrams/math/docs.mjs", "src/diagrams/math/docs/coverage_examples.mjs"],
        tests: ["src/diagrams/math/tests.mjs", "src/diagrams/math/tests/math_components.test.mjs"],
      },
    });
  }
}
/** @public */
export const mathDiagramModule = new MathDiagramModule();
