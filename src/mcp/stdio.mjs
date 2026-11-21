/**
 * stdio transport: newline-delimited JSON-RPC messages on stdin/stdout, logs on
 * stderr. Nothing but protocol messages is ever written to `stdout`.
 * @module mcp/stdio
 */

import { ERROR_CODES, errorResponse } from "./protocol.mjs";

/**
 * Split a byte stream into lines without ever buffering more than
 * `maxBytes` of one line: an over-long line is discarded up to its newline
 * and reported once through `onOverflow`.
 */
export class LineSplitter {
  /**
   * @param {number} maxBytes
   * @param {(line: string) => void} onLine
   * @param {() => void} onOverflow
   */
  constructor(maxBytes, onLine, onOverflow) {
    this.maxBytes = maxBytes;
    this.onLine = onLine;
    this.onOverflow = onOverflow;
    /** @type {Buffer[]} */
    this.parts = [];
    this.size = 0;
    this.discarding = false;
  }

  /** @param {Buffer} chunk */
  push(chunk) {
    let start = 0;
    for (;;) {
      const newline = chunk.indexOf(0x0a, start);
      if (newline < 0) {
        this.#append(chunk.subarray(start));
        return;
      }
      this.#append(chunk.subarray(start, newline));
      if (this.discarding) this.discarding = false;
      else this.#flush();
      start = newline + 1;
    }
  }

  /** Flush a final line that has no trailing newline. */
  end() {
    if (!this.discarding) this.#flush();
    this.parts = [];
    this.size = 0;
  }

  /** @param {Buffer} piece */
  #append(piece) {
    if (this.discarding || piece.length === 0) return;
    this.size += piece.length;
    if (this.size > this.maxBytes) {
      this.discarding = true;
      this.parts = [];
      this.size = 0;
      this.onOverflow();
      return;
    }
    this.parts.push(piece);
  }

  #flush() {
    if (this.size === 0) return;
    const line = Buffer.concat(this.parts, this.size).toString("utf8").replace(/\r$/, "");
    this.parts = [];
    this.size = 0;
    if (line.trim() !== "") this.onLine(line);
  }
}

/**
 * @typedef {object} StdioStreams
 * @property {NodeJS.ReadableStream} stdin
 * @property {NodeJS.WritableStream} stdout
 * @property {NodeJS.WritableStream} [stderr]
 * @property {AbortSignal} [signal] Stop reading and shut down (as if the input had ended).
 */

/**
 * Serve `server` over the given streams until the input ends. Requests are
 * handled concurrently (so a cancellation can overtake a running call); the
 * returned promise resolves when the input is closed and every response has
 * been written. The server is closed at that point.
 * @param {import("./server.mjs").McpServer} server
 * @param {StdioStreams} streams
 * @returns {Promise<void>}
 */
export function serveStdio(server, { stdin, stdout, stderr, signal }) {
  /** @type {Set<Promise<void>>} */
  const pending = new Set();
  let writeChain = Promise.resolve();

  /** @param {string} text */
  const send = (text) => {
    writeChain = writeChain.then(
      () =>
        new Promise((resolve) => {
          // The callback fires once the chunk is flushed (or the stream failed).
          stdout.write(`${text}\n`, () => resolve());
        }),
    );
    return writeChain;
  };

  /** @param {Promise<unknown>} work */
  const track = (work) => {
    /** @type {Promise<void>} */
    const task = work
      .then(
        () => {},
        (error) => {
          stderr?.write(`excaliplant-mcp: unexpected failure: ${error?.message ?? error}\n`);
        },
      )
      .then(() => {
        pending.delete(task);
      });
    pending.add(task);
  };

  const splitter = new LineSplitter(
    server.maxMessageBytes,
    (line) =>
      track(server.handleText(line).then(({ text }) => (text === null ? undefined : send(text)))),
    () =>
      track(
        send(JSON.stringify(errorResponse(null, ERROR_CODES.invalidRequest, "Message too large"))),
      ),
  );

  return new Promise((resolve) => {
    let finished = false;
    const finish = async () => {
      if (finished) return;
      finished = true;
      splitter.end();
      // A stop request (SIGTERM) cancels running calls; end of input lets them finish.
      if (signal?.aborted) await server.close();
      while (pending.size > 0) await Promise.allSettled([...pending]);
      await writeChain;
      await server.close();
      resolve();
    };
    signal?.addEventListener("abort", finish, { once: true });
    if (signal?.aborted) finish();
    stdin.on("data", (chunk) => splitter.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stdin.on("end", finish);
    stdin.on("close", finish);
    stdin.on("error", (error) => {
      stderr?.write(`excaliplant-mcp: input error: ${error.message}\n`);
      finish();
    });
  });
}
