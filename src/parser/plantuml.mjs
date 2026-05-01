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

import { runEngine } from "./engine.mjs";
import { explodeBraces, stripComment } from "./utils.mjs";
import { createComponentContext } from "./component_context.mjs";
import { createSequenceContext } from "./sequence_context.mjs";

// Component plugin registry.
import { titlePlugin as componentTitlePlugin, closeBracePlugin } from "./plugins/component/preamble.mjs";
import { containerPlugin } from "./plugins/component/containers.mjs";
import {
  bracketBoxPlugin, usecaseParensPlugin, shapeKeywordPlugin,
} from "./plugins/component/shapes.mjs";
import { connectionPlugin } from "./plugins/component/connections.mjs";
import {
  noteOfPlugin, noteFreePlugin, noteBlockPlugin, _resetNoteCounter,
} from "./plugins/component/notes.mjs";

// Sequence plugin registry.
import { titlePlugin as sequenceTitlePlugin } from "./plugins/sequence/preamble.mjs";
import { participantPlugin } from "./plugins/sequence/participants.mjs";
import { messagePlugin } from "./plugins/sequence/messages.mjs";
import {
  noteSidePlugin, noteOverPlugin,
  noteSideBlockPlugin, noteOverBlockPlugin,
} from "./plugins/sequence/notes.mjs";

export const DEFAULT_COMPONENT_PLUGINS = [
  componentTitlePlugin,
  closeBracePlugin,
  // Block plugins (note, class) come BEFORE container so a `note … of X`
  // line isn't mis-parsed by some other rule, and `class X { … }` isn't
  // captured by the bare-container regex.
  noteBlockPlugin,
  noteOfPlugin,
  noteFreePlugin,
  shapeKeywordPlugin,        // owns the class-block start
  containerPlugin,
  bracketBoxPlugin,
  usecaseParensPlugin,
  connectionPlugin,          // last: the regex is greedy
];

export const DEFAULT_SEQUENCE_PLUGINS = [
  sequenceTitlePlugin,
  participantPlugin,
  noteSideBlockPlugin,
  noteOverBlockPlugin,
  noteSidePlugin,
  noteOverPlugin,
  messagePlugin,
];

export function parsePlantUml(text, opts = {}) {
  const componentPlugins = opts.plugins?.component ?? DEFAULT_COMPONENT_PLUGINS;
  const sequencePlugins = opts.plugins?.sequence ?? DEFAULT_SEQUENCE_PLUGINS;

  if (looksLikeSequence(text)) {
    return runEngine({
      lines: text.split(/\r?\n/),
      plugins: sequencePlugins,
      ctx: createSequenceContext(),
    });
  }

  _resetNoteCounter();
  return runEngine({
    lines: explodeBraces(text.split(/\r?\n/)),
    plugins: componentPlugins,
    ctx: createComponentContext(),
  });
}

// Sequence-only keywords trigger the sequence pipeline. `actor` and
// bare `A --> B` arrows alone are not enough — component diagrams use
// them too.
function looksLikeSequence(text) {
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (/^(participant|boundary|control|collections|queue)\b/.test(line)) return true;
  }
  return false;
}
