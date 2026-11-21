/**
 * remark plugin (unified transformer): replaces PlantUML `code` nodes of an
 * mdast tree by rendered diagrams. No dependency on unified or remark; only
 * the mdast node shape is used (`code` with `lang`/`meta`).
 *
 * - `mode: "inline"` (default): an `html` node with the sanitised SVG. Needs
 *   `remark-rehype` with `allowDangerousHtml` plus `rehype-raw` (Astro already
 *   does this; MDX does not support `html` nodes — use `mode: "file"` there).
 * - `mode: "file"`: a paragraph with an `image` node; the SVG is passed to
 *   `writeFile(name, data)` (`name` = `<assetsDir>/<hash>.svg`), the image URL
 *   is `<assetsUrl>/<hash>.svg`.
 * @module markdown/remark
 */

import { MARKDOWN_LIMITS } from "./document.mjs";
import {
  altText,
  assetRef,
  errorHtml,
  inlineHtml,
  mergeAttrs,
  normalizeAssetsDir,
  normalizeAssetsUrl,
  renderBlock,
} from "./render.mjs";
import { parseInfo } from "./scan.mjs";

/**
 * @typedef {import("./render.mjs").BlockOptions & {
 *   mode?: "inline" | "file",
 *   assetsDir?: string,
 *   assetsUrl?: string,
 *   writeFile?: (name: string, data: string) => void | Promise<void>,
 *   onError?: "box" | "keep" | "throw",
 *   shareFont?: boolean,
 *   budget?: Partial<import("./document.mjs").MarkdownBudget>,
 * }} RemarkExcaliplantOptions
 */

/**
 * Collect `code` nodes in document order (iterative: tree depth is untrusted).
 * @param {any} root
 * @returns {any[]}
 */
function collectCodeNodes(root) {
  /** @type {any[]} */
  const found = [];
  /** @type {any[]} */
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (node.type === "code" && typeof node.lang === "string") found.push(node);
    const children = node.children;
    if (Array.isArray(children)) {
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
  }
  return found;
}

/**
 * remark attacher. Use as `unified().use(remarkExcaliplant, options)`.
 * @param {RemarkExcaliplantOptions} [options]
 * @returns {(tree: any, file?: any) => Promise<void>} The transformer.
 * @public
 */
export default function remarkExcaliplant(options = {}) {
  const {
    mode = "inline",
    assetsDir,
    assetsUrl,
    writeFile,
    onError = "box",
    shareFont,
    budget,
  } = options ?? {};
  if (mode !== "inline" && mode !== "file") throw new TypeError(`Unknown mode "${mode}"`);
  const base = { ...options };
  for (const key of [
    "mode",
    "assetsDir",
    "assetsUrl",
    "writeFile",
    "onError",
    "shareFont",
    "budget",
  ]) {
    delete (/** @type {any} */ (base)[key]);
  }
  if (mode === "inline") base.scope = ".excaliplant";
  const dir = normalizeAssetsDir(assetsDir ?? (mode === "file" ? "assets" : ""));
  const urlPrefix = assetsUrl !== undefined ? normalizeAssetsUrl(assetsUrl) : undefined;
  const maxBlocks = budget?.maxBlocks ?? MARKDOWN_LIMITS.maxBlocks;
  const maxBytes = budget?.maxTotalSourceBytes ?? MARKDOWN_LIMITS.maxTotalSourceBytes;

  return async function transformer(tree, file) {
    let blocks = 0;
    let bytes = 0;
    /** @type {Set<string>} */
    const written = new Set();
    for (const node of collectCodeNodes(tree)) {
      const parsed = parseInfo(node.meta ? `${node.lang} ${node.meta}` : node.lang);
      if (!parsed) continue;
      const source = String(node.value ?? "");
      blocks++;
      bytes += source.length;
      /** @type {string | undefined} */
      let error;
      /** @type {import("./render.mjs").BlockResult | undefined} */
      let result;
      if (blocks > maxBlocks)
        error = `Block budget exceeded (at most ${maxBlocks} diagrams per document)`;
      else if (bytes > maxBytes) error = "Source budget exceeded for this document";
      else {
        result = await renderBlock(source, {
          ...mergeAttrs(base, parsed.attrs),
          embedFont:
            base.embedFont !== false && (mode === "file" || shareFont === false || blocks === 1),
        });
        error = result.error;
      }
      if (error !== undefined || !result || result.svg === undefined) {
        const message = error ?? "Rendering failed";
        if (onError === "throw") throw new Error(`PlantUML error: ${message}`);
        file?.message?.(message, node.position ?? undefined, "excaliplant");
        if (onError === "box") replace(node, { type: "html", value: errorHtml(message) });
        continue;
      }
      for (const d of result.diagnostics)
        file?.message?.(d.message, node.position ?? undefined, "excaliplant");
      const alt = altText(result, parsed.attrs);
      if (mode === "file") {
        if (typeof writeFile !== "function") {
          throw new TypeError(
            'remarkExcaliplant: mode "file" needs a writeFile(name, data) option',
          );
        }
        const ref = assetRef(result.hash, dir, urlPrefix);
        if (!written.has(ref.name)) {
          written.add(ref.name);
          await writeFile(ref.name, result.svg);
        }
        replace(node, {
          type: "paragraph",
          children: [{ type: "image", url: ref.url, alt, title: null }],
        });
      } else {
        replace(node, { type: "html", value: inlineHtml(result, alt) });
      }
    }
  };
}

/**
 * Turn `node` into `replacement` in place (keeping its position).
 * @param {any} node
 * @param {Record<string, any>} replacement
 */
function replace(node, replacement) {
  const position = node.position;
  for (const key of Object.keys(node)) delete node[key];
  Object.assign(node, replacement);
  if (position) node.position = position;
}
