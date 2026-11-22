/**
 * Standalone Creole documents (`@startcreole`): headings, lists, tables,
 * emphasis, links and separators rendered as a text card.
 * @module diagrams/creole
 */

import { defineDiagram } from "../../core/registry.mjs";
import { createMeta } from "../../syntax/commons.mjs";
import { layoutText } from "../../layout/measure.mjs";
import { roleStyle } from "../../draw/theme.mjs";

/** @param {string} line */
const isRule = (line) => /^\s*(-{4,}|={4,}|\.{4,}|_{4,})\s*$/.test(line);

/** @param {string} line */
const isTableRow = (line) => /^\s*\|/.test(line) && /\|\s*$/.test(line);

/**
 * Separate tables from the blocks around them by one blank line, so a table
 * never touches the list above or the paragraph below. Existing blank lines
 * and rules are kept as they are.
 * @param {string[]} lines
 */
export function spaceTables(lines) {
  /** @type {string[]} */
  const out = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    const touches =
      prev !== undefined &&
      prev.trim() !== "" &&
      line.trim() !== "" &&
      isTableRow(line) !== isTableRow(prev);
    if (touches && !isRule(line) && !isRule(prev)) out.push("");
    out.push(line);
  }
  return out;
}

export default defineDiagram({
  kind: "creole",
  title: "Creole text",
  starts: ["creole"],
  parse: (lines) => ({
    meta: createMeta(),
    text: spaceTables(lines.map((l) => l.text))
      .join("\n")
      .trim(),
  }),
  layout: (model, ctx) => ({
    laid: layoutText(model.text, { fontSize: ctx.theme.fontSize, align: "left", maxWidth: 720 }),
  }),
  draw: (laid, c) => {
    const s = roleStyle(c.theme, "legend");
    c.rect(-20, -16, laid.laid.width + 40, laid.laid.height + 32, {
      fill: c.theme.surface ?? c.theme.background,
      stroke: s.stroke,
      strokeWidth: 1,
      rounded: true,
    });
    c.richText(laid.laid, 0, 0, { color: s.text, align: "left" });
  },
});
