/**
 * Small deterministic LRU cache for rendered blocks, with de-duplication of
 * renders that are already in flight.
 * @module markdown/cache
 */

/**
 * @template T
 * @typedef {object} Cache
 * @property {(key: string) => T | undefined} get Returns the value and marks it most recently used.
 * @property {(key: string, value: T, bytes?: number) => void} set
 * @property {(key: string) => boolean} has
 * @property {(key: string) => boolean} delete
 * @property {() => void} clear
 * @property {(key: string, produce: () => Promise<T>, bytesOf?: (value: T) => number) => Promise<T>} memo
 *   Return the cached value, share an in-flight render, or run `produce` and store its result.
 * @property {number} size Number of entries.
 * @property {number} bytes Approximate bytes held.
 */

/**
 * Create an LRU cache. Eviction order depends only on the sequence of calls.
 * @template T
 * @param {{ max?: number, maxBytes?: number }} [options] `max` entries (default 200) and
 *   `maxBytes` of stored payload (default 64 MiB).
 * @returns {Cache<T>}
 * @public
 */
export function createCache(options = {}) {
  const max = Math.max(1, Math.floor(Number(options.max ?? 200)) || 200);
  const maxBytes = Math.max(1, Number(options.maxBytes ?? 64 * 1024 * 1024) || 64 * 1024 * 1024);
  /** @type {Map<string, { value: T, bytes: number }>} */
  const entries = new Map();
  /** @type {Map<string, Promise<T>>} */
  const pending = new Map();
  let total = 0;

  /** @param {string} key */
  function drop(key) {
    const e = entries.get(key);
    if (!e) return false;
    total -= e.bytes;
    return entries.delete(key);
  }

  /** @type {Cache<T>} */
  const cache = {
    get(key) {
      const e = entries.get(key);
      if (!e) return undefined;
      entries.delete(key);
      entries.set(key, e);
      return e.value;
    },
    set(key, value, bytes = 0) {
      drop(key);
      entries.set(key, { value, bytes });
      total += bytes;
      while (entries.size > max || (total > maxBytes && entries.size > 1)) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        drop(oldest);
      }
    },
    has: (key) => entries.has(key),
    delete: drop,
    clear() {
      entries.clear();
      pending.clear();
      total = 0;
    },
    memo(key, produce, bytesOf) {
      const hit = entries.get(key);
      if (hit) {
        entries.delete(key);
        entries.set(key, hit);
        return Promise.resolve(hit.value);
      }
      const running = pending.get(key);
      if (running) return running;
      const p = produce()
        .then((value) => {
          cache.set(key, value, bytesOf ? bytesOf(value) : 0);
          return value;
        })
        .finally(() => {
          pending.delete(key);
        });
      pending.set(key, p);
      return p;
    },
    get size() {
      return entries.size;
    },
    get bytes() {
      return total;
    },
  };
  return cache;
}
