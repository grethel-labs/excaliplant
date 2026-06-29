// PlantUML → Diagram model.
//
// This file is intentionally tiny: it detects the owning closed-world
// diagram module, assembles that module's plugin pipeline, and drives
// the generic line engine. Diagram-specific parsing logic lives in
// `src/diagrams/`.
//
// ## Extending the parser
//
// 1.  Drop a new plugin file in the owning `src/diagrams/<kind>/`
//     folder. A plugin is `{ name, tryLine?, tryStart? }` — see
//     `engine.mjs` for the contract.
// 2.  Register it in that diagram module's parser contract.
// 3.  Or pass it at call time via
//     `parsePlantUml(text, { plugins: { component: [...], sequence: [...] } })`.
//
// The model classes (`Box`, `Plane`, `Connection`, `Participant`,
// `Message`, …) are unchanged — plugins manipulate them through the
// module-owned context helpers.

/**
 * @diagram plugins
 *
 * Each parser plugin is a tiny self-contained file that handles ONE
 * PlantUML construct. The engine offers each input line to plugins
 * in registration order; the first plugin that returns `true` wins.
 *
 * To add support for a new PlantUML keyword, drop a new file in the
 * owning diagram module folder and append it to that module's parser
 * contract. No engine change required.
 */

import { runEngine } from "../util/parser_engine.mjs";
import { stripBlockComments } from "../util/plantuml_utils.mjs";
import {
  DEFAULT_CLASS_PLUGINS,
  DEFAULT_CHEN_PLUGINS,
  DEFAULT_COMPONENT_PLUGINS,
  DEFAULT_OBJECT_PLUGINS,
  DEFAULT_SEQUENCE_PLUGINS,
  DEFAULT_STATE_PLUGINS,
  DEFAULT_TIMING_PLUGINS,
  DEFAULT_REGEX_PLUGINS,
  DEFAULT_EBNF_PLUGINS,
  DEFAULT_JSON_PLUGINS,
  DEFAULT_YAML_PLUGINS,
  DEFAULT_MATH_PLUGINS,
  DEFAULT_NWDIAG_PLUGINS,
  DEFAULT_SALT_PLUGINS,
  DEFAULT_ARCHIMATE_PLUGINS,
  DEFAULT_GANTT_PLUGINS,
  DEFAULT_MINDMAP_PLUGINS,
  DEFAULT_WBS_PLUGINS,
  DEFAULT_CHRONOLOGY_PLUGINS,
  DEFAULT_FILES_PLUGINS,
  DEFAULT_IE_PLUGINS,
  DEFAULT_USE_CASE_PLUGINS,
  defaultDiagramModuleRegistry,
} from "./builtin.mjs";
import { ensureDiagramModuleRegistry } from "./registry.mjs";
import { setDiagramModuleMetadata } from "./metadata.mjs";
import { createSecurityBase } from "../general/platform/security_base.mjs";

/**
 * Default plugin pipeline for component-style diagrams. Order matters:
 * note / class blocks are tried before the bare-container regex; the
 * greedy connection plugin runs last.
 * @public
 */
export { DEFAULT_COMPONENT_PLUGINS } from "./builtin.mjs";

/**
 * Default plugin pipeline for class diagrams.
 * @public
 */
export { DEFAULT_CLASS_PLUGINS } from "./builtin.mjs";

/** Default plugin pipeline for Chen ER diagrams. @public */
export { DEFAULT_CHEN_PLUGINS } from "./builtin.mjs";

/** Default plugin pipeline for Information Engineering diagrams. @public */
export { DEFAULT_IE_PLUGINS } from "./builtin.mjs";

/**
 * Default plugin pipeline for deployment diagrams.
 * @public
 */
export { DEFAULT_DEPLOYMENT_PLUGINS } from "./builtin.mjs";

/**
 * Default plugin pipeline for object diagrams.
 * @public
 */
export { DEFAULT_OBJECT_PLUGINS } from "./builtin.mjs";

/**
 * Default plugin pipeline for use-case diagrams.
 * @public
 */
export { DEFAULT_USE_CASE_PLUGINS } from "./builtin.mjs";

/**
 * Default plugin pipeline for sequence diagrams.
 * @public
 */
export { DEFAULT_SEQUENCE_PLUGINS } from "./builtin.mjs";

/**
 * Default plugin pipeline for state diagrams.
 * @public
 */
export { DEFAULT_STATE_PLUGINS } from "./builtin.mjs";

/**
 * Default plugin pipeline for timing diagrams.
 * @public
 */
export { DEFAULT_TIMING_PLUGINS } from "./builtin.mjs";

/** Default plugin pipeline for regex diagrams. @public */
export { DEFAULT_REGEX_PLUGINS } from "./builtin.mjs";

