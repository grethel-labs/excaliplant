/**
 * Transport-independent MCP server: JSON-RPC dispatch, protocol version
 * handling and tool execution. The server speaks both families of protocol
 * revisions at once:
 *
 * - modern (`2026-07-28`): stateless, every request carries
 *   `_meta["io.modelcontextprotocol/protocolVersion"]`, discovery through
 *   `server/discover`;
 * - legacy (`2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`): the
 *   `initialize` handshake. The server keeps no per-connection state, so a
 *   request without modern metadata is answered with legacy semantics whether
 *   or not `initialize` came first.
 * @module mcp/server
 */

import { readFileSync } from "node:fs";
import { clamp, resolveLimits } from "../core/limits.mjs";
import { ExecutorError, createInlineExecutor, createWorkerExecutor } from "./executor.mjs";
import {
  ERROR_CODES,
  LEGACY_VERSIONS,
  META,
  MODERN_VERSIONS,
  RpcError,
  SUPPORTED_VERSIONS,
  clip,
  errorResponse,
  isObject,
  resultResponse,
} from "./protocol.mjs";
import { MAX_PNG_WIDTH, TOOLS, describeTool, errorResult, findTool } from "./tools.mjs";

/**
 * @typedef {object} ServerOptions
 * @property {Partial<import("../core/limits.mjs").Limits>} [limits] Overrides of the render limits.
 * @property {string} [includeDir] Allow `!include` of files below this directory. Default: none.
 * @property {number} [timeoutMs] Time limit per tool call (default 30000).
 * @property {number} [maxMessageBytes] Largest accepted JSON-RPC message (default: 2 x input limit + 64 KiB).
 * @property {number} [maxOutputBytes] Largest result payload (default 8 MiB).
 * @property {number} [maxBatch] Largest JSON-RPC batch (default 32).
 * @property {"worker" | "inline" | import("./executor.mjs").Executor} [executor] Where tools run (default "worker").
 * @property {(message: string) => void} [log] Receives diagnostics for stderr. Default: silent.
 */

/**
 * @typedef {object} HandleOptions
 * @property {AbortSignal} [signal] Abort when the client went away.
 * @property {Record<string, string | undefined>} [headers] Lower-case HTTP headers (HTTP transport only).
 */

/**
 * @typedef {object} HandleResult
 * @property {string | null} text Serialized response, or null when nothing is to be sent.
 * @property {number} status HTTP status the HTTP transport should use.
 */

/**
 * @typedef {object} McpServer
 * @property {Readonly<{ name: string, version: string }>} info
 * @property {number} maxMessageBytes
 * @property {(text: string, options?: HandleOptions) => Promise<HandleResult>} handleText Handle one raw JSON-RPC message or batch.
 * @property {(message: unknown, options?: HandleOptions) => Promise<{ response: object | null, status: number }>} handleMessage
 * @property {() => Promise<void>} close Stop the executor and cancel everything in flight.
 */

const PACKAGE_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const INSTRUCTIONS =
  "excaliplant renders PlantUML text to SVG, PNG or Excalidraw JSON. " +
  "Tools: render_plantuml, validate_plantuml, list_diagram_types, get_example. " +
  "All tools take text arguments only; no files or URLs are read.";

/** Cache hints for the modern list/discover results: the tool set is static. */
const CACHE = { ttlMs: 3_600_000, cacheScope: "public" };

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_BATCH = 32;

/**
 * Key for an in-flight request id (`1` and `"1"` are different ids).
 * @param {string | number} id
 */
const idKey = (id) => `${typeof id}:${id}`;

/**
 * Create a server. It does no I/O itself; feed it messages with
 * `handleText` (the stdio and HTTP transports do this).
 * @param {ServerOptions} [options]
 * @returns {McpServer}
 */
