// PlantUML → Diagram model.
//
// This file is intentionally tiny: it just dispatches between component
// and sequence diagrams, assembles the plugin pipeline, and drives the
// engine. All real parsing logic lives in `plugins/`.
//
// ## Extending the parser
//
// 1.  Drop a new plugin file in `plugins/component/` or
//     `plugins/sequence/`. A plugin is `{ name, tryLine?, tryStart? }`
//     — see `engine.mjs` for the contract.
// 2.  Register it here by adding it to the corresponding default array.
// 3.  Or pass it at call time via
//     `parsePlantUml(text, { plugins: { component: [...], sequence: [...] } })`.
//
// The model classes (`Box`, `Plane`, `Connection`, `Participant`,
// `Message`, …) are unchanged — plugins manipulate them through the
// context helpers in `component_context.mjs` / `sequence_context.mjs`.

/**
 * @diagram plugins
 *
 * Each parser plugin is a tiny self-contained file that handles ONE
 * PlantUML construct. The engine offers each input line to plugins
 * in registration order; the first plugin that returns `true` wins.
 *
 * To add support for a new PlantUML keyword, drop a new file in
 * `src/parser/plugins/` and append it to the default array in
 * [`plantuml.mjs`](./src/parser/plantuml.mjs). No engine change required.
 */

import { runEngine } from "./engine.mjs";
import { explodeBraces, stripComment } from "./utils.mjs";
import { createComponentContext } from "./component_context.mjs";
import { createSequenceContext } from "./sequence_context.mjs";

// Component plugin registry.
import {
  titlePlugin as componentTitlePlugin,
  closeBracePlugin,
} from "./plugins/component/preamble.mjs";
import { containerPlugin } from "./plugins/component/containers.mjs";
import {
  bracketBoxPlugin,
  usecaseParensPlugin,
  shapeKeywordPlugin,
} from "./plugins/component/shapes.mjs";
import { classBlockPlugin } from "./plugins/component/class_block.mjs";
import { connectionPlugin } from "./plugins/component/connections.mjs";
import { noteOfPlugin, noteFreePlugin, noteBlockPlugin } from "./plugins/component/notes.mjs";

// Sequence plugin registry.
import { titlePlugin as sequenceTitlePlugin } from "./plugins/sequence/preamble.mjs";
import { participantPlugin } from "./plugins/sequence/participants.mjs";
import { messagePlugin } from "./plugins/sequence/messages.mjs";
import {
  noteSidePlugin,
  noteOverPlugin,
  noteSideBlockPlugin,
  noteOverBlockPlugin,
} from "./plugins/sequence/notes.mjs";

/**
 * Default plugin pipeline for component-style diagrams. Order matters:
 * note / class blocks are tried before the bare-container regex; the
 * greedy connection plugin runs last.
 * @public
 */
export const DEFAULT_COMPONENT_PLUGINS = [
  componentTitlePlugin,
  closeBracePlugin,
  // Block plugins (note, class) come BEFORE container so a `note … of X`
  // line isn't mis-parsed by some other rule, and `class X { … }` isn't
  // captured by the bare-container regex.
  noteBlockPlugin,
  noteOfPlugin,
  noteFreePlugin,
  // class-diagram declarations (incl. `abstract class`, `interface`,
  // `enum`, generics, `extends`, `implements`) — must run before the
  // legacy `shapeKeywordPlugin` so the brace-form variants enter
  // member-collection mode instead of being treated as containers.
  classBlockPlugin,
  shapeKeywordPlugin, // owns the legacy class-block start
  containerPlugin,
  bracketBoxPlugin,
  usecaseParensPlugin,
  connectionPlugin, // last: the regex is greedy
];

/**
 * Default plugin pipeline for sequence diagrams.
 * @public
 */
