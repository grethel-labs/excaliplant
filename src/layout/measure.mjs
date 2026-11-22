/**
 * Text measurement and rich-text line layout using real Excalifont advance
 * widths, so boxes fit their labels in Excalidraw, SVG and PNG alike.
 * @module layout/measure
 */

import { ADVANCES, UNITS_PER_EM, FALLBACK_ADVANCE } from "./font_metrics.mjs";
import { parseCreole } from "../syntax/creole.mjs";

/** Excalidraw's line-height multiplier for Excalifont. */
export const LINE_HEIGHT = 1.25;

/** @type {Map<number, number>} */
const WIDTHS = new Map();
for (let i = 0; i < ADVANCES.length; i += 2) WIDTHS.set(ADVANCES[i], ADVANCES[i + 1]);

/**
 * Advance width of a single code point in font units.
 * @param {number} cp
 */
function advance(cp) {
  const w = WIDTHS.get(cp);
  if (w !== undefined) return w;
  if (cp >= 0x2e80) return UNITS_PER_EM; // CJK & emoji: roughly square
  return FALLBACK_ADVANCE;
}

/**
 * Width of a single-line string in pixels.
 * @param {string} text
 * @param {number} fontSize
 * @param {{ mono?: boolean, bold?: boolean }} [style]
 * @returns {number}
 */
export function textWidth(text, fontSize, style = {}) {
  if (style.mono) return [...text].length * fontSize * 0.6;
  let units = 0;
  for (const ch of text)
    units += ch === "\t" ? advance(32) * 4 : advance(/** @type {number} */ (ch.codePointAt(0)));
  const w = (units / UNITS_PER_EM) * fontSize;
  return style.bold ? w * 1.04 : w;
}

/**
 * Size of a plain multi-line string.
 * @param {string} text
 * @param {number} fontSize
 * @returns {{ width: number, height: number }}
 */
export function measurePlain(text, fontSize) {
  const lines = text.split("\n");
  return {
    width: Math.max(0, ...lines.map((l) => textWidth(l, fontSize))),
    height: lines.length * fontSize * LINE_HEIGHT,
  };
}

/**
 * Greedy word wrap of a plain string.
 * @param {string} text
 * @param {number} fontSize
 * @param {number} maxWidth
 * @returns {string}
 */
export function wrapPlain(text, fontSize, maxWidth) {
  if (!(maxWidth > 0)) return text;
  return text
    .split("\n")
    .map((line) => {
      if (textWidth(line, fontSize) <= maxWidth) return line;
      const words = line.split(/(\s+)/);
      /** @type {string[]} */
      const out = [];
      let cur = "";
      for (const w of words) {
        if (cur && textWidth(cur + w, fontSize) > maxWidth && w.trim()) {
          out.push(cur.trimEnd());
          cur = w.trimStart();
        } else cur += w;
      }
      if (cur) out.push(cur.trimEnd());
      return out.join("\n");
    })
    .join("\n");
}

/**
 * A positioned piece of rich text, relative to the block's top-left corner.
 * @typedef {(
 *  | { kind: "text", x: number, y: number, text: string, fontSize: number, width: number, run: import("../syntax/creole.mjs").Run }
 *  | { kind: "rule", x1: number, y1: number, x2: number, y2: number, full?: boolean, wave?: boolean }
 *  | { kind: "box", x: number, y: number, w: number, h: number, fill?: string }
 * )} RichItem
 */

/**
 * @typedef {object} RichLayout
 * @property {number} width
 * @property {number} height
 * @property {RichItem[]} items
 * @property {boolean} plain True when the text has no markup (single style).
 * @property {string} text Plain text (for plain layouts).
 * @property {number} fontSize
 * @property {boolean} bold Whole block is bold (plain layouts only).
 */

/**
 * Lay out a label with creole markup.
 * @param {string} text Label text (already unescaped).
 * @param {{ fontSize: number, align?: "left" | "center" | "right", maxWidth?: number, bold?: boolean }} options
 * @returns {RichLayout}
 */
