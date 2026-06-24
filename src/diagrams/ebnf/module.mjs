/** @module diagrams/ebnf/module */
import { GraphModuleBase } from "../base/module.mjs";
import { ebnfDiagramAssets } from "./assets.mjs";
import { ebnfDiagramDocs } from "./docs.mjs";
import { ebnfDiagramLayout } from "./layout.mjs";
import { ebnfDiagramParser } from "./parser.mjs";
import { ebnfDiagramRenderer } from "./render.mjs";
import { ebnfDiagramSecurity } from "./security.mjs";
import { ebnfDiagramTests } from "./tests.mjs";
/** @public */
export class EbnfDiagramModule extends GraphModuleBase {
  constructor() {
    super({
      kind: "ebnf",
      artifactRoot: "src/diagrams/ebnf",
      startDirectives: ["@startebnf"],
      parser: ebnfDiagramParser,
      layout: ebnfDiagramLayout,
      renderer: ebnfDiagramRenderer,
      docs: ebnfDiagramDocs,
      tests: ebnfDiagramTests,
      security: ebnfDiagramSecurity,
      assets: ebnfDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/ebnf/parser.mjs", "src/diagrams/shared/railroad_runtime.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/ebnf/layout.mjs"],
        render: ["src/diagrams/ebnf/render.mjs"],
        security: ["src/diagrams/ebnf/security.mjs"],
        assets: ["src/diagrams/ebnf/assets.mjs"],
        docs: ["src/diagrams/ebnf/docs.mjs", "src/diagrams/ebnf/docs/coverage_examples.mjs"],
        tests: ["src/diagrams/ebnf/tests.mjs", "src/diagrams/ebnf/tests/ebnf_components.test.mjs"],
      },
    });
  }
}
/** @public */
export const ebnfDiagramModule = new EbnfDiagramModule();
