/**
 * Render a single PlantUML block to sanitised SVG with a content-addressed cache.
 * @module markdown/render
 */

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { render } from "../api.mjs";
import { THEME_NAMES } from "../draw/theme.mjs";
import { escapeXml } from "../render/svg.mjs";
import { createCache } from "./cache.mjs";
import { sanitizeSvg } from "./sanitize.mjs";

/** Package version; part of every cache key so upgrades never serve stale output. */
export const PACKAGE_VERSION = String(
  /** @type {{ version?: string }} */ (createRequire(import.meta.url)("../../package.json"))
    .version ?? "0",
);

/** Bumped when the markup produced by this module changes. */
const KEY_VERSION = "md1";

/** Cache shared by every caller that does not pass its own `cache`. */
export const defaultCache = createCache({ max: 200 });

/**
 * Options shared by `renderBlock`, `renderMarkdown` and the plugins.
 * @typedef {object} BlockOptions
 * @property {string | import("../draw/theme.mjs").Theme} [theme] Theme name or object.
 * @property {Record<string, string>} [themeColors] Individual colour overrides by theme path.
 * @property {boolean} [clean] Clean strokes instead of the hand-drawn look.
 * @property {boolean} [sketch] Same as `clean`, inverted; wins over `clean`.
 * @property {string | number} [seed] Seed for stroke wobble.
 * @property {number} [width] Rescale the SVG to this pixel width (16–16000).
 * @property {number} [page] Page of a `newpage` diagram.
 * @property {boolean} [strict] Fail on unrecognised lines.
 * @property {Partial<import("../core/limits.mjs").Limits>} [limits] Per-diagram limits.
 * @property {import("../core/preprocess/preprocessor.mjs").IncludeResolver} [include] `!include` resolver.
 * @property {string} [includeKey] Identifies the include resolver's content. Without it, results
 *   rendered with `include` are not stored in the shared cache.
 * @property {Record<string, string | number | boolean>} [defines] Predefined preprocessor variables.
 * @property {Date | null} [date] Date returned by `%date()`.
 * @property {string} [filename] Value of `%filename()`.
 * @property {string} [kind] Force a diagram kind.
 * @property {boolean} [embedFont] Inline Excalifont as a data URL (default true).
 * @property {string} [background] Background colour.
 * @property {string} [scope] CSS scope prefix for the SVG's text rule (inline use).
 * @property {import("./cache.mjs").Cache<BlockResult> | false | null} [cache] Cache to use;
 *   `false` disables caching.
 */

/**
 * @typedef {object} BlockResult
 * @property {string} [svg] Sanitised standalone SVG (absent on error).
 * @property {string} hash Content hash of source + options + package version (16 hex chars).
 * @property {import("../core/diagnostics.mjs").Diagnostic[]} diagnostics
 * @property {string} [error] Readable message when the block could not be rendered.
 * @property {number | null} [line] Line within the block's source the error refers to.
 * @property {string} [kind] Diagram kind.
 * @property {string | null} [title] Plain-text diagram title, if any.
 * @property {boolean} [cached] Whether the result came from the cache.
 */

/**
 * Deterministic JSON with sorted keys; non-JSON values are dropped.
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {string}
 */
function stableStringify(value, depth = 0) {
  if (depth > 8) return '"…"';
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v, depth + 1)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const o = /** @type {Record<string, unknown>} */ (value);
    const keys = Object.keys(o)
      .filter((k) => o[k] !== undefined && typeof o[k] !== "function")
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k], depth + 1)}`).join(",")}}`;
  }
  return "null";
}

/**
 * @param {string} text
 * @returns {string} 16 hex characters.
 */
function hash16(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number | undefined}
 */
