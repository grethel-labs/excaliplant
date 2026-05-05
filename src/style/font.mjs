// Inline Excalifont so exported SVGs and PNGs render text in the same
// hand-drawn typeface that Excalidraw uses on screen.
//
// Excalidraw ships Excalifont as a multi-subset family. We bundle the
// Latin subset (U+20-7E plus common punctuation). SVG output embeds the
// compact woff2 as a data URL, while PNG output points resvg at the
// decompressed TrueType copy because resvg/fontdb does not load woff2
// files from `fontFiles`.
//
// The font is OFL-licensed; the upstream copy lives at
// excalidraw/excalidraw on GitHub. The OFL notice is preserved in
// `THIRD_PARTY_NOTICES.md` alongside the binary.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const WOFF2_FONT_PATH = path.resolve(
  here,
  "..",
  "..",
  "assets",
  "fonts",
  "Excalifont-Regular.woff2",
);
const TTF_FONT_PATH = path.resolve(here, "..", "..", "assets", "fonts", "Excalifont-Regular.ttf");

/** Family name used inside the SVG `font-family` attribute. */
export const EXCALIFONT_FAMILY = "Excalifont";
/** Absolute filesystem path to the bundled woff2. */
export const EXCALIFONT_FONT_PATH = WOFF2_FONT_PATH;
/** Absolute filesystem path to the bundled TrueType copy used by resvg. */
export const EXCALIFONT_RASTER_FONT_PATH = TTF_FONT_PATH;

/** @type {Buffer | null} */
let _woff2 = null;

/**
 * Returns the bundled Excalifont woff2 bytes. Cached after the first
 * call so subsequent renders share one buffer.
 * @returns {Buffer}
 * @public
 */
export function getExcalifontWoff2() {
  if (!_woff2) _woff2 = readFileSync(WOFF2_FONT_PATH);
  return _woff2;
}

/**
 * Returns a `data:font/woff2;base64,…` URL with the inlined font.
 * @returns {string}
 * @public
 */
export function getExcalifontDataUrl() {
  return `data:font/woff2;base64,${getExcalifontWoff2().toString("base64")}`;
}

/**
 * Returns a complete `@font-face { … }` rule ready to drop inside an
 * SVG `<style>` block.
 * @returns {string}
 * @public
 */
export function getExcalifontFontFace() {
  return `@font-face{font-family:"${EXCALIFONT_FAMILY}";src:url(${getExcalifontDataUrl()}) format("woff2");font-display:swap;}`;
}

/**
 * Stack containing Excalifont plus OS-default cursive fallbacks. Used
 * so renderers that sandbox `<style>` (some Markdown sanitisers do)
 * still produce a recognisable hand-drawn look.
 */
export const EXCALIFONT_FONT_STACK = `"${EXCALIFONT_FAMILY}", "Segoe Print", "Comic Sans MS", "Apple Chancery", cursive`;
