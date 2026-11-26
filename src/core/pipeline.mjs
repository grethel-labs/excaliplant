/**
 * Orchestrates one diagram block: preprocess → detect → parse → layout → draw.
 * @module core/pipeline
 */

import { Diagnostics } from "./diagnostics.mjs";
import { LimitError, ParseError } from "./errors.mjs";
import { stableHash32 } from "./hash.mjs";
import { resolveLimits } from "./limits.mjs";
import { stripComments, splitPages } from "./source.mjs";
import { preprocess } from "./preprocess/preprocessor.mjs";
import { Canvas } from "../draw/canvas.mjs";
import { decorate } from "../draw/frame.mjs";
import { createTheme, mapPlantUmlTheme } from "../draw/theme.mjs";
import { applySkin } from "../syntax/skin.mjs";
import { extractHooks, reportHookError } from "../syntax/hooks.mjs";
import { createDocument, validateDocument } from "../render/excalidraw.mjs";

/**
 * @typedef {object} RenderOptions
 * @property {string | import("../draw/theme.mjs").Theme} [theme] Theme name (`sketch`, `plain`, `hachure`, `mono`, `dark`, `blueprint`) or object.
 * @property {Record<string, string>} [themeColors] Individual colour overrides by theme path.
 * @property {boolean} [sketch] Force hand-drawn (`true`) or clean (`false`) strokes.
 * @property {string | number} [seed] Seed for ids and stroke wobble (default `excaliplant`).
 * @property {number} [page] Page index for `newpage` documents (default 0).
 * @property {boolean} [strict] Throw on unrecognised lines instead of warning.
 * @property {Partial<import("./limits.mjs").Limits>} [limits]
 * @property {import("./preprocess/preprocessor.mjs").IncludeResolver} [include] Resolver for `!include`.
 * @property {string} [sourcePath] Entry path in the resolver's namespace.
 * @property {boolean} [strictIncludes] Fail when an include cannot be resolved.
 * @property {Record<string, string | number | boolean>} [defines] Predefined preprocessor variables.
 * @property {Date | null} [date] Date returned by `%date()`.
 * @property {string} [filename] Value of `%filename()`.
 * @property {string} [kind] Force a diagram module instead of auto-detection.
 * @property {boolean} [layoutCache] Set to `false` to bypass the graph layout cache (default: on). The cache never changes the output; it only skips repeated ELK runs for identical graphs.
 */

/**
 * @typedef {object} BlockOutput
 * @property {string} kind
 * @property {any} model
 * @property {import("../render/excalidraw.mjs").ExcalidrawDocument} document
 * @property {import("./diagnostics.mjs").Diagnostic[]} diagnostics
 * @property {number} pages
 */

/**
 * Parse a block into a model without layout.
 * @param {import("./source.mjs").SourceBlock} block
 * @param {import("./registry.mjs").DiagramRegistry} registry
 * @param {RenderOptions} options
 */
export function parseBlock(block, registry, options = {}) {
  const limits = resolveLimits(options.limits);
  const diagnostics = new Diagnostics({ strict: options.strict });
  const candidates = registry.forStart(block.type);
  if (candidates.length === 0 && !options.kind) {
    throw new ParseError(`Unsupported diagram type @start${block.type}`, {
      line: block.line,
      code: "UNSUPPORTED_DIAGRAM",
    });
  }
  const raw = options.kind ? registry.get(options.kind)?.raw : candidates.every((m) => m.raw);
  let lines = block.lines;
  /** @type {Map<string, string>} */
  let pragmas = new Map();
  /** @type {string | null} */
  let ppTheme = null;
  if (!raw) {
    const pp = preprocess(stripComments(lines), {
      limits,
      diagnostics,
      include: options.include,
      sourcePath: options.sourcePath,
      strictIncludes: options.strictIncludes,
      defines: options.defines,
      date: options.date ?? null,
      filename: options.filename,
    });
    lines = pp.lines;
    pragmas = pp.pragmas;
    ppTheme = pp.theme;
  }
  if (lines.length > limits.maxLines)
    throw new LimitError(`Diagram has more than ${limits.maxLines} lines`);
  for (const l of lines) {
    if (l.text.length > limits.maxLineLength)
      throw new LimitError(`Line longer than ${limits.maxLineLength} characters`, { line: l.line });
  }
  const pages = raw ? [lines] : splitPages(lines);
  const { lines: page, hooks } = extractHooks(
    pages[Math.min(Math.max(0, options.page ?? 0), pages.length - 1)],
    diagnostics,
    { raw },
  );
  const module = options.kind ? registry.get(options.kind) : registry.resolve(block.type, page);
  if (!module)
    throw new ParseError(`Unknown diagram kind ${options.kind ?? block.type}`, {
      code: "UNSUPPORTED_DIAGRAM",
    });

  const themeName = options.theme ?? mapPlantUmlTheme(ppTheme) ?? "sketch";
  const theme = createTheme(themeName, { sketch: options.sketch, colors: options.themeColors });
  /** @type {import("./registry.mjs").ModuleContext} */
  const ctx = {
    diagnostics,
    limits,
    theme,
    pragmas,
    start: block.type,
    layoutCache: options.layoutCache !== false,
  };
  const model = module.parse(page, ctx);
  applySkin(theme, model.meta.skin);
  return { module, model, ctx, hooks, pages: pages.length };
}

/**
 * Fully render a block to an Excalidraw document.
 * @param {import("./source.mjs").SourceBlock} block
 * @param {import("./registry.mjs").DiagramRegistry} registry
 * @param {RenderOptions} [options]
 * @param {number} [index] Block index (part of the seed).
 * @returns {Promise<BlockOutput>}
 */
export async function renderBlock(block, registry, options = {}, index = 0) {
  const { module, model, ctx, hooks, pages } = parseBlock(block, registry, options);
  const laid = await module.layout(model, ctx);
  const seed = stableHash32(
    `${options.seed ?? "excaliplant"}|${module.kind}|${index}|${options.page ?? 0}`,
  );
  const canvas = new Canvas({ seed, theme: ctx.theme, maxElements: ctx.limits.maxElements, hooks });
  module.draw(laid, canvas, ctx);
  decorate(canvas, model.meta);
  if (hooks.length) {
    canvas.applyHooks(hooks, (line, message) => reportHookError(ctx.diagnostics, line, message));
  }
  const b = canvas.bounds();
  canvas.translate(-b.x, -b.y);
  const document = validateDocument(
    createDocument(canvas.elements, { background: ctx.theme.background }),
  );
  return { kind: module.kind, model, document, diagnostics: ctx.diagnostics.toJSON(), pages };
}
