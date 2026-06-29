/** @module diagrams/files/module */
import { TreeModuleBase } from "../base/module.mjs";
import { filesDiagramAssets } from "./assets.mjs";
import { filesDiagramDocs } from "./docs.mjs";
import { filesDiagramLayout } from "./layout.mjs";
import { filesDiagramParser } from "./parser.mjs";
import { filesDiagramRenderer } from "./render.mjs";
import { filesDiagramSecurity } from "./security.mjs";
import { filesDiagramTests } from "./tests.mjs";
/** @public */
export class FilesDiagramModule extends TreeModuleBase {
  constructor() {
    super({
      kind: "files",
      artifactRoot: "src/diagrams/files",
      startDirectives: ["@startfiles"],
      parser: filesDiagramParser,
      layout: filesDiagramLayout,
      renderer: filesDiagramRenderer,
      docs: filesDiagramDocs,
      tests: filesDiagramTests,
      security: filesDiagramSecurity,
      assets: filesDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/files/parser.mjs", "src/diagrams/shared/tree_runtime.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/files/layout.mjs"],
        render: ["src/diagrams/files/render.mjs"],
        security: ["src/diagrams/files/security.mjs"],
        assets: ["src/diagrams/files/assets.mjs"],
        docs: ["src/diagrams/files/docs.mjs", "src/diagrams/files/docs/coverage_examples.mjs"],
        tests: [
          "src/diagrams/files/tests.mjs",
          "src/diagrams/files/tests/files_components.test.mjs",
        ],
      },
    });
  }
}
/** @public */
export const filesDiagramModule = new FilesDiagramModule();
