// Approximate text measurement. Excalidraw uses Virgil (font family 1) at a
// configurable size. We never load the real font here, so we use a fixed
// average glyph ratio that has empirically matched Virgil well enough for
// layout purposes. The exporter writes the same fontSize, so visible labels
// stay inside the boxes computed here.

export const FONT = {
  family: 1,                 // Virgil
  sizeTitle: 18,
  sizeDescription: 13,
  sizePlaneTitle: 22,
  sizeSubplaneTitle: 16,
  glyphRatio: 0.55,          // average char width / fontSize for Virgil
  lineHeight: 1.25,
};

export function measureLine(text, fontSize) {
  if (!text) return { width: 0, height: 0 };
  return {
    width: text.length * fontSize * FONT.glyphRatio,
    height: fontSize * FONT.lineHeight,
  };
}

export function measureWrapped(text, fontSize, maxWidth) {
  if (!text) return { width: 0, height: 0, lines: [] };
  const charsPerLine = Math.max(4, Math.floor(maxWidth / (fontSize * FONT.glyphRatio)));
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) { current = word; continue; }
    if ((current.length + 1 + word.length) <= charsPerLine) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return {
    width: Math.min(maxWidth, Math.max(0, ...lines.map((l) => l.length * fontSize * FONT.glyphRatio))),
    height: lines.length * fontSize * FONT.lineHeight,
    lines,
  };
}
