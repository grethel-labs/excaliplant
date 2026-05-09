// diagram-renderer — public API.
//
// PlantUML in, Excalidraw JSON out. Internally:
//
//   PlantUML text
//      │
//      ▼
//   parsePlantUml()  →  Diagram model
//      │
//      ▼
//   layoutDiagram()  →  Diagram with absolute positions + edge paths
//      │              (sizing, ELK layered routing, corner chamfering)
//      ▼
//   exportDiagram()  →  Excalidraw JSON
//
// External dependencies:
//   * elkjs        — Eclipse Layout Kernel (layout & orthogonal routing)
//   * Excalidraw   — consumed via its file-format API (we emit the JSON
//                    that Excalidraw's import expects). We never bundle
//                    the React component; this lib produces files that
//                    *any* Excalidraw front-end can open.

/**
 * @diagram sequence
 *
 * The call graph for `renderPlantUml(text)` walks three subsystems:
 *
 * 1. **parser** turns PlantUML text into a model (`Diagram` /
 *    `SequenceDiagram`). The parser is plugin-driven; see the next
 *    diagram for the plugin breakdown.
 * 2. **layout** decides positions. Component diagrams go through ELK
 *    (layered + orthogonal routing); sequence diagrams use a small
 *    deterministic tabular layout.
 * 3. **renderer** walks the laid-out model and emits Excalidraw JSON.
 *    The same model can also be exported to SVG via
 *    [`src/general/render/svg.mjs`](./src/general/render/svg.mjs) — used by the
 *    documentation pipeline.
 */

/**
 * @diagram modules
 *
 * The module graph reflects how the source is laid out under
 * [`src/`](./src/). Diagram-type behavior is collected in first-class
 * module folders under `src/diagrams/`, orchestration lives under
 * `src/main/`, and host capabilities live under `src/general/platform/`.
 */

/**
 * @diagram model
 *
 * The model diagram is generated dynamically from exported classes in
 * [`src/general/model/diagram.mjs`](./src/general/model/diagram.mjs). It shows how the
 * reusable arrow classes sit underneath both component connections and
 * sequence messages, so future model classes appear in the README without
 * hand-maintained PlantUML.
 */

import { parsePlantUml } from "./src/main/parser.mjs";
import { layoutDiagram } from "./src/general/layout/elk_layout.mjs";
import { exportDiagram } from "./src/general/render/excalidraw.mjs";
import { layoutDiagramWithModule, exportDiagramWithModule } from "./src/main/pipeline.mjs";
import { excalidrawToSvg } from "./src/general/render/svg.mjs";
import { excalidrawJsonToCanvasSvg } from "./src/general/render/canvas_svg.mjs";
import { svgToPng } from "./src/general/render/png.mjs";

