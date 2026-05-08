/**
 * Built-in class diagram module.
 * @module diagrams/class/module
 */

import { GraphModuleBase } from "../base/module.mjs";
import { classDiagramAssets } from "./assets.mjs";
import { classDiagramDocs } from "./docs.mjs";
import { classDiagramLayout } from "./layout.mjs";
import { classDiagramParser } from "./parser.mjs";
import { classDiagramRenderer } from "./render.mjs";
import { classDiagramSecurity } from "./security.mjs";
import { classDiagramTests } from "./tests.mjs";

/** @public */
export class ClassDiagramModule extends GraphModuleBase {
  constructor() {
    super({
      kind: "class",
      artifactRoot: "src/diagrams/class",
      ownedArtifacts: {
        parser: [
          "src/diagrams/class/parser.mjs",
          "src/diagrams/shared/graph_parser.mjs",
          "src/diagrams/shared/graph_plugins/class_block.mjs",
          "src/diagrams/shared/graph_plugins/connections.mjs",
          "src/diagrams/shared/graph_plugins/containers.mjs",
          "src/diagrams/shared/graph_plugins/notes.mjs",
          "src/diagrams/shared/graph_plugins/preamble.mjs",
          "src/diagrams/shared/graph_plugins/shapes.mjs",
        ],
        model: ["src/diagrams/shared/graph_context.mjs", "src/general/model/diagram.mjs"],
        style: ["src/diagrams/class/style.mjs"],
        layout: ["src/diagrams/class/layout.mjs"],
        render: ["src/diagrams/class/render.mjs"],
        security: ["src/diagrams/class/security.mjs"],
        assets: ["src/diagrams/class/assets.mjs"],
        docs: ["src/diagrams/class/docs.mjs"],
        tests: ["src/diagrams/class/tests.mjs", "tests/edge_cases.test.mjs"],
      },
      startDirectives: ["@startclass"],
      parser: classDiagramParser,
      layout: classDiagramLayout,
      renderer: classDiagramRenderer,
      docs: classDiagramDocs,
      tests: classDiagramTests,
      security: classDiagramSecurity,
      assets: classDiagramAssets,
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
        {
          kind: "graph-structure",
          versionRange: "^1.0.0",
          capabilities: ["boxes", "containers", "connections"],
          optional: false,
        },
      ],
    });
  }
}

/** @public */
export const classDiagramModule = new ClassDiagramModule();
