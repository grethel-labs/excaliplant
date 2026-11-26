/**
 * Replace PlantUML code fences in a Markdown document by rendered diagrams.
 * @module markdown/document
 */

import { LimitError } from "../core/errors.mjs";
import { isPlantUmlFile } from "../core/project.mjs";
import {
  assetRef,
  altText,
  escapeMarkdownAlt,
  hash16,
  inlineHtml,
  mergeAttrs,
  normalizeAssetsDir,
  normalizeAssetsUrl,
  renderBlock,
} from "./render.mjs";
import { BEGIN_PREFIX, END_MARKER, SOURCE_PREFIX, encodeComment, scanMarkdown } from "./scan.mjs";

/**
 * Per-document budget. Block rendering itself is bounded by `DEFAULT_LIMITS`
 * (`limits` option); this caps the sum over a whole document.
 * @typedef {object} MarkdownBudget
 * @property {number} maxDocumentBytes Largest accepted Markdown document (default 8 MiB).
 * @property {number} maxBlocks Diagram blocks rendered per document (default 50).
 * @property {number} maxTotalSourceBytes Sum of all diagram sources (default 1 MiB).
 * @property {number} maxTotalOutputBytes Sum of all rendered SVG (default 32 MiB).
 */

/** @type {Readonly<MarkdownBudget>} */
export const MARKDOWN_LIMITS = Object.freeze({
  maxDocumentBytes: 8 * 1024 * 1024,
  maxBlocks: 50,
  maxTotalSourceBytes: 1024 * 1024,
  maxTotalOutputBytes: 32 * 1024 * 1024,
});

/** Hard ceilings: overrides above these are clamped. */
const CEILINGS = Object.freeze({
  maxDocumentBytes: 64 * 1024 * 1024,
  maxBlocks: 500,
  maxTotalSourceBytes: 16 * 1024 * 1024,
  maxTotalOutputBytes: 256 * 1024 * 1024,
});

/**
 * @param {Partial<MarkdownBudget> | undefined} overrides
 * @returns {MarkdownBudget}
 */
export function resolveBudget(overrides) {
  /** @type {MarkdownBudget} */
  const out = { ...MARKDOWN_LIMITS };
  if (!overrides) return out;
  for (const key of /** @type {(keyof MarkdownBudget)[]} */ (Object.keys(MARKDOWN_LIMITS))) {
    const v = overrides[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0)
      out[key] = Math.min(v, CEILINGS[key]);
  }
  return out;
}

/**
 * @typedef {import("./render.mjs").BlockOptions & {
 *   mode?: "inline" | "file",
 *   keepSource?: boolean | "comment" | "details",
 *   assetsDir?: string,
 *   assetsUrl?: string,
 *   writeFile?: (name: string, data: string) => void | Promise<void>,
 *   shareFont?: boolean,
 *   budget?: Partial<MarkdownBudget>,
 * }} MarkdownOptions
 */

/**
 * @typedef {object} MarkdownBlock
 * @property {number} index Position among all diagram blocks of the document.
 * @property {"fence" | "region"} kind `region` = rendered earlier with `keepSource`.
 * @property {number} line 1-based line in the input.
 * @property {number} start Offset in the input.
 * @property {number} end Offset in the input.
 * @property {string} lang
 * @property {string} [hash] Content hash of the rendered block.
 * @property {boolean} replaced Whether the output differs from the input for this block.
 * @property {string} [error] Readable message; the block is left unchanged.
 * @property {number | null} [errorLine] 1-based line inside the diagram source.
 * @property {import("../core/diagnostics.mjs").Diagnostic[]} diagnostics
 * @property {string} [asset] Asset path (relative to the document) in `file` mode.
 */

/**
 * @typedef {object} MarkdownResult
 * @property {string} markdown The rewritten document.
 * @property {MarkdownBlock[]} blocks
 * @property {{ name: string, data: string }[]} assets Files that `file` mode needs next to the document.
 * @property {boolean} changed Whether `markdown` differs from the input.
 */

