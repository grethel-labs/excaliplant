// Excalidraw file-format constants. Centralised here so the version /
// source / element-roundness types only appear once in the codebase
// — Excalidraw's schema occasionally bumps and we want a single
// location to update.
//
// Reference:
//   https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/data/types.ts

/**
 * Top-level metadata emitted on every `.excalidraw` document.
 * @public
 */
export const EXCALIDRAW_SCHEMA = Object.freeze({
  /** File-format type discriminator. */
  type: "excalidraw",
  /** File-format version. Bump when Excalidraw introduces a breaking change. */
  version: 2,
  /** Origin URL written into the document. */
  source: "https://excalidraw.com",
});

/**
 * Roundness presets used by Excalidraw shapes. `proportional` is the
 * default for rectangles when the user toggles "rounded corners" in
 * the editor.
 * @public
 */
export const ROUNDNESS = Object.freeze({
  /** Legacy fixed-radius — mostly kept for compatibility. */
  legacy: 1,
  /** Sharp corners (no roundness object). */
  none: null,
  /** Radius proportional to the shape's smaller side. */
  proportional: { type: 3 },
});
