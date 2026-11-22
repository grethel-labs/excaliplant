/**
 * The only place that reaches into the excaliplant sources. The extension is
 * bundled from this repository, so the imports are relative; everything else
 * in `src/` talks to the engine through this module.
 * @module vscode/engine
 */

export { render, warmup } from "../../../src/api.mjs";
export { THEME_NAMES } from "../../../src/draw/theme.mjs";
export { DEFAULT_LIMITS } from "../../../src/core/limits.mjs";
export { extractBlocks as splitDiagramBlocks } from "../../../src/core/source.mjs";
export {
  extractBlocks,
  renderBlock,
  renderMarkdown,
  createCache,
  MARKDOWN_LIMITS,
} from "../../../src/markdown/index.mjs";
export { default as excaliplantPlugin, prerender } from "../../../src/markdown/markdown_it.mjs";
export { sanitizeSvg } from "../../../src/markdown/index.mjs";
