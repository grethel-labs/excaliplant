// Approximate text measurement for layout purposes.
//
// Excalidraw renders text using one of the bundled hand-drawn fonts;
// since Excalidraw's switch to Excalifont as the default, we mirror
// that choice in our exports (see `FONT.family` below). The renderer
// never actually shapes glyphs — for sizing we use a fixed average
// glyph ratio empirically tuned for Excalifont. The exporter writes
// the same `fontSize` Excalidraw will use, so visible labels stay
// inside the boxes computed here.

/**
 * Excalidraw `fontFamily` enum mirror. Keep this in sync with
 * Excalidraw upstream (`packages/common/src/constants.ts`); these
 * numeric ids end up verbatim inside the exported `.excalidraw`
 * documents and decide which bundled font Excalidraw will display
 * when the file is opened.
 *
 * @public
 */
export const EXCALIDRAW_FONT_FAMILY = Object.freeze({
  Virgil: 1,
  Helvetica: 2,
  Cascadia: 3,
  LocalFont: 4,
  Excalifont: 5,
  Nunito: 6,
  LilitaOne: 7,
  ComicShanns: 8,
  LiberationSans: 9,
});

/**
 * Font defaults used by the sizing and renderer pipelines. Numeric
 * sizes are in CSS px; `family` matches Excalidraw's font enum (5 =
 * Excalifont — the same hand-drawn typeface the bundled woff2 in
 * `assets/fonts/Excalifont-Regular.woff2` carries, so SVG / PNG
 * exports and re-opening the JSON in Excalidraw all show the same
 * glyphs).
 * @public
 */
export const FONT = {
  family: EXCALIDRAW_FONT_FAMILY.Excalifont,
  sizeTitle: 18,
  sizeDescription: 13,
  sizeEdgeLabel: 12, // connection labels: kept smaller than body text
  sizePlaneTitle: 22,
  sizeSubplaneTitle: 16,
  glyphRatio: 0.51, // average char width / fontSize for Excalifont
  lineHeight: 1.25,
};

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
