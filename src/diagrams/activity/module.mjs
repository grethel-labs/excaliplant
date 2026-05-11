/**
 * Built-in activity diagram module.
 * @module diagrams/activity/module
 */

import { BaseDiagramModule } from "../base/module.mjs";
import { ActivityDiagramAssets } from "./assets.mjs";
import { ActivityDiagramDocs } from "./docs.mjs";
import { ActivityDiagramLayout } from "./layout.mjs";
import { ActivityDiagramParser } from "./parser.mjs";
import { ActivityDiagramRenderer } from "./render.mjs";
import { ActivityDiagramSecurity } from "./security.mjs";
import { ActivityDiagramTests } from "./tests.mjs";

/** @public */
export class ActivityDiagramModule extends BaseDiagramModule {
  constructor() {
    super({
      kind: "activity",
      artifactRoot: "src/diagrams/activity",
      ownedArtifacts: {
        parser: ["src/diagrams/activity/parser.mjs", "src/diagrams/activity/plugins/syntax.mjs"],
        model: ["src/general/model/diagram.mjs"],
        style: [],
        layout: ["src/diagrams/activity/layout.mjs"],
        render: ["src/diagrams/activity/render.mjs"],
        security: ["src/diagrams/activity/security.mjs"],
        assets: ["src/diagrams/activity/assets.mjs"],
        docs: ["src/diagrams/activity/docs.mjs"],
        tests: [
          "src/diagrams/activity/tests.mjs",
          "src/diagrams/activity/tests/activity_components.test.mjs",
        ],
      },
      startDirectives: ["@startuml", "@startactivity"],
      parser: new ActivityDiagramParser(),
      layout: new ActivityDiagramLayout(),
      renderer: new ActivityDiagramRenderer(),
      docs: new ActivityDiagramDocs(),
      tests: new ActivityDiagramTests(),
      security: new ActivityDiagramSecurity(),
      assets: new ActivityDiagramAssets(),
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
export const activityDiagramModule = new ActivityDiagramModule();
