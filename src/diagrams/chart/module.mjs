/** @module diagrams/chart/module */
import { GraphModuleBase } from "../base/module.mjs";
import { chartDiagramAssets } from "./assets.mjs";
import { chartDiagramDocs } from "./docs.mjs";
import { chartDiagramLayout } from "./layout.mjs";
import { chartDiagramParser } from "./parser.mjs";
import { chartDiagramRenderer } from "./render.mjs";
import { chartDiagramSecurity } from "./security.mjs";
import { chartDiagramTests } from "./tests.mjs";
/** @public */
export class ChartDiagramModule extends GraphModuleBase {
  constructor() {
    super({
      kind: "chart",
      artifactRoot: "src/diagrams/chart",
      startDirectives: ["@startchart"],
      parser: chartDiagramParser,
      layout: chartDiagramLayout,
      renderer: chartDiagramRenderer,
      docs: chartDiagramDocs,
      tests: chartDiagramTests,
      security: chartDiagramSecurity,
      assets: chartDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/chart/parser.mjs", "src/diagrams/shared/special_runtime.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/chart/layout.mjs"],
        render: ["src/diagrams/chart/render.mjs"],
        security: ["src/diagrams/chart/security.mjs"],
        assets: ["src/diagrams/chart/assets.mjs"],
        docs: ["src/diagrams/chart/docs.mjs", "src/diagrams/chart/docs/coverage_examples.mjs"],
        tests: [
          "src/diagrams/chart/tests.mjs",
          "src/diagrams/chart/tests/chart_components.test.mjs",
        ],
      },
    });
  }
}
/** @public */
export const chartDiagramModule = new ChartDiagramModule();
