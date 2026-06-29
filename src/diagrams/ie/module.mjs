/** @module diagrams/ie/module */
import { GraphModuleBase } from "../base/module.mjs";
import { ieDiagramAssets } from "./assets.mjs";
import { ieDiagramDocs } from "./docs.mjs";
import { ieDiagramLayout } from "./layout.mjs";
import { ieDiagramParser } from "./parser.mjs";
import { ieDiagramRenderer } from "./render.mjs";
import { ieDiagramSecurity } from "./security.mjs";
import { ieDiagramTests } from "./tests.mjs";

/** @public */
export class IeDiagramModule extends GraphModuleBase {
  constructor() {
    super({
      kind: "ie",
      artifactRoot: "src/diagrams/ie",
      startDirectives: ["@startuml"],
      parser: ieDiagramParser,
      layout: ieDiagramLayout,
      renderer: ieDiagramRenderer,
      docs: ieDiagramDocs,
      tests: ieDiagramTests,
      security: ieDiagramSecurity,
      assets: ieDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/ie/parser.mjs", "src/diagrams/shared/er_runtime.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/ie/layout.mjs"],
        render: ["src/diagrams/ie/render.mjs"],
        security: ["src/diagrams/ie/security.mjs"],
        assets: ["src/diagrams/ie/assets.mjs"],
        docs: ["src/diagrams/ie/docs.mjs", "src/diagrams/ie/docs/coverage_examples.mjs"],
        tests: ["src/diagrams/ie/tests.mjs", "src/diagrams/ie/tests/ie_components.test.mjs"],
      },
    });
  }
}
/** @public */
export const ieDiagramModule = new IeDiagramModule();
