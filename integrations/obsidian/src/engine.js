/**
 * Rendering glue between Obsidian code blocks and the excaliplant renderer.
 * Everything here works on plain DOM and strings (no Obsidian imports) so it
 * can be tested without Obsidian.
 * @module engine
 */

import { render as renderDocument, warmup } from "../../../src/api.mjs";
import { createCache } from "../../../src/markdown/cache.mjs";
import { blockHash, mergeAttrs, peekBlock, renderBlock } from "../../../src/markdown/render.mjs";
import { extractBlocks, parseInfo } from "../../../src/markdown/scan.mjs";

export { warmup };

/** CSS class of the element that carries the diagram (also the scope of the SVG text rule). */
export const DIAGRAM_CLASS = "excaliplant";

/** Renders a note may keep in memory (LRU, content-addressed). */
export function createRenderCache() {
  return createCache({ max: 100, maxBytes: 32 * 1024 * 1024 });
}

/**
 * Read the fence attributes (`{theme=dark width=600}`) from the fence line of a code block.
 * @param {string} sectionText Text of the Markdown section that contains the block.
 * @param {number} lineStart 0-based line of the section in which the fence starts.
 * @returns {{ attrs: import("../../../src/markdown/scan.mjs").FenceAttrs, fenceLine: boolean }}
 */
export function fenceAttrsAt(sectionText, lineStart) {
  let line = String(sectionText ?? "").split("\n")[lineStart] ?? "";
  // Fences inside block quotes and callouts start with `>` markers.
  for (;;) {
    line = line.trimStart();
    if (!line.startsWith(">")) break;
    line = line.slice(1);
  }
  let i = 0;
  while (line[i] === "`" || line[i] === "~") i++;
  const info = i >= 3 ? parseInfo(line.slice(i)) : null;
  return info ? { attrs: info.attrs, fenceLine: true } : { attrs: {}, fenceLine: false };
}

/**
 * Whether Obsidian currently shows its dark colour scheme.
 * @param {Document} [doc]
 */
export function isDarkMode(doc = globalThis.document) {
  return doc?.body?.classList?.contains("theme-dark") === true;
}

/**
 * Build `renderBlock` options from the settings and the attributes of one fence.
 * `!include` is deliberately not wired up: notes never read other files.
 * @param {import("./config.js").ExcaliplantSettings} settings
 * @param {import("../../../src/markdown/scan.mjs").FenceAttrs} attrs
 * @param {{ dark?: boolean, cache?: import("../../../src/markdown/cache.mjs").Cache<any> | false,
 *   scope?: string, forExport?: boolean }} [env]
 * @returns {import("../../../src/markdown/render.mjs").BlockOptions}
 */
export function resolveOptions(settings, attrs, env = {}) {
  /** @type {import("../../../src/markdown/render.mjs").BlockOptions} */
  const base = {
    theme: settings.theme === "auto" ? (env.dark ? "dark" : "sketch") : settings.theme,
    scope: env.scope ?? "",
    cache: env.cache,
  };
  if (settings.clean) base.clean = true;
  if (settings.seed) base.seed = settings.seed;
  // A transparent background lets the note's colour scheme show through;
  // exported files keep the theme background so they stay readable anywhere.
  if (settings.transparent && !env.forExport) base.background = "transparent";
  const fence = { ...attrs };
  if (fence.theme === "auto") delete fence.theme;
  return mergeAttrs(base, fence);
}

/**
 * Parse an SVG string with the browser's XML parser and append it to `container`
 * through DOM calls. The string is the output of `sanitizeSvg`; no HTML parsing
 * or `innerHTML` is involved.
 * @param {HTMLElement} container
 * @param {string} svg
 */
export function mountSvg(container, svg) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) {
    throw new Error("The diagram could not be displayed.");
  }
  container.appendChild(container.ownerDocument.importNode(root, true));
}

/**
 * @param {Document} doc
 * @param {string} tag
 * @param {string} cls
 * @param {string} [text]
 */
