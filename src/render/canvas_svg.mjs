// Canvas-letterboxed SVG export.
//
// Wraps the plain `excalidrawToSvg` output in a fixed-aspect canvas
// so multiple diagrams render at the same proportions (useful when
// embedding several PNGs side-by-side in a document).
//
// This is part of the optional rendering API. The plain SVG path has
// no extra runtime dependencies; the PNG path
// (`./png.mjs`) needs `@resvg/resvg-js` to be installed.

import { excalidrawToSvg } from "./svg.mjs";

export const DEFAULT_CANVAS_WIDTH = 1200;
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
  const width = opts.width ?? DEFAULT_CANVAS_WIDTH;
  const height = Math.round((width * aspect.h) / aspect.w);
  const background = opts.background ?? "#ffffff";
  const padding = opts.padding ?? 16;

  const inner = excalidrawToSvg(doc, { padding });
  const innerVb = parseViewBox(inner);
  if (!innerVb) return blankCanvas(width, height, background);

  const scale = Math.min(width / innerVb.w, height / innerVb.h);
  const drawnW = innerVb.w * scale;
  const drawnH = innerVb.h * scale;
  const offsetX = (width - drawnW) / 2;
  const offsetY = (height - drawnH) / 2;

  const innerBody = inner.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" `
      + `width="${width}" height="${height}" `
      + `viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${background}"/>`,
    `<g transform="translate(${offsetX} ${offsetY}) scale(${scale}) `
      + `translate(${-innerVb.x} ${-innerVb.y})">`,
    innerBody,
    `</g>`,
    `</svg>`,
  ].join("");
}

function parseViewBox(svgText) {
  const m = svgText.match(/viewBox="([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)"/);
  if (!m) return null;
  return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
}

function blankCanvas(w, h, bg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" `
    + `viewBox="0 0 ${w} ${h}">`
    + `<rect width="${w}" height="${h}" fill="${bg}"/></svg>`;
}
