/**
 * Resource limits for untrusted PlantUML input. Every expensive path in the
 * pipeline reads its budget from here so callers can tighten (or, carefully,
 * relax) them in one place.
 * @module core/limits
 */

/**
 * @typedef {object} Limits
 * @property {number} maxInputBytes Maximum UTF-8 size of the source text.
 * @property {number} maxLines Maximum number of source lines after preprocessing.
 * @property {number} maxLineLength Maximum characters per line.
 * @property {number} maxPreprocessSteps Maximum preprocessor instructions executed.
 * @property {number} maxPreprocessDepth Maximum nested procedure/function/include depth.
 * @property {number} maxLoopIterations Maximum iterations of a single `!while`/`!foreach`.
 * @property {number} maxNodes Maximum nodes/participants/tasks per diagram.
 * @property {number} maxEdges Maximum edges/messages per diagram.
 * @property {number} maxElements Maximum Excalidraw elements in the output document.
 * @property {number} maxTextLength Maximum characters in a single label.
 * @property {number} minWidth Minimum raster/canvas width in pixels.
 * @property {number} maxWidth Maximum raster/canvas width in pixels.
 * @property {number} maxBlocks Maximum `@start…@end` blocks per document.
 */

/** @type {Readonly<Limits>} */
export const DEFAULT_LIMITS = Object.freeze({
  maxInputBytes: 2 * 1024 * 1024,
  maxLines: 50_000,
  maxLineLength: 20_000,
  maxPreprocessSteps: 200_000,
  maxPreprocessDepth: 64,
  maxLoopIterations: 10_000,
  maxNodes: 5_000,
  maxEdges: 10_000,
  maxElements: 200_000,
  maxTextLength: 10_000,
  minWidth: 16,
  maxWidth: 16_000,
  maxBlocks: 100,
});

/**
 * Budget of the process-wide graph layout cache (`diagrams/graph/elk_runner`).
 * The cache is bounded twice: by entry count and by an estimate of the memory
 * it holds, so it can never grow without limit. An entry larger than
 * `maxEntryBytes` is not cached at all (it would evict everything else).
 * Byte figures are estimates: two bytes per character of the key and of the
 * serialized result.
 * @type {Readonly<{ maxEntries: number, maxBytes: number, maxEntryBytes: number }>}
 */
export const LAYOUT_CACHE_LIMITS = Object.freeze({
  maxEntries: 64,
  maxBytes: 16 * 1024 * 1024,
  maxEntryBytes: 4 * 1024 * 1024,
});

/**
 * Merge user overrides into the defaults, ignoring non-finite or negative values.
 * @param {Partial<Limits>} [overrides]
 * @returns {Limits}
 */
export function resolveLimits(overrides) {
  /** @type {Limits} */
  const out = { ...DEFAULT_LIMITS };
  if (!overrides) return out;
  for (const key of Object.keys(DEFAULT_LIMITS)) {
    const value = /** @type {any} */ (overrides)[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      /** @type {any} */ (out)[key] = value;
    }
  }
  return out;
}

/**
 * Clamp a numeric option into `[min, max]`, falling back when it is not finite.
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
export function clamp(value, min, max, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
