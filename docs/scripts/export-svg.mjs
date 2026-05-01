#!/usr/bin/env node
//
// SVG export.
//
// Converts an Excalidraw JSON document to a stand-alone SVG and
// letter-boxes the result onto a fixed-aspect canvas so every
// rendered diagram has the same proportions in the final README.
//
// Run as a CLI:
//   node docs/scripts/export-svg.mjs <in.excalidraw> <out.svg>
//
// Or import `excalidrawJsonToCanvasSvg(doc, opts)` from another script.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  excalidrawToSvg,
} from "../../src/render/svg.mjs";
import {
  ASPECT_RATIO, CANVAS_WIDTH, CANVAS_HEIGHT,
} from "./config.mjs";

/**
 * @param {object} doc          Excalidraw JSON document.
 * @param {object} [opts]
 * @param {{w:number,h:number}} [opts.aspect=ASPECT_RATIO]
 * @param {number}              [opts.width=CANVAS_WIDTH]
 * @param {string}              [opts.background="#ffffff"]
 * @returns {string}            A canvas-sized, letter-boxed SVG.
 */
export function excalidrawJsonToCanvasSvg(doc, opts = {}) {
  const aspect = opts.aspect ?? ASPECT_RATIO;
  const width = opts.width ?? CANVAS_WIDTH;
  const height = Math.round(width * aspect.h / aspect.w);
  const background = opts.background ?? "#ffffff";

  const inner = excalidrawToSvg(doc, { padding: 16 });
  const innerVb = parseViewBox(inner);
  if (!innerVb) {
    return blankCanvas(width, height, background);
  }

  // Scale inner to fit canvas while preserving its aspect ratio.
  const scale = Math.min(width / innerVb.w, height / innerVb.h);
  const drawnW = innerVb.w * scale;
  const drawnH = innerVb.h * scale;
  const offsetX = (width - drawnW) / 2;
  const offsetY = (height - drawnH) / 2;

  // Strip the outer <svg ...>...</svg> wrapper from `inner` so we can
  // re-host its content inside our canvas. The svg.mjs renderer emits
  // a single root <svg> element with viewBox, so a regex is enough.
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<rect width="${w}" height="${h}" fill="${bg}"/></svg>`;
}

// CLI ----------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , inFile, outFile] = process.argv;
  if (!inFile || !outFile) {
    console.error("usage: export-svg.mjs <in.excalidraw> <out.svg>");
    process.exit(2);
  }
  const doc = JSON.parse(await readFile(inFile, "utf8"));
  const svg = excalidrawJsonToCanvasSvg(doc);
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, svg, "utf8");
  console.log(`  wrote ${path.relative(process.cwd(), outFile)}`);
}
