/**
 * SVG → PNG rasterisation through resvg (Node only).
 * @module render/png
 */

import { Resvg } from "@resvg/resvg-js";
import { EXCALIFONT_TTF_PATH } from "./font.mjs";
import { clamp, DEFAULT_LIMITS } from "../core/limits.mjs";

/**
 * @typedef {object} PngOptions
 * @property {number} [width] Output width in pixels (clamped to the configured limits).
 * @property {number} [scale] Scale factor relative to the SVG size when `width` is not set (default 2).
 * @property {string} [background] Background colour.
 */

/**
 * Rasterise an SVG string.
 * @param {string} svg
 * @param {PngOptions & { limits?: import("../core/limits.mjs").Limits }} [options]
 * @returns {Buffer}
 * @public
 */
export function svgToPng(svg, options = {}) {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const m = /<svg[^>]*\bwidth="([\d.]+)"/.exec(svg);
  const intrinsic = m ? Number(m[1]) : 800;
  const target = options.width ?? intrinsic * clamp(options.scale ?? 2, 0.1, 8, 2);
  const width = Math.round(clamp(target, limits.minWidth, limits.maxWidth, 1600));
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: options.background,
    font: {
      fontFiles: [EXCALIFONT_TTF_PATH],
      loadSystemFonts: true,
      defaultFontFamily: "Excalifont",
    },
  });
  return resvg.render().asPng();
}