/** @param {string} text */
const byteLength = (text) => new TextEncoder().encode(text).length;

/**
 * Fence long enough to contain `text`.
 * @param {string} text
 */
function safeFence(text) {
  let longest = 0;
  let run = 0;
  for (const ch of text) {
    run = ch === "`" ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * @param {boolean | string | undefined} keepSource
 * @returns {false | "comment" | "details"}
 */
function resolveKeep(keepSource) {
  if (keepSource === "details") return "details";
  if (keepSource === true || keepSource === "comment") return "comment";
  return false;
}

/**
 * Render every PlantUML fence of a Markdown document.
 *
 * - `mode: "inline"` (default) writes `<div class="excaliplant">…svg…</div>`.
 * - `mode: "file"` links `assets/<hash>.svg`; the files are returned in
 *   `assets` and handed to `writeFile(name, data)` when given. `name` is
 *   relative to the document and uses forward slashes.
 * - `keepSource` wraps the result in `<!-- excaliplant:begin … -->` markers that
 *   carry the source (safe against `-->`), so the block can be re-rendered
 *   later. Existing regions are always re-rendered and keep their source.
 * - An empty fence with `src="path.puml"` loads the diagram through `include`
 *   and retains the reference by default.
 *
 * Blocks that fail to render, or exceed the budget, stay exactly as written
 * and are reported in `blocks[].error`. Running the function on its own output
 * returns the same text.
 * @param {string} markdown
 * @param {MarkdownOptions} [options]
 * @returns {Promise<MarkdownResult>}
 * @public
 */
export async function renderMarkdown(markdown, options = {}) {
  if (typeof markdown !== "string") throw new TypeError("Markdown must be a string");
  const opts = options ?? {};
  const budget = resolveBudget(opts.budget);
  if (byteLength(markdown) > budget.maxDocumentBytes) {
    throw new LimitError(`Markdown document exceeds ${budget.maxDocumentBytes} bytes`);
  }
  const mode = opts.mode ?? "inline";
  if (mode !== "inline" && mode !== "file") throw new TypeError(`Unknown mode "${mode}"`);
  const keep = resolveKeep(opts.keepSource);
  const dir = normalizeAssetsDir(opts.assetsDir);
  const urlPrefix = opts.assetsUrl !== undefined ? normalizeAssetsUrl(opts.assetsUrl) : undefined;
  const shareFont = opts.shareFont !== false;
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";

  /** @type {import("./render.mjs").BlockOptions} */
  const base = { ...opts };
  for (const key of [
    "mode",
    "keepSource",
    "assetsDir",
    "assetsUrl",
    "writeFile",
    "shareFont",
    "budget",
  ]) {
    delete (/** @type {any} */ (base)[key]);
  }
  if (mode === "inline") base.scope = ".excaliplant";

  const items = scanMarkdown(markdown);
  /** @type {MarkdownBlock[]} */
  const blocks = [];
  /** @type {Map<string, string>} */
  const assets = new Map();
  /** @type {string[]} */
  const out = [];
  let cursor = 0;
  let sourceBytes = 0;
  let outputBytes = 0;
  let rendered = 0;

  for (const item of items) {
    /** @type {MarkdownBlock} */
    const info = {
      index: blocks.length,
      kind: item.kind,
      line: item.line,
      start: item.start,
      end: item.end,
      lang: item.lang,
      replaced: false,
      diagnostics: [],
    };
    blocks.push(info);

    const fail = (/** @type {string} */ message) => {
      info.error = message;
    };
    if (rendered >= budget.maxBlocks) {
      fail(`Block budget exceeded (at most ${budget.maxBlocks} diagrams per document)`);
      continue;
    }
    rendered++;
    let source = item.source;
    let options = mergeAttrs(base, item.attrs);
    const reference = item.attrs.src;
    if (reference !== undefined) {
      if (source.trim() || !isPlantUmlFile(reference)) {
        fail("Use src= with a PlantUML file path and an empty fence");
        continue;
      }
      try {
        const found = base.include?.(reference, { kind: "file", from: base.sourcePath ?? null });
        if (found == null) {
          fail(`Cannot resolve PlantUML source ${JSON.stringify(reference)}`);
          continue;
        }
        const sourcePath = typeof found === "string" ? reference : found.path;
        source = typeof found === "string" ? found : found.text;
        options = { ...options, sourcePath, filename: sourcePath.split("/").at(-1) };
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        continue;
      }
    }
    const size = byteLength(source);
    if (sourceBytes + size > budget.maxTotalSourceBytes) {
      fail(`Source budget exceeded (at most ${budget.maxTotalSourceBytes} bytes per document)`);
      continue;
    }
    const first = outputBytes === 0;
    sourceBytes += size;

    const embedFont = base.embedFont !== false && (mode === "file" || !shareFont || first);
    const result = await renderBlock(source, { ...options, embedFont });
    info.hash = result.hash;
    info.diagnostics = result.diagnostics;
    if (result.error !== undefined || result.svg === undefined) {
      info.errorLine = reference === undefined ? (result.line ?? null) : null;
      const message = result.error ?? "Rendering failed";
      fail(reference === undefined ? message : `${options.sourcePath}: ${message}`);
      continue;
    }
    if (outputBytes + result.svg.length > budget.maxTotalOutputBytes) {
      fail(`Output budget exceeded (at most ${budget.maxTotalOutputBytes} bytes per document)`);
      continue;
    }
    outputBytes += result.svg.length;
    // Anonymous file resolvers can return new dependency contents on each run.
    const hash =
      options.sourcePath && options.include && options.includeKey === undefined
        ? hash16(`${result.hash}\n${result.svg}`)
        : result.hash;
    info.hash = hash;

    const alt = altText(result, item.attrs);
    let body;
    if (mode === "file") {
      const ref = assetRef(hash, dir, urlPrefix);
      assets.set(ref.name, result.svg);
      info.asset = ref.name;
      body = `![${escapeMarkdownAlt(alt)}](${ref.url})`;
    } else {
      body = inlineHtml(result, alt);
    }

    const isRegion = item.kind === "region";
    const style = isRegion
      ? markdown.slice(item.start, item.end).includes("<details>")
        ? "details"
        : "comment"
      : reference !== undefined && opts.keepSource === undefined
        ? "comment"
        : keep;
    /** @type {string[]} */
    const lines = [];
    if (style) {
      lines.push(`${BEGIN_PREFIX} hash=${hash} -->`);
      lines.push(`${SOURCE_PREFIX}${item.info ? ` ${encodeComment(item.info)}` : ""}`);
      lines.push(encodeComment(item.source));
      lines.push("-->");
    }
    lines.push(body);
    if (style) {
      lines.push("");
      if (style === "details") {
        const f = safeFence(item.source);
        lines.push(
          "<details>",
          "<summary>PlantUML source</summary>",
          "",
          `${f}${reference === undefined ? "plantuml" : item.info}`,
          item.source,
          f,
          "",
          "</details>",
        );
      }
      lines.push(END_MARKER);
    } else {
      // An HTML block swallows following lines until a blank line.
      let p = item.end;
      if (markdown[p] === "\r") p++;
      if (markdown[p] === "\n") {
        p++;
        const e = markdown.indexOf("\n", p);
        if (markdown.slice(p, e < 0 ? undefined : e).trim() !== "") lines.push("");
      }
    }
    let text = lines.join("\n");
    if (eol === "\r\n") text = text.replace(/\n/g, "\r\n");
    out.push(markdown.slice(cursor, item.start), text);
    cursor = item.end;
    info.replaced = markdown.slice(item.start, item.end) !== text;
  }
  out.push(markdown.slice(cursor));
  const next = out.join("");

  const files = [...assets].map(([name, data]) => ({ name, data }));
  if (typeof opts.writeFile === "function") {
    for (const file of files) await opts.writeFile(file.name, file.data);
  }
  return { markdown: next, blocks, assets: files, changed: next !== markdown };
}
