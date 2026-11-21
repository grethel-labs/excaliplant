/**
 * Markdown support: find PlantUML fences, render them to SVG and rewrite
 * documents. Plugins for markdown-it and remark live in `./markdown_it.mjs`
 * and `./remark.mjs` (package exports `./markdown-it`, `./remark`).
 *
 * This module never touches the file system; callers pass `writeFile` / `io`.
 * @module markdown
 */

export { extractBlocks, parseInfo } from "./scan.mjs";
export { createCache } from "./cache.mjs";
export { renderBlock, blockHash, peekBlock, PACKAGE_VERSION } from "./render.mjs";
export { renderMarkdown, MARKDOWN_LIMITS } from "./document.mjs";
export { runMarkdownCommand, MARKDOWN_HELP } from "./cli.mjs";
export { sanitizeSvg } from "./sanitize.mjs";

/** @typedef {import("./scan.mjs").FenceBlock} FenceBlock */
/** @typedef {import("./scan.mjs").FenceAttrs} FenceAttrs */
/** @typedef {import("./render.mjs").BlockOptions} BlockOptions */
/** @typedef {import("./render.mjs").BlockResult} BlockResult */
/** @typedef {import("./document.mjs").MarkdownOptions} MarkdownOptions */
/** @typedef {import("./document.mjs").MarkdownResult} MarkdownResult */
/** @typedef {import("./cli.mjs").MarkdownIo} MarkdownIo */
