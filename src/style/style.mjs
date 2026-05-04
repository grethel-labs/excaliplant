// Renderer style configuration.
//
// Exposes a single mutable `STYLE` document and helpers to load it
// from a JSON or YAML file. All other style-related modules read from
// `getStyle()` (or the live-view `FONT` proxy in `text.mjs`) so a
// caller can override the look once and have parser/sizing/renderer
// all pick up the new values.
//
// The shape is intentionally small and flat. Fields are validated /
// merged on load: unknown keys are ignored, malformed values fall
// back to defaults, and the loader never throws on missing files —
// the caller decides how strict to be.
//
// YAML support is intentionally a tiny embedded subset (key/value,
// nested maps via 2-space indentation, comments, scalars). Diagrams
// don't need full YAML; bringing in a YAML dependency for that would
// be over-engineering.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Excalidraw `fontFamily` enum mirror, kept here so `style.mjs` is
 * importable without pulling in `text.mjs` (which now depends on
 * this file).
 *
 * @public
 */
export const EXCALIDRAW_FONT_FAMILY = Object.freeze({
  Virgil: 1,
  Helvetica: 2,
  Cascadia: 3,
  LocalFont: 4,
  Excalifont: 5,
  Nunito: 6,
  LilitaOne: 7,
  ComicShanns: 8,
  LiberationSans: 9,
});

/**
 * Default renderer style. Cloned on every `setStyle` call so the
 * exported reference stays immutable.
 *
 * @public
 */
export const DEFAULT_STYLE = deepFreeze({
  font: {
    /** Excalidraw font enum id, family name (e.g. "Excalifont"), or numeric id. */
    family: "Excalifont",
    sizeTitle: 18,
    sizeDescription: 13,
    sizeEdgeLabel: 10,
    sizePlaneTitle: 22,
    sizeSubplaneTitle: 16,
    /** Average glyph width / fontSize, calibrated for Excalifont. */
    glyphRatio: 0.51,
    lineHeight: 1.25,
    /** Lower bound used by the auto-shrink pass in `sizing.mjs`. */
    minSize: 8,
  },
  shape: {
    /** Roughness for boxes / ellipses / planes (Excalidraw default look). */
    roughness: 1,
    /** Roughness for connection lines and arrows. 0 == perfectly straight. */
    connectionRoughness: 0,
    /** Roughness for the edge-label chip rectangle. */
    edgeLabelRoughness: 0,
    fillStyle: "solid",
    strokeWidth: 2,
  },
  edgeLabel: {
    /** When true, the chip background uses the connection's stroke colour. */
    useLineColor: true,
    /** Override colour when `useLineColor` is false (or as fallback). */
    backgroundColor: "#444444",
    /** Text colour drawn on top of the chip. */
    textColor: "#ffffff",
    /** Stroke colour for the chip outline. Empty string == match background. */
    strokeColor: "",
    paddingX: 6,
    paddingY: 2,
    /** Hard cap on chip width in px. */
    maxWidth: 160,
    /** Minimum gap to leave around arrowheads at the segment ends. */
    segmentMargin: 24,
  },
  text: {
    /** Auto-shrink long titles/descriptions until they fit. */
    autoShrink: true,
    /** Lower bound for the auto-shrink pass. */
    minFontSize: 8,
  },
});

/** @type {any} */
let _activeStyle = clone(DEFAULT_STYLE);

/**
 * Returns the active style document. Always returns the same live
 * object; callers should not mutate it directly — use `setStyle`.
 *
 * @returns {typeof DEFAULT_STYLE}
 * @public
 */
export function getStyle() {
  return _activeStyle;
}

/**
 * Replace the active style with a deep-merged copy of the defaults +
 * the supplied partial. Returns the new active style.
 *
 * @param {Record<string, any>} partial Partial style overrides.
 * @returns {typeof DEFAULT_STYLE}
 * @public
 */
export function setStyle(partial) {
  _activeStyle = mergeDeep(clone(DEFAULT_STYLE), partial || {});
  return _activeStyle;
}

/**
 * Reset to the built-in defaults.
 *
 * @returns {typeof DEFAULT_STYLE}
 * @public
 */
export function resetStyle() {
  _activeStyle = clone(DEFAULT_STYLE);
  return _activeStyle;
}

