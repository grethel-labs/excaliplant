/**
 * Diagnostics collected while processing a diagram.
 * @module core/diagnostics
 */

import { ParseError } from "./errors.mjs";

/**
 * @typedef {object} Diagnostic
 * @property {"warning" | "info"} severity
 * @property {string} message
 * @property {number | null} line 1-based source line, when known.
 */

/**
 * Collects warnings during parsing. In `strict` mode warnings about
 * unrecognised syntax are raised as {@link ParseError}s instead.
 * @public
 */
export class Diagnostics {
  /** @param {{ strict?: boolean, max?: number }} [options] */
  constructor(options = {}) {
    this.strict = options.strict === true;
    this.max = options.max ?? 500;
    /** @type {Diagnostic[]} */
    this.items = [];
  }

  /**
   * @param {string} message
   * @param {number | null} [line]
   */
  warn(message, line = null) {
    if (this.items.length < this.max) this.items.push({ severity: "warning", message, line });
  }

  /**
   * @param {string} message
   * @param {number | null} [line]
   */
  info(message, line = null) {
    if (this.items.length < this.max) this.items.push({ severity: "info", message, line });
  }

  /**
   * Report a line no parser rule recognised.
   * @param {string} text
   * @param {number | null} line
   */
  unknown(text, line) {
    const preview = text.length > 80 ? `${text.slice(0, 77)}...` : text;
    if (this.strict)
      throw new ParseError(`Unrecognised syntax: ${preview}`, { line: line ?? undefined });
    this.warn(`Ignored unrecognised line: ${preview}`, line);
  }

  /** @returns {Diagnostic[]} */
  toJSON() {
    return this.items.slice();
  }
}
