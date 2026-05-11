/**
 * Built-in state diagram module.
 * @module diagrams/state/module
 */

import { GraphModuleBase } from "../base/module.mjs";
import { stateDiagramAssets } from "./assets.mjs";
import { stateDiagramDocs } from "./docs.mjs";
import { stateDiagramLayout } from "./layout.mjs";
import { stateDiagramParser } from "./parser.mjs";
import { stateDiagramRenderer } from "./render.mjs";
import { stateDiagramSecurity } from "./security.mjs";
import { stateDiagramTests } from "./tests.mjs";

/** @public */
export class StateDiagramModule extends GraphModuleBase {
  constructor() {
    super({
      kind: "state",
      artifactRoot: "src/diagrams/state",
      ownedArtifacts: {
        parser: [
          "src/diagrams/state/parser.mjs",
          "src/diagrams/state/plugins/syntax.mjs",
          "src/diagrams/shared/graph_parser.mjs",
          "src/diagrams/shared/graph_plugins/connections.mjs",
          "src/diagrams/shared/graph_plugins/containers.mjs",
          "src/diagrams/shared/graph_plugins/filters.mjs",
          "src/diagrams/shared/graph_plugins/notes.mjs",
          "src/diagrams/shared/graph_plugins/ports.mjs",
          "src/diagrams/shared/graph_plugins/preamble.mjs",
          "src/diagrams/shared/graph_plugins/shapes.mjs",
        ],
        model: ["src/diagrams/shared/graph_context.mjs", "src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/state/layout.mjs"],
        render: ["src/diagrams/state/render.mjs", "src/general/render/excalidraw.mjs"],
        security: ["src/diagrams/state/security.mjs"],
        assets: ["src/diagrams/state/assets.mjs"],
        docs: ["src/diagrams/state/docs.mjs", "src/diagrams/state/docs/coverage_examples.mjs"],
        tests: [
          "src/diagrams/state/tests.mjs",
          "src/diagrams/state/tests/state_components.test.mjs",
          "src/diagrams/state/tests/output.mjs",
          "tests/state_components.test.mjs",
        ],
      },
      startDirectives: ["@startstate"],
      parser: stateDiagramParser,
      layout: stateDiagramLayout,
      renderer: stateDiagramRenderer,
      docs: stateDiagramDocs,
      tests: stateDiagramTests,
      security: stateDiagramSecurity,
      assets: stateDiagramAssets,
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
export const stateDiagramModule = new StateDiagramModule();
