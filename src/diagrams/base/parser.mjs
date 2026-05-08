/**
 * Base parser contract for diagram modules.
 * @module diagrams/base/parser
 */

/**
 * @typedef {object} BaseModuleParserOptions
 * @property {readonly any[]} [plugins] Ordered parser plugins.
 * @property {() => Record<string, any>} [createParseContext] Parser context factory.
 * @property {(lines:string[]) => string[]} [prepareLines] Source-line preprocessor.
 * @property {(text:string) => boolean} [detect] Source ownership heuristic.
 */

/**
 * Base contract for module-owned parser implementations.
 * @public
 */
export class BaseModuleParser {
  /** @param {BaseModuleParserOptions} [options] Parser options. */
  constructor(options = {}) {
    this._plugins = Object.freeze([...(options.plugins ?? [])]);
    this._createParseContext = options.createParseContext ?? null;
    this._prepareLines = options.prepareLines ?? ((/** @type {string[]} */ lines) => lines);
    this._detect = options.detect ?? null;
    Object.freeze(this);
  }

  /** @returns {import("../../util/parser_engine.mjs").Plugin[]} Ordered parser plugins. */
  plugins() {
    return [...this._plugins];
  }

  /** @param {string[]} lines Raw source lines. @returns {string[]} Engine-ready lines. */
  prepareLines(lines) {
    return this._prepareLines(lines);
  }

  /** @param {string} text Raw PlantUML source. @returns {boolean} Whether this parser owns it. */
  detect(text) {
    return this._detect ? this._detect(text) : false;
  }

  /** @returns {Record<string, any>} Mutable parser context. */
  createParseContext() {
    if (!this._createParseContext) {
      throw new Error("BaseModuleParser subclasses must implement createParseContext.");
    }
    return this._createParseContext();
  }
}
