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
export { IeDiagramModule, ieDiagramModule } from "./ie/module.mjs";
export { IeDiagramAssets, ieDiagramAssets } from "./ie/assets.mjs";
export { IeDiagramDocs, ieDiagramDocs } from "./ie/docs.mjs";
export { IeDiagramLayout, ieDiagramLayout } from "./ie/layout.mjs";
export {
  IeDiagramParser,
  DEFAULT_IE_PLUGINS,
  createIeParseContext,
  detectIeDiagram,
  prepareIeLines,
  ieDiagramParser,
} from "./ie/parser.mjs";
export { IE_RENDERERS, IeDiagramRenderer, ieDiagramRenderer } from "./ie/render.mjs";
export { IeDiagramSecurity, ieDiagramSecurity } from "./ie/security.mjs";
export { IeDiagramTests, ieDiagramTests } from "./ie/tests.mjs";
export { ChenDiagramModule, chenDiagramModule } from "./chen/module.mjs";
export { ChenDiagramAssets, chenDiagramAssets } from "./chen/assets.mjs";
export { ChenDiagramDocs, chenDiagramDocs } from "./chen/docs.mjs";
export { ChenDiagramLayout, chenDiagramLayout } from "./chen/layout.mjs";
export {
  ChenDiagramParser,
  DEFAULT_CHEN_PLUGINS,
  createChenParseContext,
  detectChenDiagram,
  prepareChenLines,
  chenDiagramParser,
} from "./chen/parser.mjs";
export { CHEN_RENDERERS, ChenDiagramRenderer, chenDiagramRenderer } from "./chen/render.mjs";
export { ChenDiagramSecurity, chenDiagramSecurity } from "./chen/security.mjs";
export { ChenDiagramTests, chenDiagramTests } from "./chen/tests.mjs";
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
export { TimingDiagramModule, timingDiagramModule } from "./timing/module.mjs";
export { TimingDiagramAssets, timingDiagramAssets } from "./timing/assets.mjs";
export { TimingDiagramDocs, timingDiagramDocs } from "./timing/docs.mjs";
export { TimingDiagramLayout, layoutTimingDiagram, timingDiagramLayout } from "./timing/layout.mjs";
export {
  TimingDiagramParser,
  DEFAULT_TIMING_PLUGINS,
  createTimingParseContext,
  detectTimingDiagram,
  prepareTimingLines,
  timingDiagramParser,
} from "./timing/parser.mjs";
export {
  TIMING_RENDERERS,
  TimingDiagramRenderer,
  timingDiagramRenderer,
} from "./timing/render.mjs";
export { TimingDiagramSecurity, timingDiagramSecurity } from "./timing/security.mjs";
export { TimingDiagramTests, timingDiagramTests } from "./timing/tests.mjs";
export { RegexDiagramModule, regexDiagramModule } from "./regex/module.mjs";
export { RegexDiagramAssets, regexDiagramAssets } from "./regex/assets.mjs";
export { RegexDiagramDocs, regexDiagramDocs } from "./regex/docs.mjs";
export { RegexDiagramLayout, regexDiagramLayout } from "./regex/layout.mjs";
export {
  RegexDiagramParser,
  DEFAULT_REGEX_PLUGINS,
  createRegexParseContext,
  detectRegexDiagram,
  prepareRegexLines,
  regexDiagramParser,
} from "./regex/parser.mjs";
export { REGEX_RENDERERS, RegexDiagramRenderer, regexDiagramRenderer } from "./regex/render.mjs";
export { RegexDiagramSecurity, regexDiagramSecurity } from "./regex/security.mjs";
export { RegexDiagramTests, regexDiagramTests } from "./regex/tests.mjs";
export { EbnfDiagramModule, ebnfDiagramModule } from "./ebnf/module.mjs";
export { EbnfDiagramAssets, ebnfDiagramAssets } from "./ebnf/assets.mjs";
export { EbnfDiagramDocs, ebnfDiagramDocs } from "./ebnf/docs.mjs";
export { EbnfDiagramLayout, ebnfDiagramLayout } from "./ebnf/layout.mjs";
export {
  EbnfDiagramParser,
  DEFAULT_EBNF_PLUGINS,
  createEbnfParseContext,
  detectEbnfDiagram,
  prepareEbnfLines,
  ebnfDiagramParser,
} from "./ebnf/parser.mjs";
export { EBNF_RENDERERS, EbnfDiagramRenderer, ebnfDiagramRenderer } from "./ebnf/render.mjs";
export { EbnfDiagramSecurity, ebnfDiagramSecurity } from "./ebnf/security.mjs";
export { EbnfDiagramTests, ebnfDiagramTests } from "./ebnf/tests.mjs";
export { JsonDiagramModule, jsonDiagramModule } from "./json/module.mjs";
export { JsonDiagramAssets, jsonDiagramAssets } from "./json/assets.mjs";
export { JsonDiagramDocs, jsonDiagramDocs } from "./json/docs.mjs";
export { JsonDiagramLayout, jsonDiagramLayout } from "./json/layout.mjs";
export {
  JsonDiagramParser,
  DEFAULT_JSON_PLUGINS,
  createJsonParseContext,
  detectJsonDiagram,
  prepareJsonLines,
  jsonDiagramParser,
} from "./json/parser.mjs";
export { JSON_RENDERERS, JsonDiagramRenderer, jsonDiagramRenderer } from "./json/render.mjs";
export { JsonDiagramSecurity, jsonDiagramSecurity } from "./json/security.mjs";
export { JsonDiagramTests, jsonDiagramTests } from "./json/tests.mjs";
export { YamlDiagramModule, yamlDiagramModule } from "./yaml/module.mjs";
export { YamlDiagramAssets, yamlDiagramAssets } from "./yaml/assets.mjs";
export { YamlDiagramDocs, yamlDiagramDocs } from "./yaml/docs.mjs";
export { YamlDiagramLayout, yamlDiagramLayout } from "./yaml/layout.mjs";
export {
  YamlDiagramParser,
  DEFAULT_YAML_PLUGINS,
  createYamlParseContext,
  detectYamlDiagram,
  prepareYamlLines,
  yamlDiagramParser,
} from "./yaml/parser.mjs";
export { YAML_RENDERERS, YamlDiagramRenderer, yamlDiagramRenderer } from "./yaml/render.mjs";
export { YamlDiagramSecurity, yamlDiagramSecurity } from "./yaml/security.mjs";
export { YamlDiagramTests, yamlDiagramTests } from "./yaml/tests.mjs";
export { MathDiagramModule, mathDiagramModule } from "./math/module.mjs";
export { MathDiagramAssets, mathDiagramAssets } from "./math/assets.mjs";
export { MathDiagramDocs, mathDiagramDocs } from "./math/docs.mjs";
export { MathDiagramLayout, mathDiagramLayout } from "./math/layout.mjs";
export {
  MathDiagramParser,
  DEFAULT_MATH_PLUGINS,
  createMathParseContext,
  detectMathDiagram,
  prepareMathLines,
  mathDiagramParser,
} from "./math/parser.mjs";
export { MATH_RENDERERS, MathDiagramRenderer, mathDiagramRenderer } from "./math/render.mjs";
export { MathDiagramSecurity, mathDiagramSecurity } from "./math/security.mjs";
export { MathDiagramTests, mathDiagramTests } from "./math/tests.mjs";
export { NwdiagDiagramModule, nwdiagDiagramModule } from "./nwdiag/module.mjs";
export { NwdiagDiagramAssets, nwdiagDiagramAssets } from "./nwdiag/assets.mjs";
export { NwdiagDiagramDocs, nwdiagDiagramDocs } from "./nwdiag/docs.mjs";
export { NwdiagDiagramLayout, nwdiagDiagramLayout } from "./nwdiag/layout.mjs";
export {
  NwdiagDiagramParser,
  DEFAULT_NWDIAG_PLUGINS,
  createNwdiagParseContext,
  detectNwdiagDiagram,
  prepareNwdiagLines,
  nwdiagDiagramParser,
} from "./nwdiag/parser.mjs";
export {
  NWDIAG_RENDERERS,
  NwdiagDiagramRenderer,
  nwdiagDiagramRenderer,
} from "./nwdiag/render.mjs";
export { NwdiagDiagramSecurity, nwdiagDiagramSecurity } from "./nwdiag/security.mjs";
export { NwdiagDiagramTests, nwdiagDiagramTests } from "./nwdiag/tests.mjs";
export { SaltDiagramModule, saltDiagramModule } from "./salt/module.mjs";
export { SaltDiagramAssets, saltDiagramAssets } from "./salt/assets.mjs";
export { SaltDiagramDocs, saltDiagramDocs } from "./salt/docs.mjs";
export { SaltDiagramLayout, saltDiagramLayout } from "./salt/layout.mjs";
export {
  SaltDiagramParser,
  DEFAULT_SALT_PLUGINS,
  createSaltParseContext,
  detectSaltDiagram,
  prepareSaltLines,
  saltDiagramParser,
} from "./salt/parser.mjs";
export { SALT_RENDERERS, SaltDiagramRenderer, saltDiagramRenderer } from "./salt/render.mjs";
export { SaltDiagramSecurity, saltDiagramSecurity } from "./salt/security.mjs";
export { SaltDiagramTests, saltDiagramTests } from "./salt/tests.mjs";
export { ArchimateDiagramModule, archimateDiagramModule } from "./archimate/module.mjs";
export { ArchimateDiagramAssets, archimateDiagramAssets } from "./archimate/assets.mjs";
export { ArchimateDiagramDocs, archimateDiagramDocs } from "./archimate/docs.mjs";
export { ArchimateDiagramLayout, archimateDiagramLayout } from "./archimate/layout.mjs";
export {
  ArchimateDiagramParser,
  DEFAULT_ARCHIMATE_PLUGINS,
  createArchimateParseContext,
  detectArchimateDiagram,
  prepareArchimateLines,
  archimateDiagramParser,
} from "./archimate/parser.mjs";
export {
  ARCHIMATE_RENDERERS,
  ArchimateDiagramRenderer,
  archimateDiagramRenderer,
} from "./archimate/render.mjs";
export { ArchimateDiagramSecurity, archimateDiagramSecurity } from "./archimate/security.mjs";
export { ArchimateDiagramTests, archimateDiagramTests } from "./archimate/tests.mjs";
export { GanttDiagramModule, ganttDiagramModule } from "./gantt/module.mjs";
export { GanttDiagramAssets, ganttDiagramAssets } from "./gantt/assets.mjs";
export { GanttDiagramDocs, ganttDiagramDocs } from "./gantt/docs.mjs";
export { GanttDiagramLayout, ganttDiagramLayout } from "./gantt/layout.mjs";
export {
  GanttDiagramParser,
  DEFAULT_GANTT_PLUGINS,
  createGanttParseContext,
  detectGanttDiagram,
  prepareGanttLines,
  ganttDiagramParser,
} from "./gantt/parser.mjs";
export { GANTT_RENDERERS, GanttDiagramRenderer, ganttDiagramRenderer } from "./gantt/render.mjs";
export { GanttDiagramSecurity, ganttDiagramSecurity } from "./gantt/security.mjs";
export { GanttDiagramTests, ganttDiagramTests } from "./gantt/tests.mjs";
export { MindmapDiagramModule, mindmapDiagramModule } from "./mindmap/module.mjs";
export { MindmapDiagramAssets, mindmapDiagramAssets } from "./mindmap/assets.mjs";
export { MindmapDiagramDocs, mindmapDiagramDocs } from "./mindmap/docs.mjs";
export { MindmapDiagramLayout, mindmapDiagramLayout } from "./mindmap/layout.mjs";
export {
  MindmapDiagramParser,
  DEFAULT_MINDMAP_PLUGINS,
  createMindmapParseContext,
  detectMindmapDiagram,
  prepareMindmapLines,
  mindmapDiagramParser,
} from "./mindmap/parser.mjs";
export {
  MINDMAP_RENDERERS,
  MindmapDiagramRenderer,
  mindmapDiagramRenderer,
} from "./mindmap/render.mjs";
export { MindmapDiagramSecurity, mindmapDiagramSecurity } from "./mindmap/security.mjs";
export { MindmapDiagramTests, mindmapDiagramTests } from "./mindmap/tests.mjs";
export { WbsDiagramModule, wbsDiagramModule } from "./wbs/module.mjs";
export { WbsDiagramAssets, wbsDiagramAssets } from "./wbs/assets.mjs";
export { WbsDiagramDocs, wbsDiagramDocs } from "./wbs/docs.mjs";
export { WbsDiagramLayout, wbsDiagramLayout } from "./wbs/layout.mjs";
export {
  WbsDiagramParser,
  DEFAULT_WBS_PLUGINS,
  createWbsParseContext,
  detectWbsDiagram,
  prepareWbsLines,
  wbsDiagramParser,
} from "./wbs/parser.mjs";
export { WBS_RENDERERS, WbsDiagramRenderer, wbsDiagramRenderer } from "./wbs/render.mjs";
export { WbsDiagramSecurity, wbsDiagramSecurity } from "./wbs/security.mjs";
export { WbsDiagramTests, wbsDiagramTests } from "./wbs/tests.mjs";
export { ChronologyDiagramModule, chronologyDiagramModule } from "./chronology/module.mjs";
export { ChronologyDiagramAssets, chronologyDiagramAssets } from "./chronology/assets.mjs";
export { ChronologyDiagramDocs, chronologyDiagramDocs } from "./chronology/docs.mjs";
export { ChronologyDiagramLayout, chronologyDiagramLayout } from "./chronology/layout.mjs";
export {
  ChronologyDiagramParser,
  DEFAULT_CHRONOLOGY_PLUGINS,
  createChronologyParseContext,
  detectChronologyDiagram,
  prepareChronologyLines,
  chronologyDiagramParser,
} from "./chronology/parser.mjs";
export {
  CHRONOLOGY_RENDERERS,
  ChronologyDiagramRenderer,
  chronologyDiagramRenderer,
} from "./chronology/render.mjs";
export { ChronologyDiagramSecurity, chronologyDiagramSecurity } from "./chronology/security.mjs";
export { ChronologyDiagramTests, chronologyDiagramTests } from "./chronology/tests.mjs";
export { FilesDiagramModule, filesDiagramModule } from "./files/module.mjs";
export { FilesDiagramAssets, filesDiagramAssets } from "./files/assets.mjs";
export { FilesDiagramDocs, filesDiagramDocs } from "./files/docs.mjs";
export { FilesDiagramLayout, filesDiagramLayout } from "./files/layout.mjs";
export {
  FilesDiagramParser,
  DEFAULT_FILES_PLUGINS,
  createFilesParseContext,
  detectFilesDiagram,
  prepareFilesLines,
  filesDiagramParser,
} from "./files/parser.mjs";
export { FILES_RENDERERS, FilesDiagramRenderer, filesDiagramRenderer } from "./files/render.mjs";
export { FilesDiagramSecurity, filesDiagramSecurity } from "./files/security.mjs";
export { FilesDiagramTests, filesDiagramTests } from "./files/tests.mjs";
export { DitaaDiagramModule, ditaaDiagramModule } from "./ditaa/module.mjs";
export { DitaaDiagramAssets, ditaaDiagramAssets } from "./ditaa/assets.mjs";
export { DitaaDiagramDocs, ditaaDiagramDocs } from "./ditaa/docs.mjs";
export { DitaaDiagramLayout, ditaaDiagramLayout } from "./ditaa/layout.mjs";
export {
  DitaaDiagramParser,
  DEFAULT_DITAA_PLUGINS,
  createDitaaParseContext,
  detectDitaaDiagram,
  prepareDitaaLines,
  ditaaDiagramParser,
} from "./ditaa/parser.mjs";
export { DITAA_RENDERERS, DitaaDiagramRenderer, ditaaDiagramRenderer } from "./ditaa/render.mjs";
export { DitaaDiagramSecurity, ditaaDiagramSecurity } from "./ditaa/security.mjs";
export { DitaaDiagramTests, ditaaDiagramTests } from "./ditaa/tests.mjs";
export { ChartDiagramModule, chartDiagramModule } from "./chart/module.mjs";
export { ChartDiagramAssets, chartDiagramAssets } from "./chart/assets.mjs";
export { ChartDiagramDocs, chartDiagramDocs } from "./chart/docs.mjs";
export { ChartDiagramLayout, chartDiagramLayout } from "./chart/layout.mjs";
export {
  ChartDiagramParser,
  DEFAULT_CHART_PLUGINS,
  createChartParseContext,
  detectChartDiagram,
  prepareChartLines,
  chartDiagramParser,
} from "./chart/parser.mjs";
export { CHART_RENDERERS, ChartDiagramRenderer, chartDiagramRenderer } from "./chart/render.mjs";
export { ChartDiagramSecurity, chartDiagramSecurity } from "./chart/security.mjs";
export { ChartDiagramTests, chartDiagramTests } from "./chart/tests.mjs";

