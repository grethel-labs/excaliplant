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

/**
 * Wrap a single class/interface member signature (e.g.
 * `+foo(bar: number, baz: Map<string, T>): Promise<void>`) at semantically
 * meaningful break points: after `,`, `(`, `)`, `:`, ` `, `|`, `&`.
 * Continuation lines get a small indent so it stays visually clear that
 * they belong to the previous declaration.
 *
 * Falls back to whitespace-based wrapping when no preferred break point
 * fits inside `maxWidth`.
 *
 * @param {string} signature Single member line (no embedded newlines).
 * @param {number} fontSize Font size used for measurement.
 * @param {number} maxWidth Available inner width in px.
 * @param {object} [opts]
 * @param {string} [opts.indent] Continuation indent (defaults to `"  "`).
 * @returns {{ lines:string[], width:number, height:number }}
 * @public
 */
export function wrapMemberSignature(signature, fontSize, maxWidth, opts = {}) {
  const indent = opts.indent ?? "  ";
  const text = String(signature ?? "");
  if (!text) return { lines: [], width: 0, height: 0 };
  const charsPerLine = Math.max(8, Math.floor(maxWidth / (fontSize * FONT.glyphRatio)));
  if (text.length <= charsPerLine) {
    return {
      lines: [text],
      width: text.length * fontSize * FONT.glyphRatio,
      height: fontSize * FONT.lineHeight,
    };
  }
  // Preferred break characters in priority order. Breaking AFTER the
  // character keeps the punctuation glued to the previous line, which
  // mirrors how IDEs typically format long signatures.
  const BREAK_AFTER = new Set([",", "(", ":"]);
  const BREAK_BEFORE = new Set(["|", "&", ")"]);
  const lines = [];
  let remaining = text;
  let isContinuation = false;
  while (remaining.length > 0) {
    const prefix = isContinuation ? indent : "";
    const budget = Math.max(8, charsPerLine - prefix.length);
    if (remaining.length <= budget) {
      lines.push(prefix + remaining);
      break;
    }
    // Search for the latest preferred break point inside the budget.
    let cut = -1;
    for (let i = Math.min(budget, remaining.length - 1); i >= Math.floor(budget / 3); i--) {
      const ch = remaining[i];
      if (BREAK_AFTER.has(ch)) {
        cut = i + 1;
        break;
      }
      if (BREAK_BEFORE.has(ch)) {
        cut = i;
        break;
      }
      if (ch === " ") {
        cut = i;
        break;
      }
    }
    if (cut === -1) {
      // No preferred break point; fall back to a hard cut at the budget
      // boundary to avoid an infinite loop on a single huge token.
      cut = budget;
    }
    lines.push((prefix + remaining.slice(0, cut)).trimEnd());
    remaining = remaining.slice(cut).replace(/^\s+/, "");
    isContinuation = true;
  }
  return {
    lines,
    width: Math.max(0, ...lines.map((l) => l.length * fontSize * FONT.glyphRatio)),
    height: lines.length * fontSize * FONT.lineHeight,
  };
}
