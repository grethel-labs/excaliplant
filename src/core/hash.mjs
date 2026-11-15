/**
 * Deterministic hashing and pseudo-random numbers. Output must be stable across
 * runs so generated documents diff cleanly; nothing in the pipeline may call
 * `Math.random`.
 * @module core/hash
 */

/**
 * FNV-1a 32-bit hash.
 * @param {string} text
 * @returns {number} Unsigned 32-bit integer.
 */
export function stableHash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Mulberry32 generator seeded from a 32-bit integer.
 * @param {number} seed
 * @returns {() => number} Function yielding floats in `[0, 1)`.
 */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sequential id factory producing short, stable, Excalidraw-compatible ids.
 * @param {string} prefix
 * @returns {() => string}
 */
export function idFactory(prefix) {
  const base = stableHash32(prefix).toString(36);
  let n = 0;
  return () => `${base}-${(n++).toString(36)}`;
}
