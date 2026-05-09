/**
 * Built-in closed-world diagram modules.
 *
 * This file exposes the built-in registry and re-exports concrete diagram
 * module definitions from per-diagram folders under `src/diagrams/`.
 * @module main/builtin
 */

import { DiagramModuleRegistry } from "./registry.mjs";
import { BUILTIN_DIAGRAM_MODULES } from "../diagrams/index.mjs";

export {
  BUILTIN_DIAGRAM_MODULES,
  ClassDiagramAssets,
  ClassDiagramDocs,
  ClassDiagramLayout,
  ClassDiagramModule,
  ClassDiagramParser,
  ClassDiagramRenderer,
  ClassDiagramSecurity,
  ClassDiagramTests,
  ComponentDiagramAssets,
  ComponentDiagramDocs,
  ComponentDiagramLayout,
  ComponentDiagramModule,
  ComponentDiagramParser,
  ComponentDiagramRenderer,
  ComponentDiagramSecurity,
  ComponentDiagramTests,
  classDiagramModule,
  componentDiagramModule,
  DEFAULT_CLASS_PLUGINS,
  DEFAULT_COMPONENT_PLUGINS,
  DEFAULT_DEPLOYMENT_PLUGINS,
  DEFAULT_SEQUENCE_PLUGINS,
  DeploymentDiagramAssets,
  DeploymentDiagramDocs,
  DeploymentDiagramLayout,
  DeploymentDiagramModule,
  DeploymentDiagramParser,
  DeploymentDiagramRenderer,
  DeploymentDiagramSecurity,
  DeploymentDiagramTests,
  deploymentDiagramModule,
  SequenceDiagramAssets,
  SequenceDiagramDocs,
  SequenceDiagramLayout,
  SequenceDiagramModule,
  SequenceDiagramParser,
  SequenceDiagramRenderer,
  SequenceDiagramSecurity,
  SequenceDiagramTests,
  sequenceDiagramModule,
} from "../diagrams/index.mjs";

/** @public */
export const defaultDiagramModuleRegistry = new DiagramModuleRegistry({
  modules: [...BUILTIN_DIAGRAM_MODULES],
  frozen: true,
});
