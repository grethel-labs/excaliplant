/**
 * Constants and helpers for the JSON-RPC 2.0 / Model Context Protocol wire
 * format. Nothing in here knows about PlantUML.
 * @module mcp/protocol
 */

/**
 * Stateless protocol revisions: version and capabilities travel in the `_meta`
 * of every request, there is no `initialize` handshake.
 * @type {readonly string[]}
 */
export const MODERN_VERSIONS = Object.freeze(["2026-07-28"]);

/**
 * Handshake-based revisions (`initialize` / `notifications/initialized`),
 * newest first.
 * @type {readonly string[]}
 */
export const LEGACY_VERSIONS = Object.freeze([
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
]);

/** Every revision this server speaks. */
export const SUPPORTED_VERSIONS = Object.freeze([...MODERN_VERSIONS, ...LEGACY_VERSIONS]);

/** Reserved `_meta` keys of the stateless revisions. */
export const META = Object.freeze({
  protocolVersion: "io.modelcontextprotocol/protocolVersion",
  clientInfo: "io.modelcontextprotocol/clientInfo",
  clientCapabilities: "io.modelcontextprotocol/clientCapabilities",
  serverInfo: "io.modelcontextprotocol/serverInfo",
});

/** JSON-RPC and MCP error codes used by this server. */
export const ERROR_CODES = Object.freeze({
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  headerMismatch: -32020,
  unsupportedProtocolVersion: -32022,
});

/**
 * A JSON-RPC error that is sent back to the client. `httpStatus` is only used
 * by the HTTP transport.
 */
export class RpcError extends Error {
  /**
   * @param {number} code
   * @param {string} message
   * @param {{ data?: unknown, httpStatus?: number }} [details]
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.data = details.data;
    this.httpStatus = details.httpStatus ?? 200;
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
export function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Build an error response object.
 * @param {string | number | null} id
 * @param {number} code
 * @param {string} message
 * @param {unknown} [data]
 */
export function errorResponse(id, code, message, data) {
  const error = data === undefined ? { code, message } : { code, message, data };
  return { jsonrpc: "2.0", id, error };
}

/**
 * Build a success response object.
 * @param {string | number} id
 * @param {Record<string, unknown>} result
 */
export function resultResponse(id, result) {
  return { jsonrpc: "2.0", id, result };
}

/**
 * Remove control characters and cap the length of text that is echoed back to
 * a client (error messages, diagnostics).
 * @param {unknown} text
 * @param {number} [max]
 * @returns {string}
 */
export function clip(text, max = 400) {
  const s = String(text).replace(/[\u0000-\u001f\u007f]+/g, " ");
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}
