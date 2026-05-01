// PlantUML notes for component-style diagrams.
//
//   note left|right|top|bottom of <id> : text       (single line)
//   note left|right|top|bottom of <id>              (multi-line, ended by `end note`)
//   note "text" as Nx                               (free standing)

import { unescapeLabel } from "../../utils.mjs";

const NOTE_OF = /^note\s+(left|right|top|bottom)\s+of\s+(\S+)\s*:\s*(.+)$/;
const NOTE_FREE = /^note\s+"([^"]+)"\s+as\s+(\S+)$/;
const NOTE_BLOCK_OPEN = /^note\s+(left|right|top|bottom)\s+of\s+(\S+)\s*$/;

let _counter = 0;
const nextId = () => `note_${_counter++}`;
export function _resetNoteCounter() { _counter = 0; }

export const noteOfPlugin = {
  name: "component.noteOf",
  tryLine(line, ctx) {
    const m = line.match(NOTE_OF);
    if (!m) return false;
    ctx.queueNote({
      id: nextId(),
      side: m[1],
      targetId: m[2],
      text: unescapeLabel(m[3].trim()),
    });
    return true;
  },
};

export const noteFreePlugin = {
  name: "component.noteFree",
  tryLine(line, ctx) {
    const m = line.match(NOTE_FREE);
    if (!m) return false;
    ctx.addBox({
      id: m[2], title: unescapeLabel(m[1]), description: "",
      shape: "note", stereotype: "",
    });
    return true;
  },
};

export const noteBlockPlugin = {
  name: "component.noteBlock",
  tryStart(line) {
    const m = line.match(NOTE_BLOCK_OPEN);
    if (!m) return null;
    const side = m[1];
    const targetId = m[2];
    const lines = [];
    return {
      onLine(l) { lines.push(l); },
      tryEnd(l, ctx) {
        if (!/^end\s*note$/i.test(l)) return false;
        ctx.queueNote({
          id: nextId(), side, targetId,
          text: lines.join("\\n"),
        });
        return true;
      },
    };
  },
};
