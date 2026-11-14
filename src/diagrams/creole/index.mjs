/**
 * Standalone Creole documents (`@startcreole`): headings, lists, tables,
 * emphasis, links and separators rendered as a text card.
 * @module diagrams/creole
 */

import { defineDiagram } from "../../core/registry.mjs";
import { createMeta } from "../../syntax/commons.mjs";
import { layoutText } from "../../layout/measure.mjs";
import { roleStyle } from "../../draw/theme.mjs";

export default defineDiagram({
  kind: "creole",
  title: "Creole text",
  starts: ["creole"],
  parse: (lines) => ({ meta: createMeta(), text: lines.map((l) => l.text).join("\n").trim() }),
  layout: (model, ctx) => ({ laid: layoutText(model.text, { fontSize: ctx.theme.fontSize, align: "left", maxWidth: 720 }) }),
  draw: (laid, c) => {
    const s = roleStyle(c.theme, "legend");
    c.rect(-20, -16, laid.laid.width + 40, laid.laid.height + 32, { fill: c.theme.background, stroke: s.stroke, strokeWidth: 1, rounded: true });
    c.richText(laid.laid, 0, 0, { color: s.text, align: "left" });
  },
});
