/**
 * Built-in object diagram module.
 * @module diagrams/object/module
 */

import { GraphModuleBase } from "../base/module.mjs";
import { objectDiagramAssets } from "./assets.mjs";
import { objectDiagramDocs } from "./docs.mjs";
import { objectDiagramLayout } from "./layout.mjs";
import { objectDiagramParser } from "./parser.mjs";
import { objectDiagramRenderer } from "./render.mjs";
import { objectDiagramSecurity } from "./security.mjs";
import { objectDiagramTests } from "./tests.mjs";

/** @public */
export class ObjectDiagramModule extends GraphModuleBase {
  constructor() {
    super({
      kind: "object",
      artifactRoot: "src/diagrams/object",
      ownedArtifacts: {
        parser: [
          "src/diagrams/object/parser.mjs",
          "src/diagrams/object/plugins/syntax.mjs",
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
        layout: ["src/diagrams/object/layout.mjs"],
        render: ["src/diagrams/object/render.mjs", "src/general/render/excalidraw.mjs"],
        security: ["src/diagrams/object/security.mjs"],
        assets: ["src/diagrams/object/assets.mjs"],
        docs: ["src/diagrams/object/docs.mjs", "src/diagrams/object/docs/coverage_examples.mjs"],
        tests: [
          "src/diagrams/object/tests.mjs",
          "src/diagrams/object/tests/object_components.test.mjs",
          "src/diagrams/object/tests/output.mjs",
          "tests/object_components.test.mjs",
        ],
      },
      startDirectives: ["@startobject"],
      parser: objectDiagramParser,
      layout: objectDiagramLayout,
      renderer: objectDiagramRenderer,
      docs: objectDiagramDocs,
      tests: objectDiagramTests,
      security: objectDiagramSecurity,
      assets: objectDiagramAssets,
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
export const objectDiagramModule = new ObjectDiagramModule();
