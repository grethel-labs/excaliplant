/**
 * Excalidraw document assembly and validation.
 * @module render/excalidraw
 */

/**
 * @typedef {object} ExcalidrawDocument
 * @property {"excalidraw"} type
 * @property {number} version
 * @property {string} source
 * @property {any[]} elements
 * @property {{ viewBackgroundColor: string, gridSize: number | null }} appState
 * @property {Record<string, never>} files
 */

export const SOURCE_URL = "https://github.com/grethel-labs/excaliplant";

/**
 * Wrap canvas elements in an Excalidraw document.
 * @param {any[]} elements
 * @param {{ background: string }} options
 * @returns {ExcalidrawDocument}
 */
export function createDocument(elements, options) {
  return {
    type: "excalidraw",
    version: 2,
    source: SOURCE_URL,
    elements,
    appState: { viewBackgroundColor: options.background, gridSize: null },
    files: {},
  };
}

const FINITE_FIELDS = ["x", "y", "width", "height", "strokeWidth", "opacity"];

/**
 * Assert the document is structurally sound: finite geometry, known element
 * types and colour values that cannot break out of SVG attributes.
 * @param {ExcalidrawDocument} doc
 * @returns {ExcalidrawDocument}
 */
export function validateDocument(doc) {
  if (!doc || doc.type !== "excalidraw" || !Array.isArray(doc.elements)) {
    throw new TypeError("Not an Excalidraw document");
  }
  for (const el of doc.elements) {
    if (!["rectangle", "ellipse", "diamond", "line", "arrow", "text", "freedraw", "frame"].includes(el.type)) {
      throw new TypeError(`Unsupported element type ${el.type}`);
    }
    for (const f of FINITE_FIELDS) {
      if (!Number.isFinite(el[f])) throw new TypeError(`Element ${el.id} has non-finite ${f}`);
    }
    for (const c of [el.strokeColor, el.backgroundColor]) {
      if (typeof c !== "string" || !/^(#[0-9a-fA-F]{3,8}|transparent)$/.test(c)) {
        throw new TypeError(`Element ${el.id} has invalid colour ${c}`);
      }
    }
    if (el.points && !el.points.every((/** @type {number[]} */ p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))) {
      throw new TypeError(`Element ${el.id} has non-finite points`);
    }
  }
  return doc;
}
