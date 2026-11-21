/**
 * Streamable HTTP transport (opt-in). It binds to the loopback interface only,
 * answers every POST to `/mcp` with a single JSON response (no SSE, no
 * sessions) and rejects requests whose `Host` or `Origin` is not local, which
 * blocks DNS-rebinding attacks from web pages. An optional bearer token
 * additionally keeps other local users and processes out.
 * @module mcp/http
 */

import { createServer as createHttpServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { ERROR_CODES, errorResponse } from "./protocol.mjs";

/** The only interface the server listens on. */
export const HTTP_HOST = "127.0.0.1";

/** Path of the MCP endpoint. */
export const HTTP_PATH = "/mcp";

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * @typedef {object} HttpOptions
 * @property {number} port TCP port; 0 picks a free one.
 * @property {string} [authToken] Require `Authorization: Bearer <token>`.
 * @property {(message: string) => void} [log]
 */

/**
 * @typedef {object} HttpHandle
 * @property {number} port The port actually bound.
 * @property {string} url Endpoint URL.
 * @property {() => Promise<void>} close Stop listening and close the MCP server.
 */

/**
 * Whether a `Host` header names this machine's loopback interface.
 * @param {string | undefined} host
 */
function isLocalHost(host) {
  if (!host) return false;
  try {
    return LOCAL_HOSTNAMES.has(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

/**
 * Whether an `Origin` header (when present) is a local web origin.
 * @param {string | undefined} origin
 */
function isLocalOrigin(origin) {
  if (origin === undefined) return true;
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") && LOCAL_HOSTNAMES.has(url.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * @param {string | undefined} given
 * @param {string} expected
 */
function tokenMatches(given, expected) {
  const m = /^Bearer (.+)$/.exec(given ?? "");
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Listen on `127.0.0.1:<port>`.
 * @param {import("./server.mjs").McpServer} server
 * @param {HttpOptions} options
 * @returns {Promise<HttpHandle>}
 */
export function serveHttp(server, options) {
  const log = options.log ?? (() => {});
  const http = createHttpServer(async (req, res) => {
    /**
     * @param {number} status
     * @param {object | null} body
     * @param {Record<string, string>} [headers]
     */
    const reply = (status, body, headers = {}) => {
      const text = body === null ? "" : JSON.stringify(body);
      res.writeHead(status, {
        ...(body === null ? {} : { "Content-Type": "application/json; charset=utf-8" }),
        "Content-Length": Buffer.byteLength(text),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        // An unread request body must not be parsed as the next request.
        ...(req.complete ? {} : { Connection: "close" }),
        ...headers,
      });
      res.end(text);
    };
    const refuse = (/** @type {number} */ status, /** @type {string} */ message) =>
      reply(status, errorResponse(null, ERROR_CODES.invalidRequest, message));

    try {
      if (!isLocalHost(req.headers.host)) return refuse(403, "Forbidden host");
      if (!isLocalOrigin(req.headers.origin)) return refuse(403, "Forbidden origin");
      if (options.authToken && !tokenMatches(req.headers.authorization, options.authToken)) {
        return reply(401, errorResponse(null, ERROR_CODES.invalidRequest, "Unauthorized"), {
          "WWW-Authenticate": "Bearer",
        });
      }
      if (new URL(req.url ?? "/", "http://localhost").pathname !== HTTP_PATH) {
        return refuse(404, "Not found");
      }
      if (req.method !== "POST") {
        return reply(405, errorResponse(null, ERROR_CODES.invalidRequest, "Method not allowed"), {
          Allow: "POST",
        });
      }
      if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) {
        return refuse(415, "Content-Type must be application/json");
      }
      const declared = Number(req.headers["content-length"]);
      if (Number.isFinite(declared) && declared > server.maxMessageBytes) {
        return refuse(413, "Message too large");
      }
      const body = await readBody(req, server.maxMessageBytes);
      if (body === null) {
        // Not keep-alive: the unread rest of the body must not be parsed as the next request.
        return reply(413, errorResponse(null, ERROR_CODES.invalidRequest, "Message too large"), {
          Connection: "close",
        });
      }
      const controller = new AbortController();
      // The client disconnecting before the response is the HTTP cancellation signal.
      res.on("close", () => {
        if (!res.writableEnded) controller.abort();
      });
      const { text, status } = await server.handleText(body, {
        signal: controller.signal,
        headers: /** @type {Record<string, string | undefined>} */ (req.headers),
      });
      if (controller.signal.aborted) return;
      if (text === null) return reply(status === 200 ? 202 : status, null);
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(text),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(text);
    } catch (error) {
      log(`http request failed: ${error instanceof Error ? error.message : error}`);
      if (!res.headersSent) {
        reply(500, errorResponse(null, ERROR_CODES.internalError, "Internal error"));
      } else res.destroy();
    }
  });
  http.requestTimeout = 60_000;
  http.headersTimeout = 10_000;
  http.maxHeadersCount = 50;

  return new Promise((resolve, reject) => {
    http.once("error", reject);
    http.listen(options.port, HTTP_HOST, () => {
      http.off("error", reject);
      const address = /** @type {import("node:net").AddressInfo} */ (http.address());
      resolve({
        port: address.port,
        url: `http://${HTTP_HOST}:${address.port}${HTTP_PATH}`,
        async close() {
          await server.close();
          http.closeAllConnections();
          await new Promise((done) => http.close(done));
        },
      });
    });
  });
}

/**
 * Read a request body, or return null when it exceeds `maxBytes`.
 * @param {import("node:http").IncomingMessage} req
 * @param {number} maxBytes
 * @returns {Promise<string | null>}
 */
async function readBody(req, maxBytes) {
  /** @type {Buffer[]} */
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
