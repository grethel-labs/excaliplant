/**
 * Built-in regex diagram module.
 * @module diagrams/regex/module
 */

import { GraphModuleBase } from "../base/module.mjs";
import { regexDiagramAssets } from "./assets.mjs";
import { regexDiagramDocs } from "./docs.mjs";
import { regexDiagramLayout } from "./layout.mjs";
import { regexDiagramParser } from "./parser.mjs";
import { regexDiagramRenderer } from "./render.mjs";
import { regexDiagramSecurity } from "./security.mjs";
import { regexDiagramTests } from "./tests.mjs";

/** @public */
export class RegexDiagramModule extends GraphModuleBase {
  constructor() {
    super({
      kind: "regex",
      artifactRoot: "src/diagrams/regex",
      startDirectives: ["@startregex"],
      parser: regexDiagramParser,
      layout: regexDiagramLayout,
      renderer: regexDiagramRenderer,
      docs: regexDiagramDocs,
      tests: regexDiagramTests,
      security: regexDiagramSecurity,
      assets: regexDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/regex/parser.mjs", "src/diagrams/shared/railroad_runtime.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/regex/layout.mjs"],
        render: ["src/diagrams/regex/render.mjs"],
        security: ["src/diagrams/regex/security.mjs"],
        assets: ["src/diagrams/regex/assets.mjs"],
        docs: ["src/diagrams/regex/docs.mjs", "src/diagrams/regex/docs/coverage_examples.mjs"],
        tests: [
          "src/diagrams/regex/tests.mjs",
          "src/diagrams/regex/tests/regex_components.test.mjs",
        ],
      },
    });
  }
}

/** @public */
export const regexDiagramModule = new RegexDiagramModule();
