/**
 * High-level API: `render`, `renderAll`, `parse` and the 0.x-compatible
 * `renderPlantUml`.
 * @module api
 */

import { extractBlocks } from "./core/source.mjs";
import { LimitError, ParseError } from "./core/errors.mjs";
import { resolveLimits } from "./core/limits.mjs";
import { renderBlock, parseBlock } from "./core/pipeline.mjs";
import { DiagramRegistry } from "./core/registry.mjs";
import { BUILTIN_DIAGRAMS } from "./diagrams/index.mjs";

/** @typedef {import("./core/pipeline.mjs").RenderOptions} RenderOptions */

/**
 * @typedef {RenderOptions & { block?: number | string, registry?: DiagramRegistry }} ApiOptions
 */

/** Registry with every bundled diagram type. */
export const defaultRegistry = new DiagramRegistry(BUILTIN_DIAGRAMS);

/**
 * The result of rendering one diagram.
 * @public
 */
export class RenderResult {
  /**
   * @param {import("./core/pipeline.mjs").BlockOutput & { name: string | null }} output
   */
  constructor(output) {
    /** Diagram kind, e.g. `sequence`. */
    this.kind = output.kind;
    /** Block name from `@startuml name`, if any. */
    this.name = output.name;
    /** The Excalidraw document. */
    this.excalidraw = output.document;
    /** Warnings collected while parsing. */
    this.diagnostics = output.diagnostics;
    /** Number of `newpage` pages in the block. */
    this.pages = output.pages;
    /** Parsed (and laid out) diagram model. */
    this.model = output.model;
  }

  /** @returns {import("./render/excalidraw.mjs").ExcalidrawDocument} */
  toJSON() {
    return this.excalidraw;
  }

  /**
   * Render as standalone SVG (Excalifont embedded).
   * @param {import("./render/svg.mjs").SvgOptions} [options]
   * @returns {Promise<string>}
   */
  async toSvg(options) {
    const { excalidrawToSvg } = await import("./render/svg.mjs");
    return excalidrawToSvg(this.excalidraw, options);
  }

  /**
   * Render as PNG.
   * @param {import("./render/png.mjs").PngOptions & import("./render/svg.mjs").SvgOptions} [options]
   * @returns {Promise<Buffer>}
   */
  async toPng(options = {}) {
    const { svgToPng } = await import("./render/png.mjs");
    return svgToPng(await this.toSvg(options), options);
  }
}

/**
 * @param {string} source
 * @param {ApiOptions} options
 */
function blocksOf(source, options) {
  if (typeof source !== "string") throw new TypeError("PlantUML source must be a string");
  const limits = resolveLimits(options.limits);
  if (new TextEncoder().encode(source).length > limits.maxInputBytes) {
    throw new LimitError(`Input exceeds ${limits.maxInputBytes} bytes`);
  }
  return extractBlocks(source, { maxBlocks: limits.maxBlocks });
}

/**
 * @param {import("./core/source.mjs").SourceBlock[]} blocks
 * @param {number | string | undefined} which
 */
function pickBlock(blocks, which) {
  if (typeof which === "string") {
    const i = blocks.findIndex((b) => b.name === which);
    if (i < 0) throw new ParseError(`No diagram named "${which}"`);
    return i;
  }
  const i = which ?? 0;
  if (i < 0 || i >= blocks.length) throw new ParseError(`Diagram index ${i} out of range`);
  return i;
}

/**
 * Render a PlantUML document (the first `@start…@end` block by default).
 * @param {string} source PlantUML text.
 * @param {ApiOptions} [options]
 * @returns {Promise<RenderResult>}
 * @public
 */
export async function render(source, options = {}) {
  const blocks = blocksOf(source, options);
  const index = pickBlock(blocks, options.block);
  const out = await renderBlock(blocks[index], options.registry ?? defaultRegistry, options, index);
  return new RenderResult({ ...out, name: blocks[index].name });
}

/**
 * Render every block of a document.
 * @param {string} source
 * @param {ApiOptions} [options]
 * @returns {Promise<RenderResult[]>}
 * @public
 */
export async function renderAll(source, options = {}) {
  const blocks = blocksOf(source, options);
  /** @type {RenderResult[]} */
  const results = [];
  for (let i = 0; i < blocks.length; i++) {
    const out = await renderBlock(blocks[i], options.registry ?? defaultRegistry, options, i);
    results.push(new RenderResult({ ...out, name: blocks[i].name }));
  }
  return results;
}

/**
 * Parse without layout or rendering. Useful for tooling and tests.
 * @param {string} source
 * @param {ApiOptions} [options]
 * @returns {{ kind: string, model: any, diagnostics: import("./core/diagnostics.mjs").Diagnostic[] }}
 * @public
 */
export function parse(source, options = {}) {
  const blocks = blocksOf(source, options);
  const index = pickBlock(blocks, options.block);
  const { module, model, ctx } = parseBlock(
    blocks[index],
    options.registry ?? defaultRegistry,
    options,
  );
  return { kind: module.kind, model, diagnostics: ctx.diagnostics.toJSON() };
}

/**
 * Detect the diagram kind of a source without rendering it.
 * @param {string} source
 * @param {ApiOptions} [options]
 * @returns {string}
 * @public
 */
export function detectKind(source, options = {}) {
  return parse(source, options).kind;
}

/**
 * List bundled (or registered) diagram types.
 * @param {DiagramRegistry} [registry]
 * @returns {{ kind: string, title: string, starts: readonly string[] }[]}
 * @public
 */
export function listDiagramTypes(registry = defaultRegistry) {
  return registry.list().map((m) => ({ kind: m.kind, title: m.title, starts: m.starts }));
}

/**
 * 0.x-compatible entry point: awaitable Excalidraw document with chained
 * `.toSvg()` / `.toPng()` helpers.
 * @param {string} source
 * @param {ApiOptions} [options]
 * @returns {Promise<import("./render/excalidraw.mjs").ExcalidrawDocument> & { toSvg: (o?: import("./render/svg.mjs").SvgOptions) => Promise<string>, toPng: (o?: import("./render/png.mjs").PngOptions) => Promise<Buffer> }}
 * @public
 */
export function renderPlantUml(source, options = {}) {
  const result = render(source, options);
  const doc = /** @type {any} */ (result.then((r) => r.excalidraw));
  doc.toSvg = (/** @type {any} */ o) => result.then((r) => r.toSvg(o));
  doc.toPng = (/** @type {any} */ o) => result.then((r) => r.toPng(o));
  return doc;
}