function element(doc, tag, cls, text) {
  const el = doc.createElement(tag);
  el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

/**
 * Replace the content of `el` with the "Rendering…" placeholder.
 * @param {HTMLElement} el
 */
export function showPlaceholder(el) {
  el.replaceChildren(element(el.ownerDocument, "div", "excaliplant-pending", "Rendering…"));
}

/**
 * Replace the content of `el` with an error box.
 * @param {HTMLElement} el
 * @param {string} message
 * @param {{ line?: number | null, noteLine?: number | null }} [where]
 */
export function showError(el, message, where = {}) {
  const doc = el.ownerDocument;
  const box = element(doc, "div", "excaliplant-error");
  box.setAttribute("role", "alert");
  box.appendChild(element(doc, "div", "excaliplant-error-title", "PlantUML error"));
  if (typeof where.line === "number") {
    const note = typeof where.noteLine === "number" ? ` (line ${where.noteLine} of this note)` : "";
    box.appendChild(
      element(doc, "div", "excaliplant-error-line", `Line ${where.line} of the diagram${note}`),
    );
  }
  box.appendChild(element(doc, "pre", "excaliplant-error-message", message));
  el.replaceChildren(box);
}

/**
 * Show a render result: the diagram, or an error box.
 * @param {HTMLElement} el
 * @param {import("../../../src/markdown/render.mjs").BlockResult} result
 * @param {{ attrs?: import("../../../src/markdown/scan.mjs").FenceAttrs, noteLine?: number | null,
 *   showWarnings?: boolean, maxWidth?: number }} [view]
 */
export function showResult(el, result, view = {}) {
  const noteLine = (/** @type {number | null | undefined} */ line) =>
    typeof line === "number" && typeof view.noteLine === "number" ? view.noteLine + line : null;
  if (result.error || !result.svg) {
    showError(el, result.error ?? "Rendering failed", {
      line: result.line,
      noteLine: noteLine(result.line),
    });
    return;
  }
  const doc = el.ownerDocument;
  const holder = element(doc, "div", DIAGRAM_CLASS);
  holder.setAttribute("role", "img");
  holder.setAttribute("aria-label", view.attrs?.alt || result.title || "PlantUML diagram");
  if (view.maxWidth && view.maxWidth > 0) {
    holder.style.setProperty("--excaliplant-max-width", `${Math.round(view.maxWidth)}px`);
  }
  try {
    mountSvg(holder, result.svg);
  } catch (err) {
    showError(el, err instanceof Error ? err.message : String(err));
    return;
  }
  const children = [holder];
  const warnings = view.showWarnings
    ? result.diagnostics.filter((d) => d.severity === "warning")
    : [];
  if (warnings.length > 0) {
    const details = element(doc, "details", "excaliplant-warnings");
    details.appendChild(
      element(doc, "summary", "", `${warnings.length} warning${warnings.length === 1 ? "" : "s"}`),
    );
    const list = element(doc, "ul", "");
    for (const w of warnings.slice(0, 50)) {
      const at = typeof w.line === "number" ? `Line ${w.line}: ` : "";
      list.appendChild(element(doc, "li", "", at + w.message));
    }
    details.appendChild(list);
    children.push(details);
  }
  el.replaceChildren(...children);
}

/**
 * Render a block into `el`: instantly from the cache, otherwise with a placeholder.
 * @param {HTMLElement} el
 * @param {string} source
 * @param {import("../../../src/markdown/render.mjs").BlockOptions} options
 * @param {Parameters<typeof showResult>[2] & { isActive?: () => boolean }} [view]
 * @returns {Promise<void>}
 */
export async function renderInto(el, source, options, view = {}) {
  const hit = peekBlock(source, options).result;
  if (hit) {
    showResult(el, hit, view);
    return;
  }
  showPlaceholder(el);
  const result = await renderBlock(source, options);
  if (view.isActive && !view.isActive()) return;
  showResult(el, result, view);
}

/**
 * The PlantUML block that contains `line`, or the only block of the note.
 * @param {string} text Whole note.
 * @param {number} line 0-based cursor line.
 * @returns {import("../../../src/markdown/scan.mjs").FenceBlock | null}
 */
export function findBlock(text, line) {
  const blocks = extractBlocks(text);
  for (const block of blocks) {
    const first = block.line - 1;
    let last = first;
    for (const ch of text.slice(block.start, block.end)) if (ch === "\n") last++;
    if (line >= first && line <= last) return block;
  }
  return blocks.length === 1 ? blocks[0] : null;
}

/**
 * File-name-safe slug.
 * @param {string} text
 */
export function slug(text) {
  const s = String(text)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48);
  return s || "diagram";
}

/**
 * Rasterise an SVG with the browser's canvas.
 * @param {string} svg Standalone SVG with `width` and `height`.
 * @param {number} [scale] Pixel ratio (default 2), reduced for very large diagrams.
 * @returns {Promise<ArrayBuffer>}
 */
export async function svgToPngBuffer(svg, scale = 2) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = () => resolve(undefined);
    img.onerror = () => reject(new Error("The diagram could not be rasterised."));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const w = img.naturalWidth || 1;
  const h = img.naturalHeight || 1;
  const k = Math.min(scale, 8192 / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNG encoding failed.");
  return /** @type {Blob} */ (blob).arrayBuffer();
}

/**
 * @typedef {"excalidraw" | "svg" | "png" | "clipboard"} ExportKind
 * @typedef {object} ExportFile
 * @property {string} name File name with extension (`clipboard`: empty).
 * @property {string | ArrayBuffer} data
 */

/**
 * Produce an export of one block.
 * @param {ExportKind} kind
 * @param {string} source
 * @param {import("../../../src/markdown/render.mjs").BlockOptions} options Options from {@link resolveOptions} with `forExport`.
 * @param {string} [baseName] Used for the file name when the diagram has no title.
 * @returns {Promise<ExportFile>}
 */
export async function exportBlock(kind, source, options, baseName = "") {
  const hash = blockHash(source, options).slice(0, 8);
  if (kind === "excalidraw" || kind === "clipboard") {
    const result = await renderDocument(source, {
      theme: /** @type {string | undefined} */ (options.theme),
      sketch: options.sketch ?? (options.clean ? false : undefined),
      seed: options.seed,
    });
    if (kind === "clipboard") {
      const { elements } = result.excalidraw;
      return {
        name: "",
        data: JSON.stringify({ type: "excalidraw/clipboard", elements, files: {} }),
      };
    }
    const title = result.model?.meta?.title;
    const name = `${slug(typeof title === "string" && title ? title : baseName)}-${hash}.excalidraw`;
    return { name, data: JSON.stringify(result.excalidraw, null, 2) };
  }
  const result = await renderBlock(source, options);
  if (result.error || !result.svg) throw new Error(result.error ?? "Rendering failed");
  const name = `${slug(result.title || baseName)}-${hash}`;
  if (kind === "svg") return { name: `${name}.svg`, data: result.svg };
  return { name: `${name}.png`, data: await svgToPngBuffer(result.svg) };
}
