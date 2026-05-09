// Deterministic pseudo-random source used by the renderer.
//
// Excalidraw documents carry per-element `seed` and `versionNonce`
// fields that are random in the editor. When *we* generate documents
// from PlantUML, randomness is harmful: it makes diff-based reviews
// noisy and breaks snapshot tests. By default the renderer therefore
// seeds an xorshift32 PRNG from a stable hash of the source label so
// identical inputs produce byte-identical output.
//
// Callers that want non-deterministic output (e.g. live editor
// integrations) can opt in by passing `{ rng: Math.random }` to
// `exportDiagram`.

/**
 * 32-bit FNV-1a hash. Used to derive a stable PRNG seed from a string.
 *
 * @param {string} text
 * @returns {number} Unsigned 32-bit integer.
 * @internal
 */
export function stableHash32(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Always seed with a non-zero value (xorshift would otherwise lock
  // up at zero forever).
  return h >>> 0 || 0x9e3779b9;
}

/**
 * Create a deterministic PRNG returning floats in `[0, 1)`. Uses the
 * xorshift32 algorithm — small, fast, good enough for Excalidraw seeds.
 *
 * @param {number} seed   Unsigned 32-bit integer seed.
 * @returns {() => number}
 * @internal
 */
export function createSeededRng(seed) {
  let state = seed >>> 0 || 0x9e3779b9;
  return function next() {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state >>>= 0;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}
