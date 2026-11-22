// Worker entry: the whole library plus the message protocol. ELK blocks the
// thread it runs on, so every render happens here and never in the page.
//
// The same file works as a classic script in the page: when the browser
// refuses to start workers (Chrome on file://) the page loads it with a
// <script> tag and talks to `globalThis.excaliplantEngine` instead.

import { createEngine } from "./playground/protocol.mjs";

/* global __SITE_VERSION__ */
const engine = createEngine({
  version: typeof __SITE_VERSION__ === "string" ? __SITE_VERSION__ : "dev",
});

const inWorker =
  typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope;

if (inWorker) {
  /** @param {unknown} data */
  const post = (data) => /** @type {any} */ (globalThis).postMessage(data);
  globalThis.onmessage = (event) => {
    engine
      .handle(event.data)
      .then((reply) => reply && post(reply))
      .catch((err) =>
        post({
          type: "result",
          id: event.data?.id,
          ok: false,
          error: String(err?.message ?? err),
          line: null,
          ms: 0,
        }),
      );
  };
  engine.warmup().then(post, () => post({ type: "ready", version: engine.version }));
} else {
  /** @type {any} */ (globalThis).excaliplantEngine = engine;
}
