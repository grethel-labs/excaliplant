// Optional PNG rasterisation for SVGs produced by `./svg.mjs` or
// `./canvas_svg.mjs`.
//
// PNG support is **optional**: it pulls in `@resvg/resvg-js` which is
// declared as an `optionalDependencies` entry in `package.json`. If
// the dependency is missing, `svgToPng` throws a clear error so
// callers know to `npm install @resvg/resvg-js`.

const DEFAULT_PNG_WIDTH = 4800;          // 4× the default 1200 SVG canvas.

/**
 * Rasterise an SVG document to PNG.
 *
 * @param {string} svgText
 * @param {object} [opts]
 * @param {number} [opts.width=4800]    Output PNG width in px.
 * @param {string} [opts.background="#ffffff"]
 * @returns {Promise<Buffer>}           PNG bytes.
 */
export async function svgToPng(svgText, opts = {}) {
  let Resvg;
  try {
    ({ Resvg } = await import("@resvg/resvg-js"));
  } catch (err) {
    throw new Error(
      "PNG export requires the optional dependency '@resvg/resvg-js'. "
      + "Install it with: npm install @resvg/resvg-js",
      { cause: err },
    );
  }

  const width = opts.width ?? DEFAULT_PNG_WIDTH;
  const resvg = new Resvg(svgText, {
    fitTo: { mode: "width", value: width },
    background: opts.background ?? "#ffffff",
    font: { loadSystemFonts: true },
  });
  return resvg.render().asPng();
}