export const DEFAULT_SEQUENCE_PLUGINS = [
  sequenceTitlePlugin,
  participantPlugin,
  noteSideBlockPlugin,
  noteOverBlockPlugin,
  noteSidePlugin,
  noteOverPlugin,
  messagePlugin,
];

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
 * The parser auto-detects sequence vs. component syntax via the
 * internal `looksLikeSequence` heuristic.
 *
 * @param {string} text  PlantUML source.
 * @param {object} [opts]
 * @param {{component?: any[], sequence?: any[]}} [opts.plugins]
 *   Override the default plugin lists. Useful for adding support for
 *   unsupported PlantUML constructs without forking the library.
 * @param {Partial<typeof DEFAULT_PARSE_LIMITS>} [opts.limits]
 *   Override one or more resource limits. Anything omitted keeps the
 *   default. Pass `null`/`Infinity` to disable a particular limit.
 * @param {"silent"|"warn"|"strict"} [opts.unknownLines]
 *   How to handle PlantUML lines that no plugin consumes. `silent`
 *   (the default, preserves existing behaviour) drops them. `warn`
 *   emits a `console.warn` per line. `strict` throws a `SyntaxError`
 *   listing every unknown line.
 * @returns {import("../model/diagram.mjs").Diagram
 *          | import("../model/diagram.mjs").SequenceDiagram}
 * @public
 */
export function parsePlantUml(text, opts = {}) {
  const componentPlugins = opts.plugins?.component ?? DEFAULT_COMPONENT_PLUGINS;
  const sequencePlugins = opts.plugins?.sequence ?? DEFAULT_SEQUENCE_PLUGINS;
  const limits = { ...DEFAULT_PARSE_LIMITS, ...(opts.limits || {}) };
  const unknownMode = opts.unknownLines ?? "silent";

  if (typeof text !== "string") {
    throw new TypeError("parsePlantUml: `text` must be a string");
  }
  const byteLen = Buffer.byteLength(text, "utf8");
  if (Number.isFinite(limits.maxInputBytes) && byteLen > limits.maxInputBytes) {
    throw new RangeError(
      `parsePlantUml: input is ${byteLen} bytes, exceeds maxInputBytes=${limits.maxInputBytes}`,
    );
  }
  const lines = text.split(/\r?\n/);
  if (Number.isFinite(limits.maxLines) && lines.length > limits.maxLines) {
    throw new RangeError(
      `parsePlantUml: input has ${lines.length} lines, exceeds maxLines=${limits.maxLines}`,
    );
  }

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

  let diagram;
  if (looksLikeSequence(text)) {
    diagram = /** @type {import("../model/diagram.mjs").SequenceDiagram} */ (
      runEngine({
        lines,
        plugins: sequencePlugins,
        ctx: createSequenceContext(),
        onUnknownLine,
      })
    );
  } else {
    diagram = /** @type {import("../model/diagram.mjs").Diagram} */ (
      runEngine({
        lines: explodeBraces(lines),
        plugins: componentPlugins,
        ctx: createComponentContext(),
        onUnknownLine,
      })
    );
  }
  if (unknownMode === "strict" && unknown.length) {
    const detail = unknown
      .slice(0, 10)
      .map((u) => `  line ${u.index + 1}: ${u.line}`)
      .join("\n");
    const more = unknown.length > 10 ? `\n  ...and ${unknown.length - 10} more` : "";
    throw new SyntaxError(`parsePlantUml: ${unknown.length} unknown line(s):\n${detail}${more}`);
  }
  enforceModelLimits(diagram, limits);
  return diagram;
}

/**
 * Walk the parsed model and reject diagrams that exceed `limits`.
 * Counts boxes (incl. notes) across all planes/subplanes and the
 * connection list. Sequence diagrams are bounded by participant +
 * message + note counts.
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
    nodes = (diagram?.participants?.length ?? 0) + (diagram?.notes?.length ?? 0);
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

// Sequence-only keywords trigger the sequence pipeline. `actor` and
// bare `A --> B` arrows alone are not enough — component diagrams use
// them too.
/**
 * Quick heuristic: decide whether `text` should be parsed as a sequence
 * diagram or as a component-style diagram.
 * @param {string} text Raw PlantUML source.
 * @returns {boolean} `true` when the source contains tokens unique to sequence diagrams.
 */
function looksLikeSequence(text) {
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (/^(participant|boundary|control|collections|queue)\b/.test(line)) return true;
  }
  return false;
}
