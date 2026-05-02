// Inline Excalifont so exported SVGs and PNGs render text in the same
// hand-drawn typeface that Excalidraw uses on screen.
//
// Excalidraw ships Excalifont as a multi-subset family. We bundle the
// Latin subset (U+20-7E plus common punctuation) — that's all our
// labels need, and keeps the inline data URL small (~33 KB base64).
//
// At import time we read the woff2 once and cache:
//   - `EXCALIFONT_WOFF2`        the raw bytes (resvg-js consumes these)
//   - `EXCALIFONT_DATA_URL`     base64 data URL for inlining in SVG
//   - `EXCALIFONT_FONT_FACE`    a `@font-face` rule string ready to
//                               drop inside an SVG `<style>` element
//   - `EXCALIFONT_FAMILY`       the family name ("Excalifont")
//
// The font is OFL-licensed; the upstream copy lives at
// excalidraw/excalidraw on GitHub. The OFL notice is preserved in the
// repo's NOTICE/LICENSE-fonts file alongside the binary.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const FONT_PATH = path.resolve(here, "..", "..", "assets", "fonts", "Excalifont-Regular.woff2");

export const EXCALIFONT_FAMILY = "Excalifont";
export const EXCALIFONT_FONT_PATH = FONT_PATH;
export const EXCALIFONT_WOFF2 = readFileSync(FONT_PATH);
export const EXCALIFONT_DATA_URL =
  `data:font/woff2;base64,${EXCALIFONT_WOFF2.toString("base64")}`;

// `@font-face` rule for embedding inside an SVG `<style>` block. The
// fallback chain after Excalifont keeps text legible if a renderer
// strips `<style>` (some sanitizers do).
export const EXCALIFONT_FONT_FACE =
  `@font-face{font-family:"${EXCALIFONT_FAMILY}";src:url(${EXCALIFONT_DATA_URL}) format("woff2");font-display:swap;}`;

export const EXCALIFONT_FONT_STACK =
  `"${EXCALIFONT_FAMILY}", "Segoe Print", "Comic Sans MS", "Apple Chancery", cursive`;
