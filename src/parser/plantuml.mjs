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
  shapeKeywordPlugin, // owns the class-block start
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
 * Parse a PlantUML source string into the input-agnostic diagram model.
 * The parser auto-detects sequence vs. component syntax via the
 * internal `looksLikeSequence` heuristic.
 *
 * @param {string} text  PlantUML source.
 * @param {object} [opts]
 * @param {{component?: any[], sequence?: any[]}} [opts.plugins]
 *   Override the default plugin lists. Useful for adding support for
 *   unsupported PlantUML constructs without forking the library.
 * @returns {import("../model/diagram.mjs").Diagram
 *          | import("../model/diagram.mjs").SequenceDiagram}
 * @public
 */
export function parsePlantUml(text, opts = {}) {
  const componentPlugins = opts.plugins?.component ?? DEFAULT_COMPONENT_PLUGINS;
  const sequencePlugins = opts.plugins?.sequence ?? DEFAULT_SEQUENCE_PLUGINS;

  if (looksLikeSequence(text)) {
    return /** @type {import("../model/diagram.mjs").SequenceDiagram} */ (
      runEngine({
        lines: text.split(/\r?\n/),
        plugins: sequencePlugins,
        ctx: createSequenceContext(),
      })
    );
  }

  return /** @type {import("../model/diagram.mjs").Diagram} */ (
    runEngine({
      lines: explodeBraces(text.split(/\r?\n/)),
      plugins: componentPlugins,
      ctx: createComponentContext(),
    })
  );
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