/** Default plugin pipeline for EBNF diagrams. @public */
export { DEFAULT_EBNF_PLUGINS } from "./builtin.mjs";

/** Default plugin pipeline for JSON data diagrams. @public */
export { DEFAULT_JSON_PLUGINS } from "./builtin.mjs";

/** Default plugin pipeline for YAML data diagrams. @public */
export { DEFAULT_YAML_PLUGINS } from "./builtin.mjs";

/** Default plugin pipeline for math diagrams. @public */
export { DEFAULT_MATH_PLUGINS } from "./builtin.mjs";

/** Default plugin pipeline for nwdiag diagrams. @public */
export { DEFAULT_NWDIAG_PLUGINS } from "./builtin.mjs";

/** Default plugin pipeline for Salt wireframe diagrams. @public */
export { DEFAULT_SALT_PLUGINS } from "./builtin.mjs";

/** Default plugin pipeline for Archimate diagrams. @public */
export { DEFAULT_ARCHIMATE_PLUGINS } from "./builtin.mjs";

/** Default plugin pipeline for Gantt diagrams. @public */
export { DEFAULT_GANTT_PLUGINS } from "./builtin.mjs";

/** Default plugin pipeline for mindmap diagrams. @public */
export { DEFAULT_MINDMAP_PLUGINS } from "./builtin.mjs";

/** Default plugin pipeline for WBS diagrams. @public */
export { DEFAULT_WBS_PLUGINS } from "./builtin.mjs";

/** Default plugin pipeline for chronology diagrams. @public */
export { DEFAULT_CHRONOLOGY_PLUGINS } from "./builtin.mjs";

/** Default plugin pipeline for files tree diagrams. @public */
export { DEFAULT_FILES_PLUGINS } from "./builtin.mjs";

const PARSE_SECURITY_BASE = createSecurityBase();

/**
 * Default upper bounds for `parsePlantUml`. Callers can override any
 * of these via the `limits` option. The defaults are generous (10 MiB
 * source, 100k lines, 10k boxes/edges) so legitimate large diagrams
 * still parse, but malicious or runaway inputs fail fast instead of
 * exhausting memory.
 * @public
 */
export const DEFAULT_PARSE_LIMITS = Object.freeze({
  maxInputBytes: 10 * 1024 * 1024,
  maxLines: 100_000,
  maxNodes: 10_000,
  maxEdges: 10_000,
});

/**
 * Parse a PlantUML source string into the input-agnostic diagram model.
 * The parser auto-detects the owning diagram module via the closed-world
 * diagram registry.
 *
 * @param {string} text  PlantUML source.
 * @param {object} [opts]
 * @param {Record<string, any[]>} [opts.plugins]
 *   Override the default plugin lists. Useful for adding support for
 *   unsupported PlantUML constructs without forking the library.
 * @param {import("./registry.mjs").DiagramModuleRegistry} [opts.registry]
 *   Optional closed-world module registry. Defaults to the built-in registry.
 * @param {"component"|"sequence"|string} [opts.kind]
 *   Force a registered diagram module kind instead of auto-detecting it.
 * @param {Partial<typeof DEFAULT_PARSE_LIMITS>} [opts.limits]
 *   Override one or more resource limits. Anything omitted keeps the
 *   default. Pass `null`/`Infinity` to disable a particular limit.
 * @param {"silent"|"warn"|"strict"} [opts.unknownLines]
 *   How to handle PlantUML lines that no plugin consumes. `silent`
 *   (the default, preserves existing behaviour) drops them. `warn`
 *   emits a `console.warn` per line. `strict` throws a `SyntaxError`
 *   listing every unknown line.
 * @returns {import("../general/model/diagram.mjs").Diagram
 *          | import("../general/model/diagram.mjs").SequenceDiagram}
 * @public
 */
