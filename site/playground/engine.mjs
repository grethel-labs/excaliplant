// Page side of the render worker: starts it, sends requests, drops stale
// results, and restarts the worker when a render hangs.

/** A render that takes longer than this is abandoned and the worker restarted. */
export const RENDER_TIMEOUT_MS = 20_000;

/**
 * @typedef {object} EngineHooks
 * @property {(version: string) => void} [onReady]
 * @property {(mode: "worker" | "page") => void} [onMode]
 */

/**
 * @param {{ workerUrl: string, scriptUrl?: string, timeoutMs?: number } & EngineHooks} config
 */
export function createEngineClient(config) {
  const timeoutMs = config.timeoutMs ?? RENDER_TIMEOUT_MS;
  /** @type {Worker | null} */
  let worker = null;
  /** @type {"worker" | "page"} */
  let mode = "worker";
  let ready = false;
  let nextId = 1;
  /** @type {Map<number, { resolve: (v: any) => void, timer: ReturnType<typeof setTimeout> | null }>} */
  const pending = new Map();
  /** @type {Promise<any> | null} */
  let pageEngine = null;

  /** @param {any} msg */
  function receive(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "ready") {
      ready = true;
      config.onReady?.(String(msg.version ?? ""));
      return;
    }
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (entry.timer) clearTimeout(entry.timer);
    entry.resolve(msg);
  }

  /** Load the engine into the page itself; only used when workers are unavailable. */
  function loadPageEngine() {
    pageEngine ??= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = config.scriptUrl ?? config.workerUrl;
      script.onload = () => {
        const engine = /** @type {any} */ (globalThis).excaliplantEngine;
        if (!engine) return reject(new Error("Engine script did not initialise"));
        engine.warmup().then(
          (m) => receive(m),
          () => {},
        );
        resolve(engine);
      };
      script.onerror = () => reject(new Error("Could not load the engine"));
      document.head.append(script);
    });
    return pageEngine;
  }

  function start() {
    ready = false;
    if (mode === "page") {
      loadPageEngine().catch(() => {});
      return;
    }
    try {
      const w = new Worker(config.workerUrl);
      w.onmessage = (e) => receive(e.data);
      w.onerror = () => {
        // Browsers that refuse workers on file:// report it here.
        if (!ready && worker === w) switchToPage();
      };
      worker = w;
      config.onMode?.("worker");
    } catch {
      switchToPage();
    }
  }

  function switchToPage() {
    worker?.terminate();
    worker = null;
    mode = "page";
    config.onMode?.("page");
    for (const [id, entry] of pending) {
      pending.delete(id);
      if (entry.timer) clearTimeout(entry.timer);
      entry.resolve({
        type: "result",
        id,
        ok: false,
        error: "Engine restarted, rendering again…",
        line: null,
        ms: 0,
        retry: true,
      });
    }
    start();
  }

  /**
   * @param {Record<string, unknown>} message without `id`
   * @param {boolean} watch Restart the worker when no answer arrives in time.
   * @returns {Promise<any>}
   */
  function request(message, watch) {
    const id = nextId++;
    return new Promise((resolve) => {
      /** @type {ReturnType<typeof setTimeout> | null} */
      let timer = null;
      if (watch) {
        timer = setTimeout(() => {
          pending.delete(id);
          restart();
          resolve({
            type: "result",
            id,
            ok: false,
            error: `Rendering took longer than ${Math.round(timeoutMs / 1000)} s and was stopped.`,
            line: null,
            ms: timeoutMs,
            timeout: true,
          });
        }, timeoutMs);
      }
      pending.set(id, { resolve, timer });
      const msg = { ...message, id };
      if (mode === "worker" && worker) worker.postMessage(msg);
      else
        loadPageEngine().then(
          (engine) => engine.handle(msg).then(receive),
          () =>
            receive({
              type: "result",
              id,
              ok: false,
              error: "The rendering engine could not be loaded.",
              line: null,
              ms: 0,
            }),
        );
    });
  }

  function restart() {
    for (const [id, entry] of pending) {
      pending.delete(id);
      if (entry.timer) clearTimeout(entry.timer);
      entry.resolve({
        type: "result",
        id,
        ok: false,
        error: "Engine restarted",
        line: null,
        ms: 0,
        superseded: true,
      });
    }
    if (mode === "worker") {
      worker?.terminate();
      worker = null;
      start();
    }
  }

  start();

  return {
    get mode() {
      return mode;
    },
    get ready() {
      return ready;
    },
    /**
     * @param {string} source
     * @param {Record<string, unknown>} options
     * @param {Record<string, unknown>} svg
     */
    render: (source, options, svg) => request({ type: "render", source, options, svg }, true),
    /** @param {"excalidraw" | "clipboard"} what */
    exportJson: (what) => request({ type: "export", what }, false),
    restart,
  };
}