function clampWidth(value, min, max) {
  const n = Number(value);
  return value === undefined || value === null || !Number.isFinite(n)
    ? undefined
    : Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Normalise options and compute the cache key. Never throws.
 * @param {string} source
 * @param {BlockOptions} options
 */
function prepare(source, options) {
  const o = options ?? {};
  const sketch = typeof o.sketch === "boolean" ? o.sketch : o.clean === true ? false : undefined;
  const width = clampWidth(o.width, 16, 16_000);
  const embedFont = o.embedFont !== false;
  const scope = typeof o.scope === "string" ? o.scope : "";
  /** @type {string | undefined} */
  let error;
  if (typeof o.theme === "string" && !THEME_NAMES.includes(o.theme)) {
    error = `Unknown theme "${o.theme.slice(0, 40)}" (available: ${THEME_NAMES.join(", ")})`;
  }
  const renderOptions = {
    theme: o.theme,
    themeColors: o.themeColors,
    sketch,
    seed: o.seed,
    page: o.page,
    strict: o.strict,
    limits: o.limits,
    include: o.include,
    defines: o.defines,
    date: o.date,
    filename: o.filename,
    kind: o.kind,
  };
  const material = stableStringify([
    KEY_VERSION,
    PACKAGE_VERSION,
    source,
    {
      ...renderOptions,
      include: o.include ? (o.includeKey ?? "include") : undefined,
      date: o.date instanceof Date && !Number.isNaN(o.date.getTime()) ? o.date.toISOString() : null,
      width,
      embedFont,
      scope,
      background: o.background,
    },
  ]);
  return {
    error,
    sketch,
    width,
    embedFont,
    scope,
    renderOptions,
    background: o.background,
    hash: hash16(material),
    // A resolver without an identity may return different content next time.
    cacheable: !o.include || typeof o.includeKey === "string",
  };
}

/**
 * Cache key (content hash) of a block without rendering it.
 * @param {string} source
 * @param {BlockOptions} [options]
 * @returns {string}
 * @public
 */
export function blockHash(source, options = {}) {
  return prepare(String(source), options).hash;
}

/**
 * Look a block up in the cache without rendering it.
 * @param {string} source
 * @param {BlockOptions} [options]
 * @returns {{ hash: string, result: BlockResult | undefined }}
 * @public
 */
export function peekBlock(source, options = {}) {
  const p = prepare(String(source), options);
  const cache = options.cache === false ? null : (options.cache ?? defaultCache);
  const hit = cache?.get(p.hash);
  return { hash: p.hash, result: hit ? { ...hit, cached: true } : undefined };
}

/**
 * Readable one-line message for any thrown value.
 * @param {unknown} err
 */
function messageOf(err) {
  const raw = err instanceof Error ? err.message : String(err);
  let out = "";
  for (const ch of raw.slice(0, 500)) out += ch.charCodeAt(0) < 0x20 ? " " : ch;
  return out.trim() || "Rendering failed";
}

/**
 * Strip simple markup (`<b>`, `<color:red>`, …) and collapse whitespace.
 * @param {string} text
 */
export function plainText(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "<") {
      const close = text.indexOf(">", i);
      if (close > 0 && close - i <= 64) {
        i = close;
        continue;
      }
    }
    out += text[i];
  }
  return out.replace(/\s+/g, " ").trim().slice(0, 200);
}

/**
 * Render one PlantUML block to a sanitised standalone SVG. Never throws:
 * failures come back as `{ error }`. Results are cached by content hash.
 * @param {string} source PlantUML text (with or without `@startuml`).
 * @param {BlockOptions} [options]
 * @returns {Promise<BlockResult>}
 * @public
 */
export async function renderBlock(source, options = {}) {
  if (typeof source !== "string") {
    return { hash: hash16("invalid"), diagnostics: [], error: "PlantUML source must be a string" };
  }
  const p = prepare(source, options);
  const cache =
    options.cache === false ? null : (options.cache ?? (p.cacheable ? defaultCache : null));
  /** @returns {Promise<BlockResult>} */
  const produce = async () => {
    // Invalid options are cached like any other failure so callers that poll
    // the cache (markdown-it) see the error instead of waiting forever.
    if (p.error) return { hash: p.hash, diagnostics: [], error: p.error };
    try {
      const result = await render(source, p.renderOptions);
      const raw = await result.toSvg({ background: p.background, embedFont: p.embedFont });
      const svg = sanitizeSvg(raw, { scope: p.scope, width: p.width });
      const title = result.model?.meta?.title;
      return {
        svg,
        hash: p.hash,
        diagnostics: result.diagnostics,
        kind: result.kind,
        title: typeof title === "string" ? plainText(title) || null : null,
      };
    } catch (err) {
      const line = /** @type {{ line?: number | null }} */ (err ?? {}).line ?? null;
      return { hash: p.hash, diagnostics: [], error: messageOf(err), line };
    }
  };
  const result = cache
    ? await cache.memo(p.hash, produce, (r) => (r.svg?.length ?? 0) + 256)
    : await produce();
  return cache ? { ...result, diagnostics: result.diagnostics.slice() } : result;
}

