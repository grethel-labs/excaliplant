// Sequence-diagram notes.
//
// Supports:
//   note|hnote|rnote left|right [of <id>] [#color] : text
//   note|hnote|rnote over A[, B] [#color] : text
//   note|hnote|rnote across [#color] : text
//   block variants ended by end note / endhnote / endrnote.

import { collectBlockLines, unescapeLabel } from "../../../util/plantuml_utils.mjs";

const NOTE_PREFIX = String.raw`(?:/\s*)?(note|hnote|rnote)`;
const COLOR = String.raw`(?:\s+(#[\w-]+))?`;
const SEQ_NOTE_SIDE = new RegExp(
  String.raw`^${NOTE_PREFIX}\s+(left|right)(?:\s+of\s+(\S+))?${COLOR}\s*:\s*(.+)$`,
  "i",
);
const SEQ_NOTE_OVER = new RegExp(
  String.raw`^${NOTE_PREFIX}\s+over\s+(\S+)(?:\s*,\s*(\S+))?${COLOR}\s*:\s*(.+)$`,
  "i",
);
const SEQ_NOTE_ACROSS = new RegExp(String.raw`^${NOTE_PREFIX}\s+across${COLOR}\s*:\s*(.+)$`, "i");
const SEQ_NOTE_BLOCK_OPEN_SIDE = new RegExp(
  String.raw`^${NOTE_PREFIX}\s+(left|right)(?:\s+of\s+(\S+))?${COLOR}\s*$`,
  "i",
);
const SEQ_NOTE_BLOCK_OPEN_OVER = new RegExp(
  String.raw`^${NOTE_PREFIX}\s+over\s+(\S+)(?:\s*,\s*(\S+))?${COLOR}\s*$`,
  "i",
);
const SEQ_NOTE_BLOCK_OPEN_ACROSS = new RegExp(
  String.raw`^${NOTE_PREFIX}\s+across${COLOR}\s*$`,
  "i",
);
const NOTE_BLOCK_END = /^end\s*(?:note|hnote|rnote)$/i;

/**
 * Resolve the lifeline that a `note left/right` should attach to when no
 * explicit target is given: the most recently declared participant.
 * @param {Record<string, any>} ctx Sequence parser context (carries `diagram`).
 * @returns {import("../../../general/model/diagram.mjs").Participant|undefined} The latest lifeline, or `undefined` when the diagram is empty.
 */
const lastParticipant = (ctx) => ctx.diagram.participants[ctx.diagram.participants.length - 1];

/**
 * @param {Record<string, any>} ctx
 * @returns {{target: import("../../../general/model/diagram.mjs").Participant, target2: import("../../../general/model/diagram.mjs").Participant|null}|null}
 */
function acrossTargets(ctx) {
  const participants = ctx.diagram.participants;
  if (!participants.length) return null;
  return { target: participants[0], target2: participants[participants.length - 1] };
}

/**
 * Single-line side note: `note left|right [of <id>] : text`.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const noteSidePlugin = {
  name: "sequence.noteSide",
  tryLine(line, ctx) {
    const m = line.match(SEQ_NOTE_SIDE);
    if (!m) return false;
    const [, shape, side, targetId, color, text] = m;
    const target = targetId ? ctx.ensureParticipant(targetId) : lastParticipant(ctx);
    if (!target) return true;
    ctx.addNote({ text: unescapeLabel(text), side, target, shape: shape.toLowerCase(), color });
    return true;
  },
};

/**
 * Single-line `note over A[, B] : text`.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const noteOverPlugin = {
  name: "sequence.noteOver",
  tryLine(line, ctx) {
    const m = line.match(SEQ_NOTE_OVER);
    if (!m) return false;
    const [, shape, aId, bId, color, text] = m;
    ctx.addNote({
      text: unescapeLabel(text),
      side: "over",
      target: ctx.ensureParticipant(aId),
      target2: bId ? ctx.ensureParticipant(bId) : null,
      shape: shape.toLowerCase(),
      color,
    });
    return true;
  },
};

/**
 * Single-line `note across : text`.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const noteAcrossPlugin = {
  name: "sequence.noteAcross",
  tryLine(line, ctx) {
    const m = line.match(SEQ_NOTE_ACROSS);
    if (!m) return false;
    const [, shape, color, text] = m;
    const targets = acrossTargets(ctx);
    if (!targets) return true;
    ctx.addNote({
      text: unescapeLabel(text),
      side: "over",
      target: targets.target,
      target2: targets.target2,
      shape: shape.toLowerCase(),
      color,
    });
    return true;
  },
};

/**
 * Multi-line side-note block.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const noteSideBlockPlugin = {
  name: "sequence.noteSideBlock",
  tryStart(line, ctx) {
    const m = line.match(SEQ_NOTE_BLOCK_OPEN_SIDE);
    if (!m) return null;
    const [, shape, side, targetId, color] = m;
    const target = targetId ? ctx.ensureParticipant(targetId) : lastParticipant(ctx);
    return collectBlockLines(NOTE_BLOCK_END, (lines, ctx2) => {
      if (target) {
        ctx2.addNote({
          text: lines.join("\n"),
          side,
          target,
          target2: null,
          shape: shape.toLowerCase(),
          color,
        });
      }
    });
  },
};

/**
 * Multi-line `note over` block.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const noteOverBlockPlugin = {
  name: "sequence.noteOverBlock",
  tryStart(line, ctx) {
    const m = line.match(SEQ_NOTE_BLOCK_OPEN_OVER);
    if (!m) return null;
    const [, shape, aId, bId, color] = m;
    const a = ctx.ensureParticipant(aId);
    const b = bId ? ctx.ensureParticipant(bId) : null;
    return collectBlockLines(NOTE_BLOCK_END, (lines, ctx2) => {
      ctx2.addNote({
        text: lines.join("\n"),
        side: "over",
        target: a,
        target2: b,
        shape: shape.toLowerCase(),
        color,
      });
    });
  },
};

/**
 * Multi-line `note across` block.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const noteAcrossBlockPlugin = {
  name: "sequence.noteAcrossBlock",
  tryStart(line, ctx) {
    const m = line.match(SEQ_NOTE_BLOCK_OPEN_ACROSS);
    if (!m) return null;
    const [, shape, color] = m;
    const targets = acrossTargets(ctx);
    return collectBlockLines(NOTE_BLOCK_END, (lines, ctx2) => {
      if (targets) {
        ctx2.addNote({
          text: lines.join("\n"),
          side: "over",
          target: targets.target,
          target2: targets.target2,
          shape: shape.toLowerCase(),
          color,
        });
      }
    });
  },
};
