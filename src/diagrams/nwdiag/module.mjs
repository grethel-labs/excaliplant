/** @module diagrams/nwdiag/module */
import { GraphModuleBase } from "../base/module.mjs";
import { nwdiagDiagramAssets } from "./assets.mjs";
import { nwdiagDiagramDocs } from "./docs.mjs";
import { nwdiagDiagramLayout } from "./layout.mjs";
import { nwdiagDiagramParser } from "./parser.mjs";
import { nwdiagDiagramRenderer } from "./render.mjs";
import { nwdiagDiagramSecurity } from "./security.mjs";
import { nwdiagDiagramTests } from "./tests.mjs";
/** @public */
export class NwdiagDiagramModule extends GraphModuleBase {
  constructor() {
    super({
      kind: "nwdiag",
      artifactRoot: "src/diagrams/nwdiag",
      startDirectives: ["@startnwdiag"],
      parser: nwdiagDiagramParser,
      layout: nwdiagDiagramLayout,
      renderer: nwdiagDiagramRenderer,
      docs: nwdiagDiagramDocs,
      tests: nwdiagDiagramTests,
      security: nwdiagDiagramSecurity,
      assets: nwdiagDiagramAssets,
      ownedArtifacts: {
        parser: ["src/diagrams/nwdiag/parser.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/nwdiag/layout.mjs"],
        render: ["src/diagrams/nwdiag/render.mjs"],
        security: ["src/diagrams/nwdiag/security.mjs"],
        assets: ["src/diagrams/nwdiag/assets.mjs"],
        docs: ["src/diagrams/nwdiag/docs.mjs", "src/diagrams/nwdiag/docs/coverage_examples.mjs"],
        tests: [
          "src/diagrams/nwdiag/tests.mjs",
          "src/diagrams/nwdiag/tests/nwdiag_components.test.mjs",
        ],
      },
    });
  }
}
/** @public */
export const nwdiagDiagramModule = new NwdiagDiagramModule();