import { sequenceDiagramModule } from "./sequence/module.mjs";
import { ieDiagramModule } from "./ie/module.mjs";
import { chenDiagramModule } from "./chen/module.mjs";
import { classDiagramModule } from "./class/module.mjs";
import { componentDiagramModule } from "./component/module.mjs";
import { deploymentDiagramModule } from "./deployment/module.mjs";
import { useCaseDiagramModule } from "./use-case/module.mjs";
import { objectDiagramModule } from "./object/module.mjs";
import { stateDiagramModule } from "./state/module.mjs";
import { activityDiagramModule } from "./activity/module.mjs";
import { timingDiagramModule } from "./timing/module.mjs";
import { regexDiagramModule } from "./regex/module.mjs";
import { ebnfDiagramModule } from "./ebnf/module.mjs";
import { jsonDiagramModule } from "./json/module.mjs";
import { yamlDiagramModule } from "./yaml/module.mjs";
import { mathDiagramModule } from "./math/module.mjs";
import { nwdiagDiagramModule } from "./nwdiag/module.mjs";
import { saltDiagramModule } from "./salt/module.mjs";
import { archimateDiagramModule } from "./archimate/module.mjs";
import { ganttDiagramModule } from "./gantt/module.mjs";
import { mindmapDiagramModule } from "./mindmap/module.mjs";
import { wbsDiagramModule } from "./wbs/module.mjs";
import { chronologyDiagramModule } from "./chronology/module.mjs";
import { filesDiagramModule } from "./files/module.mjs";
import { ditaaDiagramModule } from "./ditaa/module.mjs";
import { chartDiagramModule } from "./chart/module.mjs";

/** @public */
export const BUILTIN_DIAGRAM_MODULES = Object.freeze([
  sequenceDiagramModule,
  ieDiagramModule,
  chenDiagramModule,
  classDiagramModule,
  componentDiagramModule,
  deploymentDiagramModule,
  useCaseDiagramModule,
  objectDiagramModule,
  stateDiagramModule,
  timingDiagramModule,
  regexDiagramModule,
  ebnfDiagramModule,
  jsonDiagramModule,
  yamlDiagramModule,
  mathDiagramModule,
  nwdiagDiagramModule,
  saltDiagramModule,
  archimateDiagramModule,
  ganttDiagramModule,
  mindmapDiagramModule,
  wbsDiagramModule,
  chronologyDiagramModule,
  filesDiagramModule,
  ditaaDiagramModule,
  chartDiagramModule,
  activityDiagramModule,
]);
