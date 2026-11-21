/**
 * Markdown preview integration. VS Code calls `extendMarkdownIt(md)` and the
 * preview renders synchronously, while excaliplant renders asynchronously.
 * The markdown-it plugin bridges the two with a cache: a miss produces a
 * placeholder and a background render, and `onRendered` refreshes the preview.
 * @module vscode/markdown
 */

import { createCache, excaliplantPlugin, prerender } from "./engine.mjs";
import { blockOptions } from "./options.mjs";

/** Documents larger than this are not pre-rendered while typing. */
const PRERENDER_MAX_CHARS = 1024 * 1024;
const REFRESH_DELAY_MS = 80;
const PRERENDER_DELAY_MS = 400;

/**
 * @typedef {object} MarkdownDeps
 * @property {any} vscode
 * @property {() => import("./options.mjs").RenderContext} getContext Current settings; read on every (re)install.
 * @property {(message: string) => void} [log]
 */

/**
 * @param {MarkdownDeps} deps
 */
export function createMarkdownIntegration(deps) {
  const { vscode } = deps;
  const log = deps.log ?? (() => {});
  const cache = createCache({ max: 200 });
  /** @type {Set<WeakRef<any>>} */
  const instances = new Set();
  /** @type {WeakMap<object, any>} */
  const originalFence = new WeakMap();
  /** @type {WeakRef<any> | null} */
  let latest = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let refreshTimer = null;
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const prerenderTimers = new Map();
  let disposed = false;

  function refresh() {
    if (disposed) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      Promise.resolve(vscode.commands.executeCommand("markdown.preview.refresh")).catch(
        (/** @type {unknown} */ err) => log(`markdown.preview.refresh failed: ${String(err)}`),
      );
    }, REFRESH_DELAY_MS);
  }

  /**
   * (Re)install the plugin with the current settings. The fence rule is reset
   * first so repeated installs do not stack wrappers.
   * @param {any} md
   */
  function install(md) {
    if (originalFence.has(md)) md.renderer.rules.fence = originalFence.get(md);
    else originalFence.set(md, md.renderer.rules.fence);
    md.use(excaliplantPlugin, {
      ...blockOptions(deps.getContext()),
      cache,
      onRendered: refresh,
    });
  }

  /**
   * Called by VS Code for every markdown-it instance of the preview.
   * @param {any} md
   * @returns {any}
   */
  function extendMarkdownIt(md) {
    if (!deps.getContext().settings.markdownEnabled) return md;
    install(md);
    instances.add(new WeakRef(md));
    latest = new WeakRef(md);
    return md;
  }

  /** Apply changed settings to every live markdown-it instance and refresh. */
  function reconfigure() {
    for (const ref of instances) {
      const md = ref.deref();
      if (!md) instances.delete(ref);
      else install(md);
    }
    refresh();
  }

  /**
   * Render the diagrams of a Markdown document into the cache so the preview
   * is complete when it re-renders. Needs a live markdown-it instance, which
   * exists once a preview has been opened.
   * @param {{ uri: { toString(): string }, getText(): string, languageId?: string }} doc
   */
  function schedulePrerender(doc) {
    if (disposed || doc.languageId !== "markdown") return;
    const md = latest?.deref();
    if (!md) return;
    const key = doc.uri.toString();
    const old = prerenderTimers.get(key);
    if (old) clearTimeout(old);
    prerenderTimers.set(
      key,
      setTimeout(() => {
        prerenderTimers.delete(key);
        const text = doc.getText();
        if (text.length > PRERENDER_MAX_CHARS || !/(^|\n)[ \t]{0,3}(```|~~~)/.test(text)) return;
        prerender(md, text).catch((/** @type {unknown} */ err) =>
          log(`prerender failed: ${String(err)}`),
        );
      }, PRERENDER_DELAY_MS),
    );
  }

  function dispose() {
    disposed = true;
    if (refreshTimer) clearTimeout(refreshTimer);
    for (const t of prerenderTimers.values()) clearTimeout(t);
    prerenderTimers.clear();
    instances.clear();
    latest = null;
    cache.clear();
  }

  return { extendMarkdownIt, reconfigure, schedulePrerender, refresh, dispose, cache };
}
