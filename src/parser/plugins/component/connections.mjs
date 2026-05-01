// Generic component-style connection: `A op B [: label]`.
//
// All arrow flavours (plain, dashed, inheritance, composition, …) are
// decoded by `classifyArrow()`; to support a new arrow operator just
// extend that classifier.

import { classifyArrow, unescapeLabel } from "../../utils.mjs";

const CONNECTION_LINE = /^(\S+)\s+([-.*o<|>]+(?:up|down|left|right|UP|DOWN|LEFT|RIGHT)?[-.*o<|>]*)\s+(\S+)(?:\s*:\s*(.+))?$/;

export const connectionPlugin = {
  name: "component.connection",
  tryLine(line, ctx) {
    const m = line.match(CONNECTION_LINE);
    if (!m) return false;
    const [, fromId, op, toId, label] = m;
    const arrow = classifyArrow(op);
    if (!arrow) return false;
    ctx.queueConnection({
      fromId, toId,
      label: unescapeLabel(label?.trim() || ""),
      ...arrow,
    });
    return true;
  },
};
