/**
 * Command-line front end of the MCP server. Parses options and wires the
 * transports; `bin/excaliplant-mcp.mjs` only forwards the process streams.
 * @module mcp/cli
 */

import { statSync } from "node:fs";
import process from "node:process";
import { createServer } from "./server.mjs";
import { serveStdio } from "./stdio.mjs";
import { serveHttp, HTTP_HOST, HTTP_PATH } from "./http.mjs";

const HELP = `excaliplant-mcp: Model Context Protocol server for excaliplant

Usage:
  excaliplant-mcp [options]

Speaks MCP over stdio by default (one JSON-RPC message per line on stdin and
stdout, logs on stderr).

Options:
      --http <port>          Serve Streamable HTTP on ${HTTP_HOST}:<port>${HTTP_PATH} instead of stdio
                             (0 picks a free port; loopback only). Set EXCALIPLANT_MCP_TOKEN to
                             require "Authorization: Bearer <token>".
      --include-dir <dir>    Allow !include of files below <dir> (default: no includes)
      --max-input-bytes <n>  PlantUML source size limit (default 2 MiB, max 64 MiB)
      --timeout <ms>         Time limit per tool call (default 30000)
      --no-warmup            Do not pre-load the layout engine in the background at start-up
  -h, --help                 Show this help
  -v, --version              Show the version
`;

const MAX_INPUT_CEILING = 64 * 1024 * 1024;

/**
 * @typedef {object} CliIo
 * @property {NodeJS.ReadableStream} stdin
 * @property {NodeJS.WritableStream} stdout
 * @property {NodeJS.WritableStream} stderr
 * @property {Record<string, string | undefined>} [env]
 * @property {AbortSignal} [signal] Stops the server (SIGINT/SIGTERM in the real process).
 * @property {() => void} [onListening] Called once the HTTP listener is up.
 */

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ http?: number, includeDir?: string, maxInputBytes?: number, timeoutMs?: number, warmup?: boolean, help?: boolean, version?: boolean }} */
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      return v;
    };
    /** @param {string} value */
    const integer = (value, /** @type {number} */ min, /** @type {number} */ max) => {
      const n = Number(value);
      if (!/^\d+$/.test(value) || n < min || n > max) {
        throw new Error(`${a} expects an integer from ${min} to ${max}`);
      }
      return n;
    };
    switch (a) {
      case "--http":
        opts.http = integer(next(), 0, 65535);
        break;
      case "--include-dir":
        opts.includeDir = next();
        break;
      case "--max-input-bytes":
        opts.maxInputBytes = integer(next(), 1, MAX_INPUT_CEILING);
        break;
      case "--timeout":
        opts.timeoutMs = integer(next(), 10, 600_000);
        break;
      case "--no-warmup":
        opts.warmup = false;
        break;
      case "-h":
      case "--help":
        opts.help = true;
        break;
      case "-v":
      case "--version":
        opts.version = true;
        break;
      default:
        throw new Error(`Unknown option ${a}`);
    }
  }
  return opts;
}

/**
 * Run the server on the real process streams: SIGINT/SIGTERM stop it, stdout
 * carries protocol messages only. Used by `excaliplant-mcp` (and available to
 * other launchers such as an `excaliplant mcp` subcommand). Sets
 * `process.exitCode`.
 * @param {string[]} argv Arguments after the program name.
 * @returns {Promise<void>}
 */
export async function runMcpProcess(argv) {
  const controller = new AbortController();
  for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM"])) {
    process.once(signal, () => controller.abort());
  }
  // A client that went away is not an error.
  process.stdout.on("error", (err) => {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === "EPIPE") process.exit(0);
    throw err;
  });
  process.exitCode = await runMcpCli(argv, {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    env: process.env,
    signal: controller.signal,
  });
  // Release stdin so the process can exit after a stop signal.
  process.stdin.destroy();
}

/**
 * Run the server. Resolves with the process exit code.
 * @param {string[]} argv Arguments after the program name.
 * @param {CliIo} io
 * @returns {Promise<number>}
 */
export async function runMcpCli(argv, io) {
  const { stdin, stdout, stderr } = io;
  const log = (/** @type {string} */ message) => void stderr.write(`excaliplant-mcp: ${message}\n`);
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    log(`${error instanceof Error ? error.message : error}\n\n${HELP}`);
    return 2;
  }
  if (opts.help) {
    stdout.write(HELP);
    return 0;
  }
  const server = createServer({
    includeDir: opts.includeDir,
    limits: opts.maxInputBytes ? { maxInputBytes: opts.maxInputBytes } : undefined,
    timeoutMs: opts.timeoutMs,
    warmup: opts.warmup !== false,
    log,
  });
  if (opts.version) {
    stdout.write(`${server.info.version}\n`);
    await server.close();
    return 0;
  }
  if (opts.includeDir) {
    try {
      if (!statSync(opts.includeDir).isDirectory()) throw new Error("not a directory");
    } catch {
      log(`--include-dir is not a readable directory: ${opts.includeDir}`);
      await server.close();
      return 2;
    }
  }

  if (opts.http !== undefined) {
    let handle;
    try {
      handle = await serveHttp(server, {
        port: opts.http,
        authToken: io.env?.EXCALIPLANT_MCP_TOKEN || undefined,
        log,
      });
    } catch (error) {
      log(
        `cannot listen on ${HTTP_HOST}:${opts.http}: ${error instanceof Error ? error.message : error}`,
      );
      await server.close();
      return 1;
    }
    log(`listening on ${handle.url}`);
    io.onListening?.();
    await new Promise((resolve) => {
      if (io.signal?.aborted) resolve(undefined);
      io.signal?.addEventListener("abort", () => resolve(undefined), { once: true });
    });
    await handle.close();
    return 0;
  }

  await serveStdio(server, { stdin, stdout, stderr, signal: io.signal });
  return 0;
}
