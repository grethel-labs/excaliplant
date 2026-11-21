/**
 * Builds the options handed to the renderer from the extension settings.
 * @module vscode/options
 */

import { DEFAULT_LIMITS } from "./engine.mjs";
import { createIncludeResolver, resolveIncludeRoot } from "./include.mjs";

/**
 * @typedef {object} RenderContext
 * @property {import("./config.mjs").ExcaliplantSettings} settings
 * @property {string | undefined} [workspaceFolder] Folder that relative `includeDir` values refer to.
 * @property {number} [includeGeneration] Bumped when included files change; part of the cache key.
 */

/**
 * Options for `renderBlock` / `renderMarkdown` / the markdown-it plugin.
 * @param {RenderContext} ctx
 * @returns {Record<string, any>}
 */
export function blockOptions(ctx) {
  const { settings } = ctx;
  /** @type {Record<string, any>} */
  const options = { theme: settings.theme, clean: settings.clean };
  if (Object.keys(settings.limits).length > 0) options.limits = { ...settings.limits };
  const root = resolveIncludeRoot(settings.includeDir, ctx.workspaceFolder);
  if (root) {
    const maxBytes = settings.limits.maxInputBytes ?? DEFAULT_LIMITS.maxInputBytes;
    options.include = createIncludeResolver(root, maxBytes);
    // Included files change independently of the diagram text, so the cache
    // key names the folder and a generation counter instead of the content.
    options.includeKey = `${root}#${ctx.includeGeneration ?? 0}`;
  }
  return options;
}
