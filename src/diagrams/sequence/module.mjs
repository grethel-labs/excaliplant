/**
 * Built-in sequence diagram module.
 * @module diagrams/sequence/module
 */

import { TimelineModuleBase } from "../base/module.mjs";
import { sequenceDiagramAssets } from "./assets.mjs";
import { sequenceDiagramDocs } from "./docs.mjs";
import { sequenceDiagramLayout } from "./layout.mjs";
import { sequenceDiagramParser } from "./parser.mjs";
import { sequenceDiagramRenderer } from "./render.mjs";
import { sequenceDiagramSecurity } from "./security.mjs";
import { sequenceDiagramTests } from "./tests.mjs";

/** @public */
export class SequenceDiagramModule extends TimelineModuleBase {
  constructor() {
    super({
      kind: "sequence",
      artifactRoot: "src/diagrams/sequence",
      ownedArtifacts: {
        parser: [
          "src/diagrams/sequence/parser.mjs",
          "src/diagrams/sequence/plugins/advanced.mjs",
          "src/diagrams/sequence/plugins/fragments.mjs",
          "src/diagrams/sequence/plugins/messages.mjs",
          "src/diagrams/sequence/plugins/notes.mjs",
          "src/diagrams/sequence/plugins/participants.mjs",
          "src/diagrams/sequence/plugins/preamble.mjs",
        ],
        model: ["src/diagrams/sequence/context.mjs", "src/general/model/diagram.mjs"],
        style: [],
        layout: [
          "src/diagrams/sequence/layout.mjs",
          "src/diagrams/sequence/layout_engine.mjs",
          "src/diagrams/sequence/spacing.mjs",
        ],
        render: ["src/diagrams/sequence/render.mjs", "src/diagrams/sequence/render_excalidraw.mjs"],
        security: ["src/diagrams/sequence/security.mjs"],
        assets: ["src/diagrams/sequence/assets.mjs"],
        docs: [
          "src/diagrams/sequence/docs.mjs",
          "src/diagrams/sequence/docs/coverage_examples.mjs",
          "docs/sequence-components.md",
        ],
        tests: [
          "src/diagrams/sequence/tests.mjs",
          "src/diagrams/sequence/tests/output.mjs",
          "src/diagrams/sequence/tests/sequence_components.test.mjs",
        ],
      },
      startDirectives: ["@startuml"],
      parser: sequenceDiagramParser,
      layout: sequenceDiagramLayout,
      renderer: sequenceDiagramRenderer,
      docs: sequenceDiagramDocs,
      tests: sequenceDiagramTests,
      security: sequenceDiagramSecurity,
      assets: sequenceDiagramAssets,
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
          kind: "arrow-base",
          versionRange: "^1.0.0",
          capabilities: ["diagram-arrow"],
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
export const sequenceDiagramModule = new SequenceDiagramModule();
