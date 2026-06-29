/** @module diagrams/gantt/module */
import { TimelineModuleBase } from "../base/module.mjs";
import { ganttDiagramAssets } from "./assets.mjs";
import { ganttDiagramDocs } from "./docs.mjs";
import { ganttDiagramLayout } from "./layout.mjs";
import { ganttDiagramParser } from "./parser.mjs";
import { ganttDiagramRenderer } from "./render.mjs";
import { ganttDiagramSecurity } from "./security.mjs";
import { ganttDiagramTests } from "./tests.mjs";
/** @public */
export class GanttDiagramModule extends TimelineModuleBase {
  constructor() {
    super({
      kind: "gantt",
      artifactRoot: "src/diagrams/gantt",
      startDirectives: ["@startgantt"],
      parser: ganttDiagramParser,
      layout: ganttDiagramLayout,
      renderer: ganttDiagramRenderer,
      docs: ganttDiagramDocs,
      tests: ganttDiagramTests,
      security: ganttDiagramSecurity,
      assets: ganttDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/gantt/parser.mjs", "src/diagrams/shared/planning_runtime.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/gantt/layout.mjs"],
        render: ["src/diagrams/gantt/render.mjs"],
        security: ["src/diagrams/gantt/security.mjs"],
        assets: ["src/diagrams/gantt/assets.mjs"],
        docs: ["src/diagrams/gantt/docs.mjs", "src/diagrams/gantt/docs/coverage_examples.mjs"],
        tests: [
          "src/diagrams/gantt/tests.mjs",
          "src/diagrams/gantt/tests/gantt_components.test.mjs",
        ],
      },
    });
  }
}
/** @public */
export const ganttDiagramModule = new GanttDiagramModule();
