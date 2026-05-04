// Generic component-style connection: `A op B [: label]`.
//
// All arrow flavours (plain, dashed, inheritance, composition, …) are
// decoded by `classifyArrow()`; to support a new arrow operator just
// extend that classifier.

import { classifyArrow, slug, unescapeLabel } from "../../utils.mjs";

const CONNECTION_LINE =
  /^(\S+)\s+([-.*o<|>]+(?:up|down|left|right|UP|DOWN|LEFT|RIGHT)?[-.*o<|>]*)\s+(\S+)(?:\s*:\s*(.+))?$/;

/**
 * Normalise a connection endpoint so that bracket / paren shorthands
 * (`[Foo]`, `(Use case)`) and quoted labels resolve to the same
 * identifier the corresponding shape declaration uses.
 * @param {string} raw Raw token captured by the connection regex.
 * @returns {string} Identifier suitable for the box-id lookup table.
 */
function normaliseEndpoint(raw) {
  let s = raw.trim();
  if (s.startsWith("[") && s.endsWith("]")) return slug(s.slice(1, -1));
  if (s.startsWith("(") && s.endsWith(")")) return slug(s.slice(1, -1));
  if (s.startsWith('"') && s.endsWith('"')) return slug(s.slice(1, -1));
  return s;
}

/**
 * Generic component-style connection: `A op B [: label]`. All arrow
 * flavours are decoded by `classifyArrow()` — extend that to support
 * a new operator.
 * @type {import("../../engine.mjs").Plugin}
 */
export const connectionPlugin = {
  name: "component.connection",
  tryLine(line, ctx) {
    const m = line.match(CONNECTION_LINE);
    if (!m) return false;
    const [, rawFrom, op, rawTo, label] = m;
    const arrow = classifyArrow(op);
    if (!arrow) return false;
    const fromId = normaliseEndpoint(rawFrom);
    const toId = normaliseEndpoint(rawTo);
    ctx.queueConnection({
      fromId,
      toId,
      label: unescapeLabel(label?.trim() || ""),
      ...arrow,
    });
    return true;
  },
};