export { parsePlantUml, DEFAULT_PARSE_LIMITS } from "./src/main/parser.mjs";
export { layoutDiagram } from "./src/general/layout/elk_layout.mjs";
export { exportDiagram } from "./src/general/render/excalidraw.mjs";
export { layoutDiagramWithModule, exportDiagramWithModule } from "./src/main/pipeline.mjs";
export {
  BaseDiagramModule,
  BaseModuleAssets,
  BaseModuleDocs,
  BaseModuleLayout,
  BaseModuleParser,
  BaseModuleRenderer,
  BaseModuleSecurity,
  BaseModuleTests,
  DataModuleBase,
  ExternalBridgeModuleBase,
  GraphModuleBase,
  TimelineModuleBase,
  TreeModuleBase,
} from "./src/diagrams/base/index.mjs";
export { DiagramModuleRegistry, validateDiagramModule } from "./src/main/registry.mjs";
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
  DEFAULT_OBJECT_PLUGINS,
  DEFAULT_SEQUENCE_PLUGINS,
  DEFAULT_USE_CASE_PLUGINS,
  defaultDiagramModuleRegistry,
  DeploymentDiagramAssets,
  DeploymentDiagramDocs,
  DeploymentDiagramLayout,
  DeploymentDiagramModule,
  DeploymentDiagramParser,
  DeploymentDiagramRenderer,
  DeploymentDiagramSecurity,
  DeploymentDiagramTests,
  deploymentDiagramModule,
  ObjectDiagramAssets,
  ObjectDiagramDocs,
  ObjectDiagramLayout,
  ObjectDiagramModule,
  ObjectDiagramParser,
  ObjectDiagramRenderer,
  ObjectDiagramSecurity,
  ObjectDiagramTests,
  objectDiagramModule,
  SequenceDiagramAssets,
  SequenceDiagramDocs,
  SequenceDiagramLayout,
  SequenceDiagramModule,
  SequenceDiagramParser,
  SequenceDiagramRenderer,
  SequenceDiagramSecurity,
  SequenceDiagramTests,
  sequenceDiagramModule,
  UseCaseDiagramAssets,
  UseCaseDiagramDocs,
  UseCaseDiagramLayout,
  UseCaseDiagramModule,
  UseCaseDiagramParser,
  UseCaseDiagramRenderer,
  UseCaseDiagramSecurity,
  UseCaseDiagramTests,
  useCaseDiagramModule,
} from "./src/main/builtin.mjs";
export {
  resolveModuleDependencies,
  validateRegistryDependencies,
} from "./src/main/dependencies.mjs";
export {
  getDiagramModuleKind,
  getDiagramModuleMetadata,
  setDiagramModuleMetadata,
} from "./src/main/metadata.mjs";
export { describeDiagramPlatform } from "./src/main/introspection.mjs";
export {
  DEFAULT_ALLOWED_LINK_PROTOCOLS,
  DEFAULT_FAILURE_POLICY,
  DEFAULT_MODULE_SECURITY_PROFILE,
  FailureBoundary,
  SecurityError,
  createModuleSecurityProfile,
  createSecurityBase,
  escapeAttribute,
  escapeText,
} from "./src/general/platform/security_base.mjs";
export { createDiagnostic, isFatalDiagnostic } from "./src/general/platform/diagnostics.mjs";
export { createAssetBase, normalizeAssetManifest } from "./src/general/platform/asset_base.mjs";
export {
  DEFAULT_PLATFORM_SERVICE_MANIFESTS,
  PlatformServiceRegistry,
  defaultPlatformServiceRegistry,
  satisfiesVersion,
  validatePlatformService,
} from "./src/general/platform/services.mjs";
export { excalidrawToSvg } from "./src/general/render/svg.mjs";
export {
  excalidrawJsonToCanvasSvg,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_ASPECT_RATIO,
} from "./src/general/render/canvas_svg.mjs";
export { svgToPng } from "./src/general/render/png.mjs";
export { EXCALIDRAW_SCHEMA, ROUNDNESS } from "./src/general/render/schema.mjs";
export { createSeededRng, stableHash32 } from "./src/general/render/rng.mjs";
export {
  DEFAULT_STYLE,
  EXCALIDRAW_FONT_FAMILY,
  getStyle,
  setStyle,
  resetStyle,
  loadStyleFromFile,
  resolveFontFamilyId,
  parseSimpleYaml,
} from "./src/general/style/style.mjs";
export {
  ARROW_ANCHORS,
  ARROW_DIRECTIONS,
  ARROW_HEADS,
  ARROW_LINE_STYLES,
  ArrowEndpoint,
  ArrowLabel,
  ArrowLine,
  Box,
  Connection,
  DEFAULT_ARROW_HEAD_SIZE,
  Diagram,
  DiagramArrow,
  Plane,
  Subplane,
  Participant,
  Message,
  SequenceDiagram,
  SequenceActivation,
  SequenceArrow,
  SequenceArrowEndpoint,
  SequenceArrowLine,
  SequenceFragment,
  SequenceMarker,
  SequenceNote,
  SequenceParticipantGroup,
  SequenceReference,
  SEQUENCE_ARROW_ANCHORS,
  SEQUENCE_ARROW_DIRECTIONS,
  SEQUENCE_ARROW_HEADS,
  SEQUENCE_ARROW_LINE_STYLES,
  SHAPES,
} from "./src/general/model/diagram.mjs";

