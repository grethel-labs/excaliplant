/**
 * Built-in diagram module collection.
 *
 * The main program collects diagram modules from this static repo-internal
 * index at runtime. Each diagram type owns its own folder below
 * `src/diagrams/`.
 * @module diagrams
 */

export { SequenceDiagramModule, sequenceDiagramModule } from "./sequence/module.mjs";
export { SequenceDiagramAssets, sequenceDiagramAssets } from "./sequence/assets.mjs";
export { SequenceDiagramDocs, sequenceDiagramDocs } from "./sequence/docs.mjs";
export {
  SequenceDiagramLayout,
  layoutSequenceDiagram,
  sequenceDiagramLayout,
} from "./sequence/layout.mjs";
export {
  DEFAULT_SEQUENCE_PLUGINS,
  SequenceDiagramParser,
  createSequenceParseContext,
  detectSequenceDiagram,
  sequenceDiagramParser,
} from "./sequence/parser.mjs";
export {
  SEQUENCE_RENDERERS,
  SequenceDiagramRenderer,
  renderSequenceExcalidraw,
  sequenceDiagramRenderer,
} from "./sequence/render.mjs";
export { SequenceDiagramSecurity, sequenceDiagramSecurity } from "./sequence/security.mjs";
export { SequenceDiagramTests, sequenceDiagramTests } from "./sequence/tests.mjs";
export { ClassDiagramModule, classDiagramModule } from "./class/module.mjs";
export { ClassDiagramAssets, classDiagramAssets } from "./class/assets.mjs";
export { ClassDiagramDocs, classDiagramDocs } from "./class/docs.mjs";
export { ClassDiagramLayout, classDiagramLayout, layoutClassDiagram } from "./class/layout.mjs";
export {
  ClassDiagramParser,
  DEFAULT_CLASS_PLUGINS,
  createClassParseContext,
  detectClassDiagram,
  prepareClassLines,
  classDiagramParser,
} from "./class/parser.mjs";
export { CLASS_RENDERERS, ClassDiagramRenderer, classDiagramRenderer } from "./class/render.mjs";
export { ClassDiagramSecurity, classDiagramSecurity } from "./class/security.mjs";
export { ClassDiagramTests, classDiagramTests } from "./class/tests.mjs";
export { ComponentDiagramModule, componentDiagramModule } from "./component/module.mjs";
export { ComponentDiagramAssets, componentDiagramAssets } from "./component/assets.mjs";
export { ComponentDiagramDocs, componentDiagramDocs } from "./component/docs.mjs";
export {
  ComponentDiagramLayout,
  componentDiagramLayout,
  layoutComponentDiagram,
} from "./component/layout.mjs";
export {
  ComponentDiagramParser,
  DEFAULT_COMPONENT_PLUGINS,
  createComponentParseContext,
  detectComponentDiagram,
  prepareComponentLines,
  componentDiagramParser,
} from "./component/parser.mjs";
export {
  COMPONENT_RENDERERS,
  ComponentDiagramRenderer,
  componentDiagramRenderer,
} from "./component/render.mjs";
export { ComponentDiagramSecurity, componentDiagramSecurity } from "./component/security.mjs";
export { ComponentDiagramTests, componentDiagramTests } from "./component/tests.mjs";
export { DeploymentDiagramModule, deploymentDiagramModule } from "./deployment/module.mjs";
export { DeploymentDiagramAssets, deploymentDiagramAssets } from "./deployment/assets.mjs";
export { DeploymentDiagramDocs, deploymentDiagramDocs } from "./deployment/docs.mjs";
export {
  DeploymentDiagramLayout,
  layoutDeploymentDiagram,
  deploymentDiagramLayout,
} from "./deployment/layout.mjs";
export {
  DeploymentDiagramParser,
  DEFAULT_DEPLOYMENT_PLUGINS,
  createDeploymentParseContext,
  detectDeploymentDiagram,
  prepareDeploymentLines,
  deploymentDiagramParser,
} from "./deployment/parser.mjs";
export {
  DEPLOYMENT_RENDERERS,
  DeploymentDiagramRenderer,
  deploymentDiagramRenderer,
} from "./deployment/render.mjs";
export { DeploymentDiagramSecurity, deploymentDiagramSecurity } from "./deployment/security.mjs";
export { DeploymentDiagramTests, deploymentDiagramTests } from "./deployment/tests.mjs";
export { UseCaseDiagramModule, useCaseDiagramModule } from "./use-case/module.mjs";
export { UseCaseDiagramAssets, useCaseDiagramAssets } from "./use-case/assets.mjs";
export { UseCaseDiagramDocs, useCaseDiagramDocs } from "./use-case/docs.mjs";
export { UseCaseDiagramLayout, useCaseDiagramLayout } from "./use-case/layout.mjs";
export {
  UseCaseDiagramParser,
  DEFAULT_USE_CASE_PLUGINS,
  createUseCaseParseContext,
  detectUseCaseDiagram,
  prepareUseCaseLines,
  useCaseDiagramParser,
} from "./use-case/parser.mjs";
export { UseCaseDiagramRenderer, useCaseDiagramRenderer } from "./use-case/render.mjs";
export { UseCaseDiagramSecurity, useCaseDiagramSecurity } from "./use-case/security.mjs";
export { UseCaseDiagramTests, useCaseDiagramTests } from "./use-case/tests.mjs";
export { ObjectDiagramModule, objectDiagramModule } from "./object/module.mjs";
export { ObjectDiagramAssets, objectDiagramAssets } from "./object/assets.mjs";
export { ObjectDiagramDocs, objectDiagramDocs } from "./object/docs.mjs";
export { ObjectDiagramLayout, layoutObjectDiagram, objectDiagramLayout } from "./object/layout.mjs";
export {
  ObjectDiagramParser,
  DEFAULT_OBJECT_PLUGINS,
  createObjectParseContext,
  detectObjectDiagram,
  prepareObjectLines,
  objectDiagramParser,
} from "./object/parser.mjs";
export {
  OBJECT_RENDERERS,
  ObjectDiagramRenderer,
  objectDiagramRenderer,
} from "./object/render.mjs";
export { ObjectDiagramSecurity, objectDiagramSecurity } from "./object/security.mjs";
export { ObjectDiagramTests, objectDiagramTests } from "./object/tests.mjs";
export { StateDiagramModule, stateDiagramModule } from "./state/module.mjs";
export { StateDiagramAssets, stateDiagramAssets } from "./state/assets.mjs";
export { StateDiagramDocs, stateDiagramDocs } from "./state/docs.mjs";
export { StateDiagramLayout, layoutStateDiagram, stateDiagramLayout } from "./state/layout.mjs";
export {
  StateDiagramParser,
  DEFAULT_STATE_PLUGINS,
  createStateParseContext,
  detectStateDiagram,
  prepareStateLines,
  stateDiagramParser,
} from "./state/parser.mjs";
export { STATE_RENDERERS, StateDiagramRenderer, stateDiagramRenderer } from "./state/render.mjs";
export { StateDiagramSecurity, stateDiagramSecurity } from "./state/security.mjs";
export { StateDiagramTests, stateDiagramTests } from "./state/tests.mjs";
export { ActivityDiagramModule, activityDiagramModule } from "./activity/module.mjs";
export { ActivityDiagramAssets } from "./activity/assets.mjs";
export { ActivityDiagramDocs } from "./activity/docs.mjs";
export { ActivityDiagramLayout } from "./activity/layout.mjs";
export {
  ActivityDiagramParser,
  DEFAULT_ACTIVITY_PLUGINS,
  detectActivityDiagram,
} from "./activity/parser.mjs";
export { ActivityDiagramRenderer } from "./activity/render.mjs";
export { ActivityDiagramSecurity } from "./activity/security.mjs";
export { ActivityDiagramTests } from "./activity/tests.mjs";

import { sequenceDiagramModule } from "./sequence/module.mjs";
import { classDiagramModule } from "./class/module.mjs";
import { componentDiagramModule } from "./component/module.mjs";
import { deploymentDiagramModule } from "./deployment/module.mjs";
import { useCaseDiagramModule } from "./use-case/module.mjs";
import { objectDiagramModule } from "./object/module.mjs";
import { stateDiagramModule } from "./state/module.mjs";
import { activityDiagramModule } from "./activity/module.mjs";

/** @public */
export const BUILTIN_DIAGRAM_MODULES = Object.freeze([
  sequenceDiagramModule,
  classDiagramModule,
  componentDiagramModule,
  deploymentDiagramModule,
  useCaseDiagramModule,
  objectDiagramModule,
  stateDiagramModule,
  activityDiagramModule,
]);
