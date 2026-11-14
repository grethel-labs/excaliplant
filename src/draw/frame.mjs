/**
 * Diagram chrome shared by all diagram types: title, header, footer, caption,
 * legend and mainframe, placed around the already drawn diagram body.
 * @module draw/frame
 */

import { layoutText } from "../layout/measure.mjs";
import { roleStyle } from "./theme.mjs";

const GAP = 20;

/**
 * @param {import("./canvas.mjs").Canvas} canvas
 * @param {import("../syntax/commons.mjs").DiagramMeta} meta
 */
export function decorate(canvas, meta) {
  const theme = canvas.theme;
  let b = canvas.bounds();
  if (b.w === 0 && b.h === 0) b = { x: 0, y: 0, w: 0, h: 0 };

  if (meta.legend && meta.legend.text.trim()) {
    const s = roleStyle(theme, "legend");
    const laid = layoutText(meta.legend.text, { fontSize: s.fontSize * 0.9, align: "left" });
    const w = laid.width + 24;
    const h = laid.height + 20;
    const x = meta.legend.h === "left" ? b.x : meta.legend.h === "right" ? b.x + b.w - w : b.x + (b.w - w) / 2;
    const y = meta.legend.v === "top" ? b.y - h - GAP : b.y + b.h + GAP;
    canvas.group(() => {
      canvas.rect(x, y, w, h, { fill: s.fill, stroke: s.stroke, strokeWidth: s.strokeWidth, rounded: true });
      canvas.richText(laid, x + 12, y + 10, { color: s.text, align: "left" });
    });
    b = canvas.bounds();
  }

  if (meta.caption) {
    const s = roleStyle(theme, "caption");
    const laid = layoutText(meta.caption, { fontSize: s.fontSize });
    canvas.richText(laid, b.x + (b.w - laid.width) / 2, b.y + b.h + GAP / 2, { color: s.text });
    b = canvas.bounds();
  }

  if (meta.title) {
    const s = roleStyle(theme, "title");
    const laid = layoutText(meta.title, { fontSize: s.fontSize });
    const y = b.y - laid.height - GAP;
    canvas.richText(laid, b.x + (b.w - laid.width) / 2, y, { color: s.text });
    b = canvas.bounds();
  }

  if (meta.header) {
    const s = roleStyle(theme, "header");
    const laid = layoutText(meta.header.text, { fontSize: s.fontSize, align: meta.header.align });
    const x = meta.header.align === "left" ? b.x : meta.header.align === "right" ? b.x + b.w - laid.width : b.x + (b.w - laid.width) / 2;
    canvas.richText(laid, x, b.y - laid.height - GAP / 2, { color: s.text, align: meta.header.align });
    b = canvas.bounds();
  }

  if (meta.footer) {
    const s = roleStyle(theme, "footer");
    const laid = layoutText(meta.footer.text, { fontSize: s.fontSize, align: meta.footer.align });
    const x = meta.footer.align === "left" ? b.x : meta.footer.align === "right" ? b.x + b.w - laid.width : b.x + (b.w - laid.width) / 2;
    canvas.richText(laid, x, b.y + b.h + GAP / 2, { color: s.text, align: meta.footer.align });
    b = canvas.bounds();
  }

  if (meta.mainframe) {
    const s = roleStyle(theme, "mainframe");
    const laid = layoutText(meta.mainframe, { fontSize: s.fontSize * 0.9 });
    const tabW = laid.width + 24;
    const tabH = laid.height + 8;
    const x = b.x - GAP;
    const y = b.y - GAP - tabH;
    const w = Math.max(b.w + GAP * 2, tabW + 20);
    const h = b.h + GAP * 2 + tabH;
    canvas.rect(x, y, w, h, { stroke: s.stroke, strokeWidth: s.strokeWidth });
    canvas.line(
      [
        [x, y + tabH],
        [x + tabW, y + tabH],
        [x + tabW + 10, y + tabH - 10],
        [x + tabW + 10, y],
      ],
      { stroke: s.stroke, strokeWidth: s.strokeWidth },
    );
    canvas.richText(laid, x + 12, y + 4, { color: s.text });
  }
}
