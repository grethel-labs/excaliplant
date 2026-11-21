/**
 * Stand-in for `src/render/png.mjs` (native resvg binding, Node only). The
 * plugin never calls it; the shared API loads it lazily for `toPng()`.
 */

export function svgToPng() {
  throw new Error(
    "PNG rendering with the native rasteriser is not available in the Obsidian bundle",
  );
}