/**
 * Chainable result returned by `renderPlantUml` / `renderDiagram`.
 *
 * Awaiting the result yields the Excalidraw JSON document, so existing
 * callers (`const doc = await renderPlantUml(text)`) keep working.
 *
 * On top of that, the result exposes `.toSvg()` and `.toPng()` so a
 * caller can write:
 *
 * ```js
 * const r = renderPlantUml(text);
 * const svg = await r.toSvg();
 * const png = await r.toPng({ width: 4800 });
 * ```
 *
 * Both helpers lazily await the underlying document — so calling
 * `toSvg()` / `toPng()` directly on the unawaited result works too.
 *
 * @public
 */
export class RenderResult {
  /** @param {Promise<object>} docPromise */
  constructor(docPromise) {
    this._doc = docPromise;
  }

  /**
   * Thenable: `await result` yields the Excalidraw JSON document.
   * @template T
   * @template R
   * @param {(value: object) => T | Promise<T>} [onFulfilled]
   * @param {(reason: any) => R | Promise<R>} [onRejected]
   * @returns {Promise<T | R>}
   */
  then(onFulfilled, onRejected) {
    return this._doc.then(onFulfilled, onRejected);
  }

  /**
   * Letter-boxed sketchy SVG.
   *
   * @param {object} [opts] Forwarded to `excalidrawJsonToCanvasSvg`,
   *   plus `{ canvas: false }` to skip the letter-boxing and get the
   *   tightly-cropped SVG instead.
   * @returns {Promise<string>}
   */
  async toSvg(opts = {}) {
    const doc = await this._doc;
    if (/** @type {any} */ (opts).canvas === false) return excalidrawToSvg(doc, opts);
    return excalidrawJsonToCanvasSvg(doc, opts);
  }

  /**
   * Sketchy PNG. Renders the SVG (which already carries the
   * Excalidraw-style wobble via roughjs) and rasterises with resvg.
   *
   * @param {object} [opts] Forwarded to `svgToPng` and the SVG step.
   * @returns {Promise<Buffer>}
   */
  async toPng(opts = {}) {
    const svg = await this.toSvg(opts);
    return svgToPng(svg, opts);
  }
}

/**
 * Render a PlantUML source string to an Excalidraw JSON document.
 *
 * The return value is a thenable {@link RenderResult}: `await` it for
 * the Excalidraw JSON, or call `.toSvg()` / `.toPng()` on it to get
 * the rasterised diagram in one chained call.
 *
 * @param {string} plantuml  PlantUML text (see src/main/parser.mjs
 *                           for the supported subset).
 * @param {object} [opts]
 * @param {string} [opts.sourceLabel]  Forwarded to the renderer's
 *                                     appState.name.
 * @param {() => number} [opts.rng]    Optional deterministic RNG.
 * @param {Partial<import("./src/main/parser.mjs").DEFAULT_PARSE_LIMITS>} [opts.limits]
 *   Optional resource limits forwarded to {@link parsePlantUml}.
 * @returns {RenderResult}             Thenable wrapping the Excalidraw
 *                                     JSON document.
 */
export function renderPlantUml(plantuml, opts = {}) {
  return new RenderResult(
    (async () => {
      const diagram = parsePlantUml(plantuml, { limits: opts.limits });
      await layoutDiagramWithModule(diagram);
      return exportDiagramWithModule(diagram, {
        sourceLabel: opts.sourceLabel ?? diagram.title ?? "",
        rng: opts.rng,
      });
    })(),
  );
}

/**
 * Render an already-built Diagram model. Useful for callers that want
 * to bypass the PlantUML parser and feed shapes programmatically.
 *
 * @param {import("./src/general/model/diagram.mjs").Diagram
 *        | import("./src/general/model/diagram.mjs").SequenceDiagram} diagram
 * @param {object} [opts]
 * @param {string} [opts.sourceLabel]
 * @param {() => number} [opts.rng]
 * @returns {RenderResult}
 */
export function renderDiagram(diagram, opts = {}) {
  return new RenderResult(
    (async () => {
      await layoutDiagramWithModule(/** @type {object} */ (diagram));
      return exportDiagramWithModule(/** @type {object} */ (diagram), {
        sourceLabel: opts.sourceLabel ?? diagram.title ?? "",
        rng: opts.rng,
      });
    })(),
  );
}