/**
 * Load a style document from JSON or YAML on disk and apply it.
 *
 * The file extension decides the parser: `.json`, `.yaml` or `.yml`.
 * Returns the active style after merge. Returns the unchanged active
 * style and emits a console warning when the file is missing or
 * cannot be parsed (so a missing user override never breaks rendering).
 *
 * @param {string} filePath Absolute or workspace-relative path.
 * @returns {typeof DEFAULT_STYLE}
 * @public
 */
export function loadStyleFromFile(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return _activeStyle;
  }
  let parsed;
  try {
    const raw = readFileSync(filePath, "utf8");
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".yaml" || ext === ".yml") parsed = parseSimpleYaml(raw);
    else parsed = JSON.parse(raw);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[style] failed to load ${filePath}: ${/** @type {Error} */ (err).message}`);
    return _activeStyle;
  }
  return setStyle(parsed);
}

/**
 * Resolve the configured `font.family` to the numeric Excalidraw id
 * required by the JSON document.
 *
 * @param {string|number} family Family name or numeric id.
 * @returns {number}
 * @public
 */
export function resolveFontFamilyId(family) {
  if (typeof family === "number" && Number.isFinite(family)) return family;
  if (typeof family === "string") {
    const id = /** @type {Record<string, number>} */ (EXCALIDRAW_FONT_FAMILY)[family];
    if (typeof id === "number") return id;
  }
  return EXCALIDRAW_FONT_FAMILY.Excalifont;
}

// ── helpers ───────────────────────────────────────────────────────────────

/**
 * @param {any} obj
 * @returns {any}
 */
function clone(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(clone);
  const out = /** @type {Record<string, any>} */ ({});
  for (const k of Object.keys(obj)) out[k] = clone(obj[k]);
  return out;
}

/**
 * @param {any} target
 * @param {any} source
 * @returns {any}
 */
function mergeDeep(target, source) {
  if (source === null || typeof source !== "object" || Array.isArray(source)) return target;
  for (const k of Object.keys(source)) {
    // Defend against prototype pollution: only merge own, non-magic keys.
    if (k === "__proto__" || k === "prototype" || k === "constructor") continue;
    const sv = source[k];
    if (sv && typeof sv === "object" && !Array.isArray(sv)) {
      if (!target[k] || typeof target[k] !== "object") target[k] = {};
      mergeDeep(target[k], sv);
    } else {
      target[k] = sv;
    }
  }
  return target;
}

/**
 * @param {any} obj
 * @returns {any}
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  return Object.freeze(obj);
}

// ── tiny YAML subset ──────────────────────────────────────────────────────
//
// Supports:
//   - `# comments` (full-line and end-of-line outside quoted scalars)
//   - `key: value` pairs
//   - Nested mappings via consistent indentation (any width, but the
//     same width across siblings)
//   - Scalar values: numbers, true/false/null, single- or double-quoted
//     strings, or bare strings.
// Sequences (`- item`) are intentionally not supported — style configs
// don't need them, and a line-by-line parser keeps the surface tiny
// and ReDoS-free.

/**
 * @param {string} text
 * @returns {Record<string, any>}
 */
export function parseSimpleYaml(text) {
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  const root = /** @type {Record<string, any>} */ ({});
  /** @type {{indent:number,obj:Record<string,any>}[]} */
  const stack = [{ indent: -1, obj: root }];

  for (let raw of lines) {
    // Strip comments outside quotes.
    raw = stripYamlComment(raw);
    if (!raw.trim()) continue;
    const indent = raw.length - raw.trimStart().length;
    const body = raw.trim();
    const idx = body.indexOf(":");
    if (idx < 0) continue; // sequences not supported, skip
    const key = body.slice(0, idx).trim();
    const value = body.slice(idx + 1).trim();
    if (!isValidYamlKey(key)) continue;

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].obj;

    if (value === "") {
      const child = /** @type {Record<string, any>} */ ({});
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else {
      parent[key] = parseYamlScalar(value);
    }
  }
  return root;
}

/**
 * @param {string} line
 * @returns {string}
 */
function stripYamlComment(line) {
  let out = "";
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === "#" && !inSingle && !inDouble) break;
    out += c;
  }
  return out;
}

/**
 * @param {string} k
 * @returns {boolean}
 */
function isValidYamlKey(k) {
  if (!k) return false;
  if (k === "__proto__" || k === "prototype" || k === "constructor") return false;
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(k);
}

/**
 * @param {string} raw
 * @returns {any}
 */
function parseYamlScalar(raw) {
  if (raw === "null" || raw === "~") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}
