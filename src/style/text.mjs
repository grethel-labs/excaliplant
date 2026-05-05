// Approximate text measurement for layout purposes.
//
// Excalidraw renders text using one of the bundled hand-drawn fonts;
// since Excalidraw's switch to Excalifont as the default, we mirror
// that choice in our exports (see `FONT.family` below). The renderer
// never actually shapes glyphs — for sizing we use a fixed average
// glyph ratio empirically tuned for Excalifont. The exporter writes
// the same `fontSize` Excalidraw will use, so visible labels stay
// inside the boxes computed here.
//
// Font sizes are sourced from the live style document
// (`src/style/style.mjs`), so loading a custom style.json / style.yaml
// changes wrapping, sizing, and rendering in one place.

import { EXCALIDRAW_FONT_FAMILY, getStyle, resolveFontFamilyId } from "./style.mjs";

export { EXCALIDRAW_FONT_FAMILY };

/**
 * Live view of the active font configuration. Reading e.g.
 * `FONT.sizeTitle` always returns the current value from the active
 * style; `FONT.family` returns the resolved Excalidraw numeric id.
 *
 * @public
 * @type {any}
 */
export const FONT = new Proxy(
  {},
  {
    get(_t, key) {
      const f = /** @type {any} */ (getStyle()).font;
      if (key === "family") return resolveFontFamilyId(f.family);
      return /** @type {any} */ (f)[key];
    },
    has(_t, key) {
      return key === "family" || key in /** @type {any} */ (getStyle()).font;
    },
    ownKeys() {
      return Object.keys(/** @type {any} */ (getStyle()).font);
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    },
  },
);

/**
 * Measure a single-line label.
 *
 * @param {string} text
 * @param {number} fontSize
 * @returns {{ width: number, height: number }}
 * @public
 */
export function measureLine(text, fontSize) {
  if (!text) return { width: 0, height: 0 };
  return {
    width: text.length * fontSize * FONT.glyphRatio,
    height: fontSize * FONT.lineHeight,
  };
}

/**
 * Word-wrap `text` to fit within `maxWidth` and return its bounding
 * box plus the produced lines.
 *
 * @param {string} text
 * @param {number} fontSize
 * @param {number} maxWidth
 * @returns {{ width: number, height: number, lines: string[] }}
 * @public
 */
export function measureWrapped(text, fontSize, maxWidth) {
  if (!text) return { width: 0, height: 0, lines: [] };
  const charsPerLine = Math.max(4, Math.floor(maxWidth / (fontSize * FONT.glyphRatio)));
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (current.length + 1 + word.length <= charsPerLine) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return {
    width: Math.min(
      maxWidth,
      Math.max(0, ...lines.map((l) => l.length * fontSize * FONT.glyphRatio)),
    ),
    height: lines.length * fontSize * FONT.lineHeight,
    lines,
  };
}

/**
 * Word-wrap `text` and shrink the font size when a single token would
 * still exceed `maxWidth` at the requested size. Returns the chosen
 * font size alongside the wrapped lines so the renderer can emit the
 * same size the sizing pass measured.
 *
 * Auto-shrink is governed by the active style: when `text.autoShrink`
 * is `false` the function falls back to the regular `measureWrapped`
 * result without shrinking.
 *
 * @param {string} text
 * @param {number} fontSize
 * @param {number} maxWidth
 * @param {object} [opts]
 * @param {number} [opts.minFontSize] Lower bound; defaults to the active style.
 * @returns {{ fontSize:number, width:number, height:number, lines:string[] }}
 * @public
 */
export function measureFitted(text, fontSize, maxWidth, opts = {}) {
  const style = /** @type {any} */ (getStyle());
  const enabled = style.text?.autoShrink !== false;
  const minSize = Math.max(
    1,
    opts.minFontSize ?? style.text?.minFontSize ?? style.font?.minSize ?? 8,
  );
  let fs = fontSize;
  let wrapped = measureWrapped(text, fs, maxWidth);
  if (!enabled || !text) return { fontSize: fs, ...wrapped };
  // `measureWrapped` clamps its reported width to `maxWidth`. To
  // detect a single token that still overflows we re-measure the raw
  // line widths and compare them against `maxWidth`.
  const rawMaxLineWidth = (/** @type {string[]} */ lines, /** @type {number} */ sz) =>
    Math.max(0, ...lines.map((/** @type {string} */ l) => l.length * sz * FONT.glyphRatio));
  while (fs > minSize && rawMaxLineWidth(wrapped.lines, fs) > maxWidth + 0.5) {
    fs -= 1;
    wrapped = measureWrapped(text, fs, maxWidth);
  }
  return { fontSize: fs, ...wrapped };
}
