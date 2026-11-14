/**
 * Access to the bundled Excalifont files (Node only).
 * @module render/font
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const WOFF2 = fileURLToPath(new URL("../../assets/fonts/Excalifont-Regular.woff2", import.meta.url));
const TTF = fileURLToPath(new URL("../../assets/fonts/Excalifont-Regular.ttf", import.meta.url));

/** Absolute path to the TrueType font used for PNG rasterisation. */
export const EXCALIFONT_TTF_PATH = TTF;

/** @type {string | null} */
let faceCss = null;

/**
 * `@font-face` rule with the woff2 font inlined as a data URL.
 * @returns {string}
 */
export function excalifontFaceCss() {
  if (faceCss === null) {
    const b64 = readFileSync(WOFF2).toString("base64");
    faceCss = `@font-face{font-family:"Excalifont";src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
  }
  return faceCss;
}
