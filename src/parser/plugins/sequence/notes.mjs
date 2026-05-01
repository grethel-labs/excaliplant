// Sequence-diagram notes.
//
//   note left|right [of <id>] : text
//   note over A[, B] : text
//   plus the multi-line variants ended by `end note`.

import { unescapeLabel } from "../../utils.mjs";

const SEQ_NOTE_SIDE = /^note\s+(left|right)(?:\s+of\s+(\S+))?\s*:\s*(.+)$/;
const SEQ_NOTE_OVER = /^note\s+over\s+(\S+)(?:\s*,\s*(\S+))?\s*:\s*(.+)$/;
const SEQ_NOTE_BLOCK_OPEN_SIDE = /^note\s+(left|right)(?:\s+of\s+(\S+))?\s*$/;
const SEQ_NOTE_BLOCK_OPEN_OVER = /^note\s+over\s+(\S+)(?:\s*,\s*(\S+))?\s*$/;

const lastParticipant = (ctx) => ctx.diagram.participants[ctx.diagram.participants.length - 1];

export const noteSidePlugin = {
  name: "sequence.noteSide",
  tryLine(line, ctx) {
    const m = line.match(SEQ_NOTE_SIDE);
    if (!m) return false;
    const [, side, targetId, text] = m;
    const target = targetId ? ctx.ensureParticipant(targetId) : lastParticipant(ctx);
    if (!target) return true;
    ctx.addNote({ text: unescapeLabel(text), side, target });
    return true;
  },
};

export const noteOverPlugin = {
  name: "sequence.noteOver",
  tryLine(line, ctx) {
    const m = line.match(SEQ_NOTE_OVER);
    if (!m) return false;
    const [, aId, bId, text] = m;
    ctx.addNote({
      text: unescapeLabel(text),
      side: "over",
      target: ctx.ensureParticipant(aId),
      target2: bId ? ctx.ensureParticipant(bId) : null,
    });
    return true;
  },
};

export const noteSideBlockPlugin = {
  name: "sequence.noteSideBlock",
  tryStart(line, ctx) {
    const m = line.match(SEQ_NOTE_BLOCK_OPEN_SIDE);
    if (!m) return null;
    const side = m[1];
    const targetId = m[2];
    const target = targetId ? ctx.ensureParticipant(targetId) : lastParticipant(ctx);
    const lines = [];
    return {
      onLine(l) { lines.push(l); },
      tryEnd(l, ctx2) {
        if (!/^end\s*note$/i.test(l)) return false;
        if (target) {
          ctx2.addNote({ text: lines.join("\n"), side, target, target2: null });
        }
        return true;
      },
    };
  },
};

export const noteOverBlockPlugin = {
  name: "sequence.noteOverBlock",
  tryStart(line, ctx) {
    const m = line.match(SEQ_NOTE_BLOCK_OPEN_OVER);
    if (!m) return null;
    const a = ctx.ensureParticipant(m[1]);
    const b = m[2] ? ctx.ensureParticipant(m[2]) : null;
    const lines = [];
    return {
      onLine(l) { lines.push(l); },
      tryEnd(l, ctx2) {
        if (!/^end\s*note$/i.test(l)) return false;
        ctx2.addNote({ text: lines.join("\n"), side: "over", target: a, target2: b });
        return true;
      },
    };
  },
};
