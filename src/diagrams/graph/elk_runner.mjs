/**
 * The only place that talks to ELK. Two jobs:
 *
 * 1. Load `elkjs` lazily. The 1.5 MB bundle costs ~0.85 s to evaluate, and only
 *    graph diagrams need it, so it is imported on the first layout that really
 *    has to run ELK (never for sequence, gantt, mindmap, … and never on a
 *    layout-cache hit).
 * 2. Cache layouts. ELK is deterministic and the dominant cost of a render, so
 *    results are kept in a bounded LRU keyed by the complete ELK input graph
 *    (structure, sizes, labels and every layout option). Anything that is not
 *    part of that graph — theme, seed, colours, stroke style — does not change
 *    the key, so re-rendering the same diagram in another theme is a cache hit.
 *
 * The key is the serialized graph itself rather than a 32-bit hash: a hash
 * collision would silently return the geometry of a different diagram.
 * @module diagrams/graph/elk_runner
 */

import { LAYOUT_CACHE_LIMITS } from "../../core/limits.mjs";

/** @type {Promise<any> | null} */
let elkPromise = null;
let elkLoaded = false;

/** @typedef {{ result: any, bytes: number }} CacheEntry */
/** Insertion order is recency order: the first key is the least recently used. @type {Map<string, CacheEntry>} */
const cache = new Map();
let cacheBytes = 0;
const stats = { hits: 0, misses: 0, elkRuns: 0 };

/**
 * Load `elkjs` once and create one shared instance. A failed import is not
 * remembered, so a later call can retry.
 * @returns {Promise<any>}
 */
function loadElk() {
  if (!elkPromise) {
    // elkjs ends with `if (typeof document === "undefined" && typeof self !== "undefined")
    // self.onmessage = …`: evaluated inside a Web Worker it installs its own message
    // handler. Loaded lazily, that replaces the handler of the host that runs the
    // library in the worker (the playground), which then never answers again. Put the
    // host's handler back right after ELK has been created, before any message can be
    // dispatched.
    const scope = /** @type {any} */ (globalThis);
    const hostHandler = scope.onmessage;
    elkPromise = import("elkjs/lib/elk.bundled.js")
      .then((mod) => {
        // The worker script is evaluated lazily by the constructor, not by the import.
        const elk = new /** @type {any} */ (mod).default();
        if (scope.onmessage !== hostHandler) scope.onmessage = hostHandler;
        elkLoaded = true;
        return elk;
      })
      .catch((err) => {
        elkPromise = null;
        throw err;
      });
  }
  return elkPromise;
}

/**
 * Whether `elkjs` has been imported in this process (diagnostics and tests).
 * @returns {boolean}
 */
export function isElkLoaded() {
  return elkLoaded;
}

/**
 * Drop every cached layout and reset the counters. Internal; used by tests.
 */
export function clearLayoutCache() {
  cache.clear();
  cacheBytes = 0;
  stats.hits = 0;
  stats.misses = 0;
  stats.elkRuns = 0;
}

/**
 * Cache counters and current size. Internal; used by tests and the benchmark.
 * @returns {{ hits: number, misses: number, elkRuns: number, entries: number, bytes: number }}
 */
export function layoutCacheStats() {
  return { ...stats, entries: cache.size, bytes: cacheBytes };
}

/**
 * Deep copy of plain JSON data (objects, arrays, primitives), which is all ELK
 * produces. Written by hand because `structuredClone` is not available in every
 * host the library is bundled for (the Obsidian bundle runs in a sandbox
 * without it); unlike `JSON.parse(JSON.stringify(x))` it keeps `-0`.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneJson(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return /** @type {any} */ (value.map(cloneJson));
  /** @type {any} */
  const out = {};
  for (const key of Object.keys(value)) out[key] = cloneJson(/** @type {any} */ (value)[key]);
  return out;
}

/**
 * @param {string} key
 * @param {any} result Freshly computed ELK result; a private copy is stored.
 */
function remember(key, result) {
  const { maxEntries, maxBytes, maxEntryBytes } = LAYOUT_CACHE_LIMITS;
  const bytes = 2 * (key.length + JSON.stringify(result).length);
  if (bytes > maxEntryBytes) return;
  cache.set(key, { result: cloneJson(result), bytes });
  cacheBytes += bytes;
  while (cache.size > maxEntries || cacheBytes > maxBytes) {
    const oldest = /** @type {string} */ (cache.keys().next().value);
    cacheBytes -= /** @type {CacheEntry} */ (cache.get(oldest)).bytes;
    cache.delete(oldest);
  }
}

/**
 * Lay out an ELK graph. ELK writes its result into the object it is given, so
 * callers must pass a graph they will not reuse. The returned object is always
 * private to the caller: on a cache hit it is a deep copy, so mutating it can
 * never change what later renders see.
 * @param {any} graph ELK input graph (plain JSON; consumed by the call).
 * @param {{ cache?: boolean }} [options] `cache: false` bypasses the cache entirely.
 * @returns {Promise<any>}
 */
export async function runElk(graph, options = {}) {
  const useCache = options.cache !== false;
  // The key has to be taken before ELK mutates the graph.
  const key = useCache ? JSON.stringify(graph) : "";
  if (useCache) {
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      stats.hits++;
      return cloneJson(hit.result);
    }
    stats.misses++;
  }
  const elk = await loadElk();
  stats.elkRuns++;
  const result = await elk.layout(graph);
  if (useCache) remember(key, result);
  return result;
}
