// Generic component-style connection: `A op B [: label]`.
//
// All arrow flavours (plain, dashed, inheritance, composition, …) are
// decoded by `classifyArrow()`; to support a new arrow operator just
// extend that classifier.

import { classifyArrow, slug, unescapeLabel } from "../../../util/plantuml_utils.mjs";

// Endpoint can be a bare identifier, a bracket/paren/quoted shorthand,
// or a quoted name. The arrow may be flanked by quoted multiplicity
// labels: `Container "1" o-- "0..*" Item : "contains"`.
const CONNECTION_LINE = new RegExp(
  '^(\\[[^\\]]+\\]|\\([^)]+\\)|"[^"]+"|\\S+)' + // from endpoint
    '(?:\\s+"([^"]*)")?' + // optional from-side multiplicity
    "\\s+([-.*o<|>]+(?:\\[[^\\]]+\\])?(?:up|down|left|right|UP|DOWN|LEFT|RIGHT)?[-.*o<|>]*)" + // arrow
    '(?:\\s+"([^"]*)")?' + // optional to-side multiplicity
    '\\s+(\\[[^\\]]+\\]|\\([^)]+\\)|"[^"]+"|\\S+)' + // to endpoint
    "(?:\\s*:\\s*(.+))?$", // optional label
);

/**
 * Normalise a connection endpoint so that bracket / paren shorthands
 * (`[Foo]`, `(Use case)`) and quoted labels resolve to the same
 * identifier the corresponding shape declaration uses.
 * @param {string} raw Raw token captured by the connection regex.
 * @returns {{id: string, shorthand: boolean, portId: string|null}} Identifier suitable for
 *   the box-id lookup table, plus a flag indicating whether the source
 *   used a bracket/paren/quoted shorthand (those should not auto-vivify
 *   a stub class box if the identifier is unknown — they are meant to
 *   reference a previously declared shape).
 */
function normaliseEndpoint(raw) {
  let s = raw.trim();
  const portMatch = s.match(/^([^:]+)::(.+)$/);
  if (portMatch) return { id: portMatch[1], shorthand: false, portId: portMatch[2] };
  if (s.startsWith("[") && s.endsWith("]"))
    return { id: slug(s.slice(1, -1)), shorthand: true, portId: null };
  if (s.startsWith("(") && s.endsWith(")"))
    return { id: slug(s.slice(1, -1)), shorthand: true, portId: null };
  if (s.startsWith('"') && s.endsWith('"'))
    return { id: slug(s.slice(1, -1)), shorthand: true, portId: null };
  return { id: s, shorthand: false, portId: null };
}

/**
 * Generic component-style connection: `A op B [: label]`. All arrow
 * flavours are decoded by `classifyArrow()` — extend that to support
 * a new operator.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const connectionPlugin = {
  name: "component.connection",
  tryLine(line, ctx) {
    const m = line.match(CONNECTION_LINE);
    if (!m) return false;
    const [, rawFrom, fromMul, op, toMul, rawTo, label] = m;
    const arrow = classifyArrow(op);
    if (!arrow) return false;
    const from = normaliseEndpoint(rawFrom);
    const to = normaliseEndpoint(rawTo);
    ctx.queueConnection({
      fromId: from.id,
      toId: to.id,
      fromShorthand: from.shorthand,
      toShorthand: to.shorthand,
      fromPort: from.portId,
      toPort: to.portId,
      label: unescapeLabel(label?.trim() || ""),
      fromMul: fromMul || "",
      toMul: toMul || "",
      ...arrow,
    });
    return true;
  },
};
