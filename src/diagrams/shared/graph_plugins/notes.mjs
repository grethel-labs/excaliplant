// PlantUML notes for component-style diagrams.
//
//   note left|right|top|bottom of <id> : text       (single line)
//   note left|right|top|bottom of <id>              (multi-line, ended by `end note`)
//   note "text" as Nx                               (free standing)
//   note on link [: text] / note on link … end note  (after an edge)

import { collectBlockLines, unescapeLabel } from "../../../util/plantuml_utils.mjs";

const NOTE_OF = /^note\s+(left|right|top|bottom)\s+of\s+(\S+)\s*:\s*(.+)$/;
const NOTE_FREE = /^note\s+"([^"]+)"\s+as\s+(\S+)$/;
const NOTE_BLOCK_OPEN = /^note\s+(left|right|top|bottom)\s+of\s+(\S+)\s*$/;
const NOTE_ON_LINK = /^note\s+on\s+link\s*:\s*(.+)$/;
const NOTE_ON_LINK_BLOCK_OPEN = /^note\s+on\s+link\s*$/;

/**
 * Resolve method/member targets like `Order::fromJson` to their owning box.
 * @param {string} raw Raw note target token.
 * @returns {string} Box id to attach the note to.
 */
function noteTargetId(raw) {
  return raw.split("::")[0];
}

/**
 * Single-line note: `note <side> of <id> : text`.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const noteOfPlugin = {
  name: "component.noteOf",
  tryLine(line, ctx) {
    const m = line.match(NOTE_OF);
    if (!m) return false;
    ctx.queueNote({
      id: ctx.nextNoteId(),
      side: m[1],
      targetId: noteTargetId(m[2]),
      text: unescapeLabel(m[3].trim()),
    });
    return true;
  },
};

/**
 * Free-floating note declared as a stand-alone box: `note "text" as Nx`.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const noteFreePlugin = {
  name: "component.noteFree",
  tryLine(line, ctx) {
    const m = line.match(NOTE_FREE);
    if (!m) return false;
    ctx.addBox({
      id: m[2],
      title: unescapeLabel(m[1]),
      description: "",
      shape: "note",
      stereotype: "",
    });
    return true;
  },
};

/**
 * Multi-line note block, terminated by `end note`.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const noteBlockPlugin = {
  name: "component.noteBlock",
  tryStart(line) {
    const m = line.match(NOTE_BLOCK_OPEN);
    if (!m) return null;
    const side = m[1];
    const targetId = noteTargetId(m[2]);
    return collectBlockLines(/^end\s*note$/i, (lines, ctx) => {
      ctx.queueNote({
        id: ctx.nextNoteId(),
        side,
        targetId,
        text: lines.join("\\n"),
      });
    });
  },
};

/**
 * Attach a note to the most recently parsed connection.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const noteOnLinkPlugin = {
  name: "component.noteOnLink",
  tryLine(line, ctx) {
    const m = line.match(NOTE_ON_LINK);
    if (!m) return false;
    ctx.queueLinkNote({ id: ctx.nextNoteId(), text: unescapeLabel(m[1].trim()) });
    return true;
  },
  tryStart(line) {
    if (!NOTE_ON_LINK_BLOCK_OPEN.test(line)) return null;
    return collectBlockLines(/^end\s*note$/i, (lines, ctx) => {
      ctx.queueLinkNote({ id: ctx.nextNoteId(), text: lines.join("\n") });
    });
  },
};
