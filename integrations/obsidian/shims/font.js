/**
 * Browser replacement for `src/render/font.mjs`: the Excalifont woff2 file is
 * embedded in the bundle (esbuild `base64` loader) instead of being read from
 * disk. PNG rasterisation through resvg is not available here, so the TTF
 * path is empty; PNG export uses the browser's canvas instead.
 */

import woff2 from "../../../assets/fonts/Excalifont-Regular.woff2";

export const EXCALIFONT_TTF_PATH = "";

/**
 * `@font-face` rule with the woff2 font inlined as a data URL.
 * @returns {string}
 */
export function excalifontFaceCss() {
  return `@font-face{font-family:"Excalifont";src:url(data:font/woff2;base64,${woff2}) format("woff2");}`;
}
