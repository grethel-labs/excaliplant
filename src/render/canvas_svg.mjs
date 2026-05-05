// Canvas-letterboxed SVG export.
//
// Wraps the plain `excalidrawToSvg` output in a fixed-aspect canvas
// so multiple diagrams render at the same proportions (useful when
// embedding several PNGs side-by-side in a document).
//
// This is part of the optional rendering API. The plain SVG path has
// no extra runtime dependencies; the PNG path
// (`./png.mjs`) needs `@resvg/resvg-js` to be installed.

import { excalidrawToSvg, escapeAttr } from "./svg.mjs";
import { EXCALIFONT_FONT_STACK } from "../style/font.mjs";

export const DEFAULT_CANVAS_WIDTH = 1200;
export const MIN_CANVAS_WIDTH = 16;
export const MAX_CANVAS_WIDTH = 16000;
export const DEFAULT_ASPECT_RATIO = { w: 4, h: 3 };

/**
 * Convert an Excalidraw JSON document to an SVG that has been
 * letter-boxed onto a fixed-aspect canvas.
 *
 * @param {object} doc          Excalidraw JSON document.
 * @param {object} [opts]
 * @param {{w:number,h:number}} [opts.aspect]    Canvas aspect ratio.
 * @param {number}              [opts.width]     Canvas width in px.
 * @param {string}              [opts.background] Canvas background fill.
 * @param {number}              [opts.padding]   Inner SVG padding.
 * @returns {string}            A canvas-sized SVG document.
 */
export function excalidrawJsonToCanvasSvg(doc, opts = {}) {
  const aspect = opts.aspect ?? DEFAULT_ASPECT_RATIO;
  const requested = opts.width ?? DEFAULT_CANVAS_WIDTH;
  if (!Number.isFinite(requested) || !Number.isInteger(requested) || requested <= 0) {
    throw new RangeError(`canvas width must be a positive integer (got ${requested})`);
  }
  const width = Math.min(MAX_CANVAS_WIDTH, Math.max(MIN_CANVAS_WIDTH, requested));
  const height = Math.round((width * aspect.h) / aspect.w);
  const background = opts.background ?? "#ffffff";
  const padding = opts.padding ?? 16;

  const inner = excalidrawToSvg(doc, { padding });
  const innerVb = parseViewBox(inner);
  const safeBackground = escapeAttr(background);
  if (!innerVb) return blankCanvas(width, height, safeBackground);

  const scale = Math.min(width / innerVb.w, height / innerVb.h);
  const drawnW = innerVb.w * scale;
  const drawnH = innerVb.h * scale;
  const offsetX = (width - drawnW) / 2;
  const offsetY = (height - drawnH) / 2;

  const innerBody = inner.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

  // The inner SVG starts with a root-level <defs> block (font-face + arrowhead
  // markers).  After we strip the <svg> wrapper that <defs> ends up inside the
  // canvas <g transform>, which prevents Safari and resvg from resolving
  // marker IDs.  Hoist it to the canvas root so it stays a direct child of
  // the outer <svg>.
  const defsMatch = innerBody.match(/^(\s*)(<defs>[\s\S]*?<\/defs>)([\s\S]*)$/);
  const rootDefs = defsMatch ? defsMatch[2] : "";
  const bodyWithoutDefs = defsMatch ? defsMatch[3] : innerBody;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
      `width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" ` +
      `font-family='${EXCALIFONT_FONT_STACK}'>`,
    `<rect width="${width}" height="${height}" fill="${safeBackground}"/>`,
    rootDefs,
    `<g transform="translate(${offsetX} ${offsetY}) scale(${scale}) ` +
      `translate(${-innerVb.x} ${-innerVb.y})">`,
    bodyWithoutDefs,
    `</g>`,
    `</svg>`,
  ].join("");
}

/**
 * Extract the `viewBox` from an SVG document.
 * @param {string} svgText SVG markup as a string.
 * @returns {{x:number,y:number,w:number,h:number}|null} Parsed viewBox, or `null` when the document has none.
 */
function parseViewBox(svgText) {
  const m = svgText.match(/viewBox="([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)"/);
  if (!m) return null;
  return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
}

/**
 * Build an empty SVG canvas filled with `bg`.
 * @param {number} w  Canvas width in pixels.
 * @param {number} h  Canvas height in pixels.
 * @param {string} bg HEX colour for the canvas background.
 * @returns {string}  Self-contained SVG markup.
 * @internal
 */
function blankCanvas(w, h, bg) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
    `viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${bg}"/></svg>`
  );
}
