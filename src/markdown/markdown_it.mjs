/**
 * markdown-it plugin: renders `plantuml` / `puml` / `uml` fences as inline SVG.
 *
 * markdown-it renders synchronously while excaliplant (ELK) is asynchronous.
 * The plugin bridges the two with a content-addressed cache:
 *
 * - cache hit  → the rule returns the SVG immediately;
 * - cache miss → the rule returns a placeholder
 *   `<div class="excaliplant excaliplant-pending" data-excaliplant-hash="…">`,
 *   starts rendering in the background and calls `onRendered(hash)` when done,
 *   so the host can render again;
 * - `await prerender(md, text)` renders every block up front, so the following
 *   synchronous `md.render(text)` is complete.
 *
 * There is no dependency on markdown-it; only `md.renderer.rules.fence` and
 * `md.parse` are used.
 * @module markdown/markdown_it
 */

import { MARKDOWN_LIMITS } from "./document.mjs";
import {
  altText,
  defaultCache,
  errorHtml,
  inlineHtml,
  mergeAttrs,
  peekBlock,
  renderBlock,
} from "./render.mjs";
import { createCache } from "./cache.mjs";
import { parseInfo } from "./scan.mjs";

/**
 * @typedef {import("./render.mjs").BlockOptions & {
 *   onRendered?: (hash: string) => void,
 *   shareFont?: boolean,
 *   budget?: Partial<import("./document.mjs").MarkdownBudget>,
 * }} MarkdownItOptions
 */

/**
 * @typedef {object} PluginState
 * @property {import("./render.mjs").BlockOptions} base
 * @property {import("./cache.mjs").Cache<import("./render.mjs").BlockResult>} cache
 * @property {((hash: string) => void) | undefined} onRendered
 * @property {boolean} shareFont
 * @property {{ maxBlocks: number, maxTotalSourceBytes: number }} budget
 */

/** @type {WeakMap<object, PluginState>} */
const states = new WeakMap();

/** Per-render bookkeeping keyed by the `env` object markdown-it passes around. */
/** @type {WeakMap<object, { blocks: number, bytes: number }>} */
const envUsage = new WeakMap();

/**
 * @param {string} content
 */
function stripNewline(content) {
  let s = content;
  if (s.endsWith("\n")) s = s.slice(0, -1);
  if (s.endsWith("\r")) s = s.slice(0, -1);
  return s;
}

/**
 * Account for one block of an `env`. Returns the render options and, when the
 * budget is exhausted, an error message.
 * @param {PluginState} state
 * @param {object | undefined} env
 * @param {string} source
 * @param {import("./scan.mjs").FenceAttrs} attrs
 * @returns {{ options: import("./render.mjs").BlockOptions, error?: string }}
 */
function admit(state, env, source, attrs) {
  const usage =
    env && typeof env === "object" ? (envUsage.get(env) ?? { blocks: 0, bytes: 0 }) : null;
  if (usage && env) envUsage.set(env, usage);
  const first = !usage || usage.blocks === 0;
  const options = {
    ...mergeAttrs(state.base, attrs),
    cache: state.cache,
    scope: ".excaliplant",
    embedFont: state.base.embedFont !== false && (!state.shareFont || !usage || first),
  };
  if (usage) {
    usage.blocks++;
    usage.bytes += source.length;
    if (usage.blocks > state.budget.maxBlocks) {
      return {
        options,
        error: `Block budget exceeded (at most ${state.budget.maxBlocks} diagrams per document)`,
      };
    }
    if (usage.bytes > state.budget.maxTotalSourceBytes) {
      return { options, error: "Source budget exceeded for this document" };
    }
  }
  return { options };
}

/** @param {string} text */
const escapeHtml = (text) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );

