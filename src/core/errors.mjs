/**
 * Error types raised by the pipeline.
 * @module core/errors
 */

/**
 * Base class for every error thrown by excaliplant.
 * @public
 */
export class ExcaliplantError extends Error {
  /**
   * @param {string} message
   * @param {{ line?: number, code?: string, cause?: unknown }} [details]
   */
  constructor(message, details = {}) {
    super(details.line ? `${message} (line ${details.line})` : message, { cause: details.cause });
    this.name = "ExcaliplantError";
    /** Source line number (1-based) when known. */
    this.line = details.line ?? null;
    /** Stable machine-readable code. */
    this.code = details.code ?? "EXCALIPLANT_ERROR";
  }
}

/**
 * Raised when the source cannot be parsed (syntax error, strict mode, preprocessor failure).
 * @public
 */
export class ParseError extends ExcaliplantError {
  /**
   * @param {string} message
   * @param {{ line?: number, code?: string, cause?: unknown }} [details]
   */
  constructor(message, details = {}) {
    super(message, { code: "PARSE_ERROR", ...details });
    this.name = "ParseError";
  }
}

/**
 * Raised when an input exceeds a configured resource limit.
 * @public
 */
export class LimitError extends ExcaliplantError {
  /**
   * @param {string} message
   * @param {{ line?: number }} [details]
   */
  constructor(message, details = {}) {
    super(message, { code: "LIMIT_EXCEEDED", ...details });
    this.name = "LimitError";
  }
}
