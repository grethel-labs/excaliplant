/**
 * Runs tool calls with a time limit and cancellation. The worker executor
 * isolates the CPU-bound PlantUML pipeline on a worker thread, so a timeout or
 * a cancelled request really stops the work (the thread is terminated) and an
 * out-of-memory crash does not take the server down. The inline executor runs
 * in the calling thread and can only give up waiting; it is meant for tests
 * and embedding.
 * @module mcp/executor
 */

import { Worker } from "node:worker_threads";
import { runTool } from "./tools.mjs";

/**
 * Why a run did not produce a result.
 * @typedef {"timeout" | "aborted" | "busy" | "crashed" | "closed"} ExecutorFailure
 */

/** Failure of an executor run (as opposed to a tool error, which is a result). */
export class ExecutorError extends Error {
  /**
   * @param {ExecutorFailure} reason
   */
  constructor(reason) {
    super(reason);
    this.name = "ExecutorError";
    this.reason = reason;
  }
}

/**
 * @typedef {object} RunOptions
 * @property {AbortSignal} [signal] Abort the run (request cancelled).
 * @property {number} timeoutMs Time limit for the run itself.
 */

/**
 * @typedef {object} Executor
 * @property {(tool: string, args: unknown, options: RunOptions) => Promise<import("./tools.mjs").CallToolResult>} run
 * @property {() => Promise<void>} close
 */

/**
 * @param {import("./tools.mjs").ToolEnv} env
 * @param {(message: string) => void} log
 * @returns {Executor}
 */
export function createInlineExecutor(env, log) {
  let closed = false;
  return {
    async run(tool, args, { signal, timeoutMs }) {
      if (closed) throw new ExecutorError("closed");
      if (signal?.aborted) throw new ExecutorError("aborted");
      /** @type {NodeJS.Timeout | undefined} */
      let timer;
      /** @type {(() => void) | undefined} */
      let onAbort;
      const guard = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new ExecutorError("timeout")), timeoutMs);
        onAbort = () => reject(new ExecutorError("aborted"));
        signal?.addEventListener("abort", onAbort, { once: true });
      });
      try {
        return await Promise.race([runTool(tool, args, env, log), guard]);
      } finally {
        clearTimeout(timer);
        if (onAbort) signal?.removeEventListener("abort", onAbort);
      }
    },
    async close() {
      closed = true;
    },
  };
}

/**
 * @typedef {object} WorkerExecutorOptions
 * @property {number} [maxQueue] Pending calls beyond the running one before `busy` (default 16).
 * @property {number} [maxMemoryMb] Heap limit of the worker thread (default 768).
 */

/**
 * Executor backed by one lazily started worker thread. Calls run one at a
 * time; a timeout or cancellation terminates the thread and the next call
 * starts a fresh one.
 * @param {import("./tools.mjs").ToolEnv} env
 * @param {(message: string) => void} log
 * @param {WorkerExecutorOptions} [options]
 * @returns {Executor}
 */
export function createWorkerExecutor(env, log, options = {}) {
  const maxQueue = options.maxQueue ?? 16;
  const maxMemoryMb = options.maxMemoryMb ?? 768;

  /**
   * @typedef {object} Job
   * @property {number} id
   * @property {string} tool
   * @property {unknown} args
   * @property {number} timeoutMs
   * @property {(result: import("./tools.mjs").CallToolResult) => void} resolve
   * @property {(error: Error) => void} reject
   * @property {() => void} cleanup
   */

  /** @type {Job[]} */
  const queue = [];
  /** @type {Job | null} */
  let current = null;
  /** @type {Worker | null} */
  let worker = null;
  /** @type {NodeJS.Timeout | null} */
  let timer = null;
  let seq = 0;
  let closed = false;

  function startWorker() {
    const w = new Worker(new URL("./worker.mjs", import.meta.url), {
      workerData: { env },
      resourceLimits: { maxOldGenerationSizeMb: maxMemoryMb },
      // Keep the worker's stdout away from ours: stdout carries the protocol.
      stdout: true,
      stderr: true,
    });
    w.unref();
    w.stdout.on("data", (chunk) => log(String(chunk).trimEnd()));
    w.stderr.on("data", (chunk) => log(String(chunk).trimEnd()));
    w.on("message", (message) => {
      if (w !== worker || !current || message?.id !== current.id) return;
      const job = current;
      finish();
      job.resolve(message.result);
      pump();
    });
    w.on("error", (/** @type {Error} */ error) => {
      log(`worker error: ${error?.message ?? error}`);
      if (w === worker) crash();
    });
    w.on("exit", () => {
      if (w === worker) crash();
    });
    return w;
  }

  /** Forget the running job without resolving it. */
  function finish() {
    if (timer) clearTimeout(timer);
    timer = null;
    current?.cleanup();
    current = null;
  }

  /** The worker died on its own (out of memory, native crash). */
  function crash() {
    worker = null;
    if (!current) return;
    const job = current;
    finish();
    job.reject(new ExecutorError("crashed"));
    pump();
  }

  /**
   * Stop the worker thread and fail the running job with `reason`.
   * @param {ExecutorFailure} reason
   */
  function killCurrent(reason) {
    const w = worker;
    worker = null;
    w?.terminate().catch(() => {});
    if (!current) return;
    const job = current;
    finish();
    job.reject(new ExecutorError(reason));
    pump();
  }

  function pump() {
    if (current || closed) return;
    const job = queue.shift();
    if (!job) return;
    current = job;
    try {
      worker ??= startWorker();
    } catch (error) {
      log(`cannot start worker: ${error instanceof Error ? error.message : error}`);
      finish();
      job.reject(new ExecutorError("crashed"));
      pump();
      return;
    }
    timer = setTimeout(() => killCurrent("timeout"), job.timeoutMs);
    worker.postMessage({ id: job.id, tool: job.tool, args: job.args });
  }

  return {
    run(tool, args, { signal, timeoutMs }) {
      if (closed) return Promise.reject(new ExecutorError("closed"));
      if (signal?.aborted) return Promise.reject(new ExecutorError("aborted"));
      if (queue.length >= maxQueue) return Promise.reject(new ExecutorError("busy"));
      return new Promise((resolve, reject) => {
        /** @type {Job} */
        const job = { id: ++seq, tool, args, timeoutMs, resolve, reject, cleanup: () => {} };
        const onAbort = () => {
          const i = queue.indexOf(job);
          if (i >= 0) {
            queue.splice(i, 1);
            job.cleanup();
            reject(new ExecutorError("aborted"));
          } else if (current === job) killCurrent("aborted");
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        job.cleanup = () => signal?.removeEventListener("abort", onAbort);
        queue.push(job);
        pump();
      });
    },
    async close() {
      closed = true;
      for (const job of queue.splice(0)) {
        job.cleanup();
        job.reject(new ExecutorError("closed"));
      }
      killCurrent("closed");
    },
  };
}
