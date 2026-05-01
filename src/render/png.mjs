// PNG rasterisation for SVGs produced by `./svg.mjs` or
// `./canvas_svg.mjs`.
//
// Uses `@resvg/resvg-js` (a runtime dependency of this package). No
// headless browser is involved.

import { Resvg } from "@resvg/resvg-js";

const DEFAULT_PNG_WIDTH = 4800;          // 4× the default 1200 SVG canvas.

/**
 * Rasterise an SVG document to PNG.
 *
 * @param {string} svgText
 * @param {object} [opts]
 * @param {number} [opts.width=4800]    Output PNG width in px.
 * @param {string} [opts.background="#ffffff"]
 * @returns {Buffer}                    PNG bytes.
 */
export function svgToPng(svgText, opts = {}) {
  const width = opts.width ?? DEFAULT_PNG_WIDTH;
  const resvg = new Resvg(svgText, {
    fitTo: { mode: "width", value: width },
    background: opts.background ?? "#ffffff",
    font: { loadSystemFonts: true },
  });
  return resvg.render().asPng();
}