/**
 * markdown-it plugin.
 * @param {any} md markdown-it instance.
 * @param {MarkdownItOptions} [opts] Render options (`theme`, `clean`, `seed`, `width`, `limits`, …),
 *   `cache` (shared `createCache()` result), `onRendered(hash)`, `shareFont` (default true: only the
 *   first diagram of a render embeds Excalifont) and `budget`.
 * @returns {void}
 * @public
 */
export default function excaliplantPlugin(md, opts = {}) {
  if (!md || !md.renderer || !md.renderer.rules) {
    throw new TypeError("excaliplantPlugin expects a markdown-it instance");
  }
  const { onRendered, shareFont, budget, ...rest } = opts ?? {};
  const base = /** @type {import("./render.mjs").BlockOptions} */ (rest);
  // A resolver without identity cannot be keyed, so it gets a private cache.
  const cache =
    base.cache === false
      ? createCache()
      : (base.cache ??
        (base.include && typeof base.includeKey !== "string" ? createCache() : defaultCache));
  const state = {
    base,
    cache,
    onRendered,
    shareFont: shareFont !== false,
    budget: {
      maxBlocks: budget?.maxBlocks ?? MARKDOWN_LIMITS.maxBlocks,
      maxTotalSourceBytes: budget?.maxTotalSourceBytes ?? MARKDOWN_LIMITS.maxTotalSourceBytes,
    },
  };
  states.set(md, state);

  const fallback = md.renderer.rules.fence;
  md.renderer.rules.fence = (
    /** @type {any[]} */ tokens,
    /** @type {number} */ idx,
    /** @type {any} */ options,
    /** @type {any} */ env,
    /** @type {any} */ self,
  ) => {
    const token = tokens[idx];
    const parsed = parseInfo(token.info);
    if (!parsed) {
      return fallback
        ? fallback(tokens, idx, options, env, self)
        : `<pre><code>${escapeHtml(String(token.content))}</code></pre>\n`;
    }
    const source = stripNewline(String(token.content));
    const { options: blockOptions, error } = admit(state, env, source, parsed.attrs);
    if (error) return `${errorHtml(error)}\n`;
    const { hash, result } = peekBlock(source, blockOptions);
    if (result) {
      return result.svg !== undefined
        ? `${inlineHtml(result, altText(result, parsed.attrs))}\n`
        : `${errorHtml(result.error ?? "Rendering failed")}\n`;
    }
    renderBlock(source, blockOptions).then(
      () => state.onRendered?.(hash),
      () => state.onRendered?.(hash),
    );
    return `<div class="excaliplant excaliplant-pending" data-excaliplant-hash="${hash}"></div>\n`;
  };
}

/**
 * Render every PlantUML block of `markdown` into the plugin's cache so that
 * a following synchronous `md.render(markdown)` is complete.
 * @param {any} md markdown-it instance with {@link excaliplantPlugin} installed.
 * @param {string} markdown
 * @param {object} [env] Environment passed to `md.parse` (not retained).
 * @returns {Promise<import("./render.mjs").BlockResult[]>} One result per block, in document order.
 * @public
 */
export async function prerender(md, markdown, env = {}) {
  const state = states.get(md);
  if (!state)
    throw new TypeError("excaliplantPlugin is not installed on this markdown-it instance");
  const tokens = /** @type {any[]} */ (md.parse(String(markdown), env));
  // Fresh bookkeeping: prerender mirrors what a clean `md.render` will do.
  const probe = {};
  /** @type {import("./render.mjs").BlockResult[]} */
  const results = [];
  for (const token of tokens) {
    if (token.type !== "fence") continue;
    const parsed = parseInfo(token.info);
    if (!parsed) continue;
    const source = stripNewline(String(token.content));
    const { options, error } = admit(state, probe, source, parsed.attrs);
    if (error) {
      results.push({ hash: "", diagnostics: [], error });
      continue;
    }
    results.push(await renderBlock(source, options));
  }
  return results;
}

excaliplantPlugin.prerender = prerender;
export { createCache };
