/**
 * Built-in timing diagram module.
 * @module diagrams/timing/module
 */

import { TimelineModuleBase } from "../base/module.mjs";
import { timingDiagramAssets } from "./assets.mjs";
import { timingDiagramDocs } from "./docs.mjs";
import { timingDiagramLayout } from "./layout.mjs";
import { timingDiagramParser } from "./parser.mjs";
import { timingDiagramRenderer } from "./render.mjs";
import { timingDiagramSecurity } from "./security.mjs";
import { timingDiagramTests } from "./tests.mjs";

/** @public */
export class TimingDiagramModule extends TimelineModuleBase {
  constructor() {
    super({
      kind: "timing",
      artifactRoot: "src/diagrams/timing",
      ownedArtifacts: {
        parser: ["src/diagrams/timing/parser.mjs", "src/diagrams/timing/plugins/syntax.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/timing/layout.mjs"],
        render: ["src/diagrams/timing/render.mjs", "src/diagrams/timing/render_excalidraw.mjs"],
        security: ["src/diagrams/timing/security.mjs"],
        assets: ["src/diagrams/timing/assets.mjs"],
        docs: ["src/diagrams/timing/docs.mjs", "src/diagrams/timing/docs/coverage_examples.mjs"],
        tests: [
          "src/diagrams/timing/tests.mjs",
          "src/diagrams/timing/tests/timing_components.test.mjs",
        ],
      },
      startDirectives: ["@starttiming"],
      parser: timingDiagramParser,
      layout: timingDiagramLayout,
      renderer: timingDiagramRenderer,
      docs: timingDiagramDocs,
      tests: timingDiagramTests,
      security: timingDiagramSecurity,
      assets: timingDiagramAssets,
      dependencies: [
        {
          kind: "security-base",
          versionRange: "^1.0.0",
          capabilities: ["sanitize", "limits"],
          optional: false,
        },
        {
          kind: "style-base",
          versionRange: "^1.0.0",
          capabilities: ["style-cascade"],
          optional: false,
        },
        {
          kind: "text-base",
          versionRange: "^1.0.0",
          capabilities: ["inline-text"],
          optional: false,
        },
        {
          kind: "asset-base",
          versionRange: "^1.0.0",
          capabilities: ["packaged-assets"],
          optional: false,
        },
      ],
    });
  }
}

/** @public */
export const timingDiagramModule = new TimingDiagramModule();
