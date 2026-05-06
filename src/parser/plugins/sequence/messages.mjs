// Sequence-diagram messages.
//
// Operator forms supported:
//   ->     sync
//   -->    reply (dashed)
//   ->>    async open arrowhead
//   <-     reverse
//   <-->   bidirectional
//   ++/--/**/!! lifecycle suffixes after the target

import { unescapeLabel } from "../../utils.mjs";

const SEQ_MESSAGE =
  /^(\S+)\s+((?:<-+>?|-+>>?|<<?-+|<-+|--)+)\s+(\S+)(?:\s+(\+\+|--|\*\*|!!))?(?:\s*:\s*(.*))?$/;

/**
 * Sequence-diagram message: `A op B [: label]`. Operator flavours:
 * `->` sync, `-->` reply (dashed), `->>` async, `<-` reverse, `<-->` bidir.
 * @type {import("../../engine.mjs").Plugin}
 */
export const messagePlugin = {
  name: "sequence.message",
  tryLine(line, ctx) {
    const m = line.match(SEQ_MESSAGE);
    if (!m) return false;
    const [, fromId, op, toId, lifecycle = "", label] = m;
    const from = ctx.ensureParticipant(fromId);
    const to = ctx.ensureParticipant(toId);
    const dashed = op.includes("--");
    const reversed = op.startsWith("<") && !op.endsWith(">");
    const bidir = /<.*>/.test(op);
    const asyncOpen = op.includes(">>") || op.includes("<<");
    const [src, dst] = reversed ? [to, from] : [from, to];
    const msg = ctx.addMessage({
      from: src,
      to: dst,
      label: unescapeLabel(label?.trim() || ""),
      dashed,
      kind: src === dst ? "self" : asyncOpen ? "async" : dashed ? "reply" : "sync",
      startArrowhead: bidir ? (asyncOpen ? "arrow" : "triangle") : null,
      endArrowhead: asyncOpen ? "arrow" : "triangle",
    });
    msg.lifecycle = lifecycle;
    if (lifecycle === "++") {
      ctx.startActivation(dst, "", msg.seq);
    } else if (lifecycle === "--") {
      ctx.endActivation(src, msg.seq);
    } else if (lifecycle === "**") {
      msg.creates = true;
      ctx.markCreated(dst, msg.seq);
    } else if (lifecycle === "!!") {
      msg.destroys = true;
      ctx.markDestroyed(dst, msg.seq);
    }
    return true;
  },
};
