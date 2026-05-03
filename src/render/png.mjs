// PNG rasterisation for SVGs produced by `./svg.mjs` or
// `./canvas_svg.mjs`.
//
// Uses `@resvg/resvg-js` (a runtime dependency of this package). No
// headless browser is involved.

import { Resvg } from "@resvg/resvg-js";

import { EXCALIFONT_FONT_PATH } from "../style/font.mjs";

const DEFAULT_PNG_WIDTH = 4800; // 4× the default 1200 SVG canvas.
const MIN_PNG_WIDTH = 16;
const MAX_PNG_WIDTH = 16000; // ~256 MP cap to bound resvg memory.

/**
 * Rasterise an SVG document to PNG.
 *
 * @param {string} svgText
 * @param {object} [opts]
 * @param {number} [opts.width=4800]    Output PNG width in px.
 *                                      Clamped to [16, 16000].
 * @param {string} [opts.background="#ffffff"]
 * @returns {Buffer}                    PNG bytes.
 * @throws {RangeError}                 If `opts.width` is not a positive integer.
 */
export function svgToPng(svgText, opts = {}) {
  const requested = opts.width ?? DEFAULT_PNG_WIDTH;
  if (!Number.isFinite(requested) || !Number.isInteger(requested) || requested <= 0) {
    throw new RangeError(`svgToPng: width must be a positive integer (got ${requested})`);
  }
  const width = Math.min(MAX_PNG_WIDTH, Math.max(MIN_PNG_WIDTH, requested));
  const resvg = new Resvg(svgText, {
    fitTo: { mode: "width", value: width },
    background: opts.background ?? "#ffffff",
    // resvg ignores @font-face / data-URL fonts in the SVG, so we
    // have to point it at the bundled Excalifont woff2 explicitly —
    // otherwise PNG text would fall back to a system font and lose
    // the Excalidraw-style handwriting.
    font: {
      loadSystemFonts: true,
      fontFiles: [EXCALIFONT_FONT_PATH],
      defaultFontFamily: "Excalifont",
    },
  });
  return resvg.render().asPng();
}
