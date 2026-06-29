/** @module diagrams/archimate/module */
import { GraphModuleBase } from "../base/module.mjs";
import { archimateDiagramAssets } from "./assets.mjs";
import { archimateDiagramDocs } from "./docs.mjs";
import { archimateDiagramLayout } from "./layout.mjs";
import { archimateDiagramParser } from "./parser.mjs";
import { archimateDiagramRenderer } from "./render.mjs";
import { archimateDiagramSecurity } from "./security.mjs";
import { archimateDiagramTests } from "./tests.mjs";
/** @public */
export class ArchimateDiagramModule extends GraphModuleBase {
  constructor() {
    super({
      kind: "archimate",
      artifactRoot: "src/diagrams/archimate",
      startDirectives: ["@startuml", "@startarchimate"],
      parser: archimateDiagramParser,
      layout: archimateDiagramLayout,
      renderer: archimateDiagramRenderer,
      docs: archimateDiagramDocs,
      tests: archimateDiagramTests,
      security: archimateDiagramSecurity,
      assets: archimateDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/archimate/parser.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/archimate/layout.mjs"],
        render: ["src/diagrams/archimate/render.mjs"],
        security: ["src/diagrams/archimate/security.mjs"],
        assets: ["src/diagrams/archimate/assets.mjs"],
        docs: [
          "src/diagrams/archimate/docs.mjs",
          "src/diagrams/archimate/docs/coverage_examples.mjs",
        ],
        tests: [
          "src/diagrams/archimate/tests.mjs",
          "src/diagrams/archimate/tests/archimate_components.test.mjs",
        ],
      },
    });
  }
}
/** @public */
export const archimateDiagramModule = new ArchimateDiagramModule();
