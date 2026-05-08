/**
 * Shared diagnostic helpers for parser, module, security and renderer
 * boundaries.
 * @module platform/diagnostics
 */

/** @public */
export const DIAGNOSTIC_SEVERITIES = Object.freeze({
  info: "info",
  warning: "warning",
  error: "error",
  fatal: "fatal",
});

/**
 * @typedef {"info"|"warning"|"error"|"fatal"} DiagnosticSeverity
 */

/**
 * @typedef {object} Diagnostic
 * @property {DiagnosticSeverity} severity Severity used by fail-closed gates.
 * @property {string} code Stable machine-readable diagnostic code.
 * @property {string} message Human-readable diagnostic message.
 * @property {string} [module] Diagram module that emitted the diagnostic.
 * @property {string} [phase] parse | layout | render | docs | test | security.
 * @property {string} [feature] Optional PlantUML feature key.
 * @property {number} [line] Optional zero-based source line.
 * @property {unknown} [data] Non-sensitive structured context.
 */

/**
 * Create a normalised diagnostic record.
 * @param {Partial<Diagnostic>} spec Diagnostic fields.
 * @returns {Diagnostic}
 * @public
 */
export function createDiagnostic(spec = {}) {
  return Object.freeze({
    severity: spec.severity ?? "warning",
    code: spec.code ?? "diagnostic.generic",
    message: spec.message ?? "Diagnostic emitted.",
    ...(spec.module ? { module: spec.module } : {}),
    ...(spec.phase ? { phase: spec.phase } : {}),
    ...(spec.feature ? { feature: spec.feature } : {}),
    ...(Number.isInteger(spec.line) ? { line: spec.line } : {}),
    ...(spec.data !== undefined ? { data: spec.data } : {}),
  });
}

/**
 * Whether a diagnostic must stop the affected operation.
 * @param {Diagnostic} diagnostic Diagnostic to inspect.
 * @returns {boolean}
 * @public
 */
export function isFatalDiagnostic(diagnostic) {
  return diagnostic.severity === "fatal";
}

/**
 * Error wrapper for fatal diagnostics. The message is intentionally
 * diagnostic-oriented and avoids leaking internal stack details into
 * generated artifacts.
 * @public
 */
export class DiagnosticError extends Error {
  /**
   * @param {Diagnostic} diagnostic Fatal diagnostic.
   * @param {{cause?:unknown}} [options]
   */
  constructor(diagnostic, options = {}) {
    super(`${diagnostic.code}: ${diagnostic.message}`, { cause: options.cause });
    this.name = "DiagnosticError";
    this.diagnostic = diagnostic;
  }
}
