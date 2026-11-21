/**
 * Rendering helpers shared by the commands and the side preview: split a
 * PlantUML file into diagrams and render one of them.
 * @module vscode/diagram
 */

import { render, sanitizeSvg, splitDiagramBlocks } from "./engine.mjs";

/**
 * One diagram of a PlantUML document.
 * @typedef {object} DiagramInfo
 * @property {number} index Position among the `@start…@end` blocks.
 * @property {string | null} name Name from `@startuml name`.
 * @property {number} line 1-based line of the start marker.
 * @property {number} endLine 1-based line of the end marker (or the last line).
 */

/**
 * List the diagrams of a document. Text without `@start` markers is one diagram.
 * @param {string} text
 * @param {number} [maxBlocks]
 * @returns {DiagramInfo[]}
 */
export function listDiagrams(text, maxBlocks = 100) {
  return splitDiagramBlocks(text, { maxBlocks }).map((b, index) => ({
    index,
    name: b.name,
    line: b.line,
    endLine: b.line + b.lines.length + 1,
  }));
}

/**
 * @typedef {object} DiagramOptions
 * @property {Record<string, any>} options Output of `blockOptions()`.
 * @property {number} [block] Index of the diagram within the document.
 * @property {string} [filename] Value of `%filename()`.
 * @property {{ theme?: string, clean?: boolean, seed?: string }} [attrs] Fence attributes that win over the settings.
 */

/**
 * @param {DiagramOptions} o
 */
function renderOptions(o) {
  const { options, attrs = {} } = o;
  /** @type {Record<string, any>} */
  const out = {
    theme: attrs.theme ?? options.theme,
    sketch: (attrs.clean ?? options.clean) !== true,
    limits: options.limits,
    include: options.include,
    block: o.block ?? 0,
  };
  if (attrs.seed !== undefined) out.seed = attrs.seed;
  if (o.filename) out.filename = o.filename;
  return out;
}

/**
 * Render a diagram and return the Excalidraw document as JSON text.
 * @param {string} source
 * @param {DiagramOptions} o
 * @returns {Promise<string>}
 */
export async function toExcalidrawJson(source, o) {
  const result = await render(source, renderOptions(o));
  return `${JSON.stringify(result.toJSON(), null, 2)}\n`;
}

/**
 * Render a diagram as a standalone SVG file (fonts embedded).
 * @param {string} source
 * @param {DiagramOptions} o
 * @returns {Promise<string>}
 */
export async function toSvgFile(source, o) {
  const result = await render(source, renderOptions(o));
  return result.toSvg({ embedFont: true });
}

/**
 * Render a diagram for display: sanitised through the same allow-list as the
 * Markdown output. Never throws.
 * @param {string} source
 * @param {DiagramOptions} o
 * @returns {Promise<{ svg: string } | { error: string }>}
 */
export async function toPreviewSvg(source, o) {
  try {
    const result = await render(source, renderOptions(o));
    const raw = await result.toSvg({ embedFont: true });
    return { svg: sanitizeSvg(raw, { scope: "" }) };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

/**
 * Readable single-line message for any thrown value.
 * @param {unknown} err
 * @returns {string}
 */
export function messageOf(err) {
  const raw = err instanceof Error ? err.message : String(err);
  let out = "";
  for (const ch of raw.slice(0, 500)) out += ch.charCodeAt(0) < 0x20 ? " " : ch;
  return out.trim() || "Rendering failed";
}
