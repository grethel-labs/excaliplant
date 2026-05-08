/**
 * Built-in component diagram module.
 * @module diagrams/component/module
 */

import { GraphModuleBase } from "../base/module.mjs";
import { componentDiagramAssets } from "./assets.mjs";
import { componentDiagramDocs } from "./docs.mjs";
import { componentDiagramLayout } from "./layout.mjs";
import { componentDiagramParser } from "./parser.mjs";
import { componentDiagramRenderer } from "./render.mjs";
import { componentDiagramSecurity } from "./security.mjs";
import { componentDiagramTests } from "./tests.mjs";

/** @public */
export class ComponentDiagramModule extends GraphModuleBase {
  constructor() {
    super({
      kind: "component",
      artifactRoot: "src/diagrams/component",
      ownedArtifacts: {
        parser: [
          "src/diagrams/component/parser.mjs",
          "src/diagrams/shared/graph_parser.mjs",
          "src/diagrams/shared/graph_plugins/class_block.mjs",
          "src/diagrams/shared/graph_plugins/connections.mjs",
          "src/diagrams/shared/graph_plugins/containers.mjs",
          "src/diagrams/shared/graph_plugins/notes.mjs",
          "src/diagrams/shared/graph_plugins/ports.mjs",
          "src/diagrams/shared/graph_plugins/preamble.mjs",
          "src/diagrams/shared/graph_plugins/shapes.mjs",
        ],
        model: ["src/diagrams/shared/graph_context.mjs", "src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/component/layout.mjs"],
        render: ["src/diagrams/component/render.mjs"],
        security: ["src/diagrams/component/security.mjs"],
        assets: ["src/diagrams/component/assets.mjs"],
        docs: [
          "src/diagrams/component/docs.mjs",
          "src/diagrams/component/docs/coverage_examples.mjs",
        ],
        tests: [
          "src/diagrams/component/tests.mjs",
          "src/diagrams/component/tests/component_components.test.mjs",
          "src/diagrams/component/tests/output.mjs",
          "tests/component_components.test.mjs",
          "tests/edge_cases.test.mjs",
        ],
      },
      genericFallback: true,
      startDirectives: ["@startuml", "@startcomponent"],
      parser: componentDiagramParser,
      layout: componentDiagramLayout,
      renderer: componentDiagramRenderer,
      docs: componentDiagramDocs,
      tests: componentDiagramTests,
      security: componentDiagramSecurity,
      assets: componentDiagramAssets,
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
export const componentDiagramModule = new ComponentDiagramModule();