export function createServer(options = {}) {
  const log = options.log ?? (() => {});
  const limits = resolveLimits(options.limits);
  const timeoutMs = clamp(options.timeoutMs, 10, 600_000, DEFAULT_TIMEOUT_MS);
  const maxMessageBytes = clamp(
    options.maxMessageBytes,
    1024,
    Number.MAX_SAFE_INTEGER,
    2 * limits.maxInputBytes + 64 * 1024,
  );
  const maxOutputBytes = clamp(
    options.maxOutputBytes,
    1024,
    Number.MAX_SAFE_INTEGER,
    DEFAULT_MAX_OUTPUT_BYTES,
  );
  const maxBatch = clamp(options.maxBatch, 1, 1000, DEFAULT_MAX_BATCH);
  /** @type {import("./tools.mjs").ToolEnv} */
  const env = {
    limits,
    includeDir: options.includeDir ?? null,
    maxPngWidth: Math.min(MAX_PNG_WIDTH, limits.maxWidth),
    maxOutputBytes,
  };
  const executor =
    typeof options.executor === "object"
      ? options.executor
      : options.executor === "inline"
        ? createInlineExecutor(env, log)
        : createWorkerExecutor(env, log);
  const info = Object.freeze({ name: "excaliplant", version: PACKAGE_VERSION });
  const serverInfo = { ...info, title: "Excaliplant" };
  /** @type {Map<string, AbortController>} */
  const inflight = new Map();
  let closed = false;

  /**
   * @param {Record<string, any>} message
   * @param {Record<string, any> | undefined} params
   */
  function dispatchNotification(message, params) {
    if (message.method === "notifications/cancelled" && params) {
      const id = params.requestId;
      if (typeof id === "string" || typeof id === "number") inflight.get(idKey(id))?.abort();
    }
    // Everything else (notifications/initialized, progress, ...) needs no action.
  }

  /**
   * Check the stateless-revision metadata of a request.
   * @param {Record<string, any> | undefined} params
   */
  function checkModernMeta(params) {
    const meta = params?._meta;
    const fail = (/** @type {string} */ message) =>
      new RpcError(ERROR_CODES.invalidParams, message, { httpStatus: 400 });
    if (!isObject(meta)) throw fail("Missing params._meta with the protocol version");
    const version = meta[META.protocolVersion];
    if (typeof version !== "string") {
      throw fail(`Missing _meta["${META.protocolVersion}"]`);
    }
    if (!MODERN_VERSIONS.includes(version)) {
      throw new RpcError(ERROR_CODES.unsupportedProtocolVersion, "Unsupported protocol version", {
        data: { supported: [...MODERN_VERSIONS], requested: clip(version, 40) },
        httpStatus: 400,
      });
    }
    if (!isObject(meta[META.clientCapabilities])) {
      throw fail(`Missing _meta["${META.clientCapabilities}"]`);
    }
  }

  /**
   * Compare the mirrored HTTP headers with the request body.
   * @param {Record<string, any>} message
   * @param {Record<string, any> | undefined} params
   * @param {Record<string, string | undefined>} headers
   * @param {boolean} modern
   */
  function checkHeaders(message, params, headers, modern) {
    const mismatch = (/** @type {string} */ text) =>
      new RpcError(ERROR_CODES.headerMismatch, text, { httpStatus: 400 });
    const headerVersion = headers["mcp-protocol-version"];
    if (modern) {
      const bodyVersion = params?._meta?.[META.protocolVersion];
      if (headerVersion !== bodyVersion) {
        throw mismatch("MCP-Protocol-Version header does not match the request body");
      }
      if (headers["mcp-method"] !== message.method) {
        throw mismatch("Mcp-Method header does not match the request body");
      }
      if (message.method === "tools/call") {
        if (decodeHeaderValue(headers["mcp-name"]) !== params?.name) {
          throw mismatch("Mcp-Name header does not match the request body");
        }
      }
    } else if (headerVersion !== undefined && !SUPPORTED_VERSIONS.includes(headerVersion)) {
      throw new RpcError(ERROR_CODES.unsupportedProtocolVersion, "Unsupported protocol version", {
        data: { supported: [...SUPPORTED_VERSIONS], requested: clip(headerVersion, 40) },
        httpStatus: 400,
      });
    }
  }

  /**
   * @param {Record<string, any>} message
   * @param {Record<string, any> | undefined} params
   * @param {boolean} modern
   * @param {AbortSignal} signal
   * @returns {Promise<Record<string, unknown>>}
   */
  async function dispatchRequest(message, params, modern, signal) {
    const method = message.method;
    switch (method) {
      case "initialize": {
        if (typeof params?.protocolVersion !== "string") {
          throw new RpcError(ERROR_CODES.invalidParams, "initialize requires protocolVersion");
        }
        // Echo the client's revision when known, otherwise offer our newest
        // handshake-based one (the client then decides whether to continue).
        const requested = params.protocolVersion;
        return {
          protocolVersion: LEGACY_VERSIONS.includes(requested) ? requested : LEGACY_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo,
          instructions: INSTRUCTIONS,
        };
      }
      case "ping":
        if (modern) break;
        return {};
      case "server/discover":
        return {
          resultType: "complete",
          supportedVersions: [...MODERN_VERSIONS],
          capabilities: { tools: {} },
          instructions: INSTRUCTIONS,
          ...CACHE,
        };
      case "tools/list":
        return {
          ...(modern ? { resultType: "complete", ...CACHE } : {}),
          tools: TOOLS.map(describeTool),
        };
      case "tools/call":
        return {
          ...(modern ? { resultType: "complete" } : {}),
          ...(await callTool(params, signal)),
        };
      default:
    }
    throw new RpcError(ERROR_CODES.methodNotFound, `Method not found: ${clip(method, 80)}`, {
      httpStatus: modern ? 404 : 200,
    });
  }

  /**
   * @param {Record<string, any> | undefined} params
   * @param {AbortSignal} signal
   * @returns {Promise<import("./tools.mjs").CallToolResult>}
   */
  async function callTool(params, signal) {
    if (typeof params?.name !== "string") {
      throw new RpcError(ERROR_CODES.invalidParams, "tools/call requires a tool name");
    }
    if (params.arguments !== undefined && !isObject(params.arguments)) {
      throw new RpcError(ERROR_CODES.invalidParams, "tools/call arguments must be an object");
    }
    const tool = findTool(params.name);
    if (!tool) {
      throw new RpcError(ERROR_CODES.invalidParams, `Unknown tool: ${clip(params.name, 80)}`);
    }
    try {
      return await executor.run(tool.name, params.arguments ?? {}, { signal, timeoutMs });
    } catch (error) {
      if (!(error instanceof ExecutorError)) throw error;
      switch (error.reason) {
        case "aborted":
          throw error;
        case "timeout":
          return errorResult(
            `The call took longer than ${Math.round(timeoutMs / 1000)} s and was stopped`,
          );
        case "busy":
          return errorResult("The server is busy with other requests; retry later");
        case "closed":
          return errorResult("The server is shutting down");
        default:
          return errorResult("The call failed and was stopped (resource limit or internal error)");
      }
    }
  }

  /**
   * Handle one JSON-RPC message (already parsed).
   * @param {unknown} message
   * @param {HandleOptions} [opts]
   * @returns {Promise<{ response: object | null, status: number }>}
   */
  async function handleMessage(message, opts = {}) {
    if (!isObject(message) || message.jsonrpc !== "2.0") {
      return invalid(null, "Invalid JSON-RPC message");
    }
    const hasId = Object.hasOwn(message, "id");
    const id = message.id;
    if (typeof message.method !== "string") {
      // A response from the client: this server sends no requests, so ignore it.
      if (Object.hasOwn(message, "result") || Object.hasOwn(message, "error")) {
        return { response: null, status: 202 };
      }
      return invalid(null, "Invalid JSON-RPC message");
    }
    const params = isObject(message.params) ? message.params : undefined;
    if (message.params !== undefined && !params) {
      return hasId && validId(id)
        ? fail(id, new RpcError(ERROR_CODES.invalidParams, "params must be an object"))
        : { response: null, status: 202 };
    }
    if (!hasId) {
      dispatchNotification(message, params);
      return { response: null, status: 202 };
    }
    if (!validId(id)) return invalid(null, "Request id must be a string or an integer");
    if (closed) return fail(id, new RpcError(ERROR_CODES.internalError, "Server is shutting down"));
    const key = idKey(id);
    if (inflight.has(key)) return invalid(id, "A request with this id is already in progress");

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    inflight.set(key, controller);
    try {
      const modern =
        message.method !== "initialize" &&
        (message.method === "server/discover" ||
          (isObject(params?._meta) && params._meta[META.protocolVersion] !== undefined));
      if (modern) checkModernMeta(params);
      if (opts.headers) checkHeaders(message, params, opts.headers, modern);
      const result = await dispatchRequest(message, params, modern, controller.signal);
      if (controller.signal.aborted) return { response: null, status: 200 };
      if (modern) {
        result._meta = { ...(isObject(result._meta) ? result._meta : {}), [META.serverInfo]: info };
      }
      return { response: resultResponse(id, result), status: 200 };
    } catch (error) {
      if (controller.signal.aborted) return { response: null, status: 200 };
      if (error instanceof RpcError) return fail(id, error);
      log(
        `request ${String(message.method)} failed: ${error instanceof Error ? (error.stack ?? error.message) : error}`,
      );
      return fail(id, new RpcError(ERROR_CODES.internalError, "Internal error"));
    } finally {
      opts.signal?.removeEventListener("abort", onAbort);
      inflight.delete(key);
    }
  }

  /**
   * @param {string} text
   * @param {HandleOptions} [opts]
   * @returns {Promise<HandleResult>}
   */
  async function handleText(text, opts = {}) {
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return respond(errorResponse(null, ERROR_CODES.parseError, "Parse error"), 400);
    }
    if (Array.isArray(parsed)) {
      if (parsed.length === 0 || parsed.length > maxBatch) {
        return respond(
          errorResponse(
            null,
            ERROR_CODES.invalidRequest,
            `Batch must contain 1 to ${maxBatch} messages`,
          ),
          400,
        );
      }
      const done = await Promise.all(parsed.map((m) => handleMessage(m, opts)));
      const responses = done.map((d) => d.response).filter((r) => r !== null);
      return responses.length === 0 ? { text: null, status: 202 } : respond(responses, 200);
    }
    const { response, status } = await handleMessage(parsed, opts);
    return response === null ? { text: null, status } : respond(response, status);
  }

  return {
    info,
    maxMessageBytes,
    handleText,
    handleMessage,
    async close() {
      closed = true;
      for (const controller of inflight.values()) controller.abort();
      await executor.close();
    },
  };
}

/**
 * @param {unknown} id
 * @returns {id is string | number}
 */
function validId(id) {
  return typeof id === "string" || (typeof id === "number" && Number.isFinite(id));
}

/**
 * @param {string | number | null} id
 * @param {string} message
 */
function invalid(id, message) {
  return { response: errorResponse(id, ERROR_CODES.invalidRequest, message), status: 400 };
}

/**
 * @param {string | number} id
 * @param {RpcError} error
 */
function fail(id, error) {
  return {
    response: errorResponse(id, error.code, error.message, error.data),
    status: error.httpStatus,
  };
}

/**
 * @param {object} payload
 * @param {number} status
 * @returns {HandleResult}
 */
function respond(payload, status) {
  return { text: JSON.stringify(payload), status };
}

/**
 * Decode the `=?base64?...?=` form clients use for header values that are not
 * plain ASCII.
 * @param {string | undefined} value
 */
function decodeHeaderValue(value) {
  if (value === undefined) return undefined;
  const m = /^=\?base64\?([A-Za-z0-9+/=]*)\?=$/.exec(value);
  return m ? Buffer.from(m[1], "base64").toString("utf8") : value;
}