/**
 * Merge fence attributes (`{theme=dark clean}`) over base options.
 * @param {BlockOptions} base
 * @param {import("./scan.mjs").FenceAttrs} attrs
 * @returns {BlockOptions}
 */
export function mergeAttrs(base, attrs) {
  /** @type {BlockOptions} */
  const out = { ...base };
  if (attrs.theme !== undefined) out.theme = attrs.theme;
  if (attrs.seed !== undefined) out.seed = attrs.seed;
  if (attrs.width !== undefined) out.width = attrs.width;
  if (attrs.clean !== undefined) {
    out.sketch = !attrs.clean;
    out.clean = attrs.clean;
  }
  return out;
}

/**
 * Accessible label for a rendered block.
 * @param {BlockResult} result
 * @param {import("./scan.mjs").FenceAttrs} [attrs]
 */
export function altText(result, attrs) {
  return attrs?.alt || result.title || "PlantUML diagram";
}

/**
 * Inline HTML for a rendered block.
 * @param {BlockResult} result Must carry `svg`.
 * @param {string} alt
 */
export function inlineHtml(result, alt) {
  return `<div class="excaliplant" role="img" aria-label="${escapeXml(alt)}">${result.svg ?? ""}</div>`;
}

/**
 * Visible error box (escaped message).
 * @param {string} message
 */
export function errorHtml(message) {
  return `<pre class="excaliplant-error" role="alert">PlantUML error: ${escapeXml(message)}</pre>`;
}

/**
 * Normalise a relative asset directory (`assets`, `docs/img`, `../img`).
 * @param {unknown} dir
 * @returns {string} Forward-slash path without trailing slash; `""` for the document directory.
 */
export function normalizeAssetsDir(dir) {
  const text = dir === undefined || dir === null ? "assets" : String(dir);
  if (text.length > 260) throw new RangeError("assetsDir is too long");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (text.charCodeAt(i) < 0x20 || c === "\\" || c === ":" || c === "?" || c === "#") {
      throw new RangeError(`Invalid assetsDir: ${JSON.stringify(text)}`);
    }
  }
  if (text.startsWith("/")) throw new RangeError("assetsDir must be relative");
  return text
    .split("/")
    .filter((s) => s !== "" && s !== ".")
    .join("/");
}

/**
 * Validate a URL prefix for emitted image links (`/img/diagrams`, `assets`, `https://cdn/x`).
 * @param {unknown} prefix
 * @returns {string}
 */
export function normalizeAssetsUrl(prefix) {
  let text = String(prefix);
  if (text.length > 2048) throw new RangeError("assetsUrl is too long");
  while (text.endsWith("/")) text = text.slice(0, -1);
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 0x20 || text[i] === "\\" || text[i] === '"' || text[i] === "<") {
      throw new RangeError("Invalid assetsUrl");
    }
  }
  const colon = text.indexOf(":");
  const firstSlash = text.indexOf("/");
  if (colon >= 0 && (firstSlash < 0 || colon < firstSlash)) {
    const scheme = text.slice(0, colon).toLowerCase();
    if (scheme !== "http" && scheme !== "https") throw new RangeError("Invalid assetsUrl scheme");
  }
  return text;
}

/**
 * Path of an asset file relative to the document, and the URL used to link it.
 * @param {string} hash
 * @param {string} dir Output of {@link normalizeAssetsDir}.
 * @param {string} [urlPrefix] Output of {@link normalizeAssetsUrl}; defaults to `dir`.
 * @returns {{ name: string, url: string }}
 */
export function assetRef(hash, dir, urlPrefix) {
  const name = dir ? `${dir}/${hash}.svg` : `${hash}.svg`;
  const prefix =
    urlPrefix !== undefined
      ? urlPrefix
      : dir
          .split("/")
          .map((s) => (s === ".." ? s : encodeURIComponent(s)))
          .join("/");
  return { name, url: prefix ? `${prefix}/${hash}.svg` : `${hash}.svg` };
}

/**
 * Escape text for use inside Markdown image alt text.
 * @param {string} text
 */
export function escapeMarkdownAlt(text) {
  let out = "";
  for (const ch of text.replace(/\s+/g, " ")) {
    out += "\\`*_[]!<>&".includes(ch) ? `\\${ch}` : ch;
  }
  return out;
}

/** Re-export so callers need one import for cache creation. */
export { createCache };
