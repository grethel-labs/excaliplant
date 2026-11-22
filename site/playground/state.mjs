// Playground state in the URL hash and in localStorage.
//
//   #src=<percent-encoded PlantUML text>      (plain; written by hand or by a language model)
//   #p=<format><payload>
//   format  "z": base64url(deflate-raw(utf8(json)))   (CompressionStream)
//           "r": base64url(utf8(json))                (fallback, uncompressed)
//   json    {"v":1,"s":"<PlantUML source>","o":{<non-default options>}}
//
// Everything that comes from a link or from storage is untrusted and is
// validated again here; nothing in this file touches the DOM.

import { MAX_SOURCE_BYTES, diffOptions, normalizeOptions } from "./options.mjs";

/** Longest hash payload we create. */
export const MAX_HASH_CHARS = 16_000;
/** Longest hash payload we try to read. */
export const MAX_DECODE_CHARS = 64_000;
/** Decompressed JSON larger than this is refused (zip-bomb guard). */
const MAX_JSON_BYTES = MAX_SOURCE_BYTES * 2 + 8192;

export const STORAGE_KEY = "excaliplant.playground.v1";

/**
 * @typedef {object} PlaygroundState
 * @property {string} source
 * @property {import("./options.mjs").PlaygroundOptions} options
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

/** @param {Uint8Array} bytes */
export function toBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * @param {string} text
 * @returns {Uint8Array}
 */
export function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("Not base64url");
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * @param {Uint8Array} bytes
 * @param {"compress" | "decompress"} mode
 * @param {number} limit Maximum output size in bytes.
 * @returns {Promise<Uint8Array>}
 */
async function pipe(bytes, mode, limit) {
  const Stream = mode === "compress" ? CompressionStream : DecompressionStream;
  const stream = new Blob([/** @type {BlobPart} */ (bytes)])
    .stream()
    .pipeThrough(new Stream("deflate-raw"));
  const reader = stream.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Payload too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** @param {unknown} source */
function validSource(source) {
  return typeof source === "string" && encoder.encode(source).length <= MAX_SOURCE_BYTES;
}

/**
 * @param {PlaygroundState} state
 * @returns {string}
 */
function stateJson(state) {
  return JSON.stringify({ v: 1, s: state.source, o: diffOptions(state.options) });
}

/**
 * Encode the state for `#p=…`.
 * @param {PlaygroundState} state
 * @param {{ compress?: boolean }} [opts] `compress: false` forces the fallback format.
 * @returns {Promise<{ ok: true, payload: string } | { ok: false, reason: "too-large" | "too-long" | "failed" }>}
 */
export async function encodeState(state, opts = {}) {
  try {
    if (!validSource(state.source)) return { ok: false, reason: "too-large" };
    const json = encoder.encode(stateJson(state));
    let payload = "";
    if (opts.compress !== false && typeof CompressionStream === "function") {
      try {
        payload = `z${toBase64Url(await pipe(json, "compress", MAX_JSON_BYTES))}`;
      } catch {
        payload = "";
      }
    }
    if (!payload) payload = `r${toBase64Url(json)}`;
    return payload.length > MAX_HASH_CHARS
      ? { ok: false, reason: "too-long" }
      : { ok: true, payload };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * Decode a `#p=` payload. Never throws.
 * @param {string} payload
 * @returns {Promise<PlaygroundState | null>} `null` for anything invalid.
 */
export async function decodeState(payload) {
  try {
    if (typeof payload !== "string" || payload.length < 2 || payload.length > MAX_DECODE_CHARS)
      return null;
    const bytes = fromBase64Url(payload.slice(1));
    let json;
    if (payload[0] === "z") {
      if (typeof DecompressionStream !== "function") return null;
      json = await pipe(bytes, "decompress", MAX_JSON_BYTES);
    } else if (payload[0] === "r") {
      if (bytes.length > MAX_JSON_BYTES) return null;
      json = bytes;
    } else return null;
    return fromJson(JSON.parse(decoder.decode(json)));
  } catch {
    return null;
  }
}

/**
 * Decode a `#src=` value: the PlantUML text, percent-encoded (`%20` for a space,
 * `%0A` for a line break). Options stay at their defaults. Never throws.
 * @param {string} text The part after `#src=`.
 * @returns {PlaygroundState | null} `null` for anything invalid.
 */
export function decodePlainSource(text) {
  try {
    if (typeof text !== "string" || text.length === 0 || text.length > MAX_DECODE_CHARS)
      return null;
    const source = decodeURIComponent(text);
    if (!validSource(source) || source.includes("\0")) return null;
    return { source, options: normalizeOptions(undefined) };
  } catch {
    return null;
  }
}

/**
 * @param {unknown} data Parsed JSON.
 * @returns {PlaygroundState | null}
 */
export function fromJson(data) {
  if (!data || typeof data !== "object") return null;
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.v !== 1 || !validSource(d.s)) return null;
  return { source: /** @type {string} */ (d.s), options: normalizeOptions(d.o) };
}

/**
 * Read the saved state; `null` without storage or with damaged data.
 * @param {Pick<Storage, "getItem"> | null | undefined} storage
 * @returns {PlaygroundState | null}
 */
export function loadSaved(storage) {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return text && text.length < MAX_SOURCE_BYTES * 3 ? fromJson(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

/**
 * Save the state; silently does nothing when storage is unavailable or full.
 * @param {Pick<Storage, "setItem"> | null | undefined} storage
 * @param {PlaygroundState} state
 * @returns {boolean}
 */
export function save(storage, state) {
  try {
    if (!storage || !validSource(state.source)) return false;
    storage.setItem(STORAGE_KEY, stateJson(state));
    return true;
  } catch {
    return false;
  }
}

/**
 * `localStorage`, or `null` when the browser refuses access.
 * @returns {Storage | null}
 */
export function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
