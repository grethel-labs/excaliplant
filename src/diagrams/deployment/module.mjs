/**
 * Built-in deployment diagram module.
 * @module diagrams/deployment/module
 */

import { GraphModuleBase } from "../base/module.mjs";
import { deploymentDiagramAssets } from "./assets.mjs";
import { deploymentDiagramDocs } from "./docs.mjs";
import { deploymentDiagramLayout } from "./layout.mjs";
import { deploymentDiagramParser } from "./parser.mjs";
import { deploymentDiagramRenderer } from "./render.mjs";
import { deploymentDiagramSecurity } from "./security.mjs";
import { deploymentDiagramTests } from "./tests.mjs";

/** @public */
export class DeploymentDiagramModule extends GraphModuleBase {
  constructor() {
    super({
      kind: "deployment",
      artifactRoot: "src/diagrams/deployment",
      ownedArtifacts: {
        parser: [
          "src/diagrams/deployment/parser.mjs",
          "src/diagrams/shared/graph_parser.mjs",
          "src/diagrams/shared/graph_plugins/association_class.mjs",
          "src/diagrams/shared/graph_plugins/class_block.mjs",
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
        layout: ["src/diagrams/deployment/layout.mjs"],
        render: ["src/diagrams/deployment/render.mjs"],
        security: ["src/diagrams/deployment/security.mjs"],
        assets: ["src/diagrams/deployment/assets.mjs"],
        docs: [
          "src/diagrams/deployment/docs.mjs",
          "src/diagrams/deployment/docs/coverage_examples.mjs",
        ],
        tests: [
          "src/diagrams/deployment/tests.mjs",
          "src/diagrams/deployment/tests/deployment_components.test.mjs",
          "src/diagrams/deployment/tests/output.mjs",
          "tests/deployment_components.test.mjs",
        ],
      },
      genericFallback: true,
      startDirectives: ["@startuml", "@startdeployment"],
      parser: deploymentDiagramParser,
      layout: deploymentDiagramLayout,
      renderer: deploymentDiagramRenderer,
      docs: deploymentDiagramDocs,
      tests: deploymentDiagramTests,
      security: deploymentDiagramSecurity,
      assets: deploymentDiagramAssets,
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
export const deploymentDiagramModule = new DeploymentDiagramModule();