export function parsePlantUml(text, opts = {}) {
  const registry = ensureDiagramModuleRegistry(opts.registry ?? defaultDiagramModuleRegistry);
  const initialLimits = { ...DEFAULT_PARSE_LIMITS, ...(opts.limits || {}) };
  const unknownMode = opts.unknownLines ?? "silent";

  if (typeof text !== "string") {
    throw new TypeError("parsePlantUml: `text` must be a string");
  }
  const byteLen = Buffer.byteLength(text, "utf8");
  if (Number.isFinite(initialLimits.maxInputBytes) && byteLen > initialLimits.maxInputBytes) {
    throw new RangeError(
      `parsePlantUml: input is ${byteLen} bytes, exceeds maxInputBytes=${initialLimits.maxInputBytes}`,
    );
  }
  const rawLines = text.split(/\r?\n/);
  if (Number.isFinite(initialLimits.maxLines) && rawLines.length > initialLimits.maxLines) {
    throw new RangeError(
      `parsePlantUml: input has ${rawLines.length} lines, exceeds maxLines=${initialLimits.maxLines}`,
    );
  }
  const lines = stripBlockComments(rawLines);
  const detectionText = lines.join("\n");

  /** @type {Array<{line:string,index:number}>} */
  const unknown = [];
  const onUnknownLine =
    unknownMode === "silent"
      ? undefined
      : (/** @type {{line:string,index:number}} */ info) => {
          unknown.push(info);
          if (unknownMode === "warn") {
            console.warn(`parsePlantUml: unknown line ${info.index + 1}: ${info.line}`);
          }
        };

  const module = opts.kind ? registry.get(opts.kind) : registry.detect(detectionText);
  if (!module) throw new SyntaxError("parsePlantUml: no diagram module matched the source");
  const moduleProfile = module.securityProfile();
  const limits = {
    ...DEFAULT_PARSE_LIMITS,
    maxNodes: moduleProfile.maxNodes,
    maxEdges: moduleProfile.maxEdges,
    ...(opts.limits || {}),
  };
  const pluginOverrides = /** @type {Record<string, any[]>} */ (opts.plugins ?? {});
  const plugins = pluginOverrides[module.kind] ?? module.parserPlugins();
  validatePlugins(module.kind, plugins);
  const securityContext = PARSE_SECURITY_BASE.createContext(module.securityProfile(), {
    module: module.kind,
    phase: "parse",
    limits,
  });
  const boundary = PARSE_SECURITY_BASE.createFailureBoundary("parse", securityContext);
  const diagram = boundary.run(() =>
    runEngine({
      lines: module.prepareLines(lines),
      plugins,
      ctx: module.createParseContext(),
      onUnknownLine,
    }),
  );
  if (unknownMode === "strict" && unknown.length) {
    const detail = unknown
      .slice(0, 10)
      .map((u) => `  line ${u.index + 1}: ${u.line}`)
      .join("\n");
    const more = unknown.length > 10 ? `\n  ...and ${unknown.length - 10} more` : "";
    throw new SyntaxError(`parsePlantUml: ${unknown.length} unknown line(s):\n${detail}${more}`);
  }
  enforceModelLimits(diagram, limits);
  setDiagramModuleMetadata(/** @type {object} */ (diagram), {
    kind: module.kind,
    module,
    securityContext,
    diagnostics: securityContext.diagnostics,
  });
  return /** @type {import("../general/model/diagram.mjs").Diagram | import("../general/model/diagram.mjs").SequenceDiagram} */ (
    diagram
  );
}

/**
 * @param {string} moduleKind Module kind.
 * @param {any[]} plugins Plugin list.
 */
function validatePlugins(moduleKind, plugins) {
  if (!Array.isArray(plugins)) {
    throw new TypeError(`parsePlantUml: plugin override for ${moduleKind} must be an array`);
  }
  for (const plugin of plugins) {
    if (!plugin || typeof plugin.name !== "string") {
      throw new TypeError(`parsePlantUml: plugin override for ${moduleKind} has invalid plugin`);
    }
  }
}

/**
 * Walk the parsed model and reject diagrams that exceed `limits`.
 * Counts boxes (incl. notes) across all planes/subplanes and the
 * connection list. Sequence diagrams are bounded by participants,
 * timeline decorations, activations, and messages.
 * @param {any} diagram Parsed model.
 * @param {{maxNodes:number, maxEdges:number}} limits Effective limits.
 */
function enforceModelLimits(diagram, limits) {
  let nodes = 0;
  let edges = 0;
  if (Array.isArray(diagram?.planes)) {
    for (const plane of diagram.planes) {
      nodes += plane.allBoxes?.length ?? plane.boxes?.length ?? 0;
    }
    edges = diagram.connections?.length ?? 0;
  } else {
    nodes =
      (diagram?.participants?.length ?? 0) +
      (diagram?.notes?.length ?? 0) +
      (diagram?.fragments?.length ?? 0) +
      (diagram?.activations?.length ?? 0) +
      (diagram?.markers?.length ?? 0) +
      (diagram?.references?.length ?? 0) +
      (diagram?.participantGroups?.length ?? 0);
    edges = diagram?.messages?.length ?? 0;
  }
  if (Number.isFinite(limits.maxNodes) && nodes > limits.maxNodes) {
    throw new RangeError(
      `parsePlantUml: diagram has ${nodes} nodes, exceeds maxNodes=${limits.maxNodes}`,
    );
  }
  if (Number.isFinite(limits.maxEdges) && edges > limits.maxEdges) {
    throw new RangeError(
      `parsePlantUml: diagram has ${edges} edges, exceeds maxEdges=${limits.maxEdges}`,
    );
  }
}
