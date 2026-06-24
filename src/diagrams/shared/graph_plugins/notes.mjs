// PlantUML notes for component-style diagrams.
//
//   note left|right|top|bottom of <id> : text       (single line)
//   note left|right|top|bottom of <id>              (multi-line, ended by `end note`)
//   note "text" as Nx                               (free standing)
//   note on link [: text] / note on link … end note  (after an edge)

import {
  collectBlockLines,
  extractPlantUmlLink,
  normalisePlantUmlText,
  slug,
} from "../../../util/plantuml_utils.mjs";

const NOTE_OF = /^note\s+(left|right|top|bottom)\s+of\s+(.+?)\s*:\s*(.+)$/;
const NOTE_FREE = /^note\s+"([^"]+)"\s+as\s+(\S+)$/;
const NOTE_BLOCK_OPEN = /^note\s+(left|right|top|bottom)\s+of\s+([^:]+?)\s*$/;
const NOTE_ON_LINK = /^note\s+on\s+link\s*:\s*(.+)$/;
const NOTE_ON_LINK_BLOCK_OPEN = /^note\s+on\s+link\s*$/;

/**
 * Resolve method/member targets like `Order::fromJson` to their owning box.
 * @param {string} raw Raw note target token.
 * @returns {string} Box id to attach the note to.
 */
function noteTargetId(raw) {
  const owner = raw.split("::")[0].trim();
  if (
    (owner.startsWith("(") && owner.endsWith(")")) ||
    (owner.startsWith("[") && owner.endsWith("]")) ||
    (owner.startsWith('"') && owner.endsWith('"'))
  ) {
    const label = owner.slice(1, -1);
    return /^[A-Za-z_][\w-]*$/.test(label) ? label : slug(label);
  }
  return owner;
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
    const parsed = extractPlantUmlLink(m[3].trim());
    ctx.queueNote({
      id: ctx.nextNoteId(),
      side: m[1],
      targetId: noteTargetId(m[2]),
      text: normalisePlantUmlText(parsed.text),
      link: parsed.link,
      tooltip: parsed.tooltip,
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
    const parsed = extractPlantUmlLink(m[1]);
    ctx.addBox({
      id: m[2],
      title: normalisePlantUmlText(parsed.text),
      description: "",
      shape: "note",
      stereotype: "",
      link: parsed.link,
      tooltip: parsed.tooltip,
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
      const parsed = extractPlantUmlLink(lines.join("\n"));
      ctx.queueNote({
        id: ctx.nextNoteId(),
        side,
        targetId,
        text: normalisePlantUmlText(parsed.text),
        link: parsed.link,
        tooltip: parsed.tooltip,
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
    const parsed = extractPlantUmlLink(m[1].trim());
    ctx.queueLinkNote({
      id: ctx.nextNoteId(),
      text: normalisePlantUmlText(parsed.text),
      link: parsed.link,
      tooltip: parsed.tooltip,
    });
    return true;
  },
  tryStart(line) {
    if (!NOTE_ON_LINK_BLOCK_OPEN.test(line)) return null;
    return collectBlockLines(/^end\s*note$/i, (lines, ctx) => {
      const parsed = extractPlantUmlLink(lines.join("\n"));
      ctx.queueLinkNote({
        id: ctx.nextNoteId(),
        text: normalisePlantUmlText(parsed.text),
        link: parsed.link,
        tooltip: parsed.tooltip,
      });
    });
  },
};
