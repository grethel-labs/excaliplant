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

import { sequenceDiagramModule } from "./sequence/module.mjs";
import { classDiagramModule } from "./class/module.mjs";
import { componentDiagramModule } from "./component/module.mjs";
import { deploymentDiagramModule } from "./deployment/module.mjs";
import { useCaseDiagramModule } from "./use-case/module.mjs";

/** @public */
export const BUILTIN_DIAGRAM_MODULES = Object.freeze([
  sequenceDiagramModule,
  classDiagramModule,
  componentDiagramModule,
  deploymentDiagramModule,
  useCaseDiagramModule,
]);
