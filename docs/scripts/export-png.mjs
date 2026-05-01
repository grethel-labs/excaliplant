#!/usr/bin/env node
//
// PNG export.
//
// Reads an SVG (typically produced by export-svg.mjs) and rasterises
// it to PNG via @resvg/resvg-js. The PNG inherits the SVG's canvas
// width/height so the README image height stays constant.
//
// CLI:
//   node docs/scripts/export-png.mjs <in.svg> <out.png>

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { CANVAS_WIDTH } from "./config.mjs";

/**
 * @param {string} svgText  An SVG document.
 * @param {object} [opts]
 * @param {number} [opts.width=CANVAS_WIDTH]   Output PNG width in px.
 * @param {string} [opts.background="#ffffff"]
 * @returns {Buffer}        PNG bytes.
 */
export function svgToPng(svgText, opts = {}) {
  const width = opts.width ?? CANVAS_WIDTH;
  const resvg = new Resvg(svgText, {
    fitTo: { mode: "width", value: width },
    background: opts.background ?? "#ffffff",
    font: {
      // resvg falls back to system fonts; we ship no custom fonts so
      // the diagram text should match the system default sans-serif.
      loadSystemFonts: true,
    },
  });
  return resvg.render().asPng();
}

// CLI ----------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , inFile, outFile] = process.argv;
  if (!inFile || !outFile) {
    console.error("usage: export-png.mjs <in.svg> <out.png>");
    process.exit(2);
  }
  const svg = await readFile(inFile, "utf8");
  const png = svgToPng(svg);
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, png);
  console.log(`  wrote ${path.relative(process.cwd(), outFile)}`);
}
