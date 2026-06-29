/** @module diagrams/chronology/module */
import { TimelineModuleBase } from "../base/module.mjs";
import { chronologyDiagramAssets } from "./assets.mjs";
import { chronologyDiagramDocs } from "./docs.mjs";
import { chronologyDiagramLayout } from "./layout.mjs";
import { chronologyDiagramParser } from "./parser.mjs";
import { chronologyDiagramRenderer } from "./render.mjs";
import { chronologyDiagramSecurity } from "./security.mjs";
import { chronologyDiagramTests } from "./tests.mjs";

/** @public */
export class ChronologyDiagramModule extends TimelineModuleBase {
  constructor() {
    super({
      kind: "chronology",
      artifactRoot: "src/diagrams/chronology",
      startDirectives: ["@startchronology"],
      parser: chronologyDiagramParser,
      layout: chronologyDiagramLayout,
      renderer: chronologyDiagramRenderer,
      docs: chronologyDiagramDocs,
      tests: chronologyDiagramTests,
      security: chronologyDiagramSecurity,
      assets: chronologyDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/chronology/parser.mjs", "src/diagrams/shared/planning_runtime.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/chronology/layout.mjs"],
        render: ["src/diagrams/chronology/render.mjs"],
        security: ["src/diagrams/chronology/security.mjs"],
        assets: ["src/diagrams/chronology/assets.mjs"],
        docs: [
          "src/diagrams/chronology/docs.mjs",
          "src/diagrams/chronology/docs/coverage_examples.mjs",
        ],
        tests: [
          "src/diagrams/chronology/tests.mjs",
          "src/diagrams/chronology/tests/chronology_components.test.mjs",
        ],
      },
    });
  }
}
/** @public */
export const chronologyDiagramModule = new ChronologyDiagramModule();
