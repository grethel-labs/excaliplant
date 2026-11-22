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
import { warmup as warmUpRenderer } from "../api.mjs";
import { isElkLoaded } from "../diagrams/graph/elk_runner.mjs";
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
 * @property {() => Promise<boolean>} [warmup] Pre-load the layout engine where the
 *   tools run, in the background. Resolves with whether the engine is loaded
 *   afterwards (never rejects). Calls are idempotent and a tool call never has
 *   to wait for it.
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
    async warmup() {
      if (closed) return false;
      await warmUpRenderer();
      return isElkLoaded();
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
 * @property {URL} [workerUrl] Worker entry point (default `./worker.mjs`); for tests.
 */

/**
 * Executor backed by one lazily started worker thread. Calls run one at a
 * time; a timeout or cancellation terminates the thread and the next call
 * starts a fresh one. After `warmup()` was called, every worker (also a
 * restarted one) pre-loads the layout engine in the background, concurrently
 * with the first calls: a call never waits for it.
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
  /** Warm every worker that is started (set by `warmup()`, cleared when warming fails). */
  let warm = false;
  /** @type {Map<Worker, { promise: Promise<boolean>, resolve: (loaded: boolean) => void, settled: boolean }>} */
  const warming = new Map();

  /**
   * Ask `w` to pre-load the layout engine (once per worker).
   * @param {Worker} w
   */
  function beginWarm(w) {
    const known = warming.get(w);
    if (known) return known.promise;
    /** @type {(loaded: boolean) => void} */
    let resolve = () => {};
    const promise = new Promise((r) => (resolve = r));
    warming.set(w, { promise, resolve, settled: false });
    try {
      w.postMessage({ warmup: true });
    } catch {
      settleWarm(w, false);
    }
    return promise;
  }

  /**
   * @param {Worker} w
   * @param {boolean} loaded
   */
  function settleWarm(w, loaded) {
    const entry = warming.get(w);
    if (!entry) return;
    entry.settled = true;
    entry.resolve(loaded);
    // Keep the settled entry: the worker is not asked twice.
  }

  /** @param {Worker} w */
  function warmSettled(w) {
    return warming.get(w)?.settled === true;
  }

  /**
   * After a job killed the worker, start the next one right away so the
   * engine is loaded again before the next call arrives.
   */
  function rewarm() {
    if (!warm || closed || worker || current) return;
    try {
      worker = startWorker();
    } catch (error) {
      log(`cannot start worker: ${error instanceof Error ? error.message : error}`);
    }
  }

  function startWorker() {
    const w = new Worker(options.workerUrl ?? new URL("./worker.mjs", import.meta.url), {
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
      if (message?.warmup) {
        // A warm-up that did not load the engine is not retried on later workers.
        if (!message.loaded) warm = false;
        settleWarm(w, message.loaded === true);
        return;
      }
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
      // The thread died on its own (not stopped by us) while warming: do not warm again.
      if (w === worker && warming.has(w) && !warmSettled(w)) warm = false;
      settleWarm(w, false);
      if (w === worker) crash();
    });
    if (warm) beginWarm(w);
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
    rewarm();
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
    rewarm();
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
    async warmup() {
      if (closed) return false;
      warm = true;
      try {
        worker ??= startWorker();
        return await beginWarm(worker);
      } catch (error) {
        log(`cannot start worker: ${error instanceof Error ? error.message : error}`);
        return false;
      }
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
