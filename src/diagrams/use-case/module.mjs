/**
 * Built-in use-case diagram module.
 * @module diagrams/use-case/module
 */

import { GraphModuleBase } from "../base/module.mjs";
import { useCaseDiagramParser } from "./parser.mjs";
import { useCaseDiagramLayout } from "./layout.mjs";
import { useCaseDiagramRenderer } from "./render.mjs";
import { useCaseDiagramSecurity } from "./security.mjs";
import { useCaseDiagramAssets } from "./assets.mjs";
import { useCaseDiagramDocs } from "./docs.mjs";
import { useCaseDiagramTests } from "./tests.mjs";

/** @public */
export class UseCaseDiagramModule extends GraphModuleBase {
  constructor() {
    super({
      kind: "use-case",
      artifactRoot: "src/diagrams/use-case",
      ownedArtifacts: {
        parser: [
          "src/diagrams/use-case/parser.mjs",
          "src/diagrams/use-case/plugins/actors.mjs",
          "src/diagrams/use-case/plugins/usecases.mjs",
          "src/diagrams/use-case/plugins/relationships.mjs",
          "src/diagrams/use-case/plugins/containers.mjs",
          "src/diagrams/use-case/plugins/notes.mjs",
          "src/diagrams/shared/graph_parser.mjs",
          "src/diagrams/shared/graph_plugins/connections.mjs",
          "src/diagrams/shared/graph_plugins/filters.mjs",
          "src/diagrams/shared/graph_plugins/preamble.mjs",
        ],
        model: ["src/diagrams/shared/graph_context.mjs", "src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/use-case/layout.mjs"],
        render: ["src/diagrams/use-case/render.mjs"],
        security: ["src/diagrams/use-case/security.mjs"],
        assets: ["src/diagrams/use-case/assets.mjs"],
        docs: ["src/diagrams/use-case/docs.mjs"],
        tests: ["src/diagrams/use-case/tests.mjs", "tests/usecase_components.test.mjs"],
      },
      genericFallback: true,
      startDirectives: ["@startuml", "@startusecase"],
      parser: useCaseDiagramParser,
      layout: useCaseDiagramLayout,
      renderer: useCaseDiagramRenderer,
      security: useCaseDiagramSecurity,
      assets: useCaseDiagramAssets,
      docs: useCaseDiagramDocs,
      tests: useCaseDiagramTests,
    });
  }
}

/** @public */
export const useCaseDiagramModule = new UseCaseDiagramModule();
