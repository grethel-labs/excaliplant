/** @module diagrams/mindmap/module */
import { TreeModuleBase } from "../base/module.mjs";
import { mindmapDiagramAssets } from "./assets.mjs";
import { mindmapDiagramDocs } from "./docs.mjs";
import { mindmapDiagramLayout } from "./layout.mjs";
import { mindmapDiagramParser } from "./parser.mjs";
import { mindmapDiagramRenderer } from "./render.mjs";
import { mindmapDiagramSecurity } from "./security.mjs";
import { mindmapDiagramTests } from "./tests.mjs";
/** @public */
export class MindmapDiagramModule extends TreeModuleBase {
  constructor() {
    super({
      kind: "mindmap",
      artifactRoot: "src/diagrams/mindmap",
      startDirectives: ["@startmindmap"],
      parser: mindmapDiagramParser,
      layout: mindmapDiagramLayout,
      renderer: mindmapDiagramRenderer,
      docs: mindmapDiagramDocs,
      tests: mindmapDiagramTests,
      security: mindmapDiagramSecurity,
      assets: mindmapDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/mindmap/parser.mjs", "src/diagrams/shared/tree_runtime.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/mindmap/layout.mjs"],
        render: ["src/diagrams/mindmap/render.mjs"],
        security: ["src/diagrams/mindmap/security.mjs"],
        assets: ["src/diagrams/mindmap/assets.mjs"],
        docs: ["src/diagrams/mindmap/docs.mjs", "src/diagrams/mindmap/docs/coverage_examples.mjs"],
        tests: [
          "src/diagrams/mindmap/tests.mjs",
          "src/diagrams/mindmap/tests/mindmap_components.test.mjs",
        ],
      },
    });
  }
}
/** @public */
export const mindmapDiagramModule = new MindmapDiagramModule();
