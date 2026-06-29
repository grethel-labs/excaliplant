/** @module diagrams/salt/module */
import { GraphModuleBase } from "../base/module.mjs";
import { saltDiagramAssets } from "./assets.mjs";
import { saltDiagramDocs } from "./docs.mjs";
import { saltDiagramLayout } from "./layout.mjs";
import { saltDiagramParser } from "./parser.mjs";
import { saltDiagramRenderer } from "./render.mjs";
import { saltDiagramSecurity } from "./security.mjs";
import { saltDiagramTests } from "./tests.mjs";
/** @public */
export class SaltDiagramModule extends GraphModuleBase {
  constructor() {
    super({
      kind: "salt",
      artifactRoot: "src/diagrams/salt",
      startDirectives: ["@startsalt"],
      parser: saltDiagramParser,
      layout: saltDiagramLayout,
      renderer: saltDiagramRenderer,
      docs: saltDiagramDocs,
      tests: saltDiagramTests,
      security: saltDiagramSecurity,
      assets: saltDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/salt/parser.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/salt/layout.mjs"],
        render: ["src/diagrams/salt/render.mjs"],
        security: ["src/diagrams/salt/security.mjs"],
        assets: ["src/diagrams/salt/assets.mjs"],
        docs: ["src/diagrams/salt/docs.mjs", "src/diagrams/salt/docs/coverage_examples.mjs"],
        tests: ["src/diagrams/salt/tests.mjs", "src/diagrams/salt/tests/salt_components.test.mjs"],
      },
    });
  }
}
/** @public */
export const saltDiagramModule = new SaltDiagramModule();