export function layoutText(text, options) {
  const fontSize = options.fontSize;
  const align = options.align ?? "center";
  const source = options.maxWidth ? wrapMarkup(text, fontSize, options.maxWidth) : text;
  const rich = parseCreole(source);
  const lh = fontSize * LINE_HEIGHT;
  /** @type {RichItem[]} */
  const items = [];
  /** @type {{ items: RichItem[], width: number }[]} */
  const rows = [];
  let y = 0;
  let plain = true;

  for (const block of rich.blocks) {
    if (block.kind === "hr") {
      rows.push({
        items: [{ kind: "rule", x1: 0, y1: y + lh / 2, x2: 0, y2: y + lh / 2, full: true }],
        width: 0,
      });
      y += lh;
      plain = false;
      continue;
    }
    if (block.kind === "table") {
      const t = layoutTable(block.rows ?? [], fontSize, y);
      rows.push({ items: t.items, width: t.width });
      y += t.height;
      plain = false;
      continue;
    }
    let size = fontSize;
    let prefix = "";
    let indent = 0;
    if (block.kind === "heading")
      size = fontSize * ([1.5, 1.3, 1.15, 1.0][(block.level ?? 1) - 1] ?? 1);
    if (block.kind === "bullet") {
      indent = ((block.level ?? 1) - 1) * fontSize;
      prefix = "• ";
    }
    if (block.kind === "numbered") {
      indent = ((block.level ?? 1) - 1) * fontSize;
      prefix = `${block.number}. `;
    }
    if (block.kind !== "line") plain = false;
    const runs = prefix ? [{ text: prefix }, ...block.runs] : block.runs;
    if (runs.length > 1 || hasStyle(runs[0])) plain = false;
    /** @type {RichItem[]} */
    const rowItems = [];
    let x = indent;
    const lineH = Math.max(size, ...runs.map((r) => r.size ?? 0)) * LINE_HEIGHT;
    for (const run of runs) {
      const rs = (run.size ?? size) * (run.script ? 0.7 : 1);
      const w = textWidth(run.text, rs, options.bold ? { ...run, bold: true } : run);
      const ry =
        y +
        (lineH - rs * LINE_HEIGHT) +
        (run.script === "sub" ? rs * 0.3 : run.script === "sup" ? -rs * 0.2 : 0);
      if (run.background)
        rowItems.push({ kind: "box", x, y: ry, w, h: rs * LINE_HEIGHT, fill: run.background });
      rowItems.push({ kind: "text", x, y: ry, text: run.text, fontSize: rs, width: w, run });
      if (run.underline || run.wave) {
        const uy = ry + rs * 1.1;
        rowItems.push({ kind: "rule", x1: x, y1: uy, x2: x + w, y2: uy, wave: run.wave });
      }
      if (run.strike) {
        const sy = ry + rs * 0.68;
        rowItems.push({ kind: "rule", x1: x, y1: sy, x2: x + w, y2: sy });
      }
      x += w;
    }
    rows.push({ items: rowItems, width: x });
    y += lineH;
  }

  const width = Math.max(0, ...rows.map((r) => r.width));
  for (const row of rows) {
    const shift =
      align === "center" ? (width - row.width) / 2 : align === "right" ? width - row.width : 0;
    for (const it of row.items) {
      if (it.kind === "rule" && it.full) {
        it.x1 = 0;
        it.x2 = width;
      } else if (it.kind === "rule") {
        it.x1 += shift;
        it.x2 += shift;
      } else it.x += shift;
      items.push(it);
    }
  }
  const plainText = rich.blocks.map((b) => b.runs.map((r) => r.text).join("")).join("\n");
  return {
    width,
    height: Math.max(y, rich.blocks.length ? 0 : lh),
    items,
    plain,
    text: plainText,
    fontSize,
    bold: !!options.bold,
  };
}

/** @param {import("../syntax/creole.mjs").Run | undefined} run */
function hasStyle(run) {
  if (!run) return false;
  return Object.keys(run).some(
    (k) =>
      k !== "text" &&
      /** @type {any} */ (run)[k] !== undefined &&
      /** @type {any} */ (run)[k] !== false,
  );
}

/**
 * @param {{ header: boolean, cells: import("../syntax/creole.mjs").Run[][] }[]} rows
 * @param {number} fontSize
 * @param {number} top
 */
function layoutTable(rows, fontSize, top) {
  const pad = fontSize * 0.4;
  const lh = fontSize * LINE_HEIGHT;
  const cols = Math.max(...rows.map((r) => r.cells.length));
  const colW = Array.from(
    { length: cols },
    (_, c) =>
      Math.max(
        ...rows.map((r) =>
          r.cells[c] ? r.cells[c].reduce((s, run) => s + textWidth(run.text, fontSize, run), 0) : 0,
        ),
      ) +
      pad * 2,
  );
  /** @type {RichItem[]} */
  const items = [];
  const width = colW.reduce((a, b) => a + b, 0);
  let y = top;
  for (const row of rows) {
    let x = 0;
    if (row.header) items.push({ kind: "box", x: 0, y, w: width, h: lh + pad });
    row.cells.forEach((cell, c) => {
      let cx = x + pad;
      for (const run of cell) {
        const w = textWidth(run.text, fontSize, run);
        items.push({
          kind: "text",
          x: cx,
          y: y + pad / 2,
          text: run.text,
          fontSize,
          width: w,
          run,
        });
        cx += w;
      }
      x += colW[c];
    });
    items.push({ kind: "rule", x1: 0, y1: y, x2: width, y2: y });
    y += lh + pad;
  }
  items.push({ kind: "rule", x1: 0, y1: y, x2: width, y2: y });
  let x = 0;
  for (let c = 0; c <= cols; c++) {
    items.push({ kind: "rule", x1: x, y1: top, x2: x, y2: y });
    x += colW[c] ?? 0;
  }
  return { items, width, height: y - top };
}

/**
 * Word-wrap text containing markup line by line (markup is measured as plain
 * text, which is close enough for wrapping decisions).
 * @param {string} text
 * @param {number} fontSize
 * @param {number} maxWidth
 */
function wrapMarkup(text, fontSize, maxWidth) {
  return text
    .split("\n")
    .map((line) => (/^\s*\|/.test(line) ? line : wrapPlain(line, fontSize, maxWidth)))
    .join("\n");
}
